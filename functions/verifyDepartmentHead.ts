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

        // Find department head assignment
        const assignments = await base44.asServiceRole.entities.DepartmentHead.filter({
            employee_id: user.hrms_id,
            active: true
        });

        if (assignments.length === 0) {
            return Response.json({ 
                error: 'No active department head assignment found for this employee',
                verified: false 
            }, { status: 403 });
        }

        const assignment = assignments[0];

        // Verify user's company and department match assignment
        if (user.company !== assignment.company || user.department !== assignment.department) {
            return Response.json({ 
                error: 'User assignment mismatch with department head record',
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