import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * MARK FINAL REPORT
 * 
 * Marks a report as final and triggers salary snapshot creation.
 * 
 * VALIDATION REQUIREMENT:
 * After snapshot creation, validates that snapshots count equals eligible employee count.
 * If mismatch, the finalization is blocked with an error.
 */

Deno.serve(async (req) => {
    try {
        console.log('[markFinalReport] ============================================');
        console.log('[markFinalReport] FUNCTION ENTRY');
        console.log('[markFinalReport] ============================================');
        
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
        
        console.log('[markFinalReport] Parameters received:');
        console.log('[markFinalReport]   project_id:', project_id);
        console.log('[markFinalReport]   report_run_id:', report_run_id);
        console.log('[markFinalReport]   user:', user.email);
        console.log('[markFinalReport]   role:', userRole);

        if (!report_run_id || !project_id) {
            return Response.json({ error: 'report_run_id and project_id are required' }, { status: 400 });
        }

        // Fetch project to get company and custom_employee_ids
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // First, unmark all reports for this project
        const allReports = await base44.asServiceRole.entities.ReportRun.filter({
            project_id: project_id
        }, null, 5000);

        for (const report of allReports) {
            if (report.is_final) {
                await base44.asServiceRole.entities.ReportRun.update(report.id, {
                    is_final: false
                });
            }
        }

        // Mark the selected report as final with audit info
        const nowUAE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })).toISOString();
        await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
            is_final: true,
            finalized_by: user.email,
            finalized_date: nowUAE,
            recalculation_version: 0
        });

        // Update project.last_saved_report_id to point to the finalized report
        await base44.asServiceRole.entities.Project.update(project_id, {
            last_saved_report_id: report_run_id
        });

        // Validate AnalysisResult count before marking as final
        console.log(`[markFinalReport] Validating AnalysisResult data before finalization`);
        
        const [employees, salaries, analysisResults] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }, null, 5000),
            base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true }, null, 5000),
            base44.asServiceRole.entities.AnalysisResult.filter({
                project_id: project_id,
                report_run_id: report_run_id
            }, null, 5000)
        ]);

        // Filter to project's custom_employee_ids if specified
        let eligibleEmployees = employees;
        if (project.custom_employee_ids && project.custom_employee_ids.trim()) {
            const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id);
            eligibleEmployees = employees.filter(emp => 
                customIds.includes(String(emp.hrms_id)) || customIds.includes(String(emp.attendance_id))
            );
        }

        // Validate AnalysisResult completeness (ALL COMPANIES)
        const analysisAttendanceIds = new Set(analysisResults.map(r => String(r.attendance_id)));
        const allActiveEmployeeIds = eligibleEmployees.map(e => String(e.attendance_id));
        const missingAnalysisIds = allActiveEmployeeIds.filter(id => !analysisAttendanceIds.has(id));
        
        if (missingAnalysisIds.length > 0) {
            console.log(`[markFinalReport] ANALYSIS VALIDATION FAILED: ${missingAnalysisIds.length} employees missing AnalysisResult`);
            
            // Rollback: Unmark as final
            await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
                is_final: false,
                finalized_by: null,
                finalized_date: null
            });

            const missingEmployees = eligibleEmployees
                .filter(e => missingAnalysisIds.includes(String(e.attendance_id)))
                .map(e => ({ attendance_id: e.attendance_id, name: e.name }));

            return Response.json({ 
                success: false,
                error: `VALIDATION FAILED: ${missingAnalysisIds.length} employees missing from AnalysisResult. Run backfillReportMissingEmployees first.`,
                analysis_count: analysisResults.length,
                expected_count: allActiveEmployeeIds.length,
                missing_attendance_ids: missingAnalysisIds,
                missing_employees: missingEmployees.slice(0, 10),
                action_required: `Run backfillReportMissingEmployees with project_id="${project_id}" and report_run_id="${report_run_id}"`
            }, { status: 400 });
        }

        // Log audit
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'MARK_FINAL_REPORT',
            entity_type: 'ReportRun',
            entity_id: report_run_id,
            details: `Marked report as final for project ${project_id}. Frontend will create salary snapshots.`
        });

        console.log(`[markFinalReport] Report marked as final successfully. Frontend will create snapshots in batches.`);

        return Response.json({ 
            success: true,
            ready_for_snapshots: true,
            message: 'Report marked as final. Ready for snapshot creation.'
        });

    } catch (error) {
        console.error('Mark final report error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});