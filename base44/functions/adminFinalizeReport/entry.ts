import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // SECURITY: Admin, Supervisor, CEO, and HR Manager can finalize reports
        const userRole = user?.extended_role || user?.role || 'user';
        if (!['admin', 'supervisor', 'ceo', 'hr_manager'].includes(userRole)) {
            return Response.json({ error: 'Access denied: Admin, Supervisor, CEO, or HR Manager role required' }, { status: 403 });
        }

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

        // [MOVE_HINT: Target finalization was moved to the end of the function]

        // [MOVE_HINT: This was moved to the end of the function to ensure data integrity]

        // Create salary snapshots for Al Maraghi Motors ONLY
        // Uses a batch loop identical to the frontend finalizeReportMutation pattern.
        // This is required for projects with more than 10 employees to avoid
        // timeout errors that occur with a single non-batch invocation.
        const project = projects[0];
        if (project.company === 'Al Maraghi Motors') {
            let batch_start = 0;
            const batch_size = 10;
            let has_more = true;
            let totalProcessed = 0;

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

                    const batchData = batchResult?.data || batchResult || {};
                    
                    // Check for internal success if the function returns progress data
                    if (batchData.error) {
                        throw new Error(`Batch creation failed: ${batchData.error}`);
                    }

                    has_more = batchData.has_more === true;
                    batch_start = batchData.current_position ?? (batch_start + batch_size);
                    totalProcessed = batch_start;

                    console.log(`[adminFinalizeReport] Salary snapshot batch completed: processed up to position ${batch_start}, has_more=${has_more}`);

                    // Wait 300ms between batches to avoid overloading the function
                    if (has_more) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (salaryError) {
                    const message = salaryError instanceof Error ? salaryError.message : String(salaryError);
                    console.error('[adminFinalizeReport] Salary snapshot batch failed:', message);
                    // CRITICAL: Throw error to trigger main catch and prevent is_final=true
                    throw new Error(`Salary snapshot creation failed. Finalization aborted to protect data integrity. Error: ${message}`);
                }
            }

            console.log(`[adminFinalizeReport] Salary snapshots completed for Al Maraghi Motors. Total employees processed: ${totalProcessed}`);
        }

        // Log audit (with error handling to not block finalization)
        try {
            await base44.functions.invoke('logAudit', {
                action: 'ADMIN_FINALIZE_REPORT',
                entity_type: 'ReportRun',
                entity_id: report_run_id,
                details: `Admin finalized report without saving (skipped approval link generation) for project ${project_id}`
            });
        } catch (auditError) {
            const message = auditError instanceof Error ? auditError.message : String(auditError);
            console.warn('Failed to log audit:', message);
        }

        // --- Create Checklist Tasks for LOP and Other Minutes ---
        // Errors here now propagate to prevent false finalization status
        try {
            await base44.functions.invoke('createReportChecklistTasks', {
                reportRunId: report_run_id,
                action: 'upsert'
            });
            console.log('[adminFinalizeReport] Auto-checklist tasks triggered successfully');
        } catch (checklistError) {
            const message = checklistError instanceof Error ? checklistError.message : String(checklistError);
            console.error('[adminFinalizeReport] Failed to trigger auto-checklist tasks:', message);
            throw new Error(`Checklist task creation failed. Finalization aborted. Error: ${message}`);
        }

        // --- OPTIONAL: Run consistency check (Snapshots vs Employee Count) ---
        if (project.company === 'Al Maraghi Motors') {
            const snapshotCount = await base44.asServiceRole.entities.SalarySnapshot.filter({
                project_id,
                report_run_id
            }).then((res: any[]) => res.length);
            
            const expectedCount = reports[0].employee_count || 0;
            
            if (expectedCount > 0 && snapshotCount < expectedCount) {
                console.warn(`[adminFinalizeReport] Consistency check failed: Snapshots (${snapshotCount}) < Expected (${expectedCount})`);
                throw new Error(`Data integrity check failed: Only ${snapshotCount}/${expectedCount} salary snapshots were created. Finalization aborted.`);
            }
            console.log(`[adminFinalizeReport] Consistency check passed: ${snapshotCount} snapshots verified.`);
        }

        // --- FINAL STEP: Mark the report as final and update project metadata ---
        // This only executes if all previous side effects (snapshots, checklist) succeeded.
        await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
            is_final: true,
            finalized_by: user.email,
            finalized_date: new Date().toISOString(),
            is_saved: true
        });

        await base44.asServiceRole.entities.Project.update(project_id, {
            last_saved_report_id: report_run_id
        });

        return Response.json({ 
            success: true,
            message: 'Report finalized successfully by admin (without approval links)',
            report_run_id
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Admin finalize report error:', message);
        return Response.json({ 
            error: message 
        }, { status: 500 });
    }
});