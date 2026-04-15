// BranchPayrollTab.jsx
// Full interactive payroll table for Branch employees (department !== 'Bodyshop')
// Exact replica of Salary Report table — all state and logic passed as props
// No internal calculations or entity fetches — pure rendering component

import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, Save, X } from 'lucide-react';

export default function BranchPayrollTab({
    salaryData = [],
    adminEditMode = false,
    setAdminEditMode,
    editableData = {},
    handleChange,
    handleSave,
    getValue,
    calculateTotals,
    activeHolds = {},
    handleToggleHold,
    canManageHolds = false,
    verifiedEmployees = {},
    toggleVerification,
    isAdmin = false,
    userRole = ''
}) {
    // Filter logic: all non-Bodyshop employees
    const branchData = useMemo(() => {
        return salaryData.filter(row => row.department !== 'Bodyshop');
    }, [salaryData]);

    // Grand total calculation
    const grandTotals = useMemo(() => {
        return branchData.reduce((acc, row) => {
            const { total, wpsPay, balance, netAdditions, netDeductions, normalOtSalary, specialOtSalary, totalOtSalary, effectiveOtOrIncentive } = calculateTotals(row);
            
            acc.basic += Number(row.basic_salary || 0);
            acc.allowances += Number(row.allowances || 0);
            acc.bonus += Number(getValue(row, 'bonus') || 0);
            acc.totalSalary += Number(row.total_salary || 0);
            
            acc.lvPay += Number(row.leavePay || 0);
            acc.lvDed += Number(row.netDeduction || 0);
            acc.dedPay += Number(row.deductibleHoursPay || 0);
            acc.otherDed += Number(getValue(row, 'otherDeduction') || 0);
            acc.advance += Number(getValue(row, 'advanceSalaryDeduction') || 0);
            acc.netDed += netDeductions;
            
            acc.otPayN += normalOtSalary;
            acc.otPayS += specialOtSalary;
            acc.incentive += Number(getValue(row, 'incentive') || 0);
            acc.lvSalary += Number(row.salaryLeaveAmount || 0);
            acc.openLv += Number(getValue(row, 'open_leave_salary') || 0);
            acc.variable += Number(getValue(row, 'variable_salary') || 0);
            acc.netAdd += netAdditions;
            
            acc.total += total;
            acc.wps += wpsPay;
            acc.balance += balance;
            
            return acc;
        }, {
            basic: 0, allowances: 0, bonus: 0, totalSalary: 0,
            lvPay: 0, lvDed: 0, dedPay: 0, otherDed: 0, advance: 0, netDed: 0,
            otPayN: 0, otPayS: 0, incentive: 0, lvSalary: 0, openLv: 0, variable: 0, netAdd: 0,
            total: 0, wps: 0, balance: 0
        });
    }, [branchData, calculateTotals, getValue]);

    if (branchData.length === 0) {
        return (
            <div className="py-20 text-center text-slate-500 bg-white rounded-lg border">
                <p>No Branch employees found in this report.</p>
            </div>
        );
    }

    const cellBase = "px-2 py-1.5 align-middle text-xs tabular-nums border-r border-slate-100";
    const headerBase = "px-2 py-1 align-middle text-[10px] font-bold uppercase tracking-wider border-r border-slate-200";

    return (
        <div className="space-y-4">
            {/* Edit Mode Toolbar */}
            {adminEditMode && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 p-2 rounded-lg">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                        <span className="text-sm font-medium text-amber-800">Edit Mode Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            onClick={handleSave}
                            className="bg-emerald-600 hover:bg-emerald-700 h-8"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAdminEditMode(false)}
                            className="border-amber-200 bg-white hover:bg-amber-100 text-amber-800 h-8"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            <Card className="border shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                        <table className="w-full min-w-max text-xs border-collapse">
                            <thead className="sticky top-0 z-20">
                                {/* Group Headers */}
                                <tr className="bg-slate-50 border-b border-slate-300">
                                    <th colSpan={6} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 border-r border-slate-300 sticky left-0 z-30">Employee Info</th>
                                    <th colSpan={4} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border-r border-slate-300">Base Salary</th>
                                    <th colSpan={8} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border-r border-slate-300">Deductions</th>
                                    <th colSpan={9} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border-r border-slate-300">Additions</th>
                                    <th colSpan={6} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border-r border-slate-300">Final</th>
                                </tr>
                                {/* Column Headers */}
                                <tr className="bg-slate-50 border-b border-slate-300">
                                    <th className="w-8 bg-slate-100 px-1 sticky left-0 z-30 border-r border-slate-200">✓</th>
                                    <th className="w-10 bg-slate-100 px-1 sticky left-[32px] z-30 border-r border-slate-200 text-center">S.No</th>
                                    <th className="px-2 py-2 bg-slate-100 sticky left-[60px] z-30 border-r border-slate-200 text-left">Emp ID</th>
                                    <th className="px-2 py-2 bg-slate-100 sticky left-[110px] z-30 border-r border-slate-200 text-left min-w-[150px]">Employee Name</th>
                                    <th className="px-2 py-2 bg-slate-50 border-r border-slate-200 text-left">Dept</th>
                                    <th className="px-2 py-2 bg-slate-50 border-r border-slate-300 text-center">Hrs</th>
                                    
                                    {/* Base Salary */}
                                    <th className="px-2 py-2 bg-blue-50/50 border-r border-slate-200 text-right">Basic</th>
                                    <th className="px-2 py-2 bg-blue-50/50 border-r border-slate-200 text-right">Allowances</th>
                                    <th className="px-2 py-2 bg-blue-50/50 border-r border-slate-200 text-right">Bonus</th>
                                    <th className="px-2 py-2 bg-blue-50/50 border-r border-slate-300 text-right font-bold">Total</th>
                                    
                                    {/* Deductions */}
                                    <th className="px-2 py-2 bg-rose-50/50 border-r border-slate-200 text-right">Lv Days</th>
                                    <th className="px-2 py-2 bg-rose-50/50 border-r border-slate-200 text-right">Lv Pay</th>
                                    <th className="px-2 py-2 bg-rose-50/50 border-r border-slate-200 text-right">Lv Ded.</th>
                                    <th className="px-2 py-2 bg-rose-50/50 border-r border-slate-200 text-right">Ded Hrs</th>
                                    <th className="px-2 py-2 bg-rose-50/50 border-r border-slate-200 text-right">Ded Pay</th>
                                    <th className="px-2 py-2 bg-rose-50/50 border-r border-slate-200 text-right">Other</th>
                                    <th className="px-2 py-2 bg-rose-50/50 border-r border-slate-200 text-right">Advance</th>
                                    <th className="px-2 py-2 bg-rose-100 border-r border-slate-300 text-right font-bold">Net Ded.</th>
                                    
                                    {/* Additions */}
                                    <th className="px-2 py-2 bg-emerald-50/50 border-r border-slate-200 text-right">OT Hrs N</th>
                                    <th className="px-2 py-2 bg-emerald-50/50 border-r border-slate-200 text-right">OT Hrs S</th>
                                    <th className="px-2 py-2 bg-emerald-50/50 border-r border-slate-200 text-right">OT Pay N</th>
                                    <th className="px-2 py-2 bg-emerald-50/50 border-r border-slate-200 text-right">OT Pay S</th>
                                    <th className="px-2 py-2 bg-emerald-50/50 border-r border-slate-200 text-right">Incentive</th>
                                    <th className="px-2 py-2 bg-emerald-50/50 border-r border-slate-200 text-right">Lv Salary</th>
                                    <th className="px-2 py-2 bg-emerald-50/50 border-r border-slate-200 text-right">Open Lv</th>
                                    <th className="px-2 py-2 bg-emerald-50/50 border-r border-slate-200 text-right">Variable</th>
                                    <th className="px-2 py-2 bg-emerald-100 border-r border-slate-300 text-right font-bold">Net Add.</th>
                                    
                                    {/* Final */}
                                    <th className="px-2 py-2 bg-indigo-50 border-r border-slate-200 text-right font-bold">Total</th>
                                    <th className="px-2 py-2 bg-indigo-50 border-r border-slate-200 text-right font-bold text-green-700">WPS</th>
                                    <th className="px-2 py-2 bg-indigo-50 border-r border-slate-200 text-right font-bold text-amber-700">Balance</th>
                                    <th className="px-2 py-2 bg-indigo-50 border-r border-slate-200 text-center">Cap</th>
                                    <th className="px-2 py-2 bg-indigo-50 border-r border-slate-200 text-center">Leave Hold</th>
                                    <th className="px-2 py-2 bg-slate-100 sticky right-0 z-30 text-center min-w-[50px]">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {branchData.map((row, idx) => {
                                    const { total, wpsPay, balance, wpsCapApplied, netAdditions, netDeductions, normalOtSalary, specialOtSalary } = calculateTotals(row);
                                    
                                    const isHoldEligible = ((row.full_absence_count || 0) >= 2 || (row.annual_leave_count || 0) >= 2) && (row.salaryLeaveAmount || 0) > 0;
                                    const isHeld = !!activeHolds[row.hrms_id];
                                    const displayTotal = isHeld ? total - (row.salaryLeaveAmount || 0) : total;
                                    const displayWpsPay = isHeld ? wpsPay - (row.salaryLeaveAmount || 0) : wpsPay;
                                    
                                    const stripe = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
                                    
                                    return (
                                        <tr key={row.hrms_id} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors ${stripe}`}>
                                            {/* Sticky Left Info */}
                                            <td className={`${cellBase} px-1 sticky left-0 z-10 ${stripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)] text-center`}>
                                                <Checkbox
                                                    checked={!!verifiedEmployees[row.attendance_id]}
                                                    onCheckedChange={() => toggleVerification(row.attendance_id)}
                                                    className="h-3.5 w-3.5"
                                                />
                                            </td>
                                            <td className={`${cellBase} sticky left-[32px] z-10 ${stripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)] text-center text-slate-400`}>{idx + 1}</td>
                                            <td className={`${cellBase} font-medium text-slate-700 sticky left-[60px] z-10 ${stripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>{row.attendance_id}</td>
                                            <td className={`${cellBase} font-medium text-slate-800 sticky left-[110px] z-10 ${stripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)] border-r border-slate-200`}>{row.name}</td>
                                            <td className={cellBase}>{row.department}</td>
                                            <td className={`${cellBase} text-center`}>{row.working_hours || 9}</td>
                                            
                                            {/* Base Salary */}
                                            <td className={`${cellBase} text-right`}>{(row.basic_salary || 0).toFixed(2)}</td>
                                            <td className={`${cellBase} text-right`}>{(row.allowances || 0).toFixed(2)}</td>
                                            <td className={`${cellBase} text-right bg-emerald-50/30`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                {adminEditMode && isAdmin ? (
                                                    <Input type="number" step="0.01" value={getValue(row, 'bonus')} onChange={e => handleChange(row.hrms_id, 'bonus', e.target.value)} className="h-6 w-16 text-xs p-1" />
                                                ) : <span>{Number(getValue(row, 'bonus')).toFixed(2)}</span>}
                                            </td>
                                            <td className={`${cellBase} text-right font-bold`}>{(row.total_salary || 0).toFixed(2)}</td>
                                            
                                            {/* Deductions */}
                                            <td className={`${cellBase} text-right text-rose-600`}>{(Number(row.salary_leave_days || row.salaryLeaveDays || 0) + Number(row.full_absence_count || 0)).toFixed(2)}</td>
                                            <td className={`${cellBase} text-right text-rose-600`}>{(row.leavePay || 0).toFixed(2)}</td>
                                            <td className={`${cellBase} text-right text-rose-600 font-semibold`}>{(row.netDeduction || 0).toFixed(2)}</td>
                                            <td className={`${cellBase} text-right text-rose-600`}>{(row.deductibleHours || 0).toFixed(2)}</td>
                                            <td className={`${cellBase} text-right text-rose-600`}>{(row.deductibleHoursPay || 0).toFixed(2)}</td>
                                            <td className={`${cellBase} text-right text-rose-600`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                {adminEditMode && isAdmin ? (
                                                    <Input type="number" step="0.01" value={getValue(row, 'otherDeduction')} onChange={e => handleChange(row.hrms_id, 'otherDeduction', e.target.value)} className="h-6 w-16 text-xs p-1" />
                                                ) : <span>{Number(getValue(row, 'otherDeduction')).toFixed(2)}</span>}
                                            </td>
                                            <td className={`${cellBase} text-right text-rose-600`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                {adminEditMode && isAdmin ? (
                                                    <Input type="number" step="0.01" value={getValue(row, 'advanceSalaryDeduction')} onChange={e => handleChange(row.hrms_id, 'advanceSalaryDeduction', e.target.value)} className="h-6 w-16 text-xs p-1" />
                                                ) : <span>{Number(getValue(row, 'advanceSalaryDeduction')).toFixed(2)}</span>}
                                            </td>
                                            <td className={`${cellBase} text-right bg-rose-100 font-bold`}>{netDeductions.toFixed(2)}</td>
                                            
                                            {/* Additions */}
                                            <td className={`${cellBase} text-right`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                {adminEditMode && isAdmin ? (
                                                    <Input type="number" step="0.01" value={getValue(row, 'normalOtHours')} onChange={e => handleChange(row.hrms_id, 'normalOtHours', e.target.value)} className="h-6 w-14 text-xs p-1" />
                                                ) : <span>{Number(getValue(row, 'normalOtHours')).toFixed(2)}</span>}
                                            </td>
                                            <td className={`${cellBase} text-right`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                {adminEditMode && isAdmin ? (
                                                    <Input type="number" step="0.01" value={getValue(row, 'specialOtHours')} onChange={e => handleChange(row.hrms_id, 'specialOtHours', e.target.value)} className="h-6 w-14 text-xs p-1" />
                                                ) : <span>{Number(getValue(row, 'specialOtHours')).toFixed(2)}</span>}
                                            </td>
                                            <td className={`${cellBase} text-right text-emerald-600`}>{normalOtSalary.toFixed(2)}</td>
                                            <td className={`${cellBase} text-right text-emerald-600`}>{specialOtSalary.toFixed(2)}</td>
                                            <td className={`${cellBase} text-right text-emerald-600`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                {adminEditMode && isAdmin ? (
                                                    <Input type="number" step="0.01" value={getValue(row, 'incentive')} onChange={e => handleChange(row.hrms_id, 'incentive', e.target.value)} className="h-6 w-16 text-xs p-1" />
                                                ) : <span>{Number(getValue(row, 'incentive')).toFixed(2)}</span>}
                                            </td>
                                            <td className={`${cellBase} text-right text-emerald-600`}>{(row.salaryLeaveAmount || 0).toFixed(2)}</td>
                                            <td className={`${cellBase} text-right text-emerald-600`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                {adminEditMode && isAdmin ? (
                                                    <Input type="number" step="0.01" value={getValue(row, 'open_leave_salary')} onChange={e => handleChange(row.hrms_id, 'open_leave_salary', e.target.value)} className="h-6 w-16 text-xs p-1" />
                                                ) : <span>{Number(getValue(row, 'open_leave_salary')).toFixed(2)}</span>}
                                            </td>
                                            <td className={`${cellBase} text-right text-emerald-600`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                {adminEditMode && isAdmin ? (
                                                    <Input type="number" step="0.01" value={getValue(row, 'variable_salary')} onChange={e => handleChange(row.hrms_id, 'variable_salary', e.target.value)} className="h-6 w-16 text-xs p-1" />
                                                ) : <span>{Number(getValue(row, 'variable_salary')).toFixed(2)}</span>}
                                            </td>
                                            <td className={`${cellBase} text-right bg-emerald-100 font-bold`}>{netAdditions.toFixed(2)}</td>
                                            
                                            {/* Final */}
                                            <td className={`${cellBase} text-right bg-indigo-50 font-bold underline`}>{displayTotal.toFixed(2)}</td>
                                            <td className={`${cellBase} text-right bg-indigo-50 font-bold text-green-700`}>{displayWpsPay.toFixed(2)}</td>
                                            <td className={`${cellBase} text-right bg-indigo-50 font-bold text-amber-700`}>{Math.round(balance)}</td>
                                            <td className={`${cellBase} text-center bg-indigo-50`}>
                                                {wpsCapApplied ? <span className="px-1 bg-amber-200 text-amber-800 rounded text-[10px]">Y</span> : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className={`${cellBase} text-center bg-indigo-50`}>
                                                {isHoldEligible && canManageHolds ? (
                                                    <Button
                                                        size="sm"
                                                        variant={isHeld ? "outline" : "destructive"}
                                                        className={isHeld 
                                                            ? "text-[10px] px-1.5 h-6 border-amber-400 text-amber-700 hover:bg-amber-50" 
                                                            : "text-[10px] px-1.5 h-6"}
                                                        onClick={() => handleToggleHold(row)}
                                                    >
                                                        {isHeld ? "Release" : "Hold"}
                                                    </Button>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className={`${cellBase} text-center sticky right-0 z-10 ${stripe} shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>
                                                <span className="text-slate-300">—</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                
                                {/* Grand Total Row */}
                                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                                    <td className="px-1 border-r border-slate-200 sticky left-0 z-10 bg-slate-100"></td>
                                    <td className="px-1 border-r border-slate-200 sticky left-[32px] z-10 bg-slate-100 italic"></td>
                                    <td className="px-2 border-r border-slate-200 sticky left-[60px] z-10 bg-slate-100 text-center">Σ</td>
                                    <td className="px-2 border-r border-slate-300 sticky left-[110px] z-10 bg-slate-100 text-right uppercase tracking-wider text-sm">Grand Total</td>
                                    <td colSpan={2} className="px-2 border-r border-slate-300 bg-slate-100"></td>
                                    
                                    {/* Base Salary Totals */}
                                    <td className="px-2 py-3 text-right bg-blue-50/50 border-r border-slate-200">{grandTotals.basic.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-blue-50/50 border-r border-slate-200">{grandTotals.allowances.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-blue-50/50 border-r border-slate-200">{grandTotals.bonus.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-blue-50 border-r border-slate-300">{grandTotals.totalSalary.toFixed(2)}</td>
                                    
                                    {/* Deductions Totals */}
                                    <td colSpan={1} className="bg-rose-50/50 border-r border-slate-200"></td>
                                    <td className="px-2 py-3 text-right bg-rose-50/50 border-r border-slate-200">{grandTotals.lvPay.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-rose-50/50 border-r border-slate-200">{grandTotals.lvDed.toFixed(2)}</td>
                                    <td className="bg-rose-50/50 border-r border-slate-200"></td>
                                    <td className="px-2 py-3 text-right bg-rose-50/50 border-r border-slate-200">{grandTotals.dedPay.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-rose-50/50 border-r border-slate-200">{grandTotals.otherDed.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-rose-50/50 border-r border-slate-200">{grandTotals.advance.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-rose-100 border-r border-slate-300">{grandTotals.netDed.toFixed(2)}</td>
                                    
                                    {/* Additions Totals */}
                                    <td colSpan={2} className="bg-emerald-50/50 border-r border-slate-200"></td>
                                    <td className="px-2 py-3 text-right bg-emerald-50/50 border-r border-slate-200">{grandTotals.otPayN.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-emerald-50/50 border-r border-slate-200">{grandTotals.otPayS.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-emerald-50/50 border-r border-slate-200">{grandTotals.incentive.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-emerald-50/50 border-r border-slate-200">{grandTotals.lvSalary.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-emerald-50/50 border-r border-slate-200">{grandTotals.openLv.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-emerald-50/50 border-r border-slate-200">{grandTotals.variable.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-emerald-100 border-r border-slate-300">{grandTotals.netAdd.toFixed(2)}</td>
                                    
                                    {/* Final Totals */}
                                    <td className="px-2 py-3 text-right bg-indigo-50 border-r border-slate-200 text-indigo-900">{grandTotals.total.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-indigo-50 border-r border-slate-200 text-green-800">{grandTotals.wps.toFixed(2)}</td>
                                    <td className="px-2 py-3 text-right bg-indigo-50 border-r border-slate-200 text-amber-800">{Math.round(grandTotals.balance)}</td>
                                    <td colSpan={2} className="bg-indigo-50 border-r border-slate-200"></td>
                                    <td className="bg-slate-100 sticky right-0 z-10"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
