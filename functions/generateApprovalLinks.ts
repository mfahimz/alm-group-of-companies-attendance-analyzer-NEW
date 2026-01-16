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

        // Get all exceptions for this report
        const exceptions = await base44.asServiceRole.entities.Exception.filter({
            report_run_id
        });
        
        // Filter for pending exceptions (both old 'pending' and new 'pending_dept_head')
        const pendingExceptions = exceptions.filter(e => 
            e.approval_status === 'pending_dept_head' || e.approval_status === 'pending'
        );

        // ALWAYS generate links, even if there are no pending exceptions
        // This allows department heads to verify and confirm that everything is correct

        // Get all employees to map attendance_id to departments
        const employees = await base44.asServiceRole.entities.Employee.filter({ company });

        // Get project details for date range
        const project = await base44.asServiceRole.entities.Project.get(project_id);

        // Pre-fetch all data needed for daily breakdown (to be cached in ApprovalLink)
        const analysisResults = await base44.asServiceRole.entities.AnalysisResult.filter({
            project_id
        });
        const punches = await base44.asServiceRole.entities.Punch.filter({
            project_id
        });
        const shiftTimings = await base44.asServiceRole.entities.ShiftTiming.filter({
            project_id
        });
        const allExceptions = await base44.asServiceRole.entities.Exception.filter({
            project_id
        });

        // Group employees by department (not exceptions)
        const employeesByDept = {};
        for (const employee of employees) {
            if (employee.department && employee.department.trim() !== '') {
                if (!employeesByDept[employee.department]) {
                    employeesByDept[employee.department] = [];
                }
                employeesByDept[employee.department].push(employee);
            }
        }

        // Also track pending exceptions by department for reference
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

        // Generate links for ALL departments with department heads, regardless of pending exceptions
        const allDepartments = new Set([...Object.keys(employeesByDept), ...Object.keys(exceptionsByDept)]);

        for (const department of allDepartments) {
            const deptHeadsForDept = deptHeads.filter(dh => dh.department === department);
            
            if (deptHeadsForDept.length === 0) {
                const exceptionCount = exceptionsByDept[department]?.length || 0;
                if (exceptionCount > 0) {
                    warnings.push(`No department head assigned for ${department} department (${exceptionCount} exceptions skipped)`);
                }
                continue;
            }

            // Generate links for each department head
            for (const deptHead of deptHeadsForDept) {
                if (processedDeptHeads.has(deptHead.id)) continue;
                processedDeptHeads.add(deptHead.id);

                // Count relevant exceptions (if any)
                const departmentExceptions = exceptionsByDept[department] || [];
                let relevantExceptionCount = departmentExceptions.length;
                
                if (deptHead.managed_employee_ids && departmentExceptions.length > 0) {
                    const managedIds = deptHead.managed_employee_ids.split(',').filter(Boolean);
                    relevantExceptionCount = departmentExceptions.filter(exc => {
                        const employee = employees.find(e => e.attendance_id === exc.attendance_id);
                        return employee && managedIds.includes(employee.id);
                    }).length;
                }

                // Generate link even if there are no pending exceptions
                // This allows verification that everything is correct

            // Generate unique token
            const token = crypto.randomUUID();
            
            // Generate 6-digit verification code
            const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

            // Pre-calculate daily breakdown data for this department
            const departmentEmployees = employeesByDept[department] || [];
            const dailyBreakdownData = {};

            for (const employee of departmentEmployees) {
                const employeeAnalysis = analysisResults.find(a => a.attendance_id === employee.attendance_id);
                const employeePunches = punches.filter(p => p.attendance_id === employee.attendance_id);
                const employeeShifts = shiftTimings.filter(s => s.attendance_id === employee.attendance_id);
                const employeeExceptions = allExceptions.filter(e => e.attendance_id === employee.attendance_id && e.use_in_analysis);

                dailyBreakdownData[employee.attendance_id] = {
                    employee_name: employee.name,
                    employee_id: employee.id,
                    analysis_summary: employeeAnalysis ? {
                        late_minutes: employeeAnalysis.late_minutes,
                        early_checkout_minutes: employeeAnalysis.early_checkout_minutes,
                        other_minutes: employeeAnalysis.other_minutes,
                        grace_minutes: employeeAnalysis.grace_minutes,
                        approved_minutes: employeeAnalysis.approved_minutes,
                        absent_days: employeeAnalysis.full_absence_count,
                        half_absent_days: employeeAnalysis.half_absence_count,
                        present_days: employeeAnalysis.present_days,
                        notes: employeeAnalysis.notes,
                        abnormal_dates: employeeAnalysis.abnormal_dates
                    } : null,
                    punches_count: employeePunches.length,
                    shifts_count: employeeShifts.length,
                    exceptions_count: employeeExceptions.length
                };
            }

            // Create approval link record with pre-calculated data
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
                approved: false,
                daily_breakdown_json: JSON.stringify(dailyBreakdownData)
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
                    exception_count: relevantExceptionCount,
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