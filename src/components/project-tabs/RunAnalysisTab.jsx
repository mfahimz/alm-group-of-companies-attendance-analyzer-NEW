import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, CheckCircle, AlertCircle, Loader2, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function RunAnalysisTab({ project }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState(null);
    const [dateFrom, setDateFrom] = useState(project.date_from);
    const [dateTo, setDateTo] = useState(project.date_to);
    const [reportName, setReportName] = useState('');
    const [dataQualityIssues, setDataQualityIssues] = useState([]);
    const [showQualityCheck, setShowQualityCheck] = useState(false);
    const queryClient = useQueryClient();

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });

    // Check for pending exceptions
    const hasPendingExceptions = exceptions.some(e => e.approval_status === 'pending_dept_head');

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    const { data: rules } = useQuery({
        queryKey: ['rules', project.company],
        queryFn: async () => {
            const rulesList = await base44.entities.AttendanceRules.filter({ company: project.company });
            if (rulesList.length > 0) {
                return JSON.parse(rulesList[0].rules_json);
            }
            return null;
        }
    });

    // Get unique employee IDs from punches - ALWAYS include all employees with punch data
    const uniqueEmployeeIds = [...new Set(punches.map(p => p.attendance_id))];

    const updateProjectMutation = useMutation({
        mutationFn: (status) => base44.entities.Project.update(project.id, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['projects']);
        }
    });

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
            
            // Standard format: HH:MM AM/PM (without seconds)
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
            
            // 24-hour format with optional seconds
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

    const matchPunchesToShiftPoints = (dayPunches, shift, includeSeconds = false) => {
        if (!shift || dayPunches.length === 0) return [];
        
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
            
            // Phase 1: Normal match (±60 minutes)
            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;
                
                const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                
                if (distance <= 60 && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                }
            }
            
            // Phase 2: Extended match (±120 minutes)
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
            
            // Phase 3: Far extended match (±180 minutes)
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

    const detectPartialDay = (dayPunches, shift, includeSeconds = false) => {
        if (!shift || dayPunches.length < 2) return { isPartial: false, reason: null };
        
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

    const filterMultiplePunches = (punchList, shift, includeSeconds = false) => {
        if (punchList.length <= 1) return punchList;

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

    const analyzeEmployee = async (attendance_id) => {
        const attendanceIdNum = Number(attendance_id);
        const employeePunches = punches.filter(p => 
            Number(p.attendance_id) === attendanceIdNum && 
            p.punch_date >= dateFrom && 
            p.punch_date <= dateTo
        );
        const employeeShifts = shifts.filter(s => Number(s.attendance_id) === attendanceIdNum);

        // Filter exceptions - no approval workflow needed, use immediately
         const employeeExceptions = exceptions.filter(e => {
                       try {
                           const matches = (String(e.attendance_id) === 'ALL' || Number(e.attendance_id) === attendanceIdNum) &&
                                  e.use_in_analysis !== false &&
                                  e.is_custom_type !== true;
                           if (matches && e.type === 'SICK_LEAVE') {
                               console.log(`Found SICK_LEAVE exception for attendance_id ${attendanceIdNum}:`, e);
                           }
                           return matches;
                       } catch (error) {
                           console.error(`Error filtering exception ${e.id}:`, error);
                           return false;
                       }
                   });
         console.log(`Employee ${attendanceIdNum} - Total exceptions: ${employeeExceptions.length}, SICK_LEAVE: ${employeeExceptions.filter(e => e.type === 'SICK_LEAVE').length}`);
        
        // Get employee to determine weekly off day
        const employee = employees.find(e => Number(e.attendance_id) === attendanceIdNum);
        
        // Enable seconds parsing for Al Maraghi Automotive only
        const includeSeconds = project.company === 'Al Maraghi Automotive';

        let working_days = 0;
        let present_days = 0;
        let full_absence_count = 0;
        let half_absence_count = 0;
        let sick_leave_count = 0;
        let annual_leave_count = 0;
        let late_minutes = 0;
        let early_checkout_minutes = 0;
        let other_minutes = 0;
        const abnormal_dates_list = [];
        const critical_abnormal_dates = []; // RED - only critical issues
        const auto_resolutions = [];

        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);
        
        // Map day names to numbers
        const dayNameToNumber = {
            'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
            'Thursday': 4, 'Friday': 5, 'Saturday': 6
        };
        
        for (let d = new Date(startDate); d <= endDate; d = new Date(d.setDate(d.getDate() + 1))) {
            const currentDate = new Date(d);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();

            // Check for weekly off override in project
            let weeklyOffDay = null;
            if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                weeklyOffDay = dayNameToNumber[project.weekly_off_override];
            } else if (employee?.weekly_off) {
                weeklyOffDay = dayNameToNumber[employee.weekly_off];
            }
            
            // Skip weekly off day (don't count as working day or absence)
            if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                continue;
            }

            working_days++;

            // Find all matching exceptions and get the latest one by created_date (with error handling)
             let dateException = null;
             try {
                 const matchingExceptions = employeeExceptions.filter(ex => {
                     try {
                         const exFrom = new Date(ex.date_from);
                         const exTo = new Date(ex.date_to);
                         return currentDate >= exFrom && currentDate <= exTo && 
                                (String(ex.attendance_id) === 'ALL' || Number(ex.attendance_id) === attendanceIdNum);
                     } catch (error) {
                         console.error(`Error matching exception ${ex.id} for date ${dateStr}:`, error);
                         return false;
                     }
                 });

                 dateException = matchingExceptions.length > 0
                     ? matchingExceptions.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
                     : null;
             } catch (error) {
                 console.error(`Error processing exceptions for date ${dateStr}:`, error);
                 dateException = null;
             }

            if (dateException) {
                if (dateException.type === 'OFF' || dateException.type === 'PUBLIC_HOLIDAY') {
                    working_days--;
                    continue;
                } else if (dateException.type === 'MANUAL_PRESENT') {
                    present_days++;
                } else if (dateException.type === 'MANUAL_ABSENT') {
                    full_absence_count++;
                    continue;
                } else if (dateException.type === 'MANUAL_HALF') {
                    present_days++;
                    half_absence_count++;
                } else if (dateException.type === 'SICK_LEAVE') {
                    // Sick leave is separate from LOP - don't count as working day
                    working_days--;
                    sick_leave_count++;
                    continue;
                } else if (dateException.type === 'ANNUAL_LEAVE') {
                    // Annual leave is separate from LOP - don't count as working day
                    // Check punches for this day to determine if employee worked
                    const dayPunchesForLeave = employeePunches.filter(p => p.punch_date === dateStr);
                    if (dayPunchesForLeave.length === 0) {
                        working_days--;
                        annual_leave_count++;
                        continue;
                    } else {
                        present_days++;
                    }
                }
            }

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

            // First, try to find a shift with specific date
            let shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));

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
                try {
                    // Check if include_friday flag exists and current day is Friday
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
                } catch (error) {
                    console.error(`Error applying shift override for date ${dateStr}:`, error);
                }
            }

            const dayPunches = employeePunches
                .filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw, includeSeconds);
                    const timeB = parseTime(b.timestamp_raw, includeSeconds);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            let filteredPunches = filterMultiplePunches(dayPunches, shift, includeSeconds);
            
            // Check if this is a weekly off or holiday for overtime premium calculation
            let isWeeklyOffForOT = false;
            let isHolidayForOT = false;
            
            if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                isWeeklyOffForOT = true;
            }
            if (dateException && (dateException.type === 'PUBLIC_HOLIDAY' || dateException.type === 'OFF')) {
                isHolidayForOT = true;
            }
            
            let punchMatches = [];
            let hasUnmatchedPunch = false;
            if (shift && filteredPunches.length > 0) {
                punchMatches = matchPunchesToShiftPoints(filteredPunches, shift, includeSeconds);
                hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
            }
            
            const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                   shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                   shift.am_end !== '—' && shift.pm_start !== '—' &&
                                   shift.am_end !== '-' && shift.pm_start !== '-';
            const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;

            const partialDayResult = detectPartialDay(filteredPunches, shift, includeSeconds);

            // Handle manual late/early exceptions marking day as present
            if (dateException && (dateException.type === 'MANUAL_LATE' || dateException.type === 'MANUAL_EARLY_CHECKOUT')) {
                if (filteredPunches.length === 0) {
                    present_days++;
                }
            }

            if (filteredPunches.length > 0) {
                if (partialDayResult.isPartial) {
                    present_days++;
                    half_absence_count++;
                    auto_resolutions.push({
                        date: dateStr,
                        type: 'PARTIAL_DAY_DETECTED',
                        details: partialDayResult.reason
                    });
                } else {
                    present_days++;
                }

                if (rules?.attendance_calculation?.half_day_rule === 'punch_count_or_duration' && !partialDayResult.isPartial) {
                    if (filteredPunches.length < 2 && !isSingleShift) {
                        half_absence_count++;
                    }
                }
            } else {
                full_absence_count++;
            }

            // Track allowed minutes from ALLOWED_MINUTES exception (with error handling)
            let allowedMinutesForDay = 0;
            try {
                if (dateException && dateException.type === 'ALLOWED_MINUTES') {
                    allowedMinutesForDay = dateException.allowed_minutes || 0;
                }
            } catch (error) {
                console.error(`Error reading allowed minutes for date ${dateStr}:`, error);
                allowedMinutesForDay = 0;
            }

            // Skip time calculation if there's an exception that handles attendance status OR has manual time values
            const hasManualTimeException = dateException && (
                dateException.type === 'MANUAL_LATE' || 
                dateException.type === 'MANUAL_EARLY_CHECKOUT' ||
                (dateException.late_minutes && dateException.late_minutes > 0) ||
                (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) ||
                (dateException.other_minutes && dateException.other_minutes > 0)
            );
            
            const shouldSkipTimeCalculation = dateException && [
                'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
            ].includes(dateException.type);

            // Use manual exception minutes if present, otherwise calculate from punches
            if (hasManualTimeException) {
                // Use ONLY the exception minutes, don't recalculate from punches
                if (dateException.late_minutes && dateException.late_minutes > 0) {
                    late_minutes += dateException.late_minutes;
                }
                if (dateException.early_checkout_minutes && dateException.early_checkout_minutes > 0) {
                    early_checkout_minutes += dateException.early_checkout_minutes;
                }
                if (dateException.other_minutes && dateException.other_minutes > 0) {
                    other_minutes += dateException.other_minutes;
                }
            } else if (shift && punchMatches.length > 0 && !shouldSkipTimeCalculation) {
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
                
                late_minutes += dayLateMinutes;
                early_checkout_minutes += dayEarlyMinutes;
                }

            const expectedPunches = isSingleShift ? 2 : 4;
            
            // Mark as abnormal if any punch couldn't be matched or needed extended matching
            const hasExtendedMatch = punchMatches.some(m => m.isExtendedMatch);
            const hasFarExtendedMatch = punchMatches.some(m => m.isFarExtendedMatch);
            if (hasUnmatchedPunch) {
                abnormal_dates_list.push(dateStr);
                critical_abnormal_dates.push(dateStr); // RED - unmatched punch is critical
            }
            if (hasFarExtendedMatch) {
                abnormal_dates_list.push(dateStr);
                critical_abnormal_dates.push(dateStr); // RED - far extended match (±180 min) is critical
            }
            if (hasExtendedMatch) {
                abnormal_dates_list.push(dateStr);
                // Extended match (±120 min) is warning (YELLOW), not critical
            }
            if (rules.abnormality_rules?.detect_missing_punches && filteredPunches.length > 0 && filteredPunches.length < expectedPunches) {
                abnormal_dates_list.push(dateStr);
                critical_abnormal_dates.push(dateStr); // RED - missing punches are critical
            }
            if (rules.abnormality_rules?.detect_extra_punches && filteredPunches.length > expectedPunches) {
                abnormal_dates_list.push(dateStr);
                // Extra punches are warning (YELLOW), not critical
            }
            
            // Detect extremely late punches (beyond extended match window)
            if (shift && filteredPunches.length > 0) {
                for (const punch of filteredPunches) {
                    const punchTime = parseTime(punch.timestamp_raw, includeSeconds);
                    if (!punchTime) continue;
                    
                    // Check against shift start times
                    const amStartTime = parseTime(shift.am_start);
                    const pmStartTime = parseTime(shift.pm_start);
                    
                    if (amStartTime) {
                        const latenessMinutes = (punchTime - amStartTime) / (1000 * 60);
                        if (latenessMinutes > 120 && latenessMinutes < 480) { // Between 2-8 hours late
                            critical_abnormal_dates.push(dateStr);
                            auto_resolutions.push({
                                date: dateStr,
                                type: 'EXTREME_LATENESS',
                                details: `Punch at ${Math.round(latenessMinutes)} minutes (${Math.floor(latenessMinutes/60)}h ${Math.round(latenessMinutes%60)}m) past AM start`
                            });
                        }
                    }
                    
                    if (pmStartTime) {
                        const latenessMinutes = (punchTime - pmStartTime) / (1000 * 60);
                        if (latenessMinutes > 120 && latenessMinutes < 480) { // Between 2-8 hours late
                            critical_abnormal_dates.push(dateStr);
                            auto_resolutions.push({
                                date: dateStr,
                                type: 'EXTREME_LATENESS',
                                details: `Punch at ${Math.round(latenessMinutes)} minutes (${Math.floor(latenessMinutes/60)}h ${Math.round(latenessMinutes%60)}m) past PM start`
                            });
                        }
                    }
                }
            }

            const dateFormatted = `${String(currentDate.getDate()).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
            if (rules.date_rules?.special_abnormal_dates?.includes(dateFormatted)) {
                abnormal_dates_list.push(dateStr);
            }

            if (rules.date_rules?.always_mark_first_date_abnormal && currentDate.getTime() === startDate.getTime()) {
                abnormal_dates_list.push(dateStr);
            }
        }

        // Only include critical (RED) abnormalities in notes
        const criticalDatesFormatted = critical_abnormal_dates.length > 0
            ? [...new Set(critical_abnormal_dates)].map(d => new Date(d).toLocaleDateString()).join(', ')
            : '';
        const autoResolutionNotes = auto_resolutions.length > 0 
            ? auto_resolutions.map(r => `${new Date(r.date).toLocaleDateString()}: ${r.details}`).join(' | ')
            : '';
        
        const dept = employee?.department || 'Admin';
        const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
        const carriedGrace = project.use_carried_grace_minutes ? (employee?.carried_grace_minutes || 0) : 0;
        
        return {
            attendance_id,
            working_days,
            present_days,
            full_absence_count,
            half_absence_count,
            sick_leave_count,
            annual_leave_count,
            late_minutes,
            early_checkout_minutes,
            other_minutes,
            grace_minutes: baseGrace + carriedGrace,
            abnormal_dates: [...new Set(abnormal_dates_list)].join(', '),
            notes: criticalDatesFormatted, // Only RED (critical) exceptions
            auto_resolutions: autoResolutionNotes
        };
    };

    const performDataQualityCheck = () => {
        const issues = [];
        
        // Check for employees without shifts
        const employeesWithoutShifts = employees.filter(emp => {
            const hasShift = shifts.some(s => Number(s.attendance_id) === Number(emp.attendance_id));
            return !hasShift;
        });
        
        if (employeesWithoutShifts.length > 0) {
            issues.push({
                type: 'error',
                title: `${employeesWithoutShifts.length} employees have no shift timings`,
                details: employeesWithoutShifts.slice(0, 5).map(e => `${e.attendance_id} - ${e.name}`).join(', ') + 
                         (employeesWithoutShifts.length > 5 ? ` and ${employeesWithoutShifts.length - 5} more` : '')
            });
        }
        
        // Check for unusual punch counts
        const punchCounts = {};
        punches.forEach(p => {
            punchCounts[p.punch_date] = (punchCounts[p.punch_date] || 0) + 1;
        });
        
        const unusualDates = Object.entries(punchCounts).filter(([date, count]) => count < 10 || count > 500);
        if (unusualDates.length > 0) {
            issues.push({
                type: 'warning',
                title: `${unusualDates.length} dates have unusual punch counts`,
                details: unusualDates.slice(0, 3).map(([d, c]) => `${d}: ${c} punches`).join(', ')
            });
        }
        
        // Check for date gaps in punches
        const punchDates = [...new Set(punches.map(p => p.punch_date))].sort();
        if (punchDates.length > 0) {
            const gaps = [];
            for (let i = 1; i < punchDates.length; i++) {
                const prev = new Date(punchDates[i-1]);
                const curr = new Date(punchDates[i]);
                const dayDiff = (curr - prev) / (1000 * 60 * 60 * 24);
                if (dayDiff > 3) {
                    gaps.push(`${punchDates[i-1]} to ${punchDates[i]} (${Math.floor(dayDiff)} days)`);
                }
            }
            if (gaps.length > 0) {
                issues.push({
                    type: 'warning',
                    title: `${gaps.length} date gaps found in punch data`,
                    details: gaps.slice(0, 2).join(', ')
                });
            }
        }
        
        // Auto-fix: Count duplicate punches that will be removed
        let duplicateCount = 0;
        const punchsByDate = {};
        punches.forEach(p => {
            if (!punchsByDate[p.punch_date]) punchsByDate[p.punch_date] = [];
            punchsByDate[p.punch_date].push(p);
        });
        
        Object.values(punchsByDate).forEach(dayPunches => {
            if (dayPunches.length > 1) {
                const sorted = dayPunches.sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw, project.company === 'Al Maraghi Automotive');
                    const timeB = parseTime(b.timestamp_raw, project.company === 'Al Maraghi Automotive');
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });
                
                for (let i = 1; i < sorted.length; i++) {
                    const prevTime = parseTime(sorted[i-1].timestamp_raw, project.company === 'Al Maraghi Automotive');
                    const currTime = parseTime(sorted[i].timestamp_raw, project.company === 'Al Maraghi Automotive');
                    if (prevTime && currTime) {
                        const minutesDiff = Math.abs((currTime - prevTime) / (1000 * 60));
                        if (minutesDiff < 10) duplicateCount++;
                    }
                }
            }
        });
        
        if (duplicateCount > 0) {
            issues.push({
                type: 'info',
                title: `${duplicateCount} duplicate punches will be auto-removed`,
                details: 'Punches within 10 minutes of each other are automatically filtered'
            });
        }
        
        setDataQualityIssues(issues);
        return issues;
    };

    const handleAnalyze = async () => {
        if (!dateFrom || !dateTo) {
            toast.error('Please select date range');
            return;
        }
        
        // Perform data quality check
        const issues = performDataQualityCheck();
        const hasErrors = issues.some(i => i.type === 'error');
        
        if (hasErrors && !isAdmin) {
            setShowQualityCheck(true);
            return;
        }
        
        if (hasErrors && isAdmin) {
            setShowQualityCheck(true);
            return;
        }
        
        // Proceed to run analysis
        await runAnalysis();
    };

    const runAnalysis = async () => {
        if (!rules) {
            toast.error('Please configure attendance rules first');
            return;
        }

        if (punches.length === 0) {
            toast.error('No punch data available. Please upload punches first.');
            return;
        }

        if (shifts.length === 0) {
            const proceed = window.confirm('⚠️ No shift timings found. Analysis will proceed but may produce incorrect results. Continue anyway?');
            if (!proceed) return;
        }

        setIsAnalyzing(true);
        setProgress({ current: 0, total: uniqueEmployeeIds.length, status: 'Processing...' });

        try {
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            const allResults = [];
            // Create report run FIRST to get the report_run_id
            const reportRun = await base44.entities.ReportRun.create({
                project_id: project.id,
                report_name: reportName.trim() || `Report - ${new Date().toLocaleDateString()}`,
                date_from: dateFrom,
                date_to: dateTo,
                employee_count: uniqueEmployeeIds.length
            });

            for (let i = 0; i < uniqueEmployeeIds.length; i++) {
                const attendance_id = uniqueEmployeeIds[i];
                const employee = employees.find(e => Number(e.attendance_id) === Number(attendance_id));
                const employeeName = employee?.name || attendance_id;
                setProgress({ 
                    current: i + 1, 
                    total: uniqueEmployeeIds.length, 
                    status: `Analyzing ${i + 1}/${uniqueEmployeeIds.length}: ${employeeName}`,
                    subStatus: 'Reading punch data and calculating attendance...'
                });

                const result = await analyzeEmployee(attendance_id);
                allResults.push({
                    project_id: project.id,
                    report_run_id: reportRun.id,
                    attendance_id: result.attendance_id,
                    working_days: result.working_days,
                    present_days: result.present_days,
                    full_absence_count: result.full_absence_count,
                    half_absence_count: result.half_absence_count,
                    sick_leave_count: result.sick_leave_count,
                    annual_leave_count: result.annual_leave_count,
                    late_minutes: result.late_minutes,
                    early_checkout_minutes: result.early_checkout_minutes,
                    other_minutes: result.other_minutes,
                    grace_minutes: result.grace_minutes,
                    abnormal_dates: result.abnormal_dates,
                    notes: result.notes,
                    auto_resolutions: result.auto_resolutions
                });
            }

            setProgress({ 
                current: uniqueEmployeeIds.length, 
                total: uniqueEmployeeIds.length, 
                status: 'Saving results to database...',
                subStatus: `Saving batch ${Math.floor(0 / 10) + 1}...`
            });
            const createBatchSize = 10; // Reduced from 15 to 10 to avoid rate limits
            for (let i = 0; i < allResults.length; i += createBatchSize) {
                const batch = allResults.slice(i, i + createBatchSize);
                await base44.entities.AnalysisResult.bulkCreate(batch);
                setProgress({ 
                    current: uniqueEmployeeIds.length, 
                    total: uniqueEmployeeIds.length, 
                    status: 'Saving results to database...',
                    subStatus: `Saved ${Math.min(i + createBatchSize, allResults.length)}/${allResults.length} records`
                });
                await delay(1500); // Increased from 800ms to 1500ms to prevent rate limiting
            }

            // Update project with last saved report
            await base44.entities.Project.update(project.id, {
                last_saved_report_id: reportRun.id,
                status: 'analyzed'
            });

            queryClient.invalidateQueries(['results', project.id]);
            queryClient.invalidateQueries(['reportRuns', project.id]);
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['projects']);
            toast.success(`Analysis completed for ${dateFrom} to ${dateTo}`);
            setProgress({ 
                current: uniqueEmployeeIds.length, 
                total: uniqueEmployeeIds.length, 
                status: 'Complete!',
                subStatus: 'Report generated successfully'
            });
        } catch (error) {
            toast.error('Analysis failed: ' + error.message);
            console.error(error);
        } finally {
            setTimeout(() => {
                setIsAnalyzing(false);
                setProgress(null);
            }, 2000);
        }
    };

    return (
        <div className="space-y-6">
            <Card className="border-0 shadow-md bg-white ring-1 ring-slate-950/5">
                <CardHeader>
                    <CardTitle>Run Attendance Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            {punches.length > 0 ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-amber-600" />
                            )}
                            <span className="text-slate-700">
                                Punch Data: <strong>{punches.length}</strong> records from <strong>{uniqueEmployeeIds.length}</strong> employees
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {shifts.length > 0 ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-amber-600" />
                            )}
                            <span className="text-slate-700">
                                Shift Timings: <strong>{shifts.length}</strong> records
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <CheckCircle className="w-5 h-5 text-blue-600" />
                            <span className="text-slate-700">
                                Exceptions: <strong>{exceptions.length}</strong> records
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {rules ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-red-600" />
                            )}
                            <span className="text-slate-700">
                                Rules Configuration: {rules ? 'Configured' : 'Not configured'}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <Label>Report Name (Optional)</Label>
                            <Input
                                placeholder="e.g., December 2024 - Final"
                                value={reportName}
                                onChange={(e) => setReportName(e.target.value)}
                                disabled={isAnalyzing}
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Give this report a name for easy identification
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>From Date</Label>
                                <Input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    min={project.date_from}
                                    max={project.date_to}
                                    disabled={isAnalyzing}
                                    title="Date range must be within project period"
                                />
                            </div>
                            <div>
                                <Label>To Date</Label>
                                <Input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => {
                                        // Ensure to date is not before from date and within project range
                                        const newDate = e.target.value;
                                        if (newDate >= dateFrom && newDate <= project.date_to) {
                                            setDateTo(newDate);
                                        }
                                    }}
                                    min={dateFrom}
                                    max={project.date_to}
                                    disabled={isAnalyzing}
                                    title="Date range must be within project period"
                                />
                            </div>
                        </div>

                        {progress && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                                    <div className="flex-1">
                                        <p className="font-medium text-indigo-900">{progress.status}</p>
                                        {progress.subStatus && (
                                            <p className="text-sm text-indigo-700 mt-0.5">{progress.subStatus}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full bg-indigo-200 rounded-full h-2">
                                    <div 
                                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                                    />
                                </div>
                                <p className="text-sm text-indigo-700 mt-2">
                                    {progress.current} / {progress.total} employees processed
                                </p>
                            </div>
                        )}
                    </div>

                    {hasPendingExceptions && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-900">Pending Exception Approvals</p>
                                    <p className="text-sm text-amber-700 mt-1">
                                        There are {exceptions.filter(e => e.approval_status === 'pending_dept_head').length} exception(s) awaiting department head approval. 
                                        Analysis cannot run until all exceptions are approved or rejected.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button 
                            onClick={() => {
                                performDataQualityCheck();
                                setShowQualityCheck(true);
                            }}
                            variant="outline"
                            disabled={isAnalyzing}
                            size="lg"
                        >
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            Check Data Quality
                        </Button>
                        <Button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing || !rules || punches.length === 0 || !dateFrom || !dateTo || hasPendingExceptions}
                            className="bg-indigo-600 hover:bg-indigo-700"
                            size="lg"
                        >
                            <Play className="w-5 h-5 mr-2" />
                            {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                        </Button>
                        <p className="text-sm text-slate-500 mt-2">
                            {hasPendingExceptions 
                                ? 'Analysis is blocked until all exceptions are approved.'
                                : 'Select a date range and run analysis to generate attendance report for that period.'
                            }
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Data Quality Check Dialog */}
            <Dialog open={showQualityCheck} onOpenChange={setShowQualityCheck}>
                <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Data Quality Check</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {dataQualityIssues.length === 0 ? (
                        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                            <div>
                                <p className="font-medium text-green-900">All checks passed!</p>
                                <p className="text-sm text-green-700">Your data is ready for analysis.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dataQualityIssues.map((issue, idx) => (
                                <div 
                                    key={idx}
                                    className={`flex items-start gap-3 p-4 rounded-lg border ${
                                        issue.type === 'error' ? 'bg-red-50 border-red-200' :
                                        issue.type === 'warning' ? 'bg-amber-50 border-amber-200' :
                                        'bg-blue-50 border-blue-200'
                                    }`}
                                >
                                    {issue.type === 'error' && <XCircle className="w-5 h-5 text-red-600 mt-0.5" />}
                                    {issue.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />}
                                    {issue.type === 'info' && <Info className="w-5 h-5 text-blue-600 mt-0.5" />}
                                    <div className="flex-1">
                                        <p className={`font-medium ${
                                            issue.type === 'error' ? 'text-red-900' :
                                            issue.type === 'warning' ? 'text-amber-900' :
                                            'text-blue-900'
                                        }`}>
                                            {issue.title}
                                        </p>
                                        <p className={`text-sm mt-1 ${
                                            issue.type === 'error' ? 'text-red-700' :
                                            issue.type === 'warning' ? 'text-amber-700' :
                                            'text-blue-700'
                                        }`}>
                                            {issue.details}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {dataQualityIssues.some(i => i.type === 'error') && !isAdmin && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <p className="text-sm text-slate-700">
                                <strong>Action Required:</strong> Please fix the errors above before running analysis. 
                                Go to the Shifts tab to add missing shift timings.
                            </p>
                        </div>
                    )}
                    {dataQualityIssues.some(i => i.type === 'error') && isAdmin && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <p className="text-sm text-amber-700">
                                <strong>Admin Override Available:</strong> Errors detected, but as an admin you can proceed anyway. 
                                Results may be inaccurate for affected employees.
                            </p>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setShowQualityCheck(false)}>
                        Close
                    </Button>
                    {!dataQualityIssues.some(i => i.type === 'error') && (
                        <Button 
                            onClick={() => {
                                setShowQualityCheck(false);
                                runAnalysis();
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            Proceed with Analysis
                        </Button>
                    )}
                    {dataQualityIssues.some(i => i.type === 'error') && isAdmin && (
                        <Button 
                            onClick={() => {
                                setShowQualityCheck(false);
                                runAnalysis();
                            }}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            Proceed Anyway (Admin Override)
                        </Button>
                    )}
                </div>
            </DialogContent>
            </Dialog>
        </div>
    );
}