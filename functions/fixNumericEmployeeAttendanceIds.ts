import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const employees = await base44.asServiceRole.entities.Employee.list();
        const numericEmployees = employees.filter(e => typeof e.attendance_id === 'number');

        let fixedCount = 0;
        const errors = [];

        for (const employee of numericEmployees) {
            try {
                await base44.asServiceRole.entities.Employee.update(employee.id, {
                    attendance_id: String(employee.attendance_id)
                });
                fixedCount++;
            } catch (err) {
                errors.push(`Failed to fix employee ${employee.id}: ${err.message}`);
            }
        }

        return Response.json({
            success: true,
            recordsFound: numericEmployees.length,
            recordsFixed: fixedCount,
            errors: errors.length > 0 ? errors : null
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});