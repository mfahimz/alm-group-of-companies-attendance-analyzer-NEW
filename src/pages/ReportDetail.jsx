import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import ReportDetailView from '../components/project-tabs/ReportDetailView';
import { formatInUAE } from '@/components/ui/timezone';

export default function ReportDetailPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const reportRunId = urlParams.get('id');
    const projectId = urlParams.get('project_id');
    const fromTab = urlParams.get('from_tab') || 'overview';

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isDepartmentHead = userRole === 'department_head';

    // Department head verification
    const { data: deptHeadVerification } = useQuery({
        queryKey: ['deptHeadVerification', isDepartmentHead, currentUser?.email],
        queryFn: async () => {
            if (!isDepartmentHead) return null;
            const { data } = await base44.functions.invoke('verifyDepartmentHead', {});
            return data;
        },
        enabled: !!currentUser && isDepartmentHead,
        retry: false
    });

    const { data: reportRun, isLoading: reportLoading, error: reportError } = useQuery({
        queryKey: ['reportRun', reportRunId],
        queryFn: async () => {
            const runs = await base44.entities.ReportRun.filter({ id: reportRunId });
            return runs[0];
        },
        enabled: !!reportRunId,
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
    });

    const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
        queryKey: ['project', projectId],
        queryFn: async () => {
            const projects = await base44.entities.Project.filter({ id: projectId });
            return projects[0];
        },
        enabled: !!projectId,
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
    });

    if (reportLoading || projectLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-500">Loading report...</div>
            </div>
        );
    }

    if (reportError || projectError) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-red-600">Error loading report: {(reportError || projectError)?.message}</div>
            </div>
        );
    }

    if (!reportRun || !project) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-600">Report not found</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* preserve context: from_tab query parameter tells us which tab we came from (default: overview) */}
                    <Link to={createPageUrl('ProjectDetail') + `?id=${projectId}&tab=${fromTab}`}>
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Project
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {reportRun.report_name || `Report: ${formatInUAE(reportRun.date_from, 'MM/dd/yyyy')} - ${formatInUAE(reportRun.date_to, 'MM/dd/yyyy')}`}
                        </h1>
                        <p className="text-sm text-slate-600 mt-1">
                            Generated on {formatInUAE(reportRun.created_date, 'MM/dd/yyyy hh:mm a')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Report Detail View */}
            <ReportDetailView 
                reportRun={reportRun} 
                project={project} 
                isDepartmentHead={isDepartmentHead}
                deptHeadVerification={deptHeadVerification}
            />
        </div>
    );
}