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
        
        // Security: Verify access (User and Supervisor have full project access)
        if (userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'ceo' && userRole !== 'user') {
            if (project.company !== user.company) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Fetch all required data
        const [punches, shifts, exceptions, allEmployees, rulesData, projectEmployees, ramadanSchedules] = await Promise.all([
            base44.asServiceRole.entities.Punch.filter({ project_id }),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id }),
            base44.asServiceRole.entities.Exception.filter({ project_id }),
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company }),
            base44.asServiceRole.entities.ProjectEmployee.filter({ project_id }),
            base44.asServiceRole.entities.RamadanSchedule.filter({ company: project.company, active: true })
        ]);

        // Parse Ramadan schedules for shift lookup - only include schedules that overlap with project date range
        const projectStart = new Date(date_from);
        const projectEnd = new Date(date_to);
        let ramadanShiftsLookup = {};
        
        for (const schedule of ramadanSchedules) {
            try {
                const ramadanStart = new Date(schedule.ramadan_start_date);
                const ramadanEnd = new Date(schedule.ramadan_end_date);
                
                // Check if Ramadan period overlaps with project date range
                const hasOverlap = ramadanStart <= projectEnd && ramadanEnd >= projectStart;
                
                if (hasOverlap) {
                    const week1Data = schedule.week1_shifts ? JSON.parse(schedule.week1_shifts) : {};
                    const week2Data = schedule.week2_shifts ? JSON.parse(schedule.week2_shifts) : {};
                    
                    ramadanShiftsLookup[schedule.id] = {
                        start: ramadanStart,
                        end: ramadanEnd,
                        week1: week1Data,
                        week2: week2Data
                    };
                    
                    console.log(`[runAnalysis] Ramadan schedule ${schedule.id} overlaps with project (${ramadanStart.toISOString().split('T')[0]} to ${ramadanEnd.toISOString().split('T')[0]})`);
                }
            } catch (e) {
                console.warn('[runAnalysis] Failed to parse Ramadan schedule:', schedule.id, e.message);
            }
        }

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

        // Filter employees based on custom selection or department
        let filteredEmployees = allEmployees;
        
        if (project.custom_employee_ids && project.custom_employee_ids.trim() !== '') {
            // Parse custom employee IDs (HRMS IDs) - keep as strings
            const customHrmsIds = project.custom_employee_ids
                .split(',')
                .map(id => id.trim())
                .filter(id => id && id !== 'NULL');
            
            console.log('[runAnalysis] Custom HRMS IDs:', customHrmsIds.length);
            
            // Filter employees by HRMS ID - string comparison
            filteredEmployees = allEmployees.filter(e => 
                customHrmsIds.includes(String(e.hrms_id))
            );
        }
        
        // Get attendance IDs of filtered employees - keep as strings
        const activeEmployeeAttendanceIds = filteredEmployees.map(e => String(e.attendance_id));
        
        // CRITICAL: Include ALL active employees, not just those with punches
        // Employees may have exceptions (annual leave, sick leave, LOP) even without any punches
        // This ensures they appear in attendance reports for proper tracking
        const uniqueEmployeeIds = [...activeEmployeeAttendanceIds];
        
        // Add project-specific employee overrides (for unmatched attendance IDs)
        const projectEmployeeIds = projectEmployees.map(pe => String(pe.attendance_id));
        for (const peId of projectEmployeeIds) {
            if (!uniqueEmployeeIds.includes(peId)) {
                uniqueEmployeeIds.push(peId);
            }
        }
        
        console.log('[runAnalysis] Total punches:', punches.length);
        console.log('[runAnalysis] Filtered employees:', filteredEmployees.length);
        console.log('[runAnalysis] Project employee overrides:', projectEmployees.length);
        console.log('[runAnalysis] Employees to analyze (all active + overrides):', uniqueEmployeeIds.length);
        
        // Combine master employees with project-specific overrides for lookups
        const employees = [
            ...filteredEmployees,
            // Add project employees as pseudo-employees for lookups
            ...projectEmployees.map(pe => ({
                attendance_id: pe.attendance_id,
                hrms_id: `PROJECT_${project_id}_${pe.attendance_id}`,
                name: pe.name,
                department: pe.department || 'Admin',
                weekly_off: pe.weekly_off || 'Sunday',
                active: true,
                _isProjectOverride: true
            }))
        ];

        // Create report run - count ALL active employees being analyzed
        const reportRun = await base44.asServiceRole.entities.ReportRun.create({
            project_id,
            report_name: report_name || `Report - ${new Date().toLocaleDateString()}`,
            date_from,
            date_to,
            employee_count: uniqueEmployeeIds.length
        });
        
        console.log('[runAnalysis] Created report run with', uniqueEmployeeIds.length, 'employees');

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
            const attendanceIdStr = String(attendance_id);
            const employeePunches = punches.filter(p => 
                String(p.attendance_id) === attendanceIdStr && 
                p.punch_date >= date_from && 
                p.punch_date <= date_to
            );
            const employeeShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
            const employeeExceptions = exceptions.filter(e => {
                try {
                    return (String(e.attendance_id) === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
                           e.use_in_analysis !== false &&
                           e.is_custom_type !== true;
                } catch {
                    return false;
                }
            });
            
            const employee = employees.find(e => String(e.attendance_id) === attendanceIdStr);
            const includeSeconds = project.company === 'Al Maraghi Automotive';

            let workingDays = 0;
            let presentDays = 0;
            let fullAbsenceCount = 0;
            let halfAbsenceCount = 0;
            let sickLeaveCount = 0;
            let lateMinutes = 0;
            let earlyCheckoutMinutes = 0;
            let otherMinutes = 0;
            let totalApprovedMinutes = 0;
            const abnormal_dates_set = new Set();
            const critical_abnormal_dates_set = new Set();
            const auto_resolutions = [];

            const startDate = new Date(date_from);
            const endDate = new Date(date_to);
            
            // Calculate annual leave as CALENDAR DAYS (not working days)
            // This is done upfront, counting all days including weekends/holidays
            let annualLeaveCount = 0;
            const annualLeaveExceptions = employeeExceptions.filter(ex => ex.type === 'ANNUAL_LEAVE');
            const annualLeaveDatesProcessed = new Set(); // Track dates already counted
            
            for (const alEx of annualLeaveExceptions) {
                try {
                    const exFrom = new Date(alEx.date_from);
                    const exTo = new Date(alEx.date_to);
                    
                    // Clamp to report date range
                    const rangeStart = exFrom < startDate ? startDate : exFrom;
                    const rangeEnd = exTo > endDate ? endDate : exTo;
                    
                    if (rangeStart <= rangeEnd) {
                        // Count each calendar day in the range
                        for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
                            const dateStr = d.toISOString().split('T')[0];
                            if (!annualLeaveDatesProcessed.has(dateStr)) {
                                annualLeaveDatesProcessed.add(dateStr);
                                annualLeaveCount++;
                            }
                        }
                    }
                } catch {
                    // Skip invalid date ranges
                }
            }
            
            const dayNameToNumber = {
                'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                'Thursday': 4, 'Friday': 5, 'Saturday': 6
            };
            
            for (let d = new Date(startDate); d <= endDate; d = new Date(d.setDate(d.getDate() + 1))) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                // CRITICAL: Use UTC day of week to avoid timezone issues
                // new Date(dateStr) creates a date at UTC midnight, so we must use getUTCDay()
                // Otherwise, server timezone can shift the day and cause incorrect weekly off detection
                const dayOfWeek = currentDate.getUTCDay();

                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (employee?.weekly_off) {
                    weeklyOffDay = dayNameToNumber[employee.weekly_off];
                }
                
                // Get ALL matching exceptions for this date first (to check DAY_SWAP)
                let matchingExceptions = [];
                try {
                    matchingExceptions = employeeExceptions.filter(ex => {
                        try {
                            const exFrom = new Date(ex.date_from);
                            const exTo = new Date(ex.date_to);
                            return currentDate >= exFrom && currentDate <= exTo;
                        } catch {
                            return false;
                        }
                    });
                } catch {
                    matchingExceptions = [];
                }
                
                // DAY_SWAP exception: Override weekly off for specific dates
                const daySwapException = matchingExceptions.find(ex => ex.type === 'DAY_SWAP');
                if (daySwapException) {
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const currentDayName = dayNames[dayOfWeek];
                    
                    // If current day matches new_weekly_off, treat it as weekly off
                    if (daySwapException.new_weekly_off === currentDayName) {
                        continue; // Skip this day - it's the new weekly off
                    }
                    
                    // If current day matches working_day_override, treat it as working day (ignore standard weekly off)
                    if (daySwapException.working_day_override === currentDayName) {
                        weeklyOffDay = null; // Override the weekly off - make this day a working day
                    }
                }
                
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue;
                }

                // matchingExceptions already fetched above for DAY_SWAP check

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
                    ? matchingExceptions.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
                    : null;

                if (dateException) {
                    if (dateException.type === 'MANUAL_PRESENT') {
                        presentDays++;
                        continue;  // Skip punch-based counting to prevent double-counting
                    } else if (dateException.type === 'MANUAL_ABSENT') {
                        fullAbsenceCount++;
                        continue;
                    } else if (dateException.type === 'MANUAL_HALF') {
                        presentDays++;
                        halfAbsenceCount++;
                        continue;  // Skip punch-based counting to prevent double-counting
                    } else if (dateException.type === 'SICK_LEAVE') {
                        // Sick leave counts as WORKING DAY (no deduction from working_days)
                        // Day is tracked separately as sick_leave_count
                        // No LOP deduction, no late/early calculation for this day
                        sickLeaveCount++;
                        continue;
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

                // Check for ANNUAL_LEAVE - already counted as calendar days upfront
                // Just skip this day if employee is on annual leave and didn't work
                const annualLeaveException = employeeExceptions.find(ex => {
                    try {
                        const exFrom = new Date(ex.date_from);
                        const exTo = new Date(ex.date_to);
                        return ex.type === 'ANNUAL_LEAVE' && currentDate >= exFrom && currentDate <= exTo;
                    } catch {
                        return false;
                    }
                });

                if (annualLeaveException) {
                    // Check if employee worked on this day despite annual leave
                    const dayPunchesForLeave = employeePunches.filter(p => p.punch_date === dateStr);
                    if (dayPunchesForLeave.length === 0) {
                        // Skip this day for attendance counting - annual leave already counted as calendar days upfront
                        // Decrement working days since this is a leave day (not a working day to count)
                        workingDays--;
                        continue;
                    }
                    // If employee worked, continue normal analysis
                }

                // Check for Ramadan shift first
                let ramadanShift = null;
                for (const scheduleId in ramadanShiftsLookup) {
                    const ramadanData = ramadanShiftsLookup[scheduleId];
                    if (currentDate >= ramadanData.start && currentDate <= ramadanData.end) {
                        // Calculate which week pattern to use (resets after Sunday)
                        const daysSinceStart = Math.floor((currentDate - ramadanData.start) / (1000 * 60 * 60 * 24));
                        let weekNumber = 1;
                        let dayCounter = 0;
                        
                        for (let i = 0; i <= daysSinceStart; i++) {
                            const checkDate = new Date(ramadanData.start);
                            checkDate.setDate(checkDate.getDate() + i);
                            const checkDayOfWeek = checkDate.getUTCDay();
                            
                            if (checkDayOfWeek === 0 && i > 0) {
                                weekNumber = weekNumber === 1 ? 2 : 1;
                            }
                        }
                        
                        const weekData = weekNumber === 1 ? ramadanData.week1 : ramadanData.week2;
                        const employeeShiftData = weekData[attendanceIdStr];
                        
                        if (employeeShiftData && employeeShiftData.active_shifts && employeeShiftData.active_shifts.length > 0) {
                            // Build shift object from Ramadan configuration
                            const activeShifts = employeeShiftData.active_shifts;
                            
                            if (activeShifts.includes('day') && activeShifts.includes('night')) {
                                // Both day and night shift
                                ramadanShift = {
                                    am_start: employeeShiftData.day_start || '',
                                    am_end: employeeShiftData.day_end || '',
                                    pm_start: employeeShiftData.night_start || '',
                                    pm_end: employeeShiftData.night_end || '',
                                    is_single_shift: false,
                                    _ramadan: true
                                };
                            } else if (activeShifts.includes('day')) {
                                // Day shift only (single shift format)
                                ramadanShift = {
                                    am_start: employeeShiftData.day_start || '',
                                    am_end: employeeShiftData.day_end || '',
                                    pm_start: '',
                                    pm_end: '',
                                    is_single_shift: true,
                                    _ramadan: true
                                };
                            } else if (activeShifts.includes('night')) {
                                // Night shift only (single shift format)
                                ramadanShift = {
                                    am_start: employeeShiftData.night_start || '',
                                    am_end: employeeShiftData.night_end || '',
                                    pm_start: '',
                                    pm_end: '',
                                    is_single_shift: true,
                                    _ramadan: true
                                };
                            }
                        }
                        break;
                    }
                }

                let shift = ramadanShift || employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));

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
                
                // SKIP_PUNCH exception: Remove specific punch from analysis
                const skipPunchException = matchingExceptions.find(ex => ex.type === 'SKIP_PUNCH');
                if (skipPunchException && skipPunchException.punch_to_skip) {
                    const punchToSkip = skipPunchException.punch_to_skip;
                    
                    // Match punches to shift points to identify which to skip
                    const tempMatches = matchPunchesToShiftPoints(filteredPunches, shift, includeSeconds);
                    
                    // Filter out the punch we need to skip
                    if (punchToSkip === 'AM_PUNCH_IN') {
                        // Remove the punch matched to AM_START
                        filteredPunches = filteredPunches.filter((p, idx) => {
                            const match = tempMatches[idx];
                            return match?.matchedTo !== 'AM_START';
                        });
                    } else if (punchToSkip === 'PM_PUNCH_OUT') {
                        // Remove the punch matched to PM_END
                        filteredPunches = filteredPunches.filter((p, idx) => {
                            const match = tempMatches[idx];
                            return match?.matchedTo !== 'PM_END';
                        });
                    }
                }
                
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
                        presentDays++;
                    }
                }

                if (filteredPunches.length > 0) {
                    if (partialDayResult.isPartial) {
                        presentDays++;
                        halfAbsenceCount++;
                        auto_resolutions.push({
                            date: dateStr,
                            type: 'PARTIAL_DAY_DETECTED',
                            details: partialDayResult.reason
                        });
                    } else {
                        presentDays++;
                    }

                    if (rules?.attendance_calculation?.half_day_rule === 'punch_count_or_duration' && !partialDayResult.isPartial) {
                        if (filteredPunches.length < 2 && !isSingleShift) {
                            halfAbsenceCount++;
                        }
                    }
                } else {
                    // No punches for this day
                    // Check if there's an exception that handles this day (already processed above)
                    // Only count as LOP if no exception covers it
                    if (!dateException || (dateException.type !== 'MANUAL_PRESENT' && dateException.type !== 'MANUAL_HALF')) {
                        fullAbsenceCount++;
                    }
                }

                // Check for approved minutes (foundation for all companies, currently enabled for Al Maraghi Motors only)
                let approvedMinutesForDay = 0;
                try {
                    if (rules.approved_minutes_enabled && 
                        dateException && 
                        dateException.type === 'ALLOWED_MINUTES' && 
                        dateException.approval_status === 'approved_dept_head') {
                        approvedMinutesForDay = dateException.allowed_minutes || 0;
                        totalApprovedMinutes += approvedMinutesForDay;
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
                        lateMinutes += dateException.late_minutes;
                    }
                    if (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) {
                        earlyCheckoutMinutes += dateException.early_checkout_minutes;
                    }
                    if (dateException.other_minutes && dateException.other_minutes > 0) {
                        otherMinutes += dateException.other_minutes;
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
                    
                    lateMinutes += dayLateMinutes;
                    earlyCheckoutMinutes += dayEarlyMinutes;
                }

                const expectedPunches = isSingleShift ? 2 : 4;
                
                const hasExtendedMatch = punchMatches.some(m => m.isExtendedMatch);
                const hasFarExtendedMatch = punchMatches.some(m => m.isFarExtendedMatch);
                if (hasUnmatchedPunch) {
                    abnormal_dates_set.add(dateStr);
                    critical_abnormal_dates_set.add(dateStr);
                }
                if (hasFarExtendedMatch) {
                    abnormal_dates_set.add(dateStr);
                    critical_abnormal_dates_set.add(dateStr);
                }
                if (hasExtendedMatch) {
                    abnormal_dates_set.add(dateStr);
                }
                if (rules.abnormality_rules?.detect_missing_punches && filteredPunches.length > 0 && filteredPunches.length < expectedPunches) {
                    abnormal_dates_set.add(dateStr);
                    critical_abnormal_dates_set.add(dateStr);
                }
                if (rules.abnormality_rules?.detect_extra_punches && filteredPunches.length > expectedPunches) {
                    abnormal_dates_set.add(dateStr);
                }
                
                // Check for extreme lateness - ONLY on matched start punches (not all punches)
                if (shift && punchMatches.length > 0) {
                    for (const match of punchMatches) {
                        // Only check punches matched to start times
                        if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                            const latenessMinutes = match.distance; // Distance already calculated in minutes
                            if (latenessMinutes > 120 && latenessMinutes < 480) {
                                critical_abnormal_dates_set.add(dateStr);
                                const shiftType = match.matchedTo === 'AM_START' ? 'AM' : 'PM';
                                auto_resolutions.push({
                                    date: dateStr,
                                    type: 'EXTREME_LATENESS',
                                    details: `${shiftType} start: ${Math.round(latenessMinutes)} minutes late`
                                });
                            }
                        }
                    }
                }

                const dateFormatted = `${String(currentDate.getDate()).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
                if (rules.date_rules?.special_abnormal_dates?.includes(dateFormatted)) {
                    abnormal_dates_set.add(dateStr);
                }

                if (rules.date_rules?.always_mark_first_date_abnormal && currentDate.getTime() === startDate.getTime()) {
                    abnormal_dates_set.add(dateStr);
                }
            }

            const criticalDatesFormatted = critical_abnormal_dates_set.size > 0
                ? [...critical_abnormal_dates_set].sort().map(d => new Date(d).toLocaleDateString()).join(', ')
                : '';
            const autoResolutionNotes = auto_resolutions.length > 0 
                ? auto_resolutions.map(r => `${new Date(r.date).toLocaleDateString()}: ${r.details}`).join(' | ')
                : '';
            
            const dept = employee?.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
            const carriedGrace = project.use_carried_grace_minutes ? (employee?.carried_grace_minutes || 0) : 0;
            
            // ============================================================================
            // CRITICAL: DEDUCTIBLE_MINUTES CALCULATION (IMMUTABLE FOR SALARY)
            // ============================================================================
            // RULE: Grace applies ONLY to late + early minutes, never to other minutes
            // Edge case: If no late/early exists, grace must not reduce anything
            // Formula:
            //   base = lateMinutes + earlyCheckoutMinutes
            //   baseAfterGrace = (base > 0) ? max(0, base - graceMinutes) : 0
            //   deductible = baseAfterGrace + otherMinutes - totalApprovedMinutes
            // This value is FINAL and stored in AnalysisResult for salary calculation
            // Salary calculations fetch this directly, NO recalculation
            // For Al Maraghi Motors, once report is finalized, this is locked
            // DO NOT modify this formula without updating all downstream salary logic
            // ============================================================================
            const graceMinutes = baseGrace + carriedGrace;
            const baseMinutes = lateMinutes + earlyCheckoutMinutes;
            const baseAfterGrace = baseMinutes > 0 ? Math.max(0, baseMinutes - graceMinutes) : 0;
            const deductibleMinutes = baseAfterGrace + otherMinutes - totalApprovedMinutes;

            return {
                attendance_id,
                working_days: workingDays,
                present_days: presentDays,
                full_absence_count: fullAbsenceCount,
                half_absence_count: halfAbsenceCount,
                sick_leave_count: sickLeaveCount,
                annual_leave_count: annualLeaveCount,
                late_minutes: lateMinutes,
                early_checkout_minutes: earlyCheckoutMinutes,
                other_minutes: otherMinutes,
                approved_minutes: totalApprovedMinutes,
                deductible_minutes: Math.max(0, deductibleMinutes),
                grace_minutes: baseGrace + carriedGrace,
                abnormal_dates: [...abnormal_dates_set].sort().join(', '),
                notes: criticalDatesFormatted,
                auto_resolutions: autoResolutionNotes
            };
        };

        // Process all employees and build results array
        // Using smaller batches with delays to handle database load issues
        const allResults = [];
        const processedAttendanceIds = new Set();
        const ANALYSIS_BATCH_SIZE = 5; // Process 5 employees at a time
        const ANALYSIS_BATCH_DELAY = 500; // 500ms delay between analysis batches
        
        // Convert to array for batch processing
        const employeeIdsArray = [...uniqueEmployeeIds];
        
        for (let i = 0; i < employeeIdsArray.length; i += ANALYSIS_BATCH_SIZE) {
            const batchIds = employeeIdsArray.slice(i, i + ANALYSIS_BATCH_SIZE);
            
            // Process batch of employees
            for (const attendance_id of batchIds) {
                const idStr = String(attendance_id);
                if (processedAttendanceIds.has(idStr)) {
                    console.warn('[runAnalysis] Skipping duplicate attendance_id:', attendance_id);
                    continue;
                }
                
                processedAttendanceIds.add(idStr);
                const result = await analyzeEmployee(attendance_id);
                allResults.push({
                    project_id,
                    report_run_id: reportRun.id,
                    ...result
                });
            }
            
            // Log progress
            console.log(`[runAnalysis] Processed batch ${Math.floor(i / ANALYSIS_BATCH_SIZE) + 1}/${Math.ceil(employeeIdsArray.length / ANALYSIS_BATCH_SIZE)} (${Math.min(i + ANALYSIS_BATCH_SIZE, employeeIdsArray.length)}/${employeeIdsArray.length} employees)`);
            
            // Add delay between analysis batches to reduce database load
            if (i + ANALYSIS_BATCH_SIZE < employeeIdsArray.length) {
                await new Promise(resolve => setTimeout(resolve, ANALYSIS_BATCH_DELAY));
            }
        }
        
        console.log('[runAnalysis] Processed employees:', allResults.length);
        console.log('[runAnalysis] Unique attendance IDs processed:', processedAttendanceIds.size);

        // Save results in smaller batches with longer delays
        const SAVE_BATCH_SIZE = 10; // Save 10 results at a time (reduced from 50)
        const SAVE_BATCH_DELAY = 300; // 300ms delay between save batches
        
        for (let i = 0; i < allResults.length; i += SAVE_BATCH_SIZE) {
            const batch = allResults.slice(i, i + SAVE_BATCH_SIZE);
            
            // Retry logic for save operations
            let retries = 3;
            while (retries > 0) {
                try {
                    await base44.asServiceRole.entities.AnalysisResult.bulkCreate(batch);
                    break; // Success, exit retry loop
                } catch (saveError) {
                    retries--;
                    console.warn(`[runAnalysis] Save batch failed, retries left: ${retries}`, saveError.message);
                    if (retries === 0) throw saveError;
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
                }
            }
            
            console.log(`[runAnalysis] Saved batch ${Math.floor(i / SAVE_BATCH_SIZE) + 1}/${Math.ceil(allResults.length / SAVE_BATCH_SIZE)}`);
            
            // Add delay between save batches
            if (i + SAVE_BATCH_SIZE < allResults.length) {
                await new Promise(resolve => setTimeout(resolve, SAVE_BATCH_DELAY));
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