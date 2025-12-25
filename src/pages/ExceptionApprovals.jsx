import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function ExceptionApprovals() {
    const [selectedException, setSelectedException] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: exceptions = [], isLoading } = useQuery({
        queryKey: ['pendingExceptions'],
        queryFn: async () => {
            const all = await base44.entities.Exception.list('-created_date');
            return all.filter(e => e.approval_status === 'pending');
        },
        refetchInterval: 30000
    });

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list()
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const approveMutation = useMutation({
        mutationFn: async (exceptionId) => {
            await base44.entities.Exception.update(exceptionId, {
                approval_status: 'approved',
                approved_by: currentUser.email,
                approval_date: new Date().toISOString()
            });
            await base44.functions.invoke('logAudit', {
                action: 'UPDATE',
                entity_type: 'Exception',
                entity_id: exceptionId,
                entity_name: 'Exception Approved',
                details: 'Exception approved by ' + currentUser.full_name,
                success: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['pendingExceptions']);
            toast.success('Exception approved');
        },
        onError: () => {
            toast.error('Failed to approve exception');
        }
    });

    const rejectMutation = useMutation({
        mutationFn: async ({ exceptionId, reason }) => {
            await base44.entities.Exception.update(exceptionId, {
                approval_status: 'rejected',
                approved_by: currentUser.email,
                approval_date: new Date().toISOString(),
                rejection_reason: reason
            });
            await base44.functions.invoke('logAudit', {
                action: 'UPDATE',
                entity_type: 'Exception',
                entity_id: exceptionId,
                entity_name: 'Exception Rejected',
                details: 'Exception rejected by ' + currentUser.full_name + ': ' + reason,
                success: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['pendingExceptions']);
            setShowRejectDialog(false);
            setSelectedException(null);
            setRejectionReason('');
            toast.success('Exception rejected');
        },
        onError: () => {
            toast.error('Failed to reject exception');
        }
    });

    const handleApprove = (exception) => {
        if (window.confirm('Approve this exception request?')) {
            approveMutation.mutate(exception.id);
        }
    };

    const handleReject = (exception) => {
        setSelectedException(exception);
        setShowRejectDialog(true);
    };

    const submitRejection = () => {
        if (!rejectionReason.trim()) {
            toast.error('Please provide a reason for rejection');
            return;
        }
        rejectMutation.mutate({ exceptionId: selectedException.id, reason: rejectionReason });
    };

    const getProjectName = (projectId) => {
        const project = projects.find(p => p.id === projectId);
        return project?.name || projectId;
    };

    const getEmployeeName = (attendanceId) => {
        if (attendanceId === 'ALL') return 'All Employees';
        const employee = employees.find(e => e.attendance_id === attendanceId);
        return employee?.name || attendanceId;
    };

    const typeLabels = {
        OFF: 'Day Off',
        PUBLIC_HOLIDAY: 'Public Holiday',
        SHIFT_OVERRIDE: 'Shift Override',
        MANUAL_PRESENT: 'Manual Present',
        MANUAL_ABSENT: 'Manual Absent',
        MANUAL_HALF: 'Manual Half Day',
        MANUAL_EARLY_CHECKOUT: 'Early Checkout',
        SICK_LEAVE: 'Sick Leave',
        WEEKLY_OFF_OVERRIDE: 'Weekly Off Override',
        ALLOWED_MINUTES: 'Allowed Minutes'
    };

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'supervisor')) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-900">Access Denied</h2>
                    <p className="text-slate-600 mt-2">Only admins and supervisors can approve exceptions</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Exception Approvals' }]} />
            
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Exception Approvals</h1>
                <p className="text-slate-600 mt-2">Review and approve exception requests from users</p>
            </div>

            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-600" />
                        Pending Approvals ({exceptions.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-12 text-slate-500">Loading...</div>
                    ) : exceptions.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                            <p>No pending approvals</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {exceptions.map((exception) => (
                                <Card key={exception.id} className="border border-slate-200">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Badge className="bg-amber-100 text-amber-800">
                                                        {typeLabels[exception.type]}
                                                    </Badge>
                                                    <span className="text-sm text-slate-500">
                                                        Created by {exception.created_by}
                                                    </span>
                                                </div>
                                                
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div>
                                                        <span className="text-slate-500">Project:</span>
                                                        <p className="font-medium">{getProjectName(exception.project_id)}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">Employee:</span>
                                                        <p className="font-medium">{getEmployeeName(exception.attendance_id)}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">Date Range:</span>
                                                        <p className="font-medium">
                                                            {new Date(exception.date_from).toLocaleDateString('en-GB')} - {new Date(exception.date_to).toLocaleDateString('en-GB')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500">Created:</span>
                                                        <p className="font-medium">
                                                            {new Date(exception.created_date).toLocaleString('en-GB', {
                                                                day: '2-digit',
                                                                month: 'short',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </p>
                                                    </div>
                                                </div>

                                                {exception.details && (
                                                    <div className="bg-slate-50 rounded p-3 text-sm">
                                                        <span className="text-slate-500">Details:</span>
                                                        <p className="text-slate-900 mt-1">{exception.details}</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleApprove(exception)}
                                                    disabled={approveMutation.isPending}
                                                    className="bg-green-600 hover:bg-green-700"
                                                >
                                                    <CheckCircle className="w-4 h-4 mr-2" />
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleReject(exception)}
                                                    disabled={rejectMutation.isPending}
                                                    className="text-red-600 hover:bg-red-50"
                                                >
                                                    <XCircle className="w-4 h-4 mr-2" />
                                                    Reject
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Exception Request</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                            Please provide a reason for rejecting this exception request:
                        </p>
                        <Textarea
                            placeholder="Enter rejection reason..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            rows={4}
                        />
                        <div className="flex justify-end gap-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowRejectDialog(false);
                                    setRejectionReason('');
                                    setSelectedException(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={submitRejection}
                                disabled={rejectMutation.isPending}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                {rejectMutation.isPending ? 'Rejecting...' : 'Reject Exception'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}