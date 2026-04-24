import React from 'react';

/**
 * Shared utility: extract the time portion of a full timestamp string for display.
 */
export const extractTime = (timestamp) => {
    if (!timestamp) return '-';
    const match = timestamp.match(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?/i);
    return match ? match[0] : timestamp;
};

/**
 * Shared time parsing utility
 */
const localParseTime = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || timeStr === '—' || timeStr === '-') return null;
    
    const normalized = timeStr.trim();
    
    // Capture AM/PM modifier and HH:MM(:SS)
    const ampmMatch = normalized.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1]);
        const minutes = parseInt(ampmMatch[2]);
        const seconds = ampmMatch[3] ? parseInt(ampmMatch[3]) : 0;
        const period = ampmMatch[4].toUpperCase();

        if (period === 'AM') {
            if (hours === 12) hours = 0;
            // if hours < 12, remains (no change)
        } else if (period === 'PM') {
            if (hours < 12) hours += 12;
            // if hours === 12, remains (no change)
        }
        
        const d = new Date();
        d.setHours(hours, minutes, seconds, 0);
        return d;
    }

    // Fallback for HH:MM(:SS) in 24h format
    const hmsMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hmsMatch) {
        const d = new Date();
        d.setHours(parseInt(hmsMatch[1]), parseInt(hmsMatch[2]), hmsMatch[3] ? parseInt(hmsMatch[3]) : 0, 0);
        return d;
    }

    return null;
};

/**
 * Shared midnight crossover punch identification
 */
const localIsWithinMidnightBuffer = (tsR) => {
    if (!tsR || tsR === '—' || tsR === '-') return false;
    const pt = localParseTime(String(tsR));
    if (!pt) return false;
    const h = pt.getHours();
    return h === 0 || h === 1 || h === 2;
};

/**
 * Normalized friday-shift helper
 */
const localIsFridayShift = (shiftRow) =>
    shiftRow?.is_friday_shift === true ||
    shiftRow?.is_friday_shift === 'true' ||
    shiftRow?.is_friday_shift === 1 ||
    shiftRow?.is_friday_shift === '1';

const normalizeApplicableDaysToArray = (value) => {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
    } catch {}
    // Handle comma-separated
    if (value.includes(',')) return value.split(',').map(s => s.trim()).filter(Boolean);
    // Handle known phrases
    const str = value.trim().toLowerCase();
    if (str === 'friday') return ['Friday'];
    if (str === 'monday to thursday and saturday') return ['Monday','Tuesday','Wednesday','Thursday','Saturday'];
    if (str === 'monday to saturday') return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    if (str === 'monday to friday') return ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    if (str === 'sunday to thursday') return ['Sunday','Monday','Tuesday','Wednesday','Thursday'];
    // Single day name fallback
    return [value.trim()];
};

/**
 * Resolve the effective weekly off day number (0=Sun..6=Sat) for an employee,
 * accounting for project-level override, employee-level setting, and DAY_SWAP / WEEKLY_OFF_OVERRIDE exceptions.
 */
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

/**
 * Resolve shift for a given date and employee shifts list.
 * Mirrors the priority logic used in calculateEmployeeTotals.
 */
const resolveShift = (dateStr, currentDay, employeeShifts, employeeExceptions) => {
    // Date-specific shift first
    let shift = employeeShifts.find(s => s.date === dateStr);
    if (shift) return shift;

    const dayOfWeek = currentDay.getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayNames[dayOfWeek];

    // applicable_days shifts
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

    // Friday vs non-Friday fallback
    if (dayOfWeek === 5) {
        shift = employeeShifts.find(s => localIsFridayShift(s) && !s.date);
        if (!shift) shift = employeeShifts.find(s => !localIsFridayShift(s) && !s.date);
    } else {
        shift = employeeShifts.find(s => !localIsFridayShift(s) && !s.date);
    }

    // Apply SHIFT_OVERRIDE exception if present
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

/**
 * Check if a shift ends near midnight (11 PM, 12 AM, or 1 AM)
 */
const shiftEndsNearMidnight = (shift) => {
    if (!shift) return false;
    const tEnd = localParseTime(shift.pm_end);
    if (!tEnd) return false;
    const h = tEnd.getHours();
    return h === 23 || h === 0 || h === 1 || h === 2;
};

/**
 * Check if a shift starts near midnight (11 PM, 12 AM, 1 AM, or 2 AM)
 */
const localShiftStartsNearMidnight = (shift) => {
    if (!shift) return false;
    const tStart = localParseTime(shift.am_start) || localParseTime(shift.pm_start);
    if (!tStart) return false;
    const h = tStart.getHours();
    return h === 23 || h === 0 || h === 1 || h === 2;
};

// =====================================================================
// HOOK: useDetectionAnalysis
// Extracts shift mismatch and no-match detection logic from ReportDetailView
// =====================================================================
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

                // Respect manual day overrides
                const dayOverride = dayOverrides[dateStr];
                if (dayOverride) {
                    // If manually set to a specific type, skip detection as it's already audited
                    if (['OFF', 'SICK_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'ANNUAL_LEAVE'].includes(dayOverride.type)) {
                        continue;
                    }
                }

                // Skip weekly off days
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) continue;

                // Skip days with exceptions
                const hasException = employeeExceptions.some(ex => {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    return currentDay >= exFrom && currentDay <= exTo;
                });
                if (hasException) continue;

                let shift = null;
                if (dayOverride?.shiftOverride) {
                    shift = dayOverride.shiftOverride;
                } else {
                    shift = resolveShift(dateStr, currentDay, employeeShifts, employeeExceptions);
                }
                if (!shift) continue;

                const nextDayObj = new Date(currentDay);
                nextDayObj.setDate(nextDayObj.getDate() + 1);
                const nextDateStr = nextDayObj.toISOString().split('T')[0];

                // Previous day midnight handling
                const prevDayObj = new Date(currentDay);
                prevDayObj.setDate(prevDayObj.getDate() - 1);
                const prevDateStr = prevDayObj.toISOString().split('T')[0];

                const prevShift = dayOverrides[prevDateStr]?.shiftOverride || resolveShift(prevDateStr, prevDayObj, employeeShifts, employeeExceptions);
                const prevEndsNearMidnight = prevShift ? shiftEndsNearMidnight(prevShift) : false;

                const empPunches = punches.filter(p => String(p.attendance_id) === String(employeeAttendanceId));
                let todayPunchesRaw = empPunches.filter(p => p.punch_date === dateStr);

                // FIX: Unconditionally exclude midnight buffer punches unless today's shift starts near midnight
                // OR previous shift actually ended near midnight (meaning it was already 'consumed' yesterday)
                if (prevEndsNearMidnight || !localShiftStartsNearMidnight(shift)) {
                    todayPunchesRaw = todayPunchesRaw.filter(p => !localIsWithinMidnightBuffer(p.timestamp_raw));
                }

                const dayPunches = [
                    ...todayPunchesRaw.map(p => ({ ...p, _isNext: false })),
                    ...empPunches.filter(p => p.punch_date === nextDateStr && localIsWithinMidnightBuffer(p.timestamp_raw))
                        .map(p => ({ ...p, _isNext: true }))
                ].map(p => {
                    const pt = localParseTime(p.timestamp_raw);
                    if (!pt) return null;
                    const time = p._isNext ? new Date(pt.getTime() + 24 * 60 * 60 * 1000) : pt;
                    return { ...p, time };
                }).filter(Boolean).sort((a, b) => a.time.getTime() - b.time.getTime());

                if (dayPunches.length === 0) continue;

                const shiftStart = localParseTime(shift.am_start);
                let shiftEnd = localParseTime(shift.pm_end);
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
                    // Find likely worked shift
                    let bestShift = null;
                    let minTotalDiff = Infinity;

                    shifts.forEach(st => {
                        const points = [
                            localParseTime(st.am_start), localParseTime(st.am_end),
                            localParseTime(st.pm_start), localParseTime(st.pm_end)
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

                    // Compare against assigned shift score
                    const assignedPoints = [
                        localParseTime(shift.am_start), localParseTime(shift.am_end),
                        localParseTime(shift.pm_start), localParseTime(shift.pm_end)
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
                        punches: dayPunches.map(p => ({ raw: p.timestamp_raw, isPrev: localIsWithinMidnightBuffer(p.timestamp_raw) })),
                        rawResult: result,
                        likelyWorkedShift,
                        maxDeviation: Math.round(maxDeviation)
                    });
                }
            }
        });

        return flagged;
    }, [results, punches, shifts, exceptions, reportRun, employees, project]);

    // =========================================================================
    // NO MATCH DETECTIONS
    // Flags days where THE MAJORITY of punches cannot be bound to any shift point.
    // Includes weekly off skip and proper midnight handling.
    // =========================================================================
    const noMatchDetections = React.useMemo(() => {
        const flagged = [];
        if (!reportRun?.date_to || !punches.length || !shifts.length) return flagged;

        const localFilterMultiplePunches = (punchList, shift) => {
            if (punchList.length <= 1) return punchList;
            const withTime = punchList.map(p => ({ ...p, time: localParseTime(p.timestamp_raw) })).filter(p => p.time);
            if (withTime.length === 0) return punchList;
            const deduped = [];
            for (const current of withTime) {
                if (!deduped.some(p => Math.abs(current.time.getTime() - p.time.getTime()) / (1000 * 60) < 10)) {
                    deduped.push(current);
                }
            }
            return deduped.sort((a, b) => a.time.getTime() - b.time.getTime());
        };

        const localMatchPunchesToShiftPointsWithMidnight = (dayPunches, shift, nextDateStr) => {
            if (!shift || dayPunches.length === 0) return [];
            const punchesWithTime = dayPunches.map(p => {
                const time = localParseTime(p.timestamp_raw);
                if (!time) return null;
                const adjustedTime = (nextDateStr && p.punch_date === nextDateStr) ? new Date(time.getTime() + 24 * 60 * 60 * 1000) : time;
                return { ...p, time: adjustedTime };
            }).filter(Boolean).sort((a, b) => a.time.getTime() - b.time.getTime());

            const pmEndTime = localParseTime(shift.pm_end);
            const shiftPoints = [
                { type: 'AM_START', time: localParseTime(shift.am_start) },
                { type: 'AM_END', time: localParseTime(shift.am_end) },
                { type: 'PM_START', time: localParseTime(shift.pm_start) },
                { type: 'PM_END', time: (pmEndTime && pmEndTime.getHours() === 0 ? new Date(pmEndTime.getTime() + 24 * 60 * 60 * 1000) : pmEndTime) }
            ].filter(sp => sp.time);

            const matches = [];
            const usedPoints = new Set();
            for (const punch of punchesWithTime) {
                let closest = null, minD = Infinity;
                let isExtendedMatch = false;
                let isFarExtendedMatch = false;

                // Tier 1: 60m
                for (const sp of shiftPoints) {
                    if (usedPoints.has(sp.type)) continue;
                    const d = Math.abs(punch.time.getTime() - sp.time.getTime()) / (1000 * 60);
                    if (d <= 60 && d < minD) { minD = d; closest = sp; }
                }

                // Tier 2: 120m
                if (!closest) {
                    for (const sp of shiftPoints) {
                        if (usedPoints.has(sp.type)) continue;
                        const d = Math.abs(punch.time.getTime() - sp.time.getTime()) / (1000 * 60);
                        if (d <= 120 && d < minD) { minD = d; closest = sp; isExtendedMatch = true; }
                    }
                }

                // Tier 3: 180m
                if (!closest) {
                    for (const sp of shiftPoints) {
                        if (usedPoints.has(sp.type)) continue;
                        const d = Math.abs(punch.time.getTime() - sp.time.getTime()) / (1000 * 60);
                        if (d <= 180 && d < minD) { minD = d; closest = sp; isFarExtendedMatch = true; }
                    }
                }

                if (closest) {
                    matches.push({
                        punch,
                        matchedTo: closest.type,
                        distance: minD,
                        shiftTime: closest.time,
                        isExtendedMatch,
                        isFarExtendedMatch
                    });
                    usedPoints.add(closest.type);
                } else {
                    matches.push({
                        punch,
                        matchedTo: null,
                        distance: null,
                        shiftTime: null,
                        isExtendedMatch: false,
                        isFarExtendedMatch: false
                    });
                }
            }
            return matches;
        };

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

                // Respect manual day overrides
                const dayOverride = dayOverrides[dateStr];
                if (dayOverride) {
                    // If manually set to a specific type, skip detection as it's already audited
                    if (['OFF', 'SICK_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'ANNUAL_LEAVE'].includes(dayOverride.type)) {
                        continue;
                    }
                }

                // FIX 1: Skip weekly off days
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) continue;

                // Skip days with exceptions
                const hasException = employeeExceptions.some(ex => {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    return currentDay >= exFrom && currentDay <= exTo;
                });
                if (hasException) continue;

                let shift = null;
                if (dayOverride?.shiftOverride) {
                    shift = dayOverride.shiftOverride;
                } else {
                    shift = resolveShift(dateStr, currentDay, employeeShifts, employeeExceptions);
                }
                if (!shift) continue;

                const nextDayObj = new Date(currentDay);
                nextDayObj.setDate(nextDayObj.getDate() + 1);
                const nextDateStr = nextDayObj.toISOString().split('T')[0];

                // Previous day midnight handling (conditional, not unconditional)
                const prevDayObj = new Date(currentDay);
                prevDayObj.setDate(prevDayObj.getDate() - 1);
                const prevDateStr = prevDayObj.toISOString().split('T')[0];

                const prevShift = dayOverrides[prevDateStr]?.shiftOverride || resolveShift(prevDateStr, prevDayObj, employeeShifts, employeeExceptions);
                const prevEndsNearMidnight = prevShift ? shiftEndsNearMidnight(prevShift) : false;

                const empPunches = punches.filter(p => String(p.attendance_id) === String(employeeAttendanceId));
                let currentDayPunches = empPunches.filter(p => p.punch_date === dateStr);

                // FIX: Unconditionally exclude midnight buffer punches unless today's shift starts near midnight
                // OR previous shift actually ended near midnight (meaning it was already 'consumed' yesterday)
                if (prevEndsNearMidnight || !localShiftStartsNearMidnight(shift)) {
                    currentDayPunches = currentDayPunches.filter(p => !localIsWithinMidnightBuffer(p.timestamp_raw));
                }

                const combined = [
                    ...currentDayPunches,
                    ...empPunches.filter(p => p.punch_date === nextDateStr && localIsWithinMidnightBuffer(p.timestamp_raw))
                ];

                if (combined.length === 0) continue;

                const filtered = localFilterMultiplePunches(combined, shift);
                const matches = localMatchPunchesToShiftPointsWithMidnight(filtered, shift, nextDateStr);

                const noMatches = matches.filter(m => m.matchedTo === null);

                // FIX 2: Majority unbound rule — only flag if MORE THAN HALF of punches are unbound
                if (noMatches.length > 0 && noMatches.length > matches.length / 2) {
                    const pmEndTime = localParseTime(shift.pm_end);
                    const shiftPointsDetailed = [
                        { label: 'AM Start', time: localParseTime(shift.am_start) },
                        { label: 'AM End', time: localParseTime(shift.am_end) },
                        { label: 'PM Start', time: localParseTime(shift.pm_start) },
                        { label: 'PM End', time: (pmEndTime && pmEndTime.getHours() === 0 ? new Date(pmEndTime.getTime() + 24 * 60 * 60 * 1000) : pmEndTime) }
                    ].filter(sp => sp.time);

                    let maxDeviation = 0;
                    noMatches.forEach(m => {
                        const pt = localParseTime(m.punch.timestamp_raw);
                        if (!pt) return;
                        const punchTime = (nextDateStr && m.punch.punch_date === nextDateStr) ? new Date(pt.getTime() + 24 * 60 * 60 * 1000) : pt;
                        let minPDiff = Infinity;
                        shiftPointsDetailed.forEach(sp => {
                            const diff = Math.abs(punchTime.getTime() - sp.time.getTime()) / (1000 * 60);
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
                        noMatchPunches: matches.map(m => {
                            let nearestShiftPoint = null;
                            let minutesAway = null;
                            if (!m.matchedTo) {
                                const pt = localParseTime(m.punch.timestamp_raw);
                                if (pt) {
                                    const punchTime = (nextDateStr && m.punch.punch_date === nextDateStr) ? new Date(pt.getTime() + 24 * 60 * 60 * 1000) : pt;
                                    let minD = Infinity;
                                    shiftPointsDetailed.forEach(sp => {
                                        const diff = Math.abs(punchTime.getTime() - sp.time.getTime()) / (1000 * 60);
                                        if (diff < minD) { minD = diff; nearestShiftPoint = sp.label; minutesAway = Math.round(diff); }
                                    });
                                }
                            }
                            return {
                                raw: m.punch.timestamp_raw,
                                matched: !!m.matchedTo,
                                isPrev: localIsWithinMidnightBuffer(m.punch.timestamp_raw),
                                nearestShiftPoint,
                                minutesAway
                            };
                        }),
                        rawResult: result,
                        maxDeviation: Math.round(maxDeviation)
                    });
                }
            }
        });

        return flagged;
    }, [results, punches, shifts, exceptions, reportRun, employees, project]);

    return {
        shiftMismatchDetections,
        noMatchDetections,
        extractTime: extractTime,
        localParseTime,
        localIsWithinMidnightBuffer
    };
}