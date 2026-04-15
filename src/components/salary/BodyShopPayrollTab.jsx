import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';

// BodyShopPayrollTab.jsx — pure display component
// All values read directly from salaryData rows pre-calculated in SalaryReportDetail.jsx
// No calculations performed here
export default function BodyShopPayrollTab({ salaryData = [] }) {
    // Filter logic: only Bodyshop employees
    const bodyShopData = useMemo(() => {
        return salaryData.filter(row => row.department === 'Bodyshop');
    }, [salaryData]);

    // Helper to format currency values for display
    const formatCurrency = (val) => {
        return Number(val || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    // Calculate totals for the bottom row
    const totals = useMemo(() => {
        return bodyShopData.reduce((acc, row) => {
            acc.basic_salary += row.basic_salary || 0;
            acc.allowances += row.allowances || 0;
            acc.bonus += row.bonus || 0;
            acc.total_salary += row.total_salary || 0;
            acc.deductibleHours += row.deductibleHours || 0;
            acc.lopHoursAmount += row.deductibleHoursPay || 0;
            acc.full_absence_count += row.full_absence_count || 0;
            acc.lopDaysPrevAmount += row.extra_prev_month_lop_pay || 0;
            acc.lopDaysCurrentAmount += row.lopDaysCurrentPay || 0;
            acc.otherDeduction += row.otherDeduction || 0;
            acc.totalDeductions += row.totalDeductions || 0;
            acc.normalOtHours += row.normalOtHours || 0;
            acc.specialOtHours += row.specialOtHours || 0;
            acc.normalOtPay += row.normalOtSalary || 0;
            acc.specialOtPay += row.specialOtSalary || 0;
            acc.totalOtAmount += (row.normalOtSalary || 0) + (row.specialOtSalary || 0);
            acc.incentive += row.incentive || 0;
            acc.leaveSalary += row.salaryLeaveAmount || 0;
            acc.openLeaveSalary += row.open_leave_salary || 0;
            acc.variableSalary += row.variable_salary || 0;
            acc.otherAllowance += row.other_allowance || 0;
            acc.totalAdditions += row.totalAdditions || 0;
            acc.grossSalary += row.grossSalary || 0;
            acc.salaryAdvance += row.advanceSalaryDeduction || 0;
            acc.netPayable += row.total || 0;
            acc.wpsTransfer += row.wpsPay || 0;
            acc.balanceToPay += row.balance || 0;
            return acc;
        }, {
            basic_salary: 0, allowances: 0, bonus: 0, total_salary: 0,
            deductibleHours: 0, lopHoursAmount: 0, full_absence_count: 0,
            lopDaysPrevAmount: 0, lopDaysCurrentAmount: 0, otherDeduction: 0,
            totalDeductions: 0, normalOtHours: 0, specialOtHours: 0,
            normalOtPay: 0, specialOtPay: 0, totalOtAmount: 0,
            incentive: 0, leaveSalary: 0, openLeaveSalary: 0,
            variableSalary: 0, otherAllowance: 0, totalAdditions: 0,
            grossSalary: 0, salaryAdvance: 0, netPayable: 0,
            wpsTransfer: 0, balanceToPay: 0
        });
    }, [bodyShopData]);

    if (!bodyShopData.length) {
        return (
            <div className="py-20 text-center text-slate-500">
                <p>No Body Shop employees found in this report.</p>
            </div>
        );
    }

    return (
        <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                    <Table className="text-[11px]">
                        <TableHeader>
                            <TableRow className="border-b-0">
                                <TableHead colSpan={4} className="bg-slate-50"></TableHead>
                                <TableHead colSpan={4} className="bg-slate-50 border-x text-center font-bold text-slate-700">BASE SALARY</TableHead>
                                <TableHead colSpan={9} className="bg-rose-100 text-center font-bold text-rose-800 border-x">DEDUCTIONS</TableHead>
                                <TableHead colSpan={11} className="bg-emerald-100 text-center font-bold text-emerald-800 border-x">ADD-ONS</TableHead>
                                <TableHead colSpan={5} className="bg-slate-50 border-x"></TableHead>
                            </TableRow>
                            <TableRow className="bg-slate-50/50 border-b-2">
                                <TableHead className="font-bold py-3">S.No</TableHead>
                                <TableHead className="font-bold">Employee ID</TableHead>
                                <TableHead className="font-bold">Employee Name</TableHead>
                                <TableHead className="font-bold text-center">Working Hours</TableHead>
                                <TableHead className="font-bold text-right border-l">Basic</TableHead>
                                <TableHead className="font-bold text-right">Allowances</TableHead>
                                <TableHead className="font-bold text-right">Bonus</TableHead>
                                <TableHead className="font-bold text-right border-r">Total</TableHead>
                                <TableHead className="font-bold text-right">LOP Hours</TableHead>
                                <TableHead className="font-bold text-right">LOP Hours Att.</TableHead>
                                <TableHead className="font-bold text-right">LOP Hours Amt</TableHead>
                                <TableHead className="font-bold text-right">LOP Days (Prev)</TableHead>
                                <TableHead className="font-bold text-right font-medium">Amt (Prev)</TableHead>
                                <TableHead className="font-bold text-right">LOP Days (Curr)</TableHead>
                                <TableHead className="font-bold text-right font-medium">Amt (Curr)</TableHead>
                                <TableHead className="font-bold text-right">Other Ded.</TableHead>
                                <TableHead className="font-bold text-right border-r">Total Ded.</TableHead>
                                <TableHead className="font-bold text-right">OT Hrs (N)</TableHead>
                                <TableHead className="font-bold text-right">OT Hrs (S)</TableHead>
                                <TableHead className="font-bold text-right">OT Pay (N)</TableHead>
                                <TableHead className="font-bold text-right">OT Pay (S)</TableHead>
                                <TableHead className="font-bold text-right">Total OT</TableHead>
                                <TableHead className="font-bold text-right">Incentive</TableHead>
                                <TableHead className="font-bold text-right">Leave Sal.</TableHead>
                                <TableHead className="font-bold text-right italic">Open Leave</TableHead>
                                <TableHead className="font-bold text-right">Variable</TableHead>
                                <TableHead className="font-bold text-right text-[10px]">Other Allow.</TableHead>
                                <TableHead className="font-bold text-right border-r">Total Add.</TableHead>
                                <TableHead className="font-bold text-right">Gross Salary</TableHead>
                                <TableHead className="font-bold text-right text-rose-700">Advance</TableHead>
                                <TableHead className="font-bold text-right bg-indigo-50 font-extrabold text-indigo-900 border-x">Net Payable</TableHead>
                                <TableHead className="font-bold text-right text-green-700">WPS</TableHead>
                                <TableHead className="font-bold text-right text-amber-700">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bodyShopData.map((row, idx) => (
                                <TableRow key={row.hrms_id} className="hover:bg-slate-50 transition-colors">
                                    <TableCell className="py-2 text-slate-400">{idx + 1}</TableCell>
                                    <TableCell className="font-mono text-[10px] text-slate-600">{row.attendance_id || row.hrms_id}</TableCell>
                                    <TableCell className="font-medium whitespace-nowrap">{row.name}</TableCell>
                                    <TableCell className="text-center">{row.working_hours || 9}</TableCell>
                                    <TableCell className="text-right tabular-nums border-l">{formatCurrency(row.basic_salary)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.allowances)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.bonus)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-semibold border-r">{formatCurrency(row.total_salary)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{Number(row.deductibleHours || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{Number(row.lop_adjacent_weekly_off_count || 0).toFixed(0)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.deductibleHoursPay)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{Number(row.extra_prev_month_lop_days || 0).toFixed(0)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.extra_prev_month_lop_pay)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{Number(row.full_absence_count || 0).toFixed(1)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.lopDaysCurrentPay)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.otherDeduction)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-rose-800 border-r">{formatCurrency(row.totalDeductions)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{Number(row.normalOtHours || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{Number(row.specialOtHours || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.normalOtSalary)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.specialOtSalary)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-semibold">{formatCurrency((row.normalOtSalary || 0) + (row.specialOtSalary || 0))}</TableCell>
                                    <TableCell className="text-right tabular-nums text-emerald-600">{formatCurrency(row.incentive)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.salaryLeaveAmount)}</TableCell>
                                    <TableCell className="text-right tabular-nums italic text-slate-500">{formatCurrency(row.open_leave_salary)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.variable_salary)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.other_allowance)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-emerald-800 border-r">{formatCurrency(row.totalAdditions)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-semibold bg-slate-50/50">{formatCurrency(row.grossSalary)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.advanceSalaryDeduction)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-extrabold bg-indigo-50 text-indigo-900 border-x">{formatCurrency(row.total)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-green-700">{formatCurrency(row.wpsPay)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-amber-700">{formatCurrency(row.balance)}</TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-slate-100/80 font-bold border-t-2">
                                <TableCell colSpan={4} className="py-4 text-center text-[12px] uppercase tracking-wider">Grand Total</TableCell>
                                <TableCell className="text-right tabular-nums border-l">{formatCurrency(totals.basic_salary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.allowances)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.bonus)}</TableCell>
                                <TableCell className="text-right tabular-nums border-r">{formatCurrency(totals.total_salary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(totals.deductibleHours).toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums">—</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-900">{formatCurrency(totals.lopHoursAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums">—</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-900">{formatCurrency(totals.lopDaysPrevAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(totals.full_absence_count).toFixed(1)}</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-900">{formatCurrency(totals.lopDaysCurrentAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-900">{formatCurrency(totals.otherDeduction)}</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-950 border-r">{formatCurrency(totals.totalDeductions)}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(totals.normalOtHours).toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums">{Number(totals.specialOtHours).toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.normalOtPay)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.specialOtPay)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.totalOtAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums text-emerald-900">{formatCurrency(totals.incentive)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.leaveSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.openLeaveSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.variableSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.otherAllowance)}</TableCell>
                                <TableCell className="text-right tabular-nums text-emerald-950 border-r">{formatCurrency(totals.totalAdditions)}</TableCell>
                                <TableCell className="text-right tabular-nums bg-slate-200/50">{formatCurrency(totals.grossSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums text-rose-900">{formatCurrency(totals.salaryAdvance)}</TableCell>
                                <TableCell className="text-right tabular-nums bg-indigo-100 text-indigo-950 border-x">{formatCurrency(totals.netPayable)}</TableCell>
                                <TableCell className="text-right tabular-nums text-green-900">{formatCurrency(totals.wpsTransfer)}</TableCell>
                                <TableCell className="text-right tabular-nums text-amber-900">{formatCurrency(totals.balanceToPay)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
