import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Backend function to run attendance analysis for a project
 * This contains the complete analysis logic moved from frontend
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, date_from, date_to, report_name } = await req.json();

        if (!project_id || !date_from || !date_to) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        const userRole = user?.extended_role || user?.role || 'user';
        
        // Security: Verify access
        if (userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'ceo') {
            if (project.company !== user.company) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Fetch all required data
        const [punches, shifts, exceptions, employees, rulesData] = await Promise.all([
            base44.asServiceRole.entities.Punch.filter({ project_id }),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id }),
            base44.asServiceRole.entities.Exception.filter({ project_id }),
            base44.asServiceRole.entities.Employee.filter({ company: project.company }),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company })
        ]);

        // Parse rules
        let rules = null;
        if (rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                return Response.json({ error: 'Invalid rules configuration' }, { status: 400 });
            }
        }

        if (!rules) {
            return Response.json({ error: 'No attendance rules configured for this company' }, { status: 400 });
        }

        // Get unique employee IDs from punches
        const uniqueEmployeeIds = [...new Set(punches.map(p => p.attendance_id))];

        // Create report run
        const reportRun = await base44.asServiceRole.entities.ReportRun.create({
            project_id,
            report_name: report_name || `Report - ${new Date().toLocaleDateString()}`,
            date_from,
            date_to,
            employee_count: uniqueEmployeeIds.length
        });

        // Helper functions (moved from frontend)
        const parseTime = (timeStr, includeSeconds = false) => {
            try {
                if (!timeStr || timeStr === '—') return null;
                
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

        const matchPunchesToShiftPoints = (dayPunches, shift, includeSeconds = false) => {
            if (!shift || dayPunches.length === 0) return [];
            
            const punchesWithTime = dayPunches.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw, includeSeconds)
            })).filter(p => p.time).sort((a, b) => a.time - b.time);
            
            if (punchesWithTime.length === 0) return [];
            
            const shiftPoints = [
                { type: 'AM_START', time: parseTime(shift.am_start), label: shift.am_start },
                { type: 'AM_END', time: parseTime(shift.am_end), label: shift.am_end },
                { type: 'PM_START', time: parseTime(shift.pm_start), label: shift.pm_start },
                { type: 'PM_END', time: parseTime(shift.pm_end), label: shift.pm_end }
            ].filter(sp => sp.time);
            
            const matches = [];
            const usedShiftPoints = new Set();
            
            for (const punch of punchesWithTime) {
                let closestMatch = null;
                let minDistance = Infinity;
                let isExtendedMatch = false;
                let isFarExtendedMatch = false;
                
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    
                    const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                    
                    if (distance <= 60 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                    }
                }
                
                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;
                        
                        const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                        
                        if (distance <= 120 && distance < minDistance) {
                            minDistance = distance;
                            closestMatch = shiftPoint;
                            isExtendedMatch = true;
                        }
                    }
                }
                
                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;
                        
                        const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                        
                        if (distance <= 180 && distance < minDistance) {
                            minDistance = distance;
                            closestMatch = shiftPoint;
                            isFarExtendedMatch = true;
                        }
                    }
                }
                
                if (closestMatch) {
                    matches.push({
                        punch,
                        matchedTo: closestMatch.type,
                        shiftTime: closestMatch.time,
                        distance: minDistance,
                        isExtendedMatch,
                        isFarExtendedMatch
                    });
                    usedShiftPoints.add(closestMatch.type);
                } else {
                    matches.push({
                        punch,
                        matchedTo: null,
                        shiftTime: null,
                        distance: null,
                        isExtendedMatch: false,
                        isFarExtendedMatch: false
                    });
                }
            }
            
            return matches;
        };

        const detectPartialDay = (dayPunches, shift, includeSeconds = false) => {
            if (!shift || dayPunches.length < 2) return { isPartial: false, reason: null };
            
            const punchesWithTime = dayPunches.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw, includeSeconds)
            })).filter(p => p.time).sort((a, b) => a.time - b.time);
            
            if (punchesWithTime.length < 2) return { isPartial: false, reason: null };
            
            const firstPunch = punchesWithTime[0].time;
            const lastPunch = punchesWithTime[punchesWithTime.length - 1].time;
            
            const amStart = parseTime(shift.am_start);
            const pmEnd = parseTime(shift.pm_end);
            
            if (!amStart || !pmEnd) return { isPartial: false, reason: null };
            
            const expectedMinutes = (pmEnd - amStart) / (1000 * 60);
            const actualMinutes = (lastPunch - firstPunch) / (1000 * 60);
            
            if (actualMinutes < expectedMinutes * 0.5 && actualMinutes > 0) {
                return { 
                    isPartial: true, 
                    reason: `Worked ${Math.round(actualMinutes)} min (expected ${Math.round(expectedMinutes)} min)` 
                };
            }
            
            return { isPartial: false, reason: null };
        };

        const filterMultiplePunches = (punchList, shift, includeSeconds = false) => {
            if (punchList.length <= 1) return punchList;

            const punchesWithTime = punchList.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw, includeSeconds)
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

        // Analyze employee function
        const analyzeEmployee = async (attendance_id) => {
            const attendanceIdNum = Number(attendance_id);
            const employeePunches = punches.filter(p => 
                Number(p.attendance_id) === attendanceIdNum && 
                p.punch_date >= date_from && 
                p.punch_date <= date_to
            );
            const employeeShifts = shifts.filter(s => Number(s.attendance_id) === attendanceIdNum);
            const employeeExceptions = exceptions.filter(e => {
                try {
                    return (String(e.attendance_id) === 'ALL' || Number(e.attendance_id) === attendanceIdNum) &&
                           e.use_in_analysis !== false &&
                           e.is_custom_type !== true;
                } catch {
                    return false;
                }
            });
            
            const employee = employees.find(e => Number(e.attendance_id) === attendanceIdNum);
            const includeSeconds = project.company === 'Al Maraghi Automotive';

            let working_days = 0;
            let present_days = 0;
            let full_absence_count = 0;
            let half_absence_count = 0;
            let sick_leave_count = 0;
            let annual_leave_count = 0;
            let late_minutes = 0;
            let early_checkout_minutes = 0;
            let other_minutes = 0;
            let total_approved_minutes = 0;
            const abnormal_dates_list = [];
            const critical_abnormal_dates = [];
            const auto_resolutions = [];

            const startDate = new Date(date_from);
            const endDate = new Date(date_to);
            
            const dayNameToNumber = {
                'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                'Thursday': 4, 'Friday': 5, 'Saturday': 6
            };
            
            for (let d = new Date(startDate); d <= endDate; d = new Date(d.setDate(d.getDate() + 1))) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getDay();

                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (employee?.weekly_off) {
                    weeklyOffDay = dayNameToNumber[employee.weekly_off];
                }
                
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue;
                }

                working_days++;

                let dateException = null;
                try {
                    const matchingExceptions = employeeExceptions.filter(ex => {
                        try {
                            const exFrom = new Date(ex.date_from);
                            const exTo = new Date(ex.date_to);
                            return currentDate >= exFrom && currentDate <= exTo;
                        } catch {
                            return false;
                        }
                    });

                    dateException = matchingExceptions.length > 0
                        ? matchingExceptions.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
                        : null;
                } catch {
                    dateException = null;
                }

                if (dateException) {
                    if (dateException.type === 'OFF' || dateException.type === 'PUBLIC_HOLIDAY') {
                        working_days--;
                        continue;
                    } else if (dateException.type === 'MANUAL_PRESENT') {
                        present_days++;
                    } else if (dateException.type === 'MANUAL_ABSENT') {
                        full_absence_count++;
                        continue;
                    } else if (dateException.type === 'MANUAL_HALF') {
                        present_days++;
                        half_absence_count++;
                    } else if (dateException.type === 'SICK_LEAVE') {
                        working_days--;
                        sick_leave_count++;
                        continue;
                    } else if (dateException.type === 'ANNUAL_LEAVE') {
                        const dayPunchesForLeave = employeePunches.filter(p => p.punch_date === dateStr);
                        if (dayPunchesForLeave.length === 0) {
                            working_days--;
                            annual_leave_count++;
                            continue;
                        } else {
                            present_days++;
                        }
                    }
                }

                const isShiftEffective = (s) => {
                    if (!s.effective_from || !s.effective_to) return true;
                    const from = new Date(s.effective_from);
                    const to = new Date(s.effective_to);
                    const currentDateOnly = new Date(currentDate);
                    currentDateOnly.setHours(0, 0, 0, 0);
                    const fromDateOnly = new Date(from);
                    fromDateOnly.setHours(0, 0, 0, 0);
                    const toDateOnly = new Date(to);
                    toDateOnly.setHours(0, 0, 0, 0);
                    return currentDateOnly >= fromDateOnly && currentDateOnly <= toDateOnly;
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
                                if (Array.isArray(applicableDaysArray) && applicableDaysArray.length > 0) {
                                    if (applicableDaysArray.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) {
                                        shift = s;
                                        break;
                                    }
                                }
                            } catch (e) {
                                // Continue to next shift
                            }
                        }
                    }
                    
                    if (!shift) {
                        if (dayOfWeek === 5) {
                            shift = employeeShifts.find(s => s.is_friday_shift && !s.date && isShiftEffective(s));
                            if (!shift) {
                                shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                            }
                        } else {
                            shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                        }
                    }
                }

                if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
                    try {
                        const isFriday = dayOfWeek === 5;
                        const shouldApplyOverride = dateException.include_friday || !isFriday;

                        if (shouldApplyOverride) {
                            shift = {
                                am_start: dateException.new_am_start,
                                am_end: dateException.new_am_end,
                                pm_start: dateException.new_pm_start,
                                pm_end: dateException.new_pm_end
                            };
                        }
                    } catch {
                        // Continue with existing shift
                    }
                }

                const dayPunches = employeePunches
                    .filter(p => p.punch_date === dateStr)
                    .sort((a, b) => {
                        const timeA = parseTime(a.timestamp_raw, includeSeconds);
                        const timeB = parseTime(b.timestamp_raw, includeSeconds);
                        return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                    });

                let filteredPunches = filterMultiplePunches(dayPunches, shift, includeSeconds);
                
                let punchMatches = [];
                let hasUnmatchedPunch = false;
                if (shift && filteredPunches.length > 0) {
                    punchMatches = matchPunchesToShiftPoints(filteredPunches, shift, includeSeconds);
                    hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
                }
                
                const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                       shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                       shift.am_end !== '—' && shift.pm_start !== '—' &&
                                       shift.am_end !== '-' && shift.pm_start !== '-';
                const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;

                const partialDayResult = detectPartialDay(filteredPunches, shift, includeSeconds);

                if (dateException && (dateException.type === 'MANUAL_LATE' || dateException.type === 'MANUAL_EARLY_CHECKOUT')) {
                    if (filteredPunches.length === 0) {
                        present_days++;
                    }
                }

                if (filteredPunches.length > 0) {
                    if (partialDayResult.isPartial) {
                        present_days++;
                        half_absence_count++;
                        auto_resolutions.push({
                            date: dateStr,
                            type: 'PARTIAL_DAY_DETECTED',
                            details: partialDayResult.reason
                        });
                    } else {
                        present_days++;
                    }

                    if (rules?.attendance_calculation?.half_day_rule === 'punch_count_or_duration' && !partialDayResult.isPartial) {
                        if (filteredPunches.length < 2 && !isSingleShift) {
                            half_absence_count++;
                        }
                    }
                } else {
                    full_absence_count++;
                }

                // Check for approved minutes (foundation for all companies, currently enabled for Al Maraghi Auto Repairs only)
                let approvedMinutesForDay = 0;
                try {
                    if (rules.approved_minutes_enabled && 
                        dateException && 
                        dateException.type === 'ALLOWED_MINUTES' && 
                        dateException.approval_status === 'approved_dept_head') {
                        approvedMinutesForDay = dateException.allowed_minutes || 0;
                    }
                } catch {
                    approvedMinutesForDay = 0;
                }

                const hasManualTimeException = dateException && (
                    dateException.type === 'MANUAL_LATE' || 
                    dateException.type === 'MANUAL_EARLY_CHECKOUT' ||
                    (dateException.late_minutes && dateException.late_minutes > 0) ||
                    (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) ||
                    (dateException.other_minutes && dateException.other_minutes > 0)
                );
                
                const shouldSkipTimeCalculation = dateException && [
                    'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
                ].includes(dateException.type);

                if (hasManualTimeException) {
                    if (dateException.late_minutes && dateException.late_minutes > 0) {
                        late_minutes += dateException.late_minutes;
                    }
                    if (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) {
                        early_checkout_minutes += dateException.early_checkout_minutes;
                    }
                    if (dateException.other_minutes && dateException.other_minutes > 0) {
                        other_minutes += dateException.other_minutes;
                    }
                } else if (shift && punchMatches.length > 0 && !shouldSkipTimeCalculation) {
                    let dayLateMinutes = 0;
                    let dayEarlyMinutes = 0;
                    
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        
                        const punchTime = match.punch.time;
                        const shiftTime = match.shiftTime;
                        
                        if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                            if (punchTime > shiftTime) {
                                const minutes = Math.round((punchTime - shiftTime) / (1000 * 60));
                                dayLateMinutes += minutes;
                            }
                        }
                        
                        if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                            if (punchTime < shiftTime) {
                                const minutes = Math.round((shiftTime - punchTime) / (1000 * 60));
                                dayEarlyMinutes += minutes;
                            }
                        }
                    }
                    
                    // Apply approved minutes offset if enabled
                    if (rules.approved_minutes_enabled && approvedMinutesForDay > 0) {
                        const totalDayMinutes = dayLateMinutes + dayEarlyMinutes;
                        const excessMinutes = Math.max(0, totalDayMinutes - approvedMinutesForDay);
                        
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
                    
                    late_minutes += dayLateMinutes;
                    early_checkout_minutes += dayEarlyMinutes;
                }

                const expectedPunches = isSingleShift ? 2 : 4;
                
                const hasExtendedMatch = punchMatches.some(m => m.isExtendedMatch);
                const hasFarExtendedMatch = punchMatches.some(m => m.isFarExtendedMatch);
                if (hasUnmatchedPunch) {
                    abnormal_dates_list.push(dateStr);
                    critical_abnormal_dates.push(dateStr);
                }
                if (hasFarExtendedMatch) {
                    abnormal_dates_list.push(dateStr);
                    critical_abnormal_dates.push(dateStr);
                }
                if (hasExtendedMatch) {
                    abnormal_dates_list.push(dateStr);
                }
                if (rules.abnormality_rules?.detect_missing_punches && filteredPunches.length > 0 && filteredPunches.length < expectedPunches) {
                    abnormal_dates_list.push(dateStr);
                    critical_abnormal_dates.push(dateStr);
                }
                if (rules.abnormality_rules?.detect_extra_punches && filteredPunches.length > expectedPunches) {
                    abnormal_dates_list.push(dateStr);
                }
                
                if (shift && filteredPunches.length > 0) {
                    for (const punch of filteredPunches) {
                        const punchTime = parseTime(punch.timestamp_raw, includeSeconds);
                        if (!punchTime) continue;
                        
                        const amStartTime = parseTime(shift.am_start);
                        const pmStartTime = parseTime(shift.pm_start);
                        
                        if (amStartTime) {
                            const latenessMinutes = (punchTime - amStartTime) / (1000 * 60);
                            if (latenessMinutes > 120 && latenessMinutes < 480) {
                                critical_abnormal_dates.push(dateStr);
                                auto_resolutions.push({
                                    date: dateStr,
                                    type: 'EXTREME_LATENESS',
                                    details: `Punch at ${Math.round(latenessMinutes)} minutes past AM start`
                                });
                            }
                        }
                        
                        if (pmStartTime) {
                            const latenessMinutes = (punchTime - pmStartTime) / (1000 * 60);
                            if (latenessMinutes > 120 && latenessMinutes < 480) {
                                critical_abnormal_dates.push(dateStr);
                                auto_resolutions.push({
                                    date: dateStr,
                                    type: 'EXTREME_LATENESS',
                                    details: `Punch at ${Math.round(latenessMinutes)} minutes past PM start`
                                });
                            }
                        }
                    }
                }

                const dateFormatted = `${String(currentDate.getDate()).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
                if (rules.date_rules?.special_abnormal_dates?.includes(dateFormatted)) {
                    abnormal_dates_list.push(dateStr);
                }

                if (rules.date_rules?.always_mark_first_date_abnormal && currentDate.getTime() === startDate.getTime()) {
                    abnormal_dates_list.push(dateStr);
                }
            }

            const criticalDatesFormatted = critical_abnormal_dates.length > 0
                ? [...new Set(critical_abnormal_dates)].map(d => new Date(d).toLocaleDateString()).join(', ')
                : '';
            const autoResolutionNotes = auto_resolutions.length > 0 
                ? auto_resolutions.map(r => `${new Date(r.date).toLocaleDateString()}: ${r.details}`).join(' | ')
                : '';
            
            const dept = employee?.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
            const carriedGrace = project.use_carried_grace_minutes ? (employee?.carried_grace_minutes || 0) : 0;
            
            // Calculate deductible_minutes for salary (for Al Maraghi Auto Repairs)
            const deductible_minutes = late_minutes + early_checkout_minutes + other_minutes - (approvedMinutesForDay || 0);

            return {
                attendance_id,
                working_days,
                present_days,
                full_absence_count,
                half_absence_count,
                sick_leave_count,
                annual_leave_count,
                late_minutes,
                early_checkout_minutes,
                other_minutes,
                approved_minutes: approvedMinutesForDay || 0,
                deductible_minutes: Math.max(0, deductible_minutes),
                grace_minutes: baseGrace + carriedGrace,
                abnormal_dates: [...new Set(abnormal_dates_list)].join(', '),
                notes: criticalDatesFormatted,
                auto_resolutions: autoResolutionNotes
            };
        };

        // Process all employees
        const allResults = [];
        for (const attendance_id of uniqueEmployeeIds) {
            const result = await analyzeEmployee(attendance_id);
            allResults.push({
                project_id,
                report_run_id: reportRun.id,
                ...result
            });
        }

        // Save results in batches with delay to avoid rate limits
        const batchSize = 50;
        for (let i = 0; i < allResults.length; i += batchSize) {
            const batch = allResults.slice(i, i + batchSize);
            await base44.asServiceRole.entities.AnalysisResult.bulkCreate(batch);
            
            // Add delay between batches to avoid rate limits
            if (i + batchSize < allResults.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Update project status
        await base44.asServiceRole.entities.Project.update(project_id, {
            last_saved_report_id: reportRun.id,
            status: 'analyzed'
        });

        return Response.json({
            success: true,
            report_run_id: reportRun.id,
            processed_count: allResults.length,
            total_count: uniqueEmployeeIds.length,
            message: `Analysis complete for ${allResults.length} employees`
        });

    } catch (error) {
        console.error('Run analysis error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});