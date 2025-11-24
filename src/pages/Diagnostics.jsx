import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, AlertCircle, Database, Users, FolderKanban, Clock, FileText, Shield, Calendar, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Diagnostics() {
    const { data: projects = [], isLoading: loadingProjects } = useQuery({
        queryKey: ['diag-projects'],
        queryFn: () => base44.entities.Project.list()
    });

    const { data: employees = [], isLoading: loadingEmployees } = useQuery({
        queryKey: ['diag-employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: punches = [], isLoading: loadingPunches } = useQuery({
        queryKey: ['diag-punches'],
        queryFn: () => base44.entities.Punch.list()
    });

    const { data: shifts = [], isLoading: loadingShifts } = useQuery({
        queryKey: ['diag-shifts'],
        queryFn: () => base44.entities.ShiftTiming.list()
    });

    const { data: exceptions = [], isLoading: loadingExceptions } = useQuery({
        queryKey: ['diag-exceptions'],
        queryFn: () => base44.entities.Exception.list()
    });

    const { data: results = [], isLoading: loadingResults } = useQuery({
        queryKey: ['diag-results'],
        queryFn: () => base44.entities.AnalysisResult.list()
    });

    const { data: reportRuns = [], isLoading: loadingReportRuns } = useQuery({
        queryKey: ['diag-reportruns'],
        queryFn: () => base44.entities.ReportRun.list()
    });

    const { data: users = [], isLoading: loadingUsers } = useQuery({
        queryKey: ['diag-users'],
        queryFn: () => base44.entities.User.list()
    });

    const { data: permissions = [], isLoading: loadingPermissions } = useQuery({
        queryKey: ['diag-permissions'],
        queryFn: () => base44.entities.PagePermission.list()
    });

    const isLoading = loadingProjects || loadingEmployees || loadingPunches || 
                      loadingShifts || loadingExceptions || loadingResults || 
                      loadingReportRuns || loadingUsers || loadingPermissions;

    // Calculate stats
    const stats = {
        projects: {
            total: projects.length,
            draft: projects.filter(p => p.status === 'draft').length,
            analyzed: projects.filter(p => p.status === 'analyzed').length,
            locked: projects.filter(p => p.status === 'locked').length
        },
        employees: {
            total: employees.length,
            active: employees.filter(e => e.active).length,
            inactive: employees.filter(e => !e.active).length
        },
        users: {
            total: users.length,
            admins: users.filter(u => u.role === 'admin').length,
            regular: users.filter(u => u.role === 'user').length
        }
    };

    // Data integrity checks
    const duplicateEmployees = (() => {
        const seen = new Set();
        let count = 0;
        employees.forEach(emp => {
            const id = emp.attendance_id?.toLowerCase();
            if (seen.has(id)) count++;
            seen.add(id);
        });
        return count;
    })();

    const orphanedPunches = punches.filter(p => 
        !projects.find(proj => proj.id === p.project_id)
    ).length;

    const orphanedShifts = shifts.filter(s => 
        !projects.find(proj => proj.id === s.project_id)
    ).length;

    const systemHealth = {
        status: duplicateEmployees === 0 && orphanedPunches === 0 && orphanedShifts === 0 ? 'healthy' : 'warning',
        issues: []
    };

    if (duplicateEmployees > 0) systemHealth.issues.push(`${duplicateEmployees} duplicate employee(s)`);
    if (orphanedPunches > 0) systemHealth.issues.push(`${orphanedPunches} orphaned punch(es)`);
    if (orphanedShifts > 0) systemHealth.issues.push(`${orphanedShifts} orphaned shift(s)`);

    const entityCounts = [
        { label: 'Projects', count: projects.length, icon: FolderKanban, color: 'bg-indigo-500' },
        { label: 'Employees', count: employees.length, icon: Users, color: 'bg-blue-500' },
        { label: 'Punches', count: punches.length, icon: Clock, color: 'bg-green-500' },
        { label: 'Shift Timings', count: shifts.length, icon: Calendar, color: 'bg-amber-500' },
        { label: 'Exceptions', count: exceptions.length, icon: AlertTriangle, color: 'bg-orange-500' },
        { label: 'Analysis Results', count: results.length, icon: FileText, color: 'bg-purple-500' },
        { label: 'Report Runs', count: reportRuns.length, icon: Database, color: 'bg-pink-500' },
        { label: 'Users', count: users.length, icon: Users, color: 'bg-cyan-500' },
        { label: 'Page Permissions', count: permissions.length, icon: Shield, color: 'bg-slate-500' }
    ];

    if (isLoading) {
        return (
            <div className="text-center py-12 text-slate-500">
                Loading diagnostics...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">System Diagnostics</h1>
                <p className="text-slate-600 mt-2">Monitor application health and data integrity</p>
            </div>

            {/* System Health */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {systemHealth.status === 'healthy' ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                        )}
                        System Health
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-3">
                        <Badge className={
                            systemHealth.status === 'healthy' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-amber-100 text-amber-700'
                        }>
                            {systemHealth.status === 'healthy' ? 'All Systems Operational' : 'Issues Detected'}
                        </Badge>
                        {systemHealth.issues.length > 0 && (
                            <span className="text-sm text-slate-600">
                                {systemHealth.issues.join(', ')}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Entity Counts */}
            <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Database Records</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {entityCounts.map((entity) => {
                        const Icon = entity.icon;
                        return (
                            <Card key={entity.label} className="border-0 shadow-sm">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600">{entity.label}</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{entity.count}</p>
                                    </div>
                                    <div className={`${entity.color} bg-opacity-10 p-3 rounded-lg`}>
                                        <Icon className={`w-5 h-5 ${entity.color.replace('bg-', 'text-')}`} />
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Detailed Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Projects Breakdown */}
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Projects by Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-600">Draft</span>
                            <span className="font-semibold">{stats.projects.draft}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Analyzed</span>
                            <span className="font-semibold">{stats.projects.analyzed}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Locked</span>
                            <span className="font-semibold">{stats.projects.locked}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Employees Breakdown */}
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">Employee Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-600">Active</span>
                            <span className="font-semibold text-green-600">{stats.employees.active}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Inactive</span>
                            <span className="font-semibold text-slate-400">{stats.employees.inactive}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Duplicates</span>
                            <span className={`font-semibold ${duplicateEmployees > 0 ? 'text-amber-600' : ''}`}>
                                {duplicateEmployees}
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Users Breakdown */}
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base">User Roles</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-600">Admins</span>
                            <span className="font-semibold">{stats.users.admins}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Regular Users</span>
                            <span className="font-semibold">{stats.users.regular}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">Total</span>
                            <span className="font-semibold">{stats.users.total}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Last Updated */}
            <Card className="border-0 shadow-sm bg-slate-50">
                <CardContent className="p-4">
                    <p className="text-sm text-slate-600">
                        Diagnostics refreshed: {new Date().toLocaleString()}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}