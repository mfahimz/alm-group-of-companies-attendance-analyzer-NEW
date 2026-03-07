import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { startOfMonth, endOfMonth, parseISO, differenceInDays, isWithinInterval, getDaysInMonth } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'Missing projectId' }, { status: 400 });
        }

        // Fetch project
        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Fetch all approved annual leaves for this company
        const allLeaves = await base44.asServiceRole.entities.AnnualLeave.filter({ 
            company: project.company,
            status: 'approved'
        });

        const projectStart = parseISO(project.date_from);
        const projectEnd = parseISO(project.date_to);

        // Filter leaves that overlap with project period
        const relevantLeaves = allLeaves.filter(leave => {
            const leaveStart = parseISO(leave.date_from);
            const leaveEnd = parseISO(leave.date_to);
            
            return (leaveStart <= projectEnd && leaveEnd >= projectStart);
        });

        if (relevantLeaves.length === 0) {
            return Response.json({
                success: true,
                imported: 0,
                message: 'No annual leaves overlap with this project period'
            });
        }

        // Fetch existing exceptions to avoid duplicates
        const existingExceptions = await base44.asServiceRole.entities.Exception.filter({
            project_id: projectId,
            type: 'ANNUAL_LEAVE'
        });

        const existingKeys = new Set(
            existingExceptions.map(e => `${e.attendance_id}|${e.date_from}|${e.date_to}`)
        );

        const exceptionsToCreate = [];
        let imported = 0;
        let skipped = 0;

        for (const leave of relevantLeaves) {
            const leaveStart = parseISO(leave.date_from);
            const leaveEnd = parseISO(leave.date_to);

            // Calculate overlap with project
            const effectiveStart = leaveStart > projectStart ? leaveStart : projectStart;
            const effectiveEnd = leaveEnd < projectEnd ? leaveEnd : projectEnd;

            const exceptionKey = `${leave.attendance_id}|${effectiveStart.toISOString().split('T')[0]}|${effectiveEnd.toISOString().split('T')[0]}`;

            if (existingKeys.has(exceptionKey)) {
                skipped++;
                continue;
            }

            // Calculate salary_leave_days with split-month logic
            const salaryLeaveDays = calculateSalaryLeaveDays(
                leave,
                effectiveStart,
                effectiveEnd,
                project.date_to
            );

            exceptionsToCreate.push({
                project_id: projectId,
                attendance_id: leave.attendance_id,
                date_from: effectiveStart.toISOString().split('T')[0],
                date_to: effectiveEnd.toISOString().split('T')[0],
                type: 'ANNUAL_LEAVE',
                salary_leave_days: salaryLeaveDays,
                details: `Imported from Annual Leave Calendar - ${leave.reason || 'Annual leave'}`,
                approval_status: 'approved',
                approved_by: user.email,
                approval_date: new Date().toISOString()
            });

            imported++;
        }

        // Bulk create exceptions
        if (exceptionsToCreate.length > 0) {
            await base44.asServiceRole.entities.Exception.bulkCreate(exceptionsToCreate);
        }

        // Update applied_to_projects in annual leaves
        for (const leave of relevantLeaves) {
            const appliedProjects = leave.applied_to_projects ? leave.applied_to_projects.split(',') : [];
            if (!appliedProjects.includes(projectId)) {
                appliedProjects.push(projectId);
                await base44.asServiceRole.entities.AnnualLeave.update(leave.id, {
                    applied_to_projects: appliedProjects.join(',')
                });
            }
        }

        // =====================================================================
        // AUTO-CREATE ANNUAL LEAVE CHECKLIST TASKS
        // =====================================================================
        // After importing annual leave exceptions, automatically create
        // "Annual Leave" checklist tasks for each imported leave entry.
        // This is purely additive — it does not modify any existing tasks.
        // =====================================================================
        let checklistCreated = 0;
        try {
            checklistCreated = await createAnnualLeaveChecklistTasks(
                base44, projectId, project, relevantLeaves, projectStart, projectEnd
            );
        } catch (checklistError) {
            // Log but don't fail the import if checklist creation fails
            console.error('Error creating annual leave checklist tasks:', checklistError);
        }

        return Response.json({
            success: true,
            imported,
            skipped,
            checklistTasksCreated: checklistCreated,
            message: `Imported ${imported} annual leave(s) to project (${skipped} already existed). Created ${checklistCreated} checklist task(s).`
        });

    } catch (error) {
        console.error('Error importing annual leaves:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

/**
 * Calculate salary_leave_days with split-month logic:
 * - If leave spans two months, check if the end days fall in "assumed present" period
 * - If project.date_to is end of month, last 2 days of previous month are assumed present
 * - Exclude those days from salary_leave_days to prevent double payment
 */
function calculateSalaryLeaveDays(leave, effectiveStart, effectiveEnd, projectEndDate) {
    const totalDays = differenceInDays(effectiveEnd, effectiveStart) + 1;
    
    const leaveStartMonth = effectiveStart.getMonth();
    const leaveEndMonth = effectiveEnd.getMonth();
    
    // If leave is within same month, no adjustment needed
    if (leaveStartMonth === leaveEndMonth) {
        return totalDays;
    }

    // Check if this is a split-month scenario
    const projectEnd = parseISO(projectEndDate);
    const projectEndMonthEnd = endOfMonth(projectEnd);
    
    // If project ends at month-end (salary calculation triggers assumed present for last 2 days of previous month)
    if (projectEnd.getDate() === projectEndMonthEnd.getDate()) {
        const previousMonth = new Date(projectEnd);
        previousMonth.setMonth(previousMonth.getMonth() - 1);
        const prevMonthEnd = endOfMonth(previousMonth);
        const prevMonthAssumedStart = new Date(prevMonthEnd);
        prevMonthAssumedStart.setDate(prevMonthEnd.getDate() - 1); // Last 2 days

        // Check if leave overlaps with assumed present period
        const overlapDays = [];
        for (let d = new Date(effectiveStart); d <= effectiveEnd; d.setDate(d.getDate() + 1)) {
            if (isWithinInterval(d, { start: prevMonthAssumedStart, end: prevMonthEnd })) {
                overlapDays.push(new Date(d));
            }
        }

        // Exclude overlapping days from salary_leave_days
        return totalDays - overlapDays.length;
    }

    return totalDays;
}

/**
 * createAnnualLeaveChecklistTasks
 *
 * Automatically creates "Annual Leave" checklist tasks for each relevant
 * leave entry after annual leaves are imported into a project.
 *
 * ============================================================================
 * USE CASE: Leave added for the first time
 * ============================================================================
 * When an employee's annual leave is imported to a project for the first time,
 * a new ChecklistItem of type "Annual Leave" is created with the employee's
 * name, leave dates, and the calculated leave days for this project.
 * The task is marked with is_auto_created: true to distinguish it from
 * manually created tasks.
 *
 * ============================================================================
 * USE CASE: Leave spanning two months (days in both previous and current month)
 * ============================================================================
 * The project period covers two calendar months. The "previous month" is the
 * month with fewer calendar days, and the "current month" has more days.
 * Only leave days falling in the current month are counted for this project.
 * Days in the previous month are excluded — they belong to the prior project.
 *
 * ============================================================================
 * PREVIOUS MONTH CALCULATION LOGIC
 * ============================================================================
 * To determine which month is "previous" vs "current", compare the number of
 * calendar days in each month using getDaysInMonth. The month with fewer
 * calendar days is the previous month. This is because the shorter month is
 * the tail end of the prior payroll cycle overlapping into this project's
 * range. The longer month is the primary payroll period for this project.
 *
 * ============================================================================
 * USE CASE: Leave extending beyond project end date (Al Maraghi Motors)
 * ============================================================================
 * For Al Maraghi Motors, if leave extends past the project end date, the total
 * leave day count is sourced directly from the AnnualLeave record's total_days
 * field (not recalculated). This is required for salary hold and end-of-service
 * calculations at Al Maraghi Motors, where the full leave duration must be
 * visible regardless of project boundaries.
 *
 * ============================================================================
 * USE CASE: Employee having multiple separate leave periods in same project
 * ============================================================================
 * Each separate leave period creates its own checklist task. The
 * linked_annual_leave_id field ties each task to its specific AnnualLeave
 * record. Deduplication uses the leave record ID to prevent duplicates.
 *
 * ============================================================================
 * USE CASE: No leave existing for an employee
 * ============================================================================
 * If no leaves overlap, no checklist tasks are created and 0 is returned.
 *
 * @returns Number of checklist tasks created
 */
async function createAnnualLeaveChecklistTasks(
    base44: any,
    projectId: string,
    project: any,
    relevantLeaves: any[],
    projectStart: Date,
    projectEnd: Date
): Promise<number> {
    // Fetch existing auto-created checklist tasks for BOTH types to avoid duplicates
    const existingAnnualLeaveTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
        project_id: projectId,
        task_type: 'Annual Leave'
    });
    const existingRejoiningTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
        project_id: projectId,
        task_type: 'Rejoining Date'
    });

    // Build deduplication sets from existing auto-created tasks
    const existingLeaveIds = new Set(
        existingAnnualLeaveTasks
            .filter((t: any) => t.is_auto_created === true)
            .map((t: any) => t.linked_annual_leave_id || '')
    );
    const existingRejoiningLeaveIds = new Set(
        existingRejoiningTasks
            .filter((t: any) => t.is_auto_created === true)
            .map((t: any) => t.linked_annual_leave_id || '')
    );

    // =========================================================================
    // FETCH PUBLIC HOLIDAYS AND EMPLOYEE DATA FOR REJOINING DATE CALCULATION
    // =========================================================================
    // Public holidays are stored as exceptions of type 'PUBLIC_HOLIDAY' or 'OFF'.
    // We fetch all such exceptions for this project to check rejoining dates.
    // Employee weekly_off field stores the day name (e.g., 'Sunday', 'Friday').
    // =========================================================================
    const projectExceptions = await base44.asServiceRole.entities.Exception.filter({
        project_id: projectId
    });
    const publicHolidayDates = new Set(
        projectExceptions
            .filter((ex: any) => ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF')
            .flatMap((ex: any) => {
                // Each exception covers a date range; collect all dates in range
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

    // Build a map of attendance_id → employee for weekly_off lookup
    const uniqueAttendanceIds = [...new Set(relevantLeaves.map((l: any) => l.attendance_id))];
    const employeeMap: Record<string, any> = {};
    for (const attId of uniqueAttendanceIds) {
        const employees = await base44.asServiceRole.entities.Employee.filter({
            attendance_id: attId
        });
        if (employees.length > 0) {
            employeeMap[attId] = employees[0];
        }
    }

    // =========================================================================
    // PREVIOUS MONTH CALCULATION
    // =========================================================================
    // The project spans two calendar months. We determine which is the
    // "previous" month by comparing calendar days in each month.
    // The month with fewer calendar days is the previous month because it
    // represents the tail of the prior payroll cycle. The longer month is
    // the primary/current payroll month for this project.
    // =========================================================================
    const daysInMonth1 = getDaysInMonth(projectStart);
    const daysInMonth2 = getDaysInMonth(projectEnd);
    const previousMonthIndex = daysInMonth1 <= daysInMonth2
        ? projectStart.getMonth()
        : projectEnd.getMonth();
    const previousMonthYear = daysInMonth1 <= daysInMonth2
        ? projectStart.getFullYear()
        : projectEnd.getFullYear();

    let created = 0;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (const leave of relevantLeaves) {
        const leaveStart = parseISO(leave.date_from);
        const leaveEnd = parseISO(leave.date_to);

        // Skip if a checklist task already exists for this leave record
        if (existingLeaveIds.has(String(leave.id))) {
            continue;
        }

        // Calculate effective overlap of leave with project boundaries
        const effectiveStart = leaveStart > projectStart ? leaveStart : projectStart;
        const effectiveEnd = leaveEnd < projectEnd ? leaveEnd : projectEnd;

        // =====================================================================
        // AL MARAGHI MOTORS SPECIAL RULE
        // =====================================================================
        // For Al Maraghi Motors, if the leave extends beyond the project end
        // date, the total leave day count shown in the task reflects ALL leave
        // days including those beyond the project end date. This count is
        // sourced directly from the AnnualLeave record's total_days field and
        // is NOT recalculated. Al Maraghi Motors payroll processing requires
        // the full leave duration for salary hold and end-of-service
        // calculations, so the full count is used regardless of project
        // boundaries to give payroll staff complete visibility.
        // =====================================================================
        const leaveExtendsBeyondProject = leaveEnd > projectEnd;
        const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';
        let leaveDaysForTask: number;

        if (isAlMaraghiMotors && leaveExtendsBeyondProject) {
            // Use total_days from AnnualLeave record directly — not recalculated
            leaveDaysForTask = leave.total_days;
        } else {
            // Count only days in the "current" month, excluding "previous" month days
            leaveDaysForTask = countCurrentMonthDays(
                effectiveStart, effectiveEnd, previousMonthIndex, previousMonthYear
            );
        }

        // Build task description with employee name, dates, and day count
        const taskDescription = [
            `${leave.employee_name}`,
            `Leave: ${leave.date_from} to ${leave.date_to}`,
            `Days for this project: ${leaveDaysForTask}`
        ].join(' | ');

        // Build detailed notes for payroll reviewers
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
            notesLines.push('This count is sourced directly from the annual leave record (not recalculated).');
        }

        notesLines.push('');
        notesLines.push('[Auto-created] This task was automatically generated from annual leave records.');

        // Create the Annual Leave checklist task
        // is_auto_created: true marks this as auto-generated (not manual)
        // linked_annual_leave_id: ties this to the specific AnnualLeave record
        // These markers allow reliable identification for future updates/deletions
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

        // =====================================================================
        // AUTO-CREATE "REJOINING DATE" TASK
        // =====================================================================
        // Immediately after creating an Annual Leave task, also create a
        // "Rejoining Date" task for the same employee. The rejoining date is
        // the day after the last day of leave, rolled forward past any weekly
        // holidays or public holidays.
        //
        // FORWARD-ROLLING LOGIC:
        // 1. Start with leave end date + 1 calendar day
        // 2. Check if this date falls on the employee's weekly holiday
        //    (stored in employee.weekly_off, e.g., "Sunday", "Friday")
        // 3. Check if this date falls on a public holiday (PUBLIC_HOLIDAY
        //    or OFF exception in the project)
        // 4. If either check is true, move forward by one day and repeat
        // 5. Keep rolling forward until a date is found that is neither
        //    a weekly holiday nor a public holiday
        //
        // WHY BOTH CHECKS:
        // Weekly holidays are employee-specific rest days that vary by
        // company and individual schedule. Public holidays are company-wide
        // or national days off. An employee cannot rejoin on either type of
        // non-working day, so both must be checked. It's common for a public
        // holiday to immediately follow a weekend or vice versa, so the
        // forward-roll must check each candidate date against both conditions.
        //
        // This applies to ALL companies — not just Al Maraghi Motors.
        // =====================================================================
        if (!existingRejoiningLeaveIds.has(String(leave.id))) {
            const employee = employeeMap[leave.attendance_id];
            const rejoiningDate = calculateRejoiningDate(
                leaveEnd, employee, publicHolidayDates
            );
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

    return created;
}

/**
 * calculateRejoiningDate
 *
 * Calculates the rejoining date for an employee after annual leave ends.
 * Starts with leaveEndDate + 1 day, then rolls forward past any weekly
 * holidays or public holidays until a valid working day is found.
 *
 * =========================================================================
 * FORWARD-ROLLING LOGIC
 * =========================================================================
 * The rejoining date cannot fall on a non-working day. Two types of
 * non-working days are checked:
 *
 * 1. Weekly holidays: The employee's regular day off (e.g., Sunday, Friday).
 *    Stored in the employee.weekly_off field as a day name string.
 *    Different employees may have different weekly off days.
 *
 * 2. Public holidays: Company-wide or national holidays stored as exceptions
 *    of type 'PUBLIC_HOLIDAY' or 'OFF' in the project. These are date-based
 *    and apply to all employees in the project.
 *
 * Both must be checked because:
 * - A weekly holiday could immediately precede a public holiday (e.g., if
 *   Friday is weekly off and Saturday is a national holiday, the rejoining
 *   date must roll to Sunday or later)
 * - Public holidays can span multiple consecutive days
 * - The combination can create extended non-working periods
 *
 * USE CASE: Rejoining date landing on a weekly holiday
 * If leave ends Thursday and employee's weekly off is Friday, the initial
 * candidate (Friday) is skipped and Saturday becomes the rejoining date
 * (assuming no public holiday on Saturday).
 *
 * USE CASE: Rejoining date landing on a public holiday
 * If leave ends Wednesday and Thursday is a public holiday, the initial
 * candidate (Thursday) is skipped and Friday becomes the rejoining date
 * (assuming Friday is not the employee's weekly off).
 *
 * USE CASE: Rejoining date landing on both consecutively
 * If leave ends Wednesday, Thursday is a public holiday, and Friday is the
 * employee's weekly off, then Thursday is skipped (public holiday), Friday
 * is skipped (weekly off), and Saturday becomes the rejoining date.
 *
 * A safety limit of 30 iterations prevents infinite loops in pathological
 * edge cases (e.g., corrupted holiday data).
 *
 * @param leaveEndDate - The last day of the employee's annual leave
 * @param employee - The employee record (for weekly_off field)
 * @param publicHolidayDates - Set of ISO date strings that are public holidays
 * @returns The first valid working day after leave ends
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

    // Start with the day after leave ends
    const candidate = new Date(leaveEndDate);
    candidate.setDate(candidate.getDate() + 1);

    // Safety limit to prevent infinite loops
    let iterations = 0;
    const MAX_ITERATIONS = 30;

    while (iterations < MAX_ITERATIONS) {
        const dayOfWeek = candidate.getUTCDay();
        const dateStr = candidate.toISOString().split('T')[0];

        const isWeeklyHoliday = dayOfWeek === weeklyOffDay;
        const isPublicHoliday = publicHolidayDates.has(dateStr);

        // If this date is neither a weekly holiday nor a public holiday, it's valid
        if (!isWeeklyHoliday && !isPublicHoliday) {
            break;
        }

        // Roll forward by one day and check again
        candidate.setDate(candidate.getDate() + 1);
        iterations++;
    }

    return candidate;
}

/**
 * countCurrentMonthDays
 *
 * Counts leave days that fall in the "current" month of the project period,
 * excluding days in the "previous" month.
 *
 * USE CASE: Leave spanning two months
 * If leave spans Feb 25 – Mar 5 and the previous month is February, only the
 * 5 March days are counted. The 4 February days are excluded as they belong
 * to the prior project's payroll period.
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