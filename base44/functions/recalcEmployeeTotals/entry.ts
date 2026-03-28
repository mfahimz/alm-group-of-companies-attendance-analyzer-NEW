import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Backend function to recalculate a single employee's attendance totals
 * after a day_override edit. This replaces the heavy frontend recalculation
 * that required loading ALL punches/shifts/exceptions into the browser.
 * 
 * Input: { analysis_result_id }
 * Output: Updated totals for the employee
 */
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { analysis_result_id } = await req.json();
    if (!analysis_result_id) return Response.json({ error: 'Missing analysis_result_id' }, { status: 400 });

    // Fetch the analysis result
    const results = await base44.asServiceRole.entities.AnalysisResult.filter({ id: analysis_result_id });
    const result = results[0];
    if (!result) return Response.json({ error: 'AnalysisResult not found' }, { status: 404 });

    const projectId = result.project_id;
    const attendanceIdStr = String(result.attendance_id);

    // Fetch the project
    const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Fetch the report run
    let reportRun = null;
    if (result.report_run_id) {
        const runs = await base44.asServiceRole.entities.ReportRun.filter({ id: result.report_run_id });
        reportRun = runs[0];
    }
    const dateFrom = reportRun?.date_from || project.date_from;
    const dateTo = reportRun?.date_to || project.date_to;

    // Helper: paginated fetch
    const fetchAll = async (entity, filter) => {
        let all = [];
        let skip = 0;
        const pageSize = 100;
        while (true) {
            const page = await base44.asServiceRole.entities[entity].filter(filter, null, pageSize, skip);
            all = all.concat(page);
            if (page.length < pageSize) break;
            skip += pageSize;
            await new Promise(r => setTimeout(r, 200));
        }
        return all;
    };

    // Fetch only THIS employee's data (not all employees)
    const dayBeforeStart = new Date(dateFrom);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
    const dayAfterEnd = new Date(dateTo);
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);

    const [employeePunchesRaw, allShifts, allExceptions, employeeList] = await Promise.all([
        fetchAll('Punch', { project_id: projectId, attendance_id: attendanceIdStr }),
        fetchAll('ShiftTiming', { project_id: projectId, attendance_id: attendanceIdStr }),
        fetchAll('Exception', { project_id: projectId }),
        base44.asServiceRole.entities.Employee.filter({ company: project.company, attendance_id: attendanceIdStr }, null, 5)
    ]);

    const employee = employeeList[0] || null;

    // Filter punches to date range + buffer
    const dayBeforeStr = dayBeforeStart.toISOString().split('T')[0];
    const dayAfterStr = dayAfterEnd.toISOString().split('T')[0];
    const employeePunches = employeePunchesRaw.filter(p =>
        p.punch_date >= dayBeforeStr && p.punch_date <= dayAfterStr
    );

    const employeeShifts = allShifts; // Already filtered by attendance_id
    const employeeExceptions = allExceptions.filter(e =>
        (e.attendance_id === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
        e.use_in_analysis !== false &&
        e.is_custom_type !== true
    );

    // Parse day_overrides
    let dayOverrides = {};
    if (result.day_overrides) {
        try { dayOverrides = JSON.parse(result.day_overrides); } catch {}
    }

    // Time parsing helpers
    const parseTime = (timeStr) => {
        if (!timeStr || timeStr === '—' || timeStr === '-') return null;
        let m = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
        if (m) {
            let h = parseInt(m[1]);
            const period = m[4].toUpperCase();
            if (period === 'PM' && h !== 12) h += 12;
            if (period === 'AM' && h === 12) h = 0;
            const d = new Date(2000, 0, 1, h, parseInt(m[2]), m[3] ? parseInt(m[3]) : 0);
            return d;
        }
        m = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (m) {
            return new Date(2000, 0, 1, parseInt(m[1]), parseInt(m[2]), m[3] ? parseInt(m[3]) : 0);
        }
        const dtMatch = timeStr.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (dtMatch) {
            return new Date(2000, 0, 1, parseInt(dtMatch[1]), parseInt(dtMatch[2]), dtMatch[3] ? parseInt(dtMatch[3]) : 0);
        }
        return null;
    };

    const MIDNIGHT_BUFFER = 120;
    const isWithinMidnightBuffer = (ts) => {
        const p = parseTime(ts);
        if (!p) return false;
        return p.getHours() * 60 + p.getMinutes() <= MIDNIGHT_BUFFER;
    };

    const shiftStartsNearMidnight = (shift) => {
        if (!shift) return false;
        const t = parseTime(shift.am_start);
        if (!t) return false;
        const h = t.getHours();
        return h === 23 || h === 0 || h === 1 || h === 2;
    };

    const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Dedup punches
    const filterMultiplePunches = (punchList) => {
        if (punchList.length <= 1) return punchList;
        const withTime = punchList.map(p => ({ ...p, _t: parseTime(p.timestamp_raw) })).filter(p => p._t);
        if (!withTime.length) return punchList;
        const deduped = [];
        for (const c of withTime) {
            if (!deduped.some(p => Math.abs(c._t - p._t) / 60000 < 10)) deduped.push(c);
        }
        return deduped.sort((a, b) => a._t - b._t);
    };

    // Match punches to shift points
    const matchPunches = (dayPunches, shift, nextDateStr) => {
        if (!shift || !dayPunches.length) return [];
        const withTime = dayPunches.map(p => {
            const t = parseTime(p.timestamp_raw);
            if (!t) return null;
            const isNext = nextDateStr && p.punch_date === nextDateStr;
            return { ...p, time: isNext ? new Date(t.getTime() + 86400000) : t };
        }).filter(Boolean).sort((a, b) => a.time - b.time);
        if (!withTime.length) return [];

        const pmEnd = parseTime(shift.pm_end);
        const adjPmEnd = pmEnd && pmEnd.getHours() === 0 && pmEnd.getMinutes() === 0
            ? new Date(pmEnd.getTime() + 86400000) : pmEnd;

        const points = [
            { type: 'AM_START', time: parseTime(shift.am_start) },
            { type: 'AM_END', time: parseTime(shift.am_end) },
            { type: 'PM_START', time: parseTime(shift.pm_start) },
            { type: 'PM_END', time: adjPmEnd }
        ].filter(sp => sp.time);

        const matches = [];
        const used = new Set();
        for (const punch of withTime) {
            let best = null, minD = Infinity, ext = false, far = false;
            for (const tier of [60, 120, 180]) {
                if (best) break;
                for (const sp of points) {
                    if (used.has(sp.type)) continue;
                    const d = Math.abs(punch.time - sp.time) / 60000;
                    if (d <= tier && d < minD) {
                        minD = d; best = sp;
                        ext = tier === 120; far = tier === 180;
                    }
                }
            }
            if (best) {
                matches.push({ punch, matchedTo: best.type, shiftTime: best.time, distance: minD });
                used.add(best.type);
            } else {
                matches.push({ punch, matchedTo: null, shiftTime: null, distance: null });
            }
        }
        return matches;
    };

    // ========== MAIN CALCULATION ==========
    let totalLateMinutes = 0, totalEarlyCheckout = 0, totalOtherMinutes = 0;
    let workingDays = 0, presentDays = 0, fullAbsenceCount = 0, halfAbsenceCount = 0;
    let sickLeaveCount = 0, annualLeaveCount = 0;

    const startDate = new Date(dateFrom);
    const endDate = new Date(dateTo);

    // Annual leave as calendar days
    const alExceptions = employeeExceptions.filter(ex => ex.type === 'ANNUAL_LEAVE');
    const alDates = new Set();
    for (const al of alExceptions) {
        try {
            const ef = new Date(al.date_from), et = new Date(al.date_to);
            const rs = ef < startDate ? new Date(startDate) : new Date(ef);
            const re = et > endDate ? new Date(endDate) : new Date(et);
            if (rs <= re) {
                for (let d = new Date(rs); d <= re; d.setDate(d.getDate() + 1)) {
                    alDates.add(d.toISOString().split('T')[0]);
                }
            }
        } catch {}
    }
    annualLeaveCount = alDates.size;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const currentDate = new Date(d);
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay();
        const currentDayName = dayNames[dayOfWeek];

        // Weekly off
        let weeklyOffDay = null;
        if (project.weekly_off_override && project.weekly_off_override !== 'None') {
            weeklyOffDay = dayNameToNumber[project.weekly_off_override];
        } else if (employee?.weekly_off) {
            weeklyOffDay = dayNameToNumber[employee.weekly_off];
        }
        if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) continue;

        workingDays++;

        const nextDateObj = new Date(currentDate); nextDateObj.setDate(nextDateObj.getDate() + 1);
        const nextDateStr = nextDateObj.toISOString().split('T')[0];
        const prevDateObj = new Date(currentDate); prevDateObj.setDate(prevDateObj.getDate() - 1);
        const prevDateStr = prevDateObj.toISOString().split('T')[0];

        // Previous shift midnight check
        let prevShiftEndsNearMidnight = false;
        const prevShifts = employeeShifts.filter(s => s.date === prevDateStr);
        const prevGenShifts = employeeShifts.filter(s => !s.date);
        for (const ps of (prevShifts.length > 0 ? prevShifts : prevGenShifts)) {
            const pe = parseTime(ps.pm_end);
            if (pe) { const h = pe.getHours(); if (h === 23 || h === 0) { prevShiftEndsNearMidnight = true; break; } }
        }

        // Exceptions for this day
        const matchingExceptions = employeeExceptions.filter(ex => {
            const ef = new Date(ex.date_from), et = new Date(ex.date_to);
            return currentDate >= ef && currentDate <= et;
        });
        const dateException = matchingExceptions.length > 0
            ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
            : null;

        // Resolve shift
        const isShiftEffective = (s) => {
            if (!s.effective_from || !s.effective_to) return true;
            const f = new Date(s.effective_from), t = new Date(s.effective_to);
            const c = new Date(currentDate); c.setHours(0,0,0,0); f.setHours(0,0,0,0); t.setHours(0,0,0,0);
            return c >= f && c <= t;
        };

        let shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
        if (!shift) {
            const appShifts = employeeShifts.filter(s => !s.date && isShiftEffective(s));
            for (const s of appShifts) {
                if (s.applicable_days) {
                    try { const arr = JSON.parse(s.applicable_days); if (Array.isArray(arr) && arr.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) { shift = s; break; } } catch {}
                    if (!shift && s.applicable_days.toLowerCase().includes(currentDayName.toLowerCase())) { shift = s; break; }
                }
            }
            if (!shift) {
                if (dayOfWeek === 5) {
                    shift = employeeShifts.find(s => s.is_friday_shift && !s.date && isShiftEffective(s));
                    if (!shift) shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                } else {
                    shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                }
            }
        }

        if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
            const isFri = dayOfWeek === 5;
            if (dateException.include_friday || !isFri) {
                shift = { am_start: dateException.new_am_start, am_end: dateException.new_am_end, pm_start: dateException.new_pm_start, pm_end: dateException.new_pm_end };
            }
        }

        const dayOverride = dayOverrides[dateStr];
        if (dayOverride?.shiftOverride) {
            shift = { am_start: dayOverride.shiftOverride.am_start, am_end: dayOverride.shiftOverride.am_end, pm_start: dayOverride.shiftOverride.pm_start, pm_end: dayOverride.shiftOverride.pm_end };
        }

        // Get punches for this day
        let rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr)
            .sort((a, b) => { const ta = parseTime(a.timestamp_raw), tb = parseTime(b.timestamp_raw); return (ta?.getTime()||0) - (tb?.getTime()||0); });

        if (prevShiftEndsNearMidnight || !shiftStartsNearMidnight(shift)) {
            rawDayPunches = rawDayPunches.filter(p => !isWithinMidnightBuffer(p.timestamp_raw));
        }

        let shiftEndsAtMidnight = false;
        if (shift) { const pe = parseTime(shift.pm_end); if (pe) { const h = pe.getHours(); if (h === 23 || h === 0) shiftEndsAtMidnight = true; } }

        if (shiftEndsAtMidnight) {
            const nextDayP = employeePunches.filter(p => p.punch_date === nextDateStr).filter(p => isWithinMidnightBuffer(p.timestamp_raw));
            const seen = new Set(rawDayPunches.map(p => p.id));
            const unique = nextDayP.filter(p => !seen.has(p.id));
            if (unique.length > 0) {
                rawDayPunches = [...rawDayPunches, ...unique].sort((a, b) => {
                    const ta = parseTime(a.timestamp_raw), tb = parseTime(b.timestamp_raw);
                    const at = (ta?.getTime()||0) + (a.punch_date === nextDateStr ? 86400000 : 0);
                    const bt = (tb?.getTime()||0) + (b.punch_date === nextDateStr ? 86400000 : 0);
                    return at - bt;
                });
            }
        }

        const dayPunches = filterMultiplePunches(rawDayPunches);
        const hasMiddle = shift?.am_end && shift?.pm_start && shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' && shift.am_end !== '—' && shift.pm_start !== '—';
        const isSingleShift = shift?.is_single_shift === true || !hasMiddle;

        let punchMatches = [];
        if (shift && dayPunches.length > 0) {
            punchMatches = matchPunches(dayPunches, shift, nextDateStr);
        }

        // Attendance status
        const halfDayEx = matchingExceptions.find(ex => ex.type === 'HALF_DAY_HOLIDAY');
        const skipPunchEx = matchingExceptions.find(ex => ex.type === 'SKIP_PUNCH');
        const hasSkipPunch = !!skipPunchEx || !!halfDayEx;

        if (dayOverride) {
            if (dayOverride.type === 'MANUAL_PRESENT') presentDays++;
            else if (dayOverride.type === 'MANUAL_ABSENT') fullAbsenceCount++;
            else if (dayOverride.type === 'OFF') workingDays--;
            else if (dayOverride.type === 'SICK_LEAVE') sickLeaveCount++;
        } else if (dateException) {
            if (dateException.type === 'OFF' || dateException.type === 'PUBLIC_HOLIDAY') workingDays--;
            else if (dateException.type === 'HALF_DAY_HOLIDAY') presentDays++;
            else if (dateException.type === 'MANUAL_PRESENT') presentDays++;
            else if (dateException.type === 'MANUAL_ABSENT') fullAbsenceCount++;
            else if (dateException.type === 'SICK_LEAVE') sickLeaveCount++;
            else if (dateException.type === 'ANNUAL_LEAVE') { if (dayPunches.length === 0) workingDays--; else presentDays++; }
            else if (hasSkipPunch || dayPunches.length > 0) presentDays++;
            else fullAbsenceCount++;
        } else if (dayPunches.length > 0) {
            if (isSingleShift) { presentDays++; if (dayPunches.length === 1) halfAbsenceCount++; }
            else { presentDays++; if (dayPunches.length <= 2) halfAbsenceCount++; }
        } else {
            fullAbsenceCount++;
        }

        const shouldSkip = dateException && ['SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'OFF', 'PUBLIC_HOLIDAY'].includes(dateException.type) || dayOverride?.type === 'SICK_LEAVE';

        let exLate = 0, exEarly = 0, curOther = 0;
        if (dateException && !dayOverride && !shouldSkip) {
            if (dateException.late_minutes > 0) exLate = dateException.late_minutes;
            if (dateException.early_checkout_minutes > 0) exEarly = dateException.early_checkout_minutes;
            if (dateException.other_minutes > 0) curOther = dateException.other_minutes;
        }

        let dayLate = 0, dayEarly = 0;

        if (shift && punchMatches.length > 0 && !shouldSkip) {
            const skipTargets = new Set();
            if (skipPunchEx) {
                const st = skipPunchEx.punch_to_skip;
                if (st === 'AM_PUNCH_IN') skipTargets.add('AM_START');
                else if (st === 'AM_PUNCH_OUT') skipTargets.add('AM_END');
                else if (st === 'PM_PUNCH_IN') skipTargets.add('PM_START');
                else if (st === 'PM_PUNCH_OUT') skipTargets.add('PM_END');
                else if (st === 'FULL_SKIP') { skipTargets.add('AM_START'); skipTargets.add('AM_END'); skipTargets.add('PM_START'); skipTargets.add('PM_END'); }
            }
            if (halfDayEx) {
                if (halfDayEx.half_day_target === 'AM') { skipTargets.add('AM_START'); skipTargets.add('AM_END'); }
                else if (halfDayEx.half_day_target === 'PM') { skipTargets.add('PM_START'); skipTargets.add('PM_END'); }
            }

            const punchGrace = { 'AM_START': 0, 'AM_END': 0, 'PM_START': 0, 'PM_END': 0 };
            matchingExceptions.forEach(ex => {
                if (ex.type === 'ALLOWED_MINUTES' && ex.attendance_id === 'ALL' && ex.target_punch) {
                    punchGrace[ex.target_punch] += (ex.allowed_minutes || 0);
                }
            });

            for (const match of punchMatches) {
                if (!match.matchedTo || skipTargets.has(match.matchedTo)) continue;
                const pt = match.punch.time, st = match.shiftTime;
                const g = punchGrace[match.matchedTo] || 0;
                if ((match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') && pt > st) {
                    dayLate += Math.max(0, Math.round((pt - st) / 60000) - g);
                }
                if ((match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') && pt < st) {
                    dayEarly += Math.max(0, Math.round((st - pt) / 60000) - g);
                }
            }
        }

        if (dateException && !shouldSkip) {
            if (exLate > 0) dayLate = Math.abs(exLate);
            if (exEarly > 0) dayEarly = Math.abs(exEarly);
            if (curOther > 0) totalOtherMinutes += Math.abs(curOther);
        }
        if (dayOverride && !shouldSkip) {
            if (dayOverride.lateMinutes !== undefined) dayLate = dayOverride.lateMinutes;
            if (dayOverride.earlyCheckoutMinutes !== undefined) dayEarly = dayOverride.earlyCheckoutMinutes;
            if (dayOverride.otherMinutes !== undefined) totalOtherMinutes += dayOverride.otherMinutes;
        }

        // ALLOWED_MINUTES reduction
        const empAllowed = matchingExceptions
            .filter(ex => ex.type === 'ALLOWED_MINUTES' && String(ex.attendance_id) === attendanceIdStr)
            .reduce((sum, ex) => sum + (ex.allowed_minutes || 0), 0);
        if (empAllowed > 0) {
            const total = dayLate + dayEarly;
            if (total > 0) {
                const rem = Math.max(0, total - empAllowed);
                const lr = dayLate / total, er = dayEarly / total;
                dayLate = Math.round(rem * lr);
                dayEarly = Math.round(rem * er);
            }
        }

        totalLateMinutes += dayLate;
        totalEarlyCheckout += dayEarly;
    }

    // Compute approved minutes from ALLOWED_MINUTES exceptions
    const sd = new Date(dateFrom), ed = new Date(dateTo);
    let approvedMinutes = 0;
    employeeExceptions.filter(ex => ex.type === 'ALLOWED_MINUTES' && String(ex.attendance_id) === attendanceIdStr && ex.use_in_analysis !== false).forEach(ex => {
        const ef = new Date(ex.date_from), et = new Date(ex.date_to);
        if (ef <= ed && et >= sd) approvedMinutes += (ex.allowed_minutes || 0);
    });

    const graceMinutes = result.grace_minutes ?? 15;
    const deductibleMinutes = Math.max(0, Math.max(0, totalLateMinutes) + Math.max(0, totalEarlyCheckout) - graceMinutes);
    const giftMinutes = result.ramadan_gift_minutes || 0;
    const effectiveDeductible = Math.max(0, (result.manual_deductible_minutes ?? deductibleMinutes) - giftMinutes);

    // Update the AnalysisResult with recalculated values
    const updatePayload = {
        working_days: Math.max(0, workingDays),
        present_days: Math.max(0, presentDays),
        full_absence_count: Math.max(0, fullAbsenceCount),
        half_absence_count: Math.max(0, halfAbsenceCount),
        sick_leave_count: Math.max(0, sickLeaveCount),
        annual_leave_count: Math.max(0, annualLeaveCount),
        late_minutes: Math.max(0, totalLateMinutes),
        early_checkout_minutes: Math.max(0, totalEarlyCheckout),
        other_minutes: Math.max(0, totalOtherMinutes),
        deductible_minutes: deductibleMinutes,
        approved_minutes: approvedMinutes > 0 ? approvedMinutes : (result.approved_minutes || 0)
    };

    await base44.asServiceRole.entities.AnalysisResult.update(analysis_result_id, updatePayload);

    return Response.json({
        success: true,
        ...updatePayload,
        grace_minutes: graceMinutes,
        ramadan_gift_minutes: giftMinutes,
        effective_deductible_minutes: effectiveDeductible
    });
});