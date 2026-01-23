import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, AlertTriangle, CheckCircle, Clock, FileText, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Breadcrumb from '../components/ui/Breadcrumb';
import { toast } from 'sonner';

export default function SecurityAudit() {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [report, setReport] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const generateReport = async () => {
        if (!dateFrom || !dateTo) {
            toast.error('Please select date range');
            return;
        }

        setIsGenerating(true);
        try {
            const response = await base44.functions.invoke('securityAudit', {
                date_from: dateFrom,
                date_to: dateTo,
                user_email: userEmail
            });

            if (response.data.success) {
                setReport(response.data.report);
                toast.success('Security audit report generated');
            } else {
                toast.error(response.data.error || 'Failed to generate report');
            }
        } catch (error) {
            toast.error('Failed to generate security audit: ' + error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const getSeverityColor = (severity) => {
        switch (severity) {
            case 'high': return 'text-red-700 bg-red-50 border-red-200';
            case 'medium': return 'text-amber-700 bg-amber-50 border-amber-200';
            case 'low': return 'text-blue-700 bg-blue-50 border-blue-200';
            default: return 'text-slate-700 bg-slate-50 border-slate-200';
        }
    };

    if (currentUser?.role !== 'admin') {
        return (
            <div className="max-w-5xl mx-auto space-y-6">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600">Access restricted to Admin only</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <Breadcrumb items={[
                { label: 'Settings', href: 'RulesSettings' },
                { label: 'Security Audit' }
            ]} />

            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-4">
                    <Shield className="w-8 h-8 text-indigo-600" />
                </div>
                <h1 className="text-4xl font-bold text-slate-900">Security Audit</h1>
                <p className="text-lg text-slate-600 mt-3">System security monitoring and access control analysis</p>
            </div>

            {/* Filters */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-6 h-6 text-indigo-600" />
                        Generate Security Report
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-4 gap-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Date From</label>
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Date To</label>
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">User Email (Optional)</label>
                            <Input
                                type="email"
                                placeholder="user@example.com"
                                value={userEmail}
                                onChange={(e) => setUserEmail(e.target.value)}
                            />
                        </div>
                        <div className="flex items-end">
                            <Button 
                                onClick={generateReport} 
                                disabled={isGenerating}
                                className="w-full bg-indigo-600 hover:bg-indigo-700"
                            >
                                {isGenerating ? 'Generating...' : 'Generate Report'}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Report Display */}
            {report && (
                <>
                    {/* Activity Summary */}
                    <Card className="border-0 shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="w-6 h-6 text-blue-600" />
                                Activity Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-3 gap-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <p className="text-sm text-blue-600 font-medium">Total Logins</p>
                                    <p className="text-3xl font-bold text-blue-900">{report.activity_summary.total_logins}</p>
                                </div>
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                    <p className="text-sm text-green-600 font-medium">Unique Users</p>
                                    <p className="text-3xl font-bold text-green-900">{report.activity_summary.unique_users}</p>
                                </div>
                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                    <p className="text-sm text-purple-600 font-medium">Total Operations</p>
                                    <p className="text-3xl font-bold text-purple-900">{report.audit_summary.total_operations}</p>
                                </div>
                            </div>

                            <div className="mt-6">
                                <h4 className="text-sm font-semibold text-slate-900 mb-3">Activity by Role</h4>
                                <div className="grid md:grid-cols-2 gap-3">
                                    {Object.entries(report.activity_summary.by_role).map(([role, count]) => (
                                        <div key={role} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded p-3">
                                            <span className="text-sm font-medium text-slate-700 capitalize">{role}</span>
                                            <span className="text-sm font-bold text-slate-900">{count} logins</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Security Concerns */}
                    {report.security_concerns.length > 0 && (
                        <Card className="border-0 shadow-lg border-l-4 border-l-red-500">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertTriangle className="w-6 h-6 text-red-600" />
                                    Security Concerns ({report.security_concerns.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {report.security_concerns.map((concern, idx) => (
                                        <div key={idx} className={`border rounded-lg p-4 ${getSeverityColor(concern.severity)}`}>
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <p className="font-semibold">{concern.type.replace(/_/g, ' ').toUpperCase()}</p>
                                                    <p className="text-sm mt-1">{concern.message}</p>
                                                </div>
                                                <span className="text-xs font-bold uppercase px-2 py-1 rounded bg-white">
                                                    {concern.severity}
                                                </span>
                                            </div>
                                            {concern.count && (
                                                <p className="text-sm font-medium mt-2">Affected items: {concern.count}</p>
                                            )}
                                            {concern.users && concern.users.length > 0 && (
                                                <div className="mt-3">
                                                    <p className="text-xs font-semibold mb-1">Users:</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {concern.users.map((email, i) => (
                                                            <span key={i} className="text-xs bg-white px-2 py-1 rounded border">
                                                                {email}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Recommendations */}
                    {report.recommendations.length > 0 && (
                        <Card className="border-0 shadow-lg">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CheckCircle className="w-6 h-6 text-green-600" />
                                    Security Recommendations
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {report.recommendations.map((rec, idx) => (
                                        <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <p className="font-semibold text-slate-900">{rec.action}</p>
                                                    <p className="text-sm text-slate-600 mt-1">Impact: {rec.impact}</p>
                                                </div>
                                                <span className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                                                    rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                                                    rec.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {rec.priority}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Audit Operations */}
                    <Card className="border-0 shadow-lg">
                        <CardHeader>
                            <CardTitle>Operations Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-900 mb-3">By Action</h4>
                                    <div className="space-y-2">
                                        {Object.entries(report.audit_summary.by_action).map(([action, count]) => (
                                            <div key={action} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded p-2">
                                                <span className="text-sm text-slate-700 capitalize">{action}</span>
                                                <span className="text-sm font-bold text-slate-900">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-900 mb-3">By Entity</h4>
                                    <div className="space-y-2">
                                        {Object.entries(report.audit_summary.by_entity).slice(0, 10).map(([entity, count]) => (
                                            <div key={entity} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded p-2">
                                                <span className="text-sm text-slate-700">{entity}</span>
                                                <span className="text-sm font-bold text-slate-900">{count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}