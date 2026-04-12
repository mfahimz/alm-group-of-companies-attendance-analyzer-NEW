// redeploy trigger
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { startOfMonth, endOfMonth, parseISO, differenceInDays, isWithinInterval, getDaysInMonth } from 'npm:date-fns@3.6.0';
//redeploy
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
        let checklistCreated = 0;
        try {
            checklistCreated = await createAnnualLeaveChecklistTasks(
                base44, projectId, project, relevantLeaves, projectStart, projectEnd
            );
        } catch (checklistError) {
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
 * Calculate salary_leave_days with split-month logic
 */
function calculateSalaryLeaveDays(leave: any, effectiveStart: Date, effectiveEnd: Date, projectEndDate: string) {
    const totalDays = differenceInDays(effectiveEnd, effectiveStart) + 1;
    const leaveStartMonth = effectiveStart.getMonth();
    const leaveEndMonth = effectiveEnd.getMonth();
    if (leaveStartMonth === leaveEndMonth) return totalDays;

    const projectEnd = parseISO(projectEndDate);
    const projectEndMonthEnd = endOfMonth(projectEnd);
    if (projectEnd.getDate() === projectEndMonthEnd.getDate()) {
        const previousMonth = new Date(projectEnd);
        previousMonth.setMonth(previousMonth.getMonth() - 1);
        const prevMonthEnd = endOfMonth(previousMonth);
        const prevMonthAssumedStart = new Date(prevMonthEnd);
        prevMonthAssumedStart.setDate(prevMonthEnd.getDate() - 1); // Last 2 days
        const overlapDays = [];
        for (let d = new Date(effectiveStart); d <= effectiveEnd; d.setDate(d.getDate() + 1)) {
            if (isWithinInterval(d, { start: prevMonthAssumedStart, end: prevMonthEnd })) overlapDays.push(new Date(d));
        }
        return totalDays - overlapDays.length;
    }
    return totalDays;
}

/**
 * createAnnualLeaveChecklistTasks
 */
async function createAnnualLeaveChecklistTasks(
    base44: any,
    projectId: string,
    project: any,
    relevantLeaves: any[],
    projectStart: Date,
    projectEnd: Date
): Promise<number> {
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

    let created = 0;
    const allAutoTasks = await base44.asServiceRole.entities.ChecklistItem.filter({ 
        project_id: projectId, 
        is_auto_created: true 
    });
    const existingFingerprints = new Set(allAutoTasks.map((t: any) => t.fingerprint).filter((f: any) => !!f));
    const existingLeaveIdsOnTasks = new Set(allAutoTasks.map((t: any) => t.linked_annual_leave_id).filter((id: any) => !!id));

    const projectExceptions = await base44.asServiceRole.entities.Exception.filter({
        project_id: projectId,
        type: 'ANNUAL_LEAVE'
    });

    const exceptionUpdates: Array<{ id: string; leaveDays: number }> = [];

    for (const leave of relevantLeaves) {
        const leaveStart = parseISO(leave.date_from);
        const leaveEnd = parseISO(leave.date_to);
        const effectiveStart = leaveStart > projectStart ? leaveStart : projectStart;
        const lastDayOfRelevantMonth = new Date(currentYear, currentMonthIdx + 1, 0);
        const effectiveEnd = leaveEnd < lastDayOfRelevantMonth ? leaveEnd : lastDayOfRelevantMonth;

        const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';
        const leaveExtendsBeyond = leaveEnd > projectEnd;

        let leaveDays = 0;
        const leaveDatesInRange: string[] = [];
        const dayCursor = new Date(effectiveStart);
        while (dayCursor <= effectiveEnd) {
            if (dayCursor.getFullYear() === currentYear && dayCursor.getMonth() === currentMonthIdx) {
                leaveDays++;
                leaveDatesInRange.push(dayCursor.toISOString().split('T')[0]);
            }
            dayCursor.setDate(dayCursor.getDate() + 1);
        }

        if (leaveDays === 0) continue; 

        const matchingException = projectExceptions.find((ex: any) =>
            String(ex.attendance_id) === String(leave.attendance_id)
        );

        if (matchingException && matchingException.salary_leave_days !== leaveDays) {
            exceptionUpdates.push({ id: matchingException.id, leaveDays });
        }

        const dateRangeStr = leaveDatesInRange.length > 0 
            ? (leaveDatesInRange.length === 1 ? leaveDatesInRange[0] : `${leaveDatesInRange[0]} to ${leaveDatesInRange[leaveDatesInRange.length - 1]}`)
            : "N/A";

        const nameKey = (leave.employee_name || '').replace(/\s+/g, '');
        const leaveFingerprint = `AnnualLeave_${projectId}_${leave.id}_${leaveDays}_${nameKey}`;
        
        if (!existingFingerprints.has(leaveFingerprint) && !existingLeaveIdsOnTasks.has(String(leave.id))) {
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
            created++;
        }

    }

    for (const update of exceptionUpdates) {
        let attempt = 0;
        while (attempt < 3) {
            try {
                await base44.asServiceRole.entities.Exception.update(
                    update.id,
                    { salary_leave_days: update.leaveDays }
                );
                await new Promise(r => setTimeout(r, 150));
                break;
            } catch (updateErr: any) {
                const is429 = updateErr?.status === 429 ||
                    updateErr?.message?.includes('429') ||
                    updateErr?.message?.toLowerCase().includes('rate limit');
                if (is429 && attempt < 2) {
                    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                    attempt++;
                } else {
                    console.warn(
                        `[createAnnualLeaveChecklistTasks] Failed to update salary_leave_days for exception ${update.id}:`,
                        updateErr.message
                    );
                    break;
                }
            }
        }
    }

    return created;
}

function buildTaskNotes(leave: any, days: number, isALM: boolean, isExt: boolean, curIdx: number, curYr: number): string {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let notes = `Employee: ${leave.employee_name}\nAttendance ID: ${leave.attendance_id}\nFull leave: ${leave.date_from} to ${leave.date_to}\nDays for this project: ${days}\nIncluded month: ${monthNames[curIdx]} ${curYr}`;
    if (isALM && isExt) notes += `\n\n[Al Maraghi Motors] Leave extends beyond project. (Shown: project fragment count).`;
    notes += `\n\n[Auto-created] Generated from annual leave record.`;
    return notes;
}