import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, LockOpen } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import OverviewTab from '../components/project-tabs/OverviewTab';
import PunchUploadTab from '../components/project-tabs/PunchUploadTab';
import ShiftTimingsTab from '../components/project-tabs/ShiftTimingsTab';
import ExceptionsTab from '../components/project-tabs/ExceptionsTab';
import ReportTab from '../components/project-tabs/ReportTab';
import SalaryTab from '../components/project-tabs/SalaryTab';
import OvertimeTab from '../components/project-tabs/OvertimeTab';

import Breadcrumb from '../components/ui/Breadcrumb';
import { Label } from '@/components/ui/label';

export default function ProjectDetail() {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const projectId = urlParams.get('id');
  const tabFromUrl = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'overview');

  // Sync activeTab when React Router navigates to this page without unmounting the component
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [location.search]);
  const navigate = useNavigate();

  // Update URL when tab changes (without full page reload)
  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('tab', newTab);
    window.history.replaceState({}, '', newUrl.toString());
  };

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }).then((res) => res[0]),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true
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
  const isHRManager = userRole === 'hr_manager';
  const isUser = userRole === 'user';
  const isDepartmentHead = userRole === 'department_head' || userRole === 'assistant_gm';
  const isAdminOrSupervisor = isAdmin || isSupervisor || isCEO || isHRManager || isUser;
  const isReadOnly = project?.status === 'closed' && !isAdminOrSupervisor;
  const isDeptHeadViewOnly = isDepartmentHead; // Department heads can only view Report tab
  const isAlMaraghiMotors = project?.company === 'Al Maraghi Motors';

  // Auto-calculate salary divisor from project.date_to month
  const salaryDivisorAuto = (() => {
    if (!project?.date_to) return 31;
    const toDate = new Date(project.date_to);
    const year = toDate.getFullYear();
    const month = toDate.getMonth() + 1;
    return new Date(year, month, 0).getDate();
  })();

  const prevMonthDaysAuto = (() => {
    if (!project?.date_from || !project?.date_to) return null;
    const fromDate = new Date(project.date_from);
    const toDate = new Date(project.date_to);
    if (fromDate.getMonth() === toDate.getMonth() &&
        fromDate.getFullYear() === toDate.getFullYear()) {
      return null;
    }
    const year = fromDate.getFullYear();
    const month = fromDate.getMonth() + 1;
    return new Date(year, month, 0).getDate();
  })();

  // CRITICAL: Department heads can only access CLOSED projects
  React.useEffect(() => {
    if (project && isDepartmentHead && project.status !== 'closed') {
      toast.error('Access denied. Department heads can only view closed projects.');
      navigate(createPageUrl('Projects'));
    }
  }, [project, isDepartmentHead, navigate]);

  const { data: reportRuns = [] } = useQuery({
    queryKey: ['reportRuns', projectId],
    queryFn: () => base44.entities.ReportRun.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false
  });
  


  // NOTE: finalReport is no longer needed at this level - SalaryTab and OvertimeTab
  // now fetch their own finalized report by scanning all reportRuns for is_final=true



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
    <div className="space-y-6 animate-in fade-in duration-500 px-4 md:px-0 bg-gradient-to-br from-slate-50 to-white min-h-screen">
            <Breadcrumb items={[
      { label: 'Projects', href: 'Projects' },
      { label: project.name }]
      } />
            {/* Header */}
            <div className="bg-gradient-to-br from-white via-slate-50 to-blue-50/40 rounded-[2rem] shadow-sm p-6 sm:p-10 border border-slate-200/60 animate-in slide-in-from-top-4 duration-700">
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
                                <h1 className="bg-clip-text text-transparent bg-gradient-to-r from-slate-950 via-slate-800 to-slate-600 text-2xl font-extrabold sm:text-5xl tracking-tight">
                                    {project.name}
                                </h1>
                                <p className="text-slate-500 mt-2 text-sm font-medium tracking-wide uppercase">{project.company}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                            <Calendar className="w-4 h-4" />
                            <p className="text-sm font-semibold sm:text-base">
                                {new Date(project.date_from).toLocaleDateString('en-GB')} → {new Date(project.date_to).toLocaleDateString('en-GB')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                         <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ring-1 ring-inset transition-all duration-200 ${
                            project.status === 'draft' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                            project.status === 'analyzed' ? 'bg-green-50 text-green-700 ring-green-200' :
                            project.status === 'locked' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                            'bg-red-50 text-red-700 ring-red-200'
                            }`}>
                            {project.status}
                            </span>
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

                            {/* DIVISOR SETTINGS - Al Maraghi Motors only */}
                            {/* [MERGE_NOTE: If merging divisors in future, remove the OT divisor section and update label] */}
                            {isAlMaraghiMotors && isAdmin && (
                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Salary / Deduction Divisor — auto-calculated read-only */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                        Salary / Deduction Divisor
                                    </Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-2xl font-bold text-slate-800">
                                            {salaryDivisorAuto}
                                        </span>
                                        <span className="text-xs text-slate-400">days</span>
                                        <span className="text-xs text-emerald-600 font-medium">
                                            (auto-calculated)
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Used for: Leave Pay, Salary Leave Amount, Deductible Hours Pay
                                    </p>
                                </div>

                                {/* Prev Month Days — auto-calculated read-only */}
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                                        Prev Month Days
                                    </Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-2xl font-bold text-slate-800">
                                            {prevMonthDaysAuto !== null ? prevMonthDaysAuto : '—'}
                                        </span>
                                        <span className="text-xs text-slate-400">days</span>
                                        {prevMonthDaysAuto !== null && (
                                            <span className="text-xs text-emerald-600 font-medium">
                                                (auto-calculated)
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {prevMonthDaysAuto !== null
                                            ? `Days in previous month — used for prev month LOP pay calculation`
                                            : `No previous month overflow for this project period`}
                                    </p>
                                </div>
                            </div>
                            )}
                </div>
            </div>

            {/* Tabs - Department heads see only Report tab */}
            {isDepartmentHead ? (
                <ReportTab project={project} isDepartmentHead={true} />
            ) : (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                <div className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-xl py-4 border-b border-slate-200/60">
                    <TabsList className="bg-slate-200/50 backdrop-blur-md rounded-full p-1.5 flex flex-nowrap overflow-x-auto scrollbar-hide h-auto gap-1 w-full sm:w-auto border border-slate-300/50 shadow-inner">
                        <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:ring-1 data-[state=active]:ring-slate-200 data-[state=active]:shadow-md text-xs sm:text-sm font-bold rounded-full px-6 py-2 transition-all duration-300">
                            Overview
                        </TabsTrigger>
                        <TabsTrigger
              value="shifts"
              disabled={isReadOnly}
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:ring-1 data-[state=active]:ring-blue-200 data-[state=active]:shadow-md text-xs sm:text-sm font-bold rounded-full px-6 py-2 transition-all duration-300">
                            Shifts {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger
              value="punches"
              disabled={isReadOnly}
              className="data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-700 data-[state=active]:ring-1 data-[state=active]:ring-cyan-200 data-[state=active]:shadow-md text-xs sm:text-sm font-bold rounded-full px-6 py-2 transition-all duration-300">
                            Punches {isReadOnly && '🔒'}
                        </TabsTrigger>
                        <TabsTrigger
              value="exceptions"
              disabled={isReadOnly}
              className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 data-[state=active]:ring-1 data-[state=active]:ring-amber-200 data-[state=active]:shadow-md text-xs sm:text-sm font-bold rounded-full px-6 py-2 transition-all duration-300">
                            Exceptions {isReadOnly && '🔒'}
                        </TabsTrigger>
                        {isAlMaraghiMotors &&
            <TabsTrigger
              value="overtime"
              className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 data-[state=active]:ring-1 data-[state=active]:ring-orange-200 data-[state=active]:shadow-md text-xs sm:text-sm font-bold rounded-full px-6 py-2 transition-all duration-300">
                                Adjustments
                            </TabsTrigger>
            }
                        <TabsTrigger
              value="report"
              className="data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:ring-1 data-[state=active]:ring-indigo-200 data-[state=active]:shadow-md text-xs sm:text-sm font-bold rounded-full px-6 py-2 transition-all duration-300">
                            Attendance {isReadOnly && '🔒'}
                        </TabsTrigger>
                        {isAlMaraghiMotors &&
            <TabsTrigger
              value="salary"
              className="data-[state=active]:bg-green-50 data-[state=active]:text-green-700 data-[state=active]:ring-1 data-[state=active]:ring-green-200 data-[state=active]:shadow-md text-xs sm:text-sm font-bold rounded-full px-6 py-2 transition-all duration-300">
                                Salary
                            </TabsTrigger>
            }

                    </TabsList>
                </div>

                <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/40 ring-1 ring-slate-200 p-2 sm:p-6 min-h-[400px]">
                    <TabsContent value="overview">
                        {activeTab === 'overview' && <OverviewTab project={project} />}
                    </TabsContent>

                    <TabsContent value="shifts">
                        {activeTab === 'shifts' && <ShiftTimingsTab project={project} />}
                    </TabsContent>

                    <TabsContent value="punches">
                        {activeTab === 'punches' && <PunchUploadTab project={project} />}
                    </TabsContent>

                    <TabsContent value="exceptions">
                        {activeTab === 'exceptions' && <ExceptionsTab project={project} />}
                    </TabsContent>

                    <TabsContent value="overtime">
                        {activeTab === 'overtime' && <OvertimeTab project={project} />}
                    </TabsContent>

                    <TabsContent value="report">
                        {activeTab === 'report' && <ReportTab project={project} />}
                    </TabsContent>

                    <TabsContent value="salary">
                        {activeTab === 'salary' && <SalaryTab project={project} />}
                    </TabsContent>


                </div>
            </Tabs>
            )}
        </div>);

}