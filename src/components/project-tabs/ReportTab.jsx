import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Trash2, CheckCircle, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export default function ReportTab({ project }) {
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isAdminOrSupervisor = isAdmin || isSupervisor;

    const { data: allReportRuns = [] } = useQuery({
        queryKey: ['reportRuns', project.id],
        queryFn: () => base44.entities.ReportRun.filter({ project_id: project.id }, '-created_date')
    });

    // If project is closed, only show the last saved report
    const reportRuns = project.status === 'closed' && project.last_saved_report_id
        ? allReportRuns.filter(r => r.id === project.last_saved_report_id)
        : allReportRuns;

    const { data: allResults = [] } = useQuery({
        queryKey: ['results', project.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ project_id: project.id })
    });

    const deleteReportMutation = useMutation({
        mutationFn: async (reportRunId) => {
            const resultsToDelete = allResults.filter(r => r.report_run_id === reportRunId);
            await Promise.all(resultsToDelete.map(r => base44.entities.AnalysisResult.delete(r.id)));
            await base44.entities.ReportRun.delete(reportRunId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['reportRuns', project.id]);
            queryClient.invalidateQueries(['results', project.id]);
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

    return (
        <div className="space-y-6">
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
                                        <TableHead>Employees</TableHead>
                                        <TableHead>Verified</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportRuns.map((run) => {
                                        const runResults = allResults.filter(r => r.report_run_id === run.id);
                                        const verifiedCount = run.verified_employees ? run.verified_employees.split(',').filter(Boolean).length : 0;
                                        
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
                                                <TableCell>{run.employee_count}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <span className={verifiedCount === run.employee_count ? 'text-green-600' : 'text-slate-600'}>
                                                            {verifiedCount} / {run.employee_count}
                                                        </span>
                                                        {verifiedCount === run.employee_count && (
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
                                                        {isAdminOrSupervisor && !run.is_final && (
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
                                                        {isAdmin && (
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