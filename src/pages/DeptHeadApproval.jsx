import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, AlertCircle, Lock, Clock, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function DeptHeadApproval() {
    const [token, setToken] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [linkData, setLinkData] = useState(null);
    const [approvedMinutes, setApprovedMinutes] = useState({});
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
            const response = await base44.functions.invoke('verifyApprovalLink', { token });
            if (!response.data.success) {
                throw new Error(response.data.error);
            }
            return response.data.link_data;
        },
        enabled: !!token && !isVerified,
        retry: false
    });

    const { data: verifiedData, isLoading: dataLoading } = useQuery({
        queryKey: ['verifiedData', token],
        queryFn: async () => {
            const response = await base44.functions.invoke('verifyApprovalLink', { 
                token,
                verification_code: verificationCode 
            });
            if (!response.data.success) {
                throw new Error(response.data.error);
            }
            return response.data;
        },
        enabled: isVerified && !!token,
        retry: false
    });

    const analysisResults = verifiedData?.analysis_results || [];
    const employees = verifiedData?.employees || [];
    const reportRun = verifiedData?.report_run;

    const verifyMutation = useMutation({
        mutationFn: async () => {
            const response = await base44.functions.invoke('verifyApprovalLink', { 
                token,
                verification_code: verificationCode 
            });
            
            if (!response.data.success) {
                throw new Error(response.data.error || 'Verification failed');
            }
            
            return response.data.link_data;
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

    const approveAllMutation = useMutation({
        mutationFn: async () => {
            const response = await base44.functions.invoke('approveExceptions', {
                token,
                approved_minutes: approvedMinutes
            });
            
            if (!response.data.success) {
                throw new Error(response.data.error || 'Approval failed');
            }
        },
        onSuccess: () => {
            toast.success('All approvals submitted successfully');
            setTimeout(() => {
                window.location.href = 'about:blank';
            }, 2000);
        },
        onError: (error) => {
            toast.error('Failed to submit approvals: ' + error.message);
        }
    });

    const getEmployeeName = (attendanceId) => {
        const employee = employees.find(e => 
            e.attendance_id === attendanceId && 
            e.company === linkData?.company
        );
        return employee?.name || attendanceId;
    };

    const getEmployeeQuarterlyMinutes = (attendanceId) => {
        const employee = employees.find(e => 
            e.attendance_id === attendanceId && 
            e.company === linkData?.company
        );
        return {
            total: employee?.approved_other_minutes_limit || 120,
            used: 0 // TODO: Fetch from EmployeeQuarterlyMinutes
        };
    };

    const handleApprovedMinutesChange = (attendanceId, value) => {
        setApprovedMinutes(prev => ({
            ...prev,
            [attendanceId]: parseInt(value) || 0
        }));
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

    // Handle link errors
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
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <CardTitle className="text-lg sm:text-xl">Department Head Approval</CardTitle>
                                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                                    Department: <strong>{linkData?.department}</strong>
                                </p>
                                {reportRun && (
                                    <p className="text-xs text-slate-500 mt-1">
                                        Period: {new Date(reportRun.date_from).toLocaleDateString()} - {new Date(reportRun.date_to).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                            <Badge className="bg-amber-100 text-amber-800 w-fit">
                                <Clock className="w-3 h-3 mr-1" />
                                {analysisResults.length} Employees
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {dataLoading ? (
                            <div className="text-center py-12 text-slate-500">Loading employee data...</div>
                        ) : analysisResults.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                                <p className="text-slate-600">No employees found for approval</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <p className="text-sm text-blue-800">
                                        <strong>Instructions:</strong> Review late minutes for each employee. Enter approved minutes (from quarterly allowance) for employees with late minutes exceeding 15 grace minutes. Employees who have exhausted their quarterly limit cannot receive additional approvals.
                                    </p>
                                </div>

                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>ID</TableHead>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Late Minutes</TableHead>
                                                <TableHead>Grace</TableHead>
                                                <TableHead>Deductible</TableHead>
                                                <TableHead>Quarterly Allowance</TableHead>
                                                <TableHead>Approve Minutes</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {analysisResults.map((result) => {
                                                const employee = employees.find(e => e.attendance_id === result.attendance_id);
                                                const lateMinutes = result.late_minutes || 0;
                                                const earlyMinutes = result.early_checkout_minutes || 0;
                                                const totalMinutes = lateMinutes + earlyMinutes;
                                                const grace = result.grace_minutes || 15;
                                                const exceedsGrace = totalMinutes > grace;
                                                const quarterlyLimit = employee?.approved_other_minutes_limit || 120;
                                                const quarterlyUsed = 0; // TODO: Fetch from EmployeeQuarterlyMinutes
                                                const quarterlyRemaining = quarterlyLimit - quarterlyUsed;
                                                const canApprove = exceedsGrace && quarterlyRemaining > 0;
                                                
                                                return (
                                                    <TableRow key={result.id} className={exceedsGrace ? 'bg-amber-50' : ''}>
                                                        <TableCell className="font-medium">{result.attendance_id}</TableCell>
                                                        <TableCell>{getEmployeeName(result.attendance_id)}</TableCell>
                                                        <TableCell>
                                                            <span className={totalMinutes > 0 ? 'text-orange-600 font-semibold' : ''}>
                                                                {totalMinutes} min
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>{grace} min</TableCell>
                                                        <TableCell>
                                                            <span className={`font-bold ${totalMinutes > grace ? 'text-red-600' : 'text-green-600'}`}>
                                                                {Math.max(0, totalMinutes - grace)} min
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="text-sm">
                                                                <div className="font-medium">
                                                                    {quarterlyRemaining} / {quarterlyLimit}
                                                                </div>
                                                                <div className="text-xs text-slate-500">
                                                                    {quarterlyUsed} used
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {canApprove ? (
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    max={quarterlyRemaining}
                                                                    value={approvedMinutes[result.attendance_id] || 0}
                                                                    onChange={(e) => handleApprovedMinutesChange(result.attendance_id, e.target.value)}
                                                                    className="w-24"
                                                                    placeholder="0"
                                                                />
                                                            ) : quarterlyRemaining === 0 ? (
                                                                <Badge variant="destructive" className="text-xs">
                                                                    Limit Exceeded
                                                                </Badge>
                                                            ) : (
                                                                <span className="text-sm text-slate-400">—</span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t">
                                    <Button
                                        onClick={() => approveAllMutation.mutate()}
                                        disabled={approveAllMutation.isPending}
                                        className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {approveAllMutation.isPending ? 'Submitting...' : 'Submit All Approvals'}
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