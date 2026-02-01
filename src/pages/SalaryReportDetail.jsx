import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DollarSign, ArrowLeft, Download, Search, Save, FileSpreadsheet, RefreshCw, Eye, CheckCircle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import PINLock from '../components/ui/PINLock';
import SortableTableHead from '../components/ui/SortableTableHead';
import SalarySnapshotDialog from '../components/salary/SalarySnapshotDialog';
import { Checkbox } from '@/components/ui/checkbox';

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
    const [sortColumn, setSortColumn] = useState({ key: 'name', direction: 'asc' });
    const [recalculatingAll, setRecalculatingAll] = useState(false);
    const [confirmRecalcAll, setConfirmRecalcAll] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState(null);
    const [verifiedEmployees, setVerifiedEmployees] = useState([]);

    // Auto-unlock if already unlocked from SalaryTab - MUST be before any conditional returns
    React.useEffect(() => {
        const isSalaryUnlockedFromTab = sessionStorage.getItem('salary_tab_pin_unlocked') === 'true';
        if (isSalaryUnlockedFromTab && !salaryUnlocked) {
            setSalaryUnlocked(true);
        }
    }, [salaryUnlocked]);

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

    // Fetch live SalarySnapshot data for the most recent adjustment values
    const { data: liveSalarySnapshots = [] } = useQuery({
        queryKey: ['liveSalarySnapshots', report?.report_run_id],
        queryFn: () => base44.entities.SalarySnapshot.filter({ report_run_id: report.report_run_id }),
        enabled: !!report?.report_run_id,
        staleTime: 0
    });

    // Load verified employees from report snapshot_data
    React.useEffect(() => {
        if (report?.snapshot_data) {
            try {
                const data = JSON.parse(report.snapshot_data);
                const verified = data
                    .filter(row => row.salary_verified === true)
                    .map(row => String(row.attendance_id));
                setVerifiedEmployees(verified);
            } catch {
                // Ignore parse errors
            }
        }
    }, [report?.snapshot_data]);

    // ============================================
    // DERIVED VALUES
    // ============================================
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';
    const isAdminOrSupervisorOrHR = ['admin', 'supervisor', 'hr_manager'].includes(userRole);
    // Allow access for Al Maraghi Auto Repairs projects for all users with project access
    const isAlMaraghi = project?.company === 'Al Maraghi Motors';
    const canAccessSalaryReport = isAdminOrCEO || isAlMaraghi;
    
    // Can recalculate: Al Maraghi only, report finalized, project not closed, user has permission
    const canRecalculate = isAlMaraghi && 
                           isAdminOrSupervisorOrHR && 
                           project?.status !== 'closed' &&
                           liveSalarySnapshots.length > 0; // Snapshots exist = report is finalized

    // Parse snapshot data and merge with live adjustment values
    const salaryData = useMemo(() => {
        if (!report?.snapshot_data) return [];
        try {
            const data = JSON.parse(report.snapshot_data);
            return data.map(row => {
                // Get live snapshot for this employee for the latest adjustments
                const liveSnapshot = liveSalarySnapshots.find(s => 
                    String(s.attendance_id) === String(row.attendance_id)
                );
                
                return {
                    ...row,
                    normalOtHours: editableData[row.hrms_id]?.normalOtHours ?? row.normalOtHours ?? 0,
                    specialOtHours: editableData[row.hrms_id]?.specialOtHours ?? row.specialOtHours ?? 0,
                    // Use live snapshot values for adjustments (can be edited in Overtime & Adjustments tab)
                    otherDeduction: editableData[row.hrms_id]?.otherDeduction ?? liveSnapshot?.otherDeduction ?? row.otherDeduction ?? 0,
                    bonus: editableData[row.hrms_id]?.bonus ?? liveSnapshot?.bonus ?? row.bonus ?? 0,
                    incentive: editableData[row.hrms_id]?.incentive ?? liveSnapshot?.incentive ?? row.incentive ?? 0,
                    advanceSalaryDeduction: editableData[row.hrms_id]?.advanceSalaryDeduction ?? liveSnapshot?.advanceSalaryDeduction ?? row.advanceSalaryDeduction ?? 0,
                    isVerified: verifiedEmployees.includes(String(row.attendance_id))
                };
            });
        } catch {
            return [];
        }
    }, [report?.snapshot_data, editableData, liveSalarySnapshots, verifiedEmployees]);

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
    // Check if bonus has decimal values
    const hasDecimalBonus = (bonus) => {
        return (bonus || 0) % 1 !== 0;
    };

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
        // DIVISOR_LEAVE_DEDUCTION: For leave/deduction calculations (stored in snapshot)
        // [MERGE_NOTE: If merging, use single divisor for all]
        const divisor = row.salary_divisor || report?.salary_divisor || 30;
        
        // DIVISOR_OT: For OT salary calculations
        // [MERGE_NOTE: If merging, use 'divisor' instead of 'otDivisor']
        const otDivisor = row.ot_divisor || report?.ot_divisor || divisor;
        
        const totalSalary = row.total_salary || 0;
        const workingHours = row.working_hours || 9;
        
        // Recalculate OT salaries based on current edits using DIVISOR_OT
        const otHourlyRate = totalSalary / otDivisor / workingHours;
        const normalOtHours = getValue(row, 'normalOtHours') || 0;
        const specialOtHours = getValue(row, 'specialOtHours') || 0;
        const normalOtSalary = Math.round(otHourlyRate * 1.25 * normalOtHours);
        const specialOtSalary = Math.round(otHourlyRate * 1.5 * specialOtHours);
        const totalOtSalary = Math.round(normalOtSalary + specialOtSalary);
        
        const bonus = getValue(row, 'bonus') || 0;
        const incentive = getValue(row, 'incentive') || 0;
        const otherDeduction = getValue(row, 'otherDeduction') || 0;
        const advanceSalaryDeduction = getValue(row, 'advanceSalaryDeduction') || 0;
        
        // Use stored values for leave calculations (already calculated with DIVISOR_LEAVE_DEDUCTION)
        const netDeduction = row.netDeduction || 0;
        const deductibleHoursPay = row.deductibleHoursPay || 0;
        
        // Previous month deductions (Al Maraghi Motors - calculated using OT divisor)
        const extraPrevMonthLopPay = row.extra_prev_month_lop_pay || 0;
        const extraPrevMonthDeductibleHoursPay = row.extra_prev_month_deductible_hours_pay || 0;

        const total = totalSalary + totalOtSalary + bonus + incentive
                      - netDeduction - deductibleHoursPay - extraPrevMonthLopPay - extraPrevMonthDeductibleHoursPay
                      - otherDeduction - advanceSalaryDeduction;

        // WPS SPLIT LOGIC (Al Maraghi Motors only)
        // Balance must always be a multiple of 100 (round down)
        let wpsPay = total;
        let balance = 0;
        let wpsCapApplied = false;
        const wpsCapEnabled = row.wps_cap_enabled || false;
        const wpsCapAmount = row.wps_cap_amount ?? 4900;

        if (isAlMaraghi && wpsCapEnabled) {
            if (total <= 0) {
                wpsPay = 0;
                balance = 0;
                wpsCapApplied = false;
            } else {
                const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                // Calculate raw excess over cap
                const rawExcess = Math.max(0, total - cap);
                // Round balance DOWN to nearest 100
                balance = Math.floor(rawExcess / 100) * 100;
                // WPS gets the rest (total - balance)
                wpsPay = total - balance;
                wpsCapApplied = rawExcess > 0;
            }
        } else if (total <= 0) {
            wpsPay = 0;
            balance = 0;
        }

        return { total, wpsPay, balance, wpsCapApplied, normalOtSalary, specialOtSalary, totalOtSalary };
    };

    const handleSave = async () => {
        // Check if there are any changes (edits OR verification changes)
        const hasEdits = Object.keys(editableData).length > 0;
        const originalData = report?.snapshot_data ? JSON.parse(report.snapshot_data) : [];
        const originalVerified = originalData.filter(r => r.salary_verified).map(r => String(r.attendance_id));
        const verificationChanged = JSON.stringify([...originalVerified].sort()) !== JSON.stringify([...verifiedEmployees].sort());
        
        if (!hasEdits && !verificationChanged) {
            toast.info('No changes to save');
            return;
        }

        setIsSaving(true);
        try {
            // Merge edits into snapshot data + verification status
            const updatedData = originalData.map(row => {
            // Add verification status
            row.salary_verified = verifiedEmployees.includes(String(row.attendance_id));
            const edits = editableData[row.hrms_id];
            if (!edits) return row;

            const updated = { ...row };
            const totalSalary = row.total_salary || 0;
            const workingHours = row.working_hours || 9;

            // DIVISOR_OT: Use ot_divisor for OT calculations
            // [MERGE_NOTE: If merging, use salary_divisor for both]
            const divisor = row.salary_divisor || report?.salary_divisor || 30;
            const otDivisor = row.ot_divisor || report?.ot_divisor || divisor;
            const otHourlyRate = totalSalary / otDivisor / workingHours;

            // Apply edits using DIVISOR_OT for OT calculations
             if ('normalOtHours' in edits) {
                 updated.normalOtHours = edits.normalOtHours;
                 updated.normalOtSalary = Math.round(otHourlyRate * 1.25 * edits.normalOtHours);
             }
             if ('specialOtHours' in edits) {
                 updated.specialOtHours = edits.specialOtHours;
                 updated.specialOtSalary = Math.round(otHourlyRate * 1.5 * edits.specialOtHours);
             }
            if ('otherDeduction' in edits) updated.otherDeduction = edits.otherDeduction;
            if ('bonus' in edits) updated.bonus = edits.bonus;
            if ('incentive' in edits) updated.incentive = edits.incentive;
            if ('advanceSalaryDeduction' in edits) updated.advanceSalaryDeduction = edits.advanceSalaryDeduction;

            // Recalculate total (include previous month deductions)
             const totalOtSalary = (updated.normalOtSalary || 0) + (updated.specialOtSalary || 0);
             const netDeduction = updated.netDeduction || 0;
             const deductibleHoursPay = updated.deductibleHoursPay || 0;
             const extraPrevMonthLopPay = updated.extra_prev_month_lop_pay || 0;
             const extraPrevMonthDeductibleHoursPay = updated.extra_prev_month_deductible_hours_pay || 0;

             const finalTotal = totalSalary + totalOtSalary + (updated.bonus || 0) + (updated.incentive || 0)
                                 - netDeduction - deductibleHoursPay - extraPrevMonthLopPay - extraPrevMonthDeductibleHoursPay
                                 - (updated.otherDeduction || 0) - (updated.advanceSalaryDeduction || 0);

             updated.total = Math.round(finalTotal);

            // WPS SPLIT LOGIC (Al Maraghi Motors only)
            const wpsCapEnabled = updated.wps_cap_enabled || false;
            const wpsCapAmount = updated.wps_cap_amount ?? 4900;

            if (isAlMaraghi && wpsCapEnabled && finalTotal > 0) {
                const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                const rawExcess = Math.max(0, finalTotal - cap);
                const balance = Math.floor(rawExcess / 100) * 100;
                updated.wpsPay = Math.round(finalTotal - balance);
                updated.balance = balance;
                updated.wps_cap_applied = rawExcess > 0;
            } else {
                updated.wpsPay = Math.round(Math.max(0, finalTotal));
                updated.balance = 0;
                updated.wps_cap_applied = false;
            }

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
                 total_salary_amount: Math.round(totalSalaryAmount),
                 total_deductions: Math.round(totalDeductions),
                 total_ot_salary: Math.round(totalOtSalary)
             });

            // Also update the live SalarySnapshot entities for bidirectional sync
            // This ensures OvertimeTab sees the same values
            for (const row of updatedData) {
                const edits = editableData[row.hrms_id];
                if (!edits) continue;
                
                // Find the live snapshot for this employee
                const liveSnapshot = liveSalarySnapshots.find(s => 
                    String(s.attendance_id) === String(row.attendance_id)
                );
                
                if (liveSnapshot) {
                    const updatePayload = {};
                    if ('otherDeduction' in edits) updatePayload.otherDeduction = edits.otherDeduction;
                    if ('bonus' in edits) updatePayload.bonus = edits.bonus;
                    if ('incentive' in edits) updatePayload.incentive = edits.incentive;
                    if ('advanceSalaryDeduction' in edits) updatePayload.advanceSalaryDeduction = edits.advanceSalaryDeduction;
                    
                    if (Object.keys(updatePayload).length > 0) {
                        await base44.entities.SalarySnapshot.update(liveSnapshot.id, updatePayload);
                    }
                }
            }

            toast.success('Report saved successfully');
            setEditableData({});
            queryClient.invalidateQueries({ queryKey: ['salaryReport', reportId] });
            queryClient.invalidateQueries({ queryKey: ['salaryReports', report.project_id] });
            queryClient.invalidateQueries({ queryKey: ['liveSalarySnapshots', report?.report_run_id] });
            queryClient.invalidateQueries({ queryKey: ['salarySnapshots', report?.project_id] });
        } catch (error) {
            toast.error('Failed to save: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // Toggle verification for a single employee
    const toggleVerification = (attendanceId) => {
        const attendanceIdStr = String(attendanceId);
        const newVerified = verifiedEmployees.includes(attendanceIdStr) 
            ? verifiedEmployees.filter(id => id !== attendanceIdStr)
            : [...verifiedEmployees, attendanceIdStr];
        setVerifiedEmployees(newVerified);
    };

    // Verify all employees with clean records (positive total)
    const verifyAllClean = () => {
        const cleanEmployees = salaryData
            .filter(r => {
                const { total } = calculateTotals(r);
                return total > 0;
            })
            .map(r => String(r.attendance_id));
        
        const newVerified = [...new Set([...verifiedEmployees, ...cleanEmployees])];
        setVerifiedEmployees(newVerified);
        toast.success(`${cleanEmployees.length} employees verified`);
    };

    const handleRecalculateAll = async () => {
        setRecalculatingAll(true);
        setConfirmRecalcAll(false);
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // Helper to add delay between calls to avoid rate limiting
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        try {
            // Get all attendance_ids from the current report data
            const attendanceIds = salaryData.map(row => row.attendance_id);
            
            for (let i = 0; i < attendanceIds.length; i++) {
                const attendanceId = attendanceIds[i];
                
                try {
                    const response = await base44.functions.invoke('recalculateSalarySnapshot', {
                        salary_report_id: reportId,
                        report_run_id: report?.report_run_id,
                        project_id: report?.project_id,
                        attendance_id: attendanceId,
                        mode: 'APPLY'
                    });
                    
                    if (response.data?.success) {
                        successCount++;
                    } else {
                        errorCount++;
                        errors.push(`${attendanceId}: ${response.data?.error || 'Unknown error'}`);
                    }
                } catch (error) {
                    errorCount++;
                    errors.push(`${attendanceId}: ${error.response?.data?.error || error.message}`);
                }
                
                // Add 500ms delay between calls to avoid rate limiting
                if (i < attendanceIds.length - 1) {
                    await delay(500);
                }
            }
            
            // Refresh data
            queryClient.invalidateQueries({ queryKey: ['liveSalarySnapshots', report?.report_run_id] });
            queryClient.invalidateQueries({ queryKey: ['salaryReport', reportId] });
            
            if (errorCount === 0) {
                toast.success(`All ${successCount} employees recalculated successfully`);
            } else {
                toast.warning(`Recalculated ${successCount} employees. ${errorCount} failed.`);
                console.error('Recalculation errors:', errors);
            }
        } catch (error) {
            toast.error('Error: ' + (error.message || 'Failed to recalculate'));
        } finally {
            setRecalculatingAll(false);
        }
    };

    const handleExportToExcel = () => {
        const exportData = filteredData.map(row => {
            // Calculate totals for export to get correct WPS values
            const { total, wpsPay, balance, wpsCapApplied } = calculateTotals(row);
            const shouldRound = !hasDecimalBonus(getValue(row, 'bonus'));
            return {
                'Attendance ID': row.attendance_id,
                'Name': row.name,
                'Attendance Source': row.attendance_source || 'ANALYZED',
                'Total Salary': row.total_salary || 0,
                'Working Days': row.working_days || 0,
                'Present Days': row.present_days || 0,
                'LOP Days': row.full_absence_count || 0,
                'Annual Leave Days': row.annual_leave_count || 0,
                'Leave Days': Math.round(row.leaveDays || 0),
                'Leave Pay': row.leavePay || 0,
                'Salary Leave Days': row.salary_leave_days || row.salaryLeaveDays || 0,
                'Salary Leave Amount': row.salaryLeaveAmount || 0,
                'Net Deduction': row.netDeduction || 0,
                'Deductible Hours': row.deductibleHours || 0,
                'Deductible Hours Pay': row.deductibleHoursPay || 0,
                'Extra Deductible Hrs (Prev Month)': (row.extra_prev_month_deductible_minutes || 0) / 60,
                'Extra LOP Days (Prev Month)': row.extra_prev_month_lop_days || 0,
                'Extra LOP Pay (Prev Month)': row.extra_prev_month_lop_pay || 0,
                'Extra Deductible Pay (Prev Month)': row.extra_prev_month_deductible_hours_pay || 0,
                'Normal OT Hours': row.normalOtHours || 0,
                'Normal OT Salary': row.normalOtSalary || 0,
                'Special OT Hours': row.specialOtHours || 0,
                'Special OT Salary': row.specialOtSalary || 0,
                'Total OT Salary': (row.normalOtSalary || 0) + (row.specialOtSalary || 0),
                'Other Deduction': row.otherDeduction || 0,
                'Bonus': row.bonus || 0,
                'Incentive': row.incentive || 0,
                'Advance Salary Deduction': row.advanceSalaryDeduction || 0,
                'Total': shouldRound ? Math.round(total) : total,
                'WPS Pay': shouldRound ? Math.round(wpsPay) : wpsPay,
                'Balance': shouldRound ? Math.round(balance) : balance,
                'WPS Cap Applied': wpsCapApplied ? 'Yes' : 'No',
                'WPS Cap Amount': row.wps_cap_enabled ? (row.wps_cap_amount || 4900) : ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');
        XLSX.writeFile(wb, `${report?.report_name || 'Salary'}_${report?.date_from}_to_${report?.date_to}.xlsx`);
        toast.success('Excel file downloaded');
    };

    // ============================================
    // RENDER
    // ============================================
    if (!canAccessSalaryReport && !loadingReport) {
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
                { label: project?.name || 'Project', href: `ProjectDetail?id=${project?.id}&tab=salary` },
                { label: report?.report_name || 'Salary Report' }
            ]} />

            {!salaryUnlocked && (
                <PINLock onUnlock={(unlocked) => setSalaryUnlocked(unlocked)} storageKey="salary_tab_pin" />
            )}

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
                                    {report.salary_divisor && <span className="ml-2">• Salary Divisor: {report.salary_divisor}</span>}
                                    {report.ot_divisor && <span className="ml-2">• OT Divisor: {report.ot_divisor}</span>}
                                    {salaryData[0]?.prev_month_divisor > 0 && <span className="ml-2">• Prev Month Divisor: {salaryData[0]?.prev_month_divisor}</span>}
                                </p>
                                <div className="mt-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                                    <strong>Note:</strong> If you see incorrect deductible hours (e.g., 0.18 hrs instead of 0.22 hrs), re-finalize the report in the Report tab to regenerate with correct values.
                                </div>
                                {isAlMaraghi && (
                                    <div className="mt-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700 inline-block">
                                        <strong>Note:</strong> As per Al Maraghi Motors payroll rules, the last 2 days of the month are treated as present for salary calculation.
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                            onClick={handleSave}
                                            disabled={isSaving}
                                            className="bg-green-600 hover:bg-green-700"
                                        >
                                    <Save className="w-4 h-4 mr-2" />
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                                {canRecalculate && (
                                    <Button
                                        onClick={() => setConfirmRecalcAll(true)}
                                        disabled={recalculatingAll || salaryData.length === 0}
                                        variant="outline"
                                        className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                                    >
                                        <RefreshCw className={`w-4 h-4 mr-2 ${recalculatingAll ? 'animate-spin' : ''}`} />
                                        {recalculatingAll ? 'Recalculating...' : 'Recalculate All'}
                                    </Button>
                                )}
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
                                    Showing {filteredData.length} of {salaryData.length} employees
                                </p>
                                <p className="text-sm text-slate-500">
                                    Verified: <span className="font-medium text-green-600">{verifiedEmployees.length}</span> / {salaryData.length}
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
                        <div className="border rounded-lg relative overflow-x-auto overflow-y-auto max-h-[600px]">
                            <table className="w-full min-w-max caption-bottom text-sm">
                                <thead className="sticky top-0 z-10 bg-slate-50">
                                    <tr className="border-b">
                                        <TableHead className="w-12 bg-slate-50 sticky left-0 z-20">✓</TableHead>
                                        <SortableTableHead sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50 sticky left-[48px] z-20">Attendance ID</SortableTableHead>
                                        <SortableTableHead sortKey="name" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50 sticky left-[148px] z-20">Name</SortableTableHead>
                                        <SortableTableHead sortKey="total_salary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50">Total Salary</SortableTableHead>
                                        <SortableTableHead sortKey="working_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50">Working Days</SortableTableHead>
                                        <SortableTableHead sortKey="present_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-50">Present Days</SortableTableHead>
                                        <SortableTableHead sortKey="full_absence_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap text-red-700 bg-slate-50">LOP Days</SortableTableHead>
                                        <SortableTableHead sortKey="annual_leave_count" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap text-blue-700 bg-slate-50">Annual Leave</SortableTableHead>
                                        <SortableTableHead sortKey="leaveDays" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-50">Leave Days</SortableTableHead>
                                        <SortableTableHead sortKey="leavePay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-50">Leave Pay</SortableTableHead>
                                        <SortableTableHead sortKey="salary_leave_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-50">Salary Leave Days</SortableTableHead>
                                        <SortableTableHead sortKey="salaryLeaveAmount" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-50">Salary Leave Amount</SortableTableHead>
                                        <SortableTableHead sortKey="netDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-red-50">Net Deduction</SortableTableHead>
                                        <SortableTableHead sortKey="deductibleHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-purple-50">Deductible Hours</SortableTableHead>
                                        <SortableTableHead sortKey="deductibleHoursPay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-purple-50">Deductible Hours Pay</SortableTableHead>
                                        <SortableTableHead sortKey="extra_prev_month_deductible_minutes" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-orange-50">Extra Deduct Hrs (PM)</SortableTableHead>
                                        <SortableTableHead sortKey="extra_prev_month_lop_days" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-orange-50">Extra LOP Days (PM)</SortableTableHead>
                                        <SortableTableHead sortKey="extra_prev_month_lop_pay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-orange-100">Extra LOP Pay (PM)</SortableTableHead>
                                        <SortableTableHead sortKey="extra_prev_month_deductible_hours_pay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-orange-100">Extra Deduct Pay (PM)</SortableTableHead>
                                        <SortableTableHead sortKey="normalOtHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-50">Normal OT Hours</SortableTableHead>
                                        <SortableTableHead sortKey="normalOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-blue-50">Normal OT Salary</SortableTableHead>
                                        <SortableTableHead sortKey="specialOtHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-cyan-50">Special OT Hours</SortableTableHead>
                                        <SortableTableHead sortKey="specialOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-cyan-50">Special OT Salary</SortableTableHead>
                                        <SortableTableHead sortKey="totalOtSalary" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-cyan-100">Total OT Salary</SortableTableHead>
                                        <SortableTableHead sortKey="otherDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-red-50">Other Deduction</SortableTableHead>
                                        <SortableTableHead sortKey="bonus" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-50">Bonus</SortableTableHead>
                                        <SortableTableHead sortKey="incentive" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-50">Incentive</SortableTableHead>
                                        <SortableTableHead sortKey="advanceSalaryDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-red-50">Advance Deduction</SortableTableHead>
                                        <SortableTableHead sortKey="total" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-indigo-100 font-bold">Total</SortableTableHead>
                                        <SortableTableHead sortKey="wpsPay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-green-100 font-bold">WPS Pay</SortableTableHead>
                                        <SortableTableHead sortKey="balance" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-amber-100 font-bold">Balance</SortableTableHead>
                                        <TableHead className="whitespace-nowrap bg-slate-100 text-center">Cap</TableHead>
                                        <TableHead className="whitespace-nowrap bg-slate-50 text-center sticky right-0 z-20">View</TableHead>
                                    </tr>
                                </thead>
                                <tbody className="[&_tr:last-child]:border-0">
                                    {filteredData.length === 0 ? (
                                    <tr className="border-b">
                                    <td colSpan={33} className="text-center py-12">
                                                <p className="text-slate-600">No employees match your search</p>
                                            </td>
                                        </tr>
                                    ) : filteredData.map((row) => {
                                        const { total, wpsPay, balance, wpsCapApplied, normalOtSalary, specialOtSalary, totalOtSalary } = calculateTotals(row);
                                        const shouldRound = !hasDecimalBonus(getValue(row, 'bonus'));
                                        return (
                                            <tr key={row.hrms_id} className="border-b transition-colors hover:bg-muted/50">
                                                <td className="p-2 align-middle sticky left-0 bg-white z-10">
                                                    <Checkbox
                                                        checked={row.isVerified}
                                                        onCheckedChange={() => toggleVerification(row.attendance_id)}
                                                    />
                                                </td>
                                                <td className="p-2 align-middle font-medium sticky left-[48px] bg-white z-10">{row.attendance_id}</td>
                                                <td className="p-2 align-middle font-medium sticky left-[148px] bg-white z-10">{row.name?.split(' ').slice(0, 2).join(' ')}</td>
                                                <td className="p-2 align-middle font-semibold">{row.total_salary || 0}</td>
                                                <td className="p-2 align-middle">{row.working_days || 0}</td>
                                                <td className="p-2 align-middle">{row.present_days || 0}</td>
                                                <td className="p-2 align-middle text-red-600 font-semibold">{row.full_absence_count || 0}</td>
                                                <td className="p-2 align-middle text-blue-600">{row.annual_leave_count || 0}</td>
                                                <td className="p-2 align-middle bg-amber-50">{row.leaveDays || 0}</td>
                                                <td className="p-2 align-middle bg-amber-100">{row.leavePay || 0}</td>
                                                <td className="p-2 align-middle bg-amber-50">{row.salary_leave_days || row.salaryLeaveDays || 0}</td>
                                                <td className="p-2 align-middle bg-amber-100">{row.salaryLeaveAmount || 0 || '0'}</td>
                                                <td className="p-2 align-middle bg-red-50 font-semibold">{row.netDeduction || 0 || '0'}</td>
                                                <td className="p-2 align-middle bg-purple-50">{row.deductibleHours || 0 || '0'}</td>
                                                <td className="p-2 align-middle bg-purple-100">{row.deductibleHoursPay || 0 || '0'}</td>
                                                <td className="p-2 align-middle bg-orange-50">{(row.extra_prev_month_deductible_minutes || 0) / 60}</td>
                                                <td className="p-2 align-middle bg-orange-50">{row.extra_prev_month_lop_days || 0}</td>
                                                <td className="p-2 align-middle bg-orange-100">{row.extra_prev_month_lop_pay || 0}</td>
                                                <td className="p-2 align-middle bg-orange-100">{row.extra_prev_month_deductible_hours_pay || 0}</td>
                                                <td className="p-1 align-middle bg-blue-50">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'normalOtHours')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'normalOtHours', e.target.value)}
                                                        className="h-8 text-xs w-16"
                                                    />
                                                </td>
                                                <td className="p-2 align-middle bg-blue-100">{normalOtSalary}</td>
                                                <td className="p-1 align-middle bg-cyan-50">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'specialOtHours')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'specialOtHours', e.target.value)}
                                                        className="h-8 text-xs w-16"
                                                    />
                                                </td>
                                                <td className="p-2 align-middle bg-cyan-100">{specialOtSalary}</td>
                                                <td className="p-2 align-middle bg-cyan-200 font-semibold">{totalOtSalary}</td>
                                                <td className="p-1 align-middle bg-red-50">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'otherDeduction')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'otherDeduction', e.target.value)}
                                                        className="h-8 text-xs w-16"
                                                    />
                                                </td>
                                                <td className="p-1 align-middle bg-green-50">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'bonus')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'bonus', e.target.value)}
                                                        className="h-8 text-xs w-16"
                                                    />
                                                </td>
                                                <td className="p-1 align-middle bg-green-50">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'incentive')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'incentive', e.target.value)}
                                                        className="h-8 text-xs w-16"
                                                    />
                                                </td>
                                                <td className="p-1 align-middle bg-red-50">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={getValue(row, 'advanceSalaryDeduction')}
                                                        onChange={(e) => handleChange(row.hrms_id, 'advanceSalaryDeduction', e.target.value)}
                                                        className="h-8 text-xs w-16"
                                                    />
                                                </td>
                                                <td className="p-2 align-middle bg-indigo-100 font-bold">{shouldRound ? Math.round(total) : total}</td>
                                                <td className="p-2 align-middle bg-green-100 font-bold">{shouldRound ? Math.round(wpsPay) : wpsPay}</td>
                                                <td className="p-2 align-middle bg-amber-100 font-bold">{shouldRound ? Math.round(balance) : balance}</td>
                                                <td className="p-2 align-middle bg-slate-50 text-center">
                                                    {wpsCapApplied ? (
                                                        <span className="px-2 py-0.5 bg-amber-200 text-amber-800 rounded text-xs font-medium">
                                                            Yes
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="p-2 align-middle bg-white text-center sticky right-0 z-10">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setSelectedSnapshot(row)}
                                                        title="View Salary Details"
                                                        className="h-7 w-7 p-0"
                                                    >
                                                        <Eye className="w-4 h-4 text-indigo-600" />
                                                    </Button>
                                                </td>
                                                </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Salary Snapshot Detail Dialog */}
            <SalarySnapshotDialog
                open={!!selectedSnapshot}
                onClose={() => setSelectedSnapshot(null)}
                snapshot={selectedSnapshot}
                project={project}
                reportRunId={report?.report_run_id}
                canRecalculate={canRecalculate}
                onRecalculated={() => {
                    queryClient.invalidateQueries({ queryKey: ['liveSalarySnapshots', report?.report_run_id] });
                    queryClient.invalidateQueries({ queryKey: ['salaryReport', reportId] });
                }}
            />

            {/* Recalculate All Confirmation Dialog */}
            <Dialog open={confirmRecalcAll} onOpenChange={setConfirmRecalcAll}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Recalculate All Salaries</DialogTitle>
                        <DialogDescription>
                            This will recalculate salary totals for all <strong>{salaryData.length}</strong> employees in this report.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                            <strong>Note:</strong> Attendance values will NOT change. Only derived salary values (leave pay, net deduction, deductible hours pay, OT salary, final total) will be recalculated using the current formula.
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmRecalcAll(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleRecalculateAll}
                            disabled={recalculatingAll}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {recalculatingAll ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Recalculating...
                                </>
                            ) : (
                                'Recalculate All'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}