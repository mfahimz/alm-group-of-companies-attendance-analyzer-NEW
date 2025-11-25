import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function Dashboard() {
    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list('-created_date')
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const stats = [
        {
            label: 'Total Projects',
            value: projects.length,
            icon: FolderKanban,
            color: 'bg-indigo-500',
            bgColor: 'bg-indigo-50'
        },
        {
            label: 'Draft Projects',
            value: projects.filter(p => p.status === 'draft').length,
            icon: AlertCircle,
            color: 'bg-amber-500',
            bgColor: 'bg-amber-50'
        },
        {
            label: 'Analyzed Projects',
            value: projects.filter(p => p.status === 'analyzed').length,
            icon: CheckCircle,
            color: 'bg-green-500',
            bgColor: 'bg-green-50'
        },
        {
            label: 'Active Employees',
            value: employees.filter(e => e.active === true).length,
            icon: Users,
            color: 'bg-blue-500',
            bgColor: 'bg-blue-50'
        }
    ];

    const recentProjects = projects.slice(0, 5);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-600 mt-2">Overview of attendance analysis system</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label} className="border-0 shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600 font-medium">{stat.label}</p>
                                        <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                                    </div>
                                    <div className={`${stat.bgColor} p-3 rounded-xl`}>
                                        <Icon className={`w-6 h-6 ${stat.color.replace('bg-', 'text-')}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Recent Projects */}
            <Card className="border-0 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                    <CardTitle className="text-lg">Recent Projects</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {recentProjects.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            No projects yet. Create your first project to get started.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {recentProjects.map((project) => (
                                <Link
                                    key={project.id}
                                    to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                                >
                                    <div>
                                        <p className="font-semibold text-slate-900">{project.name}</p>
                                        <p className="text-sm text-slate-600 mt-1">
                                            {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                                        </p>
                                    </div>
                                    <div>
                                        <span className={`
                                            px-3 py-1 rounded-full text-xs font-medium
                                            ${project.status === 'draft' ? 'bg-amber-100 text-amber-700' : ''}
                                            ${project.status === 'analyzed' ? 'bg-green-100 text-green-700' : ''}
                                            ${project.status === 'locked' ? 'bg-slate-100 text-slate-700' : ''}
                                        `}>
                                            {project.status}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}