import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * BACKFILL REPORT MISSING EMPLOYEES
 * 
 * This function backfills missing AnalysisResult and SalarySnapshot records
 * for existing reports where active employees were not included.
 * 
 * RULES:
 * - AnalysisResult backfill: ALL companies
 * - SalarySnapshot backfill: ONLY Al Maraghi Motors
 * 
 * This is idempotent - running multiple times will not create duplicates.
 */

Deno.serve(async (req) => {
    try {
        console.log('[backfillReportMissingEmployees] Function invoked');
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { 
            project_id, 
            report_run_id, 
            mode = 'DRY_RUN',  // DRY_RUN or APPLY
            include_salary_snapshots = true 
        } = await req.json();

        if (!project_id) {
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }

        console.log(`[backfillReportMissingEmployees] Params: project_id=${project_id}, report_run_id=${report_run_id || 'ALL'}, mode=${mode}, include_salary=${include_salary_snapshots}`);

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];
        const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';

        // Fetch all required data
        const [allEmployees, allReportRuns, punches, shifts, allExceptions, rulesData, salaries] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.ReportRun.filter({ project_id }),
            base44.asServiceRole.entities.Punch.filter({ project_id }),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id }),
            base44.asServiceRole.entities.Exception.filter({ project_id }),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company }),
            isAlMaraghiMotors 
                ? base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true })
                : Promise.resolve([])
        ]);

        console.log(`[backfillReportMissingEmployees] Found ${allEmployees.length} active employees, ${allReportRuns.length} report runs`);

        // Parse rules
        let rules = null;
        if (rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                console.warn('[backfillReportMissingEmployees] Failed to parse rules, using defaults');
            }
        }

        // Filter employees if project has custom_employee_ids
        let eligibleEmployees = allEmployees;
        if (project.custom_employee_ids && project.custom_employee_ids.trim()) {
            const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id && id !== 'NULL');
            eligibleEmployees = allEmployees.filter(emp => 
                customIds.includes(String(emp.hrms_id)) || customIds.includes(String(emp.attendance_id))
            );
            console.log(`[backfillReportMissingEmployees] Filtered to ${eligibleEmployees.length} employees from custom_employee_ids`);
        }

        // Determine which report runs to process
        let reportRunsToProcess = [];
        if (report_run_id) {
            const specificRun = allReportRuns.find(r => r.id === report_run_id);
            if (specificRun) {
                reportRunsToProcess = [specificRun];
            } else {
                return Response.json({ error: 'Report run not found' }, { status: 404 });
            }
        } else {
            // Process all report runs, prioritizing finalized ones
            reportRunsToProcess = allReportRuns;
        }

        console.log(`[backfillReportMissingEmployees] Processing ${reportRunsToProcess.length} report runs`);

        // Helper functions (same as createSalarySnapshots)
        const parseTime = (timeStr, includeSeconds = false) => {
            try {
                if (!timeStr || timeStr === '—' || timeStr === '-') return null;
                
                if (includeSeconds) {
                    let timeMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
                    if (timeMatch) {
                        let hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);
                        const seconds = parseInt(timeMatch[3]);
                        const period = timeMatch[4].toUpperCase();
                        if (period === 'PM' && hours !== 12) hours += 12;
                        if (period === 'AM' && hours === 12) hours = 0;
                        const date = new Date();
                        date.setHours(hours, minutes, seconds, 0);
                        return date;
                    }
                }
                
                let timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                if (timeMatch) {
                    let hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const period = timeMatch[3].toUpperCase();
                    if (period === 'PM' && hours !== 12) hours += 12;
                    if (period === 'AM' && hours === 12) hours = 0;
                    const date = new Date();
                    date.setHours(hours, minutes, 0, 0);
                    return date;
                }
                
                timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
                if (timeMatch) {
                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                    const date = new Date();
                    date.setHours(hours, minutes, seconds, 0);
                    return date;
                }
                
                return null;
            } catch {
                return null;
            }
        };

        const filterMultiplePunches = (punchList, includeSeconds) => {
            if (punchList.length <= 1) return punchList;
            const punchesWithTime = punchList.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw, includeSeconds)
            })).filter(p => p.time);
            if (punchesWithTime.length === 0) return punchList;

            const deduped = [];
            for (const current of punchesWithTime) {
                const isDuplicate = deduped.some(p => Math.abs(current.time - p.time) / (1000 * 60) < 10);
                if (!isDuplicate) deduped.push(current);
            }
            return deduped.sort((a, b) => a.time - b.time);
        };

        const matchPunchesToShiftPoints = (dayPunches, shift, includeSeconds) => {
            if (!shift || dayPunches.length === 0) return [];
            
            const punchesWithTime = dayPunches.map(p => ({
                ...p,
                time: p.time || parseTime(p.timestamp_raw, includeSeconds)
            })).filter(p => p.time).sort((a, b) => a.time - b.time);
            
            if (punchesWithTime.length === 0) return [];
            
            const shiftPoints = [
                { type: 'AM_START', time: parseTime(shift.am_start) },
                { type: 'AM_END', time: parseTime(shift.am_end) },
                { type: 'PM_START', time: parseTime(shift.pm_start) },
                { type: 'PM_END', time: parseTime(shift.pm_end) }
            ].filter(sp => sp.time);
            
            const matches = [];
            const usedShiftPoints = new Set();
            
            for (const punch of punchesWithTime) {
                let closestMatch = null;
                let minDistance = Infinity;
                
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                    if (distance <= 180 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                    }
                }
                
                if (closestMatch) {
                    matches.push({ punch, matchedTo: closestMatch.type, shiftTime: closestMatch.time });
                    usedShiftPoints.add(closestMatch.type);
                }
            }
            
            return matches;
        };

        // FULL attendance calculation function (same logic as runAnalysis.js)
        const calculateEmployeeAttendance = (emp, dateFrom, dateTo) => {
            const attendanceIdStr = String(emp.attendance_id);
            const includeSeconds = project.company === 'Al Maraghi Automotive';
            
            const employeePunches = punches.filter(p => 
                String(p.attendance_id) === attendanceIdStr &&
                p.punch_date >= dateFrom && 
                p.punch_date <= dateTo
            );
            const employeeShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
            const employeeExceptions = allExceptions.filter(e => 
                (String(e.attendance_id) === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
                e.use_in_analysis !== false &&
                e.is_custom_type !== true
            );

            const dayNameToNumber = {
                'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                'Thursday': 4, 'Friday': 5, 'Saturday': 6
            };

            let workingDays = 0;
            let presentDays = 0;
            let fullAbsenceCount = 0;
            let halfAbsenceCount = 0;
            let sickLeaveCount = 0;
            let lateMinutes = 0;
            let earlyCheckoutMinutes = 0;
            let otherMinutes = 0;
            let approvedMinutes = 0;

            const startDate = new Date(dateFrom);
            const endDate = new Date(dateTo);

            // Calculate annual leave as CALENDAR DAYS upfront
            const annualLeaveExceptions = employeeExceptions.filter(ex => ex.type === 'ANNUAL_LEAVE');
            const annualLeaveDatesProcessed = new Set();
            
            for (const alEx of annualLeaveExceptions) {
                try {
                    const exFrom = new Date(alEx.date_from);
                    const exTo = new Date(alEx.date_to);
                    const rangeStart = exFrom < startDate ? new Date(startDate) : new Date(exFrom);
                    const rangeEnd = exTo > endDate ? new Date(endDate) : new Date(exTo);
                    
                    if (rangeStart <= rangeEnd) {
                        for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
                            const dateStr = d.toISOString().split('T')[0];
                            annualLeaveDatesProcessed.add(dateStr);
                        }
                    }
                } catch {}
            }
            const annualLeaveCount = annualLeaveDatesProcessed.size;

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                // CRITICAL: Use UTC day of week to avoid timezone issues
                // new Date(dateStr) creates a date at UTC midnight, so we must use getUTCDay()
                // Otherwise, server timezone can shift the day and cause incorrect weekly off detection
                const dayOfWeek = currentDate.getUTCDay();

                // Check weekly off
                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (emp.weekly_off) {
                    weeklyOffDay = dayNameToNumber[emp.weekly_off];
                }
                
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue;
                }

                // Get ALL matching exceptions for this date BEFORE incrementing workingDays
                // This allows PUBLIC_HOLIDAY to completely skip the day
                const matchingExceptions = employeeExceptions.filter(ex => {
                    try {
                        const exFrom = new Date(ex.date_from);
                        const exTo = new Date(ex.date_to);
                        return currentDate >= exFrom && currentDate <= exTo;
                    } catch { return false; }
                });

                // Check for PUBLIC_HOLIDAY - day is NOT a working day
                const hasPublicHoliday = matchingExceptions.some(ex => 
                    ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF'
                );
                
                // Check for MANUAL_ABSENT on the same date (even if it's a public holiday)
                const hasManualAbsent = matchingExceptions.some(ex => ex.type === 'MANUAL_ABSENT');
                
                if (hasPublicHoliday) {
                    // PUBLIC_HOLIDAY: Day is NOT a working day
                    // BUT if there's also a MANUAL_ABSENT, count LOP without adding to working days
                    // This handles the case where employee was marked absent on a holiday
                    if (hasManualAbsent) {
                        fullAbsenceCount++;
                    }
                    // Skip rest of day processing - not a working day
                    continue;
                }

                // Now it's safe to count as a working day
                workingDays++;

                // Get the most recent exception (PUBLIC_HOLIDAY already handled above)
                const dateException = matchingExceptions.length > 0
                    ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                    : null;

                // Handle special exception types
                if (dateException) {
                    if (dateException.type === 'MANUAL_PRESENT') {
                        presentDays++;
                        continue;
                    } else if (dateException.type === 'MANUAL_ABSENT') {
                        fullAbsenceCount++;
                        continue;
                    } else if (dateException.type === 'MANUAL_HALF') {
                        presentDays++;
                        halfAbsenceCount++;
                        continue;
                    } else if (dateException.type === 'SICK_LEAVE') {
                        sickLeaveCount++;
                        continue;
                    }
                }

                // Check for annual leave
                const annualLeaveException = employeeExceptions.find(ex => {
                    try {
                        const exFrom = new Date(ex.date_from);
                        const exTo = new Date(ex.date_to);
                        return ex.type === 'ANNUAL_LEAVE' && currentDate >= exFrom && currentDate <= exTo;
                    } catch { return false; }
                });

                const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr);

                if (annualLeaveException && rawDayPunches.length === 0) {
                    workingDays--;
                    continue;
                }

                // Get shift for this day
                const isShiftEffective = (s) => {
                    if (!s.effective_from || !s.effective_to) return true;
                    const from = new Date(s.effective_from);
                    const to = new Date(s.effective_to);
                    return currentDate >= from && currentDate <= to;
                };

                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const currentDayName = dayNames[dayOfWeek];

                let shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
                if (!shift) {
                    const applicableShifts = employeeShifts.filter(s => !s.date && isShiftEffective(s));
                    for (const s of applicableShifts) {
                        if (s.applicable_days) {
                            try {
                                const applicableDaysArray = JSON.parse(s.applicable_days);
                                if (Array.isArray(applicableDaysArray) && applicableDaysArray.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) {
                                    shift = s;
                                    break;
                                }
                            } catch {}
                        }
                    }
                    if (!shift) {
                        if (dayOfWeek === 5) {
                            shift = employeeShifts.find(s => s.is_friday_shift && !s.date && isShiftEffective(s)) ||
                                    employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                        } else {
                            shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                        }
                    }
                }

                // Apply shift override from exception
                if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
                    const isFriday = dayOfWeek === 5;
                    if (dateException.include_friday || !isFriday) {
                        shift = {
                            am_start: dateException.new_am_start,
                            am_end: dateException.new_am_end,
                            pm_start: dateException.new_pm_start,
                            pm_end: dateException.new_pm_end
                        };
                    }
                }

                const dayPunches = filterMultiplePunches(rawDayPunches, includeSeconds);

                // Track allowed minutes
                let allowedMinutesForDay = 0;
                if (dateException && dateException.type === 'ALLOWED_MINUTES' && 
                    dateException.approval_status === 'approved_dept_head') {
                    allowedMinutesForDay = dateException.allowed_minutes || 0;
                    approvedMinutes += allowedMinutesForDay;
                }

                // Check for manual time exception
                const hasManualTimeException = dateException && (
                    dateException.type === 'MANUAL_LATE' || 
                    dateException.type === 'MANUAL_EARLY_CHECKOUT' ||
                    (dateException.late_minutes > 0) ||
                    (dateException.early_checkout_minutes > 0) ||
                    (dateException.other_minutes > 0)
                );

                const shouldSkipTimeCalc = dateException && [
                    'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
                ].includes(dateException.type);

                // Count attendance
                if (dayPunches.length > 0) {
                    presentDays++;
                } else if (!dateException || !['MANUAL_LATE', 'MANUAL_EARLY_CHECKOUT'].includes(dateException.type)) {
                    fullAbsenceCount++;
                } else {
                    presentDays++;
                }

                // Calculate time issues
                if (hasManualTimeException && !shouldSkipTimeCalc) {
                    if (dateException.late_minutes > 0) lateMinutes += dateException.late_minutes;
                    if (dateException.early_checkout_minutes > 0) earlyCheckoutMinutes += dateException.early_checkout_minutes;
                    if (dateException.other_minutes > 0) otherMinutes += dateException.other_minutes;
                } else if (shift && dayPunches.length > 0 && !shouldSkipTimeCalc) {
                    const punchMatches = matchPunchesToShiftPoints(dayPunches, shift, includeSeconds);
                    
                    let dayLateMinutes = 0;
                    let dayEarlyMinutes = 0;
                    
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        const punchTime = match.punch.time;
                        const shiftTime = match.shiftTime;
                        
                        if ((match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') && punchTime > shiftTime) {
                            dayLateMinutes += Math.round((punchTime - shiftTime) / (1000 * 60));
                        }
                        if ((match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') && punchTime < shiftTime) {
                            dayEarlyMinutes += Math.round((shiftTime - punchTime) / (1000 * 60));
                        }
                    }
                    
                    // Apply allowed minutes offset
                    if (allowedMinutesForDay > 0) {
                        const totalDayMinutes = dayLateMinutes + dayEarlyMinutes;
                        const excessMinutes = Math.max(0, totalDayMinutes - allowedMinutesForDay);
                        if (totalDayMinutes > 0 && excessMinutes > 0) {
                            const lateRatio = dayLateMinutes / totalDayMinutes;
                            const earlyRatio = dayEarlyMinutes / totalDayMinutes;
                            dayLateMinutes = Math.round(excessMinutes * lateRatio);
                            dayEarlyMinutes = Math.round(excessMinutes * earlyRatio);
                        } else {
                            dayLateMinutes = 0;
                            dayEarlyMinutes = 0;
                        }
                    }
                    
                    lateMinutes += dayLateMinutes;
                    earlyCheckoutMinutes += dayEarlyMinutes;
                }
            }

            // Get grace minutes
            const dept = emp.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
            const carriedGrace = project.use_carried_grace_minutes ? (emp.carried_grace_minutes || 0) : 0;
            const graceMinutes = baseGrace + carriedGrace;

            // Calculate deductible
            const totalTimeIssues = lateMinutes + earlyCheckoutMinutes + otherMinutes;
            const deductibleMinutes = Math.max(0, totalTimeIssues - graceMinutes - approvedMinutes);

            return {
                workingDays,
                presentDays,
                fullAbsenceCount,
                halfAbsenceCount,
                sickLeaveCount,
                annualLeaveCount,
                lateMinutes,
                earlyCheckoutMinutes,
                otherMinutes,
                approvedMinutes,
                graceMinutes,
                deductibleMinutes
            };
        };

        // Process each report run
        const results = {
            mode,
            project_id,
            project_company: project.company,
            is_al_maraghi_motors: isAlMaraghiMotors,
            report_runs_processed: 0,
            analysis_results_to_create: [],
            salary_snapshots_to_create: [],
            errors: []
        };

        for (const reportRun of reportRunsToProcess) {
            console.log(`[backfillReportMissingEmployees] Processing report run ${reportRun.id} (${reportRun.date_from} to ${reportRun.date_to})`);
            
            // Fetch existing analysis results for this report run
            const existingResults = await base44.asServiceRole.entities.AnalysisResult.filter({
                project_id,
                report_run_id: reportRun.id
            });
            const existingAttendanceIds = new Set(existingResults.map(r => String(r.attendance_id)));

            // Find missing employees
            const missingEmployees = eligibleEmployees.filter(emp => 
                !existingAttendanceIds.has(String(emp.attendance_id))
            );

            console.log(`[backfillReportMissingEmployees] Report ${reportRun.id}: ${existingResults.length} existing, ${missingEmployees.length} missing`);

            // Create missing AnalysisResult records
            for (const emp of missingEmployees) {
                // CRITICAL: Employees without attendance_id (has_attendance_tracking=false) should be:
                // - Present all days (present_days = working_days)
                // - No deductions (LOP = 0, late = 0, early = 0, other = 0, deductible = 0)
                // - Full salary (no attendance tracking, salary-only)
                const hasAttendanceId = emp.attendance_id && String(emp.attendance_id).trim() !== '';
                
                let calculated;
                if (!hasAttendanceId) {
                    // Salary-only employee - no attendance tracking
                    // Count working days in period (excluding weekly offs and public holidays)
                    const startDate = new Date(reportRun.date_from);
                    const endDate = new Date(reportRun.date_to);
                    const dayNameToNumber = {
                        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                        'Thursday': 4, 'Friday': 5, 'Saturday': 6
                    };
                    
                    let workingDays = 0;
                    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                        const currentDate = new Date(d);
                        const dayOfWeek = currentDate.getUTCDay();
                        
                        // Check weekly off
                        let weeklyOffDay = null;
                        if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                            weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                        } else if (emp.weekly_off) {
                            weeklyOffDay = dayNameToNumber[emp.weekly_off];
                        }
                        
                        if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                            continue;
                        }
                        
                        workingDays++;
                    }
                    
                    calculated = {
                        workingDays,
                        presentDays: workingDays, // Present all days
                        fullAbsenceCount: 0,
                        halfAbsenceCount: 0,
                        sickLeaveCount: 0,
                        annualLeaveCount: 0,
                        lateMinutes: 0,
                        earlyCheckoutMinutes: 0,
                        otherMinutes: 0,
                        approvedMinutes: 0,
                        graceMinutes: 0,
                        deductibleMinutes: 0
                    };
                } else {
                    // Normal employee with attendance tracking
                    calculated = calculateEmployeeAttendance(emp, reportRun.date_from, reportRun.date_to);
                }
                
                const analysisResult = {
                    project_id,
                    report_run_id: reportRun.id,
                    attendance_id: String(emp.attendance_id),
                    working_days: calculated.workingDays,
                    present_days: calculated.presentDays,
                    full_absence_count: calculated.fullAbsenceCount,
                    half_absence_count: calculated.halfAbsenceCount,
                    sick_leave_count: calculated.sickLeaveCount,
                    annual_leave_count: calculated.annualLeaveCount,
                    late_minutes: calculated.lateMinutes,
                    early_checkout_minutes: calculated.earlyCheckoutMinutes,
                    other_minutes: calculated.otherMinutes,
                    approved_minutes: calculated.approvedMinutes,
                    deductible_minutes: calculated.deductibleMinutes,
                    grace_minutes: calculated.graceMinutes,
                    abnormal_dates: '',
                    notes: hasAttendanceId 
                        ? `Backfilled - Employee had no punches but was active. Annual Leave: ${calculated.annualLeaveCount} days`
                        : `Salary-only employee (no attendance tracking) - Present all working days`,
                    auto_resolutions: ''
                };

                results.analysis_results_to_create.push({
                    report_run_id: reportRun.id,
                    employee_name: emp.name,
                    attendance_id: emp.attendance_id,
                    ...analysisResult
                });

                if (mode === 'APPLY') {
                    try {
                        // IDEMPOTENCY: Double-check right before create to handle concurrency
                        const existCheck = await base44.asServiceRole.entities.AnalysisResult.filter({
                            report_run_id: reportRun.id,
                            attendance_id: String(emp.attendance_id)
                        });
                        if (existCheck.length > 0) {
                            console.log(`[backfillReportMissingEmployees] SKIP: AnalysisResult already exists for ${emp.name} (${emp.attendance_id}) - concurrent creation detected`);
                            continue;
                        }
                        await base44.asServiceRole.entities.AnalysisResult.create(analysisResult);
                        console.log(`[backfillReportMissingEmployees] Created AnalysisResult for ${emp.name} (${emp.attendance_id})`);
                    } catch (err) {
                        results.errors.push(`Failed to create AnalysisResult for ${emp.name}: ${err.message}`);
                    }
                }
            }

            // Handle SalarySnapshot backfill (ONLY for Al Maraghi Motors AND finalized reports)
            if (include_salary_snapshots && isAlMaraghiMotors && reportRun.is_final) {
                console.log(`[backfillReportMissingEmployees] Processing salary snapshots for finalized report ${reportRun.id}`);
                
                // Fetch existing salary snapshots
                const existingSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
                    project_id,
                    report_run_id: reportRun.id
                });
                const existingSnapshotAttendanceIds = new Set(existingSnapshots.map(s => String(s.attendance_id)));

                // DIVISOR_LEAVE_DEDUCTION: Used for current month Leave Pay, Salary Leave Amount, Deductible Hours Pay
                const divisor = project.salary_calculation_days || 30;
                // DIVISOR_OT: Used for OT Hourly Rate, Previous Month LOP Days, Previous Month Deductible Minutes
                const otDivisor = project.ot_calculation_days || divisor;

                // Find employees missing salary snapshots
                for (const emp of eligibleEmployees) {
                    if (existingSnapshotAttendanceIds.has(String(emp.attendance_id))) {
                        continue; // Already has snapshot
                    }

                    // Find salary record
                    const salary = salaries.find(s => 
                        String(s.employee_id) === String(emp.hrms_id) || 
                        String(s.attendance_id) === String(emp.attendance_id)
                    );
                    
                    if (!salary) {
                        console.log(`[backfillReportMissingEmployees] Skipping salary snapshot for ${emp.name} - no salary record`);
                        continue;
                    }

                    // Calculate attendance
                    const calculated = calculateEmployeeAttendance(emp, reportRun.date_from, reportRun.date_to);

                    const totalSalaryAmount = salary.total_salary || 0;
                    const workingHours = salary.working_hours || 9;
                    const basicSalary = salary.basic_salary || 0;
                    const allowancesAmount = Number(salary.allowances) || 0;

                    // Get salary leave days from ANNUAL_LEAVE exceptions
                    let salaryLeaveDays = calculated.annualLeaveCount;
                    const empAnnualLeaveExceptions = allExceptions.filter(exc => 
                        String(exc.attendance_id) === String(emp.attendance_id) &&
                        exc.type === 'ANNUAL_LEAVE'
                    );
                    if (empAnnualLeaveExceptions.length > 0) {
                        const totalSalaryLeaveDaysOverride = empAnnualLeaveExceptions.reduce((sum, exc) => {
                            return sum + (exc.salary_leave_days ?? 0);
                        }, 0);
                        if (totalSalaryLeaveDaysOverride > 0) {
                            salaryLeaveDays = totalSalaryLeaveDaysOverride;
                        }
                    }

                    // Calculate derived salary values
                    const leaveDays = calculated.annualLeaveCount + calculated.fullAbsenceCount;
                    const leavePay = leaveDays > 0 ? (totalSalaryAmount / divisor) * leaveDays : 0;
                    
                    const salaryForLeave = basicSalary + allowancesAmount;
                    const salaryLeaveAmount = salaryLeaveDays > 0 ? (salaryForLeave / divisor) * salaryLeaveDays : 0;
                    
                    const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);

                    const deductibleHours = Math.round((calculated.deductibleMinutes / 60) * 100) / 100;
                    const hourlyRate = totalSalaryAmount / divisor / workingHours;
                    const deductibleHoursPay = hourlyRate * deductibleHours;

                    // Previous month values (backfill creates with 0 as we don't have prev month data)
                    const extraPrevMonthDeductibleMinutes = 0;
                    const extraPrevMonthLopDays = 0;
                    const extraPrevMonthLopPay = 0;
                    const extraPrevMonthDeductibleHoursPay = 0;

                    const finalTotal = totalSalaryAmount - netDeduction - deductibleHoursPay;

                    // WPS SPLIT LOGIC (Al Maraghi Motors only)
                    // Balance must always be a multiple of 100 (round down)
                    let wpsAmount = finalTotal;
                    let balanceAmount = 0;
                    let wpsCapApplied = false;
                    const wpsCapEnabled = salary?.wps_cap_enabled || false;
                    const wpsCapAmount = salary?.wps_cap_amount ?? 4900;

                    if (isAlMaraghiMotors && wpsCapEnabled) {
                        if (finalTotal <= 0) {
                            wpsAmount = 0;
                            balanceAmount = 0;
                            wpsCapApplied = false;
                        } else {
                            const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                            // Calculate raw excess over cap
                            const rawExcess = Math.max(0, finalTotal - cap);
                            // Round balance DOWN to nearest 100
                            balanceAmount = Math.floor(rawExcess / 100) * 100;
                            // WPS gets the rest (total - balance)
                            wpsAmount = finalTotal - balanceAmount;
                            wpsCapApplied = rawExcess > 0;
                        }
                    } else if (finalTotal <= 0) {
                        wpsAmount = 0;
                        balanceAmount = 0;
                    }

                    const snapshot = {
                        project_id: String(project_id),
                        report_run_id: String(reportRun.id),
                        attendance_id: String(emp.attendance_id),
                        hrms_id: String(emp.hrms_id),
                        name: emp.name,
                        department: emp.department,
                        basic_salary: basicSalary,
                        allowances: allowancesAmount,
                        total_salary: totalSalaryAmount,
                        working_hours: workingHours,
                        working_days: calculated.workingDays,
                        salary_divisor: divisor,
                        ot_divisor: otDivisor,
                        present_days: calculated.presentDays,
                        full_absence_count: calculated.fullAbsenceCount,
                        annual_leave_count: calculated.annualLeaveCount,
                        sick_leave_count: calculated.sickLeaveCount,
                        late_minutes: calculated.lateMinutes,
                        early_checkout_minutes: calculated.earlyCheckoutMinutes,
                        other_minutes: calculated.otherMinutes,
                        approved_minutes: calculated.approvedMinutes,
                        grace_minutes: calculated.graceMinutes,
                        deductible_minutes: calculated.deductibleMinutes,
                        extra_prev_month_deductible_minutes: extraPrevMonthDeductibleMinutes,
                        extra_prev_month_lop_days: extraPrevMonthLopDays,
                        extra_prev_month_lop_pay: extraPrevMonthLopPay,
                        extra_prev_month_deductible_hours_pay: extraPrevMonthDeductibleHoursPay,
                        salary_leave_days: salaryLeaveDays,
                        leaveDays: leaveDays,
                        leavePay: Math.round(leavePay * 100) / 100,
                        salaryLeaveAmount: Math.round(salaryLeaveAmount * 100) / 100,
                        deductibleHours: deductibleHours,
                        deductibleHoursPay: Math.round(deductibleHoursPay * 100) / 100,
                        netDeduction: Math.round(netDeduction * 100) / 100,
                        normalOtHours: 0,
                        normalOtSalary: 0,
                        specialOtHours: 0,
                        specialOtSalary: 0,
                        totalOtSalary: 0,
                        otherDeduction: 0,
                        bonus: 0,
                        incentive: 0,
                        advanceSalaryDeduction: 0,
                        total: Math.round(finalTotal * 100) / 100,
                        wpsPay: Math.round(wpsAmount * 100) / 100,
                        balance: Math.round(balanceAmount * 100) / 100,
                        wps_cap_enabled: wpsCapEnabled,
                        wps_cap_amount: wpsCapAmount,
                        wps_cap_applied: wpsCapApplied,
                        snapshot_created_at: new Date().toISOString(),
                        attendance_source: 'BACKFILLED'
                    };

                    results.salary_snapshots_to_create.push({
                        report_run_id: reportRun.id,
                        employee_name: emp.name,
                        attendance_id: emp.attendance_id,
                        annual_leave_count: calculated.annualLeaveCount,
                        salary_leave_days: salaryLeaveDays,
                        total: snapshot.total
                    });

                    if (mode === 'APPLY') {
                        try {
                            // IDEMPOTENCY: Double-check right before create to handle concurrency
                            const existCheck = await base44.asServiceRole.entities.SalarySnapshot.filter({
                                project_id: String(project_id),
                                report_run_id: String(reportRun.id),
                                attendance_id: String(emp.attendance_id)
                            });
                            if (existCheck.length > 0) {
                                console.log(`[backfillReportMissingEmployees] SKIP: SalarySnapshot already exists for ${emp.name} (${emp.attendance_id}) - concurrent creation detected`);
                                continue;
                            }
                            await base44.asServiceRole.entities.SalarySnapshot.create(snapshot);
                            console.log(`[backfillReportMissingEmployees] Created SalarySnapshot for ${emp.name} (${emp.attendance_id})`);
                        } catch (err) {
                            results.errors.push(`Failed to create SalarySnapshot for ${emp.name}: ${err.message}`);
                        }
                    }
                }
            }

            results.report_runs_processed++;
        }

        // Update report run employee counts if in APPLY mode
        if (mode === 'APPLY') {
            for (const reportRun of reportRunsToProcess) {
                const newCount = await base44.asServiceRole.entities.AnalysisResult.filter({
                    report_run_id: reportRun.id
                });
                if (newCount.length !== reportRun.employee_count) {
                    await base44.asServiceRole.entities.ReportRun.update(reportRun.id, {
                        employee_count: newCount.length
                    });
                    console.log(`[backfillReportMissingEmployees] Updated report ${reportRun.id} employee_count to ${newCount.length}`);
                }
            }
        }

        // Summary
        const summary = {
            success: true,
            mode,
            project_id,
            project_company: project.company,
            is_al_maraghi_motors: isAlMaraghiMotors,
            report_runs_processed: results.report_runs_processed,
            analysis_results_created: results.analysis_results_to_create.length,
            salary_snapshots_created: results.salary_snapshots_to_create.length,
            details: {
                analysis_results: results.analysis_results_to_create.map(r => ({
                    employee: r.employee_name,
                    attendance_id: r.attendance_id,
                    report_run: r.report_run_id,
                    annual_leave: r.annual_leave_count,
                    lop_days: r.full_absence_count
                })),
                salary_snapshots: results.salary_snapshots_to_create
            },
            errors: results.errors
        };

        if (mode === 'DRY_RUN') {
            summary.message = `DRY RUN: Would create ${results.analysis_results_to_create.length} AnalysisResult(s) and ${results.salary_snapshots_to_create.length} SalarySnapshot(s). Run with mode='APPLY' to execute.`;
        } else {
            summary.message = `APPLIED: Created ${results.analysis_results_to_create.length} AnalysisResult(s) and ${results.salary_snapshots_to_create.length} SalarySnapshot(s).`;
        }

        return Response.json(summary);

    } catch (error) {
        console.error('Backfill error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});