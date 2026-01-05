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

export default function ReportDetailPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const reportRunId = urlParams.get('id');
    const projectId = urlParams.get('project_id');

    const queryClient = useQueryClient();

    const { data: reportRun } = useQuery({
        queryKey: ['reportRun', reportRunId],
        queryFn: async () => {
            const runs = await base44.entities.ReportRun.filter({ id: reportRunId });
            return runs[0];
        },
        enabled: !!reportRunId
    });

    const { data: project } = useQuery({
        queryKey: ['project', projectId],
        queryFn: async () => {
            const projects = await base44.entities.Project.filter({ id: projectId });
            return projects[0];
        },
        enabled: !!projectId
    });

    if (!reportRun || !project) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-500">Loading report...</div>
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
                            Report: {new Date(reportRun.date_from).toLocaleDateString()} - {new Date(reportRun.date_to).toLocaleDateString()}
                        </h1>
                        <p className="text-sm text-slate-600 mt-1">
                            Generated on {new Date(reportRun.created_date).toLocaleString('en-US', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'Asia/Dubai'
                            })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Report Detail View */}
            <ReportDetailView reportRun={reportRun} project={project} />
            
            <ApprovalLinksHistory reportRunId={reportRun.id} projectId={project.id} />
        </div>
    );
}