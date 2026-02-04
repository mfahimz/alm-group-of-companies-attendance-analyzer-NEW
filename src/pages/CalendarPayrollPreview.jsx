import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Lock, DollarSign, AlertCircle, Play, CheckCircle, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

/**
 * PHASE 4: CALENDAR PAYROLL PREVIEW (AL MARAGHI MOTORS ONLY)
 * 
 * Preview-only interface for calendar-based payroll.
 * Does NOT affect payments. Legacy project payroll remains payment authority.
 */
export default function CalendarPayrollPreview() {
    const queryClient = useQueryClient();
    const [selectedMonthId, setSelectedMonthId] = useState(null);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';

    // Check if calendar dual-run is enabled
    const { data: companySettings, isLoading: loadingSettings } = useQuery({
        queryKey: ['companySettings', currentUser?.company],
        queryFn: async () => {
            const settings = await base44.entities.CompanySettings.filter({ 
                company: currentUser?.company 
            }, null, 1);
            return settings[0] || null;
        },
        enabled: !!currentUser?.company
    });

    const isCalendarEnabled = companySettings?.calendar_dual_run_enabled === true;
    const isAlMaraghi = currentUser?.company === 'Al Maraghi Motors';

    // Fetch calendar months
    const { data: calendarMonths = [] } = useQuery({
        queryKey: ['calendarMonths', currentUser?.company],
        queryFn: () => base44.entities.CalendarMonth.filter({ 
            company: currentUser?.company 
        }, '-year,-month', 100),
        enabled: !!currentUser?.company && isCalendarEnabled
    });

    // Fetch selected month details
    const { data: selectedMonth } = useQuery({
        queryKey: ['calendarMonth', selectedMonthId],
        queryFn: () => base44.entities.CalendarMonth.filter({ id: selectedMonthId }, null, 1).then(r => r[0]),
        enabled: !!selectedMonthId
    });

    const { data: attendanceSummaries = [] } = useQuery({
        queryKey: ['attendanceSummaries', selectedMonthId],
        queryFn: () => base44.entities.AttendanceSummary.filter({ calendar_month_id: selectedMonthId }, null, 5000),
        enabled: !!selectedMonthId
    });

    const { data: payrollSnapshots = [] } = useQuery({
        queryKey: ['payrollSnapshots', selectedMonthId],
        queryFn: () => base44.entities.PayrollSnapshot.filter({ calendar_month_id: selectedMonthId }, null, 5000),
        enabled: !!selectedMonthId
    });

    // Run attendance aggregation
    const runAttendanceMutation = useMutation({
        mutationFn: (monthId) => base44.functions.invoke('runCalendarAttendanceAggregation', {
            calendar_month_id: monthId
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calendarMonths'] });
            queryClient.invalidateQueries({ queryKey: ['attendanceSummaries'] });
            toast.success('Attendance aggregation complete');
        },
        onError: (error) => {
            toast.error('Failed: ' + (error.response?.data?.error || error.message));
        }
    });

    // Run payroll calculation
    const runPayrollMutation = useMutation({
        mutationFn: (monthId) => base44.functions.invoke('runCalendarPayrollCalculation', {
            calendar_month_id: monthId
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['calendarMonths'] });
            queryClient.invalidateQueries({ queryKey: ['payrollSnapshots'] });
            toast.success('Payroll calculation complete (PREVIEW ONLY)');
        },
        onError: (error) => {
            toast.error('Failed: ' + (error.response?.data?.error || error.message));
        }
    });

    if (loadingSettings) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <p className="text-slate-500">Loading...</p>
            </div>
        );
    }

    if (!isAlMaraghi) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <Alert className="border-red-300 bg-red-50">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <div className="ml-3">
                        <h3 className="font-semibold text-red-900">Access Restricted</h3>
                        <p className="text-sm text-red-800 mt-1">
                            Calendar Payroll is only available for Al Maraghi Motors.
                        </p>
                    </div>
                </Alert>
            </div>
        );
    }

    if (!isCalendarEnabled) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <Alert className="border-amber-300 bg-amber-50">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <div className="ml-3">
                        <h3 className="font-semibold text-amber-900">Calendar Payroll Disabled</h3>
                        <p className="text-sm text-amber-800 mt-1">
                            Calendar dual-run is not enabled for your company. 
                            {isAdmin && ' Enable it in Company Settings to preview calendar payroll.'}
                        </p>
                    </div>
                </Alert>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* PREVIEW ONLY BANNER */}
            <Alert className="border-blue-300 bg-blue-50">
                <AlertCircle className="h-5 w-5 text-blue-600" />
                <div className="ml-3">
                    <h3 className="font-semibold text-blue-900">Preview Only – Payments Use Project Payroll</h3>
                    <p className="text-sm text-blue-800 mt-1">
                        This is a validation preview of calendar-based payroll. <strong>Actual payments still use legacy project-based payroll.</strong> Calendar payroll does not affect WPS or payment processing.
                    </p>
                </div>
            </Alert>

            {/* Calendar Months List */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-indigo-600" />
                        Calendar Months
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {calendarMonths.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <p>No calendar months created yet.</p>
                            {isAdmin && <p className="text-sm mt-2">Create calendar months to begin.</p>}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Period</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Attendance</TableHead>
                                    <TableHead>Payroll</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {calendarMonths.map((month) => {
                                    const monthName = new Date(month.year, month.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                                    
                                    return (
                                        <TableRow key={month.id}>
                                            <TableCell className="font-medium">{monthName}</TableCell>
                                            <TableCell>
                                                {month.status === 'open' && <Badge variant="outline">Open</Badge>}
                                                {month.status === 'attendance_locked' && <Badge className="bg-blue-100 text-blue-700">Attendance Locked</Badge>}
                                                {month.status === 'payroll_finalized' && <Badge className="bg-green-100 text-green-700">Payroll Finalized</Badge>}
                                                {month.status === 'MIRRORED' && <Badge className="bg-purple-100 text-purple-700">Mirrored</Badge>}
                                            </TableCell>
                                            <TableCell>
                                                {month.status === 'open' ? '-' : <CheckCircle className="w-4 h-4 text-green-600" />}
                                            </TableCell>
                                            <TableCell>
                                                {month.status === 'payroll_finalized' || month.status === 'MIRRORED' ? <CheckCircle className="w-4 h-4 text-green-600" /> : '-'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline"
                                                        onClick={() => setSelectedMonthId(month.id)}
                                                    >
                                                        View
                                                    </Button>
                                                    {isAdmin && month.status === 'open' && (
                                                        <Button 
                                                            size="sm"
                                                            onClick={() => runAttendanceMutation.mutate(month.id)}
                                                            disabled={runAttendanceMutation.isPending}
                                                        >
                                                            <Play className="w-4 h-4 mr-1" />
                                                            Aggregate
                                                        </Button>
                                                    )}
                                                    {isAdmin && month.status === 'attendance_locked' && (
                                                        <Button 
                                                            size="sm"
                                                            onClick={() => runPayrollMutation.mutate(month.id)}
                                                            disabled={runPayrollMutation.isPending}
                                                            className="bg-green-600 hover:bg-green-700"
                                                        >
                                                            <DollarSign className="w-4 h-4 mr-1" />
                                                            Calculate
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Selected Month Details */}
            {selectedMonth && (
                <>
                    <Card className="border-0 shadow-lg">
                        <CardHeader>
                            <CardTitle>
                                {new Date(selectedMonth.year, selectedMonth.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div className="bg-slate-50 p-3 rounded">
                                    <p className="text-xs text-slate-600">Period</p>
                                    <p className="font-medium">{selectedMonth.start_date} to {selectedMonth.end_date}</p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded">
                                    <p className="text-xs text-slate-600">Status</p>
                                    <p className="font-medium">{selectedMonth.status}</p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded">
                                    <p className="text-xs text-slate-600">Attendance Records</p>
                                    <p className="font-medium">{attendanceSummaries.length}</p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded">
                                    <p className="text-xs text-slate-600">Payroll Records</p>
                                    <p className="font-medium">{payrollSnapshots.length}</p>
                                </div>
                            </div>

                            {payrollSnapshots.length > 0 && (
                                <div className="mt-6">
                                    <h3 className="font-semibold mb-3">Payroll Preview (NOT FOR PAYMENT)</h3>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Name</TableHead>
                                                    <TableHead>Department</TableHead>
                                                    <TableHead className="text-right">Total Salary</TableHead>
                                                    <TableHead className="text-right">Deductions</TableHead>
                                                    <TableHead className="text-right">Final Total</TableHead>
                                                    <TableHead className="text-right">WPS Pay</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {payrollSnapshots.slice(0, 50).map((ps) => (
                                                    <TableRow key={ps.id}>
                                                        <TableCell>{ps.name}</TableCell>
                                                        <TableCell>{ps.department}</TableCell>
                                                        <TableCell className="text-right">{ps.total_salary?.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right text-red-600">
                                                            -{(ps.netDeduction + ps.deductibleHoursPay).toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">{ps.total?.toFixed(2)}</TableCell>
                                                        <TableCell className="text-right text-green-600">{ps.wpsPay?.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    {payrollSnapshots.length > 50 && (
                                        <p className="text-sm text-slate-500 mt-3 text-center">
                                            Showing first 50 of {payrollSnapshots.length} employees
                                        </p>
                                    )}
                                </div>
                            )}

                            {attendanceSummaries.length > 0 && payrollSnapshots.length === 0 && (
                                <div className="mt-6">
                                    <h3 className="font-semibold mb-3">Attendance Summary</h3>
                                    <p className="text-sm text-slate-600 mb-3">
                                        {attendanceSummaries.length} employees processed. Run payroll calculation to preview salaries.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}