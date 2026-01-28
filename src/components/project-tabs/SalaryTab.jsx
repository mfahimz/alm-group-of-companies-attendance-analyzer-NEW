import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DollarSign, FileSpreadsheet, Download, Trash2, Eye, Plus, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import PINLock from '../ui/PINLock';
import { Label } from '@/components/ui/label';

export default function SalaryTab({ project, finalReport }) {
    const queryClient = useQueryClient();
    
    // ============================================
    // STATE DECLARATIONS
    // ============================================
    const [salaryUnlocked, setSalaryUnlocked] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showGenerateDialog, setShowGenerateDialog] = useState(false);
    const [newReportName, setNewReportName] = useState('');
    const [newReportDateFrom, setNewReportDateFrom] = useState('');
    const [newReportDateTo, setNewReportDateTo] = useState('');

    // ============================================
    // QUERIES
    // ============================================
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Fetch saved salary reports
    const { data: savedSalaryReports = [], isLoading: loadingSavedReports, refetch: refetchSavedReports } = useQuery({
        queryKey: ['salaryReports', project?.id],
        queryFn: () => base44.entities.SalaryReport.filter({ project_id: project.id }, '-created_date'),
        enabled: !!project?.id,
        staleTime: 5 * 60 * 1000
    });

    // Fetch salary snapshots for generating reports
    const { data: salarySnapshots = [] } = useQuery({
        queryKey: ['salarySnapshots', project?.id, finalReport?.id],
        queryFn: async () => {
            const snapshots = await base44.entities.SalarySnapshot.filter({
                project_id: project.id,
                report_run_id: finalReport.id
            });
            return snapshots;
        },
        enabled: !!project?.id && !!finalReport?.id && finalReport?.is_final === true,
        staleTime: 0
    });

    // Fetch exceptions for date range filtering
    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project?.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id }),
        enabled: !!project?.id,
        staleTime: 5 * 60 * 1000
    });

    // ============================================
    // DERIVED VALUES
    // ============================================
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';
    const hasFinalReport = finalReport && finalReport.is_final === true;

    // ============================================
    // HANDLERS
    // ============================================

    // Initialize date range when opening dialog
    const handleOpenGenerateDialog = () => {
        if (finalReport) {
            setNewReportDateFrom(finalReport.date_from);
            setNewReportDateTo(finalReport.date_to);
            setNewReportName(`Salary Report ${finalReport.date_from} to ${finalReport.date_to}`);
        }
        setShowGenerateDialog(true);
    };

    // Generate new salary report
    const handleGenerateReport = async () => {
        if (!newReportName.trim()) {
            toast.error('Please enter a report name');
            return;
        }
        if (!newReportDateFrom || !newReportDateTo) {
            toast.error('Please select date range');
            return;
        }
        if (salarySnapshots.length === 0) {
            toast.error('No salary snapshots available. Please finalize the report first.');
            return;
        }

        setIsGenerating(true);
        try {
            const divisor = project.salary_calculation_days || 30;
            const dateFrom = new Date(newReportDateFrom);
            const dateTo = new Date(newReportDateTo);

            // Calculate salary data for the selected date range
            const calculatedData = salarySnapshots.map(snapshot => {
                const updated = { ...snapshot };

                // If custom date range (not full period), recalculate attendance metrics
                if (newReportDateFrom !== finalReport.date_from || newReportDateTo !== finalReport.date_to) {
                    // Get exceptions for this employee in the date range
                    const empExceptions = exceptions.filter(e => 
                        (String(e.attendance_id) === String(snapshot.attendance_id) || e.attendance_id === 'ALL') &&
                        e.use_in_analysis !== false
                    );

                    let presentDays = 0;
                    let lopDays = 0;
                    let annualLeaveDays = 0;
                    let sickLeaveDays = 0;
                    let workingDays = 0;
                    let salaryLeaveDays = 0;

                    // Iterate through each day in the range
                    const currentDate = new Date(dateFrom);
                    while (currentDate <= dateTo) {
                        const dateStr = currentDate.toISOString().split('T')[0];
                        const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

                        // Check if it's a weekly off
                        const isWeeklyOff = dayOfWeek === snapshot.weekly_off;

                        // Check for public holiday
                        const publicHoliday = empExceptions.find(e =>
                            e.type === 'PUBLIC_HOLIDAY' &&
                            e.attendance_id === 'ALL' &&
                            dateStr >= e.date_from && dateStr <= e.date_to
                        );

                        if (!isWeeklyOff && !publicHoliday) {
                            workingDays++;

                            // Check for leave exceptions
                            const annualLeave = empExceptions.find(e =>
                                e.type === 'ANNUAL_LEAVE' &&
                                dateStr >= e.date_from && dateStr <= e.date_to
                            );
                            const sickLeave = empExceptions.find(e =>
                                e.type === 'SICK_LEAVE' &&
                                dateStr >= e.date_from && dateStr <= e.date_to
                            );
                            const manualAbsent = empExceptions.find(e =>
                                e.type === 'MANUAL_ABSENT' &&
                                dateStr >= e.date_from && dateStr <= e.date_to
                            );
                            const manualPresent = empExceptions.find(e =>
                                e.type === 'MANUAL_PRESENT' &&
                                dateStr >= e.date_from && dateStr <= e.date_to
                            );

                            if (annualLeave) {
                                annualLeaveDays++;
                                if (annualLeave.salary_leave_days) {
                                    salaryLeaveDays += annualLeave.salary_leave_days / 
                                        (Math.ceil((new Date(annualLeave.date_to) - new Date(annualLeave.date_from)) / (1000 * 60 * 60 * 24)) + 1);
                                }
                            } else if (sickLeave) {
                                sickLeaveDays++;
                            } else if (manualAbsent) {
                                lopDays++;
                            } else if (manualPresent) {
                                presentDays++;
                            } else {
                                // Check original snapshot for this day's status
                                // For simplicity, proportionally distribute from original
                                const originalWorkingDays = snapshot.working_days || 1;
                                const dayRatio = 1 / originalWorkingDays;
                                presentDays += (snapshot.present_days || 0) * dayRatio;
                            }
                        }

                        currentDate.setDate(currentDate.getDate() + 1);
                    }

                    // Use proportional calculation for custom ranges
                    const originalWorkingDays = snapshot.working_days || 1;
                    const rangeRatio = workingDays / originalWorkingDays;

                    updated.working_days = workingDays;
                    updated.present_days = Math.round(presentDays * 100) / 100;
                    updated.full_absence_count = lopDays || Math.round((snapshot.full_absence_count || 0) * rangeRatio * 100) / 100;
                    updated.annual_leave_count = annualLeaveDays || Math.round((snapshot.annual_leave_count || 0) * rangeRatio * 100) / 100;
                    updated.sick_leave_count = sickLeaveDays || Math.round((snapshot.sick_leave_count || 0) * rangeRatio * 100) / 100;
                    updated.salary_leave_days = salaryLeaveDays;

                    // Recalculate leave pay
                    const totalSalary = snapshot.total_salary;
                    const leaveDays = updated.annual_leave_count + updated.full_absence_count;
                    updated.leaveDays = leaveDays;
                    updated.leavePay = Math.round((totalSalary / divisor) * leaveDays * 100) / 100;

                    // Recalculate salary leave amount
                    const workingHours = snapshot.working_hours;
                    if (updated.annual_leave_count > 0) {
                        if (workingHours === 8) {
                            updated.salaryLeaveAmount = Math.round((totalSalary / divisor) * updated.annual_leave_count * 100) / 100;
                        } else if (workingHours === 9) {
                            const adjustedSalary = totalSalary * 0.8767;
                            updated.salaryLeaveAmount = Math.round((adjustedSalary / divisor) * updated.annual_leave_count * 100) / 100;
                        }
                    } else {
                        updated.salaryLeaveAmount = 0;
                    }

                    updated.netDeduction = Math.max(0, updated.leavePay - updated.salaryLeaveAmount);

                    // Proportionally scale deductible minutes
                    updated.deductible_minutes = Math.round((snapshot.deductible_minutes || 0) * rangeRatio);
                    updated.deductibleHours = updated.deductible_minutes / 60;
                    const hourlyRate = totalSalary / divisor / workingHours;
                    updated.deductibleHoursPay = Math.round(updated.deductibleHours * hourlyRate * 100) / 100;
                }

                // Recalculate total
                const totalSalary = updated.total_salary;
                const normalOtSalary = updated.normalOtSalary || 0;
                const specialOtSalary = updated.specialOtSalary || 0;
                const totalOtSalary = normalOtSalary + specialOtSalary;
                const bonus = updated.bonus || 0;
                const incentive = updated.incentive || 0;
                const otherDeduction = updated.otherDeduction || 0;
                const advanceSalaryDeduction = updated.advanceSalaryDeduction || 0;
                const netDeduction = updated.netDeduction || 0;
                const deductibleHoursPay = updated.deductibleHoursPay || 0;

                const finalTotal = totalSalary + totalOtSalary + bonus + incentive
                                    - netDeduction - deductibleHoursPay - otherDeduction - advanceSalaryDeduction;

                updated.total = Math.round(finalTotal * 100) / 100;
                updated.wpsPay = Math.round(finalTotal * 100) / 100;
                updated.balance = 0;

                return updated;
            });

            // Calculate totals
            let totalSalaryAmount = 0;
            let totalDeductions = 0;
            let totalOtSalary = 0;

            calculatedData.forEach(row => {
                totalSalaryAmount += row.total || 0;
                totalDeductions += (row.netDeduction || 0) + (row.deductibleHoursPay || 0) + (row.otherDeduction || 0) + (row.advanceSalaryDeduction || 0);
                totalOtSalary += (row.normalOtSalary || 0) + (row.specialOtSalary || 0);
            });

            // Save the report
            await base44.entities.SalaryReport.create({
                project_id: project.id,
                report_run_id: finalReport.id,
                report_name: newReportName.trim(),
                date_from: newReportDateFrom,
                date_to: newReportDateTo,
                company: project.company,
                employee_count: calculatedData.length,
                total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
                total_deductions: Math.round(totalDeductions * 100) / 100,
                total_ot_salary: Math.round(totalOtSalary * 100) / 100,
                snapshot_data: JSON.stringify(calculatedData),
                generated_by: currentUser?.email,
                notes: null
            });

            toast.success(`Salary report "${newReportName}" generated successfully`);
            setShowGenerateDialog(false);
            setNewReportName('');
            refetchSavedReports();
        } catch (error) {
            toast.error('Failed to generate report: ' + error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    // Export salary report to Excel
    const handleExportToExcel = (report) => {
        try {
            const data = JSON.parse(report.snapshot_data);
            const exportData = data.map(row => ({
                'Attendance ID': row.attendance_id,
                'Name': row.name,
                'Department': row.department || '-',
                'Working Hours/Day': row.working_hours,
                'Basic Salary': row.basic_salary,
                'Total Salary': row.total_salary,
                'Working Days': row.working_days,
                'Present Days': row.present_days,
                'LOP Days': row.full_absence_count,
                'Annual Leave Days': row.annual_leave_count,
                'Sick Leave Days': row.sick_leave_count,
                'Leave Days': row.leaveDays,
                'Leave Pay': row.leavePay,
                'Salary Leave Days': row.salary_leave_days || row.salaryLeaveDays || 0,
                'Salary Leave Amount': row.salaryLeaveAmount,
                'Normal OT Hours': row.normalOtHours || 0,
                'Normal OT Salary': row.normalOtSalary || 0,
                'Special OT Hours': row.specialOtHours || 0,
                'Special OT Salary': row.specialOtSalary || 0,
                'Total OT Salary': (row.normalOtSalary || 0) + (row.specialOtSalary || 0),
                'Deductible Hours': row.deductibleHours || 0,
                'Deductible Hours Pay': row.deductibleHoursPay || 0,
                'Other Deduction': row.otherDeduction || 0,
                'Bonus': row.bonus || 0,
                'Incentive': row.incentive || 0,
                'Advance Salary Deduction': row.advanceSalaryDeduction || 0,
                'Total': row.total,
                'WPS Pay': row.wpsPay,
                'Balance': row.balance || 0
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');
            XLSX.writeFile(wb, `${report.report_name}_${report.date_from}_to_${report.date_to}.xlsx`);
            toast.success('Excel file downloaded');
        } catch (error) {
            toast.error('Failed to export report');
        }
    };

    // Delete saved salary report
    const handleDeleteSalaryReport = async (reportId, reportName) => {
        if (!confirm(`Are you sure you want to delete "${reportName}"?`)) return;
        
        try {
            await base44.entities.SalaryReport.delete(reportId);
            toast.success(`Report "${reportName}" deleted`);
            refetchSavedReports();
        } catch (error) {
            toast.error('Failed to delete report: ' + error.message);
        }
    };

    // ============================================
    // RENDER
    // ============================================

    if (!isAdminOrCEO) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">Access restricted to Admin and CEO only</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <PINLock onUnlock={(unlocked) => setSalaryUnlocked(unlocked)} storageKey="salary_tab_pin" />
            
            {!salaryUnlocked && (
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <p className="text-slate-600">Please unlock the salary section to view salary reports.</p>
                    </CardContent>
                </Card>
            )}

            {salaryUnlocked && (
                <Card className="border-0 shadow-lg">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <DollarSign className="w-6 h-6 text-indigo-600" />
                            Salary Reports - {project.company}
                        </CardTitle>
                        <Button 
                            onClick={handleOpenGenerateDialog}
                            disabled={!hasFinalReport || salarySnapshots.length === 0}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Generate New Report
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {/* Info Banner */}
                        {!hasFinalReport ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                                <p className="text-amber-800">
                                    <strong>No finalized report found.</strong> Please finalize a report in the Report Tab first to generate salary reports.
                                </p>
                                <Button 
                                    className="mt-3 bg-amber-600 hover:bg-amber-700" 
                                    onClick={() => window.location.hash = '#?tab=report'}
                                >
                                    Go to Report Tab
                                </Button>
                            </div>
                        ) : (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6 text-sm text-green-800">
                                <strong>✓ Finalized Report:</strong> {finalReport.report_name || 'Report'} ({finalReport.date_from} to {finalReport.date_to})
                                {finalReport.finalized_by && <span className="ml-2 text-xs">— Finalized by {finalReport.finalized_by}</span>}
                            </div>
                        )}

                        {/* Reports Table */}
                        {loadingSavedReports ? (
                            <div className="text-center py-12 text-slate-500">
                                Loading salary reports...
                            </div>
                        ) : savedSalaryReports.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <p>No salary reports generated yet.</p>
                                {hasFinalReport && (
                                    <p className="mt-2 text-sm">Click "Generate New Report" to create your first salary report.</p>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Report Name</TableHead>
                                            <TableHead>Generated On</TableHead>
                                            <TableHead>Period</TableHead>
                                            <TableHead>Employees</TableHead>
                                            <TableHead>Total Salary</TableHead>
                                            <TableHead>Total OT</TableHead>
                                            <TableHead>Total Deductions</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {savedSalaryReports.map(report => (
                                            <TableRow key={report.id} className="hover:bg-slate-50">
                                                <TableCell className="font-medium">{report.report_name}</TableCell>
                                                <TableCell className="text-slate-600">
                                                    {new Date(report.created_date).toLocaleString('en-US', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: true,
                                                        timeZone: 'Asia/Dubai'
                                                    })}
                                                </TableCell>
                                                <TableCell>{report.date_from} - {report.date_to}</TableCell>
                                                <TableCell>{report.employee_count}</TableCell>
                                                <TableCell className="font-semibold text-green-700">
                                                    {report.total_salary_amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-blue-600">
                                                    {report.total_ot_salary?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-red-600">
                                                    {report.total_deductions?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Link to={createPageUrl('SalaryReportDetail') + `?reportId=${report.id}`}>
                                                            <Button size="sm" variant="ghost" title="View Report">
                                                                <Eye className="w-4 h-4 text-indigo-600" />
                                                            </Button>
                                                        </Link>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleExportToExcel(report)}
                                                            title="Export to Excel"
                                                        >
                                                            <Download className="w-4 h-4 text-green-600" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => handleDeleteSalaryReport(report.id, report.report_name)}
                                                            title="Delete Report"
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-600" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Generate Report Dialog */}
            <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-indigo-600" />
                            Generate Salary Report
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label className="text-sm font-medium text-slate-700 mb-2 block">Report Name *</Label>
                            <Input
                                placeholder="e.g., January 2026 Salary Report"
                                value={newReportName}
                                onChange={(e) => setNewReportName(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-sm font-medium text-slate-700 mb-2 block">From Date</Label>
                                <Input
                                    type="date"
                                    value={newReportDateFrom}
                                    onChange={(e) => setNewReportDateFrom(e.target.value)}
                                    min={finalReport?.date_from}
                                    max={newReportDateTo || finalReport?.date_to}
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700 mb-2 block">To Date</Label>
                                <Input
                                    type="date"
                                    value={newReportDateTo}
                                    onChange={(e) => setNewReportDateTo(e.target.value)}
                                    min={newReportDateFrom || finalReport?.date_from}
                                    max={finalReport?.date_to}
                                />
                            </div>
                        </div>
                        <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                            <p><strong>Finalized Report Period:</strong> {finalReport?.date_from} to {finalReport?.date_to}</p>
                            <p><strong>Employees:</strong> {salarySnapshots.length}</p>
                            <p><strong>Company:</strong> {project?.company}</p>
                        </div>
                        {(newReportDateFrom !== finalReport?.date_from || newReportDateTo !== finalReport?.date_to) && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                                <strong>Custom Date Range:</strong> Attendance metrics will be recalculated for the selected period.
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleGenerateReport}
                            disabled={isGenerating || !newReportName.trim() || !newReportDateFrom || !newReportDateTo}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {isGenerating ? 'Generating...' : 'Generate Report'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}