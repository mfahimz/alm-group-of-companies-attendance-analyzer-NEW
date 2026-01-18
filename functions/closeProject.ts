import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // SECURITY: Only admin can close projects
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

        // Get the last saved report
        if (!project.last_saved_report_id) {
            return Response.json({ error: 'No report to finalize' }, { status: 400 });
        }

        // Get all analysis results for this report
        const results = await base44.asServiceRole.entities.AnalysisResult.filter({
            report_run_id: project.last_saved_report_id
        });

        // Get all employees
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: project.company
        });

        // Deduct approved minutes from quarterly allowances
        const updates = [];
        for (const result of results) {
            if (!result.approved_minutes || result.approved_minutes === 0) continue;

            const employee = employees.find(e => e.attendance_id === result.attendance_id);
            if (!employee) continue;

            // Get or create quarterly minutes record
            const quarterlyRecords = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                employee_id: employee.id,
                project_id: project_id
            });

            if (quarterlyRecords.length > 0) {
                const record = quarterlyRecords[0];
                const newUsedMinutes = (record.used_minutes || 0) + result.approved_minutes;
                const newRemainingMinutes = Math.max(0, (record.total_minutes || 0) - newUsedMinutes);

                updates.push(
                    base44.asServiceRole.entities.EmployeeQuarterlyMinutes.update(record.id, {
                        used_minutes: newUsedMinutes,
                        remaining_minutes: newRemainingMinutes
                    })
                );
            }
        }

        // Execute all updates
        await Promise.all(updates);

        // Close the project
        await base44.asServiceRole.entities.Project.update(project_id, {
            status: 'closed'
        });

        return Response.json({
            success: true,
            message: `Project closed successfully. ${updates.length} quarterly minutes records updated.`,
            updated_records: updates.length
        });

    } catch (error) {
        console.error('Close project error:', error);
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});