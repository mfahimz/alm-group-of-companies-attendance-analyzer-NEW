import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Un-finalize a report - reverses finalization
 * Only admins can un-finalize reports
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRole = user?.extended_role || user?.role || 'user';

        // Admin and HR Manager can un-finalize
        if (userRole !== 'admin' && userRole !== 'hr_manager') {
            return Response.json({ error: 'Only Admin or HR Manager can un-finalize reports' }, { status: 403 });
        }

        const { report_run_id, project_id } = await req.json();

        if (!report_run_id || !project_id) {
            return Response.json({ error: 'Missing report_run_id or project_id' }, { status: 400 });
        }

        // Fetch report run
        const reportRuns = await base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id });
        if (reportRuns.length === 0) {
            return Response.json({ error: 'Report run not found' }, { status: 404 });
        }

        const reportRun = reportRuns[0];

        if (!reportRun.is_final) {
            return Response.json({ error: 'Report is not finalized' }, { status: 400 });
        }

        // Delete salary snapshots created for this report
        const salarySnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({ 
            project_id,
            report_run_id 
        });

        console.log(`[unfinalizeReport] Deleting ${salarySnapshots.length} salary snapshots`);
        
        for (const snapshot of salarySnapshots) {
            await base44.asServiceRole.entities.SalarySnapshot.delete(snapshot.id);
        }

        // Un-mark report as final
        await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
            is_final: false,
            finalized_by: null,
            finalized_date: null
        });

        // --- NEW: Cleanup Checklist Tasks for LOP and Other Minutes ---
        try {
            await base44.asServiceRole.functions.invoke('createReportChecklistTasks', {
                reportRunId: report_run_id,
                action: 'delete'
            });
            console.log('[unfinalizeReport] Auto-checklist cleanup triggered successfully');
        } catch (checklistError) {
            console.warn('[unfinalizeReport] Failed to trigger auto-checklist cleanup:', checklistError.message);
        }

        console.log(`[unfinalizeReport] Report ${report_run_id} un-finalized successfully`);

        return Response.json({
            success: true,
            message: 'Report un-finalized successfully',
            deleted_snapshots: salarySnapshots.length
        });

    } catch (error) {
        console.error('[unfinalizeReport] Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});