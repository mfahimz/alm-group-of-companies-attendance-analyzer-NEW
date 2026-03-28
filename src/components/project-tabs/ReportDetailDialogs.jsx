import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { Progress } from "@/components/ui/progress";

export function GraceMinutesDialog({ editingGraceMinutes, onClose, onSave, isPending }) {
    return (
        <Dialog open={!!editingGraceMinutes} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Grace Minutes</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <Label>Grace Minutes</Label>
                    <Input
                        type="number"
                        defaultValue={editingGraceMinutes?.grace_minutes ?? 15}
                        id="grace-minutes-input"
                        className="border-slate-200 focus:ring-indigo-100 mt-2"
                    />
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" className="border-slate-200 hover:bg-slate-50 transition-all duration-200" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => {
                        const val = document.getElementById('grace-minutes-input').value;
                        onSave({ id: editingGraceMinutes.id, grace_minutes: parseInt(val) });
                    }} disabled={isPending}>Save</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function SaveConfirmationDialog({ open, onClose, onConfirm, hasEdits, isUser, isSupervisor }) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Confirm Save Report</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <p className="text-slate-700">Are you sure you want to save this report?</p>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm text-amber-800 font-medium mb-2">⚠️ Important:</p>
                        <ul className="text-sm text-amber-700 space-y-1">
                            <li>• All manual edits in daily breakdowns will be converted to exceptions</li>
                            {(isUser && !isSupervisor) ? (
                                <li>• Your edits will be marked as pending and require admin approval</li>
                            ) : (
                                <li>• Admin/supervisor edits will be automatically approved and used in future analysis</li>
                            )}
                            <li>• Verification status will be saved for all marked employees</li>
                            <li>• This action cannot be easily undone</li>
                        </ul>
                    </div>
                    {hasEdits && (
                        <p className="text-sm text-slate-600">
                            You have made edits to this report. These will be permanently saved as exceptions.
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-3">
                    <Button variant="outline" className="border-slate-200 hover:bg-slate-50 transition-all duration-200" onClick={onClose}>Cancel</Button>
                    <Button onClick={onConfirm} className="bg-green-600 hover:bg-green-700">
                        Confirm & Save
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function FinalizationProgressDialog({ progress }) {
    return (
        <Dialog open={progress.open} onOpenChange={() => {}}>
            <DialogContent
                className="sm:max-w-md"
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Creating Salary Snapshots</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm text-slate-600 mb-2">
                            <span>Progress</span>
                            <span className="font-medium">{progress.current} / {progress.total}</span>
                        </div>
                        <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
                    </div>
                    <div className="space-y-1">
                        <div className="text-sm font-medium text-slate-700">{progress.status}</div>
                        {progress.currentEmployee && (
                            <div className="text-xs text-slate-500">{progress.currentEmployee}</div>
                        )}
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                        <div className="flex items-start gap-2 text-xs text-amber-800">
                            <div className="animate-spin h-3 w-3 border-2 border-amber-300 border-t-amber-600 rounded-full mt-0.5 flex-shrink-0"></div>
                            <div>
                                <strong>Creating salary snapshots...</strong> This takes ~2-3 seconds per 20 employees.
                                <br />
                                <span className="text-amber-700">⚠️ Do NOT navigate away or close this dialog until complete!</span>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}