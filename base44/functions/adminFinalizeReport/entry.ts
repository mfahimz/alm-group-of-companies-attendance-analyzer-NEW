import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // No role restriction — all authenticated users can finalize reports

        const { report_run_id, project_id } = await req.json();

        if (!report_run_id || !project_id) {
            return Response.json({ error: 'report_run_id and project_id are required' }, { status: 400 });
        }

        // Verify report exists
        const reports = await base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id });
        if (reports.length === 0) {
            return Response.json({ error: 'Report not found' }, { status: 404 });
        }

        // Verify project exists
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Mark this report as final for the project
        const allReports = await base44.asServiceRole.entities.ReportRun.filter({
            project_id: project_id
        });

        for (const report of allReports) {
            if (report.is_final) {
                await base44.asServiceRole.entities.ReportRun.update(report.id, {
                    is_final: false
                });
            }
        }

        const project = projects[0];

        // Create salary snapshots for Al Maraghi Motors ONLY
        // Uses a batch loop identical to the frontend finalizeReportMutation pattern.
        // This is required for projects with more than 10 employees to avoid
        // timeout errors that occur with a single non-batch invocation.
        if (project.company === 'Al Maraghi Motors') {
            let batch_start = 0;
            const batch_size = 10;
            let has_more = true;
            let totalProcessed = 0;
            let snapshotsSucceeded = true;

            while (has_more) {
                try {
                    console.log(`[adminFinalizeReport] Calling createSalarySnapshots batch: batch_start=${batch_start}, batch_size=${batch_size}`);
                    // Each batch processes up to batch_size employees starting from batch_start.
                    // batch_mode=true tells createSalarySnapshots to use paginated processing.
                    const batchResult = await base44.functions.invoke('createSalarySnapshots', {
                        project_id,
                        report_run_id,
                        batch_mode: true,
                        batch_start,
                        batch_size
                    });

                    console.log(`[adminFinalizeReport] Raw batchResult type: ${typeof batchResult}`);
                    console.log(`[adminFinalizeReport] Raw batchResult keys: ${batchResult ? Object.keys(batchResult).join(',') : 'null'}`);
                    console.log(`[adminFinalizeReport] batchResult.data type: ${typeof batchResult?.data}`);

                    const batchData = batchResult?.data || batchResult || {};
                    console.log(`[adminFinalizeReport] Parsed batchData:`, JSON.stringify(batchData).substring(0, 500));

                    has_more = batchData.has_more === true;
                    batch_start = batchData.current_position ?? (batch_start + batch_size);
                    totalProcessed = batch_start;

                    console.log(`[adminFinalizeReport] Salary snapshot batch completed: processed up to position ${batch_start}, has_more=${has_more}`);

                    // Wait 300ms between batches to avoid overloading the function
                    if (has_more) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (salaryError) {
                    console.error('[adminFinalizeReport] Salary snapshot batch failed:', salaryError.message);
                    console.error('[adminFinalizeReport] Salary snapshot batch error stack:', salaryError.stack);
                    snapshotsSucceeded = false;
                    break;
                }
            }

            if (!snapshotsSucceeded) {
                return Response.json({
                    error: 'Failed to create salary snapshots. Report was NOT finalized. Please try again.',
                    report_run_id
                }, { status: 500 });
            }

            console.log(`[adminFinalizeReport] Salary snapshots completed for Al Maraghi Motors. Total employees processed: ${totalProcessed}`);
        }

        // Mark the selected report as final
        await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
            is_final: true,
            finalized_by: user.email,
            finalized_date: new Date().toISOString()
        });

        // Update project's last_saved_report_id to track which report was finalized
        await base44.asServiceRole.entities.Project.update(project_id, {
            last_saved_report_id: report_run_id
        });

        // Log audit (with error handling to not block finalization)
        try {
            await base44.functions.invoke('logAudit', {
                action: 'ADMIN_FINALIZE_REPORT',
                entity_type: 'ReportRun',
                entity_id: report_run_id,
                details: `Admin finalized report without saving (skipped approval link generation) for project ${project_id}`
            });
        } catch (auditError) {
            console.warn('Failed to log audit:', auditError.message);
        }

        // --- NEW: Create Checklist Tasks for LOP and Other Minutes ---
        try {
            await base44.functions.invoke('createReportChecklistTasks', {
                reportRunId: report_run_id,
                action: 'upsert'
            });
            console.log('[adminFinalizeReport] Auto-checklist tasks triggered successfully');
        } catch (checklistError) {
            console.warn('[adminFinalizeReport] Failed to trigger auto-checklist tasks:', checklistError.message);
        }

        return Response.json({ 
            success: true,
            message: 'Report finalized successfully by admin (without approval links)',
            report_run_id
        });

    } catch (error) {
        console.error('Admin finalize report error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});