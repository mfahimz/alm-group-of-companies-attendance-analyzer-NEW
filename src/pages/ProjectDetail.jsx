import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import OverviewTab from '../components/project-tabs/OverviewTab';
import PunchUploadTab from '../components/project-tabs/PunchUploadTab';
import ShiftTimingsTab from '../components/project-tabs/ShiftTimingsTab';
import ExceptionsTab from '../components/project-tabs/ExceptionsTab';
import RunAnalysisTab from '../components/project-tabs/RunAnalysisTab';
import ReportTab from '../components/project-tabs/ReportTab';

export default function ProjectDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');
    const [activeTab, setActiveTab] = useState('overview');

    const { data: project, isLoading } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => base44.entities.Project.filter({ id: projectId }).then(res => res[0]),
        enabled: !!projectId
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-slate-500">Loading project...</div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-center py-12">
                <p className="text-slate-500">Project not found</p>
                <Link to={createPageUrl('Projects')} className="text-indigo-600 hover:text-indigo-700 mt-4 inline-block">
                    Back to Projects
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <Link 
                    to={createPageUrl('Projects')}
                    className="inline-flex items-center text-slate-600 hover:text-slate-900 mb-4"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Projects
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
                        <p className="text-slate-600 mt-2">
                            {new Date(project.date_from).toLocaleDateString()} - {new Date(project.date_to).toLocaleDateString()}
                        </p>
                    </div>
                    <span className={`
                        px-4 py-2 rounded-full text-sm font-medium
                        ${project.status === 'draft' ? 'bg-amber-100 text-amber-700' : ''}
                        ${project.status === 'analyzed' ? 'bg-green-100 text-green-700' : ''}
                        ${project.status === 'locked' ? 'bg-slate-100 text-slate-700' : ''}
                    `}>
                        {project.status}
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="bg-white border border-slate-200 p-1">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="punches">Punch Upload</TabsTrigger>
                    <TabsTrigger value="shifts">Shift Timings</TabsTrigger>
                    <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
                    <TabsTrigger value="analysis">Run Analysis</TabsTrigger>
                    <TabsTrigger value="report">Report</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                    <OverviewTab project={project} />
                </TabsContent>

                <TabsContent value="punches">
                    <PunchUploadTab project={project} />
                </TabsContent>

                <TabsContent value="shifts">
                    <ShiftTimingsTab project={project} />
                </TabsContent>

                <TabsContent value="exceptions">
                    <ExceptionsTab project={project} />
                </TabsContent>

                <TabsContent value="analysis">
                    <RunAnalysisTab project={project} />
                </TabsContent>

                <TabsContent value="report">
                    <ReportTab project={project} />
                </TabsContent>
            </Tabs>
        </div>
    );
}