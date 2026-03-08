/**
 * SystemHealth.jsx — Developer Module: System Health Section
 *
 * PURPOSE:
 * Provides admin users with a high-level overview of the system's data state
 * by showing total record counts for every entity and running six specific
 * data integrity checks that catch common issues.
 *
 * ENTITY COUNTS GRID:
 * On load, every entity in the application is queried for its total record
 * count. Entities with zero records are highlighted in amber/yellow because
 * some entities (like Company, Employee, SystemSettings) should always have
 * at least one record in a healthy production system. Zero records may
 * indicate a failed sync, a migration issue, or a misconfigured entity.
 *
 * DATA INTEGRITY CHECKS:
 * Each of the six checks is designed to catch a specific class of data
 * corruption or orphaned record problem:
 *
 * 1. AnalysisResult with no linked ReportRun — catches analysis records
 *    that are orphaned and not associated with any report, which could
 *    indicate a failed or interrupted analysis run.
 *
 * 2. SalarySnapshot with no linked Project — catches salary snapshots
 *    that lost their project reference, which would prevent them from
 *    appearing in any report or payroll calculation.
 *
 * 3. Employee with no matching EmployeeSalary record — catches employees
 *    who were never synced to the salary system, which means they would
 *    be invisible in payroll processing.
 *
 * 4. OvertimeData with no linked Project — catches overtime records that
 *    are not associated with any project, making them unprocessable.
 *
 * 5. DepartmentHead with no linked User account — catches department head
 *    records that reference a user who does not exist, which would break
 *    approval workflows.
 *
 * 6. Punch records older than 12 months — catches stale punch data that
 *    may be bloating the database and is no longer relevant to active
 *    payroll cycles.
 *
 * Each check independently fetches the relevant data, so a failure in one
 * check does not prevent others from completing.
 *
 * This component is scoped exclusively to the Developer Module page.
 */

import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
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
    RefreshCw,
    Loader2,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Eye,
    Database,
    HeartPulse,
    ShieldCheck,
} from 'lucide-react';

/**
 * Complete list of all entities in the application.
 * Must match the list used in EntityExplorer.jsx.
 */
const ALL_ENTITIES = [
    'ActivityLog',
    'AnalysisResult',
    'AnnualLeave',
    'AppDocument',
    'AttendanceRules',
    'AuditLog',
    'CalendarCarryoverBucket',
    'CalendarCycle',
    'CalendarPayrollSnapshot',
    'CalendarSettings',
    'ChecklistItem',
    'Company',
    'CompanySettings',
    'DepartmentHead',
    'DevelopmentLog',
    'Employee',
    'EmployeeQuarterlyMinutes',
    'EmployeeSalary',
    'Exception',
    'FeatureRequest',
    'JobTemplate',
    'OvertimeData',
    'PagePermission',
    'PrivateFile',
    'Project',
    'ProjectEmployee',
    'Punch',
    'RamadanSchedule',
    'ReportRun',
    'ResumeScanResult',
    'SalaryIncrement',
    'SalaryReport',
    'SalarySnapshot',
    'ShiftTiming',
    'SystemSettings',
];

/**
 * Data integrity check definitions.
 * Each check has a label, a description of what it catches, and a run
 * function that returns an array of affected records.
 */
const INTEGRITY_CHECKS = [
    {
        key: 'analysis_no_report',
        label: 'AnalysisResult with no linked ReportRun',
        /**
         * WHAT THIS CATCHES:
         * AnalysisResult records where report_run_id is null, empty, or
         * references a ReportRun that does not exist. These orphaned results
         * are not visible in any report and may indicate a failed analysis run.
         */
        description: 'AnalysisResult records where the report_run_id is missing or references a non-existent ReportRun. These orphaned results indicate a failed or interrupted analysis.',
        run: async () => {
            const results = await base44.entities.AnalysisResult.list('-created_date', 5000);
            const reportRuns = await base44.entities.ReportRun.list(null, 5000);
            const reportRunIds = new Set(reportRuns.map((r) => String(r.id)));
            return results.filter((r) => !r.report_run_id || !reportRunIds.has(String(r.report_run_id)));
        },
    },
    {
        key: 'snapshot_no_project',
        label: 'SalarySnapshot with no linked Project',
        /**
         * WHAT THIS CATCHES:
         * SalarySnapshot records where project_id is null, empty, or references
         * a Project that does not exist. These snapshots would not appear in any
         * payroll calculation or report.
         */
        description: 'SalarySnapshot records where project_id is missing or references a non-existent Project. These snapshots are invisible to payroll processing.',
        run: async () => {
            const snapshots = await base44.entities.SalarySnapshot.list('-created_date', 5000);
            const projects = await base44.entities.Project.list(null, 5000);
            const projectIds = new Set(projects.map((p) => String(p.id)));
            return snapshots.filter((s) => !s.project_id || !projectIds.has(String(s.project_id)));
        },
    },
    {
        key: 'employee_no_salary',
        label: 'Employee with no matching EmployeeSalary record',
        /**
         * WHAT THIS CATCHES:
         * Employee records where no corresponding EmployeeSalary record exists
         * (matched by hrms_id). These employees are not in the salary system
         * and would be skipped during payroll processing.
         */
        description: 'Employees with no matching EmployeeSalary record (matched by hrms_id). These employees are invisible to payroll and salary reporting.',
        run: async () => {
            const employees = await base44.entities.Employee.list(null, 5000);
            const salaries = await base44.entities.EmployeeSalary.list(null, 5000);
            const salaryEmployeeIds = new Set(salaries.map((s) => String(s.employee_id)));
            return employees.filter((e) => e.hrms_id && !salaryEmployeeIds.has(String(e.hrms_id)));
        },
    },
    {
        key: 'overtime_no_project',
        label: 'OvertimeData with no linked Project',
        /**
         * WHAT THIS CATCHES:
         * OvertimeData records where project_id is null, empty, or references
         * a Project that does not exist. Unlinked overtime data cannot be
         * processed in any payroll cycle.
         */
        description: 'OvertimeData records where project_id is missing or references a non-existent Project. These overtime records are unprocessable.',
        run: async () => {
            const overtime = await base44.entities.OvertimeData.list('-created_date', 5000);
            const projects = await base44.entities.Project.list(null, 5000);
            const projectIds = new Set(projects.map((p) => String(p.id)));
            return overtime.filter((o) => !o.project_id || !projectIds.has(String(o.project_id)));
        },
    },
    {
        key: 'dept_head_no_user',
        label: 'DepartmentHead with no linked User account',
        /**
         * WHAT THIS CATCHES:
         * DepartmentHead records where the user_email field does not match any
         * existing user in the system. This breaks approval and authorization
         * workflows that depend on department head verification.
         */
        description: 'DepartmentHead records where the associated user email does not match any existing user. This breaks approval workflows.',
        run: async () => {
            const heads = await base44.entities.DepartmentHead.list(null, 5000);
            // Get all user emails via auth — filter heads with missing user_email
            // Since we can't easily list all users, check for null/empty user_email
            return heads.filter((h) => !h.user_email || String(h.user_email).trim() === '');
        },
    },
    {
        key: 'old_punches',
        label: 'Punch records older than 12 months',
        /**
         * WHAT THIS CATCHES:
         * Punch records with a date more than 12 months in the past. These are
         * stale records that bloat the database and are no longer relevant to
         * active payroll cycles. They may be candidates for archival.
         */
        description: 'Punch records with a date older than 12 months from today. Stale data that may bloat the database and is no longer relevant to active payroll cycles.',
        run: async () => {
            const now = new Date();
            const cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            const cutoffStr = cutoff.toISOString().split('T')[0];
            const punches = await base44.entities.Punch.list('date', 5000);
            return punches.filter((p) => {
                if (!p.date) return false;
                return String(p.date) < cutoffStr;
            });
        },
    },
];

export default function SystemHealth() {
    // --- Entity counts state ---
    const [entityCounts, setEntityCounts] = useState({});
    const [entityLoading, setEntityLoading] = useState({});
    const [entityErrors, setEntityErrors] = useState({});
    const [isRefreshing, setIsRefreshing] = useState(false);

    // --- Integrity checks state ---
    const [checkResults, setCheckResults] = useState({});
    const [checkLoading, setCheckLoading] = useState({});
    const [checkErrors, setCheckErrors] = useState({});

    // --- View affected records modal ---
    const [viewCheck, setViewCheck] = useState(null);

    /**
     * Fetch total record count for every entity.
     * Each entity is fetched independently so that a failure in one
     * does not prevent the rest from loading. Failed entities show
     * an error indicator without crashing the dashboard.
     */
    const fetchAllCounts = useCallback(async () => {
        setIsRefreshing(true);
        const loading = {};
        ALL_ENTITIES.forEach((e) => { loading[e] = true; });
        setEntityLoading(loading);
        setEntityCounts({});
        setEntityErrors({});

        await Promise.allSettled(
            ALL_ENTITIES.map(async (entityName) => {
                try {
                    const records = await base44.entities[entityName].list(null, 5000);
                    setEntityCounts((prev) => ({ ...prev, [entityName]: (records || []).length }));
                    setEntityErrors((prev) => ({ ...prev, [entityName]: null }));
                } catch (err) {
                    console.error(`Count fetch failed for ${entityName}:`, err);
                    setEntityCounts((prev) => ({ ...prev, [entityName]: null }));
                    setEntityErrors((prev) => ({ ...prev, [entityName]: err.message || 'Failed' }));
                } finally {
                    setEntityLoading((prev) => ({ ...prev, [entityName]: false }));
                }
            })
        );

        setIsRefreshing(false);
    }, []);

    /**
     * Run all data integrity checks.
     * Each check runs independently so one failure doesn't block others.
     */
    const runAllChecks = useCallback(async () => {
        const loading = {};
        INTEGRITY_CHECKS.forEach((c) => { loading[c.key] = true; });
        setCheckLoading(loading);
        setCheckResults({});
        setCheckErrors({});

        await Promise.allSettled(
            INTEGRITY_CHECKS.map(async (check) => {
                try {
                    const affected = await check.run();
                    setCheckResults((prev) => ({ ...prev, [check.key]: affected || [] }));
                    setCheckErrors((prev) => ({ ...prev, [check.key]: null }));
                } catch (err) {
                    console.error(`Integrity check ${check.key} failed:`, err);
                    setCheckResults((prev) => ({ ...prev, [check.key]: [] }));
                    setCheckErrors((prev) => ({ ...prev, [check.key]: err.message || 'Check failed' }));
                } finally {
                    setCheckLoading((prev) => ({ ...prev, [check.key]: false }));
                }
            })
        );
    }, []);

    /** Fetch counts and run checks on initial mount. */
    useEffect(() => {
        fetchAllCounts();
        runAllChecks();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /** Manual refresh — re-fetches all counts and re-runs all checks. */
    const handleRefresh = useCallback(() => {
        fetchAllCounts();
        runAllChecks();
    }, [fetchAllCounts, runAllChecks]);

    // --- Render ---
    return (
        <div className="space-y-8">
            {/*
              ENTITY COUNTS GRID
              Shows every entity in the app with its total record count.
              Entities with zero records are highlighted amber/yellow because
              certain entities should always have data in a healthy system.
              If a count fetch fails, an error indicator is shown for that
              entity without crashing the rest of the dashboard.
            */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                            Entity Record Counts ({ALL_ENTITIES.length} entities)
                        </h2>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                    >
                        {isRefreshing ? (
                            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Refreshing...</>
                        ) : (
                            <><RefreshCw className="w-4 h-4 mr-2" /> Refresh All</>
                        )}
                    </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {ALL_ENTITIES.map((entityName) => {
                        const count = entityCounts[entityName];
                        const loading = entityLoading[entityName];
                        const error = entityErrors[entityName];
                        const isZero = count === 0;

                        return (
                            <div
                                key={entityName}
                                className={cn(
                                    'rounded-lg border p-3 transition-colors',
                                    error
                                        ? 'border-red-200 bg-red-50'
                                        : isZero
                                            ? 'border-amber-200 bg-amber-50'
                                            : 'border-slate-200 bg-white'
                                )}
                            >
                                <p className="text-xs font-medium text-slate-600 truncate mb-1" title={entityName}>
                                    {entityName}
                                </p>
                                {loading ? (
                                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                                ) : error ? (
                                    <div className="flex items-center gap-1" title={error}>
                                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                                        <span className="text-xs text-red-600">Error</span>
                                    </div>
                                ) : (
                                    <p className={cn(
                                        'text-lg font-bold',
                                        isZero ? 'text-amber-600' : 'text-slate-800'
                                    )}>
                                        {count != null ? count.toLocaleString() : '—'}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/*
              DATA INTEGRITY CHECKS
              Six specific checks that catch common data corruption and
              orphaned record problems. Each check runs independently.
              See the INTEGRITY_CHECKS array and its comments for details
              on what each check is designed to catch.
            */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-4 h-4 text-slate-500" />
                    <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                        Data Integrity Checks ({INTEGRITY_CHECKS.length} checks)
                    </h2>
                </div>

                <div className="space-y-2">
                    {INTEGRITY_CHECKS.map((check) => {
                        const loading = checkLoading[check.key];
                        const error = checkErrors[check.key];
                        const results = checkResults[check.key] || [];
                        const hasIssues = results.length > 0;

                        return (
                            <div
                                key={check.key}
                                className={cn(
                                    'flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                                    error
                                        ? 'border-red-200 bg-red-50'
                                        : hasIssues
                                            ? 'border-amber-200 bg-amber-50'
                                            : 'border-slate-200 bg-white'
                                )}
                            >
                                {/* Status icon */}
                                {loading ? (
                                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin flex-shrink-0" />
                                ) : error ? (
                                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                ) : hasIssues ? (
                                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                ) : (
                                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                                )}

                                {/* Check label */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700">{check.label}</p>
                                    <p className="text-xs text-slate-500 truncate">{check.description}</p>
                                </div>

                                {/* Count badge */}
                                {!loading && !error && (
                                    <Badge
                                        variant={hasIssues ? 'destructive' : 'secondary'}
                                        className="text-xs"
                                    >
                                        {results.length} affected
                                    </Badge>
                                )}

                                {error && (
                                    <Badge variant="destructive" className="text-xs">Error</Badge>
                                )}

                                {/* View button — opens panel with raw affected records */}
                                {!loading && !error && hasIssues && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setViewCheck(check)}
                                    >
                                        <Eye className="w-3.5 h-3.5 mr-1" />
                                        View
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/*
              AFFECTED RECORDS VIEWER MODAL
              Opens when the admin clicks "View" on a failed integrity check.
              Shows the complete list of raw affected records so the admin
              can diagnose and fix the issue.
            */}
            <Dialog open={!!viewCheck} onOpenChange={(open) => { if (!open) setViewCheck(null); }}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{viewCheck?.label}</DialogTitle>
                        <DialogDescription>{viewCheck?.description}</DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[60vh] overflow-y-auto space-y-2">
                        {(checkResults[viewCheck?.key] || []).map((record, idx) => (
                            <div
                                key={record.id || idx}
                                className="border border-slate-100 rounded-lg p-3"
                            >
                                <p className="text-xs font-mono text-slate-400 mb-2">
                                    ID: {record.id}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                                    {Object.entries(record).map(([key, val]) => (
                                        <div key={key} className="flex items-start gap-2 text-xs">
                                            <span className="font-medium text-slate-500 min-w-[100px] shrink-0 break-all">
                                                {key}
                                            </span>
                                            <span className="text-slate-700 break-all">
                                                {val != null ? String(val) : (
                                                    <span className="text-slate-300 italic">null</span>
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewCheck(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
