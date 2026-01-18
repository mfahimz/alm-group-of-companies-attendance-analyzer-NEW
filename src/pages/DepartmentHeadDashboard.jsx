import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar as CalendarIcon, Eye, CheckCircle2, Clock, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isAfter, isBefore, addDays } from 'date-fns';
import { nowInUAE, utcToUAE } from '@/components/ui/timezone';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PreApprovalDialog from '@/components/departmenthead/PreApprovalDialog.jsx';

export default function DepartmentHeadDashboard() {
    const [showPreApprovalDialog, setShowPreApprovalDialog] = useState(false);
    const [viewingPreviousReport, setViewingPreviousReport] = useState(false);

    const queryClient = useQueryClient();

    // Get current user
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // SECURITY: Verify department head assignment via backend
    const { data: deptHeadVerification } = useQuery({
        queryKey: ['deptHeadVerification', currentUser?.email],
        queryFn: async () => {
            const { data } = await base44.functions.invoke('verifyDepartmentHead', {});
            return data;
        },
        enabled: !!currentUser,
        retry: false
    });

    const deptHeadAssignment = deptHeadVerification?.verified ? {
        company: deptHeadVerification.assignment.company,
        department: deptHeadVerification.assignment.department,
        employee_id: deptHeadVerification.assignment.employee_id
    } : null;

    // Get active project containing today's date (UAE timezone)
    const { data: currentProject } = useQuery({
        queryKey: ['activeProject', deptHeadAssignment?.company, deptHeadAssignment?.department],
        queryFn: async () => {
            if (!deptHeadAssignment) return null;
            
            // Get current date in UAE timezone
            const today = nowInUAE();
            
            // Get all projects for this company
            const projects = await base44.entities.Project.filter({
                company: deptHeadAssignment.company
            });
            
            // Find project whose date range contains today and matches department or has "All"
            const activeProject = projects.find(p => {
                const projectStart = utcToUAE(p.date_from);
                const projectEnd = utcToUAE(p.date_to);
                const isInDateRange = projectStart <= today && projectEnd >= today;
                const isDepartmentMatch = p.department === 'All' || p.department === deptHeadAssignment.department;
                return isInDateRange && isDepartmentMatch;
            });
            
            return activeProject || null;
        },
        enabled: !!deptHeadAssignment && deptHeadAssignment.company === 'Al Maraghi Auto Repairs'
    });

    // Get previous month's finalized report (UAE timezone)
    const { data: previousReport } = useQuery({
        queryKey: ['previousReport', deptHeadAssignment?.company, deptHeadAssignment?.department],
        queryFn: async () => {
            if (!deptHeadAssignment) return null;
            
            const now = nowInUAE();
            const prevMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthLast = new Date(now.getFullYear(), now.getMonth(), 0);
            
            // Get projects for previous month
            const projects = await base44.entities.Project.filter({
                company: deptHeadAssignment.company,
                department: deptHeadAssignment.department,
                status: 'closed'
            });
            
            const prevMonthProject = projects.find(p => {
                const projectStart = parseISO(p.date_from);
                const projectEnd = parseISO(p.date_to);
                return projectStart <= prevMonthFirst && projectEnd >= prevMonthLast;
            });
            
            if (!prevMonthProject || !prevMonthProject.last_saved_report_id) return null;
            
            // Get the final report
            const reports = await base44.entities.ReportRun.filter({
                id: prevMonthProject.last_saved_report_id,
                project_id: prevMonthProject.id
            });
            
            return reports[0] || null;
        },
        enabled: !!deptHeadAssignment && deptHeadAssignment.company === 'Al Maraghi Auto Repairs'
    });

    // SECURITY: Server-side filtered employees for this department head (only managed subordinates)
    const { data: employees = [] } = useQuery({
        queryKey: ['deptEmployees', deptHeadAssignment?.company, deptHeadAssignment?.department, deptHeadVerification?.assignment?.managed_employee_ids],
        queryFn: async () => {
            if (!deptHeadVerification?.verified) return [];
            
            const managedIds = deptHeadVerification.assignment.managed_employee_ids 
                ? deptHeadVerification.assignment.managed_employee_ids.split(',').map(id => String(id.trim()))
                : [];
            
            if (managedIds.length === 0) return [];
            
            // Fetch all managed employees
            const allEmployees = await base44.entities.Employee.filter({
                company: deptHeadVerification.assignment.company,
                active: true
            });
            
            // Filter to only managed subordinates (compare as strings)
            return allEmployees.filter(emp => managedIds.includes(String(emp.hrms_id)));
        },
        enabled: !!deptHeadVerification?.verified
    });

    // Get existing pre-approvals for current project
    const { data: preApprovals = [] } = useQuery({
        queryKey: ['preApprovals', currentProject?.id],
        queryFn: async () => {
            if (!currentProject) return [];
            
            return await base44.entities.Exception.filter({
                project_id: currentProject.id,
                type: 'ALLOWED_MINUTES',
                approval_status: 'approved_dept_head'
            });
        },
        enabled: !!currentProject
    });



    // Get approvals count for each employee
    const getEmployeeApprovalsCount = (employeeId) => {
        return preApprovals.filter(pa => pa.attendance_id === employeeId).length;
    };

    const getEmployeeTotalMinutes = (employeeId) => {
        return preApprovals
            .filter(pa => pa.attendance_id === employeeId)
            .reduce((sum, pa) => sum + (pa.allowed_minutes || 0), 0);
    };

    // Check if salary is closed for current project
    const salaryIsClosed = currentProject?.status === 'closed';

    // Check if not Al Maraghi Auto Repairs
    if (deptHeadAssignment && deptHeadAssignment.company !== 'Al Maraghi Auto Repairs') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center">
                        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2">Feature Not Available</h2>
                        <p className="text-slate-600">
                            This feature is currently only available for Al Maraghi Auto Repairs.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!currentUser) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    if (!deptHeadAssignment) {
        const errorMessage = deptHeadVerification?.error || 'You are not assigned as a department head.';
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center">
                        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2">Department Head Access Required</h2>
                        <p className="text-slate-600 mb-4">
                            {errorMessage}
                        </p>
                        <p className="text-sm text-slate-500">
                            Please contact your administrator to resolve this issue.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (viewingPreviousReport && previousReport) {
        return (
            <div className="max-w-7xl mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Previous Month Report</h1>
                        <p className="text-slate-600 mt-1">
                            Report for {format(parseISO(previousReport.date_from), 'MMMM yyyy')}
                        </p>
                    </div>
                    <Button onClick={() => setViewingPreviousReport(false)} variant="outline">
                        Back to Approvals
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Report Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <p><strong>Report Name:</strong> {previousReport.report_name || 'Unnamed Report'}</p>
                            <p><strong>Period:</strong> {format(parseISO(previousReport.date_from), 'dd MMM yyyy')} - {format(parseISO(previousReport.date_to), 'dd MMM yyyy')}</p>
                            <p><strong>Employees:</strong> {previousReport.employee_count}</p>
                            <p><strong>Generated On:</strong> {format(parseISO(previousReport.created_date), 'dd MMM yyyy HH:mm')}</p>
                        </div>
                        <div className="mt-6">
                            <Link 
                                to={createPageUrl('ReportDetail') + `?id=${previousReport.id}&project_id=${previousReport.project_id}`}
                                target="_blank"
                            >
                                <Button className="bg-indigo-600 hover:bg-indigo-700">
                                    <Eye className="w-4 h-4 mr-2" />
                                    View Full Report
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const projectEndCutoff = currentProject ? addDays(utcToUAE(currentProject.date_to), -1) : null;
    const approvalPeriodEnded = projectEndCutoff && isAfter(nowInUAE(), projectEndCutoff);

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Department Head Dashboard</h1>
                    <p className="text-slate-600 mt-1">
                        {deptHeadAssignment.department} Department - {deptHeadAssignment.company}
                    </p>
                </div>
                {previousReport && (
                    <Button 
                        onClick={() => setViewingPreviousReport(true)}
                        variant="outline"
                        className="border-indigo-300 hover:bg-indigo-50"
                    >
                        <Eye className="w-4 h-4 mr-2" />
                        View Previous Month Report
                    </Button>
                )}
            </div>

            {/* Current Project Info */}
            {currentProject && (
                <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-indigo-600 rounded-lg">
                                <CalendarIcon className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-semibold text-slate-900">{currentProject.name}</h2>
                                <p className="text-slate-600 mt-1">
                                    {format(parseISO(currentProject.date_from), 'dd MMM yyyy')} - {format(parseISO(currentProject.date_to), 'dd MMM yyyy')}
                                </p>
                                {approvalPeriodEnded && (
                                    <div className="mt-3 bg-amber-100 border border-amber-300 rounded-lg p-3">
                                        <p className="text-amber-900 text-sm font-medium flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" />
                                            Approval period has ended. No new approvals can be added.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {!currentProject && (
                <Card>
                    <CardContent className="p-6 text-center">
                        <Clock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2">No Active Project</h2>
                        <p className="text-slate-600">
                            No project found for the current month. Please contact your administrator.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Show message when salary is closed - access to attendance report */}
            {currentProject && salaryIsClosed && (
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-green-600 rounded-lg">
                                <CheckCircle2 className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-semibold text-slate-900">Salary Closed</h2>
                                <p className="text-slate-600 mt-1">
                                    The salary for this period has been finalized. You can now view the complete attendance report for your subordinates below.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Pre-Approval Dialog Trigger - only shown before salary is closed */}
            {currentProject && !salaryIsClosed && !approvalPeriodEnded && (
                <div className="flex justify-end">
                    <Button 
                        onClick={() => setShowPreApprovalDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Pre-Approved Minutes
                    </Button>
                </div>
            )}

            {/* Pre-Approval Dialog */}
            <PreApprovalDialog 
                open={showPreApprovalDialog}
                onClose={() => setShowPreApprovalDialog(false)}
                projectId={currentProject?.id}
                employees={employees}
                deptHeadAssignment={deptHeadAssignment}
                deptHeadVerification={deptHeadVerification}
                currentProject={currentProject}
                onSuccess={() => {
                    queryClient.invalidateQueries(['preApprovals', currentProject?.id]);
                }}
            />

            {/* Employees List with Approvals or Attendance Report */}
            {currentProject && (
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {salaryIsClosed ? 'Subordinates Attendance Report' : 'Employees & Pre-Approved Minutes'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {employees.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                No employees found in this department.
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee Name</TableHead>
                                        <TableHead>Attendance ID</TableHead>
                                        <TableHead className="text-center">Pre-Approvals Count</TableHead>
                                        <TableHead className="text-center">Total Minutes Approved</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {employees.map(emp => (
                                        <TableRow key={emp.id}>
                                            <TableCell className="font-medium">{emp.name}</TableCell>
                                            <TableCell>{emp.attendance_id}</TableCell>
                                            <TableCell className="text-center">
                                                <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full font-semibold">
                                                    {getEmployeeApprovalsCount(emp.attendance_id)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="text-green-700 font-semibold">
                                                    {getEmployeeTotalMinutes(emp.attendance_id)} min
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}