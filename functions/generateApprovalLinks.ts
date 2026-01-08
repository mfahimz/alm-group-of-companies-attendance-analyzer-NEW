import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { report_run_id, project_id, company } = await req.json();

        if (!report_run_id || !project_id || !company) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Set link validity to 1 day (24 hours)
        const validityDays = 1;

        // Get all exceptions for this report that need approval
        const exceptions = await base44.asServiceRole.entities.Exception.filter({
            report_run_id
        });
        
        // Filter for pending exceptions (both old 'pending' and new 'pending_dept_head')
        const pendingExceptions = exceptions.filter(e => 
            e.approval_status === 'pending_dept_head' || e.approval_status === 'pending'
        );

        if (pendingExceptions.length === 0) {
            return Response.json({ 
                success: true,
                message: 'No exceptions require approval',
                links: []
            });
        }

        // Get all employees to map attendance_id to departments
        const employees = await base44.asServiceRole.entities.Employee.filter({ company });

        // Group exceptions by department
        const exceptionsByDept = {};
        const skippedExceptions = [];
        
        for (const exception of pendingExceptions) {
            const employee = employees.find(e => e.attendance_id === exception.attendance_id);
            if (!employee) {
                skippedExceptions.push({ 
                    exception_id: exception.id, 
                    reason: 'Employee not found', 
                    attendance_id: exception.attendance_id 
                });
                continue;
            }
            if (!employee.department || employee.department.trim() === '') {
                skippedExceptions.push({ 
                    exception_id: exception.id, 
                    reason: 'No department assigned', 
                    employee_name: employee.name,
                    attendance_id: employee.attendance_id
                });
                continue;
            }
            
            if (!exceptionsByDept[employee.department]) {
                exceptionsByDept[employee.department] = [];
            }
            exceptionsByDept[employee.department].push(exception);
        }

        // Get department heads
        const deptHeads = await base44.asServiceRole.entities.DepartmentHead.filter({
            company,
            active: true
        });

        // Generate links for each department head (multiple heads per department possible)
        const links = [];
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + validityDays);
        const processedDeptHeads = new Set();
        const warnings = [];

        for (const department of Object.keys(exceptionsByDept)) {
            const deptHeadsForDept = deptHeads.filter(dh => dh.department === department);
            
            if (deptHeadsForDept.length === 0) {
                warnings.push(`No department head assigned for ${department} department (${exceptionsByDept[department].length} exceptions skipped)`);
                continue;
            }

            // Generate links for each department head
            for (const deptHead of deptHeadsForDept) {
                if (processedDeptHeads.has(deptHead.id)) continue;
                processedDeptHeads.add(deptHead.id);

                // Filter exceptions to only those for managed employees
                let relevantExceptions = exceptionsByDept[department];
                if (deptHead.managed_employee_ids) {
                    const managedIds = deptHead.managed_employee_ids.split(',').filter(Boolean);
                    relevantExceptions = exceptionsByDept[department].filter(exc => {
                        const employee = employees.find(e => e.attendance_id === exc.attendance_id);
                        return employee && managedIds.includes(employee.id);
                    });
                }

                if (relevantExceptions.length === 0) {
                    warnings.push(`Department head for ${department} has no managed employees matching the exceptions`);
                    continue;
                }

            // Generate unique token
            const token = crypto.randomUUID();
            
            // Generate 6-digit verification code
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            // Create approval link record
            const linkRecord = await base44.asServiceRole.entities.ApprovalLink.create({
                report_run_id,
                project_id,
                company,
                department,
                department_head_id: deptHead.employee_id,
                link_token: token,
                verification_code: verificationCode,
                expires_at: expiresAt.toISOString(),
                used: false,
                approved: false
            });

            // Get department head employee details
            const deptHeadEmployee = employees.find(e => e.id === deptHead.employee_id);

                // Get app URL from custom domain
                let appUrl = Deno.env.get('CUSTOM_DOMAIN');
                if (!appUrl) {
                    const appId = Deno.env.get('BASE44_APP_ID');
                    appUrl = appId ? `https://${appId}.base44.app` : 'https://app.base44.com';
                } else {
                    // Ensure CUSTOM_DOMAIN has proper protocol
                    if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
                        appUrl = `https://${appUrl}`;
                    }
                    // Remove trailing slash if present
                    appUrl = appUrl.replace(/\/$/, '');
                }

                links.push({
                    department,
                    department_head_name: deptHeadEmployee?.name || 'Unknown',
                    link_token: token,
                    verification_code: verificationCode,
                    exception_count: relevantExceptions.length,
                    expires_at: expiresAt.toISOString(),
                    full_link: `${appUrl}/DeptHeadApproval?token=${token}`
                });
            }
        }

        return Response.json({
            success: true,
            message: links.length > 0 
                ? `Generated ${links.length} approval link${links.length !== 1 ? 's' : ''}` 
                : 'No approval links generated',
            links,
            warnings,
            skipped_exceptions: skippedExceptions,
            validity_days: validityDays
        });

    } catch (error) {
        console.error('Generate approval links error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});