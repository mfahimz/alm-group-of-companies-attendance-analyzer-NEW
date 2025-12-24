import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RunAnalysisTab({ project }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState(null);
    const [dateFrom, setDateFrom] = useState(project.date_from);
    const [dateTo, setDateTo] = useState(project.date_to);
    const queryClient = useQueryClient();

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

    // Get unique employee IDs from punches
    const uniqueEmployeeIdsFromPunches = [...new Set(punches.map(p => p.attendance_id))];
    
    // Filter based on custom_employee_ids if specified
    let uniqueEmployeeIds = uniqueEmployeeIdsFromPunches;
    if (project.custom_employee_ids) {
        const customHrmsIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(Boolean);
        // Convert HRMS IDs to attendance IDs
        const customAttendanceIds = employees
            .filter(e => customHrmsIds.includes(e.hrms_id))
            .map(e => e.attendance_id);
        
        // Only include employees that are in both punch data AND custom selection
        uniqueEmployeeIds = uniqueEmployeeIdsFromPunches.filter(id => 
            customAttendanceIds.includes(id)
        );
    }

    const updateProjectMutation = useMutation({
        mutationFn: (status) => base44.entities.Project.update(project.id, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['projects']);
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
            
            // First pass: Try 60-minute radius (normal)
            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;
                
                const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                
                if (distance <= 60 && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                }
            }
            
            // Second pass: If no match, try 120-minute radius (extended)
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

    const analyzeEmployee = async (attendance_id) => {
        const employeePunches = punches.filter(p => 
            p.attendance_id === attendance_id && 
            p.punch_date >= dateFrom && 
            p.punch_date <= dateTo
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === attendance_id);
        const employeeExceptions = exceptions.filter(e => 
            (e.attendance_id === attendance_id || e.attendance_id === 'ALL') &&
            e.use_in_analysis !== false
        );
        
        // Get employee to determine weekly off day
        const employee = employees.find(e => e.attendance_id === attendance_id);

        let working_days = 0;
        let present_days = 0;
        let full_absence_count = 0;
        let half_absence_count = 0;
        let sick_leave_count = 0;
        let late_minutes = 0;
        let early_checkout_minutes = 0;
        const abnormal_dates_list = [];
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

            // Find all matching exceptions and get the latest one by created_date
            const matchingExceptions = employeeExceptions.filter(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo && 
                       (ex.attendance_id === attendance_id || ex.attendance_id === 'ALL');
            });
            
            const dateException = matchingExceptions.length > 0
                ? matchingExceptions.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]
                : null;

            if (dateException) {
                if (dateException.type === 'OFF' || dateException.type === 'PUBLIC_HOLIDAY') {
                    working_days--;
                    continue;
                } else if (dateException.type === 'MANUAL_PRESENT') {
                    present_days++;
                    continue;
                } else if (dateException.type === 'MANUAL_ABSENT') {
                    full_absence_count++;
                    continue;
                } else if (dateException.type === 'MANUAL_HALF') {
                    present_days++;
                    half_absence_count++;
                    continue;
                } else if (dateException.type === 'SICK_LEAVE') {
                    working_days--;
                    sick_leave_count++;
                    continue;
                } else if (dateException.type === 'MANUAL_EARLY_CHECKOUT') {
                    early_checkout_minutes += dateException.early_checkout_minutes || 0;
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

            let shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));

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
            }

            const dayPunches = employeePunches
                .filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw);
                    const timeB = parseTime(b.timestamp_raw);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            let filteredPunches = filterMultiplePunches(dayPunches, shift);
            
            let punchMatches = [];
            let hasUnmatchedPunch = false;
            if (shift && filteredPunches.length > 0) {
                punchMatches = matchPunchesToShiftPoints(filteredPunches, shift);
                hasUnmatchedPunch = punchMatches.some(m => m.matchedTo === null);
            }
            
            const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                   shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                   shift.am_end !== '—' && shift.pm_start !== '—' &&
                                   shift.am_end !== '-' && shift.pm_start !== '-';
            const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;

            const partialDayResult = detectPartialDay(filteredPunches, shift);

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

                if (rules.attendance_calculation?.half_day_rule === 'punch_count_or_duration' && !partialDayResult.isPartial) {
                    if (filteredPunches.length < 2 && !isSingleShift) {
                        half_absence_count++;
                    }
                }
            } else {
                full_absence_count++;
            }

            // Track allowed minutes from ALLOWED_MINUTES exception
            let allowedMinutesForDay = 0;
            if (dateException && dateException.type === 'ALLOWED_MINUTES') {
                allowedMinutesForDay = dateException.allowed_minutes || 0;
            }

            const shouldSkipTimeCalculation = dateException && [
                'SICK_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
            ].includes(dateException.type);

            if (shift && punchMatches.length > 0 && !shouldSkipTimeCalculation) {
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
            if (hasUnmatchedPunch || hasExtendedMatch) {
                abnormal_dates_list.push(dateStr);
            }
            if (rules.abnormality_rules?.detect_missing_punches && filteredPunches.length > 0 && filteredPunches.length < expectedPunches) {
                abnormal_dates_list.push(dateStr);
            }
            if (rules.abnormality_rules?.detect_extra_punches && filteredPunches.length > expectedPunches) {
                abnormal_dates_list.push(dateStr);
            }

            const dateFormatted = `${String(currentDate.getDate()).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
            if (rules.date_rules?.special_abnormal_dates?.includes(dateFormatted)) {
                abnormal_dates_list.push(dateStr);
            }

            if (rules.date_rules?.always_mark_first_date_abnormal && currentDate.getTime() === startDate.getTime()) {
                abnormal_dates_list.push(dateStr);
            }
        }

        const abnormalDatesFormatted = [...new Set(abnormal_dates_list)].map(d => new Date(d).toLocaleDateString()).join(', ');
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
            late_minutes,
            early_checkout_minutes,
            grace_minutes: baseGrace + carriedGrace,
            abnormal_dates: [...new Set(abnormal_dates_list)].join(', '),
            notes: abnormalDatesFormatted,
            auto_resolutions: autoResolutionNotes
        };
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

            const reportRun = await base44.entities.ReportRun.create({
                project_id: project.id,
                date_from: dateFrom,
                date_to: dateTo,
                employee_count: uniqueEmployeeIds.length
            });

            const allResults = [];
            for (let i = 0; i < uniqueEmployeeIds.length; i++) {
                const attendance_id = uniqueEmployeeIds[i];
                const employee = employees.find(e => e.attendance_id === attendance_id);
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
                    late_minutes: result.late_minutes,
                    early_checkout_minutes: result.early_checkout_minutes,
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
                subStatus: `Saving batch ${Math.floor(0 / 15) + 1}...`
            });
            const createBatchSize = 15;
            for (let i = 0; i < allResults.length; i += createBatchSize) {
                const batch = allResults.slice(i, i + createBatchSize);
                await base44.entities.AnalysisResult.bulkCreate(batch);
                setProgress({ 
                    current: uniqueEmployeeIds.length, 
                    total: uniqueEmployeeIds.length, 
                    status: 'Saving results to database...',
                    subStatus: `Saved ${Math.min(i + createBatchSize, allResults.length)}/${allResults.length} records`
                });
                await delay(800);
            }

            await updateProjectMutation.mutateAsync('analyzed');
            queryClient.invalidateQueries(['results', project.id]);
            queryClient.invalidateQueries(['reportRuns', project.id]);
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
                                />
                            </div>
                            <div>
                                <Label>To Date</Label>
                                <Input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    min={dateFrom}
                                    max={project.date_to}
                                    disabled={isAnalyzing}
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

                    <div>
                        <Button
                            onClick={runAnalysis}
                            disabled={isAnalyzing || !rules || punches.length === 0 || !dateFrom || !dateTo}
                            className="bg-indigo-600 hover:bg-indigo-700"
                            size="lg"
                        >
                            <Play className="w-5 h-5 mr-2" />
                            {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                        </Button>
                        <p className="text-sm text-slate-500 mt-2">
                            Select a date range and run analysis to generate attendance report for that period.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}