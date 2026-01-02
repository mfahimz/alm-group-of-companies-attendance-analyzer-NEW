import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Get all closed projects
        const projects = await base44.asServiceRole.entities.Project.filter({ status: 'closed' });
        
        let processedEmployees = 0;
        let projectsProcessed = 0;

        for (const project of projects) {
            if (!project.last_saved_report_id) continue;

            // Get results from the last saved report
            const results = await base44.asServiceRole.entities.AnalysisResult.filter({ 
                report_run_id: project.last_saved_report_id 
            });

            if (results.length === 0) continue;

            // Get employees for this company
            const employees = await base44.asServiceRole.entities.Employee.filter({ 
                company: project.company 
            });

            // Update each employee's grace minutes
            for (const result of results) {
                const employee = employees.find(e => e.attendance_id === result.attendance_id);
                if (employee) {
                    const usedMinutes = (result.late_minutes || 0) + (result.early_checkout_minutes || 0);
                    const remainingGrace = Math.max(0, (result.grace_minutes || 0) - usedMinutes);
                    
                    await base44.asServiceRole.entities.Employee.update(employee.id, {
                        carried_grace_minutes: remainingGrace
                    });
                    processedEmployees++;
                }
            }

            projectsProcessed++;
        }

        return Response.json({
            success: true,
            projects_processed: projectsProcessed,
            employees_updated: processedEmployees,
            message: `Successfully recalculated grace minutes for ${processedEmployees} employees from ${projectsProcessed} closed projects`
        });

    } catch (error) {
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});