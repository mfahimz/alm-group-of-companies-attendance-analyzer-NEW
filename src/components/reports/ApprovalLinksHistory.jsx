import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, CheckCircle, XCircle, Clock, Eye, Unlock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatInUAE } from '@/components/ui/timezone';

export default function ApprovalLinksHistory({ reportRunId, projectId }) {
    const [selectedLink, setSelectedLink] = useState(null);
    const [showLinkDetails, setShowLinkDetails] = useState(false);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: allApprovalLinks = [] } = useQuery({
        queryKey: ['approvalLinks', reportRunId],
        queryFn: () => base44.entities.ApprovalLink.filter({ 
            report_run_id: reportRunId 
        }, '-created_date'),
        enabled: !!reportRunId
    });

    // Filter out deleted links from UI
    const approvalLinks = allApprovalLinks.filter(link => !link.deleted);

    const togglePublicMutation = useMutation({
        mutationFn: async (linkId) => {
            const link = approvalLinks.find(l => l.id === linkId);
            await base44.entities.ApprovalLink.update(linkId, {
                admin_override_public: !link.admin_override_public
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['approvalLinks']);
            toast.success('Link access updated');
        },
        onError: (error) => {
            toast.error('Failed to update: ' + error.message);
        }
    });

    const deleteLinkMutation = useMutation({
        mutationFn: async (linkId) => {
            await base44.entities.ApprovalLink.update(linkId, {
                deleted: true,
                deleted_at: new Date().toISOString(),
                deleted_by: currentUser?.email
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['approvalLinks']);
            toast.success('Link deleted successfully');
        },
        onError: (error) => {
            toast.error('Failed to delete: ' + error.message);
        }
    });

    const { data: employeesMap = {} } = useQuery({
        queryKey: ['employeesMap'],
        queryFn: async () => {
            const employees = await base44.entities.Employee.list();
            return employees.reduce((acc, emp) => {
                acc[emp.id] = emp.name;
                return acc;
            }, {});
        }
    });

    const { data: reportRun } = useQuery({
        queryKey: ['reportRun', reportRunId],
        queryFn: async () => {
            const runs = await base44.entities.ReportRun.filter({ id: reportRunId });
            return runs[0];
        },
        enabled: !!reportRunId
    });

    const { data: customDomainData } = useQuery({
        queryKey: ['customDomain'],
        queryFn: async () => {
            try {
                const settings = await base44.entities.SystemSettings.filter({ 
                    setting_key: 'CUSTOM_DOMAIN' 
                });
                if (settings.length > 0 && settings[0].setting_value) {
                    let domain = settings[0].setting_value;
                    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                        domain = `https://${domain}`;
                    }
                    return domain.replace(/\/$/, '');
                }
                return window.location.origin;
            } catch {
                return window.location.origin;
            }
        }
    });

    const linkDomain = customDomainData || window.location.origin;

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const getStatusIcon = (link) => {
        if (link.deleted) return <Trash2 className="w-4 h-4 text-red-600" />;
        if (link.used && link.approved) return <CheckCircle className="w-4 h-4 text-green-600" />;
        if (link.used && !link.approved) return <XCircle className="w-4 h-4 text-red-600" />;
        if (new Date(link.expires_at) < new Date()) return <Clock className="w-4 h-4 text-slate-400" />;
        return <Clock className="w-4 h-4 text-amber-600" />;
    };

    const getStatusText = (link) => {
        if (link.deleted) return 'Deleted';
        if (link.used && link.approved) return 'Approved';
        if (link.used && !link.approved) return 'Rejected';
        if (new Date(link.expires_at) < new Date()) return 'Expired';
        return 'Pending';
    };

    const getStatusColor = (link) => {
        if (link.deleted) return 'text-red-600';
        if (link.used && link.approved) return 'text-green-600';
        if (link.used && !link.approved) return 'text-red-600';
        if (new Date(link.expires_at) < new Date()) return 'text-slate-400';
        return 'text-amber-600';
    };

    if (approvalLinks.length === 0) {
        return (
            <Card className="border-0 shadow-sm">
                <CardContent className="p-6 text-center text-slate-500">
                    No approval links generated for this report yet
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">Approval Links History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Department Head</TableHead>
                                    <TableHead>Generated</TableHead>
                                    <TableHead>Expires</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {approvalLinks.map((link) => (
                                    <TableRow key={link.id}>
                                        <TableCell className="font-medium">{link.department}</TableCell>
                                        <TableCell>{employeesMap[link.department_head_id] || link.department_head_id || '-'}</TableCell>
                                        <TableCell className="text-sm">
                                            {formatInUAE(link.created_date, 'MM/dd/yyyy hh:mm a')}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {formatInUAE(link.expires_at, 'MM/dd/yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(link)}
                                                <span className={`text-sm font-medium ${getStatusColor(link)}`}>
                                                    {getStatusText(link)}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center gap-2 justify-end">
                                                {currentUser?.role === 'admin' && !link.deleted && !link.used && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant={link.admin_override_public ? "default" : "ghost"}
                                                            onClick={() => togglePublicMutation.mutate(link.id)}
                                                            disabled={togglePublicMutation.isPending}
                                                            title={link.admin_override_public ? "Public (No verification needed)" : "Make public"}
                                                        >
                                                            <Unlock className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                if (confirm('Delete this approval link? It will become invalid.')) {
                                                                    deleteLinkMutation.mutate(link.id);
                                                                }
                                                            }}
                                                            disabled={deleteLinkMutation.isPending}
                                                            title="Delete link"
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-600" />
                                                        </Button>
                                                    </>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setSelectedLink(link);
                                                        setShowLinkDetails(true);
                                                    }}
                                                >
                                                    <Eye className="w-4 h-4 text-indigo-600" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Link Details Dialog */}
            <Dialog open={showLinkDetails} onOpenChange={setShowLinkDetails}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Approval Link Details</DialogTitle>
                    </DialogHeader>
                    {selectedLink && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs text-slate-600">Department</Label>
                                    <p className="font-medium">{selectedLink.department}</p>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Department Head</Label>
                                    <p className="font-medium">{employeesMap[selectedLink.department_head_id] || selectedLink.department_head_id || '-'}</p>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Status</Label>
                                    <div className="flex items-center gap-2">
                                        {getStatusIcon(selectedLink)}
                                        <span className={`font-medium ${getStatusColor(selectedLink)}`}>
                                            {getStatusText(selectedLink)}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Access Type</Label>
                                    <div className="flex items-center gap-2">
                                        {selectedLink.admin_override_public ? (
                                            <>
                                                <Unlock className="w-4 h-4 text-green-600" />
                                                <span className="text-sm font-medium text-green-600">Public (No verification)</span>
                                            </>
                                        ) : (
                                            <span className="text-sm text-slate-600">Requires verification</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Created</Label>
                                    <p className="text-sm">
                                        {formatInUAE(selectedLink.created_date, 'PPpp')}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs text-slate-600 mb-2 block">Complete Message</Label>
                                {(() => {
                                    const linkUrl = `${linkDomain}/DeptHeadApproval?token=${selectedLink.link_token}`;
                                    const deptHeadName = employeesMap[selectedLink.department_head_id] || 'Department Head';
                                    const messageText = `Dear ${deptHeadName},

Please find the verification link below to review and approve the attendance exceptions for ${selectedLink.department}:

${linkUrl}

Verification Code: ${selectedLink.verification_code}

This link will expire on ${formatInUAE(selectedLink.expires_at, 'MM/dd/yyyy')}.

Thank you.`;
                                    return (
                                        <>
                                            <div className="bg-white rounded-lg p-3 border border-slate-200 mb-2">
                                                <pre className="text-xs whitespace-pre-wrap font-sans text-slate-700">{messageText}</pre>
                                            </div>
                                            <Button
                                                size="sm"
                                                className="w-full"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(messageText);
                                                    toast.success('Message copied to clipboard');
                                                }}
                                            >
                                                <Copy className="w-4 h-4 mr-2" />
                                                Copy Complete Message
                                            </Button>
                                        </>
                                    );
                                })()}
                            </div>

                            {selectedLink.used && selectedLink.used_at && (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    <Label className="text-xs text-slate-600">Used At</Label>
                                    <p className="text-sm mt-1">
                                        {formatInUAE(selectedLink.used_at, 'PPpp')}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex justify-end">
                        <Button onClick={() => setShowLinkDetails(false)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}