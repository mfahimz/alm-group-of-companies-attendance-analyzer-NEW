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
            // Delete existing results
            const existingResults = await base44.entities.AnalysisResult.filter({ project_id: project.id });
            await Promise.all(existingResults.map(r => base44.entities.AnalysisResult.delete(r.id)));

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
                    attendance_id: result.attendance_id,
                    working_days: result.working_days,
                    present_days: result.present_days,
                    full_absence_count: result.full_absence_count,
                    half_absence_count: result.half_absence_count,
                    late_minutes: result.late_minutes,
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
        const employeePunches = punches.filter(p => p.attendance_id === attendance_id);
        const employeeShifts = shifts.filter(s => s.attendance_id === attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === attendance_id);

        let working_days = 0;
        let present_days = 0;
        let full_absence_count = 0;
        let half_absence_count = 0;
        let late_minutes = 0;
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

            // Check for exceptions on this date
            const dateException = employeeExceptions.find(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo;
            });

            if (dateException) {
                if (dateException.type === 'OFF') {
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

            // Get punches for this day
            const dayPunches = employeePunches.filter(p => p.punch_date === dateStr);

            // Presence rule
            if (dayPunches.length > 0) {
                present_days++;

                // Calculate late minutes if shift exists
                if (shift && shift.am_start && dayPunches.length > 0) {
                    const firstPunch = dayPunches[0];
                    const punchTime = parseTime(firstPunch.timestamp_raw);
                    const shiftStart = parseTime(shift.am_start);
                    
                    if (punchTime && shiftStart && punchTime > shiftStart) {
                        late_minutes += Math.round((punchTime - shiftStart) / (1000 * 60));
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
            abnormal_dates: [...new Set(abnormal_dates_list)].join(', '),
            notes: [...new Set(abnormal_dates_list)].map(d => new Date(d).toLocaleDateString()).join(', ')
        };
    };

    const parseTime = (timeStr) => {
        try {
            const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (!match) return null;
            
            let hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            const period = match[3].toUpperCase();
            
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date;
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