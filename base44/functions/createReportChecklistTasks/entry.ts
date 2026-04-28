import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createReportChecklistTasks
 *
 * Automatically creates or deletes LOP and Other Minutes checklist tasks
 * triggered by ReportRun (Attendance Report) finalization/un-finalization.
 */

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
    const delays = [1000, 2000, 4000];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e: any) {
            const status = e?.status || e?.response?.status || 0;
            if (status === 429 && attempt < maxRetries) {
                console.warn(`[createChecklist] Rate limited, retry ${attempt + 1}/${maxRetries} after ${delays[attempt]}ms`);
                await sleep(delays[attempt]);
                continue;
            }
            throw e;
        }
    }
    throw new Error('Unreachable');
};

/**
 * Paginates through all records safely avoiding the 64KB response size limit.
 */
const fetchAllRecords = async (entity: any, query: any) => {
    const allRecords: any[] = [];
    let skip = 0;
    const limit = 500;
    while (true) {
        const page = await withRetry(() => entity.filter(query, null, limit, skip));
        if (!Array.isArray(page) || page.length === 0) break;
        allRecords.push(...page);
        if (page.length < limit) break;
        skip += limit;
    }
    return allRecords;
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { reportRunId, action = 'upsert' } = await req.json();

        if (!reportRunId) return Response.json({ error: 'Missing reportRunId' }, { status: 400 });

        const reports = await base44.asServiceRole.entities.ReportRun.filter({ id: reportRunId });
        if (reports.length === 0) return Response.json({ message: 'Report run not found' });
        const reportData = reports[0];
        const projectId = reportData.project_id;

        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (!project) return Response.json({ message: 'Project not found' });

        // --- ACTION: DELETE ---
        if (action === 'delete') {
            const existingTasks = await base44.asServiceRole.entities.ChecklistItem.filter({ 
                project_id: projectId, 
                is_auto_created: true 
            });
            const relevant = existingTasks.filter((t: any) => t.task_type === 'LOP Days' || t.task_type === 'Other Minutes' || t.task_type === 'Double Deduction Days' || t.task_type === 'Sick Leave' || t.task_type === 'Rejoining Date');
            
            let deletedCount = 0;
            for (let i = 0; i < relevant.length; i += BATCH_SIZE) {
                const batch = relevant.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map((task: any) => withRetry(() => base44.asServiceRole.entities.ChecklistItem.delete(task.id))));
                deletedCount += batch.length;
                if (i + BATCH_SIZE < relevant.length) await sleep(BATCH_DELAY_MS);
            }
            return Response.json({ success: true, action: 'delete', deleted: deletedCount });
        }

        // --- ACTION: UPSERT ---
        const analysisResults = await fetchAllRecords(base44.asServiceRole.entities.AnalysisResult, { report_run_id: reportRunId });
        if (analysisResults.length === 0) return Response.json({ success: true, message: 'No analysis results found' });

        const employeeRecords = await fetchAllRecords(base44.asServiceRole.entities.Employee, { company: project.company });
        const attendanceNameMap: Record<string, string> = {};
        for (const record of employeeRecords) {
            if (record.attendance_id != null) {
                attendanceNameMap[String(record.attendance_id)] = record.name || '';
            }
        }

        const annualLeaveExceptions = await fetchAllRecords(base44.asServiceRole.entities.Exception, {
            project_id: projectId,
            type: 'ANNUAL_LEAVE'
        });

        const annualLeaveLastDateMap: Record<string, string> = {};
        for (const ex of annualLeaveExceptions) {
            const attId = String(ex.attendance_id);
            const exEnd = ex.date_to || ex.date_from;
            if (!annualLeaveLastDateMap[attId] || exEnd > annualLeaveLastDateMap[attId]) {
                annualLeaveLastDateMap[attId] = exEnd;
            }
        }

        const projectExceptionsForPH = await fetchAllRecords(base44.asServiceRole.entities.Exception, { project_id: projectId });
        const publicHolidayDates = new Set<string>();
        for (const ex of projectExceptionsForPH) {
            if (ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF') {
                const phFrom = new Date(ex.date_from);
                const phTo = ex.date_to ? new Date(ex.date_to) : phFrom;
                const cur = new Date(phFrom);
                while (cur <= phTo) {
                    publicHolidayDates.add(cur.toISOString().split('T')[0]);
                    cur.setDate(cur.getDate() + 1);
                }
            }
        }

        const employeeWeeklyOffMap: Record<string, number> = {};
        const dayNameToNum: Record<string, number> = {
            'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
            'Thursday': 4, 'Friday': 5, 'Saturday': 6
        };
        for (const emp of employeeRecords) {
            if (emp.attendance_id != null) {
                const dayName = emp.weekly_off || 'Friday';
                employeeWeeklyOffMap[String(emp.attendance_id)] = dayNameToNum[dayName] ?? 5;
            }
        }

        const sickLeaveExceptions = await fetchAllRecords(base44.asServiceRole.entities.Exception, {
            project_id: projectId,
            type: 'SICK_LEAVE'
        });

        const sickLeaveMap: Record<string, string[]> = {};
        for (const ex of sickLeaveExceptions) {
            const attId = String(ex.attendance_id);
            if (!sickLeaveMap[attId]) sickLeaveMap[attId] = [];
            const exFrom = new Date(ex.date_from);
            const exTo = ex.date_to ? new Date(ex.date_to) : exFrom;
            const cursor = new Date(exFrom);
            while (cursor <= exTo) {
                sickLeaveMap[attId].push(cursor.toISOString().split('T')[0]);
                cursor.setDate(cursor.getDate() + 1);
            }
        }

        const otherMinutesExceptions = await fetchAllRecords(base44.asServiceRole.entities.Exception, {
            project_id: projectId,
            type: 'MANUAL_OTHER_MINUTES'
        });

        const otherMinutesMap: Record<string, any[]> = {};
        for (const ex of otherMinutesExceptions) {
            const attId = String(ex.attendance_id);
            if (!otherMinutesMap[attId]) {
                otherMinutesMap[attId] = [];
            }
            otherMinutesMap[attId].push(ex);
        }

        const reportName = reportData.report_name || 'Attendance Report';
        const reportPeriod = reportData.date_from && reportData.date_to ? `${reportData.date_from} to ${reportData.date_to}` : 'N/A';
        
        const expectedTasks: Array<{ fingerprint: string, type: string, description: string, notes: string }> = [];

        // calculateRejoiningDate: finds the first working day after annual leave end date
        // Skips Weekly Off days, Public Holiday dates, and employee LOP dates
        // This ensures rejoining date reflects the actual first day the employee returned
        const calculateRejoiningDate = (lastLeaveDateStr: string, weeklyOffDay: number, lopDates: Set<string>): string => {
            const candidate = new Date(lastLeaveDateStr);
            candidate.setDate(candidate.getDate() + 1);
            let safety = 0;
            while (safety < 60) {
                const dateStr = candidate.toISOString().split('T')[0];
                const dayOfWeek = candidate.getUTCDay();
                // Day is valid rejoining date only if it is not weekly off, not a public holiday, and not an LOP date
                if (dayOfWeek !== weeklyOffDay && !publicHolidayDates.has(dateStr) && !lopDates.has(dateStr)) {
                    return dateStr;
                }
                candidate.setDate(candidate.getDate() + 1);
                safety++;
            }
            return candidate.toISOString().split('T')[0];
        };

        for (const res of analysisResults) {
            const attId = String(res.attendance_id || '');
            const name = attendanceNameMap[attId] || attId || 'Unknown';
            const lop = Number(res.full_absence_count) || 0;
            const other = Number(res.other_minutes) || 0;
            const lopAdj = Number(res.lop_adjacent_weekly_off_count) || 0;
            const nameKey = name.replace(/\s+/g, '');

            if (lop > 0) {
                const fp = `LopDays_${projectId}_${attId}_${lop}_${nameKey}`;

                let lopIndividualDates = reportPeriod;
                if (res.lop_dates) {
                    const lopArray = String(res.lop_dates).split(',').map(d => d.trim()).filter(d => d);
                    if (lopArray.length > 0) {
                        lopIndividualDates = lopArray.join(', ');
                    }
                }
                
                expectedTasks.push({
                    fingerprint: fp,
                    type: 'LOP Days',
                    description: `${name} | ${lopIndividualDates}`,
                    notes: ''
                });
            }

            if (other > 0) {
                const fp = `OtherMinutes_${projectId}_${attId}_${other}_${nameKey}`;
                
                const employeeOtherEx = otherMinutesMap[attId] || [];
                const otherMinutesIndividual = employeeOtherEx.length > 0
                    ? [...employeeOtherEx]
                        .sort((a, b) => a.date_from.localeCompare(b.date_from))
                        .map(ex => `${ex.date_from} (${ex.other_minutes || 0} min)`)
                        .join(', ')
                    : `${other} min`;

                expectedTasks.push({
                    fingerprint: fp,
                    type: 'Other Minutes',
                    description: `${name} | ${otherMinutesIndividual}`,
                    notes: ''
                });
            }

            // --- Double Deduction Days Task (lop_adjacent_weekly_off_count > 0) ---
            if (lopAdj > 0) {
                const fp = `DoubleDeduction_${projectId}_${attId}_${lopAdj}_${nameKey}`;
                
                let dedIndividualDates = reportPeriod;
                if (res.lop_adjacent_weekly_off_dates) {
                    const dedArray = String(res.lop_adjacent_weekly_off_dates).split(',').map(d => d.trim()).filter(d => d);
                    if (dedArray.length > 0) {
                        dedIndividualDates = dedArray.join(', ');
                    }
                }

                expectedTasks.push({
                    fingerprint: fp,
                    type: 'Double Deduction Days',
                    description: `${name} | ${dedIndividualDates}`,
                    notes: ''
                });
            }

            const sick = Number(res.sick_leave_count) || 0;
            if (sick > 0) {
                const fp = `SickLeave_${projectId}_${attId}_${sick}_${nameKey}`;
                const sickDates = (sickLeaveMap[attId] || [])
                    .sort()
                    .join(', ');
                const sickDescription = sickDates
                    ? `${name} | ${sickDates}`
                    : `${name} | ${sick} sick leave day(s)`;
                expectedTasks.push({
                    fingerprint: fp,
                    type: 'Sick Leave',
                    description: sickDescription,
                    notes: ''
                });
            }

            // Build LOP dates set for this employee from lop_dates field on AnalysisResult
            // This includes both regular LOP days and LOP-adjacent weekly off days
            const employeeLopDates = new Set<string>();
            if (res.lop_dates) {
                String(res.lop_dates).split(',').map(d => d.trim()).filter(d => d).forEach(d => employeeLopDates.add(d));
            }
            if (res.lop_adjacent_weekly_off_dates) {
                String(res.lop_adjacent_weekly_off_dates).split(',').map(d => d.trim()).filter(d => d).forEach(d => employeeLopDates.add(d));
            }

            const annualLeave = Number(res.annual_leave_count) || 0;
            if (annualLeave > 0 && annualLeaveLastDateMap[attId]) {
                const lastLeaveDate = annualLeaveLastDateMap[attId];
                const weeklyOffDay = employeeWeeklyOffMap[attId] ?? 5;
                const rejoiningDate = calculateRejoiningDate(lastLeaveDate, weeklyOffDay, employeeLopDates);
                const fp = `RejoiningDate_${projectId}_${attId}_${rejoiningDate}_${nameKey}`;
                expectedTasks.push({
                    fingerprint: fp,
                    type: 'Rejoining Date',
                    description: `${name} | Rejoining: ${rejoiningDate}`,
                    notes: ''
                });
            }
        }

        const expectedFingerprints = new Set(expectedTasks.map(t => t.fingerprint));
        const existingProjectTasks = await fetchAllRecords(base44.asServiceRole.entities.ChecklistItem, { project_id: projectId, is_auto_created: true });
        const relevantExisting = existingProjectTasks.filter((t: any) => t.task_type === 'LOP Days' || t.task_type === 'Other Minutes' || t.task_type === 'Double Deduction Days' || t.task_type === 'Sick Leave' || t.task_type === 'Rejoining Date');

        let deleted = 0;
        const tasksToDelete = relevantExisting.filter((t: any) => !expectedFingerprints.has(t.fingerprint));
        for (let i = 0; i < tasksToDelete.length; i += BATCH_SIZE) {
            const batch = tasksToDelete.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map((task: any) => withRetry(() => base44.asServiceRole.entities.ChecklistItem.delete(task.id))));
            deleted += batch.length;
            if (i + BATCH_SIZE < tasksToDelete.length) await sleep(BATCH_DELAY_MS);
        }

        let created = 0;
        const currentFingerprints = new Set(relevantExisting.map((t: any) => t.fingerprint));
        const tasksToCreate = expectedTasks.filter(task => !currentFingerprints.has(task.fingerprint));
        for (let i = 0; i < tasksToCreate.length; i += BATCH_SIZE) {
            const batch = tasksToCreate.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(task => withRetry(() => base44.asServiceRole.entities.ChecklistItem.create({
                project_id: projectId,
                task_type: task.type,
                task_description: task.description,
                status: 'pending',
                is_predefined: false,
                is_auto_created: true,
                fingerprint: task.fingerprint,
                notes: task.notes
            }))));
            created += batch.length;
            if (i + BATCH_SIZE < tasksToCreate.length) await sleep(BATCH_DELAY_MS);
        }

        return Response.json({ success: true, action: 'upsert', deleted, created });

    } catch (error: any) {
        console.error('Error in createReportChecklistTasks:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});