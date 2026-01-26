import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Database, RefreshCw, AlertCircle, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function SystemHealth() {
    const [isScanning, setIsScanning] = useState(false);
    const [healthReport, setHealthReport] = useState(null);
    const [fixingIssue, setFixingIssue] = useState(null);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Fix mutations
    const fixDuplicatesMutation = useMutation({
        mutationFn: () => base44.functions.invoke('fixDuplicateAnalysisResults'),
        onSuccess: (response) => {
            toast.success(`Fixed ${response.data.recordsDeleted} duplicate records`);
            setFixingIssue(null);
            // Re-run health check
            setTimeout(runHealthCheck, 500);
        },
        onError: (error) => {
            toast.error('Failed to fix duplicates: ' + error.message);
            setFixingIssue(null);
        }
    });

    const fixPunchIdsMutation = useMutation({
        mutationFn: () => base44.functions.invoke('fixNumericPunchAttendanceIds'),
        onSuccess: (response) => {
            toast.success(`Fixed ${response.data.recordsFixed} punch records`);
            setFixingIssue(null);
            setTimeout(runHealthCheck, 500);
        },
        onError: (error) => {
            toast.error('Failed to fix punches: ' + error.message);
            setFixingIssue(null);
        }
    });

    const fixEmployeeIdsMutation = useMutation({
        mutationFn: () => base44.functions.invoke('fixNumericEmployeeAttendanceIds'),
        onSuccess: (response) => {
            toast.success(`Fixed ${response.data.recordsFixed} employee records`);
            setFixingIssue(null);
            setTimeout(runHealthCheck, 500);
        },
        onError: (error) => {
            toast.error('Failed to fix employees: ' + error.message);
            setFixingIssue(null);
        }
    });

    const cleanupSalariesMutation = useMutation({
        mutationFn: () => base44.functions.invoke('cleanupOrphanedSalaries'),
        onSuccess: (response) => {
            toast.success(`Deactivated ${response.data.recordsDeactivated} orphaned salary records`);
            setFixingIssue(null);
            setTimeout(runHealthCheck, 500);
        },
        onError: (error) => {
            toast.error('Failed to cleanup salaries: ' + error.message);
            setFixingIssue(null);
        }
    });

    const cleanupShiftsMutation = useMutation({
        mutationFn: () => base44.functions.invoke('cleanupOrphanedShifts'),
        onSuccess: (response) => {
            toast.success(`Deleted ${response.data.recordsDeleted} orphaned shift records`);
            setFixingIssue(null);
            setTimeout(runHealthCheck, 500);
        },
        onError: (error) => {
            toast.error('Failed to cleanup shifts: ' + error.message);
            setFixingIssue(null);
        }
    });

    const runHealthCheck = async () => {
        setIsScanning(true);
        setHealthReport(null);
        
        try {
            const issues = [];
            const warnings = [];
            
            // 1. Check AnalysisResult attendance_id data types
            const analysisResults = await base44.entities.AnalysisResult.list();
            const numericAttendanceIds = analysisResults.filter(r => typeof r.attendance_id === 'number');
            if (numericAttendanceIds.length > 0) {
                issues.push({
                    severity: 'critical',
                    entity: 'AnalysisResult',
                    issue: 'Numeric attendance_id values found',
                    count: numericAttendanceIds.length,
                    impact: 'Cannot edit daily records - 422 validation errors',
                    fix: 'Use Migration Tools to fix attendance_id types'
                });
            }

            // 2. Check Punch attendance_id data types
            const punches = await base44.entities.Punch.list();
            const numericPunchIds = punches.filter(p => typeof p.attendance_id === 'number');
            if (numericPunchIds.length > 0) {
                warnings.push({
                    severity: 'warning',
                    entity: 'Punch',
                    issue: 'Numeric attendance_id values found',
                    count: numericPunchIds.length,
                    impact: 'May cause matching issues with string-based employee IDs',
                    fix: 'Consider data type standardization'
                });
            }

            // 3. Check Employee attendance_id data types
            const employees = await base44.entities.Employee.list();
            const numericEmployeeIds = employees.filter(e => typeof e.attendance_id === 'number');
            if (numericEmployeeIds.length > 0) {
                warnings.push({
                    severity: 'warning',
                    entity: 'Employee',
                    issue: 'Numeric attendance_id values found',
                    count: numericEmployeeIds.length,
                    impact: 'May cause ID matching issues across entities',
                    fix: 'Standardize to string type in Employee master'
                });
            }

            // 4. Check for orphaned AnalysisResults (project doesn't exist)
            const projects = await base44.entities.Project.list();
            const projectIds = new Set(projects.map(p => p.id));
            const orphanedResults = analysisResults.filter(r => !projectIds.has(r.project_id));
            if (orphanedResults.length > 0) {
                warnings.push({
                    severity: 'warning',
                    entity: 'AnalysisResult',
                    issue: 'Orphaned records (project deleted)',
                    count: orphanedResults.length,
                    impact: 'Unused data taking up space',
                    fix: 'Safe to delete these records'
                });
            }

            // 5. Check for orphaned Punches
            const orphanedPunches = punches.filter(p => !projectIds.has(p.project_id));
            if (orphanedPunches.length > 0) {
                warnings.push({
                    severity: 'warning',
                    entity: 'Punch',
                    issue: 'Orphaned records (project deleted)',
                    count: orphanedPunches.length,
                    impact: 'Unused data taking up space',
                    fix: 'Safe to delete these records'
                });
            }

            // 6. Check for duplicate AnalysisResults (same project + attendance_id + report_run_id)
            const resultKeys = {};
            analysisResults.forEach(r => {
                const key = `${r.project_id}_${r.attendance_id}_${r.report_run_id || 'null'}`;
                if (!resultKeys[key]) {
                    resultKeys[key] = [];
                }
                resultKeys[key].push(r.id);
            });
            const duplicates = Object.values(resultKeys).filter(ids => ids.length > 1);
            if (duplicates.length > 0) {
                issues.push({
                    severity: 'critical',
                    entity: 'AnalysisResult',
                    issue: 'Duplicate records found',
                    count: duplicates.length,
                    impact: 'Can cause incorrect calculations and reports',
                    fix: 'Requires manual review and cleanup'
                });
            }

            // 7. Check employees without company
            const employeesWithoutCompany = employees.filter(e => e.active && !e.company);
            if (employeesWithoutCompany.length > 0) {
                warnings.push({
                    severity: 'warning',
                    entity: 'Employee',
                    issue: 'Active employees without company',
                    count: employeesWithoutCompany.length,
                    impact: 'Cannot be included in projects',
                    fix: 'Assign company to these employees'
                });
            }

            // 8. Check salary records without matching employee
            const salaries = await base44.entities.EmployeeSalary.list();
            const employeeIds = new Set(employees.map(e => e.hrms_id));
            const orphanedSalaries = salaries.filter(s => s.active && !employeeIds.has(s.employee_id));
            if (orphanedSalaries.length > 0) {
                warnings.push({
                    severity: 'warning',
                    entity: 'EmployeeSalary',
                    issue: 'Salary records without matching employee',
                    count: orphanedSalaries.length,
                    impact: 'Unused salary records',
                    fix: 'Review and deactivate or link to employees'
                });
            }

            // 9. Check for exceptions with invalid dates
            const exceptions = await base44.entities.Exception.list();
            const invalidDateExceptions = exceptions.filter(e => {
                const from = new Date(e.date_from);
                const to = new Date(e.date_to);
                return from > to;
            });
            if (invalidDateExceptions.length > 0) {
                issues.push({
                    severity: 'critical',
                    entity: 'Exception',
                    issue: 'Invalid date ranges (from > to)',
                    count: invalidDateExceptions.length,
                    impact: 'Exceptions will not work correctly',
                    fix: 'Fix date ranges in these exceptions'
                });
            }

            // 10. Check ShiftTimings without project
            const shifts = await base44.entities.ShiftTiming.list();
            const orphanedShifts = shifts.filter(s => !projectIds.has(s.project_id));
            if (orphanedShifts.length > 0) {
                warnings.push({
                    severity: 'warning',
                    entity: 'ShiftTiming',
                    issue: 'Orphaned shifts (project deleted)',
                    count: orphanedShifts.length,
                    impact: 'Unused data',
                    fix: 'Safe to delete'
                });
            }

            setHealthReport({
                timestamp: new Date(),
                totalIssues: issues.length,
                totalWarnings: warnings.length,
                status: issues.length > 0 ? 'critical' : warnings.length > 0 ? 'warning' : 'healthy',
                issues,
                warnings,
                stats: {
                    employees: employees.length,
                    activeEmployees: employees.filter(e => e.active).length,
                    projects: projects.length,
                    analysisResults: analysisResults.length,
                    punches: punches.length,
                    exceptions: exceptions.length,
                    salaries: salaries.length,
                    shifts: shifts.length
                }
            });

            if (issues.length === 0 && warnings.length === 0) {
                toast.success('System health check passed - no issues found!');
            } else {
                toast.warning(`Found ${issues.length} critical issues and ${warnings.length} warnings`);
            }
        } catch (error) {
            toast.error('Health check failed: ' + error.message);
        } finally {
            setIsScanning(false);
        }
    };

    if (currentUser?.role !== 'admin') {
        return (
            <div className="max-w-6xl mx-auto p-6">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600">Access restricted to Admin only</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <Breadcrumb items={[
                { label: 'Settings', href: 'RulesSettings' },
                { label: 'System Health' }
            ]} />

            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
                    <Database className="w-8 h-8 text-blue-600" />
                </div>
                <h1 className="text-4xl font-bold text-slate-900">System Health Check</h1>
                <p className="text-lg text-slate-600 mt-3">Validate data integrity before publishing</p>
            </div>

            {/* Scan Action */}
            <Card className="border-2 border-blue-300 bg-blue-50">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-blue-900 text-lg mb-1">Run Health Scan</h3>
                            <p className="text-sm text-blue-700">
                                Checks data types, orphaned records, duplicates, and validation issues
                            </p>
                        </div>
                        <Button
                            onClick={runHealthCheck}
                            disabled={isScanning}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
                            {isScanning ? 'Scanning...' : 'Run Scan'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Health Report */}
            {healthReport && (
                <>
                    {/* Status Card */}
                    <Card className={`border-2 ${
                        healthReport.status === 'critical' ? 'border-red-300 bg-red-50' :
                        healthReport.status === 'warning' ? 'border-amber-300 bg-amber-50' :
                        'border-green-300 bg-green-50'
                    }`}>
                        <CardHeader>
                            <CardTitle className={`flex items-center gap-2 ${
                                healthReport.status === 'critical' ? 'text-red-900' :
                                healthReport.status === 'warning' ? 'text-amber-900' :
                                'text-green-900'
                            }`}>
                                {healthReport.status === 'critical' && <AlertTriangle className="w-6 h-6" />}
                                {healthReport.status === 'warning' && <AlertCircle className="w-6 h-6" />}
                                {healthReport.status === 'healthy' && <CheckCircle className="w-6 h-6" />}
                                {healthReport.status === 'critical' ? 'Critical Issues Found' :
                                 healthReport.status === 'warning' ? 'Warnings Found' :
                                 'System Healthy'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div className="bg-white rounded-lg p-3 border">
                                    <p className="text-slate-600">Critical Issues</p>
                                    <p className="text-2xl font-bold text-red-600">{healthReport.totalIssues}</p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border">
                                    <p className="text-slate-600">Warnings</p>
                                    <p className="text-2xl font-bold text-amber-600">{healthReport.totalWarnings}</p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border">
                                    <p className="text-slate-600">Active Employees</p>
                                    <p className="text-2xl font-bold text-slate-900">{healthReport.stats.activeEmployees}</p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border">
                                    <p className="text-slate-600">Projects</p>
                                    <p className="text-2xl font-bold text-slate-900">{healthReport.stats.projects}</p>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-4">
                                Last scanned: {healthReport.timestamp.toLocaleString()}
                            </p>
                        </CardContent>
                    </Card>

                    {/* Critical Issues */}
                    {healthReport.issues.length > 0 && (
                        <Card className="border-2 border-red-300 bg-red-50">
                            <CardHeader>
                                <CardTitle className="text-red-900">
                                    🚨 Critical Issues ({healthReport.issues.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {healthReport.issues.map((issue, idx) => (
                                        <div key={idx} className="bg-white border border-red-200 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded">
                                                        {issue.entity}
                                                    </span>
                                                    <h4 className="font-semibold text-red-900 mt-2">{issue.issue}</h4>
                                                </div>
                                                <span className="text-2xl font-bold text-red-600">{issue.count}</span>
                                            </div>
                                            <p className="text-sm text-red-800 mb-2">
                                                <strong>Impact:</strong> {issue.impact}
                                            </p>
                                            <p className="text-sm text-red-700">
                                                <strong>Fix:</strong> {issue.fix}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Warnings */}
                    {healthReport.warnings.length > 0 && (
                        <Card className="border-2 border-amber-300 bg-amber-50">
                            <CardHeader>
                                <CardTitle className="text-amber-900">
                                    ⚠️ Warnings ({healthReport.warnings.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {healthReport.warnings.map((warning, idx) => (
                                        <div key={idx} className="bg-white border border-amber-200 rounded-lg p-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded">
                                                        {warning.entity}
                                                    </span>
                                                    <h4 className="font-semibold text-amber-900 mt-2">{warning.issue}</h4>
                                                </div>
                                                <span className="text-2xl font-bold text-amber-600">{warning.count}</span>
                                            </div>
                                            <p className="text-sm text-amber-800 mb-2">
                                                <strong>Impact:</strong> {warning.impact}
                                            </p>
                                            <p className="text-sm text-amber-700">
                                                <strong>Fix:</strong> {warning.fix}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* System Statistics */}
                    <Card>
                        <CardHeader>
                            <CardTitle>System Statistics</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p className="text-slate-600">Total Employees</p>
                                    <p className="text-xl font-bold text-slate-900">{healthReport.stats.employees}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Analysis Results</p>
                                    <p className="text-xl font-bold text-slate-900">{healthReport.stats.analysisResults}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Punch Records</p>
                                    <p className="text-xl font-bold text-slate-900">{healthReport.stats.punches}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Exceptions</p>
                                    <p className="text-xl font-bold text-slate-900">{healthReport.stats.exceptions}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Salary Records</p>
                                    <p className="text-xl font-bold text-slate-900">{healthReport.stats.salaries}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Shift Timings</p>
                                    <p className="text-xl font-bold text-slate-900">{healthReport.stats.shifts}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pre-Publish Checklist */}
                    <Card className="border-2 border-slate-300">
                        <CardHeader>
                            <CardTitle className="text-slate-900">📋 Pre-Publish Checklist</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 text-sm">
                                <div className={`flex items-center gap-2 ${healthReport.totalIssues === 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {healthReport.totalIssues === 0 ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                    <span>No critical issues</span>
                                </div>
                                <div className={`flex items-center gap-2 ${healthReport.totalWarnings === 0 ? 'text-green-700' : 'text-amber-700'}`}>
                                    {healthReport.totalWarnings === 0 ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    <span>No warnings</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-600">
                                    <span className="w-4 h-4">□</span>
                                    <span>All backend functions tested</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-600">
                                    <span className="w-4 h-4">□</span>
                                    <span>Critical flows tested (create, edit, delete)</span>
                                </div>
                                <div className="flex items-center gap-2 text-slate-600">
                                    <span className="w-4 h-4">□</span>
                                    <span>Documentation updated</span>
                                </div>
                            </div>
                            <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                                <p className="font-semibold text-slate-900">
                                    {healthReport.status === 'healthy' ? '✅ READY TO PUBLISH' :
                                     healthReport.status === 'warning' ? '⚠️ PUBLISH WITH CAUTION' :
                                     '🚨 NOT READY - ISSUES FOUND'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}