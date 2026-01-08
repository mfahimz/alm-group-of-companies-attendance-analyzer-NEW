import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, AlertCircle, Lock, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function DeptHeadApproval() {
    const [token, setToken] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [linkData, setLinkData] = useState(null);
    const queryClient = useQueryClient();

    // Set page title
    React.useEffect(() => {
        document.title = 'Department Head Approval - ALM Attendance';
    }, []);

    // Get token from URL
    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
            setToken(urlToken);
        }
    }, []);

    const { data: approvalLink, isLoading: linkLoading, error: linkError } = useQuery({
        queryKey: ['approvalLink', token],
        queryFn: async () => {
            const links = await base44.asServiceRole.entities.ApprovalLink.filter({ link_token: token });
            if (links.length === 0) throw new Error('LINK_NOT_FOUND');
            
            const link = links[0];
            
            // Check if expired
            const expiresAt = new Date(link.expires_at);
            if (new Date() > expiresAt) {
                throw new Error('LINK_EXPIRED');
            }
            
            // Check if already used
            if (link.used) {
                throw new Error('LINK_USED');
            }
            
            return link;
        },
        enabled: !!token && !isVerified,
        retry: false
    });

    const { data: deptHead } = useQuery({
        queryKey: ['deptHead', linkData?.department_head_id],
        queryFn: async () => {
            const deptHeads = await base44.asServiceRole.entities.DepartmentHead.filter({
                employee_id: linkData.department_head_id,
                active: true
            });
            return deptHeads.find(dh => dh.company === linkData.company);
        },
        enabled: isVerified && !!linkData
    });

    const { data: exceptions = [], isLoading: exceptionsLoading } = useQuery({
        queryKey: ['deptExceptions', linkData?.report_run_id, linkData?.department, deptHead?.id],
        queryFn: async () => {
            const allExceptions = await base44.asServiceRole.entities.Exception.filter({
                report_run_id: linkData.report_run_id,
                approval_status: 'pending_dept_head'
            });
            
            // Get employees
            const employees = await base44.asServiceRole.entities.Employee.filter({ 
                company: linkData.company 
            });
            
            // Filter by managed employees if specified
            let relevantExceptions = allExceptions.filter(exc => {
                const employee = employees.find(e => 
                    e.attendance_id === exc.attendance_id && 
                    e.company === linkData.company
                );
                return employee?.department === linkData.department;
            });

            // Further filter by managed employees if specified in deptHead
            if (deptHead?.managed_employee_ids) {
                const managedIds = deptHead.managed_employee_ids.split(',').filter(Boolean);
                relevantExceptions = relevantExceptions.filter(exc => {
                    const employee = employees.find(e => e.attendance_id === exc.attendance_id);
                    return employee && managedIds.includes(employee.id);
                });
            }

            return relevantExceptions;
        },
        enabled: isVerified && !!linkData && !!deptHead
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', linkData?.company],
        queryFn: () => base44.asServiceRole.entities.Employee.filter({ company: linkData.company }),
        enabled: isVerified && !!linkData
    });

    const verifyMutation = useMutation({
        mutationFn: async () => {
            if (!approvalLink) throw new Error('No link data');

            // Verify code
            if (verificationCode !== approvalLink.verification_code) {
                throw new Error('Invalid verification code');
            }

            return approvalLink;
        },
        onSuccess: (data) => {
            setIsVerified(true);
            setLinkData(data);
            toast.success('Verification successful');
        },
        onError: (error) => {
            toast.error(error.message);
        }
    });

    const approveMutation = useMutation({
        mutationFn: async (exceptionId) => {
            await base44.asServiceRole.entities.Exception.update(exceptionId, {
                approval_status: 'approved_dept_head',
                approved_by_dept_head: linkData.department_head_id,
                dept_head_approval_date: new Date().toISOString()
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['deptExceptions']);
            toast.success('Exception approved');
        },
        onError: () => {
            toast.error('Failed to approve exception');
        }
    });

    const approveAllMutation = useMutation({
        mutationFn: async () => {
            for (const exception of exceptions) {
                await base44.asServiceRole.entities.Exception.update(exception.id, {
                    approval_status: 'approved_dept_head',
                    approved_by_dept_head: linkData.department_head_id,
                    dept_head_approval_date: new Date().toISOString()
                });
            }

            // Mark link as used
            await base44.asServiceRole.entities.ApprovalLink.update(approvalLink.id, {
                used: true,
                used_at: new Date().toISOString(),
                approved: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['deptExceptions']);
            toast.success('All exceptions approved successfully');
            setTimeout(() => {
                window.location.href = 'about:blank';
            }, 2000);
        },
        onError: () => {
            toast.error('Failed to approve all exceptions');
        }
    });

    const getEmployeeName = (attendanceId) => {
        const employee = employees.find(e => 
            e.attendance_id === attendanceId && 
            e.company === linkData?.company
        );
        return employee?.name || attendanceId;
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5" />
                            Department Head Approval
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-600 text-center">
                            No approval link provided. Please use the link sent to you.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (linkLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    // Handle link errors with custom branding
    if (linkError) {
        const errorType = linkError.message;
        let errorTitle = 'Link Error';
        let errorMessage = 'This approval link is invalid or has expired.';
        
        if (errorType === 'LINK_EXPIRED') {
            errorTitle = 'Link Expired';
            errorMessage = 'This approval link has expired. Links are valid for 24 hours after generation. Please contact your administrator to generate a new approval link.';
        } else if (errorType === 'LINK_USED') {
            errorTitle = 'Link Already Used';
            errorMessage = 'This approval link has already been used. Each link can only be used once for security reasons.';
        } else if (errorType === 'LINK_NOT_FOUND') {
            errorTitle = 'Invalid Link';
            errorMessage = 'This approval link is invalid. Please check the link and try again, or contact your administrator.';
        }
        
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
                <Card className="w-full max-w-md border-red-200 bg-white shadow-xl">
                    <CardHeader className="text-center pb-6">
                        <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                            <XCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <CardTitle className="text-2xl font-bold text-slate-900">{errorTitle}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <p className="text-slate-600 leading-relaxed">
                            {errorMessage}
                        </p>
                        <div className="pt-4 border-t">
                            <p className="text-sm text-slate-500">
                                ALM Attendance Management System
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isVerified) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="w-5 h-5" />
                            Verify Your Identity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-slate-600">
                            Please enter the 6-digit verification code provided to you.
                        </p>
                        <div>
                            <Label>Verification Code</Label>
                            <Input
                                type="text"
                                placeholder="Enter 6-digit code"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value)}
                                maxLength={6}
                                className="text-center text-xl font-mono"
                            />
                        </div>
                        <Button
                            onClick={() => verifyMutation.mutate()}
                            disabled={verificationCode.length !== 6 || verifyMutation.isPending}
                            className="w-full bg-indigo-600 hover:bg-indigo-700"
                        >
                            {verifyMutation.isPending ? 'Verifying...' : 'Verify & Continue'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Department Head Approval</CardTitle>
                                <p className="text-sm text-slate-600 mt-1">
                                    Department: <strong>{linkData?.department}</strong>
                                </p>
                            </div>
                            <Badge className="bg-amber-100 text-amber-800">
                                <Clock className="w-3 h-3 mr-1" />
                                {exceptions.length} Pending
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {exceptionsLoading ? (
                            <div className="text-center py-12 text-slate-500">Loading exceptions...</div>
                        ) : exceptions.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                                <p className="text-slate-600">All exceptions have been approved</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Employee</TableHead>
                                            <TableHead>Date Range</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Changes</TableHead>
                                            <TableHead>Details</TableHead>
                                            <TableHead>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {exceptions.map((exception) => (
                                            <TableRow key={exception.id}>
                                                <TableCell className="font-medium">
                                                    {getEmployeeName(exception.attendance_id)}
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
                                                <TableCell className="text-sm text-slate-600">
                                                    {exception.details || '—'}
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
                                        ))}
                                    </TableBody>
                                </Table>

                                <div className="flex justify-end gap-3 pt-4 border-t">
                                    <Button
                                        onClick={() => approveAllMutation.mutate()}
                                        disabled={approveAllMutation.isPending}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        {approveAllMutation.isPending ? 'Approving All...' : 'Approve All & Submit'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}