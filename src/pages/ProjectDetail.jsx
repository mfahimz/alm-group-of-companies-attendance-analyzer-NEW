import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, LockOpen } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ProjectDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Project.filter({ id: projectId }).then((res) => res[0]),
    enabled: !!projectId,
    staleTime: 0,
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
  const isUser = userRole === 'user';
  const isDepartmentHead = userRole === 'department_head';
  const isAdminOrSupervisor = isAdmin || isSupervisor || isCEO || isUser;
  const isReadOnly = project?.status === 'closed' && !isAdminOrSupervisor;
  const isDeptHeadViewOnly = isDepartmentHead; // Department heads can only view Report tab

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
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true
  });

  // Fetch the actual finalized report using project.last_saved_report_id
  const finalReport = project?.last_saved_report_id 
    ? reportRuns.find(r => r.id === project.last_saved_report_id && r.is_final === true)
    : null;



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

  const updateSalaryCalculationDaysMutation = useMutation({
    mutationFn: async (days) => {
      await base44.entities.Project.update(project.id, { salary_calculation_days: days });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['project', projectId]);
      toast.success('Salary calculation days updated');
    },
    onError: () => {
      toast.error('Failed to update salary calculation days');
    }
  });

  const [salaryCalcDays, setSalaryCalcDays] = React.useState(project?.salary_calculation_days || 30);
  React.useEffect(() => {
    setSalaryCalcDays(project?.salary_calculation_days || 30);
  }, [project?.salary_calculation_days]);

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
                                <h1 className="bg-clip-text text-slate-950 text-xl font-bold sm:text-4xl from-slate-900 to-slate-600">
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
                    <div className="flex items-center gap-3 flex-wrap">
                         <span className="bg-gradient-to-r text-green-700 px-4 py-2.5 text-xs font-bold uppercase tracking-wider opacity-100 rounded-2xl shadow-lg ring-2 whitespace-nowrap from-green-50 to-green-100 ring-green-200">






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

                            {project.company === 'Al Maraghi Auto Repairs' && isAdmin && (
                            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <Label className="text-sm font-semibold text-blue-900 mb-2 block">
                            Salary Calculation Days (Divisor)
                            </Label>
                            <div className="flex gap-2">
                            <Input
                             type="number"
                             min="1"
                             value={salaryCalcDays}
                             onChange={(e) => setSalaryCalcDays(Math.max(1, parseInt(e.target.value) || 30))}
                             className="max-w-xs"
                            />
                            <Button
                             onClick={() => updateSalaryCalculationDaysMutation.mutate(salaryCalcDays)}
                             disabled={updateSalaryCalculationDaysMutation.isPending || salaryCalcDays === (project?.salary_calculation_days || 30)}
                             size="sm"
                             className="bg-blue-600 hover:bg-blue-700"
                            >
                             {updateSalaryCalculationDaysMutation.isPending ? 'Saving...' : 'Update'}
                            </Button>
                            </div>
                            <p className="text-xs text-blue-700 mt-2">
                            Used as divisor in salary calculations (Leave Pay, Salary Leave Amount, Hourly Rate)
                            </p>
                            </div>
                            )}
                </div>
            </div>

            {/* Tabs - Department heads see only Report tab */}
            {isDepartmentHead ? (
                <ReportTab project={project} isDepartmentHead={true} />
            ) : (
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
                        {project.company === 'Al Maraghi Auto Repairs' &&
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
                    <SalaryTab project={project} finalReport={finalReport} />
                </TabsContent>
            </Tabs>
            )}
        </div>);

}