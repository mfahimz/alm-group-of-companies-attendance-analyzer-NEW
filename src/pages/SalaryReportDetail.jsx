import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DollarSign, ArrowLeft, Download, Search, Save, FileSpreadsheet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import PINLock from '../components/ui/PINLock';
import SortableTableHead from '../components/ui/SortableTableHead';

export default function SalaryReportDetail() {
    const queryClient = useQueryClient();
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('reportId');

    // ============================================
    // STATE
    // ============================================
    const [salaryUnlocked, setSalaryUnlocked] = useState(false);
    const [editableData, setEditableData] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortColumn, setSortColumn] = useState({ key: 'department', direction: 'asc' });

    // ============================================
    // QUERIES
    // ============================================
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: report, isLoading: loadingReport } = useQuery({
        queryKey: ['salaryReport', reportId],
        queryFn: async () => {
            const reports = await base44.entities.SalaryReport.filter({ id: reportId });
            return reports[0] || null;
        },
        enabled: !!reportId
    });

    const { data: project } = useQuery({
        queryKey: ['project', report?.project_id],
        queryFn: async () => {
            const projects = await base44.entities.Project.filter({ id: report.project_id });
            return projects[0] || null;
        },
        enabled: !!report?.project_id
    });

    // ============================================
    // DERIVED VALUES
    // ============================================
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';

    // Parse snapshot data
    const salaryData = useMemo(() => {
        if (!report?.snapshot_data) return [];
        try {
            const data = JSON.parse(report.snapshot_data);
            return data.map(row => ({
                ...row,
                normalOtHours: editableData[row.hrms_id]?.normalOtHours ?? row.normalOtHours ?? 0,
                specialOtHours: editableData[row.hrms_id]?.specialOtHours ?? row.specialOtHours ?? 0,
                otherDeduction: editableData[row.hrms_id]?.otherDeduction ?? row.otherDeduction ?? 0,
                bonus: editableData[row.hrms_id]?.bonus ?? row.bonus ?? 0,
                incentive: editableData[row.hrms_id]?.incentive ?? row.incentive ?? 0,
                advanceSalaryDeduction: editableData[row.hrms_id]?.advanceSalaryDeduction ?? row.advanceSalaryDeduction ?? 0
            }));
        } catch {
            return [];
        }
    }, [report?.snapshot_data, editableData]);

    // Filter and sort data
    const filteredData = useMemo(() => {
        let filtered = salaryData;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item =>
                item.name?.toLowerCase().includes(query) ||
                item.attendance_id?.toString().includes(query) ||
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
                compareResult = (aVal || 0) - (bVal || 0);
            }

            return sortColumn.direction === 'asc' ? compareResult : -compareResult;
        });
    }, [salaryData, searchQuery, sortColumn]);

    // ============================================
    // HANDLERS
    // ============================================
    const handleChange = (hrmsId, field, value) => {
        setEditableData(prev => ({
            ...prev,
            [hrmsId]: {
                ...(prev[hrmsId] || {}),
                [field]: value === '' ? 0 : parseFloat(value) || 0
            }
        }));
    };

    const getValue = (row, field) => {
        return editableData[row.hrms_id]?.[field] ?? row[field] ?? 0;
    };

    const calculateTotals = (row) => {
        const leavePay = row.leavePay || 0;
        const salaryLeaveAmount = row.salaryLeaveAmount || 0;
        const normalOtSalary = getValue(row, 'normalOtSalary') || 0;
        const specialOtSalary = getValue(row, 'specialOtSalary') || 0;
        const totalOtSalary = normalOtSalary + specialOtSalary;
        const bonus = getValue(row, 'bonus') || 0;
        const incentive = getValue(row, 'incentive') || 0;
        const otherDeduction = getValue(row, 'otherDeduction') || 0;
        const advanceSalaryDeduction = getValue(row, 'advanceSalaryDeduction') || 0;
        const deductibleHoursPay = row.deductibleHoursPay || 0;

        const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);
        const total = row.total_salary + totalOtSalary + bonus + incentive
                      - netDeduction - deductibleHoursPay - otherDeduction - advanceSalaryDeduction;

        return { total, wpsPay: total, balance: 0 };
    };

    const handleSave = async () => {
        if (Object.keys(editableData).length === 0) {
            toast.info('No changes to save');
            return;
        }

        setIsSaving(true);
        try {
            // Merge edits into snapshot data
            const originalData = JSON.parse(report.snapshot_data);
            const divisor = project?.salary_calculation_days || 30;

            const updatedData = originalData.map(row => {
                const edits = editableData[row.hrms_id];
                if (!edits) return row;

                const updated = { ...row };
                const totalSalary = row.total_salary;
                const workingHours = row.working_hours;
                const hourlyRate = totalSalary / divisor / workingHours;

                // Apply edits
                if ('normalOtHours' in edits) {
                    updated.normalOtHours = edits.normalOtHours;
                    updated.normalOtSalary = Math.round(hourlyRate * 1.25 * edits.normalOtHours * 100) / 100;
                }
                if ('specialOtHours' in edits) {
                    updated.specialOtHours = edits.specialOtHours;
                    updated.specialOtSalary = Math.round(hourlyRate * 1.5 * edits.specialOtHours * 100) / 100;
                }
                if ('otherDeduction' in edits) updated.otherDeduction = edits.otherDeduction;
                if ('bonus' in edits) updated.bonus = edits.bonus;
                if ('incentive' in edits) updated.incentive = edits.incentive;
                if ('advanceSalaryDeduction' in edits) updated.advanceSalaryDeduction = edits.advanceSalaryDeduction;

                // Recalculate total
                const totalOtSalary = (updated.normalOtSalary || 0) + (updated.specialOtSalary || 0);
                const netDeduction = updated.netDeduction || 0;
                const deductibleHoursPay = updated.deductibleHoursPay || 0;

                const finalTotal = totalSalary + totalOtSalary + (updated.bonus || 0) + (updated.incentive || 0)
                                    - netDeduction - deductibleHoursPay - (updated.otherDeduction || 0) - (updated.advanceSalaryDeduction || 0);

                updated.total = Math.round(finalTotal * 100) / 100;
                updated.wpsPay = Math.round(finalTotal * 100) / 100;

                return updated;
            });

            // Calculate new totals
            let totalSalaryAmount = 0;
            let totalDeductions = 0;
            let totalOtSalary = 0;

            updatedData.forEach(row => {
                totalSalaryAmount += row.total || 0;
                totalDeductions += (row.netDeduction || 0) + (row.deductibleHoursPay || 0) + (row.otherDeduction || 0) + (row.advanceSalaryDeduction || 0);
                totalOtSalary += (row.normalOtSalary || 0) + (row.specialOtSalary || 0);
            });

            // Update the report
            await base44.entities.SalaryReport.update(report.id, {
                snapshot_data: JSON.stringify(updatedData),
                total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
                total_deductions: Math.round(totalDeductions * 100) / 100,
                total_ot_salary: Math.round(totalOtSalary * 100) / 100
            });

            toast.success('Report saved successfully');
            setEditableData({});
            queryClient.invalidateQueries({ queryKey: ['salaryReport', reportId] });
            queryClient.invalidateQueries({ queryKey: ['salaryReports', report.project_id] });
        } catch (error) {
            toast.error('Failed to save: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportToExcel = () => {
        const exportData = filteredData.map(row => ({
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
            'Salary Leave Days': row.salary_leave_days || row.salaryLeaveDays || 0,
            'Salary Leave Amount': row.salaryLeaveAmount,
            'Normal OT Hours': row.normalOtHours || 0,
            'Normal OT Salary': row.normalOtSalary || 0,
            'Special OT Hours': row.specialOtHours || 0,
            'Special OT Salary': row.specialOtSalary || 0,
            'Total OT Salary': (row.normalOtSalary || 0) + (row.specialOtSalary || 0),
            'Deductible Hours': row.deductibleHours || 0,
            'Deductible Hours Pay': row.deductibleHoursPay || 0,
            'Other Deduction': row.otherDeduction || 0,
            'Bonus': row.bonus || 0,
            'Incentive': row.incentive || 0,
            'Advance Salary Deduction': row.advanceSalaryDeduction || 0,
            'Total': row.total,
            'WPS Pay': row.wpsPay,
            'Balance': row.balance || 0
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');
        XLSX.writeFile(wb, `${report?.report_name || 'Salary'}_${report?.date_from}_to_${report?.date_to}.xlsx`);
        toast.success('Excel file downloaded');
    };

    // ============================================
    // RENDER
    // ============================================
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

    if (loadingReport) {
        return (
            <div className="max-w-7xl mx-auto">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <p className="text-slate-600">Loading report...</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="max-w-7xl mx-auto">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600">Report not found</p>
                        <Link to={createPageUrl('Projects')}>
                            <Button className="mt-4">Back to Projects</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-full mx-auto space-y-6">
            <Breadcrumb items={[
                { label: 'Projects', href: 'Projects' },
                { label: project?.name || 'Project', href: `ProjectDetail?id=${project?.id}` },
                { label: report?.report_name || 'Salary Report' }
            ]} />

            <PINLock onUnlock={(unlocked) => setSalaryUnlocked(unlocked)} storageKey="salary_report_detail_pin" />

            {!salaryUnlocked && (
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <p className="text-slate-600">Please unlock to view the salary report.</p>
                    </CardContent>
                </Card>
            )}

            {salaryUnlocked && (
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <DollarSign className="w-6 h-6 text-indigo-600" />
                                    {report.report_name}
                                </CardTitle>
                                <p className="text-sm text-slate-500 mt-1">
                                    {report.date_from} to {report.date_to} • {report.employee_count} employees • {report.company}
                                    {report.salary_divisor && <span className="ml-2">• Divisor: {report.salary_divisor} days</span>}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving || Object.keys(editableData).length === 0}
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                                <Button
                                    onClick={handleExportToExcel}
                                    variant="outline"
                                    className="border-green-300 text-green-700 hover:bg-green-50"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Export Excel
                                </Button>
                                <Link to={createPageUrl('ProjectDetail') + `?id=${project?.id}`}>
                                    <Button variant="outline">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Back to Project
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <p className="text-sm text-green-700">Total Salary</p>
                                <p className="text-2xl font-bold text-green-800">
                                    {report.total_salary_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-700">Total OT</p>
                                <p className="text-2xl font-bold text-blue-800">
                                    {report.total_ot_salary?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm text-red-700">Total Deductions</p>
                                <p className="text-2xl font-bold text-red-800">
                                    {report.total_deductions?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

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
                            <p className="text-sm text-slate-500 mt-2">
                                Showing {filteredData.length} of {salaryData.length} employees
                            </p>
                        </div>

                        {/* Salary Table */}
                        <div className="overflow-x-auto border rounded-lg">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <SortableTableHead sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap sticky left-0 bg-white z-10">Attendance ID</SortableTableHead>
                                        <SortableTableHead sortKey="name" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap sticky left-16 bg-white z-10">Name</SortableTableHead>
                                        <SortableTableHead sortKey="department" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Department</SortableTableHead>
                                        <SortableTableHead sortKey="total_salary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Total Salary</SortableTableHead>
                                        <SortableTableHead sortKey="working_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Working Days</SortableTableHead>
                                        <SortableTableHead sortKey="present_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Present Days</SortableTableHead>
                                        <SortableTableHead sortKey="full_absence_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">LOP Days</SortableTableHead>
                                        <SortableTableHead sortKey="annual_leave_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap">Annual Leave</SortableTableHead>
                                        <SortableTableHead sortKey="leaveDays" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-50">Leave Days</SortableTableHead>
                                        <SortableTableHead sortKey="leavePay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-50">Leave Pay</SortableTableHead>
                                        <SortableTableHead sortKey="normalOtHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-50">Normal OT Hrs</SortableTableHead>
                                        <SortableTableHead sortKey="normalOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-50">Normal OT Sal</SortableTableHead>
                                        <SortableTableHead sortKey="specialOtHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-cyan-50">Special OT Hrs</SortableTableHead>
                                        <SortableTableHead sortKey="specialOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-cyan-50">Special OT Sal</SortableTableHead>
                                        <SortableTableHead sortKey="deductibleHoursPay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-purple-50">Deduct Hrs Pay</SortableTableHead>
                                        <SortableTableHead sortKey="otherDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-red-50">Other Deduct</SortableTableHead>
                                        <SortableTableHead sortKey="bonus" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-50">Bonus</SortableTableHead>
                                        <SortableTableHead sortKey="incentive" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-50">Incentive</SortableTableHead>
                                        <SortableTableHead sortKey="advanceSalaryDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-red-50">Advance Deduct</SortableTableHead>
                                        <SortableTableHead sortKey="total" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-indigo-100 font-bold">Total</SortableTableHead>
                                        <SortableTableHead sortKey="wpsPay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-indigo-100 font-bold">WPS Pay</SortableTableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredData.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={21} className="text-center py-12">
                                                <p className="text-slate-600">No employees match your search</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredData.map((row) => {
                                        const { total, wpsPay } = calculateTotals(row);
                                        return (
                                            <TableRow key={row.hrms_id}>
                                                <TableCell className="sticky left-0 bg-white z-10 font-medium">{row.attendance_id}</TableCell>
                                                <TableCell className="sticky left-16 bg-white z-10 font-medium">{row.name?.split(' ').slice(0, 2).join(' ')}</TableCell>
                                                <TableCell className="text-sm text-slate-600">{row.department || '-'}</TableCell>
                                                <TableCell className="font-semibold">{row.total_salary?.toFixed(2)}</TableCell>
                                                <TableCell>{row.working_days?.toFixed(2)}</TableCell>
                                                <TableCell>{row.present_days?.toFixed(2)}</TableCell>
                                                <TableCell className="text-red-600 font-semibold">{row.full_absence_count?.toFixed(2)}</TableCell>
                                                <TableCell className="text-green-600">{row.annual_leave_count?.toFixed(2)}</TableCell>
                                                <TableCell className="bg-amber-50">{row.leaveDays?.toFixed(2)}</TableCell>
                                                <TableCell className="bg-amber-100">{row.leavePay?.toFixed(2)}</TableCell>
                                                <TableCell className="bg-blue-50 p-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'normalOtHours')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'normalOtHours', e.target.value)}
                                                        className="h-8 text-xs w-20"
                                                    />
                                                </TableCell>
                                                <TableCell className="bg-blue-100">{(getValue(row, 'normalOtSalary') || 0).toFixed(2)}</TableCell>
                                                <TableCell className="bg-cyan-50 p-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'specialOtHours')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'specialOtHours', e.target.value)}
                                                        className="h-8 text-xs w-20"
                                                    />
                                                </TableCell>
                                                <TableCell className="bg-cyan-100">{(getValue(row, 'specialOtSalary') || 0).toFixed(2)}</TableCell>
                                                <TableCell className="bg-purple-50">{row.deductibleHoursPay?.toFixed(2) || '0.00'}</TableCell>
                                                <TableCell className="bg-red-50 p-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'otherDeduction')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'otherDeduction', e.target.value)}
                                                        className="h-8 text-xs w-20"
                                                    />
                                                </TableCell>
                                                <TableCell className="bg-green-50 p-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'bonus')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'bonus', e.target.value)}
                                                        className="h-8 text-xs w-20"
                                                    />
                                                </TableCell>
                                                <TableCell className="bg-green-50 p-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'incentive')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'incentive', e.target.value)}
                                                        className="h-8 text-xs w-20"
                                                    />
                                                </TableCell>
                                                <TableCell className="bg-red-50 p-1">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'advanceSalaryDeduction')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'advanceSalaryDeduction', e.target.value)}
                                                        className="h-8 text-xs w-20"
                                                    />
                                                </TableCell>
                                                <TableCell className="bg-indigo-100 font-bold">{total.toFixed(2)}</TableCell>
                                                <TableCell className="bg-indigo-100 font-bold">{wpsPay.toFixed(2)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}