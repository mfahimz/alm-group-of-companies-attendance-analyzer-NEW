import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar as CalendarIcon, Eye, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parseISO, isAfter, isBefore, addDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function DepartmentHeadDashboard() {
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [approvedMinutes, setApprovedMinutes] = useState('');
    const [reason, setReason] = useState('');
    const [viewingPreviousReport, setViewingPreviousReport] = useState(false);

    const queryClient = useQueryClient();

    // Get current user
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Get department head assignment
    const { data: deptHeadAssignment } = useQuery({
        queryKey: ['deptHeadAssignment', currentUser?.email],
        queryFn: async () => {
            const assignments = await base44.entities.DepartmentHead.filter({ 
                employee_id: currentUser.hrms_id || currentUser.id,
                active: true 
            });
            return assignments[0] || null;
        },
        enabled: !!currentUser
    });

    // Get current month project (Al Maraghi Auto Repairs only)
    const { data: currentProject } = useQuery({
        queryKey: ['currentMonthProject', deptHeadAssignment?.company, deptHeadAssignment?.department],
        queryFn: async () => {
            if (!deptHeadAssignment) return null;
            
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            
            // Get all projects for this company and department
            const projects = await base44.entities.Project.filter({
                company: deptHeadAssignment.company,
                department: deptHeadAssignment.department
            });
            
            // Find project that matches current month date range
            const currentMonthProject = projects.find(p => {
                const projectStart = parseISO(p.date_from);
                const projectEnd = parseISO(p.date_to);
                return projectStart <= firstDay && projectEnd >= lastDay;
            });
            
            return currentMonthProject || null;
        },
        enabled: !!deptHeadAssignment && deptHeadAssignment.company === 'Al Maraghi Auto Repairs'
    });

    // Get previous month's finalized report
    const { data: previousReport } = useQuery({
        queryKey: ['previousReport', deptHeadAssignment?.company, deptHeadAssignment?.department],
        queryFn: async () => {
            if (!deptHeadAssignment) return null;
            
            const now = new Date();
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

    // Get employees under this department head
    const { data: employees = [] } = useQuery({
        queryKey: ['deptEmployees', deptHeadAssignment?.company, deptHeadAssignment?.department],
        queryFn: async () => {
            if (!deptHeadAssignment) return [];
            
            return await base44.entities.Employee.filter({
                company: deptHeadAssignment.company,
                department: deptHeadAssignment.department,
                active: true
            });
        },
        enabled: !!deptHeadAssignment
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

    // Create pre-approval mutation
    const createPreApprovalMutation = useMutation({
        mutationFn: async ({ employeeId, date, minutes, reason }) => {
            // Check if approval already exists
            const existing = preApprovals.find(pa => 
                pa.attendance_id === employeeId && 
                pa.date_from === date && 
                pa.date_to === date
            );
            
            if (existing) {
                // Update existing
                return await base44.entities.Exception.update(existing.id, {
                    allowed_minutes: parseInt(minutes),
                    details: reason
                });
            } else {
                // Create new
                return await base44.entities.Exception.create({
                    project_id: currentProject.id,
                    attendance_id: employeeId,
                    date_from: date,
                    date_to: date,
                    type: 'ALLOWED_MINUTES',
                    allowed_minutes: parseInt(minutes),
                    allowed_minutes_type: 'both',
                    approval_status: 'approved_dept_head',
                    approved_by_dept_head: currentUser.hrms_id || currentUser.id,
                    dept_head_approval_date: new Date().toISOString(),
                    details: reason,
                    use_in_analysis: true
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['preApprovals', currentProject?.id]);
            toast.success('Minutes pre-approved successfully');
            setSelectedEmployee(null);
            setSelectedDate(null);
            setApprovedMinutes('');
            setReason('');
        },
        onError: (error) => {
            toast.error('Failed to save pre-approval: ' + error.message);
        }
    });

    const handleSaveApproval = () => {
        if (!selectedEmployee || !selectedDate || !approvedMinutes) {
            toast.error('Please select employee, date, and enter minutes');
            return;
        }

        const minutes = parseInt(approvedMinutes);
        if (isNaN(minutes) || minutes <= 0) {
            toast.error('Please enter valid minutes');
            return;
        }

        // Check cutoff date (project end date - 1 day)
        const cutoffDate = addDays(parseISO(currentProject.date_to), -1);
        if (isAfter(new Date(), cutoffDate)) {
            toast.error('Approval period has ended. Cannot add new approvals.');
            return;
        }

        createPreApprovalMutation.mutate({
            employeeId: selectedEmployee.attendance_id,
            date: format(selectedDate, 'yyyy-MM-dd'),
            minutes,
            reason
        });
    };

    // Get approvals count for each employee
    const getEmployeeApprovalsCount = (employeeId) => {
        return preApprovals.filter(pa => pa.attendance_id === employeeId).length;
    };

    const getEmployeeTotalMinutes = (employeeId) => {
        return preApprovals
            .filter(pa => pa.attendance_id === employeeId)
            .reduce((sum, pa) => sum + (pa.allowed_minutes || 0), 0);
    };

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
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <Card className="max-w-md">
                    <CardContent className="p-6 text-center">
                        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2">No Department Assignment</h2>
                        <p className="text-slate-600">
                            You are not assigned as a department head. Please contact your administrator.
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

    const projectEndCutoff = currentProject ? addDays(parseISO(currentProject.date_to), -1) : null;
    const approvalPeriodEnded = projectEndCutoff && isAfter(new Date(), projectEndCutoff);

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

            {/* Pre-Approval Form */}
            {currentProject && !approvalPeriodEnded && (
                <Card>
                    <CardHeader>
                        <CardTitle>Pre-Approve Minutes for Employee</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Select Employee
                                </label>
                                <select
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                    value={selectedEmployee?.id || ''}
                                    onChange={(e) => {
                                        const emp = employees.find(e => e.id === e.target.value);
                                        setSelectedEmployee(emp);
                                    }}
                                >
                                    <option value="">-- Choose Employee --</option>
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>
                                            {emp.name} (ID: {emp.attendance_id})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Select Date
                                </label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="w-full justify-start text-left"
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {selectedDate ? format(selectedDate, 'dd MMM yyyy') : 'Pick a date'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={selectedDate}
                                            onSelect={setSelectedDate}
                                            disabled={(date) => {
                                                const projectStart = parseISO(currentProject.date_from);
                                                const projectEnd = parseISO(currentProject.date_to);
                                                return isBefore(date, projectStart) || 
                                                       isAfter(date, projectEnd) ||
                                                       isAfter(date, new Date()); // Cannot approve future dates
                                            }}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Approved Minutes
                            </label>
                            <Input
                                type="number"
                                placeholder="Enter minutes (e.g., 60)"
                                value={approvedMinutes}
                                onChange={(e) => setApprovedMinutes(e.target.value)}
                                min="1"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Reason
                            </label>
                            <Textarea
                                placeholder="Enter reason for approval (e.g., Hospital appointment, Personal emergency)"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                            />
                        </div>

                        <Button 
                            onClick={handleSaveApproval}
                            disabled={createPreApprovalMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            {createPreApprovalMutation.isPending ? 'Saving...' : 'Save Pre-Approval'}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Employees List with Approvals */}
            {currentProject && (
                <Card>
                    <CardHeader>
                        <CardTitle>Employees & Pre-Approved Minutes</CardTitle>
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