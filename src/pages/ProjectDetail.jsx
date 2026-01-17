import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, LockOpen, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import OverviewTab from '../components/project-tabs/OverviewTab';
import PunchUploadTab from '../components/project-tabs/PunchUploadTab';
import ShiftTimingsTab from '../components/project-tabs/ShiftTimingsTab';
import ExceptionsTab from '../components/project-tabs/ExceptionsTab';
import RunAnalysisTab from '../components/project-tabs/RunAnalysisTab';
import ReportTab from '../components/project-tabs/ReportTab';
import SalaryTab from '../components/project-tabs/SalaryTab';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function ProjectDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const [activeTab, setActiveTab] = useState('overview');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }).then((res) => res[0]),
    enabled: !!projectId
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const queryClient = useQueryClient();

  const userRole = currentUser?.extended_role || currentUser?.role || 'user';
  const isAdmin = userRole === 'admin';
  const isSupervisor = userRole === 'supervisor';
  const isCEO = userRole === 'ceo';
  const isAdminOrSupervisor = isAdmin || isSupervisor || isCEO;
  const isReadOnly = project?.status === 'closed' && !isAdminOrSupervisor;

  const reopenProjectMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Project.update(project.id, { status: 'analyzed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['project', projectId]);
      toast.success('Project reopened successfully');
    },
    onError: () => {
      toast.error('Failed to reopen project');
    }
  });

  const initializeMinutesMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('initializeProjectQuarterlyMinutes', {
        project_id: project.id
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.stats) {
        toast.success(`Initialized ${data.stats.initialized} employees with ${data.stats.total_minutes_per_employee} minutes each (${data.stats.quarters_spanned} quarter${data.stats.quarters_spanned > 1 ? 's' : ''})`);
      } else {
        toast.success(data.message);
      }
    },
    onError: (error) => {
      toast.error('Failed to initialize quarterly minutes: ' + error.message);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
                <div className="text-slate-500">Loading project...</div>
            </div>);

  }

  if (!project) {
    return (
      <div className="text-center py-12">
                <p className="text-slate-500">Project not found</p>
                <Link to={createPageUrl('Projects')} className="text-indigo-600 hover:text-indigo-700 mt-4 inline-block">
                    Back to Projects
                </Link>
            </div>);

  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
            <Breadcrumb items={[
      { label: 'Projects', href: 'Projects' },
      { label: project.name }]
      } />
            {/* Header */}
            <div className="bg-gradient-to-br from-white to-slate-50 rounded-3xl shadow-xl p-6 sm:p-8 border border-slate-200 animate-in slide-in-from-top-4 duration-700">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-2 h-12 rounded-full bg-gradient-to-b ${
              project.status === 'draft' ? 'from-amber-400 to-amber-600' :
              project.status === 'analyzed' ? 'from-green-400 to-green-600' :
              project.status === 'locked' ? 'from-slate-400 to-slate-600' :
              'from-red-400 to-red-600'}`
              } />
                            <div>
                                <h1 className="bg-clip-text text-transparent text-xl font-bold sm:text-4xl from-slate-900 to-slate-600">
                                    {project.name}
                                </h1>
                                <p className="text-slate-600 mt-1 text-xs font-semibold">{project.company}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                            <Calendar className="w-4 h-4" />
                            <p className="text-sm font-semibold sm:text-base">
                                {new Date(project.date_from).toLocaleDateString('en-GB')} → {new Date(project.date_to).toLocaleDateString('en-GB')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="bg-gradient-to-r text-green-700 px-4 py-2.5 text-xs font-bold uppercase tracking-wider opacity-100 rounded-2xl shadow-lg ring-2 whitespace-nowrap from-green-50 to-green-100 ring-green-200">






                            {project.status}
                        </span>
                        {isAdmin && project.company === "Al Maraghi Auto Repairs" &&
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm('Initialize/reinitialize quarterly minutes for this project?\n\nThis will create minute allocations based on project duration (120 minutes per quarter).')) {
                  initializeMinutesMutation.mutate();
                }
              }}
              disabled={initializeMinutesMutation.isPending}
              className="border-indigo-300 hover:bg-indigo-50">

                                <RefreshCw className={`w-4 h-4 mr-2 ${initializeMinutesMutation.isPending ? 'animate-spin' : ''}`} />
                                {initializeMinutesMutation.isPending ? 'Initializing...' : 'Init Quarterly Minutes'}
                            </Button>
            }
                        {project.status === 'closed' && isAdmin &&
            <Button
              size="sm"
              onClick={() => {
                if (window.confirm('Reopen this project? This will allow editing again.')) {
                  reopenProjectMutation.mutate();
                }
              }}
              disabled={reopenProjectMutation.isPending}
              className="bg-green-600 hover:bg-green-700">

                                <LockOpen className="w-4 h-4 mr-2" />
                                Reopen Project
                            </Button>
            }
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <div className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-xl -mx-6 px-6 py-3 border-b border-slate-200">
                    <TabsList className="bg-white shadow-lg rounded-2xl p-1.5 flex flex-wrap h-auto gap-1 w-full sm:w-auto border-0">
                        <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300">

                            Overview
                        </TabsTrigger>
                        <TabsTrigger
              value="shifts"
              disabled={isReadOnly}
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300">

                            Shifts {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger
              value="punches"
              disabled={isReadOnly}
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300">

                            Punches {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger
              value="exceptions"
              disabled={isReadOnly}
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300">

                            Exceptions {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger
              value="analysis"
              disabled={isReadOnly}
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300">

                            Analysis {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger
              value="report"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300">

                            Report
                        </TabsTrigger>
                        {(isAdmin || isCEO) &&
            <TabsTrigger
              value="salary"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-xs sm:text-sm font-semibold rounded-xl transition-all duration-300">

                                Salary
                            </TabsTrigger>
            }
                    </TabsList>
                </div>

                <TabsContent value="overview">
                    <OverviewTab project={project} />
                </TabsContent>

                <TabsContent value="shifts">
                    <ShiftTimingsTab project={project} />
                </TabsContent>

                <TabsContent value="punches">
                    <PunchUploadTab project={project} />
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

                <TabsContent value="salary">
                    <SalaryTab project={project} />
                </TabsContent>
            </Tabs>
        </div>);

}