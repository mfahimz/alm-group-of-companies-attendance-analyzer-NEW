import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Initialize Quarterly Minutes for All Employees in a Company
 * 
 * Creates quarterly minutes records for all active employees in a company
 * for a specific year and quarter.
 * 
 * Usage: Call this at the start of each calendar quarter to initialize records.
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

        const { company, year, quarter } = await req.json();

        if (!company || !year || !quarter) {
            return Response.json({
                error: 'Missing required fields: company, year, quarter'
            }, { status: 400 });
        }

        if (quarter < 1 || quarter > 4) {
            return Response.json({
                error: 'Quarter must be between 1 and 4'
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

        // Check for existing records
        const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            company: company,
            year: year,
            quarter: quarter
        });

        const existingEmployeeIds = new Set(existing.map(e => String(e.employee_id)));

        // Create records for employees that don't have them yet
        const recordsToCreate = [];
        for (const emp of employees) {
            if (!existingEmployeeIds.has(String(emp.hrms_id))) {
                recordsToCreate.push({
                    employee_id: String(emp.hrms_id),
                    company: company,
                    year: year,
                    quarter: quarter,
                    total_minutes: emp.approved_other_minutes_limit || 120,
                    used_minutes: 0,
                    remaining_minutes: emp.approved_other_minutes_limit || 120
                });
            }
        }

        let created = [];
        if (recordsToCreate.length > 0) {
            created = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.bulkCreate(recordsToCreate);
        }

        return Response.json({
            success: true,
            message: `Initialized Q${quarter} ${year} for ${company}`,
            employees_total: employees.length,
            records_created: created.length,
            records_already_existed: existing.length,
            quarter_period: getQuarterPeriod(quarter, year)
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});

function getQuarterPeriod(quarter, year) {
    const periods = {
        1: `Jan 1 - Mar 31, ${year}`,
        2: `Apr 1 - Jun 30, ${year}`,
        3: `Jul 1 - Sep 30, ${year}`,
        4: `Oct 1 - Dec 31, ${year}`
    };
    return periods[quarter];
}