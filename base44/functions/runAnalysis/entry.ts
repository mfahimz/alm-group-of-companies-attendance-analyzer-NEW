import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

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
            _chunk_size,
            _day_overrides,
            _scope_report_run_id: _scope_report_run_id_raw   // TASK 1: If provided, only fetch exceptions for this specific report run
        } = await req.json();

        // CRITICAL FIX: _scope_report_run_id must ONLY be applied when reanalyzing an EXISTING report.
        // For new reports, _existing_report_run_id is undefined, so _scope_report_run_id must also be
        // undefined — otherwise chunk 2+ would filter out all report-generated exceptions because the
        // new report run ID won't match any saved exceptions yet.
        // Rule: scope filtering is active only when both args point to the same existing run.
        const _scope_report_run_id = (_scope_report_run_id_raw && _existing_report_run_id && _scope_report_run_id_raw === _existing_report_run_id)
            ? _scope_report_run_id_raw
            : undefined;

        if (!project_id || !date_from || !date_to) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        console.log(`[runAnalysis] Args: existing_run=${_existing_report_run_id || 'none'}, scope_raw=${_scope_report_run_id_raw || 'none'}, scope_effective=${_scope_report_run_id || 'DISABLED (new report or mismatch)'}`);

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
            console.log('[runAnalysis] Updating existing report run with', uniqueEmployeeIds.length, 'employees');
        }

        /**
         * CALCULATE DAILY PENALTIES
         * Synchronized math for late and early checkout minutes.
         */
        const calculateDailyPenalties = (punchMatches: any[]) => {
            let late = 0;
            let early = 0;

            for (const match of punchMatches) {
                if (!match.matchedTo) continue;

                const punchTime = match.punch.time;
                const shiftTime = match.shiftTime;

                if (!punchTime || !shiftTime) continue;

                const minutesDifference = Math.round(Math.abs((punchTime.getTime() - shiftTime.getTime()) / (1000 * 60)));

                if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                    if (punchTime.getTime() > shiftTime.getTime()) {
                        late += minutesDifference;
                    }
                } else if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                    if (punchTime.getTime() < shiftTime.getTime()) {
                        early += minutesDifference;
                    }
                }
            }
            return { late, early };
        };

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
        const analyzeEmployee = async (attendance_id: any) => {
            const attendanceIdStr = String(attendance_id);
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

                // ================================================================
                // DIMENSIONAL PIPELINE (Reducer Pattern) — Phase 1
                // Each layer operates on dayState independently.
                // No layer can gate a later layer from running.
                // ================================================================

                // --- Exception resolution (shared inputs for all layers) ---
                const EXCEPTION_PRIORITY: Record<string, number> = {
                    'MANUAL_ABSENT': 10, 'MANUAL_PRESENT': 10, 'SICK_LEAVE': 10, 'ANNUAL_LEAVE': 10,
                    'SHIFT_OVERRIDE': 9, 'SKIP_PUNCH': 9,
                    'ALLOWED_MINUTES': 8, 'MANUAL_LATE': 8, 'MANUAL_EARLY_CHECKOUT': 8,
                    'MANUAL_OTHER_MINUTES': 7, 'DAY_SWAP': 7, 'WEEKLY_OFF_OVERRIDE': 7,
                    'HALF_DAY_HOLIDAY': 6, 'CUSTOM': 5, 'DISMISSED_MISMATCH': 3, 'GIFT_MINUTES': 1,
                };

                const dateException = matchingExceptions.length > 0
                    ? matchingExceptions.sort((a: any, b: any) => {
                        const priA = EXCEPTION_PRIORITY[a.type] ?? 5;
                        const priB = EXCEPTION_PRIORITY[b.type] ?? 5;
                        if (priA !== priB) return priB - priA;
                        return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
                    })[0]
                    : null;

                // ALL created_from_report exceptions for this project+employee are considered,
                // regardless of which report_run_id generated them. The newest one wins per type.
                const scopedReportExceptions = matchingExceptions.filter(ex => ex.created_from_report === true);
                const STATUS_TYPES_FOR_REPORT = ['MANUAL_PRESENT', 'MANUAL_ABSENT', 'SICK_LEAVE', 'WORK_FROM_HOME', 'ANNUAL_LEAVE'];
                const reportGeneratedException = scopedReportExceptions
                    .filter(ex => STATUS_TYPES_FOR_REPORT.includes(ex.type))
                    .sort((a: any, b: any) => {
                        const priA = EXCEPTION_PRIORITY[a.type] ?? 5;
                        const priB = EXCEPTION_PRIORITY[b.type] ?? 5;
                        if (priA !== priB) return priB - priA;
                        return new Date(b.created_date).getTime() - new Date(a.created_date).getTime();
                    })[0];
                const reportShiftOverrideException = scopedReportExceptions
                    .filter(ex => ex.type === 'SHIFT_OVERRIDE')
                    .sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())[0] || null;

                // _DAY_OVERRIDES: in-memory override from Reanalyze (not saved to DB)
                const dayOverrideEntry = (_day_overrides as any)?.[attendanceIdStr]?.[dateStr];
                let effectiveReportException: any = reportGeneratedException;
                if (dayOverrideEntry && dayOverrideEntry.type !== 'SHIFT_OVERRIDE') {
                    effectiveReportException = {
                        type: dayOverrideEntry.type,
                        late_minutes: dayOverrideEntry.lateMinutes || 0,
                        early_checkout_minutes: dayOverrideEntry.earlyCheckoutMinutes || 0,
                        other_minutes: dayOverrideEntry.otherMinutes || 0,
                        created_from_report: true,
                        created_date: new Date().toISOString()
                    };
                }

                // The active status exception: report-generated takes precedence over DB exception
                // for status types; both sources are checked.
                const activeStatusException = (() => {
                    const STATUS_TYPES = ['MANUAL_PRESENT', 'MANUAL_ABSENT', 'SICK_LEAVE', 'WORK_FROM_HOME'];
                    if (effectiveReportException && STATUS_TYPES.includes(effectiveReportException.type)) return effectiveReportException;
                    if (dateException && STATUS_TYPES.includes(dateException.type)) return dateException;
                    return null;
                })();

                // ================================================================
                // ANNUAL_LEAVE: handled before dayState (causes a `continue`)
                // ================================================================
                if (!activeStatusException) {
                    const annualLeaveException = employeeExceptions.find(ex => {
                        try {
                            const exFrom = new Date(ex.date_from);
                            const exTo = new Date(ex.date_to);
                            return ex.type === 'ANNUAL_LEAVE' && currentDate >= exFrom && currentDate <= exTo;
                        } catch (dateError) {
                            console.warn(`[runAnalysis] ⚠️ INVALID ANNUAL_LEAVE DATE - Employee: ${employee?.name || attendanceIdStr}, Exception ID: ${ex.id}, date_from: ${ex.date_from}, date_to: ${ex.date_to}, Error: ${dateError.message}`);
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
                }

                // ================================================================
                // DAILY STATE OBJECT — flows through each layer below
                // ================================================================
                const dayState = {
                    status: 'PENDING' as string,   // set by Status Layer
                    late: 0,                        // set by Base Layer, may be zeroed by Status/Forgiveness
                    early: 0,                       // same
                    isHalfDay: false,               // set by Base Layer punch-completeness
                    approvedReduction: 0,           // set by Forgiveness Layer (ALLOWED_MINUTES)
                };

                // ================================================================
                // LAYER 1 — BASE LAYER
                // Resolves shift, collects punches, runs punch matching, calculates
                // raw late/early minutes and punch-completeness status.
                // Runs unconditionally — Status Layer may zero the minutes afterward.
                // ================================================================

                let shift = getShiftForDate(dateStr, currentDate);

                // Apply in-memory SHIFT_OVERRIDE (from Reanalyze, not saved to DB)
                if (dayOverrideEntry?.type === 'SHIFT_OVERRIDE' && dayOverrideEntry?.shiftOverride) {
                    try {
                        const ov = dayOverrideEntry.shiftOverride;
                        if (ov.am_start && ov.pm_end) {
                            shift = { am_start: ov.am_start, am_end: ov.am_end || '', pm_start: ov.pm_start || '', pm_end: ov.pm_end };
                        }
                    } catch (ovErr: any) {
                        console.warn(`[runAnalysis] Failed to apply day_overrides SHIFT_OVERRIDE for ${attendanceIdStr} on ${dateStr}:`, ovErr.message);
                    }
                }

                // Apply DB or report-generated SHIFT_OVERRIDE (independent of status exception)
                const activeShiftOverride = (dateException && dateException.type === 'SHIFT_OVERRIDE')
                    ? dateException : reportShiftOverrideException;
                if (activeShiftOverride) {
                    try {
                        const isFriday = dayOfWeek === 5;
                        if (activeShiftOverride.include_friday || !isFriday) {
                            shift = { am_start: activeShiftOverride.new_am_start, am_end: activeShiftOverride.new_am_end, pm_start: activeShiftOverride.new_pm_start, pm_end: activeShiftOverride.new_pm_end };
                        }
                    } catch (e: any) {
                        console.warn(`[runAnalysis] Failed to apply SHIFT_OVERRIDE for ${attendanceIdStr} on ${dateStr}:`, e.message);
                    }
                }

                // Midnight rollback: collect punches for this calendar day
                const currentShiftStartsEarly = shiftStartsNearMidnight(shift);
                const nextDateObj = new Date(currentDate);
                nextDateObj.setDate(nextDateObj.getDate() + 1);
                const nextDateStr = toDateStr(nextDateObj);

                let dayPunches = employeePunches.filter(p => {
                    if (p.punch_date === dateStr) return !isWithinMidnightBuffer(p.timestamp_raw) || currentShiftStartsEarly;
                    return false;
                });
                const nextDayShift = getShiftForDate(nextDateStr, nextDateObj);
                const nextShiftStartsEarly = shiftStartsNearMidnight(nextDayShift);
                const nextDayEarlyPunches = employeePunches.filter(p => {
                    if (p.punch_date === nextDateStr) return isWithinMidnightBuffer(p.timestamp_raw) && !nextShiftStartsEarly;
                    return false;
                });
                dayPunches = [...dayPunches, ...nextDayEarlyPunches].sort((a, b) => {
                    if (a.punch_date !== b.punch_date) return a.punch_date < b.punch_date ? -1 : 1;
                    return (parseTime(a.timestamp_raw)?.getTime() || 0) - (parseTime(b.timestamp_raw)?.getTime() || 0);
                });

                let filteredPunches: any[] = filterMultiplePunches(dayPunches, shift, includeSeconds);

                if (!shift && filteredPunches.length > 0 && !dateException) {
                    console.warn(`[runAnalysis] ⚠️ MISSING SHIFT - Employee: ${employee?.name || attendanceIdStr} (${attendanceIdStr}), Date: ${dateStr}, Punches: ${filteredPunches.length}, Day: ${currentDayName}`);
                    abnormal_dates_set.add(dateStr);
                    critical_abnormal_dates_set.add(dateStr);
                }

                // SKIP_PUNCH exception handling (presence enforcement + forgiveness setup)
                const skipPunchException = matchingExceptions.find(ex => ex.type === 'SKIP_PUNCH');
                const isNonWorkingStatus = dateException && (
                    dateException.type === 'SICK_LEAVE' || dateException.type === 'ANNUAL_LEAVE' ||
                    dateException.type === 'PUBLIC_HOLIDAY' || dateException.type === 'OFF' || dateException.type === 'MANUAL_ABSENT'
                );
                let hasSkipPunchApplied = false;
                let skipType: string | null = null;
                let skipPunchForced0PunchPresent = false;

                if (skipPunchException && !isNonWorkingStatus && skipPunchException.punch_to_skip) {
                    skipType = skipPunchException.punch_to_skip;
                    hasSkipPunchApplied = true;
                    if (filteredPunches.length === 0 && skipType === 'FULL_SKIP') {
                        filteredPunches = [{ _fake_skip_punch: true }];
                        skipPunchForced0PunchPresent = true;
                        console.log(`[runAnalysis] SKIP_PUNCH LOP SAVER: Employee ${attendanceIdStr}, Date ${dateStr}: 0 punches + FULL_SKIP → Present`);
                    } else if (filteredPunches.length === 0) {
                        filteredPunches = [{ _fake_skip_punch: true }];
                        console.log(`[runAnalysis] SKIP_PUNCH: Employee ${attendanceIdStr}, Date ${dateStr}: 0 punches + ${skipType} → adding fake punch`);
                    }
                }

                // Punch matching
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
                    shift.am_end !== '—' && shift.pm_start !== '—' && shift.am_end !== '-' && shift.pm_start !== '-' &&
                    shift.am_end !== 'null' && shift.pm_start !== 'null';
                const isSingleShift = shift?.is_single_shift === true || !hasMiddleTimes;

                // Punch-completeness: derive status and half-day flag from raw punches
                if (punchCount > 0) {
                    if (skipPunchForced0PunchPresent || hasSkipPunchApplied) {
                        dayState.status = 'PRESENT_SKIP_PUNCH';
                    } else if (isSingleShift) {
                        dayState.status = 'PRESENT';
                        if (punchCount === 1) {
                            dayState.isHalfDay = true;
                            console.log(`[runAnalysis] PUNCH COMPLETENESS: Employee ${attendanceIdStr}, Date ${dateStr}: Single shift, 1 punch → Half Day`);
                        }
                    } else {
                        dayState.status = 'PRESENT';
                        if (punchCount === 1 || punchCount === 2) {
                            dayState.isHalfDay = true;
                            console.log(`[runAnalysis] PUNCH COMPLETENESS: Employee ${attendanceIdStr}, Date ${dateStr}: Split shift, ${punchCount} punch(es) → Half Day`);
                        }
                    }
                } else {
                    // Zero punches — default LOP unless overridden by Status Layer
                    dayState.status = 'LOP';
                }

                // Calculate raw late/early from punch matches (always runs — Status Layer may zero them)
                if (shift && punchMatches.length > 0) {
                    const penalties = calculateDailyPenalties(punchMatches);
                    dayState.late = penalties.late;
                    dayState.early = penalties.early;
                }

                // ================================================================
                // LAYER 2 — STATUS LAYER
                // Sets the authoritative attendance status for the day.
                // ABSENCE-CLASS (SICK/ABSENT/ANNUAL): zero late+early (employee wasn't there).
                // PRESENCE-CLASS (MANUAL_PRESENT/WFH): set status only — DO NOT zero minutes
                // (an admin marking someone present doesn't erase their actual lateness).
                // ================================================================
                if (activeStatusException) {
                    const st = activeStatusException.type;
                    if (st === 'MANUAL_ABSENT') {
                        dayState.status = 'LOP';
                        dayState.late = 0;
                        dayState.early = 0;
                    } else if (st === 'SICK_LEAVE') {
                        dayState.status = 'SICK_LEAVE';
                        dayState.late = 0;
                        dayState.early = 0;
                    } else if (st === 'MANUAL_PRESENT') {
                        // Presence-class: override status, preserve calculated late/early
                        dayState.status = 'PRESENT';
                        // late/early intentionally NOT zeroed here (pipeline fix vs. old MANUAL_PRESENT bug)
                    } else if (st === 'WORK_FROM_HOME') {
                        dayState.status = 'WORK_FROM_HOME';
                        // late/early intentionally NOT zeroed here
                    }
                }

                // If a non-status reportGeneratedException provides explicit minute values
                // (e.g., MANUAL_LATE from a saved report edit), use those directly instead of
                // punch-calculated values. Only applies when no status exception is in play.
                if (!activeStatusException && effectiveReportException && effectiveReportException.type !== 'SHIFT_OVERRIDE') {
                    const rtype = effectiveReportException.type;
                    if (!['MANUAL_PRESENT', 'MANUAL_ABSENT', 'SICK_LEAVE', 'ANNUAL_LEAVE', 'WORK_FROM_HOME', 'WAIVE'].includes(rtype)) {
                        // e.g., MANUAL_LATE — use stored values from the report edit
                        dayState.late = Math.abs(effectiveReportException.late_minutes || 0);
                        dayState.early = Math.abs(effectiveReportException.early_checkout_minutes || 0);
                        if (rtype !== 'MANUAL_OTHER_MINUTES' && (effectiveReportException.other_minutes || 0) > 0) {
                            otherMinutes += effectiveReportException.other_minutes;
                            otherMinutesFromExceptions[dateStr] = (otherMinutesFromExceptions[dateStr] || 0) + effectiveReportException.other_minutes;
                        }
                    }
                }

                // Also zero late/early for DB-level absence exceptions (no report exception present)
                if (!activeStatusException && !effectiveReportException) {
                    const shouldZeroMinutes = dateException && [
                        'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_ABSENT', 'OFF', 'PUBLIC_HOLIDAY', 'WAIVE'
                    ].includes(dateException.type);
                    if (shouldZeroMinutes) {
                        dayState.late = 0;
                        dayState.early = 0;
                    }
                }

                // ================================================================
                // LAYER 2.5 — PENALTY OVERRIDE LAYER
                // Forcefully applies MANUAL_LATE / MANUAL_EARLY_CHECKOUT exceptions
                // from any source (DB or report-generated) on top of dayState.
                // Skipped only when the day is in an absence-class status (LOP/SICK)
                // that already zeroed minutes. PRESENT / WORK_FROM_HOME do not block.
                // Runs BEFORE the Forgiveness Layer so waivers still apply on top.
                // ================================================================
                const isAbsenceClassStatus = activeStatusException && (
                    activeStatusException.type === 'MANUAL_ABSENT' ||
                    activeStatusException.type === 'SICK_LEAVE'
                );
                if (!isAbsenceClassStatus) {
                    const manualLateExceptions = matchingExceptions.filter(ex => ex.type === 'MANUAL_LATE');
                    const manualEarlyExceptions = matchingExceptions.filter(ex => ex.type === 'MANUAL_EARLY_CHECKOUT');

                    if (manualLateExceptions.length > 0) {
                        // Pick the newest one (created_date desc) when multiple exist
                        const newestLate = manualLateExceptions.sort((a: any, b: any) =>
                            new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
                        )[0];
                        const overrideLate = Math.abs(Number(newestLate.late_minutes) || 0);
                        console.log(`[runAnalysis] PENALTY_OVERRIDE: Employee ${attendanceIdStr}, Date ${dateStr}: MANUAL_LATE override (was=${dayState.late}, now=${overrideLate})`);
                        dayState.late = overrideLate;
                    }

                    if (manualEarlyExceptions.length > 0) {
                        const newestEarly = manualEarlyExceptions.sort((a: any, b: any) =>
                            new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
                        )[0];
                        const overrideEarly = Math.abs(Number(newestEarly.early_checkout_minutes) || 0);
                        console.log(`[runAnalysis] PENALTY_OVERRIDE: Employee ${attendanceIdStr}, Date ${dateStr}: MANUAL_EARLY_CHECKOUT override (was=${dayState.early}, now=${overrideEarly})`);
                        dayState.early = overrideEarly;
                    }
                }

                // ================================================================
                // LAYER 2.7 — EARLY VS OTHER MINUTES SUPPRESSION LAYER
                // If other minutes exist for this day (via manual or report overrides),
                // raw/calculated early checkout minutes must be suppressed to 0,
                // unless an explicit manual/report early override exists.
                // ================================================================
                const hasExplicitEarlyOverride = (() => {
                    if (dayOverrideEntry) {
                        return dayOverrideEntry.earlyCheckoutMinutes !== undefined && dayOverrideEntry.earlyCheckoutMinutes !== null;
                    }
                    if (matchingExceptions.some(ex => ex.type === 'MANUAL_EARLY_CHECKOUT')) {
                        return true;
                    }
                    if (effectiveReportException && (
                        effectiveReportException.type === 'MANUAL_EARLY_CHECKOUT' ||
                        (effectiveReportException.early_checkout_minutes !== undefined && effectiveReportException.early_checkout_minutes !== null && effectiveReportException.created_from_report)
                    )) {
                        return true;
                    }
                    return false;
                })();

                const hasOtherMinutesOverride = (() => {
                    if (dayOverrideEntry) {
                        return dayOverrideEntry.otherMinutes !== undefined && dayOverrideEntry.otherMinutes !== null && dayOverrideEntry.otherMinutes > 0;
                    }
                    if (matchingExceptions.some(ex => ex.type === 'MANUAL_OTHER_MINUTES')) {
                        return true;
                    }
                    if (effectiveReportException && (
                        effectiveReportException.type === 'MANUAL_OTHER_MINUTES' ||
                        (effectiveReportException.other_minutes !== undefined && effectiveReportException.other_minutes !== null && effectiveReportException.other_minutes > 0)
                    )) {
                        return true;
                    }
                    return false;
                })();

                if (!hasExplicitEarlyOverride && hasOtherMinutesOverride) {
                    console.log(`[runAnalysis] SUPPRESSION: Employee ${attendanceIdStr}, Date ${dateStr}: Suppressing raw early checkout (was=${dayState.early}) to 0 due to other minutes exception.`);
                    dayState.early = 0;
                }

                // ================================================================
                // LAYER 3 — FORGIVENESS LAYER
                // Zeros specific penalties without touching status.
                // SKIP_PUNCH: forgives the specific shift point.
                // ALLOWED_MINUTES: reduces late+early proportionally.
                // ================================================================

                // SKIP_PUNCH forgiveness
                if (hasSkipPunchApplied && skipType) {
                    const skipTypeToShiftPoint: Record<string, string> = {
                        'AM_PUNCH_IN': 'AM_START', 'AM_PUNCH_OUT': 'AM_END',
                        'PM_PUNCH_IN': 'PM_START', 'PM_PUNCH_OUT': 'PM_END',
                    };
                    if (skipType === 'FULL_SKIP') {
                        dayState.late = 0;
                        dayState.early = 0;
                    } else {
                        const forgiven = skipTypeToShiftPoint[skipType];
                        if (forgiven === 'AM_START' || forgiven === 'PM_START') dayState.late = 0;
                        if (forgiven === 'AM_END' || forgiven === 'PM_END') dayState.early = 0;
                    }
                }

                // ALLOWED_MINUTES (dept-head approved forgiveness)
                let approvedMinutesForDay = 0;
                try {
                    if (rules.approved_minutes_enabled && filteredPunches.length > 0) {
                        const amEx = matchingExceptions.find(ex => ex.type === 'ALLOWED_MINUTES' && ex.approval_status === 'approved_dept_head');
                        if (amEx) approvedMinutesForDay = amEx.allowed_minutes || 0;
                    }
                } catch { approvedMinutesForDay = 0; }

                if (filteredPunches.length > 0 && approvedMinutesForDay > 0) {
                    const dayTotal = dayState.late + dayState.early;
                    if (dayTotal > 0) {
                        const reduction = Math.min(approvedMinutesForDay, dayTotal);
                        const lateRatio = dayState.late / dayTotal;
                        const earlyRatio = dayState.early / dayTotal;
                        dayState.late = Math.max(0, dayState.late - Math.round(reduction * lateRatio));
                        dayState.early = Math.max(0, dayState.early - Math.round(reduction * earlyRatio));
                        dayState.approvedReduction = reduction;
                        console.log(`[runAnalysis] ALLOWED_MINUTES: Employee ${attendanceIdStr}, Date ${dateStr}: approved=${approvedMinutesForDay}, reduced by ${reduction} (late: ${dayState.late}, early: ${dayState.early})`);
                    }
                }

                // ================================================================
                // LAYER 4 — ADDITIVE LAYER
                // Runs unconditionally. Aggregates MANUAL_OTHER_MINUTES from ALL
                // matching exceptions. Preserves the Highlander Fix — this block
                // never gates on status and handles MANUAL_PRESENT + OTHER_MINUTES
                // on the same day correctly.
                // ================================================================
                const allOtherMinExForDay = matchingExceptions.filter(ex => ex.type === 'MANUAL_OTHER_MINUTES');
                for (const omEx of allOtherMinExForDay) {
                    const omId = omEx.id || `${omEx.attendance_id}_${omEx.date_from}_${omEx.type}`;
                    const alreadyCounted = otherMinutesFromExceptions[`${dateStr}_${omId}`];
                    if (!alreadyCounted) {
                        const omValue = omEx.other_minutes || omEx.allowed_minutes || 0;
                        if (omValue > 0) {
                            otherMinutes += omValue;
                            otherMinutesFromExceptions[`${dateStr}_${omId}`] = omValue;
                        }
                    }
                }

                // ================================================================
                // MAP dayState → aggregation variables
                // Everything below this point (LOP-adjacent, deductible, DB save)
                // is untouched and reads from these existing accumulators.
                // ================================================================

                // Commit status
                const finalStatus = dayState.status;
                if (finalStatus === 'LOP') {
                    if (punchCount === 0 && !activeStatusException) {
                        // Punch-derived LOP (0 punches, no override)
                        fullAbsenceCount++;
                        dateStatusMap[dateStr] = 'LOP';
                        lopDatesSet.add(dateStr);
                    } else if (activeStatusException?.type === 'MANUAL_ABSENT') {
                        fullAbsenceCount++;
                        dateStatusMap[dateStr] = 'LOP';
                        lopDatesSet.add(dateStr);
                    }
                } else if (finalStatus === 'SICK_LEAVE') {
                    sickLeaveCount++;
                    dateStatusMap[dateStr] = 'SICK_LEAVE';
                } else if (finalStatus === 'PRESENT' || finalStatus === 'PRESENT_SKIP_PUNCH' || finalStatus === 'WORK_FROM_HOME') {
                    presentDays++;
                    if (dayState.isHalfDay) halfAbsenceCount++;
                    dateStatusMap[dateStr] = finalStatus === 'WORK_FROM_HOME' ? 'WORK_FROM_HOME' : 'PRESENT';
                }

                // Commit minutes
                lateMinutes += dayState.late;
                earlyCheckoutMinutes += dayState.early;
                totalApprovedMinutes += dayState.approvedReduction;

                // Abnormality flags (unchanged logic, now outside the old if-gate)
                const expectedPunches = isSingleShift ? 2 : 4;
                const hasExtendedMatch = punchMatches.some(m => m.isExtendedMatch);
                const hasFarExtendedMatch = punchMatches.some(m => m.isFarExtendedMatch);
                if (hasUnmatchedPunch) { abnormal_dates_set.add(dateStr); critical_abnormal_dates_set.add(dateStr); }
                if (hasFarExtendedMatch) { abnormal_dates_set.add(dateStr); critical_abnormal_dates_set.add(dateStr); }
                if (hasExtendedMatch) { abnormal_dates_set.add(dateStr); }
                if (rules.abnormality_rules?.detect_missing_punches && filteredPunches.length > 0 && filteredPunches.length < expectedPunches) {
                    abnormal_dates_set.add(dateStr); critical_abnormal_dates_set.add(dateStr);
                }
                if (rules.abnormality_rules?.detect_extra_punches && filteredPunches.length > expectedPunches) { abnormal_dates_set.add(dateStr); }

                if (shift && punchMatches.length > 0) {
                    for (const match of punchMatches) {
                        if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                            const latenessMinutes = match.distance;
                            if (latenessMinutes > 120 && latenessMinutes < 480) {
                                critical_abnormal_dates_set.add(dateStr);
                                const shiftType = match.matchedTo === 'AM_START' ? 'AM' : 'PM';
                                auto_resolutions.push({ date: dateStr, type: 'EXTREME_LATENESS', details: `${shiftType} start: ${Math.round(latenessMinutes)} minutes late` });
                            }
                        }
                    }
                }

                const dateFormatted = `${String(currentDate.getDate()).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
                if (rules.date_rules?.special_abnormal_dates?.includes(dateFormatted)) { abnormal_dates_set.add(dateStr); }
                if (rules.date_rules?.always_mark_first_date_abnormal && currentDate.getTime() === startDate.getTime()) { abnormal_dates_set.add(dateStr); }
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
                    let nextIsLOP = nextStatus === 'LOP';

                    // END-OF-PROJECT BOUNDARY RESOLUTION
                    // If project ends on Sunday (WO), and next Monday (outside) is LOP, 
                    // we must resolve Monday status using available punches/exceptions.
                    if (!nextIsLOP && nextStatus === undefined && nextDateStr === dayAfterEndStr) {
                        const nextDateObj = new Date(nextDateStr);
                        const dayOfWeek = nextDateObj.getUTCDay();

                        let weeklyOffDay = null;
                        if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                            weeklyOffDay = (dayNameToNumber as Record<string, number>)[project.weekly_off_override];
                        } else if (employee?.weekly_off) {
                            weeklyOffDay = (dayNameToNumber as Record<string, number>)[employee.weekly_off];
                        }

                        if (dayOfWeek !== weeklyOffDay) {
                            const matchingEx = employeeExceptions.filter((ex: any) => {
                                try {
                                    const exFrom = new Date(ex.date_from);
                                    const exTo = new Date(ex.date_to);
                                    return nextDateObj >= exFrom && nextDateObj <= exTo;
                                } catch { return false; }
                            });

                            const hasPH = matchingEx.some(ex => ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF');
                            const hasLeave = matchingEx.some(ex => ex.type === 'SICK_LEAVE' || ex.type === 'ANNUAL_LEAVE' || ex.type === 'MANUAL_PRESENT');
                            const hasManualAbsent = matchingEx.some(ex => ex.type === 'MANUAL_ABSENT');

                            if (!hasPH) {
                                if (hasManualAbsent) {
                                    nextIsLOP = true;
                                } else if (!hasLeave && nextDayPunches.length === 0) {
                                    nextIsLOP = true;
                                }
                            }
                        }
                    }

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

            // DEDUCTIBLE: base = late+early (approved already applied per-day). Other minutes excluded.
            // Grace = baseGrace + carriedGrace. deductible = max(0, base - grace).
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

        const employeeIdsArray = [...uniqueEmployeeIds];
        const startIdx = _chunk_offset !== undefined ? _chunk_offset : 0;
        const endIdx = _chunk_size !== undefined ? Math.min(startIdx + _chunk_size, employeeIdsArray.length) : employeeIdsArray.length;
        const employeesToProcess = employeeIdsArray.slice(startIdx, endIdx);

        // Fetch existing results for this report run (gift minutes persistence + eco note preservation)
        const existingResultsForReport = await fetchAllPages(base44.asServiceRole.entities.AnalysisResult, {
            project_id,
            report_run_id: reportRun.id
        });

        const existingRamadanGiftMinutesByAttendanceId = new Map(
            existingResultsForReport
                .filter(r => r.attendance_id !== null && r.attendance_id !== undefined)
                .map(r => [String(r.attendance_id), Math.max(0, Number(r.ramadan_gift_minutes || 0))])
        );

        // TASK 2: Preserve [eco:X] skip-early-checkout notes before old records are deleted.
        const existingEcoNotesByAttendanceId = new Map<string, string>(
            existingResultsForReport
                .filter(r => r.attendance_id != null && /\[eco:\d+\]/.test(r.notes || ''))
                .map(r => [String(r.attendance_id), String(r.notes)])
        );
        if (existingEcoNotesByAttendanceId.size > 0) {
            console.log(`[runAnalysis] TASK2: [eco:] notes preserved for ${existingEcoNotesByAttendanceId.size} employees`);
        }

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
        const otherMinutesExceptionsToCreate = []; // Track other minutes exceptions to create
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
                    const result = await analyzeEmployee(attendance_id);
                    const preservedRamadanGiftMinutes = existingRamadanGiftMinutesByAttendanceId.get(String(attendance_id)) || 0;

                    // TASK 2: If a previous [eco:X] note exists, carry it forward and zero early checkout.
                    const idStr2 = String(attendance_id);
                    const ecoNote = existingEcoNotesByAttendanceId.get(idStr2);
                    if (ecoNote) {
                        result.notes = ecoNote;
                        result.early_checkout_minutes = 0;
                        console.log(`[runAnalysis] TASK2: Restored [eco:] for ${idStr2}, early_checkout zeroed`);
                    }

                    allResults.push({
                        project_id,
                        report_run_id: reportRun.id,
                        ramadan_gift_minutes: preservedRamadanGiftMinutes,
                        ...result
                    });

                    // Track other minutes for exception creation
                    if (result._otherMinutesDetails) {
                        otherMinutesExceptionsToCreate.push(result._otherMinutesDetails);
                    }
                } catch (e: any) {
                    console.error(`[runAnalysis] ERROR: Failed to analyze employee ${idStr}:`, e.message);
                    // Re-throw rate limit errors — these must not be silently swallowed
                    // A silent skip causes partial saves that look successful but are missing data
                    const isRateLimit = (e as any)?.status === 429 || (e as any)?.message?.includes('429') || (e as any)?.message?.includes('rate limit') || (e as any)?.message?.includes('Permanently rate limited');
                    if (isRateLimit) throw e;
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

        // BUG FIX: Universal retry helper for any SDK call that can hit 429.
        const withRateLimitRetry = async (fn: () => Promise<any>, label: string) => {
            const delays = [1500, 3000, 6000, 12000, 20000];
            for (let attempt = 0; attempt <= delays.length; attempt++) {
                try {
                    return await fn();
                } catch (e: any) {
                    const isRateLimit = e?.status === 429 || e?.message?.includes('429') || e?.message?.includes('rate limit');
                    if (isRateLimit && attempt < delays.length) {
                        console.warn(`[runAnalysis] Rate limited at ${label}, retrying in ${delays[attempt]}ms (attempt ${attempt + 1}/${delays.length})...`);
                        await new Promise(r => setTimeout(r, delays[attempt]));
                        continue;
                    }
                    throw e;
                }
            }
        };

        // CHUNK MODE: Only delete results for employees in THIS chunk
        if (_chunk_offset !== undefined && allResults.length > 0) {
            // Use already-fetched existingResultsForReport to avoid per-employee API calls (rate limit fix)
            const attendanceIdsToDelete = new Set(allResults.map(r => String(r.attendance_id)));
            const toDelete = existingResultsForReport.filter(r => attendanceIdsToDelete.has(String(r.attendance_id)));
            if (toDelete.length > 0) {
                // Delete sequentially in batches of 5 with retry to survive sustained rate limits
                for (let i = 0; i < toDelete.length; i += 5) {
                    const batch = toDelete.slice(i, i + 5);
                    for (const r of batch) {
                        await withRateLimitRetry(
                            () => base44.asServiceRole.entities.AnalysisResult.delete(r.id),
                            `delete AnalysisResult ${r.id}`
                        );
                    }
                    if (i + 5 < toDelete.length) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
                console.log(`[runAnalysis] Deleted ${toDelete.length} existing chunk results`);
            }
        } else if (existingResultsForReport.length > 0 && _chunk_offset === undefined) {
            // Full run - delete all existing
            await withRateLimitRetry(
                () => base44.asServiceRole.entities.AnalysisResult.deleteMany({
                    project_id,
                    report_run_id: reportRun.id
                }),
                'deleteMany AnalysisResult'
            );
        }

        // Save results in batches of 8 with Promise.all and 1500ms delay
        const SAVE_BATCH_SIZE = 8;
        const SAVE_BATCH_DELAY = 1500;

        for (let i = 0; i < allResults.length; i += SAVE_BATCH_SIZE) {
            const batch = allResults.slice(i, i + SAVE_BATCH_SIZE);

            const processResult = async (res: any) => {
                // BUG FIX: Increased retry budget for sustained rate limits during reanalysis.
                // Previous 3-retry/4s-max budget was insufficient — the entire chunk would
                // throw a 500 if a single record's save kept hitting 429.
                const retryDelays = [1500, 3000, 6000, 12000, 20000, 30000];
                for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
                    try {
                        await base44.asServiceRole.entities.AnalysisResult.create(res);
                        return;
                    } catch (error: any) {
                        const isRateLimit = error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('rate limit');
                        if (isRateLimit && attempt < retryDelays.length) {
                            const delay = retryDelays[attempt];
                            console.warn(`[runAnalysis] Rate limited saving result for ${res.attendance_id}, retrying in ${delay}ms (attempt ${attempt + 1}/${retryDelays.length})...`);
                            await new Promise(r => setTimeout(r, delay));
                            continue;
                        }
                        if (isRateLimit) {
                            // Do NOT silently skip — throw so the chunk is marked failed and can be retried
                            throw new Error(`Permanently rate limited saving result for ${res.attendance_id} after ${retryDelays.length} retries`);
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

        // Create MANUAL_OTHER_MINUTES exceptions for employees with other minutes
        // CRITICAL FIX: Create PER-DATE exceptions, not spanning the entire project range.
        // Each date with other minutes gets its own exception with the correct minutes for that day.
        if (otherMinutesExceptionsToCreate.length > 0) {
            console.log(`[runAnalysis] Creating MANUAL_OTHER_MINUTES exceptions (per-date) for ${otherMinutesExceptionsToCreate.length} employees`);

            // BUG FIX: Add retry-with-backoff for exception creation to survive rate limits.
            const otherMinExceptionRetryDelays = [1500, 3000, 6000, 12000];
            for (const detail of otherMinutesExceptionsToCreate) {
                try {
                    const breakdown = detail.breakdown || {};
                    const dates = Object.keys(breakdown);

                    for (const dateStr of dates) {
                        const minutesForDate = (breakdown as Record<string, number>)[dateStr];
                        if (!minutesForDate || minutesForDate <= 0) continue;

                        const payload = {
                            project_id,
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
                        };

                        let saved = false;
                        for (let attempt = 0; attempt <= otherMinExceptionRetryDelays.length; attempt++) {
                            try {
                                await base44.asServiceRole.entities.Exception.create(payload);
                                saved = true;
                                break;
                            } catch (e: any) {
                                const isRateLimit = e?.status === 429 || e?.message?.includes('429') || e?.message?.includes('rate limit');
                                if (isRateLimit && attempt < otherMinExceptionRetryDelays.length) {
                                    const delay = otherMinExceptionRetryDelays[attempt];
                                    console.warn(`[runAnalysis] Rate limited creating other-min exception for ${detail.attendance_id} ${dateStr}, retrying in ${delay}ms...`);
                                    await new Promise(r => setTimeout(r, delay));
                                    continue;
                                }
                                throw e;
                            }
                        }
                        if (!saved) {
                            console.error(`[runAnalysis] Permanently failed to create other-min exception for ${detail.attendance_id} ${dateStr} — skipping.`);
                        }
                    }
                } catch (exError) {
                    console.warn(`[runAnalysis] Failed to create other minutes exception for ${detail.attendance_id}:`, exError.message);
                }
            }
        }

        // Update project status (only if this is NOT a chunk or it's the final chunk)
        const isFinalChunk = _chunk_offset === undefined || (startIdx + allResults.length >= uniqueEmployeeIds.length);
        if (isFinalChunk) {
            // BUG FIX: Wrap in retry to survive 429 from cumulative SDK pressure at end of chunk.
            await withRateLimitRetry(
                () => base44.asServiceRole.entities.Project.update(project_id, {
                    last_saved_report_id: reportRun.id,
                    status: 'analyzed'
                }),
                'Project.update'
            );
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
            error: (error as any).message
        }, { status: 500 });
    }
});