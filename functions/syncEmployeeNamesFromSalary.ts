import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Admin only
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const company = 'Al Maraghi Auto Repairs';

        // Fetch all salary records for this company
        const salaryRecords = await base44.asServiceRole.entities.EmployeeSalary.filter({ 
            company 
        });

        if (salaryRecords.length === 0) {
            return Response.json({
                success: true,
                message: 'No salary records found for this company',
                updated_count: 0,
                records: []
            });
        }

        // Fetch all employees for this company
        const employees = await base44.asServiceRole.entities.Employee.filter({ 
            company 
        });

        const updates = [];
        const mismatches = [];

        // Process each salary record
        for (const salaryRecord of salaryRecords) {
            if (!salaryRecord.attendance_id) {
                mismatches.push({
                    salary_id: salaryRecord.id,
                    reason: 'No attendance_id in salary record'
                });
                continue;
            }

            // Find matching employee by attendance_id
            const employee = employees.find(e => e.attendance_id === salaryRecord.attendance_id);

            if (!employee) {
                mismatches.push({
                    attendance_id: salaryRecord.attendance_id,
                    salary_name: salaryRecord.employee_name,
                    reason: 'Employee not found in master table'
                });
                continue;
            }

            // Check if names match
            if (employee.name !== salaryRecord.employee_name) {
                // Update employee name
                await base44.asServiceRole.entities.Employee.update(employee.id, {
                    name: salaryRecord.employee_name
                });

                updates.push({
                    employee_id: employee.id,
                    attendance_id: employee.attendance_id,
                    old_name: employee.name,
                    new_name: salaryRecord.employee_name
                });
            }
        }

        return Response.json({
            success: true,
            message: `Sync completed for ${company}`,
            updated_count: updates.length,
            updated_records: updates,
            mismatches_count: mismatches.length,
            mismatches: mismatches,
            total_salary_records: salaryRecords.length,
            total_employees: employees.length
        });

    } catch (error) {
        console.error('Sync employee names error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});