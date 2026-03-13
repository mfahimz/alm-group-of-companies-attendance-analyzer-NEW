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

        const projectExceptions = await base44.asServiceRole.entities.Exception.filter({ project_id: projectId });
        const phDates = new Set(projectExceptions.filter(ex => ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF').flatMap(ex => {
            const dates: string[] = [];
            const start = parseISO(ex.date_from);
            const end = ex.date_to ? parseISO(ex.date_to) : start;
            const cursor = new Date(start);
            while (cursor <= end) { dates.push(cursor.toISOString().split('T')[0]); cursor.setDate(cursor.getDate() + 1); }
            return dates;
        }));

        const uniqueAttendanceIds = [...new Set(relevantLeaves.map(l => l.attendance_id))];
        const employeeMap: Record<string, any> = {};
        for (const attId of uniqueAttendanceIds) {
            const employees = await base44.asServiceRole.entities.Employee.filter({ attendance_id: attId });
            if (employees.length > 0) employeeMap[attId] = employees[0];
        }

        const daysInMonth1 = getDaysInMonth(projectStart);
        const daysInMonth2 = getDaysInMonth(projectEnd);
        const previousMonthIndex = daysInMonth1 <= daysInMonth2 ? projectStart.getMonth() : projectEnd.getMonth();
        const previousMonthYear = daysInMonth1 <= daysInMonth2 ? projectStart.getFullYear() : projectEnd.getFullYear();

        let createdCount = 0;
        let skippedCount = 0;

        for (const leave of relevantLeaves) {
            const leaveEnd = parseISO(leave.date_to);
            const effectiveStart = parseISO(leave.date_from) > projectStart ? parseISO(leave.date_from) : projectStart;
            const effectiveEnd = leaveEnd < projectEnd ? leaveEnd : projectEnd;

            const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';
            const leaveDays = (isAlMaraghiMotors && leaveEnd > projectEnd) 
                ? leave.total_days 
                : calculateCurrentMonthLeaveDays(effectiveStart, effectiveEnd, previousMonthIndex, previousMonthYear);

            // --- FINGERPRINT: Type + Project + LeaveId + Days + Name (for updates) ---
            const nameKey = (leave.employee_name || '').replace(/\s+/g, '');
            const leaveFingerprint = `AnnualLeave_${projectId}_${leave.id}_${leaveDays}_${nameKey}`;
            
            if (!existingFingerprints.has(leaveFingerprint)) {
                await base44.asServiceRole.entities.ChecklistItem.create({
                    project_id: projectId,
                    task_type: 'Annual Leave',
                    task_description: `${leave.employee_name} | Leave: ${leave.date_from} to ${leave.date_to} | Days: ${leaveDays}`,
                    status: 'pending',
                    is_predefined: false,
                    is_auto_created: true,
                    linked_annual_leave_id: String(leave.id),
                    fingerprint: leaveFingerprint,
                    notes: buildTaskNotes(leave, leaveDays, isAlMaraghiMotors, leaveEnd > projectEnd, previousMonthIndex, previousMonthYear)
                });
                createdCount++;
            } else { skippedCount++; }

            const employee = employeeMap[leave.attendance_id];
            const rejoiningDate = calculateRejoiningDate(leaveEnd, employee, phDates);
            const rejoiningDateStr = rejoiningDate.toISOString().split('T')[0];
            const rejoiningFingerprint = `RejoiningDate_${projectId}_${leave.id}_${rejoiningDateStr}_${nameKey}`;

            if (!existingFingerprints.has(rejoiningFingerprint)) {
                await base44.asServiceRole.entities.ChecklistItem.create({
                    project_id: projectId,
                    task_type: 'Rejoining Date',
                    task_description: `${leave.employee_name} | Rejoining: ${rejoiningDateStr}`,
                    status: 'pending',
                    is_predefined: false,
                    is_auto_created: true,
                    linked_annual_leave_id: String(leave.id),
                    fingerprint: rejoiningFingerprint,
                    notes: `Employee: ${leave.employee_name}\nRejoining: ${rejoiningDateStr}\n[Auto-created]`
                });
                createdCount++;
            } else { skippedCount++; }
        }

        return Response.json({ success: true, created: createdCount, skipped: skippedCount });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

function calculateCurrentMonthLeaveDays(start: Date, end: Date, prevMonthIdx: number, prevMonthYr: number): number {
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        if (!(cur.getMonth() === prevMonthIdx && cur.getFullYear() === prevMonthYr)) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function calculateRejoiningDate(endDate: Date, emp: any, publicHolidayDates: Set<string>): Date {
    const dayMap: Record<string, number> = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const weeklyOff = dayMap[emp?.weekly_off || 'Sunday'] ?? 0;
    const cand = new Date(endDate);
    cand.setDate(cand.getDate() + 1);
    let i = 0;
    while (i < 30) {
        if (cand.getUTCDay() !== weeklyOff && !publicHolidayDates.has(cand.toISOString().split('T')[0])) break;
        cand.setDate(cand.getDate() + 1);
        i++;
    }
    return cand;
}

function buildTaskNotes(leave: any, days: number, isALM: boolean, isExt: boolean, prevIdx: number, prevYr: number): string {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let notes = `Employee: ${leave.employee_name}\nAttendance ID: ${leave.attendance_id}\nFull leave: ${leave.date_from} to ${leave.date_to}\nDays for this project: ${days}\nExcluded month: ${monthNames[prevIdx]} ${prevYr}`;
    if (isALM && isExt) notes += `\n\n[Al Maraghi Motors] Leave extends beyond project. Full enrollment enabled.`;
    notes += `\n\n[Auto-created] Generated from annual leave record.`;
    return notes;
}
