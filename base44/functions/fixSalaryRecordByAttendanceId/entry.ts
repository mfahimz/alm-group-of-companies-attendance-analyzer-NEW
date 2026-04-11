import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Fixes a salary record by finding it via attendance_id and updating it with correct employee data
 * Used when salary record has wrong employee_id but correct attendance_id
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { old_attendance_id, correct_hrms_id } = await req.json();

        if (!old_attendance_id || !correct_hrms_id) {
            return Response.json({ 
                error: 'old_attendance_id and correct_hrms_id are required' 
            }, { status: 400 });
        }

        // Find employee by HRMS ID
        const employees = await base44.asServiceRole.entities.Employee.filter({
            hrms_id: String(correct_hrms_id)
        });

        if (employees.length === 0) {
            return Response.json({ 
                error: `Employee with HRMS ID ${correct_hrms_id} not found` 
            }, { status: 404 });
        }

        const employee = employees[0];

        // Find salary record by old attendance_id
        const salaryRecords = await base44.asServiceRole.entities.EmployeeSalary.filter({
            attendance_id: String(old_attendance_id)
        });

        if (salaryRecords.length === 0) {
            return Response.json({ 
                error: `No salary record found with attendance_id ${old_attendance_id}` 
            }, { status: 404 });
        }

        const salaryRecord = salaryRecords[0];

        // Update with correct employee data
        await base44.asServiceRole.entities.EmployeeSalary.update(salaryRecord.id, {
            employee_id: String(employee.hrms_id),
            attendance_id: String(employee.attendance_id),
            name: employee.name,
            company: employee.company
        });

        return Response.json({
            success: true,
            message: 'Salary record fixed successfully',
            old_data: {
                employee_id: salaryRecord.employee_id,
                attendance_id: salaryRecord.attendance_id,
                name: salaryRecord.name
            },
            new_data: {
                employee_id: employee.hrms_id,
                attendance_id: employee.attendance_id,
                name: employee.name,
                company: employee.company
            }
        });

    } catch (error) {
        console.error('Fix error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});