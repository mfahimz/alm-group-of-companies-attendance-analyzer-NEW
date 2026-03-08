/**
 * FunctionRunner.jsx — Developer Module: Function Runner Section
 *
 * PURPOSE:
 * Provides admin users with a catalog of every backend function in the app.
 * Each function can be invoked directly with arbitrary parameters, and the
 * raw response plus execution time are displayed immediately.
 *
 * WHY CONFIRMATION STEPS ARE REQUIRED:
 * Every backend function in this catalog has the potential to mutate live
 * production data — recalculating salary, creating records, deleting punches,
 * syncing employee data, etc. A confirmation step makes the admin explicitly
 * acknowledge that execution will affect live production data before the
 * function is actually invoked, preventing accidental runs.
 *
 * SESSION HISTORY:
 * The last 20 executions are stored in React state (in memory). History resets
 * on page reload because it is not persisted anywhere — it is purely a
 * convenience reference for the current session.
 *
 * This component is scoped exclusively to the Developer Module page and must
 * never be imported or rendered anywhere else in the application.
 */

import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Play,
    Clock,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Eye,
    Loader2,
    Terminal,
    History,
} from 'lucide-react';

/**
 * Complete catalog of all backend functions in the application.
 *
 * WHY ALL FUNCTIONS ARE INCLUDED, NOT A CURATED SUBSET:
 * A curated list of ~36 functions would only show the "happy path" and hide the
 * utility, migration, and debug functions that admins occasionally need. New functions
 * added to the /functions/ directory might be overlooked if they're not manually
 * added to this list, defeating the diagnostic purpose of the FunctionRunner.
 *
 * By including every function in the /functions/ directory, we guarantee nothing
 * is hidden. If a function exists, it appears here. This prevents admins from
 * discovering that a critical utility function wasn't available when they needed it.
 *
 * Each entry defines the function name (must exactly match the filename
 * in /functions/ without extension), a human-readable description of what it does,
 * and the list of parameters it accepts.
 *
 * params: Array of { name: string, label: string, placeholder: string, required: boolean }
 * An empty params array means the function takes no input.
 * For functions with obvious parameters, they are defined explicitly.
 * For functions with no obvious parameters, a single free-text input is provided for optional arguments.
 */
const FUNCTION_CATALOG = [
    { name: 'addHomePagePermission', description: 'Adds permission for the Home page to a user or role', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'adminFinalizeReport', description: 'Marks a ReportRun as final, locking it from further edits', params: [{ name: 'report_run_id', label: 'Report Run ID', placeholder: '', required: true }, { name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'analyzePayrollWithAI', description: 'Runs AI-powered payroll analysis on a project for anomaly detection', params: [{ name: 'project_id', label: 'Project ID', placeholder: 'e.g. abc123', required: true }, { name: 'analysis_type', label: 'Analysis Type', placeholder: 'e.g. full, summary', required: false }] },
    { name: 'applyRamadanShifts', description: 'Applies Ramadan shift schedule to punches within a date range', params: [{ name: 'projectId', label: 'Project ID', placeholder: '', required: true }, { name: 'ramadanScheduleId', label: 'Ramadan Schedule ID', placeholder: '', required: true }, { name: 'ramadanFrom', label: 'Ramadan From (YYYY-MM-DD)', placeholder: '2025-03-01', required: true }, { name: 'ramadanTo', label: 'Ramadan To (YYYY-MM-DD)', placeholder: '2025-03-29', required: true }] },
    { name: 'auditDeductibleMismatch', description: 'Audits and logs mismatches in deductible minute calculations', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'auditReportRunIntegrity', description: 'Verifies integrity of a ReportRun and its associated snapshots', params: [{ name: 'report_run_id', label: 'Report Run ID', placeholder: '', required: true }] },
    { name: 'backfillReportMissingEmployees', description: 'Backfills missing employee records in an existing report', params: [{ name: 'report_id', label: 'Report ID', placeholder: '', required: true }] },
    { name: 'backfillSalaryExtraPrevMonthDeductibleMinutes', description: 'Backfills extra deductible minutes from previous month', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'backfillSalaryReportFromSnapshots', description: 'Rebuilds salary report data from existing snapshots', params: [{ name: 'report_id', label: 'Report ID', placeholder: '', required: true }] },
    { name: 'checkEmployeeCarriedGrace', description: 'Checks and returns carried grace minutes for an employee', params: [{ name: 'employee_id', label: 'Employee ID', placeholder: '', required: true }, { name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'cleanupQuarterlyMinutes', description: 'Removes orphaned or stale EmployeeQuarterlyMinutes records', params: [] },
    { name: 'closeCycle', description: 'Closes a CalendarCycle, preventing further edits', params: [{ name: 'calendar_cycle_id', label: 'Calendar Cycle ID', placeholder: '', required: true }] },
    { name: 'closeProject', description: 'Closes a payroll project, optionally carrying forward grace minutes', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }, { name: 'carry_forward_grace_minutes', label: 'Carry Forward Grace Minutes (true/false)', placeholder: 'true', required: false }] },
    { name: 'computeMonthEndAssumedDates', description: 'Computes assumed end dates for payroll month calculations', params: [{ name: 'payroll_month_label', label: 'Payroll Month Label (YYYY-MM)', placeholder: '2025-03', required: true }] },
    { name: 'create2026QuarterlyMinutes', description: 'Creates quarterly minutes records for all employees in 2026', params: [] },
    { name: 'createAnnualLeaveChecklistTasks', description: 'Creates checklist tasks for annual leave records', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'createCalendarCycle', description: 'Creates a new CalendarCycle with cutoff date range', params: [{ name: 'name', label: 'Cycle Name', placeholder: 'e.g. March 2025', required: false }, { name: 'cutoff_start_date', label: 'Cutoff Start Date (YYYY-MM-DD)', placeholder: '2025-03-01', required: true }, { name: 'cutoff_end_date', label: 'Cutoff End Date (YYYY-MM-DD)', placeholder: '2025-03-31', required: true }, { name: 'notes', label: 'Notes', placeholder: 'Optional notes', required: false }] },
    { name: 'createOtherMinutesChecklistTask', description: 'Creates a checklist task for other types of minutes', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'createReportChecklistTasks', description: 'Creates checklist tasks for a ReportRun', params: [{ name: 'report_run_id', label: 'Report Run ID', placeholder: '', required: true }] },
    { name: 'createSalarySnapshots', description: 'Generates SalarySnapshot records for all active employees', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'createSalarySnapshotsForDateRange', description: 'Creates snapshots for employees within a specific date range', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'debugGraceFullFlow', description: 'Debugs the complete grace minutes calculation and carry-forward flow', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'debugGraceMinutes', description: 'Debugs grace minutes calculations for a project', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'deleteNovemberReports', description: 'Deletes all report runs from November (cleanup utility)', params: [] },
    { name: 'deleteProjectPunches', description: 'Deletes all punch records for a project', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'deleteQuarterlyMinutes2026', description: 'Deletes quarterly minutes records from 2026 (cleanup)', params: [] },
    { name: 'enableApprovedMinutesForAlMaraghi', description: 'Enables approved minutes for Al Maraghi company', params: [] },
    { name: 'exportToPrivateFile', description: 'Exports report data to a PrivateFile storage record', params: [{ name: 'type', label: 'Export Type', placeholder: 'e.g. salary_report', required: true }, { name: 'fileName', label: 'File Name', placeholder: 'e.g. report.xlsx', required: true }, { name: 'projectId', label: 'Project ID', placeholder: '', required: false }, { name: 'reportRunId', label: 'Report Run ID', placeholder: '', required: false }] },
    { name: 'findAndFixDuplicateQuarterlyMinutes', description: 'Finds and removes duplicate quarterly minutes records', params: [] },
    { name: 'fixAllDeductibleMinutes', description: 'Recalculates and fixes all deductible minute entries', params: [] },
    { name: 'fixAnalysisResultAttendanceIds', description: 'Corrects attendance ID references in analysis results', params: [] },
    { name: 'fixAttendanceIdTypes', description: 'Migrates attendance IDs to correct data types', params: [] },
    { name: 'fixSalaryRecordByAttendanceId', description: 'Corrects a salary record using attendance ID matching', params: [{ name: 'attendance_id', label: 'Attendance ID', placeholder: '', required: true }] },
    { name: 'fixSalarySnapshotDeductibleHours', description: 'Fixes deductible hours in salary snapshots', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'forcePunchDelete', description: 'Force-deletes punch records (admin override)', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }, { name: 'punch_id', label: 'Punch ID', placeholder: '', required: false }] },
    { name: 'generateHrmsId', description: 'Generates a unique HRMS ID for an employee', params: [] },
    { name: 'generateMissingHrmsIds', description: 'Generates HRMS IDs for all employees missing them', params: [] },
    { name: 'getOrCreateQuarterlyMinutes', description: 'Retrieves or creates an EmployeeQuarterlyMinutes record', params: [{ name: 'employee_id', label: 'Employee ID', placeholder: '', required: true }, { name: 'company', label: 'Company', placeholder: 'e.g. Al Maraghi Motors', required: true }, { name: 'date', label: 'Date (YYYY-MM-DD)', placeholder: '2025-03-01', required: true }] },
    { name: 'importAnnualLeavesToProject', description: 'Imports annual leave records into a project', params: [{ name: 'projectId', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'importRamadanScheduleFromExcel', description: 'Imports Ramadan schedule data from an Excel file', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'importRamadanShifts', description: 'Imports Ramadan shift definitions', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'initializeQuarterForCompany', description: 'Initializes a new quarterly payroll quarter for a company', params: [{ name: 'company', label: 'Company', placeholder: 'e.g. Al Maraghi Motors', required: true }, { name: 'year', label: 'Year', placeholder: '2025', required: true }, { name: 'quarter', label: 'Quarter (1–4)', placeholder: '1', required: true }] },
    { name: 'lockCycle', description: 'Locks a CalendarCycle preventing modifications', params: [{ name: 'calendar_cycle_id', label: 'Calendar Cycle ID', placeholder: '', required: true }] },
    { name: 'logAudit', description: 'Manually writes an audit log entry for tracking changes', params: [{ name: 'action_type', label: 'Action Type', placeholder: 'update / create / delete / view', required: true }, { name: 'entity_name', label: 'Entity Name', placeholder: 'e.g. Employee', required: false }, { name: 'entity_id', label: 'Entity ID', placeholder: '', required: false }, { name: 'changes', label: 'Changes (JSON string)', placeholder: '{"field":"value"}', required: false }, { name: 'context', label: 'Context', placeholder: 'Optional description', required: false }] },
    { name: 'markFinalReport', description: 'Marks a ReportRun as final and locked', params: [{ name: 'report_run_id', label: 'Report Run ID', placeholder: '', required: true }, { name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'migrateAllowancesToNumber', description: 'Converts allowance values to numeric type', params: [] },
    { name: 'migrateAttendanceIds', description: 'Migrates attendance IDs to correct types across all entities', params: [] },
    { name: 'migrateOtherMinutes', description: 'Migrates other types of minutes to new structure', params: [] },
    { name: 'migrateToCalendarQuarters', description: 'Migrates payroll from project-based to calendar-based quarters', params: [] },
    { name: 'onAnnualLeaveChange', description: 'Triggered when an AnnualLeave record changes', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'onSalaryReportChange', description: 'Triggered when a SalaryReport record changes', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'populateSpecificEmployeesQuarterlyMinutes', description: 'Creates quarterly minutes for specific employees', params: [{ name: 'employee_ids', label: 'Employee IDs (JSON array)', placeholder: '["id1","id2"]', required: true }] },
    { name: 'previewGraceCarryForward', description: 'Previews how grace minutes would be carried forward at project close', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'recalculateAllSalarySnapshots', description: 'Recalculates all SalarySnapshot records from scratch', params: [] },
    { name: 'recalculateAllSnapshots', description: 'Recalculates all snapshot records system-wide', params: [] },
    { name: 'recalculateGraceMinutes', description: 'Recalculates grace minutes for all employees', params: [] },
    { name: 'recalculateIndividualSalary', description: 'Recalculates salary for a specific employee', params: [{ name: 'employee_id', label: 'Employee ID', placeholder: '', required: true }] },
    { name: 'recalculateReportDeductibles', description: 'Recalculates deductible minutes in a salary report', params: [{ name: 'report_id', label: 'Report ID', placeholder: '', required: true }] },
    { name: 'recalculateSalarySnapshot', description: 'Recalculates a single SalarySnapshot record', params: [{ name: 'snapshot_id', label: 'Snapshot ID', placeholder: '', required: false }, { name: 'project_id', label: 'Project ID', placeholder: '', required: false }, { name: 'employee_id', label: 'Employee ID', placeholder: '', required: false }] },
    { name: 'recalculateSickLeaveWorkingDays', description: 'Recalculates working days for sick leave periods', params: [] },
    { name: 'regenerateSalaryReport', description: 'Rebuilds salary report from current snapshots', params: [{ name: 'salary_report_id', label: 'Salary Report ID', placeholder: '', required: true }] },
    { name: 'regenerateSnapshotsAndReport', description: 'Regenerates both snapshots and their parent report', params: [{ name: 'report_id', label: 'Report ID', placeholder: '', required: true }] },
    { name: 'repairSalaryReportFromSnapshots', description: 'Repairs a damaged report by rebuilding from snapshots', params: [{ name: 'report_run_id', label: 'Report Run ID', placeholder: '', required: true }] },
    { name: 'resetGraceCarryForwardFlag', description: 'Resets the grace carry-forward flag', params: [] },
    { name: 'resetQuarterlyMinutes', description: 'Resets quarterly minutes records to default state', params: [] },
    { name: 'resolveSalaryForMonth', description: 'Resolves and finalizes salary calculation for a month', params: [{ name: 'month', label: 'Month (YYYY-MM)', placeholder: '2025-03', required: true }] },
    { name: 'runAnalysis', description: 'Runs full attendance analysis for a project over a date range', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }, { name: 'date_from', label: 'Date From (YYYY-MM-DD)', placeholder: '2025-03-01', required: true }, { name: 'date_to', label: 'Date To (YYYY-MM-DD)', placeholder: '2025-03-31', required: true }, { name: 'report_name', label: 'Report Name', placeholder: 'Optional', required: false }] },
    { name: 'runCalendarMigrationMonthlySummariesFromProjects', description: 'Migrates monthly summaries to calendar-based structure', params: [] },
    { name: 'runCalendarPayrollPreview', description: 'Generates payroll preview for a calendar cycle', params: [{ name: 'calendar_cycle_id', label: 'Calendar Cycle ID', placeholder: '', required: true }] },
    { name: 'saveDayOverride', description: 'Admin override for day-level attendance values', params: [{ name: 'snapshot_id', label: 'Snapshot ID', placeholder: '', required: true }, { name: 'override_field', label: 'Override Field', placeholder: 'e.g. working_days', required: true }, { name: 'override_value', label: 'Override Value', placeholder: '', required: true }] },
    { name: 'saveSalaryEdits', description: 'Saves manual salary edits to snapshot records', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }, { name: 'report_run_id', label: 'Report Run ID', placeholder: '', required: true }, { name: 'edits', label: 'Edits (JSON array string)', placeholder: '[{"snapshot_id":"...","field":"...","value":...}]', required: true }] },
    { name: 'saveUnusedGraceMinutes', description: 'Records unused grace minutes at project close', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'scanResume', description: 'Scans and extracts structured data from resume files', params: [{ name: 'fileBase64', label: 'File Base64', placeholder: 'Base64-encoded file content', required: true }, { name: 'fileName', label: 'File Name', placeholder: 'resume.pdf', required: true }, { name: 'fileType', label: 'File MIME Type', placeholder: 'application/pdf', required: true }, { name: 'criteria', label: 'Criteria (JSON string)', placeholder: '{}', required: false }] },
    { name: 'securityAudit', description: 'Runs security audit over AuditLog entries', params: [{ name: 'date_from', label: 'Date From (YYYY-MM-DD)', placeholder: '2025-01-01', required: false }, { name: 'date_to', label: 'Date To (YYYY-MM-DD)', placeholder: '2025-12-31', required: false }, { name: 'user_email', label: 'User Email', placeholder: 'Optional filter by user', required: false }] },
    { name: 'sendTestEmail', description: 'Sends a test email to verify email integration', params: [] },
    { name: 'storeCustomDomain', description: 'Stores custom domain configuration in system settings', params: [{ name: 'domain', label: 'Domain', placeholder: 'example.com', required: true }] },
    { name: 'swapRamadanWeeks', description: 'Swaps Ramadan week schedules in shift timings', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'syncAnnualLeaveChecklistTasks', description: 'Synchronizes checklist tasks for annual leave records', params: [{ name: 'leaveId', label: 'Annual Leave ID', placeholder: '', required: true }, { name: 'projectId', label: 'Project ID', placeholder: '', required: true }, { name: 'action', label: 'Action', placeholder: 'e.g. update, delete', required: true }] },
    { name: 'syncEmployeeNamesFromSalary', description: 'Updates employee names from salary system data', params: [] },
    { name: 'syncEmployeeToQuarterlyMinutes', description: 'Syncs employee data to quarterly minutes records', params: [] },
    { name: 'syncEmployeeToSalary', description: 'Syncs employee master data into the salary system', params: [{ name: 'employee_id', label: 'Employee ID', placeholder: '', required: false }, { name: 'hrms_id', label: 'HRMS ID', placeholder: '', required: false }, { name: 'name', label: 'Name', placeholder: '', required: false }, { name: 'company', label: 'Company', placeholder: '', required: false }] },
    { name: 'syncExistingCompanies', description: 'One-time migration: creates Company records from existing data', params: [] },
    { name: 'syncHistoryToEmployeeCarriedGrace', description: 'Syncs grace history into EmployeeCarriedGrace records', params: [{ name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'syncPagePermissions', description: 'Synchronizes page permissions with PAGES_CONFIG', params: [] },
    { name: 'syncQuarterlyMinutesToEmployee', description: 'Syncs quarterly minutes totals back to Employee records', params: [] },
    { name: 'syncSalaryIncrements', description: 'Syncs salary increment records across entities', params: [] },
    { name: 'undoRamadanShifts', description: 'Undoes previously applied Ramadan shift overrides', params: [{ name: 'projectId', label: 'Project ID', placeholder: '', required: true }, { name: 'dateFrom', label: 'Date From (YYYY-MM-DD)', placeholder: '2025-03-01', required: true }, { name: 'dateTo', label: 'Date To (YYYY-MM-DD)', placeholder: '2025-03-29', required: true }] },
    { name: 'unfinalizeReport', description: 'Removes final status from a ReportRun for editing', params: [{ name: 'report_run_id', label: 'Report Run ID', placeholder: '', required: true }, { name: 'project_id', label: 'Project ID', placeholder: '', required: true }] },
    { name: 'updateHRManagementPermissions', description: 'Updates HR management role permissions', params: [{ name: 'optional_params', label: 'Optional Parameters (JSON)', placeholder: '{}', required: false }] },
    { name: 'updateQuarterlyMinutes', description: 'Updates quarterly minutes balance by adding/subtracting minutes', params: [{ name: 'employee_id', label: 'Employee ID', placeholder: '', required: true }, { name: 'company', label: 'Company', placeholder: '', required: true }, { name: 'date', label: 'Date (YYYY-MM-DD)', placeholder: '2025-03-01', required: true }, { name: 'minutes_to_add', label: 'Minutes to Add (negative to subtract)', placeholder: '0', required: true }] },
    { name: 'validateSecureAccess', description: 'Validates that user has secure access to protected resources', params: [] },
    { name: 'verifyDepartmentHead', description: 'Verifies if current user is an authorized department head', params: [] },
];

/** Maximum number of session history entries to retain. */
const MAX_HISTORY = 20;

export default function FunctionRunner() {
    // --- Function run modal state ---
    const [activeFn, setActiveFn] = useState(null);
    const [paramValues, setParamValues] = useState({});
    const [confirmStep, setConfirmStep] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState(null); // { data, error, durationMs }
    const [showResultModal, setShowResultModal] = useState(false);

    /**
     * Session history — stored in React state (in memory).
     * Resets on page reload by design: this is a convenience reference,
     * not a persistent audit trail (the logAudit function handles persistence).
     */
    const [history, setHistory] = useState([]);
    const [historyViewEntry, setHistoryViewEntry] = useState(null);

    // --- Open run modal for a function ---
    const openRunModal = (fn) => {
        setActiveFn(fn);
        // Initialise param values to empty strings
        const initial = {};
        fn.params.forEach((p) => { initial[p.name] = ''; });
        setParamValues(initial);
        setConfirmStep(false);
        setResult(null);
    };

    const closeRunModal = () => {
        setActiveFn(null);
        setParamValues({});
        setConfirmStep(false);
        setResult(null);
    };

    /**
     * Execute the selected function.
     *
     * WHY CONFIRMATION IS REQUIRED:
     * Backend functions directly modify live production data — closing cycles,
     * regenerating salary reports, deleting records, syncing employees. There
     * is no undo. The confirmation step makes the admin explicitly acknowledge
     * this before the function is actually invoked.
     */
    const handleExecute = async () => {
        if (!activeFn) return;
        setIsRunning(true);

        // Build the parameter payload — only include non-empty values
        const payload = {};
        Object.entries(paramValues).forEach(([key, val]) => {
            if (val.trim() !== '') {
                // Attempt to parse JSON for fields that expect objects/arrays
                try {
                    const parsed = JSON.parse(val);
                    payload[key] = parsed;
                } catch {
                    // Not JSON — pass as string
                    payload[key] = val;
                }
            }
        });

        const startTime = performance.now();
        let resultEntry;

        try {
            const response = await base44.functions.invoke(activeFn.name, payload);
            const durationMs = Math.round(performance.now() - startTime);

            resultEntry = {
                id: Date.now(),
                functionName: activeFn.name,
                params: payload,
                timestamp: new Date().toISOString(),
                durationMs,
                success: true,
                data: response,
                error: null,
            };
            setResult(resultEntry);
        } catch (err) {
            const durationMs = Math.round(performance.now() - startTime);
            resultEntry = {
                id: Date.now(),
                functionName: activeFn.name,
                params: payload,
                timestamp: new Date().toISOString(),
                durationMs,
                success: false,
                data: null,
                error: err.message || String(err),
            };
            setResult(resultEntry);
        } finally {
            setIsRunning(false);
            // Add to session history — cap at MAX_HISTORY entries
            setHistory((prev) => [resultEntry, ...prev].slice(0, MAX_HISTORY));
        }
    };

    // --- Render ---
    return (
        <div className="space-y-8">
            {/*
              FUNCTION CATALOG
              Each backend function in the /functions/ directory is represented
              as a card showing its name, description, and a Run button.
            */}
            <div>
                <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider mb-3">
                    Backend Functions ({FUNCTION_CATALOG.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {FUNCTION_CATALOG.map((fn) => (
                        <FunctionCard
                            key={fn.name}
                            fn={fn}
                            onRun={() => openRunModal(fn)}
                        />
                    ))}
                </div>
            </div>

            {/*
              SESSION HISTORY PANEL
              Displays the last MAX_HISTORY function executions this session.
              Stored in React state — resets on page reload by design.
              This is NOT a substitute for the audit log, which persists to the database.
            */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <History className="w-4 h-4 text-slate-500" />
                    <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                        Session History (last {MAX_HISTORY} executions)
                    </h2>
                    {history.length > 0 && (
                        <Badge variant="secondary" className="text-xs">{history.length}</Badge>
                    )}
                </div>

                {history.length === 0 ? (
                    // Empty state — never show blank
                    <div className="flex flex-col items-center justify-center min-h-[120px] border-2 border-dashed border-slate-200 rounded-xl bg-white">
                        <Terminal className="w-8 h-8 text-slate-300 mb-2" />
                        <p className="text-sm text-slate-400">
                            No functions executed yet this session.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {history.map((entry) => (
                            <HistoryEntry
                                key={entry.id}
                                entry={entry}
                                onViewResponse={() => setHistoryViewEntry(entry)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/*
              RUN MODAL
              Two-step flow:
                Step 1: Enter parameters for the selected function.
                Step 2: Confirmation step warning that execution affects live data.
              After confirmation: execute and display raw response + timing.
            */}
            <Dialog open={!!activeFn} onOpenChange={(open) => { if (!open) closeRunModal(); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-base">
                            {activeFn?.name}
                        </DialogTitle>
                        <DialogDescription>
                            {activeFn?.description}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Show result output if execution has completed */}
                    {result ? (
                        <ExecutionResult result={result} />
                    ) : confirmStep ? (
                        /*
                          CONFIRMATION STEP
                          Explicitly states the function name and warns that
                          execution will affect live production data.
                          Required before every function invocation.
                        */
                        <div className="space-y-4">
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-800">
                                        <p className="font-semibold mb-1">
                                            Confirm execution of <span className="font-mono">{activeFn?.name}</span>
                                        </p>
                                        <p>This function will execute on live production data. This action may not be reversible.</p>
                                    </div>
                                </div>
                            </div>
                            {/* Show the parameters that will be sent */}
                            <div>
                                <p className="text-xs font-medium text-slate-500 mb-2">Parameters to be sent:</p>
                                <pre className="bg-slate-900 text-green-400 rounded-lg p-3 text-xs overflow-x-auto max-h-40">
                                    {JSON.stringify(
                                        Object.fromEntries(
                                            Object.entries(paramValues).filter(([, v]) => v.trim() !== '')
                                        ),
                                        null,
                                        2
                                    ) || '(none)'}
                                </pre>
                            </div>
                        </div>
                    ) : (
                        /*
                          PARAMETER FORM
                          Shows labeled input fields for each required parameter.
                          Functions with no params show an informational message.
                        */
                        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                            {activeFn?.params.length === 0 ? (
                                <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-4 text-center">
                                    This function requires no input parameters.
                                </div>
                            ) : (
                                activeFn?.params.map((param) => (
                                    <div key={param.name}>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">
                                            {param.label}
                                            {param.required && (
                                                <span className="text-red-500 ml-1">*</span>
                                            )}
                                        </label>
                                        <Input
                                            value={paramValues[param.name] || ''}
                                            onChange={(e) =>
                                                setParamValues((prev) => ({
                                                    ...prev,
                                                    [param.name]: e.target.value,
                                                }))
                                            }
                                            placeholder={param.placeholder}
                                            className="font-mono text-sm"
                                        />
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {result ? (
                            /* After execution, allow closing only */
                            <Button variant="outline" onClick={closeRunModal}>
                                Close
                            </Button>
                        ) : confirmStep ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setConfirmStep(false)}
                                    disabled={isRunning}
                                >
                                    Back
                                </Button>
                                <Button
                                    onClick={handleExecute}
                                    disabled={isRunning}
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    {isRunning ? (
                                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Executing...</>
                                    ) : (
                                        <><Play className="w-4 h-4 mr-2" /> Confirm & Execute</>
                                    )}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={closeRunModal}>
                                    Cancel
                                </Button>
                                <Button onClick={() => setConfirmStep(true)}>
                                    <Play className="w-4 h-4 mr-2" />
                                    Review & Run
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* History response viewer modal */}
            <Dialog open={!!historyViewEntry} onOpenChange={(open) => { if (!open) setHistoryViewEntry(null); }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-mono text-sm">
                            {historyViewEntry?.functionName}
                        </DialogTitle>
                        <DialogDescription>
                            Executed at {historyViewEntry?.timestamp} &mdash; {historyViewEntry?.durationMs}ms
                        </DialogDescription>
                    </DialogHeader>
                    <ExecutionResult result={historyViewEntry} />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setHistoryViewEntry(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/**
 * FunctionCard — renders a single function as a card with its name,
 * description, and a Run button.
 */
function FunctionCard({ fn, onRun }) {
    return (
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3 hover:border-slate-300 transition-colors">
            {/* Function name */}
            <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-slate-800 break-all">
                    {fn.name}
                </span>
                {fn.params.length === 0 && (
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">no params</Badge>
                )}
            </div>
            {/* Description */}
            <p className="text-xs text-slate-500 leading-relaxed flex-1">
                {fn.description}
            </p>
            {/* Run button */}
            <Button
                size="sm"
                variant="outline"
                onClick={onRun}
                className="self-start"
            >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                Run
            </Button>
        </div>
    );
}

/**
 * ExecutionResult — displays the raw response from a function execution,
 * including execution time and any errors. Used both in the run modal
 * and in the history viewer.
 */
function ExecutionResult({ result }) {
    if (!result) return null;

    const { success, data, error, durationMs } = result;

    return (
        <div className="space-y-3">
            {/* Status and timing bar */}
            <div className="flex items-center gap-3">
                {success ? (
                    <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />
                        Success
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-red-600 text-sm font-medium">
                        <XCircle className="w-4 h-4" />
                        Error
                    </div>
                )}
                <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    {durationMs}ms
                </div>
            </div>

            {/*
              Raw response output area — scrollable, monospaced, complete.
              Errors are shown in red; success responses in green.
              Never truncated — admins need the full raw output.
            */}
            <div
                className={cn(
                    'rounded-lg p-4 font-mono text-xs overflow-auto max-h-80 whitespace-pre-wrap break-all',
                    success
                        ? 'bg-slate-900 text-green-300'
                        : 'bg-red-950 text-red-300'
                )}
            >
                {success
                    ? JSON.stringify(data, null, 2)
                    : `Error: ${error}`}
            </div>
        </div>
    );
}

/**
 * HistoryEntry — renders a single session history item showing:
 * function name, parameters, timestamp, execution time, and
 * a button to view the full raw response.
 */
function HistoryEntry({ entry, onViewResponse }) {
    const { functionName, params, timestamp, durationMs, success } = entry;
    const time = new Date(timestamp).toLocaleTimeString();

    return (
        <div className="flex items-center gap-3 bg-white border border-slate-100 rounded-lg px-4 py-2.5 hover:border-slate-200 transition-colors">
            {/* Status indicator */}
            {success ? (
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            ) : (
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}

            {/* Function name */}
            <span className="font-mono text-xs font-semibold text-slate-700 min-w-[160px] truncate">
                {functionName}
            </span>

            {/* Parameters — truncated JSON for readability */}
            <span className="text-xs text-slate-400 flex-1 truncate font-mono">
                {Object.keys(params).length > 0
                    ? JSON.stringify(params)
                    : '(no params)'}
            </span>

            {/* Timestamp */}
            <span className="text-xs text-slate-400 whitespace-nowrap">{time}</span>

            {/* Execution time */}
            <span className="text-xs text-slate-400 whitespace-nowrap">{durationMs}ms</span>

            {/* View response button */}
            <button
                onClick={onViewResponse}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title="View full response"
            >
                <Eye className="w-4 h-4" />
            </button>
        </div>
    );
}
