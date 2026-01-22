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

    const { data: analysisResults = [], isLoading: loadingResults } = useQuery({
        queryKey: ['results', project.id, finalReport?.id],
        queryFn: () => base44.entities.AnalysisResult.filter({
            project_id: project.id,
            report_run_id: finalReport.id
        }),
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

    // Combine all data for each employee
    const salaryData = useMemo(() => {
        // Only apply leave hours pay calculation for Al Maraghi Auto Repairs
        const isAlMaraghi = project.company === 'Al Maraghi Auto Repairs';

        return employees.map(emp => {
            const salary = salaries.find(s => 
                s.employee_id === emp.hrms_id || 
                Number(s.attendance_id) === Number(emp.attendance_id)
            );
            const result = analysisResults.find(r => Number(r.attendance_id) === Number(emp.attendance_id));

             // Leave Days = Annual Leave Days + LOP Days (NOT sick leave)
                      const annualLeaveDays = result?.annual_leave_count || 0;
                      const lopDays = result?.full_absence_count || 0;
                      const leaveDays = annualLeaveDays + lopDays;
                      const totalSalaryAmount = salary?.total_salary || 0;
                      const workingHours = salary?.working_hours || 9;

                      // Leave Pay = (Total Salary / 30) × Leave Days
                      const leavePay = (totalSalaryAmount / 30) * leaveDays;

                      // Salary Leave Days = Annual Leave Days (from exceptions)
                      const salaryLeaveDays = annualLeaveDays;

                      // Salary Leave Amount calculation based on working hours
                      let salaryLeaveAmount = 0;
                      if (salaryLeaveDays > 0) {
                          if (workingHours === 8) {
                              // 8-hour: (Total Salary / 30) × Salary Leave Days
                              salaryLeaveAmount = (totalSalaryAmount / 30) * salaryLeaveDays;
                          } else if (workingHours === 9) {
                              // 9-hour: ((Total Salary × 0.8767) / 30) × Salary Leave Days
                              const adjustedSalary = totalSalaryAmount * 0.8767;
                              salaryLeaveAmount = (adjustedSalary / 30) * salaryLeaveDays;
                          }
                      }

                      // Deductible Hours = deductible_minutes ÷ 60
                      const deductibleMinutes = result?.deductible_minutes || 0;
                      const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;
                      const deductibleHoursPay = 0;

                      // Net Deduction = Leave Pay - Salary Leave Amount
                      const lopDeduction = Math.max(0, leavePay - salaryLeaveAmount);

             // Other calculations
             const otHours = 0; // To be calculated
             const otSalary = 0; // To be calculated
             const otherDeduction = 0; // To be set manually
             const bonus = 0; // To be set manually
             const incentive = 0; // To be set manually
             const advanceSalaryDeduction = 0; // To be set manually
             const deductibleMinutesAmount = 0; // To be calculated based on deductible minutes

             // Total = Total Salary - (Leave Pay - Salary Leave Amount)
             const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);
             const totalSalary = totalSalaryAmount + otSalary + bonus + incentive 
                                 - netDeduction - deductibleMinutesAmount - otherDeduction - advanceSalaryDeduction;
             const wpsPay = totalSalary; // WPS is typically the total
             const balance = 0; // Balance = Total - WPS Pay

            return {
                hrms_id: emp.hrms_id,
                attendance_id: emp.attendance_id,
                name: emp.name,
                department: emp.department,
                company: emp.company,
                // From salary master - ALL columns
                employee_id: salary?.employee_id || emp.hrms_id,
                basic_salary: salary?.basic_salary || 0,
                allowances: salary?.allowances || '{}',
                total_salary: salary?.total_salary || 0,
                working_hours: salary?.working_hours || 9,
                deduction_per_minute: salary?.deduction_per_minute || 0,
                // Analysis results
                working_days: 30,
                present_days: result?.present_days || 0,
                full_absence_count: result?.full_absence_count || 0, // LOP days only
                annual_leave_count: result?.annual_leave_count || 0, // Separate from LOP
                sick_leave_count: result?.sick_leave_count || 0, // Separate from LOP
                late_minutes: result?.late_minutes || 0,
                early_checkout_minutes: result?.early_checkout_minutes || 0,
                other_minutes: result?.other_minutes || 0,
                approved_minutes: result?.approved_minutes || 0,
                grace_minutes: result?.grace_minutes || 0,
                // Calculated fields (placeholders)
                leaveDays,
                leavePay,
                salaryLeaveDays,
                salaryLeaveAmount,
                otHours,
                otSalary,
                deductibleHours,
                deductibleHoursPay,
                otherDeduction,
                bonus,
                incentive,
                advanceSalaryDeduction,
                lopDeduction,
                lopDays,
                deductibleMinutesAmount,
                total: totalSalary,
                wpsPay,
                balance
            };
        });
    }, [employees, salaries, analysisResults]);

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

    // Handle input change for editable fields
    const handleChange = (hrmsId, field, value) => {
        const numValue = parseFloat(value) || 0;
        const updatedEdits = {
            [hrmsId]: {
                ...(editableData[hrmsId] || {}),
                [field]: numValue
            }
        };

        // If leaveDays or salaryLeaveDays changed, immediately recalculate dependents
        if (field === 'leaveDays' || field === 'salaryLeaveDays') {
            const recalculated = recalculateDependentFields(updatedEdits);
            setEditableData(prev => ({
                ...prev,
                ...recalculated
            }));
        } else {
            setEditableData(prev => ({
                ...prev,
                [hrmsId]: updatedEdits[hrmsId]
            }));
        }
    };

    // Get value (either from editableData or original data)
    const getValue = (row, field) => {
        return editableData[row.hrms_id]?.[field] ?? row[field];
    };

    // Calculate totals dynamically
    const calculateTotals = (row) => {
        const leavePay = getValue(row, 'leavePay');
        const salaryLeaveAmount = getValue(row, 'salaryLeaveAmount');
        const otSalary = getValue(row, 'otSalary');
        const bonus = getValue(row, 'bonus');
        const incentive = getValue(row, 'incentive');
        const otherDeduction = getValue(row, 'otherDeduction');
        const advanceSalaryDeduction = getValue(row, 'advanceSalaryDeduction');
        const lopDeduction = getValue(row, 'lopDeduction');
        const deductibleMinutesAmount = getValue(row, 'deductibleMinutesAmount');

        const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);
              const total = row.total_salary + otSalary + bonus + incentive
                      - netDeduction - deductibleMinutesAmount - otherDeduction - advanceSalaryDeduction;
        const wpsPay = total;
        const balance = 0;

        return { total, wpsPay, balance };
    };

    // Recalculate dependent fields when leaveDays or salaryLeaveDays change
    const recalculateDependentFields = (dataToRecalculate) => {
        const recalculated = { ...dataToRecalculate };

        Object.keys(recalculated).forEach(hrmsId => {
            const row = dataToDisplay.find(r => r.hrms_id === hrmsId);
            if (!row) return;

            const employeeEdits = recalculated[hrmsId];
            const totalSalary = row.total_salary;
            const workingHours = row.working_hours;

            // If leaveDays was edited, recalculate leavePay based on edited leaveDays
            if ('leaveDays' in employeeEdits) {
                const leaveDays = employeeEdits.leaveDays;
                const newLeavePay = (totalSalary / 30) * leaveDays;
                recalculated[hrmsId].leavePay = newLeavePay;
            }

            // If salaryLeaveDays was edited, recalculate salaryLeaveAmount
            if ('salaryLeaveDays' in employeeEdits) {
                const salaryLeaveDays = employeeEdits.salaryLeaveDays;
                let newSalaryLeaveAmount = 0;
                if (salaryLeaveDays > 0) {
                    if (workingHours === 8) {
                        newSalaryLeaveAmount = (totalSalary / 30) * salaryLeaveDays;
                    } else if (workingHours === 9) {
                        const adjustedSalary = totalSalary * 0.8767;
                        newSalaryLeaveAmount = (adjustedSalary / 30) * salaryLeaveDays;
                    }
                }
                recalculated[hrmsId].salaryLeaveAmount = newSalaryLeaveAmount;
            }
        });

        return recalculated;
    };

    // Calculate salaries from finalized report
    const handleCalculateSalaries = async () => {
        if (!finalReport?.id) {
            toast.error('No finalized report found');
            return;
        }

        setIsCalculating(true);
        try {
            const response = await base44.functions.invoke('calculateSalaries', {
                project_id: project.id,
                report_run_id: finalReport.id
            });

            if (!response.data.success) {
                throw new Error(response.data.error || 'Failed to calculate salaries');
            }

            // Set calculated data but preserve any existing edits
            setCalculatedData(response.data.data);
            // Keep editableData intact so user edits are preserved
            toast.success('Salaries calculated successfully');
        } catch (error) {
            toast.error('Failed to calculate salaries: ' + error.message);
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

    if (loadingEmployees || loadingSalaries || loadingResults) {
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
                    {filteredSalaryData.length === 0 ? (
                        <div className="text-center py-12">
                            <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-600 text-lg font-medium">No Employees Found</p>
                            <p className="text-slate-500 text-sm mt-2">Add employees to this company first to see salary calculations.</p>
                        </div>
                    ) : (
                        <>
                            {!finalReport && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
                                    <strong>⚠️ No Final Report:</strong> Finalize the report first, then click "Calculate Salary" to populate salary calculations.
                                </div>
                            )}
                            {finalReport && !calculatedData && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
                                    <strong>ℹ️ Ready to Calculate:</strong> Click "Calculate Salary" button to fetch finalized report data and calculate salaries.
                                </div>
                            )}
                            {calculatedData && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-800">
                                    <strong>✓ Calculated:</strong> Salary data has been calculated from the finalized report. Edit values as needed and click "Save Changes" to persist.
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
                                        onClick={handleCalculateSalaries} 
                                        disabled={isCalculating || !finalReport}
                                        className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <DollarSign className="w-4 h-4 mr-2" />
                                        {isCalculating ? 'Calculating...' : 'Calculate'}
                                    </Button>
                                    <Button 
                                        onClick={handleSave} 
                                        disabled={isSaving || Object.keys(editableData).length === 0 || !calculatedData}
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
                                    {hasActiveFilters && ` (${dataToDisplay.length - filteredSalaryData.length} hidden by filters)`}
                                </p>
                            </div>

                            {/* Formula Info */}
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                                <strong>Salary Calculation Formula:</strong> Each row combines employee master (salary, working hours) + attendance report data (working/present days, absences, late/early minutes). Editable fields (amber/green/blue/purple/red backgrounds) allow manual adjustments for bonuses, deductions, and leave pay. Total = Base Salary + Additions - Deductions.
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
                                    <SortableTableHead sortKey="otHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-50">OT Hours</SortableTableHead>
                                    <SortableTableHead sortKey="otSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-50">OT Salary</SortableTableHead>
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
                                {filteredSalaryData.map((row) => {
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
                                             <TableCell className="bg-amber-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'leaveDays').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'leaveDays', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                             </TableCell>
                                             <TableCell className="bg-amber-100 p-2 text-sm font-medium text-slate-700">
                                                {getValue(row, 'leavePay').toFixed(2)}
                                             </TableCell>
                                             <TableCell className="bg-green-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'salaryLeaveDays').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'salaryLeaveDays', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                             </TableCell>
                                            <TableCell className="bg-green-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'salaryLeaveAmount').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'salaryLeaveAmount', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-blue-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'otHours').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'otHours', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-blue-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'otSalary').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'otSalary', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
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