import React from 'react';
import { parseTime, extractTime, matchPunchesToShiftPoints, filterMultiplePunches } from '@/utils/attendanceAnalysisUtils';

const dayNameToNumber = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
};

const getWeeklyOffDay = (employee, project) => {
    if (project.weekly_off_override && project.weekly_off_override !== 'None') {
        return dayNameToNumber[project.weekly_off_override] ?? null;
    }
    if (employee?.weekly_off) {
        return dayNameToNumber[employee.weekly_off] ?? null;
    }
    return null;
};

const normalizeApplicableDaysToArray = (value) => {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
    } catch {}
    if (value.includes(',')) return value.split(',').map(s => s.trim()).filter(Boolean);
    const str = value.trim().toLowerCase();
    if (str === 'friday') return ['Friday'];
    if (str === 'monday to thursday and saturday') return ['Monday','Tuesday','Wednesday','Thursday','Saturday'];
    if (str === 'monday to saturday') return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    if (str === 'monday to friday') return ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    if (str === 'sunday to thursday') return ['Sunday','Monday','Tuesday','Wednesday','Thursday'];
    return [value.trim()];
};

const resolveShift = (dateStr, currentDay, employeeShifts, employeeExceptions) => {
    let shift = employeeShifts.find(s => s.date === dateStr);
    if (shift) return shift;

    const dayOfWeek = currentDay.getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayNames[dayOfWeek];

    const applicableShifts = employeeShifts.filter(s => !s.date);
    for (const s of applicableShifts) {
        if (s.applicable_days) {
            const appDaysArray = normalizeApplicableDaysToArray(s.applicable_days);
            if (Array.isArray(appDaysArray) && appDaysArray.some(day => 
                day.toLowerCase().trim() === currentDayName.toLowerCase()
            )) {
                return s;
            }
        }
    }

    if (dayOfWeek === 5) {
        shift = employeeShifts.find(s => s.is_friday_shift && !s.date);
        if (!shift) shift = employeeShifts.find(s => !s.is_friday_shift && !s.date);
    } else {
        shift = employeeShifts.find(s => !s.is_friday_shift && !s.date);
    }

    if (shift) {
        const shiftOverrideEx = employeeExceptions.find(ex => {
            if (ex.type !== 'SHIFT_OVERRIDE') return false;
            return currentDay >= new Date(ex.date_from) && currentDay <= new Date(ex.date_to);
        });
        if (shiftOverrideEx) {
            const isFriday = dayOfWeek === 5;
            if (shiftOverrideEx.include_friday || !isFriday) {
                return {
                    am_start: shiftOverrideEx.new_am_start,
                    am_end: shiftOverrideEx.new_am_end,
                    pm_start: shiftOverrideEx.new_pm_start,
                    pm_end: shiftOverrideEx.new_pm_end
                };
            }
        }
    }

    return shift || null;
};

const shiftEndsNearMidnight = (shift) => {
    if (!shift) return false;
    const tEnd = parseTime(shift.pm_end);
    if (!tEnd) return false;
    const h = tEnd.getHours();
    return h === 23 || h === 0 || h === 1 || h === 2;
};

const localShiftStartsNearMidnight = (shift) => {
    if (!shift) return false;
    const tStart = parseTime(shift.am_start) || parseTime(shift.pm_start);
    if (!tStart) return false;
    const h = tStart.getHours();
    return h === 23 || h === 0 || h === 1 || h === 2;
};

export default function useDetectionAnalysis({ results, employees, punches, shifts, exceptions, reportRun, project }) {

    const shiftMismatchDetections = React.useMemo(() => {
        const flagged = [];
        if (!reportRun?.date_to || !punches.length || !shifts.length) return flagged;

        const startDate = new Date(reportRun.date_from);
        const endDate = new Date(reportRun.date_to);

        results.forEach(result => {
            const employeeAttendanceId = result.attendance_id;
            const employee = employees.find(e => String(e.attendance_id) === String(employeeAttendanceId));
            const displayName = employee?.name || String(employeeAttendanceId);
            const weeklyOffDay = getWeeklyOffDay(employee, project);

            const employeeShifts = shifts.filter(s => String(s.attendance_id) === String(employeeAttendanceId));
            const employeeExceptions = exceptions.filter(e =>
                (e.attendance_id === 'ALL' || String(e.attendance_id) === String(employeeAttendanceId)) &&
                e.use_in_analysis !== false
            );

            const dayOverrides = result.day_overrides ? JSON.parse(result.day_overrides) : {};

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDay = new Date(d);
                const dateStr = currentDay.toISOString().split('T')[0];
                const dayOfWeek = currentDay.getDay();

                const dayOverride = dayOverrides[dateStr];
                if (dayOverride && ['OFF', 'SICK_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'ANNUAL_LEAVE'].includes(dayOverride.type)) {
                    continue;
                }

                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) continue;

                const hasException = employeeExceptions.some(ex => {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    return currentDay >= exFrom && currentDay <= exTo;
                });
                if (hasException) continue;

                let shift = dayOverride?.shiftOverride || resolveShift(dateStr, currentDay, employeeShifts, employeeExceptions);
                if (!shift) continue;

                const nextDayObj = new Date(currentDay);
                nextDayObj.setDate(nextDayObj.getDate() + 1);
                const nextDateStr = nextDayObj.toISOString().split('T')[0];

                const prevDayObj = new Date(currentDay);
                prevDayObj.setDate(prevDayObj.getDate() - 1);
                const prevDateStr = prevDayObj.toISOString().split('T')[0];

                const prevShift = dayOverrides[prevDateStr]?.shiftOverride || resolveShift(prevDateStr, prevDayObj, employeeShifts, employeeExceptions);
                const prevEndsNearMidnight = prevShift ? shiftEndsNearMidnight(prevShift) : false;

                const empPunches = punches.filter(p => String(p.attendance_id) === String(employeeAttendanceId));
                let todayPunchesRaw = empPunches.filter(p => p.punch_date === dateStr);

                if (prevEndsNearMidnight || !localShiftStartsNearMidnight(shift)) {
                    todayPunchesRaw = todayPunchesRaw.filter(p => {
                        const pt = parseTime(p.timestamp_raw);
                        const h = pt?.getHours();
                        return !(h === 0 || h === 1 || h === 2);
                    });
                }

                const dayPunches = [
                    ...todayPunchesRaw.map(p => ({ ...p, _isNext: false })),
                    ...empPunches.filter(p => {
                        if (p.punch_date !== nextDateStr) return false;
                        const pt = parseTime(p.timestamp_raw);
                        const h = pt?.getHours();
                        return (h === 0 || h === 1 || h === 2);
                    }).map(p => ({ ...p, _isNext: true }))
                ].map(p => {
                    const pt = parseTime(p.timestamp_raw);
                    if (!pt) return null;
                    const time = p._isNext ? new Date(pt.getTime() + 24 * 60 * 60 * 1000) : pt;
                    return { ...p, time };
                }).filter(Boolean).sort((a, b) => a.time.getTime() - b.time.getTime());

                if (dayPunches.length === 0) continue;

                const shiftStart = parseTime(shift.am_start);
                let shiftEnd = parseTime(shift.pm_end);
                if (shiftEnd && shiftEnd.getHours() === 0 && shiftEnd.getMinutes() === 0) {
                    shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
                }
                if (!shiftStart || !shiftEnd) continue;

                const validWindowStart = shiftStart.getTime() - (180 * 60 * 1000);
                const validWindowEnd = shiftEnd.getTime() + (180 * 60 * 1000);

                const allOutside = dayPunches.every(p => {
                    const t = p.time.getTime();
                    return t < validWindowStart || t > validWindowEnd;
                });

                if (allOutside) {
                    let bestShift = null;
                    let minTotalDiff = Infinity;

                    shifts.forEach(st => {
                        const points = [
                            parseTime(st.am_start), parseTime(st.am_end),
                            parseTime(st.pm_start), parseTime(st.pm_end)
                        ].filter(p => p !== null);
                        if (points.length === 0) return;

                        const lastVal = [st.am_start, st.am_end, st.pm_start, st.pm_end].filter(Boolean).pop();
                        if (points.length > 0 && lastVal === '00:00') {
                            points[points.length - 1] = new Date(points[points.length - 1].getTime() + 24 * 60 * 60 * 1000);
                        }

                        let totalDiff = 0;
                        dayPunches.forEach(p => {
                            let minPDiff = Infinity;
                            points.forEach(sp => {
                                const diff = Math.abs(p.time.getTime() - sp.getTime()) / (1000 * 60);
                                if (diff < minPDiff) minPDiff = diff;
                            });
                            totalDiff += minPDiff;
                        });

                        if (totalDiff < minTotalDiff) { minTotalDiff = totalDiff; bestShift = st; }
                    });

                    const assignedPoints = [
                        parseTime(shift.am_start), parseTime(shift.am_end),
                        parseTime(shift.pm_start), parseTime(shift.pm_end)
                    ].filter(p => p !== null);

                    const lastAssigned = [shift.am_start, shift.am_end, shift.pm_start, shift.pm_end].filter(Boolean).pop();
                    if (assignedPoints.length > 0 && lastAssigned === '00:00') {
                        assignedPoints[assignedPoints.length - 1] = new Date(assignedPoints[assignedPoints.length - 1].getTime() + 24 * 60 * 60 * 1000);
                    }

                    let assignedTotalDiff = 0;
                    dayPunches.forEach(p => {
                        let minPDiff = Infinity;
                        assignedPoints.forEach(sp => {
                            const diff = Math.abs(p.time.getTime() - sp.getTime()) / (1000 * 60);
                            if (diff < minPDiff) minPDiff = diff;
                        });
                        assignedTotalDiff += minPDiff;
                    });

                    let likelyWorkedShift = "No alternate shift found";
                    if (bestShift && minTotalDiff < assignedTotalDiff) {
                        const am = bestShift.am_start && bestShift.am_end ? `${bestShift.am_start}-${bestShift.am_end}` : '';
                        const pm = bestShift.pm_start && bestShift.pm_end ? ` | ${bestShift.pm_start}-${bestShift.pm_end}` : '';
                        likelyWorkedShift = am + pm;
                    }

                    let maxDeviation = 0;
                    dayPunches.forEach(p => {
                        let minPDiff = Infinity;
                        assignedPoints.forEach(sp => {
                            const diff = Math.abs(p.time.getTime() - sp.getTime()) / (1000 * 60);
                            if (diff < minPDiff) minPDiff = diff;
                        });
                        if (minPDiff > maxDeviation) maxDeviation = minPDiff;
                    });

                    flagged.push({
                        id: result.id,
                        attendance_id: employeeAttendanceId,
                        name: displayName,
                        date: dateStr,
                        displayDate: currentDay.toLocaleDateString('en-GB'),
                        punches: dayPunches.map(p => ({ raw: p.timestamp_raw, isPrev: p._isPrev })),
                        rawResult: result,
                        likelyWorkedShift,
                        maxDeviation: Math.round(maxDeviation)
                    });
                }
            }
        });

        return flagged;
    }, [results, punches, shifts, exceptions, reportRun, employees, project]);

    const noMatchDetections = React.useMemo(() => {
        const flagged = [];
        if (!reportRun?.date_to || !punches.length || !shifts.length) return flagged;

        const startDate = new Date(reportRun.date_from);
        const endDate = new Date(reportRun.date_to);

        results.forEach(result => {
            const employeeAttendanceId = result.attendance_id;
            const employee = employees.find(e => String(e.attendance_id) === String(employeeAttendanceId));
            const displayName = employee?.name || String(employeeAttendanceId);
            const weeklyOffDay = getWeeklyOffDay(employee, project);

            const employeeShifts = shifts.filter(s => String(s.attendance_id) === String(employeeAttendanceId));
            const employeeExceptions = exceptions.filter(e =>
                (e.attendance_id === 'ALL' || String(e.attendance_id) === String(employeeAttendanceId)) &&
                e.use_in_analysis !== false
            );

            const dayOverrides = result.day_overrides ? JSON.parse(result.day_overrides) : {};

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDay = new Date(d);
                const dateStr = currentDay.toISOString().split('T')[0];
                const dayOfWeek = currentDay.getDay();

                const dayOverride = dayOverrides[dateStr];
                if (dayOverride && ['OFF', 'SICK_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'ANNUAL_LEAVE'].includes(dayOverride.type)) {
                    continue;
                }

                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) continue;

                const hasException = employeeExceptions.some(ex => {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    return currentDay >= exFrom && currentDay <= exTo;
                });
                if (hasException) continue;

                let shift = dayOverride?.shiftOverride || resolveShift(dateStr, currentDay, employeeShifts, employeeExceptions);
                if (!shift) continue;

                const nextDayObj = new Date(currentDay);
                nextDayObj.setDate(nextDayObj.getDate() + 1);
                const nextDateStr = nextDayObj.toISOString().split('T')[0];

                const empPunches = punches.filter(p => String(p.attendance_id) === String(employeeAttendanceId));
                const combined = empPunches.filter(p => p.punch_date === dateStr || (p.punch_date === nextDateStr && parseTime(p.timestamp_raw)?.getHours() < 3));

                if (combined.length === 0) continue;

                const filtered = filterMultiplePunches(combined, shift);
                const matches = matchPunchesToShiftPoints(filtered, shift, nextDateStr);

                const noMatches = matches.filter(m => m.matchedTo === null);

                if (noMatches.length > 0 && noMatches.length > matches.length / 2) {
                    flagged.push({
                        id: result.id,
                        attendance_id: employeeAttendanceId,
                        name: displayName,
                        date: dateStr,
                        displayDate: currentDay.toLocaleDateString('en-GB'),
                        noMatchPunches: matches.map(m => ({
                            raw: m.punch.timestamp_raw,
                            matched: !!m.matchedTo,
                            isPrev: false // simplified
                        })),
                        rawResult: result
                    });
                }
            }
        });

        return flagged;
    }, [results, punches, shifts, exceptions, reportRun, employees, project]);

    return {
        shiftMismatchDetections,
        noMatchDetections,
        extractTime,
        parseTime
    };
}
