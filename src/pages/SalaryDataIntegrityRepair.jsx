import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, RefreshCw, Shield, Database, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export default function SalaryDataIntegrityRepair() {
    const [reportRunId, setReportRunId] = useState('697c7d9d77965303b743ee5e');
    const [auditResults, setAuditResults] = useState(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);
    const [repairResults, setRepairResults] = useState(null);
    const [showSampleTrace, setShowSampleTrace] = useState(false);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role;
    const isAdmin = userRole === 'admin';

    if (!isAdmin) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-12 text-center">
                        <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
                        <p className="text-red-700 font-medium">Admin access required</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const handleAudit = async () => {
        if (!reportRunId.trim()) {
            toast.error('Please enter a report_run_id');
            return;
        }

        setIsAuditing(true);
        setAuditResults(null);
        setRepairResults(null);

        try {
            const response = await base44.functions.invoke('auditReportRunIntegrity', {
                report_run_id: reportRunId.trim()
            });

            if (response.data?.success) {
                setAuditResults(response.data);
                const issueCount = response.data.summary?.total_issues || 0;
                if (issueCount === 0) {
                    toast.success('✅ INTEGRITY CHECK PASSED - No mismatches found');
                } else {
                    toast.warning(`❌ Found ${issueCount} integrity issues`);
                }
            } else {
                toast.error('Audit failed: ' + (response.data?.error || 'Unknown error'));
            }
        } catch (error) {
            toast.error('Audit error: ' + error.message);
        } finally {
            setIsAuditing(false);
        }
    };

    const handleRepair = async () => {
        if (!reportRunId.trim()) {
            toast.error('Please enter a report_run_id');
            return;
        }

        if (!auditResults || auditResults.summary?.total_issues === 0) {
            toast.error('Run audit first to identify issues');
            return;
        }

        setIsRepairing(true);
        setRepairResults(null);

        try {
            const response = await base44.functions.invoke('repairSalaryReportFromSnapshots', {
                report_run_id: reportRunId.trim()
            });

            if (response.data?.success) {
                setRepairResults(response.data);
                const finalIssues = response.data.final_verification?.total_issues || 0;
                
                if (finalIssues === 0) {
                    toast.success('✅ REPAIR SUCCESSFUL - 0 mismatches after repair');
                    // Auto re-audit to show clean state
                    setTimeout(() => handleAudit(), 1000);
                } else {
                    toast.warning(`⚠️ REPAIR INCOMPLETE - ${finalIssues} issues remain`);
                }
            } else {
                toast.error('Repair failed: ' + (response.data?.error || 'Unknown error'));
            }
        } catch (error) {
            toast.error('Repair error: ' + error.message);
        } finally {
            setIsRepairing(false);
        }
    };

    const renderIssueDetails = (issue) => {
        if (!issue.details || issue.details.length === 0) return null;

        const sampleDetails = issue.details.slice(0, 10);

        return (
            <div className="mt-3 bg-slate-50 rounded-lg p-4 max-h-96 overflow-auto">
                <p className="text-xs font-medium text-slate-700 mb-2">
                    Showing {sampleDetails.length} of {issue.details.length} affected employees:
                </p>
                <div className="space-y-2">
                    {sampleDetails.map((detail, idx) => (
                        <div key={idx} className="text-xs bg-white rounded p-2 border border-slate-200">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-900">
                                    {detail.attendance_id} - {detail.name}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                    {detail.issue}
                                </Badge>
                            </div>
                            {detail.analysis_deductible_minutes != null && (
                                <div className="text-slate-600">
                                    Analysis: {detail.analysis_deductible_minutes} min
                                    {detail.snapshot_deductible_minutes != null && (
                                        <> → Snapshot: {detail.snapshot_deductible_minutes} min</>
                                    )}
                                    {detail.delta != null && (
                                        <span className="text-red-600 font-medium"> (Δ {detail.delta})</span>
                                    )}
                                </div>
                            )}
                            {detail.snapshot_deductibleHours != null && (
                                <div className="text-slate-600">
                                    Snapshot: {detail.snapshot_deductibleHours} hrs → Report: {detail.report_deductibleHours} hrs
                                    {detail.delta != null && (
                                        <span className="text-red-600 font-medium"> (Δ {detail.delta.toFixed(2)})</span>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <Database className="w-7 h-7 text-indigo-600" />
                        Salary Data Integrity Repair Tool
                    </CardTitle>
                    <p className="text-sm text-slate-600 mt-2">
                        Validates and repairs data consistency across AnalysisResult → SalarySnapshot → SalaryReport pipeline
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3">
                        <Input
                            placeholder="Enter report_run_id..."
                            value={reportRunId}
                            onChange={(e) => setReportRunId(e.target.value)}
                            className="flex-1 max-w-md"
                        />
                        <Button
                            onClick={handleAudit}
                            disabled={isAuditing}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {isAuditing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Auditing...
                                </>
                            ) : (
                                <>
                                    <Eye className="w-4 h-4 mr-2" />
                                    Run Audit
                                </>
                            )}
                        </Button>
                        {auditResults && auditResults.summary?.total_issues > 0 && (
                            <Button
                                onClick={handleRepair}
                                disabled={isRepairing}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {isRepairing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Repairing...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="w-4 h-4 mr-2" />
                                        Execute Repair
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Audit Results */}
            {auditResults && (
                <Card className={`border-0 shadow-lg ${auditResults.summary?.total_issues === 0 ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500'}`}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            {auditResults.summary?.total_issues === 0 ? (
                                <>
                                    <CheckCircle className="w-6 h-6 text-green-600" />
                                    <span className="text-green-700">Integrity Check: PASSED</span>
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="w-6 h-6 text-red-600" />
                                    <span className="text-red-700">Integrity Check: FAILED</span>
                                </>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Summary */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-slate-50 rounded-lg p-4">
                                <p className="text-xs text-slate-600 mb-1">Report</p>
                                <p className="text-lg font-bold text-slate-900">{auditResults.summary?.report_name}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {auditResults.summary?.is_final ? '🔒 Finalized' : '⚠️ Not finalized'}
                                </p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-xs text-blue-600 mb-1">AnalysisResults</p>
                                <p className="text-2xl font-bold text-blue-900">{auditResults.summary?.total_analysis_results}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-4">
                                <p className="text-xs text-green-600 mb-1">SalarySnapshots</p>
                                <p className="text-2xl font-bold text-green-900">{auditResults.summary?.total_salary_snapshots}</p>
                            </div>
                            <div className={`rounded-lg p-4 ${auditResults.summary?.total_issues === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                                <p className={`text-xs mb-1 ${auditResults.summary?.total_issues === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    Total Issues
                                </p>
                                <p className={`text-2xl font-bold ${auditResults.summary?.total_issues === 0 ? 'text-green-900' : 'text-red-900'}`}>
                                    {auditResults.summary?.total_issues}
                                </p>
                            </div>
                        </div>

                        {/* Issues Breakdown */}
                        {auditResults.summary?.total_issues > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-slate-900">Issues Found:</h3>
                                {auditResults.issues?.map((issue, idx) => (
                                    <Card key={idx} className="border-red-200 bg-red-50">
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <Badge variant="destructive" className="mb-2">
                                                        {issue.severity}
                                                    </Badge>
                                                    <h4 className="font-semibold text-slate-900">{issue.type}</h4>
                                                    <p className="text-sm text-slate-700 mt-1">{issue.message}</p>
                                                </div>
                                                <Badge className="bg-red-600 text-white">
                                                    {issue.count} employees
                                                </Badge>
                                            </div>
                                            {renderIssueDetails(issue)}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {/* Sample Trace for Employee 107 */}
                        {auditResults.sample_trace && (
                            <Card className="border-indigo-200 bg-indigo-50">
                                <CardHeader>
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <Eye className="w-4 h-4" />
                                        Sample Pipeline Trace (Attendance ID: {auditResults.sample_trace.attendance_id})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {/* AnalysisResult */}
                                    <div className="bg-white rounded-lg p-3 border border-indigo-200">
                                        <p className="text-xs font-semibold text-indigo-900 mb-2">1️⃣ AnalysisResult (Finalized Source)</p>
                                        {auditResults.sample_trace.analysis_result ? (
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>Working Days: <span className="font-bold">{auditResults.sample_trace.analysis_result.working_days}</span></div>
                                                <div>Present Days: <span className="font-bold">{auditResults.sample_trace.analysis_result.present_days}</span></div>
                                                <div>Late Min: <span className="font-bold">{auditResults.sample_trace.analysis_result.late_minutes}</span></div>
                                                <div>Early Min: <span className="font-bold">{auditResults.sample_trace.analysis_result.early_checkout_minutes}</span></div>
                                                <div>Grace Min: <span className="font-bold">{auditResults.sample_trace.analysis_result.grace_minutes}</span></div>
                                                <div className="col-span-2 text-indigo-600 font-bold">
                                                    Deductible Min: {auditResults.sample_trace.analysis_result.deductible_minutes}
                                                    {auditResults.sample_trace.analysis_result.manual_deductible_minutes != null && (
                                                        <span className="text-purple-600"> (Manual Override: {auditResults.sample_trace.analysis_result.manual_deductible_minutes})</span>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-red-600 text-xs">❌ Missing</p>
                                        )}
                                    </div>

                                    {/* SalarySnapshot */}
                                    <div className="bg-white rounded-lg p-3 border border-indigo-200">
                                        <p className="text-xs font-semibold text-indigo-900 mb-2">2️⃣ SalarySnapshot (Must match AnalysisResult 1:1)</p>
                                        {auditResults.sample_trace.salary_snapshot ? (
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>Working Days: <span className="font-bold">{auditResults.sample_trace.salary_snapshot.working_days}</span></div>
                                                <div>Present Days: <span className="font-bold">{auditResults.sample_trace.salary_snapshot.present_days}</span></div>
                                                <div>Late Min: <span className="font-bold">{auditResults.sample_trace.salary_snapshot.late_minutes}</span></div>
                                                <div>Early Min: <span className="font-bold">{auditResults.sample_trace.salary_snapshot.early_checkout_minutes}</span></div>
                                                <div className="col-span-2 text-indigo-600 font-bold">
                                                    Deductible Min: {auditResults.sample_trace.salary_snapshot.deductible_minutes}
                                                </div>
                                                <div className="col-span-2 text-green-600 font-bold">
                                                    Deductible Hours: {auditResults.sample_trace.salary_snapshot.deductibleHours}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-red-600 text-xs">❌ Missing</p>
                                        )}
                                    </div>

                                    {/* SalaryReport Row */}
                                    <div className="bg-white rounded-lg p-3 border border-indigo-200">
                                        <p className="text-xs font-semibold text-indigo-900 mb-2">3️⃣ SalaryReport.snapshot_data (Must match SalarySnapshot)</p>
                                        {auditResults.sample_trace.salary_report_row ? (
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>Working Days: <span className="font-bold">{auditResults.sample_trace.salary_report_row.working_days}</span></div>
                                                <div>Present Days: <span className="font-bold">{auditResults.sample_trace.salary_report_row.present_days}</span></div>
                                                <div className="col-span-2 text-green-600 font-bold">
                                                    Deductible Hours: {auditResults.sample_trace.salary_report_row.deductibleHours}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-red-600 text-xs">❌ Missing</p>
                                        )}
                                    </div>

                                    {/* Verdict */}
                                    <div className={`rounded-lg p-3 ${
                                        auditResults.sample_trace.analysis_result?.deductible_minutes === auditResults.sample_trace.salary_snapshot?.deductible_minutes &&
                                        auditResults.sample_trace.salary_snapshot?.deductibleHours === auditResults.sample_trace.salary_report_row?.deductibleHours
                                        ? 'bg-green-50 border border-green-200'
                                        : 'bg-red-50 border border-red-200'
                                    }`}>
                                        {auditResults.sample_trace.analysis_result?.deductible_minutes === auditResults.sample_trace.salary_snapshot?.deductible_minutes &&
                                         auditResults.sample_trace.salary_snapshot?.deductibleHours === auditResults.sample_trace.salary_report_row?.deductibleHours ? (
                                            <p className="text-sm text-green-700 font-medium">✅ Pipeline is consistent for this employee</p>
                                        ) : (
                                            <p className="text-sm text-red-700 font-medium">❌ Pipeline has mismatches - repair needed</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Repair Results */}
            {repairResults && (
                <Card className={`border-0 shadow-lg ${repairResults.final_verification?.total_issues === 0 ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-amber-500'}`}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <RefreshCw className="w-6 h-6 text-green-600" />
                            Repair Results
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-blue-50 rounded-lg p-4">
                                <p className="text-xs text-blue-600 mb-1">Snapshots Recreated</p>
                                <p className="text-2xl font-bold text-blue-900">{repairResults.actions_taken?.snapshots_recreated || 0}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-4">
                                <p className="text-xs text-green-600 mb-1">Reports Regenerated</p>
                                <p className="text-2xl font-bold text-green-900">{repairResults.actions_taken?.reports_regenerated || 0}</p>
                            </div>
                        </div>

                        {/* Final Verification */}
                        <div className={`rounded-lg p-4 ${repairResults.final_verification?.total_issues === 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                            <p className="font-semibold text-sm mb-2">
                                {repairResults.final_verification?.status === 'CLEAN' ? '✅' : '⚠️'} Final Verification
                            </p>
                            <p className="text-sm">{repairResults.final_verification?.message}</p>
                            {repairResults.final_verification?.total_issues > 0 && (
                                <p className="text-xs text-amber-700 mt-2">
                                    Some issues remain. You may need to run audit again to see details.
                                </p>
                            )}
                        </div>

                        {repairResults.errors && repairResults.errors.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm font-semibold text-red-900 mb-2">Errors:</p>
                                <ul className="text-xs text-red-700 space-y-1">
                                    {repairResults.errors.map((err, idx) => (
                                        <li key={idx}>• {err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Instructions */}
            <Card className="border-indigo-200 bg-indigo-50">
                <CardHeader>
                    <CardTitle className="text-sm">How to Use</CardTitle>
                </CardHeader>
                <CardContent className="text-xs space-y-2 text-slate-700">
                    <p><strong>1. Run Audit:</strong> Enter a report_run_id and click "Run Audit" to check data integrity</p>
                    <p><strong>2. Review Issues:</strong> If issues are found, review the details to understand what needs repair</p>
                    <p><strong>3. Execute Repair:</strong> Click "Execute Repair" to fix all issues automatically</p>
                    <p><strong>4. Verify:</strong> The system will auto-run audit again after repair to confirm 0 mismatches</p>
                    <div className="mt-3 bg-white rounded-lg p-3 border border-indigo-200">
                        <p className="font-semibold mb-1">What the repair does:</p>
                        <ul className="space-y-1 ml-4 list-disc">
                            <li>If SalarySnapshot.deductible_minutes ≠ AnalysisResult.deductible_minutes → Recreate snapshots from AnalysisResult</li>
                            <li>If SalaryReport.snapshot_data ≠ SalarySnapshot → Regenerate report from live snapshots</li>
                            <li>All operations use the SAME report_run_id - no alternative data sources</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}