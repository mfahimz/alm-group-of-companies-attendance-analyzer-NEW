import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, CheckCircle, Clock, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function SupervisorDashboard({ currentUser, projects, employees }) {
    const userCompany = currentUser?.company;

    const { data: exceptions = [] } = useQuery({
        queryKey: ['teamExceptions', userCompany],
        queryFn: async () => {
            const allExceptions = await base44.entities.Exception.list('-created_date');
            // Filter for company-specific exceptions
            return allExceptions.filter(ex => {
                // Would need to join with project to get company
                return ex.approval_status === 'pending';
            });
        },
        enabled: !!userCompany,
        staleTime: 2 * 60 * 1000,
        refetchOnWindowFocus: false
    });

    const teamProjects = projects.filter(p => p.company === userCompany);
    const teamEmployees = employees.filter(e => e.company === userCompany);

    const teamStats = [
        {
            label: 'Team Members',
            value: teamEmployees.filter(e => e.active).length,
            icon: Users,
            color: 'bg-blue-500',
            link: 'Employees'
        },
        {
            label: 'Active Projects',
            value: teamProjects.filter(p => p.status !== 'closed').length,
            icon: CheckCircle,
            color: 'bg-green-500',
            link: 'Projects'
        },
        {
            label: 'Pending Approvals',
            value: exceptions.length,
            icon: Clock,
            color: 'bg-amber-500',
            link: 'ExceptionApprovals'
        },
        {
            label: 'Reports to Review',
            value: teamProjects.filter(p => p.status === 'analyzed').length,
            icon: FileText,
            color: 'bg-indigo-500',
            link: 'Reports'
        }
    ];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Team Dashboard</h2>
                <p className="text-slate-600">Manage your team's attendance and approvals</p>
            </div>

            {/* Team Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {teamStats.map((stat, idx) => {
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

            {/* Pending Approvals List */}
            {exceptions.length > 0 && (
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">Pending Approvals</CardTitle>
                            <Link 
                                to={createPageUrl('ExceptionApprovals')}
                                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                                View all →
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {exceptions.slice(0, 5).map((ex) => (
                                <div key={ex.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors">
                                    <div>
                                        <p className="text-sm font-medium text-slate-900">{ex.type}</p>
                                        <p className="text-xs text-slate-500">{ex.attendance_id}</p>
                                    </div>
                                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-md font-medium">
                                        Pending
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}