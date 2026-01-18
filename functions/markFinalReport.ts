import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // SECURITY: Only admin or supervisor can mark final reports
        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin' && userRole !== 'supervisor') {
            return Response.json({ error: 'Access denied: Admin or Supervisor role required' }, { status: 403 });
        }

        const { report_run_id, project_id } = await req.json();

        if (!report_run_id || !project_id) {
            return Response.json({ error: 'report_run_id and project_id are required' }, { status: 400 });
        }

        // First, unmark all reports for this project
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

        // Mark the selected report as final
        await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
            is_final: true
        });

        // Log audit
        await base44.functions.invoke('logAudit', {
            action: 'MARK_FINAL_REPORT',
            entity_type: 'ReportRun',
            entity_id: report_run_id,
            details: `Marked report as final for project ${project_id}`
        });

        return Response.json({ 
            success: true,
            message: 'Report marked as final successfully'
        });

    } catch (error) {
        console.error('Mark final report error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});