import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function Dashboard() {
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: allProjects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list('-created_date')
    });

    const { data: allEmployees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    // Filter data based on user access
    const projects = React.useMemo(() => {
        if (!currentUser) return [];
        const canAccessAll = currentUser.role === 'admin' || currentUser.role === 'supervisor';
        if (canAccessAll) return allProjects;
        return allProjects.filter(p => p.company === currentUser.company);
    }, [allProjects, currentUser]);

    const employees = React.useMemo(() => {
        if (!currentUser) return [];
        const canAccessAll = currentUser.role === 'admin' || currentUser.role === 'supervisor';
        if (canAccessAll) return allEmployees;
        return allEmployees.filter(e => e.company === currentUser.company);
    }, [allEmployees, currentUser]);

    const isAdmin = currentUser?.role === 'admin';

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
        ...(isAdmin ? [{
            label: 'Active Employees',
            value: employees.filter(e => e.active === true).length,
            icon: Users,
            color: 'bg-blue-500',
            bgColor: 'bg-blue-50'
        }] : [])
    ];

    // Group projects by company
    const projectsByCompany = projects.reduce((acc, project) => {
        const company = project.company || 'Uncategorized';
        if (!acc[company]) acc[company] = [];
        acc[company].push(project);
        return acc;
    }, {});

    const companies = Object.keys(projectsByCompany).sort();

    return (
        <div className="space-y-8">
            <Breadcrumb items={[{ label: 'Dashboard' }]} />
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-600 mt-1 sm:mt-2 text-sm sm:text-base">Overview of attendance analysis system</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    
                    // Enhanced styling for stats cards
                    let gradientBg = 'bg-white';
                    let iconBg = stat.bgColor;
                    let iconColor = stat.color.replace('bg-', 'text-');
                    
                    if (stat.color.includes('indigo')) {
                        gradientBg = 'bg-gradient-to-br from-indigo-50/50 to-white';
                        iconBg = 'bg-indigo-100 text-indigo-600';
                    } else if (stat.color.includes('amber')) {
                        gradientBg = 'bg-gradient-to-br from-amber-50/50 to-white';
                        iconBg = 'bg-amber-100 text-amber-600';
                    } else if (stat.color.includes('green')) {
                        gradientBg = 'bg-gradient-to-br from-green-50/50 to-white';
                        iconBg = 'bg-green-100 text-green-600';
                    } else if (stat.color.includes('blue')) {
                        gradientBg = 'bg-gradient-to-br from-blue-50/50 to-white';
                        iconBg = 'bg-blue-100 text-blue-600';
                    }

                    return (
                        <Card key={stat.label} className={`border-0 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ${gradientBg}`}>
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider text-[11px]">{stat.label}</p>
                                        <p className="text-3xl font-bold text-slate-900 mt-1 tracking-tight">{stat.value}</p>
                                    </div>
                                    <div className={`${iconBg} p-3.5 rounded-2xl shadow-sm`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Projects by Company */}
            {projects.length === 0 ? (
                <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-lg shadow-slate-200/50 rounded-2xl">
                    <CardContent className="p-8">
                        <div className="text-center text-slate-500">
                            No projects yet. Create your first project to get started.
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {companies.map((company) => (
                        <Card key={company} className="border-0 bg-white/80 backdrop-blur-sm shadow-lg shadow-slate-200/50 rounded-2xl">
                            <CardHeader className="border-b border-slate-100/80 px-8 py-6">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-1 bg-indigo-500 rounded-full"></div>
                                    <CardTitle className="text-lg text-slate-900 font-bold">{company}</CardTitle>
                                    <span className="text-sm text-slate-500 ml-2">({projectsByCompany[company].length} projects)</span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-100">
                                    {projectsByCompany[company].map((project) => (
                                        <Link
                                            key={project.id}
                                            to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-slate-50 transition-colors gap-2 group"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{project.name}</p>
                                                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                                                    {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                                                </p>
                                            </div>
                                            <div className="flex-shrink-0">
                                                <span className={`
                                                    px-2.5 py-1 rounded-full text-xs font-medium
                                                    ${project.status === 'draft' ? 'bg-amber-100 text-amber-700' : ''}
                                                    ${project.status === 'analyzed' ? 'bg-green-100 text-green-700' : ''}
                                                    ${project.status === 'locked' ? 'bg-slate-100 text-slate-600' : ''}
                                                    ${project.status === 'closed' ? 'bg-slate-100 text-slate-600' : ''}
                                                `}>
                                                    {project.status}
                                                </span>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}