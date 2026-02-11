import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { startOfMonth, endOfMonth, parseISO, differenceInDays, isWithinInterval } from 'npm:date-fns@3.6.0';

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

        return Response.json({
            success: true,
            imported,
            skipped,
            message: `Imported ${imported} annual leave(s) to project (${skipped} already existed)`
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