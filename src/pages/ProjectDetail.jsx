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
        <div className="space-y-6 animate-in fade-in duration-500">
            <Breadcrumb items={[
                { label: 'Projects', href: 'Projects' },
                { label: project.name }
            ]} />
            {/* Header */}
            <div className="bg-gradient-to-br from-white to-slate-50 rounded-3xl shadow-xl p-6 sm:p-8 border border-slate-200 animate-in slide-in-from-top-4 duration-700">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-2 h-12 rounded-full bg-gradient-to-b ${
                                project.status === 'draft' ? 'from-amber-400 to-amber-600' :
                                project.status === 'analyzed' ? 'from-green-400 to-green-600' :
                                project.status === 'locked' ? 'from-slate-400 to-slate-600' :
                                'from-red-400 to-red-600'
                            }`} />
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                                    {project.name}
                                </h1>
                                <p className="text-slate-600 mt-1 text-sm font-medium">{project.company}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                            <Calendar className="w-4 h-4" />
                            <p className="text-sm sm:text-base font-semibold">
                                {new Date(project.date_from).toLocaleDateString('en-GB')} → {new Date(project.date_to).toLocaleDateString('en-GB')}
                            </p>
                        </div>
                    </div>
                    <span className={`
                        px-4 py-2.5 rounded-2xl text-sm font-bold uppercase tracking-wider shadow-lg ring-2 whitespace-nowrap
                        ${project.status === 'draft' ? 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-700 ring-amber-200' : ''}
                        ${project.status === 'analyzed' ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-700 ring-green-200' : ''}
                        ${project.status === 'locked' ? 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-700 ring-slate-300' : ''}
                        ${project.status === 'closed' ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 ring-red-200' : ''}
                    `}>
                        {project.status}
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <div className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-xl -mx-6 px-6 py-3 border-b border-slate-200">
                    <TabsList className="bg-white shadow-lg rounded-2xl p-1.5 flex flex-wrap h-auto gap-1 w-full sm:w-auto border-0">
                        <TabsTrigger 
                            value="overview" 
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300"
                        >
                            Overview
                        </TabsTrigger>
                        <TabsTrigger 
                            value="punches" 
                            disabled={isReadOnly} 
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300"
                        >
                            Punches {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger 
                            value="shifts" 
                            disabled={isReadOnly} 
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300"
                        >
                            Shifts {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger 
                            value="exceptions" 
                            disabled={isReadOnly} 
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300"
                        >
                            Exceptions {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger 
                            value="analysis" 
                            disabled={isReadOnly} 
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300"
                        >
                            Analysis {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger 
                            value="report" 
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300"
                        >
                            Report
                        </TabsTrigger>
                    </TabsList>
                </div>

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