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

        // Get link validity duration from settings (default: 3 days)
        const settingsList = await base44.asServiceRole.entities.SystemSettings.filter({ 
            setting_key: 'approval_link_validity_days' 
        });
        const validityDays = settingsList.length > 0 ? parseInt(settingsList[0].setting_value) : 3;

        // Get all exceptions for this report that need approval
        const exceptions = await base44.asServiceRole.entities.Exception.filter({
            report_run_id,
            approval_status: 'pending_dept_head'
        });

        if (exceptions.length === 0) {
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
        for (const exception of exceptions) {
            const employee = employees.find(e => e.attendance_id === exception.attendance_id);
            if (employee && employee.department) {
                if (!exceptionsByDept[employee.department]) {
                    exceptionsByDept[employee.department] = [];
                }
                exceptionsByDept[employee.department].push(exception);
            }
        }

        // Get department heads
        const deptHeads = await base44.asServiceRole.entities.DepartmentHead.filter({
            company,
            active: true
        });

        // Generate links for each department with exceptions
        const links = [];
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + validityDays);

        for (const department of Object.keys(exceptionsByDept)) {
            const deptHead = deptHeads.find(dh => dh.department === department);
            
            if (!deptHead) {
                // No department head assigned, skip this department
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

            links.push({
                department,
                department_head_name: deptHeadEmployee?.name || 'Unknown',
                link_token: token,
                verification_code: verificationCode,
                exception_count: exceptionsByDept[department].length,
                expires_at: expiresAt.toISOString()
            });
        }

        return Response.json({
            success: true,
            message: `Generated ${links.length} approval links`,
            links,
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