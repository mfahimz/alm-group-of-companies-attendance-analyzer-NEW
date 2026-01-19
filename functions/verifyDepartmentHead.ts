import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Verifies that the authenticated user is an authorized department head
 * Returns the department head assignment if valid, otherwise throws error
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get authenticated user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user has department_head role
        const userRole = user.extended_role || user.role || 'user';
        if (userRole !== 'department_head') {
            return Response.json({ 
                error: 'Access denied: Not a department head',
                verified: false 
            }, { status: 403 });
        }

        // Check if user has hrms_id set
        if (!user.hrms_id) {
            return Response.json({ 
                error: 'User record missing HRMS ID. Admin must link this user to an employee.',
                verified: false 
            }, { status: 403 });
        }

        // Find the employee record using hrms_id
        const employees = await base44.asServiceRole.entities.Employee.filter({
            hrms_id: user.hrms_id,
            active: true
        });

        if (employees.length === 0) {
            return Response.json({ 
                error: 'No active employee record found with this HRMS ID.',
                verified: false 
            }, { status: 403 });
        }

        const employee = employees[0];

        // Find department head assignment using the Employee's ID
        const assignments = await base44.asServiceRole.entities.DepartmentHead.filter({
            employee_id: employee.id,
            active: true
        });

        if (assignments.length === 0) {
            return Response.json({ 
                error: 'No active department head assignment found for this employee. Admin must create a department head assignment.',
                verified: false 
            }, { status: 403 });
        }

        const assignment = assignments[0];

        // Verify user's company and department match assignment
        if (!user.company || !user.department || user.company !== assignment.company || user.department !== assignment.department) {
            return Response.json({ 
                error: 'User assignment mismatch with department head record. Admin must assign company and department.',
                verified: false 
            }, { status: 403 });
        }

        // Verify that managed_employee_ids is set
        if (!assignment.managed_employee_ids) {
            return Response.json({ 
                error: 'Department head assignment missing managed employees. Admin must assign subordinates.',
                verified: false 
            }, { status: 403 });
        }

        return Response.json({
            verified: true,
            assignment: {
                company: assignment.company,
                department: assignment.department,
                employee_id: assignment.employee_id,
                managed_employee_ids: assignment.managed_employee_ids
            }
        });

    } catch (error) {
        console.error('Verify department head error:', error);
        return Response.json({ 
            error: error.message,
            verified: false 
        }, { status: 500 });
    }
});