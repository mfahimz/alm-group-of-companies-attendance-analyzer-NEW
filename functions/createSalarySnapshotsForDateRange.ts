import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CREATE SALARY SNAPSHOTS FOR DATE RANGE
 * 
 * CORE RULE: Every active employee MUST have a SalarySnapshot.
 * Attendance quality does NOT decide salary inclusion.
 * 
 * This function creates snapshots for a CUSTOM date range (different from report dates).
 * Used when generating salary reports with specific date ranges.
 */

Deno.serve(async (req) => {
    try {
        console.log('[createSalarySnapshotsForDateRange] Function invoked');
        const base44 = createClientFromRequest(req);
        
        // Allow service role calls
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (authError) {
            console.log('[createSalarySnapshotsForDateRange] No user auth, likely service role call');
        }

        const { project_id, report_run_id, date_from, date_to } = await req.json();
        console.log('[createSalarySnapshotsForDateRange] Params:', { project_id, report_run_id, date_from, date_to });

        if (!project_id || !report_run_id || !date_from || !date_to) {
            return Response.json({ 
                error: 'project_id, report_run_id, date_from, and date_to are required' 
            }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        // DIVISOR_LEAVE_DEDUCTION: Used for current month Leave Pay, Salary Leave Amount, Deductible Hours Pay
        const divisor = project.salary_calculation_days || 30;
        // DIVISOR_OT: Used for OT Hourly Rate, Previous Month LOP Days, Previous Month Deductible Minutes
        const otDivisor = project.ot_calculation_days || divisor;
        const isAlMaraghi = project.company === 'Al Maraghi Motors';

        // ============================================================
        // AL MARAGHI MOTORS: Calculate salary month ranges
        // Based on the CUSTOM date_to parameter (not project.date_to)
        // ============================================================
        let salaryMonthStartStr = null;
        let salaryMonthEndStr = null;
        let extraPrevMonthFrom = null;
        let extraPrevMonthTo = null;
        let hasExtraPrevMonthRange = false;
        let assumedPresentDays = [];
        
        if (isAlMaraghi) {
            // Use the CUSTOM date_to for salary month calculation
            const customDateTo = new Date(date_to);
            const salaryMonthStart = new Date(customDateTo.getFullYear(), customDateTo.getMonth(), 1);
            const salaryMonthEnd = new Date(customDateTo.getFullYear(), customDateTo.getMonth() + 1, 0);
            
            salaryMonthStartStr = salaryMonthStart.toISOString().split('T')[0];
            salaryMonthEndStr = salaryMonthEnd.toISOString().split('T')[0];

            // Calculate assumed present days: last 2 days of salary month
            const assumedDay1 = new Date(salaryMonthEnd);
            assumedDay1.setDate(assumedDay1.getDate() - 1);
            const assumedDay2 = new Date(salaryMonthEnd);
            
            assumedPresentDays = [
                assumedDay1.toISOString().split('T')[0],
                assumedDay2.toISOString().split('T')[0]
            ];

            // Extra previous month range: check if PROJECT date_from is before salary month start
            // This determines if the project spans into the previous month
            const projectDateFrom = new Date(project.date_from);
            const dayBeforeSalaryMonth = new Date(salaryMonthStart);
            dayBeforeSalaryMonth.setDate(dayBeforeSalaryMonth.getDate() - 1);

            if (projectDateFrom < salaryMonthStart) {
                extraPrevMonthFrom = project.date_from;
                extraPrevMonthTo = dayBeforeSalaryMonth.toISOString().split('T')[0];
                hasExtraPrevMonthRange = true;
            }

            console.log('[createSalarySnapshotsForDateRange] Al Maraghi salary month ranges:', {
                custom_date_to: date_to,
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                extra_prev_month_from: extraPrevMonthFrom,
                extra_prev_month_to: extraPrevMonthTo,
                has_extra_range: hasExtraPrevMonthRange,
                assumed_present_days: assumedPresentDays
            });
        }

        // Verify report exists
        const reports = await base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id, project_id: project_id });
        if (reports.length === 0) {
            return Response.json({ error: 'Report not found for this project' }, { status: 404 });
        }
        const reportRun = reports[0];

        // Fetch all related data - INCLUDING salary increments for Al Maraghi Motors
        const [employees, salaries, analysisResults, allExceptions, punches, shifts, rulesData, salaryIncrements] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.AnalysisResult.filter({ 
                project_id: project_id,
                report_run_id: report_run_id
            }),
            base44.asServiceRole.entities.Exception.filter({ project_id: project_id }),
            base44.asServiceRole.entities.Punch.filter({ project_id: project_id }),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id: project_id }),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company }),
            isAlMaraghi 
                ? base44.asServiceRole.entities.SalaryIncrement.filter({ company: 'Al Maraghi Motors', active: true })
                : Promise.resolve([])
        ]);

        console.log(`[createSalarySnapshotsForDateRange] Found ${employees.length} active employees, ${salaries.length} salary records, ${analysisResults.length} analysis results, ${salaryIncrements.length} salary increments`);

        // Parse rules
        let rules = null;
        if (rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                console.warn('[createSalarySnapshotsForDateRange] Failed to parse rules, using defaults');
            }
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

        // RECALCULATE attendance for custom date range
        // For Al Maraghi Motors: assumedDays are treated as fully present for salary
        const recalculateEmployeeAttendance = (emp, dateFrom, dateTo, assumedDays = []) => {
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

                // ============================================================
                // AL MARAGHI MOTORS: ASSUMED PRESENT DAYS LOGIC
                // If this day is in assumedDays array, treat as fully present
                // UNLESS employee has ANNUAL_LEAVE on this day
                // ============================================================
                const isAssumedPresentDay = assumedDays.includes(dateStr);
                
                if (isAssumedPresentDay) {
                    // Check if employee has annual leave on this assumed day
                    // FIX Issue 3: Use UTC date comparison to avoid timezone issues
                    const hasAnnualLeaveOnAssumedDay = employeeExceptions.some(ex => {
                        if (ex.type !== 'ANNUAL_LEAVE') return false;
                        try {
                            // Compare date strings directly to avoid timezone issues
                            return dateStr >= ex.date_from && dateStr <= ex.date_to;
                        } catch { return false; }
                    });
                    
                    if (!hasAnnualLeaveOnAssumedDay) {
                        // Assumed present: count as working day, present day, NO deductions
                        workingDays++;
                        presentDays++;
                        // Skip all other processing for this day - no late/early/absence tracking
                        continue;
                    }
                    // If annual leave exists, fall through to normal processing
                }

                // Get ALL matching exceptions for this date BEFORE incrementing workingDays
                // This allows PUBLIC_HOLIDAY to completely skip the day
                // FIX Issue 3: Use date string comparison to avoid timezone issues
                const matchingExceptions = employeeExceptions.filter(ex => {
                    try {
                        return dateStr >= ex.date_from && dateStr <= ex.date_to;
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
                // FIX Issue 3: Use date string comparison to avoid timezone issues
                const annualLeaveException = employeeExceptions.find(ex => {
                    try {
                        return ex.type === 'ANNUAL_LEAVE' && dateStr >= ex.date_from && dateStr <= ex.date_to;
                    } catch { return false; }
                });

                const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr);

                if (annualLeaveException && rawDayPunches.length === 0) {
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

            // Calculate annual leave as CALENDAR DAYS within the CUSTOM date range
            const annualLeaveExceptions = employeeExceptions.filter(ex => ex.type === 'ANNUAL_LEAVE');
            let totalAnnualLeaveCalendarDays = 0;
            
            for (const alEx of annualLeaveExceptions) {
                try {
                    const exFrom = new Date(alEx.date_from);
                    const exTo = new Date(alEx.date_to);
                    
                    const rangeStart = exFrom < startDate ? startDate : exFrom;
                    const rangeEnd = exTo > endDate ? endDate : exTo;
                    
                    if (rangeStart <= rangeEnd) {
                        const calendarDays = Math.ceil((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1;
                        totalAnnualLeaveCalendarDays += calendarDays;
                    }
                } catch {
                    // Skip invalid date ranges
                }
            }

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
        // AL MARAGHI MOTORS: Calculate extra prev month deductible minutes
        // ============================================================
        const calculateExtraPrevMonthData = (emp, graceMinutes, prevMonthSalaryAmount, workingHours) => {
            if (!isAlMaraghi || !hasExtraPrevMonthRange) {
                return { extraDeductibleMinutes: 0, extraLopDays: 0, extraLopPay: 0, extraDeductibleHoursPay: 0, prevMonthDivisor: otDivisor };
            }

            const attendanceIdStr = String(emp.attendance_id);
            const includeSeconds = false;
            
            // PROJECT-SPECIFIC OVERRIDE: "January – Al Maraghi Motors"
            const isJanuaryAlMaraghiProject = project.name === 'January - Al Maraghi Motors' || 
                                               project.name === 'January – Al Maraghi Motors';
            
            let effectivePrevMonthFrom = extraPrevMonthFrom;
            let effectivePrevMonthTo = extraPrevMonthTo;
            let effectiveLopOnlyDate = extraPrevMonthTo;
            
            if (isJanuaryAlMaraghiProject) {
                effectivePrevMonthFrom = '2025-12-29';
                effectivePrevMonthTo = '2025-12-31';
                effectiveLopOnlyDate = '2025-12-31';
                
                console.log(`[createSalarySnapshotsForDateRange] PROJECT OVERRIDE: Using prev month range 29-31 Dec, LOP only on 31 Dec`);
            }
            
            const employeePunches = punches.filter(p => 
                String(p.attendance_id) === attendanceIdStr &&
                p.punch_date >= effectivePrevMonthFrom && 
                p.punch_date <= effectivePrevMonthTo
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

            let totalLateMinutes = 0;
            let totalEarlyMinutes = 0;
            let totalOtherMinutes = 0;
            let totalApprovedMinutes = 0;
            let extraLopDays = 0;
            const lastDayOfPrevMonth = effectiveLopOnlyDate;

            const startDate = new Date(effectivePrevMonthFrom);
            const endDate = new Date(effectivePrevMonthTo);

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getUTCDay();
                const isLastDayOfPrevMonth = (dateStr === lastDayOfPrevMonth);

                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (emp.weekly_off) {
                    weeklyOffDay = dayNameToNumber[emp.weekly_off];
                }
                
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue;
                }

                // FIX Issue 3: Use date string comparison to avoid timezone issues
                const matchingExceptions = employeeExceptions.filter(ex => {
                    try {
                        return dateStr >= ex.date_from && dateStr <= ex.date_to;
                    } catch { return false; }
                });

                const hasPublicHoliday = matchingExceptions.some(ex => 
                    ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF'
                );
                if (hasPublicHoliday) continue;

                const dateException = matchingExceptions.length > 0
                    ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                    : null;

                if (dateException && dateException.type === 'MANUAL_ABSENT') {
                    if (isLastDayOfPrevMonth) {
                        extraLopDays = 1;
                    }
                    continue;
                }

                if (dateException && [
                    'MANUAL_PRESENT', 'MANUAL_HALF', 'SICK_LEAVE', 'ANNUAL_LEAVE'
                ].includes(dateException.type)) {
                    continue;
                }

                const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr);
                
                if (rawDayPunches.length === 0) {
                    if (isLastDayOfPrevMonth) {
                        extraLopDays = 1;
                    }
                    continue;
                }

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

                if (!shift) continue;

                const dayPunches = filterMultiplePunches(rawDayPunches, includeSeconds);

                let allowedMinutesForDay = 0;
                if (dateException && dateException.type === 'ALLOWED_MINUTES' && 
                    dateException.approval_status === 'approved_dept_head') {
                    allowedMinutesForDay = dateException.allowed_minutes || 0;
                    totalApprovedMinutes += allowedMinutesForDay;
                }

                const hasManualTimeException = dateException && (
                    dateException.type === 'MANUAL_LATE' || 
                    dateException.type === 'MANUAL_EARLY_CHECKOUT' ||
                    (dateException.late_minutes > 0) ||
                    (dateException.early_checkout_minutes > 0) ||
                    (dateException.other_minutes > 0)
                );

                let dayLateMinutes = 0;
                let dayEarlyMinutes = 0;
                let dayOtherMinutes = 0;

                if (hasManualTimeException) {
                    if (dateException.late_minutes > 0) dayLateMinutes = dateException.late_minutes;
                    if (dateException.early_checkout_minutes > 0) dayEarlyMinutes = dateException.early_checkout_minutes;
                    if (dateException.other_minutes > 0) dayOtherMinutes = dateException.other_minutes;
                } else if (dayPunches.length > 0) {
                    const punchMatches = matchPunchesToShiftPoints(dayPunches, shift, includeSeconds);
                    
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
                }

                totalLateMinutes += dayLateMinutes;
                totalEarlyMinutes += dayEarlyMinutes;
                totalOtherMinutes += dayOtherMinutes;
            }

            const totalExtraDeductibleMinutes = Math.max(0, 
                totalLateMinutes + totalEarlyMinutes + totalOtherMinutes - graceMinutes - totalApprovedMinutes
            );

            const prevMonthDivisor = otDivisor;
            const extraLopPay = extraLopDays > 0 ? (prevMonthSalaryAmount / prevMonthDivisor) * extraLopDays : 0;
            const extraDeductibleHours = totalExtraDeductibleMinutes / 60;
            const prevMonthHourlyRate = prevMonthSalaryAmount / prevMonthDivisor / workingHours;
            const extraDeductibleHoursPay = prevMonthHourlyRate * extraDeductibleHours;

            return {
                extraDeductibleMinutes: totalExtraDeductibleMinutes,
                extraLopDays: extraLopDays,
                extraLopPay: Math.round(extraLopPay * 100) / 100,
                extraDeductibleHoursPay: Math.round(extraDeductibleHoursPay * 100) / 100,
                prevMonthDivisor: prevMonthDivisor
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
            console.log(`[createSalarySnapshotsForDateRange] Filtered to ${eligibleEmployees.length} employees from custom_employee_ids`);
        }
        
        for (const emp of eligibleEmployees) {
            // Find matching salary record (REQUIRED for salary snapshot)
            const baseSalary = salaries.find(s => 
                String(s.employee_id) === String(emp.hrms_id) || 
                String(s.attendance_id) === String(emp.attendance_id)
            );
            
            // Skip if no salary record
            if (!baseSalary) {
                console.log(`[createSalarySnapshotsForDateRange] Skipping ${emp.name} (${emp.attendance_id}) - no salary record`);
                continue;
            }
            
            // ============================================================
            // AL MARAGHI MOTORS: SALARY INCREMENT RESOLUTION
            // ============================================================
            let currentMonthSalary = { ...baseSalary };
            let prevMonthSalary = { ...baseSalary };
            
            if (isAlMaraghi && salaryIncrements.length > 0) {
                const empIncrements = salaryIncrements.filter(inc => 
                    String(inc.employee_id) === String(emp.hrms_id) ||
                    String(inc.attendance_id) === String(emp.attendance_id)
                );
                
                if (empIncrements.length > 0) {
                    const currentMonthStr = salaryMonthStartStr;
                    const applicableCurrentIncrements = empIncrements
                        .filter(inc => inc.effective_month <= currentMonthStr)
                        .sort((a, b) => new Date(b.effective_month) - new Date(a.effective_month));
                    
                    if (applicableCurrentIncrements.length > 0) {
                        const currentInc = applicableCurrentIncrements[0];
                        currentMonthSalary = {
                            ...baseSalary,
                            basic_salary: currentInc.new_basic_salary || baseSalary.basic_salary,
                            allowances: currentInc.new_allowances || baseSalary.allowances,
                            allowances_with_bonus: currentInc.new_allowances_with_bonus || baseSalary.allowances_with_bonus,
                            total_salary: currentInc.new_total_salary || baseSalary.total_salary
                        };
                    }
                    
                    if (hasExtraPrevMonthRange && extraPrevMonthFrom) {
                        const prevMonthDate = new Date(extraPrevMonthFrom);
                        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
                        
                        const applicablePrevIncrements = empIncrements
                            .filter(inc => inc.effective_month <= prevMonthStr)
                            .sort((a, b) => new Date(b.effective_month) - new Date(a.effective_month));
                        
                        if (applicablePrevIncrements.length > 0) {
                            const prevInc = applicablePrevIncrements[0];
                            prevMonthSalary = {
                                ...baseSalary,
                                basic_salary: prevInc.new_basic_salary || baseSalary.basic_salary,
                                allowances: prevInc.new_allowances || baseSalary.allowances,
                                allowances_with_bonus: prevInc.new_allowances_with_bonus || baseSalary.allowances_with_bonus,
                                total_salary: prevInc.new_total_salary || baseSalary.total_salary
                            };
                        }
                    }
                }
            }
            
            const salary = currentMonthSalary;

            // Check if employee has analysis result
            const analysisResult = analysisResults.find(r => String(r.attendance_id) === String(emp.attendance_id));
            const hasAnalysisResult = !!analysisResult;
            
            let calculated;
            let attendanceSource;
            
            // ALWAYS recalculate for custom date range with assumed present days support
            calculated = recalculateEmployeeAttendance(emp, date_from, date_to, assumedPresentDays);

            if (hasAnalysisResult) {
                attendanceSource = 'ANALYZED';
                analyzedCount++;
            } else {
                attendanceSource = 'NO_ATTENDANCE_DATA';
                noAttendanceCount++;
                console.log(`[createSalarySnapshotsForDateRange] Computing attendance for missing employee ${emp.name} (${emp.attendance_id})`);
            }

            const totalSalaryAmount = salary?.total_salary || 0;
            const workingHours = salary?.working_hours || baseSalary?.working_hours || 9;
            const basicSalary = salary?.basic_salary || 0;
            const allowancesAmount = Number(salary?.allowances) || 0;
            const prevMonthTotalSalary = prevMonthSalary?.total_salary || totalSalaryAmount;

            // Get salary leave days from ANNUAL_LEAVE exceptions
            // FIX Issue 4: Use same logic as createSalarySnapshots.js - direct sum, no proportional calculation
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
            
            // Salary Leave Amount with rounding UP to nearest multiple of 5
            const salaryForLeave = basicSalary + allowancesAmount;
            const rawSalaryLeaveAmount = salaryLeaveDays > 0 ? (salaryForLeave / divisor) * salaryLeaveDays : 0;
            const salaryLeaveAmount = rawSalaryLeaveAmount > 0 ? Math.ceil(rawSalaryLeaveAmount / 5) * 5 : 0;
            
            const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);

            // CRITICAL FIX: Use the finalized deductible_minutes from AnalysisResult directly
            // The Attendance Report already applied grace, so we must NOT apply it again
            // If no AnalysisResult exists (NO_ATTENDANCE_DATA), calculate it fresh
            let deductibleMinutes;
            if (hasAnalysisResult && analysisResult.deductible_minutes !== undefined && analysisResult.deductible_minutes !== null) {
                // Use the exact value from the finalized Attendance Report (grace already applied)
                deductibleMinutes = analysisResult.deductible_minutes;
                console.log(`[createSalarySnapshotsForDateRange] ${emp.name}: Using AnalysisResult.deductible_minutes = ${deductibleMinutes}`);
            } else {
                // Fallback: Calculate for employees without AnalysisResult
                const totalTimeIssues = calculated.lateMinutes + calculated.earlyCheckoutMinutes + calculated.otherMinutes;
                deductibleMinutes = Math.max(0, totalTimeIssues - calculated.graceMinutes - calculated.approvedMinutes);
                console.log(`[createSalarySnapshotsForDateRange] ${emp.name}: Calculated deductible_minutes = ${deductibleMinutes} (no AnalysisResult)`);
            }
            const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;
            
            // Current month hourly rate uses salary divisor
            const hourlyRate = totalSalaryAmount / divisor / workingHours;
            
            // Current month deductible hours pay (uses salary divisor)
            const currentMonthDeductibleHoursPay = Math.round(hourlyRate * deductibleHours * 100) / 100;
            
            // AL MARAGHI: Calculate extra prev month data (uses OT divisor and PREVIOUS MONTH salary)
            const extraPrevMonthData = calculateExtraPrevMonthData(emp, calculated.graceMinutes, prevMonthTotalSalary, workingHours);
            const extraPrevMonthDeductibleMinutes = extraPrevMonthData.extraDeductibleMinutes;
            const extraPrevMonthLopDays = extraPrevMonthData.extraLopDays;
            const extraPrevMonthLopPay = extraPrevMonthData.extraLopPay;
            const extraPrevMonthDeductibleHoursPay = extraPrevMonthData.extraDeductibleHoursPay;
            
            // Total deductible hours pay = current month + prev month (FIX Issue 2)
            const totalDeductibleHoursPay = currentMonthDeductibleHoursPay + extraPrevMonthDeductibleHoursPay;
            
            // Total deductible minutes and hours (for display)
            const totalDeductibleMinutes = deductibleMinutes + extraPrevMonthDeductibleMinutes;
            const totalDeductibleHours = Math.round((totalDeductibleMinutes / 60) * 100) / 100;

            // ============================================================
            // OT SALARY CALCULATION
            // RULE: If employee has ANY salary increments, use PREVIOUS MONTH salary for OT
            // If no increments exist, use current month salary for OT
            // ============================================================
            let otBaseSalary = totalSalaryAmount; // Default: current month
            if (isAlMaraghi && salaryIncrements.length > 0) {
                const empHasIncrements = salaryIncrements.some(inc => 
                    String(inc.employee_id) === String(emp.hrms_id) ||
                    String(inc.attendance_id) === String(emp.attendance_id)
                );
                if (empHasIncrements) {
                    // Use previous month salary for OT calculations
                    otBaseSalary = prevMonthTotalSalary;
                    console.log(`[createSalarySnapshotsForDateRange] ${emp.name}: Using prev month salary (${prevMonthTotalSalary}) for OT (has increments)`);
                }
            }
            const otHourlyRate = otBaseSalary / otDivisor / workingHours;

            // Final total calculation:
            // Total = Base Salary - Net Deduction - CurrentMonthDeductibleHoursPay - PrevMonthLopPay - PrevMonthDeductibleHoursPay
            const finalTotal = totalSalaryAmount - netDeduction - totalDeductibleHoursPay - extraPrevMonthLopPay;
            
            console.log(`[createSalarySnapshotsForDateRange] Employee ${emp.name}: prevMonth deduct=${extraPrevMonthDeductibleMinutes}min, LOP=${extraPrevMonthLopDays}, lopPay=${extraPrevMonthLopPay}, deductPay=${extraPrevMonthDeductibleHoursPay}`);

            // ============================================================
            // WPS SPLIT LOGIC (Al Maraghi Motors only)
            // Balance must always be a multiple of 100 (round down)
            // ============================================================
            let wpsAmount = finalTotal;
            let balanceAmount = 0;
            let wpsCapApplied = false;
            const wpsCapEnabled = salary?.wps_cap_enabled || false;
            const wpsCapAmount = salary?.wps_cap_amount ?? 4900;

            if (project.company === 'Al Maraghi Motors' && wpsCapEnabled) {
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
                ot_base_salary: otBaseSalary, // Salary used for OT calculations (prev month if increments exist)
                working_hours: workingHours,
                working_days: calculated.workingDays,
                salary_divisor: divisor,
                ot_divisor: otDivisor,
                prev_month_divisor: extraPrevMonthData.prevMonthDivisor || otDivisor,
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
                // CRITICAL: These fields MUST be populated for the UI to display them
                extra_prev_month_deductible_minutes: extraPrevMonthDeductibleMinutes || 0,
                extra_prev_month_lop_days: extraPrevMonthLopDays || 0,
                extra_prev_month_lop_pay: extraPrevMonthLopPay || 0,
                extra_prev_month_deductible_hours_pay: extraPrevMonthDeductibleHoursPay || 0,
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                salary_leave_days: salaryLeaveDays,
                leaveDays: leaveDays,
                leavePay: Math.round(leavePay * 100) / 100,
                salaryLeaveAmount: Math.round(salaryLeaveAmount * 100) / 100,
                // Total deductible hours (current + prev month combined)
                deductibleHours: totalDeductibleHours,
                deductibleHoursPay: Math.round(totalDeductibleHoursPay * 100) / 100,
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

        console.log(`[createSalarySnapshotsForDateRange] Generated ${snapshots.length} snapshots for date range ${date_from} to ${date_to} (${analyzedCount} analyzed, ${noAttendanceCount} no attendance data)`);

        return Response.json({
            success: true,
            snapshots: snapshots,
            count: snapshots.length,
            analyzed_count: analyzedCount,
            no_attendance_count: noAttendanceCount,
            date_range: { from: date_from, to: date_to }
        });

    } catch (error) {
        console.error('Create salary snapshots for date range error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});