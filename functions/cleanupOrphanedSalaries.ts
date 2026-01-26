import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const salaries = await base44.asServiceRole.entities.EmployeeSalary.list();
        const employees = await base44.asServiceRole.entities.Employee.list();
        const employeeIds = new Set(employees.map(e => e.hrms_id));

        const orphanedSalaries = salaries.filter(s => s.active && !employeeIds.has(s.employee_id));

        let deactivatedCount = 0;
        const errors = [];

        for (const salary of orphanedSalaries) {
            try {
                await base44.asServiceRole.entities.EmployeeSalary.update(salary.id, {
                    active: false
                });
                deactivatedCount++;
            } catch (err) {
                errors.push(`Failed to deactivate salary ${salary.id}: ${err.message}`);
            }
        }

        return Response.json({
            success: true,
            recordsFound: orphanedSalaries.length,
            recordsDeactivated: deactivatedCount,
            errors: errors.length > 0 ? errors : null
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});