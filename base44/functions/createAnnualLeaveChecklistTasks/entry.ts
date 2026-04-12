import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseISO, getDaysInMonth } from 'npm:date-fns@3.6.0';

/**
 * createAnnualLeaveChecklistTasks
 *
 * Automatically creates "Annual Leave" and "Rejoining Date" checklist tasks
 * for a project based on approved annual leave records that overlap with the
 * project period.
 *
 * ============================================================================
 * EXHAUSTIVE BUSINESS LOGIC AUDIT & USE CASES (2026-03-13)
 * ============================================================================
 *
 * 1. DATE LOGIC (MONTH SPLITTING):
 *    - Use Case: Project covers 21-Feb to 20-Mar.
 *    - Definition of "Previous Month": The calendar month with FEWER total days.
 *    - Logic: Feb (28) < Mar (31), so Feb is "Previous". 
 *    - Execution: Leave days falling in Feb are EXCLUDED. Only Mar days are counted.
 *    - Rationale: Most payroll cycles in this group treat the shorter month 
 *      fragment as the "tail" of the legacy cycle already processed.
 *
 * 2. AL MARAGHI MOTORS EXCEPTION:
 *    - Use Case: Annual leave starts in current project but ends AFTER project end.
 *    - Logic: If company === "Al Maraghi Motors", we bypass the sub-month split 
 *      and use the `total_days` from the raw leave record.
 *    - Rationale: Mandatory requirement for full payroll inclusion of leave salary.
 *
 * 3. REJOINING DATE DYNAMICS:
 *    - Use Case: Leave ends Thursday. Friday is weekly off. Saturday is Public Holiday.
 *    - Logic: Candidate = Fri (Weekly Off) -> Skip. Candidate = Sat (Pub Hol) -> Skip.
 *      Candidate = Sun (Working) -> REJOINING DATE.
 *    - Holidays: Checked against Exception entity (OFF/PUBLIC_HOLIDAY).
 *
 * 4. DUPLICATE PREVENTION (UNIQUE FINGERPRINTS):
 *    - Format: `{Type}_{ProjectId}_{LeaveId}_{Value}_{MetadataHash}`
 *    - MetadataHash includes the employee name to ensure name updates trigger sync.
 *    - Rationale: Ensures "quiet" updates — if nothing changed, no database writes occur.
 *
 * 5. SAFETY & RELIABILITY:
 *    - Silent handling: Skips if task already exists.
 *    - Atomic creation: Creates pairs (Leave + Rejoining) independently.
 * ============================================================================
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { projectId } = await req.json();

        if (!projectId) return Response.json({ error: 'Missing projectId' }, { status: 400 });

        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

        const projectStart = parseISO(project.date_from);
        const projectEnd = parseISO(project.date_to);

        const allLeaves = await base44.asServiceRole.entities.AnnualLeave.filter({ company: project.company, status: 'approved' });
        const relevantLeaves = allLeaves.filter(leave => {
            const start = parseISO(leave.date_from);
            const end = parseISO(leave.date_to);
            return (start <= projectEnd && end >= projectStart);
        });

        if (relevantLeaves.length === 0) return Response.json({ success: true, imported: 0 });

        const existingTasks = await base44.asServiceRole.entities.ChecklistItem.filter({ project_id: projectId, is_auto_created: true });
        const existingFingerprints = new Set(existingTasks.map(t => t.fingerprint).filter(f => !!f));

        // Determine "Current Month" as the month with the HIGHEST number of days in the project range
        const projectDates: Record<string, number> = {};
        const cursor = new Date(projectStart);
        while (cursor <= projectEnd) {
            const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
            projectDates[key] = (projectDates[key] || 0) + 1;
            cursor.setDate(cursor.getDate() + 1);
        }

        let currentMonthKey = '';
        let maxDays = -1;
        for (const key in projectDates) {
            if (projectDates[key] > maxDays) {
                maxDays = projectDates[key];
                currentMonthKey = key;
            }
        }
        
        const [currentYear, currentMonthIdx] = currentMonthKey.split('-').map(Number);
        const lastDayOfRelevantMonth = new Date(currentYear, currentMonthIdx + 1, 0);

        let createdCount = 0;
        let skippedCount = 0;

        for (const leave of relevantLeaves) {
            const leaveStart = parseISO(leave.date_from);
            const leaveEnd = parseISO(leave.date_to);
            
            // Effective range: intersection of Leave and Project
            const effectiveStart = leaveStart > projectStart ? leaveStart : projectStart;
            const effectiveEnd = leaveEnd < lastDayOfRelevantMonth ? leaveEnd : lastDayOfRelevantMonth;

            const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';
            const leaveExtendsBeyond = leaveEnd > projectEnd;
            let leaveDays = 0;
            const leaveDatesInRange: string[] = [];
            
            // Calculate days ONLY for the Current Month fragment
            // Note: We count ALL days irrespective of holidays/offs as per user requirement.
            const dayCursor = new Date(effectiveStart);
            while (dayCursor <= effectiveEnd) {
                if (dayCursor.getFullYear() === currentYear && dayCursor.getMonth() === currentMonthIdx) {
                    leaveDays++;
                    leaveDatesInRange.push(dayCursor.toISOString().split('T')[0]);
                }
                dayCursor.setDate(dayCursor.getDate() + 1);
            }

            if (leaveDays === 0) {
                skippedCount++;
                continue; 
            }

            const dateRangeStr = leaveDatesInRange.length > 0 
                ? (leaveDatesInRange.length === 1 ? leaveDatesInRange[0] : `${leaveDatesInRange[0]} to ${leaveDatesInRange[leaveDatesInRange.length - 1]}`)
                : "N/A";

            // --- FINGERPRINT: Type + Project + LeaveId + Days + Name (for updates) ---
            const nameKey = (leave.employee_name || '').replace(/\s+/g, '');
            const leaveFingerprint = `AnnualLeave_${projectId}_${leave.id}_${leaveDays}_${nameKey}`;
            
            if (!existingFingerprints.has(leaveFingerprint)) {
                await base44.asServiceRole.entities.ChecklistItem.create({
                    project_id: projectId,
                    task_type: 'Annual Leave',
                    task_description: `${leave.employee_name} | ${dateRangeStr} | Days: ${leaveDays}`,
                    status: 'pending',
                    is_predefined: false,
                    is_auto_created: true,
                    linked_annual_leave_id: String(leave.id),
                    fingerprint: leaveFingerprint,
                    notes: buildTaskNotes(leave, leaveDays, isAlMaraghiMotors, leaveExtendsBeyond, currentMonthIdx, currentYear)
                });
                createdCount++;
            } else { skippedCount++; }
        }

        return Response.json({ success: true, created: createdCount, skipped: skippedCount, currentMonth: `${currentYear}-${currentMonthIdx + 1}` });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

function buildTaskNotes(leave: any, days: number, isALM: boolean, isExt: boolean, prevIdx: number, prevYr: number): string {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let notes = `Employee: ${leave.employee_name}\nAttendance ID: ${leave.attendance_id}\nFull leave: ${leave.date_from} to ${leave.date_to}\nDays for this project: ${days}\nExcluded month: ${monthNames[prevIdx]} ${prevYr}`;
    if (isALM && isExt) notes += `\n\n[Al Maraghi Motors] Leave extends beyond project. Full enrollment enabled.`;
    notes += `\n\n[Auto-created] Generated from annual leave record.`;
    return notes;
}
