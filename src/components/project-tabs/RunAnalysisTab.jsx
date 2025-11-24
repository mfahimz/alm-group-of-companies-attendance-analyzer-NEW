import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { parseTimeUAE, getUAEDate } from '../utils/timezone';

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

    const { data: dayEdits = [] } = useQuery({
        queryKey: ['dayEdits', project.id],
        queryFn: () => base44.entities.DayLevelEdit.filter({ project_id: project.id })
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
            // Create a new report run
            const reportRun = await base44.entities.ReportRun.create({
                project_id: project.id,
                employee_count: uniqueEmployeeIds.length
            });

            // Process each employee
            for (let i = 0; i < uniqueEmployeeIds.length; i++) {
                const attendance_id = uniqueEmployeeIds[i];
                setProgress({ 
                    current: i + 1, 
                    total: uniqueEmployeeIds.length, 
                    status: `Processing ${attendance_id}...` 
                });

                const result = await analyzeEmployee(attendance_id);
                
                await base44.entities.AnalysisResult.create({
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

            await updateProjectMutation.mutateAsync('analyzed');
            queryClient.invalidateQueries(['results', project.id]);
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

    const analyzeEmployee = async (attendance_id) => {
        const employeePunches = punches.filter(p => 
            p.attendance_id === attendance_id && 
            p.punch_date >= project.date_from && 
            p.punch_date <= project.date_to
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === attendance_id);
        const employeeDayEdits = dayEdits.filter(e => e.attendance_id === attendance_id);

        let working_days = 0;
        let present_days = 0;
        let full_absence_count = 0;
        let half_absence_count = 0;
        let late_minutes = 0;
        let early_checkout_minutes = 0;
        const abnormal_dates_list = [];

        const startDate = new Date(project.date_from);
        const endDate = new Date(project.date_to);
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
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

            // Check for day-level manual edits
            const dayEdit = employeeDayEdits.find(e => e.date === dateStr);

            // Get punches for this day and sort by time
            let dayPunches = employeePunches
                .filter(p => p.punch_date === dateStr)
                .sort((a, b) => {
                    const timeA = parseTime(a.timestamp_raw);
                    const timeB = parseTime(b.timestamp_raw);
                    return (timeA?.getTime() || 0) - (timeB?.getTime() || 0);
                });

            // If user selected specific punches for this day, filter to only those
            if (dayEdit && dayEdit.selected_punch_ids) {
                const selectedIds = dayEdit.selected_punch_ids.split(',');
                dayPunches = dayPunches.filter(p => selectedIds.includes(p.id));
            }

            // Filter multiple punches before analysis
            const filteredPunches = filterMultiplePunches(dayPunches, shift);

            // Apply day-level custom edits or calculate normally
            if (dayEdit && dayEdit.custom_status) {
                // User has forced a status for this day
                if (dayEdit.custom_status === 'PRESENT') {
                    present_days++;
                } else if (dayEdit.custom_status === 'HALF') {
                    present_days++;
                    half_absence_count++;
                } else if (dayEdit.custom_status === 'ABSENT') {
                    full_absence_count++;
                }

                // Use custom late/early minutes if provided
                if (dayEdit.custom_late_minutes !== null && dayEdit.custom_late_minutes !== undefined) {
                    late_minutes += dayEdit.custom_late_minutes;
                }
                if (dayEdit.custom_early_minutes !== null && dayEdit.custom_early_minutes !== undefined) {
                    early_checkout_minutes += dayEdit.custom_early_minutes;
                }
            } else {
                // Normal calculation
                // Presence rule
                if (filteredPunches.length > 0) {
                    present_days++;

                    // Calculate late minutes for both AM and PM shifts
                    if (shift) {
                        let dayLateMinutes = 0;
                        let dayEarlyMinutes = 0;

                        // AM shift late check (first punch of the day)
                        if (shift.am_start && filteredPunches.length > 0) {
                            const firstPunch = filteredPunches[0];
                            const punchTime = parseTime(firstPunch.timestamp_raw);
                            const shiftStart = parseTime(shift.am_start);

                            if (punchTime && shiftStart && punchTime > shiftStart) {
                                const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                                dayLateMinutes += minutes;
                            }
                        }

                        // PM shift late check (third punch - PM check-in)
                        if (shift.pm_start && filteredPunches.length >= 3) {
                            const pmCheckIn = filteredPunches[2]; // 3rd punch is PM check-in
                            const punchTime = parseTime(pmCheckIn.timestamp_raw);
                            const shiftStart = parseTime(shift.pm_start);

                            if (punchTime && shiftStart && punchTime > shiftStart) {
                                const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                                dayLateMinutes += minutes;
                            }
                        }

                        // Early checkout check (AM and PM)
                        if (shift.am_end && filteredPunches.length >= 2) {
                            const secondPunch = filteredPunches[1];
                            const punchTime = parseTime(secondPunch.timestamp_raw);
                            const shiftEnd = parseTime(shift.am_end);

                            if (punchTime && shiftEnd && punchTime < shiftEnd) {
                                dayEarlyMinutes += Math.round((shiftEnd - punchTime) / (1000 * 60));
                            }
                        }

                        if (shift.pm_end && filteredPunches.length >= 4) {
                            const lastPunch = filteredPunches[filteredPunches.length - 1];
                            const punchTime = parseTime(lastPunch.timestamp_raw);
                            const shiftEnd = parseTime(shift.pm_end);

                            if (punchTime && shiftEnd && punchTime < shiftEnd) {
                                dayEarlyMinutes += Math.round((shiftEnd - punchTime) / (1000 * 60));
                            }
                        }

                        // Apply custom overrides if provided, otherwise use calculated
                        if (dayEdit && dayEdit.custom_late_minutes !== null && dayEdit.custom_late_minutes !== undefined) {
                            late_minutes += dayEdit.custom_late_minutes;
                        } else {
                            late_minutes += dayLateMinutes;
                        }

                        if (dayEdit && dayEdit.custom_early_minutes !== null && dayEdit.custom_early_minutes !== undefined) {
                            early_checkout_minutes += dayEdit.custom_early_minutes;
                        } else {
                            early_checkout_minutes += dayEarlyMinutes;
                        }
                    }

                    // Half day detection (simple rule: less than 2 punches)
                    if (rules.attendance_calculation?.half_day_rule === 'punch_count_or_duration') {
                        if (filteredPunches.length < 2) {
                            half_absence_count++;
                        }
                    }
                } else {
                    // No punches = full absence
                    full_absence_count++;
                }
            }

            // Abnormality detection (use filtered punches)
            const expectedPunches = 4; // 2 AM + 2 PM typically
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

    const filterMultiplePunches = (punches, shift) => {
        if (punches.length <= 4) return punches; // No filtering needed for 4 or fewer punches
        
        const punchesWithTime = punches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time);
        
        if (punchesWithTime.length === 0) return punches;

        // 1. Morning Punch-In: Keep first punch in a rolling 10-minute window
        let morningPunchIn = null;
        const morningCandidates = [];
        for (let i = 0; i < punchesWithTime.length; i++) {
            if (morningCandidates.length === 0) {
                morningCandidates.push(punchesWithTime[i]);
            } else {
                const lastInCluster = morningCandidates[morningCandidates.length - 1];
                const timeDiff = Math.abs(punchesWithTime[i].time - lastInCluster.time) / (1000 * 60);
                if (timeDiff <= 10) {
                    morningCandidates.push(punchesWithTime[i]);
                } else {
                    break; // End of morning cluster
                }
            }
        }
        morningPunchIn = morningCandidates[0]; // Keep first in cluster

        // 2. Morning Punch-Out: Keep last punch in afternoon shift window within 10-minute cluster
        let morningPunchOut = null;
        if (shift && shift.am_end && punchesWithTime.length > 1) {
            const amEndTime = parseTime(shift.am_end);
            const pmStartTime = shift.pm_start ? parseTime(shift.pm_start) : null;
            
            // Find punches in the AM end window (before PM start or around AM end)
            const amEndCandidates = [];
            for (let i = 1; i < punchesWithTime.length; i++) {
                const punch = punchesWithTime[i];
                // Skip if this is definitely PM punch-in or later
                if (pmStartTime && punch.time >= pmStartTime) continue;
                
                // Consider punches around AM end time
                if (amEndCandidates.length === 0) {
                    amEndCandidates.push(punch);
                } else {
                    const lastInCluster = amEndCandidates[amEndCandidates.length - 1];
                    const timeDiff = Math.abs(punch.time - lastInCluster.time) / (1000 * 60);
                    if (timeDiff <= 10) {
                        amEndCandidates.push(punch);
                    }
                }
            }
            if (amEndCandidates.length > 0) {
                morningPunchOut = amEndCandidates[amEndCandidates.length - 1]; // Keep last in cluster
            }
        }

        // 3. PM Punch-In: Similar to morning punch-in, find first punch after AM punch-out
        let pmPunchIn = null;
        const morningOutIndex = morningPunchOut ? punchesWithTime.indexOf(morningPunchOut) : 0;
        const pmInCandidates = [];
        for (let i = morningOutIndex + 1; i < punchesWithTime.length; i++) {
            if (pmInCandidates.length === 0) {
                pmInCandidates.push(punchesWithTime[i]);
            } else {
                const lastInCluster = pmInCandidates[pmInCandidates.length - 1];
                const timeDiff = Math.abs(punchesWithTime[i].time - lastInCluster.time) / (1000 * 60);
                if (timeDiff <= 10) {
                    pmInCandidates.push(punchesWithTime[i]);
                } else {
                    break;
                }
            }
        }
        if (pmInCandidates.length > 0) {
            pmPunchIn = pmInCandidates[0]; // Keep first in cluster
        }

        // 4. Evening Punch-Out: Keep last punch after shift end time
        let eveningPunchOut = null;
        if (shift && shift.pm_end) {
            const pmEndTime = parseTime(shift.pm_end);
            const afterShiftPunches = punchesWithTime.filter(p => p.time >= pmEndTime);
            
            if (afterShiftPunches.length > 0) {
                eveningPunchOut = afterShiftPunches[afterShiftPunches.length - 1]; // Keep last
            } else if (punchesWithTime.length > 0) {
                // If no punches after shift end, take the last punch overall
                eveningPunchOut = punchesWithTime[punchesWithTime.length - 1];
            }
        } else if (punchesWithTime.length > 0) {
            eveningPunchOut = punchesWithTime[punchesWithTime.length - 1];
        }

        // Build filtered result: [morning-in, morning-out, pm-in, evening-out]
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

        // Return original punch objects (without added time property)
        return filtered.map(fp => punches.find(p => p.id === fp.id)).filter(Boolean);
    };

    const parseTime = parseTimeUAE;

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
                                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
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