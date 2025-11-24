import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LeaveApprovals() {
    const [reviewDialog, setReviewDialog] = useState(null);
    const [adminNotes, setAdminNotes] = useState('');
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: leaveRequests = [] } = useQuery({
        queryKey: ['allLeaveRequests'],
        queryFn: () => base44.entities.LeaveRequest.list('-created_date')
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const reviewRequestMutation = useMutation({
        mutationFn: ({ requestId, status, notes }) => 
            base44.entities.LeaveRequest.update(requestId, {
                status,
                admin_notes: notes,
                approved_by: currentUser.email,
                reviewed_date: new Date().toISOString()
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['allLeaveRequests']);
            setReviewDialog(null);
            setAdminNotes('');
            toast.success('Leave request reviewed successfully');
        },
        onError: () => {
            toast.error('Failed to review leave request');
        }
    });

    const handleReview = (status) => {
        if (!reviewDialog) return;
        reviewRequestMutation.mutate({
            requestId: reviewDialog.id,
            status,
            notes: adminNotes
        });
    };

    const getEmployeeName = (attendanceId) => {
        const employee = employees.find(e => e.attendance_id === attendanceId);
        return employee ? employee.name : 'Unknown';
    };

    const getStatusBadge = (status) => {
        const colors = {
            pending: 'bg-amber-100 text-amber-700',
            approved: 'bg-green-100 text-green-700',
            rejected: 'bg-red-100 text-red-700'
        };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    const pendingRequests = leaveRequests.filter(r => r.status === 'pending');
    const reviewedRequests = leaveRequests.filter(r => r.status !== 'pending');

    const renderRequestsTable = (requests) => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {requests.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                            No requests to display
                        </TableCell>
                    </TableRow>
                ) : (
                    requests.map((request) => {
                        const fromDate = new Date(request.date_from);
                        const toDate = new Date(request.date_to);
                        const days = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
                        
                        return (
                            <TableRow key={request.id}>
                                <TableCell className="font-medium">
                                    {getEmployeeName(request.employee_attendance_id)}
                                </TableCell>
                                <TableCell className="text-sm text-slate-600">
                                    {request.employee_attendance_id}
                                </TableCell>
                                <TableCell>{request.leave_type}</TableCell>
                                <TableCell>{fromDate.toLocaleDateString()}</TableCell>
                                <TableCell>{toDate.toLocaleDateString()}</TableCell>
                                <TableCell className="font-medium">{days}</TableCell>
                                <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                                <TableCell>{getStatusBadge(request.status)}</TableCell>
                                <TableCell className="text-sm text-slate-600">
                                    {new Date(request.created_date).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setReviewDialog(request);
                                            setAdminNotes(request.admin_notes || '');
                                        }}
                                    >
                                        <Eye className="w-4 h-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })
                )}
            </TableBody>
        </Table>
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Leave Request Approvals</h1>
                <p className="text-slate-600 mt-2">Review and manage employee leave requests</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600 font-medium">Pending Requests</p>
                                <p className="text-3xl font-bold text-amber-600 mt-2">{pendingRequests.length}</p>
                            </div>
                            <div className="bg-amber-100 p-3 rounded-xl">
                                <Eye className="w-6 h-6 text-amber-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600 font-medium">Approved</p>
                                <p className="text-3xl font-bold text-green-600 mt-2">
                                    {leaveRequests.filter(r => r.status === 'approved').length}
                                </p>
                            </div>
                            <div className="bg-green-100 p-3 rounded-xl">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600 font-medium">Rejected</p>
                                <p className="text-3xl font-bold text-red-600 mt-2">
                                    {leaveRequests.filter(r => r.status === 'rejected').length}
                                </p>
                            </div>
                            <div className="bg-red-100 p-3 rounded-xl">
                                <XCircle className="w-6 h-6 text-red-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Requests Tables */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Leave Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="pending">
                        <TabsList>
                            <TabsTrigger value="pending">
                                Pending ({pendingRequests.length})
                            </TabsTrigger>
                            <TabsTrigger value="reviewed">
                                Reviewed ({reviewedRequests.length})
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="pending" className="mt-4">
                            {renderRequestsTable(pendingRequests)}
                        </TabsContent>
                        <TabsContent value="reviewed" className="mt-4">
                            {renderRequestsTable(reviewedRequests)}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Review Dialog */}
            <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Review Leave Request</DialogTitle>
                    </DialogHeader>
                    {reviewDialog && (
                        <div className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                                <div>
                                    <p className="text-sm text-slate-600">Employee</p>
                                    <p className="font-medium">{getEmployeeName(reviewDialog.employee_attendance_id)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Attendance ID</p>
                                    <p className="font-medium">{reviewDialog.employee_attendance_id}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Leave Type</p>
                                    <p className="font-medium">{reviewDialog.leave_type}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Duration</p>
                                    <p className="font-medium">
                                        {new Date(reviewDialog.date_from).toLocaleDateString()} - {new Date(reviewDialog.date_to).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-sm text-slate-600">Reason</p>
                                    <p className="font-medium mt-1">{reviewDialog.reason}</p>
                                </div>
                            </div>

                            <div>
                                <Label>Admin Notes</Label>
                                <Textarea
                                    value={adminNotes}
                                    onChange={(e) => setAdminNotes(e.target.value)}
                                    placeholder="Add notes about your decision..."
                                    rows={3}
                                />
                            </div>

                            {reviewDialog.status === 'pending' ? (
                                <div className="flex gap-3 pt-4 border-t">
                                    <Button
                                        onClick={() => handleReview('approved')}
                                        className="bg-green-600 hover:bg-green-700"
                                        disabled={reviewRequestMutation.isPending}
                                    >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Approve
                                    </Button>
                                    <Button
                                        onClick={() => handleReview('rejected')}
                                        variant="destructive"
                                        disabled={reviewRequestMutation.isPending}
                                    >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Reject
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => setReviewDialog(null)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <div className="pt-4 border-t">
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-slate-600">Status:</span>
                                        {getStatusBadge(reviewDialog.status)}
                                        <span className="text-slate-600">by {reviewDialog.approved_by}</span>
                                        <span className="text-slate-600">
                                            on {new Date(reviewDialog.reviewed_date).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}