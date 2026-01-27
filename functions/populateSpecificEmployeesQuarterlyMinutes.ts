import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Safely populate quarterly minutes for specific employees
 * Checks for existing records and only creates missing ones
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

        // Fetch employees to validate
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company,
            hrms_id: hrms_ids
        });

        if (employees.length === 0) {
            return Response.json({ error: 'No employees found with provided HRMS IDs' }, { status: 404 });
        }

        const results = {
            created: [],
            skipped: [],
            errors: []
        };

        // Process each employee
        for (const employee of employees) {
            const hrms_id = employee.hrms_id;
            
            // Process all 4 quarters
            for (let quarter = 1; quarter <= 4; quarter++) {
                try {
                    // Check if record already exists
                    const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                        employee_id: hrms_id,
                        company,
                        year,
                        quarter
                    });

                    if (existing.length > 0) {
                        results.skipped.push({
                            hrms_id,
                            quarter,
                            reason: 'Record already exists'
                        });
                        continue;
                    }

                    // Get the limit from employee record
                    const quarterlyLimit = employee.approved_other_minutes_limit || 120;

                    // Create new record
                    await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                        employee_id: hrms_id,
                        company,
                        year,
                        quarter,
                        total_minutes: quarterlyLimit,
                        used_minutes: 0,
                        remaining_minutes: quarterlyLimit
                    });

                    results.created.push({
                        hrms_id,
                        quarter,
                        total_minutes: quarterlyLimit
                    });

                } catch (error) {
                    results.errors.push({
                        hrms_id,
                        quarter,
                        error: error.message
                    });
                }
            }
        }

        return Response.json({
            success: true,
            summary: {
                total_employees: employees.length,
                records_created: results.created.length,
                records_skipped: results.skipped.length,
                errors: results.errors.length
            },
            details: results
        });

    } catch (error) {
        console.error('Population error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});