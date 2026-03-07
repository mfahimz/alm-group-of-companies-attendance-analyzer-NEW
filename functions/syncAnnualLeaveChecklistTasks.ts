import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseISO, getDaysInMonth, addDays } from 'npm:date-fns@3.6.0';

/**
 * syncAnnualLeaveChecklistTasks
 *
 * Handles change detection and synchronization of auto-created checklist tasks
 * ("Annual Leave" and "Rejoining Date") when an annual leave record is updated
 * or deleted. This function is the single entry point for all leave change
 * handling — it deletes stale tasks and recreates fresh ones as needed.
 *
 * ============================================================================
 * DESIGN: SILENT DELETE-AND-RECREATE PATTERN
 * ============================================================================
 * When a leave record is updated (dates changed, info modified), the old tasks
 * are deleted and new ones are created with the updated values. This is simpler
 * and more reliable than diffing and patching individual fields. The user sees
 * no loading state or interruption because operations happen in the background.
 *
 * ============================================================================
 * USE CASE: Leave dates updated with new start or end date
 * ============================================================================
 * When an annual leave record's date_from or date_to changes, the existing
 * auto-created "Annual Leave" and "Rejoining Date" tasks for that leave are
 * deleted and recreated with the new dates. The day count is recalculated
 * based on the new dates, and the rejoining date is recalculated with the
 * forward-rolling holiday logic. This ensures tasks always reflect the
 * current state of the leave record.
 *
 * ============================================================================
 * USE CASE: Leave deleted entirely
 * ============================================================================
 * When an annual leave record is deleted, both the "Annual Leave" and
 * "Rejoining Date" tasks linked to that leave ID are deleted. No new tasks
 * are created. The function detects this via the action: 'delete' parameter.
 *
 * ============================================================================
 * USE CASE: Task not found during delete attempt
 * ============================================================================
 * If a task does not exist when attempting to delete it (e.g., it was already
 * manually deleted by a user, or never created due to a prior error), the
 * delete is silently skipped. No error is thrown. This makes the function
 * idempotent and safe to call multiple times for the same leave record.
 *
 * ============================================================================
 * USE CASE: Rapid successive updates to the same leave record
 * ============================================================================
 * When multiple updates arrive in quick succession (e.g., user changes dates
 * then immediately changes them again), a debounce mechanism ensures only the
 * final state triggers task sync. The function uses a server-side debounce map
 * keyed by leaveId. If a sync request arrives while another is pending for the
 * same leave, the pending one is cancelled and replaced with the new request.
 * The debounce delay is 1500ms — long enough to batch rapid changes, short
 * enough to feel responsive.
 *
 * ============================================================================
 * BATCHING WITH DELAY
 * ============================================================================
 * All delete and create operations are batched with a small delay (200ms)
 * between each operation to avoid hitting API rate limits. This is especially
 * important when multiple employees' leaves are updated simultaneously.
 *
 * ============================================================================
 * USE CASE: Rejoining date landing on a weekly holiday
 * ============================================================================
 * See calculateRejoiningDate — if the day after leave ends falls on the
 * employee's weekly off day, it rolls forward to the next day.
 *
 * ============================================================================
 * USE CASE: Rejoining date landing on a public holiday
 * ============================================================================
 * See calculateRejoiningDate — if the day after leave ends falls on a public
 * holiday (PUBLIC_HOLIDAY or OFF exception), it rolls forward.
 *
 * ============================================================================
 * USE CASE: Rejoining date landing on both consecutively
 * ============================================================================
 * If the day after leave ends is a public holiday followed by a weekly off
 * (or vice versa), the date keeps rolling forward until a clear working day
 * is found. E.g., leave ends Wed, Thu is public holiday, Fri is weekly off
 * → rejoining date is Saturday.
 *
 * ============================================================================
 */

// =========================================================================
// DEBOUNCE MAP
// =========================================================================
// Server-side debounce mechanism to handle rapid successive updates.
// Key: leaveId (string), Value: timeout handle (number).
// When a new sync request arrives for a leaveId that already has a pending
// timeout, the old timeout is cleared and a new one is set. This ensures
// only the final update in a burst of rapid changes actually runs.
// The debounce delay is 1500ms.
// =========================================================================
const pendingDebounces: Map<string, number> = new Map();
const DEBOUNCE_DELAY_MS = 1500;

// =========================================================================
// BATCH DELAY
// =========================================================================
// Small delay between consecutive API operations to avoid rate limits.
// 200ms is conservative enough to avoid throttling while keeping total
// operation time reasonable.
// =========================================================================
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

        // =====================================================================
        // DEBOUNCE: Rapid successive updates to the same leave record
        // =====================================================================
        // If a sync request is already pending for this leaveId, cancel it.
        // Only the final request in a burst of rapid updates will execute.
        // This prevents duplicate or conflicting operations from running
        // simultaneously when a user rapidly edits the same leave record.
        // =====================================================================
        const debounceKey = `${leaveId}_${projectId}`;
        if (pendingDebounces.has(debounceKey)) {
            clearTimeout(pendingDebounces.get(debounceKey)!);
            pendingDebounces.delete(debounceKey);
        }

        // Wrap the actual sync in a debounced execution
        const result = await new Promise<any>((resolve, reject) => {
            const timeoutId = setTimeout(async () => {
                pendingDebounces.delete(debounceKey);
                try {
                    const syncResult = await executeSyncOperation(
                        base44, leaveId, projectId, action
                    );
                    resolve(syncResult);
                } catch (err) {
                    reject(err);
                }
            }, DEBOUNCE_DELAY_MS);

            pendingDebounces.set(debounceKey, timeoutId as unknown as number);
        });

        return Response.json(result);

    } catch (error) {
        // =====================================================================
        // ERROR HANDLING
        // =====================================================================
        // Errors are logged internally but surfaced minimally to the caller.
        // If task creation fails after deletion, the error is logged here but
        // does not propagate as a user-visible error. The response still returns
        // 200 with an error flag so the frontend can silently handle it.
        // =====================================================================
        console.error('Error syncing annual leave checklist tasks:', error);
        return Response.json({
            success: false,
            error: error.message,
            message: 'Sync completed with errors (logged internally)'
        }, { status: 200 });
    }
});

/**
 * executeSyncOperation
 *
 * Core sync logic: deletes existing auto-created tasks for a leave record,
 * then recreates them if the leave still exists and action is not 'delete'.
 */
async function executeSyncOperation(
    base44: any,
    leaveId: string,
    projectId: string,
    action: string
): Promise<any> {
    let deleted = 0;
    let created = 0;

    // =========================================================================
    // STEP 1: DELETE EXISTING AUTO-CREATED TASKS FOR THIS LEAVE
    // =========================================================================
    // Find all auto-created tasks (both "Annual Leave" and "Rejoining Date")
    // linked to this specific leave record. Delete them with batched delays.
    // =========================================================================
    const existingTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
        project_id: projectId
    });

    const tasksToDelete = existingTasks.filter((t: any) =>
        t.is_auto_created === true &&
        t.linked_annual_leave_id === String(leaveId) &&
        (t.task_type === 'Annual Leave' || t.task_type === 'Rejoining Date')
    );

    for (const task of tasksToDelete) {
        try {
            // =====================================================================
            // USE CASE: Task not found during delete attempt
            // =====================================================================
            // If the task was already deleted (by another concurrent sync, or
            // manually by a user), the delete call may fail. We catch and silently
            // skip such errors. This makes the operation idempotent.
            // =====================================================================
            await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
            deleted++;
        } catch (deleteError: any) {
            // Silently skip — task may have already been deleted
            console.warn(`Task ${task.id} not found or already deleted, skipping:`, deleteError.message);
        }

        // Batch delay between delete operations to avoid rate limits
        if (tasksToDelete.indexOf(task) < tasksToDelete.length - 1) {
            await sleep(BATCH_DELAY_MS);
        }
    }

    // =========================================================================
    // STEP 2: IF DELETE-ONLY, STOP HERE
    // =========================================================================
    // USE CASE: Leave deleted entirely
    // When the annual leave record is deleted, action is 'delete'. Both tasks
    // have been removed above. No new tasks should be created.
    // =========================================================================
    if (action === 'delete') {
        return {
            success: true,
            deleted,
            created: 0,
            message: `Deleted ${deleted} checklist task(s) for removed leave`
        };
    }

    // Small delay between delete and create phases
    if (deleted > 0) {
        await sleep(BATCH_DELAY_MS);
    }

    // =========================================================================
    // STEP 3: RECREATE TASKS WITH UPDATED VALUES
    // =========================================================================
    // Fetch the current state of the leave record and project, then create
    // fresh "Annual Leave" and "Rejoining Date" tasks.
    // =========================================================================
    try {
        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (!project) {
            return { success: true, deleted, created: 0, message: 'Project not found, skipping recreate' };
        }

        // Fetch the specific leave record
        const leaves = await base44.asServiceRole.entities.AnnualLeave.filter({ id: leaveId });
        if (leaves.length === 0) {
            return { success: true, deleted, created: 0, message: 'Leave record not found, skipping recreate' };
        }
        const leave = leaves[0];

        // Only recreate for approved leaves
        if (leave.status !== 'approved') {
            return { success: true, deleted, created: 0, message: 'Leave not approved, skipping recreate' };
        }

        const projectStart = parseISO(project.date_from);
        const projectEnd = parseISO(project.date_to);
        const leaveStart = parseISO(leave.date_from);
        const leaveEnd = parseISO(leave.date_to);

        // Check if leave still overlaps with project period
        if (leaveStart > projectEnd || leaveEnd < projectStart) {
            return { success: true, deleted, created: 0, message: 'Leave no longer overlaps with project' };
        }

        // Previous month calculation (same logic as import function)
        const daysInMonth1 = getDaysInMonth(projectStart);
        const daysInMonth2 = getDaysInMonth(projectEnd);
        const previousMonthIndex = daysInMonth1 <= daysInMonth2
            ? projectStart.getMonth()
            : projectEnd.getMonth();
        const previousMonthYear = daysInMonth1 <= daysInMonth2
            ? projectStart.getFullYear()
            : projectEnd.getFullYear();

        const effectiveStart = leaveStart > projectStart ? leaveStart : projectStart;
        const effectiveEnd = leaveEnd < projectEnd ? leaveEnd : projectEnd;

        const leaveExtendsBeyondProject = leaveEnd > projectEnd;
        const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';
        let leaveDaysForTask: number;

        if (isAlMaraghiMotors && leaveExtendsBeyondProject) {
            leaveDaysForTask = leave.total_days;
        } else {
            leaveDaysForTask = countCurrentMonthDays(
                effectiveStart, effectiveEnd, previousMonthIndex, previousMonthYear
            );
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Create Annual Leave task
        const taskDescription = [
            `${leave.employee_name}`,
            `Leave: ${leave.date_from} to ${leave.date_to}`,
            `Days for this project: ${leaveDaysForTask}`
        ].join(' | ');

        const notesLines = [
            `Employee: ${leave.employee_name}`,
            `Attendance ID: ${leave.attendance_id}`,
            `Full leave period: ${leave.date_from} to ${leave.date_to}`,
            `Total leave days (from record): ${leave.total_days}`,
            `Days counted for this project: ${leaveDaysForTask}`,
            `Previous month (excluded): ${monthNames[previousMonthIndex]} ${previousMonthYear}`,
            `Reason: ${leave.reason || 'Annual leave'}`
        ];

        if (isAlMaraghiMotors && leaveExtendsBeyondProject) {
            notesLines.push('');
            notesLines.push('[Al Maraghi Motors] Leave extends beyond project end date.');
            notesLines.push('Total days shown includes all leave days beyond the project boundary.');
        }
        notesLines.push('');
        notesLines.push('[Auto-created] Recreated after leave update.');

        await base44.asServiceRole.entities.ChecklistItem.create({
            project_id: projectId,
            task_type: 'Annual Leave',
            task_description: taskDescription,
            status: 'pending',
            is_predefined: false,
            is_auto_created: true,
            linked_annual_leave_id: String(leave.id),
            notes: notesLines.join('\n')
        });
        created++;

        // Batch delay between Annual Leave and Rejoining Date creation
        await sleep(BATCH_DELAY_MS);

        // Create Rejoining Date task
        const projectExceptions = await base44.asServiceRole.entities.Exception.filter({
            project_id: projectId
        });
        const publicHolidayDates = new Set(
            projectExceptions
                .filter((ex: any) => ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF')
                .flatMap((ex: any) => {
                    const dates: string[] = [];
                    const start = parseISO(ex.date_from);
                    const end = ex.date_to ? parseISO(ex.date_to) : start;
                    const cursor = new Date(start);
                    while (cursor <= end) {
                        dates.push(cursor.toISOString().split('T')[0]);
                        cursor.setDate(cursor.getDate() + 1);
                    }
                    return dates;
                })
        );

        const employees = await base44.asServiceRole.entities.Employee.filter({
            attendance_id: leave.attendance_id
        });
        const employee = employees.length > 0 ? employees[0] : null;

        const rejoiningDate = calculateRejoiningDate(leaveEnd, employee, publicHolidayDates);
        const rejoiningDateStr = rejoiningDate.toISOString().split('T')[0];

        const rejoiningDescription = [
            `${leave.employee_name}`,
            `Rejoining Date: ${rejoiningDateStr}`
        ].join(' | ');

        const rejoiningNotes = [
            `Employee: ${leave.employee_name}`,
            `Attendance ID: ${leave.attendance_id}`,
            `Leave end date: ${leave.date_to}`,
            `Calculated rejoining date: ${rejoiningDateStr}`,
            `Employee weekly off: ${employee?.weekly_off || 'Sunday'}`,
            '',
            '[Auto-created] Recreated after leave update.',
            'The rejoining date is the first working day after leave ends,',
            'skipping weekly holidays and public holidays.'
        ];

        await base44.asServiceRole.entities.ChecklistItem.create({
            project_id: projectId,
            task_type: 'Rejoining Date',
            task_description: rejoiningDescription,
            status: 'pending',
            is_predefined: false,
            is_auto_created: true,
            linked_annual_leave_id: String(leave.id),
            notes: rejoiningNotes.join('\n')
        });
        created++;

    } catch (createError: any) {
        // =====================================================================
        // CREATION FAILURE AFTER DELETION
        // =====================================================================
        // If task creation fails after deletion, log the error internally but
        // do NOT surface it to the user. The tasks were deleted successfully
        // but could not be recreated. This is a degraded state that will self-
        // heal on the next import or manual sync.
        // =====================================================================
        console.error('Failed to recreate checklist tasks after delete:', createError.message);
        return {
            success: true,
            deleted,
            created,
            message: `Deleted ${deleted} task(s), but recreate failed (logged internally)`
        };
    }

    return {
        success: true,
        deleted,
        created,
        message: `Synced: deleted ${deleted}, created ${created} checklist task(s)`
    };
}

/**
 * countCurrentMonthDays
 *
 * Counts leave days that fall in the "current" month of the project period,
 * excluding days in the "previous" month (the month with fewer calendar days).
 */
function countCurrentMonthDays(
    effectiveStart: Date,
    effectiveEnd: Date,
    previousMonthIndex: number,
    previousMonthYear: number
): number {
    let count = 0;
    const cursor = new Date(effectiveStart);
    while (cursor <= effectiveEnd) {
        const isInPreviousMonth =
            cursor.getMonth() === previousMonthIndex &&
            cursor.getFullYear() === previousMonthYear;
        if (!isInPreviousMonth) {
            count++;
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return count;
}

/**
 * calculateRejoiningDate
 *
 * Calculates the first valid working day after an employee's leave ends.
 * Starts with leaveEndDate + 1 day, then forward-rolls past weekly holidays
 * and public holidays until a clear working day is found.
 *
 * FORWARD-ROLLING LOGIC:
 * 1. Start with leave end date + 1 calendar day
 * 2. Check if date falls on employee's weekly holiday (employee.weekly_off)
 * 3. Check if date falls on a public holiday (PUBLIC_HOLIDAY/OFF exception)
 * 4. If either is true, advance by one day and re-check
 * 5. Repeat until a valid working day is found
 *
 * Both weekly and public holidays are checked because:
 * - Weekly holidays vary per employee (some have Sunday off, others Friday)
 * - Public holidays are project/company-wide but can fall on any day
 * - They can occur consecutively (e.g., Friday weekly off + Saturday national
 *   holiday), requiring multi-day forward rolls
 *
 * USE CASE: Rejoining date landing on a weekly holiday
 * Leave ends Thursday, employee weekly off is Friday → rejoining = Saturday
 *
 * USE CASE: Rejoining date landing on a public holiday
 * Leave ends Wednesday, Thursday is a public holiday → rejoining = Friday
 *
 * USE CASE: Rejoining date landing on both consecutively
 * Leave ends Wednesday, Thursday = public holiday, Friday = weekly off
 * → Thursday skipped, Friday skipped, rejoining = Saturday
 */
function calculateRejoiningDate(
    leaveEndDate: Date,
    employee: any,
    publicHolidayDates: Set<string>
): Date {
    const dayNameToNumber: Record<string, number> = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
        'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };

    const weeklyOffDay = dayNameToNumber[employee?.weekly_off || 'Sunday'] ?? 0;

    const candidate = new Date(leaveEndDate);
    candidate.setDate(candidate.getDate() + 1);

    let iterations = 0;
    const MAX_ITERATIONS = 30;

    while (iterations < MAX_ITERATIONS) {
        const dayOfWeek = candidate.getUTCDay();
        const dateStr = candidate.toISOString().split('T')[0];

        const isWeeklyHoliday = dayOfWeek === weeklyOffDay;
        const isPublicHoliday = publicHolidayDates.has(dateStr);

        if (!isWeeklyHoliday && !isPublicHoliday) {
            break;
        }

        candidate.setDate(candidate.getDate() + 1);
        iterations++;
    }

    return candidate;
}
