import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * BACKFILL SALARY EXTRA PREVIOUS MONTH DEDUCTIBLE MINUTES
 * 
 * For Al Maraghi Motors only.
 * Computes and stores extra_prev_month_deductible_minutes for existing finalized reports.
 * 
 * Inputs:
 * - project_id (required)
 * - report_run_id (required, must be final)
 * - mode: "DRY_RUN" | "APPLY" (default: DRY_RUN)
 * 
 * Idempotent: second run should make 0 updates if already filled.
 */

Deno.serve(async (req) => {
    try {
        console.log('[backfillSalaryExtraPrevMonth] Function invoked');
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { project_id, report_run_id, mode = 'DRY_RUN' } = await req.json();
        console.log('[backfillSalaryExtraPrevMonth] Params:', { project_id, report_run_id, mode });

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

        // Guard: Only Al Maraghi Motors
        if (project.company !== 'Al Maraghi Motors') {
            return Response.json({
                error: 'This function only applies to Al Maraghi Motors projects',
                company: project.company
            }, { status: 400 });
        }

        // Verify report is final
        const reports = await base44.asServiceRole.entities.ReportRun.filter({
            id: report_run_id,
            project_id: project_id
        });
        if (reports.length === 0) {
            return Response.json({ error: 'Report not found for this project' }, { status: 404 });
        }
        const reportRun = reports[0];
        if (!reportRun.is_final) {
            return Response.json({ error: 'Report must be finalized' }, { status: 400 });
        }

        // Calculate salary month ranges
        const projectDateTo = new Date(project.date_to);
        const salaryMonthStart = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth(), 1);
        const salaryMonthEnd = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth() + 1, 0);

        const salaryMonthStartStr = salaryMonthStart.toISOString().split('T')[0];
        const salaryMonthEndStr = salaryMonthEnd.toISOString().split('T')[0];

        // Extra previous month range
        const projectDateFrom = new Date(project.date_from);
        const dayBeforeSalaryMonth = new Date(salaryMonthStart);
        dayBeforeSalaryMonth.setDate(dayBeforeSalaryMonth.getDate() - 1);

        let extraPrevMonthFrom = null;
        let extraPrevMonthTo = null;
        let hasExtraPrevMonthRange = false;

        if (projectDateFrom < salaryMonthStart) {
            extraPrevMonthFrom = project.date_from;
            extraPrevMonthTo = dayBeforeSalaryMonth.toISOString().split('T')[0];
            hasExtraPrevMonthRange = true;
        }

        console.log('[backfillSalaryExtraPrevMonth] Ranges:', {
            project_date_from: project.date_from,
            project_date_to: project.date_to,
            salary_month_start: salaryMonthStartStr,
            salary_month_end: salaryMonthEndStr,
            extra_prev_month_from: extraPrevMonthFrom,
            extra_prev_month_to: extraPrevMonthTo,
            has_extra_range: hasExtraPrevMonthRange
        });

        // Fetch salary snapshots for this report
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        if (snapshots.length === 0) {
            return Response.json({
                project_id,
                report_run_id,
                company: project.company,
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                extra_prev_month_from: extraPrevMonthFrom,
                extra_prev_month_to: extraPrevMonthTo,
                processed_employees: 0,
                updated_snapshots: 0,
                skipped_snapshots: 0,
                dry_run: mode === 'DRY_RUN',
                message: 'No salary snapshots found for this report'
            });
        }

        // Filter snapshots that need updating
        const snapshotsToUpdate = snapshots.filter(s =>
            s.salary_month_start === null ||
            s.salary_month_start === undefined ||
            s.extra_prev_month_deductible_minutes === null ||
            s.extra_prev_month_deductible_minutes === undefined
        );

        console.log(`[backfillSalaryExtraPrevMonth] Found ${snapshots.length} snapshots, ${snapshotsToUpdate.length} need updating`);

        if (snapshotsToUpdate.length === 0) {
            return Response.json({
                project_id,
                report_run_id,
                company: project.company,
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                extra_prev_month_from: extraPrevMonthFrom,
                extra_prev_month_to: extraPrevMonthTo,
                processed_employees: snapshots.length,
                updated_snapshots: 0,
                skipped_snapshots: snapshots.length,
                dry_run: mode === 'DRY_RUN',
                message: 'All snapshots already have salary month fields populated'
            });
        }

        // If no extra prev month range, just set fields to 0
        if (!hasExtraPrevMonthRange) {
            if (mode === 'APPLY') {
                for (const snapshot of snapshotsToUpdate) {
                    await base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, {
                        salary_month_start: salaryMonthStartStr,
                        salary_month_end: salaryMonthEndStr,
                        extra_prev_month_deductible_minutes: 0
                    });
                }
            }

            return Response.json({
                project_id,
                report_run_id,
                company: project.company,
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                extra_prev_month_from: null,
                extra_prev_month_to: null,
                processed_employees: snapshots.length,
                updated_snapshots: mode === 'APPLY' ? snapshotsToUpdate.length : 0,
                skipped_snapshots: snapshots.length - snapshotsToUpdate.length,
                dry_run: mode === 'DRY_RUN',
                message: mode === 'DRY_RUN'
                    ? `Would update ${snapshotsToUpdate.length} snapshots (no extra prev month range)`
                    : `Updated ${snapshotsToUpdate.length} snapshots (no extra prev month range)`
            });
        }

        // Fetch data needed for calculation
        const [employees, punches, shifts, allExceptions, rulesData] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.Punch.filter({ project_id: project_id }),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id: project_id }),
            base44.asServiceRole.entities.Exception.filter({ project_id: project_id }),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company })
        ]);

        // Parse rules
        let rules = null;
        if (rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                console.warn('[backfillSalaryExtraPrevMonth] Failed to parse rules');
            }
        }

        // Helper functions (same as createSalarySnapshots)
        const parseTime = (timeStr: any) => {
            try {
                if (!timeStr || timeStr === '—' || timeStr === '-') return null;

                // Priority 1: Format with seconds
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

                // Priority 2: Standard AM/PM
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

                // Priority 3: 24-hour with optional seconds
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

        const filterMultiplePunches = (punchList: any[]) => {
            if (punchList.length <= 1) return punchList;
            const punchesWithTime = punchList.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw)
            })).filter(p => p.time);
            if (punchesWithTime.length === 0) return punchList;

            const deduped = [];
            for (const current of punchesWithTime) {
                const isDuplicate = deduped.some(p => Math.abs(current.time.getTime() - p.time.getTime()) / (1000 * 60) < 10);
                if (!isDuplicate) deduped.push(current);
            }
            return deduped.sort((a, b) => a.time.getTime() - b.time.getTime());
        };

        const matchPunchesToShiftPoints = (dayPunches: any[], shift: any) => {
            if (!shift || dayPunches.length === 0) return [];
            
            const punchesWithTime = dayPunches.map(p => ({
                ...p,
                time: p.time || parseTime(p.timestamp_raw)
            })).filter((p: any) => p.time).sort((a: any, b: any) => a.time.getTime() - b.time.getTime());
            
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
                    const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);
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

        // Calculate extra prev month deductible minutes for an employee
        const calculateExtraPrevMonthMinutes = (attendanceId, empData) => {
            const attendanceIdStr = String(attendanceId);
            const includeSeconds = false; // Al Maraghi Motors doesn't use seconds

            const employeePunches = punches.filter(p =>
                String(p.attendance_id) === attendanceIdStr &&
                p.punch_date >= extraPrevMonthFrom &&
                p.punch_date <= extraPrevMonthTo
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

            // Get grace minutes for this employee
            const dept = empData?.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
            const carriedGrace = project.use_carried_grace_minutes ? (empData?.carried_grace_minutes || 0) : 0;
            const graceMinutesPerDay = baseGrace + carriedGrace;

            let totalExtraDeductibleMinutes = 0;

            const startDate = new Date(extraPrevMonthFrom);
            const endDate = new Date(extraPrevMonthTo);

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getUTCDay();

                // Check weekly off
                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (empData?.weekly_off) {
                    weeklyOffDay = dayNameToNumber[empData.weekly_off];
                }

                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue; // Skip weekly off
                }

                // Check exceptions
                const matchingExceptions = employeeExceptions.filter(ex => {
                    try {
                        const exFrom = new Date(ex.date_from);
                        const exTo = new Date(ex.date_to);
                        return currentDate >= exFrom && currentDate <= exTo;
                    } catch { return false; }
                });

                const hasPublicHoliday = matchingExceptions.some(ex =>
                    ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF'
                );
                if (hasPublicHoliday) continue;

                const dateException = matchingExceptions.length > 0
                    ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                    : null;

                // Skip days with certain exception types
                if (dateException && [
                    'MANUAL_PRESENT', 'MANUAL_ABSENT', 'SICK_LEAVE', 'ANNUAL_LEAVE'
                ].includes(dateException.type)) {
                    continue;
                }

                // Get punches for this day
                const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr);

                // NO PUNCHES = 0 minutes (strict rule from spec)
                if (rawDayPunches.length === 0) {
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
                            } catch { }
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

                if (!shift) continue;

                const dayPunches = filterMultiplePunches(rawDayPunches);

                // Track allowed minutes
                let allowedMinutesForDay = 0;
                let approvedMinutesForDay = 0;
                if (dateException && dateException.type === 'ALLOWED_MINUTES' &&
                    dateException.approval_status === 'approved_dept_head') {
                    allowedMinutesForDay = dateException.allowed_minutes || 0;
                    approvedMinutesForDay = allowedMinutesForDay;
                }

                // Check for manual time exception
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
                    const punchMatches = matchPunchesToShiftPoints(dayPunches, shift);

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
                }

                // Calculate day deductible: max(0, late + early + other - grace - approved)
                const dayDeductible = Math.max(0,
                    dayLateMinutes + dayEarlyMinutes + dayOtherMinutes - graceMinutesPerDay - approvedMinutesForDay
                );
                totalExtraDeductibleMinutes += dayDeductible;
            }

            return totalExtraDeductibleMinutes;
        };

        // Process each snapshot
        let updatedCount = 0;
        const results = [];

        for (const snapshot of snapshotsToUpdate) {
            // Find employee data
            const emp = employees.find(e =>
                String(e.attendance_id) === String(snapshot.attendance_id) ||
                String(e.hrms_id) === String(snapshot.hrms_id)
            );

            const extraMinutes = calculateExtraPrevMonthMinutes(snapshot.attendance_id, emp);

            results.push({
                attendance_id: snapshot.attendance_id,
                name: snapshot.name,
                extra_prev_month_deductible_minutes: extraMinutes
            });

            if (mode === 'APPLY') {
                await base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, {
                    salary_month_start: salaryMonthStartStr,
                    salary_month_end: salaryMonthEndStr,
                    extra_prev_month_deductible_minutes: extraMinutes
                });
                updatedCount++;
            }
        }

        return Response.json({
            project_id,
            report_run_id,
            company: project.company,
            salary_month_start: salaryMonthStartStr,
            salary_month_end: salaryMonthEndStr,
            extra_prev_month_from: extraPrevMonthFrom,
            extra_prev_month_to: extraPrevMonthTo,
            processed_employees: snapshots.length,
            updated_snapshots: mode === 'APPLY' ? updatedCount : 0,
            skipped_snapshots: snapshots.length - snapshotsToUpdate.length,
            dry_run: mode === 'DRY_RUN',
            details: mode === 'DRY_RUN' ? results : undefined,
            message: mode === 'DRY_RUN'
                ? `Would update ${snapshotsToUpdate.length} snapshots`
                : `Updated ${updatedCount} snapshots`
        });

    } catch (error) {
        console.error('[backfillSalaryExtraPrevMonth] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});