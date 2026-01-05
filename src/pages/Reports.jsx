import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, Users, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import Breadcrumb from '../components/ui/Breadcrumb';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

export default function Reports() {
    const [selectedCompany, setSelectedCompany] = useState('all');
    const [selectedEmployee, setSelectedEmployee] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

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

    const { data: allExceptions = [] } = useQuery({
        queryKey: ['exceptions'],
        queryFn: () => base44.entities.Exception.list('-created_date')
    });

    const { data: allAnalysisResults = [] } = useQuery({
        queryKey: ['analysisResults'],
        queryFn: () => base44.entities.AnalysisResult.list()
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
        let filtered = canAccessAll ? allEmployees : allEmployees.filter(e => e.company === currentUser.company);
        
        // Further filter by selected company if not "all"
        if (selectedCompany !== 'all') {
            filtered = filtered.filter(e => e.company === selectedCompany);
        }
        
        return filtered.sort((a, b) => {
            const nameA = a.name?.toLowerCase() || '';
            const nameB = b.name?.toLowerCase() || '';
            return nameA.localeCompare(nameB);
        });
    }, [allEmployees, currentUser, selectedCompany]);

    // Get unique companies
    const companies = React.useMemo(() => {
        const companySet = new Set(allProjects.map(p => p.company).filter(Boolean));
        return Array.from(companySet).sort();
    }, [allProjects]);

    // Filter data based on selections
    const filteredExceptions = React.useMemo(() => {
        let filtered = allExceptions;

        if (selectedCompany !== 'all') {
            const companyProjectIds = allProjects.filter(p => p.company === selectedCompany).map(p => p.id);
            filtered = filtered.filter(e => companyProjectIds.includes(e.project_id));
        }

        if (selectedEmployee !== 'all') {
            const employee = allEmployees.find(emp => emp.attendance_id === selectedEmployee);
            if (employee) {
                filtered = filtered.filter(e => e.attendance_id === employee.attendance_id);
            } else {
                filtered = [];
            }
        }

        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter(e => {
                const exceptionFrom = new Date(e.date_from);
                exceptionFrom.setHours(0, 0, 0, 0);
                return exceptionFrom >= fromDate;
            });
        }

        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(e => {
                const exceptionTo = new Date(e.date_to);
                exceptionTo.setHours(0, 0, 0, 0);
                return exceptionTo <= toDate;
            });
        }

        return filtered;
    }, [allExceptions, selectedCompany, selectedEmployee, dateFrom, dateTo, allProjects, allEmployees]);

    const filteredAnalysisResults = React.useMemo(() => {
        let filtered = allAnalysisResults;

        if (selectedCompany !== 'all') {
            const companyProjectIds = allProjects.filter(p => p.company === selectedCompany).map(p => p.id);
            filtered = filtered.filter(r => companyProjectIds.includes(r.project_id));
        }

        if (selectedEmployee !== 'all') {
            const employee = allEmployees.find(emp => emp.attendance_id === selectedEmployee);
            if (employee) {
                filtered = filtered.filter(r => r.attendance_id === employee.attendance_id);
            } else {
                filtered = [];
            }
        }

        return filtered;
    }, [allAnalysisResults, selectedCompany, selectedEmployee, allProjects, allEmployees]);

    // Calculate Exception Metrics
    const exceptionMetrics = React.useMemo(() => {
        const total = filteredExceptions.length;
        const pending = filteredExceptions.filter(e => 
            e.approval_status === 'pending_dept_head' || 
            e.approval_status === 'pending_hr' || 
            e.approval_status === 'pending'
        ).length;
        const approved = filteredExceptions.filter(e => 
            e.approval_status === 'approved' || 
            e.approval_status === 'approved_dept_head'
        ).length;
        const rejected = filteredExceptions.filter(e => e.approval_status === 'rejected').length;
        const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(1) : 0;

        const typeBreakdown = filteredExceptions.reduce((acc, e) => {
            acc[e.type] = (acc[e.type] || 0) + 1;
            return acc;
        }, {});

        return { total, pending, approved, rejected, approvalRate, typeBreakdown };
    }, [filteredExceptions]);

    // Calculate Attendance Metrics
    const attendanceMetrics = React.useMemo(() => {
        if (filteredAnalysisResults.length === 0) return null;

        const totalWorkingDays = filteredAnalysisResults.reduce((sum, r) => sum + (r.working_days || 0), 0);
        const totalPresentDays = filteredAnalysisResults.reduce((sum, r) => sum + (r.present_days || 0), 0);
        const totalAbsences = filteredAnalysisResults.reduce((sum, r) => sum + (r.full_absence_count || 0), 0);
        const totalHalfDays = filteredAnalysisResults.reduce((sum, r) => sum + (r.half_absence_count || 0), 0);
        const totalLateMinutes = filteredAnalysisResults.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
        const totalEarlyCheckout = filteredAnalysisResults.reduce((sum, r) => sum + (r.early_checkout_minutes || 0), 0);

        const attendanceRate = totalWorkingDays > 0 ? ((totalPresentDays / totalWorkingDays) * 100).toFixed(1) : 0;

        return {
            totalWorkingDays,
            totalPresentDays,
            totalAbsences,
            totalHalfDays,
            totalLateMinutes,
            totalEarlyCheckout,
            attendanceRate
        };
    }, [filteredAnalysisResults]);

    // Exception Type Chart Data
    const exceptionTypeData = Object.entries(exceptionMetrics.typeBreakdown).map(([type, count]) => ({
        name: type.replace(/_/g, ' '),
        value: count
    }));

    // Employee Attendance Trends
    const employeeAttendanceTrends = React.useMemo(() => {
        const employeeData = {};

        filteredAnalysisResults.forEach(result => {
            const employee = employees.find(e => e.attendance_id === result.attendance_id);
            if (!employee) return;

            if (!employeeData[result.attendance_id]) {
                employeeData[result.attendance_id] = {
                    name: employee.name,
                    attendance_id: result.attendance_id,
                    workingDays: 0,
                    presentDays: 0,
                    absences: 0,
                    lateMinutes: 0
                };
            }

            employeeData[result.attendance_id].workingDays += result.working_days || 0;
            employeeData[result.attendance_id].presentDays += result.present_days || 0;
            employeeData[result.attendance_id].absences += result.full_absence_count || 0;
            employeeData[result.attendance_id].lateMinutes += result.late_minutes || 0;
        });

        return Object.values(employeeData)
            .map(emp => ({
                ...emp,
                attendanceRate: emp.workingDays > 0 ? ((emp.presentDays / emp.workingDays) * 100).toFixed(1) : 0
            }))
            .sort((a, b) => {
                // Sort by attendance rate ascending (worst first), then by absences descending, then by late minutes descending
                if (a.attendanceRate !== b.attendanceRate) {
                    return a.attendanceRate - b.attendanceRate;
                }
                if (a.absences !== b.absences) {
                    return b.absences - a.absences;
                }
                return b.lateMinutes - a.lateMinutes;
            });
    }, [filteredAnalysisResults, employees]);

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Reports & Analytics' }]} />

            <div>
                <h1 className="text-3xl font-bold text-slate-900">Reports & Analytics</h1>
                <p className="text-slate-600 mt-2">Comprehensive insights into attendance and exceptions</p>
            </div>

            {/* Filters */}
            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Company</label>
                            <Select value={selectedCompany} onValueChange={(value) => {
                                setSelectedCompany(value);
                                setSelectedEmployee('all'); // Reset employee filter when company changes
                            }}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Companies</SelectItem>
                                    {companies.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Employee</label>
                            <Select 
                                value={selectedEmployee} 
                                onValueChange={setSelectedEmployee}
                                disabled={employees.length === 0}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={employees.length === 0 ? "No employees available" : "Select employee"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Employees</SelectItem>
                                    {employees.map(e => (
                                        <SelectItem key={e.id} value={e.attendance_id}>
                                            {e.attendance_id} - {e.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">From Date</label>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">To Date</label>
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSelectedCompany('all');
                                setSelectedEmployee('all');
                                setDateFrom('');
                                setDateTo('');
                            }}
                        >
                            Clear Filters
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Exception Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <Card className="border-0 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Total Exceptions</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{exceptionMetrics.total}</p>
                            </div>
                            <div className="bg-indigo-100 p-3 rounded-xl">
                                <AlertCircle className="w-6 h-6 text-indigo-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Pending</p>
                                <p className="text-3xl font-bold text-amber-600 mt-1">{exceptionMetrics.pending}</p>
                            </div>
                            <div className="bg-amber-100 p-3 rounded-xl">
                                <Clock className="w-6 h-6 text-amber-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Approved</p>
                                <p className="text-3xl font-bold text-green-600 mt-1">{exceptionMetrics.approved}</p>
                            </div>
                            <div className="bg-green-100 p-3 rounded-xl">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Rejected</p>
                                <p className="text-3xl font-bold text-red-600 mt-1">{exceptionMetrics.rejected}</p>
                            </div>
                            <div className="bg-red-100 p-3 rounded-xl">
                                <XCircle className="w-6 h-6 text-red-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Approval Rate</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{exceptionMetrics.approvalRate}%</p>
                            </div>
                            <div className="bg-blue-100 p-3 rounded-xl">
                                {exceptionMetrics.approvalRate >= 80 ? (
                                    <TrendingUp className="w-6 h-6 text-blue-600" />
                                ) : (
                                    <TrendingDown className="w-6 h-6 text-blue-600" />
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Attendance Metrics */}
            {attendanceMetrics && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="border-0 shadow-md">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-500 font-medium">Attendance Rate</p>
                                    <p className="text-3xl font-bold text-slate-900 mt-1">{attendanceMetrics.attendanceRate}%</p>
                                </div>
                                <div className="bg-green-100 p-3 rounded-xl">
                                    <Users className="w-6 h-6 text-green-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-md">
                        <CardContent className="p-6">
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Total Late Minutes</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{attendanceMetrics.totalLateMinutes}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {(attendanceMetrics.totalLateMinutes / 60).toFixed(1)} hours
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-md">
                        <CardContent className="p-6">
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Absences</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{attendanceMetrics.totalAbsences}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {attendanceMetrics.totalHalfDays} half days
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Exception Types Pie Chart */}
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle>Exception Types</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {exceptionTypeData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={exceptionTypeData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {exceptionTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[300px] flex items-center justify-center text-slate-500">
                                No data available
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Employee Attendance Trends */}
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <CardTitle>Employees Needing Attention</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {employeeAttendanceTrends.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={employeeAttendanceTrends.slice(0, 10)}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="attendanceRate" fill="#6366f1" name="Attendance %" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[300px] flex items-center justify-center text-slate-500">
                                No data available
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Employee Details Table */}
            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle>Employee Attendance Details</CardTitle>
                </CardHeader>
                <CardContent>
                    {employeeAttendanceTrends.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left p-3 text-sm font-medium text-slate-700">Employee</th>
                                        <th className="text-right p-3 text-sm font-medium text-slate-700">Working Days</th>
                                        <th className="text-right p-3 text-sm font-medium text-slate-700">Present Days</th>
                                        <th className="text-right p-3 text-sm font-medium text-slate-700">Absences</th>
                                        <th className="text-right p-3 text-sm font-medium text-slate-700">Late (min)</th>
                                        <th className="text-right p-3 text-sm font-medium text-slate-700">Attendance %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employeeAttendanceTrends.map((emp, idx) => (
                                        <tr key={idx} className="border-b hover:bg-slate-50">
                                            <td className="p-3">
                                                <div>
                                                    <p className="font-medium text-slate-900">{emp.name}</p>
                                                    <p className="text-xs text-slate-500">{emp.attendance_id}</p>
                                                </div>
                                            </td>
                                            <td className="text-right p-3">{emp.workingDays}</td>
                                            <td className="text-right p-3">{emp.presentDays}</td>
                                            <td className="text-right p-3">{emp.absences}</td>
                                            <td className="text-right p-3">{emp.lateMinutes}</td>
                                            <td className="text-right p-3">
                                                <span className={`font-medium ${
                                                    emp.attendanceRate >= 95 ? 'text-green-600' :
                                                    emp.attendanceRate >= 85 ? 'text-amber-600' :
                                                    'text-red-600'
                                                }`}>
                                                    {emp.attendanceRate}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="py-12 text-center text-slate-500">No data available</div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}