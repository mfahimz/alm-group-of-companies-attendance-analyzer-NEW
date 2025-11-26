import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function EditShiftDialog({ open, onClose, shift, projectId }) {
    const [formData, setFormData] = useState({
        am_start: '',
        am_end: '',
        pm_start: '',
        pm_end: '',
        applicable_days: '',
        is_single_shift: false
    });
    const queryClient = useQueryClient();

    useEffect(() => {
        if (shift) {
            setFormData({
                am_start: shift.am_start || '',
                am_end: shift.am_end || '',
                pm_start: shift.pm_start || '',
                pm_end: shift.pm_end || '',
                applicable_days: shift.applicable_days || '',
                is_single_shift: shift.is_single_shift || false
            });
        }
    }, [shift]);

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
            am_end: formData.is_single_shift ? null : formData.am_end,
            pm_start: formData.is_single_shift ? null : formData.pm_start,
            pm_end: formData.pm_end,
            applicable_days: formData.applicable_days,
            is_friday_shift,
            is_single_shift: formData.is_single_shift
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
                    <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                        <Switch
                            id="edit-single-shift"
                            checked={formData.is_single_shift}
                            onCheckedChange={(checked) => setFormData({ ...formData, is_single_shift: checked })}
                        />
                        <Label htmlFor="edit-single-shift" className="cursor-pointer">
                            Single Shift (No break - only Punch In and Punch Out)
                        </Label>
                    </div>

                    {formData.is_single_shift ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Punch In *</Label>
                                <Input
                                    placeholder="8:00 AM"
                                    value={formData.am_start}
                                    onChange={(e) => setFormData({ ...formData, am_start: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <Label>Punch Out *</Label>
                                <Input
                                    placeholder="5:00 PM"
                                    value={formData.pm_end}
                                    onChange={(e) => setFormData({ ...formData, pm_end: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                    ) : (
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
                    )}
                    <div>
                        <Label>Applicable Days *</Label>
                        <Select
                            value={formData.applicable_days}
                            onValueChange={(value) => setFormData({ ...formData, applicable_days: value })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Monday to Thursday and Saturday">Monday to Thursday and Saturday</SelectItem>
                                <SelectItem value="Friday">Friday</SelectItem>
                                <SelectItem value="Monday to Saturday">Monday to Saturday</SelectItem>
                            </SelectContent>
                        </Select>
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