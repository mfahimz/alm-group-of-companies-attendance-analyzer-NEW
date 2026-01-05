import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id } = await req.json();

        if (!project_id) {
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }

        // Get project details
        const projects = await base44.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // Get link validity from settings (default 7 days)
        const settingsResult = await base44.entities.SystemSettings.filter({ 
            setting_key: 'shift_verification_link_validity_days' 
        });
        const validityDays = settingsResult.length > 0 ? 
            parseInt(settingsResult[0].setting_value) : 7;

        // Get all employees for this company
        const employees = await base44.entities.Employee.filter({ company: project.company });

        // Get all shifts for this project
        const shifts = await base44.entities.ShiftTiming.filter({ project_id });

        // Get unique departments from shifts by mapping to employees
        const departmentSet = new Set();
        for (const shift of shifts) {
            const employee = employees.find(e => e.attendance_id === shift.attendance_id);
            if (employee?.department) {
                departmentSet.add(employee.department);
            }
        }

        const departments = Array.from(departmentSet);

        // If no departments found, use project department or 'All'
        if (departments.length === 0) {
            departments.push(project.department || 'All');
        }

        // Get department heads for this company
        const deptHeads = await base44.entities.DepartmentHead.filter({
            company: project.company,
            active: true
        });

        const links = [];
        // Get the app's custom domain from environment or use default
        const appUrl = Deno.env.get('APP_URL') || `https://${Deno.env.get('BASE44_APP_ID')}.base44.app`;

        for (const department of departments) {
            // Find department head for this department
            const deptHead = deptHeads.find(dh => dh.department === department);

            // Generate unique token and verification code
            const token = crypto.randomUUID();
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            // Calculate expiry date
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + validityDays);

            // Create verification link record
            const linkRecord = await base44.asServiceRole.entities.ShiftVerificationLink.create({
                project_id,
                company: project.company,
                department,
                department_head_id: deptHead?.employee_id || null,
                link_token: token,
                verification_code: verificationCode,
                expires_at: expiresAt.toISOString()
            });

            links.push({
                department,
                department_head_id: deptHead?.employee_id || null,
                link: `${appUrl}/ShiftVerification?token=${token}`,
                verification_code: verificationCode,
                expires_at: expiresAt.toISOString()
            });
        }

        return Response.json({ 
            success: true, 
            links,
            message: `Generated ${links.length} verification link(s)`
        });

    } catch (error) {
        console.error('Error generating shift verification links:', error);
        return Response.json({ 
            error: error.message,
            success: false 
        }, { status: 500 });
    }
});