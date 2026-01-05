import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function ShiftConfirmationDialog({ open, onClose, onConfirm, projectName }) {
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Confirm Shift Timings</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm text-amber-800 font-medium mb-1">
                                Shifts have been copied to this project
                            </p>
                            <p className="text-xs text-amber-700">
                                Project: <span className="font-semibold">{projectName}</span>
                            </p>
                        </div>
                    </div>
                    
                    <p className="text-sm text-slate-700">
                        Shift timings from the source project have been duplicated. You can generate verification links 
                        for department heads in the Shifts tab.
                    </p>

                    <div className="flex items-start gap-2 text-xs text-slate-500">
                        <CheckCircle className="w-3 h-3 mt-0.5" />
                        <span>Visit the Shifts tab to generate verification links</span>
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <Button onClick={onConfirm} className="bg-indigo-600 hover:bg-indigo-700">
                        Got it
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}