// BranchPayrollTab.jsx
// Exact replica of Salary Report table — Branch employees only (department !== 'Bodyshop')
// All state, handlers, and logic received as props from SalaryReportDetail.jsx
// No internal calculations, no entity fetches

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, CheckCircle, Eye } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import SortableTableHead from '../ui/SortableTableHead';

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
    verifiedEmployees = [],
    toggleVerification,
    isAdmin = false,
    userRole = '',
    searchQuery = '',
    setSearchQuery,
    sortColumn = { key: 'name', direction: 'asc' },
    setSortColumn,
    verifyAllClean,
    setSelectedSnapshot,
    isAlMaraghi = false,
    asNumber
}) {
    const branchEmployees = useMemo(() => {
        return salaryData.filter(row => row.department !== 'Bodyshop');
    }, [salaryData]);

    // Filter branch employees by search query then sort by sortColumn
    // Mirrors the exact sort logic used in SalaryReportDetail.jsx
    const filteredData = useMemo(() => {
        const query = (searchQuery || '').toLowerCase();
        const filtered = branchEmployees.filter(row =>
            !searchQuery ||
            row.name?.toLowerCase().includes(query) ||
            String(row.attendance_id).includes(query) ||
            row.department?.toLowerCase().includes(query)
        );
        return [...filtered].sort((a, b) => {
            const key = sortColumn?.key;
            if (!key) return 0;
            const aVal = a[key];
            const bVal = b[key];
            let compareResult = 0;
            if (typeof aVal === 'string') {
                compareResult = (aVal || '').localeCompare(bVal || '');
            } else if (typeof aVal === 'number') {
                compareResult = (aVal || 0) - (bVal || 0);
            }
            return sortColumn?.direction === 'asc' ? compareResult : -compareResult;
        });
    }, [branchEmployees, searchQuery, sortColumn]);

    const grandTotals = useMemo(() => {
        return branchEmployees.reduce((acc, row) => {
            const { total, wpsPay, balance, normalOtSalary, specialOtSalary, totalOtSalary, netAdditions, netDeductions } = calculateTotals(row);
            const isHeld = !!activeHolds[row.hrms_id];
            const displayTotal = isHeld ? total - (row.salaryLeaveAmount || 0) : total;
            const displayWpsPay = isHeld ? wpsPay - (row.salaryLeaveAmount || 0) : wpsPay;
            
            acc.basic_salary += Number(row.basic_salary || 0);
            acc.allowances += Number(row.allowances || 0);
            acc.total_salary += Number(row.total_salary || 0);
            acc.working_days += Number(row.working_days || 0);
            acc.present_days += Number(row.present_days || 0);
            acc.full_absence_count += (Number(row.full_absence_count || 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0));
            acc.annual_leave_count += (row.salary_leave_days || row.salaryLeaveDays || row.annual_leave_count || 0);
            acc.salary_leave_days += asNumber(row.salary_leave_days || row.salaryLeaveDays);
            acc.salaryLeaveAmount += asNumber(row.salaryLeaveAmount);
            acc.bonus += asNumber(getValue(row, 'bonus'));
            acc.normalOtHours += (getValue(row, 'normalOtHours') || 0);
            acc.normalOtSalary += normalOtSalary;
            acc.specialOtHours += (getValue(row, 'specialOtHours') || 0);
            acc.specialOtSalary += specialOtSalary;
            acc.totalOtSalary += totalOtSalary;
            acc.incentive += asNumber(getValue(row, 'incentive'));
            acc.open_leave_salary += isAlMaraghi ? asNumber(getValue(row, 'open_leave_salary')) : 0;
            acc.variable_salary += isAlMaraghi ? asNumber(getValue(row, 'variable_salary')) : 0;
            acc.netAdditions += netAdditions;
            acc.leavePay += asNumber(row.leavePay);
            acc.netDeduction += Number(row.netDeduction || 0);
            acc.deductibleHours += Number(row.deductibleHours || 0);
            acc.deductibleHoursPay += Number(row.deductibleHoursPay || 0);
            acc.otherDeduction += asNumber(getValue(row, 'otherDeduction'));
            acc.advanceSalaryDeduction += asNumber(getValue(row, 'advanceSalaryDeduction'));
            acc.prevMonthLopDays += (row.extra_prev_month_lop_days || 0);
            acc.prevMonthLopPay += (row.extra_prev_month_lop_pay || 0);
            acc.prevMonthDeductibleHoursPay += (row.extra_prev_month_deductible_hours_pay || 0);
            acc.otherMinutesHours += ((row.other_minutes || 0) / 60);
            acc.deductMinutesHours += ((row.deductible_minutes || 0) / 60);
            acc.netDeductions += netDeductions;
            acc.total += displayTotal;
            acc.wpsPay += displayWpsPay;
            acc.balance += balance;
            
            return acc;
        }, {
            basic_salary: 0, allowances: 0, total_salary: 0, working_days: 0, present_days: 0, 
            full_absence_count: 0, annual_leave_count: 0, salary_leave_days: 0, salaryLeaveAmount: 0, 
            bonus: 0, normalOtHours: 0, normalOtSalary: 0, specialOtHours: 0, specialOtSalary: 0, 
            totalOtSalary: 0, incentive: 0, open_leave_salary: 0, variable_salary: 0, netAdditions: 0, 
            leavePay: 0, netDeduction: 0, deductibleHours: 0, deductibleHoursPay: 0, 
            otherMinutesHours: 0, deductMinutesHours: 0, netDeductions: 0, total: 0, wpsPay: 0, balance: 0,
            prevMonthDeductibleHoursPay: 0
        });
    }, [branchEmployees, calculateTotals, activeHolds, getValue, isAlMaraghi, asNumber]);

    if (branchEmployees.length === 0) {
        return (
            <div className="py-20 text-center text-slate-500 bg-white rounded-lg border">
                <p>No Branch employees found in this report.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Edit mode toolbar */}
            {adminEditMode && (
                <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-amber-50
                                border border-amber-200 rounded-lg text-xs">
                    <span className="font-medium text-amber-800">Edit Mode Active</span>
                    <Button size="sm" onClick={handleSave}
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                        Save Changes
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAdminEditMode(false)}
                        className="h-7 text-xs">
                        Cancel
                    </Button>
                </div>
            )}

            {/* Search */}
            <div className="mb-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by name, ID, or department..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <p className="text-sm text-slate-500">
                        Showing {filteredData.length} of {branchEmployees.length} employees
                    </p>
                    <p className="text-sm text-slate-500">
                        {/* Count verified employees within branch only */}
                        {/* verifiedEmployees is an array of attendance_id strings */}
                        Verified: <span className="font-medium text-green-600">
                            {branchEmployees.filter(row => verifiedEmployees.includes(String(row.attendance_id))).length}
                        </span> / {branchEmployees.length}
                    </p>
                    <Button
                        onClick={verifyAllClean}
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Verify All Positive
                    </Button>
                </div>
            </div>

            {/* Salary Table */}
            <div className="border rounded-lg overflow-x-auto overflow-y-auto max-h-[70vh]">
                <table className="w-full min-w-max text-xs">
                    <thead className="sticky top-0 z-10">
                        {/* Group Header Row */}
                        <tr className="border-b border-slate-300">
                            <th colSpan={4} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 border-r border-slate-300 sticky left-0 z-30"></th>
                            <th colSpan={8} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 border-r border-slate-300">Employee Info</th>
                            <th colSpan={isAlMaraghi ? 12 : 10} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border-r border-slate-300">Additions</th>
                            <th colSpan={12} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border-r border-slate-300">Deductions</th>
                            <th colSpan={5} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border-r border-slate-300">Final</th>
                            <th className="px-2 py-1.5 bg-slate-100 sticky right-0 z-30"></th>
                        </tr>
                        {/* Column Header Row */}
                        <tr className="border-b border-slate-300 bg-slate-50">
                            {/* Sticky Left: Checkbox, #, ID, Name */}
                            <TableHead className="w-8 bg-slate-100 px-1 sticky left-0 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">✓</TableHead>
                            <TableHead className="w-8 bg-slate-100 px-1 text-center sticky left-[32px] z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">#</TableHead>
                            <SortableTableHead sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-100 px-2 sticky left-[64px] z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">ID</SortableTableHead>
                            <SortableTableHead sortKey="name" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-100 px-2 sticky left-[114px] z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] border-r border-slate-300">Name</SortableTableHead>
                            <SortableTableHead sortKey="basic_salary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50 px-2">Basic</SortableTableHead>
                            <SortableTableHead sortKey="allowances" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50 px-2">Allow.</SortableTableHead>
                            <SortableTableHead sortKey="allowances_with_bonus" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50 px-2">Allow.+B</SortableTableHead>
                            <SortableTableHead sortKey="total_salary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50 px-2 font-bold">Total Sal.</SortableTableHead>
                            <SortableTableHead sortKey="working_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50 px-2">WD</SortableTableHead>
                            <SortableTableHead sortKey="present_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50 px-2">Pres.</SortableTableHead>
                            <SortableTableHead sortKey="full_absence_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap text-red-700 bg-slate-50 px-2">LOP</SortableTableHead>
                            <SortableTableHead sortKey="annual_leave_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap text-blue-700 bg-slate-50 px-2 border-r border-slate-300">Leave</SortableTableHead>
                            {/* Additions Group */}
                            <SortableTableHead sortKey="salary_leave_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">SL Days</SortableTableHead>
                            <SortableTableHead sortKey="salaryLeaveAmount" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">SL Amt</SortableTableHead>
                            <SortableTableHead sortKey="bonus" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">Bonus</SortableTableHead>
                            <TableHead className="whitespace-nowrap bg-emerald-50 px-2">N.OT Hrs</TableHead>
                            <SortableTableHead sortKey="normalOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">N.OT Sal</SortableTableHead>
                            <TableHead className="whitespace-nowrap bg-emerald-50 px-2">S.OT Hrs</TableHead>
                            <SortableTableHead sortKey="specialOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">S.OT Sal</SortableTableHead>
                            <SortableTableHead sortKey="totalOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">Tot OT</SortableTableHead>
                            <SortableTableHead sortKey="incentive" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">Incentive</SortableTableHead>
                            {isAlMaraghi && <SortableTableHead sortKey="open_leave_salary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">Open Leave Salary</SortableTableHead>}
                            {isAlMaraghi && <SortableTableHead sortKey="variable_salary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-emerald-50 px-2">Variable Salary</SortableTableHead>}
                            <TableHead className="whitespace-nowrap bg-emerald-200 px-2 font-bold border-r border-slate-300">Net Add.</TableHead>
                            {/* Deductions Group */}
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">LOP Hrs</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">LOP Hrs Att.</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">LOP Hrs Amt</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">LOP Days Prev</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">LOP Days Amt Prev</th>
                            <SortableTableHead sortKey="extra_prev_month_deductible_hours_pay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-rose-50 px-2">Prev Ded. Hrs Amt</SortableTableHead>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">LOP Days Curr</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">LOP Days Amt Curr</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">Lv Ded.</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">Other Ded.</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-50">Advance</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-rose-200 font-bold border-r border-slate-300">Total Ded.</th>
                            {/* Final Group */}
                            <SortableTableHead sortKey="total" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-indigo-50 px-2 font-bold">Total</SortableTableHead>
                            <SortableTableHead sortKey="wpsPay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-indigo-50 px-2 font-bold">WPS</SortableTableHead>
                            <SortableTableHead sortKey="balance" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-indigo-50 px-2 font-bold">Balance</SortableTableHead>
                            <TableHead className="whitespace-nowrap bg-indigo-50 px-2 text-center border-r border-slate-300">Cap</TableHead>
                            {/* Hold/Release column header */}
                            <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap bg-indigo-50">
                                Leave Hold
                            </th>
                            <TableHead className="whitespace-nowrap bg-slate-100 px-1 text-center sticky right-0 z-20 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.1)]">👁</TableHead>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredData.length === 0 ? (
                        <tr>
                            <td colSpan={38} className="text-center py-12">
                                <p className="text-slate-500">No employees match your search</p>
                            </td>
                        </tr>
                        ) : filteredData.map((row, idx) => {
                            const { total, wpsPay, balance, wpsCapApplied, normalOtSalary, specialOtSalary, totalOtSalary, netAdditions, netDeductions } = calculateTotals(row);
                            
                            // All employees can be put on hold — no eligibility gate
                            const isHeld = !!activeHolds[row.hrms_id];

                            const displayTotal = isHeld ? total - (row.salaryLeaveAmount || 0) : total;
                            const displayWpsPay = isHeld ? wpsPay - (row.salaryLeaveAmount || 0) : wpsPay;

                            const stripe = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
                            // Opaque stripe for sticky cells — semi-transparent backgrounds
                            // show through when sticky columns overlap scrolling content
                            const stickyStripe = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                            const cellBase = `px-2 py-1.5 align-middle text-xs tabular-nums`;
                            return (
                                <tr key={row.hrms_id} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors ${stripe}`}>
                                    <td className={`${cellBase} px-1 sticky left-0 z-10 ${stickyStripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>
                                        <Checkbox
                                            checked={verifiedEmployees.includes(String(row.attendance_id))}
                                            onCheckedChange={() => toggleVerification(row.attendance_id)}
                                            className="h-3.5 w-3.5"
                                        />
                                    </td>
                                    <td className={`${cellBase} text-center text-slate-400 sticky left-[32px] z-10 ${stickyStripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>{idx + 1}</td>
                                    <td className={`${cellBase} font-medium text-slate-700 sticky left-[64px] z-10 ${stickyStripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>{row.attendance_id}</td>
                                    <td className={`${cellBase} font-medium text-slate-800 sticky left-[114px] z-10 ${stickyStripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)] border-r border-slate-200`}>{row.name?.split(' ').slice(0, 2).join(' ')}</td>
                                    <td className={`${cellBase} text-slate-500`}>{Math.round(row.basic_salary || 0)}</td>
                                    <td className={`${cellBase} text-slate-500`}>{Math.round(row.allowances || 0)}</td>
                                    <td className={`${cellBase} text-slate-500`}>{Math.round(row.allowances_with_bonus || 0)}</td>
                                    <td className={`${cellBase} font-semibold`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'total_salary')} onChange={(e) => handleChange(row.hrms_id, 'total_salary', e.target.value)} className="h-6 text-xs w-16 px-1" />
                                        ) : Math.round(row.total_salary || 0)}
                                    </td>
                                    <td className={`${cellBase}`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'working_days')} onChange={(e) => handleChange(row.hrms_id, 'working_days', e.target.value)} className="h-6 text-xs w-12 px-1" />
                                        ) : row.working_days || 0}
                                    </td>
                                    <td className={`${cellBase}`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'present_days')} onChange={(e) => handleChange(row.hrms_id, 'present_days', e.target.value)} className="h-6 text-xs w-12 px-1" />
                                        ) : row.present_days || 0}
                                    </td>
                                    <td className={`${cellBase} text-red-600 font-semibold`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'full_absence_count')} onChange={(e) => handleChange(row.hrms_id, 'full_absence_count', e.target.value)} className="h-6 text-xs w-12 px-1" />
                                        ) : ((row.full_absence_count || 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0))}
                                    </td>
                                    <td className={`${cellBase} text-blue-600 border-r border-slate-200`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'salary_leave_days') ?? getValue(row, 'salaryLeaveDays') ?? getValue(row, 'annual_leave_count')} onChange={(e) => handleChange(row.hrms_id, 'salary_leave_days', e.target.value)} className="h-6 text-xs w-12 px-1" />
                                        ) : (row.salary_leave_days || row.salaryLeaveDays || row.annual_leave_count || 0)}
                                    </td>

                                    <td className={`${cellBase} bg-emerald-50/50`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'salary_leave_days') || getValue(row, 'salaryLeaveDays')} onChange={(e) => handleChange(row.hrms_id, 'salary_leave_days', e.target.value)} className="h-6 text-xs w-12 px-1" />
                                        ) : (asNumber(row.salary_leave_days || row.salaryLeaveDays)).toFixed(2)}
                                    </td>
                                    <td className={`${cellBase} bg-emerald-50/50`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'salaryLeaveAmount')} onChange={(e) => handleChange(row.hrms_id, 'salaryLeaveAmount', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                        ) : (asNumber(row.salaryLeaveAmount)).toFixed(2)}
                                    </td>
                                    <td className={`${cellBase} bg-emerald-50/50 px-1`}>
                                        <Input type="number" step="0.01" value={getValue(row, 'bonus')} onChange={(e) => handleChange(row.hrms_id, 'bonus', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                    </td>
                                    <td className={`${cellBase} bg-emerald-50/50`}>{(getValue(row, 'normalOtHours') || 0).toFixed(2)}</td>
                                    <td className={`${cellBase} bg-emerald-50/50`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'normalOtSalary')} onChange={(e) => handleChange(row.hrms_id, 'normalOtSalary', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                        ) : normalOtSalary.toFixed(2)}
                                    </td>
                                    <td className={`${cellBase} bg-emerald-50/50`}>{(getValue(row, 'specialOtHours') || 0).toFixed(2)}</td>
                                    <td className={`${cellBase} bg-emerald-50/50`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'specialOtSalary')} onChange={(e) => handleChange(row.hrms_id, 'specialOtSalary', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                        ) : specialOtSalary.toFixed(2)}
                                    </td>
                                    <td className={`${cellBase} bg-emerald-50/50 font-semibold`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                        {adminEditMode && isAdmin ? (
                                            <Input type="number" step="0.01" value={getValue(row, 'totalOtSalary')} onChange={(e) => handleChange(row.hrms_id, 'totalOtSalary', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                        ) : totalOtSalary.toFixed(2)}
                                    </td>
                                    <td className={`${cellBase} bg-emerald-50/50 px-1`}>
                                        <Input type="number" step="0.01" value={getValue(row, 'incentive')} onChange={(e) => handleChange(row.hrms_id, 'incentive', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                    </td>
                                    {isAlMaraghi && <td className={`${cellBase} bg-emerald-50/50 px-1`}>
                                        <Input type="number" step="0.01" value={getValue(row, 'open_leave_salary')} onChange={(e) => handleChange(row.hrms_id, 'open_leave_salary', e.target.value)} className="h-6 text-xs w-16 px-1" />
                                    </td>}
                                    {isAlMaraghi && <td className={`${cellBase} bg-emerald-50/50 px-1`}>
                                        <Input type="number" step="0.01" value={getValue(row, 'variable_salary')} onChange={(e) => handleChange(row.hrms_id, 'variable_salary', e.target.value)} className="h-6 text-xs w-16 px-1" />
                                    </td>}
                                    <td className={`${cellBase} bg-emerald-100 font-bold border-r border-slate-200`}>{netAdditions.toFixed(2)}</td>

                                    {/* J - LOP Hours (other_minutes / 60) */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{((row.other_minutes || 0) / 60).toFixed(2)}</td>

                                    {/* K - LOP Hours Attendance (deductible_minutes / 60) */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{((row.deductible_minutes || 0) / 60).toFixed(2)}</td>

                                    {/* L - LOP Hours Amount */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{(row.deductibleHoursPay || 0).toFixed(2)}</td>

                                    {/* M - LOP Days Previous */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{(row.extra_prev_month_lop_days || 0).toFixed(0)}</td>

                                    {/* N - LOP Days Prev Amount */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{(row.extra_prev_month_lop_pay || 0).toFixed(2)}</td>
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{(row.extra_prev_month_deductible_hours_pay || 0).toFixed(2)}</td>

                                    {/* O - LOP Days Current */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{(((row.salary_leave_days || row.salaryLeaveDays || row.annual_leave_count || 0) + (row.full_absence_count || 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0))).toFixed(2)}</td>

                                    {/* P - LOP Days Current Amount */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{(asNumber(row.leavePay)).toFixed(2)}</td>

                                    {/* Leave Deduction */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50">{(row.netDeduction || 0).toFixed(2)}</td>

                                    {/* Q - Other Deduction (editable input — same as current) */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50 px-1">
                                        <Input type="number" step="0.01"
                                            value={getValue(row, 'otherDeduction')}
                                            onChange={(e) => handleChange(row.hrms_id, 'otherDeduction', e.target.value)}
                                            className="h-6 text-xs w-14 px-1" />
                                    </td>

                                    {/* Advance (editable input — same as current) */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-50/50 px-1">
                                        <Input type="number" step="0.01"
                                            value={getValue(row, 'advanceSalaryDeduction')}
                                            onChange={(e) => handleChange(row.hrms_id, 'advanceSalaryDeduction', e.target.value)}
                                            className="h-6 text-xs w-14 px-1" />
                                    </td>

                                    {/* R - Total Deductions */}
                                    <td className="px-2 py-1.5 align-middle text-xs tabular-nums bg-rose-100 font-bold border-r border-slate-200">
                                        {netDeductions.toFixed(2)}
                                    </td>

                                    <td className={`${cellBase} bg-indigo-50 font-bold text-slate-900`}>{displayTotal.toFixed(2)}</td>
                                    <td className={`${cellBase} bg-indigo-50 font-bold text-green-700`}>{displayWpsPay.toFixed(2)}</td>
                                    <td className={`${cellBase} bg-indigo-50 font-bold text-amber-700`}>{Math.round(balance)}</td>
                                    <td className={`${cellBase} bg-indigo-50 text-center`}>
                                        {wpsCapApplied ? (
                                            <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded text-[10px] font-medium">Y</span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    <td className={`${cellBase} bg-indigo-50 text-center whitespace-nowrap pb-2`}>
                                        {canManageHolds ? (
                                            <Button
                                                size="sm"
                                                variant={isHeld ? "outline" : "destructive"}
                                                className={isHeld
                                                    ? "text-xs px-2 py-1 h-7 border-amber-400 text-amber-700 hover:bg-amber-50"
                                                    : "text-xs px-2 py-1 h-7"
                                                }
                                                onClick={() => handleToggleHold(row)}
                                            >
                                                {isHeld ? "Modify Hold" : "Hold"}
                                            </Button>
                                        ) : (
                                            <span className="text-slate-300 text-xs">—</span>
                                        )}
                                    </td>

                                    <td className={`${cellBase} text-center sticky right-0 z-10 ${stickyStripe} shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setSelectedSnapshot(row)}
                                            title="View Salary Details"
                                            className="h-6 w-6 p-0"
                                        >
                                            <Eye className="w-3.5 h-3.5 text-indigo-600" />
                                        </Button>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Grand Total Row */}
                        <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-400">
                            <td className="px-2 py-1.5 sticky left-0 z-10 bg-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)]"></td>
                            <td className="px-2 py-1.5 sticky left-[32px] z-10 bg-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)]"></td>
                            <td className="px-2 py-1.5 sticky left-[64px] z-10 bg-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)]"></td>
                            <td className="px-2 py-1.5 sticky left-[114px] z-10 bg-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)] border-r border-slate-600 whitespace-nowrap">Grand Total</td>
                            
                            <td className="px-2 py-1.5 text-right tabular-nums">{grandTotals.basic_salary.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{grandTotals.allowances.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums"></td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{grandTotals.total_salary.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{grandTotals.working_days.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{grandTotals.present_days.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-red-400">{grandTotals.full_absence_count.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-blue-400 border-r border-slate-600">{grandTotals.annual_leave_count.toFixed(2)}</td>
                            
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.salary_leave_days.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.salaryLeaveAmount.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.bonus.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.normalOtHours.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.normalOtSalary.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.specialOtHours.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.specialOtSalary.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.totalOtSalary.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.incentive.toFixed(2)}</td>
                            {isAlMaraghi && <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.open_leave_salary.toFixed(2)}</td>}
                            {isAlMaraghi && <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.variable_salary.toFixed(2)}</td>}
                            <td className="px-2 py-1.5 text-right tabular-nums bg-emerald-900 border-r border-slate-600">{grandTotals.netAdditions.toFixed(2)}</td>
                            
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.otherMinutesHours.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.deductMinutesHours.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.deductibleHoursPay.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.prevMonthLopDays.toFixed(0)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.prevMonthLopPay.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.prevMonthDeductibleHoursPay.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{(grandTotals.annual_leave_count + grandTotals.full_absence_count).toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.leavePay.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.netDeduction.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.otherDeduction.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-slate-700/50">{grandTotals.advanceSalaryDeduction.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-rose-900 border-r border-slate-600">{grandTotals.netDeductions.toFixed(2)}</td>
                            
                            <td className="px-2 py-1.5 text-right tabular-nums bg-indigo-900">{grandTotals.total.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-indigo-900 text-green-300">{grandTotals.wpsPay.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums bg-indigo-900 text-amber-300">{Math.round(grandTotals.balance)}</td>
                            <td className="px-2 py-1.5 bg-indigo-900 border-r border-slate-600"></td>
                            <td className="px-2 py-1.5 bg-indigo-900"></td>
                            <td className="px-2 py-1.5 sticky right-0 z-10 bg-slate-800 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.2)]"></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}