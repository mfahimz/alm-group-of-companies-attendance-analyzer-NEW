import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Wrench, AlertTriangle, CheckCircle, Key, Timer, Eye, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
}

function ReportViewSessions() {
    const { data: logs = [], isLoading } = useQuery({
        queryKey: ['reportViewSessions'],
        queryFn: () => base44.entities.ActivityLog.list('-created_date', 200),
        staleTime: 2 * 60 * 1000
    });

    const sessions = React.useMemo(() => {
        return logs
            .filter(l => l.user_agent?.includes('REPORT_VIEW'))
            .map(l => {
                const ua = l.user_agent || '';
                const reportIdMatch = ua.match(/report_id:([^\s|]+)/);
                const reportNameMatch = ua.match(/report_name:([^|]+)/);
                const secondsMatch = ua.match(/seconds:(\d+)/);
                return {
                    id: l.id,
                    user_name: l.user_name || l.user_email || '—',
                    user_email: l.user_email || '—',
                    report_name: reportNameMatch ? reportNameMatch[1].trim() : '—',
                    report_id: reportIdMatch ? reportIdMatch[1].trim() : '—',
                    seconds: secondsMatch ? parseInt(secondsMatch[1]) : 0,
                    created_date: l.created_date
                };
            })
            .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    }, [logs]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8 text-slate-400">
                <Timer className="w-4 h-4 animate-spin mr-2" />
                Loading sessions...
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="text-center py-8 text-slate-400">
                <Eye className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No report view sessions recorded yet</p>
                <p className="text-xs mt-1">Sessions are logged when users open and close attendance reports</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
                <Clock className="w-3.5 h-3.5" />
                <span>{sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded</span>
            </div>
            <div className="rounded-lg border overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50">
                            <TableHead className="text-xs font-semibold">User</TableHead>
                            <TableHead className="text-xs font-semibold">Report</TableHead>
                            <TableHead className="text-xs font-semibold">Duration</TableHead>
                            <TableHead className="text-xs font-semibold">When</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sessions.slice(0, 50).map(session => (
                            <TableRow key={session.id} className="hover:bg-slate-50">
                                <TableCell>
                                    <div>
                                        <p className="text-sm font-medium text-slate-800">{session.user_name}</p>
                                        <p className="text-xs text-slate-400">{session.user_email}</p>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <p className="text-sm text-slate-700 max-w-[200px] truncate">{session.report_name}</p>
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={`text-xs font-medium ${
                                            session.seconds >= 300
                                                ? 'border-green-200 text-green-700 bg-green-50'
                                                : session.seconds >= 60
                                                ? 'border-indigo-200 text-indigo-700 bg-indigo-50'
                                                : 'border-slate-200 text-slate-600 bg-slate-50'
                                        }`}
                                    >
                                        <Timer className="w-3 h-3 mr-1" />
                                        {formatDuration(session.seconds)}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <p className="text-xs text-slate-400">
                                        {session.created_date
                                            ? new Date(session.created_date).toLocaleString('en-AE', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit', hour12: true,
                                                timeZone: 'Asia/Dubai'
                                              })
                                            : '—'}
                                    </p>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {sessions.length > 50 && (
                <p className="text-xs text-slate-400 text-center">Showing 50 most recent of {sessions.length} sessions</p>
            )}
        </div>
    );
}

export default function MaintenanceSettingsPage() {
    const queryClient = useQueryClient();
    const [salaryPin, setSalaryPin] = useState('');
    const [showPinEdit, setShowPinEdit] = useState(false);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: maintenanceMode, isLoading } = useQuery({
        queryKey: ['maintenanceMode'],
        queryFn: async () => {
            const settings = await base44.entities.SystemSettings.filter({ 
                setting_key: 'MAINTENANCE_MODE' 
            });
            if (settings.length > 0) {
                return settings[0].setting_value === 'true';
            }
            return false;
        }
    });

    const { data: currentSalaryPin } = useQuery({
        queryKey: ['salaryPin'],
        queryFn: async () => {
            const settings = await base44.entities.SystemSettings.filter({ 
                setting_key: 'SALARY_PAGE_PIN' 
            });
            return settings.length > 0 ? settings[0].setting_value : '';
        }
    });

    const toggleMaintenanceMutation = useMutation({
        mutationFn: async (enabled) => {
            const settings = await base44.entities.SystemSettings.filter({ 
                setting_key: 'MAINTENANCE_MODE' 
            });
            
            if (settings.length > 0) {
                await base44.entities.SystemSettings.update(settings[0].id, {
                    setting_value: enabled.toString()
                });
            } else {
                await base44.entities.SystemSettings.create({
                    setting_key: 'MAINTENANCE_MODE',
                    setting_value: enabled.toString(),
                    description: 'Global maintenance mode for all non-admin users'
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['maintenanceMode']);
            toast.success('Maintenance mode updated successfully');
        },
        onError: (error) => {
            toast.error('Failed to update: ' + error.message);
        }
    });

    const setSalaryPinMutation = useMutation({
        mutationFn: async (pin) => {
            if (!pin || pin.trim() === '') {
                throw new Error('PIN cannot be empty');
            }
            
            const settings = await base44.entities.SystemSettings.filter({ 
                setting_key: 'SALARY_PAGE_PIN' 
            });
            
            if (settings.length > 0) {
                await base44.entities.SystemSettings.update(settings[0].id, {
                    setting_value: pin
                });
            } else {
                await base44.entities.SystemSettings.create({
                    setting_key: 'SALARY_PAGE_PIN',
                    setting_value: pin,
                    description: 'PIN required to access Salary page and Salary tab'
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['salaryPin']);
            setSalaryPin('');
            setShowPinEdit(false);
            toast.success('Salary PIN updated successfully');
        },
        onError: (error) => {
            toast.error('Failed to update PIN: ' + error.message);
        }
    });

    if (currentUser?.role !== 'admin' && currentUser?.extended_role !== 'ceo') {
        return (
            <div className="p-6">
                <Card className="border-red-200">
                    <CardContent className="p-6">
                        <p className="text-red-600">Access denied. Admin only.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-slate-900">Maintenance Settings</h1>
                <p className="text-slate-600 mt-1">Control system-wide maintenance mode</p>
            </div>

            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-indigo-600" />
                        Global Maintenance Mode
                    </CardTitle>
                    <CardDescription>
                        When enabled, all non-admin users will see a maintenance page
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Toggle Switch */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-4">
                            <Switch
                                checked={maintenanceMode || false}
                                onCheckedChange={(checked) => toggleMaintenanceMutation.mutate(checked)}
                                disabled={isLoading || toggleMaintenanceMutation.isPending}
                            />
                            <div>
                                <Label className="text-base font-semibold">
                                    Maintenance Mode
                                </Label>
                                <p className="text-sm text-slate-600 mt-1">
                                    {maintenanceMode 
                                        ? 'System is currently in maintenance mode' 
                                        : 'System is operational'}
                                </p>
                            </div>
                        </div>
                        <div>
                            {maintenanceMode ? (
                                <div className="flex items-center gap-2 text-amber-600">
                                    <AlertTriangle className="w-5 h-5" />
                                    <span className="font-medium">Active</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-green-600">
                                    <CheckCircle className="w-5 h-5" />
                                    <span className="font-medium">Inactive</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Warning Message */}
                    {maintenanceMode && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-900">Maintenance Mode Active</p>
                                    <p className="text-sm text-amber-700 mt-1">
                                        All users except admins are currently seeing the maintenance page. 
                                        Regular operations are suspended.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Info */}
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                        <h3 className="font-semibold text-indigo-900 mb-2">How it works</h3>
                        <ul className="text-sm text-indigo-700 space-y-1">
                            <li>• When enabled, all non-admin users will be redirected to a branded maintenance page</li>
                            <li>• Admin users can still access all features normally</li>
                            <li>• Use this during system upgrades or critical maintenance</li>
                            <li>• Users will see information about all ALM Group companies</li>
                        </ul>
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-3 pt-4">
                        <Button
                            variant={maintenanceMode ? "default" : "outline"}
                            onClick={() => toggleMaintenanceMutation.mutate(true)}
                            disabled={maintenanceMode || toggleMaintenanceMutation.isPending}
                        >
                            Enable Maintenance
                        </Button>
                        <Button
                            variant={!maintenanceMode ? "default" : "outline"}
                            onClick={() => toggleMaintenanceMutation.mutate(false)}
                            disabled={!maintenanceMode || toggleMaintenanceMutation.isPending}
                        >
                            Disable Maintenance
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Salary Page PIN Settings */}
            <Card className="border-0 shadow-lg mt-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Key className="w-5 h-5 text-indigo-600" />
                        Salary Page PIN Lock
                    </CardTitle>
                    <CardDescription>
                        Set a PIN required to access the Salary page and Salary tab in projects
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Current PIN Status */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div>
                            <Label className="text-base font-semibold">
                                {currentSalaryPin ? 'PIN Set' : 'No PIN Set'}
                            </Label>
                            <p className="text-sm text-slate-600 mt-1">
                                {currentSalaryPin 
                                    ? 'Users must enter the PIN to view salary information' 
                                    : 'No PIN protection is currently enabled'}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => setShowPinEdit(!showPinEdit)}
                        >
                            {showPinEdit ? 'Cancel' : 'Edit PIN'}
                        </Button>
                    </div>

                    {/* PIN Edit Form */}
                    {showPinEdit && (
                        <div className="space-y-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                            <div>
                                <Label htmlFor="salary-pin" className="text-sm font-semibold">
                                    Enter New PIN
                                </Label>
                                <Input
                                    id="salary-pin"
                                    type="password"
                                    value={salaryPin}
                                    onChange={(e) => setSalaryPin(e.target.value)}
                                    placeholder="Enter 4-6 digit PIN"
                                    maxLength="6"
                                    className="mt-2"
                                />
                                <p className="text-xs text-slate-600 mt-1">
                                    Use a 4-6 digit numeric PIN for security
                                </p>
                            </div>
                            <Button
                                onClick={() => setSalaryPinMutation.mutate(salaryPin)}
                                disabled={!salaryPin || salaryPin.length < 4 || setSalaryPinMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                {setSalaryPinMutation.isPending ? 'Setting PIN...' : 'Set PIN'}
                            </Button>
                        </div>
                    )}

                    {/* Info */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
                        <ul className="text-sm text-blue-700 space-y-1">
                            <li>• When set, users must enter the PIN to unlock the Salary page</li>
                            <li>• The PIN is also required when viewing the Salary tab in projects</li>
                            <li>• The PIN persists during the user session</li>
                            <li>• All attempts are tracked and limited to 3 incorrect tries</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>
            {/* Report View Sessions */}
            <Card className="border-0 shadow-lg mt-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Eye className="w-5 h-5 text-indigo-600" />
                        Report View Sessions
                    </CardTitle>
                    <CardDescription>
                        Track who viewed which attendance reports and for how long
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ReportViewSessions />
                </CardContent>
            </Card>
        </div>
    );
}