import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CREATE SALARY SNAPSHOTS
 * 
 * CORE RULE: Every active employee MUST have a SalarySnapshot when a report is finalized.
 * Attendance quality does NOT decide salary inclusion.
 * 
 * Active Employee Definition:
 * - employee.company === project.company
 * - employee.active === true
 * - A valid EmployeeSalary record exists
 * 
 * Algorithm:
 * 1. Fetch ALL active employees for the project company with valid salary records
 * 2. For EACH employee:
 *    - Try to find AnalysisResult for the finalized report_run_id
 *    - If found → use attendance values, set attendance_source = "ANALYZED"
 *    - If NOT found → create ZERO-ATTENDANCE snapshot, set attendance_source = "NO_ATTENDANCE_DATA"
 */

Deno.serve(async (req) => {
    try {
        console.log('[createSalarySnapshots] Function invoked');
        const base44 = createClientFromRequest(req);
        
        // Allow service role calls (from markFinalReport)
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (authError) {
            console.log('[createSalarySnapshots] No user auth, likely service role call');
        }

        const { project_id, report_run_id } = await req.json();
        console.log('[createSalarySnapshots] Params:', { project_id, report_run_id });

        if (!project_id || !report_run_id) {
            return Response.json({ 
                error: 'project_id and report_run_id are required' 
            }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        const divisor = project.salary_calculation_days || 30;
        const isAlMaraghi = project.company === 'Al Maraghi Auto Repairs';

        // ============================================================
        // AL MARAGHI AUTO REPAIRS: Calculate salary month ranges
        // ============================================================
        let salaryMonthStartStr = null;
        let salaryMonthEndStr = null;
        let extraPrevMonthFrom = null;
        let extraPrevMonthTo = null;
        let hasExtraPrevMonthRange = false;

        if (isAlMaraghi) {
            const projectDateTo = new Date(project.date_to);
            const salaryMonthStart = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth(), 1);
            const salaryMonthEnd = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth() + 1, 0);
            
            salaryMonthStartStr = salaryMonthStart.toISOString().split('T')[0];
            salaryMonthEndStr = salaryMonthEnd.toISOString().split('T')[0];

            // Extra previous month range
            const projectDateFrom = new Date(project.date_from);
            const dayBeforeSalaryMonth = new Date(salaryMonthStart);
            dayBeforeSalaryMonth.setDate(dayBeforeSalaryMonth.getDate() - 1);

            if (projectDateFrom < salaryMonthStart) {
                extraPrevMonthFrom = project.date_from;
                extraPrevMonthTo = dayBeforeSalaryMonth.toISOString().split('T')[0];
                hasExtraPrevMonthRange = true;
            }

            console.log('[createSalarySnapshots] Al Maraghi salary month ranges:', {
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                extra_prev_month_from: extraPrevMonthFrom,
                extra_prev_month_to: extraPrevMonthTo,
                has_extra_range: hasExtraPrevMonthRange
            });
        }

        // Verify report exists
        const reports = await base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id, project_id: project_id });
        if (reports.length === 0) {
            return Response.json({ error: 'Report not found for this project' }, { status: 404 });
        }
        const reportRun = reports[0];

        // Fetch all related data - INCLUDING punches, shifts, exceptions for recalculation
        const [employees, salaries, analysisResults, allExceptions, punches, shifts, rulesData] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.AnalysisResult.filter({ 
                project_id: project_id,
                report_run_id: report_run_id
            }),
            base44.asServiceRole.entities.Exception.filter({ project_id: project_id }),
            base44.asServiceRole.entities.Punch.filter({ project_id: project_id }),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id: project_id }),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company })
        ]);

        console.log(`[createSalarySnapshots] Found ${employees.length} active employees, ${salaries.length} salary records, ${analysisResults.length} analysis results`);

        // Parse rules
        let rules = null;
        if (rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                console.warn('[createSalarySnapshots] Failed to parse rules, using defaults');
            }
        }

        // Delete existing snapshots for this report (if re-finalizing)
        const existingSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        if (existingSnapshots.length > 0) {
            console.log(`[createSalarySnapshots] Deleting ${existingSnapshots.length} existing snapshots`);
            await Promise.all(existingSnapshots.map(s => base44.asServiceRole.entities.SalarySnapshot.delete(s.id)));
        }

        // Helper: Parse time string to Date object
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

        // Helper: Filter duplicate punches within 10 minutes
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

        // Helper: Match punches to shift points
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
                
                // Phase 1: Normal match (±60 min)
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                    if (distance <= 60 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                    }
                }
                
                // Phase 2: Extended match (±120 min)
                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;
                        const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                        if (distance <= 120 && distance < minDistance) {
                            minDistance = distance;
                            closestMatch = shiftPoint;
                        }
                    }
                }
                
                // Phase 3: Far extended match (±180 min)
                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;
                        const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                        if (distance <= 180 && distance < minDistance) {
                            minDistance = distance;
                            closestMatch = shiftPoint;
                        }
                    }
                }
                
                if (closestMatch) {
                    matches.push({ punch, matchedTo: closestMatch.type, shiftTime: closestMatch.time });
                    usedShiftPoints.add(closestMatch.type);
                }
            }
            
            return matches;
        };

        // RECALCULATE attendance for each employee (same logic as UI)
        const recalculateEmployeeAttendance = (emp, dateFrom, dateTo) => {
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
            let annualLeaveCount = 0;
            let lateMinutes = 0;
            let earlyCheckoutMinutes = 0;
            let otherMinutes = 0;
            let approvedMinutes = 0;

            const startDate = new Date(dateFrom);
            const endDate = new Date(dateTo);

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

            // Calculate annual leave as CALENDAR DAYS (not working days)
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
                } catch {
                    // Skip invalid date ranges
                }
            }
            const totalAnnualLeaveCalendarDays = annualLeaveDatesProcessed.size;

            return {
                workingDays,
                presentDays,
                fullAbsenceCount,
                halfAbsenceCount,
                sickLeaveCount,
                annualLeaveCount: totalAnnualLeaveCalendarDays,
                lateMinutes,
                earlyCheckoutMinutes,
                otherMinutes,
                approvedMinutes,
                graceMinutes
            };
        };

        // ============================================================
        // NEW LOGIC: Create salary snapshots for ALL active employees
        // ============================================================
        const snapshots = [];
        let analyzedCount = 0;
        let noAttendanceCount = 0;
        
        // Filter employees to project's custom_employee_ids if specified
        let eligibleEmployees = employees;
        if (project.custom_employee_ids && project.custom_employee_ids.trim()) {
            const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id);
            eligibleEmployees = employees.filter(emp => 
                customIds.includes(String(emp.hrms_id)) || customIds.includes(String(emp.attendance_id))
            );
            console.log(`[createSalarySnapshots] Filtered to ${eligibleEmployees.length} employees from custom_employee_ids`);
        }
        
        for (const emp of eligibleEmployees) {
            // Find matching salary record (REQUIRED for salary snapshot)
            const salary = salaries.find(s => 
                String(s.employee_id) === String(emp.hrms_id) || 
                String(s.attendance_id) === String(emp.attendance_id)
            );
            
            // Skip if no salary record - employee is not eligible for salary
            if (!salary) {
                console.log(`[createSalarySnapshots] Skipping ${emp.name} (${emp.attendance_id}) - no salary record`);
                continue;
            }

            // Check if employee has analysis result
            const analysisResult = analysisResults.find(r => String(r.attendance_id) === String(emp.attendance_id));
            const hasAnalysisResult = !!analysisResult;
            
            let calculated;
            let attendanceSource;
            
            // ALWAYS recalculate attendance from shifts + exceptions + punches
            // This ensures employees with no punches but with exceptions (annual leave, etc.) are computed correctly
            calculated = recalculateEmployeeAttendance(emp, reportRun.date_from, reportRun.date_to);

            if (hasAnalysisResult) {
                attendanceSource = 'ANALYZED';
                analyzedCount++;
            } else {
                // Employee had no AnalysisResult (was missing from original report run)
                // But we still computed their attendance from exceptions/shifts
                attendanceSource = 'NO_ATTENDANCE_DATA';
                noAttendanceCount++;
                console.log(`[createSalarySnapshots] Computing attendance for missing employee ${emp.name} (${emp.attendance_id}) - will use exceptions/shifts`);
            }

            const totalSalaryAmount = salary?.total_salary || 0;
            const workingHours = salary?.working_hours || 9;
            const basicSalary = salary?.basic_salary || 0;
            const allowancesAmount = Number(salary?.allowances) || 0;

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

            // Calculate deductible: (late + early + other) - grace - approved
            const totalTimeIssues = calculated.lateMinutes + calculated.earlyCheckoutMinutes + calculated.otherMinutes;
            const deductibleMinutes = Math.max(0, totalTimeIssues - calculated.graceMinutes - calculated.approvedMinutes);
            const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;
            
            const hourlyRate = totalSalaryAmount / divisor / workingHours;
            const deductibleHoursPay = hourlyRate * deductibleHours;

            const finalTotal = totalSalaryAmount - netDeduction - deductibleHoursPay;

            // ============================================================
            // WPS SPLIT LOGIC (Al Maraghi Auto Repairs only)
            // ============================================================
            // WPS split is applied AFTER final total is computed
            // Uses wps_cap_enabled and wps_cap_amount from EmployeeSalary
            // Balance must always be a multiple of 100 (round down)
            // ============================================================
            let wpsAmount = finalTotal;
            let balanceAmount = 0;
            let wpsCapApplied = false;
            const wpsCapEnabled = salary?.wps_cap_enabled || false;
            const wpsCapAmount = salary?.wps_cap_amount ?? 4900;

            if (project.company === 'Al Maraghi Auto Repairs' && wpsCapEnabled) {
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

            snapshots.push({
                project_id: String(project_id),
                report_run_id: String(report_run_id),
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
                present_days: calculated.presentDays,
                full_absence_count: calculated.fullAbsenceCount,
                annual_leave_count: calculated.annualLeaveCount,
                sick_leave_count: calculated.sickLeaveCount,
                late_minutes: calculated.lateMinutes,
                early_checkout_minutes: calculated.earlyCheckoutMinutes,
                other_minutes: calculated.otherMinutes,
                approved_minutes: calculated.approvedMinutes,
                grace_minutes: calculated.graceMinutes,
                deductible_minutes: deductibleMinutes,
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
                attendance_source: attendanceSource
            });
        }

        // Bulk create snapshots
        if (snapshots.length > 0) {
            console.log(`[createSalarySnapshots] Creating ${snapshots.length} salary snapshots (${analyzedCount} analyzed, ${noAttendanceCount} no attendance data)`);
            await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(snapshots);
            console.log(`[createSalarySnapshots] Successfully created ${snapshots.length} snapshots`);
        } else {
            console.warn(`[createSalarySnapshots] No snapshots created - no eligible employees found`);
        }

        return Response.json({
            success: true,
            snapshots_created: snapshots.length,
            analyzed_count: analyzedCount,
            no_attendance_count: noAttendanceCount,
            employees_count: eligibleEmployees.length,
            message: `Created ${snapshots.length} salary snapshots (${analyzedCount} analyzed, ${noAttendanceCount} no attendance data)`
        });

    } catch (error) {
        console.error('Create salary snapshots error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});