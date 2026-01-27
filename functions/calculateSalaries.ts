import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, report_run_id } = await req.json();

        if (!project_id || !report_run_id) {
            return Response.json({ 
                error: 'project_id and report_run_id are required' 
            }, { status: 400 });
        }

        // DEPRECATED: This function is deprecated in favor of SalarySnapshot entity
        // =========================================================================
        // Salary snapshots are now created when a report is marked final.
        // This function is kept only for backward compatibility.
        // Use SalarySnapshot entity directly for all salary calculations.
        // =========================================================================

        // Fetch salary snapshots (immutable source of truth)
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        if (snapshots.length === 0) {
            return Response.json({ 
                error: 'No salary snapshots found. Please mark the report as final first.',
                success: false
            }, { status: 404 });
        }

        // Fetch project for divisor
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        const divisor = project.salary_calculation_days || 30;

        // Return snapshots as-is (they are the single source of truth)
        const salaryCalculations = snapshots.map(snapshot => {
            // Calculate totals from snapshot values
            const totalSalary = snapshot.total_salary;
            const finalTotal = totalSalary - snapshot.netDeduction - snapshot.deductibleHoursPay;

            return {
                ...snapshot,
                total: Math.round(finalTotal * 100) / 100,
                wpsPay: Math.round(finalTotal * 100) / 100
            };
        });

        return Response.json({
            success: true,
            data: salaryCalculations,
            project_company: project.company,
            report_run_id,
            snapshots_used: true,
            calculated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Calculate salaries error:', error);
        return Response.json({ 
            error: error.message,
            success: false
        }, { status: 500 });
    }
});