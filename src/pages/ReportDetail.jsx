import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { toast } from 'sonner';
import ReportDetailView from '../components/project-tabs/ReportDetailView';
import ApprovalLinksHistory from '../components/reports/ApprovalLinksHistory';
import { formatInUAE } from '@/components/ui/timezone';

export default function ReportDetailPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const reportRunId = urlParams.get('id');
    const projectId = urlParams.get('project_id');

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: reportRun, isLoading: reportLoading, error: reportError } = useQuery({
        queryKey: ['reportRun', reportRunId],
        queryFn: async () => {
            const runs = await base44.entities.ReportRun.filter({ id: reportRunId });
            return runs[0];
        },
        enabled: !!reportRunId
    });

    const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
        queryKey: ['project', projectId],
        queryFn: async () => {
            const projects = await base44.entities.Project.filter({ id: projectId });
            return projects[0];
        },
        enabled: !!projectId
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';

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
                    <Link to={createPageUrl('ProjectDetail') + `?id=${projectId}`}>
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Project
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            Report: {formatInUAE(reportRun.date_from, 'MM/dd/yyyy')} - {formatInUAE(reportRun.date_to, 'MM/dd/yyyy')}
                        </h1>
                        <p className="text-sm text-slate-600 mt-1">
                            Generated on {formatInUAE(reportRun.created_date, 'MM/dd/yyyy hh:mm a')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Report Detail View */}
            <ReportDetailView reportRun={reportRun} project={project} />
            
            {isAdmin && <ApprovalLinksHistory reportRunId={reportRun.id} projectId={project.id} />}
        </div>
    );
}