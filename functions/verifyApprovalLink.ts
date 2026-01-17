import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { token, verification_code } = await req.json();

        if (!token) {
            return Response.json({ error: 'Token is required' }, { status: 400 });
        }

        // Get approval link
        const links = await base44.asServiceRole.entities.ApprovalLink.filter({ link_token: token });
        
        if (links.length === 0) {
            return Response.json({ error: 'LINK_NOT_FOUND' }, { status: 404 });
        }

        const link = links[0];

        // Check if expired
        const expiresAt = new Date(link.expires_at);
        if (new Date() > expiresAt) {
            return Response.json({ error: 'LINK_EXPIRED' }, { status: 400 });
        }

        // Allow re-verification even if link is used (read-only access)
        // Only block if verification code is being checked for the first time
        // (verification_code will be provided on actual verification attempts)

        // If verification code provided, verify it
        if (verification_code) {
            // Convert both to strings and trim for comparison
            const providedCode = String(verification_code).trim();
            const storedCode = String(link.verification_code).trim();
            
            if (providedCode !== storedCode) {
                return Response.json({ 
                    valid: false,
                    message: `Invalid verification code. Provided: ${providedCode}, Expected: ${storedCode}` 
                }, { status: 200 });
            }

            // Get department head info
            const deptHeads = await base44.asServiceRole.entities.DepartmentHead.filter({
                employee_id: link.department_head_id,
                active: true
            });
            const deptHead = deptHeads.find(dh => dh.company === link.company);

            // Get exceptions
            const allExceptions = await base44.asServiceRole.entities.Exception.filter({
                report_run_id: link.report_run_id,
                approval_status: 'pending_dept_head'
            });

            // Get employees
            const employees = await base44.asServiceRole.entities.Employee.filter({ 
                company: link.company 
            });

            // Filter exceptions by department
            let relevantExceptions = allExceptions.filter(exc => {
                const employee = employees.find(e => 
                    Number(e.attendance_id) === Number(exc.attendance_id) && 
                    e.company === link.company
                );
                return employee?.department === link.department;
            });

            // Further filter by managed employees if specified
            if (deptHead?.managed_employee_ids) {
                const managedIds = deptHead.managed_employee_ids.split(',').filter(Boolean);
                relevantExceptions = relevantExceptions.filter(exc => {
                    const employee = employees.find(e => Number(e.attendance_id) === Number(exc.attendance_id));
                    return employee && managedIds.includes(employee.id);
                });
            }

            return Response.json({
                valid: true,
                success: true,
                link_data: link,
                dept_head: deptHead,
                exceptions: relevantExceptions,
                employees: employees
            });
        }

        // Just return link data without verification
        return Response.json({
            valid: true,
            success: true,
            link_data: link
        });

    } catch (error) {
        console.error('Verify approval link error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});