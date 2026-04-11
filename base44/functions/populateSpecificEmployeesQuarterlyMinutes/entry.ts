import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Safely populate half-yearly minutes for specific employees.
 * Checks for existing records and only creates missing ones.
 * Creates 2 records per employee per year: H1 (Jan-Jun) and H2 (Jul-Dec).
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { hrms_ids, year, company } = await req.json();

        if (!hrms_ids || !Array.isArray(hrms_ids) || hrms_ids.length === 0) {
            return Response.json({ error: 'hrms_ids array is required' }, { status: 400 });
        }

        if (!year || !company) {
            return Response.json({ error: 'year and company are required' }, { status: 400 });
        }

        const numericIds = hrms_ids.map(id => Number(id));
        const employees = await base44.asServiceRole.entities.Employee.filter({ company });

        const targetEmployees = employees.filter(emp =>
            numericIds.includes(Number(emp.hrms_id))
        );

        if (targetEmployees.length === 0) {
            return Response.json({ error: 'No employees found with provided HRMS IDs' }, { status: 404 });
        }

        const results = { created: [], skipped: [], errors: [] };

        // H1 = Jan-Jun (half 1), H2 = Jul-Dec (half 2)
        const halves = [1, 2];

        for (const employee of targetEmployees) {
            const hrms_id = employee.hrms_id;

            for (const half of halves) {
                try {
                    const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                        employee_id: String(hrms_id),
                        company,
                        year,
                        half
                    });

                    if (existing.length > 0) {
                        results.skipped.push({ hrms_id, half, reason: 'Record already exists' });
                        continue;
                    }

                    const halfYearlyLimit = employee.approved_other_minutes_limit || 120;

                    await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                        employee_id: String(hrms_id),
                        company,
                        year,
                        half,
                        total_minutes: halfYearlyLimit,
                        used_minutes: 0,
                        remaining_minutes: halfYearlyLimit
                    });

                    results.created.push({ hrms_id, half, total_minutes: halfYearlyLimit });

                } catch (error) {
                    results.errors.push({ hrms_id, half, error: error.message });
                }
            }
        }

        return Response.json({
            success: true,
            summary: {
                total_employees: targetEmployees.length,
                records_created: results.created.length,
                records_skipped: results.skipped.length,
                errors: results.errors.length
            },
            details: results
        });

    } catch (error) {
        console.error('Population error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});