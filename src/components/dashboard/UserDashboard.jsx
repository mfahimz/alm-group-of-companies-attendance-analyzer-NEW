import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Clock, AlertCircle, FolderKanban, Users, FileText, ArrowRight, Building2, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Badge } from '@/components/ui/badge';

// Companies with salary/payroll feature enabled
const PAYROLL_ENABLED_COMPANIES = ['Al Maraghi Auto Repairs'];

export default function UserDashboard({ currentUser, projects }) {
    const userCompany = currentUser?.company;
    const hasPayroll = PAYROLL_ENABLED_COMPANIES.includes(userCompany);

    const { data: employees = [] } = useQuery({
        queryKey: ['companyEmployees', userCompany],
        queryFn: async () => {
            const allEmployees = await base44.entities.Employee.list();
            return allEmployees.filter(e => e.company === userCompany);
        },
        enabled: !!userCompany
    });

    // Users only see their company's projects
    const companyProjects = projects.filter(p => p.company === userCompany);
    const activeProjects = companyProjects.filter(p => p.status !== 'closed');
    const analyzedProjects = companyProjects.filter(p => p.status === 'analyzed');
    const draftProjects = companyProjects.filter(p => p.status === 'draft');
    const activeEmployees = employees.filter(e => e.active);

    // If no company assigned, show empty state
    if (!userCompany) {
        return (
            <div className="flex items-center justify-center py-20">
                <Card className="border-0 shadow-lg max-w-md text-center p-8">
                    <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Company Assigned</h3>
                    <p className="text-slate-500">Please contact your administrator to assign you to a company.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Company Header */}
            <div className="flex items-center gap-2 px-1">
                <Building2 className="w-5 h-5 text-indigo-600" />
                <span className="text-lg font-semibold text-slate-900">{userCompany}</span>
                {hasPayroll && (
                    <Badge className="bg-green-100 text-green-700 text-xs ml-2">Payroll Enabled</Badge>
                )}
            </div>

            {/* Attendance Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link to={createPageUrl('Projects')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-indigo-50 to-indigo-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-1">Active Projects</p>
                                    <p className="text-3xl font-bold text-indigo-900">{activeProjects.length}</p>
                                    <p className="text-xs text-indigo-600 mt-1">{companyProjects.length} total</p>
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
                                                <p className="text-xs text-slate-500">Draft - needs analysis</p>
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
                                                <p className="text-xs text-slate-500">Ready for finalization</p>
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
                            {hasPayroll && (
                                <Link to={createPageUrl('Salaries')}>
                                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-green-50 hover:border-green-200">
                                        <DollarSign className="w-5 h-5 text-green-600" />
                                        <span className="text-sm">Salaries</span>
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