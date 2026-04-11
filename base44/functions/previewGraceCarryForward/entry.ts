import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Preview grace minutes carry-forward before actually closing project
 * Returns list of employees with unused grace calculation.
 *
 * IMPORTANT: effectiveGrace is read from AnalysisResult.grace_minutes — the value
 * that was actually applied during the analysis run. This prevents drift caused by
 * live Employee.carried_grace_minutes changing between analysis and project close.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin') {
            return Response.json({ error: 'Access denied: Admin role required' }, { status: 403 });
        }

        const { project_id } = await req.json();

        if (!project_id) {
            return Response.json({ error: 'Missing project_id' }, { status: 400 });
        }

        // Get project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // Verify company
        if (project.company !== 'Al Maraghi Motors') {
            return Response.json({ 
                error: 'Grace carry-forward only available for Al Maraghi Motors' 
            }, { status: 400 });
        }

        // Get finalized report
        if (!project.last_saved_report_id) {
            return Response.json({ error: 'No finalized report found' }, { status: 400 });
        }

        const reportRuns = await base44.asServiceRole.entities.ReportRun.filter({
            id: project.last_saved_report_id
        });
        if (reportRuns.length === 0 || !reportRuns[0].is_final) {
            return Response.json({ error: 'Report must be finalized first' }, { status: 400 });
        }

        const reportRun = reportRuns[0];

        // Get finalized analysis results
        const results = await base44.asServiceRole.entities.AnalysisResult.filter({
            report_run_id: reportRun.id
        }, null, 5000);

        // Get employees
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: project.company
        }, null, 5000);

        // Build preview data
        const preview = [];
        
        for (const result of results) {
            const employee = employees.find(e => 
                String(e.attendance_id) === String(result.attendance_id)
            );
            
            if (!employee) continue;

            // effectiveGrace = what was stored in AnalysisResult during analysis run
            // This is the authoritative source — avoids drift from live Employee data
            const effectiveGrace = result.grace_minutes || 0;

            const lateMinutes = result.late_minutes || 0;
            const earlyCheckoutMinutes = result.early_checkout_minutes || 0;
            const timeIssues = lateMinutes + earlyCheckoutMinutes;
            const unusedGraceMinutes = Math.max(0, effectiveGrace - timeIssues);
            
            preview.push({
                attendance_id: String(employee.attendance_id),
                hrms_id: String(employee.hrms_id),
                name: employee.name,
                department: employee.department || 'Admin',
                late_minutes: lateMinutes,
                early_checkout_minutes: earlyCheckoutMinutes,
                time_issues: timeIssues,
                grace_minutes_available: effectiveGrace,
                unused_grace_minutes: unusedGraceMinutes
            });
        }

        // Sort by unused grace descending
        preview.sort((a, b) => b.unused_grace_minutes - a.unused_grace_minutes);

        return Response.json({
            success: true,
            project_name: project.name,
            report_period: `${reportRun.date_from} to ${reportRun.date_to}`,
            employee_count: preview.length,
            preview_data: preview,
            total_unused_grace: preview.reduce((sum, e) => sum + e.unused_grace_minutes, 0)
        });

    } catch (error) {
        console.error('Preview grace carry-forward error:', error);
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});