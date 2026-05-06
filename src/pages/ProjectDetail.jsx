import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, LockOpen } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import OverviewTab from '../components/project-tabs/OverviewTab';
import PunchUploadTab from '../components/project-tabs/PunchUploadTab';
import ShiftTimingsTab from '../components/project-tabs/ShiftTimingsTab';
import ExceptionsTab from '../components/project-tabs/ExceptionsTab';
import ReportTab from '../components/project-tabs/ReportTab';
import SalaryTab from '../components/project-tabs/SalaryTab';
import OvertimeTab from '../components/project-tabs/OvertimeTab';
import WorkflowStepper from '../components/project-detail/WorkflowStepper';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { MoreVertical, Settings, Settings2, Trash2, Copy, Lock, RefreshCw } from 'lucide-react';

import Breadcrumb from '../components/ui/Breadcrumb';
import { Label } from '@/components/ui/label';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';

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

  // Listen for navigation requests from CommandCenter
  useEffect(() => {
    const handleNavigation = (e) => {
        if (e.detail) {
            handleTabChange(e.detail);
        }
    };
    window.addEventListener('changeTab', handleNavigation);
    return () => window.removeEventListener('changeTab', handleNavigation);
  }, []);

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white p-6 space-y-6">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-4 w-16 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-3 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
        </div>

        {/* Header skeleton */}
        <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-sm p-6 sm:p-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-2 h-12 rounded-full bg-slate-200 animate-pulse" />
              <div className="space-y-2">
                <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse" />
                <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
              </div>
            </div>
            <div className="h-7 w-20 bg-slate-200 rounded-full animate-pulse" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-4 w-4 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Tabs skeleton */}
        <div className="h-12 bg-slate-200/50 rounded-full w-full sm:w-auto animate-pulse" />

        {/* Content skeleton */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/40 ring-1 ring-slate-200 p-6 min-h-[400px] space-y-4">
          {/* Shimmer bars */}
          {[100, 80, 90, 60, 75].map((w, i) => (
            <div key={i} className="h-4 rounded animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%]" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
          ))}
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          {[70, 85, 50].map((w, i) => (
            <div key={i} className="h-4 rounded animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%]" style={{ width: `${w}%`, animationDelay: `${(i + 5) * 0.1}s` }} />
          ))}

          {/* Buffering indicator */}
          <div className="flex items-center justify-center gap-3 pt-8">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-indigo-400"
                  style={{
                    animation: `buffering 1.2s ease-in-out ${i * 0.15}s infinite`,
                    height: '20px'
                  }}
                />
              ))}
            </div>
            <span className="text-sm text-slate-400 font-medium">Loading project...</span>
          </div>
        </div>

        <style>{`
          @keyframes buffering {
            0%, 100% { transform: scaleY(0.4); opacity: 0.4; }
            50% { transform: scaleY(1); opacity: 1; }
          }
        `}</style>
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
            </div>);

  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 px-4 md:px-0 bg-gradient-to-br from-slate-50 to-white min-h-screen">
            <Breadcrumb items={[
      { label: 'Projects', href: 'Projects' },
      { label: project.name }]
      } />
            {/* Header - Compact Context Bar */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-1 h-8 rounded-full",
                                project.status === 'draft' ? "bg-amber-500" :
                                project.status === 'analyzed' ? "bg-green-500" :
                                project.status === 'locked' ? "bg-slate-500" :
                                "bg-red-500"
                            )} />
                            <div>
                                <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                                    {project.name}
                                    <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ring-1 ring-inset",
                                        project.status === 'draft' ? "bg-amber-50 text-amber-700 ring-amber-200" :
                                        project.status === 'analyzed' ? "bg-green-50 text-green-700 ring-green-200" :
                                        project.status === 'locked' ? "bg-blue-50 text-blue-700 ring-blue-200" :
                                        "bg-red-50 text-red-700 ring-red-200"
                                    )}>
                                        {project.status}
                                    </span>
                                </h1>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    {project.company}
                                    <span>•</span>
                                    {formatInUAE(parseDateInUAE(project.date_from), 'dd/MM/yyyy')} → {formatInUAE(parseDateInUAE(project.date_to), 'dd/MM/yyyy')}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Project Settings Dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-200/50 transition-colors">
                                        <Settings2 className="w-5 h-5 text-slate-500" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuItem className="font-bold text-xs uppercase text-slate-400 disabled:opacity-50" disabled>
                                        Project Controls
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {project.status === 'closed' && isAdmin && (
                                        <DropdownMenuItem 
                                            onClick={() => {
                                                if (window.confirm('Reopen this project?')) {
                                                    reopenProjectMutation.mutate();
                                                }
                                            }}
                                            className="text-green-600 focus:text-green-700 focus:bg-green-50"
                                        >
                                            <RefreshCw className="w-4 h-4 mr-2" />
                                            Reopen Project
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem className="text-slate-600">
                                        <Copy className="w-4 h-4 mr-2" />
                                        Duplicate Project
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-slate-600">
                                        <Lock className="w-4 h-4 mr-2" />
                                        Lock Project
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600 focus:text-red-700 focus:bg-red-50">
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete Project
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>

                {/* Workflow Stepper integration */}
                <div className="px-6 py-2 bg-white">
                    <WorkflowStepper currentStatus={project.status} currentTab={activeTab} />
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
                        {activeTab === 'overview' && (
                            <OverviewTab 
                                project={project} 
                                salaryDivisor={salaryDivisorAuto}
                                prevMonthDays={prevMonthDaysAuto}
                            />
                        )}
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