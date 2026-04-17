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
import { Link, useNavigate } from 'react-router-dom';
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
    const [activeTab, setActiveTab] = useState('branch');
    // Tracks which employee hrms_ids currently have an active ON_HOLD PayrollHold
    // record for this report. Keyed by hrms_id, value is the PayrollHold record id.
    const [activeHolds, setActiveHolds] = useState({});

    // Controls visibility of the stats bar — hidden by default on page open
    const [showStats, setShowStats] = useState(false);

    // Tracks inline edits to divisor fields and prev_month_days in the header
    const [divisorEdits, setDivisorEdits] = useState({});
    const [prevMonthDaysEdit, setPrevMonthDaysEdit] = useState('');

    const navigate = useNavigate();

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

    // Loads the company summary template from SummaryTemplate entity
    // Returns the cards array if a template exists, or null if none found
    const handleLoadTemplate = async () => {
        try {
            const templates = await base44.entities.SummaryTemplate.filter({
                company: project?.company
            }, null, 1);
            if (templates && templates.length > 0) {
                const tmpl = templates[0];
                const data = typeof tmpl.template_data === 'string'
                    ? JSON.parse(tmpl.template_data)
                    : tmpl.template_data;
                if (data?.cards && Array.isArray(data.cards)) {
                    return data.cards;
                }
            }
            return null;
        } catch (err) {
            console.error('Failed to load summary template:', err);
            return null;
        }
    };

    // Saves the current summary card layout as the company template
    // Upserts: updates existing template if one exists, creates new if not
    const handleSaveAsTemplate = async (cards) => {
        try {
            const existing = await base44.entities.SummaryTemplate.filter({
                company: project?.company
            }, null, 1);
            const templateData = { cards };
            if (existing && existing.length > 0) {
                // Update existing template
                await base44.entities.SummaryTemplate.update(existing[0].id, {
                    template_data: templateData,
                    updated_by: currentUser?.email || currentUser?.id || 'unknown',
                    updated_date: new Date().toISOString()
                });
            } else {
                // Create new template for this company
                await base44.entities.SummaryTemplate.create({
                    company: project?.company,
                    template_data: templateData,
                    updated_by: currentUser?.email || currentUser?.id || 'unknown',
                    updated_date: new Date().toISOString()
                });
            }
        } catch (err) {
            console.error('Failed to save summary template:', err);
            throw err;
        }
    };

    // Saves edited salary_divisor and ot_divisor to the SalaryReport entity
    const saveDivisors = async () => {
        try {
            const updates = {};
            if (divisorEdits.salary_divisor !== undefined)
                updates.salary_divisor = Number(divisorEdits.salary_divisor);
            if (divisorEdits.ot_divisor !== undefined)
                updates.ot_divisor = Number(divisorEdits.ot_divisor);

            if (Object.keys(updates).length === 0) return;

            await base44.entities.SalaryReport.update(report.id, updates);
            setDivisorEdits({});
            queryClient.invalidateQueries({ queryKey: ['salaryReport', reportId] });
            toast.success('Divisors updated');
        } catch (err) {
            console.error('Failed to save divisors:', err);
            toast.error('Failed to save divisors');
        }
    };

    const savePrevMonthDays = async () => {
        if (prevMonthDaysEdit === '') return;
        try {
            await base44.entities.SalaryReport.update(report.id, {
                prev_month_days: Number(prevMonthDaysEdit)
            });
            setPrevMonthDaysEdit('');
            queryClient.invalidateQueries({ queryKey: ['salaryReport', reportId] });
            toast.success('Prev month days updated');
        } catch (err) {
            console.error('Failed to save prev_month_days:', err);
            toast.error('Failed to save prev month days');
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
    
    // Tab visibility rules by role
    // Salary Report tab: admin and ceo only
    const canSeeSalaryReport = userRole === 'admin' || userRole === 'ceo';

    // Cash Salary and Summary tabs: all except supervisor
    const canSeeCashAndSummary = ['admin', 'ceo', 'hr_manager', 'senior_accountant'].includes(userRole);

    // Branch, Body Shop, On Hold: all roles
    const canSeeBranchTabs = true;
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

    // Load existing manual leave salary holds for this report on mount
    // Filters by company and status only, scopes to employees in this report client-side
    useEffect(() => {
      if (!report?.company || salaryData.length === 0) return;
      const loadHolds = async () => {
        try {
          const holds = await base44.entities.PayrollHold.filter({
            company: report.company,
            status: 'ON_HOLD'
          });
          const reportHrmsIds = new Set(salaryData.map(r => String(r.hrms_id)));
          const holdMap = {};
          (holds || []).forEach(h => {
            if (reportHrmsIds.has(String(h.hrms_id))) {
              holdMap[h.hrms_id] = h.id;
            }
          });
          setActiveHolds(holdMap);
        } catch (err) {
          console.error('Failed to load manual holds:', err);
        }
      };
      loadHolds();
    }, [report?.company, salaryData.length]);

    // ============================================
    // HANDLERS (must be defined before useMemos that use them)
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

    // Compute summary stats from salaryData for the header stats bar
    const headerStats = useMemo(() => {
        let totalWps = 0, totalNet = 0, totalCash = 0, verifiedCount = 0, onHoldCount = 0;
        salaryData.forEach(row => {
            const { total, wpsPay, balance } = calculateTotals(row);
            const isHeld = !!activeHolds[row.hrms_id];
            
            const displayTotal = isHeld ? total - (row.salaryLeaveAmount || 0) : total;
            const displayWps = isHeld ? wpsPay - (row.salaryLeaveAmount || 0) : wpsPay;
            
            totalWps += displayWps;
            totalNet += displayTotal;
            totalCash += (row.balance || balance || 0);
            if (verifiedEmployees.includes(String(row.attendance_id))) verifiedCount++;
            if (activeHolds[row.hrms_id]) onHoldCount++;
        });
        return {
            totalWps,
            totalNet,
            totalCash,
            verifiedCount,
            totalEmployees: salaryData.length,
            onHoldCount
        };
    }, [salaryData, activeHolds, verifiedEmployees, calculateTotals]);

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
            hold_type: 'MANUAL_HOLD',
            source: 'MANUAL',
            reason_code: 'MANUAL_LEAVE_SALARY_HOLD',
            amount: row.salaryLeaveAmount || 0,
            status: 'ON_HOLD',
            origin_period_start: report.date_from,
            origin_period_end: report.date_to,
            notes: `Manual hold placed from Salary Report Detail. Report run: ${report.report_run_id}`,
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
                    <CardHeader className="pb-0">
                        <div className="flex items-start justify-between gap-4 flex-wrap">

                            {/* Left: title block */}
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium uppercase tracking-widest text-slate-400">
                                    Salary Report
                                </span>
                                <h2 className="text-lg font-medium text-slate-900">
                                    {report.report_name || `${report.date_from} to ${report.date_to}`}
                                </h2>

                                {/* Meta chips row */}
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {/* Date range chip */}
                                    <span className="text-xs bg-slate-100 text-slate-600 rounded-md px-2.5 py-1 border border-slate-200">
                                        {report.date_from} — {report.date_to}
                                    </span>
                                    {/* Employee count chip */}
                                    <span className="text-xs bg-slate-100 text-slate-600 rounded-md px-2.5 py-1 border border-slate-200">
                                        {report.employee_count} employees
                                    </span>
                                    {/* Company chip */}
                                    <span className="text-xs bg-slate-100 text-slate-600 rounded-md px-2.5 py-1 border border-slate-200">
                                        {report.company}
                                    </span>

                                    {/* Salary divisor — inline editable chip */}
                                    <span className="text-xs bg-slate-100 text-slate-600 rounded-md px-2.5 py-1 border border-slate-200 flex items-center gap-1">
                                        Salary divisor:&nbsp;
                                        {isAdmin ? (
                                            <input
                                                type="number"
                                                value={divisorEdits.salary_divisor !== undefined
                                                    ? divisorEdits.salary_divisor
                                                    : (report.salary_divisor || '')}
                                                onChange={e => setDivisorEdits(prev => ({
                                                    ...prev,
                                                    salary_divisor: e.target.value
                                                }))}
                                                onBlur={saveDivisors}
                                                onKeyDown={e => e.key === 'Enter' && saveDivisors()}
                                                className="w-10 bg-white border border-slate-300 rounded px-1 text-xs text-center
                            focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                            />
                                        ) : (
                                            <span>{report.salary_divisor}</span>
                                        )}
                                    </span>

                                    {/* OT / Prev Month divisor — inline editable chip */}
                                    <span className="text-xs bg-slate-100 text-slate-600 rounded-md px-2.5 py-1 border border-slate-200 flex items-center gap-1">
                                        OT / Prev month divisor:&nbsp;
                                        {isAdmin ? (
                                            <input
                                                type="number"
                                                value={divisorEdits.ot_divisor !== undefined
                                                    ? divisorEdits.ot_divisor
                                                    : (report.ot_divisor || '')}
                                                onChange={e => setDivisorEdits(prev => ({
                                                    ...prev,
                                                    ot_divisor: e.target.value
                                                }))}
                                                onBlur={saveDivisors}
                                                onKeyDown={e => e.key === 'Enter' && saveDivisors()}
                                                className="w-10 bg-white border border-slate-300 rounded px-1 text-xs text-center
                            focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                            />
                                        ) : (
                                            <span>{report.ot_divisor}</span>
                                        )}
                                        {salaryData[0]?.prev_month_divisor > 0 && <span className="opacity-60">/ {salaryData[0].prev_month_divisor}</span>}
                                    </span>

                                    {/* Prev Month Days — inline editable chip */}
                                    <span className="text-xs bg-slate-100 text-slate-600 rounded-md px-2.5 py-1 border border-slate-200 flex items-center gap-1">
                                        Prev month days:&nbsp;
                                        {isAdmin ? (
                                            <input
                                                type="number"
                                                placeholder="—"
                                                value={prevMonthDaysEdit !== ''
                                                    ? prevMonthDaysEdit
                                                    : (report.prev_month_days ?? '')}
                                                onChange={e => setPrevMonthDaysEdit(e.target.value)}
                                                onBlur={savePrevMonthDays}
                                                onKeyDown={e => e.key === 'Enter' && savePrevMonthDays()}
                                                className="w-10 bg-white border border-slate-300 rounded px-1 text-xs text-center
                                                    focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                            />
                                        ) : (
                                            <span>{report.prev_month_days ?? '—'}</span>
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Right: action buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Admin Edit Mode toggle */}
                                {isAdmin && (
                                    <Button
                                        onClick={() => setAdminEditMode(!adminEditMode)}
                                        variant={adminEditMode ? "default" : "ghost"}
                                        size="sm"
                                        className={adminEditMode ? "bg-indigo-600 hover:bg-indigo-700 text-sm h-9" : "text-slate-400 hover:text-slate-600 text-sm h-9"}
                                        title="Double-click any cell to edit (Admin only)"
                                    >
                                        {adminEditMode ? 'Edit Mode: ON' : '⚡ Edit Mode'}
                                    </Button>
                                )}

                                {/* Save Changes button — only shown when edits exist */}
                                {(Object.keys(editableData).length > 0 || adminEditMode) && (
                                    <Button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 h-9"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {isSaving ? 'Saving...' : 'Save changes'}
                                    </Button>
                                )}

                                {/* Recalculate All — existing logic preserved */}
                                {canRecalculate && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setConfirmRecalcAll(true)}
                                        disabled={recalculatingAll || salaryData.length === 0}
                                        className="text-sm h-9 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                    >
                                        <RefreshCw className={`w-4 h-4 mr-2 ${recalculatingAll ? 'animate-spin' : ''}`} />
                                        Recalculate all
                                    </Button>
                                )}

                                {/* Export Excel — existing logic preserved */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExportToExcel}
                                    className="text-sm h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Export Excel
                                </Button>

                                {/* Divider */}
                                <div className="w-px h-6 bg-slate-200 mx-1" />

                                {/* Back to project — using Link since it was existing, but styled as button */}
                                <Link to={createPageUrl('ProjectDetail') + `?id=${project?.id}`}>
                                    <Button variant="ghost" size="sm" className="text-sm h-9 text-slate-500">
                                        <ArrowLeft className="w-4 h-4 mr-2" />
                                        Back to project
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        {/* Stats bar — collapsible, hidden by default */}
                        <div className="mt-3 pt-3 border-t border-slate-100">
                            <button
                                onClick={() => setShowStats(prev => !prev)}
                                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600
                    transition-colors mb-2 select-none"
                            >
                                {/* Toggle arrow */}
                                <span style={{
                                    display: 'inline-block',
                                    transform: showStats ? 'rotate(90deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.15s'
                                }}>▶</span>
                                {showStats ? 'Hide summary' : 'Show summary'}
                            </button>

                            {showStats && (
                                <div className="flex flex-wrap gap-x-6 gap-y-3 pb-4">

                                    {/* Total WPS payable */}
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-xs text-slate-400">Total WPS payable</span>
                                        <span className="text-base font-medium text-emerald-700 tabular-nums">
                                            AED {headerStats.totalWps.toLocaleString('en-AE', {
                                                minimumFractionDigits: 2, maximumFractionDigits: 2
                                            })}
                                        </span>
                                    </div>

                                    <div className="w-px bg-slate-200 self-stretch" />

                                    {/* Net payable */}
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-xs text-slate-400">Net payable</span>
                                        <span className="text-base font-medium text-emerald-700 tabular-nums">
                                            AED {headerStats.totalNet.toLocaleString('en-AE', {
                                                minimumFractionDigits: 2, maximumFractionDigits: 2
                                            })}
                                        </span>
                                    </div>

                                    <div className="w-px bg-slate-200 self-stretch" />

                                    {/* Cash balance */}
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-xs text-slate-400">Cash balance</span>
                                        <span className="text-base font-medium text-amber-600 tabular-nums">
                                            AED {headerStats.totalCash.toLocaleString('en-AE', {
                                                minimumFractionDigits: 2, maximumFractionDigits: 2
                                            })}
                                        </span>
                                    </div>

                                    <div className="w-px bg-slate-200 self-stretch" />

                                    {/* Verified */}
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-xs text-slate-400">Verified</span>
                                        <span className="text-base font-medium text-slate-700 tabular-nums">
                                            {headerStats.verifiedCount} / {headerStats.totalEmployees}
                                        </span>
                                    </div>

                                    <div className="w-px bg-slate-200 self-stretch" />

                                    {/* On hold */}
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-xs text-slate-400">On hold</span>
                                        <span className="text-base font-medium text-amber-600 tabular-nums">
                                            {headerStats.onHoldCount} {headerStats.onHoldCount === 1 ? 'employee' : 'employees'}
                                        </span>
                                    </div>

                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <div className="px-6 py-2 border-b bg-slate-50/50">
                                <TabsList className="bg-slate-200/50">
                                    {/* Branch tab — visible to all roles */}
                                    <TabsTrigger value="branch" className="px-6">Branch</TabsTrigger>

                                    {/* Body Shop tab — visible to all roles */}
                                    <TabsTrigger value="bodyshop" className="px-6">Body Shop</TabsTrigger>

                                    {/* On Hold tab — visible to all roles */}
                                    <TabsTrigger value="onhold" className="px-6">On Hold</TabsTrigger>

                                    {/* Cash Salary tab — hidden from supervisor */}
                                    {canSeeCashAndSummary && (
                                        <TabsTrigger value="cashsalary" className="px-6">Cash Salary</TabsTrigger>
                                    )}

                                    {/* Summary tab — hidden from supervisor */}
                                    {canSeeCashAndSummary && (
                                        <TabsTrigger value="summary" className="px-6">Summary</TabsTrigger>
                                    )}

                                    {/* Salary Report tab — admin and ceo only */}
                                    {canSeeSalaryReport && (
                                        <TabsTrigger value="salary" className="px-6">Salary Report</TabsTrigger>
                                    )}
                                </TabsList>
                            </div>

                            {canSeeSalaryReport && (
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
                                            <th colSpan={10} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border-r border-slate-300">Deductions</th>
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
                                            <SortableTableHead
                                                sortKey="extra_prev_month_lop_days"
                                                currentSort={sortColumn}
                                                onSort={setSortColumn}
                                                className="whitespace-nowrap bg-rose-50 px-2"
                                            >
                                                Prev LOP Days
                                            </SortableTableHead>
                                            <SortableTableHead
                                                sortKey="extra_prev_month_lop_pay"
                                                currentSort={sortColumn}
                                                onSort={setSortColumn}
                                                className="whitespace-nowrap bg-rose-50 px-2"
                                            >
                                                Prev LOP Pay
                                            </SortableTableHead>
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
                                            <td colSpan={37} className="text-center py-12">
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
                                                            checked={verifiedEmployees.includes(String(row.attendance_id))}
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
                                                    {/* Previous month LOP days from AnalysisResult via createSalarySnapshotsV2 */}
                                                    <td className={`${cellBase} bg-rose-50/50`}>
                                                        {(row.extra_prev_month_lop_days || 0).toFixed(0)}
                                                    </td>
                                                    {/* Previous month LOP pay calculated at previous month salary rate */}
                                                    <td className={`${cellBase} bg-rose-50/50`}>
                                                        {(row.extra_prev_month_lop_pay || 0).toFixed(2)}
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
                            )}

                            <TabsContent value="onhold" className="p-6 m-0">
                                <OnHoldTab report={report} project={project} />
                            </TabsContent>

                            {/* Summary tab — mirrors Main Sheet from Excel payroll file */}
                            {canSeeCashAndSummary && (
                                <TabsContent value="summary" className="p-6 m-0">
                                    <SummaryTab
                                        salaryData={salaryData}
                                        report={report}
                                        project={project}
                                        onSaveManualFields={handleSaveManualFields}
                                        onLoadTemplate={handleLoadTemplate}
                                        onSaveAsTemplate={handleSaveAsTemplate}
                                        userRole={userRole}
                                        currentUser={currentUser}
                                    />
                                </TabsContent>
                            )}

                            {/* Branch tab — all employees except Bodyshop department */}
                            <TabsContent value="branch" className="p-6 m-0">
                                <BranchPayrollTab 
                                    salaryData={salaryData}
                                    adminEditMode={adminEditMode}
                                    setAdminEditMode={setAdminEditMode}
                                    editableData={editableData}
                                    handleChange={handleChange}
                                    handleSave={handleSave}
                                    getValue={getValue}
                                    calculateTotals={calculateTotals}
                                    activeHolds={activeHolds}
                                    handleToggleHold={handleToggleHold}
                                    canManageHolds={canManageHolds}
                                    verifiedEmployees={verifiedEmployees}
                                    toggleVerification={toggleVerification}
                                    isAdmin={isAdmin}
                                    userRole={userRole}
                                    searchQuery={searchQuery}
                                    setSearchQuery={setSearchQuery}
                                    sortColumn={sortColumn}
                                    setSortColumn={setSortColumn}
                                    verifyAllClean={verifyAllClean}
                                    setSelectedSnapshot={setSelectedSnapshot}
                                    isAlMaraghi={isAlMaraghi}
                                    asNumber={asNumber}
                                />
                            </TabsContent>

                            {/* Body Shop tab — Bodyshop department employees only */}
                            <TabsContent value="bodyshop" className="p-6 m-0">
                                <BodyShopPayrollTab 
                                    salaryData={salaryData}
                                    adminEditMode={adminEditMode}
                                    setAdminEditMode={setAdminEditMode}
                                    editableData={editableData}
                                    handleChange={handleChange}
                                    handleSave={handleSave}
                                    getValue={getValue}
                                    calculateTotals={calculateTotals}
                                    activeHolds={activeHolds}
                                    handleToggleHold={handleToggleHold}
                                    canManageHolds={canManageHolds}
                                    verifiedEmployees={verifiedEmployees}
                                    toggleVerification={toggleVerification}
                                    isAdmin={isAdmin}
                                    userRole={userRole}
                                    searchQuery={searchQuery}
                                    setSearchQuery={setSearchQuery}
                                    sortColumn={sortColumn}
                                    setSortColumn={setSortColumn}
                                    verifyAllClean={verifyAllClean}
                                    setSelectedSnapshot={setSelectedSnapshot}
                                    isAlMaraghi={isAlMaraghi}
                                    asNumber={asNumber}
                                />
                            </TabsContent>

                            {/* Cash Salary tab — employees with balance > 0 after WPS cap */}
                            {canSeeCashAndSummary && (
                                <TabsContent value="cashsalary" className="p-6 m-0">
                                    <CashSalaryTab salaryData={salaryData} />
                                </TabsContent>
                            )}
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