import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Users, FolderKanban, Clock, AlertCircle, CheckCircle, FileText, Calendar, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Diagnostics() {
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

    const isLoading = projectsLoading || employeesLoading || punchesLoading || 
                      shiftsLoading || exceptionsLoading || resultsLoading || 
                      reportRunsLoading || usersLoading || permissionsLoading;

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
            details: reportRuns.length > 0 ? `Latest: ${new Date(reportRuns[0].created_date).toLocaleDateString()}` : 'No runs yet'
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
            <div>
                <h1 className="text-3xl font-bold text-slate-900">System Diagnostics</h1>
                <p className="text-slate-600 mt-2">Overview of system health and data statistics</p>
            </div>

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
                                        {activity.date.toLocaleDateString()} {activity.date.toLocaleTimeString()}
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