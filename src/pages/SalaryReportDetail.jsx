import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TableHead } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Search, Save, FileSpreadsheet, RefreshCw, Eye, CheckCircle } from 'lucide-react';
import AEDIcon from '../components/ui/AEDIcon';
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
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import PINLock from '../components/ui/PINLock';
import SortableTableHead from '../components/ui/SortableTableHead';
import SalarySnapshotDialog from '../components/salary/SalarySnapshotDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OnHoldTab from '../components/salary/OnHoldTab';
import SummaryTab from '../components/salary/SummaryTab';
import BranchPayrollTab from '../components/salary/BranchPayrollTab';
import BodyShopPayrollTab from '../components/salary/BodyShopPayrollTab';
import CashSalaryTab from '../components/salary/CashSalaryTab';


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
    const [adminEditMode, setAdminEditMode] = useState(false);
    const [activeTab, setActiveTab] = useState('salary');
    // Tracks which employee hrms_ids currently have an active ON_HOLD PayrollHold
    // record for this report. Keyed by hrms_id, value is the PayrollHold record id.
    const [activeHolds, setActiveHolds] = useState({});

    // Saves finance team manual entries for the summary reconciliation section
    // Persists to SalaryReport.summary_manual_fields via Base44 entity update
    const handleSaveManualFields = async (fields) => {
        try {
            await base44.entities.SalaryReport.update(report.id, {
                summary_manual_fields: JSON.stringify(fields)
            });
            toast.success("Summary fields saved");
        } catch (err) {
            toast.error("Failed to save summary fields");
        }
    };

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
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

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

    // Load existing manual leave salary holds for this report on mount
    // so the Hold/Release buttons reflect the current saved state
    useEffect(() => {
      if (!report?.report_run_id) return;
      const loadHolds = async () => {
        try {
          const holds = await base44.entities.PayrollHold.filter({
            report_run_id: report.report_run_id,
            hold_type: 'MANUAL',
            reason_code: 'MANUAL_LEAVE_SALARY_HOLD',
            status: 'ON_HOLD'
          });
          // Build a lookup map of hrms_id -> hold record id
          const holdMap = {};
          (holds || []).forEach(h => {
            holdMap[h.hrms_id] = h.id;
          });
          setActiveHolds(holdMap);
        } catch (err) {
          console.error('Failed to load manual holds:', err);
        }
      };
      loadHolds();
    }, [report?.report_run_id]);

    // ============================================
    // DERIVED VALUES
    // ============================================
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin' || userRole === 'senior_accountant';
    const isActuallyAdmin = userRole === 'admin';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';
    const isSeniorAccountant = userRole === 'senior_accountant';
    const isAdminOrSupervisorOrHR = ['admin', 'supervisor', 'hr_manager', 'senior_accountant'].includes(userRole);
    // Users allowed to place or release manual leave salary holds
    const canManageHolds = ['admin', 'hr_manager', 'senior_accountant'].includes(userRole);
    // Allow access for Al Maraghi Auto Repairs projects for all users with project access
    const isAlMaraghi = project?.company === 'Al Maraghi Motors';
    const canAccessSalaryReport = isAdminOrCEO || isSeniorAccountant || isAlMaraghi;
    const calculateWpsSplit = (totalAmount, isCapEnabled, capAmount) => {
        if (totalAmount <= 0) {
            return { wpsPay: 0, balance: 0, wpsCapApplied: false };
        }

        if (!(isAlMaraghi && isCapEnabled)) {
            return { wpsPay: totalAmount, balance: 0, wpsCapApplied: false };
        }

        const cap = capAmount != null ? capAmount : 4900;
        const rawExcess = Math.max(0, totalAmount - cap);
        const balance = rawExcess > 0 ? Math.ceil(rawExcess / 100) * 100 : 0;
        const wpsPay = totalAmount - balance;

        return { wpsPay, balance, wpsCapApplied: rawExcess > 0 };
    };

    
    // Can recalculate: Al Maraghi only, report finalized, project not closed, user has permission
    const canRecalculate = isAlMaraghi && 
                           isAdminOrSupervisorOrHR && 
                           !isSeniorAccountant &&
                           project?.status !== 'closed' &&
                           liveSalarySnapshots.length > 0; // Snapshots exist = report is finalized

    // Parse snapshot data and merge with live adjustment values
    // CRITICAL: Use ONLY snapshot_data - it contains immutable finalized values
    // DO NOT fetch AnalysisResult - it gets overwritten on re-finalization
    const salaryData = useMemo(() => {
        if (!report?.snapshot_data) return [];
        try {
            const data = JSON.parse(report.snapshot_data);
            return data.map(row => {
                // Get live snapshot for this employee for the latest adjustments (OT/bonus/deductions only)
                const liveSnapshot = liveSalarySnapshots.find(s => 
                    String(s.attendance_id) === String(row.attendance_id)
                );
                
                return {
                    ...row,
                    // Use stored snapshot values for attendance (immutable after finalization)
                    normalOtHours: editableData[row.hrms_id]?.normalOtHours ?? row.normalOtHours ?? 0,
                    specialOtHours: editableData[row.hrms_id]?.specialOtHours ?? row.specialOtHours ?? 0,
                    // Use live snapshot values for adjustments (can be edited in Overtime & Adjustments tab)
                    otherDeduction: editableData[row.hrms_id]?.otherDeduction ?? liveSnapshot?.otherDeduction ?? row.otherDeduction ?? 0,
                    bonus: editableData[row.hrms_id]?.bonus ?? liveSnapshot?.bonus ?? row.bonus ?? 0,
                    incentive: editableData[row.hrms_id]?.incentive ?? liveSnapshot?.incentive ?? row.incentive ?? 0,
                    open_leave_salary: editableData[row.hrms_id]?.open_leave_salary ?? liveSnapshot?.open_leave_salary ?? row.open_leave_salary ?? 0,
                    variable_salary: editableData[row.hrms_id]?.variable_salary ?? liveSnapshot?.variable_salary ?? row.variable_salary ?? 0,
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

    const asNumber = (v) => Number(v) || 0;
    const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

    const calculateTotals = (row) => {
        // DIVISOR_LEAVE_DEDUCTION: For leave/deduction calculations (stored in snapshot)
        // [MERGE_NOTE: If merging, use single divisor for all]
        const divisor = row.salary_divisor || report?.salary_divisor || 30;

        // DIVISOR_OT: For OT salary calculations
        // [MERGE_NOTE: If merging, use 'divisor' instead of 'otDivisor']
        const otDivisor = row.ot_divisor || report?.ot_divisor || divisor;

        const totalSalary = Math.round(getValue(row, 'total_salary') ?? row.total_salary ?? 0);
        const workingHours = row.working_hours || 9;

        // Recalculate OT salaries based on current edits using DIVISOR_OT
        const otHourlyRate = totalSalary / otDivisor / workingHours;
        const normalOtHours = getValue(row, 'normalOtHours') || 0;
        const specialOtHours = getValue(row, 'specialOtHours') || 0;
        const normalOtSalary = getValue(row, 'normalOtSalary') ?? round2(otHourlyRate * 1.25 * normalOtHours);
        const specialOtSalary = getValue(row, 'specialOtSalary') ?? round2(otHourlyRate * 1.5 * specialOtHours);
        const totalOtSalary = getValue(row, 'totalOtSalary') ?? round2(normalOtSalary + specialOtSalary);

        const bonus = asNumber(getValue(row, 'bonus'));
        const incentive = asNumber(getValue(row, 'incentive'));
        const otherDeduction = asNumber(getValue(row, 'otherDeduction'));
        const advanceSalaryDeduction = asNumber(getValue(row, 'advanceSalaryDeduction'));
        const openLeaveSalary = isAlMaraghi ? asNumber(getValue(row, 'open_leave_salary')) : 0;
        const variableSalary = isAlMaraghi ? asNumber(getValue(row, 'variable_salary')) : 0;

        // Get current attendance values (may be admin-edited)
        const salaryLeaveDays = getValue(row, 'salary_leave_days') ?? row.salary_leave_days ?? row.salaryLeaveDays ?? 0;
        // Salary context rule: Annual Leave must follow exception-configured salary leave days.
        const annualLeaveCount = salaryLeaveDays;
        const fullAbsenceCount = (getValue(row, 'full_absence_count') ?? row.full_absence_count ?? 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0);
        const leaveDays = annualLeaveCount + fullAbsenceCount;
        const deductibleHours = getValue(row, 'deductibleHours') ?? row.deductibleHours ?? 0;
        
        // ALWAYS recalculate derived monetary amounts based on current attendance values
        // This ensures live updates when admin edits attendance fields
        const leavePay = (totalSalary / divisor) * leaveDays;
        const basicSalary = asNumber(row.basic_salary);
        const allowances = asNumber(row.allowances);
        const salaryLeaveAmount = ((basicSalary + allowances) / divisor) * salaryLeaveDays;
        const netDeduction = leavePay - salaryLeaveAmount;
        const deductibleHoursPay = (totalSalary / divisor / workingHours) * deductibleHours;

        // Previous month deductions (Al Maraghi Motors - calculated using OT divisor)
        const extraPrevMonthLopPay = asNumber(row.extra_prev_month_lop_pay);
        const extraPrevMonthDeductibleHoursPay = asNumber(row.extra_prev_month_deductible_hours_pay);

        // ============================================================
        // INCENTIVE vs OVERTIME RULE (Al Maraghi Motors — Operations Department Only)
        // ============================================================
        // For employees in the "Operations" department (across all companies,
        // but noted specifically for Al Maraghi Motors): pay only the HIGHER
        // of overtime vs incentive — not both added together.
        // For all other employees outside the Operations department: both
        // incentive and overtime are added together in full with no comparison.
        // ============================================================
        const isOperationsDept = row.department === 'Operations';
        const effectiveOtOrIncentive = isOperationsDept
            ? Math.max(round2(totalOtSalary), round2(incentive))
            : round2(totalOtSalary) + round2(incentive);

        // Bonus is added as-is (do not force-round bonus value itself).
        const netAdditions = bonus + effectiveOtOrIncentive + openLeaveSalary + variableSalary;

        // Net deductions are rounded to 2 decimals.
        const netDeductions = round2(
            (netDeduction || 0) +
            (deductibleHoursPay || 0) +
            (extraPrevMonthLopPay || 0) +
            (extraPrevMonthDeductibleHoursPay || 0) +
            (otherDeduction || 0) +
            (advanceSalaryDeduction || 0)
        );

        const total = round2(totalSalary + netAdditions - netDeductions);

        // WPS SPLIT LOGIC (Al Maraghi Motors only)
        const wpsCapEnabled = row.wps_cap_enabled || false;
        const wpsCapAmount = row.wps_cap_amount ?? 4900;
        const { wpsPay, balance, wpsCapApplied } = calculateWpsSplit(total, wpsCapEnabled, wpsCapAmount);

        return { total, wpsPay, balance, wpsCapApplied, normalOtSalary, specialOtSalary, totalOtSalary, netAdditions, netDeductions, effectiveOtOrIncentive };
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
            const totalSalary = edits.total_salary ?? row.total_salary ?? 0;
            const workingHours = row.working_hours || 9;

            // DIVISOR_OT: Use ot_divisor for OT calculations
            // [MERGE_NOTE: If merging, use salary_divisor for both]
            const divisor = row.salary_divisor || report?.salary_divisor || 30;
            const otDivisor = row.ot_divisor || report?.ot_divisor || divisor;
            const otHourlyRate = totalSalary / otDivisor / workingHours;

            // Apply all admin edits
            if ('total_salary' in edits) updated.total_salary = edits.total_salary;
            if ('working_days' in edits) updated.working_days = edits.working_days;
            if ('present_days' in edits) updated.present_days = edits.present_days;
            if ('full_absence_count' in edits) updated.full_absence_count = edits.full_absence_count;
            if ('annual_leave_count' in edits) updated.annual_leave_count = edits.annual_leave_count;
            if ('leaveDays' in edits) updated.leaveDays = edits.leaveDays;
            if ('salary_leave_days' in edits) updated.salary_leave_days = edits.salary_leave_days;
            if ('deductibleHours' in edits) updated.deductibleHours = edits.deductibleHours;
            
            // Recalculate derived monetary amounts based on current attendance values
            const currentTotalSalary = updated.total_salary;
            const currentSalaryLeaveDays = updated.salary_leave_days || updated.salaryLeaveDays || 0;
            // Salary context rule: keep annual_leave_count and leaveDays aligned to salary_leave_days + LOP.
            const currentAnnualLeaveDays = currentSalaryLeaveDays;
            updated.annual_leave_count = currentAnnualLeaveDays;
            const currentLeaveDays = currentAnnualLeaveDays + (updated.full_absence_count || 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0);
            updated.leaveDays = currentLeaveDays;
            const currentDeductibleHours = updated.deductibleHours || 0;
            const basicSalary = updated.basic_salary || 0;
            const allowances = updated.allowances || 0;
            
            // Recalculate: Leave Pay, Salary Leave Amount, Net Deduction, Deductible Hours Pay
            updated.leavePay = (currentTotalSalary / divisor) * currentLeaveDays;
            updated.salaryLeaveAmount = ((basicSalary + allowances) / divisor) * currentSalaryLeaveDays;
            updated.netDeduction = updated.leavePay - updated.salaryLeaveAmount;
            updated.deductibleHoursPay = (currentTotalSalary / divisor / workingHours) * currentDeductibleHours;
            
            // Apply edits using DIVISOR_OT for OT calculations
             if ('normalOtHours' in edits) {
                 updated.normalOtHours = edits.normalOtHours;
                 updated.normalOtSalary = edits.normalOtSalary ?? round2(otHourlyRate * 1.25 * edits.normalOtHours);
             }
             if ('specialOtHours' in edits) {
                 updated.specialOtHours = edits.specialOtHours;
                 updated.specialOtSalary = edits.specialOtSalary ?? round2(otHourlyRate * 1.5 * edits.specialOtHours);
             }
            if ('normalOtSalary' in edits) updated.normalOtSalary = edits.normalOtSalary;
            if ('specialOtSalary' in edits) updated.specialOtSalary = edits.specialOtSalary;
            if ('totalOtSalary' in edits) updated.totalOtSalary = edits.totalOtSalary;
            if ('otherDeduction' in edits) updated.otherDeduction = edits.otherDeduction;
            if ('bonus' in edits) updated.bonus = edits.bonus;
            if ('incentive' in edits) updated.incentive = edits.incentive;
            if ('open_leave_salary' in edits) updated.open_leave_salary = edits.open_leave_salary;
            if ('variable_salary' in edits) updated.variable_salary = edits.variable_salary;
            if ('advanceSalaryDeduction' in edits) updated.advanceSalaryDeduction = edits.advanceSalaryDeduction;

            // Recalculate total (include previous month deductions)
             const totalOtSalary = (updated.normalOtSalary || 0) + (updated.specialOtSalary || 0);
             const netDeduction = updated.netDeduction || 0;
             const deductibleHoursPay = updated.deductibleHoursPay || 0;
             const extraPrevMonthLopPay = updated.extra_prev_month_lop_pay || 0;
             const extraPrevMonthDeductibleHoursPay = updated.extra_prev_month_deductible_hours_pay || 0;

             // INCENTIVE vs OVERTIME RULE (Al Maraghi Motors — Operations Department Only)
             // Operations dept: pay only the HIGHER of OT vs incentive.
             // All other departments: both OT and incentive are added in full.
             const isOperationsDept = updated.department === 'Operations';
             const effectiveOtOrIncentive = isOperationsDept
                 ? Math.max(round2(totalOtSalary), round2(updated.incentive || 0))
                 : round2(totalOtSalary) + round2(updated.incentive || 0);
             const openLeaveSalary = isAlMaraghi ? asNumber(updated.open_leave_salary || 0) : 0;
             const variableSalary = isAlMaraghi ? asNumber(updated.variable_salary || 0) : 0;
             const netAdditions = (updated.bonus || 0) + effectiveOtOrIncentive + openLeaveSalary + variableSalary;
             const netDeductions = round2(
                 netDeduction +
                 deductibleHoursPay +
                 extraPrevMonthLopPay +
                 extraPrevMonthDeductibleHoursPay +
                 (updated.otherDeduction || 0) +
                 (updated.advanceSalaryDeduction || 0)
             );

             const finalTotal = round2(totalSalary + netAdditions - netDeductions);

             updated.total = finalTotal;

            // WPS SPLIT LOGIC (Al Maraghi Motors only)
            const wpsCapEnabled = updated.wps_cap_enabled || false;
            const wpsCapAmount = updated.wps_cap_amount ?? 4900;

            const { wpsPay, balance, wpsCapApplied } = calculateWpsSplit(finalTotal, wpsCapEnabled, wpsCapAmount);
            updated.wpsPay = Math.round(wpsPay * 100) / 100;
            updated.balance = Math.round(balance);
            updated.wps_cap_applied = wpsCapApplied;

            return updated;
            });

            // Calculate new totals
             let totalSalaryAmount = 0;
             let totalDeductions = 0;
             let totalOtSalary = 0;

             updatedData.forEach(row => {
                 totalSalaryAmount += row.total || 0;
                 totalDeductions += round2(
                    (row.netDeduction || 0) +
                    (row.deductibleHoursPay || 0) +
                    (row.extra_prev_month_lop_pay || 0) +
                    (row.extra_prev_month_deductible_hours_pay || 0) +
                    (row.otherDeduction || 0) +
                    (row.advanceSalaryDeduction || 0)
                 );
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
            // Batch updates with delay to avoid rate limiting
            const snapshotUpdates = [];
            for (const row of updatedData) {
                const edits = editableData[row.hrms_id];
                if (!edits) continue;
                
                const liveSnapshot = liveSalarySnapshots.find(s => 
                    String(s.attendance_id) === String(row.attendance_id)
                );
                
                if (liveSnapshot) {
                    const updatePayload = {};
                    if ('otherDeduction' in edits) updatePayload.otherDeduction = edits.otherDeduction;
                    if ('bonus' in edits) updatePayload.bonus = edits.bonus;
                    if ('incentive' in edits) updatePayload.incentive = edits.incentive;
                    if ('open_leave_salary' in edits) updatePayload.open_leave_salary = edits.open_leave_salary;
                    if ('variable_salary' in edits) updatePayload.variable_salary = edits.variable_salary;
                    if ('advanceSalaryDeduction' in edits) updatePayload.advanceSalaryDeduction = edits.advanceSalaryDeduction;
                    
                    if (Object.keys(updatePayload).length > 0) {
                        snapshotUpdates.push({ id: liveSnapshot.id, payload: updatePayload });
                    }
                }
            }

            // Process snapshot updates in batches of 5 with delay
            const BATCH_SIZE = 5;
            for (let i = 0; i < snapshotUpdates.length; i += BATCH_SIZE) {
                const batch = snapshotUpdates.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(u => base44.entities.SalarySnapshot.update(u.id, u.payload)));
                if (i + BATCH_SIZE < snapshotUpdates.length) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            toast.success('Report saved successfully');
            setEditableData({});
            // Stagger query invalidations to prevent burst of API calls
            queryClient.invalidateQueries({ queryKey: ['salaryReport', reportId] });
            await new Promise(r => setTimeout(r, 500));
            queryClient.invalidateQueries({ queryKey: ['salaryReports', report.project_id] });
            await new Promise(r => setTimeout(r, 500));
            queryClient.invalidateQueries({ queryKey: ['liveSalarySnapshots', report?.report_run_id] });
            await new Promise(r => setTimeout(r, 500));
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
        
        try {
            // Call the backend orchestrator which handles batching and rate limiting server-side
            const response = await base44.functions.invoke('recalculateAllSnapshots', {
                project_id: report?.project_id || project?.id,
                report_run_id: report?.report_run_id,
                salary_report_id: report?.id || reportId
            });

            if (response.data?.success) {
                const { processed, failed } = response.data;
                
                // Refresh data with staggered invalidation to ensure the table reflects new values
                queryClient.invalidateQueries({ queryKey: ['salaryReport', reportId] });
                await new Promise(r => setTimeout(r, 1000));
                queryClient.invalidateQueries({ queryKey: ['liveSalarySnapshots', report?.report_run_id] });

                if (failed === 0) {
                    toast.success(`Recalculated ${processed} employees.`);
                } else {
                    toast.warning(`Recalculated ${processed} employees. ${failed} failed.`);
                    if (response.data.failures?.length > 0) {
                        console.error('Recalculation failures:', response.data.failures);
                    }
                }
            } else {
                toast.error(response.data?.error || 'Failed to recalculate all snapshots');
            }
        } catch (error) {
            toast.error('Error: ' + (error.message || 'Failed to recalculate'));
        } finally {
            setRecalculatingAll(false);
        }
    };

    // Places or releases a manual leave salary hold for a single employee row.
    // Hold amount is the employee's salaryLeaveAmount for this report period.
    // Uses a deterministic auto_key for idempotency to prevent duplicate holds.
    const handleToggleHold = async (row) => {
      if (!canManageHolds) return;
      const autoKey = `${row.hrms_id}_MANUAL_LEAVE_HOLD_${report.report_run_id}`;
      const existingHoldId = activeHolds[row.hrms_id];

      if (existingHoldId) {
        // Release: update status to RELEASED
        try {
          await base44.entities.PayrollHold.update(existingHoldId, {
            status: 'RELEASED',
            updated_by: currentUser?.id,
            updated_date: new Date().toISOString()
          });
          setActiveHolds(prev => {
            const next = { ...prev };
            delete next[row.hrms_id];
            return next;
          });
          toast.success(`Hold released for ${row.name}`);
        } catch (err) {
          console.error('Failed to release hold:', err);
          toast.error('Failed to release hold');
        }
      } else {
        // Place hold: create a new MANUAL PayrollHold record
        try {
          const newHold = await base44.entities.PayrollHold.create({
            employee_id: row.attendance_id,
            hrms_id: row.hrms_id,
            employee_name: row.name,
            company: report.company,
            hold_type: 'MANUAL',
            reason_code: 'MANUAL_LEAVE_SALARY_HOLD',
            amount: row.salaryLeaveAmount || 0,
            status: 'ON_HOLD',
            report_run_id: report.report_run_id,
            defer_period_start: report.date_from,
            defer_period_end: report.date_to,
            notes: 'Manual hold placed from Salary Report Detail',
            auto_key: autoKey,
            created_by: currentUser?.id,
            created_date: new Date().toISOString()
          });
          setActiveHolds(prev => ({
            ...prev,
            [row.hrms_id]: newHold.id
          }));
          toast.success(`Leave salary held for ${row.name}`);
        } catch (err) {
          console.error('Failed to place hold:', err);
          toast.error('Failed to place hold');
        }
      }
    };

    const handleExportToExcel = () => {
        import('xlsx').then(XLSX => {
            const exportData = filteredData.map(row => {
                const { total, wpsPay, balance, wpsCapApplied, normalOtSalary, specialOtSalary, totalOtSalary, netAdditions, netDeductions } = calculateTotals(row);
                const leaveDays = (row.salary_leave_days || row.salaryLeaveDays || row.annual_leave_count || 0) + (row.full_absence_count || 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0);
                const obj = {
                    'ID': row.attendance_id,
                    'Name': row.name,
                    'Department': row.department || '',
                    'Basic': Math.round(row.basic_salary || 0),
                    'Allowances': Math.round(row.allowances || 0),
                    'Allow.+Bonus': Math.round(row.allowances_with_bonus || 0),
                    'Total Salary': Math.round(row.total_salary || 0),
                    'Working Days': row.working_days || 0,
                    'Present': row.present_days || 0,
                    'LOP': (row.full_absence_count || 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0),
                    'Leave': row.salary_leave_days || row.salaryLeaveDays || row.annual_leave_count || 0,
                    'SL Days': asNumber(row.salary_leave_days || row.salaryLeaveDays),
                    'SL Amount': asNumber(row.salaryLeaveAmount),
                    'Bonus': getValue(row, 'bonus'),
                    'N.OT Hrs': (getValue(row, 'normalOtHours') || 0),
                    'N.OT Salary': normalOtSalary,
                    'S.OT Hrs': (getValue(row, 'specialOtHours') || 0),
                    'S.OT Salary': specialOtSalary,
                    'Total OT': totalOtSalary,
                    'Incentive': getValue(row, 'incentive'),
                    'Net Additions': netAdditions,
                    'Leave Days (Ded)': leaveDays,
                    'Leave Pay': asNumber(row.leavePay),
                    'Leave Deduction': row.netDeduction || 0,
                    'Ded Hours': row.deductibleHours || 0,
                    'Ded Pay': row.deductibleHoursPay || 0,
                    'Other Deduction': getValue(row, 'otherDeduction'),
                    'Advance': getValue(row, 'advanceSalaryDeduction'),
                    'Net Deductions': netDeductions,
                    'Total': total,
                    'WPS Pay': wpsPay,
                    'Balance': Math.round(balance),
                    'WPS Cap': wpsCapApplied ? 'Y' : '',
                };
                if (isAlMaraghi) {
                    obj['Open Leave Salary'] = getValue(row, 'open_leave_salary');
                    obj['Variable Salary'] = getValue(row, 'variable_salary');
                }
                return obj;
            });

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Salary Report');
            XLSX.writeFile(wb, `${report?.report_name || 'Salary'}_${report?.date_from}_to_${report?.date_to}.xlsx`);
            toast.success('Excel file downloaded');
        }).catch(() => {
            toast.error('Failed to load Excel library. Please refresh and try again.');
        });
    };

    // ============================================
    // RENDER
    // ============================================
    if (!canAccessSalaryReport && !loadingReport) {
        return (
            <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                    <FileSpreadsheet className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">Access restricted to authorized payroll personnel only</p>
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
                                    <AEDIcon className="w-6 h-6" />
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
                                {isAdmin && (
                                    <Button
                                        onClick={() => setAdminEditMode(!adminEditMode)}
                                        variant={adminEditMode ? "default" : "ghost"}
                                        size="sm"
                                        className={adminEditMode ? "bg-indigo-600 hover:bg-indigo-700" : "text-slate-400 hover:text-slate-600"}
                                        title="Double-click any cell to edit (Admin only)"
                                    >
                                        {adminEditMode ? 'Edit Mode: ON' : '⚡'}
                                    </Button>
                                )}
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
                    <CardContent className="p-0">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <div className="px-6 py-2 border-b bg-slate-50/50">
                                <TabsList className="bg-slate-200/50">
                                    <TabsTrigger value="salary" className="px-6">Salary Report</TabsTrigger>
                                    <TabsTrigger value="onhold" className="px-6 flex gap-2">
                                        On Hold
                                    </TabsTrigger>
                                    <TabsTrigger value="summary" className="px-6">Summary</TabsTrigger>
                                    <TabsTrigger value="branch" className="px-6">Branch</TabsTrigger>
                                    <TabsTrigger value="bodyshop" className="px-6">Body Shop</TabsTrigger>
                                    <TabsTrigger value="cashsalary" className="px-6">Cash Salary</TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="salary" className="p-6 pt-4 m-0">
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
                        <div className="border rounded-lg overflow-x-auto overflow-y-auto max-h-[70vh]">
                            <table className="w-full min-w-max text-xs">
                                <thead className="sticky top-0 z-10">
                                    {/* Group Header Row */}
                                    <tr className="border-b border-slate-300">
                                        <th colSpan={3} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 border-r border-slate-300 sticky left-0 z-30"></th>
                                        <th colSpan={8} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 border-r border-slate-300">Employee Info</th>
                                        <th colSpan={isAlMaraghi ? 12 : 10} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border-r border-slate-300">Additions</th>
                                        <th colSpan={8} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border-r border-slate-300">Deductions</th>
                                        <th colSpan={5} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 border-r border-slate-300">Final</th>
                                        <th className="px-2 py-1.5 bg-slate-100 sticky right-0 z-30"></th>
                                    </tr>
                                    {/* Column Header Row */}
                                    <tr className="border-b border-slate-300 bg-slate-50">
                                        {/* Sticky Left: Checkbox, ID, Name */}
                                        <TableHead className="w-8 bg-slate-100 px-1 sticky left-0 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">✓</TableHead>
                                        <SortableTableHead sortKey="attendance_id" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-100 px-2 sticky left-[32px] z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">ID</SortableTableHead>
                                        <SortableTableHead sortKey="name" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-slate-100 px-2 sticky left-[82px] z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] border-r border-slate-300">Name</SortableTableHead>
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
                                        <SortableTableHead sortKey="leaveDays" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-rose-50 px-2">Lv Days</SortableTableHead>
                                        <SortableTableHead sortKey="leavePay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-rose-50 px-2">Lv Pay</SortableTableHead>
                                        <SortableTableHead sortKey="netDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-rose-50 px-2">Lv Ded.</SortableTableHead>
                                        <SortableTableHead sortKey="deductibleHours" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-rose-50 px-2">Ded Hrs</SortableTableHead>
                                        <SortableTableHead sortKey="deductibleHoursPay" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-rose-50 px-2">Ded Pay</SortableTableHead>
                                        <SortableTableHead sortKey="otherDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-rose-50 px-2">Other</SortableTableHead>
                                        <SortableTableHead sortKey="advanceSalaryDeduction" currentSort={sortColumn} onSort={setSortColumn} className="whitespace-nowrap bg-rose-50 px-2">Advance</SortableTableHead>
                                        <TableHead className="whitespace-nowrap bg-rose-200 px-2 font-bold border-r border-slate-300">Net Ded.</TableHead>
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
                                    <td colSpan={35} className="text-center py-12">
                                                <p className="text-slate-500">No employees match your search</p>
                                            </td>
                                        </tr>
                                    ) : filteredData.map((row, idx) => {
                                        const { total, wpsPay, balance, wpsCapApplied, normalOtSalary, specialOtSalary, totalOtSalary, netAdditions, netDeductions } = calculateTotals(row);
                                        
                                        // Determine if this employee is eligible for a manual leave salary hold
                                        // Condition: at least 2 LOP days OR at least 2 annual leave days, and has leave salary
                                        const isHoldEligible = ((row.full_absence_count || 0) >= 2 || (row.annual_leave_count || 0) >= 2)
                                            && (row.salaryLeaveAmount || 0) > 0;

                                        // Check if a hold is currently active for this employee in this report
                                        const isHeld = !!activeHolds[row.hrms_id];

                                        // If held, subtract salaryLeaveAmount from displayed total and wpsPay
                                        // This is display-only — does not modify the underlying snapshot_data
                                        const displayTotal = isHeld ? total - (row.salaryLeaveAmount || 0) : total;
                                        const displayWpsPay = isHeld ? wpsPay - (row.salaryLeaveAmount || 0) : wpsPay;

                                        const stripe = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
                                        const cellBase = `px-2 py-1.5 align-middle text-xs tabular-nums`;
                                        return (
                                            <tr key={row.hrms_id} className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors ${stripe}`}>
                                                {/* Sticky Left: Checkbox, ID, Name */}
                                                <td className={`${cellBase} px-1 sticky left-0 z-10 ${stripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>
                                                    <Checkbox
                                                        checked={row.isVerified}
                                                        onCheckedChange={() => toggleVerification(row.attendance_id)}
                                                        className="h-3.5 w-3.5"
                                                    />
                                                </td>
                                                <td className={`${cellBase} font-medium text-slate-700 sticky left-[32px] z-10 ${stripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>{row.attendance_id}</td>
                                                <td className={`${cellBase} font-medium text-slate-800 sticky left-[82px] z-10 ${stripe} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)] border-r border-slate-200`}>{row.name?.split(' ').slice(0, 2).join(' ')}</td>
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

                                                {/* Additions */}
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

                                                {/* Deductions */}
                                                <td className={`${cellBase} bg-rose-50/50`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                    {adminEditMode && isAdmin ? (
                                                        <Input type="number" step="0.01" value={(((getValue(row, 'salary_leave_days') ?? getValue(row, 'salaryLeaveDays') ?? getValue(row, 'annual_leave_count') ?? 0) + (getValue(row, 'full_absence_count') ?? row.full_absence_count ?? 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0))).toFixed(2)} readOnly className="h-6 text-xs w-12 px-1 bg-slate-100" />
                                                    ) : (((row.salary_leave_days || row.salaryLeaveDays || row.annual_leave_count || 0) + (row.full_absence_count || 0) + (row.lop_adjacent_weekly_off_count || 0) + (row.lop_leave_days || 0))).toFixed(2)}
                                                </td>
                                                <td className={`${cellBase} bg-rose-50/50`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                    {adminEditMode && isAdmin ? (
                                                        <Input type="number" step="0.01" value={getValue(row, 'leavePay')} onChange={(e) => handleChange(row.hrms_id, 'leavePay', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                                    ) : (asNumber(row.leavePay)).toFixed(2)}
                                                </td>
                                                <td className={`${cellBase} bg-rose-50/50 font-semibold`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                    {adminEditMode && isAdmin ? (
                                                        <Input type="number" step="0.01" value={getValue(row, 'netDeduction')} onChange={(e) => handleChange(row.hrms_id, 'netDeduction', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                                    ) : (row.netDeduction || 0).toFixed(2)}
                                                </td>
                                                <td className={`${cellBase} bg-rose-50/50`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                    {adminEditMode && isAdmin ? (
                                                        <Input type="number" step="0.01" value={getValue(row, 'deductibleHours')} onChange={(e) => handleChange(row.hrms_id, 'deductibleHours', e.target.value)} className="h-6 text-xs w-12 px-1" />
                                                    ) : (row.deductibleHours || 0).toFixed(2)}
                                                </td>
                                                <td className={`${cellBase} bg-rose-50/50`} onDoubleClick={() => isAdmin && setAdminEditMode(true)}>
                                                    {adminEditMode && isAdmin ? (
                                                        <Input type="number" step="0.01" value={getValue(row, 'deductibleHoursPay')} onChange={(e) => handleChange(row.hrms_id, 'deductibleHoursPay', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                                    ) : (row.deductibleHoursPay || 0).toFixed(2)}
                                                </td>
                                                <td className={`${cellBase} bg-rose-50/50 px-1`}>
                                                    <Input type="number" step="0.01" value={getValue(row, 'otherDeduction')} onChange={(e) => handleChange(row.hrms_id, 'otherDeduction', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                                </td>
                                                <td className={`${cellBase} bg-rose-50/50 px-1`}>
                                                    <Input type="number" step="0.01" value={getValue(row, 'advanceSalaryDeduction')} onChange={(e) => handleChange(row.hrms_id, 'advanceSalaryDeduction', e.target.value)} className="h-6 text-xs w-14 px-1" />
                                                </td>
                                                <td className={`${cellBase} bg-rose-100 font-bold border-r border-slate-200`}>{netDeductions.toFixed(2)}</td>

                                                {/* Final */}
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

                                                {/* Manual leave salary hold button — only shown for eligible rows */}
                                                <td className={`${cellBase} bg-indigo-50 text-center whitespace-nowrap pb-2`}>
                                                    {isHoldEligible && canManageHolds ? (
                                                        <Button
                                                            size="sm"
                                                            variant={isHeld ? "outline" : "destructive"}
                                                            className={isHeld
                                                                ? "text-xs px-2 py-1 h-7 border-amber-400 text-amber-700 hover:bg-amber-50"
                                                                : "text-xs px-2 py-1 h-7"
                                                            }
                                                            onClick={() => handleToggleHold(row)}
                                                        >
                                                            {isHeld ? "Release" : "Hold"}
                                                        </Button>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs">—</span>
                                                    )}
                                                </td>

                                                <td className={`${cellBase} text-center sticky right-0 z-10 ${stripe} shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.05)]`}>
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
                                </tbody>
                            </table>
                            </div>
                            </TabsContent>

                            <TabsContent value="onhold" className="p-6 m-0">
                                <OnHoldTab report={report} project={project} />
                            </TabsContent>

                            {/* Summary tab — mirrors Main Sheet from Excel payroll file */}
                            <TabsContent value="summary" className="p-6 m-0">
                                <SummaryTab
                                    salaryData={salaryData}
                                    report={report}
                                    project={project}
                                    onSaveManualFields={handleSaveManualFields}
                                />
                            </TabsContent>

                            {/* Branch tab — all employees except Bodyshop department */}
                            <TabsContent value="branch" className="p-6 m-0">
                                <BranchPayrollTab salaryData={salaryData} />
                            </TabsContent>

                            {/* Body Shop tab — Bodyshop department employees only */}
                            <TabsContent value="bodyshop" className="p-6 m-0">
                                <BodyShopPayrollTab salaryData={salaryData} />
                            </TabsContent>

                            {/* Cash Salary tab — employees with balance > 0 after WPS cap */}
                            <TabsContent value="cashsalary" className="p-6 m-0">
                                <CashSalaryTab salaryData={salaryData} />
                            </TabsContent>
                        </Tabs>
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