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

        // Fetch project to get company and custom_employee_ids
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

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

        // Create salary snapshots for all employees from this finalized report
        console.log(`[markFinalReport] Calling createSalarySnapshots for project ${project_id}, report ${report_run_id}`);
        
        const snapshotResult = await base44.asServiceRole.functions.invoke('createSalarySnapshots', {
            project_id: project_id,
            report_run_id: report_run_id
        });
        
        console.log('[markFinalReport] createSalarySnapshots result:', snapshotResult);

        // VALIDATION: Verify snapshot count matches eligible employee count
        // Fetch employees and salaries to count eligible employees
        const [employees, salaries] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true })
        ]);

        // Filter to project's custom_employee_ids if specified
        let eligibleEmployees = employees;
        if (project.custom_employee_ids && project.custom_employee_ids.trim()) {
            const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id);
            eligibleEmployees = employees.filter(emp => 
                customIds.includes(String(emp.hrms_id)) || customIds.includes(String(emp.attendance_id))
            );
        }

        // Count employees with valid salary records
        const eligibleCount = eligibleEmployees.filter(emp => 
            salaries.some(s => 
                String(s.employee_id) === String(emp.hrms_id) || 
                String(s.attendance_id) === String(emp.attendance_id)
            )
        ).length;

        // Get actual snapshot count
        const createdSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        const snapshotCount = createdSnapshots.length;

        console.log(`[markFinalReport] Validation: ${snapshotCount} snapshots created, ${eligibleCount} eligible employees`);

        // HARD VALIDATION: Snapshot count MUST equal eligible employee count
        if (snapshotCount !== eligibleCount) {
            // Rollback: Unmark as final
            await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
                is_final: false,
                finalized_by: null,
                finalized_date: null
            });

            return Response.json({ 
                success: false,
                error: `VALIDATION FAILED: Created ${snapshotCount} salary snapshots but expected ${eligibleCount} (eligible employees with salary records). Please check employee and salary data.`,
                snapshots_created: snapshotCount,
                eligible_employees: eligibleCount
            }, { status: 400 });
        }

        // Log audit
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'MARK_FINAL_REPORT',
            entity_type: 'ReportRun',
            entity_id: report_run_id,
            details: `Marked report as final for project ${project_id}. Created ${snapshotCount} salary snapshots (${snapshotResult?.data?.analyzed_count || 0} analyzed, ${snapshotResult?.data?.no_attendance_count || 0} no attendance data).`
        });

        return Response.json({ 
            success: true,
            message: 'Report marked as final successfully. Salary snapshots created.',
            snapshots_created: snapshotCount,
            analyzed_count: snapshotResult?.data?.analyzed_count || 0,
            no_attendance_count: snapshotResult?.data?.no_attendance_count || 0,
            eligible_employees: eligibleCount,
            snapshots: snapshotResult?.data || snapshotResult
        });

    } catch (error) {
        console.error('Mark final report error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});