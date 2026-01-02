import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Get all closed projects
        const allProjects = await base44.asServiceRole.entities.Project.list();
        const closedProjects = allProjects.filter(p => p.status === 'closed' && p.last_saved_report_id);
        
        let processedEmployees = 0;
        let projectsProcessed = 0;
        const errors = [];

        for (const project of closedProjects) {
            try {
                // Get results from the last saved report
                const allResults = await base44.asServiceRole.entities.AnalysisResult.list();
                const results = allResults.filter(r => r.report_run_id === project.last_saved_report_id);

                if (results.length === 0) {
                    errors.push(`Project ${project.name}: No results found`);
                    continue;
                }

                // Get all employees
                const allEmployees = await base44.asServiceRole.entities.Employee.list();
                const employees = allEmployees.filter(e => e.company === project.company);

                // Update each employee's grace minutes
                for (const result of results) {
                    try {
                        const employee = employees.find(e => e.attendance_id === result.attendance_id);
                        if (employee) {
                            const usedMinutes = (result.late_minutes || 0) + (result.early_checkout_minutes || 0);
                            const remainingGrace = Math.max(0, (result.grace_minutes || 0) - usedMinutes);
                            
                            await base44.asServiceRole.entities.Employee.update(employee.id, {
                                carried_grace_minutes: remainingGrace
                            });
                            processedEmployees++;
                        }
                    } catch (empError) {
                        errors.push(`Employee ${result.attendance_id}: ${empError.message}`);
                    }
                }

                projectsProcessed++;
            } catch (projError) {
                errors.push(`Project ${project.name}: ${projError.message}`);
            }
        }

        return Response.json({
            success: true,
            projects_processed: projectsProcessed,
            employees_updated: processedEmployees,
            errors: errors.length > 0 ? errors : null,
            message: `Recalculated grace minutes for ${processedEmployees} employees from ${projectsProcessed} closed projects`
        });

    } catch (error) {
        console.error('Recalculation error:', error);
        return Response.json({ 
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});