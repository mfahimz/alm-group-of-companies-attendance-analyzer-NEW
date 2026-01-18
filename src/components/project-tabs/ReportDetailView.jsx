import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Search, Eye, Edit, Save, Filter, Copy, Loader2, CheckCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import EditDayRecordDialog from './EditDayRecordDialog';
import * as XLSX from 'xlsx';

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
    const [saveProgress, setSaveProgress] = useState(null);
    const [riskFilter, setRiskFilter] = useState('all');
    const [approvalLinks, setApprovalLinks] = useState([]);
    const [showLinksDialog, setShowLinksDialog] = useState(false);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';
    const isAdmin = userRole === 'admin';

    const { data: results = [] } = useQuery({
        queryKey: ['results', reportRun.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ report_run_id: reportRun.id }),
        staleTime: 30 * 1000, // Cache for 30 seconds only - results change frequently
        retry: false,
        gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
        refetchInterval: 5 * 60 * 1000 // Auto-refetch every 5 minutes
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company }),
        staleTime: 60 * 60 * 1000, // Cache for 60 minutes
        retry: false,
        gcTime: 60 * 60 * 1000
    });

    // Only fetch punches and shifts if project is NOT closed (data is deleted on close)
    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id }),
        enabled: project.status !== 'closed',
        staleTime: 60 * 60 * 1000, // Cache for 60 minutes
        retry: false,
        gcTime: 60 * 60 * 1000
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id }),
        enabled: project.status !== 'closed',
        staleTime: 60 * 60 * 1000, // Cache for 60 minutes
        retry: false,
        gcTime: 60 * 60 * 1000
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id }),
        staleTime: 60 * 60 * 1000, // Cache for 60 minutes
        retry: false,
        gcTime: 60 * 60 * 1000
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

    const parseTime = (timeStr, includeSeconds = false) => {
        try {
            if (!timeStr || timeStr === '—') return null;

            // For Al Maraghi Automotive: Match with seconds (HH:MM:SS AM/PM)
            if (includeSeconds) {
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

            // Standard format without seconds
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

    const matchPunchesToShiftPoints = (dayPunches, shift) => {
        if (!shift || dayPunches.length === 0) return [];
        
        // Enable seconds parsing for Al Maraghi Automotive
        const includeSeconds = project.company === 'Al Maraghi Automotive';
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw, includeSeconds)
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
        
        // Enable seconds parsing for Al Maraghi Automotive
        const includeSeconds = project.company === 'Al Maraghi Automotive';
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw, includeSeconds)
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

        // Enable seconds parsing for Al Maraghi Automotive
        const includeSeconds = project.company === 'Al Maraghi Automotive';

        const punchesWithTime = punchList.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw, includeSeconds)
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
        const attendanceIdNum = Number(result.attendance_id);
        const employeePunches = punches.filter(p => 
            Number(p.attendance_id) === attendanceIdNum &&
            p.punch_date >= dateFrom && 
            p.punch_date <= dateTo
        );
        const employeeShifts = shifts.filter(s => Number(s.attendance_id) === attendanceIdNum);
        const employeeExceptions = exceptions.filter(e => 
            (Number(e.attendance_id) === attendanceIdNum || e.attendance_id === 'ALL') &&
            e.use_in_analysis !== false &&
            e.is_custom_type !== true
        );

        const employee = employees.find(e => Number(e.attendance_id) === attendanceIdNum);
        
        // Enable seconds parsing for Al Maraghi Automotive
        const includeSeconds = project.company === 'Al Maraghi Automotive';

        let dayOverrides = {};
        if (result.day_overrides) {
            try {
                dayOverrides = JSON.parse(result.day_overrides);
            } catch (e) {}
        }

        let totalLateMinutes = 0;
        let totalEarlyCheckout = 0;
        let totalOtherMinutes = 0;
        let workingDays = 0;
        let presentDays = 0;
        let fullAbsenceCount = 0;
        let halfAbsenceCount = 0;
        let sickLeaveCount = 0;
        let annualLeaveCount = 0;

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

            workingDays++;

            const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw, includeSeconds);
                    const timeB = parseTime(b.timestamp_raw, includeSeconds);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            // Find all matching exceptions and get the latest one by created_date (calculateEmployeeTotals)
            const matchingExceptionsCalc = employeeExceptions.filter(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo &&
                       (String(ex.attendance_id) === 'ALL' || Number(ex.attendance_id) === attendanceIdNum);
            });

            const dateException = matchingExceptionsCalc.length > 0
                ? matchingExceptionsCalc.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
                : null;

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

            // Get current day name
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const currentDayName = dayNames[dayOfWeek];

            let shift = null;
            shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
            
            if (!shift) {
                // Try to find a general shift that applies to this day by checking applicable_days
                const applicableShifts = employeeShifts.filter(s => !s.date && isShiftEffective(s));
                
                for (const s of applicableShifts) {
                    // Check if shift has applicable_days specified
                    if (s.applicable_days) {
                        try {
                            const applicableDaysArray = JSON.parse(s.applicable_days);
                            if (Array.isArray(applicableDaysArray) && applicableDaysArray.length > 0) {
                                // Check if current day is in the applicable days list
                                if (applicableDaysArray.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) {
                                    shift = s;
                                    break;
                                }
                            }
                        } catch (e) {
                            // If parsing fails, continue to next shift
                        }
                    }
                }
                
                // If no applicable_days match found, fall back to is_friday_shift logic
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

            const dayOverride = dayOverrides[dateStr];

            // Apply shift override BEFORE any calculations
            if (dayOverride?.shiftOverride) {
                shift = {
                    am_start: dayOverride.shiftOverride.am_start,
                    am_end: dayOverride.shiftOverride.am_end,
                    pm_start: dayOverride.shiftOverride.pm_start,
                    pm_end: dayOverride.shiftOverride.pm_end
                };
            }

            const dayPunches = filterMultiplePunches(rawDayPunches, shift);
            const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                   shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                   shift.am_end !== '—' && shift.pm_start !== '—' &&
                                   shift.am_end !== '-' && shift.pm_start !== '-';
            const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;

            const partialDayResult = detectPartialDay(dayPunches, shift);

            // Track allowed minutes from ALLOWED_MINUTES exception
            let allowedMinutesForDay = 0;
            if (dateException && dateException.type === 'ALLOWED_MINUTES') {
                allowedMinutesForDay = dateException.allowed_minutes || 0;
            }

            // Initialize time tracking variables
            let currentOtherMinutes = 0;
            let exceptionLateMinutes = 0;
            let exceptionEarlyMinutes = 0;

            // Capture exception minutes for this specific date
            if (dateException && !dayOverride) {
                if (dateException.type !== 'OFF' && 
                    dateException.type !== 'PUBLIC_HOLIDAY' && 
                    dateException.type !== 'MANUAL_ABSENT' && 
                    dateException.type !== 'SICK_LEAVE') {
                    if (dateException.late_minutes && dateException.late_minutes > 0) {
                        exceptionLateMinutes = dateException.late_minutes;
                    }
                    if (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) {
                        exceptionEarlyMinutes = dateException.early_checkout_minutes;
                    }
                    if (dateException.other_minutes && dateException.other_minutes > 0) {
                        currentOtherMinutes = dateException.other_minutes;
                    }
                }
            }

            // Handle day override status changes
            if (dayOverride) {
                if (dayOverride.type === 'MANUAL_PRESENT') {
                    presentDays++;
                } else if (dayOverride.type === 'MANUAL_ABSENT') {
                    fullAbsenceCount++;
                } else if (dayOverride.type === 'MANUAL_HALF') {
                    presentDays++;
                    halfAbsenceCount++;
                } else if (dayOverride.type === 'OFF') {
                    workingDays--;
                }

                // If there's a manual override (no shift change), use those values directly and skip calculation
                if (!dayOverride.shiftOverride && dayOverride.lateMinutes !== undefined) {
                    totalLateMinutes += dayOverride.lateMinutes;
                    if (dayOverride.earlyCheckoutMinutes !== undefined) {
                        totalEarlyCheckout += dayOverride.earlyCheckoutMinutes;
                    }
                    if (dayOverride.otherMinutes !== undefined) {
                        totalOtherMinutes += dayOverride.otherMinutes;
                    }
                    continue;
                }
            }

            let punchMatchesTotals = [];
            if (shift && dayPunches.length > 0) {
                punchMatchesTotals = matchPunchesToShiftPoints(dayPunches, shift);
            }

            const shouldSkipTimeCalc = dateException && [
                'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
            ].includes(dateException.type);

            // Count based on actual attendance (if no override handled it)
            if (!dayOverride) {
                if (dateException) {
                    if (dateException.type === 'OFF' || dateException.type === 'PUBLIC_HOLIDAY') {
                        workingDays--;
                    } else if (dateException.type === 'MANUAL_PRESENT') {
                        presentDays++;
                    } else if (dateException.type === 'MANUAL_ABSENT') {
                        fullAbsenceCount++;
                    } else if (dateException.type === 'MANUAL_HALF') {
                        presentDays++;
                        halfAbsenceCount++;
                    } else if (dateException.type === 'SICK_LEAVE') {
                        // Sick leave counts regardless of punches
                        workingDays--;
                        sickLeaveCount++;
                    } else if (dateException.type === 'ANNUAL_LEAVE') {
                        // Annual leave counts if no punches
                        if (dayPunches.length === 0) {
                            workingDays--;
                            annualLeaveCount++;
                        } else {
                            presentDays++;
                        }
                    } else if (dayPunches.length > 0) {
                        presentDays++;
                    } else {
                        fullAbsenceCount++;
                    }
                } else if (dayPunches.length > 0) {
                    const partialDayResult = detectPartialDay(dayPunches, shift);
                    if (partialDayResult.isPartial) {
                        presentDays++;
                        halfAbsenceCount++;
                    } else {
                        presentDays++;
                    }
                } else {
                    fullAbsenceCount++;
                }
            }
            
            // Check if exception has manual time values - if so, skip punch calculation for this day
            const hasManualExceptionMinutes = exceptionLateMinutes > 0 || exceptionEarlyMinutes > 0 || currentOtherMinutes > 0;

            // Apply manual time adjustments from exception fields (exclusive - don't recalculate from punches)
            if (hasManualExceptionMinutes) {
                if (dateException.type !== 'OFF' && 
                    dateException.type !== 'PUBLIC_HOLIDAY' && 
                    dateException.type !== 'MANUAL_ABSENT' && 
                    dateException.type !== 'SICK_LEAVE') {
                    // Manual late/early exceptions should mark day as present
                    if ((dateException.type === 'MANUAL_LATE' || dateException.type === 'MANUAL_EARLY_CHECKOUT') && dayPunches.length === 0) {
                        presentDays++;
                    }

                    // Apply ALL manual time fields from exception (already stored in variables)
                    if (exceptionLateMinutes > 0) {
                        totalLateMinutes += exceptionLateMinutes;
                    }
                    if (exceptionEarlyMinutes > 0) {
                        totalEarlyCheckout += exceptionEarlyMinutes;
                    }
                    if (currentOtherMinutes > 0) {
                        totalOtherMinutes += currentOtherMinutes;
                    }
                }
            }
            
            // Calculate times from punches ONLY if no manual exception minutes exist
            if (shift && punchMatchesTotals.length > 0 && !partialDayResult.isPartial && !shouldSkipTimeCalc && !hasManualExceptionMinutes) {
                let dayLateMinutes = 0;
                let dayEarlyMinutes = 0;
                
                for (const match of punchMatchesTotals) {
                    if (!match.matchedTo) continue;
                    
                    const punchTime = match.punch.time;
                    const shiftTime = match.shiftTime;
                    
                    if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                        if (punchTime > shiftTime) {
                            const minutes = Math.round((punchTime - shiftTime) / (1000 * 60));
                            dayLateMinutes += minutes;
                        }
                    }
                    
                    if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                        if (punchTime < shiftTime) {
                            const minutes = Math.round((shiftTime - punchTime) / (1000 * 60));
                            dayEarlyMinutes += minutes;
                        }
                    }
                }
                
                // Apply allowed minutes - subtract from late/early
                const totalDayMinutes = dayLateMinutes + dayEarlyMinutes;
                if (allowedMinutesForDay > 0 && totalDayMinutes > 0) {
                    const remaining = Math.max(0, totalDayMinutes - allowedMinutesForDay);
                    // Proportionally reduce late and early
                    if (totalDayMinutes > 0) {
                        const lateRatio = dayLateMinutes / totalDayMinutes;
                        const earlyRatio = dayEarlyMinutes / totalDayMinutes;
                        dayLateMinutes = Math.round(remaining * lateRatio);
                        dayEarlyMinutes = Math.round(remaining * earlyRatio);
                    }
                }
                
                totalLateMinutes += dayLateMinutes;
                totalEarlyCheckout += dayEarlyMinutes;
            }
        }

        return { 
            totalLateMinutes, 
            totalEarlyCheckout, 
            totalOtherMinutes,
            workingDays, 
            presentDays, 
            fullAbsenceCount, 
            halfAbsenceCount, 
            sickLeaveCount,
            annualLeaveCount
        };
    };

    // Separate calculation from verification state to prevent unnecessary recalculations
    const baseEnrichedResults = React.useMemo(() => {
        return results.map(result => {
            const employee = employees.find(e => Number(e.attendance_id) === Number(result.attendance_id));
            
            // For closed projects, use saved data from AnalysisResult (punches are deleted)
            if (project.status === 'closed') {
                return {
                    ...result,
                    name: employee?.name || 'Unknown',
                    working_days: result.working_days,
                    present_days: result.present_days,
                    full_absence_count: result.full_absence_count,
                    half_absence_count: result.half_absence_count,
                    sick_leave_count: result.sick_leave_count || 0,
                    annual_leave_count: result.annual_leave_count || 0,
                    late_minutes: result.late_minutes || 0,
                    early_checkout_minutes: result.early_checkout_minutes || 0,
                    other_minutes: result.other_minutes || 0
                };
            }
            
            // For open projects, recalculate from punch data
            const { 
                totalLateMinutes, 
                totalEarlyCheckout, 
                totalOtherMinutes,
                workingDays, 
                presentDays, 
                fullAbsenceCount, 
                halfAbsenceCount, 
                sickLeaveCount,
                annualLeaveCount
            } = calculateEmployeeTotals(result, reportRun.date_from, reportRun.date_to);

            return {
                ...result,
                name: employee?.name || 'Unknown',
                working_days: workingDays,
                present_days: presentDays,
                full_absence_count: fullAbsenceCount,
                half_absence_count: halfAbsenceCount,
                sick_leave_count: sickLeaveCount,
                annual_leave_count: annualLeaveCount,
                late_minutes: Math.max(0, totalLateMinutes),
                early_checkout_minutes: Math.max(0, totalEarlyCheckout),
                other_minutes: Math.max(0, totalOtherMinutes)
            };
        });
    }, [results, employees, punches, shifts, exceptions, reportRun, project.status]);

    // Add verification state separately to avoid expensive recalculations
    const enrichedResults = React.useMemo(() => {
        return baseEnrichedResults.map(result => ({
            ...result,
            isVerified: verifiedEmployees.includes(String(result.attendance_id))
        }));
    }, [baseEnrichedResults, verifiedEmployees]);

    const filteredResults = React.useMemo(() => {
        return enrichedResults
            .filter(result => {
                const matchesSearch = String(result.attendance_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
                    result.name.toLowerCase().includes(searchTerm.toLowerCase());
                
                if (!matchesSearch) return false;
                
                // Risk-based filtering
                if (riskFilter === 'high-risk') {
                    const total = (result.late_minutes || 0) + (result.early_checkout_minutes || 0);
                    const hasHighAbsence = result.full_absence_count > 2;
                    const hasHighMinutes = total > 120;
                    return hasHighAbsence || hasHighMinutes;
                } else if (riskFilter === 'clean') {
                    const total = (result.late_minutes || 0) + (result.early_checkout_minutes || 0);
                    return result.full_absence_count === 0 && total === 0;
                } else if (riskFilter === 'unverified') {
                    return !result.isVerified;
                }
                
                return true;
            })
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
        onError: () => {
            // Only invalidate on error to refetch correct state
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
            toast.error('Failed to update verification');
        }
    });

    // Debounce verification updates to prevent rate limiting
    const debounceTimeoutRef = React.useRef(null);
    const pendingVerifiedRef = React.useRef(null);
    
    const toggleVerification = (attendanceId) => {
        const attendanceIdStr = String(attendanceId);
        const newVerified = verifiedEmployees.includes(attendanceIdStr) 
            ? verifiedEmployees.filter(id => id !== attendanceIdStr)
            : [...verifiedEmployees, attendanceIdStr];
        
        // Update local state immediately for instant UI feedback
        setVerifiedEmployees(newVerified);
        
        // Store pending changes
        pendingVerifiedRef.current = newVerified;
        
        // Clear existing timeout
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        
        // Debounce the API call by 1.5 seconds to batch multiple clicks
        debounceTimeoutRef.current = setTimeout(() => {
            if (pendingVerifiedRef.current) {
                updateVerificationMutation.mutate(pendingVerifiedRef.current);
                pendingVerifiedRef.current = null;
            }
        }, 1500);
    };

    // Cleanup timeout on unmount and save pending changes
    React.useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
            // Save any pending changes before unmount
            if (pendingVerifiedRef.current) {
                updateVerificationMutation.mutate(pendingVerifiedRef.current);
            }
        };
    }, []);

    const verifyAllClean = () => {
        const cleanEmployees = enrichedResults
            .filter(r => {
                const total = (r.late_minutes || 0) + (r.early_checkout_minutes || 0);
                return r.full_absence_count === 0 && total === 0;
            })
            .map(r => String(r.attendance_id));
        
        const newVerified = [...new Set([...verifiedEmployees, ...cleanEmployees])];
        setVerifiedEmployees(newVerified);
        updateVerificationMutation.mutate(newVerified);
        toast.success(`${cleanEmployees.length} employees verified`);
    };

    const finalizeReportMutation = useMutation({
        mutationFn: async () => {
            const response = await base44.functions.invoke('adminFinalizeReport', {
                report_run_id: reportRun.id,
                project_id: project.id
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
            queryClient.invalidateQueries(['project', project.id]);
            toast.success('Report finalized successfully - Ready for salary calculation');
        },
        onError: (error) => {
            toast.error('Failed to finalize report: ' + error.message);
        }
    });

    const saveReportMutation = useMutation({
        mutationFn: async () => {
            setIsSaving(true);
            setSaveProgress({ current: 0, total: 100, status: 'Preparing exceptions...' });
            
            // Set this as the last saved report
            await base44.entities.Project.update(project.id, {
                last_saved_report_id: reportRun.id
            });
            
            // Delete existing report-generated exceptions for this report to prevent duplicates
            const existingReportExceptions = exceptions.filter(e => 
                e.created_from_report && e.report_run_id === reportRun.id
            );
            
            if (existingReportExceptions.length > 0) {
                setSaveProgress({ current: 0, total: 100, status: 'Removing old exceptions...' });
                for (const ex of existingReportExceptions) {
                    await base44.entities.Exception.delete(ex.id);
                }
            }
            
            const exceptionsToCreate = [];
            
            // Determine if current user made any edits that need approval
            const isCurrentUserRegular = userRole === 'user';
            
            for (const result of results) {
                if (!result.day_overrides) continue;
                
                let dayOverrides = {};
                try {
                    dayOverrides = JSON.parse(result.day_overrides);
                } catch (e) {
                    continue;
                }

                // Check if this result's employee belongs to the current user
                const employee = employees.find(e => Number(e.attendance_id) === Number(result.attendance_id));
                const isOwnRecord = isCurrentUserRegular && currentUser && employee?.company === currentUser.company;

                const datesByType = {};
                Object.entries(dayOverrides).forEach(([dateStr, override]) => {
                    // Group by type, minutes, and shift override to create separate exceptions
                    const key = `${result.attendance_id}_${override.type}_${override.lateMinutes || 0}_${override.earlyCheckoutMinutes || 0}_${override.otherMinutes || 0}_${JSON.stringify(override.shiftOverride || {})}`;
                    if (!datesByType[key]) {
                        datesByType[key] = { 
                            dates: [], 
                            data: override, 
                            attendance_id: result.attendance_id 
                        };
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
                        // Edits from reports need department head approval
                        const needsApproval = true;

                        // Build detailed description
                        const detailsParts = [];
                        if (group.data.lateMinutes > 0) {
                            detailsParts.push(`+${group.data.lateMinutes} late min`);
                        }
                        if (group.data.earlyCheckoutMinutes > 0) {
                            detailsParts.push(`+${group.data.earlyCheckoutMinutes} early min`);
                        }
                        if (group.data.otherMinutes > 0) {
                            detailsParts.push(`+${group.data.otherMinutes} other min`);
                        }
                        if (group.data.shiftOverride) {
                            detailsParts.push('shift override');
                        }
                        if (group.data.details) {
                            detailsParts.push(group.data.details);
                        }

                        const detailsText = detailsParts.length > 0 
                            ? `Report edit: ${detailsParts.join(' | ')}`
                            : 'Report edit: Manual adjustment from report';

                        const exceptionData = {
                            project_id: project.id,
                            attendance_id: String(group.attendance_id),
                            date_from: range.start,
                            date_to: range.end,
                            type: group.data.type,
                            details: detailsText,
                            created_from_report: true,
                            report_run_id: reportRun.id,
                            use_in_analysis: true,
                            approval_status: needsApproval ? 'pending_dept_head' : 'approved'
                        };

                        // Store ALL time adjustment fields
                        if (group.data.lateMinutes && group.data.lateMinutes > 0) {
                            exceptionData.late_minutes = group.data.lateMinutes;
                        }
                        if (group.data.earlyCheckoutMinutes && group.data.earlyCheckoutMinutes > 0) {
                            exceptionData.early_checkout_minutes = group.data.earlyCheckoutMinutes;
                        }
                        if (group.data.otherMinutes && group.data.otherMinutes > 0) {
                            exceptionData.other_minutes = group.data.otherMinutes;
                        }

                        // Determine type based on what's present (override the initial type)
                        if (group.data.shiftOverride) {
                            exceptionData.type = 'SHIFT_OVERRIDE';
                            exceptionData.new_am_start = group.data.shiftOverride.am_start;
                            exceptionData.new_am_end = group.data.shiftOverride.am_end;
                            exceptionData.new_pm_start = group.data.shiftOverride.pm_start;
                            exceptionData.new_pm_end = group.data.shiftOverride.pm_end;
                        } else if (exceptionData.late_minutes > 0 && exceptionData.early_checkout_minutes > 0) {
                            exceptionData.type = 'MANUAL_LATE';
                        } else if (exceptionData.late_minutes > 0) {
                            exceptionData.type = 'MANUAL_LATE';
                        } else if (exceptionData.early_checkout_minutes > 0) {
                            exceptionData.type = 'MANUAL_EARLY_CHECKOUT';
                        } else if (exceptionData.other_minutes > 0) {
                            exceptionData.type = 'MANUAL_OTHER_MINUTES';
                        }
                        // If none of the time fields are set, keep the original type from group.data.type

                        exceptionsToCreate.push(exceptionData);
                    }
                }
            }

            if (exceptionsToCreate.length > 0) {
                const batchSize = 20;
                const totalBatches = Math.ceil(exceptionsToCreate.length / batchSize);
                
                for (let i = 0; i < exceptionsToCreate.length; i += batchSize) {
                    const batch = exceptionsToCreate.slice(i, i + batchSize);
                    await base44.entities.Exception.bulkCreate(batch);
                    
                    const batchNumber = Math.floor(i / batchSize) + 1;
                    setSaveProgress({ 
                        current: batchNumber, 
                        total: totalBatches, 
                        status: `Saving exceptions ${batchNumber}/${totalBatches}...` 
                    });
                }
            }

            return exceptionsToCreate.length;
        },
        onSuccess: async (exceptionCount) => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
            toast.success(`Report saved! ${exceptionCount} exception${exceptionCount !== 1 ? 's' : ''} created from edits.`);
            
            // Always generate approval links for admins (regardless of edit count)
            if (isAdmin) {
                try {
                    setSaveProgress({ current: 100, total: 100, status: 'Generating approval links...' });
                    
                    const response = await base44.functions.invoke('generateApprovalLinks', {
                        report_run_id: reportRun.id,
                        project_id: project.id,
                        company: project.company
                    });
                    
                    if (response.data.success && response.data.links && response.data.links.length > 0) {
                        setApprovalLinks(response.data.links);
                        setShowLinksDialog(true);
                        queryClient.invalidateQueries(['approvalLinks']);
                        toast.success(`Approval links generated for ${response.data.links.length} department${response.data.links.length !== 1 ? 's' : ''}`);
                    } else if (response.data.warnings && response.data.warnings.length > 0) {
                        // Show all warnings to help debug
                        response.data.warnings.forEach(warning => toast.warning(warning));
                    } else if (response.data.skipped_exceptions && response.data.skipped_exceptions.length > 0) {
                        // Show why exceptions were skipped
                        const reasons = response.data.skipped_exceptions.map(s => 
                            `${s.attendance_id || s.employee_name}: ${s.reason}`
                        ).join('\n');
                        toast.warning(`Exceptions skipped:\n${reasons}`);
                    } else if (response.data.message) {
                        toast.info(response.data.message);
                    }
                } catch (linkError) {
                    console.error('Failed to generate approval links:', linkError);
                    toast.error('Failed to generate approval links: ' + linkError.message);
                }
            }
            
            setIsSaving(false);
            setSaveProgress(null);
        },
        onError: (error) => {
            toast.error('Failed to save report: ' + error.message);
            setIsSaving(false);
            setSaveProgress(null);
        }
    });

    const exportToExcel = () => {
        if (filteredResults.length === 0) {
            toast.error('No data to export');
            return;
        }

        const headers = ['Attendance ID', 'Name', 'Total Working Days', 'Annual Leave', 'Sick Leave', 'LOP Days', 'Late Minutes', 'Early Checkout', 'Grace', 'Approved Minutes', 'Deductible', 'Notes'];
        const rows = filteredResults.map(r => {
            const total = (r.late_minutes || 0) + (r.early_checkout_minutes || 0) + (r.other_minutes || 0);
            const grace = r.grace_minutes ?? 15;
            const approved = r.approved_minutes || 0;
            const deductible = Math.max(0, total - grace - approved);

            return [
                r.attendance_id,
                r.name,
                r.working_days,
                r.annual_leave_count || 0,
                r.sick_leave_count || 0,
                r.full_absence_count,
                r.late_minutes,
                r.early_checkout_minutes || 0,
                grace,
                approved,
                deductible,
                r.notes || ''
            ];
        });

        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        XLSX.writeFile(wb, `report_${reportRun.date_from}_to_${reportRun.date_to}.xlsx`);
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
        
        const attendanceIdNum = Number(currentResult.attendance_id);
        const employeePunches = punches.filter(p => 
            Number(p.attendance_id) === attendanceIdNum &&
            p.punch_date >= reportRun.date_from && 
            p.punch_date <= reportRun.date_to
        );
        const employeeShifts = shifts.filter(s => Number(s.attendance_id) === attendanceIdNum);
        const employeeExceptions = exceptions.filter(e => 
            (Number(e.attendance_id) === attendanceIdNum || e.attendance_id === 'ALL') &&
            e.use_in_analysis !== false &&
            e.is_custom_type !== true
        );

        const employee = employees.find(e => Number(e.attendance_id) === attendanceIdNum);
        
        // Enable seconds parsing for Al Maraghi Automotive
        const includeSeconds = project.company === 'Al Maraghi Automotive';

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
                    const timeA = parseTime(a.timestamp_raw, includeSeconds);
                    const timeB = parseTime(b.timestamp_raw, includeSeconds);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            // Find all matching exceptions and get the latest one by created_date (getDailyBreakdown)
            const matchingExceptionsDaily = employeeExceptions.filter(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo &&
                       (String(ex.attendance_id) === 'ALL' || Number(ex.attendance_id) === attendanceIdNum);
            });

            const dateException = matchingExceptionsDaily.length > 0
                ? matchingExceptionsDaily.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
                : null;

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

            // Get current day name
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const currentDayName = dayNames[dayOfWeek];

            let shift = null;
            shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
            
            if (!shift) {
                // Try to find a general shift that applies to this day by checking applicable_days
                const applicableShifts = employeeShifts.filter(s => !s.date && isShiftEffective(s));
                
                for (const s of applicableShifts) {
                    // Check if shift has applicable_days specified
                    if (s.applicable_days) {
                        try {
                            const applicableDaysArray = JSON.parse(s.applicable_days);
                            if (Array.isArray(applicableDaysArray) && applicableDaysArray.length > 0) {
                                // Check if current day is in the applicable days list
                                if (applicableDaysArray.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) {
                                    shift = s;
                                    break;
                                }
                            }
                        } catch (e) {
                            // If parsing fails, continue to next shift
                        }
                    }
                }
                
                // If no applicable_days match found, fall back to is_friday_shift logic
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
            
            // Initialize time tracking variables BEFORE any usage
            let currentOtherMinutes = 0;
            let exceptionLateMinutes = 0;
            let exceptionEarlyMinutes = 0;

            // Capture exception minutes for this specific date
            if (dateException && !dayOverrides[dateStr]) {
                if (dateException.type !== 'OFF' && 
                    dateException.type !== 'PUBLIC_HOLIDAY' && 
                    dateException.type !== 'MANUAL_ABSENT' && 
                    dateException.type !== 'SICK_LEAVE' &&
                    dateException.type !== 'ANNUAL_LEAVE') {
                    if (dateException.late_minutes && dateException.late_minutes > 0) {
                        exceptionLateMinutes = dateException.late_minutes;
                    }
                    if (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) {
                        exceptionEarlyMinutes = dateException.early_checkout_minutes;
                    }
                    if (dateException.other_minutes && dateException.other_minutes > 0) {
                        currentOtherMinutes = dateException.other_minutes;
                    }
                }
            }

            // Track allowed minutes from ALLOWED_MINUTES exception
            let allowedMinutesForDay = 0;
            if (dateException && dateException.type === 'ALLOWED_MINUTES') {
                allowedMinutesForDay = dateException.allowed_minutes || 0;
            }
            
            const shouldSkipTimeCalc = dateException && [
                'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
            ].includes(dateException.type);

            // Check if exception has manual minutes - skip punch calculation if it does
            const hasExceptionMinutes = exceptionLateMinutes > 0 || exceptionEarlyMinutes > 0 || currentOtherMinutes > 0;

            if (shift && punchMatches.length > 0 && !shouldSkipTimeCalc && !hasExceptionMinutes) {
                let dayLateMinutes = 0;
                let dayEarlyMinutes = 0;
                
                for (const match of punchMatches) {
                    if (!match.matchedTo) continue;
                    
                    const punchTime = match.punch.time;
                    const shiftTime = match.shiftTime;
                    
                    if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                        if (punchTime > shiftTime) {
                            const minutes = Math.round((punchTime - shiftTime) / (1000 * 60));
                            dayLateMinutes += minutes;
                            const label = match.matchedTo === 'AM_START' ? 'AM' : 'PM';
                            if (lateInfo) lateInfo += ' | ';
                            lateInfo += `${label}: ${minutes} min late`;
                        }
                    }
                    
                    if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                        if (punchTime < shiftTime) {
                            const minutes = Math.round((shiftTime - punchTime) / (1000 * 60));
                            dayEarlyMinutes += minutes;
                            if (earlyCheckoutInfo && earlyCheckoutInfo !== '-') {
                                earlyCheckoutInfo = `${parseInt(earlyCheckoutInfo) + minutes} min`;
                            } else {
                                earlyCheckoutInfo = `${minutes} min`;
                            }
                        }
                    }
                }
                
                // Apply allowed minutes - subtract from late/early
                const totalDayMinutes = dayLateMinutes + dayEarlyMinutes;
                if (allowedMinutesForDay > 0 && totalDayMinutes > 0) {
                    const remaining = Math.max(0, totalDayMinutes - allowedMinutesForDay);
                    // Proportionally reduce late and early
                    if (totalDayMinutes > 0) {
                        const lateRatio = dayLateMinutes / totalDayMinutes;
                        const earlyRatio = dayEarlyMinutes / totalDayMinutes;
                        const adjustedLate = Math.round(remaining * lateRatio);
                        const adjustedEarly = Math.round(remaining * earlyRatio);
                        
                        lateMinutesTotal = adjustedLate;
                        if (adjustedLate > 0) {
                            lateInfo = `${adjustedLate} min (after ${allowedMinutesForDay} allowed)`;
                        } else {
                            lateInfo = '-';
                        }
                        
                        if (adjustedEarly > 0) {
                            earlyCheckoutInfo = `${adjustedEarly} min (after ${allowedMinutesForDay} allowed)`;
                        } else {
                            earlyCheckoutInfo = '-';
                        }
                    }
                } else {
                    lateMinutesTotal = dayLateMinutes;
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
                else if (dateException.type === 'ANNUAL_LEAVE') status = dayPunches.length > 0 ? 'Present' : 'Annual Leave';
                else if (dateException.type === 'MANUAL_LATE' || dateException.type === 'MANUAL_EARLY_CHECKOUT') {
                    // Manual late/early should show as present
                    status = dayPunches.length > 0 ? 'Present' : 'Present (Manual)';
                } else if (dayPunches.length > 0) {
                    status = 'Present';
                }
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
                // Added for otherMinutes - keep separate from late/early calculations
                if (dayOverride.otherMinutes !== undefined && dayOverride.otherMinutes > 0) {
                    currentOtherMinutes = dayOverride.otherMinutes;
                }
                if (dayOverride.isAbnormal !== undefined) {
                    isAbnormal = dayOverride.isAbnormal;
                }
            }

            const extractTime = (ts) => {
                // For Al Maraghi Automotive: Handle seconds in timestamp (HH:MM:SS AM/PM)
                if (project.company === 'Al Maraghi Automotive') {
                    const matchWithSeconds = ts.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/i);
                    if (matchWithSeconds) return matchWithSeconds[1];
                }
                // Standard format without seconds
                const match = ts.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
                return match ? match[1] : ts;
            };

            // If exception has manual minutes, use them exclusively (not added to calculations)
            if (exceptionLateMinutes > 0 && !dayOverride) {
                lateMinutesTotal = exceptionLateMinutes;
                lateInfo = `${exceptionLateMinutes} min (from exception)`;
            }
            if (exceptionEarlyMinutes > 0 && !dayOverride) {
                earlyCheckoutInfo = `${exceptionEarlyMinutes} min (from exception)`;
            }

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
                otherMinutes: currentOtherMinutes,
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
            {saveProgress && (
                <Card className="border-0 shadow-sm bg-green-50 border-green-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-medium text-green-900">{saveProgress.status}</p>
                                <p className="text-sm text-green-700 mt-1">
                                    {saveProgress.current} / {saveProgress.total} completed
                                </p>
                            </div>
                        </div>
                        <div className="w-full bg-green-200 rounded-full h-2">
                            <div 
                                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${saveProgress.total > 0 ? (saveProgress.current / saveProgress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

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
                           {project.status !== 'closed' && (
                               <>
                                   <Button
                                       onClick={() => setShowSaveConfirmation(true)}
                                       disabled={isSaving}
                                       className="bg-green-600 hover:bg-green-700"
                                   >
                                       <Save className="w-4 h-4 mr-2" />
                                       {isSaving ? 'Saving...' : 'Save Report'}
                                   </Button>
                                   {isAdmin && (
                                       <Button
                                           onClick={() => finalizeReportMutation.mutate()}
                                           disabled={finalizeReportMutation.isPending}
                                           className="bg-purple-600 hover:bg-purple-700"
                                           title="Finalize report without generating approval links"
                                       >
                                           {finalizeReportMutation.isPending ? (
                                               <>
                                                   <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                   Finalizing...
                                               </>
                                           ) : (
                                               <>
                                                   <CheckCircle className="w-4 h-4 mr-2" />
                                                   Finalize Report
                                               </>
                                           )}
                                       </Button>
                                   )}
                               </>
                           )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                    <div className="flex gap-3 items-center">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by ID or name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={riskFilter} onValueChange={setRiskFilter}>
                            <SelectTrigger className="w-48">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Employees</SelectItem>
                                <SelectItem value="high-risk">High Risk (>2 LOP or >120 min)</SelectItem>
                                <SelectItem value="clean">Clean Records (0 issues)</SelectItem>
                                <SelectItem value="unverified">Unverified Only</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            onClick={verifyAllClean}
                            variant="outline"
                            size="sm"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Verify All Clean
                        </Button>
                    </div>
                </CardContent>
            </Card>

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
                                    <SortableTableHead sortKey="annual_leave_count" currentSort={sort} onSort={setSort}>
                                        Annual Leave
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="sick_leave_count" currentSort={sort} onSort={setSort}>
                                        Sick Leave
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="full_absence_count" currentSort={sort} onSort={setSort}>
                                        LOP Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="half_absence_count" currentSort={sort} onSort={setSort}>
                                        Half Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="late_minutes" currentSort={sort} onSort={setSort}>
                                        Late Minutes
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="early_checkout_minutes" currentSort={sort} onSort={setSort}>
                                        Early Checkout
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="approved_minutes" currentSort={sort} onSort={setSort}>
                                        Approved Minutes
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
                                            <span className={`${result.annual_leave_count > 0 ? 'text-blue-600 font-medium' : ''}`}>
                                                {result.annual_leave_count || 0}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`${result.sick_leave_count > 0 ? 'text-purple-600 font-medium' : ''}`}>
                                                {result.sick_leave_count || 0}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`${result.full_absence_count > 0 ? 'text-red-600 font-medium' : ''}`}>
                                                {result.full_absence_count}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`${result.half_absence_count > 0 ? 'text-amber-600 font-medium' : ''}`}>
                                                {result.half_absence_count || 0}
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
                                            <span className={`${result.approved_minutes > 0 ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                                                {result.approved_minutes || 0}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 group">
                                                <span>{result.grace_minutes ?? 15}</span>
                                                {!isUser && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => setEditingGraceMinutes(result)}
                                                    >
                                                        <Edit className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                const total = (result.late_minutes || 0) + (result.early_checkout_minutes || 0) + (result.other_minutes || 0);
                                                const grace = result.grace_minutes ?? 15;
                                                const approved = result.approved_minutes || 0;
                                                const deductible = Math.max(0, total - grace - approved);
                                                return (
                                                    <div className="flex flex-col">
                                                        <span className={`font-bold ${deductible > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            {deductible} min
                                                        </span>
                                                        <span className="text-[10px] text-slate-500">
                                                            {total} - {grace} - {approved}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                                            {result.notes || '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {project.status === 'closed' || !currentUser ? (
                                                <span className="text-xs text-slate-400">—</span>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => showDailyBreakdown(result)}
                                                    title="View daily breakdown"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

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
                                     <TableHead>Other Min</TableHead>
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
                                                               // For Al Maraghi Automotive: Handle seconds in timestamp (HH:MM:SS AM/PM)
                                                               if (project.company === 'Al Maraghi Automotive') {
                                                                   const matchWithSeconds = ts.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/i);
                                                                   if (matchWithSeconds) return matchWithSeconds[1];
                                                               }
                                                               // Standard format without seconds
                                                               const timeMatch = ts.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
                                                               return timeMatch ? timeMatch[1] : ts;
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
                                        <TableCell className="text-xs">
                                            {day.otherMinutes > 0 ? (
                                                <span className="text-purple-600 font-medium">{day.otherMinutes} min</span>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
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
                dailyBreakdownData={{ [selectedEmployee?.attendance_id]: { daily_details: getDailyBreakdown.reduce((acc, day) => ({ ...acc, [day.dateStr]: { punches: day.punchTimes.split(', ').filter(Boolean) } }), {}) } }}
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
                                {isUser ? (
                                    <li>• Your edits will be marked as pending and require admin/supervisor approval</li>
                                ) : (
                                    <li>• Admin/supervisor edits will be automatically approved and used in future analysis</li>
                                )}
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

            {/* Approval Links Dialog */}
            <Dialog open={showLinksDialog} onOpenChange={setShowLinksDialog}>
                <DialogContent className="max-w-4xl max-h-[85vh]">
                    <DialogHeader>
                        <DialogTitle>Department Head Approval Links</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4 overflow-y-auto max-h-[calc(85vh-120px)]">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-800">
                                Share these links with department heads to review and approve exception requests. 
                                Each link is unique and expires in {approvalLinks[0] ? '3 days' : 'the configured time'}.
                            </p>
                        </div>
                        
                        {approvalLinks.map((link, idx) => {
                            // Use the full_link from backend which includes CUSTOM_DOMAIN
                            const linkUrl = link.full_link || `${window.location.origin}/DeptHeadApproval?token=${link.link_token}`;
                            const messageText = `Dear Department Head,

Please find the verification link below to review and approve the attendance exceptions for ${link.department}:

${linkUrl}

Verification Code: ${link.verification_code}

This link will expire on ${new Date(link.expires_at).toLocaleDateString()}.

Thank you.`;
                            return (
                            <Card key={idx} className="border-indigo-200 bg-indigo-50">
                                <CardContent className="p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-slate-900">{link.department}</p>
                                            <p className="text-sm text-slate-600">Department Head: {link.department_head_name}</p>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {link.exception_count} exception{link.exception_count !== 1 ? 's' : ''} to review
                                            </p>
                                        </div>
                                        <span className="text-xs text-slate-500">
                                            Expires: {new Date(link.expires_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <div>
                                            <Label className="text-xs text-slate-600 mb-2 block">Complete Message</Label>
                                            <div className="bg-white rounded-lg p-3 border border-slate-200 mb-2">
                                                <pre className="text-xs whitespace-pre-wrap font-sans text-slate-700">{messageText}</pre>
                                            </div>
                                            <Button
                                                size="sm"
                                                className="w-full"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(messageText);
                                                    toast.success('Message copied to clipboard');
                                                }}
                                            >
                                                <Copy className="w-4 h-4 mr-2" />
                                                Copy Complete Message
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                        })}
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={() => setShowLinksDialog(false)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}