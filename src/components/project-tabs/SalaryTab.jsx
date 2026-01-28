import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DollarSign, FileSpreadsheet, Save, Filter, X, Search, Download, FileText, Trash2, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import PINLock from '../ui/PINLock';
import SortableTableHead from '../ui/SortableTableHead';

export default function SalaryTab({ project, finalReport }) {
    const queryClient = useQueryClient();
    
    // ============================================
    // STATE DECLARATIONS (MUST BE FIRST)
    // ============================================
    const [blockingError, setBlockingError] = useState(null);
    const [editableData, setEditableData] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [sortColumn, setSortColumn] = useState({ key: 'department', direction: 'asc' });
    const [salaryUnlocked, setSalaryUnlocked] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [calculatedData, setCalculatedData] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [advancedFilters, setAdvancedFilters] = useState({
        salaryMin: '',
        salaryMax: '',
        leaveDaysMin: '',
        leaveDaysMax: '',
        deductionMin: '',
        deductionMax: ''
    });
    const [showSaveReportDialog, setShowSaveReportDialog] = useState(false);
    const [reportName, setReportName] = useState('');
    const [reportNotes, setReportNotes] = useState('');
    const [isSavingReport, setIsSavingReport] = useState(false);
    const [showSavedReports, setShowSavedReports] = useState(false);

    // ============================================
    // QUERIES
    // ============================================
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: employees = [], isLoading: loadingEmployees } = useQuery({
        queryKey: ['employees', project?.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company, active: true }),
        enabled: !!project?.company,
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: salaries = [], isLoading: loadingSalaries } = useQuery({
        queryKey: ['salaries', project?.company],
        queryFn: () => base44.entities.EmployeeSalary.filter({ company: project.company, active: true }),
        enabled: !!project?.company,
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: salarySnapshots = [], isLoading: loadingSnapshots } = useQuery({
        queryKey: ['salarySnapshots', project?.id, finalReport?.id],
        queryFn: async () => {
            console.log('[SalaryTab] Fetching snapshots for project:', project?.id, 'report:', finalReport?.id);
            const snapshots = await base44.entities.SalarySnapshot.filter({
                project_id: project.id,
                report_run_id: finalReport.id
            });
            console.log('[SalaryTab] Fetched', snapshots.length, 'snapshots');
            return snapshots;
        },
        enabled: !!project?.id && !!finalReport?.id && finalReport?.is_final === true,
        staleTime: 0,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: true
    });

    // ============================================
    // DERIVED VALUES
    // ============================================
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';

    // ============================================
    // EFFECTS
    // ============================================
    
    // Validate consistency of finalized report and snapshots
    useEffect(() => {
        let error = null;

        if (!finalReport) {
            error = 'No finalized report found. Please finalize a report in the Report Tab first.';
        } else if (finalReport.is_final !== true) {
            error = 'Selected report is not marked as final.';
        } else if (loadingSnapshots) {
            error = null; // Still loading, don't show error yet
        } else if (salarySnapshots.length === 0) {
            error = 'Salary snapshots not found. Report may need to be finalized again.';
        } else {
            const allSameReportId = salarySnapshots.every(s => s.report_run_id === finalReport.id);
            if (!allSameReportId) {
                error = 'Snapshots belong to different reports. Data integrity error.';
            }
        }

        setBlockingError(error);
    }, [finalReport, salarySnapshots, loadingSnapshots]);



    // Map salary snapshots to display format with editable overrides
    const salaryData = useMemo(() => {
        // Only return snapshots if all validations pass
        if (blockingError || !finalReport || salarySnapshots.length === 0) {
            return [];
        }

        return salarySnapshots.map(snapshot => ({
            ...snapshot,
            // These are the only editable fields in salary tab
            // All other values come from immutable snapshot
            normalOtHours: editableData[snapshot.hrms_id]?.normalOtHours ?? 0,
            specialOtHours: editableData[snapshot.hrms_id]?.specialOtHours ?? 0,
            otherDeduction: editableData[snapshot.hrms_id]?.otherDeduction ?? 0,
            bonus: editableData[snapshot.hrms_id]?.bonus ?? 0,
            incentive: editableData[snapshot.hrms_id]?.incentive ?? 0,
            advanceSalaryDeduction: editableData[snapshot.hrms_id]?.advanceSalaryDeduction ?? 0
        }));
    }, [salarySnapshots, editableData, blockingError, finalReport]);

    // Get unique departments for filter
    const departments = useMemo(() => {
        const depts = [...new Set(salaryData.map(item => item.department).filter(Boolean))];
        return depts.sort();
    }, [salaryData]);

    // Filter and sort salary data (use calculated data if available, otherwise use original)
    const dataToDisplay = calculatedData || salaryData;
    const filteredSalaryData = useMemo(() => {
        let filtered = dataToDisplay;
        
        // Apply department filter
        if (departmentFilter !== 'all') {
            filtered = filtered.filter(item => item.department === departmentFilter);
        }

        // Apply search filter (name, attendance_id, department)
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item =>
                item.name.toLowerCase().includes(query) ||
                item.attendance_id.toString().includes(query) ||
                (item.department && item.department.toLowerCase().includes(query))
            );
        }

        // Apply advanced filters
        if (advancedFilters.salaryMin) {
            const min = parseFloat(advancedFilters.salaryMin);
            filtered = filtered.filter(item => item.total_salary >= min);
        }
        if (advancedFilters.salaryMax) {
            const max = parseFloat(advancedFilters.salaryMax);
            filtered = filtered.filter(item => item.total_salary <= max);
        }
        if (advancedFilters.leaveDaysMin) {
            const min = parseFloat(advancedFilters.leaveDaysMin);
            filtered = filtered.filter(item => item.leaveDays >= min);
        }
        if (advancedFilters.leaveDaysMax) {
            const max = parseFloat(advancedFilters.leaveDaysMax);
            filtered = filtered.filter(item => item.leaveDays <= max);
        }
        if (advancedFilters.deductionMin) {
            const min = parseFloat(advancedFilters.deductionMin);
            filtered = filtered.filter(item => (item.total_salary - item.total) >= min);
        }
        if (advancedFilters.deductionMax) {
            const max = parseFloat(advancedFilters.deductionMax);
            filtered = filtered.filter(item => (item.total_salary - item.total) <= max);
        }

        // Apply sorting
        const sorted = [...filtered].sort((a, b) => {
            let compareResult = 0;
            
            const key = sortColumn.key;
            const aVal = a[key];
            const bVal = b[key];
            
            if (typeof aVal === 'string') {
                compareResult = (aVal || '').localeCompare(bVal || '');
            } else if (typeof aVal === 'number') {
                compareResult = aVal - bVal;
            }
            
            return sortColumn.direction === 'asc' ? compareResult : -compareResult;
        });
        
        return sorted;
    }, [dataToDisplay, departmentFilter, searchQuery, advancedFilters, sortColumn]);

    // Check if any filters are active
    const hasActiveFilters = searchQuery.trim() || 
                            departmentFilter !== 'all' || 
                            Object.values(advancedFilters).some(v => v);

    // Handle clear all filters
    const handleClearFilters = () => {
        setSearchQuery('');
        setDepartmentFilter('all');
        setAdvancedFilters({
            salaryMin: '',
            salaryMax: '',
            leaveDaysMin: '',
            leaveDaysMax: '',
            deductionMin: '',
            deductionMax: ''
        });
    };

    // Handle input change for editable fields - fix focus issue
    const handleChange = (hrmsId, field, value) => {
        setEditableData(prev => {
            const numValue = value === '' ? 0 : parseFloat(value) || 0;
            return {
                ...prev,
                [hrmsId]: {
                    ...(prev[hrmsId] || {}),
                    [field]: numValue
                }
            };
        });
    };

    // Get value (either from editableData or original data)
    const getValue = (row, field) => {
        return editableData[row.hrms_id]?.[field] ?? row[field];
    };

    // Calculate totals dynamically
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
        const wpsPay = total;
        const balance = 0;

        return { total, wpsPay, balance };
    };

    // Recalculate ALL dependent fields (leave pay, OT salary, etc.)
    const recalculateDependentFields = (dataToRecalculate) => {
        const recalculated = { ...dataToRecalculate };

        Object.keys(recalculated).forEach(hrmsId => {
            const row = dataToDisplay.find(r => r.hrms_id === hrmsId);
            if (!row) return;

            const employeeEdits = recalculated[hrmsId];
            const totalSalary = row.total_salary;
            const workingHours = row.working_hours;

            // NOTE: leaveDays and salaryLeaveDays are READ-ONLY and fetched from report/exceptions
            // They cannot be edited, so no recalculation needed here

            const divisor = project.salary_calculation_days || 30;

            // Recalculate Normal OT Salary if normalOtHours was edited
            if ('normalOtHours' in employeeEdits) {
                const normalOtHours = employeeEdits.normalOtHours;
                const hourlyRate = totalSalary / divisor / workingHours;
                const normalOtRate = hourlyRate * 1.25;
                recalculated[hrmsId].normalOtSalary = normalOtRate * normalOtHours;
            }

            // Recalculate Special OT Salary if specialOtHours was edited
            if ('specialOtHours' in employeeEdits) {
                const specialOtHours = employeeEdits.specialOtHours;
                const hourlyRate = totalSalary / divisor / workingHours;
                const specialOtRate = hourlyRate * 1.5;
                recalculated[hrmsId].specialOtSalary = specialOtRate * specialOtHours;
            }
        });

        return recalculated;
    };

    // Recalculate totals based on edits (OT hours, bonuses, deductions only)
    const handleRecalculateTotals = async () => {
        if (!finalReport?.id) {
            toast.error('No finalized report found');
            return;
        }

        if (salarySnapshots.length === 0) {
            toast.error('No salary snapshots available. Please finalize the report first.');
            return;
        }

        setIsCalculating(true);
        try {
            const divisor = project.salary_calculation_days || 30;

            // Recalculate OT salaries based on editable hours
            const calculatedWithEdits = salarySnapshots.map(snapshot => {
                const edits = editableData[snapshot.hrms_id];
                const updated = { ...snapshot };

                // Get edited OT hours or use existing values
                const normalOtHours = edits?.normalOtHours ?? snapshot.normalOtHours ?? 0;
                const specialOtHours = edits?.specialOtHours ?? snapshot.specialOtHours ?? 0;

                // Recalculate OT salaries
                const totalSalary = snapshot.total_salary;
                const workingHours = snapshot.working_hours;
                const hourlyRate = totalSalary / divisor / workingHours;

                const normalOtRate = hourlyRate * 1.25;
                const specialOtRate = hourlyRate * 1.5;

                updated.normalOtHours = normalOtHours;
                updated.normalOtSalary = Math.round(normalOtRate * normalOtHours * 100) / 100;
                updated.specialOtHours = specialOtHours;
                updated.specialOtSalary = Math.round(specialOtRate * specialOtHours * 100) / 100;
                updated.totalOtSalary = Math.round((updated.normalOtSalary + updated.specialOtSalary) * 100) / 100;

                // Apply other editable deductions and additions
                updated.otherDeduction = edits?.otherDeduction ?? snapshot.otherDeduction ?? 0;
                updated.bonus = edits?.bonus ?? snapshot.bonus ?? 0;
                updated.incentive = edits?.incentive ?? snapshot.incentive ?? 0;
                updated.advanceSalaryDeduction = edits?.advanceSalaryDeduction ?? snapshot.advanceSalaryDeduction ?? 0;

                // Recalculate total
                const finalTotal = snapshot.total_salary + updated.totalOtSalary + updated.bonus + updated.incentive
                                    - snapshot.netDeduction - snapshot.deductibleHoursPay - updated.otherDeduction - updated.advanceSalaryDeduction;

                updated.total = Math.round(finalTotal * 100) / 100;
                updated.wpsPay = Math.round(finalTotal * 100) / 100;

                return updated;
            });

            setCalculatedData(calculatedWithEdits);
            toast.success('Salary data recalculated successfully');
        } catch (error) {
            toast.error('Failed to recalculate salaries: ' + error.message);
        } finally {
            setIsCalculating(false);
        }
    };

    // Save all changes to backend
    const handleSave = async () => {
        if (Object.keys(editableData).length === 0) {
            toast.info('No changes to save');
            return;
        }

        setIsSaving(true);
        try {
            const response = await base44.functions.invoke('saveSalaryEdits', {
                project_id: project.id,
                report_run_id: finalReport.id,
                edits: editableData
            });

            if (response.data.success) {
                toast.success(`Saved editable values for ${response.data.updated_count} employees`);
                setEditableData({}); // Clear editable data after save
                // Refetch snapshots to get updated values
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id, finalReport?.id] });
            } else {
                toast.error('Failed to save: ' + (response.data.error || 'Unknown error'));
            }
        } catch (error) {
            toast.error('Failed to save salary data: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

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

    if (loadingEmployees || loadingSalaries || loadingSnapshots) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <p className="text-slate-600">Loading salary data...</p>
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
                        <p className="text-slate-600">Please unlock the salary section to view the salary table.</p>
                    </CardContent>
                </Card>
            )}
            {salaryUnlocked && (
            <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-purple-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-6 h-6 text-indigo-600" />
                        Salary Calculation - {project.company}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {blockingError ? (
                        <div className="text-center py-12">
                            <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-700 text-lg font-semibold">{blockingError}</p>
                            <p className="text-slate-600 text-sm mt-3">
                                No finalized attendance report exists for this date range.
                            </p>
                            <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700" onClick={() => window.location.hash = '#?tab=report'}>
                                Go to Report Tab
                            </Button>
                        </div>
                    ) : loadingSnapshots ? (
                        <div className="text-center py-12">
                            <p className="text-slate-600">Loading salary data...</p>
                        </div>
                    ) : (
                        <>
                            {/* Finalized Report Info */}
                            {finalReport && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-800">
                                    <strong>✓ Finalized Report:</strong> {finalReport.report_name || 'Report'} ({finalReport.date_from} to {finalReport.date_to})
                                    {finalReport.finalized_by && <span className="ml-2 text-xs">— Finalized by {finalReport.finalized_by}</span>}
                                </div>
                            )}
                            {salarySnapshots.length > 0 && !calculatedData && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
                                    <strong>ℹ️ Snapshots Ready:</strong> Click "Recalculate Totals" to apply any OT hours, bonuses, or deductions you've entered.
                                </div>
                            )}
                            {calculatedData && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-800">
                                    <strong>✓ Recalculated:</strong> Salary data has been recalculated. Edit OT hours, bonuses, or deductions as needed and click "Save Changes".
                                </div>
                            )}
                            
                            <div className="space-y-4 mb-4">
                        <div className="bg-white rounded-lg p-4">
                            {/* Search and Actions Row */}
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                {/* Search Box */}
                                <div className="flex-1">
                                    <label className="text-sm font-medium text-slate-700 mb-2 block">Search Employees</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search by name, ID, or department..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2">
                                    <Button 
                                        onClick={handleRecalculateTotals} 
                                        disabled={isCalculating || !finalReport || salarySnapshots.length === 0}
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <DollarSign className="w-4 h-4 mr-2" />
                                        {isCalculating ? 'Recalculating...' : 'Recalculate Totals'}
                                    </Button>
                                    <Button 
                                        onClick={handleSave} 
                                        disabled={isSaving || Object.keys(editableData).length === 0}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </Button>
                                </div>
                            </div>

                            {/* Results Count */}
                            <div className="mt-4 text-sm text-slate-600">
                                <strong>Showing {filteredSalaryData.length} of {dataToDisplay.length} employees</strong>
                            </div>
                        </div>


                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap sticky left-0 bg-white z-10">Attendance ID</SortableTableHead>
                                    <SortableTableHead sortKey="name" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap sticky left-16 bg-white z-10">Name</SortableTableHead>
                                    <SortableTableHead sortKey="department" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Department</SortableTableHead>
                                    <SortableTableHead sortKey="working_hours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Working Hours/Day</SortableTableHead>
                                    <SortableTableHead sortKey="basic_salary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Basic Salary</SortableTableHead>
                                    <SortableTableHead sortKey="total_salary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Total Salary</SortableTableHead>
                                    <SortableTableHead sortKey="working_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Working Days</SortableTableHead>
                                    <SortableTableHead sortKey="present_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Present Days</SortableTableHead>
                                    <SortableTableHead sortKey="full_absence_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">LOP Days</SortableTableHead>
                                    <SortableTableHead sortKey="annual_leave_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Annual Leave Days</SortableTableHead>
                                    <SortableTableHead sortKey="sick_leave_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Sick Leave Days</SortableTableHead>
                                    <SortableTableHead sortKey="leaveDays" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-50">Leave Days</SortableTableHead>
                                    <SortableTableHead sortKey="leavePay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-50">Leave Pay</SortableTableHead>
                                    <SortableTableHead sortKey="salaryLeaveDays" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-50">Salary Leave Days</SortableTableHead>
                                    <SortableTableHead sortKey="salaryLeaveAmount" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-50">Salary Leave Amount</SortableTableHead>
                                    <SortableTableHead sortKey="normalOtHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-50">Normal OT Hours</SortableTableHead>
                                    <SortableTableHead sortKey="normalOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-50">Normal OT Salary</SortableTableHead>
                                    <SortableTableHead sortKey="specialOtHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-cyan-50">Special OT Hours</SortableTableHead>
                                    <SortableTableHead sortKey="specialOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-cyan-50">Special OT Salary</SortableTableHead>
                                    <SortableTableHead sortKey="totalOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-100 font-bold">Total OT Salary</SortableTableHead>
                                    <SortableTableHead sortKey="deductibleHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-purple-50">Deductible Hours</SortableTableHead>
                                    <SortableTableHead sortKey="deductibleHoursPay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-purple-50">Deductible Hours Pay</SortableTableHead>
                                    <SortableTableHead sortKey="otherDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-red-50">Other Deduction</SortableTableHead>
                                    <SortableTableHead sortKey="bonus" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-50">Bonus</SortableTableHead>
                                    <SortableTableHead sortKey="incentive" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-50">Incentive</SortableTableHead>
                                    <SortableTableHead sortKey="advanceSalaryDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-red-50">Advance Salary Deduction</SortableTableHead>
                                    <SortableTableHead sortKey="total" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-indigo-100 font-bold">Total</SortableTableHead>
                                    <SortableTableHead sortKey="wpsPay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-indigo-100 font-bold">WPS Pay</SortableTableHead>
                                    <SortableTableHead sortKey="balance" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-100">Balance</SortableTableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSalaryData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={30} className="text-center py-12">
                                            <p className="text-slate-600 text-lg font-medium">No employees match your search criteria</p>
                                            <p className="text-slate-500 text-sm mt-2">Try adjusting your filters</p>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredSalaryData.map((row) => {
                                    const { total, wpsPay, balance } = calculateTotals(row);
                                    return (
                                        <TableRow key={row.hrms_id}>
                                             <TableCell className="sticky left-0 bg-white z-10 font-medium">{row.attendance_id}</TableCell>
                                             <TableCell className="sticky left-16 bg-white z-10 font-medium">{row.name.split(' ').slice(0, 2).join(' ')}</TableCell>
                                             <TableCell className="text-sm text-slate-600">{row.department || '-'}</TableCell>
                                             <TableCell>{row.working_hours.toFixed(2)}</TableCell>
                                             <TableCell>{row.basic_salary.toFixed(2)}</TableCell>
                                             <TableCell className="font-semibold">{row.total_salary.toFixed(2)}</TableCell>
                                             <TableCell>{row.working_days.toFixed(2)}</TableCell>
                                             <TableCell>{row.present_days.toFixed(2)}</TableCell>
                                             <TableCell className="text-red-600 font-semibold">{row.full_absence_count.toFixed(2)}</TableCell>
                                             <TableCell className="text-green-600 font-medium">{row.annual_leave_count.toFixed(2)}</TableCell>
                                             <TableCell className="text-blue-600 font-medium">{row.sick_leave_count.toFixed(2)}</TableCell>
                                             <TableCell className="bg-amber-50 p-2 text-sm font-medium text-slate-700 text-center">
                                                {row.leaveDays.toFixed(2)}
                                             </TableCell>
                                             <TableCell className="bg-amber-100 p-2 text-sm font-medium text-slate-700">
                                                 {(getValue(row, 'leavePay') || 0).toFixed(2)}
                                              </TableCell>
                                              <TableCell className="bg-green-50 p-2 text-sm font-medium text-slate-700 text-center">
                                                 {(row.salaryLeaveDays || 0).toFixed(2)}
                                              </TableCell>
                                             <TableCell className="bg-green-100 p-2 text-sm font-medium text-slate-700">
                                                 {(getValue(row, 'salaryLeaveAmount') || 0).toFixed(2)}
                                             </TableCell>
                                            <TableCell className="bg-blue-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'normalOtHours')}
                                                    onChange={(e) => handleChange(row.hrms_id, 'normalOtHours', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-blue-100 p-2 text-sm font-medium text-slate-700">
                                                {(getValue(row, 'normalOtSalary') || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="bg-cyan-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'specialOtHours')}
                                                    onChange={(e) => handleChange(row.hrms_id, 'specialOtHours', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-cyan-100 p-2 text-sm font-medium text-slate-700">
                                                {(getValue(row, 'specialOtSalary') || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="bg-blue-200 p-2 text-sm font-bold text-slate-900">
                                                {((getValue(row, 'normalOtSalary') || 0) + (getValue(row, 'specialOtSalary') || 0)).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="bg-purple-50 font-medium text-slate-700">{row.deductibleHours?.toFixed(2) || '0.00'}</TableCell>
                                            <TableCell className="bg-purple-50 font-medium text-slate-700">{row.deductibleHoursPay?.toFixed(2) || '0.00'}</TableCell>
                                            <TableCell className="bg-red-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={(getValue(row, 'otherDeduction') || 0).toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'otherDeduction', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-green-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={(getValue(row, 'bonus') || 0).toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'bonus', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-green-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={(getValue(row, 'incentive') || 0).toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'incentive', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-red-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={(getValue(row, 'advanceSalaryDeduction') || 0).toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'advanceSalaryDeduction', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-indigo-100 font-bold">{total.toFixed(2)}</TableCell>
                                            <TableCell className="bg-indigo-100 font-bold">{wpsPay.toFixed(2)}</TableCell>
                                            <TableCell className="bg-slate-100">{balance.toFixed(2)}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    </>
                    )}
                    </CardContent>
                    </Card>
                    )}
                    </div>
                    );
                    }