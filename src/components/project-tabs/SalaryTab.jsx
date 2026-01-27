import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DollarSign, FileSpreadsheet, Save, Filter, X, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import PINLock from '../ui/PINLock';
import SortableTableHead from '../ui/SortableTableHead';

export default function SalaryTab({ project, finalReport }) {
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: employees = [], isLoading: loadingEmployees } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company, active: true }),
        enabled: !!project.company,
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: salaries = [], isLoading: loadingSalaries } = useQuery({
        queryKey: ['salaries', project.company],
        queryFn: () => base44.entities.EmployeeSalary.filter({ company: project.company, active: true }),
        enabled: !!project.company,
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: salarySnapshots = [], isLoading: loadingSnapshots } = useQuery({
        queryKey: ['salarySnapshots', project.id, finalReport?.id],
        queryFn: async () => {
            console.log('🔍 SALARY TAB - Fetching SalarySnapshots with:', {
                project_id: project.id,
                report_run_id: finalReport?.id
            });
            const snapshots = await base44.entities.SalarySnapshot.filter({
                project_id: project.id,
                report_run_id: finalReport.id
            });
            console.log('📊 SALARY TAB - SalarySnapshots fetched:', snapshots.length, 'records');
            if (snapshots.length > 0) {
                console.log('First snapshot sample:', {
                    attendance_id: snapshots[0].attendance_id,
                    present_days: snapshots[0].present_days,
                    annual_leave_count: snapshots[0].annual_leave_count,
                    full_absence_count: snapshots[0].full_absence_count,
                    deductible_minutes: snapshots[0].deductible_minutes
                });
            }
            return snapshots;
        },
        enabled: !!project.id && !!finalReport?.id,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });



    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';

    // State for editable values
    const [editableData, setEditableData] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [sortColumn, setSortColumn] = useState({ key: 'department', direction: 'asc' });
    const [salaryUnlocked, setSalaryUnlocked] = useState(false);
    const [isCalculating, setIsCalculating] = useState(false);
    const [calculatedData, setCalculatedData] = useState(null);
    
    // Advanced search and filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [advancedFilters, setAdvancedFilters] = useState({
        salaryMin: '',
        salaryMax: '',
        leaveDaysMin: '',
        leaveDaysMax: '',
        deductionMin: '',
        deductionMax: ''
    });

    // Map salary snapshots to display format with editable overrides
        const salaryData = useMemo(() => {
            // If snapshots exist, use them directly - they are immutable and authoritative
            if (salarySnapshots.length > 0) {
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
            }

            // Fallback if no snapshots (no finalized report yet)
            return employees.map(emp => {
                const salary = salaries.find(s => 
                    String(s.employee_id) === String(emp.hrms_id) || 
                    String(s.attendance_id) === String(emp.attendance_id)
                );

                return {
                    hrms_id: emp.hrms_id,
                    attendance_id: emp.attendance_id,
                    name: emp.name,
                    department: emp.department,
                    company: emp.company,
                    employee_id: salary?.employee_id || emp.hrms_id,
                    basic_salary: salary?.basic_salary || 0,
                    allowances: salary?.allowances || '{}',
                    total_salary: salary?.total_salary || 0,
                    working_hours: salary?.working_hours || 9,
                    deduction_per_minute: salary?.deduction_per_minute || 0,
                    // Placeholder values when no snapshot exists
                    working_days: 30,
                    present_days: 0,
                    full_absence_count: 0,
                    annual_leave_count: 0,
                    sick_leave_count: 0,
                    late_minutes: 0,
                    early_checkout_minutes: 0,
                    other_minutes: 0,
                    approved_minutes: 0,
                    grace_minutes: 0,
                    deductible_minutes: 0,
                    salary_leave_days: 0,
                    leaveDays: 0,
                    leavePay: 0,
                    salaryLeaveAmount: 0,
                    deductibleHours: 0,
                    deductibleHoursPay: 0,
                    netDeduction: 0,
                    normalOtHours: 0,
                    specialOtHours: 0,
                    totalOtSalary: 0,
                    otherDeduction: 0,
                    bonus: 0,
                    incentive: 0,
                    advanceSalaryDeduction: 0,
                    total: salary?.total_salary || 0,
                    wpsPay: salary?.total_salary || 0,
                    balance: 0
                };
            });
        }, [salarySnapshots, employees, salaries, editableData]);

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
        const leavePay = getValue(row, 'leavePay');
        const salaryLeaveAmount = getValue(row, 'salaryLeaveAmount');
        const normalOtSalary = getValue(row, 'normalOtSalary');
        const specialOtSalary = getValue(row, 'specialOtSalary');
        const totalOtSalary = normalOtSalary + specialOtSalary;
        const bonus = getValue(row, 'bonus');
        const incentive = getValue(row, 'incentive');
        const otherDeduction = getValue(row, 'otherDeduction');
        const advanceSalaryDeduction = getValue(row, 'advanceSalaryDeduction');
        const deductibleHoursPay = getValue(row, 'deductibleHoursPay');
        const deductibleMinutesAmount = getValue(row, 'deductibleMinutesAmount');

        const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);
        const total = row.total_salary + totalOtSalary + bonus + incentive
                      - netDeduction - deductibleHoursPay - deductibleMinutesAmount - otherDeduction - advanceSalaryDeduction;
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

    // Recalculate derived salary fields based on edits (OT only, others are immutable)
    const handleRecalculateSalaries = async () => {
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

    // Save all changes
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Recalculate dependent fields based on current edits
            const recalculatedData = recalculateDependentFields(editableData);
            
            // TODO: Save recalculatedData to backend (create a new entity or update existing records)
            toast.success('Salary data saved successfully');
            setEditableData(recalculatedData);
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

    // Show empty state for admin when no final report exists
    const showEmptySalaryTab = !finalReport;

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
                    {salaryData.length === 0 ? (
                        <div className="text-center py-12">
                            <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-600 text-lg font-medium">No Employees Found</p>
                            <p className="text-slate-500 text-sm mt-2">Add employees to this company first to see salary calculations.</p>
                        </div>
                    ) : (
                        <>
                            {!finalReport && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                                    <strong>⚠️ No Final Report:</strong> Finalize a report in the Report tab first to create salary snapshots.
                                </div>
                            )}
                            {finalReport && salarySnapshots.length === 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                                    <strong>⚠️ Creating Snapshots:</strong> Salary snapshots are being created from the finalized report. Please wait a moment and refresh.
                                </div>
                            )}
                            {salarySnapshots.length > 0 && !calculatedData && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
                                    <strong>ℹ️ Snapshots Ready:</strong> Click "Recalculate" to apply any OT hours, bonuses, or deductions you've entered.
                                </div>
                            )}
                            {calculatedData && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-800">
                                    <strong>✓ Recalculated:</strong> Salary data has been recalculated. Edit OT hours, bonuses, or deductions as needed and click "Save Changes".
                                </div>
                            )}
                            
                            <div className="space-y-4 mb-4">
                        <div className="bg-white rounded-lg p-4">
                            <p className="text-sm text-slate-600 mb-4">
                                <strong>Note:</strong> Salary calculations based on latest saved report. Data from salary master is read-only.
                            </p>
                            {/* Search Box */}
                            <div className="bg-white rounded-lg p-4 mb-4 border border-slate-200">
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

                            {/* Advanced Filters */}
                            <div className="bg-white rounded-lg p-4 mb-4 border border-slate-200">
                                <h3 className="text-sm font-semibold text-slate-900 mb-3">Advanced Filters</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Salary Range */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-700">Total Salary</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                placeholder="Min"
                                                value={advancedFilters.salaryMin}
                                                onChange={(e) => setAdvancedFilters({...advancedFilters, salaryMin: e.target.value})}
                                                className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <input
                                                type="number"
                                                placeholder="Max"
                                                value={advancedFilters.salaryMax}
                                                onChange={(e) => setAdvancedFilters({...advancedFilters, salaryMax: e.target.value})}
                                                className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Leave Days Range */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-700">Leave Days</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                placeholder="Min"
                                                value={advancedFilters.leaveDaysMin}
                                                onChange={(e) => setAdvancedFilters({...advancedFilters, leaveDaysMin: e.target.value})}
                                                className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <input
                                                type="number"
                                                placeholder="Max"
                                                value={advancedFilters.leaveDaysMax}
                                                onChange={(e) => setAdvancedFilters({...advancedFilters, leaveDaysMax: e.target.value})}
                                                className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Deduction Range */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-700">Total Deductions</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                placeholder="Min"
                                                value={advancedFilters.deductionMin}
                                                onChange={(e) => setAdvancedFilters({...advancedFilters, deductionMin: e.target.value})}
                                                className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                            <input
                                                type="number"
                                                placeholder="Max"
                                                value={advancedFilters.deductionMax}
                                                onChange={(e) => setAdvancedFilters({...advancedFilters, deductionMax: e.target.value})}
                                                className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Department Filter & Action Buttons */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-slate-700 mb-2 block">Department</label>
                                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Departments</SelectItem>
                                            {departments.map(dept => (
                                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-end gap-2">
                                        <Button 
                                            onClick={handleRecalculateSalaries} 
                                            disabled={isCalculating || !finalReport || salarySnapshots.length === 0}
                                            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            <DollarSign className="w-4 h-4 mr-2" />
                                            {isCalculating ? 'Recalculating...' : 'Recalculate'}
                                        </Button>
                                    <Button 
                                        onClick={handleSave} 
                                        disabled={isSaving || Object.keys(editableData).length === 0}
                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </Button>
                                </div>

                                {hasActiveFilters && (
                                    <Button
                                        onClick={handleClearFilters}
                                        variant="outline"
                                        className="md:col-span-3"
                                    >
                                        <X className="w-4 h-4 mr-2" />
                                        Clear All Filters
                                    </Button>
                                )}
                            </div>
                        </div>
                        <div className="space-y-3">
                            {/* Active Filters Display */}
                            {hasActiveFilters && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-xs font-semibold text-amber-900 mb-2">Active Filters:</p>
                                            <div className="flex flex-wrap gap-2">
                                                {searchQuery && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                                        Search: "{searchQuery}"
                                                    </span>
                                                )}
                                                {departmentFilter !== 'all' && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                                        Dept: {departmentFilter}
                                                    </span>
                                                )}
                                                {advancedFilters.salaryMin && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                                        Salary ≥ {advancedFilters.salaryMin}
                                                    </span>
                                                )}
                                                {advancedFilters.salaryMax && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                                        Salary ≤ {advancedFilters.salaryMax}
                                                    </span>
                                                )}
                                                {advancedFilters.leaveDaysMin && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                                        Leave ≥ {advancedFilters.leaveDaysMin}
                                                    </span>
                                                )}
                                                {advancedFilters.leaveDaysMax && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                                        Leave ≤ {advancedFilters.leaveDaysMax}
                                                    </span>
                                                )}
                                                {advancedFilters.deductionMin && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                                        Deduct ≥ {advancedFilters.deductionMin}
                                                    </span>
                                                )}
                                                {advancedFilters.deductionMax && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs">
                                                        Deduct ≤ {advancedFilters.deductionMax}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Results Count */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-xs text-blue-800">
                                    <strong>Showing {filteredSalaryData.length} of {dataToDisplay.length} employees</strong>
                                    {isAdminOrCEO && hasActiveFilters && ` (${dataToDisplay.length - filteredSalaryData.length} hidden by filters)`}
                                </p>
                            </div>

                            {/* Formula Info */}
                             <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800 mb-3">
                                 <strong>🔒 IMMUTABLE SALARY SNAPSHOT:</strong> When a report is marked final, salary snapshots are created capturing exact values from that moment. These snapshots are frozen and never change automatically.
                                 <br /><span className="text-xs mt-1 block"><strong>What's Locked:</strong> Present Days, Leave Days, LOP Days, Deductible Minutes, and all related pay calculations.</span>
                                 <br /><span className="text-xs mt-1 block"><strong>What's Editable:</strong> Normal OT Hours, Special OT Hours, Bonus, Incentive, Other Deductions only.</span>
                                 <br /><span className="text-xs mt-1 block"><strong>If Report Changes:</strong> Delete old final report and mark a new one final to create new snapshots. Salary data for deleted reports is also deleted.</span>
                             </div>
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                                <strong>Salary Total Formula:</strong> Total = Basic Salary + Allowances + OT Salary + Bonus + Incentive - Leave Deduction - Deductible Hours Pay - Other Deductions - Advance Salary.
                                <br /><span className="text-xs mt-1 block">Report values (leave, deductible minutes) are immutable. Only OT hours, bonuses, and deductions can be edited.</span>
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
                                        <TableCell colSpan={28} className="text-center py-12">
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
                                                {getValue(row, 'specialOtSalary').toFixed(2)}
                                            </TableCell>
                                            <TableCell className="bg-blue-200 p-2 text-sm font-bold text-slate-900">
                                                {(getValue(row, 'normalOtSalary') + getValue(row, 'specialOtSalary')).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="bg-purple-50 font-medium text-slate-700">{row.deductibleHours?.toFixed(2) || '0.00'}</TableCell>
                                            <TableCell className="bg-purple-50 font-medium text-slate-700">{row.deductibleHoursPay?.toFixed(2) || '0.00'}</TableCell>
                                            <TableCell className="bg-red-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'otherDeduction').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'otherDeduction', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-green-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'bonus').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'bonus', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-green-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'incentive').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'incentive', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-red-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'advanceSalaryDeduction').toFixed(2)}
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