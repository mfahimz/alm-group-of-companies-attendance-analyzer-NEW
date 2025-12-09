import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RunAnalysisTab({ project }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progress, setProgress] = useState(null);
    const queryClient = useQueryClient();
    
    // FEATURE FLAG: Set to false to disable 2-punch auto-fill
    const ENABLE_TWO_PUNCH_AUTO_FILL = true;

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

    const uniqueEmployeeIds = [...new Set(punches.map(p => p.attendance_id))];

    const updateProjectMutation = useMutation({
        mutationFn: (status) => base44.entities.Project.update(project.id, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['projects']);
        }
    });

    const runAnalysis = async () => {
        if (!rules) {
            toast.error('Please configure attendance rules first');
            return;
        }

        if (punches.length === 0) {
            toast.error('No punch data available. Please upload punches first.');
            return;
        }

        setIsAnalyzing(true);
        setProgress({ current: 0, total: uniqueEmployeeIds.length, status: 'Processing...' });

        try {
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            // Create a new report run (keeping old reports intact)
            const reportRun = await base44.entities.ReportRun.create({
                project_id: project.id,
                employee_count: uniqueEmployeeIds.length
            });

            // Process all employees and collect results
            const allResults = [];
            for (let i = 0; i < uniqueEmployeeIds.length; i++) {
                const attendance_id = uniqueEmployeeIds[i];
                setProgress({ 
                    current: i + 1, 
                    total: uniqueEmployeeIds.length, 
                    status: `Processing ${attendance_id}...` 
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

            // Bulk create results in batches
            setProgress({ current: uniqueEmployeeIds.length, total: uniqueEmployeeIds.length, status: 'Saving results...' });
            const createBatchSize = 15;
            for (let i = 0; i < allResults.length; i += createBatchSize) {
                const batch = allResults.slice(i, i + createBatchSize);
                await base44.entities.AnalysisResult.bulkCreate(batch);
                await delay(800);
            }

            await updateProjectMutation.mutateAsync('analyzed');
            queryClient.invalidateQueries(['results', project.id]);
            queryClient.invalidateQueries(['reportRuns', project.id]);
            toast.success('Analysis completed successfully');
            setProgress({ current: uniqueEmployeeIds.length, total: uniqueEmployeeIds.length, status: 'Complete!' });
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

    // NEW: Detect TWO missing punches (for regular shifts with 2 actual punches)
    const detectTwoMissingPunches = (dayPunches, shift) => {
        if (!shift || dayPunches.length !== 2) return { punches: dayPunches, autoFilled: [] };
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time).sort((a, b) => a.time - b.time);
        
        if (punchesWithTime.length !== 2) return { punches: dayPunches, autoFilled: [] };
        
        const [firstPunch, secondPunch] = punchesWithTime;
        const amStart = parseTime(shift.am_start);
        const amEnd = parseTime(shift.am_end);
        const pmStart = parseTime(shift.pm_start);
        const pmEnd = parseTime(shift.pm_end);
        
        if (!amStart || !amEnd || !pmStart || !pmEnd) return { punches: dayPunches, autoFilled: [] };
        
        // Calculate time difference between the two punches (in hours)
        const timeDiff = (secondPunch.time - firstPunch.time) / (1000 * 60 * 60);
        
        // Pattern 1: Punches are far apart (>4 hours) → Likely AM Start + PM End (skipped break punches)
        if (timeDiff > 4) {
            return {
                punches: dayPunches,
                autoFilled: [
                    { type: 'AM_END', time: shift.am_end },
                    { type: 'PM_START', time: shift.pm_start }
                ]
            };
        }
        
        // Pattern 2: Punches are close together - determine which shift block
        // Check if both punches are in AM period
        const amMidpoint = new Date((amStart.getTime() + amEnd.getTime()) / 2);
        const pmMidpoint = new Date((pmStart.getTime() + pmEnd.getTime()) / 2);
        
        if (secondPunch.time < amMidpoint) {
            // Both punches are in AM shift → Missing PM Start and PM End
            return {
                punches: dayPunches,
                autoFilled: [
                    { type: 'PM_START', time: shift.pm_start },
                    { type: 'PM_END', time: shift.pm_end }
                ]
            };
        } else if (firstPunch.time > pmMidpoint) {
            // Both punches are in PM shift → Missing AM Start and AM End
            return {
                punches: dayPunches,
                autoFilled: [
                    { type: 'AM_START', time: shift.am_start },
                    { type: 'AM_END', time: shift.am_end }
                ]
            };
        }
        
        // Default: Assume most common pattern (skipped break punches)
        return {
            punches: dayPunches,
            autoFilled: [
                { type: 'AM_END', time: shift.am_end },
                { type: 'PM_START', time: shift.pm_start }
            ]
        };
    };

    // Detect which punch is missing and auto-fill it (Intelligent mode)
    const detectAndAutoFillMissingPunch = (dayPunches, shift, isSingleShift) => {
        if (!shift) return { punches: dayPunches, autoFilled: null };
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time).sort((a, b) => a.time - b.time);
        
        // Handle single shift employees (expect 2 punches: in and out)
        if (isSingleShift && punchesWithTime.length === 1) {
            const shiftStart = parseTime(shift.am_start);
            const shiftEnd = parseTime(shift.pm_end);
            
            if (!shiftStart || !shiftEnd) return { punches: dayPunches, autoFilled: null };
            
            const singlePunch = punchesWithTime[0];
            const shiftMidpoint = new Date((shiftStart.getTime() + shiftEnd.getTime()) / 2);
            
            // Determine if punch is closer to start or end
            // If punch is before midpoint, assume it's punch in -> auto-fill punch out
            // If punch is after midpoint, assume it's punch out -> auto-fill punch in
            let autoFilled = null;
            if (singlePunch.time < shiftMidpoint) {
                autoFilled = { type: 'PUNCH_OUT', time: shift.pm_end };
            } else {
                autoFilled = { type: 'PUNCH_IN', time: shift.am_start };
            }
            
            return { punches: dayPunches, autoFilled };
        }
        
        // Handle regular shift employees (expect 4 punches)
        if (!isSingleShift && punchesWithTime.length === 3) {
            const amStart = parseTime(shift.am_start);
            const amEnd = parseTime(shift.am_end);
            const pmStart = parseTime(shift.pm_start);
            const pmEnd = parseTime(shift.pm_end);
            
            if (!amStart || !amEnd || !pmStart || !pmEnd) return { punches: dayPunches, autoFilled: null };
            
            const [p1, p2, p3] = punchesWithTime;
            
            // Calculate distances from each punch to expected shift times
            const p1ToAmStart = Math.abs(p1.time - amStart) / (1000 * 60);
            const p1ToAmEnd = Math.abs(p1.time - amEnd) / (1000 * 60);
            const p2ToAmEnd = Math.abs(p2.time - amEnd) / (1000 * 60);
            const p2ToPmStart = Math.abs(p2.time - pmStart) / (1000 * 60);
            const p3ToPmStart = Math.abs(p3.time - pmStart) / (1000 * 60);
            const p3ToPmEnd = Math.abs(p3.time - pmEnd) / (1000 * 60);
            
            let autoFilled = null;
            
            // Determine position of each punch by finding closest match
            const p1IsAmStart = p1ToAmStart < p1ToAmEnd;
            const p2IsAmEnd = p2ToAmEnd < p2ToPmStart;
            const p3IsPmEnd = p3ToPmEnd < p3ToPmStart;
            
            // Based on pattern, determine missing punch
            if (p1IsAmStart && p2IsAmEnd && p3IsPmEnd) {
                // Pattern: AM Start, AM End, PM End -> Missing PM Start
                autoFilled = { type: 'PM_START', time: shift.pm_start };
            } else if (p1IsAmStart && !p2IsAmEnd && p3IsPmEnd) {
                // Pattern: AM Start, PM Start, PM End -> Missing AM End
                autoFilled = { type: 'AM_END', time: shift.am_end };
            } else if (p1IsAmStart && p2IsAmEnd && !p3IsPmEnd) {
                // Pattern: AM Start, AM End, PM Start -> Missing PM End
                autoFilled = { type: 'PM_END', time: shift.pm_end };
            } else if (!p1IsAmStart && p2IsAmEnd && p3IsPmEnd) {
                // Pattern: AM End, PM Start, PM End -> Missing AM Start
                autoFilled = { type: 'AM_START', time: shift.am_start };
            } else {
                // Fallback: Use most common case - missing PM End
                autoFilled = { type: 'PM_END', time: shift.pm_end };
            }
            
            return { punches: dayPunches, autoFilled };
        }
        
        return { punches: dayPunches, autoFilled: null };
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
        
        // Calculate expected work hours and actual work hours
        const expectedMinutes = (pmEnd - amStart) / (1000 * 60);
        const actualMinutes = (lastPunch - firstPunch) / (1000 * 60);
        
        // If worked less than 50% of expected time, it's a partial/half day
        if (actualMinutes < expectedMinutes * 0.5 && actualMinutes > 0) {
            return { 
                isPartial: true, 
                reason: `Worked ${Math.round(actualMinutes)} min (expected ${Math.round(expectedMinutes)} min)` 
            };
        }
        
        return { isPartial: false, reason: null };
    };

    const analyzeEmployee = async (attendance_id) => {
        const employeePunches = punches.filter(p => 
            p.attendance_id === attendance_id && 
            p.punch_date >= project.date_from && 
            p.punch_date <= project.date_to
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === attendance_id || e.attendance_id === 'ALL');

        let working_days = 0;
        let present_days = 0;
        let full_absence_count = 0;
        let half_absence_count = 0;
        let sick_leave_count = 0;
        let late_minutes = 0;
        let early_checkout_minutes = 0;
        const abnormal_dates_list = [];
        const auto_resolutions = [];

        const startDate = new Date(project.date_from);
        const endDate = new Date(project.date_to);
        
        for (let d = new Date(startDate); d <= endDate; d = new Date(d.setDate(d.getDate() + 1))) {
            const currentDate = new Date(d);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();

            // Skip Sundays (holiday rule)
            if (rules.date_rules?.holidays?.includes('Sunday') && dayOfWeek === 0) {
                continue;
            }

            working_days++;

            // Check for exceptions on this date (employee-specific or public holidays)
            const dateException = employeeExceptions.find(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo && 
                       (ex.attendance_id === attendance_id || ex.attendance_id === 'ALL');
            });

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
                    // Sick leave counts as present but tracked separately
                    present_days++;
                    sick_leave_count++;
                    continue;
                } else if (dateException.type === 'MANUAL_EARLY_CHECKOUT') {
                    // Add manual early checkout minutes
                    early_checkout_minutes += dateException.early_checkout_minutes || 0;
                }
            }

            // Get shift for this day - CRITICAL: Must match date to correct block
            let shift = null;
            
            // Helper to check if shift is effective on current date
            const isShiftEffective = (s) => {
                if (!s.effective_from || !s.effective_to) return true;
                const from = new Date(s.effective_from);
                const to = new Date(s.effective_to);
                // Current date must fall within the shift's effective range
                // Use setHours to compare dates only (ignore time)
                const currentDateOnly = new Date(currentDate);
                currentDateOnly.setHours(0, 0, 0, 0);
                const fromDateOnly = new Date(from);
                fromDateOnly.setHours(0, 0, 0, 0);
                const toDateOnly = new Date(to);
                toDateOnly.setHours(0, 0, 0, 0);
                return currentDateOnly >= fromDateOnly && currentDateOnly <= toDateOnly;
            };

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

            // Check for shift override exception
            if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
                shift = {
                    am_start: dateException.new_am_start,
                    am_end: dateException.new_am_end,
                    pm_start: dateException.new_pm_start,
                    pm_end: dateException.new_pm_end
                };
            }

            // Get punches for this day and sort by time
            const dayPunches = employeePunches
                .filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw);
                    const timeB = parseTime(b.timestamp_raw);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            // Filter multiple punches before analysis
            let filteredPunches = filterMultiplePunches(dayPunches, shift);
            
            // Check if employee has single shift (from shift timing or infer from shift structure)
            // Auto-detect single shift if am_end and pm_start are both null/empty or "—"
            const hasMiddleTimes = shift?.am_end && shift?.pm_start && 
                                   shift.am_end.trim() !== '' && shift.pm_start.trim() !== '' &&
                                   shift.am_end !== '—' && shift.pm_start !== '—' &&
                                   shift.am_end !== '-' && shift.pm_start !== '-';
            const isSingleShift = shift?.is_single_shift || !hasMiddleTimes;
            
            // Debug logging for single shift detection
            if (filteredPunches.length === 1 && shift) {
                console.log(`[${dateStr}] ${attendance_id}: Single punch detected`, {
                    punchTime: filteredPunches[0].timestamp_raw,
                    shiftStart: shift.am_start,
                    shiftEnd: shift.pm_end,
                    amEnd: shift.am_end,
                    pmStart: shift.pm_start,
                    hasMiddleTimes,
                    isSingleShift
                });
            }
            
            // Auto-fill missing punch (Conservative mode)
            let autoFilledPunch = null;
            let autoFilledPunches = []; // For 2-punch scenario
            if (shift) {
                // For single shift: auto-fill if exactly 1 punch
                // For regular shift: auto-fill if exactly 3 punches OR 2 punches (NEW)
                const shouldAutoFill = (isSingleShift && filteredPunches.length === 1) || 
                                       (!isSingleShift && filteredPunches.length === 3) ||
                                       (!isSingleShift && filteredPunches.length === 2 && ENABLE_TWO_PUNCH_AUTO_FILL);
                
                if (shouldAutoFill) {
                    // Handle 2-punch scenario (NEW)
                    if (!isSingleShift && filteredPunches.length === 2 && ENABLE_TWO_PUNCH_AUTO_FILL) {
                        const autoFillResult = detectTwoMissingPunches(filteredPunches, shift);
                        autoFilledPunches = autoFillResult.autoFilled || [];
                        if (autoFilledPunches.length > 0) {
                            console.log(`[${dateStr}] ${attendance_id}: Two-punch auto-fill triggered`, {
                                types: autoFilledPunches.map(p => p.type),
                                times: autoFilledPunches.map(p => p.time),
                                actualPunches: filteredPunches.map(p => p.timestamp_raw)
                            });
                            autoFilledPunches.forEach(filled => {
                                auto_resolutions.push({
                                    date: dateStr,
                                    type: 'MISSING_PUNCH_AUTO_FILL',
                                    details: `Auto-filled ${filled.type.replace(/_/g, ' ')} with ${filled.time}`
                                });
                            });
                        }
                    } else {
                        // Original 1-punch or 3-punch scenario
                        const autoFillResult = detectAndAutoFillMissingPunch(filteredPunches, shift, isSingleShift);
                        autoFilledPunch = autoFillResult.autoFilled;
                        if (autoFilledPunch) {
                            console.log(`[${dateStr}] ${attendance_id}: Auto-fill triggered`, {
                                type: autoFilledPunch.type,
                                time: autoFilledPunch.time,
                                actualPunches: filteredPunches.map(p => p.timestamp_raw)
                            });
                            auto_resolutions.push({
                                date: dateStr,
                                type: 'MISSING_PUNCH_AUTO_FILL',
                                details: `Auto-filled ${autoFilledPunch.type.replace(/_/g, ' ')} with ${autoFilledPunch.time}`
                            });
                        } else {
                            console.log(`[${dateStr}] ${attendance_id}: Auto-fill NOT triggered (shouldAutoFill=${shouldAutoFill}, punches=${filteredPunches.length})`);
                        }
                    }
                }
            }

            // Presence rule
            if (filteredPunches.length > 0) {
                // Detect partial day (worked but left early)
                const partialDayResult = detectPartialDay(filteredPunches, shift);
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

                // Calculate late minutes for both AM and PM shifts
                if (shift && !partialDayResult.isPartial) {
                    // Calculate effective punch count (actual punches + auto-filled)
                    const effectivePunchCount = filteredPunches.length + (autoFilledPunch ? 1 : 0) + autoFilledPunches.length;
                    const autoFilledTypes = autoFilledPunches.map(p => p.type);
                    
                    // AM shift late check (first punch of the day)
                    // Skip if AM_START/PUNCH_IN was auto-filled
                    if (shift.am_start && filteredPunches.length > 0 && 
                        autoFilledPunch?.type !== 'AM_START' && autoFilledPunch?.type !== 'PUNCH_IN' &&
                        !autoFilledTypes.includes('AM_START') && !autoFilledTypes.includes('PUNCH_IN')) {
                        const firstPunch = filteredPunches[0];
                        const punchTime = parseTime(firstPunch.timestamp_raw);
                        const shiftStart = parseTime(shift.am_start);

                        if (punchTime && shiftStart && punchTime > shiftStart) {
                            const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                            late_minutes += minutes;
                            console.log(`[${dateStr}] ${attendance_id}: Late AM - ${minutes} min`, {
                                punch: firstPunch.timestamp_raw,
                                shiftStart: shift.am_start,
                                isSingleShift
                            });
                        }
                    }

                    // PM shift late check (third punch - PM check-in) - skip for single shift
                    // Skip if PM_START was auto-filled
                    // Use effectivePunchCount to consider auto-filled punches
                    if (!isSingleShift && shift.pm_start && effectivePunchCount >= 4 && 
                        filteredPunches.length >= 3 && autoFilledPunch?.type !== 'PM_START' &&
                        !autoFilledTypes.includes('PM_START')) {
                        const pmCheckIn = filteredPunches[2]; // 3rd punch is PM check-in
                        const punchTime = parseTime(pmCheckIn.timestamp_raw);
                        const shiftStart = parseTime(shift.pm_start);

                        if (punchTime && shiftStart && punchTime > shiftStart) {
                            const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                            late_minutes += minutes;
                        }
                    }

                    // Early checkout check - PM only (last punch before PM shift end)
                    // Skip if PM_END/PUNCH_OUT was auto-filled
                    const expectedPunches = isSingleShift ? 2 : 4;
                    if (shift.pm_end && effectivePunchCount >= expectedPunches && 
                        autoFilledPunch?.type !== 'PM_END' && autoFilledPunch?.type !== 'PUNCH_OUT' &&
                        !autoFilledTypes.includes('PM_END') && !autoFilledTypes.includes('PUNCH_OUT')) {
                        const lastPunch = filteredPunches[filteredPunches.length - 1];
                        const punchTime = parseTime(lastPunch.timestamp_raw);
                        const shiftEnd = parseTime(shift.pm_end);

                        if (punchTime && shiftEnd && punchTime < shiftEnd) {
                            early_checkout_minutes += Math.round((shiftEnd - punchTime) / (1000 * 60));
                        }
                    }
                }
                
                // Half day detection (simple rule: less than 2 punches)
                // Skip half day detection if employee has single shift (expects only 2 punches)
                // Also skip if partial day was already detected above
                if (rules.attendance_calculation?.half_day_rule === 'punch_count_or_duration' && !partialDayResult.isPartial) {
                    if (filteredPunches.length < 2 && !isSingleShift) {
                        half_absence_count++;
                    }
                }
            } else {
                // No punches = full absence
                full_absence_count++;
            }

            // Abnormality detection (use filtered punches)
            // For single shift employees, expected punches is 2, otherwise 4
            const expectedPunches = isSingleShift ? 2 : 4;
            // Don't mark as abnormal if we auto-filled the missing punch(es)
            const effectivePunchCount = filteredPunches.length + (autoFilledPunch ? 1 : 0) + autoFilledPunches.length;
            if (rules.abnormality_rules?.detect_missing_punches && filteredPunches.length > 0 && effectivePunchCount < expectedPunches) {
                abnormal_dates_list.push(dateStr);
            }
            if (rules.abnormality_rules?.detect_extra_punches && filteredPunches.length > expectedPunches) {
                abnormal_dates_list.push(dateStr);
            }

            // Special abnormal dates
            const dateFormatted = `${String(currentDate.getDate()).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}/${currentDate.getFullYear()}`;
            if (rules.date_rules?.special_abnormal_dates?.includes(dateFormatted)) {
                abnormal_dates_list.push(dateStr);
            }

            // Always mark first date abnormal rule
            if (rules.date_rules?.always_mark_first_date_abnormal && currentDate.getTime() === startDate.getTime()) {
                abnormal_dates_list.push(dateStr);
            }
        }

        // Build notes with auto-resolutions for transparency
        const abnormalDatesFormatted = [...new Set(abnormal_dates_list)].map(d => new Date(d).toLocaleDateString()).join(', ');
        const autoResolutionNotes = auto_resolutions.length > 0 
            ? auto_resolutions.map(r => `${new Date(r.date).toLocaleDateString()}: ${r.details}`).join(' | ')
            : '';
        
        const employee = employees.find(e => e.attendance_id === attendance_id);
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

    const filterMultiplePunches = (punchList, shift) => {
        if (punchList.length <= 1) return punchList;

        const punchesWithTime = punchList.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time);

        if (punchesWithTime.length === 0) return punchList;

        // ONLY remove exact duplicates (same timestamp within 10 minutes)
        // Do NOT filter based on shift times - keep ALL valid punches
        const deduped = [];
        for (let i = 0; i < punchesWithTime.length; i++) {
            const current = punchesWithTime[i];
            const isDuplicate = deduped.some(p => Math.abs(current.time - p.time) / (1000 * 60) < 10);
            if (!isDuplicate) {
                deduped.push(current);
            }
        }

        // Sort by time and return all non-duplicate punches
        const sortedPunches = deduped.sort((a, b) => a.time - b.time);
        return sortedPunches.map(p => punchList.find(punch => punch.id === p.id)).filter(Boolean);
    };

    const parseTime = (timeStr) => {
        try {
            if (!timeStr || timeStr === '—') return null;
            
            // Try AM/PM format first: "8:00 AM" or "08:00 AM" or "DD/MM/YYYY 8:00 AM"
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
            
            // Fallback: Try 24-hour format for backwards compatibility: "08:00:00", "08:00"
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

    return (
        <div className="space-y-6">
            <Card className="border-0 shadow-md bg-white ring-1 ring-slate-950/5">
                <CardHeader>
                    <CardTitle>Run Attendance Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Pre-check Status */}
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

                    {/* Progress */}
                    {progress && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                            <div className="flex items-center gap-3 mb-2">
                                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                                <span className="font-medium text-indigo-900">{progress.status}</span>
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

                    {/* Run Button */}
                    <div>
                        <Button
                            onClick={runAnalysis}
                            disabled={isAnalyzing || !rules || punches.length === 0}
                            className="bg-indigo-600 hover:bg-indigo-700"
                            size="lg"
                        >
                            <Play className="w-5 h-5 mr-2" />
                            {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                        </Button>
                        <p className="text-sm text-slate-500 mt-2">
                            This will process attendance for all employees in the date range and generate results.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}