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

        const userRole = user.extended_role || user.role || 'user';

        // Admin and CEO bypass: Return successful verification with all active employees for the company as the managed list
        if (userRole === 'admin' || userRole === 'ceo') {
            const allEmployees = await base44.asServiceRole.entities.Employee.filter({
                company: user.company,
                active: true
            });
            
            return Response.json({
                verified: true,
                assignment: {
                    company: user.company,
                    department: 'All Departments',
                    employee_id: 'SYSTEM_ADMIN',
                    managed_employee_ids: allEmployees.map(e => String(e.id)).join(',')
                }
            });
        }

        // Check if user has department_head, assistant_gm, ceo, or hr_manager role
        if (userRole !== 'department_head' && userRole !== 'assistant_gm' && userRole !== 'ceo' && userRole !== 'hr_manager') {
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

        // Find the employee record using hrms_id (keep as string to match database)
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
        let assignments = await base44.asServiceRole.entities.DepartmentHead.filter({
            employee_id: employee.id,
            active: true
        });

        // Fallback: also try searching by HRMS ID if no results found (for older records)
        if (assignments.length === 0) {
            assignments = await base44.asServiceRole.entities.DepartmentHead.filter({
                employee_id: user.hrms_id,
                active: true
            });
        }

        if (assignments.length === 0) {
            return Response.json({ 
                error: 'No active department head assignment found for this employee.',
                verified: false
            }, { status: 403 });
        }

        const assignment = assignments[0];

        // Verify user's company and department match assignment (auto-sync if needed)
        if (user.company !== assignment.company || user.department !== assignment.department) {
            // Auto-sync company and department from DepartmentHead assignment
            try {
                await base44.auth.updateMe({
                    company: assignment.company,
                    department: assignment.department
                });
                console.log('Auto-synced user company and department from DepartmentHead assignment');
            } catch (syncError) {
                console.error('Failed to auto-sync company/department:', syncError);
                return Response.json({ 
                    error: 'Could not sync department assignment. Please contact admin.',
                    verified: false 
                }, { status: 403 });
            }
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