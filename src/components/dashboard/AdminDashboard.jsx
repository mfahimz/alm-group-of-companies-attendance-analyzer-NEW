import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Shield, AlertTriangle, Activity, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function AdminDashboard({ projects, employees }) {
    const { data: exceptions = [] } = useQuery({
        queryKey: ['allExceptions'],
        queryFn: () => base44.entities.Exception.list('-created_date', 10),
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false
    });

    const { data: auditLogs = [] } = useQuery({
        queryKey: ['recentAudit'],
        queryFn: () => base44.entities.AuditLog.list('-created_date', 5),
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false
    });

    const systemStats = [
        {
            label: 'Pending Approvals',
            value: exceptions.filter(e => e.approval_status === 'pending').length,
            icon: Shield,
            color: 'bg-amber-500',
            link: 'ExceptionApprovals'
        },
        {
            label: 'Active Projects',
            value: projects.filter(p => p.status !== 'closed').length,
            icon: Activity,
            color: 'bg-indigo-500',
            link: 'Projects'
        },
        {
            label: 'Total Employees',
            value: employees.filter(e => e.active).length,
            icon: TrendingUp,
            color: 'bg-green-500',
            link: 'Employees'
        },
        {
            label: 'System Issues',
            value: 0,
            icon: AlertTriangle,
            color: 'bg-red-500',
            link: 'Diagnostics'
        }
    ];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">System Overview</h2>
                <p className="text-slate-600">Monitor system health and pending actions</p>
            </div>

            {/* Admin Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {systemStats.map((stat, idx) => {
                    const Icon = stat.icon;
                    return (
                        <Link 
                            key={stat.label}
                            to={createPageUrl(stat.link)}
                            className="block animate-in fade-in zoom-in-95"
                            style={{ animationDelay: `${idx * 75}ms` }}
                        >
                            <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`${stat.color} text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                        {stat.value}
                                    </p>
                                    <p className="text-sm text-slate-600 font-medium mt-1">{stat.label}</p>
                                </CardContent>
                            </Card>
                        </Link>
                    );
                })}
            </div>

            {/* Recent Activity */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-lg">Recent System Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {auditLogs.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4">No recent activity</p>
                        ) : (
                            auditLogs.map((log) => (
                                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                                    <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg">
                                        <Activity className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900">
                                            {log.action} - {log.entity_type}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {log.user_name} • {new Date(log.created_date).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}