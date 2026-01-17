import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, AlertCircle, Loader2, Lock, Clock, Eye, Edit } from 'lucide-react';
import { formatInUAE } from '@/components/ui/timezone';
import { toast } from 'sonner';

export default function DeptHeadApproval() {
    const [token, setToken] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [linkData, setLinkData] = useState(null);
    const [approvedMinutes, setApprovedMinutes] = useState({});
    const [selectedEmployeeForBreakdown, setSelectedEmployeeForBreakdown] = useState(null);
    const [showBreakdownDialog, setShowBreakdownDialog] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        document.title = 'Department Head Approval - Attendance System';
        const urlParams = new URLSearchParams(window.location.search);
        const tokenParam = urlParams.get('token');
        if (tokenParam) {
            setToken(tokenParam);
            // Always require fresh verification - no session persistence
        }
    }, []);

    const { data: linkInfo, isLoading: linkLoading } = useQuery({
        queryKey: ['approvalLink', token],
        queryFn: async () => {
            if (!token) return null;
            const links = await base44.entities.ApprovalLink.filter({ link_token: token });
            if (links.length === 0) return null;
            
            // If admin override is enabled, auto-verify
            if (links[0].admin_override_public) {
                setIsVerified(true);
            }
            
            return links[0];
        },
        enabled: !!token
    });

    const { data: project } = useQuery({
        queryKey: ['project', linkInfo?.project_id],
        queryFn: () => base44.entities.Project.filter({ id: linkInfo.project_id }).then(r => r[0]),
        enabled: !!linkInfo?.project_id
    });

    const { data: reportRun } = useQuery({
        queryKey: ['reportRun', linkInfo?.report_run_id],
        queryFn: () => base44.entities.ReportRun.filter({ id: linkInfo.report_run_id }).then(r => r[0]),
        enabled: !!linkInfo?.report_run_id
    });

    const { data: allResults = [] } = useQuery({
        queryKey: ['results', linkInfo?.report_run_id],
        queryFn: () => base44.entities.AnalysisResult.filter({ report_run_id: linkInfo.report_run_id }),
        enabled: isVerified && !!linkInfo?.report_run_id
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', linkInfo?.company],
        queryFn: () => base44.entities.Employee.filter({ company: linkInfo.company }),
        enabled: isVerified && !!linkInfo?.company
    });

    const { data: salaries = [] } = useQuery({
        queryKey: ['salaries', linkInfo?.company],
        queryFn: () => base44.entities.EmployeeSalary.filter({ company: linkInfo.company, active: true }),
        enabled: isVerified && !!linkInfo?.company
    });

    const { data: quarterlyMinutes = [] } = useQuery({
        queryKey: ['quarterlyMinutes', linkInfo?.company, linkInfo?.project_id],
        queryFn: async () => {
            // Fetch both project-based and calendar-based quarterly minutes
            const projectBased = await base44.entities.EmployeeQuarterlyMinutes.filter({ 
                company: linkInfo.company,
                project_id: linkInfo.project_id 
            });
            
            const calendarBased = await base44.entities.EmployeeQuarterlyMinutes.filter({ 
                company: linkInfo.company,
                allocation_type: 'calendar_quarter',
                year: 2025,
                quarter: 4
            });
            
            // Merge both, prioritizing project-based if exists
            return [...projectBased, ...calendarBased];
        },
        enabled: isVerified && !!linkInfo?.company
    });

    // Use pre-cached daily breakdown data from ApprovalLink instead of fetching real-time data
    const [dailyBreakdownData, setDailyBreakdownData] = React.useState({});

    React.useEffect(() => {
        if (linkInfo?.daily_breakdown_json) {
            try {
                setDailyBreakdownData(JSON.parse(linkInfo.daily_breakdown_json));
            } catch (err) {
                console.error('Failed to parse daily breakdown data:', err);
            }
        }
    }, [linkInfo?.daily_breakdown_json]);

    const verifyMutation = useMutation({
        mutationFn: async (code) => {
            const response = await base44.functions.invoke('verifyApprovalLink', {
                token,
                verification_code: code
            });
            return response.data;
        },
        onSuccess: (data) => {
            if (data.valid) {
                setIsVerified(true);
                setLinkData(data);
                // No sessionStorage - always require fresh verification
                toast.success('Verification successful');
            } else {
                toast.error(data.message || 'Invalid verification code');
            }
        },
        onError: (error) => {
            toast.error('Verification failed: ' + error.message);
        }
    });

    const approveMutation = useMutation({
        mutationFn: async () => {
            // Collect all result IDs with their approved minutes
            const resultUpdates = Object.entries(approvedMinutes)
                .filter(([attendance_id, minutes]) => {
                    const result = allResults.find(r => String(r.attendance_id) === String(attendance_id));
                    return result && Number(minutes) >= 0;
                })
                .map(([attendance_id, minutes]) => {
                    const result = allResults.find(r => String(r.attendance_id) === String(attendance_id));
                    return {
                        id: result.id,
                        attendance_id: attendance_id,
                        approved_minutes: Number(minutes)
                    };
                });

            // Update ALL AnalysisResult records first
            const analysisPromises = resultUpdates.map(update => 
                base44.entities.AnalysisResult.update(update.id, {
                    approved_minutes: update.approved_minutes
                })
            );
            await Promise.all(analysisPromises);

            // Then update quarterly minutes for those with approved minutes > 0
            const quarterlyPromises = resultUpdates
                .filter(update => update.approved_minutes > 0)
                .map(update => {
                    const employee = employees.find(e => String(e.attendance_id) === String(update.attendance_id));
                    if (!employee) return null;

                    const quarterlyRecord = quarterlyMinutes.find(q => 
                        (String(q.employee_id) === String(employee.hrms_id) || String(q.employee_id) === String(employee.id)) && 
                        (q.project_id === linkInfo.project_id || (q.allocation_type === 'calendar_quarter' && Number(q.year) === 2025 && Number(q.quarter) === 4))
                    );

                    if (!quarterlyRecord) return null;

                    const newUsedMinutes = (quarterlyRecord.used_minutes || 0) + update.approved_minutes;
                    const newRemainingMinutes = Math.max(0, quarterlyRecord.total_minutes - newUsedMinutes);
                    
                    return base44.entities.EmployeeQuarterlyMinutes.update(quarterlyRecord.id, {
                        used_minutes: newUsedMinutes,
                        remaining_minutes: newRemainingMinutes
                    });
                })
                .filter(Boolean);

            await Promise.all(quarterlyPromises);

            // Mark approval link as used and approved
            await base44.entities.ApprovalLink.update(linkInfo.id, {
                used: true,
                used_at: new Date().toISOString(),
                approved: true
            });
        },
        onSuccess: async () => {
            // Invalidate all related queries
            await queryClient.invalidateQueries({ queryKey: ['approvalLink', token] });
            await queryClient.invalidateQueries({ queryKey: ['results'] });
            await queryClient.invalidateQueries({ queryKey: ['quarterlyMinutes'] });
            await queryClient.invalidateQueries({ queryKey: ['reportRun'] });
            
            // Force refetch to get latest data
            await queryClient.refetchQueries({ queryKey: ['approvalLink', token] });
            await queryClient.refetchQueries({ queryKey: ['results'] });
            
            toast.success('Approval submitted successfully - Minutes updated in all reports');
        },
        onError: (error) => {
            toast.error('Approval failed: ' + error.message);
        }
    });

    const handleVerify = (e) => {
        e.preventDefault();
        if (!verificationCode || verificationCode.length !== 6) {
            toast.error('Please enter a valid 6-digit verification code');
            return;
        }
        verifyMutation.mutate(verificationCode);
    };

    const handleApprovedMinutesChange = (attendance_id, value) => {
        const minutes = parseInt(value) || 0;
        const employee = employees.find(e => Number(e.attendance_id) === Number(attendance_id));
        if (!employee) return;

        // Use same logic as display to find quarterly record
        const quarterlyRecord = quarterlyMinutes.find(q => 
            (String(q.employee_id) === String(employee.hrms_id) || String(q.employee_id) === String(employee.id)) && 
            (q.project_id === linkInfo.project_id || (q.allocation_type === 'calendar_quarter' && Number(q.year) === 2025 && Number(q.quarter) === 4))
        );
        const remainingMinutes = quarterlyRecord?.remaining_minutes || 0;

        if (minutes > remainingMinutes) {
            toast.error(`Cannot exceed remaining quarterly minutes (${remainingMinutes} min)`);
            return;
        }

        setApprovedMinutes(prev => ({
            ...prev,
            [attendance_id]: minutes
        }));
    };

    const handleSubmitAll = () => {
        if (Object.keys(approvedMinutes).length === 0) {
            if (!window.confirm('No approved minutes entered. Submit as verified with no changes?')) {
                return;
            }
        }
        approveMutation.mutate();
    };

    // Calculate approval window status
    const getApprovalWindowStatus = () => {
        if (!linkInfo?.created_date) return { canApprove: false, windowStatus: 'unknown' };
        
        const createdAt = new Date(linkInfo.created_date);
        const now = new Date();
        
        // 24-hour approval window
        const approvalDeadline = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
        
        if (now < approvalDeadline) {
            return { canApprove: true, windowStatus: 'approval', deadline: approvalDeadline };
        }
        
        // 7-day read-only window
        const readonlyDeadline = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (now < readonlyDeadline) {
            return { canApprove: false, windowStatus: 'readonly', deadline: readonlyDeadline };
        }
        
        return { canApprove: false, windowStatus: 'expired', deadline: readonlyDeadline };
    };

    const windowStatus = getApprovalWindowStatus();

    // Filter and prepare results for this department, excluding department head's own record
    const departmentResults = allResults
        .map(result => {
            const employee = employees.find(e => Number(e.attendance_id) === Number(result.attendance_id));
            if (!employee || employee.department !== linkInfo?.department) return null;
            
            // Exclude department head's own record - they should not approve their own minutes
            if (String(employee.id) === String(linkInfo?.department_head_id)) return null;

            const salary = salaries.find(s => Number(s.attendance_id) === Number(result.attendance_id));
            // Find quarterly record: first try project-based, then calendar-based
            const quarterlyRecord = quarterlyMinutes.find(q => 
                (String(q.employee_id) === String(employee.hrms_id) || String(q.employee_id) === String(employee.id)) && 
                (q.project_id === linkInfo.project_id || (q.allocation_type === 'calendar_quarter' && Number(q.year) === 2025 && Number(q.quarter) === 4))
            );

            const totalDeductibleMinutes = (result.late_minutes || 0) + 
                                          (result.early_checkout_minutes || 0) + 
                                          (result.other_minutes || 0);
            const finalDeductibleMinutes = Math.max(0, totalDeductibleMinutes - (result.grace_minutes || 0) - (result.approved_minutes || 0));

            return {
                ...result,
                employee,
                salary,
                quarterlyRecord,
                totalDeductibleMinutes,
                finalDeductibleMinutes
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            // Sort by most problematic first
            const scoreA = (a.full_absence_count * 1000) + a.finalDeductibleMinutes;
            const scoreB = (b.full_absence_count * 1000) + b.finalDeductibleMinutes;
            return scoreB - scoreA;
        });

    if (!token) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardContent className="p-6">
                        <p className="text-slate-600 text-center">No approval link provided</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (linkLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (!linkInfo) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-slate-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-md border-0 shadow-2xl">
                    <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white rounded-t-lg">
                        <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="w-6 h-6" />
                            Invalid Approval Link
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <AlertCircle className="w-8 h-8 text-red-600" />
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-slate-900 mb-2">Link Not Found</p>
                                <p className="text-slate-600">This approval link is invalid, has expired, or has been deleted by an administrator.</p>
                            </div>
                            <div className="pt-4">
                                <p className="text-sm text-slate-500">Please contact your HR department if you believe this is an error.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (linkInfo.deleted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-slate-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-md border-0 shadow-2xl">
                    <CardHeader className="bg-gradient-to-r from-red-600 to-red-700 text-white rounded-t-lg">
                        <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="w-6 h-6" />
                            Link Deleted
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <AlertCircle className="w-8 h-8 text-red-600" />
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-slate-900 mb-2">Link No Longer Valid</p>
                                <p className="text-slate-600">This approval link has been deleted by an administrator and is no longer accessible.</p>
                            </div>
                            {linkInfo.deleted_at && (
                                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                                    Deleted on: {formatInUAE(linkInfo.deleted_at, 'PPpp')}
                                </div>
                            )}
                            <div className="pt-4">
                                <p className="text-sm text-slate-500">Please contact your HR department for a new approval link.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (linkInfo.used && windowStatus.windowStatus === 'readonly') {
        // Link was used, now in read-only mode
        return (
            <div className="min-h-screen bg-slate-50 p-6">
                <div className="max-w-7xl mx-auto space-y-6">
                    <Card className="border-0 shadow-md border-l-4 border-l-blue-600">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Lock className="w-5 h-5 text-blue-600" />
                                        Read-Only Access
                                    </CardTitle>
                                    <p className="text-sm text-slate-600 mt-1">
                                        Department: <span className="font-medium">{linkInfo.department}</span>
                                    </p>
                                    <p className="text-xs text-blue-600 mt-2">
                                        This link is now in read-only mode. You can view the report until {formatInUAE(windowStatus.deadline, 'PPpp')}
                                    </p>
                                </div>
                                <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded">Read-Only</span>
                            </div>
                        </CardHeader>
                    </Card>
                    
                    {/* Show same table but disabled */}
                    <Card className="border-0 shadow-md">
                        <CardHeader>
                            <CardTitle>Attendance Report (Approved)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Att ID</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead className="text-center">Working Days</TableHead>
                                            <TableHead className="text-center">Late (min)</TableHead>
                                            <TableHead className="text-center">Early (min)</TableHead>
                                            <TableHead className="text-center">Grace</TableHead>
                                            <TableHead className="text-center">Approved Minutes</TableHead>
                                            <TableHead className="text-center">Final Deductible</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {departmentResults.map((result) => (
                                            <TableRow key={result.attendance_id}>
                                                <TableCell className="font-medium">{result.attendance_id}</TableCell>
                                                <TableCell>{result.employee.name}</TableCell>
                                                <TableCell className="text-center">{result.working_days}</TableCell>
                                                <TableCell className="text-center">{result.late_minutes || 0}</TableCell>
                                                <TableCell className="text-center">{result.early_checkout_minutes || 0}</TableCell>
                                                <TableCell className="text-center">{result.grace_minutes || 0}</TableCell>
                                                <TableCell className="text-center font-medium text-blue-600">{result.approved_minutes || 0}</TableCell>
                                                <TableCell className="text-center">
                                                    <span className={result.finalDeductibleMinutes > 0 ? 'font-bold text-red-600' : 'text-green-600'}>
                                                        {result.finalDeductibleMinutes}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setSelectedEmployeeForBreakdown(result);
                                                            setShowBreakdownDialog(true);
                                                        }}
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    if (linkInfo.used && windowStatus.windowStatus === 'expired') {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-md border-red-200 bg-red-50">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="w-6 h-6 text-red-600 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-900">Access Expired</p>
                                <p className="text-sm text-red-700 mt-1">
                                    The read-only access for this approval link expired on {formatInUAE(windowStatus.deadline, 'PPpp')}.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const expiryDate = new Date(linkInfo.expires_at);
    if (expiryDate < new Date()) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-amber-50 to-slate-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-md border-0 shadow-2xl">
                    <CardHeader className="bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded-t-lg">
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-6 h-6" />
                            Link Expired
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
                                <Clock className="w-8 h-8 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-slate-900 mb-2">Link Has Expired</p>
                                <p className="text-slate-600">This approval link is no longer valid as it has passed its expiration date.</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
                                Expired on: {formatInUAE(expiryDate, 'PPpp')}
                            </div>
                            <div className="pt-4">
                                <p className="text-sm text-slate-500">Please request a new approval link from your HR department.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isVerified && !linkInfo?.admin_override_public) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Department Head Approval</CardTitle>
                        <p className="text-sm text-slate-600 mt-2">Department: {linkInfo.department}</p>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleVerify} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Verification Code
                                </label>
                                <Input
                                    type="text"
                                    placeholder="Enter 6-digit code"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    maxLength={6}
                                    className="text-center text-2xl tracking-widest"
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                    Enter the verification code sent to you
                                </p>
                            </div>
                            <Button
                                type="submit"
                                className="w-full bg-indigo-600 hover:bg-indigo-700"
                                disabled={verifyMutation.isPending || verificationCode.length !== 6}
                            >
                                {verifyMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    'Verify & Continue'
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {windowStatus.windowStatus === 'approval' && (
                    <Card className="border-0 shadow-md border-l-4 border-l-green-600 bg-green-50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-green-900">✓ Approval Window Active</p>
                                    <p className="text-sm text-green-700 mt-1">
                                        You can approve exceptions until {formatInUAE(windowStatus.deadline, 'PPpp')}
                                    </p>
                                </div>
                                <Clock className="w-5 h-5 text-green-600" />
                            </div>
                        </CardContent>
                    </Card>
                )}
                
                <Card className="border-0 shadow-md">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Department Head Approval</CardTitle>
                                <p className="text-sm text-slate-600 mt-1">
                                    Department: <span className="font-medium">{linkInfo.department}</span>
                                </p>
                                {reportRun && (
                                    <p className="text-sm text-slate-600">
                                        Report: {reportRun.report_name} ({new Date(reportRun.date_from).toLocaleDateString()} - {new Date(reportRun.date_to).toLocaleDateString()})
                                    </p>
                                )}
                            </div>
                            {linkInfo.used && (
                                <div className="flex items-center gap-2 text-green-600">
                                    <Lock className="w-5 h-5" />
                                    <span className="text-sm font-medium">Approved</span>
                                </div>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Att ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead className="text-center">Working Days</TableHead>
                                        <TableHead className="text-center">Present</TableHead>
                                        <TableHead className="text-center">LOP</TableHead>
                                        <TableHead className="text-center">Half Day</TableHead>
                                        <TableHead className="text-center">Late (min)</TableHead>
                                        <TableHead className="text-center">Early (min)</TableHead>
                                        <TableHead className="text-center">Other (min)</TableHead>
                                        <TableHead className="text-center">Total Deductible</TableHead>
                                        <TableHead className="text-center">Grace</TableHead>
                                        <TableHead className="text-center">Quarterly Remaining</TableHead>
                                        <TableHead className="text-center">Approve Minutes</TableHead>
                                        <TableHead className="text-center">Final Deductible</TableHead>
                                        <TableHead className="text-right">Daily Breakdown</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {departmentResults.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={15} className="text-center py-8 text-slate-500">
                                                No employees found for this department
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        departmentResults.map((result) => {
                                            const currentApproved = approvedMinutes[result.attendance_id] || result.approved_minutes || 0;
                                            const remainingQuarterly = result.quarterlyRecord?.remaining_minutes || 0;
                                            const finalDeductible = Math.max(0, result.totalDeductibleMinutes - (result.grace_minutes || 0) - currentApproved);

                                            return (
                                                <TableRow key={result.attendance_id}>
                                                    <TableCell className="font-medium">{result.attendance_id}</TableCell>
                                                    <TableCell>{result.employee.name}</TableCell>
                                                    <TableCell className="text-center">{result.working_days}</TableCell>
                                                    <TableCell className="text-center">{result.present_days}</TableCell>
                                                    <TableCell className="text-center">
                                                        <span className={result.full_absence_count > 0 ? 'text-red-600 font-medium' : ''}>
                                                            {result.full_absence_count}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">{result.half_absence_count}</TableCell>
                                                    <TableCell className="text-center">{result.late_minutes || 0}</TableCell>
                                                    <TableCell className="text-center">{result.early_checkout_minutes || 0}</TableCell>
                                                    <TableCell className="text-center">{result.other_minutes || 0}</TableCell>
                                                    <TableCell className="text-center">
                                                        <span className={result.totalDeductibleMinutes > 0 ? 'font-medium text-amber-600' : ''}>
                                                            {result.totalDeductibleMinutes}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">{result.grace_minutes || 0}</TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="text-blue-600 font-medium">{remainingQuarterly}</span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max={remainingQuarterly}
                                                            value={currentApproved}
                                                            onChange={(e) => handleApprovedMinutesChange(result.attendance_id, e.target.value)}
                                                            className="w-20 text-center"
                                                            disabled={linkInfo.used || windowStatus.windowStatus !== 'approval'}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className={finalDeductible > 0 ? 'font-bold text-red-600' : 'text-green-600'}>
                                                            {finalDeductible}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setSelectedEmployeeForBreakdown(result);
                                                                setShowBreakdownDialog(true);
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
                        </div>

                        {windowStatus.windowStatus === 'approval' && !linkInfo.used && departmentResults.length > 0 && (
                            <div className="mt-6 flex justify-end">
                                <Button
                                    onClick={handleSubmitAll}
                                    disabled={approveMutation.isPending}
                                    className="bg-green-600 hover:bg-green-700"
                                    size="lg"
                                >
                                    {approveMutation.isPending ? (
                                        <>
                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-5 h-5 mr-2" />
                                            Approve All & Submit
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Daily Breakdown Dialog */}
                <Dialog open={showBreakdownDialog} onOpenChange={setShowBreakdownDialog}>
                    <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                Daily Breakdown: {selectedEmployeeForBreakdown?.attendance_id} - {selectedEmployeeForBreakdown?.employee?.name}
                            </DialogTitle>
                        </DialogHeader>
                        {selectedEmployeeForBreakdown && (
                            <div className="space-y-4">
                                {/* Daily breakdown table */}
                                {dailyBreakdownData[selectedEmployeeForBreakdown.attendance_id]?.daily_details && (
                                    <div className="border rounded-lg overflow-hidden">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Date</TableHead>
                                                    <TableHead>Punches</TableHead>
                                                    <TableHead>Punch Times</TableHead>
                                                    <TableHead>Shift</TableHead>
                                                    <TableHead>Exception</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Late Min</TableHead>
                                                    <TableHead className="text-right">Early Min</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {Object.entries(dailyBreakdownData[selectedEmployeeForBreakdown.attendance_id].daily_details).map(([date, details]) => (
                                                    <TableRow key={date}>
                                                        <TableCell className="font-medium">{new Date(date).toLocaleDateString()}</TableCell>
                                                        <TableCell className="text-center">{details.punch_count || 0}</TableCell>
                                                        <TableCell className="text-xs">
                                                            {details.punches && details.punches.length > 0 ? (
                                                                <div className="space-y-0.5">
                                                                    {details.punches.map((p, i) => (
                                                                        <div key={i}>{p}</div>
                                                                    ))}
                                                                </div>
                                                            ) : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-xs">
                                                            {details.shift ? 
                                                                `${details.shift.am_start} - ${details.shift.am_end} / ${details.shift.pm_start} - ${details.shift.pm_end}` 
                                                                : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-xs">{details.exception || '-'}</TableCell>
                                                        <TableCell>
                                                            <span className={`
                                                                px-2 py-1 rounded text-xs font-medium
                                                                ${details.status === 'Present' ? 'bg-green-100 text-green-700' : ''}
                                                                ${details.status === 'Absent' ? 'bg-red-100 text-red-700' : ''}
                                                                ${details.status?.includes('Half') ? 'bg-amber-100 text-amber-700' : ''}
                                                                ${details.status === 'Off' ? 'bg-slate-100 text-slate-700' : ''}
                                                            `}>
                                                                {details.status}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <span className={details.late_minutes > 0 ? 'text-orange-600 font-medium' : 'text-slate-400'}>
                                                                {details.late_minutes > 0 ? `${details.late_minutes} min` : '-'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <span className={details.early_minutes > 0 ? 'text-blue-600 font-medium' : 'text-slate-400'}>
                                                                {details.early_minutes > 0 ? `${details.early_minutes} min` : '-'}
                                                            </span>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}