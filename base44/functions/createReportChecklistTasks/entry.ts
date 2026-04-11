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
            const relevant = existingTasks.filter((t: any) => t.task_type === 'LOP Days' || t.task_type === 'Other Minutes' || t.task_type === 'Double Deduction Days');
            
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

        for (const res of analysisResults) {
            const attId = res.attendance_id || '';
            const name = attendanceNameMap[String(attId)] || attId || 'Unknown';
            const lop = Number(res.full_absence_count) || 0;
            const other = Number(res.other_minutes) || 0;
            const lopAdj = Number(res.lop_adjacent_weekly_off_count) || 0;
            const nameKey = name.replace(/\s+/g, '');

            if (lop > 0) {
                const fp = `LopDays_${projectId}_${attId}_${lop}_${nameKey}`;

                let lopDatesStr = '';
                let lopDateRange = reportPeriod;
                if (res.lop_dates) {
                    const lopArray = String(res.lop_dates).split(',').map(d => d.trim()).filter(d => d);
                    if (lopArray.length > 0) {
                        lopDatesStr = lopArray.map(d => `- ${d}`).join('\n') + '\n';
                        lopDateRange = lopArray.length === 1 ? lopArray[0] : `${lopArray[0]} to ${lopArray[lopArray.length - 1]}`;
                    }
                }
                
                let doubleDedStr = '';
                if (res.lop_adjacent_weekly_off_dates) {
                    const dedArray = String(res.lop_adjacent_weekly_off_dates).split(',').map(d => d.trim()).filter(d => d);
                    if (dedArray.length > 0) {
                        doubleDedStr = 'Double Deduction Days:\n' + dedArray.map(d => `- ${d}`).join('\n') + '\n';
                    }
                }
                
                expectedTasks.push({
                    fingerprint: fp,
                    type: 'LOP Days',
                    description: `${name} | LOP Days: ${lop} | ${lopDateRange}`,
                    notes: `Employee: ${name}\nID: ${attId}\nLOP Days:\n${lopDatesStr}${doubleDedStr}Total LOP Days: ${lop}\nPeriod: ${reportPeriod}\n[Auto-created from Finalized Report]`
                });
            }

            if (other > 0) {
                const fp = `OtherMinutes_${projectId}_${attId}_${other}_${nameKey}`;
                
                let otherNotesStr = '';
                let otherDateRange = reportPeriod;
                const employeeOtherEx = otherMinutesMap[String(attId)] || [];
                if (employeeOtherEx.length > 0) {
                    const sortedEx = [...employeeOtherEx].sort((a, b) => new Date(a.date_from).getTime() - new Date(b.date_from).getTime());
                    otherNotesStr = sortedEx.map(ex => `- ${ex.date_from}: ${ex.allowed_minutes} min`).join('\n') + '\n';
                    const dates = sortedEx.map(ex => ex.date_from);
                    otherDateRange = dates.length === 1 ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`;
                }

                expectedTasks.push({
                    fingerprint: fp,
                    type: 'Other Minutes',
                    description: `${name} | Other Minutes: ${other} min | ${otherDateRange}`,
                    notes: `Employee: ${name}\nID: ${attId}\nOther Minutes Breakdown:\n${otherNotesStr}Total Other Minutes: ${other} min\nPeriod: ${reportPeriod}\n[Auto-created from Finalized Report]`
                });
            }

            // --- Double Deduction Days Task (lop_adjacent_weekly_off_count > 0) ---
            if (lopAdj > 0) {
                const fp = `DoubleDeduction_${projectId}_${attId}_${lopAdj}_${nameKey}`;
                
                let doubleDedNotes = '';
                let dedDateRange = reportPeriod;
                if (res.lop_adjacent_weekly_off_dates) {
                    const dedArray = String(res.lop_adjacent_weekly_off_dates).split(',').map(d => d.trim()).filter(d => d);
                    if (dedArray.length > 0) {
                        doubleDedNotes = dedArray.map(d => `- ${d}`).join('\n') + '\n';
                        dedDateRange = dedArray.length === 1 ? dedArray[0] : `${dedArray[0]} to ${dedArray[dedArray.length - 1]}`;
                    }
                }

                expectedTasks.push({
                    fingerprint: fp,
                    type: 'Double Deduction Days',
                    description: `${name} | Double Deduction Days: ${lopAdj} | ${dedDateRange}`,
                    notes: `Employee: ${name}\nID: ${attId}\nDouble Deduction Days:\n${doubleDedNotes}Total Double Deduction Days: ${lopAdj}\nPeriod: ${reportPeriod}\n[Auto-created from Finalized Report]`
                });
            }
        }

        const expectedFingerprints = new Set(expectedTasks.map(t => t.fingerprint));
        const existingProjectTasks = await fetchAllRecords(base44.asServiceRole.entities.ChecklistItem, { project_id: projectId, is_auto_created: true });
        const relevantExisting = existingProjectTasks.filter((t: any) => t.task_type === 'LOP Days' || t.task_type === 'Other Minutes' || t.task_type === 'Double Deduction Days');

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