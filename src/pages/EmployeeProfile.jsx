import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, Building2, Briefcase, Calendar, Award, Clock } from 'lucide-react';
import { createPageUrl } from '../utils';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function EmployeeProfile() {
    const navigate = useNavigate();
    const urlParams = new URLSearchParams(window.location.search);
    const employeeId = urlParams.get('id');

    const { data: employee, isLoading } = useQuery({
        queryKey: ['employee', employeeId],
        queryFn: async () => {
            const employees = await base44.entities.Employee.list();
            return employees.find(e => e.id === employeeId);
        },
        enabled: !!employeeId
    });

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list()
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-500">Loading employee profile...</div>
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-500">Employee not found</div>
            </div>
        );
    }

    const closedProjects = projects.filter(p => p.status === 'closed' && p.company === employee.company);

    return (
        <div className="space-y-6">
            <Breadcrumb 
                items={[
                    { label: 'Employees', path: 'Employees' },
                    { label: employee.name }
                ]}
            />

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(createPageUrl('Employees'))}
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Employees
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">{employee.name}</h1>
                        <p className="text-slate-500 mt-1">{employee.hrms_id}</p>
                    </div>
                </div>
                <div className={`px-4 py-2 rounded-lg font-medium ${
                    employee.active 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                }`}>
                    {employee.active ? 'Active' : 'Inactive'}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Information */}
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="w-5 h-5 text-indigo-600" />
                            Personal Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm text-slate-500">Full Name</label>
                            <p className="font-medium text-slate-900">{employee.name}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">HRMS ID</label>
                            <p className="font-medium text-slate-900">{employee.hrms_id}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Attendance ID</label>
                            <p className="font-medium text-slate-900">{employee.attendance_id}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Employee Code</label>
                            <p className="font-medium text-slate-900">{employee.employee_code || '—'}</p>
                        </div>
                    </CardContent>
                </Card>

                {/* Work Information */}
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-indigo-600" />
                            Work Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm text-slate-500">Company</label>
                            <p className="font-medium text-slate-900">{employee.company}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Department</label>
                            <p className="font-medium text-slate-900">{employee.department || '—'}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Weekly Off</label>
                            <p className="font-medium text-slate-900">{employee.weekly_off || 'Sunday'}</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500">Employment Status</label>
                            <p className="font-medium text-slate-900">
                                {employee.active ? 'Active' : 'Inactive'}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Grace Minutes */}
                <Card className="border-0 shadow-md bg-gradient-to-br from-indigo-50 to-purple-50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-indigo-600" />
                            Carried Grace Minutes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-center py-6">
                            <div className="text-5xl font-bold text-indigo-600 mb-2">
                                {employee.carried_grace_minutes || 0}
                            </div>
                            <p className="text-sm text-slate-600">
                                minutes available from previous projects
                            </p>
                        </div>
                        <div className="mt-4 p-3 bg-white/60 rounded-lg">
                            <p className="text-xs text-slate-600">
                                <strong>Note:</strong> Grace minutes are carried forward from closed projects and can be used in future analysis runs.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Project History */}
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-indigo-600" />
                            Project History
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <span className="text-sm text-slate-600">Total Closed Projects</span>
                                <span className="font-bold text-slate-900">{closedProjects.length}</span>
                            </div>
                            {closedProjects.length > 0 && (
                                <div className="text-xs text-slate-500">
                                    Most recent: {closedProjects
                                        .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0]?.name}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Account Details */}
                <Card className="border-0 shadow-md col-span-1 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-indigo-600" />
                            Account Details
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-sm text-slate-500">Created On</label>
                                <p className="font-medium text-slate-900">
                                    {new Date(employee.created_date).toLocaleString('en-US', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true,
                                        timeZone: 'Asia/Dubai'
                                    })}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Last Updated</label>
                                <p className="font-medium text-slate-900">
                                    {new Date(employee.updated_date).toLocaleString('en-US', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true,
                                        timeZone: 'Asia/Dubai'
                                    })}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}