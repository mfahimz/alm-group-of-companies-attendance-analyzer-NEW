import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit } from 'lucide-react';
import EditDayRecordDialog from './EditDayRecordDialog';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Midnight buffer: punches between 12:00 AM and 1:00 AM (60 min after midnight)
 */
const MIDNIGHT_BUFFER_MINUTES = 60;

export default function DailyBreakdownDialog({
    open,
    onOpenChange,
    selectedEmployee,
    enrichedResults,
    punches,
    shifts,
    exceptions,
    employees,
    reportRun,
    project,
    parseTime,
    formatTime,
    matchPunchesToShiftPoints,
    detectPartialDay,
    filterMultiplePunches
}) {
    const [editingDay, setEditingDay] = useState(null);
    const queryClient = useQueryClient();
    const includeSeconds = project.company === 'Al Maraghi Automotive';
    const isFinalized = reportRun.is_final || project.status === 'closed';

    const isWithinMidnightBuffer = (timestampRaw) => {
        const parsed = parseTime(timestampRaw, includeSeconds);
        if (!parsed) return false;
        const minutesSinceMidnight = parsed.getHours() * 60 + parsed.getMinutes();
        return minutesSinceMidnight <= MIDNIGHT_BUFFER_MINUTES;
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const extractTime = (ts) => {
        if (project.company === 'Al Maraghi Automotive') {
            const matchWithSeconds = ts.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/i);
            if (matchWithSeconds) return matchWithSeconds[1];
        }
        const match = ts.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        if (match) return match[1];
        const dateTimeMatch = ts.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})/);
        if (dateTimeMatch) {
            let hours = parseInt(dateTimeMatch[1]);
            const minutes = dateTimeMatch[2];
            const period = hours >= 12 ? 'PM' : 'AM';
            if (hours > 12) hours -= 12;
            if (hours === 0) hours = 12;
            return `${hours}:${minutes} ${period}`;
        }
        return ts;
    };

    const getDailyBreakdown = useMemo(() => {
        if (!selectedEmployee) return [];

        const currentResult = enrichedResults.find(r => r.id === selectedEmployee.id) || selectedEmployee;
        const breakdown = [];
        const startDate = new Date(reportRun.date_from);
        const endDate = new Date(reportRun.date_to);

        let dayOverrides = {};
        if (currentResult.day_overrides) {
            try { dayOverrides = JSON.parse(currentResult.day_overrides); } catch (e) { dayOverrides = {}; }
        }

        const attendanceIdStr = String(currentResult.attendance_id);
        
        // MIDNIGHT FIX: Fetch punches including day before and day after for crossover
        const dayBeforeStart = new Date(startDate);
        dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
        const dayBeforeStartStr = dayBeforeStart.toISOString().split('T')[0];
        const dayAfterEnd = new Date(endDate);
        dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
        const dayAfterEndStr = dayAfterEnd.toISOString().split('T')[0];
        
        const allEmployeePunchesExtended = punches.filter(p =>
            String(p.attendance_id) === attendanceIdStr &&
            p.punch_date >= dayBeforeStartStr &&
            p.punch_date <= dayAfterEndStr
        );
        
        const employeeShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
        const employeeExceptions = exceptions.filter(e =>
            (e.attendance_id === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
            e.use_in_analysis !== false &&
            e.is_custom_type !== true
        );
        const employee = employees.find(e => String(e.attendance_id) === attendanceIdStr);

        const dayNameToNumber = {
            'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
            'Thursday': 4, 'Friday': 5, 'Saturday': 6
        };

        const isShiftEffective = (s) => {
            if (!s.effective_from || !s.effective_to) return true;
            const from = new Date(s.effective_from);
            const to = new Date(s.effective_to);
            const cd = new Date(new Date().setHours(0,0,0,0)); // placeholder, overridden below
            return true; // simplified - actual check done inline
        };

        const checkShiftEffective = (s, currentDate) => {
            if (!s.effective_from || !s.effective_to) return true;
            const from = new Date(s.effective_from); from.setHours(0,0,0,0);
            const to = new Date(s.effective_to); to.setHours(0,0,0,0);
            const cd = new Date(currentDate); cd.setHours(0,0,0,0);
            return cd >= from && cd <= to;
        };

        // Precompute LOP-adjacent weekly off dates from stored result
        const lopAdjacentWeeklyOffDates = new Set(
            (currentResult.lop_adjacent_weekly_off_dates || '')
                .split(',').map(d => d.trim()).filter(Boolean)
        );

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDate = new Date(d);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();

            let weeklyOffDay = null;
            if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                weeklyOffDay = dayNameToNumber[project.weekly_off_override];
            } else if (employee?.weekly_off) {
                weeklyOffDay = dayNameToNumber[employee.weekly_off];
            }

            // If this weekly off day was counted as LOP-adjacent, include it in breakdown with special flag
            if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                if (lopAdjacentWeeklyOffDates.has(dateStr)) {
                    breakdown.push({
                        date: formatDate(dateStr),
                        dateStr,
                        punches: 0,
                        crossoverPunches: 0,
                        shiftEndsNearMidnight: false,
                        punchTimes: '',
                        punchTimesShort: '-',
                        allPunchTimes: '',
                        punchObjects: [],
                        nextDateStr: '',
                        shift: 'Weekly Off',
                        exception: '-',
                        status: 'Weekly Off (LOP)',
                        abnormal: false,
                        isCriticalAbnormal: false,
                        lateInfo: '-',
                        lateMinutesTotal: 0,
                        earlyCheckoutInfo: '-',
                        otherMinutes: 0,
                        hasOverride: false,
                        partialDayReason: null,
                        punchMatches: [],
                        hasUnmatchedPunch: false,
                        hasFarExtendedMatch: false,
                        isLopAdjacentWeeklyOff: true
                    });
                }
                continue;
            }

            // ================================================================
            // MIDNIGHT SHIFT FIX: Mirror backend runAnalysis logic
            // ================================================================
            const nextDateObj = new Date(currentDate);
            nextDateObj.setDate(nextDateObj.getDate() + 1);
            const nextDateStr = nextDateObj.toISOString().split('T')[0];

            const prevDateObj = new Date(currentDate);
            prevDateObj.setDate(prevDateObj.getDate() - 1);
            const prevDateStr = prevDateObj.toISOString().split('T')[0];

            // Check if previous day's shift ended near midnight
            let prevShiftEndsNearMidnight = false;
            {
                const prevDateShifts = employeeShifts.filter(s => s.date === prevDateStr);
                const prevGeneralShifts = employeeShifts.filter(s => !s.date);
                const prevShiftCandidates = prevDateShifts.length > 0 ? prevDateShifts : prevGeneralShifts;
                for (const ps of prevShiftCandidates) {
                    const pEndTime = parseTime(ps.pm_end, includeSeconds);
                    if (pEndTime) {
                        const h = pEndTime.getHours(), m = pEndTime.getMinutes();
                        if (h === 23 || (h === 0 && m === 0)) { prevShiftEndsNearMidnight = true; break; }
                    }
                }
            }

            // Get punches for this date
            let rawDayPunches = allEmployeePunchesExtended.filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw, includeSeconds);
                    const timeB = parseTime(b.timestamp_raw, includeSeconds);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            // MIDNIGHT FIX: Exclude early AM punches that belong to previous day
            if (prevShiftEndsNearMidnight) {
                rawDayPunches = rawDayPunches.filter(p => !isWithinMidnightBuffer(p.timestamp_raw));
            }

            // Find shift for this date
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const currentDayName = dayNames[dayOfWeek];

            // Find matching exceptions
            const matchingExceptions = employeeExceptions.filter(ex => {
                try {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    return currentDate >= exFrom && currentDate <= exTo;
                } catch { return false; }
            });

            const dateException = matchingExceptions.length > 0
                ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                : null;

            let shift = employeeShifts.find(s => s.date === dateStr && checkShiftEffective(s, currentDate));

            if (!shift) {
                const applicableShifts = employeeShifts.filter(s => !s.date && checkShiftEffective(s, currentDate));
                for (const s of applicableShifts) {
                    if (s.applicable_days) {
                        try {
                            const arr = JSON.parse(s.applicable_days);
                            if (Array.isArray(arr) && arr.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) {
                                shift = s; break;
                            }
                        } catch {
                            if (s.applicable_days.toLowerCase().includes(currentDayName.toLowerCase())) {
                                shift = s; break;
                            }
                        }
                    }
                }
                if (!shift) {
                    if (dayOfWeek === 5) {
                        shift = employeeShifts.find(s => s.is_friday_shift && !s.date && checkShiftEffective(s, currentDate));
                        if (!shift) shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && checkShiftEffective(s, currentDate));
                    } else {
                        shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && checkShiftEffective(s, currentDate));
                    }
                }
            }

            if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
                const isFriday = dayOfWeek === 5;
                if (dateException.include_friday || !isFriday) {
                    shift = {
                        am_start: dateException.new_am_start, am_end: dateException.new_am_end,
                        pm_start: dateException.new_pm_start, pm_end: dateException.new_pm_end
                    };
                }
            }

            // Check if THIS shift ends near midnight → grab next-day crossover punches
            let shiftEndsNearMidnight = false;
            if (shift) {
                const pmEndTime = parseTime(shift.pm_end, includeSeconds);
                if (pmEndTime) {
                    const h = pmEndTime.getHours(), m = pmEndTime.getMinutes();
                    if (h === 23 || (h === 0 && m === 0)) shiftEndsNearMidnight = true;
                }
            }

            // MIDNIGHT FIX: Grab crossover punches from next day
            if (shiftEndsNearMidnight) {
                const nextDayPunches = allEmployeePunchesExtended
                    .filter(p => p.punch_date === nextDateStr)
                    .filter(p => isWithinMidnightBuffer(p.timestamp_raw));
                const seenIds = new Set(rawDayPunches.map(p => p.id));
                const uniqueNextDayPunches = nextDayPunches.filter(p => !seenIds.has(p.id));
                if (uniqueNextDayPunches.length > 0) {
                    rawDayPunches = [...rawDayPunches, ...uniqueNextDayPunches];
                    // Re-sort: next-day punches should sort after today's punches
                    rawDayPunches.sort((a, b) => {
                        const timeA = parseTime(a.timestamp_raw, includeSeconds);
                        const timeB = parseTime(b.timestamp_raw, includeSeconds);
                        const aIsNextDay = a.punch_date === nextDateStr;
                        const bIsNextDay = b.punch_date === nextDateStr;
                        const aTime = (timeA?.getTime() || 0) + (aIsNextDay ? 24 * 60 * 60 * 1000 : 0);
                        const bTime = (timeB?.getTime() || 0) + (bIsNextDay ? 24 * 60 * 60 * 1000 : 0);
                        return aTime - bTime;
                    });
                }
            }

            // filterMultiplePunches may lose _isNextDayPunch info, so tag punches first
            const taggedRawPunches = rawDayPunches.map(p => ({
                ...p,
                _isNextDayPunch: p.punch_date === nextDateStr
            }));
            const dayPunches = filterMultiplePunches(taggedRawPunches, shift);

            const hasMiddleTimes = shift?.am_end && shift?.pm_start &&
                String(shift.am_end).trim() !== '' && String(shift.pm_start).trim() !== '' &&
                shift.am_end !== '—' && shift.pm_start !== '—' &&
                shift.am_end !== '-' && shift.pm_start !== '-';
            const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;

            const partialDayResult = detectPartialDay(dayPunches, shift);

            // MIDNIGHT FIX: Pass nextDateStr to matchPunchesToShiftPoints for proper PM_END matching
            let punchMatches = [];
            let hasUnmatchedPunch = false;
            let hasFarExtendedMatch = false;
            if (shift && dayPunches.length > 0) {
                // For midnight shifts, adjust PM_END and punch times in matching
                // We use a wrapper that handles midnight crossover
                punchMatches = matchPunchesToShiftPointsWithMidnight(dayPunches, shift, nextDateStr);
                hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
                hasFarExtendedMatch = punchMatches.some(m => m.isFarExtendedMatch);
            }

            // Calculate late/early
            let lateInfo = '';
            let lateMinutesTotal = 0;
            let earlyCheckoutInfo = '';
            let currentOtherMinutes = 0;
            let exceptionLateMinutes = 0;
            let exceptionEarlyMinutes = 0;

            if (dateException && !dayOverrides[dateStr]) {
                if (!['OFF', 'PUBLIC_HOLIDAY', 'MANUAL_ABSENT', 'SICK_LEAVE', 'ANNUAL_LEAVE'].includes(dateException.type)) {
                    if (dateException.late_minutes > 0) exceptionLateMinutes = dateException.late_minutes;
                    if (dateException.early_checkout_minutes > 0) exceptionEarlyMinutes = dateException.early_checkout_minutes;
                    if (dateException.other_minutes > 0) currentOtherMinutes = dateException.other_minutes;
                }
            }

            let allowedMinutesForDay = 0;
            if (dateException && dateException.type === 'ALLOWED_MINUTES') {
                allowedMinutesForDay = dateException.allowed_minutes || 0;
            }

            const shouldSkipTimeCalc = dateException && [
                'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
            ].includes(dateException.type);

            const hasExceptionMinutes = exceptionLateMinutes > 0 || exceptionEarlyMinutes > 0 || currentOtherMinutes > 0;
            // NOTE: isFinalized is intentionally NOT included here.
            // This is a display-only breakdown — edit actions are already gated by project.status !== 'closed'.
            // For closed/finalized projects, we still compute per-day late/early from punches so that
            // department heads and admins can see *which day* the minutes came from, not just the stored total.
            const shouldSkipPunchCalc = shouldSkipTimeCalc || hasExceptionMinutes;

            if (shift && punchMatches.length > 0 && !shouldSkipPunchCalc) {
                let dayLateMinutes = 0;
                let dayEarlyMinutes = 0;

                for (const match of punchMatches) {
                    if (!match.matchedTo) continue;
                    const punchTime = match.punch.time;
                    const shiftTime = match.shiftTime;

                    if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                        if (punchTime > shiftTime) {
                            const minutes = Math.abs(Math.round((punchTime - shiftTime) / (1000 * 60)));
                            dayLateMinutes += minutes;
                            const label = match.matchedTo === 'AM_START' ? 'AM' : 'PM';
                            if (lateInfo) lateInfo += ' | ';
                            lateInfo += `${label}: ${minutes} min late`;
                        }
                    }

                    if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                        if (punchTime < shiftTime) {
                            const minutes = Math.abs(Math.round((shiftTime - punchTime) / (1000 * 60)));
                            dayEarlyMinutes += minutes;
                            if (earlyCheckoutInfo && earlyCheckoutInfo !== '-') {
                                earlyCheckoutInfo = `${parseInt(earlyCheckoutInfo) + minutes} min`;
                            } else {
                                earlyCheckoutInfo = `${minutes} min`;
                            }
                        }
                    }
                }

                const totalDayMinutes = dayLateMinutes + dayEarlyMinutes;
                if (allowedMinutesForDay > 0 && totalDayMinutes > 0) {
                    const remaining = Math.max(0, totalDayMinutes - allowedMinutesForDay);
                    const lateRatio = totalDayMinutes > 0 ? dayLateMinutes / totalDayMinutes : 0;
                    const earlyRatio = totalDayMinutes > 0 ? dayEarlyMinutes / totalDayMinutes : 0;
                    const adjustedLate = Math.round(remaining * lateRatio);
                    const adjustedEarly = Math.round(remaining * earlyRatio);
                    lateMinutesTotal = adjustedLate;
                    lateInfo = adjustedLate > 0 ? `${adjustedLate} min (after ${allowedMinutesForDay} allowed)` : '-';
                    earlyCheckoutInfo = adjustedEarly > 0 ? `${adjustedEarly} min (after ${allowedMinutesForDay} allowed)` : '-';
                } else {
                    lateMinutesTotal = dayLateMinutes;
                }
            }

            // Determine status
            let status = 'Absent';
            if (dateException) {
                if (dateException.type === 'OFF') status = 'Off';
                else if (dateException.type === 'MANUAL_PRESENT') status = 'Present (Manual)';
                else if (dateException.type === 'MANUAL_ABSENT') status = 'Absent (Manual)';
                else if (dateException.type === 'MANUAL_HALF') status = 'Half Day (Manual)';
                else if (dateException.type === 'SHIFT_OVERRIDE') status = dayPunches.length > 0 ? 'Present' : 'Absent';
                else if (dateException.type === 'SICK_LEAVE') status = 'Sick Leave';
                else if (dateException.type === 'ANNUAL_LEAVE') status = dayPunches.length > 0 ? 'Present' : 'Annual Leave';
                else if (dateException.type === 'MANUAL_LATE' || dateException.type === 'MANUAL_EARLY_CHECKOUT') {
                    status = dayPunches.length > 0 ? 'Present' : 'Present (Manual)';
                } else if (dayPunches.length > 0) {
                    status = 'Present';
                }
            } else if (dayPunches.length > 0) {
                if (partialDayResult.isPartial) status = 'Half Day (Partial)';
                else status = dayPunches.length >= 2 ? 'Present' : 'Half Day';
            }

            const abnormalDatesArray = (currentResult.abnormal_dates || '').split(',').map(d => d.trim()).filter(Boolean);
            let isAbnormal = abnormalDatesArray.includes(dateStr);
            const notesText = currentResult.notes || '';
            const criticalDatesArray = (notesText.match(/\d{4}-\d{2}-\d{2}/g) || []);
            const isCriticalAbnormal = criticalDatesArray.includes(dateStr);

            const dayOverride = dayOverrides[dateStr];

            if (dayOverride) {
                if (dayOverride.shiftOverride) {
                    shift = {
                        am_start: dayOverride.shiftOverride.am_start, am_end: dayOverride.shiftOverride.am_end,
                        pm_start: dayOverride.shiftOverride.pm_start, pm_end: dayOverride.shiftOverride.pm_end
                    };
                    if (dayPunches.length > 0) {
                        punchMatches = matchPunchesToShiftPoints(dayPunches, shift);
                        hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
                        lateInfo = ''; lateMinutesTotal = 0; earlyCheckoutInfo = '';
                        if (!shouldSkipPunchCalc) {
                            for (const match of punchMatches) {
                                if (!match.matchedTo) continue;
                                const punchTime = match.punch.time;
                                const shiftTime = match.shiftTime;
                                if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                                    if (punchTime > shiftTime) {
                                        const minutes = Math.abs(Math.round((punchTime - shiftTime) / (1000 * 60)));
                                        lateMinutesTotal += minutes;
                                        const label = match.matchedTo === 'AM_START' ? 'AM' : 'PM';
                                        if (lateInfo) lateInfo += ' | ';
                                        lateInfo += `${label}: ${minutes} min late`;
                                    }
                                }
                                if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                                    if (punchTime < shiftTime) {
                                        const minutes = Math.abs(Math.round((shiftTime - punchTime) / (1000 * 60)));
                                        if (earlyCheckoutInfo && earlyCheckoutInfo !== '-') {
                                            earlyCheckoutInfo = `${parseInt(earlyCheckoutInfo) + minutes} min`;
                                        } else {
                                            earlyCheckoutInfo = `${minutes} min`;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if (dayOverride.type === 'MANUAL_PRESENT') status = 'Present (Edited)';
                else if (dayOverride.type === 'MANUAL_ABSENT') status = 'Absent (Edited)';
                else if (dayOverride.type === 'MANUAL_HALF') status = 'Half Day (Edited)';
                else if (dayOverride.type === 'OFF') status = 'Off (Edited)';
                else if (dayOverride.type === 'SICK_LEAVE') status = 'Sick Leave (Admin)';

                if (dayOverride.lateMinutes !== undefined) {
                    lateMinutesTotal = Math.max(0, dayOverride.lateMinutes);
                    lateInfo = dayOverride.lateMinutes > 0 ? `${Math.max(0, dayOverride.lateMinutes)} min (edited)` : '-';
                }
                if (dayOverride.earlyCheckoutMinutes !== undefined) {
                    earlyCheckoutInfo = dayOverride.earlyCheckoutMinutes > 0 ? `${Math.max(0, dayOverride.earlyCheckoutMinutes)} min (edited)` : '-';
                }
                if (dayOverride.otherMinutes !== undefined && dayOverride.otherMinutes > 0) {
                    currentOtherMinutes = Math.max(0, dayOverride.otherMinutes);
                }
                if (dayOverride.isAbnormal !== undefined) isAbnormal = dayOverride.isAbnormal;
            }

            // Apply exception minutes
            if (exceptionLateMinutes > 0 && !dayOverride) {
                lateMinutesTotal = Math.abs(exceptionLateMinutes);
                lateInfo = `${Math.abs(exceptionLateMinutes)} min (from exception)`;
            }
            if (exceptionEarlyMinutes > 0 && !dayOverride) {
                earlyCheckoutInfo = `${Math.abs(exceptionEarlyMinutes)} min (from exception)`;
            }

            // Count punches that actually belong to THIS date (exclude crossover from next day)
            const ownDatePunchCount = rawDayPunches.filter(p => p.punch_date === dateStr).length;
            const crossoverPunchCount = rawDayPunches.filter(p => p.punch_date === nextDateStr).length;

            breakdown.push({
                date: formatDate(dateStr),
                dateStr,
                punches: ownDatePunchCount,
                crossoverPunches: crossoverPunchCount,
                shiftEndsNearMidnight,
                punchTimes: dayPunches.map(p => p.timestamp_raw).join(', '),
                punchTimesShort: dayPunches.map(p => extractTime(p.timestamp_raw)).join(', '),
                allPunchTimes: rawDayPunches.map(p => p.timestamp_raw).join(', '),
                punchObjects: dayPunches,
                nextDateStr,
                shift: shift ? `${formatTime(shift.am_start)} - ${formatTime(shift.am_end)} / ${formatTime(shift.pm_start)} - ${formatTime(shift.pm_end)}` : 'No shift',
                exception: dateException ? dateException.type : '-',
                status,
                abnormal: isAbnormal,
                isCriticalAbnormal,
                lateInfo: lateInfo || '-',
                lateMinutesTotal: Math.max(0, lateMinutesTotal || 0),
                earlyCheckoutInfo: earlyCheckoutInfo || '-',
                otherMinutes: Math.max(0, currentOtherMinutes),
                hasOverride: !!dayOverride,
                partialDayReason: partialDayResult.reason,
                punchMatches,
                hasUnmatchedPunch,
                hasFarExtendedMatch
            });
        }

        return breakdown;
    }, [selectedEmployee, enrichedResults, punches, shifts, exceptions, employees, reportRun, project]);

    /**
     * matchPunchesToShiftPoints with midnight crossover support
     * For shifts ending at midnight (00:00), adjust PM_END to 24:00
     * and adjust next-day punches to sort correctly
     */
    function matchPunchesToShiftPointsWithMidnight(dayPunches, shift, nextDateStr) {
        if (!shift || dayPunches.length === 0) return [];

        const punchesWithTime = dayPunches.map(p => {
            const time = parseTime(p.timestamp_raw, includeSeconds);
            if (!time) return null;
            // If punch is from next day (midnight crossover), add 24h
            const isNextDay = nextDateStr && p.punch_date === nextDateStr;
            const adjustedTime = isNextDay ? new Date(time.getTime() + 24 * 60 * 60 * 1000) : time;
            return { ...p, time: adjustedTime, _originalTime: time, _isNextDayPunch: isNextDay };
        }).filter(p => p).sort((a, b) => a.time - b.time);

        if (punchesWithTime.length === 0) return [];

        // Adjust PM_END if it's midnight (00:00)
        const pmEndTime = parseTime(shift.pm_end, includeSeconds);
        let adjustedPmEnd = pmEndTime;
        if (pmEndTime && pmEndTime.getHours() === 0 && pmEndTime.getMinutes() === 0) {
            adjustedPmEnd = new Date(pmEndTime.getTime() + 24 * 60 * 60 * 1000);
        }

        const shiftPoints = [
            { type: 'AM_START', time: parseTime(shift.am_start, includeSeconds), label: shift.am_start },
            { type: 'AM_END', time: parseTime(shift.am_end, includeSeconds), label: shift.am_end },
            { type: 'PM_START', time: parseTime(shift.pm_start, includeSeconds), label: shift.pm_start },
            { type: 'PM_END', time: adjustedPmEnd, label: shift.pm_end }
        ].filter(sp => sp.time);

        const matches = [];
        const usedShiftPoints = new Set();

        for (const punch of punchesWithTime) {
            let closestMatch = null;
            let minDistance = Infinity;
            let isExtendedMatch = false;
            let isFarExtendedMatch = false;

            // Try 60 min window
            for (const sp of shiftPoints) {
                if (usedShiftPoints.has(sp.type)) continue;
                const distance = Math.abs(punch.time - sp.time) / (1000 * 60);
                if (distance <= 60 && distance < minDistance) {
                    minDistance = distance; closestMatch = sp;
                }
            }
            // Try 120 min window
            if (!closestMatch) {
                for (const sp of shiftPoints) {
                    if (usedShiftPoints.has(sp.type)) continue;
                    const distance = Math.abs(punch.time - sp.time) / (1000 * 60);
                    if (distance <= 120 && distance < minDistance) {
                        minDistance = distance; closestMatch = sp; isExtendedMatch = true;
                    }
                }
            }
            // Try 180 min window
            if (!closestMatch) {
                for (const sp of shiftPoints) {
                    if (usedShiftPoints.has(sp.type)) continue;
                    const distance = Math.abs(punch.time - sp.time) / (1000 * 60);
                    if (distance <= 180 && distance < minDistance) {
                        minDistance = distance; closestMatch = sp; isFarExtendedMatch = true;
                    }
                }
            }

            if (closestMatch) {
                matches.push({ punch, matchedTo: closestMatch.type, shiftTime: closestMatch.time, distance: minDistance, isExtendedMatch, isFarExtendedMatch });
                usedShiftPoints.add(closestMatch.type);
            } else {
                matches.push({ punch, matchedTo: null, shiftTime: null, distance: null, isExtendedMatch: false, isFarExtendedMatch: false });
            }
        }

        return matches;
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            Daily Breakdown: {selectedEmployee?.attendance_id} - {selectedEmployee?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Punches</TableHead>
                                    <TableHead>Punch Times</TableHead>
                                    <TableHead>Shift</TableHead>
                                    <TableHead>Exception</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Late Min</TableHead>
                                    <TableHead>Early Min</TableHead>
                                    <TableHead>Other Min</TableHead>
                                    <TableHead>Abnormal</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {getDailyBreakdown.map((day, idx) => (
                                    <TableRow key={idx} className={`${day.isCriticalAbnormal ? 'bg-red-50' : day.abnormal ? 'bg-amber-50' : ''} ${day.hasOverride ? 'border-l-4 border-l-indigo-400' : ''}`}>
                                        <TableCell className="font-medium">{day.date}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <span>{day.punches}</span>
                                                {day.crossoverPunches > 0 && (
                                                    <span className="text-[9px] text-indigo-600 font-medium" title={`+${day.crossoverPunches} punch(es) from next day (midnight crossover)`}>
                                                        +{day.crossoverPunches}🌙
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs max-w-xs">
                                            <div title={day.allPunchTimes || day.punchTimes}>
                                                {day.punchMatches && day.punchMatches.length > 0 ? (
                                                    <div className="space-y-0.5">
                                                        {day.punchMatches.map((match, matchIdx) => {
                                                            const isNextDayPunch = match.punch._isNextDayPunch;
                                                            return (
                                                                <div key={matchIdx} className="flex items-center gap-1">
                                                                    {isNextDayPunch && (
                                                                        <span className="text-[8px] text-indigo-500 font-semibold" title="This punch is from the next calendar day (midnight crossover)">🌙</span>
                                                                    )}
                                                                    <span className={match.matchedTo ? (match.isFarExtendedMatch ? 'text-red-600 font-bold' : match.isExtendedMatch ? 'text-amber-600 font-semibold' : isNextDayPunch ? 'text-indigo-600 font-medium' : '') : 'text-red-600 font-bold'}>
                                                                        {extractTime(match.punch.timestamp_raw)}
                                                                    </span>
                                                                    {match.matchedTo && (
                                                                        <span className={`text-[9px] ${match.isFarExtendedMatch ? 'text-red-600' : match.isExtendedMatch ? 'text-amber-600' : isNextDayPunch ? 'text-indigo-500' : 'text-slate-500'}`}>
                                                                            →{match.matchedTo.replace(/_/g, ' ')}
                                                                            {isNextDayPunch && ' (next day)'}
                                                                            {match.isFarExtendedMatch && ' 🔴'}
                                                                            {match.isExtendedMatch && !match.isFarExtendedMatch && ' ⚠️'}
                                                                        </span>
                                                                    )}
                                                                    {!match.matchedTo && (
                                                                        <span className="text-[9px] text-red-600 font-bold">🔴 NO MATCH</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <>{day.punchTimesShort || '-'}</>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <div className="flex items-center gap-1">
                                                <span>{day.shift}</span>
                                                {day.shiftEndsNearMidnight && (
                                                    <span className="text-[8px] text-indigo-500" title="Shift ends near midnight - punches after 12AM are pulled into this day">🌙</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">{day.exception}</TableCell>
                                        <TableCell>
                                            <div>
                                                <span className={`px-2 py-1 rounded text-xs font-medium
                                                    ${day.status.includes('Present') && !day.status.includes('Half') ? 'bg-green-100 text-green-700' : ''}
                                                    ${day.status.includes('Absent') ? 'bg-red-100 text-red-700' : ''}
                                                    ${day.status.includes('Half') ? 'bg-amber-100 text-amber-700' : ''}
                                                    ${day.status.includes('Off') ? 'bg-slate-100 text-slate-700' : ''}
                                                `}>
                                                    {day.status}
                                                </span>
                                                {day.partialDayReason && (
                                                    <span className="text-amber-600 block text-[10px] mt-1">{day.partialDayReason}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {day.lateMinutesTotal > 0 ? (
                                                <span className="text-orange-600 font-medium">{Math.max(0, day.lateMinutesTotal)} min</span>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {day.earlyCheckoutInfo && day.earlyCheckoutInfo !== '-' ? (
                                                <span className="text-blue-600 font-medium">{day.earlyCheckoutInfo}</span>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {day.otherMinutes > 0 ? (
                                                <span className="text-purple-600 font-medium">{Math.max(0, day.otherMinutes)} min</span>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {day.abnormal && <span className="text-amber-600 font-medium">Yes</span>}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {project.status !== 'closed' && (
                                                <Button size="sm" variant="ghost" onClick={() => setEditingDay(day)}>
                                                    <Edit className="w-4 h-4 text-indigo-600" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            <EditDayRecordDialog
                open={!!editingDay}
                onClose={() => setEditingDay(null)}
                onSave={() => queryClient.invalidateQueries(['results', reportRun.id])}
                dayRecord={editingDay}
                project={project}
                attendanceId={selectedEmployee?.attendance_id}
                analysisResult={selectedEmployee}
                dailyBreakdownData={{
                    [selectedEmployee?.attendance_id]: {
                        daily_details: getDailyBreakdown.reduce((acc, day) => ({
                            ...acc,
                            [day.dateStr]: { punches: day.punchObjects || [] }
                        }), {})
                    }
                }}
            />
        </>
    );
}