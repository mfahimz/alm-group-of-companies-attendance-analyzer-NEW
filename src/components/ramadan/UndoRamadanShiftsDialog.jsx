import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Dialog for undoing/deleting Ramadan shifts with progress tracking
 * Handles 1000+ shifts efficiently with real-time progress updates
 */
export default function UndoRamadanShiftsDialog({ 
    open, 
    onOpenChange, 
    projectId, 
    ramadanShiftCount,
    ramadanFrom,
    ramadanTo,
    onSuccess 
}) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('idle'); // idle | deleting | success | error
    const [deletedCount, setDeletedCount] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    const handleUndo = async () => {
        try {
            setIsDeleting(true);
            setStatus('deleting');
            setProgress(10);
            setDeletedCount(0);
            setTotalCount(ramadanShiftCount || 0);

            // Simulate progress updates during deletion
            const progressInterval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 90) return 90; // Hold at 90% until completion
                    return prev + 10;
                });
            }, 500);

            const response = await base44.functions.invoke('undoRamadanShifts', {
                projectId,
                ramadanFrom,
                ramadanTo
            });

            clearInterval(progressInterval);

            if (response.data.success) {
                setProgress(100);
                setStatus('success');
                setDeletedCount(response.data.deletedCount);
                setTotalCount(response.data.totalFound);
                
                toast.success(`Successfully deleted ${response.data.deletedCount} Ramadan shifts`);
                
                // Close dialog and refresh after 1.5 seconds
                setTimeout(() => {
                    onOpenChange(false);
                    if (onSuccess) onSuccess();
                }, 1500);
            } else {
                throw new Error(response.data.error || 'Failed to delete shifts');
            }
        } catch (error) {
            console.error('Error undoing Ramadan shifts:', error);
            setStatus('error');
            toast.error(error.message || 'Failed to undo Ramadan shifts');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleClose = () => {
        if (!isDeleting) {
            onOpenChange(false);
            // Reset state
            setTimeout(() => {
                setProgress(0);
                setStatus('idle');
                setDeletedCount(0);
                setTotalCount(0);
            }, 300);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {status === 'idle' && (
                            <>
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                                Undo Ramadan Shifts
                            </>
                        )}
                        {status === 'deleting' && (
                            <>
                                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                                Deleting Shifts...
                            </>
                        )}
                        {status === 'success' && (
                            <>
                                <CheckCircle className="h-5 w-5 text-green-500" />
                                Successfully Deleted
                            </>
                        )}
                        {status === 'error' && (
                            <>
                                <AlertTriangle className="h-5 w-5 text-red-500" />
                                Deletion Failed
                            </>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {status === 'idle' && (
                            <>
                                This will permanently delete <strong className="text-foreground">{ramadanShiftCount}</strong> Ramadan shift records from this project.
                                <br /><br />
                                This action cannot be undone. You can re-apply Ramadan shifts later if needed.
                            </>
                        )}
                        {status === 'deleting' && (
                            <>
                                Deleting {deletedCount > 0 ? `${deletedCount} of ` : ''}{totalCount} shifts...
                                <br />
                                <span className="text-xs text-muted-foreground">This may take a minute for large datasets.</span>
                            </>
                        )}
                        {status === 'success' && (
                            <>
                                Successfully deleted <strong className="text-green-600">{deletedCount}</strong> Ramadan shifts.
                                <br />
                                <span className="text-xs text-muted-foreground">Dialog will close automatically...</span>
                            </>
                        )}
                        {status === 'error' && (
                            <>
                                An error occurred while deleting shifts. Please try again or contact support.
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {(status === 'deleting' || status === 'success') && (
                    <div className="space-y-2">
                        <Progress value={progress} className="h-2" />
                        <p className="text-xs text-center text-muted-foreground">
                            {progress}% complete
                        </p>
                    </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                    {status === 'idle' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                disabled={isDeleting}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleUndo}
                                disabled={isDeleting}
                            >
                                Delete All Shifts
                            </Button>
                        </>
                    )}
                    {status === 'error' && (
                        <>
                            <Button variant="outline" onClick={handleClose}>
                                Close
                            </Button>
                            <Button onClick={handleUndo}>
                                Retry
                            </Button>
                        </>
                    )}
                    {status === 'deleting' && (
                        <Button variant="outline" disabled>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Deleting...
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}