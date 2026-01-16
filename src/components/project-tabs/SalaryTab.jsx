import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

export default function SalaryTab({ project }) {
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
        queryKey: ['results', project.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ 
            project_id: project.id,
            report_run_id: project.last_saved_report_id 
        }),
        enabled: !!project.id && !!project.last_saved_report_id
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';

    // Combine all data for each employee
    const salaryData = useMemo(() => {
        return employees.map(emp => {
            const salary = salaries.find(s => String(s.employee_id) === String(emp.hrms_id));
            const result = analysisResults.find(r => String(r.attendance_id) === String(emp.attendance_id));

            // Calculate half day not worked hours (half_absence_count * working_hours / 2)
            const halfDayNotWorkedHours = (result?.half_absence_count || 0) * ((salary?.working_hours || 9) / 2);

            // Placeholder values (formulas to be implemented)
            const leaveDays = result?.annual_leave_count || 0;
            const leavePay = 0; // To be calculated with formula
            const salaryLeaveDays = result?.sick_leave_count || 0;
            const salaryLeaveAmount = 0; // To be calculated with formula
            const otHours = 0; // To be calculated
            const otSalary = 0; // To be calculated
            const leaveHours = 0; // To be calculated
            const leaveHoursPay = 0; // To be calculated
            const otherDeduction = 0; // To be set manually
            const bonus = 0; // To be set manually
            const incentive = 0; // To be set manually
            const advanceSalaryDeduction = 0; // To be set manually
            const lopDeduction = 0; // To be calculated based on LOP days
            const deductibleMinutesAmount = 0; // To be calculated based on deductible minutes
            
            const totalSalary = (salary?.total_salary || 0) + leavePay + otSalary + leaveHoursPay + bonus + incentive 
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
                working_days: result?.working_days || 0,
                present_days: result?.present_days || 0,
                full_absence_count: result?.full_absence_count || 0,
                half_absence_count: result?.half_absence_count || 0,
                halfDayNotWorkedHours,
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
                deductibleMinutesAmount,
                total: totalSalary,
                wpsPay,
                balance
            };
        });
    }, [employees, salaries, analysisResults]);

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

    if (!project.last_saved_report_id) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No saved report available. Please run analysis first.</p>
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
                    <div className="bg-white rounded-lg p-4 mb-4">
                        <p className="text-sm text-slate-600">
                            <strong>Note:</strong> Salary calculations are based on the latest saved report. 
                            Data from salary master is read-only. Formulas for deductions will be applied automatically.
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="whitespace-nowrap">HRMS ID</TableHead>
                                    <TableHead className="whitespace-nowrap">Attendance ID</TableHead>
                                    <TableHead className="whitespace-nowrap">Name</TableHead>
                                    <TableHead className="whitespace-nowrap">Department</TableHead>
                                    <TableHead className="whitespace-nowrap">Company</TableHead>
                                    <TableHead className="whitespace-nowrap">Working Hours/Day</TableHead>
                                    <TableHead className="whitespace-nowrap">Deduction/Minute</TableHead>
                                    <TableHead className="whitespace-nowrap">Basic Salary</TableHead>
                                    <TableHead className="whitespace-nowrap">Total Salary (Master)</TableHead>
                                    <TableHead className="whitespace-nowrap">Working Days</TableHead>
                                    <TableHead className="whitespace-nowrap">Present Days</TableHead>
                                    <TableHead className="whitespace-nowrap">LOP Days</TableHead>
                                    <TableHead className="whitespace-nowrap">Half Days</TableHead>
                                    <TableHead className="whitespace-nowrap">Half Day Not Worked Hours</TableHead>
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
                                {salaryData.map((row) => (
                                    <TableRow key={row.hrms_id}>
                                        <TableCell>{row.hrms_id}</TableCell>
                                        <TableCell>{row.attendance_id}</TableCell>
                                        <TableCell className="font-medium">{row.name}</TableCell>
                                        <TableCell>{row.department}</TableCell>
                                        <TableCell>{row.company}</TableCell>
                                        <TableCell>{row.working_hours}</TableCell>
                                        <TableCell>{row.deduction_per_minute.toFixed(4)}</TableCell>
                                        <TableCell>{row.basic_salary.toFixed(2)}</TableCell>
                                        <TableCell className="font-semibold">{row.total_salary.toFixed(2)}</TableCell>
                                        <TableCell>{row.working_days}</TableCell>
                                        <TableCell>{row.present_days}</TableCell>
                                        <TableCell className="text-red-600 font-semibold">{row.full_absence_count}</TableCell>
                                        <TableCell>{row.half_absence_count}</TableCell>
                                        <TableCell className="text-amber-600 font-medium">{row.halfDayNotWorkedHours.toFixed(2)}</TableCell>
                                        <TableCell className="bg-amber-50">{row.leaveDays}</TableCell>
                                        <TableCell className="bg-amber-50">{row.leavePay.toFixed(2)}</TableCell>
                                        <TableCell className="bg-green-50">{row.salaryLeaveDays}</TableCell>
                                        <TableCell className="bg-green-50">{row.salaryLeaveAmount.toFixed(2)}</TableCell>
                                        <TableCell className="bg-blue-50">{row.otHours.toFixed(2)}</TableCell>
                                        <TableCell className="bg-blue-50">{row.otSalary.toFixed(2)}</TableCell>
                                        <TableCell className="bg-purple-50">{row.leaveHours.toFixed(2)}</TableCell>
                                        <TableCell className="bg-purple-50">{row.leaveHoursPay.toFixed(2)}</TableCell>
                                        <TableCell className="bg-red-50">{row.otherDeduction.toFixed(2)}</TableCell>
                                        <TableCell className="bg-green-50">{row.bonus.toFixed(2)}</TableCell>
                                        <TableCell className="bg-green-50">{row.incentive.toFixed(2)}</TableCell>
                                        <TableCell className="bg-red-50">{row.advanceSalaryDeduction.toFixed(2)}</TableCell>
                                        <TableCell className="bg-indigo-100 font-bold">{row.total.toFixed(2)}</TableCell>
                                        <TableCell className="bg-indigo-100 font-bold">{row.wpsPay.toFixed(2)}</TableCell>
                                        <TableCell className="bg-slate-100">{row.balance.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}