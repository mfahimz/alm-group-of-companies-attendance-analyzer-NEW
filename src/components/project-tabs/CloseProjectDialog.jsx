import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function CloseProjectDialog({ open, onClose, project, lastSavedReport }) {
    const [deleteProgress, setDeleteProgress] = useState(null);
    const queryClient = useQueryClient();

    const closeProjectMutation = useMutation({
        mutationFn: async () => {
            // Step 1: Delete all punches
            setDeleteProgress({ phase: 'Deleting punch records...', percent: 20 });
            const deleteResult = await base44.functions.invoke('deleteProjectPunches', {
                project_id: project.id
            });

            if (!deleteResult.data.success) {
                throw new Error('Failed to delete punches');
            }

            // Step 2: Update project status to closed
            setDeleteProgress({ phase: 'Finalizing project...', percent: 80 });
            await base44.entities.Project.update(project.id, {
                status: 'closed'
            });

            return deleteResult.data;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['punches', project.id]);
            toast.success(`Project closed successfully. ${result.deleted_count} punch records deleted.`);
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
                        Close & Finalize Project
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
                                        <li>• Delete all punch records permanently</li>
                                        <li>• Make the project completely read-only</li>
                                        <li>• Prevent any future analysis or data uploads</li>
                                        <li>• Keep only the last saved report</li>
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