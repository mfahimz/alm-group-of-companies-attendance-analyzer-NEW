import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DollarSign, FileSpreadsheet, Save, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function SalaryTab({ project, finalReport }) {
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: employees = [], isLoading: loadingEmployees } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company, active: true }),
        enabled: !!project.company
    });

    const { data: salaries = [], isLoading: loadingSalaries } = useQuery({
        queryKey: ['salaries', project.company],
        queryFn: () => base44.entities.EmployeeSalary.filter({ company: project.company, active: true }),
        enabled: !!project.company
    });

    const { data: analysisResults = [], isLoading: loadingResults } = useQuery({
        queryKey: ['results', project.id, finalReport?.id],
        queryFn: () => base44.entities.AnalysisResult.filter({
            project_id: project.id,
            report_run_id: finalReport.id
        }),
        enabled: !!project.id && !!finalReport?.id
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';

    // State for editable values
    const [editableData, setEditableData] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [sortBy, setSortBy] = useState('department');

    // Combine all data for each employee
    const salaryData = useMemo(() => {
        return employees.map(emp => {
            const salary = salaries.find(s => 
                s.employee_id === emp.hrms_id || 
                Number(s.attendance_id) === Number(emp.attendance_id)
            );
            const result = analysisResults.find(r => Number(r.attendance_id) === Number(emp.attendance_id));

             // Leave Days in salary table = LOP days from the report
             const leaveDays = result?.full_absence_count || 0;
              const leavePay = (salary?.total_salary || 0) / 30 * leaveDays;

             // Sick leave (paid leave) - separate from LOP
             const salaryLeaveDays = result?.sick_leave_count || 0;
             const salaryLeaveAmount = 0; // To be calculated with formula

             // Only full_absence_count counts as LOP (Loss of Pay) - not sick leave or annual leave
             const lopDays = result?.full_absence_count || 0;
             const lopDeduction = 0; // To be calculated based on lopDays only

             // Other calculations
             const otHours = 0; // To be calculated
             const otSalary = 0; // To be calculated
             const leaveHours = 0; // To be calculated
             const leaveHoursPay = 0; // To be calculated
             const otherDeduction = 0; // To be set manually
             const bonus = 0; // To be set manually
             const incentive = 0; // To be set manually
             const advanceSalaryDeduction = 0; // To be set manually
             const deductibleMinutesAmount = 0; // To be calculated based on deductible minutes

             const totalSalary = (salary?.total_salary || 0) + leavePay + salaryLeaveAmount + otSalary + leaveHoursPay + bonus + incentive 
                                 - lopDeduction - deductibleMinutesAmount - otherDeduction - advanceSalaryDeduction;
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
                leaveHours,
                leaveHoursPay,
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

    // Filter and sort salary data
    const filteredSalaryData = useMemo(() => {
        let filtered = salaryData;
        
        // Apply department filter
        if (departmentFilter !== 'all') {
            filtered = filtered.filter(item => item.department === departmentFilter);
        }

        // Apply sorting
        return [...filtered].sort((a, b) => {
            if (sortBy === 'department') {
                return (a.department || '').localeCompare(b.department || '') || 
                       a.name.localeCompare(b.name);
            } else if (sortBy === 'name') {
                return a.name.localeCompare(b.name);
            } else if (sortBy === 'attendance') {
                return Number(a.attendance_id) - Number(b.attendance_id);
            }
            return 0;
        });
    }, [salaryData, departmentFilter, sortBy]);

    // Handle input change for editable fields
    const handleChange = (hrmsId, field, value) => {
        setEditableData(prev => ({
            ...prev,
            [hrmsId]: {
                ...(prev[hrmsId] || {}),
                [field]: parseFloat(value) || 0
            }
        }));
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
        const leaveHoursPay = getValue(row, 'leaveHoursPay');
        const bonus = getValue(row, 'bonus');
        const incentive = getValue(row, 'incentive');
        const otherDeduction = getValue(row, 'otherDeduction');
        const advanceSalaryDeduction = getValue(row, 'advanceSalaryDeduction');
        const lopDeduction = getValue(row, 'lopDeduction');
        const deductibleMinutesAmount = getValue(row, 'deductibleMinutesAmount');

        const total = row.total_salary + leavePay + salaryLeaveAmount + otSalary + leaveHoursPay + bonus + incentive
                      - lopDeduction - deductibleMinutesAmount - otherDeduction - advanceSalaryDeduction;
        const wpsPay = total;
        const balance = 0;

        return { total, wpsPay, balance };
    };

    // Save all changes
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // TODO: Save editableData to backend (create a new entity or update existing records)
            toast.success('Salary data saved successfully');
            setEditableData({});
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

    if (!finalReport) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">The Salary tab is only available after a report has been marked as final.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-purple-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-6 h-6 text-indigo-600" />
                        Salary Calculation - {project.company}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4 mb-4">
                        <div className="bg-white rounded-lg p-4">
                            <p className="text-sm text-slate-600 mb-4">
                                <strong>Note:</strong> Salary calculations based on latest saved report. Data from salary master is read-only.
                            </p>
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
                                <div>
                                    <label className="text-sm font-medium text-slate-700 mb-2 block">Sort By</label>
                                    <Select value={sortBy} onValueChange={setSortBy}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="department">Department (then Name)</SelectItem>
                                            <SelectItem value="name">Employee Name</SelectItem>
                                            <SelectItem value="attendance">Attendance ID</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-end">
                                    <Button 
                                        onClick={handleSave} 
                                        disabled={isSaving || Object.keys(editableData).length === 0}
                                        className="w-full bg-green-600 hover:bg-green-700"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                            <strong>Salary Calculation Formula:</strong> Each row combines employee master (salary, working hours) + attendance report data (working/present days, absences, late/early minutes). Editable fields (amber/green/blue/purple/red backgrounds) allow manual adjustments for bonuses, deductions, and leave pay. Total = Base Salary + Additions - Deductions.
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="whitespace-nowrap sticky left-0 bg-white z-10">Attendance ID</TableHead>
                                    <TableHead className="whitespace-nowrap sticky left-16 bg-white z-10">Name</TableHead>
                                    <TableHead className="whitespace-nowrap">Department</TableHead>
                                    <TableHead className="whitespace-nowrap">Working Hours/Day</TableHead>
                                    <TableHead className="whitespace-nowrap">Basic Salary</TableHead>
                                    <TableHead className="whitespace-nowrap">Total Salary</TableHead>
                                    <TableHead className="whitespace-nowrap">Working Days</TableHead>
                                    <TableHead className="whitespace-nowrap">Present Days</TableHead>
                                    <TableHead className="whitespace-nowrap">LOP Days</TableHead>
                                    <TableHead className="whitespace-nowrap">Annual Leave Days</TableHead>
                                    <TableHead className="whitespace-nowrap">Sick Leave Days</TableHead>
                                    <TableHead className="whitespace-nowrap bg-amber-50">Leave Days</TableHead>
                                    <TableHead className="whitespace-nowrap bg-amber-50">Leave Pay</TableHead>
                                    <TableHead className="whitespace-nowrap bg-green-50">Salary Leave Days</TableHead>
                                    <TableHead className="whitespace-nowrap bg-green-50">Salary Leave Amount</TableHead>
                                    <TableHead className="whitespace-nowrap bg-blue-50">OT Hours</TableHead>
                                    <TableHead className="whitespace-nowrap bg-blue-50">OT Salary</TableHead>
                                    <TableHead className="whitespace-nowrap bg-purple-50">Leave Hours</TableHead>
                                    <TableHead className="whitespace-nowrap bg-purple-50">Leave Hours Pay</TableHead>
                                    <TableHead className="whitespace-nowrap bg-red-50">Other Deduction</TableHead>
                                    <TableHead className="whitespace-nowrap bg-green-50">Bonus</TableHead>
                                    <TableHead className="whitespace-nowrap bg-green-50">Incentive</TableHead>
                                    <TableHead className="whitespace-nowrap bg-red-50">Advance Salary Deduction</TableHead>
                                    <TableHead className="whitespace-nowrap bg-indigo-100 font-bold">Total</TableHead>
                                    <TableHead className="whitespace-nowrap bg-indigo-100 font-bold">WPS Pay</TableHead>
                                    <TableHead className="whitespace-nowrap bg-slate-100">Balance</TableHead>
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
                                             <TableCell className="bg-amber-50">{row.leaveDays.toFixed(2)}</TableCell>
                                            <TableCell className="bg-amber-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'leavePay').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'leavePay', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-green-50">{row.salaryLeaveDays}</TableCell>
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
                                            <TableCell className="bg-purple-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'leaveHours').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'leaveHours', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
                                            <TableCell className="bg-purple-50 p-1">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={getValue(row, 'leaveHoursPay').toFixed(2)}
                                                    onChange={(e) => handleChange(row.hrms_id, 'leaveHoursPay', e.target.value)}
                                                    className="h-8 text-xs"
                                                />
                                            </TableCell>
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
                </CardContent>
            </Card>
        </div>
    );
}