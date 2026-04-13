import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { getFilteredExceptionTypes, formatExceptionTypeLabel } from '@/lib/exception-types';

export default function BulkEditExceptionDialog({ open, onClose, selectedExceptions, projectId, canEditAllowedMinutes }) {
    const [updates, setUpdates] = useState({
        type: { enabled: false, value: '' },
        details: { enabled: false, value: '' },
        date_from: { enabled: false, value: '' },
        date_to: { enabled: false, value: '' }
    });

    const queryClient = useQueryClient();

    const hasAllowedMinutesSelected = selectedExceptions.some(e => e.type === 'ALLOWED_MINUTES');

    const bulkUpdateMutation = useMutation({
        mutationFn: async () => {
            if (hasAllowedMinutesSelected && !canEditAllowedMinutes) {
                throw new Error("Only Admin and CEO can edit allowed minutes.");
            }
            const updateData = {};
            if (updates.type.enabled) updateData.type = updates.type.value;
            if (updates.details.enabled) updateData.details = updates.details.value;
            if (updates.date_from.enabled) updateData.date_from = updates.date_from.value;
            if (updates.date_to.enabled) updateData.date_to = updates.date_to.value;

            await Promise.all(
                selectedExceptions.map(exception => 
                    base44.entities.Exception.update(exception.id, updateData)
                )
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', projectId]);
            toast.success(`${selectedExceptions.length} exceptions updated`);
            onClose();
        },
        onError: () => {
            toast.error('Failed to update exceptions');
        }
    });

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Bulk Edit {selectedExceptions.length} Exceptions</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                    <p className="text-sm text-slate-600">
                        Select which fields to update for all selected exceptions
                    </p>

                    <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.type.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    type: { ...prev.type, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>Exception Type</Label>
                                <Select
                                    value={updates.type.value}
                                    onValueChange={(value) => setUpdates(prev => ({
                                        ...prev,
                                        type: { ...prev.type, value }
                                    }))}
                                    disabled={!updates.type.enabled}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getFilteredExceptionTypes('all', true).map(type => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label || formatExceptionTypeLabel(type.value)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.date_from.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    date_from: { ...prev.date_from, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>Start Date</Label>
                                <Input
                                    type="date"
                                    value={updates.date_from.value}
                                    onChange={(e) => setUpdates(prev => ({
                                        ...prev,
                                        date_from: { ...prev.date_from, value: e.target.value }
                                    }))}
                                    disabled={!updates.date_from.enabled}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.date_to.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    date_to: { ...prev.date_to, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>End Date</Label>
                                <Input
                                    type="date"
                                    value={updates.date_to.value}
                                    onChange={(e) => setUpdates(prev => ({
                                        ...prev,
                                        date_to: { ...prev.date_to, value: e.target.value }
                                    }))}
                                    disabled={!updates.date_to.enabled}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.details.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    details: { ...prev.details, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>Notes</Label>
                                <Input
                                    value={updates.details.value}
                                    onChange={(e) => setUpdates(prev => ({
                                        ...prev,
                                        details: { ...prev.details, value: e.target.value }
                                    }))}
                                    disabled={!updates.details.enabled}
                                    placeholder="Add notes"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            onClick={() => {
                                if (hasAllowedMinutesSelected && !canEditAllowedMinutes) {
                                    toast.error("Only Admin and CEO can edit allowed minutes.");
                                    return;
                                }
                                bulkUpdateMutation.mutate();
                            }}
                            disabled={bulkUpdateMutation.isPending || (hasAllowedMinutesSelected && !canEditAllowedMinutes)}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {bulkUpdateMutation.isPending ? 'Updating...' : 'Update All'}
                        </Button>
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}