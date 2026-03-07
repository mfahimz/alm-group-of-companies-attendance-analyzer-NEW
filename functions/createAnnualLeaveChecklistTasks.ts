import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseISO, differenceInDays, getDaysInMonth } from 'npm:date-fns@3.6.0';

/**
 * createAnnualLeaveChecklistTasks
 *
 * Automatically creates "Annual Leave" and "Rejoining Date" checklist tasks
 * for a project based on approved annual leave records that overlap with the
 * project period.
 *
 * This function is called after annual leaves are imported into a project
 * (via importAnnualLeavesToProject). It is purely additive — it does not
 * modify any existing checklist tasks or other entities.
 *
 * ============================================================================
 * USE CASE: Leave added for the first time
 * ============================================================================
 * When an employee's annual leave is imported to a project for the first time,
 * this function creates TWO new ChecklistItems:
 * 1. "Annual Leave" — with employee name, leave dates, and calculated days
 * 2. "Rejoining Date" — with employee name and the first working day after
 *    leave ends (forward-rolled past weekly/public holidays)
 * Both are marked with is_auto_created: true.
 *
 * ============================================================================
 * USE CASE: Leave spanning two months (days in both previous and current month)
 * ============================================================================
 * A project period covers two calendar months. The "previous month" is the
 * month with fewer calendar days, and the "current month" is the one with more.
 * Only leave days falling in the current month are counted for this project.
 *
 * ============================================================================
 * PREVIOUS MONTH CALCULATION LOGIC
 * ============================================================================
 * Compare calendar days in each month using getDaysInMonth. The shorter month
 * is the previous month (tail of prior payroll cycle). The longer month is
 * the primary payroll period for this project.
 *
 * ============================================================================
 * USE CASE: Leave extending beyond project end date (Al Maraghi Motors)
 * ============================================================================
 * For Al Maraghi Motors, if leave extends beyond the project end date, the
 * total_days from the AnnualLeave record is used directly (not recalculated).
 *
 * ============================================================================
 * USE CASE: Employee having multiple separate leave periods in the same project
 * ============================================================================
 * Each leave creates its own pair of tasks (Annual Leave + Rejoining Date).
 * linked_annual_leave_id ties each pair to the specific AnnualLeave record.
 *
 * ============================================================================
 * USE CASE: No leave existing for an employee
 * ============================================================================
 * Returns with imported: 0. No tasks created.
 *
 * ============================================================================
 * REJOINING DATE FORWARD-ROLLING LOGIC
 * ============================================================================
 * The rejoining date starts as leave end date + 1 day. It is then checked
 * against the employee's weekly holiday and all public holidays in the project.
 * If it falls on either, it rolls forward one day at a time until a clear
 * working day is found. Both weekly and public holidays are checked because:
 * - Weekly holidays vary per employee (Sunday vs Friday etc.)
 * - Public holidays are company/national days off
 * - They can occur consecutively, requiring multi-day forward rolls
 * This applies to ALL companies, not just Al Maraghi Motors.
 *
 * USE CASE: Rejoining date landing on a weekly holiday
 * Leave ends Thursday, employee weekly off is Friday → rejoining = Saturday
 *
 * USE CASE: Rejoining date landing on a public holiday
 * Leave ends Wednesday, Thursday is public holiday → rejoining = Friday
 *
 * USE CASE: Rejoining date landing on both consecutively
 * Leave ends Wed, Thu = public holiday, Fri = weekly off → rejoining = Saturday
 * ============================================================================
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const { projectId } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'Missing projectId' }, { status: 400 });
        }

        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const projectStart = parseISO(project.date_from);
        const projectEnd = parseISO(project.date_to);

        const allLeaves = await base44.asServiceRole.entities.AnnualLeave.filter({
            company: project.company,
            status: 'approved'
        });

        const relevantLeaves = allLeaves.filter(leave => {
            const leaveStart = parseISO(leave.date_from);
            const leaveEnd = parseISO(leave.date_to);
            return (leaveStart <= projectEnd && leaveEnd >= projectStart);
        });

        // USE CASE: No leave existing — nothing to do
        if (relevantLeaves.length === 0) {
            return Response.json({
                success: true,
                imported: 0,
                message: 'No annual leaves overlap with this project period'
            });
        }

        // Fetch existing auto-created tasks for both types to avoid duplicates
        const existingAnnualLeaveTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
            project_id: projectId,
            task_type: 'Annual Leave'
        });
        const existingRejoiningTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
            project_id: projectId,
            task_type: 'Rejoining Date'
        });

        const existingLeaveIds = new Set(
            existingAnnualLeaveTasks
                .filter(t => t.is_auto_created === true)
                .map(t => t.linked_annual_leave_id || '')
        );
        const existingRejoiningLeaveIds = new Set(
            existingRejoiningTasks
                .filter(t => t.is_auto_created === true)
                .map(t => t.linked_annual_leave_id || '')
        );

        // Fetch public holidays for rejoining date calculation
        const projectExceptions = await base44.asServiceRole.entities.Exception.filter({
            project_id: projectId
        });
        const publicHolidayDates = new Set(
            projectExceptions
                .filter(ex => ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF')
                .flatMap(ex => {
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

        // Build employee map for weekly_off lookup
        const uniqueAttendanceIds = [...new Set(relevantLeaves.map(l => l.attendance_id))];
        const employeeMap: Record<string, any> = {};
        for (const attId of uniqueAttendanceIds) {
            const employees = await base44.asServiceRole.entities.Employee.filter({
                attendance_id: attId
            });
            if (employees.length > 0) {
                employeeMap[attId] = employees[0];
            }
        }

        // Previous month calculation
        const daysInMonth1 = getDaysInMonth(projectStart);
        const daysInMonth2 = getDaysInMonth(projectEnd);
        const previousMonthIndex = daysInMonth1 <= daysInMonth2
            ? projectStart.getMonth()
            : projectEnd.getMonth();
        const previousMonthYear = daysInMonth1 <= daysInMonth2
            ? projectStart.getFullYear()
            : projectEnd.getFullYear();

        let created = 0;
        let skipped = 0;

        for (const leave of relevantLeaves) {
            const leaveStart = parseISO(leave.date_from);
            const leaveEnd = parseISO(leave.date_to);

            // Skip Annual Leave task if it already exists
            const annualLeaveExists = existingLeaveIds.has(String(leave.id));
            const rejoiningExists = existingRejoiningLeaveIds.has(String(leave.id));

            if (annualLeaveExists && rejoiningExists) {
                skipped++;
                continue;
            }

            const effectiveStart = leaveStart > projectStart ? leaveStart : projectStart;
            const effectiveEnd = leaveEnd < projectEnd ? leaveEnd : projectEnd;

            const leaveExtendsBeyondProject = leaveEnd > projectEnd;
            const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';
            let leaveDaysForTask;

            if (isAlMaraghiMotors && leaveExtendsBeyondProject) {
                leaveDaysForTask = leave.total_days;
            } else {
                leaveDaysForTask = calculateCurrentMonthLeaveDays(
                    effectiveStart, effectiveEnd, previousMonthIndex, previousMonthYear
                );
            }

            // Create Annual Leave task (if not already existing)
            if (!annualLeaveExists) {
                const taskDescription = [
                    `${leave.employee_name}`,
                    `Leave: ${leave.date_from} to ${leave.date_to}`,
                    `Days for this project: ${leaveDaysForTask}`
                ].join(' | ');

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

            // Create Rejoining Date task (if not already existing)
            if (!rejoiningExists) {
                const employee = employeeMap[leave.attendance_id];
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
                    '[Auto-created] This task was automatically generated alongside the Annual Leave task.',
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
            }
        }

        return Response.json({
            success: true,
            imported: created,
            skipped,
            message: `Created ${created} checklist task(s) (${skipped} already existed)`
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
 * project period. Days in the "previous" month (fewer calendar days) are
 * excluded because they belong to the prior project's payroll period.
 */
function calculateCurrentMonthLeaveDays(
    effectiveStart: Date,
    effectiveEnd: Date,
    previousMonthIndex: number,
    previousMonthYear: number
): number {
    let currentMonthDays = 0;
    const cursor = new Date(effectiveStart);
    while (cursor <= effectiveEnd) {
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
 * calculateRejoiningDate
 *
 * Calculates the first valid working day after an employee's leave ends.
 *
 * FORWARD-ROLLING LOGIC:
 * 1. Start with leaveEndDate + 1 day
 * 2. Check if it falls on the employee's weekly holiday (employee.weekly_off)
 * 3. Check if it falls on a public holiday (PUBLIC_HOLIDAY/OFF exception)
 * 4. If either is true, advance by one day and re-check
 * 5. Repeat until a valid working day is found
 *
 * Both weekly and public holidays are checked because:
 * - Weekly holidays vary per employee (some have Sunday off, others Friday)
 * - Public holidays are company-wide and can fall on any day
 * - They can occur consecutively, requiring multi-day forward rolls
 *
 * This applies to ALL companies — not just Al Maraghi Motors.
 *
 * USE CASE: Rejoining date landing on a weekly holiday
 * Leave ends Thursday, weekly off Friday → rejoining = Saturday
 *
 * USE CASE: Rejoining date landing on a public holiday
 * Leave ends Wednesday, Thursday is public holiday → rejoining = Friday
 *
 * USE CASE: Rejoining date landing on both consecutively
 * Leave ends Wed, Thu = public holiday, Fri = weekly off → rejoining = Saturday
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

/**
 * buildTaskNotes
 *
 * Constructs detailed notes for the Annual Leave checklist task.
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

    if (isAlMaraghiMotors && leaveExtendsBeyondProject) {
        lines.push('');
        lines.push('[Al Maraghi Motors] Leave extends beyond project end date.');
        lines.push('Total days shown includes all leave days beyond the project boundary.');
        lines.push('This count is sourced directly from the annual leave record (not recalculated).');
    }

    lines.push('');
    lines.push('[Auto-created] This task was automatically generated from annual leave records.');

    return lines.join('\n');
}
