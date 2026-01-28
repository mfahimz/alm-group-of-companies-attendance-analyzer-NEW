import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Clock, FileText, FolderKanban, Building2, AlertCircle, ArrowRight, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Companies with salary/payroll feature enabled
const PAYROLL_ENABLED_COMPANIES = ['Al Maraghi Auto Repairs'];

export default function SupervisorDashboard({ currentUser, projects, employees }) {
    // Supervisors have access to ALL companies
    const activeProjects = projects.filter(p => p.status !== 'closed');
    const analyzedProjects = projects.filter(p => p.status === 'analyzed');
    const draftProjects = projects.filter(p => p.status === 'draft');
    const activeEmployees = employees.filter(e => e.active);

    // Group by company
    const projectsByCompany = projects.reduce((acc, p) => {
        acc[p.company] = acc[p.company] || [];
        acc[p.company].push(p);
        return acc;
    }, {});

    const employeesByCompany = employees.reduce((acc, e) => {
        acc[e.company] = acc[e.company] || [];
        acc[e.company].push(e);
        return acc;
    }, {});

    const companies = [...new Set([...Object.keys(projectsByCompany), ...Object.keys(employeesByCompany)])].sort();

    // Check if any company has payroll enabled
    const hasPayrollCompany = companies.some(c => PAYROLL_ENABLED_COMPANIES.includes(c));

    return (
        <div className="space-y-6">
            {/* Attendance Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link to={createPageUrl('Projects')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-indigo-50 to-indigo-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-1">Active Projects</p>
                                    <p className="text-3xl font-bold text-indigo-900">{activeProjects.length}</p>
                                    <p className="text-xs text-indigo-600 mt-1">{projects.length} total</p>
                                </div>
                                <div className="bg-indigo-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <FolderKanban className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('Projects')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-amber-50 to-amber-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-amber-600 mb-1">Pending Review</p>
                                    <p className="text-3xl font-bold text-amber-900">{analyzedProjects.length}</p>
                                    <p className="text-xs text-amber-600 mt-1">{draftProjects.length} drafts</p>
                                </div>
                                <div className="bg-amber-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <FileText className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('Employees')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-blue-50 to-blue-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-blue-600 mb-1">Employees</p>
                                    <p className="text-3xl font-bold text-blue-900">{activeEmployees.length}</p>
                                    <p className="text-xs text-blue-600 mt-1">{employees.length - activeEmployees.length} inactive</p>
                                </div>
                                <div className="bg-blue-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <Users className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('Projects')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-purple-50 to-purple-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-purple-600 mb-1">Draft Projects</p>
                                    <p className="text-3xl font-bold text-purple-900">{draftProjects.length}</p>
                                    <p className="text-xs text-purple-600 mt-1">Needs analysis</p>
                                </div>
                                <div className="bg-purple-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <Clock className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Company Overview */}
            <Card className="border-0 shadow-lg">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                            <Building2 className="w-5 h-5 text-indigo-600" />
                        </div>
                        <CardTitle className="text-lg">Company Overview</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {companies.map((company) => {
                            const companyProjects = projectsByCompany[company] || [];
                            const companyEmployees = employeesByCompany[company] || [];
                            const activeCompanyProjects = companyProjects.filter(p => p.status !== 'closed');
                            const analyzedCompanyProjects = companyProjects.filter(p => p.status === 'analyzed');
                            const hasPayroll = PAYROLL_ENABLED_COMPANIES.includes(company);
                            
                            return (
                                <div key={company} className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-slate-900">{company}</h3>
                                        {hasPayroll && (
                                            <Badge className="bg-green-100 text-green-700 text-xs">Payroll</Badge>
                                        )}
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Employees</span>
                                            <span className="font-medium text-slate-900">{companyEmployees.filter(e => e.active).length}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Active Projects</span>
                                            <span className="font-medium text-slate-900">{activeCompanyProjects.length}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Pending Review</span>
                                            <Badge variant={analyzedCompanyProjects.length > 0 ? "default" : "secondary"} className="text-xs">
                                                {analyzedCompanyProjects.length}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Projects Needing Attention */}
                <Card className="border-0 shadow-lg border-l-4 border-l-amber-400">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-100 rounded-lg">
                                    <AlertCircle className="w-5 h-5 text-amber-600" />
                                </div>
                                <CardTitle className="text-lg">Needs Attention</CardTitle>
                            </div>
                            <Link to={createPageUrl('Projects')}>
                                <Button variant="ghost" size="sm" className="text-indigo-600">
                                    View all <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 max-h-[280px] overflow-auto">
                            {draftProjects.length === 0 && analyzedProjects.length === 0 ? (
                                <p className="text-slate-500 text-center py-4">All projects are up to date</p>
                            ) : (
                                <>
                                    {draftProjects.slice(0, 4).map((project) => (
                                        <Link
                                            key={project.id}
                                            to={createPageUrl(`ProjectDetail?projectId=${project.id}`)}
                                            className="flex items-center justify-between p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
                                        >
                                            <div>
                                                <p className="font-medium text-slate-900">{project.name}</p>
                                                <p className="text-xs text-slate-500">{project.company} • Draft</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-amber-600" />
                                        </Link>
                                    ))}
                                    {analyzedProjects.slice(0, 4).map((project) => (
                                        <Link
                                            key={project.id}
                                            to={createPageUrl(`ProjectDetail?projectId=${project.id}`)}
                                            className="flex items-center justify-between p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors"
                                        >
                                            <div>
                                                <p className="font-medium text-slate-900">{project.name}</p>
                                                <p className="text-xs text-slate-500">{project.company} • Ready for finalization</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-green-600" />
                                        </Link>
                                    ))}
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <FolderKanban className="w-5 h-5 text-indigo-600" />
                            </div>
                            <CardTitle className="text-lg">Quick Actions</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                            <Link to={createPageUrl('Projects')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-indigo-50 hover:border-indigo-200">
                                    <FolderKanban className="w-5 h-5 text-indigo-600" />
                                    <span className="text-sm">New Project</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('Employees')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-blue-50 hover:border-blue-200">
                                    <Users className="w-5 h-5 text-blue-600" />
                                    <span className="text-sm">Employees</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('Reports')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-green-50 hover:border-green-200">
                                    <FileText className="w-5 h-5 text-green-600" />
                                    <span className="text-sm">Reports</span>
                                </Button>
                            </Link>
                            {hasPayrollCompany ? (
                                <Link to={createPageUrl('Salaries')}>
                                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-green-50 hover:border-green-200">
                                        <DollarSign className="w-5 h-5 text-green-600" />
                                        <span className="text-sm">Salaries</span>
                                    </Button>
                                </Link>
                            ) : (
                                <Link to={createPageUrl('Projects')}>
                                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-slate-50 hover:border-slate-200">
                                        <FolderKanban className="w-5 h-5 text-slate-600" />
                                        <span className="text-sm">All Projects</span>
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}