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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900">
                    Welcome back, {currentUser?.full_name || 'User'}
                </h1>
                <p className="text-slate-600 mt-1">Here's what's happening with your attendance system</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label} className="border-0 shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden group">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className={`${stat.color} text-white p-2 rounded-lg`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                        </div>
                                        <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
                                        <p className="text-sm text-slate-600">{stat.label}</p>
                                    </div>
                                    <TrendingUp className="w-4 h-4 text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Pending Approvals Alert */}
            <PendingApprovals userRole={userRole} />

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - 2/3 width */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Projects by Company */}
                    {projects.length === 0 ? (
                        <Card className="border-0 shadow-lg">
                            <CardContent className="p-12 text-center">
                                <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">No projects yet</h3>
                                <p className="text-slate-600 mb-4">Create your first project to get started</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-slate-900">Your Projects</h2>
                                <Link 
                                    to={createPageUrl('Projects')}
                                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                    View all →
                                </Link>
                            </div>
                            {companies.slice(0, 2).map((company) => (
                                <Card key={company} className="border-0 shadow-md">
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-5 w-1 bg-indigo-500 rounded-full"></div>
                                            <CardTitle className="text-base font-bold">{company}</CardTitle>
                                            <span className="text-sm text-slate-500">({projectsByCompany[company].length})</span>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-1">
                                        {projectsByCompany[company].slice(0, 4).map((project) => (
                                            <Link
                                                key={project.id}
                                                to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                                                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-slate-900 group-hover:text-indigo-600 truncate text-sm">
                                                        {project.name}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                                                    </p>
                                                </div>
                                                <span className={`
                                                    px-2 py-1 rounded-md text-xs font-medium ml-2 whitespace-nowrap
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