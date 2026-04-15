import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';

// BranchPayrollTab.jsx — pure display component
// All values read directly from salaryData rows pre-calculated in SalaryReportDetail.jsx
// No calculations performed here
export default function BranchPayrollTab({ salaryData = [] }) {
    // Filter logic: all non-Bodyshop employees
    const branchData = useMemo(() => {
        return salaryData.filter(row => row.department !== 'Bodyshop');
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
        return branchData.reduce((acc, row) => {
            acc.totalSalary += row.total_salary || 0;
            acc.lopHoursAmount += row.deductibleHoursPay || 0;
            acc.lopDaysPrevAmount += row.extra_prev_month_lop_pay || 0;
            acc.lopDaysCurrentAmount += row.lopDaysCurrentPay || 0;
            acc.otherDeduction += row.otherDeduction || 0;
            acc.totalDeductions += row.totalDeductions || 0;
            acc.normalOtPay += row.normalOtSalary || 0;
            acc.specialOtPay += row.specialOtSalary || 0;
            acc.totalOtAmount += (row.normalOtSalary || 0) + (row.specialOtSalary || 0);
            acc.leaveSalary += row.salaryLeaveAmount || 0;
            acc.incentive += row.incentive || 0;
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
            totalSalary: 0, lopHoursAmount: 0, lopDaysPrevAmount: 0, lopDaysCurrentAmount: 0,
            otherDeduction: 0, totalDeductions: 0, normalOtPay: 0, specialOtPay: 0,
            totalOtAmount: 0, leaveSalary: 0, incentive: 0, openLeaveSalary: 0,
            variableSalary: 0, otherAllowance: 0, totalAdditions: 0, grossSalary: 0,
            salaryAdvance: 0, netPayable: 0, wpsTransfer: 0, balanceToPay: 0
        });
    }, [branchData]);

    if (!branchData.length) {
        return (
            <div className="py-20 text-center text-slate-500">
                <p>No Branch employees found in this report.</p>
            </div>
        );
    }

    return (
        <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
                <div className="overflow-x-auto w-full">
                    <Table className="text-xs">
                        <TableHeader className="bg-slate-50">
                            <TableRow className="border-b-2">
                                <TableHead className="font-bold py-3">S.No</TableHead>
                                <TableHead className="font-bold">Employee ID</TableHead>
                                <TableHead className="font-bold">Employee Name</TableHead>
                                <TableHead className="font-bold text-center">Actual Working Hours</TableHead>
                                <TableHead className="font-bold text-right">Total Salary</TableHead>
                                <TableHead className="font-bold text-right">LOP Hrs Amt</TableHead>
                                <TableHead className="font-bold text-right">LOP Days (Prev)</TableHead>
                                <TableHead className="font-bold text-right">LOP Days (Curr)</TableHead>
                                <TableHead className="font-bold text-right">Other Ded.</TableHead>
                                <TableHead className="font-bold text-right bg-rose-50/50">Total Ded.</TableHead>
                                <TableHead className="font-bold text-right">Normal OT</TableHead>
                                <TableHead className="font-bold text-right">Special OT</TableHead>
                                <TableHead className="font-bold text-right">Total OT</TableHead>
                                <TableHead className="font-bold text-right">Leave Amt</TableHead>
                                <TableHead className="font-bold text-right">Incentive</TableHead>
                                <TableHead className="font-bold text-right">Open Leave</TableHead>
                                <TableHead className="font-bold text-right">Variable</TableHead>
                                <TableHead className="font-bold text-right">Other Allow.</TableHead>
                                <TableHead className="font-bold text-right bg-emerald-50/50">Total Add.</TableHead>
                                <TableHead className="font-bold text-right bg-slate-100">Gross Salary</TableHead>
                                <TableHead className="font-bold text-right">Advance</TableHead>
                                <TableHead className="font-bold text-right bg-indigo-50 font-extrabold text-slate-900 border-x">Net Payable</TableHead>
                                <TableHead className="font-bold text-right text-green-700">WPS</TableHead>
                                <TableHead className="font-bold text-right text-amber-700">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {branchData.map((row, idx) => (
                                <TableRow key={row.hrms_id} className="hover:bg-slate-50 transition-colors">
                                    <TableCell className="py-2 text-slate-400">{idx + 1}</TableCell>
                                    <TableCell className="font-mono text-[10px] text-slate-600">{row.attendance_id || row.hrms_id}</TableCell>
                                    <TableCell className="font-medium whitespace-nowrap">{row.name}</TableCell>
                                    <TableCell className="text-center">{row.working_hours || 9}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.total_salary)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.deductibleHoursPay)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.extra_prev_month_lop_pay)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.lopDaysCurrentPay)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.otherDeduction)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold bg-rose-50/30 text-rose-700">{formatCurrency(row.totalDeductions)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.normalOtSalary)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.specialOtSalary)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-semibold">{formatCurrency((row.normalOtSalary || 0) + (row.specialOtSalary || 0))}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.salaryLeaveAmount)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.incentive)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.open_leave_salary)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.variable_salary)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatCurrency(row.other_allowance)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold bg-emerald-50/30 text-emerald-700">{formatCurrency(row.totalAdditions)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold bg-slate-50/50">{formatCurrency(row.grossSalary)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-rose-600">{formatCurrency(row.advanceSalaryDeduction)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-extrabold bg-indigo-50/30 text-slate-900 border-x">{formatCurrency(row.total)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-green-700">{formatCurrency(row.wpsPay)}</TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-amber-700">{formatCurrency(row.balance)}</TableCell>
                                </TableRow>
                            ))}
                            <TableRow className="bg-slate-100/80 font-bold border-t-2">
                                <TableCell colSpan={4} className="py-4 text-center text-sm uppercase tracking-wider">Grand Total</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.totalSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.lopHoursAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.lopDaysPrevAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.lopDaysCurrentAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.otherDeduction)}</TableCell>
                                <TableCell className="text-right tabular-nums bg-rose-100/50 text-rose-800">{formatCurrency(totals.totalDeductions)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.normalOtPay)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.specialOtPay)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.totalOtAmount)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.leaveSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.incentive)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.openLeaveSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.variableSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.otherAllowance)}</TableCell>
                                <TableCell className="text-right tabular-nums bg-emerald-100/50 text-emerald-800">{formatCurrency(totals.totalAdditions)}</TableCell>
                                <TableCell className="text-right tabular-nums bg-slate-200/50">{formatCurrency(totals.grossSalary)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(totals.salaryAdvance)}</TableCell>
                                <TableCell className="text-right tabular-nums bg-indigo-100/30 text-slate-900 border-x">{formatCurrency(totals.netPayable)}</TableCell>
                                <TableCell className="text-right tabular-nums text-green-800">{formatCurrency(totals.wpsTransfer)}</TableCell>
                                <TableCell className="text-right tabular-nums text-amber-800">{formatCurrency(totals.balanceToPay)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
