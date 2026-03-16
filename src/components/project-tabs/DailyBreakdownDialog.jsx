import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EditDayRecordDialog from './EditDayRecordDialog';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Midnight buffer: punches between 12:00 AM and 02:00 AM (120 min after midnight).
 * Extended to 2 hours for Ramadan night shifts crossover support.
 */
const MIDNIGHT_BUFFER_MINUTES = 120;

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
    project
}) {
    const [editingDay, setEditingDay] = useState(null);
    const queryClient = useQueryClient();
    const [isUpdatingShift, setIsUpdatingShift] = useState(false);
    
    // Check if company is Al Maraghi to enable seconds parsing
    const includeSeconds = project?.company?.includes('Al Maraghi');

    const parseTime = (timeStr, forceIncludeSeconds = false) => {
        try {
            if (!timeStr || timeStr === '—' || timeStr === '-') return null;

            const useSeconds = forceIncludeSeconds || includeSeconds;

            // HH:MM:SS AM/PM
            if (useSeconds) {
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

            // HH:MM AM/PM
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

            // 24h format
            timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                const date = new Date();
                date.setHours(hours, minutes, seconds, 0);
                return date;
            }

            // Timestamp format: 1/16/2026 8:37
            const dateTimeMatch = timeStr.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (dateTimeMatch) {
                const hours = parseInt(dateTimeMatch[1]);
                const minutes = parseInt(dateTimeMatch[2]);
                const seconds = dateTimeMatch[3] ? parseInt(dateTimeMatch[3]) : 0;
                const date = new Date();
                date.setHours(hours, minutes, seconds, 0);
                return date;
            }

            return null;
        } catch {
            return null;
        }
    };

    const formatTime = (timeStr) => {
        if (!timeStr || timeStr === '—' || timeStr.trim() === '') return '—';
        if (/AM|PM/i.test(timeStr)) return timeStr;

        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return '—';

        let hours = parseInt(match[1]);
        const minutes = match[2];

        const period = hours >= 12 ? 'PM' : 'AM';
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;

        return `${hours}:${minutes} ${period}`;
    };

    const isWithinMidnightBuffer = (timestampRaw) => {
        const parsed = parseTime(timestampRaw);
        if (!parsed) return false;
        const minutesSinceMidnight = parsed.getHours() * 60 + parsed.getMinutes();
        return minutesSinceMidnight <= MIDNIGHT_BUFFER_MINUTES;
    };

    const matchPunchesToShiftPoints = (dayPunches, shift, nextDateStr = null) => {
        if (!shift || dayPunches.length === 0) return [];

        const punchesWithTime = dayPunches.map(p => {
            const time = parseTime(p.timestamp_raw);
            if (!time) return null;
            const isNextDay = nextDateStr && (p.punch_date === nextDateStr || p._isNextDayPunch);
            const adjustedTime = isNextDay ? new Date(time.getTime() + 24 * 60 * 60 * 1000) : time;
            return { ...p, time: adjustedTime, _isNextDayPunch: !!isNextDay };
        }).filter(p => p).sort((a, b) => a.time.getTime() - b.time.getTime());

        if (punchesWithTime.length === 0) return [];

        const pmEndTime = parseTime(shift.pm_end);
        let adjustedPmEnd = pmEndTime;
        if (pmEndTime && pmEndTime.getHours() === 0 && pmEndTime.getMinutes() === 0) {
            adjustedPmEnd = new Date(pmEndTime.getTime() + 24 * 60 * 60 * 1000);
        }

        const shiftPoints = [
            { type: 'AM_START', time: parseTime(shift.am_start), label: shift.am_start || '' },
            { type: 'AM_END', time: parseTime(shift.am_end), label: shift.am_end || '' },
            { type: 'PM_START', time: parseTime(shift.pm_start), label: shift.pm_start || '' },
            { type: 'PM_END', time: adjustedPmEnd, label: shift.pm_end || '' }
        ].filter(sp => sp.time);

        const matches = [];
        const usedShiftPoints = new Set();

        for (const punch of punchesWithTime) {
            let closestMatch = null;
            let minDistance = Infinity;
            let isExtendedMatch = false;
            let isFarExtendedMatch = false;

            for (const sp of shiftPoints) {
                if (usedShiftPoints.has(sp.type)) continue;
                const distance = Math.abs(punch.time.getTime() - sp.time.getTime()) / (1000 * 60);
                if (distance <= 60 && distance < minDistance) {
                    minDistance = distance; closestMatch = sp;
                }
            }
            if (!closestMatch) {
                for (const sp of shiftPoints) {
                    if (usedShiftPoints.has(sp.type)) continue;
                    const distance = Math.abs(punch.time.getTime() - sp.time.getTime()) / (1000 * 60);
                    if (distance <= 120 && distance < minDistance) {
                        minDistance = distance; closestMatch = sp; isExtendedMatch = true;
                    }
                }
            }
            if (!closestMatch) {
                for (const sp of shiftPoints) {
                    if (usedShiftPoints.has(sp.type)) continue;
                    const distance = Math.abs(punch.time.getTime() - sp.time.getTime()) / (1000 * 60);
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
    };

    const detectPartialDay = (dayPunches, shift) => {
        if (!shift || dayPunches.length < 2) return { isPartial: false, reason: null };
        const pts = dayPunches.map(p => ({ ...p, time: parseTime(p.timestamp_raw) })).filter(p => p.time).sort((a, b) => a.time.getTime() - b.time.getTime());
        if (pts.length < 2) return { isPartial: false, reason: null };
        const amStart = parseTime(shift.am_start), amEnd = parseTime(shift.am_end), pmStart = parseTime(shift.pm_start);
        let pmEnd = parseTime(shift.pm_end);
        if (!amStart || !pmEnd) return { isPartial: false, reason: null };
        if (pmEnd.getHours() === 0 && pmEnd.getMinutes() === 0) pmEnd = new Date(pmEnd.getTime() + 86400000);
        const mid = amEnd && pmStart && String(shift.am_end || '').trim() !== '' && String(shift.pm_start || '').trim() !== '' && shift.am_end !== '—' && shift.pm_start !== '—';
        const expected = !mid ? (pmEnd.getTime() - amStart.getTime()) / 60000 : ((amEnd.getTime() - amStart.getTime()) / 60000 + (pmEnd.getTime() - pmStart.getTime()) / 60000);
        const actual = (pts[pts.length - 1].time.getTime() - pts[0].time.getTime()) / 60000;
        if (expected > 0 && actual < expected * 0.5 && actual > 0) return { isPartial: true, reason: `Worked ${Math.round(actual)} min (expected ${Math.round(expected)} min)` };
        return { isPartial: false, reason: null };
    };

    const filterMultiplePunches = (punchList) => {
        if (punchList.length <= 1) return punchList;
        const punchesWithTime = punchList.map(p => ({ ...p, time: parseTime(p.timestamp_raw) })).filter(p => p.time);
        if (punchesWithTime.length === 0) return punchList;
        const deduped = [];
        for (let i = 0; i < punchesWithTime.length; i++) {
            const current = punchesWithTime[i];
            const isDuplicate = deduped.some(p => Math.abs(current.time.getTime() - p.time.getTime()) / (1000 * 60) < 10);
            if (!isDuplicate) deduped.push(current);
        }
        return deduped.sort((a, b) => a.time.getTime() - b.time.getTime());
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    };

    const extractTime = (ts) => {
        if (includeSeconds) {
            const m = ts.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/i);
            if (m) return m[1];
        }
        const m = ts.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        if (m) return m[1];
        return ts;
    };

    const updateAnalysisResult = useMutation({
        mutationFn: (updates) => base44.entities.AnalysisResult.update(selectedEmployee.id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries(['results']);
            toast.success('Shift override saved locally');
        }
    });

    const handleShiftChange = async (dateStr, selectedShiftId) => {
        setIsUpdatingShift(true);
        try {
            const newShift = shifts.find(s => s.id === selectedShiftId);
            if (!newShift) return;

            let dayOverrides = {};
            try {
                if (selectedEmployee.day_overrides) dayOverrides = JSON.parse(selectedEmployee.day_overrides);
            } catch (e) { }

            dayOverrides[dateStr] = {
                ...(dayOverrides[dateStr] || {}),
                shiftOverride: {
                    am_start: newShift.am_start,
                    am_end: newShift.am_end || '',
                    pm_start: newShift.pm_start || '',
                    pm_end: newShift.pm_end
                },
                // Explicitly set is_ramadan_day to false when a shift is overridden to Normal
                is_ramadan_day: false
            };

            await updateAnalysisResult.mutateAsync({
                day_overrides: JSON.stringify(dayOverrides)
            });
        } catch (error) {
            toast.error('Failed to update shift');
        } finally {
            setIsUpdatingShift(false);
        }
    };

    const getDailyBreakdown = useMemo(() => {
        if (!selectedEmployee) return [];

        const currentResult = enrichedResults.find(r => r.id === selectedEmployee.id) || selectedEmployee;
        const breakdown = [];
        const startDate = new Date(reportRun.date_from);
        const endDate = new Date(reportRun.date_to);

        let dayOverrides = {};
        try { if (currentResult.day_overrides) dayOverrides = JSON.parse(currentResult.day_overrides); } catch (e) { }

        const attendanceIdStr = String(currentResult.attendance_id);
        const dayBefore = new Date(startDate); dayBefore.setDate(dayBefore.getDate() - 1);
        const dayAfter = new Date(endDate); dayAfter.setDate(dayAfter.getDate() + 1);
        
        const empPunches = punches.filter(p => 
            String(p.attendance_id) === attendanceIdStr && 
            p.punch_date >= dayBefore.toISOString().split('T')[0] && 
            p.punch_date <= dayAfter.toISOString().split('T')[0]
        );
        const empShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
        const empExceptions = exceptions.filter(e => (e.attendance_id === 'ALL' || String(e.attendance_id) === attendanceIdStr));
        const employee = employees.find(e => String(e.attendance_id) === attendanceIdStr);

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDate = new Date(d);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();
            const nextDateStr = new Date(d.getTime() + 86400000).toISOString().split('T')[0];
            const prevDateStr = new Date(d.getTime() - 86400000).toISOString().split('T')[0];

            let shift = empShifts.find(s => s.date === dateStr);
            if (!shift) {
                shift = empShifts.find(s => !s.date && s.applicable_days?.includes(dayNames[dayOfWeek]));
                if (!shift) shift = empShifts.find(s => !s.date && !s.is_friday_shift);
            }

            const override = dayOverrides[dateStr];
            if (override?.shiftOverride) {
                shift = { ...shift, ...override.shiftOverride };
            }

            // Detect SKIP_PUNCH exception for this date
            const matchingExcsForDate = empExceptions.filter(ex => {
                try {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    return currentDate >= exFrom && currentDate <= exTo;
                } catch { return false; }
            });
            const skipPunchEx = matchingExcsForDate.find(ex => ex.type === 'SKIP_PUNCH');
            const dayException = matchingExcsForDate.find(ex => ex.type !== 'SKIP_PUNCH') || null;
            const isOnLeave = dayException && (dayException.type === 'SICK_LEAVE' || dayException.type === 'ANNUAL_LEAVE');
            const skipPunchType = skipPunchEx?.punch_to_skip || null; // 'AM_PUNCH_IN' | 'PM_PUNCH_OUT' | null
            const hasActiveSkip = !!(skipPunchEx && !isOnLeave);
            const isAmSkip = hasActiveSkip && (skipPunchType === 'AM_PUNCH_IN' || !skipPunchType);
            const isPmSkip = hasActiveSkip && (skipPunchType === 'PM_PUNCH_OUT' || !skipPunchType);

            let dayPunches = empPunches.filter(p => p.punch_date === dateStr);
            const shiftEndsMidnight = shift && (parseTime(shift.pm_end)?.getHours() === 0 || parseTime(shift.pm_end)?.getHours() === 23);
            
            if (shiftEndsMidnight) {
                const crossover = empPunches.filter(p => p.punch_date === nextDateStr && isWithinMidnightBuffer(p.timestamp_raw));
                dayPunches = [...dayPunches, ...crossover.map(p => ({ ...p, _isNextDayPunch: true }))];
            }

            const dedupedPunches = filterMultiplePunches(dayPunches);
            const punchMatches = matchPunchesToShiftPoints(dedupedPunches, shift, nextDateStr);
            
            let lateMins = 0;
            let earlyMins = 0;
            punchMatches.forEach(m => {
                if (m.matchedTo && m.shiftTime) {
                    const diff = (m.punch.time.getTime() - m.shiftTime.getTime()) / 60000;
                    if ((m.matchedTo === 'AM_START' || m.matchedTo === 'PM_START') && diff > 0) lateMins += Math.round(diff);
                    if ((m.matchedTo === 'AM_END' || m.matchedTo === 'PM_END') && diff < 0) earlyMins += Math.round(Math.abs(diff));
                }
            });

            // SKIP_PUNCH zeroing: mirror the backend logic exactly
            if (isAmSkip) lateMins = 0;
            if (isPmSkip) earlyMins = 0;

            if (override?.lateMinutes !== undefined) lateMins = override.lateMinutes;
            if (override?.earlyCheckoutMinutes !== undefined) earlyMins = override.earlyCheckoutMinutes;

            // Determine daily status
            let dayStatus;
            if (override?.type) {
                dayStatus = override.type;
            } else if (hasActiveSkip && dayPunches.length === 0) {
                // 0-punch + active skip = Present (Skip Punch), NOT Absent
                dayStatus = 'Present (Skip Punch)';
            } else if (dayPunches.length > 0) {
                dayStatus = detectPartialDay(dedupedPunches, shift).isPartial ? 'Half Day' : 'Present';
            } else {
                dayStatus = 'Absent';
            }

            breakdown.push({
                date: formatDate(dateStr),
                dateStr,
                punches: dayPunches.length,
                punchMatches,
                shift: shift ? `${shift.am_start} - ${shift.pm_end}` : 'No Shift',
                status: dayStatus,
                lateMinutesTotal: lateMins,
                earlyCheckoutInfo: earlyMins > 0 ? `${earlyMins}` : '0',
                otherMinutes: override?.otherMinutes || 0,
                abnormal: override?.isAbnormal || punchMatches.some(m => !m.matchedTo),
                shiftObject: shift,
                hasOverride: !!override,
                isManual: !!override?.is_manual_minutes,
                isSkipPunch: hasActiveSkip,
                skipPunchType
            });
        }
        return breakdown;
    }, [selectedEmployee, enrichedResults, punches, shifts, exceptions, employees, reportRun, project]);

    const handleMinutesChange = async (day, field, value) => {
        const newValue = parseInt(value) || 0;
        const currentVal = field === 'lateMinutes' ? day.lateMinutesTotal : 
                          field === 'earlyCheckoutMinutes' ? parseInt(day.earlyCheckoutInfo) || 0 : 
                          day.otherMinutes;
        
        if (newValue === currentVal) return;

        try {
            let dayOverrides = {};
            try {
                if (selectedEmployee.day_overrides) dayOverrides = JSON.parse(selectedEmployee.day_overrides);
            } catch (e) { }

            const existing = dayOverrides[day.dateStr] || {};
            dayOverrides[day.dateStr] = {
                ...existing,
                [field]: newValue,
                is_manual_minutes: true,
                is_ramadan_day: false,
                // Preserve original values if not already present
                originalLateMinutes: existing.originalLateMinutes ?? (field === 'lateMinutes' ? day.lateMinutesTotal : (existing.lateMinutes ?? day.lateMinutesTotal)),
                originalEarlyCheckout: existing.originalEarlyCheckout ?? (field === 'earlyCheckoutMinutes' ? (parseInt(day.earlyCheckoutInfo) || 0) : (existing.earlyCheckoutMinutes ?? (parseInt(day.earlyCheckoutInfo) || 0))),
                originalOtherMinutes: existing.originalOtherMinutes ?? (field === 'otherMinutes' ? day.otherMinutes : (existing.otherMinutes ?? day.otherMinutes))
            };

            // Calculate new totals for the whole result
            const latest = enrichedResults.find(r => r.id === selectedEmployee.id) || selectedEmployee;
            
            // We need to recalculate the totals similar to EditDayRecordDialog
            const recalculateTotals = (result, overrides) => {
                let late = result.late_minutes || 0, early = result.early_checkout_minutes || 0, other = result.other_minutes || 0;
                const abnormal = new Set((result.abnormal_dates || '').split(',').filter(Boolean));
                
                Object.entries(overrides).forEach(([date, ov]) => {
                    if (ov) {
                        late = late - (ov.originalLateMinutes || 0) + (ov.lateMinutes || 0);
                        early = early - (ov.originalEarlyCheckout || 0) + (ov.earlyCheckoutMinutes || 0);
                        other = other - (ov.originalOtherMinutes || 0) + (ov.otherMinutes || 0);
                        if (ov.isAbnormal) abnormal.add(date); else abnormal.delete(date);
                    }
                });
                const totalGrace = result.grace_minutes || 0;
                const baseAfterGrace = Math.max(0, (late + early) - totalGrace);
                const deductible = Math.max(0, baseAfterGrace - (result.approved_minutes || 0));
                return { late, early, other, deductible, abnormal: Array.from(abnormal).join(',') };
            };

            const totals = recalculateTotals(latest, dayOverrides);

            await updateAnalysisResult.mutateAsync({
                day_overrides: JSON.stringify(dayOverrides),
                late_minutes: totals.late,
                early_checkout_minutes: totals.early,
                other_minutes: totals.other,
                deductible_minutes: totals.deductible,
                abnormal_dates: totals.abnormal
            });
        } catch (error) {
            toast.error('Failed to update minutes');
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Daily Breakdown: {selectedEmployee?.name}</DialogTitle>
                    </DialogHeader>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Punches</TableHead>
                                <TableHead>Shifts</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-[80px]">Late</TableHead>
                                <TableHead className="w-[80px]">Early</TableHead>
                                <TableHead className="w-[80px]">Other</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {getDailyBreakdown.map((day, idx) => (
                                <TableRow key={idx} className={day.abnormal ? 'bg-amber-50' : ''}>
                                    <TableCell>{day.date}</TableCell>
                                    <TableCell>
                                        <div className="text-xs">
                                            {day.punchMatches.map((m, i) => (
                                                <div key={i} className={!m.matchedTo ? 'text-red-500 font-bold' : ''}>
                                                    {extractTime(m.punch.timestamp_raw)} {m.matchedTo ? `→ ${m.matchedTo}` : '🔴'}
                                                </div>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Select 
                                            value={shifts.find(s => s.am_start === day.shiftObject?.am_start && s.pm_end === day.shiftObject?.pm_end)?.id || 'current'}
                                            onValueChange={(val) => handleShiftChange(day.dateStr, val)}
                                            disabled={isUpdatingShift}
                                        >
                                            <SelectTrigger className="h-8 text-[10px]">
                                                <SelectValue placeholder={day.shift} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="current" disabled>{day.shift}</SelectItem>
                                                {shifts.filter(s => String(s.attendance_id) === String(selectedEmployee?.attendance_id)).map(s => (
                                                    <SelectItem key={s.id} value={s.id}>{s.am_start} - {s.pm_end}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs">{day.status}</span>
                                            {day.isSkipPunch && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-medium bg-cyan-100 text-cyan-800 border border-cyan-200">
                                                    ⏭ Skip Punch
                                                </span>
                                            )}
                                            {day.isManual && !day.isSkipPunch && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-medium bg-blue-100 text-blue-800">
                                                    Edited
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <input
                                                type="number"
                                                defaultValue={day.lateMinutesTotal}
                                                onBlur={(e) => handleMinutesChange(day, 'lateMinutes', e.target.value)}
                                                className={`w-full h-7 px-1 text-[10px] border rounded focus:ring-1 focus:ring-blue-500 outline-none ${day.isManual ? 'text-blue-600 font-medium' : ''} ${day.isSkipPunch && day.lateMinutesTotal === 0 ? 'bg-cyan-50' : ''}`}
                                            />
                                            <span className="text-[8px] text-muted-foreground ml-1">min</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <input
                                                type="number"
                                                defaultValue={parseInt(day.earlyCheckoutInfo) || 0}
                                                onBlur={(e) => handleMinutesChange(day, 'earlyCheckoutMinutes', e.target.value)}
                                                className={`w-full h-7 px-1 text-[10px] border rounded focus:ring-1 focus:ring-blue-500 outline-none ${day.isManual ? 'text-blue-600 font-medium' : ''} ${day.isSkipPunch && parseInt(day.earlyCheckoutInfo) === 0 ? 'bg-cyan-50' : ''}`}
                                            />
                                            <span className="text-[8px] text-muted-foreground ml-1">min</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <input
                                                type="number"
                                                defaultValue={day.otherMinutes}
                                                onBlur={(e) => handleMinutesChange(day, 'otherMinutes', e.target.value)}
                                                className={`w-full h-7 px-1 text-[10px] border rounded focus:ring-1 focus:ring-blue-500 outline-none ${day.isManual ? 'text-blue-600 font-medium' : ''}`}
                                            />
                                            <span className="text-[8px] text-muted-foreground ml-1">min</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => setEditingDay(day)}>
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </DialogContent>
            </Dialog>

            <EditDayRecordDialog
                open={!!editingDay}
                onClose={() => setEditingDay(null)}
                onSave={() => queryClient.invalidateQueries(['results'])}
                dayRecord={editingDay}
                project={project}
                attendanceId={selectedEmployee?.attendance_id}
                analysisResult={selectedEmployee}
                dailyBreakdownData={{
                    [selectedEmployee?.attendance_id]: {
                        daily_details: getDailyBreakdown.reduce((acc, day) => ({
                            ...acc,
                            [day.dateStr]: { punches: day.punchMatches.map(m => m.punch) }
                        }), {})
                    }
                }}
            />
        </>
    );
}