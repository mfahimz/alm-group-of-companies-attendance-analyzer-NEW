import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { shortenUrl } from './shortenUrl.js';

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

        // Set link validity to 7 days total (24 hours approval + 6 days read-only)
        const validityDays = 7;

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
            const employee = employees.find(e => Number(e.attendance_id) === Number(exception.attendance_id));
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
                        const employee = employees.find(e => Number(e.attendance_id) === Number(exc.attendance_id));
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
            
            // Filter out the department head from the employee list they manage
            const filteredDepartmentEmployees = departmentEmployees.filter(emp => 
                emp.id !== deptHead.employee_id
            );
            
            const dailyBreakdownData = {};

            for (const employee of filteredDepartmentEmployees) {
                const employeeAnalysis = analysisResults.find(a => Number(a.attendance_id) === Number(employee.attendance_id));
                const employeePunches = punches.filter(p => Number(p.attendance_id) === Number(employee.attendance_id));
                const employeeShifts = shiftTimings.filter(s => Number(s.attendance_id) === Number(employee.attendance_id));
                const employeeExceptions = allExceptions.filter(e => Number(e.attendance_id) === Number(employee.attendance_id) && e.use_in_analysis);

                // Build daily details with shift times, punch times, and calculated late/early minutes
                const dailyDetails = {};
                const startDate = new Date(project.date_from);
                const endDate = new Date(project.date_to);
                
                // Get analysis result for this employee to access day_overrides
                const employeeAnalysisResult = analysisResults.find(a => Number(a.attendance_id) === Number(employee.attendance_id));
                let dayOverrides = {};
                if (employeeAnalysisResult?.day_overrides) {
                    try {
                        dayOverrides = JSON.parse(employeeAnalysisResult.day_overrides);
                    } catch (e) {}
                }
                
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    const dayPunches = employeePunches.filter(p => p.punch_date === dateStr);
                    const dayOverride = dayOverrides[dateStr];
                    
                    // Find matching shift: first try specific date, then try date ranges, then fallback to generic shift
                    let dayShift = employeeShifts.find(s => s.date === dateStr);
                    if (!dayShift) {
                        dayShift = employeeShifts.find(s => {
                            if (!s.effective_from || !s.effective_to) return false;
                            const curr = new Date(dateStr);
                            const from = new Date(s.effective_from);
                            const to = new Date(s.effective_to);
                            return curr >= from && curr <= to;
                        });
                    }
                    if (!dayShift) {
                        dayShift = employeeShifts.find(s => !s.date && !s.effective_from && !s.effective_to);
                    }
                    
                    // Helper functions for punch filtering (same as ReportDetailView)
                    const parseTimeHelper = (timeStr) => {
                        if (!timeStr) return null;
                        const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
                        if (!match) return null;
                        let hours = parseInt(match[1]);
                        const minutes = parseInt(match[2]);
                        const period = match[4]?.toUpperCase();
                        if (period === 'PM' && hours !== 12) hours += 12;
                        if (period === 'AM' && hours === 12) hours = 0;
                        const date = new Date();
                        date.setHours(hours, minutes, 0, 0);
                        return date;
                    };
                    
                    const filterMultiplePunches = (punchList, shift) => {
                        if (punchList.length <= 1) return punchList;
                        
                        const punchesWithTime = punchList.map(p => ({
                            ...p,
                            time: parseTimeHelper(p.timestamp_raw)
                        })).filter(p => p.time);
                        
                        if (punchesWithTime.length === 0) return punchList;
                        
                        const deduped = [];
                        for (let i = 0; i < punchesWithTime.length; i++) {
                            const current = punchesWithTime[i];
                            const isDuplicate = deduped.some(p => Math.abs(current.time - p.time) / (1000 * 60) < 10);
                            if (!isDuplicate) {
                                deduped.push(current);
                            }
                        }
                        
                        const sortedPunches = deduped.sort((a, b) => a.time - b.time);
                        return sortedPunches.map(p => punchList.find(punch => punch.id === p.id)).filter(Boolean);
                    };
                    
                    // Filter and sort punches just like ReportDetailView does
                    const filteredDayPunches = filterMultiplePunches(dayPunches, dayShift);
                    
                    // Extract punch times from filtered and sorted punches
                    const punchTimes = filteredDayPunches.map(p => {
                        const match = p.timestamp_raw.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)/i);
                        return match ? match[0] : p.timestamp_raw;
                    });

                    // Calculate late/early minutes
                    let late_minutes = 0;
                    let early_minutes = 0;
                    
                    // If there's a day override with manual minutes, use those
                    if (dayOverride) {
                        late_minutes = dayOverride.lateMinutes || 0;
                        early_minutes = dayOverride.earlyCheckoutMinutes || 0;
                    } else {
                        // Otherwise calculate from FILTERED punches (same as ReportDetailView)
                        if (dayShift && filteredDayPunches.length > 0) {
                            // Use the filtered punches for calculation
                            const punchesWithTime = filteredDayPunches.map(p => ({
                                ...p,
                                time: parseTimeHelper(p.timestamp_raw)
                            })).filter(p => p.time).sort((a, b) => a.time - b.time);

                            if (punchesWithTime.length >= 2) {
                                const firstPunch = punchesWithTime[0].time;
                                const lastPunch = punchesWithTime[punchesWithTime.length - 1].time;
                                
                                const amStart = parseTimeHelper(dayShift.am_start);
                                const pmEnd = parseTimeHelper(dayShift.pm_end);
                                
                                // Calculate late minutes (first punch vs AM start)
                                if (amStart && firstPunch > amStart) {
                                    late_minutes = Math.round((firstPunch - amStart) / (1000 * 60));
                                }
                                
                                // Calculate early checkout minutes (last punch vs PM end)
                                if (pmEnd && lastPunch < pmEnd) {
                                    early_minutes = Math.round((pmEnd - lastPunch) / (1000 * 60));
                                }
                            }
                        }
                    }

                    // Find exception for this date
                    const matchingExc = employeeExceptions.filter(ex => {
                        const exFrom = new Date(ex.date_from);
                        const exTo = new Date(ex.date_to);
                        const curr = new Date(dateStr);
                        return curr >= exFrom && curr <= exTo;
                    });
                    const dayException = matchingExc.length > 0 
                        ? matchingExc.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
                        : null;
                    
                    // Determine status
                    let status = 'Absent';
                    if (dayException) {
                        if (dayException.type === 'OFF' || dayException.type === 'PUBLIC_HOLIDAY') status = 'Off';
                        else if (dayException.type === 'MANUAL_PRESENT') status = 'Present';
                        else if (dayException.type === 'MANUAL_ABSENT') status = 'Absent';
                        else if (dayException.type === 'MANUAL_HALF') status = 'Half Day';
                        else if (dayException.type === 'SICK_LEAVE') status = 'Sick Leave';
                        else if (dayException.type === 'ANNUAL_LEAVE') status = filteredDayPunches.length > 0 ? 'Present' : 'Annual Leave';
                        else if (filteredDayPunches.length > 0) status = 'Present';
                    } else if (filteredDayPunches.length > 0) {
                        status = filteredDayPunches.length >= 2 ? 'Present' : 'Half Day';
                    }

                    dailyDetails[dateStr] = {
                        shift: dayShift ? {
                            am_start: dayShift.am_start || '',
                            am_end: dayShift.am_end || '',
                            pm_start: dayShift.pm_start || '',
                            pm_end: dayShift.pm_end || ''
                        } : null,
                        punches: punchTimes,
                        punch_count: filteredDayPunches.length,
                        late_minutes: late_minutes,
                        early_minutes: early_minutes,
                        exception: dayException ? dayException.type : null,
                        status: status
                    };
                }

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
                    exceptions_count: employeeExceptions.length,
                    daily_details: dailyDetails
                };
            }

            // Get app URL from custom domain - DO THIS BEFORE creating the link record
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

            const fullLinkUrl = `${appUrl}/DeptHeadApproval?token=${token}`;
            
            // Generate shortened URL (with fallback to full URL if shortening fails)
            const shortUrl = await shortenUrl(fullLinkUrl);
            const finalShortUrl = shortUrl || fullLinkUrl; // Fallback to full URL if shortening fails

            // Create approval link record with pre-calculated data AND both full and shortened URLs
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
                daily_breakdown_json: JSON.stringify(dailyBreakdownData),
                approval_link_url: fullLinkUrl,  // STORE THE COMPLETE URL IN DATABASE
                shortened_link_url: finalShortUrl  // STORE THE SHORTENED URL IN DATABASE
            });

            // Get department head employee details
            const deptHeadEmployee = employees.find(e => e.id === deptHead.employee_id);

                links.push({
                    department,
                    department_head_name: deptHeadEmployee?.name || 'Unknown',
                    link_token: token,
                    verification_code: verificationCode,
                    exception_count: relevantExceptionCount,
                    expires_at: expiresAt.toISOString(),
                    full_link: fullLinkUrl
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