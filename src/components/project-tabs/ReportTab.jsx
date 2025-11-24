import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Search, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportTab({ project }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [selectedReportRun, setSelectedReportRun] = useState(null);
    const queryClient = useQueryClient();

    const formatTime = (timeStr) => {
        if (!timeStr || timeStr === '—') return '—';
        
        // If already in AM/PM format, return as is
        if (/AM|PM/i.test(timeStr)) return timeStr;
        
        // Parse 24-hour format (HH:MM or HH:MM:SS)
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return timeStr;
        
        let hours = parseInt(match[1]);
        const minutes = match[2];
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

    // Set the most recent report run as default
    React.useEffect(() => {
        if (reportRuns.length > 0 && !selectedReportRun) {
            setSelectedReportRun(reportRuns[0].id);
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

    const enrichedResults = results.map(result => {
        const employee = employees.find(e => e.attendance_id === result.attendance_id);
        return {
            ...result,
            name: employee?.name || 'Unknown'
        };
    });

    const filteredResults = enrichedResults.filter(result =>
        result.attendance_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const exportToExcel = () => {
        if (filteredResults.length === 0) {
            toast.error('No data to export');
            return;
        }

        const headers = ['Attendance ID', 'Name', 'Working Days', 'Present Days', 'Full Absences', 'Late Minutes', 'Early Checkout Minutes', 'Notes'];
        const rows = filteredResults.map(r => [
            r.attendance_id,
            r.name,
            r.working_days,
            r.present_days,
            r.full_absence_count,
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

    const getDailyBreakdown = () => {
        if (!selectedEmployee) return [];

        const breakdown = [];
        const startDate = new Date(project.date_from);
        const endDate = new Date(project.date_to);
        
        const employeePunches = punches.filter(p => 
            p.attendance_id === selectedEmployee.attendance_id &&
            p.punch_date >= project.date_from && 
            p.punch_date <= project.date_to
        );
        const employeeShifts = shifts.filter(s => s.attendance_id === selectedEmployee.attendance_id);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === selectedEmployee.attendance_id);

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

            let shift = null;
            if (dayOfWeek === 5) {
                shift = employeeShifts.find(s => s.is_friday_shift && !s.date);
            }
            if (!shift) {
                shift = employeeShifts.find(s => s.date === dateStr) || employeeShifts.find(s => !s.date && !s.is_friday_shift);
            }

            if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
                shift = {
                    am_start: dateException.new_am_start,
                    am_end: dateException.new_am_end,
                    pm_start: dateException.new_pm_start,
                    pm_end: dateException.new_pm_end
                };
            }

            let status = 'Absent';
            if (dateException) {
                if (dateException.type === 'OFF') status = 'Off';
                else if (dateException.type === 'MANUAL_PRESENT') status = 'Present (Manual)';
                else if (dateException.type === 'MANUAL_ABSENT') status = 'Absent (Manual)';
                else if (dateException.type === 'MANUAL_HALF') status = 'Half Day (Manual)';
                else if (dateException.type === 'SHIFT_OVERRIDE') status = dayPunches.length > 0 ? 'Present' : 'Absent';
            } else if (dayPunches.length > 0) {
                status = dayPunches.length >= 2 ? 'Present' : 'Half Day';
            }

            const isAbnormal = selectedEmployee.abnormal_dates?.includes(dateStr);

            breakdown.push({
                date: formatDate(dateStr),
                punches: dayPunches.length,
                punchTimes: dayPunches.map(p => p.timestamp_raw).join(', '),
                shift: shift ? `${formatTime(shift.am_start)} - ${formatTime(shift.am_end)} / ${formatTime(shift.pm_start)} - ${formatTime(shift.pm_end)}` : 'No shift',
                exception: dateException ? dateException.type : '-',
                status,
                abnormal: isAbnormal
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
                                                        dateStyle: 'medium',
                                                        timeStyle: 'short'
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
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
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
                        <Button
                            onClick={exportToExcel}
                            variant="outline"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export to Excel
                        </Button>
                    </div>
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
                                        <TableHead>Attendance ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Working Days</TableHead>
                                        <TableHead>Present Days</TableHead>
                                        <TableHead>Full Absences</TableHead>
                                        <TableHead>Late Minutes</TableHead>
                                        <TableHead>Early Checkout Minutes</TableHead>
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
                                                <span className={`${result.late_minutes > 0 ? 'text-orange-600 font-medium' : ''}`}>
                                                    {result.late_minutes}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`${result.early_checkout_minutes > 0 ? 'text-blue-600 font-medium' : ''}`}>
                                                    {result.early_checkout_minutes || 0}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                                                {result.notes || '-'}
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
                                    <TableHead>Abnormal</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {getDailyBreakdown().map((day, idx) => (
                                    <TableRow key={idx} className={day.abnormal ? 'bg-amber-50' : ''}>
                                        <TableCell className="font-medium">{day.date}</TableCell>
                                        <TableCell>{day.punches}</TableCell>
                                        <TableCell className="text-xs">{day.punchTimes || '-'}</TableCell>
                                        <TableCell className="text-xs">{day.shift}</TableCell>
                                        <TableCell className="text-xs">{day.exception}</TableCell>
                                        <TableCell>
                                            <span className={`
                                                px-2 py-1 rounded text-xs font-medium
                                                ${day.status.includes('Present') ? 'bg-green-100 text-green-700' : ''}
                                                ${day.status.includes('Absent') ? 'bg-red-100 text-red-700' : ''}
                                                ${day.status.includes('Half') ? 'bg-amber-100 text-amber-700' : ''}
                                                ${day.status.includes('Off') ? 'bg-slate-100 text-slate-700' : ''}
                                            `}>
                                                {day.status}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {day.abnormal && (
                                                <span className="text-amber-600 font-medium">Yes</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}