import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, Users, AlertCircle, CheckCircle, TrendingUp, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Breadcrumb from '../components/ui/Breadcrumb';
import QuickActions from '../components/dashboard/QuickActions';
import PendingApprovals from '../components/dashboard/PendingApprovals';
import ProjectStatusChart from '../components/dashboard/ProjectStatusChart';

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
        const userRole = currentUser.extended_role || currentUser.role || 'user';
        const canAccessAll = userRole === 'admin' || userRole === 'supervisor';
        if (canAccessAll) return allProjects;
        return allProjects.filter(p => p.company === currentUser.company);
    }, [allProjects, currentUser]);

    const employees = React.useMemo(() => {
        if (!currentUser) return [];
        const userRole = currentUser.extended_role || currentUser.role || 'user';
        const canAccessAll = userRole === 'admin' || userRole === 'supervisor';
        if (canAccessAll) return allEmployees;
        return allEmployees.filter(e => e.company === currentUser.company);
    }, [allEmployees, currentUser]);

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isAdminOrSupervisor = isAdmin || isSupervisor;

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
        ...(isAdminOrSupervisor ? [{
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

    if (userLoading) {
        return (
            <div className="space-y-6">
                <div className="animate-pulse">
                    <div className="h-8 bg-slate-200 rounded w-1/3 mb-2"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <SkeletonStat key={i} />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="animate-in slide-in-from-top-4 duration-700">
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
                    Welcome back, {currentUser?.full_name || 'User'}
                </h1>
                <p className="text-slate-600 mt-2 text-lg">Here's what's happening with your attendance system</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-bottom-4 duration-700 delay-100">
                {projectsLoading || employeesLoading ? (
                    [...Array(4)].map((_, i) => <SkeletonStat key={i} />)
                ) : (
                    stats.map((stat, idx) => {
                        const Icon = stat.icon;
                        return (
                            <Card 
                                key={stat.label} 
                                className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden group cursor-pointer"
                                style={{ animationDelay: `${idx * 100}ms` }}
                            >
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-3 transform group-hover:scale-110 transition-transform duration-300">
                                                <div className={`${stat.color} text-white p-2.5 rounded-xl shadow-lg`}>
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                            </div>
                                            <p className="text-3xl font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">
                                                {stat.value}
                                            </p>
                                            <p className="text-sm text-slate-600 font-medium">{stat.label}</p>
                                        </div>
                                        <TrendingUp className="w-4 h-4 text-green-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-1" />
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {/* Pending Approvals Alert */}
            <PendingApprovals userRole={userRole} />

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-700 delay-200">
                {/* Left Column - 2/3 width */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Projects by Company */}
                    {projectsLoading ? (
                        <SkeletonCard />
                    ) : projects.length === 0 ? (
                        <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                            <CardContent className="p-12 text-center">
                                <div className="animate-bounce">
                                    <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">No projects yet</h3>
                                <p className="text-slate-600 mb-4">Create your first project to get started</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-2xl font-bold text-slate-900">Your Projects</h2>
                                <Link 
                                    to={createPageUrl('Projects')}
                                    className="text-sm text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 group transition-all"
                                >
                                    View all 
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </Link>
                            </div>
                            {companies.slice(0, 2).map((company, idx) => (
                                <Card 
                                    key={company} 
                                    className="border-0 shadow-md hover:shadow-lg transition-all duration-300"
                                    style={{ animationDelay: `${idx * 150}ms` }}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-1.5 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full"></div>
                                            <CardTitle className="text-lg font-bold">{company}</CardTitle>
                                            <span className="text-sm text-slate-500 font-medium">({projectsByCompany[company].length})</span>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-1">
                                        {projectsByCompany[company].slice(0, 4).map((project, pIdx) => (
                                            <Link
                                                key={project.id}
                                                to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                                                className="flex items-center justify-between p-3 rounded-lg hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200 group animate-in slide-in-from-left-2"
                                                style={{ animationDelay: `${pIdx * 50}ms` }}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-slate-900 group-hover:text-indigo-600 truncate transition-colors">
                                                        {project.name}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-1 font-medium">
                                                        {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                                                    </p>
                                                </div>
                                                <span className={`
                                                    px-3 py-1.5 rounded-lg text-xs font-semibold ml-2 whitespace-nowrap shadow-sm transition-all group-hover:scale-105
                                                    ${project.status === 'draft' ? 'bg-amber-100 text-amber-700' : ''}
                                                    ${project.status === 'analyzed' ? 'bg-green-100 text-green-700' : ''}
                                                    ${project.status === 'locked' ? 'bg-slate-100 text-slate-600' : ''}
                                                    ${project.status === 'closed' ? 'bg-slate-100 text-slate-600' : ''}
                                                `}>
                                                    {project.status}
                                                </span>
                                            </Link>
                                        ))}
                                        {projectsByCompany[company].length > 4 && (
                                            <div className="text-center pt-2">
                                                <Link 
                                                    to={createPageUrl('Projects')}
                                                    className="text-xs text-slate-500 hover:text-indigo-600"
                                                >
                                                    +{projectsByCompany[company].length - 4} more projects
                                                </Link>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Column - 1/3 width */}
                <div className="space-y-6">
                    <QuickActions userRole={userRole} />
                    <ProjectStatusChart projects={projects} />
                </div>
            </div>
        </div>
    );
}