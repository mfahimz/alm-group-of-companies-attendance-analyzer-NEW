import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function CloseProjectDialog({ open, onClose, project, lastSavedReport }) {
    const [deleteProgress, setDeleteProgress] = useState(null);
    const [captureGraceMinutes, setCaptureGraceMinutes] = useState(true);
    const queryClient = useQueryClient();

    const closeProjectMutation = useMutation({
        mutationFn: async () => {
            // Step 1: Update employee grace minutes from last report (if enabled)
            if (captureGraceMinutes) {
                setDeleteProgress({ phase: 'Updating employee grace minutes...', percent: 50 });
                const results = await base44.entities.AnalysisResult.filter({ report_run_id: lastSavedReport.id });
                const employees = await base44.entities.Employee.filter({ company: project.company });
                
                for (const result of results) {
                    const employee = employees.find(e => e.attendance_id === result.attendance_id);
                    if (employee) {
                        const usedMinutes = (result.late_minutes || 0) + (result.early_checkout_minutes || 0);
                        const remainingGrace = Math.max(0, (result.grace_minutes || 0) - usedMinutes);
                        
                        await base44.entities.Employee.update(employee.id, {
                            carried_grace_minutes: remainingGrace
                        });
                    }
                }
            }

            // Step 2: Close project via backend (handles quarterly minutes deductions)
            setDeleteProgress({ phase: 'Finalizing project...', percent: 90 });
            const closeResult = await base44.functions.invoke('closeProject', {
                project_id: project.id
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
            const message = captureGraceMinutes 
                ? `Project closed. Grace minutes updated for all employees. ${result.updated_records} quarterly minutes records updated.`
                : `Project closed. ${result.updated_records} quarterly minutes records updated.`;
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

                    {/* Grace Minutes Capture Option */}
                    <Card className="border-slate-200 bg-slate-50">
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <Checkbox
                                    id="capture-grace"
                                    checked={captureGraceMinutes}
                                    onCheckedChange={setCaptureGraceMinutes}
                                />
                                <div className="flex-1">
                                    <Label htmlFor="capture-grace" className="cursor-pointer font-medium text-slate-900">
                                        Capture unused grace minutes for next project
                                    </Label>
                                    <p className="text-sm text-slate-600 mt-1">
                                        Calculate remaining grace minutes from this report and carry them forward to each employee's profile for future projects.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

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
                        {closeProjectMutation.isPending ? 'Closing...' : 'Yes, Close & Finalize'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}