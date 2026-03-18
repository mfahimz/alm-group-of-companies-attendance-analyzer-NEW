import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Syncs employee data (attendance_id, name, company) to EmployeeSalary records
 * Called when employee data changes
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { employee_id, hrms_id, attendance_id, name, company } = await req.json();

        if (!employee_id && !hrms_id) {
            return Response.json({ error: 'employee_id or hrms_id is required' }, { status: 400 });
        }

        // Find salary records for this employee using either HRMS ID or employee record ID
        const salaryRecords = await base44.asServiceRole.entities.EmployeeSalary.filter({
            company: company
        });

        // Filter to match employee by HRMS ID
        const matchingSalaries = salaryRecords.filter(s => 
            String(s.employee_id) === String(hrms_id || employee_id)
        );

        if (matchingSalaries.length === 0) {
            return Response.json({
                success: true,
                message: 'No salary records found for this employee',
                updated_count: 0
            });
        }

        // Update all matching salary records
        const updates = [];
        for (const salary of matchingSalaries) {
            const updateData = {};
            
            if (attendance_id !== undefined && String(salary.attendance_id) !== String(attendance_id)) {
                updateData.attendance_id = String(attendance_id);
            }
            if (name !== undefined && salary.name !== name) {
                updateData.name = name;
            }
            if (company !== undefined && salary.company !== company) {
                updateData.company = company;
            }

            if (Object.keys(updateData).length > 0) {
                await base44.asServiceRole.entities.EmployeeSalary.update(salary.id, updateData);
                updates.push({
                    salary_record_id: salary.id,
                    old_attendance_id: salary.attendance_id,
                    new_attendance_id: updateData.attendance_id,
                    updated_fields: Object.keys(updateData)
                });
            }
        }

        return Response.json({
            success: true,
            updated_count: updates.length,
            updates
        });

    } catch (error) {
        console.error('Sync error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});