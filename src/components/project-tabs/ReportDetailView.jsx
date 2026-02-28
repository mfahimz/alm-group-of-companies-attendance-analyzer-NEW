import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Table components used by DailyBreakdownDialog (extracted)
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Search, Eye, Edit, Save, Filter, Loader2, CheckCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import InlineEditableCell from './InlineEditableCell';
import RamadanGiftCellWidget from './RamadanGiftCell';
import { GraceMinutesDialog, SaveConfirmationDialog, FinalizationProgressDialog } from './ReportDetailDialogs';
import { AL_MARAGHI_MOTORS_COMPANY_ID } from '@/constants/companyIds';
import DailyBreakdownDialog from './DailyBreakdownDialog';
import * as XLSX from 'xlsx';

export default function ReportDetailView({ reportRun, project, isDepartmentHead = false, deptHeadVerification = null }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [editingDay, setEditingDay] = useState(null);
    const [editingGraceMinutes, setEditingGraceMinutes] = useState(null);
    const [sort, setSort] = useState({ key: 'deductible_minutes', direction: 'desc' });
    const [verifiedEmployees, setVerifiedEmployees] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
    const [saveProgress, setSaveProgress] = useState(null);
    const [riskFilter, setRiskFilter] = useState('all');
    const [finalizationProgress, setFinalizationProgress] = useState({
        open: false,
        current: 0,
        total: 0,
        currentEmployee: '',
        status: 'Processing...'
    });
    const [ramadanGiftOverrides, setRamadanGiftOverrides] = useState({});

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isCEO = userRole === 'ceo';
    const isHRManager = userRole === 'hr_manager';
    const canEditRamadanGift = isAdmin || isCEO || isHRManager;

    const { data: allResults = [] } = useQuery({
        queryKey: ['results', reportRun.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ report_run_id: reportRun.id }, null, 5000),
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: allEmployees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company }),
        staleTime: 15 * 60 * 1000, // Cache for 15 minutes
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: companyRecord = null } = useQuery({
        queryKey: ['companyByName', project.company],
        queryFn: async () => {
            const companies = await base44.entities.Company.filter({ name: project.company }, null, 10);
            return companies[0] || null;
        },
        enabled: !!project?.company,
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: ramadanSchedules = [] } = useQuery({
        queryKey: ['ramadanSchedules', project.company],
        queryFn: () => base44.entities.RamadanSchedule.filter({ company: project.company, active: true }, null, 500),
        enabled: !!project?.company,
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // Filter employees and results for department heads - MUST use managed_employee_ids
    const employees = React.useMemo(() => {
        if (!isDepartmentHead || !deptHeadVerification?.verified) {
            return allEmployees;
        }
        
        const managedIds = deptHeadVerification.assignment.managed_employee_ids 
            ? deptHeadVerification.assignment.managed_employee_ids.split(',').map(id => String(id.trim()))
            : [];
        
        if (managedIds.length === 0) return [];
        
        // Filter to only managed subordinates using Employee IDs (not HRMS IDs)
        // CRITICAL: Exclude department head from the list
        return allEmployees.filter(emp => 
            managedIds.includes(String(emp.id)) && 
            String(emp.id) !== String(deptHeadVerification.assignment.employee_id)
        );
    }, [allEmployees, isDepartmentHead, deptHeadVerification]);

    const results = React.useMemo(() => {
        if (!isDepartmentHead || !deptHeadVerification?.verified) {
            return allResults;
        }
        
        // Filter results to only show department head's subordinates
        const departmentAttendanceIds = employees.map(emp => String(emp.attendance_id));
        return allResults.filter(result => 
            departmentAttendanceIds.includes(String(result.attendance_id))
        );
    }, [allResults, isDepartmentHead, deptHeadVerification, employees]);

    // Source of truth for UI display/editing: AnalysisResult.ramadan_gift_minutes per row
    React.useEffect(() => {
        if (!results || results.length === 0) return;
        const seeded = {};
        results.forEach(r => {
            seeded[r.id] = Math.max(0, Number(r.ramadan_gift_minutes ?? 0));
        });
        setRamadanGiftOverrides(seeded);
    }, [results]);

    // Fetch punches and shifts for daily breakdown (needed even for closed projects)
    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id }),
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id }),
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id }),
        staleTime: 15 * 60 * 1000, // Cache for 15 minutes
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
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

            // Standard format with AM/PM
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

            // Handle timestamp_raw format: "1/16/2026 8:37" or "1/16/2026 14:28" (24-hour without AM/PM)
            // Extract time part from date/time string
            const dateTimeMatch = timeStr.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (dateTimeMatch) {
                const hours = parseInt(dateTimeMatch[1]);
                const minutes = parseInt(dateTimeMatch[2]);
                const seconds = dateTimeMatch[3] ? parseInt(dateTimeMatch[3]) : 0;

                const date = new Date();
                date.setHours(hours, minutes, seconds, 0);
                return date;
            }

            // Pure 24-hour format: "8:37" or "14:28" or "8:37:00"
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
            let isFarExtendedMatch = false;
            
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
            
            if (!closestMatch) {
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    
                    const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                    
                    if (distance <= 180 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                        isFarExtendedMatch = true;
                    }
                }
            }
            
            if (closestMatch) {
                matches.push({
                    punch,
                    matchedTo: closestMatch.type,
                    shiftTime: closestMatch.time,
                    distance: minDistance,
                    isExtendedMatch,
                    isFarExtendedMatch
                });
                usedShiftPoints.add(closestMatch.type);
            } else {
                matches.push({
                    punch,
                    matchedTo: null,
                    shiftTime: null,
                    distance: null,
                    isExtendedMatch: false,
                    isFarExtendedMatch: false
                });
            }
        }
        
        return matches;
    };

    const detectPartialDay = (dayPunches, shift) => {
        if (!shift || dayPunches.length < 2) return { isPartial: false, reason: null };
        const incSec = project.company === 'Al Maraghi Automotive';
        const pts = dayPunches.map(p => ({ ...p, time: parseTime(p.timestamp_raw, incSec) })).filter(p => p.time).sort((a, b) => a.time - b.time);
        if (pts.length < 2) return { isPartial: false, reason: null };
        const amStart = parseTime(shift.am_start), amEnd = parseTime(shift.am_end), pmStart = parseTime(shift.pm_start);
        let pmEnd = parseTime(shift.pm_end);
        if (!amStart || !pmEnd) return { isPartial: false, reason: null };
        if (pmEnd.getHours() === 0 && pmEnd.getMinutes() === 0) pmEnd = new Date(pmEnd.getTime() + 86400000);
        const mid = amEnd && pmStart && String(shift.am_end||'').trim() !== '' && String(shift.pm_start||'').trim() !== '' && shift.am_end !== '—' && shift.pm_start !== '—' && shift.am_end !== '-' && shift.pm_start !== '-';
        const single = shift.is_single_shift === true || !mid;
        const expected = single ? (pmEnd - amStart) / 60000 : ((amEnd ? (amEnd - amStart) / 60000 : 0) + (pmStart ? (pmEnd - pmStart) / 60000 : 0));
        const actual = (pts[pts.length - 1].time - pts[0].time) / 60000;
        if (expected > 0 && actual < expected * 0.5 && actual > 0) return { isPartial: true, reason: `Worked ${Math.round(actual)} min (expected ${Math.round(expected)} min)` };
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
        // CRITICAL FIX: For finalized reports, return stored values WITHOUT recalculation
        // Finalized reports must be immutable - no punch/shift/exception recalculation
        const isFinalized = reportRun.is_final || project.status === 'closed';
        
        if (isFinalized) {
            // Return stored values AS-IS from finalized AnalysisResult
            return {
                totalLateMinutes: result.late_minutes || 0,
                totalEarlyCheckout: result.early_checkout_minutes || 0,
                totalOtherMinutes: result.other_minutes || 0,
                workingDays: result.working_days || 0,
                presentDays: result.present_days || 0,
                fullAbsenceCount: result.full_absence_count || 0,
                halfAbsenceCount: result.half_absence_count || 0,
                sickLeaveCount: result.sick_leave_count || 0,
                annualLeaveCount: result.annual_leave_count || 0
            };
        }
        
        // NON-FINALIZED ONLY: Recalculate from live punch data
        const attendanceIdStr = String(result.attendance_id);
        const employeePunches = punches.filter(p => 
            String(p.attendance_id) === attendanceIdStr &&
            p.punch_date >= dateFrom && 
            p.punch_date <= dateTo
        );
        const employeeShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
        const employeeExceptions = exceptions.filter(e => 
            (e.attendance_id === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
            e.use_in_analysis !== false &&
            e.is_custom_type !== true
        );

        const employee = employees.find(e => String(e.attendance_id) === attendanceIdStr);
        
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

        // Calculate annual leave as CALENDAR DAYS (not working days) - same as salary calculation
        const annualLeaveExceptions = employeeExceptions.filter(ex => ex.type === 'ANNUAL_LEAVE');
        const annualLeaveDatesProcessed = new Set();
        
        for (const alEx of annualLeaveExceptions) {
            try {
                const exFrom = new Date(alEx.date_from);
                const exTo = new Date(alEx.date_to);
                
                // Clamp to report date range
                const rangeStart = exFrom < startDate ? new Date(startDate) : new Date(exFrom);
                const rangeEnd = exTo > endDate ? new Date(endDate) : new Date(exTo);
                
                if (rangeStart <= rangeEnd) {
                    // Count each calendar day individually
                    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
                        const dateStr = d.toISOString().split('T')[0];
                        annualLeaveDatesProcessed.add(dateStr);
                    }
                }
            } catch {
                // Skip invalid date ranges
            }
        }
        annualLeaveCount = annualLeaveDatesProcessed.size;

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
                return currentDate >= exFrom && currentDate <= exTo;
            });

            const dateException = matchingExceptionsCalc && matchingExceptionsCalc.length > 0
                ? matchingExceptionsCalc.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
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
                        const appDays = s.applicable_days;
                        
                        // Try JSON array first
                        try {
                            const applicableDaysArray = JSON.parse(appDays);
                            if (Array.isArray(applicableDaysArray) && applicableDaysArray.length > 0) {
                                if (applicableDaysArray.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) {
                                    shift = s;
                                    break;
                                }
                                continue; // Move to next shift if JSON parsed but day not found
                            }
                        } catch (e) {
                            // Not JSON, try string matching
                        }
                        
                        // Handle string format like "Monday to Thursday and Saturday" or "Friday"
                        const appDaysLower = appDays.toLowerCase();
                        const dayLower = currentDayName.toLowerCase();
                        
                        // Direct match (e.g., "Friday")
                        if (appDaysLower.includes(dayLower)) {
                            shift = s;
                            break;
                        }
                        
                        // Handle range patterns like "Monday to Thursday"
                        const rangeMatch = appDaysLower.match(/(\w+)\s+to\s+(\w+)/);
                        if (rangeMatch) {
                            const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                            const startIdx = dayOrder.indexOf(rangeMatch[1]);
                            const endIdx = dayOrder.indexOf(rangeMatch[2]);
                            const currentIdx = dayOrder.indexOf(dayLower);
                            
                            if (startIdx !== -1 && endIdx !== -1 && currentIdx !== -1) {
                                if (currentIdx >= startIdx && currentIdx <= endIdx) {
                                    shift = s;
                                    break;
                                }
                            }
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
                } else if (dayOverride.type === 'SICK_LEAVE') {
                    // Sick leave from day override: counts as working day, no LOP, no time calculations
                    sickLeaveCount++;
                }

                // If there's a manual override (no shift change), use those values directly and skip calculation
                if (!dayOverride.shiftOverride && dayOverride.lateMinutes !== undefined) {
                    // SICK_LEAVE override: skip all time calculations
                    if (dayOverride.type === 'SICK_LEAVE') {
                        continue;
                    }
                    totalLateMinutes += dayOverride.lateMinutes;
                    if (dayOverride.earlyCheckoutMinutes !== undefined) {
                        totalEarlyCheckout += dayOverride.earlyCheckoutMinutes;
                    }
                    if (dayOverride.otherMinutes !== undefined) {
                        totalOtherMinutes += dayOverride.otherMinutes;
                    }
                    continue;
                }
                // SICK_LEAVE override without manual minutes: still skip time calculations
                if (dayOverride.type === 'SICK_LEAVE') {
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
                        // Sick leave counts as WORKING DAY (no deduction from working_days)
                        // Day is tracked separately as sick_leave_count
                        // No LOP deduction, no late/early calculation for this day
                        sickLeaveCount++;
                    } else if (dateException.type === 'ANNUAL_LEAVE') {
                        // Annual leave - already counted as calendar days upfront
                        // Skip this day for attendance counting
                        if (dayPunches.length === 0) {
                            workingDays--;
                            // Don't increment annualLeaveCount here - already counted upfront
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
                        totalLateMinutes += Math.abs(exceptionLateMinutes);
                    }
                    if (exceptionEarlyMinutes > 0) {
                        totalEarlyCheckout += Math.abs(exceptionEarlyMinutes);
                    }
                    if (currentOtherMinutes > 0) {
                        totalOtherMinutes += Math.abs(currentOtherMinutes);
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
            totalLateMinutes: Math.max(0, totalLateMinutes), 
            totalEarlyCheckout: Math.max(0, totalEarlyCheckout), 
            totalOtherMinutes: Math.max(0, totalOtherMinutes),
            workingDays: Math.max(0, workingDays), 
            presentDays: Math.max(0, presentDays), 
            fullAbsenceCount: Math.max(0, fullAbsenceCount), 
            halfAbsenceCount: Math.max(0, halfAbsenceCount), 
            sickLeaveCount: Math.max(0, sickLeaveCount),
            annualLeaveCount: Math.max(0, annualLeaveCount)
        };
    };

    const isAlMaraghiMotors = Number(companyRecord?.company_id) === AL_MARAGHI_MOTORS_COMPANY_ID;
    const hasRamadanSchedule = React.useMemo(() => {
        if (!reportRun?.date_from || !reportRun?.date_to) return false;
        const projectStart = new Date(reportRun.date_from);
        const projectEnd = new Date(reportRun.date_to);

        return ramadanSchedules.some(schedule => {
            const start = new Date(schedule.ramadan_start_date);
            const end = new Date(schedule.ramadan_end_date);
            return start <= projectEnd && end >= projectStart;
        });
    }, [ramadanSchedules, reportRun?.date_from, reportRun?.date_to]);
    const showRamadanGiftColumn = isAlMaraghiMotors && hasRamadanSchedule && (isAdmin || isCEO || isHRManager);

    // For FINALIZED reports: use stored AnalysisResult values (immutable).
    // For NON-FINALIZED reports: recalculate from punches/shifts/exceptions + day_overrides
    // so the summary table matches the daily breakdown the user sees.
    const baseEnrichedResults = React.useMemo(() => {
        const isFinalized = reportRun.is_final || project.status === 'closed';
        
        return results.map(result => {
            const employee = employees.find(e => String(e.attendance_id) === String(result.attendance_id));

            const employeePunches = punches.filter(p =>
                String(p.attendance_id) === String(result.attendance_id) &&
                p.punch_date >= reportRun.date_from &&
                p.punch_date <= reportRun.date_to
            );
            const hasNoPunches = employeePunches.length === 0;

            if (isFinalized) {
                // FINALIZED: Use stored values AS-IS — never recalculate
                return {
                    ...result,
                    name: employee?.name || 'Unknown',
                    working_days: result.working_days || 0,
                    present_days: result.manual_present_days ?? result.present_days ?? 0,
                    full_absence_count: result.manual_full_absence_count ?? result.full_absence_count ?? 0,
                    half_absence_count: result.half_absence_count || 0,
                    sick_leave_count: result.manual_sick_leave_count ?? result.sick_leave_count ?? 0,
                    annual_leave_count: result.manual_annual_leave_count ?? result.annual_leave_count ?? 0,
                    late_minutes: result.late_minutes || 0,
                    early_checkout_minutes: result.early_checkout_minutes || 0,
                    other_minutes: result.other_minutes || 0,
                    approved_minutes: result.approved_minutes || 0,
                    deductible_minutes: result.manual_deductible_minutes ?? result.deductible_minutes ?? 0,
                    ramadan_gift_minutes: Math.max(0, result.ramadan_gift_minutes || 0),
                    // effective = raw deductible (after grace) minus ramadan gift
                    effective_deductible_minutes: Math.max(0, (result.manual_deductible_minutes ?? result.deductible_minutes ?? 0) - Math.max(0, result.ramadan_gift_minutes || 0)),
                    grace_minutes: result.grace_minutes ?? 15,
                    has_no_punches: hasNoPunches
                };
            }

            // NON-FINALIZED: Recalculate from live punch data + day_overrides
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

            // Deductible: (late + early) - grace. Approved minutes already applied per-day in punch calc.
            const graceMinutes = result.grace_minutes ?? 15;
            const dynamicDeductible = Math.max(0, Math.max(0, totalLateMinutes) + Math.max(0, totalEarlyCheckout) - graceMinutes);

            return {
                ...result, name: employee?.name || 'Unknown', working_days: workingDays,
                present_days: result.manual_present_days ?? presentDays, full_absence_count: result.manual_full_absence_count ?? fullAbsenceCount,
                half_absence_count: halfAbsenceCount, sick_leave_count: result.manual_sick_leave_count ?? sickLeaveCount,
                annual_leave_count: result.manual_annual_leave_count ?? annualLeaveCount, late_minutes: Math.max(0, totalLateMinutes),
                early_checkout_minutes: Math.max(0, totalEarlyCheckout), other_minutes: Math.max(0, totalOtherMinutes),
                approved_minutes: result.approved_minutes || 0, deductible_minutes: result.manual_deductible_minutes ?? dynamicDeductible,
                ramadan_gift_minutes: Math.max(0, result.ramadan_gift_minutes || 0),
                effective_deductible_minutes: Math.max(0, (result.manual_deductible_minutes ?? dynamicDeductible) - Math.max(0, result.ramadan_gift_minutes || 0)),
                grace_minutes: graceMinutes, has_no_punches: hasNoPunches
            };
        });
    }, [results, employees, punches, shifts, exceptions, reportRun, project, ramadanGiftOverrides]);

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
                // Always push "no punches" employees to the end
                if (a.has_no_punches && !b.has_no_punches) return 1;
                if (!a.has_no_punches && b.has_no_punches) return -1;
                
                let aVal = a[sort.key];
                let bVal = b[sort.key];
                
                // For deductible sorting, use effective deductible if available
                if (sort.key === 'deductible_minutes') {
                    aVal = a.effective_deductible_minutes ?? a.deductible_minutes ?? 0;
                    bVal = b.effective_deductible_minutes ?? b.deductible_minutes ?? 0;
                }
                
                // Handle null/undefined values - push them to the end
                if (aVal == null && bVal == null) return 0;
                if (aVal == null) return 1;
                if (bVal == null) return -1;
                
                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                
                if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [enrichedResults, searchTerm, riskFilter, sort]);

    const updateVerificationMutation = useMutation({
        mutationFn: (verifiedList) => base44.entities.ReportRun.update(reportRun.id, {
            verified_employees: verifiedList.join(',')
        }),
        onSuccess: () => {
            // Don't invalidate - local state is already updated
        },
        onError: () => {
            // Only invalidate on error to refetch correct state
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
            toast.error('Failed to update verification');
        },
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 8000)
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

    const unfinalizeReportMutation = useMutation({
        mutationFn: async () => {
            const result = await base44.functions.invoke('unfinalizeReport', {
                project_id: project.id,
                report_run_id: reportRun.id
            });
            return result.data;
        },
        onSuccess: async (data) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['reportRun', reportRun.id] }),
                queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id] })
            ]);
            toast.success(`Report un-finalized! ${data.deleted_snapshots} salary snapshots deleted.`);
        },
        onError: (error) => {
            const errorMsg = error?.response?.data?.error || error.message || 'Unknown error';
            toast.error('Failed to un-finalize report: ' + errorMsg);
        }
    });

    const finalizeReportMutation = useMutation({
        mutationFn: async () => {
            console.log('[ReportDetailView] Starting finalization...');
            
            // Show progress dialog
            setFinalizationProgress({
                open: true,
                current: 0,
                total: 0,
                currentEmployee: 'Saving current report values...',
                status: 'Please wait...'
            });

            // ============================================================
            // STEP 0: CRITICAL - Write the EXACT UI values into AnalysisResult
            // before marking final. This ensures what you see = what gets finalized.
            // NO backend recalculation. The frontend is the source of truth.
            // ============================================================
            console.log('[ReportDetailView] Step 0: Writing UI values to AnalysisResult...');
            const currentEnriched = baseEnrichedResults;
            let updatedCount = 0;
            
            for (const row of currentEnriched) {
                // Build update payload with the EXACT values shown in the UI table
                const updates = {};
                let needsUpdate = false;
                
                // Compare UI values with stored AnalysisResult values
                // Find the raw result to compare against
                const rawResult = results.find(r => r.id === row.id);
                if (!rawResult) continue;
                
                const fieldsToSync = [
                    { uiKey: 'working_days', dbKey: 'working_days' },
                    { uiKey: 'present_days', dbKey: 'present_days' },
                    { uiKey: 'full_absence_count', dbKey: 'full_absence_count' },
                    { uiKey: 'half_absence_count', dbKey: 'half_absence_count' },
                    { uiKey: 'sick_leave_count', dbKey: 'sick_leave_count' },
                    { uiKey: 'annual_leave_count', dbKey: 'annual_leave_count' },
                    { uiKey: 'late_minutes', dbKey: 'late_minutes' },
                    { uiKey: 'early_checkout_minutes', dbKey: 'early_checkout_minutes' },
                    { uiKey: 'other_minutes', dbKey: 'other_minutes' },
                    { uiKey: 'deductible_minutes', dbKey: 'deductible_minutes' },
                    { uiKey: 'grace_minutes', dbKey: 'grace_minutes' },
                ];
                
                for (const f of fieldsToSync) {
                    const uiVal = row[f.uiKey] ?? 0;
                    const dbVal = rawResult[f.dbKey] ?? 0;
                    if (Math.abs(uiVal - dbVal) > 0.01) {
                        updates[f.dbKey] = uiVal;
                        needsUpdate = true;
                    }
                }
                
                if (needsUpdate) {
                    console.log(`[ReportDetailView] Syncing UI→DB for ${row.attendance_id}:`, updates);
                    await base44.entities.AnalysisResult.update(row.id, updates);
                    updatedCount++;
                }
            }
            console.log(`[ReportDetailView] Step 0 complete: synced ${updatedCount} AnalysisResults with UI values`);

            // STEP 1: Mark report as final (no recalculation - just flag it)
            console.log('[ReportDetailView] Calling markFinalReport...');
            const markResult = await base44.functions.invoke('markFinalReport', {
                project_id: project.id,
                report_run_id: reportRun.id
            });

            console.log('[ReportDetailView] markFinalReport result:', markResult.data);

            if (markResult.data?.success === false) {
                console.error('[ReportDetailView] Backend validation failed:', markResult.data?.error);
                throw new Error(markResult.data?.error || 'Finalization failed');
            }

            // STEP 2: Create all salary snapshots in a single invoke.
            // Backend handles chunked persistence internally to avoid API limits.
            setFinalizationProgress(prev => ({
                ...prev,
                currentEmployee: 'Creating salary snapshots for all employees...',
                status: 'Generating snapshots. This may take some time for large reports...'
            }));

            const snapshotResult = await base44.functions.invoke('createSalarySnapshots', {
                project_id: project.id,
                report_run_id: reportRun.id
            });

            console.log('[ReportDetailView] Snapshot creation result:', snapshotResult.data);
            console.log('[ReportDetailView] All snapshots created successfully');
            return markResult.data;
        },
        onSuccess: async () => {
            setFinalizationProgress(prev => ({
                ...prev,
                status: 'Refreshing data...',
                currentEmployee: 'Please wait...'
            }));

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['reportRun', reportRun.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['project', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id], refetchType: 'all' })
            ]);

            await new Promise(resolve => setTimeout(resolve, 1000));

            setFinalizationProgress({ open: false, current: 0, total: 0, currentEmployee: '', status: '' });
            toast.success('✅ Finalization complete! Salary snapshots created. Go to Salary Tab to generate reports.', {
                duration: 6000
            });
        },
        onError: async (error) => {
            console.error('[ReportDetailView] Finalization error:', error);
            
            setFinalizationProgress({ open: false, current: 0, total: 0, currentEmployee: '', status: '' });

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['reportRun', reportRun.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['project', project.id], refetchType: 'all' })
            ]);
            
            const errorMsg = error?.response?.data?.error || error.message || 'Unknown error';
            const actionRequired = error?.response?.data?.action_required;
            
            console.error('[ReportDetailView] Error details:', { errorMsg, actionRequired });
            
            if (actionRequired) {
                toast.error(`${errorMsg}\n\nAction required: ${actionRequired}`, {
                    duration: 10000
                });
            } else {
                toast.error('Failed to finalize report: ' + errorMsg, {
                    duration: 5000
                });
            }
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
            const isCurrentUserRegular = userRole === 'user' && !isSupervisor;
            
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
                    
                    // CRITICAL FIX: Time-based exceptions (late/early/other min) must be per-date,
                    // not spanning ranges — otherwise minutes apply to every day in the range.
                    const hasTimeMins = (group.data.lateMinutes > 0) || (group.data.earlyCheckoutMinutes > 0) || (group.data.otherMinutes > 0);
                    const ranges = [];
                    
                    if (hasTimeMins) {
                        sortedDates.forEach(d => ranges.push({ start: d, end: d }));
                    } else {
                        let currentRange = { start: sortedDates[0], end: sortedDates[0] };
                        for (let i = 1; i < sortedDates.length; i++) {
                            const dayDiff = (new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / (1000 * 60 * 60 * 24);
                            if (dayDiff === 1) { currentRange.end = sortedDates[i]; }
                            else { ranges.push({ ...currentRange }); currentRange = { start: sortedDates[i], end: sortedDates[i] }; }
                        }
                        ranges.push(currentRange);
                    }

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
                        } else if (exceptionData.late_minutes > 0 && exceptionData.early_checkout_minutes === 0) {
                            exceptionData.type = 'MANUAL_LATE';
                        } else if (exceptionData.early_checkout_minutes > 0 && exceptionData.late_minutes === 0) {
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
                const batchSize = 10;
                const totalBatches = Math.ceil(exceptionsToCreate.length / batchSize);
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                
                // Retry helper with backoff
                const retryWithBackoff = async (fn, maxRetries = 3) => {
                    for (let i = 0; i < maxRetries; i++) {
                        try {
                            return await fn();
                        } catch (error) {
                            const isRateLimit = error.message?.includes('rate limit') || error.status === 429;
                            if (isRateLimit && i < maxRetries - 1) {
                                const backoffTime = Math.min(2000 * Math.pow(2, i), 10000);
                                await delay(backoffTime);
                                continue;
                            }
                            throw error;
                        }
                    }
                };
                
                for (let i = 0; i < exceptionsToCreate.length; i += batchSize) {
                    const batch = exceptionsToCreate.slice(i, i + batchSize);
                    const batchNumber = Math.floor(i / batchSize) + 1;
                    
                    setSaveProgress({ 
                        current: batchNumber, 
                        total: totalBatches, 
                        status: `Saving exceptions ${batchNumber}/${totalBatches}...` 
                    });
                    
                    try {
                        await retryWithBackoff(() => base44.entities.Exception.bulkCreate(batch));
                        await delay(1500); // Delay between batches
                    } catch (error) {
                        console.error(`Batch ${batchNumber} failed, trying individual saves:`, error);
                        // Fallback to individual saves
                        for (const ex of batch) {
                            try {
                                await retryWithBackoff(() => base44.entities.Exception.create(ex));
                                await delay(500);
                            } catch (exError) {
                                console.error('Failed to save exception:', ex, exError);
                            }
                        }
                    }
                }
            }

            return exceptionsToCreate.length;
        },
        onSuccess: async (exceptionCount) => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
            toast.success(`Report saved! ${exceptionCount} exception${exceptionCount !== 1 ? 's' : ''} created from edits.`);
            
            // Note: Approval links functionality removed - department heads now use pre-approval system
            
            setIsSaving(false);
            setSaveProgress(null);
        },
        onError: (error) => {
            toast.error('Failed to save report: ' + error.message);
            setIsSaving(false);
            setSaveProgress(null);
        }
    });

    // Helper to convert minutes to hours (decimal format, 2 decimal places)
    const minutesToHours = (minutes) => {
        if (!minutes || minutes === 0) return 0;
        return Math.round((minutes / 60) * 100) / 100; // e.g., 90 min = 1.50 hrs
    };

    const exportToExcel = () => {
        try {
            if (filteredResults.length === 0) {
                toast.error('No data to export');
                return;
            }
        
        const includeRamadanGiftInExport = showRamadanGiftColumn;

        // Build headers matching the visible table columns - using Hours instead of Minutes
        const headers = [
            'Attendance ID',
            'Name',
            'Has Punches',
            'Working Days',
            'Present Days',
            'Annual Leave',
            'Sick Leave',
            'LOP Days',
            'Half Days',
            'Late (Hours)',
            'Early Checkout (Hours)',
            ...(project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' ? ['Approved (Hours)'] : []),
            'Other (Hours)',
            'Grace (Hours)',
            ...(includeRamadanGiftInExport ? ['Ramadan Gift (min)'] : []),
            'Deductible (Hours)',
            'Notes'
        ];

        const rows = filteredResults.map(r => {
            // CRITICAL FIX: For finalized reports, use STORED values directly from AnalysisResult
            // For non-finalized reports, use the recalculated values from enrichedResults
            const deductible = (r.effective_deductible_minutes ?? r.deductible_minutes) || 0;
            const late = r.late_minutes || 0;
            const early = r.early_checkout_minutes || 0;
            const grace = r.grace_minutes ?? 15;

            const baseRow = [
                r.attendance_id,
                r.name,
                r.has_no_punches ? 'No' : 'Yes',
                Math.max(0, r.working_days || 0),
                Math.max(0, (r.manual_present_days ?? r.present_days) || 0),
                Math.max(0, r.manual_annual_leave_count ?? r.annual_leave_count ?? 0),
                Math.max(0, r.manual_sick_leave_count ?? r.sick_leave_count ?? 0),
                Math.max(0, (r.manual_full_absence_count ?? r.full_absence_count) || 0),
                Math.max(0, r.half_absence_count || 0),
                minutesToHours(Math.max(0, late)),
                minutesToHours(Math.max(0, early))
            ];

            // Add approved minutes only if company allows it
            if (project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive') {
                baseRow.push(minutesToHours(Math.max(0, r.approved_minutes || 0)));
            }

            baseRow.push(
                minutesToHours(Math.max(0, r.other_minutes || 0)),
                minutesToHours(Math.max(0, grace))
            );

            if (includeRamadanGiftInExport) {
                baseRow.push(Math.max(0, giftMinutes));
            }

            baseRow.push(
                minutesToHours(Math.max(0, deductible)),
                r.notes || ''
            );

            return baseRow;
        });

        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
            XLSX.writeFile(wb, `attendance_report_${reportRun.date_from}_to_${reportRun.date_to}.xlsx`);
            toast.success('Attendance report exported');
        } catch (error) {
            console.error('[ReportDetailView] Export failed:', error);
            toast.error('Failed to export attendance report. Please try again.');
        }
    };

    const showDailyBreakdown = (result) => {
        setSelectedEmployee(result);
        setShowBreakdown(true);
    };

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

    const updateManualOverrideMutation = useMutation({
        mutationFn: async ({ id, field, value }) => {
            await base44.entities.AnalysisResult.update(id, { [field]: value });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['results', reportRun.id]);
            toast.success('Value updated - will be used in salary calculation');
        },
        onError: () => {
            toast.error('Failed to update value');
        }
    });

    // Save only ramadan_gift_minutes. deductible_minutes (raw) stays untouched.
    // The deductible column computes: max(0, deductible_minutes - ramadan_gift_minutes) at render time.
    const saveRamadanGift = async (row, value) => {
        const oldValue = Math.max(0, Number(row.ramadan_gift_minutes || 0));
        const newValue = Math.max(0, Number(value || 0));
        await base44.entities.AnalysisResult.update(row.id, { ramadan_gift_minutes: newValue });
        if (oldValue !== newValue) {
            base44.functions.invoke('logAudit', { action_type: 'update', entity_name: 'AnalysisResult', entity_id: row.id, project_id: project.id, company: project.company, context: `RAMADAN_GIFT old=${oldValue} new=${newValue}`, changes: JSON.stringify({ field: 'ramadan_gift_minutes', old_value: oldValue, new_value: newValue }) }).catch(()=>{});
        }
        // Remove stale cache and force fresh fetch so new value is reflected immediately
        queryClient.removeQueries({ queryKey: ['results', reportRun.id] });
        await queryClient.fetchQuery({ queryKey: ['results', reportRun.id], queryFn: () => base44.entities.AnalysisResult.filter({ report_run_id: reportRun.id }, null, 5000) });
        toast.success('Ramadan gift saved');
    };

    const hasEdits = results.some(r => r.day_overrides && r.day_overrides !== '{}');
    const verifiedCount = verifiedEmployees.length;

    return (
        <div className="space-y-6">
            {/* Finalization Progress Dialog */}
            <FinalizationProgressDialog progress={finalizationProgress} />

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
                            {/* IMMUTABLE FOR SALARY (Al Maraghi Auto Repairs) */}
                            {project.company === 'Al Maraghi Auto Repairs' && (
                                <p className="text-xs text-purple-600 font-medium">
                                    🔒 Finalized Report - Locked for Salary Calculation (edits: grace/deductible only)
                                </p>
                            )}
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
                                   {(isAdmin || project.company === 'Al Maraghi Auto Repairs') && !reportRun.is_final && (
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
                                   {isAdmin && reportRun.is_final && (
                                       <Button
                                           onClick={() => unfinalizeReportMutation.mutate()}
                                           disabled={unfinalizeReportMutation.isPending}
                                           variant="outline"
                                           className="border-red-300 text-red-600 hover:bg-red-50"
                                           title="Un-finalize report (admin only)"
                                       >
                                           {unfinalizeReportMutation.isPending ? (
                                               <>
                                                   <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                   Un-finalizing...
                                               </>
                                           ) : (
                                               <>Un-finalize Report</>
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
                                <SelectItem value="high-risk">High Risk ({`>`}2 LOP or {`>`}120 min)</SelectItem>
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
                <CardContent className="p-0 sm:p-6">
                    <div className="border rounded-lg relative overflow-x-auto overflow-y-auto max-h-[600px]">
                        <table className="w-full min-w-max caption-bottom text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-50">
                                <tr className="border-b">
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground w-12 bg-slate-50 sticky left-0 z-20">Verified</th>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort} className="bg-slate-50 sticky left-[48px] z-20">
                                        ID
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort} className="bg-slate-50 sticky left-[120px] z-20">
                                        Name
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="working_days" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Working Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="present_days" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Present Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="annual_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Annual Leave
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="sick_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Sick Leave
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="full_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        LOP Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="half_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Half Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="late_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Late Minutes
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="early_checkout_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Early Checkout
                                    </SortableTableHead>
                                    {project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' && (
                                        <SortableTableHead sortKey="approved_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                            Approved Minutes
                                        </SortableTableHead>
                                    )}
                                    <SortableTableHead sortKey="other_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Other Minutes
                                    </SortableTableHead>
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Grace</th>
                                    {showRamadanGiftColumn && (
                                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Ramadan Gift (min)</th>
                                    )}
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Deductible</th>
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Notes</th>
                                    <th className="h-10 px-2 text-right align-middle font-medium text-muted-foreground bg-slate-50">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {filteredResults.map((result) => (
                                    <tr key={result.id} className="border-b transition-colors hover:bg-muted/50">
                                        <td className="p-2 align-middle sticky left-0 bg-white z-10">
                                            <Checkbox
                                                checked={result.isVerified}
                                                onCheckedChange={() => toggleVerification(result.attendance_id)}
                                            />
                                        </td>
                                        <td className="p-2 align-middle font-medium sticky left-[48px] bg-white z-10">{result.attendance_id}</td>
                                        <td className="p-2 align-middle sticky left-[120px] bg-white z-10">
                                            <div className="flex items-center gap-2">
                                                <span>{result.name}</span>
                                                {result.has_no_punches && (
                                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded whitespace-nowrap" title="No punch data for this period">
                                                        No punches
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-2 align-middle">{Math.max(0, result.working_days || 0)}</td>
                                        <td className="p-2 align-middle">
                                            <InlineEditableCell
                                                value={Math.max(0, result.manual_present_days ?? result.present_days)}
                                                onSave={(value) => updateManualOverrideMutation.mutate({ 
                                                    id: result.id, 
                                                    field: 'manual_present_days', 
                                                    value: Math.max(0, value)
                                                })}
                                                isEditable={isAdmin}
                                                className={result.manual_present_days !== null && result.manual_present_days !== undefined ? 'text-blue-600 font-bold' : ''}
                                            />
                                        </td>
                                        <td className="p-2 align-middle">
                                            <InlineEditableCell
                                                value={Math.max(0, result.manual_annual_leave_count ?? result.annual_leave_count ?? 0)}
                                                onSave={(value) => updateManualOverrideMutation.mutate({ 
                                                    id: result.id, 
                                                    field: 'manual_annual_leave_count', 
                                                    value: Math.max(0, value)
                                                })}
                                                isEditable={isAdmin}
                                                className={result.manual_annual_leave_count !== null && result.manual_annual_leave_count !== undefined 
                                                    ? 'text-blue-600 font-bold' 
                                                    : (result.annual_leave_count > 0 ? 'text-blue-600 font-medium' : '')}
                                            />
                                        </td>
                                        <td className="p-2 align-middle">
                                            <InlineEditableCell
                                                value={Math.max(0, result.manual_sick_leave_count ?? result.sick_leave_count ?? 0)}
                                                onSave={(value) => updateManualOverrideMutation.mutate({ 
                                                    id: result.id, 
                                                    field: 'manual_sick_leave_count', 
                                                    value: Math.max(0, value)
                                                })}
                                                isEditable={isAdmin}
                                                className={result.manual_sick_leave_count !== null && result.manual_sick_leave_count !== undefined 
                                                    ? 'text-purple-600 font-bold' 
                                                    : (result.sick_leave_count > 0 ? 'text-purple-600 font-medium' : '')}
                                            />
                                        </td>
                                        <td className="p-2 align-middle">
                                            <InlineEditableCell
                                                value={Math.max(0, result.manual_full_absence_count ?? result.full_absence_count)}
                                                onSave={(value) => updateManualOverrideMutation.mutate({ 
                                                    id: result.id, 
                                                    field: 'manual_full_absence_count', 
                                                    value: Math.max(0, value)
                                                })}
                                                isEditable={isAdmin}
                                                className={result.manual_full_absence_count !== null && result.manual_full_absence_count !== undefined 
                                                    ? 'text-red-600 font-bold' 
                                                    : (result.full_absence_count > 0 ? 'text-red-600 font-medium' : '')}
                                            />
                                        </td>
                                        <td className="p-2 align-middle">
                                            <span className={`${result.half_absence_count > 0 ? 'text-amber-600 font-medium' : ''}`}>
                                                {Math.max(0, result.half_absence_count || 0)}
                                            </span>
                                        </td>
                                        <td className="p-2 align-middle">
                                            <span className={`${result.late_minutes > 0 ? 'text-orange-600 font-medium' : ''}`}>
                                                {Math.max(0, result.late_minutes || 0)}
                                            </span>
                                        </td>
                                        <td className="p-2 align-middle">
                                            <span className={`${result.early_checkout_minutes > 0 ? 'text-blue-600 font-medium' : ''}`}>
                                                {Math.max(0, result.early_checkout_minutes || 0)}
                                            </span>
                                        </td>
                                        {project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' && (
                                            <td className="p-2 align-middle">
                                                <span className={`${result.approved_minutes > 0 ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                                                    {Math.max(0, result.approved_minutes || 0)}
                                                </span>
                                            </td>
                                        )}
                                        <td className="p-2 align-middle">
                                            <span className={`${result.other_minutes > 0 ? 'text-purple-600 font-medium' : 'text-slate-400'}`}>
                                                {Math.max(0, result.other_minutes || 0)}
                                            </span>
                                        </td>
                                        <td className="p-2 align-middle">
                                            <div className="flex items-center gap-2 group">
                                                <span>{Math.max(0, result.grace_minutes ?? 15)}</span>
                                                {(isAdmin || isSupervisor) && (
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
                                        </td>
                                        {showRamadanGiftColumn && (() => {
                                            const canEdit = !reportRun.is_final && project.status !== 'closed';
                                            if (!canEdit) return <td className="p-2 align-middle"><span className="font-medium text-amber-700">{Math.max(0, result.ramadan_gift_minutes || 0)}</span></td>;
                                            return <td className="p-2 align-middle"><RamadanGiftCellWidget result={result} onSave={saveRamadanGift} isEditable={true} /></td>;
                                        })()}
                                        <td className="p-2 align-middle">
                                            {(() => {
                                                // deductible_minutes is already final (gift already subtracted by saveRamadanGift)
                                                const displayDeductible = Math.max(0, result.manual_deductible_minutes ?? result.deductible_minutes ?? 0);

                                                return (
                                                    <div className="flex flex-col">
                                                        <InlineEditableCell
                                                            value={displayDeductible}
                                                            onSave={(value) => updateManualOverrideMutation.mutate({ 
                                                                id: result.id, 
                                                                field: 'manual_deductible_minutes', 
                                                                value: Math.max(0, value + giftMinutes)
                                                            })}
                                                            isEditable={isAdmin && !reportRun.is_final}
                                                            className={`font-bold ${displayDeductible > 0 ? 'text-red-600' : 'text-green-600'}`}
                                                        />
                                                        {reportRun.is_final && (
                                                            <span className="text-[10px] text-purple-600">
                                                                Finalized
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            </td>
                                            <td className="p-2 align-middle text-xs text-slate-600 max-w-xs truncate">
                                             {result.notes || '-'}
                                        </td>
                                        <td className="p-2 align-middle text-right">
                                              <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  onClick={() => showDailyBreakdown(result)}
                                                  title="View daily breakdown"
                                              >
                                                  <Eye className="w-4 h-4" />
                                              </Button>
                                          </td>
                                           </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <DailyBreakdownDialog
                open={showBreakdown}
                onOpenChange={setShowBreakdown}
                selectedEmployee={selectedEmployee}
                enrichedResults={enrichedResults}
                punches={punches}
                shifts={shifts}
                exceptions={exceptions}
                employees={employees}
                reportRun={reportRun}
                project={project}
                parseTime={parseTime}
                formatTime={formatTime}
                matchPunchesToShiftPoints={matchPunchesToShiftPoints}
                detectPartialDay={detectPartialDay}
                filterMultiplePunches={filterMultiplePunches}
            />

            <GraceMinutesDialog
                editingGraceMinutes={editingGraceMinutes}
                onClose={() => setEditingGraceMinutes(null)}
                onSave={(data) => updateGraceMinutesMutation.mutate(data)}
                isPending={updateGraceMinutesMutation.isPending}
            />

            <SaveConfirmationDialog
                open={showSaveConfirmation}
                onClose={() => setShowSaveConfirmation(false)}
                onConfirm={() => { setShowSaveConfirmation(false); saveReportMutation.mutate(); }}
                hasEdits={hasEdits}
                isUser={isUser}
                isSupervisor={isSupervisor}
            />

        </div>
    );
}