import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function HRManagerApproval() {
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list(),
        enabled: !!currentUser
    });

    const { data: exceptions = [], isLoading } = useQuery({
        queryKey: ['hrPendingExceptions'],
        queryFn: async () => {
            const all = await base44.entities.Exception.list('-created_date');
            return all.filter(e => e.approval_status === 'approved_dept_head');
        },
        enabled: !!currentUser
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const approveMutation = useMutation({
        mutationFn: async (exceptionId) => {
            await base44.entities.Exception.update(exceptionId, {
                approval_status: 'approved',
                approved_by_hr: currentUser.email,
                hr_approval_date: new Date().toISOString()
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['hrPendingExceptions']);
            toast.success('Exception approved');
        },
        onError: () => {
            toast.error('Failed to approve exception');
        }
    });

    const getProjectName = (projectId) => {
        const project = projects.find(p => p.id === projectId);
        return project?.name || projectId;
    };

    const getEmployeeName = (attendanceId, company) => {
        if (attendanceId === 'ALL') return 'All Employees';
        const employee = employees.find(e => 
            e.attendance_id === attendanceId && e.company === company
        );
        return employee?.name || attendanceId;
    };

    const userRole = currentUser?.extended_role || currentUser?.role;
    if (!currentUser || userRole !== 'hr_manager') {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-slate-900">Access Denied</h2>
                    <p className="text-slate-600 mt-2">Only HR Managers can access this page</p>
                </div>
            </div>
        );
    }

    const exceptionsByProject = exceptions.reduce((acc, exc) => {
        if (!acc[exc.project_id]) acc[exc.project_id] = [];
        acc[exc.project_id].push(exc);
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'HR Manager Approval' }]} />
            
            <div>
                <h1 className="text-3xl font-bold text-slate-900">HR Manager Final Approval</h1>
                <p className="text-slate-600 mt-2">Review and give final approval to department head approved exceptions</p>
            </div>

            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        Pending Final Approval ({exceptions.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-12 text-slate-500">Loading...</div>
                    ) : exceptions.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                            <p>No exceptions pending final approval</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Object.keys(exceptionsByProject).map(projectId => (
                                <div key={projectId} className="space-y-3">
                                    <h3 className="font-semibold text-slate-900">
                                        {getProjectName(projectId)}
                                    </h3>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Employee</TableHead>
                                                <TableHead>Date Range</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Changes</TableHead>
                                                <TableHead>Approved By</TableHead>
                                                <TableHead>Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {exceptionsByProject[projectId].map((exception) => {
                                                const project = projects.find(p => p.id === exception.project_id);
                                                const deptHead = employees.find(e => e.id === exception.approved_by_dept_head);
                                                
                                                return (
                                                    <TableRow key={exception.id}>
                                                        <TableCell className="font-medium">
                                                            {getEmployeeName(exception.attendance_id, project?.company)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {new Date(exception.date_from).toLocaleDateString('en-GB')} - {new Date(exception.date_to).toLocaleDateString('en-GB')}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline">{exception.type}</Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            {exception.old_late_minutes !== undefined && (
                                                                <div className="text-xs">
                                                                    Late: {exception.old_late_minutes} → {exception.late_minutes || 0} min
                                                                </div>
                                                            )}
                                                            {exception.old_early_checkout_minutes !== undefined && (
                                                                <div className="text-xs">
                                                                    Early: {exception.old_early_checkout_minutes} → {exception.early_checkout_minutes || 0} min
                                                                </div>
                                                            )}
                                                            {exception.old_other_minutes !== undefined && (
                                                                <div className="text-xs">
                                                                    Other: {exception.old_other_minutes || 0} → {exception.other_minutes || 0} min
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="text-sm">
                                                                <p className="font-medium">{deptHead?.name || 'Unknown'}</p>
                                                                <p className="text-xs text-slate-500">
                                                                    {new Date(exception.dept_head_approval_date).toLocaleDateString('en-GB')}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => approveMutation.mutate(exception.id)}
                                                                disabled={approveMutation.isPending}
                                                                className="bg-green-600 hover:bg-green-700"
                                                            >
                                                                <CheckCircle className="w-4 h-4 mr-1" />
                                                                Approve
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}