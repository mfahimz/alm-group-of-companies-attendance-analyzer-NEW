import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Copy, Download, Trash2, Eye, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { formatInUAE } from '@/components/ui/timezone';

export default function PrivateFileManager({ company }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [showDetails, setShowDetails] = useState(false);
    const [expiresIn, setExpiresIn] = useState(3600);
    const [signedUrl, setSignedUrl] = useState(null);

    const queryClient = useQueryClient();

    const { data: files = [] } = useQuery({
        queryKey: ['privateFiles', company],
        queryFn: async () => {
            const result = await base44.entities.PrivateFile.filter({ company }, '-created_date');
            return result;
        },
        enabled: !!company
    });

    const generateSignedUrlMutation = useMutation({
        mutationFn: async (file) => {
            const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
                file_uri: file.file_uri,
                expires_in: expiresIn
            });
            return signed_url;
        },
        onSuccess: (url) => {
            setSignedUrl(url);
            toast.success('Signed URL generated');
        },
        onError: (error) => {
            toast.error('Failed to generate URL: ' + error.message);
        }
    });

    const deleteFileMutation = useMutation({
        mutationFn: async (fileId) => {
            await base44.entities.PrivateFile.delete(fileId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['privateFiles']);
            toast.success('File deleted');
        },
        onError: (error) => {
            toast.error('Failed to delete: ' + error.message);
        }
    });

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes, k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    if (files.length === 0) {
        return (
            <Card className="border-0 shadow-sm">
                <CardContent className="p-6 text-center text-slate-500">
                    No private files yet. Export reports to create secure, shareable files.
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        Private Files
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>File Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Size</TableHead>
                                    <TableHead>Uploaded By</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {files.map((file) => (
                                    <TableRow key={file.id}>
                                        <TableCell className="font-medium text-sm">{file.file_name}</TableCell>
                                        <TableCell className="text-xs uppercase">{file.file_type}</TableCell>
                                        <TableCell className="text-sm">{formatFileSize(file.file_size)}</TableCell>
                                        <TableCell className="text-sm">{file.uploaded_by_name}</TableCell>
                                        <TableCell className="text-sm">{formatInUAE(file.created_date, 'MMM d, yyyy')}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center gap-2 justify-end">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setSelectedFile(file);
                                                        setShowDetails(true);
                                                    }}
                                                >
                                                    <Eye className="w-4 h-4 text-indigo-600" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => deleteFileMutation.mutate(file.id)}
                                                    disabled={deleteFileMutation.isPending}
                                                >
                                                    <Trash2 className="w-4 h-4 text-red-600" />
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

            {/* File Details Dialog */}
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Private File Details</DialogTitle>
                    </DialogHeader>
                    {selectedFile && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs text-slate-600">File Name</Label>
                                    <p className="font-medium text-sm">{selectedFile.file_name}</p>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Type</Label>
                                    <p className="text-sm uppercase">{selectedFile.file_type}</p>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Size</Label>
                                    <p className="text-sm">{formatFileSize(selectedFile.file_size)}</p>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Uploaded</Label>
                                    <p className="text-sm">{formatInUAE(selectedFile.created_date, 'MMM d, yyyy hh:mm a')}</p>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Uploaded By</Label>
                                    <p className="text-sm">{selectedFile.uploaded_by_name}</p>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600">Access Count</Label>
                                    <p className="text-sm">{selectedFile.access_count || 0}</p>
                                </div>
                            </div>

                            <div className="border-t pt-4">
                                <Label className="text-xs text-slate-600 mb-2 block">Generate Expiring Download Link</Label>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <Label className="text-xs text-slate-600">Expires In (seconds)</Label>
                                        <Input
                                            type="number"
                                            value={expiresIn}
                                            onChange={(e) => setExpiresIn(Number(e.target.value))}
                                            min={300}
                                            max={86400}
                                            className="mt-1"
                                        />
                                    </div>
                                    <Button
                                        onClick={() => generateSignedUrlMutation.mutate(selectedFile)}
                                        disabled={generateSignedUrlMutation.isPending}
                                        className="whitespace-nowrap"
                                    >
                                        Generate Link
                                    </Button>
                                </div>
                            </div>

                            {signedUrl && (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    <Label className="text-xs text-slate-600 mb-2 block">Download Link (Expires in {Math.round(expiresIn / 3600)} hour{Math.round(expiresIn / 3600) !== 1 ? 's' : ''})</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={signedUrl}
                                            readOnly
                                            className="font-mono text-xs"
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => copyToClipboard(signedUrl)}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex justify-end">
                        <Button onClick={() => setShowDetails(false)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}