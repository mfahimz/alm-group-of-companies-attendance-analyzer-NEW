/*
 * Calendar Based Equivalent of runAnalysis
 * Completely independent from the original functions.
 * Mandatory 5000 limit on all filter calls to prevent silent data truncation.
 * Al Maraghi Motors business logic preserved exactly.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Backend function to run attendance analysis for a project
 * This contains the complete analysis logic moved from frontend
 */
// @ts-ignore: Deno
Deno.serve(async (req: Request) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const {
            calendar_period_id,
            date_from,
            date_to,
            report_name,
            _existing_report_run_id,
            _chunk_offset,
            _chunk_size
        } = await req.json();

        if (!calendar_period_id || !date_from || !date_to) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // BUG FIX #1: Support updating existing reports after shift/exception changes
        let reportRun;
        if (_existing_report_run_id) {
            const existingRuns = await base44.asServiceRole.entities.ReportRun.filter({ id: _existing_report_run_id }, null, 5000);
            if (existingRuns.length > 0) {
                reportRun = existingRuns[0];
                console.log('[runAnalysis] Updating existing report run:', _existing_report_run_id);
            }
        }

        // Fetch project
        const periods = await base44.asServiceRole.entities.CalendarPeriod.filter({ id: calendar_period_id }, null, 5000);
        if (periods.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const period = periods[0];

        const userRole = user?.extended_role || user?.role || 'user';

        // Security: Verify access - privileged roles have full project access, others need company match
        if (userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'ceo' && userRole !== 'hr_manager') {
            if (period.company !== user.company) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Resolve company_id for stable company identification
        const AL_MARAGHI_MOTORS_COMPANY_ID = 2;
        let isAlMaraghiMotors = period.company === 'Al Maraghi Motors' || period.company === 'Al Maraghi Auto Repairs';
        try {
            const companyRecords = await base44.asServiceRole.entities.Company.filter({ name: period.company }, null, 5, 5000);
            if (companyRecords.length > 0 && companyRecords[0].company_id === AL_MARAGHI_MOTORS_COMPANY_ID) {
                isAlMaraghiMotors = true;
            }
        } catch (e) {
            console.warn('[runAnalysis] Could not resolve company_id, name-based check used');
        }

        // Fetch all required data
        const [punches, shifts, exceptions, allEmployees, rulesData, projectEmployees, ramadanSchedules] = await Promise.all([
            base44.asServiceRole.entities.Punch.filter({ $or: [{ calendar_period_id }, { company: period.company }] }, null, 5000),
            base44.asServiceRole.entities.ShiftTiming.filter({ $or: [{ calendar_period_id }, { company: period.company }] }, null, 5000),
            base44.asServiceRole.entities.Exception.filter({ $or: [{ calendar_period_id }, { company: period.company }] }, null, 5000),
            base44.asServiceRole.entities.Employee.filter({ company: period.company, active: true }, null, 5000),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: period.company }, null, 5000),
            base44.asServiceRole.entities.ProjectEmployee.filter({ $or: [{ calendar_period_id }, { calendar_period_id }] }, null, 5000),
            base44.asServiceRole.entities.RamadanSchedule.filter({ company: period.company, active: true }, null, 5000)
        ]);

        console.log('[runAnalysis] All employees fetched:', allEmployees.length);

        // Parse Ramadan schedules for shift lookup - only include schedules that overlap with project date range
        const projectStart = new Date(date_from);
        const projectEnd = new Date(date_to);
        let ramadanShiftsLookup: any = {};

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

        if (period.custom_employee_ids && period.custom_employee_ids.trim() !== '') {
            // Parse custom employee IDs (HRMS IDs) - keep as strings
            const customHrmsIds = period.custom_employee_ids
                .split(',')
                .map(id => id.trim())
                .filter(id => id && id !== 'NULL');

            console.log('[runAnalysis] Custom HRMS IDs:', customHrmsIds.length);

            // Filter employees by HRMS ID - string comparison
            filteredEmployees = allEmployees.filter((e: any) =>
                customHrmsIds.includes(String(e.hrms_id))
            );
        }

        // Get attendance IDs of filtered employees - keep as strings
        // CRITICAL BUG FIX #4: Filter out employees without attendance_id UNLESS they have has_attendance_tracking=false (salary-only)
        const activeEmployeeAttendanceIds = filteredEmployees
            .filter((e: any) => e.attendance_id && e.attendance_id !== null && e.attendance_id !== undefined)
            .filter((e: any) => String(e.attendance_id).trim() !== '')
            .map((e: any) => String(e.attendance_id));

        // CRITICAL: Include ALL active employees, not just those with punches
        // Employees may have exceptions (annual leave, sick leave, LOP) even without any punches
        // This ensures they appear in attendance reports for proper tracking
        const uniqueEmployeeIds = [...activeEmployeeAttendanceIds];

        // Add project-specific employee overrides (for unmatched attendance IDs)
        // CRITICAL: Filter out project employees without attendance_id
        const projectEmployeeIds = projectEmployees
            .filter((pe: any) => pe.attendance_id && pe.attendance_id !== null && pe.attendance_id !== undefined)
            .filter((pe: any) => String(pe.attendance_id).trim() !== '')
            .map((pe: any) => String(pe.attendance_id));
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
                    hrms_id: `PROJECT_${calendar_period_id}_${pe.attendance_id}`,
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
                calendar_period_id,
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
        const parseTime = (timeStr: any) => {
            try {
                if (!timeStr || timeStr === '—') return null;

                // Priority 1: Format with seconds (e.g., "12:00:00 AM")
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

                // Priority 2: Standard AM/PM (e.g., "12:00 AM")
                timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
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

                // Priority 3: 24-hour format with optional seconds (e.g., "14:28" or "14:28:05")
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

        // Helper to get YYYY-MM-DD in local time
        const toDateStr = (date: any) => {
            const d = new Date(date);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        /**
         * MATCH PUNCHES TO SHIFT POINTS
         * Matches daily punch timestamps to specific shift start/end points (AM_START, PM_END, etc.)
         *
         * BUSINESS LOGIC:
         * 1. Uses multi-phase matching with increasing time windows (60min, 120min, 180min, 240min, 300min).
         * 2. This allows matching even extremely late arrivals or early departures up to 5 hours from target.
         * 3. MIDNIGHT CROSSOVER: Specifically handles punches from the next day that belong to a night shift.
         * 4. PRECISION: Must pass 'includeSeconds' to parseTime() because shift times often include seconds
         *    (e.g., "12:00:00 AM") which fail standard "HH:MM" regex parsing.
         */
        const matchPunchesToShiftPoints = (dayPunches: any[], shift: any, includeSeconds = false, nextDateStr: string | null = null) => {
            if (!shift || dayPunches.length === 0) return [];

            const punchesWithTime = dayPunches.map((p: any) => {
                const time = parseTime(p.timestamp_raw);
                if (!time) return null;

                // MIDNIGHT SHIFT FIX: If this punch is from next day (midnight crossover),
                // add 24 hours to its time so it sorts and matches correctly against PM_END
                const isNextDayPunch = nextDateStr && p.punch_date === nextDateStr;
                const adjustedTime = isNextDayPunch ? new Date(time.getTime() + 24 * 60 * 60 * 1000) : time;

                return {
                    ...p,
                    time: adjustedTime,
                    _originalTime: time,
                    _isNextDayPunch: isNextDayPunch
                };
            }).filter(p => p).sort((a, b) => a.time - b.time);

            if (punchesWithTime.length === 0) return [];

            // MIDNIGHT SHIFT FIX: If shift ends at midnight (0:00), adjust PM_END to 24:00 (next day)
            const pmEndTime = parseTime(shift.pm_end);
            let adjustedPmEnd = pmEndTime;
            if (pmEndTime && pmEndTime.getHours() === 0 && pmEndTime.getMinutes() === 0) {
                adjustedPmEnd = new Date(pmEndTime.getTime() + 24 * 60 * 60 * 1000);
            }

            const shiftPoints = [
                { type: 'AM_START', time: parseTime(shift.am_start), label: shift.am_start },
                { type: 'AM_END', time: parseTime(shift.am_end), label: shift.am_end },
                { type: 'PM_START', time: parseTime(shift.pm_start), label: shift.pm_start },
                { type: 'PM_END', time: adjustedPmEnd, label: shift.pm_end }
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

                    const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);

                    if (distance <= 60 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                    }
                }

                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;

                        const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);

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

                        const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);

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

        /**
         * DETECT PARTIAL DAY
         * Identifies if an employee worked significantly less than their expected shift hours.
         *
         * BUSINESS LOGIC:
         * 1. Calculates expected duration based on actual shift blocks (AM + PM).
         * 2. For split shifts (Ramadan), it ignores the break between AM_END and PM_START.
         * 3. If actual worked time is < 50% of expected, it's flagged as a partial day.
         * 4. PRECISION: Shift times must be parsed with 'includeSeconds' to avoid "null" shift points.
         */


        // MIDNIGHT BUFFER: Helper to check if a punch timestamp falls within the midnight buffer window
        // (i.e., between 12:00 AM and 02:00 AM = 120 minutes after midnight)
        // This is specifically extended to 2 hours for Ramadan night shifts crossover support.
        const MIDNIGHT_BUFFER_MINUTES = 120;
        const isWithinMidnightBuffer = (timestampRaw) => {
            const parsed = parseTime(timestampRaw);
            if (!parsed) return false;
            const minutesSinceMidnight = parsed.getHours() * 60 + parsed.getMinutes();
            return minutesSinceMidnight <= MIDNIGHT_BUFFER_MINUTES;
        };

        const filterMultiplePunches = (punchList, shift, includeSeconds = false) => {
            if (punchList.length <= 1) return punchList;

            const punchesWithTime = punchList.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw)
            })).filter(p => p.time);

            if (punchesWithTime.length === 0) return punchList;

            const deduped = [];
            for (let i = 0; i < punchesWithTime.length; i++) {
                const current = punchesWithTime[i];
                const isDuplicate = deduped.some(p => Math.abs(current.time.getTime() - p.time.getTime()) / (1000 * 60) < 10);
                if (!isDuplicate) {
                    deduped.push(current);
                }
            }

            // Sort punches - preserve the original order from dayPunches which already handles midnight crossover
            const sortedPunches = deduped.sort((a, b) => {
                const aIdx = punchList.findIndex(p => p.id === a.id);
                const bIdx = punchList.findIndex(p => p.id === b.id);
                return aIdx - bIdx;
            });
            return sortedPunches.map(p => punchList.find(punch => punch.id === p.id)).filter(Boolean);
        };

        // Analyze employee function
        const analyzeEmployee = async (attendance_id) => {
            const attendanceIdStr = String(attendance_id);

            // MIDNIGHT SHIFT FIX: Include punches from the day AFTER the project end date
            // because shifts ending at/near midnight (e.g., 12:00 AM) will have punch-outs
            // recorded on the next calendar day (e.g., 12:05 AM, 12:15 AM, 12:20 AM)
            const dayAfterEnd = new Date(date_to);
            dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
            const dayAfterEndStr = toDateStr(dayAfterEnd);

            // MIDNIGHT FIX: Include punches from 1 day BEFORE and 1 day AFTER the range
            // - Day before: needed to check if previous day's shift ended near midnight
            //   (those punches from 12:00-1:30 AM on the first day belong to the previous day)
            // - Day after: needed to grab midnight crossover punch-outs from the last day
            const dayBeforeStart = new Date(date_from);
            dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
            const dayBeforeStartStr = toDateStr(dayBeforeStart);

            const employeePunches = punches.filter(p =>
                String(p.attendance_id) === attendanceIdStr &&
                p.punch_date >= dayBeforeStartStr &&
                p.punch_date <= dayAfterEndStr
            );

            // Separate the core-range punches (used for main iteration) and overflow punches
            const nextDayPunches = employeePunches.filter(p =>
                p.punch_date === dayAfterEndStr
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
            const includeSeconds = true; // Unified: always support high-precision parsing

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
            let lopAdjacentWeeklyOffCount = 0; // Weekly off days adjacent to LOP counted as LOP
            const otherMinutesByDate = {}; // Track other minutes per date (only from NON-exception sources)
            const otherMinutesFromExceptions: Record<string, number> = {}; // Track other minutes that came from existing exceptions (DO NOT re-create)
            const abnormal_dates_set = new Set();
            const critical_abnormal_dates_set = new Set();
            const auto_resolutions: any[] = [];
            // Track per-date status for LOP-adjacent weekly off calculation (done after main loop)
            const dateStatusMap: Record<string, string> = {}; // dateStr -> 'LOP' | 'SICK_LEAVE' | 'PRESENT' | 'ANNUAL_LEAVE' | 'OTHER'

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
                    if (period.weekly_off_override && period.weekly_off_override !== 'None') {
                        weeklyOffDay = dayNameToNumber[period.weekly_off_override];
                    } else if (employee?.weekly_off) {
                        weeklyOffDay = dayNameToNumber[employee.weekly_off];
                    }

                    // Check if this day is also marked as a weekly off. If so, don't count as working day.
                    if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                        continue;
                    }

                    // Additionally, ensure no public holidays mark this day off
                    const dateStr = toDateStr(currentDate);
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
                            const dateStr = toDateStr(d);
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
                const dateStr = toDateStr(currentDate);
                // CRITICAL: Use UTC day of week to avoid timezone issues
                // new Date(dateStr) creates a date at UTC midnight, so we must use getUTCDay()
                // Otherwise, server timezone can shift the day and cause incorrect weekly off detection
                const dayOfWeek = currentDate.getUTCDay();

                let weeklyOffDay = null;
                if (period.weekly_off_override && period.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[period.weekly_off_override];
                } else if (employee?.weekly_off) {
                    weeklyOffDay = dayNameToNumber[employee.weekly_off];
                }

                // Check if this is employee's weekly off day - BEFORE any other processing
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    // Track weekly off day in dateStatusMap for LOP-adjacent check
                    dateStatusMap[dateStr] = 'WEEKLY_OFF';
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
                        dateStatusMap[dateStr] = 'LOP';
                    } else {
                        dateStatusMap[dateStr] = 'PUBLIC_HOLIDAY';
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
                        dateStatusMap[dateStr] = 'PRESENT';
                        continue;  // Skip punch-based counting to prevent double-counting
                    } else if (dateException.type === 'MANUAL_ABSENT') {
                        fullAbsenceCount++;
                        dateStatusMap[dateStr] = 'LOP';
                        continue;
                    } else if (dateException.type === 'SICK_LEAVE') {
                        // Sick leave counts as WORKING DAY (no deduction from working_days)
                        // Day is tracked separately as sick_leave_count
                        // No LOP deduction, no late/early calculation for this day
                        sickLeaveCount++;
                        dateStatusMap[dateStr] = 'SICK_LEAVE';
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
                        dateStatusMap[dateStr] = 'ANNUAL_LEAVE';
                        continue;
                    }
                    // If employee worked, continue normal analysis
                }
                // SHIFT SELECTION PRIORITY LOGIC (TASK 2 CONSOLIDATION)
                // The system must resolve which shift applies to a given employee on a given date.
                // We strictly prioritize project-specific ShiftTiming records applied manually
                // or via 'Apply Ramadan Shifts' button as the primary source of truth.
                // ================================================================

                let shift = null;
                const dateSpecificShifts = employeeShifts.filter(s => s.date === dateStr && isShiftEffective(s));

                if (dateSpecificShifts.length > 0) {
                    // PRIORITY 1: Use project-applied date-specific records
                    if (dateSpecificShifts.length === 1) {
                        shift = dateSpecificShifts[0];
                        console.log(`[runAnalysis] PROJECT SHIFT: Found specific record for ${attendanceIdStr} on ${dateStr}: "${shift.applicable_days}"`);
                    } else {
                        // MERGE LOGIC: If multiple records exist (e.g. legacy Ramadan day+night), merge them
                        const ramadanDateShifts = dateSpecificShifts.filter(s =>
                            String(s.applicable_days || '').includes('Ramadan')
                        );

                        if (ramadanDateShifts.length >= 2) {
                            const dayShift = ramadanDateShifts.find(s =>
                                s.applicable_days?.includes('Day') || s.applicable_days?.includes('S1')
                            );
                            const nightShift = ramadanDateShifts.find(s =>
                                s.applicable_days?.includes('Night') || s.applicable_days?.includes('S2')
                            );

                            if (dayShift && nightShift) {
                                shift = {
                                    am_start: dayShift.am_start,
                                    am_end: dayShift.pm_end,
                                    pm_start: nightShift.am_start,
                                    pm_end: nightShift.pm_end,
                                    is_single_shift: false,
                                    applicable_days: 'Ramadan Merged Shift',
                                    _ramadan: true,
                                    _merged: true
                                };
                                console.log(`[runAnalysis] PROJECT SHIFT: Merged day+night records for ${attendanceIdStr} on ${dateStr}`);
                            }
                        }

                        if (!shift) {
                            // Default to the most recent record if no mergeable Ramadan pair found
                            shift = dateSpecificShifts.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
                            console.log(`[runAnalysis] PROJECT SHIFT: Multiple records found for ${attendanceIdStr} on ${dateStr}, using most recent: "${shift.applicable_days}"`);
                        }
                    }
                } else {
                    // FALLBACK: Only if NO project-specific records exist, look for external logic/patterns

                    // Fallback 1: Build from raw Ramadan schedule JSON
                    for (const scheduleId in ramadanShiftsLookup) {
                        const ramadanData = ramadanShiftsLookup[scheduleId];
                        if (currentDate >= ramadanData.start && currentDate <= ramadanData.end) {
                            const daysSinceStart = Math.floor((currentDate - ramadanData.start) / (1000 * 60 * 60 * 24));
                            let saturdaysPassed = 0;

                            for (let i = 0; i < daysSinceStart; i++) {
                                const checkDate = new Date(ramadanData.start);
                                checkDate.setDate(checkDate.getDate() + i);
                                const checkDayOfWeek = checkDate.getUTCDay();
                                if (checkDayOfWeek === 6) saturdaysPassed++;
                            }

                            const weekNumber = (saturdaysPassed % 2) === 0 ? 1 : 2;
                            const weekData = weekNumber === 1 ? ramadanData.week1 : ramadanData.week2;
                            const employeeShiftData = weekData[attendanceIdStr];

                            if (employeeShiftData) {
                                const hasDay = employeeShiftData.day_start && employeeShiftData.day_end && employeeShiftData.day_start !== '—' && employeeShiftData.day_end !== '—';
                                const hasNight = employeeShiftData.night_start && employeeShiftData.night_end && employeeShiftData.night_start !== '—' && employeeShiftData.night_end !== '—';

                                if (hasDay && hasNight) {
                                    shift = {
                                        am_start: employeeShiftData.day_start || '',
                                        am_end: employeeShiftData.day_end || '',
                                        pm_start: employeeShiftData.night_start || '',
                                        pm_end: employeeShiftData.night_end || '',
                                        is_single_shift: false,
                                        _ramadan: true
                                    };
                                } else if (hasDay) {
                                    shift = {
                                        am_start: employeeShiftData.day_start || '',
                                        am_end: '—',
                                        pm_start: '—',
                                        pm_end: employeeShiftData.day_end || '',
                                        is_single_shift: true,
                                        _ramadan: true
                                    };
                                } else if (hasNight) {
                                    shift = {
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

                if (!shift) {
                    // Fallback 2: Build from regular shifts (non-Ramadan)
                    const nonRamadanDateShift = dateSpecificShifts.find(s =>
                        !s.applicable_days || !s.applicable_days.includes('Ramadan')
                    );
                    shift = nonRamadanDateShift;
                }

                if (!shift) {
                    const applicableShifts = employeeShifts.filter(s => !s.date && isShiftEffective(s));

                    // PRIORITY 3: A shift that explicitly matches the specific day of the week 
                    // (e.g., applicable_days includes "Monday")
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
                        // PRIORITY 4: The general company shift logic
                        // If it's a Friday, we check for a general Friday shift, otherwise we grab the first general shift
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

                // ================================================================
                // SKIP_PUNCH LOGIC: Segmented skip with strict priority rules
                // ================================================================
                // 1. Find the active SKIP_PUNCH exception for this employee/date
                // 2. Only apply if employee is WORKING (not on leave/holiday)
                // 3. Segmented: AM_PUNCH_IN → zero late, PM_PUNCH_OUT → zero early, FULL_SKIP → both
                // 4. 0-punch LOP saver: FULL_SKIP with 0 punches → Present (Skip Punch)
                // ================================================================
                const skipPunchException = matchingExceptions.find(ex => ex.type === 'SKIP_PUNCH');
                const isOnLeave = dateException && (
                    dateException.type === 'SICK_LEAVE' || 
                    dateException.type === 'ANNUAL_LEAVE' || 
                    dateException.type === 'PUBLIC_HOLIDAY'
                );
                // "Working Employees Only" filter: SKIP_PUNCH only applies to people expected to work
                const isNonWorkingStatus = isOnLeave || 
                    (dateException && dateException.type === 'OFF');
                
                // ================================================================
                // MIDNIGHT SHIFT HANDLING (TASK 3 AUDIT)
                // If a shift ends at or near midnight (12:00 AM / 00:00), 
                // the system must correctly include early-morning punches from the NEXT chronological day
                // (e.g. 00:15 AM punch) because they belong to THIS date's shift.
                // ================================================================
                const nextDateObj = new Date(currentDate);
                nextDateObj.setDate(nextDateObj.getDate() + 1);
                const nextDateStr = toDateStr(nextDateObj);

                // Check previous day's shift to see if IT ended near midnight
                // If so, exclude early-morning punches that belong to the previous day
                const prevDateObj = new Date(currentDate);
                prevDateObj.setDate(prevDateObj.getDate() - 1);
                const prevDateStr = toDateStr(prevDateObj);

                let prevShiftEndsNearMidnight = false;
                {
                    // Check if previous day had a shift ending near midnight
                    // NOTE: We check even if prevDateStr < date_from because the day BEFORE
                    // the project start can still have a midnight-ending shift whose punch-out
                    // bleeds into the first project day
                    // IMPORTANT: Check ALL shift types - date-specific (including Ramadan) AND general shifts
                    const prevDateShifts = employeeShifts.filter(s => s.date === prevDateStr);
                    const prevGeneralShifts = employeeShifts.filter(s => !s.date);
                    // Prefer date-specific shifts (which includes Ramadan shifts), fall back to general
                    const prevShiftCandidates = prevDateShifts.length > 0 ? prevDateShifts : prevGeneralShifts;
                    for (const ps of prevShiftCandidates) {
                        // For single shifts, the end time is in pm_end
                        // For combined shifts, pm_end is the night shift end
                        const endTimeStr = ps.pm_end;
                        const pEndTime = parseTime(endTimeStr, includeSeconds);
                        if (pEndTime) {
                            const pEndHour = pEndTime.getHours();
                            const pEndMin = pEndTime.getMinutes();
                            // Shift ends near midnight: 11 PM (hour 23) or any time in 12 AM hour (hour 0)
                            if (pEndHour === 23 || pEndHour === 0) {
                                prevShiftEndsNearMidnight = true;
                                break;
                            }
                        }
                    }
                }

                if (prevShiftEndsNearMidnight) {
                    console.log(`[runAnalysis] MIDNIGHT DETECT: Employee ${attendanceIdStr}, Date ${dateStr}: Previous day (${prevDateStr}) shift ends near midnight → will exclude early AM punches`);
                }

                // Determine if this shift ends near midnight
                // For single shifts: end time is in pm_end (am_start → pm_end)
                // For combined shifts: end time is in pm_end (night shift end)
                let shiftEndsNearMidnight = false;
                if (shift) {
                    const endTimeStr = shift.pm_end;
                    const pmEndTime = parseTime(endTimeStr, includeSeconds);
                    if (pmEndTime) {
                        const endHour = pmEndTime.getHours();
                        const endMinute = pmEndTime.getMinutes();
                        // Shift ends near midnight if pm_end is in 11 PM hour (23) or 12 AM hour (0)
                        if (endHour === 23 || endHour === 0) {
                            shiftEndsNearMidnight = true;
                        }
                    }
                }

                // Get punches for this date
                let dayPunches = employeePunches
                    .filter(p => p.punch_date === dateStr);

                // MIDNIGHT FIX: If PREVIOUS day's shift ended near midnight,
                // exclude early-morning punches (12:00 AM - 02:00 AM) from THIS day's punches
                // because those belong to the previous day's shift as punch-outs
                if (prevShiftEndsNearMidnight) {
                    const beforeFilter = dayPunches.length;
                    dayPunches = dayPunches.filter(p => !isWithinMidnightBuffer(p.timestamp_raw));
                    if (dayPunches.length < beforeFilter) {
                        console.log(`[runAnalysis] MIDNIGHT FIX: Employee ${attendanceIdStr}, Date ${dateStr}: Excluded ${beforeFilter - dayPunches.length} early AM punch(es) that belong to prev day ${prevDateStr}`);
                    }
                }

                // If shift ends near midnight, also grab early-morning punches from next day
                // These are punch-outs that crossed midnight (e.g., 12:05 AM, 12:15 AM, 12:30 AM)
                if (shiftEndsNearMidnight) {
                    // Get punches from next day - check both main punches and next-day overflow
                    const nextDayAllPunches = [
                        ...employeePunches.filter(p => p.punch_date === nextDateStr),
                        ...nextDayPunches.filter(p => p.punch_date === nextDateStr)
                    ];

                    // Deduplicate by punch id
                    const seenIds = new Set(dayPunches.map(p => p.id));
                    const uniqueNextDayPunches = nextDayAllPunches.filter(p => !seenIds.has(p.id));

                    // Include next-day punches that are within 120 minutes of midnight
                    // (i.e., punches between 12:00 AM and 02:00 AM)
                    const midnightCrossoverPunches = uniqueNextDayPunches.filter(p => isWithinMidnightBuffer(p.timestamp_raw));

                    if (midnightCrossoverPunches.length > 0) {
                        console.log(`[runAnalysis] MIDNIGHT FIX: Employee ${attendanceIdStr}, Date ${dateStr}: Found ${midnightCrossoverPunches.length} crossover punch(es) from next day ${nextDateStr}`);
                        dayPunches = [...dayPunches, ...midnightCrossoverPunches];
                    }
                }

                dayPunches = dayPunches.sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw);
                    const timeB = parseTime(b.timestamp_raw);
                    // For midnight crossover, punches from next day (hour 0) should sort AFTER today's punches
                    // We adjust by adding 24h offset if the punch is from the next day
                    const aIsNextDay = a.punch_date === nextDateStr;
                    const bIsNextDay = b.punch_date === nextDateStr;
                    const aTime = (timeA?.getTime() || 0) + (aIsNextDay ? 24 * 60 * 60 * 1000 : 0);
                    const bTime = (timeB?.getTime() || 0) + (bIsNextDay ? 24 * 60 * 60 * 1000 : 0);
                    return aTime - bTime;
                });

                let filteredPunches: any[] = filterMultiplePunches(dayPunches, shift, includeSeconds);

                // Log missing shift AFTER filteredPunches is computed
                if (!shift && filteredPunches.length > 0 && !dateException) {
                    console.warn(`[runAnalysis] ⚠️ MISSING SHIFT - Employee: ${employee?.name || attendanceIdStr} (${attendanceIdStr}), Date: ${dateStr}, Punches: ${filteredPunches.length}, Day: ${currentDayName}`);
                    abnormal_dates_set.add(dateStr);
                    critical_abnormal_dates_set.add(dateStr);
                }
                
                // ================================================================
                // SKIP_PUNCH & HALF_DAY_HOLIDAY: Determine targeted skip points
                // ================================================================
                let skippedShiftPoints = new Set<string>();
                let skipPunchForced0PunchPresent = false;
                
                if (skipPunchException && !isNonWorkingStatus) {
                    const skipType = skipPunchException.punch_to_skip;
                    if (skipType === 'AM_PUNCH_IN') skippedShiftPoints.add('AM_START');
                    else if (skipType === 'AM_PUNCH_OUT') skippedShiftPoints.add('AM_END');
                    else if (skipType === 'PM_PUNCH_IN') skippedShiftPoints.add('PM_START');
                    else if (skipType === 'PM_PUNCH_OUT') skippedShiftPoints.add('PM_END');
                    else if (skipType === 'FULL_SKIP') {
                        skippedShiftPoints.add('AM_START');
                        skippedShiftPoints.add('AM_END');
                        skippedShiftPoints.add('PM_START');
                        skippedShiftPoints.add('PM_END');
                    }
                    
                    // LOP SAVER: 0 punches + FULL_SKIP → force Present (Skip Punch)
                    if (filteredPunches.length === 0 && (skipType === 'FULL_SKIP' || skipType === 'AM_PUNCH_IN' || skipType === 'PM_PUNCH_OUT')) {
                        filteredPunches = [{ _fake_skip_punch: true }];
                        skipPunchForced0PunchPresent = true;
                        console.log(`[runAnalysis] SKIP_PUNCH LOP SAVER: Employee ${attendanceIdStr}, Date ${dateStr}: 0 punches + ${skipType} → adding fake punch`);
                    }
                } else if (dateException && dateException.type === 'HALF_DAY_HOLIDAY' && !isNonWorkingStatus) {
                    const holidayTarget = dateException.half_day_target; // 'AM' or 'PM'
                    if (holidayTarget === 'AM') {
                        skippedShiftPoints.add('AM_START');
                        skippedShiftPoints.add('AM_END');
                    } else if (holidayTarget === 'PM') {
                        skippedShiftPoints.add('PM_START');
                        skippedShiftPoints.add('PM_END');
                    }
                    
                    if (filteredPunches.length === 0) {
                        filteredPunches = [{ _fake_skip_punch: true }];
                        skipPunchForced0PunchPresent = true;
                        console.log(`[runAnalysis] HALF_DAY_HOLIDAY LOP SAVER: Employee ${attendanceIdStr}, Date ${dateStr}: 0 punches → adding fake punch`);
                    }
                }
                
                const hasSkipApplied = skippedShiftPoints.size > 0;

                let punchMatches: any[] = [];
                let hasUnmatchedPunch = false;
                // Allow punch matching even when skip is applied (we'll zero out specific minutes after)
                // Only skip matching if we have a fake-only punch list
                const hasOnlyFakePunches = filteredPunches.length > 0 && filteredPunches.every((p: any) => p._fake_skip_punch);
                if (shift && filteredPunches.length > 0 && !hasOnlyFakePunches) {
                    punchMatches = matchPunchesToShiftPoints(filteredPunches, shift, includeSeconds, nextDateStr);
                    hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
                }

                // ================================================================
                // PUNCH COMPLETENESS RULE (REPLACED detectPartialDay)
                // ================================================================
                // This logic determines Present, Half Day, or Absent status based on punch counts.
                // 1. Single Shift (2 expected): 0=LOP, 1=Half, 2=Present
                // 2. Split Shift (4 expected): 0=LOP, 1=Half, 2=Half, 3=Present, 4=Present
                // Bypasses: SKIP_PUNCH or FULL_SKIP exceptions only.
                // ================================================================
                
                const punchCount = filteredPunches.length;
                const hasMiddleTimes = shift?.am_end && shift?.pm_start &&
                    String(shift.am_end).trim() !== '' && String(shift.pm_start).trim() !== '' &&
                    shift.am_end !== '—' && shift.pm_start !== '—' &&
                    shift.am_end !== '-' && shift.pm_start !== '-' &&
                    shift.am_end !== 'null' && shift.pm_start !== 'null';
                const isSingleShift = shift?.is_single_shift === true || !hasMiddleTimes;

                if (punchCount > 0) {
                    if (skipPunchForced0PunchPresent || hasSkipApplied) {
                        // SKIP_PUNCH or HALF_DAY_HOLIDAY is applied, always Present
                        presentDays++;
                        dateStatusMap[dateStr] = 'PRESENT_SKIP_PUNCH';
                    } else {
                        // NORMAL PUNCH COMPLETENESS LOGIC
                        if (isSingleShift) {
                            if (punchCount === 1) {
                                presentDays++;
                                halfAbsenceCount++;
                                dateStatusMap[dateStr] = 'PRESENT';
                            } else {
                                presentDays++;
                                dateStatusMap[dateStr] = 'PRESENT';
                            }
                        } else {
                            // SPLIT SHIFT (4 expected)
                            if (punchCount === 1 || punchCount === 2) {
                                presentDays++;
                                halfAbsenceCount++;
                                dateStatusMap[dateStr] = 'PRESENT';
                            } else {
                                presentDays++;
                                dateStatusMap[dateStr] = 'PRESENT';
                            }
                        }
                    }
                } else {
                    // Zero punches
                    if (!dateException || (dateException.type !== 'MANUAL_PRESENT')) {
                        fullAbsenceCount++;
                        dateStatusMap[dateStr] = 'LOP';
                    } else {
                        presentDays++;
                        dateStatusMap[dateStr] = 'PRESENT';
                    }
                }

                // Check for approved minutes (Al Maraghi Motors only).
                // RULES:
                // 1. Only applies if employee was PRESENT (has punches) — not on absent/LOP days.
                // 2. Applied PER-DAY: reduces that specific day's late+early BEFORE accumulating.
                //    This means the raw late/early stored in AnalysisResult are ALREADY reduced.
                //    totalApprovedMinutes is the SUM of per-day reductions, tracked for DISPLAY only.
                let approvedMinutesForDay = 0;
                let punchSpecificGrace: Record<string, number> = {
                    'AM_START': 0, 'AM_END': 0, 'PM_START': 0, 'PM_END': 0
                };
                
                try {
                    // Collect ALL ALLOWED_MINUTES exceptions for this date
                    const allowedExceptions = matchingExceptions.filter(ex => 
                        ex.type === 'ALLOWED_MINUTES' && 
                        (ex.approval_status === 'approved_dept_head' || ex.approval_status === 'approved')
                    );
                    
                    for (const ex of allowedExceptions) {
                        if (ex.attendance_id === 'ALL' && ex.target_punch) {
                            // Unified Grace Minutes for specific punch
                            punchSpecificGrace[ex.target_punch] += (ex.allowed_minutes || 0);
                        } else if (String(ex.attendance_id) === attendanceIdStr) {
                             // Regular employee-specific allowed minutes (handled at total level)
                             approvedMinutesForDay += (ex.allowed_minutes || 0);
                        }
                    }
                } catch {
                    approvedMinutesForDay = 0;
                }

                // ----------------------------------------------------------------
                // MANUAL_OTHER_MINUTES: scan ALL matching exceptions for this date
                // and accumulate their allowed_minutes directly into otherMinutes.
                //
                // This is distinct from ALLOWED_MINUTES, which reduces deductible
                // late/early minutes for the day. MANUAL_OTHER_MINUTES exceptions
                // add purely to the other_minutes field in the AnalysisResult —
                // they do NOT touch late or early checkout totals.
                //
                // Multiple MANUAL_OTHER_MINUTES exceptions on the same date are
                // supported (e.g. one created by dept-head split + one manual edit).
                // We use matchingExceptions (all exceptions for the date) rather than
                // dateException (only the most recent one) so none are missed.
                // ----------------------------------------------------------------
                const manualOtherExceptions = matchingExceptions.filter(ex => ex.type === 'MANUAL_OTHER_MINUTES');
                for (const moEx of manualOtherExceptions) {
                    const moMinutes = moEx.allowed_minutes || 0;
                    if (moMinutes > 0) {
                        otherMinutes += moMinutes;
                        // Track that this date's other minutes came from an existing exception.
                        // This prevents the post-analysis block from re-creating them.
                        otherMinutesFromExceptions[dateStr] = (otherMinutesFromExceptions[dateStr] || 0) + moMinutes;
                        console.log(`[runAnalysis] MANUAL_OTHER_MINUTES: Employee ${attendanceIdStr}, Date ${dateStr}: adding ${moMinutes} to other_minutes`);
                    }
                }

                const hasManualTimeException = dateException && (
                    dateException.type === 'MANUAL_LATE' ||
                    dateException.type === 'MANUAL_EARLY_CHECKOUT' ||
                    (dateException.late_minutes && dateException.late_minutes > 0) ||
                    (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) ||
                    (dateException.other_minutes && dateException.other_minutes > 0)
                );

                const shouldSkipTimeCalculation = dateException && [
                    'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'OFF', 'PUBLIC_HOLIDAY'
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
                        // Track that these other minutes came FROM an existing exception
                        // so we do NOT re-create them at the end of analysis
                        otherMinutesFromExceptions[dateStr] = Math.abs(dateException.other_minutes);
                    }
                } else if (shift && punchMatches.length > 0 && !shouldSkipTimeCalculation) {
                    let dayLateMinutes = 0;
                    let dayEarlyMinutes = 0;
                    
                    // Track which shift points had actual punches matched
                    const matchedShiftPoints = new Set(punchMatches.filter(m => m.matchedTo).map(m => m.matchedTo));
                    
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        
                        // Force 0 for skipped points
                        if (skippedShiftPoints.has(match.matchedTo)) continue;

                        const punchTime = match.punch.time;
                        const shiftTime = match.shiftTime;
                        const grace = punchSpecificGrace[match.matchedTo] || 0;

                        if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                            if (punchTime > shiftTime) {
                                let minutes = Math.round(Math.abs((punchTime - shiftTime) / (1000 * 60)));
                                // Apply punch specific grace
                                minutes = Math.max(0, minutes - grace);
                                dayLateMinutes += minutes;
                            }
                        }

                        if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                            if (punchTime < shiftTime) {
                                let minutes = Math.round(Math.abs((shiftTime - punchTime) / (1000 * 60)));
                                // Apply punch specific grace
                                minutes = Math.max(0, minutes - grace);
                                dayEarlyMinutes += minutes;
                            }
                        }
                    }
                    
                    // FIX: Apply approved minutes PER-DAY before accumulating.
                    // Reduce this day's late+early by the approved amount (floor at 0 each).
                    // This means lateMinutes/earlyCheckoutMinutes in AnalysisResult are ALREADY
                    // net of approved minutes. totalApprovedMinutes tracks the sum for display.
                    if (approvedMinutesForDay > 0) {
                        const dayTotal = dayLateMinutes + dayEarlyMinutes;
                        const reduction = Math.min(approvedMinutesForDay, dayTotal);
                        const lateRatio = dayLateMinutes / dayTotal;
                        const earlyRatio = dayEarlyMinutes / dayTotal;
                        dayLateMinutes = Math.max(0, dayLateMinutes - Math.round(reduction * lateRatio));
                        dayEarlyMinutes = Math.max(0, dayEarlyMinutes - Math.round(reduction * earlyRatio));
                        totalApprovedMinutes += reduction; // track actual reduction for display
                        console.log(`[runAnalysis] ALLOWED_MINUTES: Employee ${attendanceIdStr}, Date ${dateStr}: approved=${approvedMinutesForDay}, reduced by ${reduction} (late: ${dayLateMinutes}, early: ${dayEarlyMinutes})`);
                    }
                    
                    lateMinutes += dayLateMinutes;
                    earlyCheckoutMinutes += dayEarlyMinutes;
                } else if (hasSkipApplied && hasOnlyFakePunches && !shouldSkipTimeCalculation) {
                    // SKIP_PUNCH with only fake punches (0 real punches + FULL_SKIP):
                    // No time calculation needed — all minutes already 0
                    console.log(`[runAnalysis] SKIP_PUNCH: Employee ${attendanceIdStr}, Date ${dateStr}: 0 real punches, skip applied → no time calc needed`);
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

            // ================================================================
            // LOP-ADJACENT BLOCK RULE (REWRITTEN per RULE 1-4)
            // ================================================================
            // RULE 1: Weekly Off adjacent to LOP becomes LOP (if no leave).
            // RULE 2: Public Holiday (or block of PH/WO) adjacent to LOP 
            //         becomes LOP. The entire connected block converts to LOP.
            // RULE 3 & 4: Days within Annual Leave or Sick Leave range are 
            //             PROTECTED and exempt from LOP-adjacent conversion.
            // ================================================================
            {
                const allDatesInRange = [];
                for (let dl = new Date(startDate); dl <= endDate; dl = new Date(dl.setDate(dl.getDate() + 1))) {
                    allDatesInRange.push(toDateStr(dl));
                }

                let currentOffBlock = [];
                for (let i = 0; i < allDatesInRange.length; i++) {
                    const dStr = allDatesInRange[i];
                    const status = (dateStatusMap as Record<string, string>)[dStr];

                    if (status === 'WEEKLY_OFF' || status === 'PUBLIC_HOLIDAY') {
                        currentOffBlock.push(dStr);
                    } else {
                        if (currentOffBlock.length > 0) {
                            applyLopAdjacentToBlock(currentOffBlock);
                            currentOffBlock = [];
                        }
                    }
                }
                if (currentOffBlock.length > 0) {
                    applyLopAdjacentToBlock(currentOffBlock);
                }

                function applyLopAdjacentToBlock(block: string[]) {
                    if (block.length === 0) return;
                    
                    const firstDateStr = block[0];
                    const lastDateStr = block[block.length - 1];

                    const prevDate = new Date(firstDateStr);
                    prevDate.setDate(prevDate.getDate() - 1);
                    const prevDateStr = toDateStr(prevDate);

                    const nextDate = new Date(lastDateStr);
                    nextDate.setDate(nextDate.getDate() + 1);
                    const nextDateStr = toDateStr(nextDate);

                    const prevStatus = (dateStatusMap as Record<string, string>)[prevDateStr];
                    const nextStatus = (dateStatusMap as Record<string, string>)[nextDateStr];

                    // Block is adjacent to LOP if any side is LOP (Manual or Punch-based)
                    if (prevStatus === 'LOP' || nextStatus === 'LOP') {
                        for (const dateStr of block) {
                            // RULE 3 & 4: Check for PROTECTIVE LEAVE (Annual or Sick)
                            // This ensures days already covered by leave don't get double deduction.
                            const isProtectedByLeave = employeeExceptions.some((ex: any) => {
                                if (ex.type !== 'ANNUAL_LEAVE' && ex.type !== 'SICK_LEAVE') return false;
                                try {
                                    const exFrom = new Date(ex.date_from);
                                    const exTo = new Date(ex.date_to);
                                    const checkDate = new Date(dateStr);
                                    // Normalize for comparison
                                    checkDate.setHours(0, 0, 0, 0);
                                    exFrom.setHours(0, 0, 0, 0);
                                    exTo.setHours(0, 0, 0, 0);
                                    return checkDate >= exFrom && checkDate <= exTo;
                                } catch { return false; }
                            });

                            if (!isProtectedByLeave) {
                                const originalStatus = (dateStatusMap as Record<string, string>)[dateStr];
                                fullAbsenceCount++;
                                lopAdjacentWeeklyOffCount++;
                                (dateStatusMap as Record<string, string>)[dateStr] = originalStatus === 'WEEKLY_OFF' 
                                    ? 'LOP_ADJACENT_WEEKLY_OFF' 
                                    : 'LOP_ADJACENT_PUBLIC_HOLIDAY';
                                
                                console.log(`[runAnalysis] LOP-adjacent deduction: Employee ${attendanceIdStr}, Date ${dateStr} (${originalStatus}) → LOP`);
                            } else {
                                console.log(`[runAnalysis] LOP-adjacent bypass (Protected by ${employeeExceptions.find((ex: any) => dateStr >= ex.date_from && dateStr <= ex.date_to)?.type}): Employee ${attendanceIdStr}, Date ${dateStr}`);
                            }
                        }
                    }
                }
            }

            const criticalDatesFormatted = critical_abnormal_dates_set.size > 0
                ? [...critical_abnormal_dates_set].sort().map(d => new Date(d as string).toLocaleDateString()).join(', ')
                : '';
            const autoResolutionNotes = auto_resolutions.length > 0
                ? auto_resolutions.map(r => `${new Date(r.date).toLocaleDateString()}: ${r.details}`).join(' | ')
                : '';

            const dept = employee?.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;

            // Fetch carried_grace_minutes from Employee entity for Al Maraghi Motors ONLY (by stable company_id)
            let carriedGrace = 0;
            if (period.use_carried_grace_minutes === true && isAlMaraghiMotors) {
                const freshEmployee = employees.find(e => String(e.attendance_id) === attendanceIdStr);
                if (freshEmployee && typeof freshEmployee.carried_grace_minutes === 'number' && freshEmployee.carried_grace_minutes > 0) {
                    carriedGrace = freshEmployee.carried_grace_minutes;
                    console.log(`[runAnalysis] [Al Maraghi Motors] Employee ${attendanceIdStr}: Loaded carried grace = ${carriedGrace} minutes from Employee.carried_grace_minutes`);
                } else {
                    carriedGrace = 0;
                    console.log(`[runAnalysis] [Al Maraghi Motors] Employee ${attendanceIdStr}: No carried grace found or value is 0, using defaultGraceMinutes only`);
                }
            }

            // ============================================================================
            // CRITICAL: DEDUCTIBLE_MINUTES CALCULATION (IMMUTABLE FOR SALARY)
            // ============================================================================
            // RULE: Other minutes are COMPLETELY EXCLUDED from deductible calculation
            // RULE: Grace minutes reduce ONLY late+early
            // RULE: Approved minutes are ALREADY applied per-day during punch calculation
            //       (reducing late/early minutes for the specific day). They are NOT subtracted
            //       again from the final total — that would be double-dipping.
            //       totalApprovedMinutes is tracked for REPORTING/DISPLAY purposes only.
            // 
            // FORMULA:
            //   1. base = lateMinutes + earlyCheckoutMinutes (EXCLUDE other_minutes)
            //      NOTE: lateMinutes/earlyCheckoutMinutes already have per-day approved offsets applied
            //   2. deductibleMinutes = max(0, base - totalGraceMinutes)
            // 
            // CRITICAL FIX: Force positive values at EVERY step to prevent negative data corruption
            // Grace = baseGrace + carriedGrace
            // Other minutes are NOT part of deductible calculation at all
            // ============================================================================
            // ============================================================================
            // GRACE CARRY-FORWARD FORMULA (used by closeProject / previewGraceCarryForward):
            //   unusedGrace = max(0, effectiveGrace - (late_minutes + early_checkout_minutes))
            //   Where late_minutes and early_checkout_minutes are the RAW values stored here.
            //   No other fields (approved, other, deductible, ramadan_gift) are involved.
            // ============================================================================
            const totalGraceMinutes = Math.max(0, baseGrace) + Math.max(0, carriedGrace);
            // lateMinutes and earlyCheckoutMinutes are ALREADY net of per-day approved reductions.
            // Do NOT subtract totalApprovedMinutes again — that would be double-dipping.
            const rawLateEarly = Math.max(0, lateMinutes) + Math.max(0, earlyCheckoutMinutes);
            const deductibleMinutes = Math.max(0, rawLateEarly - totalGraceMinutes);

            console.log(`[runAnalysis] Employee ${attendanceIdStr}: Late=${lateMinutes}(net), Early=${earlyCheckoutMinutes}(net), Approved(display)=${totalApprovedMinutes}, BaseGrace=${baseGrace}, Carried=${carriedGrace}, TotalGrace=${totalGraceMinutes}, Deductible=${deductibleMinutes}, Other=${otherMinutes}(NOT in deductible)`);

            // Build set of LOP-adjacent weekly off and holiday dates for storage
            const lopAdjacentWeeklyOffDates = Object.entries(dateStatusMap)
                .filter(([, status]) => String(status).startsWith('LOP_ADJACENT_'))
                .map(([dateStr]) => dateStr)
                .sort()
                .join(', ');

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
                lop_adjacent_weekly_off_count: Math.max(0, lopAdjacentWeeklyOffCount),
                lop_adjacent_weekly_off_dates: lopAdjacentWeeklyOffDates,
                // CRITICAL: Only include other minutes that did NOT come from existing exceptions.
                // Other minutes from existing exceptions are already in the DB — do NOT re-create them.
                // otherMinutesByDate = from NON-exception sources (should be created as new exceptions)
                // otherMinutesFromExceptions = from existing exceptions (already exist, skip)
                _otherMinutesDetails: (Object.keys(otherMinutesByDate).length > 0) ? {
                    attendance_id: attendanceIdStr,
                    other_minutes: Object.values(otherMinutesByDate).reduce((sum: number, v: any) => sum + v, 0),
                    employee_name: employee?.name || attendanceIdStr,
                    breakdown: otherMinutesByDate
                } : null
            };
        };

        // Preserve Ramadan gift minutes when re-running analysis for an existing report
        const existingResultsForReport = await base44.asServiceRole.entities.AnalysisResult.filter({
            calendar_period_id,
                    project_id: null,
                    report_run_id: reportRun.id
        }, null, 5000);

        const existingRamadanGiftMinutesByAttendanceId = new Map(
            existingResultsForReport
                .filter(r => r.attendance_id !== null && r.attendance_id !== undefined)
                .map(r => [String(r.attendance_id), Math.max(0, Number(r.ramadan_gift_minutes || 0))])
        );

        // Process all employees and build results array
        // Using smaller batches with delays to handle database load issues
        const allResults = [];
        const processedAttendanceIds = new Set();
        const otherMinutesExceptionsToCreate = []; // Track other minutes exceptions to create
        const ANALYSIS_BATCH_SIZE = 100; // CRITICAL FIX: Process 100 employees at once to avoid timeout
        const ANALYSIS_BATCH_DELAY = 0; // No delays for maximum speed

        // Convert to array for batch processing
        const employeeIdsArray = [...uniqueEmployeeIds];

        // CHUNK PROCESSING: If chunk params provided, only process that subset
        const startIdx = _chunk_offset !== undefined ? _chunk_offset : 0;
        const endIdx = _chunk_size !== undefined ? Math.min(startIdx + _chunk_size, employeeIdsArray.length) : employeeIdsArray.length;
        const employeesToProcess = employeeIdsArray.slice(startIdx, endIdx);

        console.log(`[runAnalysis] Processing chunk: employees ${startIdx}-${endIdx} of ${employeeIdsArray.length}`);

        for (let i = 0; i < employeesToProcess.length; i += ANALYSIS_BATCH_SIZE) {
            const batchIds = employeesToProcess.slice(i, i + ANALYSIS_BATCH_SIZE);

            // Process batch of employees
            for (const attendance_id of batchIds) {
                const idStr = String(attendance_id);
                if (processedAttendanceIds.has(idStr)) {
                    console.warn('[runAnalysis] Skipping duplicate attendance_id:', attendance_id);
                    continue;
                }

                processedAttendanceIds.add(idStr);
                const result = await analyzeEmployee(attendance_id);
                const preservedRamadanGiftMinutes = existingRamadanGiftMinutesByAttendanceId.get(String(attendance_id)) || 0;

                allResults.push({
                    calendar_period_id,
                    project_id: null,
                    report_run_id: reportRun.id,
                    ramadan_gift_minutes: preservedRamadanGiftMinutes,
                    ...result
                });

                // Track other minutes for exception creation
                if (result._otherMinutesDetails) {
                    otherMinutesExceptionsToCreate.push(result._otherMinutesDetails);
                }
            }

            // Log progress
            console.log(`[runAnalysis] Processed batch ${Math.floor(i / ANALYSIS_BATCH_SIZE) + 1}/${Math.ceil(employeesToProcess.length / ANALYSIS_BATCH_SIZE)} (${Math.min(i + ANALYSIS_BATCH_SIZE, employeesToProcess.length)}/${employeesToProcess.length} employees in this chunk)`);

            // Add delay between analysis batches to reduce database load
            if (i + ANALYSIS_BATCH_SIZE < employeesToProcess.length) {
                await new Promise(resolve => setTimeout(resolve, ANALYSIS_BATCH_DELAY));
            }
        }

        console.log('[runAnalysis] Processed employees:', allResults.length);
        console.log('[runAnalysis] Unique attendance IDs processed:', processedAttendanceIds.size);

        // CHUNK MODE: Only delete results for employees in THIS chunk
        if (_chunk_offset !== undefined && allResults.length > 0) {
            // Use already-fetched existingResultsForReport to avoid per-employee API calls (rate limit fix)
            const attendanceIdsToDelete = new Set(allResults.map(r => String(r.attendance_id)));
            const toDelete = existingResultsForReport.filter(r => attendanceIdsToDelete.has(String(r.attendance_id)));
            if (toDelete.length > 0) {
                // Delete in batches of 50 to avoid rate limits
                for (let i = 0; i < toDelete.length; i += 50) {
                    const batch = toDelete.slice(i, i + 50);
                    await Promise.all(batch.map(r => base44.asServiceRole.entities.AnalysisResult.delete(r.id)));
                    if (i + 50 < toDelete.length) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                }
                console.log(`[runAnalysis] Deleted ${toDelete.length} existing chunk results`);
            }
        } else if (existingResultsForReport.length > 0 && _chunk_offset === undefined) {
            // Full run - delete all existing
            await base44.asServiceRole.entities.AnalysisResult.deleteMany({
                calendar_period_id,
                    project_id: null,
                    report_run_id: reportRun.id
            });
        }

        // Save results in larger batches with minimal delays
        const SAVE_BATCH_SIZE = 100; // CRITICAL FIX: Save 100 results at once to avoid timeout
        const SAVE_BATCH_DELAY = 0; // No delays for maximum speed

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
        // CRITICAL FIX: Create PER-DATE exceptions, not spanning the entire project range.
        // Each date with other minutes gets its own exception with the correct minutes for that day.
        if (otherMinutesExceptionsToCreate.length > 0) {
            console.log(`[runAnalysis] Creating MANUAL_OTHER_MINUTES exceptions (per-date) for ${otherMinutesExceptionsToCreate.length} employees`);

            for (const detail of otherMinutesExceptionsToCreate) {
                try {
                    const breakdown = detail.breakdown || {};
                    const dates = Object.keys(breakdown);

                    for (const dateStr of dates) {
                        const minutesForDate = (breakdown as Record<string, number>)[dateStr];
                        if (!minutesForDate || minutesForDate <= 0) continue;

                        await base44.asServiceRole.entities.Exception.create({
                            calendar_period_id,
                            attendance_id: detail.attendance_id,
                            date_from: dateStr,
                            date_to: dateStr,
                            type: 'MANUAL_OTHER_MINUTES',
                            other_minutes: minutesForDate,
                            details: `Other minutes: ${minutesForDate} min on ${new Date(dateStr).toLocaleDateString()}`,
                            created_from_report: true,
                            report_run_id: reportRun.id,
                            use_in_analysis: true,
                            approval_status: 'pending_dept_head'
                        });
                    }
                } catch (exError) {
                    console.warn(`[runAnalysis] Failed to create other minutes exception for ${detail.attendance_id}:`, exError.message);
                }
            }
        }

        // Update project status (only if this is NOT a chunk or it's the final chunk)
        const isFinalChunk = _chunk_offset === undefined || (startIdx + allResults.length >= uniqueEmployeeIds.length);
        if (isFinalChunk) {
            await base44.asServiceRole.entities.CalendarPeriod.update(calendar_period_id, {
                last_saved_report_id: reportRun.id,
                status: 'analyzed'
            });
        }

        return Response.json({
            success: true,
            report_run_id: reportRun.id,
            processed_count: allResults.length,
            total_count: uniqueEmployeeIds.length,
            chunk_start: startIdx,
            chunk_end: endIdx,
            is_complete: isFinalChunk,
            other_minutes_exceptions_created: otherMinutesExceptionsToCreate.length,
            message: `Analysis complete for ${allResults.length} employees (${startIdx}-${endIdx} of ${uniqueEmployeeIds.length})`
        });

    } catch (error) {
        console.error('Run analysis error:', error);
        return Response.json({
            error: error.message
        }, { status: 500 });
    }
});