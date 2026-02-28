import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePageTitle } from '@/components/ui/PageTitle';
import { FolderKanban, Users, AlertCircle, CheckCircle } from 'lucide-react';
import { SkeletonStat } from '../components/ui/SkeletonLoader';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import SupervisorDashboard from '../components/dashboard/SupervisorDashboard';
import UserDashboard from '../components/dashboard/UserDashboard';
import { useCompanyFilter } from '../components/context/CompanyContext';

export default function Dashboard() {
    usePageTitle('Dashboard');
    const { selectedCompany } = useCompanyFilter();
    const { data: currentUser, isLoading: userLoading } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Redirect department heads immediately (before any rendering)
    React.useEffect(() => {
        if (currentUser) {
            const userRole = currentUser.extended_role || currentUser.role || 'user';
            if (userRole === 'department_head') {
                window.location.replace('/DepartmentHeadDashboard');
            }
        }
    }, [currentUser]);

    const { data: allProjects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects', selectedCompany],
        queryFn: async () => {
            if (selectedCompany) {
                return base44.entities.Project.filter({ company: selectedCompany }, '-created_date', 100);
            }
            return base44.entities.Project.list('-created_date', 100);
        },
        enabled: !!currentUser,
        staleTime: 5 * 60 * 1000
    });

    const { data: allEmployees = [], isLoading: employeesLoading } = useQuery({
        queryKey: ['employees', selectedCompany],
        queryFn: async () => {
            if (selectedCompany) {
                return base44.entities.Employee.filter({ company: selectedCompany }, 'name', 500);
            }
            return base44.entities.Employee.list('name', 500);
        },
        enabled: !!currentUser,
        staleTime: 5 * 60 * 1000
    });

    // Filter data based on user access
    const projects = React.useMemo(() => {
        if (!currentUser) return [];
        const userRole = currentUser.extended_role || currentUser.role || 'user';
        const canAccessAll = userRole === 'admin' || userRole === 'supervisor' || userRole === 'ceo' || userRole === 'hr_manager';
        if (canAccessAll) return allProjects;
        return allProjects.filter(p => p.company === currentUser.company);
    }, [allProjects, currentUser]);

    const employees = React.useMemo(() => {
        if (!currentUser) return [];
        const userRole = currentUser.extended_role || currentUser.role || 'user';
        const canAccessAll = userRole === 'admin' || userRole === 'supervisor' || userRole === 'ceo' || userRole === 'hr_manager';
        if (canAccessAll) return allEmployees;
        return allEmployees.filter(e => e.company === currentUser.company);
    }, [allEmployees, currentUser]);

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isCEO = userRole === 'ceo';
    const isHRManager = userRole === 'hr_manager';
    const isAdminOrSupervisor = isAdmin || isSupervisor || isCEO || isHRManager;

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

    // Role-based dashboard rendering
    if (isAdmin || isCEO) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="animate-in slide-in-from-top-4 duration-700">
                    <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
                        Welcome back, {currentUser?.display_name || currentUser?.full_name || (isCEO ? 'CEO' : 'Admin')}
                    </h1>
                    <p className="text-slate-600 mt-2 text-lg">System administration and monitoring</p>
                </div>
                <AdminDashboard projects={projects} employees={employees} currentUser={currentUser} />
            </div>
        );
    }

    if (isSupervisor) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="animate-in slide-in-from-top-4 duration-700">
                    <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
                        Welcome back, {currentUser?.display_name || currentUser?.full_name || 'Supervisor'}
                    </h1>
                    <p className="text-slate-600 mt-2 text-lg">Manage your team's attendance</p>
                </div>
                <SupervisorDashboard currentUser={currentUser} projects={projects} employees={employees} />
            </div>
        );
    }

    // Regular user dashboard
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="animate-in slide-in-from-top-4 duration-700">
                <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
                    Welcome back, {currentUser?.display_name || currentUser?.full_name || 'User'}
                </h1>
                <p className="text-slate-600 mt-2 text-lg">View your attendance and submit requests</p>
            </div>
            
            <UserDashboard currentUser={currentUser} projects={projects} />

        </div>
    );
}