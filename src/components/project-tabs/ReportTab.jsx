import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Search, Eye, Trash2, Edit, Filter, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import EditDayRecordDialog from './EditDayRecordDialog';

export default function ReportTab({ project }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [selectedReportRun, setSelectedReportRun] = useState(null);
    const [editingDay, setEditingDay] = useState(null);
    const [editingGraceMinutes, setEditingGraceMinutes] = useState(null);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [filters, setFilters] = useState({
        dateFrom: '',
        dateTo: '',
        status: 'all',
        abnormality: 'all'
    });
    const [showFilters, setShowFilters] = useState(false);
    const queryClient = useQueryClient();

    const formatTime = (timeStr) => {
        // Handle null, undefined, empty string, or dash
        if (!timeStr || timeStr === '—' || timeStr.trim() === '') return '—';
        
        // If already in AM/PM format, return as is
        if (/AM|PM/i.test(timeStr)) return timeStr;
        
        // Parse 24-hour format (HH:MM or HH:MM:SS)
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return '—'; // Return dash if format is invalid
        
        let hours = parseInt(match[1]);
        const minutes = match[2];
        
        // Convert 24-hour to 12-hour format
        const period = hours >= 12 ? 'PM' : 'AM';
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        
        return `${hours}:${minutes} ${period}`;
    };

    const { data: reportRuns = [] } = useQuery({
        queryKey: ['reportRuns', project.id],
        queryFn: () => base44.entities.ReportRun.filter({ project_id: project.id }, '-created_date')
    });

    const { data: allResults = [] } = useQuery({
        queryKey: ['results', project.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ project_id: project.id })
    });

    // Set the most recent report run as default, and update when new reports are added
    React.useEffect(() => {
        if (reportRuns.length > 0) {
            // Always select the most recent report (first in list since sorted by -created_date)
            const mostRecentId = reportRuns[0].id;
            // If current selection doesn't exist in the list (deleted) or no selection yet, update
            const currentExists = reportRuns.some(r => r.id === selectedReportRun);
            if (!selectedReportRun || !currentExists) {
                setSelectedReportRun(mostRecentId);
            }
        } else {
            setSelectedReportRun(null);
        }
    }, [reportRuns]);

    const results = selectedReportRun 
        ? allResults.filter(r => r.report_run_id === selectedReportRun)
        : [];

    const deleteReportMutation = useMutation({
        mutationFn: async (reportRunId) => {
            // Delete all analysis results for this report run
            const resultsToDelete = allResults.filter(r => r.report_run_id === reportRunId);
            await Promise.all(resultsToDelete.map(r => base44.entities.AnalysisResult.delete(r.id)));
            
            // Delete the report run
            await base44.entities.ReportRun.delete(reportRunId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['reportRuns', project.id]);
            queryClient.invalidateQueries(['results', project.id]);
            setSelectedReportRun(null);
            toast.success('Report deleted successfully');
        },
        onError: () => {
            toast.error('Failed to delete report');
        }
    });

    const handleDeleteReport = (reportRunId) => {
        if (window.confirm('Delete this report? This will permanently remove all analysis results from this run.')) {
            deleteReportMutation.mutate(reportRunId);
        }
    };

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
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

    const { data: rules } = useQuery({
        queryKey: ['rules'],
        queryFn: async () => {
            const rulesList = await base44.entities.AttendanceRules.list();
            if (rulesList.length > 0) {
                return JSON.parse(rulesList[0].rules_json);
            }
            return null;
        }
    });

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

    // Detect partial day (employee came but left early - worked less than half the expected hours)
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

    // Filter multiple punches within configured time windows to get the key punches
    const filterMultiplePunches = (punchList, shift) => {
        if (punchList.length <= 1) return punchList;

        if (shift?.is_single_shift) {
            const punchesWithTime = punchList.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw)
            })).filter(p => p.time).sort((a, b) => a.time - b.time);

            if (punchesWithTime.length <= 2) return punchList;

            const firstPunch = punchesWithTime[0];
            const lastPunch = punchesWithTime[punchesWithTime.length - 1];
            return [firstPunch, lastPunch].map(fp => punchList.find(p => p.id === fp.id)).filter(Boolean);
        }
        
        const clusterWindow = rules?.punch_filtering?.cluster_window_minutes ?? 10;
        
        const punchesWithTime = punchList.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time);
        
        if (punchesWithTime.length === 0) return punchList;

        let morningPunchIn = null;
        const morningCandidates = [];
        for (let i = 0; i < punchesWithTime.length; i++) {
            if (morningCandidates.length === 0) {
                morningCandidates.push(punchesWithTime[i]);
            } else {
                const firstInCluster = morningCandidates[0];
                const timeDiff = Math.abs(punchesWithTime[i].time - firstInCluster.time) / (1000 * 60);
                if (timeDiff <= clusterWindow) {
                    morningCandidates.push(punchesWithTime[i]);
                } else {
                    break;
                }
            }
        }
        morningPunchIn = morningCandidates[0];

        let morningPunchOut = null;
        if (shift && shift.am_end && punchesWithTime.length > 1) {
            const pmStartTime = shift.pm_start ? parseTime(shift.pm_start) : null;
            const morningClusterEndIndex = morningCandidates.length;
            const amEndCandidates = [];
            
            for (let i = morningClusterEndIndex; i < punchesWithTime.length; i++) {
                const punch = punchesWithTime[i];
                if (pmStartTime && punch.time >= pmStartTime) continue;
                
                if (amEndCandidates.length === 0) {
                    amEndCandidates.push(punch);
                } else {
                    const firstInCluster = amEndCandidates[0];
                    const timeDiff = Math.abs(punch.time - firstInCluster.time) / (1000 * 60);
                    if (timeDiff <= clusterWindow) {
                        amEndCandidates.push(punch);
                    }
                }
            }
            if (amEndCandidates.length > 0) {
                morningPunchOut = amEndCandidates[amEndCandidates.length - 1];
            }
        }

        let pmPunchIn = null;
        const morningOutIndex = morningPunchOut ? punchesWithTime.indexOf(morningPunchOut) : (morningCandidates.length - 1);
        const pmInCandidates = [];
        for (let i = morningOutIndex + 1; i < punchesWithTime.length; i++) {
            if (pmInCandidates.length === 0) {
                pmInCandidates.push(punchesWithTime[i]);
            } else {
                const firstInCluster = pmInCandidates[0];
                const timeDiff = Math.abs(punchesWithTime[i].time - firstInCluster.time) / (1000 * 60);
                if (timeDiff <= clusterWindow) {
                    pmInCandidates.push(punchesWithTime[i]);
                } else {
                    break;
                }
            }
        }
        if (pmInCandidates.length > 0) {
            pmPunchIn = pmInCandidates[0];
        }

        let eveningPunchOut = null;
        if (shift && shift.pm_end) {
            const pmEndTime = parseTime(shift.pm_end);
            const afterShiftPunches = punchesWithTime.filter(p => p.time >= pmEndTime);
            
            if (afterShiftPunches.length > 0) {
                eveningPunchOut = afterShiftPunches[afterShiftPunches.length - 1];
            } else if (punchesWithTime.length > 0) {
                eveningPunchOut = punchesWithTime[punchesWithTime.length - 1];
            }
        } else if (punchesWithTime.length > 0) {
            eveningPunchOut = punchesWithTime[punchesWithTime.length - 1];
        }

        const filtered = [];
        if (morningPunchIn) filtered.push(morningPunchIn);
        if (morningPunchOut && morningPunchOut !== morningPunchIn) filtered.push(morningPunchOut);
        if (pmPunchIn && pmPunchIn !== morningPunchOut && pmPunchIn !== morningPunchIn) filtered.push(pmPunchIn);
        if (eveningPunchOut && 
            eveningPunchOut !== pmPunchIn && 
            eveningPunchOut !== morningPunchOut && 
            eveningPunchOut !== morningPunchIn) {
            filtered.push(eveningPunchOut);
        }

        return filtered.map(fp => punchList.find(p => p.id === fp.id)).filter(Boolean);
    };

    // Helper function to calculate daily breakdown for an employee (used for main table totals)
    const calculateEmployeeTotals = (result) => {
        const employeePunches = punches.filter(p => 
            p.attendance_id === result.attendance_id &&
            p.punch_date >= project.date_from && 
            p.punch_date <= project.date_to
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === result.attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === result.attendance_id);

        let dayOverrides = {};
        if (result.day_overrides) {
            try {
                dayOverrides = JSON.parse(result.day_overrides);
            } catch (e) {}
        }

        let totalLateMinutes = 0;
        let totalEarlyCheckout = 0;

        const startDate = new Date(project.date_from);
        const endDate = new Date(project.date_to);

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDate = new Date(d);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();

            if (dayOfWeek === 0) continue; // Skip Sundays

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

            // Helper to check if shift is effective on current date
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
            // First check for date-specific shift that is effective on this date
            shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
            
            // If no date-specific shift, check for day-based shift that is effective
            if (!shift) {
                if (dayOfWeek === 5) { // Friday
                    // Look for general Friday shift (not date-specific) that is effective on this date
                    shift = employeeShifts.find(s => s.is_friday_shift && !s.date && isShiftEffective(s));
                    // Fallback to regular shift if no Friday-specific shift exists (that is effective)
                    if (!shift) {
                        shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                    }
                } else {
                    // Look for regular working day shift (not Friday, not date-specific) that is effective
                    shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                }
            }

            if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
                shift = {
                    am_start: dateException.new_am_start,
                    am_end: dateException.new_am_end,
                    pm_start: dateException.new_pm_start,
                    pm_end: dateException.new_pm_end
                };
            }

            const dayPunches = filterMultiplePunches(rawDayPunches, shift);
            const isSingleShift = shift?.is_single_shift || false;
            const partialDayResult = detectPartialDay(dayPunches, shift);

            // Check for day override first
            const dayOverride = dayOverrides[dateStr];
            if (dayOverride) {
                if (dayOverride.lateMinutes !== undefined) {
                    totalLateMinutes += dayOverride.lateMinutes;
                }
                if (dayOverride.earlyCheckoutMinutes !== undefined) {
                    totalEarlyCheckout += dayOverride.earlyCheckoutMinutes;
                }
                continue; // Skip normal calculation for overridden days
            }

            // Calculate late and early checkout for non-overridden days
            if (shift && dayPunches.length > 0 && !partialDayResult.isPartial) {
                // AM late - calculate as long as we have at least one punch
                if (shift.am_start) {
                    const firstPunch = dayPunches[0];
                    const punchTime = parseTime(firstPunch.timestamp_raw);
                    const shiftStart = parseTime(shift.am_start);
                    if (punchTime && shiftStart && punchTime > shiftStart) {
                        totalLateMinutes += Math.round((punchTime - shiftStart) / (1000 * 60));
                    }
                }
                // PM late - ONLY if we have actual 4 punches (not single shift)
                if (shift.pm_start && dayPunches.length >= 4 && !isSingleShift) {
                    const pmCheckIn = dayPunches[2];
                    const punchTime = parseTime(pmCheckIn.timestamp_raw);
                    const shiftStart = parseTime(shift.pm_start);
                    if (punchTime && shiftStart && punchTime > shiftStart) {
                        totalLateMinutes += Math.round((punchTime - shiftStart) / (1000 * 60));
                    }
                }
                // Early checkout - only for complete punch sets
                const expectedPunches = isSingleShift ? 2 : 4;
                const hasCompletePunches = dayPunches.length >= expectedPunches;
                if (shift.pm_end && hasCompletePunches) {
                    const lastPunch = dayPunches[dayPunches.length - 1];
                    const punchTime = parseTime(lastPunch.timestamp_raw);
                    const shiftEnd = parseTime(shift.pm_end);
                    if (punchTime && shiftEnd && punchTime < shiftEnd) {
                        totalEarlyCheckout += Math.round((shiftEnd - punchTime) / (1000 * 60));
                    }
                }
            }
        }

        return { totalLateMinutes, totalEarlyCheckout };
    };

    const enrichedResults = results.map(result => {
        const employee = employees.find(e => e.attendance_id === result.attendance_id);
        
        // Calculate totals from daily breakdown to match what's shown in the breakdown dialog
        const { totalLateMinutes, totalEarlyCheckout } = calculateEmployeeTotals(result);
        
        return {
            ...result,
            name: employee?.name || 'Unknown',
            late_minutes: Math.max(0, totalLateMinutes),
            early_checkout_minutes: Math.max(0, totalEarlyCheckout)
        };
    });

    // Helper function to check if employee matches filter criteria based on daily breakdown
    const matchesAdvancedFilters = (result) => {
        // If no advanced filters are set, return true
        if (!filters.dateFrom && !filters.dateTo && filters.status === 'all' && filters.abnormality === 'all') {
            return true;
        }

        const employeePunches = punches.filter(p => 
            p.attendance_id === result.attendance_id &&
            p.punch_date >= project.date_from && 
            p.punch_date <= project.date_to
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === result.attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === result.attendance_id || e.attendance_id === 'ALL');

        let dayOverrides = {};
        if (result.day_overrides) {
            try {
                dayOverrides = JSON.parse(result.day_overrides);
            } catch (e) {}
        }

        const startDate = new Date(filters.dateFrom || project.date_from);
        const endDate = new Date(filters.dateTo || project.date_to);

        let hasMatchingDay = false;

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDate = new Date(d);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();

            if (dayOfWeek === 0) continue; // Skip Sundays

            const dayPunches = employeePunches.filter(p => p.punch_date === dateStr);
            const dateException = employeeExceptions.find(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo;
            });

            // Determine status
            let status = 'Absent';
            if (dateException) {
                if (dateException.type === 'OFF' || dateException.type === 'PUBLIC_HOLIDAY') status = 'Off';
                else if (dateException.type === 'MANUAL_PRESENT') status = 'Present';
                else if (dateException.type === 'MANUAL_ABSENT') status = 'Absent';
                else if (dateException.type === 'MANUAL_HALF') status = 'Half Day';
                else if (dateException.type === 'SHIFT_OVERRIDE') status = dayPunches.length > 0 ? 'Present' : 'Absent';
                else if (dateException.type === 'SICK_LEAVE') status = 'Present';
            } else if (dayPunches.length > 0) {
                status = dayPunches.length >= 2 ? 'Present' : 'Half Day';
            }

            // Check for day overrides
            const dayOverride = dayOverrides[dateStr];
            if (dayOverride) {
                if (dayOverride.type === 'MANUAL_PRESENT') status = 'Present';
                else if (dayOverride.type === 'MANUAL_ABSENT') status = 'Absent';
                else if (dayOverride.type === 'MANUAL_HALF') status = 'Half Day';
                else if (dayOverride.type === 'OFF') status = 'Off';
            }

            // Check abnormality - abnormal_dates is comma-separated string of YYYY-MM-DD dates
            const abnormalDatesArray = (result.abnormal_dates || '').split(',').map(d => d.trim()).filter(Boolean);
            let isAbnormal = abnormalDatesArray.includes(dateStr);
            if (dayOverride?.isAbnormal !== undefined) {
                isAbnormal = dayOverride.isAbnormal;
            }

            // Apply status filter
            if (filters.status !== 'all') {
                if (filters.status === 'present' && status !== 'Present') continue;
                if (filters.status === 'absent' && status !== 'Absent') continue;
                if (filters.status === 'half' && status !== 'Half Day') continue;
                if (filters.status === 'off' && status !== 'Off') continue;
            }

            // Apply abnormality filter
            if (filters.abnormality !== 'all') {
                if (filters.abnormality === 'yes' && !isAbnormal) continue;
                if (filters.abnormality === 'no' && isAbnormal) continue;
            }

            hasMatchingDay = true;
            break;
        }

        return hasMatchingDay;
    };

    const filteredResults = enrichedResults
        .filter(result =>
            (result.attendance_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            result.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
            matchesAdvancedFilters(result)
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

    const exportToExcel = () => {
        if (filteredResults.length === 0) {
            toast.error('No data to export');
            return;
        }

        const headers = ['Attendance ID', 'Name', 'Working Days', 'Present Days', 'LOP Days', 'Sick Leave', 'Late Minutes', 'Early Checkout Minutes', 'Notes'];
        const rows = filteredResults.map(r => [
            r.attendance_id,
            r.name,
            r.working_days,
            r.present_days,
            r.full_absence_count,
            r.sick_leave_count || 0,
            r.late_minutes,
            r.early_checkout_minutes || 0,
            r.notes || ''
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name}_attendance_report.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast.success('Report exported');
    };

    const updateGraceMinutesMutation = useMutation({
        mutationFn: async ({ id, grace_minutes }) => {
            await base44.entities.AnalysisResult.update(id, { grace_minutes });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['results', project.id]);
            setEditingGraceMinutes(null);
            toast.success('Grace minutes updated');
        },
        onError: () => {
            toast.error('Failed to update grace minutes');
        }
    });

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

    // Detect which punch is missing and auto-fill it (Conservative mode)
    const detectAndAutoFillMissingPunch = (dayPunches, shift) => {
        if (!shift || dayPunches.length !== 3) return { punches: dayPunches, autoFilled: null };
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time).sort((a, b) => a.time - b.time);
        
        if (punchesWithTime.length !== 3) return { punches: dayPunches, autoFilled: null };
        
        const amStart = parseTime(shift.am_start);
        const amEnd = parseTime(shift.am_end);
        const pmStart = parseTime(shift.pm_start);
        const pmEnd = parseTime(shift.pm_end);
        
        if (!amStart || !amEnd || !pmStart || !pmEnd) return { punches: dayPunches, autoFilled: null };
        
        const [p1, p2, p3] = punchesWithTime;
        
        // Calculate time differences to each expected punch time
        const p1ToAmStart = Math.abs(p1.time - amStart) / (1000 * 60);
        const p1ToAmEnd = Math.abs(p1.time - amEnd) / (1000 * 60);
        const p2ToAmEnd = Math.abs(p2.time - amEnd) / (1000 * 60);
        const p2ToPmStart = Math.abs(p2.time - pmStart) / (1000 * 60);
        const p3ToPmStart = Math.abs(p3.time - pmStart) / (1000 * 60);
        const p3ToPmEnd = Math.abs(p3.time - pmEnd) / (1000 * 60);
        
        // Threshold for "close enough" to a shift time (30 minutes)
        const threshold = 30;
        
        let autoFilled = null;
        
        // Case 1: Missing AM Start (p1 is close to AM End)
        if (p1ToAmEnd < threshold && p2ToPmStart < threshold && p3ToPmEnd < threshold) {
            autoFilled = { type: 'AM_START', time: shift.am_start };
        }
        // Case 2: Missing AM End (p1 close to AM Start, p2 close to PM Start)
        else if (p1ToAmStart < threshold && p2ToPmStart < threshold && p3ToPmEnd < threshold) {
            autoFilled = { type: 'AM_END', time: shift.am_end };
        }
        // Case 3: Missing PM Start (p1 AM Start, p2 AM End, p3 PM End)
        else if (p1ToAmStart < threshold && p2ToAmEnd < threshold && p3ToPmEnd < threshold) {
            autoFilled = { type: 'PM_START', time: shift.pm_start };
        }
        // Case 4: Missing PM End (most common - p1 AM Start, p2 AM End, p3 PM Start)
        else if (p1ToAmStart < threshold && p2ToAmEnd < threshold && p3ToPmStart < threshold) {
            autoFilled = { type: 'PM_END', time: shift.pm_end };
        }
        
        return { punches: dayPunches, autoFilled };
    };

    const getDailyBreakdown = () => {
        if (!selectedEmployee) return [];

        // Get the latest version of this employee's result from enrichedResults
        const currentResult = enrichedResults.find(r => r.id === selectedEmployee.id) || selectedEmployee;

        const breakdown = [];
        const startDate = new Date(project.date_from);
        const endDate = new Date(project.date_to);
        
        // Parse day_overrides for this specific report
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
            p.punch_date >= project.date_from && 
            p.punch_date <= project.date_to
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === currentResult.attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === currentResult.attendance_id);

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDate = new Date(d);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();

            if (dayOfWeek === 0) continue; // Skip Sundays

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

            // Helper to check if shift is effective on current date
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
            // First check for date-specific shift that is effective on this date
            shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
            
            // If no date-specific shift, check for day-based shift that is effective
            if (!shift) {
                if (dayOfWeek === 5) { // Friday
                    // Look for general Friday shift (not date-specific) that is effective on this date
                    shift = employeeShifts.find(s => s.is_friday_shift && !s.date && isShiftEffective(s));
                    // Fallback to regular shift if no Friday-specific shift exists (that is effective)
                    if (!shift) {
                        shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                    }
                } else {
                    // Look for regular working day shift (not Friday, not date-specific) that is effective
                    shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                }
            }

            if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
                shift = {
                    am_start: dateException.new_am_start,
                    am_end: dateException.new_am_end,
                    pm_start: dateException.new_pm_start,
                    pm_end: dateException.new_pm_end
                };
            }

            // Filter multiple punches to get the 4 key punches
            const dayPunches = filterMultiplePunches(rawDayPunches, shift);

            // Check if employee has single shift (auto-detect if am_end and pm_start are missing/empty)
            const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                   shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                   shift.am_end !== '—' && shift.pm_start !== '—' &&
                                   shift.am_end !== '-' && shift.pm_start !== '-';
            const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;
            
            // Detect partial day
            const partialDayResult = detectPartialDay(dayPunches, shift);
            
            // Detect and show auto-fill suggestion
            let autoFillSuggestion = null;
            if (shift) {
                // For single shift: check if 1 punch, for regular: check if 3 punches
                if ((isSingleShift && dayPunches.length === 1) || (!isSingleShift && dayPunches.length === 3)) {
                    if (isSingleShift && dayPunches.length === 1) {
                        // Single shift auto-fill logic
                        const shiftStart = parseTime(shift.am_start);
                        const shiftEnd = parseTime(shift.pm_end);
                        
                        if (shiftStart && shiftEnd) {
                            const punchTime = parseTime(dayPunches[0].timestamp_raw);
                            if (punchTime) {
                                const toStart = Math.abs(punchTime - shiftStart) / (1000 * 60);
                                const toEnd = Math.abs(punchTime - shiftEnd) / (1000 * 60);
                                const threshold = 30;
                                
                                if (toStart < toEnd && toStart < threshold) {
                                    autoFillSuggestion = { type: 'PUNCH_OUT', time: shift.pm_end };
                                } else if (toEnd < toStart && toEnd < threshold) {
                                    autoFillSuggestion = { type: 'PUNCH_IN', time: shift.am_start };
                                }
                            }
                        }
                    } else {
                        // Regular shift auto-fill logic (3 punches)
                        const autoFillResult = detectAndAutoFillMissingPunch(dayPunches, shift);
                        autoFillSuggestion = autoFillResult.autoFilled;
                    }
                }
            }

            // Calculate late minutes and early checkout
            let lateInfo = '';
            let lateMinutesTotal = 0;
            let earlyCheckoutInfo = '';
            
            // Skip ALL late calculations if any punch was auto-filled
            if (shift && dayPunches.length > 0 && !partialDayResult.isPartial && !autoFillSuggestion) {
                // AM shift late check - calculate as long as we have at least one punch
                if (shift.am_start) {
                    const firstPunch = dayPunches[0];
                    const punchTime = parseTime(firstPunch.timestamp_raw);
                    const shiftStart = parseTime(shift.am_start);
                    if (punchTime && shiftStart && punchTime > shiftStart) {
                        const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                        lateMinutesTotal += minutes;
                        lateInfo += `AM: ${minutes} min late`;
                    }
                }
                // PM shift late check - ONLY if we have actual 4 punches (not single shift)
                if (shift.pm_start && dayPunches.length >= 4 && !isSingleShift) {
                    const pmCheckIn = dayPunches[2];
                    const punchTime = parseTime(pmCheckIn.timestamp_raw);
                    const shiftStart = parseTime(shift.pm_start);
                    if (punchTime && shiftStart && punchTime > shiftStart) {
                        const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                        lateMinutesTotal += minutes;
                        if (lateInfo) lateInfo += ' | ';
                        lateInfo += `PM: ${minutes} min late`;
                    }
                }

                // Early checkout check - only for complete punch sets
                const expectedPunches = isSingleShift ? 2 : 4;
                const hasCompletePunches = dayPunches.length >= expectedPunches;
                if (shift.pm_end && hasCompletePunches) {
                    const lastPunch = dayPunches[dayPunches.length - 1];
                    const punchTime = parseTime(lastPunch.timestamp_raw);
                    const shiftEnd = parseTime(shift.pm_end);
                    if (punchTime && shiftEnd && punchTime < shiftEnd) {
                        const minutes = Math.round((shiftEnd - punchTime) / (1000 * 60));
                        earlyCheckoutInfo = `${minutes} min`;
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
            } else if (dayPunches.length > 0) {
                // Check for partial day first
                if (partialDayResult.isPartial) {
                    status = 'Half Day (Partial)';
                } else {
                    // For single shift employees, 2 punches = Present, otherwise need 2+ for present
                    status = dayPunches.length >= 2 ? 'Present' : 'Half Day';
                }
            }

            // Check abnormality - abnormal_dates is comma-separated string of YYYY-MM-DD dates
            const abnormalDatesArray = (currentResult.abnormal_dates || '').split(',').map(d => d.trim()).filter(Boolean);
            let isAbnormal = abnormalDatesArray.includes(dateStr);
            
            // Also mark as abnormal if punches don't match expected count
            const expectedPunchCount = isSingleShift ? 2 : 4;
            if (dayPunches.length > 0 && dayPunches.length < expectedPunchCount) {
                isAbnormal = true;
            }
            
            // Check for day-specific overrides in this report
            const dayOverride = dayOverrides[dateStr];
            if (dayOverride) {
                // Apply override values
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

            // Extract just the time part from timestamps for cleaner display
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
                autoFillSuggestion,
                partialDayReason: partialDayResult.reason
            });
        }

        return breakdown;
    };

    return (
        <div className="space-y-6">
            {/* Report Runs List */}
            {reportRuns.length > 0 && (
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle>Report History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {reportRuns.map((run) => (
                                <div
                                    key={run.id}
                                    className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${
                                        selectedReportRun === run.id
                                            ? 'bg-indigo-50 border-indigo-300'
                                            : 'bg-white border-slate-200'
                                    }`}
                                >
                                    <button
                                        onClick={() => setSelectedReportRun(run.id)}
                                        className="flex-1 text-left"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-medium text-slate-900">
                                                    Report Generated: {new Date(run.created_date).toLocaleString('en-US', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        timeZone: 'Asia/Dubai'
                                                    })}
                                                </p>
                                                <p className="text-sm text-slate-600 mt-1">
                                                    {run.employee_count} employee{run.employee_count !== 1 ? 's' : ''} analyzed
                                                </p>
                                            </div>
                                            {selectedReportRun === run.id && (
                                                <span className="text-indigo-600 font-medium text-sm">Viewing</span>
                                            )}
                                        </div>
                                    </button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleDeleteReport(run.id)}
                                        disabled={deleteReportMutation.isPending}
                                    >
                                        <Trash2 className="w-4 h-4 text-red-600" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Actions */}
            <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 max-w-md">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search by ID or name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setShowFilters(!showFilters)}
                                variant={showFilters ? "secondary" : "outline"}
                                className="gap-2"
                            >
                                <Filter className="w-4 h-4" />
                                Filters
                                {(filters.dateFrom || filters.dateTo || filters.status !== 'all' || filters.abnormality !== 'all') && (
                                    <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                                        {[filters.dateFrom || filters.dateTo ? 1 : 0, filters.status !== 'all' ? 1 : 0, filters.abnormality !== 'all' ? 1 : 0].reduce((a, b) => a + b, 0)}
                                    </span>
                                )}
                            </Button>
                            <Button
                                onClick={exportToExcel}
                                variant="outline"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export to Excel
                            </Button>
                        </div>
                    </div>

                    {/* Advanced Filters */}
                    {showFilters && (
                        <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-slate-900">Advanced Filters</h4>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setFilters({ dateFrom: '', dateTo: '', status: 'all', abnormality: 'all' })}
                                    className="text-slate-500 hover:text-slate-700"
                                >
                                    <X className="w-4 h-4 mr-1" />
                                    Clear All
                                </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <Label className="text-sm text-slate-600">Date From</Label>
                                    <Input
                                        type="date"
                                        value={filters.dateFrom}
                                        min={project.date_from}
                                        max={project.date_to}
                                        onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm text-slate-600">Date To</Label>
                                    <Input
                                        type="date"
                                        value={filters.dateTo}
                                        min={filters.dateFrom || project.date_from}
                                        max={project.date_to}
                                        onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm text-slate-600">Status</Label>
                                    <Select
                                        value={filters.status}
                                        onValueChange={(value) => setFilters({ ...filters, status: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Statuses</SelectItem>
                                            <SelectItem value="present">Present</SelectItem>
                                            <SelectItem value="absent">Absent</SelectItem>
                                            <SelectItem value="half">Half Day</SelectItem>
                                            <SelectItem value="off">Off</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-sm text-slate-600">Abnormality</Label>
                                    <Select
                                        value={filters.abnormality}
                                        onValueChange={(value) => setFilters({ ...filters, abnormality: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="yes">Abnormal Days</SelectItem>
                                            <SelectItem value="no">Normal Days</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500">
                                Showing employees who have at least one day matching the selected criteria within the date range.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Results Table */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Attendance Report</CardTitle>
                </CardHeader>
                <CardContent>
                    {reportRuns.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No reports generated yet. Please run the analysis first.
                        </div>
                    ) : results.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No results found for this report.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                            Attendance ID
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
                                            Early Checkout Minutes
                                        </SortableTableHead>
                                        <TableHead>Grace Minutes</TableHead>
                                        <TableHead>Deductible</TableHead>
                                        <TableHead>Notes</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredResults.map((result) => (
                                        <TableRow key={result.id}>
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
                                                                {total} (Total) - {grace} (Grace)
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-600 max-w-xs">
                                                <div className="truncate" title={result.notes || '-'}>
                                                    {result.notes || '-'}
                                                </div>
                                                {result.auto_resolutions && (
                                                    <div className="text-indigo-600 text-[10px] mt-1 truncate" title={result.auto_resolutions}>
                                                        🔧 Auto-resolved
                                                    </div>
                                                )}
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
                    )}
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
                                    <TableHead>Date (DD/MM/YYYY)</TableHead>
                                    <TableHead>Punches</TableHead>
                                    <TableHead>Punch Times</TableHead>
                                    <TableHead>Shift (HH:MM AM/PM)</TableHead>
                                    <TableHead>Exception</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Late Minutes</TableHead>
                                    <TableHead>Early Checkout Minutes</TableHead>
                                    <TableHead>Abnormal</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {getDailyBreakdown().map((day, idx) => (
                                    <TableRow key={idx} className={`${day.abnormal ? 'bg-amber-50' : ''} ${day.hasOverride ? 'border-l-4 border-l-indigo-400' : ''}`}>
                                        <TableCell className="font-medium">{day.date}</TableCell>
                                        <TableCell>{day.punches}</TableCell>
                                        <TableCell className="text-xs max-w-xs">
                                            <div title={day.allPunchTimes || day.punchTimes}>
                                                {day.punchTimesShort || '-'}
                                                {day.autoFillSuggestion && (
                                                    <span className="text-indigo-600 block text-[10px]">
                                                        🔧 +{day.autoFillSuggestion.time}
                                                    </span>
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
                onClose={() => {
                    setEditingDay(null);
                }}
                onSave={() => {
                    // Invalidate queries to refresh data immediately
                    queryClient.invalidateQueries(['results', project.id]);
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
        </div>
    );
}