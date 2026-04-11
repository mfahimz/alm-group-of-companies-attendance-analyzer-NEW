import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseISO, getDaysInMonth } from 'npm:date-fns@3.6.0';

/**
 * syncAnnualLeaveChecklistTasks
 *
 * Handles change detection and synchronization of auto-created checklist tasks
 * ("Annual Leave" and "Rejoining Date") when an annual leave record is updated
 * or deleted.
 *
 * ============================================================================
 * EXHAUSTIVE BUSINESS LOGIC AUDIT & USE CASES (2026-03-13)
 * ============================================================================
 *
 * 1. SYNC PATTERN (FINGERPRINT-AWARE):
 *    - On UPDATE: Calculate the new expected footprints for the leave tasks.
 *    - If a task with the EXACT fingerprint already exists, it is KEPT.
 *    - Any auto-created tasks for this LeaveId that do NOT match the new 
 *      fingerprints are considered STALE and are deleted.
 *    - If new fingerprints are missing, they are created.
 *    This ensures that redundant delete/create cycles are avoided if data 
 *    hasn't changed, while still ensuring consistency.
 *
 * 2. FINGERPRINT COMPOSITION:
 *    To handle metadata changes (like Name), the fingerprint includes:
 *    `{Type}_{ProjectId}_{LeaveId}_{Value}_{NormalizedName}`
 *
 * 3. BUSINESS RULES (CONSISTENCY):
 *    This function uses the SAME logic as `createAnnualLeaveChecklistTasks` 
 *    for:
 *    - "Previous Month" exclusion (fewer days rule).
 *    - Al Maraghi Motors special case (full inclusion if extending beyond).
 *    - Rejoining date forward-rolling (holidays/weekly-off).
 *
 * 4. DEBOUNCE:
 *    A 1500ms debounce prevents rapid-fire updates (UI edits) from causing 
 *    race conditions or double-creations.
 *
 * ============================================================================
 */

const pendingDebounces: Map<string, number> = new Map();
const DEBOUNCE_DELAY_MS = 1500;
const BATCH_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { leaveId, projectId, action } = await req.json();

        if (!leaveId || !projectId) {
            return Response.json({ error: 'Missing leaveId or projectId' }, { status: 400 });
        }

        const debounceKey = `${leaveId}_${projectId}`;
        if (pendingDebounces.has(debounceKey)) {
            clearTimeout(pendingDebounces.get(debounceKey)!);
            pendingDebounces.delete(debounceKey);
        }

        const result = await new Promise<any>((resolve, reject) => {
            const timeoutId = setTimeout(async () => {
                pendingDebounces.delete(debounceKey);
                try {
                    const syncResult = await executeSyncOperation(base44, leaveId, projectId, action);
                    resolve(syncResult);
                } catch (err) {
                    reject(err);
                }
            }, DEBOUNCE_DELAY_MS);

            pendingDebounces.set(debounceKey, timeoutId as unknown as number);
        });

        return Response.json(result);

    } catch (error: any) {
        console.error('Error syncing annual leave:', error);
        return Response.json({ success: false, error: error.message }, { status: 200 });
    }
});

async function executeSyncOperation(
    base44: any,
    leaveId: string,
    projectId: string,
    action: string
): Promise<any> {
    const existingTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
        project_id: projectId,
        linked_annual_leave_id: String(leaveId),
        is_auto_created: true
    });

    if (action === 'delete') {
        let deleted = 0;
        for (const task of existingTasks) {
            await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
            deleted++;
            await sleep(BATCH_DELAY_MS);
        }
        return { success: true, deleted, message: `Deleted ${deleted} stale tasks for removed leave.` };
    }

    const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
    const [leave] = await base44.asServiceRole.entities.AnnualLeave.filter({ id: leaveId });

    if (!project || !leave || leave.status !== 'approved') {
        let deleted = 0;
        for (const task of existingTasks) {
            await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
            deleted++;
            await sleep(BATCH_DELAY_MS);
        }
        return { success: true, deleted, message: 'Source leave invalid or project missing. Cleaned up tasks.' };
    }

    const projectStart = parseISO(project.date_from);
    const projectEnd = parseISO(project.date_to);
    const leaveStart = parseISO(leave.date_from);
    const leaveEnd = parseISO(leave.date_to);

    if (leaveStart > projectEnd || leaveEnd < projectStart) {
        let deleted = 0;
        for (const task of existingTasks) {
            await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
            deleted++;
            await sleep(BATCH_DELAY_MS);
        }
        return { success: true, deleted, message: 'Leave no longer overlaps with project. Cleaned up tasks.' };
    }

    const daysInMonth1 = getDaysInMonth(projectStart);
    const daysInMonth2 = getDaysInMonth(projectEnd);
    const prevMonthIndex = daysInMonth1 <= daysInMonth2 ? projectStart.getMonth() : projectEnd.getMonth();
    const prevMonthYear = daysInMonth1 <= daysInMonth2 ? projectStart.getFullYear() : projectEnd.getFullYear();

    const effectiveStart = leaveStart > projectStart ? leaveStart : projectStart;
    const effectiveEnd = leaveEnd < projectEnd ? leaveEnd : projectEnd;
    const isAlMaraghi = project.company === 'Al Maraghi Motors';
    const isExtending = leaveEnd > projectEnd;

    const leaveDays = (isAlMaraghi && isExtending) 
        ? leave.total_days 
        : countCurrentMonthDays(effectiveStart, effectiveEnd, prevMonthIndex, prevMonthYear);

    const projectExceptions = await base44.asServiceRole.entities.Exception.filter({ project_id: projectId });
    const phDates = new Set(projectExceptions.filter((ex: any) => ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF').flatMap((ex: any) => {
        const ds = [];
        const s = parseISO(ex.date_from);
        const e = ex.date_to ? parseISO(ex.date_to) : s;
        const cur = new Date(s);
        while (cur <= e) { ds.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }
        return ds;
    }));
    const [emp] = await base44.asServiceRole.entities.Employee.filter({ attendance_id: leave.attendance_id });
    const rejoiningDate = calculateRejoiningDate(leaveEnd, emp, phDates);
    const rejoiningStr = rejoiningDate.toISOString().split('T')[0];

    // FINGERPRINT: Type + Project + LeaveId + Days + NormalizedName
    const nameKey = (leave.employee_name || '').replace(/\s+/g, '');
    const expectedLeaveFingerprint = `AnnualLeave_${projectId}_${leaveId}_${leaveDays}_${nameKey}`;
    const expectedRejoiningFingerprint = `RejoiningDate_${projectId}_${leaveId}_${rejoiningStr}_${nameKey}`;

    const keptTasks = existingTasks.filter(t => t.fingerprint === expectedLeaveFingerprint || t.fingerprint === expectedRejoiningFingerprint);
    const staleTasks = existingTasks.filter(t => t.fingerprint !== expectedLeaveFingerprint && t.fingerprint !== expectedRejoiningFingerprint);

    let deletedCount = 0;
    for (const task of staleTasks) {
        await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
        deletedCount++;
        await sleep(BATCH_DELAY_MS);
    }

    let createdCount = 0;
    if (!keptTasks.some(t => t.fingerprint === expectedLeaveFingerprint)) {
        await base44.asServiceRole.entities.ChecklistItem.create({
            project_id: projectId,
            task_type: 'Annual Leave',
            task_description: `${leave.employee_name} | Leave: ${leave.date_from} to ${leave.date_to} | Days: ${leaveDays}`,
            status: 'pending',
            is_auto_created: true,
            linked_annual_leave_id: String(leaveId),
            fingerprint: expectedLeaveFingerprint,
            notes: `Employee: ${leave.employee_name}\nDays: ${leaveDays}\n[Auto-synced]`
        });
        createdCount++;
        await sleep(BATCH_DELAY_MS);
    }

    if (!keptTasks.some(t => t.fingerprint === expectedRejoiningFingerprint)) {
        await base44.asServiceRole.entities.ChecklistItem.create({
            project_id: projectId,
            task_type: 'Rejoining Date',
            task_description: `${leave.employee_name} | Rejoining: ${rejoiningStr}`,
            status: 'pending',
            is_auto_created: true,
            linked_annual_leave_id: String(leaveId),
            fingerprint: expectedRejoiningFingerprint,
            notes: `Employee: ${leave.employee_name}\nRejoining: ${rejoiningStr}\n[Auto-synced]`
        });
        createdCount++;
    }

    return { 
        success: true, 
        deleted: deletedCount, 
        created: createdCount, 
        message: `Sync complete. Deleted ${deletedCount}, Created ${createdCount}. Fingerprint check preserved ${keptTasks.length} tasks.` 
    };
}

function countCurrentMonthDays(start: Date, end: Date, prevMonthIdx: number, prevMonthYr: number): number {
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        if (!(cur.getMonth() === prevMonthIdx && cur.getFullYear() === prevMonthYr)) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function calculateRejoiningDate(endDate: Date, emp: any, phDates: Set<string>): Date {
    const dayMap: Record<string, number> = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const off = dayMap[emp?.weekly_off || 'Sunday'] ?? 0;
    
    // Start by moving one day forward from the end date
    const cand = new Date(endDate);
    cand.setDate(cand.getDate() + 1);

    let i = 0;
    while (i < 30) {
        const dateStr = [
            cand.getFullYear(),
            String(cand.getMonth() + 1).padStart(2, '0'),
            String(cand.getDate()).padStart(2, '0')
        ].join('-');

        if (cand.getDay() !== off && !phDates.has(dateStr)) break;
        
        cand.setDate(cand.getDate() + 1);
        i++;
    }
    return cand;
}
