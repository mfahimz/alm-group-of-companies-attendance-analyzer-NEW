import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Create H1 + H2 half-yearly minutes records for 2026
 * for all active Al Maraghi Auto Repairs employees.
 *
 * Creates 2 records per employee:
 *   H1 (half=1): Jan-Jun 2026
 *   H2 (half=2): Jul-Dec 2026
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: 'Al Maraghi Auto Repairs',
            active: true
        });

        const validEmployees = employees.filter(emp =>
            emp.hrms_id &&
            emp.hrms_id !== 'NULL' &&
            emp.hrms_id !== null &&
            typeof emp.hrms_id === 'number'
        );

        console.log(`Found ${validEmployees.length} valid employees for Al Maraghi Auto Repairs`);

        // H1 (Jan-Jun) and H2 (Jul-Dec)
        const halves = [
            { half: 1, year: 2026 },
            { half: 2, year: 2026 }
        ];

        const recordsToCreate = [];

        for (const employee of validEmployees) {
            for (const h of halves) {
                recordsToCreate.push({
                    employee_id: String(employee.hrms_id),
                    company: 'Al Maraghi Auto Repairs',
                    year: h.year,
                    half: h.half,
                    total_minutes: 120,
                    used_minutes: 0,
                    remaining_minutes: 120
                });
            }
        }

        console.log(`Creating ${recordsToCreate.length} half-yearly minute records (H1+H2 2026)...`);

        const created = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.bulkCreate(recordsToCreate);

        return Response.json({
            success: true,
            employees_count: validEmployees.length,
            records_created: recordsToCreate.length,
            employee_list: validEmployees.map(e => ({
                hrms_id: e.hrms_id,
                name: e.name,
                department: e.department
            })).sort((a, b) => a.hrms_id - b.hrms_id)
        });

    } catch (error) {
        console.error('Error creating 2026 half-yearly minutes:', error);
        return Response.json({
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});