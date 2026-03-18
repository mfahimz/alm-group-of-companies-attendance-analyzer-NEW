import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Syncs all active employee data (attendance_id, name, company) to EmployeeSalary records in bulk.
 * This is more efficient than syncing one by one from the frontend.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRole = user.extended_role || user.role || 'user';
        if (userRole !== 'admin' && userRole !== 'supervisor') {
            return Response.json({ error: 'Forbidden: Admin or Supervisor access required' }, { status: 403 });
        }

        // Get all active employees (master data)
        const employees = await base44.asServiceRole.entities.Employee.filter({ active: true });
        
        // Get all active salary records
        const salaries = await base44.asServiceRole.entities.EmployeeSalary.filter({ active: true });

        const results = {
            updated_count: 0,
            skipped_count: 0,
            error_count: 0,
            errors: []
        };

        // Create a map of employees by HRMS ID for fast lookup
        const employeeMap = new Map();
        employees.forEach(emp => {
            const hrmsId = String(emp.hrms_id || '');
            if (hrmsId) {
                employeeMap.set(hrmsId, emp);
            }
        });

        // Loop through salary records and update if master data has changed
        for (const salary of salaries) {
            try {
                const hrmsId = String(salary.employee_id || '');
                const employee = employeeMap.get(hrmsId);
                
                if (!employee) {
                    results.skipped_count++;
                    continue;
                }

                const updateData: any = {};
                
                // Compare attendance_id
                if (employee.attendance_id !== undefined && String(salary.attendance_id) !== String(employee.attendance_id)) {
                    updateData.attendance_id = String(employee.attendance_id);
                }
                
                // Compare name
                if (employee.name !== undefined && salary.name !== employee.name) {
                    updateData.name = employee.name;
                }
                
                // Compare company
                if (employee.company !== undefined && salary.company !== employee.company) {
                    updateData.company = employee.company;
                }

                if (Object.keys(updateData).length > 0) {
                    await base44.asServiceRole.entities.EmployeeSalary.update(salary.id, updateData);
                    results.updated_count++;
                } else {
                    results.skipped_count++;
                }
            } catch (err: any) {
                results.error_count++;
                results.errors.push({ 
                    salary_id: salary.id, 
                    name: salary.name, 
                    error: err.message 
                });
            }
        }

        return Response.json({
            success: true,
            message: `Sync completed: ${results.updated_count} updated, ${results.skipped_count} skipped, ${results.error_count} errors`,
            updated_count: results.updated_count,
            skipped_count: results.skipped_count,
            error_count: results.error_count,
            errors: results.errors
        });

    } catch (error: any) {
        console.error('Bulk sync error:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});
