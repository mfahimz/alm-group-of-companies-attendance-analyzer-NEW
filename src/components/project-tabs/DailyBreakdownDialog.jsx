import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit, Loader2 } from 'lucide-react';
import EditDayRecordDialog from './EditDayRecordDialog';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TimePicker from '../ui/TimePicker';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Midnight buffer: punches between 12:00 AM and 03:00 AM (180 min after midnight).
 * Now UNIVERSAL: moved into the previous day unless the current day has an early shift start.
 */
const MIDNIGHT_BUFFER_MINUTES = 180;

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

export default function DailyBreakdownDialog({
    open,
    onOpenChange,
    selectedEmployee,
    enrichedResults,
    punches: parentPunches,
    shifts: parentShifts,
    exceptions: parentExceptions,
    employees,
    reportRun,
    project,
    parseTime,
    formatTime,
    matchPunchesToShiftPoints,
    filterMultiplePunches
}) {
    const [editingDay, setEditingDay] = useState(null);
    const [selectedDays, setSelectedDays] = useState(new Set());
    const [showBulkPanel, setShowBulkPanel] = useState(false);
    const [bulkType, setBulkType] = useState('');
    const [bulkAbnormal, setBulkAbnormal] = useState(false);
    const [bulkShiftOverride, setBulkShiftOverride] = useState({ enabled: false, am_start: '', am_end: '', pm_start: '', pm_end: '', is_single_shift: false });
    const [isBulkSaving, setIsBulkSaving] = useState(false);
    const [bulkZeroEarly, setBulkZeroEarly] = useState(false);
    const [bulkZeroLate, setBulkZeroLate] = useState(false);


    const queryClient = useQueryClient();
    const includeSeconds = true; // Unified
    const isFinalized = reportRun.is_final || project.status === 'closed';

    useEffect(() => {
        setSelectedDays(new Set());
        setShowBulkPanel(false);
        setBulkZeroEarly(false);
        setBulkZeroLate(false);
    }, [selectedEmployee, open]);

    const handleBulkApply = async () => {
        if (!selectedEmployee || selectedDays.size === 0) return;
        if (!bulkType && !bulkAbnormal && !bulkShiftOverride.enabled && !bulkZeroEarly && !bulkZeroLate) return;
        setIsBulkSaving(true);
        try {
            const currentResult = enrichedResults.find(r => r.id === selectedEmployee.id) || selectedEmployee;
            let overrides = {};
            if (currentResult.day_overrides) {
                try { overrides = JSON.parse(currentResult.day_overrides); } catch { overrides = {}; }
            }
            for (const dateStr of selectedDays) {
                const existing = overrides[dateStr] || {};
                const updated = { ...existing };
                if (bulkType) {
                    updated.type = bulkType;
                    updated.details = '';
                    if (['MANUAL_ABSENT', 'SICK_LEAVE', 'ANNUAL_LEAVE', 'OFF', 'WORK_FROM_HOME'].includes(bulkType)) {
                        updated.lateMinutes = 0;
                        updated.earlyCheckoutMinutes = 0;
                        updated.otherMinutes = 0;
                    }
                }
                if (bulkAbnormal) updated.isAbnormal = true;
                if (bulkZeroEarly) {
                    updated.earlyCheckoutMinutes = 0;
                }
                if (bulkZeroLate) {
                    updated.lateMinutes = 0;
                }
                if (bulkShiftOverride.enabled && bulkShiftOverride.am_start && (bulkShiftOverride.is_single_shift || bulkShiftOverride.pm_end)) {
                    updated.shiftOverride = {
                        am_start: bulkShiftOverride.am_start,
                        am_end: bulkShiftOverride.am_end,
                        pm_start: bulkShiftOverride.is_single_shift ? '' : bulkShiftOverride.pm_start,
                        pm_end: bulkShiftOverride.is_single_shift ? '' : bulkShiftOverride.pm_end,
                        is_single_shift: bulkShiftOverride.is_single_shift === true
                    };
                }
                overrides[dateStr] = updated;
            }
            let totalLate = 0;
            let totalEarly = 0;
            let totalOther = 0;
            for (const [, ov] of Object.entries(overrides)) {
                totalLate += Math.max(0, Number(ov.lateMinutes) || 0);
                totalEarly += Math.max(0, Number(ov.earlyCheckoutMinutes) || 0);
                totalOther += Math.max(0, Number(ov.otherMinutes) || 0);
            }
            const deductible = totalLate + totalEarly + totalOther;
            await base44.entities.AnalysisResult.update(currentResult.id, {
                day_overrides: JSON.stringify(overrides),
                late_minutes: totalLate,
                early_checkout_minutes: totalEarly,
                other_minutes: totalOther,
                deductible_minutes: deductible
            });
            queryClient.invalidateQueries({ queryKey: ['results', reportRun.id, project.id] });
            queryClient.invalidateQueries({ queryKey: ['reportRun', reportRun.id] });
            setSelectedDays(new Set());
            setShowBulkPanel(false);
            setBulkType('');
            setBulkAbnormal(false);
            setBulkZeroEarly(false);
            setBulkZeroLate(false);
            setBulkShiftOverride({ enabled: false, am_start: '', am_end: '', pm_start: '', pm_end: '', is_single_shift: false });
        } catch (err) {
            console.error('Bulk apply failed:', err);
        } finally {
            setIsBulkSaving(false);
        }
    };



    // FAST LOAD: Fetch data for just THIS employee directly, bypassing slow project-wide paginated fetch.
    // Falls back to parent data if available (already cached from a prior load).
    const attendanceIdStr = selectedEmployee ? String(selectedEmployee.attendance_id) : null;

    const { data: selfPunches = [], isFetched: selfPunchesFetched } = useQuery({
        queryKey: ['employeePunches', project.id, attendanceIdStr],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id, attendance_id: attendanceIdStr }, null, 500),
        enabled: open && !!attendanceIdStr && parentPunches.length === 0,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false
    });

    const { data: selfShifts = [], isFetched: selfShiftsFetched } = useQuery({
        queryKey: ['employeeShifts', project.id, attendanceIdStr],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id, attendance_id: attendanceIdStr }, null, 200),
        enabled: open && !!attendanceIdStr && parentShifts.length === 0,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false
    });

    const { data: selfExceptions = [], isFetched: selfExceptionsFetched } = useQuery({
        queryKey: ['employeeExceptions', project.id, attendanceIdStr],
        queryFn: async () => {
            // Fetch employee-specific + ALL-type exceptions
            const [personal, global] = await Promise.all([
                base44.entities.Exception.filter({ project_id: project.id, attendance_id: attendanceIdStr }, null, 500),
                base44.entities.Exception.filter({ project_id: project.id, attendance_id: 'ALL' }, null, 200)
            ]);
            return [...personal, ...global];
        },
        enabled: open && !!attendanceIdStr && parentExceptions.length === 0,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false
    });

    // Use parent data if available (already cached), otherwise use self-fetched data
    const punches = parentPunches.length > 0 ? parentPunches : selfPunches;
    const shifts = parentShifts.length > 0 ? parentShifts : selfShifts;
    const exceptions = parentExceptions.length > 0 ? parentExceptions : selfExceptions;

    const dataReady = parentPunches.length > 0 || (selfPunchesFetched && selfShiftsFetched && selfExceptionsFetched);

    const isWithinMidnightBuffer = (timestampRaw) => {
        const parsed = parseTime(timestampRaw, includeSeconds);
        if (!parsed) return false;
        const minutesSinceMidnight = parsed.getHours() * 60 + parsed.getMinutes();
        return minutesSinceMidnight <= MIDNIGHT_BUFFER_MINUTES;
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-GB'); // DD/MM/YYYY
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
            e.is_custom_type !== true &&
            // GIFT_MINUTES is a period-level summary exception (saved for the whole report range)
            // and must not be displayed against individual days in the breakdown.
            e.type !== 'GIFT_MINUTES'
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
            const cd = new Date(new Date().setHours(0, 0, 0, 0)); // placeholder, overridden below
            return true; // simplified - actual check done inline
        };

        const checkShiftEffective = (s, currentDate) => {
            if (!s.effective_from || !s.effective_to) return true;
            const from = new Date(s.effective_from); from.setHours(0, 0, 0, 0);
            const to = new Date(s.effective_to); to.setHours(0, 0, 0, 0);
            const cd = new Date(currentDate); cd.setHours(0, 0, 0, 0);
            return cd >= from && cd <= to;
        };

        // Precompute LOP-adjacent dates (WO or PH) from stored result
        const lopAdjacentDates = new Set(
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

            const shiftStartsNearMidnight = (s) => {
                const tStart = parseTime(s?.am_start, includeSeconds);
                if (!tStart) return false;
                const minutes = tStart.getHours() * 60 + tStart.getMinutes();
                return minutes <= MIDNIGHT_BUFFER_MINUTES;
            };

            const getShiftForDate = (targetDateStr, targetDateObj) => {
                const dayName = dayNames[targetDateObj.getDay()];
                let s = employeeShifts.find(sh => sh.date === targetDateStr && checkShiftEffective(sh, targetDateObj));

                if (!s) {
                    const applicableShifts = employeeShifts.filter(sh => !sh.date && checkShiftEffective(sh, targetDateObj));
                    for (const sh of applicableShifts) {
                        if (sh.applicable_days) {
                            const appDaysArray = normalizeApplicableDaysToArray(sh.applicable_days);
                            if (Array.isArray(appDaysArray) && appDaysArray.some(day => 
                                day.toLowerCase().trim() === dayName.toLowerCase()
                            )) {
                                s = sh; break;
                            }
                        }
                    }
                    if (!s) {
                        if (targetDateObj.getDay() === 5) {
                            s = employeeShifts.find(sh => sh.is_friday_shift && !sh.date && checkShiftEffective(sh, targetDateObj));
                            if (!s) s = employeeShifts.find(sh => !sh.is_friday_shift && !sh.date && checkShiftEffective(sh, targetDateObj));
                        } else {
                            s = employeeShifts.find(sh => !sh.is_friday_shift && !sh.date && checkShiftEffective(sh, targetDateObj));
                        }
                    }
                }

                // Exception check
                const targetMatchingExceptions = employeeExceptions.filter(ex => {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    return targetDateObj >= exFrom && targetDateObj <= exTo;
                });
                const targetDateEx = targetMatchingExceptions.length > 0
                    ? targetMatchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                    : null;

                if (targetDateEx && targetDateEx.type === 'SHIFT_OVERRIDE') {
                    const isFriday = targetDateObj.getDay() === 5;
                    if (targetDateEx.include_friday || !isFriday) {
                        s = {
                            am_start: targetDateEx.new_am_start, am_end: targetDateEx.new_am_end,
                            pm_start: targetDateEx.new_pm_start, pm_end: targetDateEx.new_pm_end
                        };
                    }
                }
                return s;
            };

            // If this weekly off day was counted as LOP-adjacent, include it in breakdown with special flag
            // Only show LOP-adjacent weekly off rows for Al Maraghi Motors (double deduction is exclusive to them)
            if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                if (lopAdjacentDates.has(dateStr) && project.company === 'Al Maraghi Motors') {
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
                        isLopAdjacent: true
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
                ? matchingExceptions.sort((a, b) => {
                    // This must stay in sync with runAnalysis priority sort
                    const PRIORITY_MAP = {
                        'MANUAL_ABSENT': 10, 'MANUAL_PRESENT': 10, 'SICK_LEAVE': 10, 'ANNUAL_LEAVE': 10,
                        'SHIFT_OVERRIDE': 9, 'SKIP_PUNCH': 9,
                        'ALLOWED_MINUTES': 8, 'MANUAL_LATE': 8, 'MANUAL_EARLY_CHECKOUT': 8,
                        'MANUAL_OTHER_MINUTES': 7, 'DAY_SWAP': 7, 'WEEKLY_OFF_OVERRIDE': 7,
                        'HALF_DAY_HOLIDAY': 6,
                        'CUSTOM': 5,
                        'DISMISSED_MISMATCH': 3,
                        'GIFT_MINUTES': 1
                    };
                    const pA = PRIORITY_MAP[a.type] || 5;
                    const pB = PRIORITY_MAP[b.type] || 5;
                    if (pA !== pB) return pB - pA;
                    return new Date(b.created_date || 0) - new Date(a.created_date || 0);
                })[0]
                : null;

            // Step 1: Check for report-generated exceptions (created_from_report === true)
            // Select the highest priority one using the same PRIORITY_MAP as above.
            const reportGeneratedException = matchingExceptions.length > 0
                ? matchingExceptions.filter(ex => ex.created_from_report === true).sort((a, b) => {
                    const PRIORITY_MAP = {
                        'MANUAL_ABSENT': 10, 'MANUAL_PRESENT': 10, 'SICK_LEAVE': 10, 'ANNUAL_LEAVE': 10,
                        'SHIFT_OVERRIDE': 9, 'SKIP_PUNCH': 9,
                        'ALLOWED_MINUTES': 8, 'MANUAL_LATE': 8, 'MANUAL_EARLY_CHECKOUT': 8,
                        'MANUAL_OTHER_MINUTES': 7, 'DAY_SWAP': 7, 'WEEKLY_OFF_OVERRIDE': 7,
                        'HALF_DAY_HOLIDAY': 6,
                        'CUSTOM': 5,
                        'DISMISSED_MISMATCH': 3,
                        'GIFT_MINUTES': 1
                    };
                    const pA = PRIORITY_MAP[a.type] || 5;
                    const pB = PRIORITY_MAP[b.type] || 5;
                    if (pA !== pB) return pB - pA;
                    return new Date(b.created_date || 0) - new Date(a.created_date || 0);
                })[0]
                : null;

            // Get punches for this date
            let rawDayPunches = allEmployeePunchesExtended.filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw, includeSeconds);
                    const timeB = parseTime(b.timestamp_raw, includeSeconds);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            // Check if previous day's shift ended near midnight
            let prevShiftEndsNearMidnight = false;
            {
                const prevDateShifts = employeeShifts.filter(s => s.date === prevDateStr);
                const prevGeneralShifts = employeeShifts.filter(s => !s.date);
                const prevShiftCandidates = prevDateShifts.length > 0 ? prevDateShifts : prevGeneralShifts;
                for (const ps of prevShiftCandidates) {
                    const pEndTime = parseTime(ps.pm_end, includeSeconds);
                    if (pEndTime) {
                        const h = pEndTime.getHours();
                        if (h === 23 || h === 0) { prevShiftEndsNearMidnight = true; break; }
                    }
                }
            }

            let shift = employeeShifts.find(s => s.date === dateStr && checkShiftEffective(s, currentDate));

            if (!shift) {
                const applicableShifts = employeeShifts.filter(s => !s.date && checkShiftEffective(s, currentDate));
                for (const s of applicableShifts) {
                    if (s.applicable_days) {
                        const appDaysArray = normalizeApplicableDaysToArray(s.applicable_days);
                        if (Array.isArray(appDaysArray) && appDaysArray.some(day => 
                            day.toLowerCase().trim() === currentDayName.toLowerCase()
                        )) {
                            shift = s; break;
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

            // MIDNIGHT FIX: Universal Rollback
            // Exclude early AM punches that belong to previous day
            // We now exclude UNCONDITIONALLY if today's shift doesn't start in this window.
            if (!shiftStartsNearMidnight(shift)) {
                rawDayPunches = rawDayPunches.filter(p => !isWithinMidnightBuffer(p.timestamp_raw));
            }

            // Check if THIS shift ends near midnight → grab next-day crossover punches
            let shiftEndsNearMidnight = false;
            if (shift) {
                const pmEndTime = parseTime(shift.pm_end);
                if (pmEndTime) {
                    const h = pmEndTime.getHours();
                    if (h === 23 || h === 0) shiftEndsNearMidnight = true;
                }
            }

            // MIDNIGHT FIX: Universal Forward-Inclusion
            // Grab crossover punches from next day if next day doesn't start near midnight
            const nextDayShift = getShiftForDate(nextDateStr, nextDateObj);
            if (!shiftStartsNearMidnight(nextDayShift)) {
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
            // Strict boolean equality is required because is_single_shift may be stored as the string 'false' or number 0 which are falsy but would incorrectly evaluate as truthy in a loose check; this must match backend runAnalysis.ts behavior exactly.
            const isSingleShift = shift?.is_single_shift === true || !hasMiddleTimes;



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

            // Step 2: Unified calculation logic for late/early minutes
            let lateInfo = '';
            let lateMinutesTotal = 0;
            let earlyCheckoutInfo = '';
            let currentOtherMinutes = 0;
            let dayLateMinutes = 0;
            let dayEarlyMinutes = 0;
            let isLateOverridden = false;
            let isEarlyOverridden = false;

            if (reportGeneratedException && !dayOverrides[dateStr]) {
                // REPORT GENERATED EXCEPTION: mirrors runAnalysis logic exactly - if HR edited this day in a previous report apply those values directly and skip punch computation.
                if (['MANUAL_PRESENT', 'MANUAL_ABSENT', 'SICK_LEAVE', 'ANNUAL_LEAVE', 'OFF', 'PUBLIC_HOLIDAY', 'WORK_FROM_HOME'].includes(reportGeneratedException.type)) {
                    // Status handled in status section, ensure minutes remain 0
                    dayLateMinutes = 0;
                    dayEarlyMinutes = 0;
                } else {
                    // Read late_minutes, early_checkout_minutes, other_minutes directly from the reportGeneratedException record
                    dayLateMinutes = reportGeneratedException.late_minutes || 0;
                    dayEarlyMinutes = reportGeneratedException.early_checkout_minutes || 0;
                    if (reportGeneratedException.other_minutes > 0) {
                        currentOtherMinutes = reportGeneratedException.other_minutes;
                    }
                    isLateOverridden = true;
                    isEarlyOverridden = true;
                }
                // Skip punch-based calculation for this day as report-generated values are applied directly
            } else {
                // If no reportGeneratedException exists: Run punch-based calculation if shift and punchMatches exist and shouldSkipTimeCalc is false
                const shouldSkipTimeCalc = (dateException && [
                    'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'OFF', 'PUBLIC_HOLIDAY', 'WORK_FROM_HOME'
                ].includes(dateException.type));

                if (!shouldSkipTimeCalc && shift && punchMatches.length > 0) {
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        const punchTime = match.punch.time;
                        const shiftTime = match.shiftTime;

                        if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                            if (punchTime > shiftTime) {
                                const minutes = Math.abs(Math.round((punchTime - shiftTime) / (1000 * 60)));
                                dayLateMinutes += minutes;
                            }
                        }

                        if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                            if (punchTime < shiftTime) {
                                const minutes = Math.abs(Math.round((shiftTime - punchTime) / (1000 * 60)));
                                dayEarlyMinutes += minutes;
                            }
                        }
                    }
                }
            }

            // Step 3: After both branches apply ALLOWED_MINUTES reduction independently
            // Find ALLOWED_MINUTES exception for this day (mirrors runAnalysis logic)
            let allowedMinutesForDay = 0;
            const amEx = matchingExceptions.find(ex => ex.type === 'ALLOWED_MINUTES' && ex.approval_status === 'approved_dept_head');
            if (amEx && dayPunches.length > 0) {
                allowedMinutesForDay = amEx.allowed_minutes || 0;
            }
            const rawDayMinutes = dayLateMinutes + dayEarlyMinutes;
            if (allowedMinutesForDay > 0 && rawDayMinutes > 0) {
                const remaining = Math.max(0, rawDayMinutes - allowedMinutesForDay);
                const lateRatio = dayLateMinutes / (rawDayMinutes || 1);
                const earlyRatio = dayEarlyMinutes / (rawDayMinutes || 1);
                dayLateMinutes = Math.round(remaining * lateRatio);
                dayEarlyMinutes = Math.round(remaining * earlyRatio);
            }

            // Step 4: Handle MANUAL_OTHER_MINUTES where created_from_report is false or null by scanning matchingExceptions and adding their allowed_minutes
            const manualOtherNonReportEx = matchingExceptions.filter(ex => 
                ex.type === 'MANUAL_OTHER_MINUTES' && (ex.created_from_report === false || ex.created_from_report === null)
            );
            for (const moEx of manualOtherNonReportEx) {
                const moMinutes = moEx.allowed_minutes || 0;
                if (moMinutes > 0) {
                    currentOtherMinutes += moMinutes;
                }
            }

            // Step 5: Formatting phase: Build info strings for UI display
            lateMinutesTotal = dayLateMinutes;
            if (dayLateMinutes > 0) {
                const source = isLateOverridden ? '(from exception)' : (allowedMinutesForDay > 0 ? `(after ${allowedMinutesForDay} allowed)` : '');
                lateInfo = `${dayLateMinutes} min ${source}`.trim();
            } else {
                lateInfo = '-';
            }

            if (dayEarlyMinutes > 0) {
                const source = isEarlyOverridden ? '(from exception)' : (allowedMinutesForDay > 0 ? `(after ${allowedMinutesForDay} allowed)` : '');
                earlyCheckoutInfo = `${dayEarlyMinutes} min ${source}`.trim();
            } else {
                earlyCheckoutInfo = '-';
            }

            // Determine status
            let status = 'Absent';
            // Check for SKIP_PUNCH exception (only for working employees)
            const skipPunchEx = matchingExceptions.find(ex => ex.type === 'SKIP_PUNCH');
            const isLeaveOrHoliday = dateException && [
                'SICK_LEAVE', 'ANNUAL_LEAVE', 'PUBLIC_HOLIDAY', 'OFF'
            ].includes(dateException.type);
            const hasActiveSkipPunch = skipPunchEx && !isLeaveOrHoliday && skipPunchEx.punch_to_skip;
            
            if (dateException) {
                if (dateException.type === 'OFF') status = 'Off';
                else if (dateException.type === 'PUBLIC_HOLIDAY') status = 'Public Holiday';
                else if (dateException.type === 'MANUAL_PRESENT') status = 'Present (Manual)';
                else if (dateException.type === 'MANUAL_ABSENT') status = 'Absent (Manual)';
                else if (dateException.type === 'SHIFT_OVERRIDE') status = dayPunches.length > 0 ? 'Present' : 'Absent';
                else if (dateException.type === 'SICK_LEAVE') status = 'Sick Leave';
                else if (dateException.type === 'ANNUAL_LEAVE') status = dayPunches.length > 0 ? 'Present' : 'Annual Leave';
                else if (dateException.type === 'WORK_FROM_HOME') status = 'Work From Home';
                else if (dateException.type === 'MANUAL_LATE' || dateException.type === 'MANUAL_EARLY_CHECKOUT') {
                    status = dayPunches.length > 0 ? 'Present' : 'Present (Manual)';
                } else if (dayPunches.length > 0) {
                    status = 'Present';
                }
            } else if (dayPunches.length > 0) {
                // PUNCH COMPLETENESS STATUS (FRONTEND)
                if (isSingleShift) {
                    status = dayPunches.length >= 2 ? 'Present' : 'Half Day';
                } else {
                    // Split shift: 1-2 = Half, 3-4 = Present
                    status = dayPunches.length >= 3 ? 'Present' : 'Half Day';
                }
            }
            
            // SKIP_PUNCH status override: if skip applied and would have been absent
            if (hasActiveSkipPunch) {
                if (dayPunches.length === 0 && skipPunchEx.punch_to_skip === 'FULL_SKIP') {
                    status = 'Present (Skip Punch)';
                } else if (status === 'Absent') {
                    status = 'Present (Skip Punch)';
                }
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
                        
                        let overLate = 0;
                        let overEarly = 0;

                        for (const match of punchMatches) {
                            if (!match.matchedTo) continue;
                            const punchTime = match.punch.time;
                            const shiftTime = match.shiftTime;
                            if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                                if (punchTime > shiftTime) {
                                    const minutes = Math.abs(Math.round((punchTime - shiftTime) / (1000 * 60)));
                                    overLate += minutes;
                                    const label = match.matchedTo === 'AM_START' ? 'AM' : 'PM';
                                    if (lateInfo) lateInfo += ' | ';
                                    lateInfo += `${label}: ${minutes} min late`;
                                }
                            }
                            if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                                if (punchTime < shiftTime) {
                                    const minutes = Math.abs(Math.round((shiftTime - punchTime) / (1000 * 60)));
                                    overEarly += minutes;
                                    if (earlyCheckoutInfo && earlyCheckoutInfo !== '-') {
                                        earlyCheckoutInfo = `${parseInt(earlyCheckoutInfo) + minutes} min`;
                                    } else {
                                        earlyCheckoutInfo = `${minutes} min`;
                                    }
                                }
                            }
                        }
                        lateMinutesTotal = overLate;
                    }
                }
                if (dayOverride.type === 'MANUAL_PRESENT') status = 'Present (Edited)';
                else if (dayOverride.type === 'MANUAL_ABSENT') status = 'Absent (Edited)';
                else if (dayOverride.type === 'OFF') status = 'Off (Edited)';
                else if (dayOverride.type === 'SICK_LEAVE') status = 'Sick Leave (Admin)';
                else if (dayOverride.type === 'WORK_FROM_HOME') status = 'Work From Home (Edited)';

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

            // Apply exception minutes (MANUAL_LATE / MANUAL_EARLY_CHECKOUT that are NOT report-generated)
            const manualLateEx = matchingExceptions.find(ex => ex.type === 'MANUAL_LATE' && !ex.created_from_report);
            const manualEarlyEx = matchingExceptions.find(ex => ex.type === 'MANUAL_EARLY_CHECKOUT' && !ex.created_from_report);
            const exceptionLateMinutes = manualLateEx?.late_minutes || 0;
            const exceptionEarlyMinutes = manualEarlyEx?.early_checkout_minutes || 0;
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
                status: lopAdjacentDates.has(dateStr) ? `${status} (LOP)` : status,
                abnormal: isAbnormal,
                isCriticalAbnormal,
                lateInfo: lateInfo || '-',
                lateMinutesTotal: Math.max(0, lateMinutesTotal || 0),
                earlyCheckoutInfo: earlyCheckoutInfo || '-',
                otherMinutes: Math.max(0, currentOtherMinutes),
                hasOverride: !!dayOverride,
                partialDayReason: null,
                punchMatches,
                hasUnmatchedPunch,
                hasFarExtendedMatch,
                isLopAdjacent: lopAdjacentDates.has(dateStr)
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
            const time = parseTime(p.timestamp_raw);
            if (!time) return null;
            // If punch is from next day (midnight crossover), add 24h
            const isNextDay = nextDateStr && p.punch_date === nextDateStr;
            const adjustedTime = isNextDay ? new Date(time.getTime() + 24 * 60 * 60 * 1000) : time;
            return { ...p, time: adjustedTime, _originalTime: time, _isNextDayPunch: isNextDay };
        }).filter(p => p).sort((a, b) => a.time - b.time);

        if (punchesWithTime.length === 0) return [];

        // Adjust PM_END if it's midnight (00:00)
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

            // Try 120 min window (Extended for Ramadan shifts)
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
                        
                        {!isFinalized && selectedDays.size >= 2 && (
                            <div className="flex items-center gap-2 mt-2 px-1">
                                <span className="text-xs text-slate-500">{selectedDays.size} days selected</span>
                                <Button size="sm" variant="outline"
                                    onClick={() => setShowBulkPanel(prev => !prev)}
                                    className="text-xs h-7">
                                    {showBulkPanel ? 'Cancel Bulk Edit' : 'Edit Selected'}
                                </Button>
                                <Button size="sm" variant="ghost"
                                    onClick={() => setSelectedDays(new Set())}
                                    className="text-xs h-7 text-slate-400">
                                    Clear
                                </Button>
                            </div>
                        )}

                        {showBulkPanel && !isFinalized && (
                            <div className="mt-3 p-3 border border-indigo-200 rounded-lg bg-indigo-50/50 space-y-3">
                                <p className="text-xs font-semibold text-indigo-700">Bulk Edit — {selectedDays.size} days</p>
                                
                                <div className="flex flex-wrap gap-3 items-end">
                                    <div className="space-y-1">
                                        <label className="text-xs text-slate-600">Status Override</label>
                                        <select value={bulkType} onChange={e => setBulkType(e.target.value)}
                                            className="text-xs border border-slate-300 rounded px-2 py-1 bg-white h-7">
                                            <option value="">— no change —</option>
                                            <option value="MANUAL_PRESENT">Present (Manual)</option>
                                            <option value="MANUAL_ABSENT">Absent (Manual)</option>
                                            <option value="SICK_LEAVE">Sick Leave</option>
                                            <option value="ANNUAL_LEAVE">Annual Leave</option>
                                            <option value="OFF">Off</option>
                                            <option value="WORK_FROM_HOME">Work From Home</option>
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <input type="checkbox" id="bulkAbnormal"
                                            checked={bulkAbnormal}
                                            onChange={e => setBulkAbnormal(e.target.checked)}
                                            className="rounded border-slate-300" />
                                        <label htmlFor="bulkAbnormal" className="text-xs text-slate-600">Mark Abnormal</label>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <input type="checkbox" id="bulkZeroEarly"
                                            checked={bulkZeroEarly}
                                            onChange={e => setBulkZeroEarly(e.target.checked)}
                                            className="rounded border-slate-300" />
                                        <label htmlFor="bulkZeroEarly" className="text-xs text-blue-700 font-medium">
                                            Zero out Early Minutes
                                        </label>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <input type="checkbox" id="bulkZeroLate"
                                            checked={bulkZeroLate}
                                            onChange={e => setBulkZeroLate(e.target.checked)}
                                            className="rounded border-slate-300" />
                                        <label htmlFor="bulkZeroLate" className="text-xs text-orange-700 font-medium">
                                            Zero out Late Minutes
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <input type="checkbox" id="bulkShiftEnabled"
                                            checked={bulkShiftOverride.enabled}
                                            onChange={e => setBulkShiftOverride(prev => ({ ...prev, enabled: e.target.checked }))}
                                            className="rounded border-slate-300" />
                                        <label htmlFor="bulkShiftEnabled" className="text-xs font-medium text-rose-600">
                                            Apply Shift Override (CAUTION — applies to ALL selected days)
                                        </label>
                                    </div>
                                    {bulkShiftOverride.enabled && (
                                        <div className="mt-2 pl-5 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id="bulkSingleShift"
                                                    checked={bulkShiftOverride.is_single_shift}
                                                    onCheckedChange={(checked) => setBulkShiftOverride(prev => ({
                                                        ...prev,
                                                        is_single_shift: checked === true,
                                                        pm_start: checked ? '' : prev.pm_start,
                                                        pm_end: checked ? '' : prev.pm_end
                                                    }))}
                                                />
                                                <label htmlFor="bulkSingleShift" className="text-xs text-slate-600 cursor-pointer">
                                                    Single shift (no break — punch in/out only)
                                                </label>
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <div className="space-y-0.5">
                                                    <label className="text-[10px] text-slate-500">
                                                        {bulkShiftOverride.is_single_shift ? 'Punch In' : 'AM Start'}
                                                    </label>
                                                    <TimePicker
                                                        value={bulkShiftOverride.am_start}
                                                        onChange={(v) => setBulkShiftOverride(prev => ({ ...prev, am_start: v }))}
                                                        placeholder="8:00 AM"
                                                        className="text-xs h-7 w-32"
                                                    />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <label className="text-[10px] text-slate-500">
                                                        {bulkShiftOverride.is_single_shift ? 'Punch Out' : 'AM End'}
                                                    </label>
                                                    <TimePicker
                                                        value={bulkShiftOverride.am_end}
                                                        onChange={(v) => setBulkShiftOverride(prev => ({ ...prev, am_end: v }))}
                                                        placeholder={bulkShiftOverride.is_single_shift ? '5:00 PM' : '1:00 PM'}
                                                        className="text-xs h-7 w-32"
                                                    />
                                                </div>
                                                {!bulkShiftOverride.is_single_shift && (
                                                    <>
                                                        <div className="space-y-0.5">
                                                            <label className="text-[10px] text-slate-500">PM Start</label>
                                                            <TimePicker
                                                                value={bulkShiftOverride.pm_start}
                                                                onChange={(v) => setBulkShiftOverride(prev => ({ ...prev, pm_start: v }))}
                                                                placeholder="2:00 PM"
                                                                className="text-xs h-7 w-32"
                                                            />
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            <label className="text-[10px] text-slate-500">PM End</label>
                                                            <TimePicker
                                                                value={bulkShiftOverride.pm_end}
                                                                onChange={(v) => setBulkShiftOverride(prev => ({ ...prev, pm_end: v }))}
                                                                placeholder="6:00 PM"
                                                                className="text-xs h-7 w-32"
                                                            />
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <Button
                                        size="sm"
                                        onClick={handleBulkApply}
                                        disabled={(!bulkType && !bulkAbnormal && !bulkShiftOverride.enabled && !bulkZeroEarly && !bulkZeroLate) || isBulkSaving}
                                        className="text-xs h-7 bg-indigo-600 hover:bg-indigo-700 text-white">
                                        {isBulkSaving
                                            ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Saving...</>
                                            : `Apply to ${selectedDays.size} days`}
                                    </Button>

                                </div>
                            </div>
                        )}

                    </DialogHeader>
                    <div className="mt-4">
                        {!dataReady ? (
                            <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Loading attendance data...</span>
                            </div>
                        ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8 px-2">
                                        {!isFinalized && (
                                            <input type="checkbox"
                                                className="rounded border-slate-300"
                                                checked={selectedDays.size > 0 && selectedDays.size === getDailyBreakdown.filter(d => d.status !== 'Weekly Off' && d.status !== 'Weekly Off (LOP)').length}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedDays(new Set(getDailyBreakdown.filter(d => d.status !== 'Weekly Off' && d.status !== 'Weekly Off (LOP)').map(d => d.dateStr)));
                                                    } else {
                                                        setSelectedDays(new Set());
                                                    }
                                                }}
                                            />
                                        )}
                                    </TableHead>
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
                                    <TableRow key={idx} className={`${(day.isLopAdjacent && project.company === 'Al Maraghi Motors') ? 'bg-rose-100 border-l-4 border-l-rose-500' : day.isCriticalAbnormal ? 'bg-red-50' : day.abnormal ? 'bg-amber-50' : ''} ${day.hasOverride && !day.isLopAdjacent ? 'border-l-4 border-l-indigo-400' : ''}`}>
                                        <TableCell className="w-8 px-2">
                                            {!isFinalized && day.status !== 'Weekly Off' && day.status !== 'Weekly Off (LOP)' && (
                                                <input type="checkbox"
                                                    className="rounded border-slate-300"
                                                    checked={selectedDays.has(day.dateStr)}
                                                    onChange={(e) => {
                                                        const next = new Set(selectedDays);
                                                        if (e.target.checked) next.add(day.dateStr);
                                                        else next.delete(day.dateStr);
                                                        setSelectedDays(next);
                                                    }}
                                                />
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">

                                            <div className="flex items-center gap-1.5">
                                                <span>{day.date}</span>
                                                {day.isLopAdjacent && project.company === 'Al Maraghi Motors' && (
                                                    <span className="px-1.5 py-0.5 bg-rose-600 text-white text-[9px] font-bold rounded uppercase tracking-wide">
                                                        Double Deduction
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
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
                                                                            {isNextDayPunch && ''}
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
                                                    ${day.isLopAdjacent ? 'bg-rose-600 text-white' : ''}
                                                    ${!day.isLopAdjacent && day.status.includes('Present') && !day.status.includes('Half') && !day.status.includes('Skip Punch') ? 'bg-green-100 text-green-700' : ''}
                                                    ${!day.isLopAdjacent && day.status.includes('Skip Punch') ? 'bg-cyan-100 text-cyan-700' : ''}
                                                    ${!day.isLopAdjacent && day.status.includes('Absent') ? 'bg-red-100 text-red-700' : ''}
                                                    ${!day.isLopAdjacent && day.status.includes('Half') ? 'bg-amber-100 text-amber-700' : ''}
                                                    ${!day.isLopAdjacent && (day.status.includes('Off') || day.status.includes('Public Holiday')) && !day.status.includes('LOP') ? 'bg-slate-100 text-slate-700' : ''}
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
                                            {!isFinalized && (
                                                <Button size="sm" variant="ghost" onClick={() => setEditingDay(day)}>
                                                    <Edit className="w-4 h-4 text-indigo-600" />
                                                </Button>
                                            )}
                                        </TableCell>

                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        )}
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