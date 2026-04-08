import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Backend function to run attendance analysis for a project.
 * This contains the complete analysis logic moved from frontend.
 * This is the main function of the app and is the backbone of the app.
 */
// @ts-ignore: Deno
// redeploy trigger 2
Deno.serve(async (req: Request) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const {
            project_id,
            date_from,
            date_to,
            report_name,
            _existing_report_run_id,
            _chunk_offset,
            _chunk_size
        } = await req.json();

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

        // Security: Verify access - privileged roles have full project access, others need company match
        if (userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'ceo' && userRole !== 'user' && userRole !== 'hr_manager') {
            if (project.company !== user.company) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // No company-specific hardcoding — all features are driven by project/rules settings

        // PAGINATED FETCH HELPER: SDK truncates large responses at ~64KB.
        // We must fetch in pages of 200 records to avoid truncation.
        // Includes retry with backoff for rate limit (429) errors.
        const PAGE_SIZE = 200;
        const fetchWithRetry = async (fn, maxRetries = 6) => {
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await fn();
                } catch (e) {
                    const status = e?.status || e?.response?.status || 0;
                    if (status === 429 && attempt < maxRetries) {
                        const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
                        console.warn(`[runAnalysis] Rate limited, retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    throw e;
                }
            }
        };

        const fetchAllPages = async (entity, query, sortField = null) => {
            const allItems = [];
            let skip = 0;
            let currentPageSize = PAGE_SIZE;
            let consecutiveEmpty = 0;
            while (consecutiveEmpty < 2) {
                const raw = await fetchWithRetry(() => entity.filter(query, sortField, currentPageSize, skip));
                let page = [];
                if (Array.isArray(raw)) {
                    page = raw;
                } else if (typeof raw === 'string') {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) page = parsed;
                    } catch {
                        if (currentPageSize > 25) {
                            currentPageSize = Math.max(25, Math.floor(currentPageSize / 2));
                            console.warn(`[runAnalysis] Paginated fetch: JSON truncated at skip=${skip}, reducing page to ${currentPageSize} and retrying`);
                            continue;
                        }
                        console.error(`[runAnalysis] Paginated fetch: JSON still truncated at page size ${currentPageSize}, skip=${skip}. Skipping batch.`);
                        skip += currentPageSize;
                        continue;
                    }
                }
                if (page.length === 0) {
                    consecutiveEmpty++;
                    skip += currentPageSize;
                    continue;
                }
                consecutiveEmpty = 0;
                allItems.push(...page);
                skip += page.length;
                if (page.length < currentPageSize) break;
                // Small delay between pages to avoid rate limits
                await new Promise(r => setTimeout(r, 200));
            }
            return allItems;
        };

        // Fetch data SEQUENTIALLY to avoid rate limiting.
        console.log('[runAnalysis] Fetching punches...');
        const punches = await fetchAllPages(base44.asServiceRole.entities.Punch, { project_id });
        await new Promise(r => setTimeout(r, 500));
        console.log('[runAnalysis] Fetching shifts...');
        const shifts = await fetchAllPages(base44.asServiceRole.entities.ShiftTiming, { project_id });
        await new Promise(r => setTimeout(r, 500));
        console.log('[runAnalysis] Fetching exceptions...');
        const exceptions = await fetchAllPages(base44.asServiceRole.entities.Exception, { project_id });
        await new Promise(r => setTimeout(r, 500));
        console.log('[runAnalysis] Fetching employees...');
        const allEmployees = await fetchAllPages(base44.asServiceRole.entities.Employee, { company: project.company, active: true });
        await new Promise(r => setTimeout(r, 500));
        console.log('[runAnalysis] Fetching rules, project employees, ramadan schedules...');
        const [rulesData, projectEmployees, ramadanSchedules] = await Promise.all([
            fetchAllPages(base44.asServiceRole.entities.AttendanceRules, { company: project.company }),
            fetchAllPages(base44.asServiceRole.entities.ProjectEmployee, { project_id }),
            fetchAllPages(base44.asServiceRole.entities.RamadanSchedule, { company: project.company, active: true })
        ]);

        // Ensure rulesData and ramadanSchedules are arrays
        const safeRulesData = Array.isArray(rulesData) ? rulesData : [];
        const safeRamadanSchedules = Array.isArray(ramadanSchedules) ? ramadanSchedules : [];

        console.log('[runAnalysis] Data fetch results - punches:', punches.length, ', shifts:', shifts.length, ', exceptions:', exceptions.length, ', employees:', allEmployees.length);

        // CRITICAL GUARD: If punches loaded as 0 but we expected data, abort
        if (punches.length === 0 && shifts.length === 0) {
            console.error('[runAnalysis] FATAL: Both punches and shifts are empty after paginated fetch');
            return Response.json({ error: 'Failed to load punch/shift data. Please try again or use chunked analysis mode.' }, { status: 500 });
        }

        console.log('[runAnalysis] All employees fetched:', allEmployees.length);

        // Parse Ramadan schedules for shift lookup - only include schedules that overlap with project date range
        const projectStart = new Date(date_from);
        const projectEnd = new Date(date_to);
        let ramadanShiftsLookup: any = {};

        for (const schedule of safeRamadanSchedules) {
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
        if (safeRulesData.length > 0) {
            try {
                rules = JSON.parse(safeRulesData[0].rules_json);
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


        /**
         * UNIVERSAL 3:00 AM MIDNIGHT ROLLBACK (RULE 1-180)
         * All punches between 12:00 AM and 03:00 AM are attributed to the previous day 
         * UNLESS the employee's shift for that day explicitly starts in that window.
         */
        const MIDNIGHT_BUFFER_MINUTES = 180;

        const isWithinMidnightBuffer = (timestampRaw: string) => {
            const parsed = parseTime(timestampRaw);
            if (!parsed) return false;
            const minutesSinceMidnight = parsed.getHours() * 60 + parsed.getMinutes();
            return minutesSinceMidnight <= MIDNIGHT_BUFFER_MINUTES;
        };

        const shiftStartsNearMidnight = (s: any) => {
            if (!s) return false;
            const tStart = parseTime(s.am_start);
            if (!tStart) return false;
            const minutes = tStart.getHours() * 60 + tStart.getMinutes();
            return minutes <= MIDNIGHT_BUFFER_MINUTES;
        };

        const filterMultiplePunches = (punchList: any[], shift: any, includeSeconds = false) => {
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
                if (!isDuplicate) deduped.push(current);
            }
            return deduped.sort((a, b) => {
                const aIdx = punchList.findIndex(p => p.id === a.id);
                const bIdx = punchList.findIndex(p => p.id === b.id);
                return aIdx - bIdx;
            }).map(p => punchList.find(punch => punch.id === p.id)).filter(Boolean);
        };
        const analyzeEmployee = async (attendance_id: any, existingReportOverrides: any = {}) => {
                const attendanceIdStr = String(attendance_id);
                const employeeShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
                const employeeExceptions = exceptions.filter(e => {
                    try {
                        return (String(e.attendance_id) === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
                            e.use_in_analysis !== false &&
                            e.is_custom_type !== true &&
                            e.created_from_report !== true; // IGNORE global report-generated exceptions in favor of local overrides
                    } catch {
                        return false;
                    }
                });
                const employee = employees.find(e => String(e.attendance_id) === attendanceIdStr);
                const includeSeconds = true;

                const isShiftEffective = (s: any, targetDate: Date) => {
                    if (!s.effective_from || !s.effective_to) return true;
                    const from = new Date(s.effective_from);
                    const to = new Date(s.effective_to);
                    const targetDay = new Date(targetDate);
                    targetDay.setHours(0, 0, 0, 0);
                    const fromDay = new Date(from);
                    fromDay.setHours(0, 0, 0, 0);
                    const toDay = new Date(to);
                    toDay.setHours(0, 0, 0, 0);
                    return targetDay >= fromDay && targetDay <= toDay;
                };

                const shiftStartsNearMidnight = (s: any) => {
                    if (!s) return false;
                    const tStart = parseTime(s.am_start);
                    if (!tStart) return false;
                    const minutes = tStart.getHours() * 60 + tStart.getMinutes();
                    return minutes <= MIDNIGHT_BUFFER_MINUTES;
                };

                const getShiftForDate = (dateStr: string, dateObj: Date) => {
                    const dateSpecificShifts = employeeShifts.filter((s: any) => s.date === dateStr && isShiftEffective(s, dateObj));
                    let s: any = null;
                    if (dateSpecificShifts.length > 0) {
                        if (dateSpecificShifts.length === 1) {
                            s = dateSpecificShifts[0];
                        } else {
                            const ramadanDateShifts = dateSpecificShifts.filter((ps: any) => ps.applicable_days?.includes('Ramadan'));
                            if (ramadanDateShifts.length >= 2) {
                                const dayShift = ramadanDateShifts.find((ps: any) => ps.applicable_days?.includes('Day') || ps.applicable_days?.includes('S1'));
                                const nightShift = ramadanDateShifts.find((ps: any) => ps.applicable_days?.includes('Night') || ps.applicable_days?.includes('S2'));
                                if (dayShift && nightShift) {
                                    s = { am_start: dayShift.am_start, am_end: dayShift.pm_end, pm_start: nightShift.am_start, pm_end: nightShift.pm_end, is_single_shift: false, _ramadan: true };
                                }
                            }
                            if (!s) s = dateSpecificShifts.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
                        }
                    } else {
                        for (const scheduleId in ramadanShiftsLookup) {
                            const ramadanData = ramadanShiftsLookup[scheduleId];
                            if (dateObj >= ramadanData.start && dateObj <= ramadanData.end) {
                                const daysSinceStart = Math.floor((dateObj.getTime() - ramadanData.start) / (1000 * 60 * 60 * 24));
                                let saturdays = 0;
                                for (let i = 0; i < daysSinceStart; i++) {
                                    const checkD = new Date(ramadanData.start); checkD.setDate(checkD.getDate() + i);
                                    if (checkD.getUTCDay() === 6) saturdays++;
                                }
                                const weekNum = (saturdays % 2) === 0 ? 1 : 2;
                                const weekData = weekNum === 1 ? ramadanData.week1 : ramadanData.week2;
                                const empData = weekData[attendanceIdStr];
                                if (empData) {
                                    const hasDay = empData.day_start && empData.day_end && empData.day_start !== '—';
                                    const hasNight = empData.night_start && empData.night_end && empData.night_start !== '—';
                                    if (hasDay && hasNight) {
                                        s = { am_start: empData.day_start, am_end: empData.day_end, pm_start: empData.night_start, pm_end: empData.night_end, is_single_shift: false, _ramadan: true };
                                    } else if (hasDay) {
                                        s = { am_start: empData.day_start, am_end: '—', pm_start: '—', pm_end: empData.day_end, is_single_shift: true, _ramadan: true };
                                    } else if (hasNight) {
                                        s = { am_start: empData.night_start, am_end: '—', pm_start: '—', pm_end: empData.night_end, is_single_shift: true, _ramadan: true };
                                    }
                                }
                                break;
                            }
                        }
                        if (!s) {
                            const dNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                            const dName = dNames[dateObj.getUTCDay()];
                            const applicableShifts = employeeShifts.filter((ps: any) => !ps.date && isShiftEffective(ps, dateObj));
                            for (const ps of applicableShifts) {
                                if (ps.applicable_days && ps.applicable_days.toLowerCase().includes(dName.toLowerCase())) { s = ps; break; }
                            }
                            if (!s) {
                                if (dateObj.getUTCDay() === 5) {
                                    s = employeeShifts.find((ps: any) => ps.is_friday_shift && !ps.date && isShiftEffective(ps, dateObj));
                                    if (!s) s = employeeShifts.find((ps: any) => !ps.is_friday_shift && !ps.date && isShiftEffective(ps, dateObj));
                                } else {
                                    s = employeeShifts.find((ps: any) => !ps.is_friday_shift && !ps.date && isShiftEffective(ps, dateObj));
                                }
                            }
                        }
                    }
                    const matchingEx = employeeExceptions.filter((ex: any) => {
                        const exFrom = new Date(ex.date_from);
                        const exTo = new Date(ex.date_to);
                        return dateObj >= exFrom && dateObj <= exTo;
                    });
                    const dateEx = matchingEx.sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())[0];
                    if (dateEx && dateEx.type === 'SHIFT_OVERRIDE') {
                        s = {
                            am_start: dateEx.new_am_start,
                            am_end: dateEx.new_am_end,
                            pm_start: dateEx.new_pm_start,
                            pm_end: dateEx.new_pm_end
                        };
                    }
                    return s;
                };

                /**
                 * @Step3: Helper function to determine if double deduction should be skipped for a specific date.
                 * Returns true if either a per-employee SKIP_DOUBLE_DEDUCTION exception exists or
                 * if project-level double deduction skip is enabled (optionally within a date range).
                 */
                const isDoubleDeductionSkipped = (dayDateStr: string, empEx: any[], proj: any): boolean => {
                    const targetDate = new Date(dayDateStr);
                    targetDate.setHours(0, 0, 0, 0);

                    /**
                     * Condition 1 — Per-employee skip: The employeeExceptions array already loaded 
                     * for this employee must be scanned for any exception of type SKIP_DOUBLE_DEDUCTION 
                     * where use_in_analysis is true and the day being evaluated falls within 
                     * the exception date_from to date_to range.
                     */
                    const hasEmpSkip = empEx.filter(ex => ex.type === 'SKIP_DOUBLE_DEDUCTION' && ex.use_in_analysis !== false).some(ex => {
                        try {
                            const from = new Date(ex.date_from);
                            const to = new Date(ex.date_to);
                            from.setHours(0, 0, 0, 0);
                            to.setHours(0, 0, 0, 0);
                            return targetDate >= from && targetDate <= to;
                        } catch {
                            return false;
                        }
                    });
                    if (hasEmpSkip) return true;

                    /**
                     * Condition 2 — Project-level global skip: The project object must be checked for 
                     * skip_double_deduction boolean. If true, also check if skip_double_deduction_date_from 
                     * and skip_double_deduction_date_to are set. If they are set, only skip days that fall 
                     * within that date range. If they are not set but skip_double_deduction is true, 
                     * skip all double deduction for this employee entirely.
                     */
                    if (proj.skip_double_deduction === true) {
                        if (proj.skip_double_deduction_date_from && proj.skip_double_deduction_date_to) {
                            try {
                                const from = new Date(proj.skip_double_deduction_date_from);
                                const to = new Date(proj.skip_double_deduction_date_to);
                                from.setHours(0, 0, 0, 0);
                                to.setHours(0, 0, 0, 0);
                                return targetDate >= from && targetDate <= to;
                            } catch {
                                return false;
                            }
                        }
                        /** If skip_double_deduction is true but no range is set, skip for all days in this project */
                        return true;
                    }

                    return false;
                };

                const dayAfterEnd = new Date(date_to);
                dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
                const dayAfterEndStr = toDateStr(dayAfterEnd);

                const dayBeforeStart = new Date(date_from);
                dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
                const dayBeforeStartStr = toDateStr(dayBeforeStart);

                const employeePunches = punches.filter(p =>
                    String(p.attendance_id) === attendanceIdStr &&
                    p.punch_date >= dayBeforeStartStr &&
                    p.punch_date <= dayAfterEndStr
                );

                const nextDayPunches = employeePunches.filter(p => p.punch_date === dayAfterEndStr);

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
                const lopDatesSet = new Set<string>();
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
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const currentDayName = dayNames[dayOfWeek];

                    let weeklyOffDay = null;
                    // Determine weekly off day from project override or employee setting
                    if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                        weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                    } else if (employee?.weekly_off) {
                        weeklyOffDay = dayNameToNumber[employee.weekly_off];
                    }

                    // Check if this is employee's weekly off day - BEFORE any other processing
                    if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
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
                                return currentDate >= exFrom && currentDate <= exTo && ex.type !== 'GIFT_MINUTES';
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
                            lopDatesSet.add(dateStr);
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

                    // PRIORITY-BASED EXCEPTION SORTING
                    const EXCEPTION_PRIORITY: Record<string, number> = {
                        'MANUAL_ABSENT': 10,
                        'MANUAL_PRESENT': 10,
                        'SICK_LEAVE': 10,
                        'ANNUAL_LEAVE': 10,
                        'SHIFT_OVERRIDE': 9,
                        'SKIP_PUNCH': 9,
                        'ALLOWED_MINUTES': 8,
                        'MANUAL_LATE': 8,
                        'MANUAL_EARLY_CHECKOUT': 8,
                        'MANUAL_OTHER_MINUTES': 7,
                        'DAY_SWAP': 7,
                        'WEEKLY_OFF_OVERRIDE': 7,
                        'HALF_DAY_HOLIDAY': 6,
                        'CUSTOM': 5,
                        'DISMISSED_MISMATCH': 3,
                        'GIFT_MINUTES': 1,
                    };

                    const dateException = matchingExceptions.length > 0
                        ? matchingExceptions.sort((a: any, b: any) => {
                            const priA = EXCEPTION_PRIORITY[a.type] ?? 5;
                            const priB = EXCEPTION_PRIORITY[b.type] ?? 5;
                            if (priA !== priB) return priB - priA;
                            return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
                        })[0]
                        : null;

                    // Step 1: Check for report-local overrides (manual edits from the report view)
                    const reportLocalOverride = existingReportOverrides[dateStr];

                    if (dateException || reportLocalOverride) {
                        const effectiveStatusType = reportLocalOverride?.type || dateException?.type;

                        if (effectiveStatusType === 'MANUAL_PRESENT') {
                            presentDays++;
                            dateStatusMap[dateStr] = 'PRESENT';
                            continue;
                        } else if (effectiveStatusType === 'WORK_FROM_HOME') {
                            presentDays++;
                            dateStatusMap[dateStr] = 'WORK_FROM_HOME';
                            continue;
                        } else if (effectiveStatusType === 'MANUAL_ABSENT') {
                            fullAbsenceCount++;
                            dateStatusMap[dateStr] = 'LOP';
                            lopDatesSet.add(dateStr);
                            continue;
                        } else if (effectiveStatusType === 'SICK_LEAVE') {
                            sickLeaveCount++;
                            dateStatusMap[dateStr] = 'SICK_LEAVE';
                            continue;
                        }
                    }

                    // Check for ANNUAL_LEAVE
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
                        const dayPunchesForLeave = employeePunches.filter((p: any) => p.punch_date === dateStr);
                        if (dayPunchesForLeave.length === 0) {
                            workingDays--;
                            dateStatusMap[dateStr] = 'ANNUAL_LEAVE';
                            continue;
                        }
                    }

                    let shift = getShiftForDate(dateStr, currentDate);

                    // Apply SHIFT_OVERRIDE from local overrides OR global exceptions
                    if ((dateException && dateException.type === 'SHIFT_OVERRIDE') || (reportLocalOverride && reportLocalOverride.shiftOverride)) {
                        try {
                            const isFriday = dayOfWeek === 5;
                            const shouldApplyOverride = reportLocalOverride?.shiftOverride || (dateException?.include_friday || !isFriday);

                            if (shouldApplyOverride) {
                                shift = {
                                    am_start: reportLocalOverride?.shiftOverride?.am_start || dateException?.new_am_start,
                                    am_end: reportLocalOverride?.shiftOverride?.am_end || dateException?.new_am_end,
                                    pm_start: reportLocalOverride?.shiftOverride?.pm_start || dateException?.new_pm_start,
                                    pm_end: reportLocalOverride?.shiftOverride?.pm_end || dateException?.new_pm_end
                                };
                            }
                        } catch (e: any) {
                            console.warn(`[runAnalysis] Failed to apply SHIFT_OVERRIDE for ${attendanceIdStr} on ${dateStr}:`, e.message);
                        }
                    }

                    const currentShiftStartsEarly = shiftStartsNearMidnight(shift);
                    const nextDateObj = new Date(currentDate);
                    nextDateObj.setDate(nextDateObj.getDate() + 1);
                    const nextDateStr = toDateStr(nextDateObj);

                    let dayPunches = employeePunches.filter(p => {
                        if (p.punch_date === dateStr) {
                            return !isWithinMidnightBuffer(p.timestamp_raw) || currentShiftStartsEarly;
                        }
                        return false;
                    });

                    const nextDayShift = getShiftForDate(nextDateStr, nextDateObj);
                    const nextShiftStartsEarly = shiftStartsNearMidnight(nextDayShift);

                    const nextDayEarlyPunches = employeePunches.filter(p => {
                        if (p.punch_date === nextDateStr) {
                            return isWithinMidnightBuffer(p.timestamp_raw) && !nextShiftStartsEarly;
                        }
                        return false;
                    });

                    dayPunches = [...dayPunches, ...nextDayEarlyPunches].sort((a, b) => {
                        if (a.punch_date !== b.punch_date) return a.punch_date < b.punch_date ? -1 : 1;
                        const tA = parseTime(a.timestamp_raw)?.getTime() || 0;
                        const tB = parseTime(b.timestamp_raw)?.getTime() || 0;
                        return tA - tB;
                    });

                    let filteredPunches: any[] = filterMultiplePunches(dayPunches, shift, includeSeconds);

                    // Log missing shift AFTER filteredPunches is computed
                    if (!shift && filteredPunches.length > 0 && !dateException) {
                        console.warn(`[runAnalysis] ⚠️ MISSING SHIFT - Employee: ${employee?.name || attendanceIdStr} (${attendanceIdStr}), Date: ${dateStr}, Punches: ${filteredPunches.length}, Day: ${currentDayName}`);
                        abnormal_dates_set.add(dateStr);
                        critical_abnormal_dates_set.add(dateStr);
                    }

                    // SKIP_PUNCH logic
                    const skipPunchException = matchingExceptions.find(ex => ex.type === 'SKIP_PUNCH');
                    const isOnLeave = (dateException && (
                        dateException.type === 'SICK_LEAVE' ||
                        dateException.type === 'ANNUAL_LEAVE' ||
                        dateException.type === 'PUBLIC_HOLIDAY'
                    )) || (reportLocalOverride && (
                        reportLocalOverride.type === 'SICK_LEAVE' ||
                        reportLocalOverride.type === 'ANNUAL_LEAVE'
                    ));
                    const isNonWorkingStatus = isOnLeave || (dateException && dateException.type === 'OFF') || (reportLocalOverride && reportLocalOverride.type === 'OFF');

                    let hasSkipPunchApplied = false;
                    let skipType = null;
                    let skipPunchForced0PunchPresent = false;

                    if (skipPunchException && !isNonWorkingStatus && skipPunchException.punch_to_skip) {
                        skipType = skipPunchException.punch_to_skip;
                        hasSkipPunchApplied = true;

                        if (filteredPunches.length === 0 && skipType === 'FULL_SKIP') {
                            filteredPunches = [{ _fake_skip_punch: true }];
                            skipPunchForced0PunchPresent = true;
                        } else if (filteredPunches.length === 0) {
                            filteredPunches = [{ _fake_skip_punch: true }];
                        }
                    }

                    let punchMatches: any[] = [];
                    let hasUnmatchedPunch = false;
                    const hasOnlyFakePunches = filteredPunches.length > 0 && filteredPunches.every((p: any) => p._fake_skip_punch);
                    if (shift && filteredPunches.length > 0 && !hasOnlyFakePunches) {
                        punchMatches = matchPunchesToShiftPoints(filteredPunches, shift, includeSeconds, nextDateStr);
                        hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
                    }

                    const punchCount = filteredPunches.length;
                    const hasMiddleTimes = shift?.am_end && shift?.pm_start &&
                        String(shift.am_end).trim() !== '' && String(shift.pm_start).trim() !== '' &&
                        shift.am_end !== '—' && shift.pm_start !== '—';
                    const isSingleShift = shift?.is_single_shift === true || !hasMiddleTimes;

                    if (punchCount > 0) {
                        if (skipPunchForced0PunchPresent) {
                            presentDays++;
                            dateStatusMap[dateStr] = 'PRESENT_SKIP_PUNCH';
                        } else if (!hasSkipPunchApplied) {
                            if (isSingleShift) {
                                presentDays++;
                                if (punchCount === 1) halfAbsenceCount++;
                                dateStatusMap[dateStr] = 'PRESENT';
                            } else {
                                presentDays++;
                                if (punchCount === 1 || punchCount === 2) halfAbsenceCount++;
                                dateStatusMap[dateStr] = 'PRESENT';
                            }
                        } else {
                            presentDays++;
                            dateStatusMap[dateStr] = 'PRESENT_SKIP_PUNCH';
                        }
                    } else {
                        if (!dateException || (dateException.type !== 'MANUAL_PRESENT')) {
                            fullAbsenceCount++;
                            dateStatusMap[dateStr] = 'LOP';
                            lopDatesSet.add(dateStr);
                        } else {
                            presentDays++;
                            dateStatusMap[dateStr] = 'PRESENT';
                        }
                    }

                    let approvedMinutesForDay = 0;
                    try {
                        if (rules.approved_minutes_enabled && filteredPunches.length > 0) {
                            const amEx = matchingExceptions.find(ex => ex.type === 'ALLOWED_MINUTES' && ex.approval_status === 'approved_dept_head');
                            if (amEx) approvedMinutesForDay = amEx.allowed_minutes || 0;
                        }
                    } catch {
                        approvedMinutesForDay = 0;
                    }

                    let dayLateMinutes = 0;
                    let dayEarlyMinutes = 0;

                    if (reportLocalOverride && (reportLocalOverride.lateMinutes > 0 || reportLocalOverride.earlyCheckoutMinutes > 0 || reportLocalOverride.otherMinutes > 0)) {
                        dayLateMinutes = Math.abs(reportLocalOverride.lateMinutes || 0);
                        dayEarlyMinutes = Math.abs(reportLocalOverride.earlyCheckoutMinutes || 0);
                        if (reportLocalOverride.otherMinutes > 0) {
                            otherMinutes += reportLocalOverride.otherMinutes;
                            otherMinutesFromExceptions[dateStr] = (otherMinutesFromExceptions[dateStr] || 0) + reportLocalOverride.otherMinutes;
                        }
                    } else {
                        const shouldSkipTimeCalculation = (dateException && [
                            'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'OFF', 'PUBLIC_HOLIDAY'
                        ].includes(dateException.type)) || (reportLocalOverride && [
                            'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'OFF', 'PUBLIC_HOLIDAY'
                        ].includes(reportLocalOverride.type));

                        if (!shouldSkipTimeCalculation && shift && punchMatches.length > 0) {
                            const matchedShiftPoints = new Set(punchMatches.filter(m => m.matchedTo).map(m => m.matchedTo));
                            for (const match of punchMatches) {
                                if (!match.matchedTo) continue;
                                const punchTime = match.punch.time;
                                const shiftTime = match.shiftTime;
                                if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                                    if (punchTime > shiftTime) dayLateMinutes += Math.round(Math.abs((punchTime - shiftTime) / (1000 * 60)));
                                }
                                if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                                    if (punchTime < shiftTime) dayEarlyMinutes += Math.round(Math.abs((shiftTime - punchTime) / (1000 * 60)));
                                }
                            }
                            if (hasSkipPunchApplied && skipType) {
                                if ((skipType === 'AM_PUNCH_IN' || skipType === 'FULL_SKIP') && !matchedShiftPoints.has('AM_START')) dayLateMinutes = 0;
                                if ((skipType === 'PM_PUNCH_OUT' || skipType === 'FULL_SKIP') && !matchedShiftPoints.has('PM_END')) dayEarlyMinutes = 0;
                            }
                        }
                    }

                // FIX: Apply approved minutes PER-DAY before accumulating.
                // approvedMinutesForDay runs independently of punch calculation if punches are present.
                if (filteredPunches.length > 0 && approvedMinutesForDay > 0) {
                    const dayTotal = dayLateMinutes + dayEarlyMinutes;
                    if (dayTotal > 0) {
                        const reduction = Math.min(approvedMinutesForDay, dayTotal);
                        const lateRatio = dayLateMinutes / dayTotal;
                        const earlyRatio = dayEarlyMinutes / dayTotal;
                        dayLateMinutes = Math.max(0, dayLateMinutes - Math.round(reduction * lateRatio));
                        dayEarlyMinutes = Math.max(0, dayEarlyMinutes - Math.round(reduction * earlyRatio));
                        totalApprovedMinutes += reduction; // track actual reduction for display
                        console.log(`[runAnalysis] ALLOWED_MINUTES: Employee ${attendanceIdStr}, Date ${dateStr}: approved=${approvedMinutesForDay}, reduced by ${reduction} (late: ${dayLateMinutes}, early: ${dayEarlyMinutes})`);
                    }
                }

                lateMinutes += dayLateMinutes;
                earlyCheckoutMinutes += dayEarlyMinutes;

                // Step 5: Handle MANUAL_OTHER_MINUTES exceptions that are NOT report-generated separately.
                // This handles manually created other minutes exceptions that were not from report edits.
                const manualOtherNonReportEx = matchingExceptions.filter(ex =>
                    ex.type === 'MANUAL_OTHER_MINUTES' && (ex.created_from_report === false || ex.created_from_report === null)
                );
                for (const moEx of manualOtherNonReportEx) {
                    const moMinutes = moEx.allowed_minutes || 0;
                    if (moMinutes > 0) {
                        otherMinutes += moMinutes;
                        otherMinutesFromExceptions[dateStr] = (otherMinutesFromExceptions[dateStr] || 0) + moMinutes;
                        console.log(`[runAnalysis] MANUAL_OTHER_MINUTES (Non-Report): Employee ${attendanceIdStr}, Date ${dateStr}: adding ${moMinutes} to other_minutes`);
                    }
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
            const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';
            if (isAlMaraghiMotors) {
                const allDatesInRange = [];
                for (let dl = new Date(startDate); dl <= endDate; dl = new Date(dl.setDate(dl.getDate() + 1))) {
                    allDatesInRange.push(toDateStr(dl));
                }

                let currentOffBlock = [];
                for (let i = 0; i < allDatesInRange.length; i++) {
                    const dStr = allDatesInRange[i];
                    const status = (dateStatusMap as Record<string, string>)[dStr];

                    if (status === 'WEEKLY_OFF') {
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

                    // CRITICAL FIX: Only convert weekly off to LOP if adjacent day is CONFIRMED LOP.
                    // If adjacent day has no status (undefined/null = outside report range or unprocessed),
                    // do NOT assume it's LOP — that causes false double deductions.
                    const prevIsLOP = prevStatus === 'LOP';
                    const nextIsLOP = nextStatus === 'LOP';

                    if (!prevIsLOP && !nextIsLOP) {
                        return; // No adjacent LOP — skip this block entirely
                    }

                    console.log(`[runAnalysis] LOP-adjacent check: Employee ${attendanceIdStr}, Block ${firstDateStr}-${lastDateStr}, prev=${prevDateStr}(${prevStatus || 'N/A'}), next=${nextDateStr}(${nextStatus || 'N/A'})`);

                    if (prevIsLOP || nextIsLOP) {
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

                            /** 
                             * @Step2: Check if double deduction should be skipped for this specific day.
                             * Logic follows two new conditions:
                             * 1. Per-employee SKIP_DOUBLE_DEDUCTION exception override.
                             * 2. Project-level global skip_double_deduction setting (with optional date range check).
                             */
                            const isDoubleDeductionSkippedForDay = isDoubleDeductionSkipped(dateStr, employeeExceptions, project);

                            if (!isProtectedByLeave && !isDoubleDeductionSkippedForDay) {
                                const originalStatus = (dateStatusMap as Record<string, string>)[dateStr];
                                fullAbsenceCount++;
                                lopAdjacentWeeklyOffCount++;
                                (dateStatusMap as Record<string, string>)[dateStr] = originalStatus === 'WEEKLY_OFF'
                                    ? 'LOP_ADJACENT_WEEKLY_OFF'
                                    : 'LOP_ADJACENT_PUBLIC_HOLIDAY';

                                console.log(`[runAnalysis] LOP-adjacent deduction: Employee ${attendanceIdStr}, Date ${dateStr} (${originalStatus}) → LOP`);
                            } else {
                                const skipReason = isProtectedByLeave
                                    ? `Protected by Leave (${employeeExceptions.find((ex: any) => dateStr >= ex.date_from && dateStr <= ex.date_to && (ex.type === 'ANNUAL_LEAVE' || ex.type === 'SICK_LEAVE'))?.type})`
                                    : 'SKIP_DOUBLE_DEDUCTION (Exception or Project Setting)';
                                console.log(`[runAnalysis] LOP-adjacent bypass (${skipReason}): Employee ${attendanceIdStr}, Date ${dateStr}`);
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

            // Fetch carried_grace_minutes from Employee entity when project enables it (any company)
            let carriedGrace = 0;
            if (project.use_carried_grace_minutes === true) {
                const freshEmployee = employees.find(e => String(e.attendance_id) === attendanceIdStr);
                if (freshEmployee && typeof freshEmployee.carried_grace_minutes === 'number' && freshEmployee.carried_grace_minutes > 0) {
                    carriedGrace = freshEmployee.carried_grace_minutes;
                    console.log(`[runAnalysis] Employee ${attendanceIdStr}: Loaded carried grace = ${carriedGrace} minutes`);
                } else {
                    carriedGrace = 0;
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

            const lopDatesStr = [...lopDatesSet].sort().join(', ');

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
                lop_dates: lopDatesStr,
                day_overrides: JSON.stringify(existingReportOverrides)
            };
        };

        // CHUNK PROCESSING: If chunk params provided, only process that subset
        // We calculate this early to know which employees need gift minutes persistence lookup
        const employeeIdsArray = [...uniqueEmployeeIds];
        const startIdx = _chunk_offset !== undefined ? _chunk_offset : 0;
        const endIdx = _chunk_size !== undefined ? Math.min(startIdx + _chunk_size, employeeIdsArray.length) : employeeIdsArray.length;
        const employeesToProcess = employeeIdsArray.slice(startIdx, endIdx);

        // ============================================================================
        // GIFT MINUTES PERSISTENCE (Step 1 & 2)
        // ============================================================================
        // PRIMARY PERSISTENCE: Look for gift minutes within the current report run
        // (Handles updates to an existing report run)
        const existingResultsForReport = await fetchAllPages(base44.asServiceRole.entities.AnalysisResult, {
            project_id,
            report_run_id: reportRun.id
        });

        const existingRamadanGiftMinutesByAttendanceId = new Map(
            existingResultsForReport
                .filter(r => r.attendance_id !== null && r.attendance_id !== undefined)
                .map(r => [String(r.attendance_id), Math.max(0, Number(r.ramadan_gift_minutes || 0))])
        );

        // SECONDARY PERSISTENCE: If no gift minutes found for an employee in this run,
        // lookup their most recently saved gift minutes from ANY prior run in this project.
        const employeesNeedingLookup = employeesToProcess.filter(attendance_id => {
            const idStr = String(attendance_id);
            return !existingRamadanGiftMinutesByAttendanceId.has(idStr) || existingRamadanGiftMinutesByAttendanceId.get(idStr) === 0;
        });

        if (employeesNeedingLookup.length > 0) {
            console.log(`[runAnalysis] Performing secondary gift minutes lookup for ${employeesNeedingLookup.length} employees (preserving values from prior report runs in project ${project_id})...`);

            // Batch lookups to avoid backend rate limits
            const SECONDARY_LOOKUP_BATCH_SIZE = 8;
            const SECONDARY_LOOKUP_BATCH_DELAY = 1500;

            for (let i = 0; i < employeesNeedingLookup.length; i += SECONDARY_LOOKUP_BATCH_SIZE) {
                const batch = employeesNeedingLookup.slice(i, i + SECONDARY_LOOKUP_BATCH_SIZE);

                await Promise.all(batch.map(async (attendance_id) => {
                    const idStr = String(attendance_id);
                    // Search for ANY previous AnalysisResult for this employee + project that has gift minutes saved.
                    // We sort by -updated_at to ensure we carry forward the most recently finalized entry.
                    const priorResults = await base44.asServiceRole.entities.AnalysisResult.filter({
                        project_id: project_id,
                        attendance_id: attendance_id
                    }, '-updated_at', 50); // Fetch a small history to safely find non-zero values

                    if (priorResults && priorResults.length > 0) {
                        // Find the newest record that actually has gift minutes (not just any record)
                        const newestWithGift = priorResults.find(r => Number(r.ramadan_gift_minutes || 0) > 0);
                        if (newestWithGift) {
                            const giftMinutes = Math.max(0, Number(newestWithGift.ramadan_gift_minutes || 0));
                            existingRamadanGiftMinutesByAttendanceId.set(idStr, giftMinutes);
                            console.log(`[runAnalysis] ✨ Preserved ${giftMinutes} gift minutes for ${idStr} from prior run (Report ID: ${newestWithGift.report_run_id})`);
                        }
                    }
                }));

                // Rate-limiting delay between batches of parallel lookups
                if (i + SECONDARY_LOOKUP_BATCH_SIZE < employeesNeedingLookup.length) {
                    await new Promise(r => setTimeout(r, SECONDARY_LOOKUP_BATCH_DELAY));
                }
            }
        }

        // Process all employees and build results array
        // Using smaller batches with delays to handle database load issues
        const allResults = [];
        const processedAttendanceIds = new Set();

        const reportLocalOverridesByAttendanceId = new Map(
            existingResultsForReport
                .filter(r => r.attendance_id !== null && r.attendance_id !== undefined)
                .map(r => {
                    let overrides = {};
                    if (r.day_overrides) {
                        try {
                            overrides = typeof r.day_overrides === 'string' ? JSON.parse(r.day_overrides) : r.day_overrides;
                        } catch (e) {
                            console.warn(`[runAnalysis] Failed to parse day_overrides for employee ${r.attendance_id}`);
                        }
                    }
                    return [String(r.attendance_id), overrides];
                })
        );
        const ANALYSIS_BATCH_SIZE = 100; // CRITICAL FIX: Process 100 employees at once to avoid timeout
        const ANALYSIS_BATCH_DELAY = 0; // No delays for maximum speed

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
                try {
                    const localOverrides = reportLocalOverridesByAttendanceId.get(idStr) || {};
                    const result = await analyzeEmployee(attendance_id, localOverrides);
                    const preservedRamadanGiftMinutes = existingRamadanGiftMinutesByAttendanceId.get(idStr) || 0;

                    allResults.push({
                        project_id,
                        report_run_id: reportRun.id,
                        // Step 3: Write the preserved Ramadan gift minutes value. 
                        // This value is carried forward from either the primary lookup (same report run update) 
                        // or the secondary lookup (different report run within the same project).
                        ramadan_gift_minutes: preservedRamadanGiftMinutes,
                        ...result
                    } as any);

                } catch (e: any) {
                    console.error(`[runAnalysis] ERROR: Failed to analyze employee ${idStr}:`, e.message);
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
                project_id,
                report_run_id: reportRun.id
            });
        }

        // Save results in batches of 8 with Promise.all and 1500ms delay
        const SAVE_BATCH_SIZE = 8;
        const SAVE_BATCH_DELAY = 1500;

        for (let i = 0; i < allResults.length; i += SAVE_BATCH_SIZE) {
            const batch = allResults.slice(i, i + SAVE_BATCH_SIZE);

            const processResult = async (res: any) => {
                const retryDelays = [1000, 2000, 4000];
                for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
                    try {
                        await base44.asServiceRole.entities.AnalysisResult.create(res);
                        return;
                    } catch (error: any) {
                        const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('rate limit');
                        if (isRateLimit && attempt < retryDelays.length) {
                            const delay = retryDelays[attempt];
                            console.warn(`[runAnalysis] Rate limited saving result for ${res.attendance_id}, retrying in ${delay}ms...`);
                            await new Promise(r => setTimeout(r, delay));
                            continue;
                        }
                        throw error;
                    }
                }
            };

            await Promise.all(batch.map(res => processResult(res)));
            console.log(`[runAnalysis] Saved batch of outcomes: ${Math.min(i + SAVE_BATCH_SIZE, allResults.length)}/${allResults.length}`);

            if (i + SAVE_BATCH_SIZE < allResults.length) {
                await new Promise(resolve => setTimeout(resolve, SAVE_BATCH_DELAY));
            }
        }

        // MANUAL_OTHER_MINUTES generation is now handled within AnalysisResult.day_overrides
        // No global Exception records are created here.

        // Update project status (only if this is NOT a chunk or it's the final chunk)
        const isFinalChunk = _chunk_offset === undefined || (startIdx + allResults.length >= uniqueEmployeeIds.length);
        if (isFinalChunk) {
            await base44.asServiceRole.entities.Project.update(project_id, {
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
            message: `Analysis complete for ${allResults.length} employees (${startIdx}-${endIdx} of ${uniqueEmployeeIds.length})`
        });

    } catch (error) {
        console.error('Run analysis error:', error);
        return Response.json({
            error: (error as any).message
        }, { status: 500 });
    }
});