import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function EditShiftDialog({ open, onClose, shift, projectId }) {
    const [formData, setFormData] = useState({
        am_start: shift?.am_start || '',
        am_end: shift?.am_end || '',
        pm_start: shift?.pm_start || '',
        pm_end: shift?.pm_end || '',
        applicable_days: shift?.applicable_days || ''
    });
    const queryClient = useQueryClient();

    const updateMutation = useMutation({
        mutationFn: (data) => base44.entities.ShiftTiming.update(shift.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', projectId]);
            toast.success('Shift timing updated successfully');
            onClose();
        },
        onError: () => {
            toast.error('Failed to update shift timing');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Detect if this is a Friday shift based on applicable_days
        const is_friday_shift = formData.applicable_days.toLowerCase().includes('friday');
        
        updateMutation.mutate({
            am_start: formData.am_start,
            am_end: formData.am_end,
            pm_start: formData.pm_start,
            pm_end: formData.pm_end,
            applicable_days: formData.applicable_days,
            is_friday_shift
        });
    };

    if (!shift) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit Shift Timing: {shift.attendance_id}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>AM Start *</Label>
                            <Input
                                placeholder="8:00 AM"
                                value={formData.am_start}
                                onChange={(e) => setFormData({ ...formData, am_start: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <Label>AM End *</Label>
                            <Input
                                placeholder="12:00 PM"
                                value={formData.am_end}
                                onChange={(e) => setFormData({ ...formData, am_end: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <Label>PM Start *</Label>
                            <Input
                                placeholder="1:00 PM"
                                value={formData.pm_start}
                                onChange={(e) => setFormData({ ...formData, pm_start: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <Label>PM End *</Label>
                            <Input
                                placeholder="5:00 PM"
                                value={formData.pm_end}
                                onChange={(e) => setFormData({ ...formData, pm_end: e.target.value })}
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <Label>Applicable Days</Label>
                        <Input
                            placeholder="e.g., Saturday-Wednesday, Friday only"
                            value={formData.applicable_days}
                            onChange={(e) => setFormData({ ...formData, applicable_days: e.target.value })}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Include "Friday" in the text to mark as a Friday shift
                        </p>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}