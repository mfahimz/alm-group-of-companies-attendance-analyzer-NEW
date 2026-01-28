import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
    DollarSign, Calendar, AlertTriangle, ArrowLeft, FileText, Download, 
    Save, CheckCircle, XCircle, Loader2, Search, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as XLSX from 'xlsx';
import PINLock from '@/components/ui/PINLock';
import SortableTableHead from '@/components/ui/SortableTableHead';

export default function SalaryReportGenerator() {
    // URL params
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('projectId');
    const reportRunId = urlParams.get('reportRunId');

    // State
    const [salaryUnlocked, setSalaryUnlocked] = useState(false);
    const [customDateFrom, setCustomDateFrom] = useState('');
    const [customDateTo, setCustomDateTo] = useState('');
    const [calculatedData, setCalculatedData] = useState(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [validationResult, setValidationResult] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortColumn, setSortColumn] = useState({ key: 'department', direction: 'asc' });
    
    // Save report state
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [reportName, setReportName] = useState('');
    const [reportNotes, setReportNotes] = useState('');
    const [isSavingReport, setIsSavingReport] = useState(false);

    // Editable fields state
    const [editableData, setEditableData] = useState({});

    // Queries
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: project, isLoading: loadingProject } = useQuery({
        queryKey: ['project', projectId],
        queryFn: async () => {
            const projects = await base44.entities.Project.filter({ id: projectId });
            return projects[0] || null;
        },
        enabled: !!projectId
    });

    const { data: reportRun, isLoading: loadingReport } = useQuery({
        queryKey: ['reportRun', reportRunId],
        queryFn: async () => {
            const reports = await base44.entities.ReportRun.filter({ id: reportRunId });
            return reports[0] || null;
        },
        enabled: !!reportRunId
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project?.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company, active: true }),
        enabled: !!project?.company
    });

    const { data: salaries = [] } = useQuery({
        queryKey: ['salaries', project?.company],
        queryFn: () => base44.entities.EmployeeSalary.filter({ company: project.company, active: true }),
        enabled: !!project?.company
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', projectId],
        queryFn: () => base44.entities.Exception.filter({ project_id: projectId }),
        enabled: !!projectId
    });

    const { data: salarySnapshots = [] } = useQuery({
        queryKey: ['salarySnapshots', projectId, reportRunId],
        queryFn: () => base44.entities.SalarySnapshot.filter({
            project_id: projectId,
            report_run_id: reportRunId
        }),
        enabled: !!projectId && !!reportRunId
    });

    // Initialize dates from report
    React.useEffect(() => {
        if (reportRun?.date_from && reportRun?.date_to) {
            setCustomDateFrom(reportRun.date_from);
            setCustomDateTo(reportRun.date_to);
        }
    }, [reportRun]);

    // Derived values
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';
    const isAlMaraghiAutoRepairs = project?.company === 'Al Maraghi Auto Repairs';

    // Validate date range
    const validateDateRange = () => {
        if (!customDateFrom || !customDateTo || !reportRun) {
            return { valid: false, message: 'Please select both dates' };
        }

        const from = new Date(customDateFrom);
        const to = new Date(customDateTo);
        const reportFrom = new Date(reportRun.date_from);
        const reportTo = new Date(reportRun.date_to);

        if (from > to) {
            return { valid: false, message: 'From date must be before To date' };
        }

        if (from < reportFrom) {
            return { 
                valid: false, 
                message: `From date (${customDateFrom}) is before the finalized report start (${reportRun.date_from})` 
            };
        }

        if (to > reportTo) {
            return { 
                valid: false, 
                message: `To date (${customDateTo}) is after the finalized report end (${reportRun.date_to})` 
            };
        }

        return { valid: true, message: 'Date range is valid' };
    };

    // Calculate salary for custom date range
    const calculateForDateRange = async () => {
        const validation = validateDateRange();
        setValidationResult(validation);

        if (!validation.valid) {
            toast.error(validation.message);
            return;
        }

        if (salarySnapshots.length === 0) {
            toast.error('No salary snapshots found for this report');
            return;
        }

        setIsCalculating(true);
        try {
            const divisor = project.salary_calculation_days || 30;
            const fromDate = new Date(customDateFrom);
            const toDate = new Date(customDateTo);
            const fullReportFrom = new Date(reportRun.date_from);
            const fullReportTo = new Date(reportRun.date_to);

            // Helper to count working days
            const getWorkingDaysInRange = (from, to, weeklyOff) => {
                let count = 0;
                const current = new Date(from);
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                
                while (current <= to) {
                    const dayName = dayNames[current.getDay()];
                    if (dayName !== weeklyOff) {
                        count++;
                    }
                    current.setDate(current.getDate() + 1);
                }
                return count;
            };

            // Helper to check if date falls within exception range
            const isDateInException = (dateStr, exception) => {
                const date = new Date(dateStr);
                const exFrom = new Date(exception.date_from);
                const exTo = new Date(exception.date_to);
                return date >= exFrom && date <= exTo;
            };

            // Process each employee's salary snapshot
            const recalculatedData = salarySnapshots.map(snapshot => {
                const employee = employees.find(e => e.hrms_id === snapshot.hrms_id);
                const weeklyOff = employee?.weekly_off || 'Sunday';
                const projectWeeklyOff = project?.weekly_off_override && project.weekly_off_override !== 'None' 
                    ? project.weekly_off_override 
                    : weeklyOff;

                // Calculate working days for both periods
                const fullWorkingDays = getWorkingDaysInRange(fullReportFrom, fullReportTo, projectWeeklyOff);
                const customWorkingDays = getWorkingDaysInRange(fromDate, toDate, projectWeeklyOff);

                // Filter exceptions for this employee within custom date range
                const employeeExceptions = exceptions.filter(ex => 
                    (ex.attendance_id === snapshot.attendance_id || ex.attendance_id === 'ALL') &&
                    ex.use_in_analysis !== false &&
                    ex.is_custom_type !== true
                );

                // Count exception types within custom range
                let annualLeaveCount = 0;
                let sickLeaveCount = 0;
                let fullAbsenceCount = 0;
                let publicHolidayCount = 0;
                let salaryLeaveDays = 0;

                // Iterate through each day in custom range
                const current = new Date(fromDate);
                while (current <= toDate) {
                    const dateStr = current.toISOString().split('T')[0];
                    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][current.getDay()];
                    
                    // Skip weekly off days
                    if (dayName === projectWeeklyOff) {
                        current.setDate(current.getDate() + 1);
                        continue;
                    }

                    // Check exceptions for this day
                    for (const ex of employeeExceptions) {
                        if (isDateInException(dateStr, ex)) {
                            if (ex.type === 'ANNUAL_LEAVE') {
                                annualLeaveCount++;
                                // Check for salary_leave_days override on this exception
                                if (ex.salary_leave_days !== null && ex.salary_leave_days !== undefined && ex.salary_leave_days > 0) {
                                    // Pro-rate based on overlap with custom range
                                    const exFrom = new Date(Math.max(new Date(ex.date_from), fromDate));
                                    const exTo = new Date(Math.min(new Date(ex.date_to), toDate));
                                    const totalExDays = Math.ceil((new Date(ex.date_to) - new Date(ex.date_from)) / (1000 * 60 * 60 * 24)) + 1;
                                    const overlapDays = Math.ceil((exTo - exFrom) / (1000 * 60 * 60 * 24)) + 1;
                                    salaryLeaveDays += (ex.salary_leave_days * overlapDays / totalExDays);
                                }
                                break;
                            } else if (ex.type === 'SICK_LEAVE') {
                                sickLeaveCount++;
                                break;
                            } else if (ex.type === 'MANUAL_ABSENT') {
                                fullAbsenceCount++;
                                break;
                            } else if (ex.type === 'PUBLIC_HOLIDAY') {
                                publicHolidayCount++;
                                break;
                            }
                        }
                    }

                    current.setDate(current.getDate() + 1);
                }

                // Calculate present days
                const leaveDays = annualLeaveCount + fullAbsenceCount;
                const presentDays = Math.max(0, customWorkingDays - leaveDays - publicHolidayCount - sickLeaveCount);

                // Pro-rate deductible minutes
                const dateRatio = fullWorkingDays > 0 ? customWorkingDays / fullWorkingDays : 0;
                const proRatedDeductibleMinutes = Math.round((snapshot.deductible_minutes || 0) * dateRatio);
                const deductibleHours = proRatedDeductibleMinutes / 60;

                // Recalculate salary values
                const totalSalary = snapshot.total_salary;
                const workingHours = snapshot.working_hours;
                const hourlyRate = totalSalary / divisor / workingHours;

                const leavePay = (totalSalary / divisor) * leaveDays;
                const salaryLeaveAmount = (totalSalary / divisor) * (salaryLeaveDays || annualLeaveCount);
                const deductibleHoursPay = hourlyRate * deductibleHours;
                const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);

                // Get OT and other editable values (from state or snapshot)
                const edits = editableData[snapshot.hrms_id];
                const normalOtHours = edits?.normalOtHours ?? snapshot.normalOtHours ?? 0;
                const specialOtHours = edits?.specialOtHours ?? snapshot.specialOtHours ?? 0;
                const normalOtRate = hourlyRate * 1.25;
                const specialOtRate = hourlyRate * 1.5;
                const normalOtSalary = normalOtRate * normalOtHours;
                const specialOtSalary = specialOtRate * specialOtHours;
                const totalOtSalary = normalOtSalary + specialOtSalary;

                const bonus = edits?.bonus ?? snapshot.bonus ?? 0;
                const incentive = edits?.incentive ?? snapshot.incentive ?? 0;
                const otherDeduction = edits?.otherDeduction ?? snapshot.otherDeduction ?? 0;
                const advanceSalaryDeduction = edits?.advanceSalaryDeduction ?? snapshot.advanceSalaryDeduction ?? 0;

                const total = totalSalary + totalOtSalary + bonus + incentive - netDeduction - deductibleHoursPay - otherDeduction - advanceSalaryDeduction;

                return {
                    ...snapshot,
                    working_days: customWorkingDays,
                    present_days: presentDays,
                    full_absence_count: fullAbsenceCount,
                    annual_leave_count: annualLeaveCount,
                    sick_leave_count: sickLeaveCount,
                    leaveDays,
                    leavePay: Math.round(leavePay * 100) / 100,
                    salaryLeaveDays: Math.round((salaryLeaveDays || annualLeaveCount) * 100) / 100,
                    salaryLeaveAmount: Math.round(salaryLeaveAmount * 100) / 100,
                    deductible_minutes: proRatedDeductibleMinutes,
                    deductibleHours: Math.round(deductibleHours * 100) / 100,
                    deductibleHoursPay: Math.round(deductibleHoursPay * 100) / 100,
                    netDeduction: Math.round(netDeduction * 100) / 100,
                    normalOtHours,
                    normalOtSalary: Math.round(normalOtSalary * 100) / 100,
                    specialOtHours,
                    specialOtSalary: Math.round(specialOtSalary * 100) / 100,
                    totalOtSalary: Math.round(totalOtSalary * 100) / 100,
                    bonus,
                    incentive,
                    otherDeduction,
                    advanceSalaryDeduction,
                    total: Math.round(total * 100) / 100,
                    wpsPay: Math.round(total * 100) / 100,
                    balance: 0
                };
            });

            setCalculatedData(recalculatedData);
            toast.success(`Salary calculated for ${customDateFrom} to ${customDateTo}`);
        } catch (error) {
            toast.error('Calculation failed: ' + error.message);
        } finally {
            setIsCalculating(false);
        }
    };

    // Handle editable field change
    const handleChange = (hrmsId, field, value) => {
        setEditableData(prev => ({
            ...prev,
            [hrmsId]: {
                ...(prev[hrmsId] || {}),
                [field]: value === '' ? 0 : parseFloat(value) || 0
            }
        }));
    };

    // Get value from edits or calculated data
    const getValue = (row, field) => {
        return editableData[row.hrms_id]?.[field] ?? row[field] ?? 0;
    };

    // Calculate totals for a row
    const calculateTotals = (row) => {
        const leavePay = getValue(row, 'leavePay') || 0;
        const salaryLeaveAmount = getValue(row, 'salaryLeaveAmount') || 0;
        const normalOtSalary = getValue(row, 'normalOtSalary') || 0;
        const specialOtSalary = getValue(row, 'specialOtSalary') || 0;
        const totalOtSalary = normalOtSalary + specialOtSalary;
        const bonus = getValue(row, 'bonus') || 0;
        const incentive = getValue(row, 'incentive') || 0;
        const otherDeduction = getValue(row, 'otherDeduction') || 0;
        const advanceSalaryDeduction = getValue(row, 'advanceSalaryDeduction') || 0;
        const deductibleHoursPay = getValue(row, 'deductibleHoursPay') || 0;

        const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);
        const total = row.total_salary + totalOtSalary + bonus + incentive
                      - netDeduction - deductibleHoursPay - otherDeduction - advanceSalaryDeduction;
        
        return { total, wpsPay: total, balance: 0 };
    };

    // Filter and sort data
    const filteredData = useMemo(() => {
        if (!calculatedData) return [];
        
        let filtered = calculatedData;
        
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item =>
                item.name.toLowerCase().includes(query) ||
                item.attendance_id.toString().includes(query) ||
                (item.department && item.department.toLowerCase().includes(query))
            );
        }

        return [...filtered].sort((a, b) => {
            const key = sortColumn.key;
            const aVal = a[key];
            const bVal = b[key];
            
            let compareResult = 0;
            if (typeof aVal === 'string') {
                compareResult = (aVal || '').localeCompare(bVal || '');
            } else if (typeof aVal === 'number') {
                compareResult = aVal - bVal;
            }
            
            return sortColumn.direction === 'asc' ? compareResult : -compareResult;
        });
    }, [calculatedData, searchQuery, sortColumn]);

    // Save salary report
    const handleSaveSalaryReport = async () => {
        if (!reportName.trim()) {
            toast.error('Please enter a report name');
            return;
        }

        if (!calculatedData || calculatedData.length === 0) {
            toast.error('No salary data to save. Please calculate first.');
            return;
        }

        setIsSavingReport(true);
        try {
            let totalSalaryAmount = 0;
            let totalDeductions = 0;
            let totalOtSalary = 0;

            calculatedData.forEach(row => {
                const { total } = calculateTotals(row);
                totalSalaryAmount += total;
                totalDeductions += (row.netDeduction || 0) + (row.deductibleHoursPay || 0) + (row.otherDeduction || 0) + (row.advanceSalaryDeduction || 0);
                totalOtSalary += (row.normalOtSalary || 0) + (row.specialOtSalary || 0);
            });

            await base44.entities.SalaryReport.create({
                project_id: projectId,
                report_run_id: reportRunId,
                report_name: reportName.trim(),
                date_from: customDateFrom,
                date_to: customDateTo,
                company: project.company,
                employee_count: calculatedData.length,
                total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
                total_deductions: Math.round(totalDeductions * 100) / 100,
                total_ot_salary: Math.round(totalOtSalary * 100) / 100,
                snapshot_data: JSON.stringify(calculatedData),
                generated_by: currentUser?.email,
                notes: reportNotes.trim() || null
            });

            toast.success(`Salary report "${reportName}" saved successfully`);
            setShowSaveDialog(false);
            setReportName('');
            setReportNotes('');
        } catch (error) {
            toast.error('Failed to save report: ' + error.message);
        } finally {
            setIsSavingReport(false);
        }
    };

    // Export to Excel
    const handleExportToExcel = () => {
        if (!calculatedData || calculatedData.length === 0) {
            toast.error('No data to export');
            return;
        }

        const exportData = calculatedData.map(row => {
            const { total, wpsPay, balance } = calculateTotals(row);
            return {
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
                'Salary Leave Days': row.salaryLeaveDays || 0,
                'Salary Leave Amount': row.salaryLeaveAmount,
                'Normal OT Hours': getValue(row, 'normalOtHours'),
                'Normal OT Salary': getValue(row, 'normalOtSalary'),
                'Special OT Hours': getValue(row, 'specialOtHours'),
                'Special OT Salary': getValue(row, 'specialOtSalary'),
                'Total OT Salary': (getValue(row, 'normalOtSalary') || 0) + (getValue(row, 'specialOtSalary') || 0),
                'Deductible Hours': row.deductibleHours || 0,
                'Deductible Hours Pay': row.deductibleHoursPay || 0,
                'Other Deduction': getValue(row, 'otherDeduction'),
                'Bonus': getValue(row, 'bonus'),
                'Incentive': getValue(row, 'incentive'),
                'Advance Salary Deduction': getValue(row, 'advanceSalaryDeduction'),
                'Total': total,
                'WPS Pay': wpsPay,
                'Balance': balance
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');
        XLSX.writeFile(wb, `Salary_${project?.company}_${customDateFrom}_to_${customDateTo}.xlsx`);
        toast.success('Excel file downloaded');
    };

    // Access checks
    if (!isAdminOrCEO) {
        return (
            <div className="p-6">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <XCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
                        <p className="text-slate-600">Access restricted to Admin and CEO only</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loadingProject || loadingReport) {
        return (
            <div className="p-6">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-indigo-600" />
                        <p className="text-slate-600">Loading...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!project || !reportRun) {
        return (
            <div className="p-6">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <XCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
                        <p className="text-slate-600">Project or Report not found</p>
                        <Link to={createPageUrl('Projects')}>
                            <Button className="mt-4">Back to Projects</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isAlMaraghiAutoRepairs) {
        return (
            <div className="p-6">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <XCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
                        <p className="text-slate-600">Salary reports are only available for Al Maraghi Auto Repairs</p>
                        <Link to={createPageUrl('ProjectDetail') + `?id=${projectId}`}>
                            <Button className="mt-4">Back to Project</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PINLock onUnlock={(unlocked) => setSalaryUnlocked(unlocked)} storageKey="salary_report_gen_pin" />
            
            {!salaryUnlocked ? (
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <p className="text-slate-600">Please unlock to access salary report generator.</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link to={createPageUrl('ProjectDetail') + `?id=${projectId}`}>
                                <Button variant="outline" size="icon">
                                    <ArrowLeft className="w-4 h-4" />
                                </Button>
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-900">Create Custom Salary Report</h1>
                                <p className="text-slate-600">{project.name} - {project.company}</p>
                            </div>
                        </div>
                    </div>

                    {/* Source Report Info */}
                    <Card className="border-0 shadow-md bg-gradient-to-r from-green-50 to-emerald-50">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                                <div>
                                    <p className="font-semibold text-green-800">Source: Finalized Attendance Report</p>
                                    <p className="text-sm text-green-700">
                                        {reportRun.report_name || 'Report'} ({reportRun.date_from} to {reportRun.date_to})
                                        {reportRun.finalized_by && <span className="ml-2">— Finalized by {reportRun.finalized_by}</span>}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Date Range Selection */}
                    <Card className="border-0 shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-indigo-600" />
                                Select Date Range
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                                <Info className="w-4 h-4 inline mr-2" />
                                Select a date range within the finalized report period. The salary will be recalculated based on attendance data for the selected dates.
                            </div>

                            <div className="flex flex-wrap gap-4 items-end">
                                <div>
                                    <Label className="text-sm text-slate-600">From Date</Label>
                                    <Input
                                        type="date"
                                        value={customDateFrom}
                                        onChange={(e) => {
                                            setCustomDateFrom(e.target.value);
                                            setValidationResult(null);
                                            setCalculatedData(null);
                                        }}
                                        min={reportRun.date_from}
                                        max={customDateTo || reportRun.date_to}
                                        className="w-44"
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm text-slate-600">To Date</Label>
                                    <Input
                                        type="date"
                                        value={customDateTo}
                                        onChange={(e) => {
                                            setCustomDateTo(e.target.value);
                                            setValidationResult(null);
                                            setCalculatedData(null);
                                        }}
                                        min={customDateFrom || reportRun.date_from}
                                        max={reportRun.date_to}
                                        className="w-44"
                                    />
                                </div>
                                <Button
                                    onClick={calculateForDateRange}
                                    disabled={isCalculating || !customDateFrom || !customDateTo}
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    {isCalculating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Calculating...
                                        </>
                                    ) : (
                                        <>
                                            <DollarSign className="w-4 h-4 mr-2" />
                                            Calculate Salary
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Validation Result */}
                            {validationResult && !validationResult.valid && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-semibold text-red-800">Invalid Date Range</p>
                                            <p className="text-xs text-red-700 mt-1">{validationResult.message}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Salary Table */}
                    {calculatedData && (
                        <Card className="border-0 shadow-lg">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2">
                                        <DollarSign className="w-5 h-5 text-indigo-600" />
                                        Salary Report: {customDateFrom} to {customDateTo}
                                    </CardTitle>
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={() => setShowSaveDialog(true)}
                                            className="bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            <Save className="w-4 h-4 mr-2" />
                                            Save Report
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={handleExportToExcel}
                                            className="border-green-300 text-green-700 hover:bg-green-50"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Export Excel
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {/* Search */}
                                <div className="mb-4">
                                    <div className="relative max-w-md">
                                        <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                        <Input
                                            placeholder="Search by name, ID, or department..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10"
                                        />
                                    </div>
                                    <p className="text-sm text-slate-600 mt-2">
                                        Showing {filteredData.length} of {calculatedData.length} employees
                                    </p>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <SortableTableHead sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn}>ID</SortableTableHead>
                                                <SortableTableHead sortKey="name" currentSort={sortColumn} onSort={setSortColumn}>Name</SortableTableHead>
                                                <SortableTableHead sortKey="department" currentSort={sortColumn} onSort={setSortColumn}>Dept</SortableTableHead>
                                                <SortableTableHead sortKey="total_salary" currentSort={sortColumn} onSort={setSortColumn}>Total Salary</SortableTableHead>
                                                <SortableTableHead sortKey="working_days" currentSort={sortColumn} onSort={setSortColumn}>Working Days</SortableTableHead>
                                                <SortableTableHead sortKey="present_days" currentSort={sortColumn} onSort={setSortColumn}>Present</SortableTableHead>
                                                <SortableTableHead sortKey="leaveDays" currentSort={sortColumn} onSort={setSortColumn}>Leave Days</SortableTableHead>
                                                <SortableTableHead sortKey="leavePay" currentSort={sortColumn} onSort={setSortColumn}>Leave Pay</SortableTableHead>
                                                <SortableTableHead sortKey="salaryLeaveAmount" currentSort={sortColumn} onSort={setSortColumn}>Salary Leave Amt</SortableTableHead>
                                                <TableHead className="bg-blue-50">Normal OT Hrs</TableHead>
                                                <TableHead className="bg-blue-50">Normal OT Sal</TableHead>
                                                <TableHead className="bg-cyan-50">Special OT Hrs</TableHead>
                                                <TableHead className="bg-cyan-50">Special OT Sal</TableHead>
                                                <SortableTableHead sortKey="deductibleHoursPay" currentSort={sortColumn} onSort={setSortColumn}>Deduct Hrs Pay</SortableTableHead>
                                                <TableHead className="bg-red-50">Other Deduct</TableHead>
                                                <TableHead className="bg-green-50">Bonus</TableHead>
                                                <TableHead className="bg-green-50">Incentive</TableHead>
                                                <TableHead className="bg-red-50">Advance Deduct</TableHead>
                                                <SortableTableHead sortKey="total" currentSort={sortColumn} onSort={setSortColumn} className="bg-indigo-100 font-bold">Total</SortableTableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredData.map((row) => {
                                                const { total, wpsPay } = calculateTotals(row);
                                                return (
                                                    <TableRow key={row.hrms_id}>
                                                        <TableCell className="font-medium">{row.attendance_id}</TableCell>
                                                        <TableCell className="font-medium">{row.name.split(' ').slice(0, 2).join(' ')}</TableCell>
                                                        <TableCell className="text-sm text-slate-600">{row.department || '-'}</TableCell>
                                                        <TableCell className="font-semibold">{row.total_salary.toFixed(2)}</TableCell>
                                                        <TableCell>{row.working_days}</TableCell>
                                                        <TableCell>{row.present_days}</TableCell>
                                                        <TableCell className="bg-amber-50">{row.leaveDays}</TableCell>
                                                        <TableCell className="bg-amber-50">{row.leavePay?.toFixed(2)}</TableCell>
                                                        <TableCell className="bg-green-50">{row.salaryLeaveAmount?.toFixed(2)}</TableCell>
                                                        <TableCell className="bg-blue-50 p-1">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                value={getValue(row, 'normalOtHours')}
                                                                onChange={(e) => handleChange(row.hrms_id, 'normalOtHours', e.target.value)}
                                                                className="h-8 w-20 text-xs"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="bg-blue-100">{getValue(row, 'normalOtSalary')?.toFixed(2)}</TableCell>
                                                        <TableCell className="bg-cyan-50 p-1">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                value={getValue(row, 'specialOtHours')}
                                                                onChange={(e) => handleChange(row.hrms_id, 'specialOtHours', e.target.value)}
                                                                className="h-8 w-20 text-xs"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="bg-cyan-100">{getValue(row, 'specialOtSalary')?.toFixed(2)}</TableCell>
                                                        <TableCell className="bg-purple-50">{row.deductibleHoursPay?.toFixed(2)}</TableCell>
                                                        <TableCell className="bg-red-50 p-1">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                value={getValue(row, 'otherDeduction')}
                                                                onChange={(e) => handleChange(row.hrms_id, 'otherDeduction', e.target.value)}
                                                                className="h-8 w-20 text-xs"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="bg-green-50 p-1">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                value={getValue(row, 'bonus')}
                                                                onChange={(e) => handleChange(row.hrms_id, 'bonus', e.target.value)}
                                                                className="h-8 w-20 text-xs"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="bg-green-50 p-1">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                value={getValue(row, 'incentive')}
                                                                onChange={(e) => handleChange(row.hrms_id, 'incentive', e.target.value)}
                                                                className="h-8 w-20 text-xs"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="bg-red-50 p-1">
                                                            <Input
                                                                type="number"
                                                                step="0.01"
                                                                value={getValue(row, 'advanceSalaryDeduction')}
                                                                onChange={(e) => handleChange(row.hrms_id, 'advanceSalaryDeduction', e.target.value)}
                                                                className="h-8 w-20 text-xs"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="bg-indigo-100 font-bold">{total.toFixed(2)}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Save Report Dialog */}
                    <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Save Salary Report</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div>
                                    <Label>Report Name *</Label>
                                    <Input
                                        placeholder="e.g., January 2026 Week 1-2 Salary"
                                        value={reportName}
                                        onChange={(e) => setReportName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label>Notes (optional)</Label>
                                    <Input
                                        placeholder="Additional notes..."
                                        value={reportNotes}
                                        onChange={(e) => setReportNotes(e.target.value)}
                                    />
                                </div>
                                <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                                    <p><strong>Period:</strong> {customDateFrom} to {customDateTo}</p>
                                    <p><strong>Employees:</strong> {calculatedData?.length || 0}</p>
                                    <p><strong>Company:</strong> {project?.company}</p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSaveSalaryReport}
                                    disabled={isSavingReport || !reportName.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    {isSavingReport ? 'Saving...' : 'Save Report'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            )}
        </div>
    );
}