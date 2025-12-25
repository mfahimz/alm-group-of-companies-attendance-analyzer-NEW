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
import Breadcrumb from '../components/ui/Breadcrumb';

export default function ProjectDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');
    const [activeTab, setActiveTab] = useState('overview');

    const { data: project, isLoading } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => base44.entities.Project.filter({ id: projectId }).then(res => res[0]),
        enabled: !!projectId
    });

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isAdminOrSupervisor = isAdmin || isSupervisor;
    const isReadOnly = project?.status === 'closed' && !isAdminOrSupervisor;

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
            <Breadcrumb items={[
                { label: 'Projects', href: 'Projects' },
                { label: project.name }
            ]} />
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{project.name}</h1>
                        <p className="text-slate-600 mt-1 sm:mt-2 text-sm sm:text-base">
                        {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                    </p>
                </div>
                <span className={`
                    px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium w-fit
                    ${project.status === 'draft' ? 'bg-amber-100 text-amber-700' : ''}
                    ${project.status === 'analyzed' ? 'bg-green-100 text-green-700' : ''}
                    ${project.status === 'locked' ? 'bg-slate-100 text-slate-700' : ''}
                    ${project.status === 'closed' ? 'bg-red-100 text-red-700' : ''}
                `}>
                    {project.status}
                </span>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="bg-white border border-slate-200 p-1 flex flex-wrap h-auto gap-1">
                    <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
                    <TabsTrigger value="punches" disabled={isReadOnly} className="text-xs sm:text-sm">
                        Punches {isReadOnly && '🔒'}
                    </TabsTrigger>
                    <TabsTrigger value="shifts" disabled={isReadOnly} className="text-xs sm:text-sm">
                        Shifts {isReadOnly && '🔒'}
                    </TabsTrigger>
                    <TabsTrigger value="exceptions" disabled={isReadOnly} className="text-xs sm:text-sm">
                        Exceptions {isReadOnly && '🔒'}
                    </TabsTrigger>
                    <TabsTrigger value="analysis" disabled={isReadOnly} className="text-xs sm:text-sm">
                        Analysis {isReadOnly && '🔒'}
                    </TabsTrigger>
                    <TabsTrigger value="report" className="text-xs sm:text-sm">Report</TabsTrigger>
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