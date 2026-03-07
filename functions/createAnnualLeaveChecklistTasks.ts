import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseISO, differenceInDays, getDaysInMonth } from 'npm:date-fns@3.6.0';

/**
 * createAnnualLeaveChecklistTasks
 *
 * Automatically creates "Annual Leave" checklist tasks for a project based on
 * approved annual leave records that overlap with the project period.
 *
 * This function is called after annual leaves are imported into a project
 * (via importAnnualLeavesToProject). It is purely additive — it does not
 * modify any existing checklist tasks or other entities.
 *
 * ============================================================================
 * USE CASE: Leave added for the first time
 * ============================================================================
 * When an employee's annual leave is imported to a project for the first time,
 * this function creates a new ChecklistItem of type "Annual Leave" with the
 * employee's name, leave dates, and the calculated number of leave days that
 * apply to this project's current month. The task is marked with
 * is_auto_created: true so it can be distinguished from manually created tasks.
 *
 * ============================================================================
 * USE CASE: Leave spanning two months (days in both previous and current month)
 * ============================================================================
 * A project period covers two calendar months. The "previous month" is the
 * month with fewer calendar days, and the "current month" is the one with more
 * calendar days. Only leave days falling in the current month are counted for
 * this project's checklist task. Days falling in the previous month are excluded
 * because they belong to the prior project's payroll period.
 *
 * Example: Project spans Feb 1 – Mar 31. February has 28 days (shorter), so it
 * is the "previous month". March has 31 days, so it is the "current month".
 * If an employee has leave from Feb 25 – Mar 5, only the 5 days in March
 * (Mar 1–5) count for this project. The 4 days in February belong to the
 * prior project.
 *
 * ============================================================================
 * PREVIOUS MONTH CALCULATION LOGIC
 * ============================================================================
 * The project date range always spans exactly two calendar months. To determine
 * which is the "previous" month vs the "current" month, we compare the number
 * of calendar days in each month (using getDaysInMonth). The month with fewer
 * calendar days is treated as the previous month. This is because the shorter
 * month is assumed to be the tail end of the prior payroll cycle that overlaps
 * into this project's date range. The longer month represents the primary
 * payroll period for this project. This convention ensures consistent handling
 * across all projects regardless of which specific months they span.
 *
 * ============================================================================
 * USE CASE: Leave extending beyond project end date (Al Maraghi Motors)
 * ============================================================================
 * For employees belonging to Al Maraghi Motors specifically, if the leave
 * extends beyond the project end date, the total leave day count shown in the
 * checklist task must reflect ALL leave days — including those beyond the
 * project end date. This count is sourced directly from the AnnualLeave
 * record's total_days field and is NOT recalculated or clamped to the project
 * boundary. This rule exists because Al Maraghi Motors payroll processing
 * requires visibility into the full leave duration for salary hold and
 * end-of-service calculations, even when the leave crosses project boundaries.
 * The full count allows payroll staff to make informed decisions about salary
 * adjustments without needing to look up the original leave record.
 *
 * ============================================================================
 * USE CASE: Employee having multiple separate leave periods in the same project
 * ============================================================================
 * If an employee has multiple approved annual leave records that overlap with
 * the same project period, each leave creates its own separate checklist task.
 * Each task shows the specific leave dates and day count for that particular
 * leave period. The linked_annual_leave_id field on each task ties it back to
 * the specific AnnualLeave record, so tasks can be individually updated or
 * removed if a specific leave is modified or cancelled. The deduplication key
 * (attendance_id + leave date_from + leave date_to) ensures the same leave
 * period is never duplicated as a checklist task.
 *
 * ============================================================================
 * USE CASE: No leave existing for an employee
 * ============================================================================
 * If no approved annual leaves overlap with the project period for any
 * employee, this function simply returns with imported: 0. No checklist tasks
 * are created and no existing data is modified. This is a no-op scenario.
 *
 * ============================================================================
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { projectId } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'Missing projectId' }, { status: 400 });
        }

        // Fetch the project to get date range and company
        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const projectStart = parseISO(project.date_from);
        const projectEnd = parseISO(project.date_to);

        // Fetch all approved annual leaves for this company
        const allLeaves = await base44.asServiceRole.entities.AnnualLeave.filter({
            company: project.company,
            status: 'approved'
        });

        // Filter leaves that overlap with the project period
        const relevantLeaves = allLeaves.filter(leave => {
            const leaveStart = parseISO(leave.date_from);
            const leaveEnd = parseISO(leave.date_to);
            return (leaveStart <= projectEnd && leaveEnd >= projectStart);
        });

        // USE CASE: No leave existing — nothing to do, return early
        if (relevantLeaves.length === 0) {
            return Response.json({
                success: true,
                imported: 0,
                message: 'No annual leaves overlap with this project period'
            });
        }

        // Fetch existing auto-created annual leave checklist tasks to avoid duplicates
        const existingTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
            project_id: projectId,
            task_type: 'Annual Leave'
        });

        // Build a set of deduplication keys from existing auto-created tasks
        // Key format: attendance_id|leave_date_from|leave_date_to
        const existingKeys = new Set(
            existingTasks
                .filter(t => t.is_auto_created === true)
                .map(t => t.linked_annual_leave_id || '')
        );

        // =========================================================================
        // PREVIOUS MONTH CALCULATION
        // =========================================================================
        // The project spans two calendar months. We determine which is the
        // "previous" month by comparing the number of calendar days in each.
        // The month with fewer calendar days is the previous month.
        // This is because the shorter month represents the tail of the prior
        // payroll cycle. The longer month is the primary/current payroll month.
        // =========================================================================
        const month1 = projectStart; // First month in the project range
        const month2 = projectEnd;   // Second month in the project range
        const daysInMonth1 = getDaysInMonth(month1);
        const daysInMonth2 = getDaysInMonth(month2);

        // The month with fewer calendar days is the "previous" month
        // The month with more (or equal) calendar days is the "current" month
        const previousMonthIndex = daysInMonth1 <= daysInMonth2
            ? month1.getMonth()
            : month2.getMonth();
        const previousMonthYear = daysInMonth1 <= daysInMonth2
            ? month1.getFullYear()
            : month2.getFullYear();

        let created = 0;
        let skipped = 0;

        for (const leave of relevantLeaves) {
            const leaveStart = parseISO(leave.date_from);
            const leaveEnd = parseISO(leave.date_to);

            // Deduplication: skip if a task already exists for this leave record
            if (existingKeys.has(String(leave.id))) {
                skipped++;
                continue;
            }

            // Calculate the effective overlap of leave with project boundaries
            const effectiveStart = leaveStart > projectStart ? leaveStart : projectStart;
            const effectiveEnd = leaveEnd < projectEnd ? leaveEnd : projectEnd;

            // =====================================================================
            // AL MARAGHI MOTORS SPECIAL RULE
            // =====================================================================
            // For Al Maraghi Motors, if the leave extends beyond the project end
            // date, the total leave day count shown in the task must reflect ALL
            // leave days including those beyond the project end date. This count
            // is sourced directly from the AnnualLeave record's total_days field
            // and is NOT recalculated. This is required because Al Maraghi Motors
            // payroll processing needs the full leave duration for salary hold
            // calculations and end-of-service processing. Using the full count
            // regardless of project boundaries ensures payroll staff see the
            // complete picture without needing to cross-reference the leave
            // management records manually.
            // =====================================================================
            const leaveExtendsBeyondProject = leaveEnd > projectEnd;
            const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';
            let leaveDaysForTask;

            if (isAlMaraghiMotors && leaveExtendsBeyondProject) {
                // USE CASE: Al Maraghi Motors leave extending beyond project end
                // Use the total_days from the AnnualLeave record directly,
                // not recalculated. This includes days beyond the project end date.
                leaveDaysForTask = leave.total_days;
            } else {
                // Standard calculation: count only days in the "current" month
                // of the project period, excluding days in the "previous" month
                leaveDaysForTask = calculateCurrentMonthLeaveDays(
                    effectiveStart,
                    effectiveEnd,
                    previousMonthIndex,
                    previousMonthYear
                );
            }

            // Build the task description with employee name, dates, and day count
            const taskDescription = [
                `${leave.employee_name}`,
                `Leave: ${leave.date_from} to ${leave.date_to}`,
                `Days for this project: ${leaveDaysForTask}`
            ].join(' | ');

            // Create the checklist task
            // is_auto_created: true distinguishes this from manually created tasks
            // linked_annual_leave_id: ties this task to the specific AnnualLeave record
            // These markers allow reliable identification for future updates/deletions
            await base44.asServiceRole.entities.ChecklistItem.create({
                project_id: projectId,
                task_type: 'Annual Leave',
                task_description: taskDescription,
                status: 'pending',
                is_predefined: false,
                is_auto_created: true,
                linked_annual_leave_id: String(leave.id),
                notes: buildTaskNotes(leave, leaveDaysForTask, isAlMaraghiMotors, leaveExtendsBeyondProject, previousMonthIndex, previousMonthYear)
            });

            created++;
        }

        return Response.json({
            success: true,
            imported: created,
            skipped,
            message: `Created ${created} annual leave checklist task(s) (${skipped} already existed)`
        });

    } catch (error) {
        console.error('Error creating annual leave checklist tasks:', error);
        return Response.json({
            error: error.message,
            details: error.stack
        }, { status: 500 });
    }
});

/**
 * calculateCurrentMonthLeaveDays
 *
 * Counts only the leave days that fall within the "current" month of the
 * project period. Days falling in the "previous" month (the month with fewer
 * calendar days) are excluded because they belong to the prior project's
 * payroll period.
 *
 * USE CASE: Leave spanning two months
 * If a leave spans from the previous month into the current month, only
 * the days in the current month are counted. For example, if the previous
 * month is February and the current month is March, and the leave is
 * Feb 25 – Mar 5, this function returns 5 (only the March days).
 *
 * @param effectiveStart - The start of the leave (clamped to project start)
 * @param effectiveEnd - The end of the leave (clamped to project end)
 * @param previousMonthIndex - The month index (0-11) of the previous month
 * @param previousMonthYear - The year of the previous month
 * @returns Number of leave days in the current month only
 */
function calculateCurrentMonthLeaveDays(
    effectiveStart: Date,
    effectiveEnd: Date,
    previousMonthIndex: number,
    previousMonthYear: number
): number {
    let currentMonthDays = 0;

    // Iterate through each day of the leave period
    const cursor = new Date(effectiveStart);
    while (cursor <= effectiveEnd) {
        // Only count this day if it does NOT fall in the previous month
        const isInPreviousMonth =
            cursor.getMonth() === previousMonthIndex &&
            cursor.getFullYear() === previousMonthYear;

        if (!isInPreviousMonth) {
            currentMonthDays++;
        }

        cursor.setDate(cursor.getDate() + 1);
    }

    return currentMonthDays;
}

/**
 * buildTaskNotes
 *
 * Constructs detailed notes for the checklist task, providing context about
 * the leave calculation for payroll reviewers.
 */
function buildTaskNotes(
    leave: any,
    leaveDaysForTask: number,
    isAlMaraghiMotors: boolean,
    leaveExtendsBeyondProject: boolean,
    previousMonthIndex: number,
    previousMonthYear: number
): string {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const lines = [
        `Employee: ${leave.employee_name}`,
        `Attendance ID: ${leave.attendance_id}`,
        `Full leave period: ${leave.date_from} to ${leave.date_to}`,
        `Total leave days (from record): ${leave.total_days}`,
        `Days counted for this project: ${leaveDaysForTask}`,
        `Previous month (excluded): ${monthNames[previousMonthIndex]} ${previousMonthYear}`,
        `Reason: ${leave.reason || 'Annual leave'}`
    ];

    // Al Maraghi Motors special note
    if (isAlMaraghiMotors && leaveExtendsBeyondProject) {
        lines.push('');
        lines.push('[Al Maraghi Motors] Leave extends beyond project end date.');
        lines.push('Total days shown includes all leave days beyond the project boundary.');
        lines.push('This count is sourced directly from the annual leave record (not recalculated).');
    }

    // Auto-creation marker note
    lines.push('');
    lines.push('[Auto-created] This task was automatically generated from annual leave records.');

    return lines.join('\n');
}
