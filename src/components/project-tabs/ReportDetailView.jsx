import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Search, Eye, Edit, Save } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import EditDayRecordDialog from './EditDayRecordDialog';

export default function ReportDetailView({ reportRun, project }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [editingDay, setEditingDay] = useState(null);
    const [editingGraceMinutes, setEditingGraceMinutes] = useState(null);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [verifiedEmployees, setVerifiedEmployees] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
    const queryClient = useQueryClient();

    const { data: results = [] } = useQuery({
        queryKey: ['results', reportRun.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ report_run_id: reportRun.id })
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });

    // Load verified employees from report
    React.useEffect(() => {
        if (reportRun.verified_employees) {
            setVerifiedEmployees(reportRun.verified_employees.split(',').filter(Boolean));
        }
    }, [reportRun]);

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

    const parseTime = (timeStr) => {
        try {
            if (!timeStr || timeStr === '—') return null;

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

            timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);

                const date = new Date();
                date.setHours(hours, minutes, 0, 0);
                return date;
            }

            return null;
        } catch {
            return null;
        }
    };

    const matchPunchesToShiftPoints = (dayPunches, shift) => {
        if (!shift || dayPunches.length === 0) return [];
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time).sort((a, b) => a.time - b.time);
        
        if (punchesWithTime.length === 0) return [];
        
        const shiftPoints = [
            { type: 'AM_START', time: parseTime(shift.am_start), label: shift.am_start },
            { type: 'AM_END', time: parseTime(shift.am_end), label: shift.am_end },
            { type: 'PM_START', time: parseTime(shift.pm_start), label: shift.pm_start },
            { type: 'PM_END', time: parseTime(shift.pm_end), label: shift.pm_end }
        ].filter(sp => sp.time);
        
        const matches = [];
        const usedShiftPoints = new Set();
        
        for (const punch of punchesWithTime) {
            let closestMatch = null;
            let minDistance = Infinity;
            let isExtendedMatch = false;
            
            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;
                
                const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                
                if (distance <= 60 && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                }
            }
            
            if (!closestMatch) {
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    
                    const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                    
                    if (distance <= 120 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                        isExtendedMatch = true;
                    }
                }
            }
            
            if (closestMatch) {
                matches.push({
                    punch,
                    matchedTo: closestMatch.type,
                    shiftTime: closestMatch.time,
                    distance: minDistance,
                    isExtendedMatch
                });
                usedShiftPoints.add(closestMatch.type);
            } else {
                matches.push({
                    punch,
                    matchedTo: null,
                    shiftTime: null,
                    distance: null,
                    isExtendedMatch: false
                });
            }
        }
        
        return matches;
    };

    const detectPartialDay = (dayPunches, shift) => {
        if (!shift || dayPunches.length < 2) return { isPartial: false, reason: null };
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time).sort((a, b) => a.time - b.time);
        
        if (punchesWithTime.length < 2) return { isPartial: false, reason: null };
        
        const firstPunch = punchesWithTime[0].time;
        const lastPunch = punchesWithTime[punchesWithTime.length - 1].time;
        
        const amStart = parseTime(shift.am_start);
        const pmEnd = parseTime(shift.pm_end);
        
        if (!amStart || !pmEnd) return { isPartial: false, reason: null };
        
        const expectedMinutes = (pmEnd - amStart) / (1000 * 60);
        const actualMinutes = (lastPunch - firstPunch) / (1000 * 60);
        
        if (actualMinutes < expectedMinutes * 0.5 && actualMinutes > 0) {
            return { 
                isPartial: true, 
                reason: `Worked ${Math.round(actualMinutes)} min (expected ${Math.round(expectedMinutes)} min)` 
            };
        }
        
        return { isPartial: false, reason: null };
    };

    const filterMultiplePunches = (punchList, shift) => {
        if (punchList.length <= 1) return punchList;

        const punchesWithTime = punchList.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time);

        if (punchesWithTime.length === 0) return punchList;

        const deduped = [];
        for (let i = 0; i < punchesWithTime.length; i++) {
            const current = punchesWithTime[i];
            const isDuplicate = deduped.some(p => Math.abs(current.time - p.time) / (1000 * 60) < 10);
            if (!isDuplicate) {
                deduped.push(current);
            }
        }

        const sortedPunches = deduped.sort((a, b) => a.time - b.time);
        return sortedPunches.map(p => punchList.find(punch => punch.id === p.id)).filter(Boolean);
    };

    const calculateEmployeeTotals = (result, dateFrom, dateTo) => {
        const employeePunches = punches.filter(p => 
            p.attendance_id === result.attendance_id &&
            p.punch_date >= dateFrom && 
            p.punch_date <= dateTo
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === result.attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === result.attendance_id || e.attendance_id === 'ALL');

        const employee = employees.find(e => e.attendance_id === result.attendance_id);

        let dayOverrides = {};
        if (result.day_overrides) {
            try {
                dayOverrides = JSON.parse(result.day_overrides);
            } catch (e) {}
        }

        let totalLateMinutes = 0;
        let totalEarlyCheckout = 0;

        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);

        const dayNameToNumber = {
            'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
            'Thursday': 4, 'Friday': 5, 'Saturday': 6
        };

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
            
            if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                continue;
            }

            const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw);
                    const timeB = parseTime(b.timestamp_raw);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            const dateException = employeeExceptions.find(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo;
            });

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

            let shift = null;
            shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
            
            if (!shift) {
                if (dayOfWeek === 5) {
                    shift = employeeShifts.find(s => s.is_friday_shift && !s.date && isShiftEffective(s));
                    if (!shift) {
                        shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                    }
                } else {
                    shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                }
            }

            if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
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
            }

            const dayPunches = filterMultiplePunches(rawDayPunches, shift);
            const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                   shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                   shift.am_end !== '—' && shift.pm_start !== '—' &&
                                   shift.am_end !== '-' && shift.pm_start !== '-';
            const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;
            
            const partialDayResult = detectPartialDay(dayPunches, shift);

            const dayOverride = dayOverrides[dateStr];
            
            // If there's a manual override (no shift change), use those values directly and skip calculation
            if (dayOverride && !dayOverride.shiftOverride) {
                if (dayOverride.lateMinutes !== undefined) {
                    totalLateMinutes += dayOverride.lateMinutes;
                }
                if (dayOverride.earlyCheckoutMinutes !== undefined) {
                    totalEarlyCheckout += dayOverride.earlyCheckoutMinutes;
                }
                continue;
            }
            
            // If there's a shift override, apply it
            if (dayOverride?.shiftOverride) {
                shift = {
                    am_start: dayOverride.shiftOverride.am_start,
                    am_end: dayOverride.shiftOverride.am_end,
                    pm_start: dayOverride.shiftOverride.pm_start,
                    pm_end: dayOverride.shiftOverride.pm_end
                };
            }

            let punchMatchesTotals = [];
            if (shift && dayPunches.length > 0) {
                punchMatchesTotals = matchPunchesToShiftPoints(dayPunches, shift);
            }

            const shouldSkipTimeCalc = dateException && [
                'SICK_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
            ].includes(dateException.type);
            
            // Calculate times from punches (either with original or overridden shift)
            if (shift && punchMatchesTotals.length > 0 && !partialDayResult.isPartial && !shouldSkipTimeCalculation) {
                for (const match of punchMatchesTotals) {
                    if (!match.matchedTo) continue;
                    
                    const punchTime = match.punch.time;
                    const shiftTime = match.shiftTime;
                    
                    if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                        if (punchTime > shiftTime) {
                            const minutes = Math.round((punchTime - shiftTime) / (1000 * 60));
                            totalLateMinutes += minutes;
                        }
                    }
                    
                    if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                        if (punchTime < shiftTime) {
                            const minutes = Math.round((shiftTime - punchTime) / (1000 * 60));
                            totalEarlyCheckout += minutes;
                        }
                    }
                }
            }
        }

        return { totalLateMinutes, totalEarlyCheckout };
    };

    const enrichedResults = React.useMemo(() => {
        return results.map(result => {
            const employee = employees.find(e => e.attendance_id === result.attendance_id);
            const { totalLateMinutes, totalEarlyCheckout } = calculateEmployeeTotals(result, reportRun.date_from, reportRun.date_to);
            
            return {
                ...result,
                name: employee?.name || 'Unknown',
                late_minutes: Math.max(0, totalLateMinutes),
                early_checkout_minutes: Math.max(0, totalEarlyCheckout),
                isVerified: verifiedEmployees.includes(result.attendance_id)
            };
        });
    }, [results, employees, punches, shifts, exceptions, reportRun, verifiedEmployees]);

    const filteredResults = React.useMemo(() => {
        return enrichedResults
            .filter(result =>
                result.attendance_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                result.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                let aVal = a[sort.key];
                let bVal = b[sort.key];
                
                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                
                if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [enrichedResults, searchTerm, sort]);

    const updateVerificationMutation = useMutation({
        mutationFn: (verifiedList) => base44.entities.ReportRun.update(reportRun.id, {
            verified_employees: verifiedList.join(',')
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
        }
    });

    const toggleVerification = (attendanceId) => {
        const newVerified = verifiedEmployees.includes(attendanceId) 
            ? verifiedEmployees.filter(id => id !== attendanceId)
            : [...verifiedEmployees, attendanceId];
        
        setVerifiedEmployees(newVerified);
        updateVerificationMutation.mutate(newVerified);
    };

    const saveReportMutation = useMutation({
        mutationFn: async () => {
            setIsSaving(true);
            const exceptionsToCreate = [];
            
            for (const result of results) {
                if (!result.day_overrides) continue;
                
                let dayOverrides = {};
                try {
                    dayOverrides = JSON.parse(result.day_overrides);
                } catch (e) {
                    continue;
                }

                const datesByType = {};
                Object.entries(dayOverrides).forEach(([dateStr, override]) => {
                    const key = `${result.attendance_id}_${override.type}_${override.lateMinutes || 0}_${override.earlyCheckoutMinutes || 0}_${JSON.stringify(override.shiftOverride || {})}`;
                    if (!datesByType[key]) {
                        datesByType[key] = { dates: [], data: override, attendance_id: result.attendance_id };
                    }
                    datesByType[key].dates.push(dateStr);
                });

                for (const group of Object.values(datesByType)) {
                    const sortedDates = group.dates.sort();
                    
                    let currentRange = { start: sortedDates[0], end: sortedDates[0] };
                    const ranges = [];
                    
                    for (let i = 1; i < sortedDates.length; i++) {
                        const prevDate = new Date(sortedDates[i - 1]);
                        const currDate = new Date(sortedDates[i]);
                        const dayDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);
                        
                        if (dayDiff === 1) {
                            currentRange.end = sortedDates[i];
                        } else {
                            ranges.push({ ...currentRange });
                            currentRange = { start: sortedDates[i], end: sortedDates[i] };
                        }
                    }
                    ranges.push(currentRange);

                    for (const range of ranges) {
                        const exceptionData = {
                            project_id: project.id,
                            attendance_id: group.attendance_id,
                            date_from: range.start,
                            date_to: range.end,
                            type: group.data.type,
                            details: `Report edit: ${group.data.details || 'Manual adjustment from report'}`,
                            created_from_report: true,
                            report_run_id: reportRun.id,
                            use_in_analysis: true
                        };

                        if (group.data.lateMinutes && group.data.type === 'MANUAL_EARLY_CHECKOUT') {
                            exceptionData.early_checkout_minutes = group.data.lateMinutes + (group.data.earlyCheckoutMinutes || 0);
                        } else if (group.data.earlyCheckoutMinutes && group.data.type === 'MANUAL_EARLY_CHECKOUT') {
                            exceptionData.early_checkout_minutes = group.data.earlyCheckoutMinutes;
                        }

                        if (group.data.shiftOverride) {
                            exceptionData.type = 'SHIFT_OVERRIDE';
                            exceptionData.new_am_start = group.data.shiftOverride.am_start;
                            exceptionData.new_am_end = group.data.shiftOverride.am_end;
                            exceptionData.new_pm_start = group.data.shiftOverride.pm_start;
                            exceptionData.new_pm_end = group.data.shiftOverride.pm_end;
                        }

                        exceptionsToCreate.push(exceptionData);
                    }
                }
            }

            if (exceptionsToCreate.length > 0) {
                const batchSize = 20;
                for (let i = 0; i < exceptionsToCreate.length; i += batchSize) {
                    const batch = exceptionsToCreate.slice(i, i + batchSize);
                    await base44.entities.Exception.bulkCreate(batch);
                }
            }

            return exceptionsToCreate.length;
        },
        onSuccess: (exceptionCount) => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
            toast.success(`Report saved! ${exceptionCount} exception${exceptionCount !== 1 ? 's' : ''} created from edits.`);
            setIsSaving(false);
        },
        onError: (error) => {
            toast.error('Failed to save report: ' + error.message);
            setIsSaving(false);
        }
    });

    const exportToExcel = () => {
        if (filteredResults.length === 0) {
            toast.error('No data to export');
            return;
        }

        const headers = ['Attendance ID', 'Name', 'Working Days', 'Present Days', 'LOP Days', 'Sick Leave', 'Late Minutes', 'Early Checkout Minutes', 'Verified', 'Notes'];
        const rows = filteredResults.map(r => [
            r.attendance_id,
            r.name,
            r.working_days,
            r.present_days,
            r.full_absence_count,
            r.sick_leave_count || 0,
            r.late_minutes,
            r.early_checkout_minutes || 0,
            r.isVerified ? 'Yes' : 'No',
            r.notes || ''
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${reportRun.date_from}_to_${reportRun.date_to}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast.success('Report exported');
    };

    const showDailyBreakdown = (result) => {
        setSelectedEmployee(result);
        setShowBreakdown(true);
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const getDailyBreakdown = React.useMemo(() => {
        if (!selectedEmployee) return [];

        const currentResult = enrichedResults.find(r => r.id === selectedEmployee.id) || selectedEmployee;

        const breakdown = [];
        const startDate = new Date(reportRun.date_from);
        const endDate = new Date(reportRun.date_to);
        
        let dayOverrides = {};
        if (currentResult.day_overrides) {
            try {
                dayOverrides = JSON.parse(currentResult.day_overrides);
            } catch (e) {
                dayOverrides = {};
            }
        }
        
        const employeePunches = punches.filter(p => 
            p.attendance_id === currentResult.attendance_id &&
            p.punch_date >= reportRun.date_from && 
            p.punch_date <= reportRun.date_to
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === currentResult.attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === currentResult.attendance_id || e.attendance_id === 'ALL');

        const employee = employees.find(e => e.attendance_id === currentResult.attendance_id);

        const dayNameToNumber = {
            'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
            'Thursday': 4, 'Friday': 5, 'Saturday': 6
        };

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
            
            if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                continue;
            }

            const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw);
                    const timeB = parseTime(b.timestamp_raw);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            const dateException = employeeExceptions.find(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo;
            });

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

            let shift = null;
            shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
            
            if (!shift) {
                if (dayOfWeek === 5) {
                    shift = employeeShifts.find(s => s.is_friday_shift && !s.date && isShiftEffective(s));
                    if (!shift) {
                        shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                    }
                } else {
                    shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                }
            }

            if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
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
            }

            const dayPunches = filterMultiplePunches(rawDayPunches, shift);

            const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                   shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                   shift.am_end !== '—' && shift.pm_start !== '—' &&
                                   shift.am_end !== '-' && shift.pm_start !== '-';
            const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;
            
            const partialDayResult = detectPartialDay(dayPunches, shift);
            
            let punchMatches = [];
            let hasUnmatchedPunch = false;
            if (shift && dayPunches.length > 0) {
                punchMatches = matchPunchesToShiftPoints(dayPunches, shift);
                hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
            }

            let lateInfo = '';
            let lateMinutesTotal = 0;
            let earlyCheckoutInfo = '';
            
            const shouldSkipTimeCalc = dateException && [
                'SICK_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
            ].includes(dateException.type);

            if (shift && punchMatches.length > 0 && !shouldSkipTimeCalc) {
                for (const match of punchMatches) {
                    if (!match.matchedTo) continue;
                    
                    const punchTime = match.punch.time;
                    const shiftTime = match.shiftTime;
                    
                    if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                        if (punchTime > shiftTime) {
                            const minutes = Math.round((punchTime - shiftTime) / (1000 * 60));
                            lateMinutesTotal += minutes;
                            const label = match.matchedTo === 'AM_START' ? 'AM' : 'PM';
                            if (lateInfo) lateInfo += ' | ';
                            lateInfo += `${label}: ${minutes} min late`;
                        }
                    }
                    
                    if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                        if (punchTime < shiftTime) {
                            const minutes = Math.round((shiftTime - punchTime) / (1000 * 60));
                            if (earlyCheckoutInfo && earlyCheckoutInfo !== '-') {
                                earlyCheckoutInfo = `${parseInt(earlyCheckoutInfo) + minutes} min`;
                            } else {
                                earlyCheckoutInfo = `${minutes} min`;
                            }
                        }
                    }
                }
            }

            let status = 'Absent';
            if (dateException) {
                if (dateException.type === 'OFF') status = 'Off';
                else if (dateException.type === 'MANUAL_PRESENT') status = 'Present (Manual)';
                else if (dateException.type === 'MANUAL_ABSENT') status = 'Absent (Manual)';
                else if (dateException.type === 'MANUAL_HALF') status = 'Half Day (Manual)';
                else if (dateException.type === 'SHIFT_OVERRIDE') status = dayPunches.length > 0 ? 'Present' : 'Absent';
                else if (dateException.type === 'SICK_LEAVE') status = 'Sick Leave';
            } else if (dayPunches.length > 0) {
                if (partialDayResult.isPartial) {
                    status = 'Half Day (Partial)';
                } else {
                    status = dayPunches.length >= 2 ? 'Present' : 'Half Day';
                }
            }

            const abnormalDatesArray = (currentResult.abnormal_dates || '').split(',').map(d => d.trim()).filter(Boolean);
            let isAbnormal = abnormalDatesArray.includes(dateStr);
            
            const hasExtendedMatch = punchMatches.some(m => m.isExtendedMatch);
            if (hasUnmatchedPunch || hasExtendedMatch) {
                isAbnormal = true;
            }
            const expectedPunchCount = isSingleShift ? 2 : 4;
            if (dayPunches.length > 0 && dayPunches.length < expectedPunchCount) {
                isAbnormal = true;
            }
            
            const dayOverride = dayOverrides[dateStr];
            if (dayOverride) {
                if (dayOverride.shiftOverride) {
                    shift = {
                        am_start: dayOverride.shiftOverride.am_start,
                        am_end: dayOverride.shiftOverride.am_end,
                        pm_start: dayOverride.shiftOverride.pm_start,
                        pm_end: dayOverride.shiftOverride.pm_end
                    };

                    if (dayPunches.length > 0) {
                        punchMatches = matchPunchesToShiftPoints(dayPunches, shift);
                        hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);

                        lateInfo = '';
                        lateMinutesTotal = 0;
                        earlyCheckoutInfo = '';

                        if (!shouldSkipTimeCalc) {
                            for (const match of punchMatches) {
                                if (!match.matchedTo) continue;

                                const punchTime = match.punch.time;
                                const shiftTime = match.shiftTime;

                                if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                                    if (punchTime > shiftTime) {
                                        const minutes = Math.round((punchTime - shiftTime) / (1000 * 60));
                                        lateMinutesTotal += minutes;
                                        const label = match.matchedTo === 'AM_START' ? 'AM' : 'PM';
                                        if (lateInfo) lateInfo += ' | ';
                                        lateInfo += `${label}: ${minutes} min late`;
                                    }
                                }

                                if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                                    if (punchTime < shiftTime) {
                                        const minutes = Math.round((shiftTime - punchTime) / (1000 * 60));
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

                if (dayOverride.lateMinutes !== undefined) {
                    lateMinutesTotal = dayOverride.lateMinutes;
                    lateInfo = dayOverride.lateMinutes > 0 ? `${dayOverride.lateMinutes} min (edited)` : '-';
                }
                if (dayOverride.earlyCheckoutMinutes !== undefined) {
                    earlyCheckoutInfo = dayOverride.earlyCheckoutMinutes > 0 ? `${dayOverride.earlyCheckoutMinutes} min (edited)` : '-';
                }
                if (dayOverride.isAbnormal !== undefined) {
                    isAbnormal = dayOverride.isAbnormal;
                }
            }

            const extractTime = (ts) => {
                const match = ts.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
                return match ? match[1] : ts;
            };

            breakdown.push({
                date: formatDate(dateStr),
                dateStr,
                punches: rawDayPunches.length,
                punchTimes: dayPunches.map(p => p.timestamp_raw).join(', '),
                punchTimesShort: dayPunches.map(p => extractTime(p.timestamp_raw)).join(', '),
                allPunchTimes: rawDayPunches.map(p => p.timestamp_raw).join(', '),
                shift: shift ? `${formatTime(shift.am_start)} - ${formatTime(shift.am_end)} / ${formatTime(shift.pm_start)} - ${formatTime(shift.pm_end)}` : 'No shift',
                exception: dateException ? dateException.type : '-',
                status,
                abnormal: isAbnormal,
                lateInfo: lateInfo || '-',
                lateMinutesTotal: lateMinutesTotal || 0,
                earlyCheckoutInfo: earlyCheckoutInfo || '-',
                hasOverride: !!dayOverride,
                partialDayReason: partialDayResult.reason,
                punchMatches,
                hasUnmatchedPunch
            });
        }

        return breakdown;
    }, [selectedEmployee, enrichedResults, punches, shifts, exceptions, employees, reportRun]);

    const updateGraceMinutesMutation = useMutation({
        mutationFn: async ({ id, grace_minutes }) => {
            await base44.entities.AnalysisResult.update(id, { grace_minutes });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['results', reportRun.id]);
            setEditingGraceMinutes(null);
            toast.success('Grace minutes updated');
        },
        onError: () => {
            toast.error('Failed to update grace minutes');
        }
    });

    const hasEdits = results.some(r => r.day_overrides && r.day_overrides !== '{}');
    const verifiedCount = verifiedEmployees.length;

    return (
        <div className="space-y-6">
            {/* Report Info & Actions */}
            <Card className="border-0 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-slate-600">
                                Period: <span className="font-medium text-slate-900">{new Date(reportRun.date_from).toLocaleDateString()} - {new Date(reportRun.date_to).toLocaleDateString()}</span>
                            </p>
                            <p className="text-sm text-slate-600">
                                Verified: <span className="font-medium text-slate-900">{verifiedCount} / {results.length} employees</span>
                            </p>
                            {hasEdits && (
                                <p className="text-sm text-amber-600">
                                    ⚠️ This report has unsaved edits
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={exportToExcel}
                                variant="outline"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                            <Button
                                onClick={() => setShowSaveConfirmation(true)}
                                disabled={isSaving}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {isSaving ? 'Saving...' : 'Save Report'}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Search */}
            <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search by ID or name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Results Table */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Attendance Report</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-12">Verified</TableHead>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                        ID
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort}>
                                        Name
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="working_days" currentSort={sort} onSort={setSort}>
                                        Working Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="present_days" currentSort={sort} onSort={setSort}>
                                        Present Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="full_absence_count" currentSort={sort} onSort={setSort}>
                                        LOP Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="sick_leave_count" currentSort={sort} onSort={setSort}>
                                        Sick Leave
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="late_minutes" currentSort={sort} onSort={setSort}>
                                        Late Minutes
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="early_checkout_minutes" currentSort={sort} onSort={setSort}>
                                        Early Checkout
                                    </SortableTableHead>
                                    <TableHead>Grace</TableHead>
                                    <TableHead>Deductible</TableHead>
                                    <TableHead>Notes</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredResults.map((result) => (
                                    <TableRow key={result.id}>
                                        <TableCell>
                                            <Checkbox
                                                checked={result.isVerified}
                                                onCheckedChange={() => toggleVerification(result.attendance_id)}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">{result.attendance_id}</TableCell>
                                        <TableCell>{result.name}</TableCell>
                                        <TableCell>{result.working_days}</TableCell>
                                        <TableCell>{result.present_days}</TableCell>
                                        <TableCell>
                                            <span className={`${result.full_absence_count > 0 ? 'text-red-600 font-medium' : ''}`}>
                                                {result.full_absence_count}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`${result.sick_leave_count > 0 ? 'text-purple-600 font-medium' : ''}`}>
                                                {result.sick_leave_count || 0}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`${result.late_minutes > 0 ? 'text-orange-600 font-medium' : ''}`}>
                                                {result.late_minutes}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`${result.early_checkout_minutes > 0 ? 'text-blue-600 font-medium' : ''}`}>
                                                {result.early_checkout_minutes || 0}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 group">
                                                <span>{result.grace_minutes ?? 15}</span>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => setEditingGraceMinutes(result)}
                                                >
                                                    <Edit className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const total = (result.late_minutes || 0) + (result.early_checkout_minutes || 0);
                                                const grace = result.grace_minutes ?? 15;
                                                const deductible = Math.max(0, total - grace);
                                                return (
                                                    <div className="flex flex-col">
                                                        <span className={`font-bold ${deductible > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            {deductible} min
                                                        </span>
                                                        <span className="text-[10px] text-slate-500">
                                                            {total} - {grace}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                                            {result.notes || '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => showDailyBreakdown(result)}
                                            >
                                                <Eye className="w-4 h-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Daily Breakdown Dialog */}
            <Dialog open={showBreakdown} onOpenChange={setShowBreakdown}>
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
                                    <TableHead>Abnormal</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {getDailyBreakdown.map((day, idx) => (
                                    <TableRow key={idx} className={`${day.hasUnmatchedPunch ? 'bg-red-50' : day.abnormal ? 'bg-amber-50' : ''} ${day.hasOverride ? 'border-l-4 border-l-indigo-400' : ''}`}>
                                        <TableCell className="font-medium">{day.date}</TableCell>
                                        <TableCell>{day.punches}</TableCell>
                                        <TableCell className="text-xs max-w-xs">
                                            <div title={day.allPunchTimes || day.punchTimes}>
                                                {day.punchMatches && day.punchMatches.length > 0 ? (
                                                    <div className="space-y-0.5">
                                                        {day.punchMatches.map((match, matchIdx) => {
                                                            const extractTime = (ts) => {
                                                                const match = ts.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
                                                                return match ? match[1] : ts;
                                                            };
                                                            return (
                                                                <div key={matchIdx} className="flex items-center gap-1">
                                                                    <span className={match.matchedTo ? (match.isExtendedMatch ? 'text-amber-600 font-semibold' : '') : 'text-red-600 font-bold'}>
                                                                        {extractTime(match.punch.timestamp_raw)}
                                                                    </span>
                                                                    {match.matchedTo && (
                                                                        <span className={`text-[9px] ${match.isExtendedMatch ? 'text-amber-600' : 'text-slate-500'}`}>
                                                                            →{match.matchedTo.replace(/_/g, ' ')}
                                                                            {match.isExtendedMatch && ' ⚠️'}
                                                                        </span>
                                                                    )}
                                                                    {!match.matchedTo && (
                                                                        <span className="text-[9px] text-red-600 font-bold">
                                                                            ⚠️ NO MATCH
                                                                        </span>
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
                                        <TableCell className="text-xs">{day.shift}</TableCell>
                                        <TableCell className="text-xs">{day.exception}</TableCell>
                                        <TableCell>
                                            <div>
                                                <span className={`
                                                    px-2 py-1 rounded text-xs font-medium
                                                    ${day.status.includes('Present') && !day.status.includes('Half') ? 'bg-green-100 text-green-700' : ''}
                                                    ${day.status.includes('Absent') ? 'bg-red-100 text-red-700' : ''}
                                                    ${day.status.includes('Half') ? 'bg-amber-100 text-amber-700' : ''}
                                                    ${day.status.includes('Off') ? 'bg-slate-100 text-slate-700' : ''}
                                                `}>
                                                    {day.status}
                                                </span>
                                                {day.partialDayReason && (
                                                    <span className="text-amber-600 block text-[10px] mt-1">
                                                        {day.partialDayReason}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {day.lateMinutesTotal > 0 ? (
                                                <span className="text-orange-600 font-medium">{day.lateMinutesTotal} min</span>
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
                                        <TableCell>
                                            {day.abnormal && (
                                                <span className="text-amber-600 font-medium">Yes</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setEditingDay(day)}
                                            >
                                                <Edit className="w-4 h-4 text-indigo-600" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Day Record Dialog */}
            <EditDayRecordDialog
                open={!!editingDay}
                onClose={() => setEditingDay(null)}
                onSave={() => {
                    queryClient.invalidateQueries(['results', reportRun.id]);
                }}
                dayRecord={editingDay}
                project={project}
                attendanceId={selectedEmployee?.attendance_id}
                analysisResult={selectedEmployee}
            />

            <Dialog open={!!editingGraceMinutes} onOpenChange={(open) => !open && setEditingGraceMinutes(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Grace Minutes</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>Grace Minutes</Label>
                        <Input
                            type="number"
                            defaultValue={editingGraceMinutes?.grace_minutes ?? 15}
                            id="grace-minutes-input"
                            className="mt-2"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditingGraceMinutes(null)}>Cancel</Button>
                        <Button onClick={() => {
                            const val = document.getElementById('grace-minutes-input').value;
                            updateGraceMinutesMutation.mutate({
                                id: editingGraceMinutes.id,
                                grace_minutes: parseInt(val)
                            });
                        }}>Save</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Save Confirmation Dialog */}
            <Dialog open={showSaveConfirmation} onOpenChange={setShowSaveConfirmation}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Confirm Save Report</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-slate-700">
                            Are you sure you want to save this report?
                        </p>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-sm text-amber-800 font-medium mb-2">⚠️ Important:</p>
                            <ul className="text-sm text-amber-700 space-y-1">
                                <li>• All manual edits in daily breakdowns will be converted to exceptions</li>
                                <li>• These exceptions will be used in future analysis runs</li>
                                <li>• Verification status will be saved for all marked employees</li>
                                <li>• This action cannot be easily undone</li>
                            </ul>
                        </div>
                        {hasEdits && (
                            <p className="text-sm text-slate-600">
                                You have made edits to this report. These will be permanently saved as exceptions.
                            </p>
                        )}
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowSaveConfirmation(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={() => {
                                setShowSaveConfirmation(false);
                                saveReportMutation.mutate();
                            }}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            Confirm & Save
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}