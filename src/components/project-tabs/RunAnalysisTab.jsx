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
                    // Look for Friday shift
                    shift = employeeShifts.find(s => s.is_friday_shift);
                } else {
                    // Look for regular working day shift (not Friday)
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

            // Presence rule
            if (dayPunches.length > 0) {
                present_days++;

                // Calculate late minutes for both AM and PM shifts
                if (shift) {
                    // AM shift late check (first punch of the day)
                    if (shift.am_start && dayPunches.length > 0) {
                        const firstPunch = dayPunches[0];
                        const punchTime = parseTime(firstPunch.timestamp_raw);
                        const shiftStart = parseTime(shift.am_start);

                        console.log(`[${dateStr}] ${attendance_id} AM Check:`, {
                            punch: firstPunch.timestamp_raw,
                            punchTime: punchTime?.toLocaleTimeString(),
                            shiftStart: shift.am_start,
                            shiftStartParsed: shiftStart?.toLocaleTimeString(),
                            isLate: punchTime && shiftStart && punchTime > shiftStart
                        });

                        if (punchTime && shiftStart && punchTime > shiftStart) {
                            const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                            late_minutes += minutes;
                            console.log(`  -> Late by ${minutes} minutes`);
                        }
                    }

                    // PM shift late check (third punch - PM check-in)
                    if (shift.pm_start && dayPunches.length >= 3) {
                        const pmCheckIn = dayPunches[2]; // 3rd punch is PM check-in
                        const punchTime = parseTime(pmCheckIn.timestamp_raw);
                        const shiftStart = parseTime(shift.pm_start);

                        console.log(`[${dateStr}] ${attendance_id} PM Check:`, {
                            punch: pmCheckIn.timestamp_raw,
                            punchTime: punchTime?.toLocaleTimeString(),
                            shiftStart: shift.pm_start,
                            shiftStartParsed: shiftStart?.toLocaleTimeString(),
                            isLate: punchTime && shiftStart && punchTime > shiftStart
                        });

                        if (punchTime && shiftStart && punchTime > shiftStart) {
                            const minutes = Math.round((punchTime - shiftStart) / (1000 * 60));
                            late_minutes += minutes;
                            console.log(`  -> Late by ${minutes} minutes`);
                        }
                    }

                    // Early checkout check (AM and PM)
                    if (shift.am_end && dayPunches.length >= 2) {
                        const secondPunch = dayPunches[1];
                        const punchTime = parseTime(secondPunch.timestamp_raw);
                        const shiftEnd = parseTime(shift.am_end);

                        if (punchTime && shiftEnd && punchTime < shiftEnd) {
                            early_checkout_minutes += Math.round((shiftEnd - punchTime) / (1000 * 60));
                        }
                    }

                    if (shift.pm_end && dayPunches.length >= 4) {
                        const lastPunch = dayPunches[dayPunches.length - 1];
                        const punchTime = parseTime(lastPunch.timestamp_raw);
                        const shiftEnd = parseTime(shift.pm_end);

                        if (punchTime && shiftEnd && punchTime < shiftEnd) {
                            early_checkout_minutes += Math.round((shiftEnd - punchTime) / (1000 * 60));
                        }
                    }
                }

                // Half day detection (simple rule: less than 2 punches)
                if (rules.attendance_calculation?.half_day_rule === 'punch_count_or_duration') {
                    if (dayPunches.length < 2) {
                        half_absence_count++;
                    }
                }
            } else {
                // No punches = full absence
                full_absence_count++;
            }

            // Abnormality detection
            const expectedPunches = 4; // 2 AM + 2 PM typically
            if (rules.abnormality_rules?.detect_missing_punches && dayPunches.length > 0 && dayPunches.length < expectedPunches) {
                abnormal_dates_list.push(dateStr);
            }
            if (rules.abnormality_rules?.detect_extra_punches && dayPunches.length > expectedPunches) {
                // Check if extra punches are within 10-minute range
                let hasRealExtraPunches = false;
                const punchTimes = dayPunches.map(p => parseTime(p.timestamp_raw));
                
                // Group punches that are within 10 minutes of each other
                const groups = [];
                punchTimes.forEach((time, idx) => {
                    if (!time) return;
                    
                    let addedToGroup = false;
                    for (let group of groups) {
                        if (Math.abs(time - group[0]) <= 10 * 60 * 1000) { // 10 minutes
                            group.push(time);
                            addedToGroup = true;
                            break;
                        }
                    }
                    if (!addedToGroup) {
                        groups.push([time]);
                    }
                });
                
                // If we have more distinct groups than expected punches, flag it
                if (groups.length > expectedPunches) {
                    hasRealExtraPunches = true;
                }
                
                if (hasRealExtraPunches) {
                    abnormal_dates_list.push(dateStr);
                }
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