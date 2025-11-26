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
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
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
                    late_minutes: result.late_minutes,
                    early_checkout_minutes: result.early_checkout_minutes,
                    abnormal_dates: result.abnormal_dates,
                    notes: result.notes
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
        let autoFilledPunches = [...dayPunches];
        
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
        
        return { punches: autoFilledPunches, autoFilled };
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
                    continue;
                } else if (dateException.type === 'MANUAL_EARLY_CHECKOUT') {
                    // Add manual early checkout minutes
                    early_checkout_minutes += dateException.early_checkout_minutes || 0;
                }
            }

            // Get shift for this day
            let shift = null;
            // First check for date-specific shift
            shift = employeeShifts.find(s => s.date === dateStr);

            // If no date-specific shift, check for day-based shift
            if (!shift) {
                if (dayOfWeek === 5) { // Friday
                    // Look for general Friday shift (not date-specific)
                    shift = employeeShifts.find(s => s.is_friday_shift && !s.date);
                    // Fallback to regular shift if no Friday-specific shift exists
                    if (!shift) {
                        shift = employeeShifts.find(s => !s.is_friday_shift && !s.date);
                    }
                } else {
                    // Look for regular working day shift (not Friday, not date-specific)
                    shift = employeeShifts.find(s => !s.is_friday_shift && !s.date);
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
            
            // Check if employee has single shift (from shift timing)
            const isSingleShift = shift?.is_single_shift || false;
            
            // Auto-fill missing punch (Conservative mode - only for regular shifts with exactly 3 punches)
            let autoFilledPunch = null;
            if (!isSingleShift && filteredPunches.length === 3 && shift) {
                const autoFillResult = detectAndAutoFillMissingPunch(filteredPunches, shift);
                autoFilledPunch = autoFillResult.autoFilled;
                if (autoFilledPunch) {
                    auto_resolutions.push({
                        date: dateStr,
                        type: 'MISSING_PUNCH_AUTO_FILL',
                        details: `Auto-filled ${autoFilledPunch.type.replace('_', ' ')} with ${autoFilledPunch.time}`
                    });
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
                if (shift) {
                    // AM shift late check (first punch of the day)
                    if (shift.am_start && filteredPunches.length > 0) {
                        const firstPunch = filteredPunches[0];
                        const punchTime = parseTime(firstPunch.timestamp_raw);
                        const shiftStart = parseTime(shift.am_start);

                        if (punchTime && shiftStart && punchTime > shiftStart) {
                            const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                            late_minutes += minutes;
                        }
                    }

                    // PM shift late check (third punch - PM check-in) - skip for single shift
                    if (!isSingleShift && shift.pm_start && filteredPunches.length >= 3) {
                        const pmCheckIn = filteredPunches[2]; // 3rd punch is PM check-in
                        const punchTime = parseTime(pmCheckIn.timestamp_raw);
                        const shiftStart = parseTime(shift.pm_start);

                        if (punchTime && shiftStart && punchTime > shiftStart) {
                            const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                            late_minutes += minutes;
                        }
                    }

                    // Early checkout check - PM only (last punch before PM shift end)
                                            // Only calculate early checkout if employee has all expected punches
                                            const expectedPunches = isSingleShift ? 2 : 4;
                                            if (shift.pm_end && filteredPunches.length >= expectedPunches) {
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
                if (rules.attendance_calculation?.half_day_rule === 'punch_count_or_duration') {
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
                            if (rules.abnormality_rules?.detect_missing_punches && filteredPunches.length > 0 && filteredPunches.length < expectedPunches) {
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

        return {
            attendance_id,
            working_days,
            present_days,
            full_absence_count,
            half_absence_count,
            late_minutes,
            early_checkout_minutes,
            abnormal_dates: [...new Set(abnormal_dates_list)].join(', '),
            notes: [...new Set(abnormal_dates_list)].map(d => new Date(d).toLocaleDateString()).join(', ')
        };
    };

    const filterMultiplePunches = (punchList, shift) => {
        // Always process to identify the key punches
        if (punchList.length <= 1) return punchList;
        
        // For single shift employees, only keep first and last punch
        if (shift?.is_single_shift) {
            const punchesWithTime = punchList.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw)
            })).filter(p => p.time).sort((a, b) => a.time - b.time);
            
            if (punchesWithTime.length <= 2) return punchList;
            
            // Return first and last punch only
            const firstPunch = punchesWithTime[0];
            const lastPunch = punchesWithTime[punchesWithTime.length - 1];
            return [firstPunch, lastPunch].map(fp => punchList.find(p => p.id === fp.id)).filter(Boolean);
        }
        
        // Get cluster window from rules, default to 10 minutes
        const clusterWindow = rules?.punch_filtering?.cluster_window_minutes ?? 10;
        
        const punchesWithTime = punchList.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time);
        
        if (punchesWithTime.length === 0) return punchList;

        // 1. Morning Punch-In: Keep first punch in the cluster window
        let morningPunchIn = null;
        const morningCandidates = [];
        for (let i = 0; i < punchesWithTime.length; i++) {
            if (morningCandidates.length === 0) {
                morningCandidates.push(punchesWithTime[i]);
            } else {
                // Compare against the FIRST punch in cluster, not the last
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

        // 2. Morning Punch-Out: Keep last punch before PM start
        let morningPunchOut = null;
        if (shift && shift.am_end && punchesWithTime.length > 1) {
            const pmStartTime = shift.pm_start ? parseTime(shift.pm_start) : null;
            
            // Find punches around AM end time (not in morning cluster)
            const morningClusterEndIndex = morningCandidates.length;
            const amEndCandidates = [];
            
            for (let i = morningClusterEndIndex; i < punchesWithTime.length; i++) {
                const punch = punchesWithTime[i];
                if (pmStartTime && punch.time >= pmStartTime) continue;
                
                if (amEndCandidates.length === 0) {
                    amEndCandidates.push(punch);
                } else {
                    // Compare against the FIRST punch in this cluster
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

        // 3. PM Punch-In: First punch after AM punch-out cluster
        let pmPunchIn = null;
        const morningOutIndex = morningPunchOut ? punchesWithTime.indexOf(morningPunchOut) : (morningCandidates.length - 1);
        const pmInCandidates = [];
        for (let i = morningOutIndex + 1; i < punchesWithTime.length; i++) {
            if (pmInCandidates.length === 0) {
                pmInCandidates.push(punchesWithTime[i]);
            } else {
                // Compare against the FIRST punch in this cluster
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

        // 4. Evening Punch-Out: Keep last punch
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

        // Build filtered result
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
            <Card className="border-0 shadow-sm">
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