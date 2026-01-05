import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function ShiftVerification() {
    const [verificationCode, setVerificationCode] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [linkData, setLinkData] = useState(null);
    const [comments, setComments] = useState('');
    const queryClient = useQueryClient();

    // Extract token from URL
    const [token, setToken] = useState(null);
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const tokenParam = urlParams.get('token');
        setToken(tokenParam);
    }, []);

    // Fetch link data
    const { data: linkRecord } = useQuery({
        queryKey: ['shiftVerificationLink', token],
        queryFn: async () => {
            if (!token) return null;
            const links = await base44.entities.ShiftVerificationLink.filter({ link_token: token });
            return links.length > 0 ? links[0] : null;
        },
        enabled: !!token
    });

    // Fetch project data
    const { data: project } = useQuery({
        queryKey: ['project', linkRecord?.project_id],
        queryFn: () => base44.entities.Project.filter({ id: linkRecord.project_id }).then(p => p[0]),
        enabled: !!linkRecord && isVerified
    });

    // Fetch shifts for this department
    const { data: allShifts = [] } = useQuery({
        queryKey: ['shifts', linkRecord?.project_id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: linkRecord.project_id }),
        enabled: !!linkRecord && isVerified
    });

    // Fetch employees to filter by department
    const { data: employees = [] } = useQuery({
        queryKey: ['employees', linkRecord?.company],
        queryFn: () => base44.entities.Employee.filter({ company: linkRecord.company }),
        enabled: !!linkRecord && isVerified
    });

    // Filter shifts by department
    const shifts = React.useMemo(() => {
        if (!linkRecord || !isVerified) return [];
        return allShifts.filter(shift => {
            const employee = employees.find(e => e.attendance_id === shift.attendance_id);
            return employee?.department === linkRecord.department;
        });
    }, [allShifts, employees, linkRecord, isVerified]);

    // Verify code mutation
    const verifyCodeMutation = useMutation({
        mutationFn: async (code) => {
            if (!linkRecord) throw new Error('Link not found');
            if (linkRecord.verification_code !== code) {
                throw new Error('Invalid verification code');
            }
            if (linkRecord.used) {
                throw new Error('This link has already been used');
            }
            if (new Date(linkRecord.expires_at) < new Date()) {
                throw new Error('This link has expired');
            }
            return true;
        },
        onSuccess: () => {
            setIsVerified(true);
            setLinkData(linkRecord);
            toast.success('Verification successful');
        },
        onError: (error) => {
            toast.error(error.message);
        }
    });

    // Approve shifts mutation
    const approveMutation = useMutation({
        mutationFn: async (approved) => {
            await base44.entities.ShiftVerificationLink.update(linkRecord.id, {
                used: true,
                used_at: new Date().toISOString(),
                approved,
                comments
            });
        },
        onSuccess: (_, approved) => {
            toast.success(approved ? 'Shifts approved successfully' : 'Shifts rejected');
            queryClient.invalidateQueries(['shiftVerificationLink', token]);
        },
        onError: (error) => {
            toast.error('Failed to submit: ' + error.message);
        }
    });

    const handleVerify = (e) => {
        e.preventDefault();
        verifyCodeMutation.mutate(verificationCode);
    };

    const getEmployeeName = (attendanceId) => {
        const employee = employees.find(e => e.attendance_id === attendanceId);
        return employee?.name || attendanceId;
    };

    const formatTime = (timeStr) => {
        if (!timeStr || timeStr === '—' || timeStr === '-') return '—';
        return timeStr;
    };

    if (!token) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
                <Card className="max-w-md w-full border-0 shadow-xl">
                    <CardContent className="p-8 text-center">
                        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Invalid Link</h2>
                        <p className="text-slate-600">This verification link is invalid or has expired.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!linkRecord) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    if (linkRecord.used) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
                <Card className="max-w-md w-full border-0 shadow-xl">
                    <CardContent className="p-8 text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Already Verified</h2>
                        <p className="text-slate-600 mb-4">
                            This verification link has already been used.
                        </p>
                        <div className="bg-slate-50 rounded-lg p-4 text-left">
                            <p className="text-sm text-slate-600 mb-1">Department: <span className="font-medium text-slate-900">{linkRecord.department}</span></p>
                            <p className="text-sm text-slate-600 mb-1">Status: <span className={`font-medium ${linkRecord.approved ? 'text-green-600' : 'text-red-600'}`}>
                                {linkRecord.approved ? 'Approved' : 'Rejected'}
                            </span></p>
                            {linkRecord.comments && (
                                <p className="text-sm text-slate-600 mt-2">Comments: <span className="font-medium text-slate-900">{linkRecord.comments}</span></p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isVerified) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
                <Card className="max-w-md w-full border-0 shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-center">Shift Verification</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                            <p className="text-sm text-indigo-800">
                                <strong>Department:</strong> {linkRecord.department}
                            </p>
                            <p className="text-sm text-indigo-800 mt-1">
                                <strong>Company:</strong> {linkRecord.company}
                            </p>
                        </div>
                        <form onSubmit={handleVerify} className="space-y-4">
                            <div>
                                <Label>Verification Code</Label>
                                <Input
                                    type="text"
                                    placeholder="Enter 6-digit code"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value)}
                                    maxLength={6}
                                    className="text-center text-2xl tracking-widest font-mono"
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={verifyCodeMutation.isPending}>
                                {verifyCodeMutation.isPending ? 'Verifying...' : 'Verify'}
                            </Button>
                        </form>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Clock className="w-4 h-4" />
                            <span>Expires: {new Date(linkRecord.expires_at).toLocaleString()}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <Card className="border-0 shadow-xl">
                    <CardHeader>
                        <CardTitle>Verify Shift Timings</CardTitle>
                        <p className="text-sm text-slate-600 mt-2">
                            Department: <span className="font-medium text-slate-900">{linkRecord.department}</span> • 
                            Company: <span className="font-medium text-slate-900">{linkRecord.company}</span>
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {project && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                <h3 className="font-semibold text-indigo-900 mb-2">{project.name}</h3>
                                <p className="text-sm text-indigo-700">
                                    Period: {new Date(project.date_from).toLocaleDateString()} - {new Date(project.date_to).toLocaleDateString()}
                                </p>
                            </div>
                        )}

                        {shifts.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                                No shifts found for this department.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Attendance ID</TableHead>
                                            <TableHead>Employee Name</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Effective Period</TableHead>
                                            <TableHead>AM Start</TableHead>
                                            <TableHead>AM End</TableHead>
                                            <TableHead>PM Start</TableHead>
                                            <TableHead>PM End</TableHead>
                                            <TableHead>Applicable Days</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {shifts.map((shift) => (
                                            <TableRow key={shift.id}>
                                                <TableCell className="font-medium">{shift.attendance_id}</TableCell>
                                                <TableCell>{getEmployeeName(shift.attendance_id)}</TableCell>
                                                <TableCell>{shift.date ? new Date(shift.date).toLocaleDateString() : '—'}</TableCell>
                                                <TableCell>
                                                    {shift.effective_from && shift.effective_to ? 
                                                        `${new Date(shift.effective_from).toLocaleDateString()} - ${new Date(shift.effective_to).toLocaleDateString()}` : 
                                                        '—'}
                                                </TableCell>
                                                <TableCell>{formatTime(shift.am_start)}</TableCell>
                                                <TableCell>{formatTime(shift.am_end)}</TableCell>
                                                <TableCell>{formatTime(shift.pm_start)}</TableCell>
                                                <TableCell>{formatTime(shift.pm_end)}</TableCell>
                                                <TableCell>
                                                    {shift.applicable_days ? 
                                                        JSON.parse(shift.applicable_days).join(', ') : 
                                                        shift.is_friday_shift ? 'Friday' : 'All days'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <Label>Comments (Optional)</Label>
                                <Textarea
                                    placeholder="Add any comments or feedback..."
                                    value={comments}
                                    onChange={(e) => setComments(e.target.value)}
                                    rows={4}
                                />
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    onClick={() => approveMutation.mutate(true)}
                                    disabled={approveMutation.isPending}
                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Approve Shifts
                                </Button>
                                <Button
                                    onClick={() => approveMutation.mutate(false)}
                                    disabled={approveMutation.isPending}
                                    variant="destructive"
                                    className="flex-1"
                                >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Reject Shifts
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}