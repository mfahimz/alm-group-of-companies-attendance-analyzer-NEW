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

        // Create salary snapshots for Al Maraghi Motors ONLY
        const project = projects[0];
        if (project.company === 'Al Maraghi Motors') {
            try {
                await base44.asServiceRole.functions.invoke('createSalarySnapshots', {
                    project_id,
                    report_run_id
                });
                console.log('[adminFinalizeReport] Salary snapshots created for Al Maraghi Motors');
            } catch (salaryError) {
                console.warn('[adminFinalizeReport] Failed to create salary snapshots:', salaryError.message);
                // Don't block finalization if salary snapshot creation fails
            }
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
            console.warn('Failed to log audit:', auditError.message);
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