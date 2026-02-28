import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
    const [generationProgress, setGenerationProgress] = useState('');
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
    // staleTime: 0 to ensure we always see the latest is_final status after marking final
    const { data: reportRuns = [], isLoading: loadingReports } = useQuery({
        queryKey: ['reportRuns', project?.id],
        queryFn: () => base44.entities.ReportRun.filter({ project_id: project.id }, null, 5000),
        enabled: !!project?.id,
        staleTime: 0,
        gcTime: 5 * 60 * 1000
    });

    // Find the finalized report from the list
    const finalReport = useMemo(() => {
        return reportRuns.find(r => r.is_final === true) || null;
    }, [reportRuns]);

    // Fetch saved salary reports
    const { data: savedSalaryReports = [], isLoading: loadingSavedReports, refetch: refetchSavedReports } = useQuery({
        queryKey: ['salaryReports', project?.id],
        queryFn: () => base44.entities.SalaryReport.filter({ project_id: project.id }, '-created_date', 5000),
        enabled: !!project?.id,
        staleTime: 5 * 60 * 1000
    });

    // Fetch salary snapshots for generating reports
    // CRITICAL: Do NOT wait for loadingReports - snapshots can load in parallel while reports load
    // This prevents UI deadlock when there are many historical reports
    // CRITICAL FIX: .filter() defaults to 50 records - must specify limit
    const { data: salarySnapshots = [], isLoading: loadingSnapshots } = useQuery({
        queryKey: ['salarySnapshots', project?.id, finalReport?.id],
        queryFn: async () => {
            const snapshots = await base44.entities.SalarySnapshot.filter({
                project_id: project.id,
                report_run_id: finalReport.id
            }, null, 5000);
            console.log(`[SalaryTab] 📊 FETCHED ${snapshots.length} salary snapshots for report ${finalReport.id}`);
            return snapshots;
        },
        enabled: !!project?.id && !!finalReport?.id && finalReport?.is_final === true,
        staleTime: 0,
        gcTime: 5 * 60 * 1000
    });

    // Fetch exceptions for date range filtering
    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project?.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id }, null, 5000),
        enabled: !!project?.id,
        staleTime: 5 * 60 * 1000
    });

    // Fetch overtime data from OvertimeData entity
    const { data: overtimeData = [] } = useQuery({
        queryKey: ['overtimeData', project?.id],
        queryFn: () => base44.entities.OvertimeData.filter({ project_id: project.id }, null, 5000),
        enabled: !!project?.id,
        staleTime: 0
    });

    // Fetch employee salaries for OT calculation
    const { data: employeeSalaries = [] } = useQuery({
        queryKey: ['employeeSalaries', project?.company],
        queryFn: () => base44.entities.EmployeeSalary.filter({ company: project.company, active: true }, null, 5000),
        enabled: !!project?.company,
        staleTime: 5 * 60 * 1000
    });

    // ============================================
    // DERIVED VALUES
    // ============================================
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo' || userRole === 'hr_manager';
    // Allow access to Salary tab for Al Maraghi Motors projects for all users with project access
    const isAlMaraghi = project?.company === 'Al Maraghi Motors';
    const canAccessSalaryTab = isAdminOrCEO || isAlMaraghi;
    const calculateWpsSplit = (totalAmount, isCapEnabled, capAmount) => {
        if (totalAmount <= 0) {
            return { wpsAmount: 0, balanceAmount: 0, wpsCapApplied: false };
        }

        if (!(isAlMaraghi && isCapEnabled)) {
            return { wpsAmount: totalAmount, balanceAmount: 0, wpsCapApplied: false };
        }

        const cap = capAmount != null ? capAmount : 4900;
        const rawExcess = Math.max(0, totalAmount - cap);
        const balanceAmount = rawExcess > 0 ? Math.ceil(rawExcess / 100) * 100 : 0;
        const wpsAmount = totalAmount - balanceAmount;

        return { wpsAmount, balanceAmount, wpsCapApplied: rawExcess > 0 };
    };

    const hasFinalReport = finalReport && finalReport.is_final === true;

    // ============================================
    // HANDLERS
    // ============================================

    // Initialize date range when opening dialog
    // Al Maraghi Motors rule: Salary month = 1st to last day of month containing project.date_to
    // The last 2 days of the month are "assumed present" for salary calculation
    const handleOpenGenerateDialog = async () => {
        if (!finalReport) {
            toast.error('No finalized report found');
            return;
        }

        if (loadingSnapshots) {
            toast.error('Salary snapshots are still loading. Please wait...');
            return;
        }

        if (salarySnapshots.length === 0) {
            toast.error('No salary snapshots found for finalized report. Please try refreshing the page.');
            return;
        }

        if (project) {
            // Calculate salary month based on project.date_to (the attendance period end)
            // CRITICAL: Parse date as local date parts to avoid timezone issues
            const [year, month, day] = project.date_to.split('-').map(Number);
            const salaryMonthStart = new Date(year, month - 1, 1); // month is 0-indexed
            const salaryMonthEnd = new Date(year, month, 0); // Last day of month (month is 0-indexed, so month gives last day of month-1)
            
            const formatDate = (d) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${dd}`;
            };
            
            // Default From: 1st of salary month
            const defaultFrom = formatDate(salaryMonthStart);
            // Default To: Last day of salary month (includes assumed present days for Al Maraghi)
            const defaultTo = formatDate(salaryMonthEnd);
            
            setNewReportDateFrom(defaultFrom);
            setNewReportDateTo(defaultTo);
            setNewReportName(`Salary Report ${defaultFrom} to ${defaultTo}`);
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
        // CRITICAL FIX: Validate date range - start date cannot be after end date
        if (new Date(newReportDateFrom) > new Date(newReportDateTo)) {
            toast.error('Start date cannot be after end date');
            return;
        }
        if (!finalReport || !finalReport.is_final) {
            toast.error('No finalized report found. Please finalize a report in the Report tab first.');
            return;
        }
        if (loadingSnapshots) {
            toast.error('Salary snapshots are still loading. Please wait a moment and try again.');
            return;
        }
        if (salarySnapshots.length === 0) {
            toast.error(`No salary snapshots found for report "${finalReport.report_name}". This may indicate a data integrity issue. Please try refreshing the page or contact support.`);
            return;
        }

        setIsGenerating(true);
        setGenerationProgress('Initializing calculation...');
        
        try {
            // DIVISOR_LEAVE_DEDUCTION: Used for Leave Pay, Salary Leave Amount, Deductible Hours Pay
            const divisor = project.salary_calculation_days || 30;
            // DIVISOR_OT: Used for OT Hourly Rate
            const otDivisor = project.ot_calculation_days || divisor;

            setGenerationProgress(`Loading salary snapshots for ${salarySnapshots.length} employees...`);
            await new Promise(resolve => setTimeout(resolve, 300));

            // CRITICAL: Use finalized SalarySnapshot values directly
            // Snapshots already contain ALL calculated values including OT and adjustments
            const finalCalculatedData = salarySnapshots.map(row => {
                return {
                    ...row,
                    total: row.total || 0,
                    wpsPay: row.wpsPay || 0,
                    balance: row.balance || 0
                };
            });

            setGenerationProgress('Calculating report totals...');
            await new Promise(resolve => setTimeout(resolve, 200)); // Visual feedback
            
            // Calculate totals
            let totalSalaryAmount = 0;
            let totalDeductions = 0;
            let totalOtSalary = 0;

            finalCalculatedData.forEach(row => {
                totalSalaryAmount += row.total || 0;
                totalDeductions += (row.netDeduction || 0) + (row.deductibleHoursPay || 0) + (row.otherDeduction || 0) + (row.advanceSalaryDeduction || 0);
                totalOtSalary += (row.normalOtSalary || 0) + (row.specialOtSalary || 0);
            });

            setGenerationProgress('Saving report to database...');
            await new Promise(resolve => setTimeout(resolve, 200)); // Visual feedback
            
            // Save the report with both divisors
            // otDivisor already defined above
            await base44.entities.SalaryReport.create({
                project_id: project.id,
                report_run_id: finalReport.id,
                report_name: newReportName.trim(),
                date_from: newReportDateFrom,
                date_to: newReportDateTo,
                company: project.company,
                salary_divisor: divisor,      // DIVISOR_LEAVE_DEDUCTION
                ot_divisor: otDivisor,        // DIVISOR_OT [MERGE_NOTE: Remove if merging]
                employee_count: finalCalculatedData.length,
                total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
                total_deductions: Math.round(totalDeductions * 100) / 100,
                total_ot_salary: Math.round(totalOtSalary * 100) / 100,
                snapshot_data: JSON.stringify(finalCalculatedData),
                generated_by: currentUser?.email,
                notes: null
            });

            setGenerationProgress('Finalizing report...');
            await new Promise(resolve => setTimeout(resolve, 200)); // Visual feedback
            
            toast.success(`Salary report "${newReportName}" generated successfully`);
            setShowGenerateDialog(false);
            setNewReportName('');
            setGenerationProgress('');
            refetchSavedReports();
        } catch (error) {
            toast.error('Failed to generate report: ' + error.message);
            setGenerationProgress('');
        } finally {
            setIsGenerating(false);
        }
    };

    // Export salary report to Excel
    const handleExportToExcel = (report) => {
        try {
            const data = JSON.parse(report.snapshot_data);
            const exportData = data.map(row => ({
                'Attendance ID': row.attendance_id || 'SALARY-ONLY',
                'Name': row.name,
                'Department': row.department || '-',
                'Attendance Source': row.attendance_source || 'ANALYZED',
                'Working Hours/Day': row.working_hours,
                'Basic Salary': row.basic_salary,
                'Total Salary': row.total_salary,
                'Working Days': row.working_days,
                'Present Days': row.present_days,
                'LOP Days': row.full_absence_count,
                'Annual Leave Days': row.salary_leave_days || row.salaryLeaveDays || row.annual_leave_count,
                'Sick Leave Days': row.sick_leave_count,
                'Leave Days': (row.salary_leave_days || row.salaryLeaveDays || row.annual_leave_count || 0) + (row.full_absence_count || 0),
                'Leave Pay': row.leavePay,
                'Salary Leave Days': row.salary_leave_days || row.salaryLeaveDays || 0,
                'Salary Leave Amount': row.salaryLeaveAmount,
                'Net Deduction': row.netDeduction || 0,
                'Deductible Hours': row.deductibleHours || 0,
                'Deductible Hours Pay': row.deductibleHoursPay || 0,
                'Extra Deductible Hrs (Prev Month)': Math.round(((row.extra_prev_month_deductible_minutes || 0) / 60) * 100) / 100,
                'Extra LOP Days (Prev Month)': row.extra_prev_month_lop_days || 0,
                'Extra LOP Pay (Prev Month)': row.extra_prev_month_lop_pay || 0,
                'Extra Deductible Pay (Prev Month)': row.extra_prev_month_deductible_hours_pay || 0,
                'Normal OT Hours': row.normalOtHours || 0,
                'Normal OT Salary': row.normalOtSalary || 0,
                'Special OT Hours': row.specialOtHours || 0,
                'Special OT Salary': row.specialOtSalary || 0,
                'Total OT Salary': (row.normalOtSalary || 0) + (row.specialOtSalary || 0),
                'Other Deduction': row.otherDeduction || 0,
                'Bonus': row.bonus || 0,
                'Incentive': row.incentive || 0,
                'Advance Salary Deduction': row.advanceSalaryDeduction || 0,
                'Total': row.total,
                'WPS Pay': row.wpsPay,
                'Balance': row.balance || 0,
                'WPS Cap Applied': row.wps_cap_applied ? 'Yes' : 'No',
                'WPS Cap Amount': row.wps_cap_enabled ? (row.wps_cap_amount || 4900) : ''
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
                            disabled={!hasFinalReport || loadingSnapshots}
                            className="bg-indigo-600 hover:bg-indigo-700"
                            title={loadingSnapshots ? 'Loading salary snapshots...' : !hasFinalReport ? 'No finalized report available' : ''}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            {loadingSnapshots ? 'Loading...' : 'Generate New Report'}
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
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700 mb-2 block">To Date</Label>
                                <Input
                                    type="date"
                                    value={newReportDateTo}
                                    onChange={(e) => setNewReportDateTo(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                            <p><strong>Attendance Report Period:</strong> {finalReport?.date_from} to {finalReport?.date_to}</p>
                            <p><strong>Salary Month:</strong> {newReportDateFrom} to {newReportDateTo}</p>
                            <p><strong>Employees:</strong> {salarySnapshots.length}</p>
                            <p><strong>Company:</strong> {project?.company}</p>
                            <p><strong>Salary Calculation Divisor:</strong> {project?.salary_calculation_days || 30} days</p>
                            {isAlMaraghi && (
                                <p className="text-amber-700 mt-1"><strong>Note:</strong> Last 2 days of month are "assumed present" for salary (no deductions).</p>
                            )}
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                            <strong>Important:</strong> Salary report uses finalized attendance values from the attendance report period ({finalReport?.date_from} to {finalReport?.date_to}). The salary report date range is for display and organizational purposes only.
                        </div>
                    </div>
                    {isGenerating && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                                <span className="text-sm font-medium text-indigo-900">{generationProgress}</span>
                            </div>
                            <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                                <div className="bg-indigo-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                            </div>
                            <p className="text-xs text-indigo-700">
                                Please wait while we process {salarySnapshots.length} employees...
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowGenerateDialog(false)} disabled={isGenerating}>
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