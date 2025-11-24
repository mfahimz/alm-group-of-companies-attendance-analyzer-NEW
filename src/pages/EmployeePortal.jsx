import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Calendar, FileText, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function EmployeePortal() {
    const [showLeaveDialog, setShowLeaveDialog] = useState(false);
    const [leaveForm, setLeaveForm] = useState({
        date_from: '',
        date_to: '',
        leave_type: 'Annual Leave',
        reason: ''
    });
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: employee } = useQuery({
        queryKey: ['myEmployee', currentUser?.email],
        queryFn: async () => {
            const employees = await base44.entities.Employee.list();
            return employees.find(e => e.created_by === currentUser.email);
        },
        enabled: !!currentUser
    });

    const { data: myLeaveRequests = [] } = useQuery({
        queryKey: ['myLeaveRequests', employee?.attendance_id],
        queryFn: () => base44.entities.LeaveRequest.filter({ 
            employee_attendance_id: employee.attendance_id 
        }, '-created_date'),
        enabled: !!employee
    });

    const { data: myResults = [] } = useQuery({
        queryKey: ['myResults', employee?.attendance_id],
        queryFn: async () => {
            const allResults = await base44.entities.AnalysisResult.list();
            return allResults.filter(r => r.attendance_id === employee.attendance_id);
        },
        enabled: !!employee
    });

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list()
    });

    const createLeaveRequestMutation = useMutation({
        mutationFn: (data) => base44.entities.LeaveRequest.create({
            employee_attendance_id: employee.attendance_id,
            ...data
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['myLeaveRequests']);
            setShowLeaveDialog(false);
            setLeaveForm({ date_from: '', date_to: '', leave_type: 'Annual Leave', reason: '' });
            toast.success('Leave request submitted successfully');
        },
        onError: () => {
            toast.error('Failed to submit leave request');
        }
    });

    const handleSubmitLeave = (e) => {
        e.preventDefault();
        if (!leaveForm.date_from || !leaveForm.date_to || !leaveForm.reason) {
            toast.error('Please fill in all fields');
            return;
        }
        createLeaveRequestMutation.mutate(leaveForm);
    };

    const getStatusBadge = (status) => {
        const colors = {
            pending: 'bg-amber-100 text-amber-700',
            approved: 'bg-green-100 text-green-700',
            rejected: 'bg-red-100 text-red-700'
        };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    if (!currentUser || !employee) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <p className="text-slate-600 mb-4">Loading your profile...</p>
                    {currentUser && !employee && (
                        <p className="text-sm text-slate-500">
                            No employee record found. Please contact your administrator.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Employee Portal</h1>
                    <p className="text-slate-600 mt-2">
                        Welcome, {employee.name} (ID: {employee.attendance_id})
                    </p>
                </div>
                <Button
                    onClick={() => setShowLeaveDialog(true)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Request Leave
                </Button>
            </div>

            {/* Attendance Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {myResults.map((result) => {
                    const project = projects.find(p => p.id === result.project_id);
                    return (
                        <Card key={result.id} className="border-0 shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">{project?.name || 'Unknown Project'}</CardTitle>
                                <p className="text-xs text-slate-500">
                                    {project && `${new Date(project.date_from).toLocaleDateString()} - ${new Date(project.date_to).toLocaleDateString()}`}
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Working Days:</span>
                                    <span className="font-medium">{result.working_days}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Present Days:</span>
                                    <span className="font-medium text-green-600">{result.present_days}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Absences:</span>
                                    <span className="font-medium text-red-600">{result.full_absence_count}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Late Minutes:</span>
                                    <span className="font-medium text-orange-600">{result.late_minutes}</span>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
                {myResults.length === 0 && (
                    <Card className="border-0 shadow-sm col-span-full">
                        <CardContent className="text-center py-12 text-slate-500">
                            No attendance records available yet
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Leave Requests */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>My Leave Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    {myLeaveRequests.length === 0 ? (
                        <p className="text-center py-8 text-slate-500">No leave requests yet</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Leave Type</TableHead>
                                    <TableHead>From</TableHead>
                                    <TableHead>To</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Submitted</TableHead>
                                    <TableHead>Admin Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {myLeaveRequests.map((request) => (
                                    <TableRow key={request.id}>
                                        <TableCell className="font-medium">{request.leave_type}</TableCell>
                                        <TableCell>{new Date(request.date_from).toLocaleDateString()}</TableCell>
                                        <TableCell>{new Date(request.date_to).toLocaleDateString()}</TableCell>
                                        <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                                        <TableCell className="text-sm text-slate-600">
                                            {new Date(request.created_date).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-600">
                                            {request.admin_notes || '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Leave Request Dialog */}
            <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Submit Leave Request</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmitLeave} className="space-y-4 mt-4">
                        <div>
                            <Label>Leave Type</Label>
                            <Select
                                value={leaveForm.leave_type}
                                onValueChange={(value) => setLeaveForm({ ...leaveForm, leave_type: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Annual Leave">Annual Leave</SelectItem>
                                    <SelectItem value="Sick Leave">Sick Leave</SelectItem>
                                    <SelectItem value="Emergency Leave">Emergency Leave</SelectItem>
                                    <SelectItem value="Unpaid Leave">Unpaid Leave</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>From Date</Label>
                                <Input
                                    type="date"
                                    value={leaveForm.date_from}
                                    onChange={(e) => setLeaveForm({ ...leaveForm, date_from: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>To Date</Label>
                                <Input
                                    type="date"
                                    value={leaveForm.date_to}
                                    onChange={(e) => setLeaveForm({ ...leaveForm, date_to: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <Label>Reason</Label>
                            <Textarea
                                value={leaveForm.reason}
                                onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                                placeholder="Please provide a reason for your leave request..."
                                rows={4}
                            />
                        </div>
                        <div className="flex gap-3 pt-4">
                            <Button
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-700"
                                disabled={createLeaveRequestMutation.isPending}
                            >
                                Submit Request
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowLeaveDialog(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}