import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Trash2, CheckCircle, Star, Save, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export default function ReportTab({ project, isDepartmentHead = false }) {
    console.log('[ReportTab] Rendering with:', { projectId: project?.id, isDepartmentHead });
    
    const queryClient = useQueryClient();

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
            // Fetch all associated data for this report
            const [resultsToDelete, snapshotsToDelete] = await Promise.all([
                base44.entities.AnalysisResult.filter({ 
                    project_id: project.id, 
                    report_run_id: reportRunId 
                }),
                base44.entities.SalarySnapshot.filter({
                    project_id: project.id,
                    report_run_id: reportRunId
                })
            ]);
            
            // Delete in batches of 5 with delays to avoid rate limiting
            const BATCH_SIZE = 5;
            const DELAY_MS = 200;
            
            const deleteInBatches = async (items, deleteFunc) => {
                for (let i = 0; i < items.length; i += BATCH_SIZE) {
                    const batch = items.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(item => deleteFunc(item.id)));
                    if (i + BATCH_SIZE < items.length) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                    }
                }
            };
            
            // Delete results first
            if (resultsToDelete.length > 0) {
                await deleteInBatches(resultsToDelete, (id) => base44.entities.AnalysisResult.delete(id));
            }
            
            // Then delete snapshots
            if (snapshotsToDelete.length > 0) {
                await deleteInBatches(snapshotsToDelete, (id) => base44.entities.SalarySnapshot.delete(id));
            }
            
            // Finally, delete the report run itself
            await base44.entities.ReportRun.delete(reportRunId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reportRuns', project.id] });
            queryClient.invalidateQueries({ queryKey: ['reportResults', project.id] });
            queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id] });
            toast.success('Report and associated salary data deleted successfully');
        },
        onError: (error) => {
            console.error('[ReportTab] Delete error:', error);
            toast.error('Failed to delete report: ' + (error.message || 'Unknown error'));
        }
    });

    const markFinalMutation = useMutation({
        mutationFn: async (reportRunId) => {
            // Call backend function to mark final and create snapshots
            const result = await base44.functions.invoke('markFinalReport', {
                project_id: project.id,
                report_run_id: reportRunId
            });
            return { reportRunId, result };
        },
        onSuccess: async ({ reportRunId, result }) => {
            // Force refetch all relevant queries - do NOT rely on staleTime
            // Use refetchType: 'all' to ensure immediate refetch even if data is "fresh"
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['project', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['reportRuns', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id, reportRunId], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['projects'], refetchType: 'all' })
            ]);
            toast.success('Report marked as final. Salary snapshots created.');
        },
        onError: async (error) => {
            // CRITICAL: Invalidate queries on error to reflect backend rollback
            // Backend may have rolled back is_final=false if validation failed
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['reportRuns', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['project', project.id], refetchType: 'all' })
            ]);
            
            // Show detailed error message
            const errorMsg = error?.response?.data?.error || error.message || 'Unknown error';
            const actionRequired = error?.response?.data?.action_required;
            
            if (actionRequired) {
                toast.error(`${errorMsg}\n\nAction required: ${actionRequired}`, {
                    duration: 10000
                });
            } else {
                toast.error('Failed to mark report as final: ' + errorMsg, {
                    duration: 5000
                });
            }
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
    // Memoize report run IDs to prevent infinite re-renders
    const reportRunIds = React.useMemo(() => reportRuns.map(r => r.id).join(','), [reportRuns]);

    const { data: reportResults = {} } = useQuery({
        queryKey: ['reportResults', project.id, reportRunIds],
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

    // Find the finalized report
    const finalizedReport = allReportRuns.find(r => r.is_final === true);

    return (
        <div className="space-y-6">
            <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Generated Reports</CardTitle>
                    {finalizedReport && isAdminOrSupervisor && (
                        <Button
                            variant="outline"
                            onClick={async () => {
                                if (!confirm('Run data integrity repair? This will:\n1. Audit finalized report data\n2. Fix any mismatches between AnalysisResult → SalarySnapshot → SalaryReport\n3. Show final verification')) return;
                                
                                try {
                                    const { data } = await base44.functions.invoke('repairSalaryReportFromSnapshots', {
                                        report_run_id: finalizedReport.id
                                    });
                                    
                                    const msg = data.final_verification.status === 'CLEAN'
                                        ? `✅ REPAIR SUCCESSFUL\n\n${data.message}\n\nFinal Verification: ${data.final_verification.message}`
                                        : `⚠️ REPAIR INCOMPLETE\n\n${data.message}\n\nFinal Status: ${data.final_verification.message}`;
                                    
                                    alert(msg);
                                    
                                    if (data.final_verification.status === 'CLEAN') {
                                        queryClient.invalidateQueries(['reportRuns', project.id]);
                                        queryClient.invalidateQueries(['results']);
                                        queryClient.invalidateQueries(['salarySnapshots']);
                                    }
                                } catch (err) {
                                    alert('Repair failed: ' + err.message);
                                }
                            }}
                            className="text-purple-600 border-purple-600"
                        >
                            <Settings className="w-4 h-4 mr-2" />
                            Repair Finalized Data
                        </Button>
                    )}
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
                                                    <div className="flex flex-wrap gap-1">
                                                        {run.is_final && (
                                                            <Badge className="bg-green-100 text-green-700 border-green-300">
                                                                <Star className="w-3 h-3 mr-1 fill-green-700" />
                                                                Final
                                                            </Badge>
                                                        )}
                                                        {project.last_saved_report_id === run.id && (
                                                            <Badge className="bg-blue-100 text-blue-700 border-blue-300">
                                                                <Save className="w-3 h-3 mr-1" />
                                                                Saved
                                                            </Badge>
                                                        )}
                                                    </div>
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
                                                                 disabled={markFinalMutation.isPending || run.is_final}
                                                                 title={run.is_final ? "Report already finalized" : "Mark as final report for salary"}
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