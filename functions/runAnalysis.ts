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

        const { project_id, date_from, date_to, report_name, _existing_report_run_id } = await req.json();

        if (!project_id || !date_from || !date_to) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }
        
        // BUG FIX #1: Support updating existing reports after shift/exception changes
        let reportRun;
        if (_existing_report_run_id) {
            const existingRuns = await base44.asServiceRole.entities.ReportRun.filter({ id: _existing_report_run_id });
            if (existingRuns.length > 0) {
                reportRun = existingRuns[0];
                console.log('[runAnalysis] Updating existing report run:', _existing_report_run_id);
            }
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
        
        console.log('[runAnalysis] All employees fetched:', allEmployees.length);

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
        // CRITICAL BUG FIX #4: Filter out employees without attendance_id UNLESS they have has_attendance_tracking=false (salary-only)
        const activeEmployeeAttendanceIds = filteredEmployees
            .filter(e => e.attendance_id && e.attendance_id !== null && e.attendance_id !== undefined)
            .filter(e => String(e.attendance_id).trim() !== '')
            .map(e => String(e.attendance_id));
        
        // CRITICAL: Include ALL active employees, not just those with punches
        // Employees may have exceptions (annual leave, sick leave, LOP) even without any punches
        // This ensures they appear in attendance reports for proper tracking
        const uniqueEmployeeIds = [...activeEmployeeAttendanceIds];
        
        // Add project-specific employee overrides (for unmatched attendance IDs)
        // CRITICAL: Filter out project employees without attendance_id
        const projectEmployeeIds = projectEmployees
            .filter(pe => pe.attendance_id && pe.attendance_id !== null && pe.attendance_id !== undefined)
            .filter(pe => String(pe.attendance_id).trim() !== '')
            .map(pe => String(pe.attendance_id));
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
        // CRITICAL: Only include project employees with valid attendance_id
        const employees = [
            ...filteredEmployees,
            // Add project employees as pseudo-employees for lookups
            ...projectEmployees
                .filter(pe => pe.attendance_id && pe.attendance_id !== null && pe.attendance_id !== undefined)
                .filter(pe => String(pe.attendance_id).trim() !== '')
                .map(pe => ({
                    attendance_id: pe.attendance_id,
                    hrms_id: `PROJECT_${project_id}_${pe.attendance_id}`,
                    name: pe.name,
                    department: pe.department || 'Admin',
                    weekly_off: pe.weekly_off || 'Sunday',
                    active: true,
                    _isProjectOverride: true
                }))
        ];

        // Create or use existing report run - count ALL active employees being analyzed
        if (!reportRun) {
            reportRun = await base44.asServiceRole.entities.ReportRun.create({
                project_id,
                report_name: report_name || `Report - ${new Date().toLocaleDateString()}`,
                date_from,
                date_to,
                employee_count: uniqueEmployeeIds.length
            });
            console.log('[runAnalysis] Created new report run with', uniqueEmployeeIds.length, 'employees');
        } else {
            // Update employee count if it changed
            await base44.asServiceRole.entities.ReportRun.update(reportRun.id, {
                employee_count: uniqueEmployeeIds.length
            });
            console.log('[runAnalysis] Updating existing report run with', uniqueEmployeeIds.length, 'employees');
        }

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
            
            console.log(`[runAnalysis] Employee ${attendanceIdStr}: carried_grace_minutes = ${employee?.carried_grace_minutes || 0}`);

            let workingDays = 0;
            let presentDays = 0;
            let fullAbsenceCount = 0;
            let halfAbsenceCount = 0;
            let sickLeaveCount = 0;
            let lateMinutes = 0;
            let earlyCheckoutMinutes = 0;
            let otherMinutes = 0;
            let totalApprovedMinutes = 0;
            const otherMinutesByDate = {}; // Track other minutes per date
            const abnormal_dates_set = new Set();
            const critical_abnormal_dates_set = new Set();
            const auto_resolutions = [];

            const startDate = new Date(date_from);
            const endDate = new Date(date_to);

            // CRITICAL: Handle assumed present daily for salary-only employees
            if (employee?.assumed_present_daily === true && employee?.has_attendance_tracking === false) {
                // For assumed present employees without attendance tracking,
                // they are considered present every working day within the report range
                // and should not have attendance deductions.
                // This will count all working days as present, ignoring punches/lates/earlies.
                let tempWorkingDays = 0;
                const dayNameToNumber = {
                    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                    'Thursday': 4, 'Friday': 5, 'Saturday': 6
                };
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                    const currentDate = new Date(d);
                    const dayOfWeek = currentDate.getUTCDay();
                    let weeklyOffDay = null;
                    if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                        weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                    } else if (employee?.weekly_off) {
                        weeklyOffDay = dayNameToNumber[employee.weekly_off];
                    }
                    
                    // Check if this day is also marked as a weekly off. If so, don't count as working day.
                    if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                        continue;
                    }

                    // Additionally, ensure no public holidays mark this day off
                    const dateStr = currentDate.toISOString().split('T')[0];
                    const matchingExceptions = employeeExceptions.filter(ex => {
                        try {
                            const exFrom = new Date(ex.date_from);
                            const exTo = new Date(ex.date_to);
                            return currentDate >= exFrom && currentDate <= exTo;
                        } catch (dateError) {
                            // CRITICAL FIX: Log invalid exception dates in assumed_present_daily block
                            console.warn(`[runAnalysis] ⚠️ INVALID EXCEPTION DATE (assumed_present_daily check) - Employee: ${employee?.name || attendanceIdStr}, Exception ID: ${ex.id}, Type: ${ex.type}, date_from: ${ex.date_from}, date_to: ${ex.date_to}, Error: ${dateError.message}`);
                            return false;
                        }
                    });
                    const hasPublicHoliday = matchingExceptions.some(ex => 
                        ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF'
                    );

                    if (hasPublicHoliday) {
                        continue;
                    }
                    tempWorkingDays++;
                }
                workingDays = tempWorkingDays;
                presentDays = tempWorkingDays;
                // All other counts (absences, late, early, other minutes) remain 0
                // This means assumed_present_daily overrides any other attendance logic
                return {
                    attendance_id,
                    working_days: Math.max(0, workingDays),
                    present_days: Math.max(0, presentDays),
                    full_absence_count: 0,
                    half_absence_count: 0,
                    sick_leave_count: 0,
                    annual_leave_count: 0,
                    late_minutes: 0,
                    early_checkout_minutes: 0,
                    other_minutes: 0,
                    approved_minutes: 0,
                    deductible_minutes: 0, // No deductions for assumed present
                    grace_minutes: 0,
                    abnormal_dates: '',
                    notes: 'Assumed Present Daily',
                    auto_resolutions: '',
                    _otherMinutesDetails: null
                };
            }
            
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
                } catch (dateError) {
                    // CRITICAL FIX: Log invalid exception dates instead of silently failing
                    console.warn(`[runAnalysis] ⚠️ INVALID ANNUAL_LEAVE EXCEPTION DATE - Employee: ${employee?.name || attendanceIdStr}, Exception ID: ${alEx.id}, date_from: ${alEx.date_from}, date_to: ${alEx.date_to}, Error: ${dateError.message}`);
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
                
                // Check if this is employee's weekly off day - BEFORE any other processing
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue;
                }
                
                // Get ALL matching exceptions for this date first (to check DAY_SWAP and PUBLIC_HOLIDAY)
                let matchingExceptions = [];
                try {
                    matchingExceptions = employeeExceptions.filter(ex => {
                        try {
                            const exFrom = new Date(ex.date_from);
                            const exTo = new Date(ex.date_to);
                            return currentDate >= exFrom && currentDate <= exTo;
                        } catch (dateError) {
                            // CRITICAL FIX: Log invalid exception dates instead of silently failing
                            console.warn(`[runAnalysis] ⚠️ INVALID EXCEPTION DATE - Employee: ${employee?.name || attendanceIdStr}, Exception ID: ${ex.id}, Type: ${ex.type}, date_from: ${ex.date_from}, date_to: ${ex.date_to}, Error: ${dateError.message}`);
                            return false;
                        }
                    });
                } catch {
                    matchingExceptions = [];
                }
                
                // Check for PUBLIC_HOLIDAY - day is NOT a working day (check BEFORE assumed_present_daily)
                const hasPublicHoliday = matchingExceptions.some(ex => 
                    ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF'
                );
                
                if (hasPublicHoliday) {
                    // Check for MANUAL_ABSENT even on public holiday
                    const hasManualAbsent = matchingExceptions.some(ex => ex.type === 'MANUAL_ABSENT');
                    if (hasManualAbsent) {
                        fullAbsenceCount++;
                    }
                    continue; // Skip this day - it's a holiday
                }
                
                // CRITICAL FIX: ASSUMED_PRESENT_DAILY logic
                // Employees flagged as "assumed present" are automatically marked present every working day
                // This applies AFTER checking weekly off and public holidays
                if (employee?.assumed_present_daily === true) {
                    workingDays++;
                    presentDays++;
                    // Skip ALL punch processing, late/early calculations, exceptions for this day
                    continue;
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
                    } catch (dateError) {
                        // CRITICAL FIX: Log invalid exception dates
                        console.warn(`[runAnalysis] ⚠️ INVALID ANNUAL_LEAVE DATE in daily loop - Employee: ${employee?.name || attendanceIdStr}, Exception ID: ${ex.id}, date_from: ${ex.date_from}, date_to: ${ex.date_to}, Error: ${dateError.message}`);
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

                // Check for date-specific Ramadan ShiftTiming records FIRST
                // applyRamadanShifts creates separate ShiftTiming records for day and night shifts
                // We need to merge them into a single shift object for proper punch matching
                let ramadanShift = null;
                const dateSpecificShifts = employeeShifts.filter(s => s.date === dateStr && isShiftEffective(s));
                const ramadanDateShifts = dateSpecificShifts.filter(s => 
                    s.applicable_days && s.applicable_days.includes('Ramadan')
                );
                
                if (ramadanDateShifts.length > 0) {
                    if (ramadanDateShifts.length === 1) {
                        // Single Ramadan shift (day only OR night only OR Al Maraghi S1/S2)
                        ramadanShift = ramadanDateShifts[0];
                    } else {
                        // Multiple Ramadan shifts on same day — merge day + night into 4-point shift
                        // Convention: Day shift uses am_start/pm_end, Night shift uses am_start/pm_end
                        // After merge: am_start=day_start, am_end=day_end, pm_start=night_start, pm_end=night_end
                        const dayShift = ramadanDateShifts.find(s => 
                            s.applicable_days?.includes('Day') || s.applicable_days?.includes('S1')
                        );
                        const nightShift = ramadanDateShifts.find(s => 
                            s.applicable_days?.includes('Night') || s.applicable_days?.includes('S2')
                        );
                        
                        if (dayShift && nightShift) {
                            ramadanShift = {
                                am_start: dayShift.am_start,
                                am_end: dayShift.pm_end,    // Day shift end (stored in pm_end for single shifts)
                                pm_start: nightShift.am_start, // Night shift start (stored in am_start for single shifts)
                                pm_end: nightShift.pm_end,   // Night shift end
                                is_single_shift: false,
                                is_friday_shift: dayShift.is_friday_shift,
                                _ramadan: true,
                                _merged: true
                            };
                        } else {
                            // Fallback: just use the first one
                            ramadanShift = ramadanDateShifts[0];
                        }
                    }
                }
                
                // Fallback: Build from raw Ramadan schedule JSON if no ShiftTiming records exist
                if (!ramadanShift) {
                    for (const scheduleId in ramadanShiftsLookup) {
                        const ramadanData = ramadanShiftsLookup[scheduleId];
                        if (currentDate >= ramadanData.start && currentDate <= ramadanData.end) {
                            const daysSinceStart = Math.floor((currentDate - ramadanData.start) / (1000 * 60 * 60 * 24));
                            let weekNumber = 1;
                            
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
                                const activeShifts = employeeShiftData.active_shifts;
                                
                                if (activeShifts.includes('day') && activeShifts.includes('night')) {
                                    ramadanShift = {
                                        am_start: employeeShiftData.day_start || '',
                                        am_end: employeeShiftData.day_end || '',
                                        pm_start: employeeShiftData.night_start || '',
                                        pm_end: employeeShiftData.night_end || '',
                                        is_single_shift: false,
                                        _ramadan: true
                                    };
                                } else if (activeShifts.includes('day')) {
                                    ramadanShift = {
                                        am_start: employeeShiftData.day_start || '',
                                        am_end: '—',
                                        pm_start: '—',
                                        pm_end: employeeShiftData.day_end || '',
                                        is_single_shift: true,
                                        _ramadan: true
                                    };
                                } else if (activeShifts.includes('night')) {
                                    ramadanShift = {
                                        am_start: employeeShiftData.night_start || '',
                                        am_end: '—',
                                        pm_start: '—',
                                        pm_end: employeeShiftData.night_end || '',
                                        is_single_shift: true,
                                        _ramadan: true
                                    };
                                }
                            }
                            break;
                        }
                    }
                }

                // Use Ramadan shift, or fall back to non-Ramadan date-specific shift
                const nonRamadanDateShift = dateSpecificShifts.find(s => 
                    !s.applicable_days || !s.applicable_days.includes('Ramadan')
                );
                let shift = ramadanShift || nonRamadanDateShift;

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
                
                // CRITICAL FIX: Log missing shift will happen after filteredPunches is computed below

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
                    } catch (e) {
                        console.warn(`[runAnalysis] Failed to apply SHIFT_OVERRIDE for ${attendanceIdStr} on ${dateStr}:`, e.message);
                        // Continue with existing shift
                    }
                }

                // BUG FIX #3: SKIP_PUNCH should NOT mark employee as absent or partial
                // It should ONLY remove late/early minutes for that specific punch
                // NEVER apply on leave days
                const skipPunchException = matchingExceptions.find(ex => ex.type === 'SKIP_PUNCH');
                const isOnLeave = dateException && (dateException.type === 'SICK_LEAVE' || dateException.type === 'ANNUAL_LEAVE');
                
                const dayPunches = employeePunches
                    .filter(p => p.punch_date === dateStr)
                    .sort((a, b) => {
                        const timeA = parseTime(a.timestamp_raw, includeSeconds);
                        const timeB = parseTime(b.timestamp_raw, includeSeconds);
                        return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                    });

                let filteredPunches = filterMultiplePunches(dayPunches, shift, includeSeconds);
                
                // Log missing shift AFTER filteredPunches is computed
                if (!shift && filteredPunches.length > 0 && !dateException) {
                    console.warn(`[runAnalysis] ⚠️ MISSING SHIFT - Employee: ${employee?.name || attendanceIdStr} (${attendanceIdStr}), Date: ${dateStr}, Punches: ${filteredPunches.length}, Day: ${currentDayName}`);
                    abnormal_dates_set.add(dateStr);
                    critical_abnormal_dates_set.add(dateStr);
                }
                
                // CRITICAL FIX: If SKIP_PUNCH exception exists (and not on leave), 
                // add a fake punch so employee is NOT marked as absent or partial
                let hasSkipPunchApplied = false;
                if (skipPunchException && !isOnLeave && skipPunchException.punch_to_skip) {
                    hasSkipPunchApplied = true;
                    // Add a fake "present" marker to ensure employee is counted as present
                    // This prevents partial day detection and absence marking
                    if (filteredPunches.length === 0) {
                        filteredPunches = [{ _fake_skip_punch: true }];
                    }
                }
                
                let punchMatches = [];
                let hasUnmatchedPunch = false;
                if (shift && filteredPunches.length > 0 && !hasSkipPunchApplied) {
                    punchMatches = matchPunchesToShiftPoints(filteredPunches, shift, includeSeconds);
                    hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
                }
                
                const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                       shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                       shift.am_end !== '—' && shift.pm_start !== '—' &&
                                       shift.am_end !== '-' && shift.pm_start !== '-';
                const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;

                // Skip partial day detection if SKIP_PUNCH is applied
                const partialDayResult = hasSkipPunchApplied 
                    ? { isPartial: false, reason: '' } 
                    : detectPartialDay(filteredPunches, shift, includeSeconds);

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
                        lateMinutes += Math.abs(dateException.late_minutes);
                    }
                    if (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) {
                        earlyCheckoutMinutes += Math.abs(dateException.early_checkout_minutes);
                    }
                    if (dateException.other_minutes && dateException.other_minutes > 0) {
                        otherMinutes += Math.abs(dateException.other_minutes);
                        otherMinutesByDate[dateStr] = Math.abs(dateException.other_minutes);
                    }
                } else if (shift && punchMatches.length > 0 && !shouldSkipTimeCalculation && !hasSkipPunchApplied) {
                    let dayLateMinutes = 0;
                    let dayEarlyMinutes = 0;
                    
                    // BUG FIX #2: Use Math.abs on RESULT of time difference, not individual components
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        
                        const punchTime = match.punch.time;
                        const shiftTime = match.shiftTime;
                        
                        if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                            if (punchTime > shiftTime) {
                                const minutes = Math.round(Math.abs((punchTime - shiftTime) / (1000 * 60)));
                                dayLateMinutes += minutes;
                            }
                        }
                        
                        if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                            if (punchTime < shiftTime) {
                                const minutes = Math.round(Math.abs((shiftTime - punchTime) / (1000 * 60)));
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
            
            // CRITICAL: Fetch carried_grace_minutes from Employee entity for Al Maraghi Motors ONLY
            let carriedGrace = 0;
            if (project.use_carried_grace_minutes === true && project.company === 'Al Maraghi Motors') {
                // For Al Maraghi Motors, read from Employee.carried_grace_minutes
                // This value is managed via Grace Minutes Management page and syncs bi-directionally
                const freshEmployee = employees.find(e => String(e.attendance_id) === attendanceIdStr);
                if (freshEmployee && typeof freshEmployee.carried_grace_minutes === 'number') {
                    carriedGrace = freshEmployee.carried_grace_minutes;
                    console.log(`[runAnalysis] [Al Maraghi Motors] Employee ${attendanceIdStr}: Loaded carried grace = ${carriedGrace} minutes from Employee.carried_grace_minutes`);
                } else {
                    carriedGrace = 0;
                    console.log(`[runAnalysis] [Al Maraghi Motors] Employee ${attendanceIdStr}: No carried grace found, defaulting to 0`);
                }
            }
            
            // ============================================================================
            // CRITICAL: DEDUCTIBLE_MINUTES CALCULATION (IMMUTABLE FOR SALARY)
            // ============================================================================
            // RULE: Other minutes are COMPLETELY EXCLUDED from deductible calculation
            // RULE: Grace minutes reduce ONLY late+early
            // RULE: Approved minutes reduce the final deductible (after grace is applied)
            // 
            // FORMULA:
            //   1. base = lateMinutes + earlyCheckoutMinutes (EXCLUDE other_minutes)
            //   2. baseAfterGrace = max(0, base - totalGraceMinutes)
            //   3. deductibleMinutes = max(0, baseAfterGrace - totalApprovedMinutes)
            // 
            // CRITICAL FIX: Force positive values at EVERY step to prevent negative data corruption
            // Grace = baseGrace + carriedGrace
            // Other minutes are NOT part of deductible calculation at all
            // ============================================================================
            const totalGraceMinutes = Math.max(0, baseGrace) + Math.max(0, carriedGrace);
            const baseMinutes = Math.max(0, lateMinutes) + Math.max(0, earlyCheckoutMinutes);  // EXCLUDE other_minutes
            const baseAfterGrace = Math.max(0, baseMinutes - totalGraceMinutes);
            const deductibleMinutes = Math.max(0, baseAfterGrace - Math.max(0, totalApprovedMinutes));
            
            console.log(`[runAnalysis] Employee ${attendanceIdStr}: Late=${lateMinutes}, Early=${earlyCheckoutMinutes}, Base=${baseMinutes} (NO other minutes), BaseGrace=${baseGrace}, Carried=${carriedGrace}, Total Grace=${totalGraceMinutes}, After Grace=${baseAfterGrace}, Approved=${totalApprovedMinutes}, Final Deductible=${deductibleMinutes}, Other Minutes=${otherMinutes} (NOT in deductible)`);

            return {
                attendance_id,
                working_days: Math.max(0, workingDays),
                present_days: Math.max(0, presentDays),
                full_absence_count: Math.max(0, fullAbsenceCount),
                half_absence_count: Math.max(0, halfAbsenceCount),
                sick_leave_count: Math.max(0, sickLeaveCount),
                annual_leave_count: Math.max(0, annualLeaveCount),
                late_minutes: Math.max(0, lateMinutes),
                early_checkout_minutes: Math.max(0, earlyCheckoutMinutes),
                other_minutes: Math.max(0, otherMinutes),
                approved_minutes: Math.max(0, totalApprovedMinutes),
                deductible_minutes: Math.max(0, deductibleMinutes),
                grace_minutes: Math.max(0, totalGraceMinutes),
                abnormal_dates: [...abnormal_dates_set].sort().join(', '),
                notes: criticalDatesFormatted,
                auto_resolutions: autoResolutionNotes,
                _otherMinutesDetails: otherMinutes > 0 ? {
                    attendance_id: attendanceIdStr,
                    other_minutes: Math.max(0, otherMinutes),
                    employee_name: employee?.name || attendanceIdStr,
                    breakdown: otherMinutesByDate
                } : null
            };
        };

        // Process all employees and build results array
        // Using smaller batches with delays to handle database load issues
        const allResults = [];
        const processedAttendanceIds = new Set();
        const otherMinutesExceptionsToCreate = []; // Track other minutes exceptions to create
        const ANALYSIS_BATCH_SIZE = 15; // BUG FIX #5: Increased from 5 to 15 for better performance
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
                
                // Track other minutes for exception creation
                if (result._otherMinutesDetails) {
                    otherMinutesExceptionsToCreate.push(result._otherMinutesDetails);
                }
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

        // Create MANUAL_OTHER_MINUTES exceptions for employees with other minutes
        if (otherMinutesExceptionsToCreate.length > 0) {
            console.log(`[runAnalysis] Creating ${otherMinutesExceptionsToCreate.length} MANUAL_OTHER_MINUTES exceptions`);
            
            for (const detail of otherMinutesExceptionsToCreate) {
                try {
                    // Format breakdown for details field
                    const breakdownText = Object.entries(detail.breakdown || {})
                        .map(([date, minutes]) => `${new Date(date).toLocaleDateString()}: ${minutes} min`)
                        .join(' | ');
                    
                    await base44.asServiceRole.entities.Exception.create({
                        project_id,
                        attendance_id: detail.attendance_id,
                        date_from: date_from,
                        date_to: date_to,
                        type: 'MANUAL_OTHER_MINUTES',
                        other_minutes: detail.other_minutes,
                        details: `Total: ${detail.other_minutes} min | Breakdown: ${breakdownText}`,
                        created_from_report: true,
                        report_run_id: reportRun.id,
                        use_in_analysis: true,
                        approval_status: 'pending_dept_head'
                    });
                } catch (exError) {
                    console.warn(`[runAnalysis] Failed to create other minutes exception for ${detail.attendance_id}:`, exError.message);
                }
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
            other_minutes_exceptions_created: otherMinutesExceptionsToCreate.length,
            message: `Analysis complete for ${allResults.length} employees`
        });

    } catch (error) {
        console.error('Run analysis error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});