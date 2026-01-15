import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, CheckCircle, XCircle, Clock, Eye, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function ApprovalLinksHistory({ reportRunId, projectId }) {
    const [selectedLink, setSelectedLink] = useState(null);
    const [showLinkDetails, setShowLinkDetails] = useState(false);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: approvalLinks = [] } = useQuery({
        queryKey: ['approvalLinks', reportRunId],
        queryFn: () => base44.entities.ApprovalLink.filter({ 
            report_run_id: reportRunId 
        }, '-created_date'),
        enabled: !!reportRunId
    });

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
        if (link.used && link.approved) return <CheckCircle className="w-4 h-4 text-green-600" />;
        if (link.used && !link.approved) return <XCircle className="w-4 h-4 text-red-600" />;
        if (new Date(link.expires_at) < new Date()) return <Clock className="w-4 h-4 text-slate-400" />;
        return <Clock className="w-4 h-4 text-amber-600" />;
    };

    const getStatusText = (link) => {
        if (link.used && link.approved) return 'Approved';
        if (link.used && !link.approved) return 'Rejected';
        if (new Date(link.expires_at) < new Date()) return 'Expired';
        return 'Pending';
    };

    const getStatusColor = (link) => {
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
                                        <TableCell>{link.department_head_id || '-'}</TableCell>
                                        <TableCell className="text-sm">
                                            {new Date(link.created_date).toLocaleDateString('en-US', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true
                                            })}
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {new Date(link.expires_at).toLocaleDateString()}
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
                                                {currentUser?.role === 'admin' && (
                                                    <Button
                                                        size="sm"
                                                        variant={link.admin_override_public ? "default" : "ghost"}
                                                        onClick={() => togglePublicMutation.mutate(link.id)}
                                                        disabled={togglePublicMutation.isPending || link.used}
                                                        title={link.admin_override_public ? "Public (No verification needed)" : "Make public"}
                                                    >
                                                        <Unlock className="w-4 h-4" />
                                                    </Button>
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
                                    <p className="font-medium">{selectedLink.department_head_id || '-'}</p>
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
                                        {new Date(selectedLink.created_date).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <Label className="text-xs text-slate-600">Approval Link</Label>
                                <div className="flex gap-2 mt-1">
                                    <Input
                                        value={`${linkDomain}/DeptHeadApproval?token=${selectedLink.link_token}`}
                                        readOnly
                                        className="font-mono text-xs"
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copyToClipboard(`${linkDomain}/DeptHeadApproval?token=${selectedLink.link_token}`)}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {!selectedLink.admin_override_public && (
                                <div>
                                    <Label className="text-xs text-slate-600">Verification Code</Label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            value={selectedLink.verification_code}
                                            readOnly
                                            className="font-mono text-lg font-bold tracking-widest text-center"
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => copyToClipboard(selectedLink.verification_code)}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {selectedLink.used && selectedLink.used_at && (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    <Label className="text-xs text-slate-600">Used At</Label>
                                    <p className="text-sm mt-1">
                                        {new Date(selectedLink.used_at).toLocaleString()}
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