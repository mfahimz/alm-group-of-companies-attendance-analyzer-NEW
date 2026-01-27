import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@anstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Trash2, CheckCircle, Star, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ReportTab({ project, isDepartmentHead = false }) {
    console.log('[ReportTab] Rendering with:', { projectId: project?.id, isDepartmentHead });
    
    const queryClient = useQueryClient();
    const [showNewFeaturePopup, setShowNewFeaturePopup] = React.useState(true);

    // Check if we should show the popup (until Jan 31, 2026)
    const shouldShowPopup = React.useMemo(() => {
        const now = new Date();
        const endDate = new Date('2026-01-31T23:59:59');
        return now <= endDate && showNewFeaturePopup;
    }, [showNewFeaturePopup]);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isAdminOrSupervisor = isAdmin || isSupervisor;

    console.log('[ReportTab] User role:', { userRole, isDepartmentHead, isAdmin, isSupervisor });

    // Get department head verification if department head
    const { data: deptHeadVerification, error: deptHeadError } = useQuery({
        queryKey: ['deptHeadVerification', isDepartmentHead, currentUser?.email],
        queryFn: async () => {
            // Double-check to prevent any execution for non-department heads
            if (!isDepartmentHead) {
                console.log('[ReportTab] Skipping dept head verification - not a department head');
                return null;
            }
            console.log('[ReportTab] Verifying department head');
            const { data } = await base44.functions.invoke('verifyDepartmentHead', {});
            console.log('[ReportTab] Department head verification result:', data);
            return data;
        },
        enabled: isDepartmentHead && !!currentUser,
        retry: false,
        staleTime: Infinity // Don't refetch automatically
    });

    React.useEffect(() => {
        if (deptHeadError && isDepartmentHead) {
            console.error('[ReportTab] Department head verification error:', deptHeadError);
        }
    }, [deptHeadError, isDepartmentHead]);

    const { data: allReportRuns = [], error: reportRunsError } = useQuery({
        queryKey: ['reportRuns', project.id],
        queryFn: async () => {
            console.log('[ReportTab] Fetching report runs for project:', project.id);
            const runs = await base44.entities.ReportRun.filter({ project_id: project.id }, '-created_date');
            console.log('[ReportTab] Fetched', runs.length, 'report runs');
            return runs;
        }
    });

    React.useEffect(() => {
        if (reportRunsError) {
            console.error('[ReportTab] Report runs fetch error:', reportRunsError);
        }
    }, [reportRunsError]);

    // If project is closed, only show the last saved report
    const reportRuns = project.status === 'closed' && project.last_saved_report_id
        ? allReportRuns.filter(r => r.id === project.last_saved_report_id)
        : allReportRuns;

    console.log('[ReportTab] Report runs filtered:', {
        total: allReportRuns.length,
        filtered: reportRuns.length,
        isClosed: project.status === 'closed',
        lastSavedId: project.last_saved_report_id
    });

    // Don't fetch all results upfront - fetch per report when needed
    // This prevents loading hundreds of duplicate analysis results from all historical runs

    // Get employees for department head filtering - MUST use managed_employee_ids
    const { data: departmentEmployees = [], error: employeesError } = useQuery({
        queryKey: ['departmentEmployees', project.id, isDepartmentHead, deptHeadVerification?.assignment?.managed_employee_ids],
        queryFn: async () => {
            if (!isDepartmentHead || !deptHeadVerification?.verified) {
                console.log('[ReportTab] Skipping employee fetch - not dept head or not verified');
                return [];
            }
            
            const managedIds = deptHeadVerification.assignment.managed_employee_ids 
                ? deptHeadVerification.assignment.managed_employee_ids.split(',').map(id => String(id.trim()))
                : [];
            
            console.log('[ReportTab] Managed employee IDs:', managedIds);
            
            if (managedIds.length === 0) {
                console.log('[ReportTab] No managed employees found');
                return [];
            }
            
            // Fetch all employees for the company
            const allEmployees = await base44.entities.Employee.filter({
                company: deptHeadVerification.assignment.company,
                active: true
            });

            console.log('[ReportTab] Fetched', allEmployees.length, 'total employees in company');

            // Filter to only managed subordinates using Employee IDs (not HRMS IDs)
            // CRITICAL: Exclude department head from the list
            const filtered = allEmployees.filter(emp => 
                managedIds.includes(String(emp.id)) && 
                String(emp.id) !== String(deptHeadVerification.assignment.employee_id)
            );

            console.log('[ReportTab] Filtered to', filtered.length, 'managed employees (excluding dept head)');
            return filtered;
        },
        enabled: isDepartmentHead && !!deptHeadVerification?.verified
    });

    React.useEffect(() => {
        if (employeesError) {
            console.error('[ReportTab] Department employees fetch error:', employeesError);
        }
    }, [employeesError]);

    const deleteReportMutation = useMutation({
        mutationFn: async (reportRunId) => {
            // Fetch results only for this specific report run to delete
            const resultsToDelete = await base44.entities.AnalysisResult.filter({ 
                project_id: project.id, 
                report_run_id: reportRunId 
            });
            await Promise.all(resultsToDelete.map(r => base44.entities.AnalysisResult.delete(r.id)));
            await base44.entities.ReportRun.delete(reportRunId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['reportRuns', project.id]);
            queryClient.invalidateQueries(['reportResults', project.id]);
            toast.success('Report deleted successfully');
        },
        onError: () => {
            toast.error('Failed to delete report');
        }
    });

    const markFinalMutation = useMutation({
        mutationFn: async (reportRunId) => {
            // First, unmark all other reports as final
            const otherReports = allReportRuns.filter(r => r.id !== reportRunId);
            await Promise.all(otherReports.map(r => 
                base44.entities.ReportRun.update(r.id, { is_final: false })
            ));
            
            // Mark this report as final
            await base44.entities.ReportRun.update(reportRunId, { is_final: true });
            
            // Update project's last_saved_report_id
            await base44.entities.Project.update(project.id, { last_saved_report_id: reportRunId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['reportRuns', project.id]);
            queryClient.invalidateQueries(['projects']);
            toast.success('Report marked as final for salary calculation');
        },
        onError: () => {
            toast.error('Failed to mark report as final');
        }
    });

    const handleDeleteReport = (reportRunId) => {
        if (window.confirm('Delete this report? This will permanently remove all analysis results from this run.')) {
            deleteReportMutation.mutate(reportRunId);
        }
    };

    const handleMarkFinal = (reportRunId) => {
        if (window.confirm('Mark this report as final for salary calculation? This will unmark any previously selected final report.')) {
            markFinalMutation.mutate(reportRunId);
        }
    };

    // Use a query hook to fetch results for a specific report when displaying verification count
    const { data: reportResults = {} } = useQuery({
        queryKey: ['reportResults', project.id, reportRuns.map(r => r.id)],
        queryFn: async () => {
            // Fetch results only for displayed reports
            const resultsByReport = {};
            for (const run of reportRuns) {
                const results = await base44.entities.AnalysisResult.filter({ 
                    project_id: project.id,
                    report_run_id: run.id 
                });
                
                // Filter for department heads
                const filteredForDeptHead = isDepartmentHead && deptHeadVerification?.verified
                    ? results.filter(result => {
                        const resultAttIdStr = String(result.attendance_id);
                        return departmentEmployees.some(emp => String(emp.attendance_id) === resultAttIdStr);
                    })
                    : results;
                
                resultsByReport[run.id] = filteredForDeptHead;
            }
            return resultsByReport;
        },
        enabled: reportRuns.length > 0
    });

    return (
        <div className="space-y-6">
            {/* New Feature Popup */}
            {shouldShowPopup && (
                <div className="fixed bottom-6 left-6 z-50 max-w-md animate-in slide-in-from-bottom-5">
                    <Alert className="bg-white border-indigo-200 shadow-lg">
                        <div className="flex items-start gap-3">
                            <div className="flex-1">
                                <AlertDescription className="text-sm space-y-2">
                                    <p className="font-semibold text-indigo-900 mb-2">🎉 New Features Available</p>
                                    <ul className="space-y-1 text-slate-700">
                                        <li className="flex items-start gap-2">
                                            <span className="text-green-600 mt-0.5">✅</span>
                                            <span><strong>Verification Checkbox</strong> - Disabled if employee has RED abnormalities (notes field filled)</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-green-600 mt-0.5">✅</span>
                                            <span><strong>Save Report</strong> - Non-admins blocked until all verified; admins shown confirmation if incomplete</span>
                                        </li>
                                    </ul>
                                </AlertDescription>
                            </div>
                            <button
                                onClick={() => setShowNewFeaturePopup(false)}
                                className="text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </Alert>
                </div>
            )}

            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Generated Reports</CardTitle>
                </CardHeader>
                <CardContent>
                    {reportRuns.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No reports generated yet. Go to Analysis tab to generate your first report.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Report Name</TableHead>
                                        <TableHead>Generated On</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead>{isDepartmentHead ? 'Your Team' : 'Employees'}</TableHead>
                                        <TableHead>Verified</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportRuns.map((run) => {
                                        const runResults = reportResults[run.id] || [];
                                        const verifiedCount = isDepartmentHead
                                            ? runResults.length // For dept heads, show results count as verification
                                            : (run.verified_employees ? run.verified_employees.split(',').filter(Boolean).length : 0);
                                        
                                        return (
                                            <TableRow key={run.id}>
                                                <TableCell className="font-medium">
                                                    {run.report_name || 'Unnamed Report'}
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(run.created_date).toLocaleString('en-US', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: true,
                                                        timeZone: 'Asia/Dubai'
                                                    })}
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(run.date_from).toLocaleDateString()} - {new Date(run.date_to).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    {isDepartmentHead ? departmentEmployees.length : run.employee_count}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <span className={isDepartmentHead 
                                                            ? 'text-slate-600' 
                                                            : (verifiedCount === run.employee_count ? 'text-green-600' : 'text-slate-600')
                                                        }>
                                                            {isDepartmentHead ? runResults.length : verifiedCount} / {isDepartmentHead ? departmentEmployees.length : run.employee_count}
                                                        </span>
                                                        {!isDepartmentHead && verifiedCount === run.employee_count && (
                                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {run.is_final && (
                                                        <Badge className="bg-green-100 text-green-700 border-green-300">
                                                            <Star className="w-3 h-3 mr-1 fill-green-700" />
                                                            Final Report
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex gap-1 justify-end">
                                                        <Link to={createPageUrl('ReportDetail') + `?id=${run.id}&project_id=${project.id}`}>
                                                            <Button size="sm" variant="ghost" title="View report">
                                                                <Eye className="w-4 h-4 text-indigo-600" />
                                                            </Button>
                                                        </Link>
                                                        {!isDepartmentHead && isAdminOrSupervisor && !run.is_final && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="ghost"
                                                                onClick={() => handleMarkFinal(run.id)}
                                                                disabled={markFinalMutation.isPending}
                                                                title="Mark as final report for salary"
                                                            >
                                                                <Star className="w-4 h-4 text-amber-600" />
                                                            </Button>
                                                        )}
                                                        {!isDepartmentHead && isAdmin && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="ghost"
                                                                onClick={() => handleDeleteReport(run.id)}
                                                                disabled={deleteReportMutation.isPending}
                                                                title="Delete report"
                                                            >
                                                                <Trash2 className="w-4 h-4 text-red-600" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}