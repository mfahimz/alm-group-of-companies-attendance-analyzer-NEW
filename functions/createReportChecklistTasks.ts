import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createReportChecklistTasks
 *
 * Automatically creates or deletes LOP and Other Minutes checklist tasks
 * triggered by ReportRun (Attendance Report) finalization/un-finalization.
 */

const BATCH_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
            const relevant = existingTasks.filter((t: any) => t.task_type === 'LOP Days' || t.task_type === 'Other Minutes');
            
            let deletedCount = 0;
            for (const task of relevant) {
                await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
                deletedCount++;
                await sleep(BATCH_DELAY_MS);
            }
            return Response.json({ success: true, action: 'delete', deleted: deletedCount });
        }

        // --- ACTION: UPSERT ---
        const analysisResults = await base44.asServiceRole.entities.AnalysisResult.filter({ report_run_id: reportRunId });
        if (analysisResults.length === 0) return Response.json({ success: true, message: 'No analysis results found' });

        const reportName = reportData.report_name || 'Attendance Report';
        const reportPeriod = reportData.date_from && reportData.date_to ? `${reportData.date_from} to ${reportData.date_to}` : 'N/A';
        
        const expectedTasks: Array<{ fingerprint: string, type: string, description: string, notes: string }> = [];

        for (const res of analysisResults) {
            const name = res.employee_name || res.attendance_id || 'Unknown';
            const attId = res.attendance_id || '';
            const lop = Number(res.full_absence_count) || 0;
            const other = Number(res.other_minutes) || 0;
            const nameKey = name.replace(/\s+/g, '');

            if (lop > 0) {
                const fp = `LopDays_${projectId}_${attId}_${lop}_${nameKey}`;
                expectedTasks.push({
                    fingerprint: fp,
                    type: 'LOP Days',
                    description: `${name} | LOP Days: ${lop} | Report: ${reportName}`,
                    notes: `Employee: ${name}\nID: ${attId}\nLOP: ${lop}\nPeriod: ${reportPeriod}\n[Auto-created from Finalized Report]`
                });
            }

            if (other > 0) {
                const fp = `OtherMinutes_${projectId}_${attId}_${other}_${nameKey}`;
                expectedTasks.push({
                    fingerprint: fp,
                    type: 'Other Minutes',
                    description: `${name} | Other Minutes: ${other} min | Report: ${reportName}`,
                    notes: `Employee: ${name}\nID: ${attId}\nOther: ${other} min\nPeriod: ${reportPeriod}\n[Auto-created from Finalized Report]`
                });
            }
        }

        const expectedFingerprints = new Set(expectedTasks.map(t => t.fingerprint));
        const existingProjectTasks = await base44.asServiceRole.entities.ChecklistItem.filter({ project_id: projectId, is_auto_created: true });
        const relevantExisting = existingProjectTasks.filter((t: any) => t.task_type === 'LOP Days' || t.task_type === 'Other Minutes');

        let deleted = 0;
        for (const task of relevantExisting) {
            if (!expectedFingerprints.has(task.fingerprint)) {
                await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
                deleted++;
                await sleep(BATCH_DELAY_MS);
            }
        }

        let created = 0;
        const currentFingerprints = new Set(relevantExisting.map((t: any) => t.fingerprint));
        for (const task of expectedTasks) {
            if (!currentFingerprints.has(task.fingerprint)) {
                await base44.asServiceRole.entities.ChecklistItem.create({
                    project_id: projectId,
                    task_type: task.type,
                    task_description: task.description,
                    status: 'pending',
                    is_predefined: false,
                    is_auto_created: true,
                    fingerprint: task.fingerprint,
                    notes: task.notes
                });
                created++;
                await sleep(BATCH_DELAY_MS);
            }
        }

        return Response.json({ success: true, action: 'upsert', deleted, created });

    } catch (error: any) {
        console.error('Error in createReportChecklistTasks:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
