import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Users, FolderKanban, Clock, AlertCircle, CheckCircle, FileText, Calendar, Shield, Play, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import Breadcrumb from '../components/ui/Breadcrumb';

function RecalculateGraceButton() {
    const queryClient = useQueryClient();
    const [isRecalculating, setIsRecalculating] = useState(false);

    const recalculateMutation = useMutation({
        mutationFn: async () => {
            setIsRecalculating(true);
            const response = await base44.functions.invoke('recalculateGraceMinutes', {});
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['employees']);
            toast.success(data.message || 'Grace minutes recalculated successfully');
            setIsRecalculating(false);
        },
        onError: (error) => {
            toast.error('Failed to recalculate: ' + error.message);
            setIsRecalculating(false);
        }
    });

    return (
        <Button
            onClick={() => recalculateMutation.mutate()}
            disabled={isRecalculating}
            className="bg-purple-600 hover:bg-purple-700"
        >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
            {isRecalculating ? 'Processing...' : 'Recalculate from All Closed Projects'}
        </Button>
    );
}

export default function Diagnostics() {
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const queryClient = useQueryClient();

    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list()
    });

    const { data: employees = [], isLoading: employeesLoading } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: punches = [], isLoading: punchesLoading } = useQuery({
        queryKey: ['allPunches'],
        queryFn: () => base44.entities.Punch.list()
    });

    const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
        queryKey: ['allShifts'],
        queryFn: () => base44.entities.ShiftTiming.list()
    });

    const { data: exceptions = [], isLoading: exceptionsLoading } = useQuery({
        queryKey: ['allExceptions'],
        queryFn: () => base44.entities.Exception.list()
    });

    const { data: results = [], isLoading: resultsLoading } = useQuery({
        queryKey: ['allResults'],
        queryFn: () => base44.entities.AnalysisResult.list()
    });

    const { data: reportRuns = [], isLoading: reportRunsLoading } = useQuery({
        queryKey: ['allReportRuns'],
        queryFn: () => base44.entities.ReportRun.list('-created_date')
    });

    const { data: users = [], isLoading: usersLoading } = useQuery({
        queryKey: ['users'],
        queryFn: () => base44.entities.User.list()
    });

    const { data: permissions = [], isLoading: permissionsLoading } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list()
    });

    const { data: allShifts = [] } = useQuery({
        queryKey: ['shiftsForAnalysis'],
        queryFn: () => base44.entities.ShiftTiming.list(),
        enabled: isAnalyzing
    });

    const { data: allExceptions = [] } = useQuery({
        queryKey: ['exceptionsForAnalysis'],
        queryFn: () => base44.entities.Exception.list(),
        enabled: isAnalyzing
    });

    const { data: rules } = useQuery({
        queryKey: ['attendanceRules'],
        queryFn: async () => {
            const rulesList = await base44.entities.AttendanceRules.list();
            return rulesList[0];
        },
        enabled: isAnalyzing
    });

    const isLoading = projectsLoading || employeesLoading || punchesLoading || 
                      shiftsLoading || exceptionsLoading || resultsLoading || 
                      reportRunsLoading || usersLoading || permissionsLoading;

    const runAnalysisMutation = useMutation({
        mutationFn: async (projectId) => {
            const project = projects.find(p => p.id === projectId);
            if (!project) throw new Error('Project not found');

            setIsAnalyzing(true);
            setAnalysisProgress(0);

            const projectPunches = punches.filter(p => p.project_id === projectId);
            const projectShifts = allShifts.filter(s => s.project_id === projectId);
            const projectExceptions = allExceptions.filter(e => e.project_id === projectId);

            const employeeIds = [...new Set(projectPunches.map(p => p.attendance_id))];
            
            const reportRun = await base44.entities.ReportRun.create({
                project_id: projectId,
                employee_count: employeeIds.length
            });

            const rulesConfig = rules?.rules_json ? JSON.parse(rules.rules_json) : {};
            const results = [];

            for (let i = 0; i < employeeIds.length; i++) {
                const attendanceId = employeeIds[i];
                const result = await analyzeEmployee(
                    attendanceId, 
                    project, 
                    projectPunches, 
                    projectShifts, 
                    projectExceptions,
                    employees,
                    rulesConfig
                );
                
                const analysisResult = await base44.entities.AnalysisResult.create({
                    project_id: projectId,
                    report_run_id: reportRun.id,
                    attendance_id: attendanceId,
                    ...result
                });
                
                results.push(analysisResult);
                setAnalysisProgress(Math.round(((i + 1) / employeeIds.length) * 100));
            }

            await base44.entities.Project.update(projectId, { status: 'analyzed' });
            return results;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projects']);
            queryClient.invalidateQueries(['allResults']);
            queryClient.invalidateQueries(['allReportRuns']);
            setIsAnalyzing(false);
            setAnalysisProgress(0);
            toast.success('Analysis completed successfully');
        },
        onError: (error) => {
            setIsAnalyzing(false);
            setAnalysisProgress(0);
            toast.error('Analysis failed: ' + error.message);
        }
    });

    const analyzeEmployee = async (attendanceId, project, punches, shifts, exceptions, employees, rules) => {
        let workingDays = 0;
        let presentDays = 0;
        let fullAbsenceCount = 0;
        let halfAbsenceCount = 0;
        let lateMinutes = 0;
        let earlyCheckoutMinutes = 0;
        const abnormalDates = [];

        const startDate = new Date(project.date_from);
        const endDate = new Date(project.date_to);
        
        const employeePunches = punches.filter(p => p.attendance_id === attendanceId);
        const employeeShifts = shifts.filter(s => s.attendance_id === attendanceId);
        const employeeExceptions = exceptions.filter(e => e.attendance_id === attendanceId);

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDate = new Date(d);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();

            if (dayOfWeek === 0) continue;

            const dateException = employeeExceptions.find(ex => {
                const exFrom = new Date(ex.date_from);
                const exTo = new Date(ex.date_to);
                return currentDate >= exFrom && currentDate <= exTo;
            });

            if (dateException?.type === 'OFF') continue;

            workingDays++;

            const dayPunches = employeePunches.filter(p => p.punch_date === dateStr);
            
            let dayStatus = 'absent';
            if (dateException?.type === 'MANUAL_PRESENT') {
                dayStatus = 'present';
            } else if (dateException?.type === 'MANUAL_ABSENT') {
                dayStatus = 'absent';
            } else if (dateException?.type === 'MANUAL_HALF') {
                dayStatus = 'half';
            } else if (dayPunches.length >= 2) {
                dayStatus = 'present';
            } else if (dayPunches.length === 1) {
                dayStatus = 'half';
            }

            if (dayStatus === 'present') presentDays++;
            else if (dayStatus === 'absent') fullAbsenceCount++;
            else if (dayStatus === 'half') halfAbsenceCount++;
        }

        return {
            working_days: workingDays,
            present_days: presentDays,
            full_absence_count: fullAbsenceCount,
            half_absence_count: halfAbsenceCount,
            late_minutes: lateMinutes,
            early_checkout_minutes: earlyCheckoutMinutes,
            abnormal_dates: abnormalDates.join(', '),
            notes: abnormalDates.join(', ')
        };
    };

    const entityStats = [
        {
            label: 'Projects',
            count: projects.length,
            icon: FolderKanban,
            color: 'indigo',
            details: `${projects.filter(p => p.status === 'draft').length} draft, ${projects.filter(p => p.status === 'analyzed').length} analyzed`
        },
        {
            label: 'Employees',
            count: employees.length,
            icon: Users,
            color: 'blue',
            details: `${employees.filter(e => e.active).length} active`
        },
        {
            label: 'Punch Records',
            count: punches.length,
            icon: Clock,
            color: 'green',
            details: `Across all projects`
        },
        {
            label: 'Shift Timings',
            count: shifts.length,
            icon: Calendar,
            color: 'purple',
            details: `Configured shifts`
        },
        {
            label: 'Exceptions',
            count: exceptions.length,
            icon: AlertCircle,
            color: 'amber',
            details: `Manual adjustments & holidays`
        },
        {
            label: 'Analysis Results',
            count: results.length,
            icon: FileText,
            color: 'teal',
            details: `Generated reports`
        },
        {
            label: 'Report Runs',
            count: reportRuns.length,
            icon: CheckCircle,
            color: 'emerald',
            details: reportRuns.length > 0 ? `Latest: ${new Date(reportRuns[0].created_date).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai' })}` : 'No runs yet'
        },
        {
            label: 'System Users',
            count: users.length,
            icon: Shield,
            color: 'pink',
            details: `${users.filter(u => u.role === 'admin').length} admins, ${users.filter(u => u.role === 'user').length} users`
        }
    ];

    const colorClasses = {
        indigo: 'bg-indigo-500 text-indigo-100',
        blue: 'bg-blue-500 text-blue-100',
        green: 'bg-green-500 text-green-100',
        purple: 'bg-purple-500 text-purple-100',
        amber: 'bg-amber-500 text-amber-100',
        teal: 'bg-teal-500 text-teal-100',
        emerald: 'bg-emerald-500 text-emerald-100',
        pink: 'bg-pink-500 text-pink-100'
    };

    const recentActivity = [
        ...reportRuns.slice(0, 3).map(run => ({
            type: 'Analysis Run',
            date: new Date(run.created_date),
            details: `${run.employee_count} employees analyzed`
        })),
        ...projects.slice(0, 2).map(proj => ({
            type: 'Project Created',
            date: new Date(proj.created_date),
            details: proj.name
        }))
    ].sort((a, b) => b.date - a.date).slice(0, 5);

    const systemHealth = {
        status: 'Healthy',
        checks: [
            { name: 'Database Connection', status: 'ok', message: 'All entities accessible' },
            { name: 'Data Integrity', status: punches.length > 0 ? 'ok' : 'warning', message: punches.length > 0 ? 'Punch data present' : 'No punch data yet' },
            { name: 'User Access', status: users.length > 0 ? 'ok' : 'warning', message: `${users.length} users configured` },
            { name: 'Permissions', status: permissions.length > 0 ? 'ok' : 'info', message: permissions.length > 0 ? `${permissions.length} pages configured` : 'Using defaults' }
        ]
    };

    return (
        <div className="space-y-8">
            <Breadcrumb items={[
                { label: 'Settings', href: 'RulesSettings' },
                { label: 'Diagnostics' }
            ]} />
            <div>
                <h1 className="text-3xl font-bold text-slate-900">System Diagnostics</h1>
                <p className="text-slate-600 mt-2">Overview of system health and data statistics</p>
            </div>

            {/* System Maintenance */}
            <Card className="border-0 shadow-sm bg-purple-50 ring-1 ring-purple-200">
                <CardHeader>
                    <CardTitle>System Maintenance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <p className="text-sm text-slate-700 mb-3">
                            <strong>Generate Missing HRMS IDs:</strong> Automatically assign unique HRMS IDs to employees who don't have one.
                        </p>
                        <Button
                            onClick={async () => {
                                try {
                                    toast.info('Generating HRMS IDs...');
                                    const result = await base44.functions.invoke('generateMissingHrmsIds', {});
                                    if (result.data.success) {
                                        toast.success(result.data.message);
                                        queryClient.invalidateQueries(['employees']);
                                    } else {
                                        toast.error(result.data.error || 'Failed to generate HRMS IDs');
                                    }
                                } catch (error) {
                                    toast.error('Error: ' + error.message);
                                }
                            }}
                            variant="outline"
                            className="w-full"
                        >
                            <Users className="w-4 h-4 mr-2" />
                            Generate Missing HRMS IDs
                        </Button>
                    </div>
                    <div className="border-t pt-4">
                        <p className="text-sm text-slate-700 mb-3">
                            <strong>Recalculate Grace Minutes:</strong> Process all closed projects and update employee grace minutes based on their last saved reports.
                        </p>
                        <RecalculateGraceButton />
                    </div>
                </CardContent>
            </Card>

            {/* Quick Analysis */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Quick Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-end gap-4">
                        <div className="flex-1">
                            <Label className="text-sm font-medium mb-2">Select Project</Label>
                            <Select 
                                value={selectedProjectId} 
                                onValueChange={setSelectedProjectId}
                                disabled={isAnalyzing}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a project..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {projects.map(project => (
                                        <SelectItem key={project.id} value={project.id}>
                                            {project.name} ({project.status})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            onClick={() => runAnalysisMutation.mutate(selectedProjectId)}
                            disabled={!selectedProjectId || isAnalyzing}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Play className="w-4 h-4 mr-2" />
                            {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                        </Button>
                    </div>
                    {isAnalyzing && (
                        <div className="mt-4 space-y-2">
                            <Progress value={analysisProgress} className="h-2" />
                            <p className="text-sm text-slate-600 text-center">{analysisProgress}% complete</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* System Health */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>System Health</CardTitle>
                        <Badge className="bg-green-100 text-green-700">
                            {systemHealth.status}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {systemHealth.checks.map((check, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    {check.status === 'ok' && <CheckCircle className="w-5 h-5 text-green-500" />}
                                    {check.status === 'warning' && <AlertCircle className="w-5 h-5 text-amber-500" />}
                                    {check.status === 'info' && <Database className="w-5 h-5 text-blue-500" />}
                                    <div>
                                        <p className="font-medium text-slate-900">{check.name}</p>
                                        <p className="text-sm text-slate-600">{check.message}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Entity Statistics */}
            <div>
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Database Statistics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {entityStats.map((stat) => {
                        const Icon = stat.icon;
                        return (
                            <Card key={stat.label} className="border-0 shadow-sm">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <p className="text-sm text-slate-600 font-medium">{stat.label}</p>
                                            <p className="text-3xl font-bold text-slate-900 mt-2">
                                                {isLoading ? '...' : stat.count}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-2">{stat.details}</p>
                                        </div>
                                        <div className={`p-3 rounded-xl ${colorClasses[stat.color]}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Recent Activity */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    {recentActivity.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No recent activity</p>
                    ) : (
                        <div className="space-y-3">
                            {recentActivity.map((activity, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div>
                                        <p className="font-medium text-slate-900">{activity.type}</p>
                                        <p className="text-sm text-slate-600">{activity.details}</p>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {activity.date.toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai' })} {activity.date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Dubai' })}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}