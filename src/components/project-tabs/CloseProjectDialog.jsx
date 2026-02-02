import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Trash2, Lock, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function CloseProjectDialog({ open, onClose, project, lastSavedReport }) {
    const [deleteProgress, setDeleteProgress] = useState(null);
    // Default to UNCHECKED - explicit admin decision required
    const [carryForwardGraceMinutes, setCarryForwardGraceMinutes] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const queryClient = useQueryClient();
    
    // Only show grace carry-forward option for Al Maraghi Motors
    const showGraceOption = project?.company === 'Al Maraghi Motors';

    // Fetch grace carry-forward preview when checkbox is checked
    const { data: gracePreview, isLoading: loadingPreview } = useQuery({
        queryKey: ['gracePreview', project?.id],
        queryFn: async () => {
            const response = await base44.functions.invoke('previewGraceCarryForward', {
                project_id: project.id
            });
            return response.data;
        },
        enabled: open && showGraceOption && carryForwardGraceMinutes && showPreview
    });

    const closeProjectMutation = useMutation({
        mutationFn: async () => {
            // All logic now handled in backend for safety and auditability
            setDeleteProgress({ phase: 'Closing project...', percent: 50 });
            
            // Pass carry_forward_grace_minutes to backend
            const closeResult = await base44.functions.invoke('closeProject', {
                project_id: project.id,
                carry_forward_grace_minutes: showGraceOption ? carryForwardGraceMinutes : false
            });

            if (!closeResult.data.success) {
                throw new Error(closeResult.data.error || 'Failed to close project');
            }

            return closeResult.data;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['punches', project.id]);
            queryClient.invalidateQueries(['employees']);
            
            let message = `Project closed. ${result.updated_records} quarterly minutes records updated.`;
            if (result.grace_carry_forward?.processed > 0) {
                message += ` ${result.grace_carry_forward.processed} grace carry-forward records created.`;
            } else if (result.grace_carry_forward?.already_exists) {
                message += ' Grace carry-forward already existed (skipped).';
            }
            
            toast.success(message);
            setDeleteProgress(null);
            onClose();
        },
        onError: (error) => {
            toast.error('Failed to close project: ' + error.message);
            setDeleteProgress(null);
        }
    });

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-red-600" />
                        Close Project
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Warning Card */}
                    <Card className="border-red-200 bg-red-50">
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                                <div className="space-y-2">
                                    <p className="font-semibold text-red-900">Warning: This action cannot be undone</p>
                                    <p className="text-sm text-red-800">
                                        Closing and finalizing this project will:
                                    </p>
                                    <ul className="text-sm text-red-800 space-y-1 ml-4">
                                        <li>• Make the project completely read-only</li>
                                        <li>• Prevent any future analysis or data uploads</li>
                                        <li>• Keep the last saved report and all punch data</li>
                                        <li>• Deduct approved minutes from quarterly allowances (Al Maraghi Auto Repairs)</li>
                                        <li>• Complete final step after salary calculation</li>
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Last Saved Report Confirmation */}
                    <Card className="border-indigo-200 bg-indigo-50">
                        <CardContent className="p-4">
                            <p className="font-medium text-indigo-900 mb-2">Last Saved Report</p>
                            {lastSavedReport ? (
                                <div className="text-sm text-indigo-800">
                                    <p>• Report Date: {new Date(lastSavedReport.created_date).toLocaleString()}</p>
                                    <p>• Period: {new Date(lastSavedReport.date_from).toLocaleDateString()} - {new Date(lastSavedReport.date_to).toLocaleDateString()}</p>
                                    <p>• Employees: {lastSavedReport.employee_count}</p>
                                    <p className="mt-2 font-semibold">✓ This report will be preserved after closing</p>
                                </div>
                            ) : (
                                <div className="text-sm text-red-600">
                                    <p>⚠️ No report has been saved yet!</p>
                                    <p className="mt-1">Please save a report before closing the project.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Progress */}
                    {deleteProgress && (
                        <Card className="border-green-200 bg-green-50">
                            <CardContent className="p-4">
                                <p className="text-sm font-medium text-green-900 mb-2">{deleteProgress.phase}</p>
                                <div className="w-full bg-green-200 rounded-full h-2">
                                    <div 
                                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${deleteProgress.percent}%` }}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Grace Minutes Carry-Forward Option - Al Maraghi Motors only */}
                    {showGraceOption && (
                        <Card className="border-amber-200 bg-amber-50">
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        id="carry-forward-grace"
                                        checked={carryForwardGraceMinutes}
                                        onCheckedChange={setCarryForwardGraceMinutes}
                                    />
                                    <div className="flex-1">
                                        <Label htmlFor="carry-forward-grace" className="cursor-pointer font-medium text-amber-900">
                                            Carry forward unused grace minutes to employees
                                        </Label>
                                        <p className="text-sm text-amber-800 mt-1">
                                            Calculate remaining grace minutes using the formula:<br/>
                                            <code className="text-xs bg-amber-100 px-1 rounded">
                                                Unused = Grace Available - (Late + Early)
                                            </code>
                                        </p>
                                        <p className="text-xs text-amber-700 mt-2">
                                            This creates an audit record and updates employee profiles for future projects.
                                            This action runs once and cannot be undone.
                                        </p>
                                        {carryForwardGraceMinutes && (
                                            <Button
                                                onClick={() => setShowPreview(!showPreview)}
                                                variant="outline"
                                                size="sm"
                                                className="mt-3"
                                            >
                                                <Eye className="w-4 h-4 mr-2" />
                                                {showPreview ? 'Hide Preview' : 'Show Preview'}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Grace Preview Table */}
                    {showGraceOption && carryForwardGraceMinutes && showPreview && (
                        <Card className="border-amber-300 bg-white">
                            <CardContent className="p-4">
                                <h3 className="font-semibold text-amber-900 mb-3">
                                    Unused Grace Minutes Preview ({gracePreview?.employee_count || 0} employees)
                                </h3>
                                {loadingPreview ? (
                                    <p className="text-sm text-slate-600">Loading preview...</p>
                                ) : gracePreview?.success ? (
                                    <div className="max-h-64 overflow-y-auto border rounded">
                                        <Table>
                                            <TableHeader className="sticky top-0 bg-slate-100">
                                                <TableRow>
                                                    <TableHead className="whitespace-nowrap">Att. ID</TableHead>
                                                    <TableHead className="whitespace-nowrap">Name</TableHead>
                                                    <TableHead className="whitespace-nowrap text-right">Late Min</TableHead>
                                                    <TableHead className="whitespace-nowrap text-right">Early Min</TableHead>
                                                    <TableHead className="whitespace-nowrap text-right">Time Issues</TableHead>
                                                    <TableHead className="whitespace-nowrap text-right">Grace Available</TableHead>
                                                    <TableHead className="whitespace-nowrap text-right bg-green-50 font-semibold">Unused Grace</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {gracePreview.preview_data.map((row) => (
                                                    <TableRow key={row.attendance_id}>
                                                        <TableCell className="font-mono text-xs">{row.attendance_id}</TableCell>
                                                        <TableCell className="text-xs">{row.name.split(' ').slice(0, 2).join(' ')}</TableCell>
                                                        <TableCell className="text-right text-xs">{row.late_minutes}</TableCell>
                                                        <TableCell className="text-right text-xs">{row.early_checkout_minutes}</TableCell>
                                                        <TableCell className="text-right text-xs font-semibold">{row.time_issues}</TableCell>
                                                        <TableCell className="text-right text-xs">{row.grace_minutes_available}</TableCell>
                                                        <TableCell className="text-right text-xs bg-green-50 font-bold text-green-700">
                                                            {row.unused_grace_minutes}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-red-600">{gracePreview?.error || 'Failed to load preview'}</p>
                                )}
                                {gracePreview?.success && (
                                    <p className="text-xs text-amber-700 mt-2">
                                        <strong>Total Unused Grace:</strong> {gracePreview.total_unused_grace} minutes across {gracePreview.employee_count} employees
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Confirmation Question */}
                    <p className="text-slate-700 font-medium">
                        Is this the correct report to keep?
                    </p>
                </div>

                <div className="flex justify-end gap-3">
                    <Button 
                        variant="outline" 
                        onClick={onClose}
                        disabled={closeProjectMutation.isPending}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={() => closeProjectMutation.mutate()}
                        disabled={closeProjectMutation.isPending || !lastSavedReport}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {closeProjectMutation.isPending ? 'Closing...' : 'Yes, Close Project'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}