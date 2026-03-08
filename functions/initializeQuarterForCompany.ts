import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Initialize Half-Yearly Minutes for All Employees in a Company
 *
 * NOTE: This function has been migrated from quarterly logic to half-yearly logic.
 * It now creates/initializes EmployeeQuarterlyMinutes records by half:
 * - half 1 => January through June
 * - half 2 => July through December
 *
 * Usage: Call this at the start of each half-year cycle to initialize records.
 *
 * Admin only function.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Admin only
        if (user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { company, year, half } = await req.json();

        if (!company || !year || !half) {
            return Response.json({
                error: 'Missing required fields: company, year, half'
            }, { status: 400 });
        }

        if (half < 1 || half > 2) {
            return Response.json({
                error: 'Half must be between 1 and 2'
            }, { status: 400 });
        }

        // Get all active employees for this company
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: company,
            active: true
        });

        if (employees.length === 0) {
            return Response.json({
                success: false,
                message: `No active employees found for company: ${company}`
            });
        }

        // Check for existing half-year records
        const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            company: company,
            year: year,
            half: half
        });

        const existingEmployeeIds = new Set(existing.map(e => String(e.employee_id)));

        // Create records for employees that don't have them yet.
        // 120 total minutes remains the default limit per half-year period.
        const recordsToCreate = [];
        for (const emp of employees) {
            if (!existingEmployeeIds.has(String(emp.hrms_id))) {
                const totalMinutes = emp.approved_other_minutes_limit || 120;
                recordsToCreate.push({
                    employee_id: String(emp.hrms_id),
                    company: company,
                    year: year,
                    half: half,
                    total_minutes: totalMinutes,
                    used_minutes: 0,
                    remaining_minutes: totalMinutes
                });
            }
        }

        let created = [];
        if (recordsToCreate.length > 0) {
            created = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.bulkCreate(recordsToCreate);
        }

        return Response.json({
            success: true,
            message: `Initialized H${half} ${year} for ${company}`,
            employees_total: employees.length,
            records_created: created.length,
            records_already_existed: existing.length,
            half_period: getHalfPeriod(half, year)
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});

function getHalfPeriod(half, year) {
    const periods = {
        1: `H1 Jan 1 - Jun 30, ${year}`,
        2: `H2 Jul 1 - Dec 31, ${year}`
    };
    return periods[half];
}
