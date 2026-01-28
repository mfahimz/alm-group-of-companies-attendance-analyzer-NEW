import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, CheckCircle, Clock, FileText, FolderKanban, Building2, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function SupervisorDashboard({ currentUser, projects, employees }) {
    // Supervisors have access to ALL companies, not restricted to userCompany
    const activeProjects = projects.filter(p => p.status !== 'closed');
    const analyzedProjects = projects.filter(p => p.status === 'analyzed');
    const draftProjects = projects.filter(p => p.status === 'draft');
    const closedProjects = projects.filter(p => p.status === 'closed');
    const activeEmployees = employees.filter(e => e.active);

    // Group projects by company
    const projectsByCompany = projects.reduce((acc, p) => {
        acc[p.company] = acc[p.company] || [];
        acc[p.company].push(p);
        return acc;
    }, {});

    // Group employees by company
    const employeesByCompany = employees.reduce((acc, e) => {
        acc[e.company] = acc[e.company] || [];
        acc[e.company].push(e);
        return acc;
    }, {});

    const companies = [...new Set([...Object.keys(projectsByCompany), ...Object.keys(employeesByCompany)])].sort();

    // Recent projects (last 5)
    const recentProjects = [...projects]
        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
        .slice(0, 5);

    return (
        <div className="space-y-6">
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link to={createPageUrl('Employees')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-blue-50 to-blue-100">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-blue-600 mb-1">Total Employees</p>
                                    <p className="text-3xl font-bold text-blue-900">{activeEmployees.length}</p>
                                    <p className="text-xs text-blue-600 mt-1">{employees.length - activeEmployees.length} inactive</p>
                                </div>
                                <div className="bg-blue-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <Users className="w-6 h-6" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('Projects')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-green-50 to-green-100">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-green-600 mb-1">Active Projects</p>
                                    <p className="text-3xl font-bold text-green-900">{activeProjects.length}</p>
                                    <p className="text-xs text-green-600 mt-1">{projects.length} total</p>
                                </div>
                                <div className="bg-green-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <FolderKanban className="w-6 h-6" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('Projects')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-amber-50 to-amber-100">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-amber-600 mb-1">Ready for Review</p>
                                    <p className="text-3xl font-bold text-amber-900">{analyzedProjects.length}</p>
                                    <p className="text-xs text-amber-600 mt-1">Analyzed reports</p>
                                </div>
                                <div className="bg-amber-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <FileText className="w-6 h-6" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('Projects')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-purple-50 to-purple-100">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-purple-600 mb-1">Draft Projects</p>
                                    <p className="text-3xl font-bold text-purple-900">{draftProjects.length}</p>
                                    <p className="text-xs text-purple-600 mt-1">Needs attention</p>
                                </div>
                                <div className="bg-purple-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <Clock className="w-6 h-6" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Company Overview */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <Building2 className="w-5 h-5 text-indigo-600" />
                            </div>
                            <CardTitle className="text-lg">Company Overview</CardTitle>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {companies.map((company) => {
                            const companyProjects = projectsByCompany[company] || [];
                            const companyEmployees = employeesByCompany[company] || [];
                            const activeCompanyProjects = companyProjects.filter(p => p.status !== 'closed');
                            const analyzedCompanyProjects = companyProjects.filter(p => p.status === 'analyzed');
                            
                            return (
                                <div key={company} className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                                    <h3 className="font-semibold text-slate-900 mb-3">{company}</h3>
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
                                            <span className="text-slate-600">Ready for Review</span>
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

            {/* Recent Projects & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Projects */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 rounded-lg">
                                    <TrendingUp className="w-5 h-5 text-green-600" />
                                </div>
                                <CardTitle className="text-lg">Recent Projects</CardTitle>
                            </div>
                            <Link to={createPageUrl('Projects')}>
                                <Button variant="ghost" size="sm" className="text-indigo-600">
                                    View all <ArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {recentProjects.length === 0 ? (
                                <p className="text-slate-500 text-center py-4">No projects yet</p>
                            ) : (
                                recentProjects.map((project) => (
                                    <Link
                                        key={project.id}
                                        to={createPageUrl(`ProjectDetail?projectId=${project.id}`)}
                                        className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-900 truncate">{project.name}</p>
                                            <p className="text-xs text-slate-500">{project.company}</p>
                                        </div>
                                        <Badge 
                                            variant={project.status === 'closed' ? 'secondary' : project.status === 'analyzed' ? 'default' : 'outline'}
                                            className={`ml-2 ${
                                                project.status === 'draft' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                                project.status === 'analyzed' ? 'bg-green-100 text-green-700 border-green-200' :
                                                'bg-slate-100 text-slate-600'
                                            }`}
                                        >
                                            {project.status}
                                        </Badge>
                                    </Link>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <CheckCircle className="w-5 h-5 text-purple-600" />
                            </div>
                            <CardTitle className="text-lg">Quick Actions</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                            <Link to={createPageUrl('Projects')}>
                                <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-indigo-50 hover:border-indigo-200">
                                    <FolderKanban className="w-5 h-5 text-indigo-600" />
                                    <span className="text-sm">New Project</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('Employees')}>
                                <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-blue-50 hover:border-blue-200">
                                    <Users className="w-5 h-5 text-blue-600" />
                                    <span className="text-sm">View Employees</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('Reports')}>
                                <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-green-50 hover:border-green-200">
                                    <FileText className="w-5 h-5 text-green-600" />
                                    <span className="text-sm">View Reports</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('Salaries')}>
                                <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-amber-50 hover:border-amber-200">
                                    <TrendingUp className="w-5 h-5 text-amber-600" />
                                    <span className="text-sm">Salaries</span>
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Projects Needing Attention */}
            {(draftProjects.length > 0 || analyzedProjects.length > 0) && (
                <Card className="border-0 shadow-lg border-l-4 border-l-amber-400">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-100 rounded-lg">
                                <AlertCircle className="w-5 h-5 text-amber-600" />
                            </div>
                            <CardTitle className="text-lg">Projects Needing Attention</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {draftProjects.slice(0, 3).map((project) => (
                                <Link
                                    key={project.id}
                                    to={createPageUrl(`ProjectDetail?projectId=${project.id}`)}
                                    className="flex items-center justify-between p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-slate-900">{project.name}</p>
                                        <p className="text-xs text-slate-500">{project.company} • Draft - needs analysis</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-amber-600" />
                                </Link>
                            ))}
                            {analyzedProjects.slice(0, 3).map((project) => (
                                <Link
                                    key={project.id}
                                    to={createPageUrl(`ProjectDetail?projectId=${project.id}`)}
                                    className="flex items-center justify-between p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-slate-900">{project.name}</p>
                                        <p className="text-xs text-slate-500">{project.company} • Analyzed - ready for review</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-green-600" />
                                </Link>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}