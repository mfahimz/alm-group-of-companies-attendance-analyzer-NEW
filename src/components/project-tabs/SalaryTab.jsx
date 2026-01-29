import React, { useState, useMemo } from 'react';
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

export default function SalaryTab({ project }) {
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
    const { data: currentUser, isLoading: loadingUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Fetch all report runs to find the finalized one (there should only be one with is_final=true)
    const { data: reportRuns = [], isLoading: loadingReports } = useQuery({
        queryKey: ['reportRuns', project?.id],
        queryFn: () => base44.entities.ReportRun.filter({ project_id: project.id }),
        enabled: !!project?.id,
        staleTime: 5 * 60 * 1000
    });

    // Find the finalized report from the list
    const finalReport = useMemo(() => {
        return reportRuns.find(r => r.is_final === true) || null;
    }, [reportRuns]);

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

    // Fetch overtime data from OvertimeData entity
    const { data: overtimeData = [] } = useQuery({
        queryKey: ['overtimeData', project?.id],
        queryFn: () => base44.entities.OvertimeData.filter({ project_id: project.id }),
        enabled: !!project?.id,
        staleTime: 0
    });

    // Fetch employee salaries for OT calculation
    const { data: employeeSalaries = [] } = useQuery({
        queryKey: ['employeeSalaries', project?.company],
        queryFn: () => base44.entities.EmployeeSalary.filter({ company: project.company, active: true }),
        enabled: !!project?.company,
        staleTime: 5 * 60 * 1000
    });

    // ============================================
    // DERIVED VALUES
    // ============================================
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';
    // Allow access to Salary tab for Al Maraghi Auto Repairs projects for all users with project access
    const isAlMaraghi = project?.company === 'Al Maraghi Auto Repairs';
    const canAccessSalaryTab = isAdminOrCEO || isAlMaraghi;
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

    // Generate new salary report with custom date range recalculation
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
            // DIVISOR_LEAVE_DEDUCTION: Used for Leave Pay, Salary Leave Amount, Deductible Hours Pay
            // [MERGE_NOTE: If merging divisors, this becomes the single divisor for all calculations]
            const divisor = project.salary_calculation_days || 30;
            const isCustomDateRange = newReportDateFrom !== finalReport.date_from || newReportDateTo !== finalReport.date_to;

            let calculatedData;

            if (isCustomDateRange) {
                // RECALCULATE for custom date range by calling backend function
                toast.info('Recalculating attendance for custom date range...');
                
                const response = await base44.functions.invoke('createSalarySnapshotsForDateRange', {
                    project_id: project.id,
                    report_run_id: finalReport.id,
                    date_from: newReportDateFrom,
                    date_to: newReportDateTo
                });

                if (response.data?.error) {
                    throw new Error(response.data.error);
                }

                calculatedData = response.data?.snapshots || [];
            } else {
                // Use existing snapshot data for full date range
                calculatedData = salarySnapshots.map(snapshot => ({ ...snapshot }));
            }

            // Merge OT data from OvertimeData entity into calculated data
            // ALSO merge adjustment fields from SalarySnapshot
            // DIVISOR_OT: Use ot_calculation_days for OT salary calculations
            // [MERGE_NOTE: If merging divisors, change otDivisor to use divisor (salary_calculation_days) instead]
            const otDivisor = project.ot_calculation_days || 30;
            
            calculatedData = calculatedData.map(row => {
                const otRecord = overtimeData.find(ot => 
                    String(ot.attendance_id) === String(row.attendance_id)
                );
                
                // Get the latest SalarySnapshot for adjustment values
                const snapshotRecord = salarySnapshots.find(s => 
                    String(s.attendance_id) === String(row.attendance_id)
                );
                
                const salary = employeeSalaries.find(s => 
                    String(s.attendance_id) === String(row.attendance_id) ||
                    String(s.employee_id) === String(row.hrms_id)
                );
                const totalSalary = row.total_salary || salary?.total_salary || 0;
                const workingHours = row.working_hours || salary?.working_hours || 9;
                
                // DIVISOR_OT: OT hourly rate uses otDivisor
                // [MERGE_NOTE: If merging, use 'divisor' instead of 'otDivisor']
                const otHourlyRate = totalSalary / otDivisor / workingHours;

                // OT hours from OvertimeData (pre-finalization entry)
                const normalOtHours = otRecord?.normalOtHours || 0;
                const specialOtHours = otRecord?.specialOtHours || 0;
                const normalOtSalary = Math.round(otHourlyRate * 1.25 * normalOtHours * 100) / 100;
                const specialOtSalary = Math.round(otHourlyRate * 1.5 * specialOtHours * 100) / 100;
                const totalOtSalary = normalOtSalary + specialOtSalary;

                // Get adjustment values from SalarySnapshot (post-finalization edits)
                const netDeduction = row.netDeduction || 0;
                const deductibleHoursPay = row.deductibleHoursPay || 0;
                const bonus = snapshotRecord?.bonus ?? row.bonus ?? 0;
                const incentive = snapshotRecord?.incentive ?? row.incentive ?? 0;
                const otherDeduction = snapshotRecord?.otherDeduction ?? row.otherDeduction ?? 0;
                const advanceSalaryDeduction = snapshotRecord?.advanceSalaryDeduction ?? row.advanceSalaryDeduction ?? 0;

                const finalTotal = totalSalary + totalOtSalary + bonus + incentive
                    - netDeduction - deductibleHoursPay - otherDeduction - advanceSalaryDeduction;

                // WPS SPLIT LOGIC (Al Maraghi Auto Repairs only)
                // Balance must always be a multiple of 100 (round down)
                let wpsAmount = finalTotal;
                let balanceAmount = 0;
                let wpsCapApplied = false;
                const wpsCapEnabled = salary?.wps_cap_enabled || false;
                const wpsCapAmount = salary?.wps_cap_amount ?? 4900;

                if (isAlMaraghi && wpsCapEnabled) {
                    if (finalTotal <= 0) {
                        wpsAmount = 0;
                        balanceAmount = 0;
                        wpsCapApplied = false;
                    } else {
                        const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                        // Calculate raw excess over cap
                        const rawExcess = Math.max(0, finalTotal - cap);
                        // Round balance DOWN to nearest 100
                        balanceAmount = Math.floor(rawExcess / 100) * 100;
                        // WPS gets the rest (total - balance)
                        wpsAmount = finalTotal - balanceAmount;
                        wpsCapApplied = rawExcess > 0;
                    }
                } else if (finalTotal <= 0) {
                    wpsAmount = 0;
                    balanceAmount = 0;
                }

                return {
                    ...row,
                    normalOtHours,
                    specialOtHours,
                    normalOtSalary,
                    specialOtSalary,
                    totalOtSalary,
                    bonus,
                    incentive,
                    otherDeduction,
                    advanceSalaryDeduction,
                    // Store divisors used for reference
                    salary_divisor: divisor,
                    ot_divisor: otDivisor,
                    total: Math.round(finalTotal * 100) / 100,
                    wpsPay: Math.round(wpsAmount * 100) / 100,
                    balance: Math.round(balanceAmount * 100) / 100,
                    wps_cap_enabled: wpsCapEnabled,
                    wps_cap_amount: wpsCapAmount,
                    wps_cap_applied: wpsCapApplied
                };
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

            // Save the report with both divisors
            // otDivisor already defined above at line 156
            await base44.entities.SalaryReport.create({
                project_id: project.id,
                report_run_id: finalReport.id,
                report_name: newReportName.trim(),
                date_from: newReportDateFrom,
                date_to: newReportDateTo,
                company: project.company,
                salary_divisor: divisor,      // DIVISOR_LEAVE_DEDUCTION
                ot_divisor: otDivisor,        // DIVISOR_OT [MERGE_NOTE: Remove if merging]
                employee_count: calculatedData.length,
                total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
                total_deductions: Math.round(totalDeductions * 100) / 100,
                total_ot_salary: Math.round(totalOtSalary * 100) / 100,
                snapshot_data: JSON.stringify(calculatedData),
                generated_by: currentUser?.email,
                notes: isCustomDateRange ? `Custom date range: ${newReportDateFrom} to ${newReportDateTo}` : null
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
                'Attendance Source': row.attendance_source || 'ANALYZED',
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
                'Balance': row.balance || 0,
                'WPS Cap Applied': row.wps_cap_applied ? 'Yes' : 'No',
                'WPS Cap Amount': row.wps_cap_enabled ? (row.wps_cap_amount || 4800) : ''
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

    // Show loading state while fetching user or reports
    if (loadingUser || loadingReports) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <p className="text-slate-500">Loading...</p>
                </CardContent>
            </Card>
        );
    }

    if (!canAccessSalaryTab) {
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
            <PINLock onUnlock={(unlocked) => {
                setSalaryUnlocked(unlocked);
                if (unlocked) {
                    sessionStorage.setItem('salary_tab_pin_unlocked', 'true');
                }
            }} storageKey="salary_tab_pin" />
            
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
                            <p><strong>Salary Calculation Divisor:</strong> {project?.salary_calculation_days || 30} days</p>
                        </div>
                        {(newReportDateFrom !== finalReport?.date_from || newReportDateTo !== finalReport?.date_to) && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                                <strong>Custom Date Range:</strong> Attendance data will be recalculated based on the selected date range. This may take a moment.
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