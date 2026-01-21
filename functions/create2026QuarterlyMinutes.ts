import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Fetch all active Al Maraghi employees with valid HRMS IDs
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: 'Al Maraghi Auto Repairs',
            active: true
        });

        // Filter out employees with NULL or invalid HRMS IDs
        const validEmployees = employees.filter(emp => 
            emp.hrms_id && 
            emp.hrms_id !== 'NULL' && 
            emp.hrms_id !== null && 
            typeof emp.hrms_id === 'number'
        );

        console.log(`Found ${validEmployees.length} valid employees for Al Maraghi Auto Repairs`);

        // Create Q1-Q4 2026 records for each employee
        const quarters = [
            { quarter: 1, year: 2026 },
            { quarter: 2, year: 2026 },
            { quarter: 3, year: 2026 },
            { quarter: 4, year: 2026 }
        ];

        const recordsToCreate = [];
        
        for (const employee of validEmployees) {
            for (const q of quarters) {
                recordsToCreate.push({
                    employee_id: String(employee.hrms_id),
                    company: 'Al Maraghi Auto Repairs',
                    year: q.year,
                    quarter: q.quarter,
                    allocation_type: 'calendar_quarter',
                    total_minutes: 120,
                    used_minutes: 0,
                    remaining_minutes: 120
                });
            }
        }

        console.log(`Creating ${recordsToCreate.length} quarterly minute records...`);

        // Bulk create all records
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
        console.error('Error creating 2026 quarterly minutes:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});