import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function BulkEditShiftDialog({ open, onClose, selectedShifts, projectId, company }) {
    const [updates, setUpdates] = useState({
        am_start: { enabled: false, value: '' },
        am_end: { enabled: false, value: '' },
        pm_start: { enabled: false, value: '' },
        pm_end: { enabled: false, value: '' },
        applicable_days: { enabled: false, value: [] }
    });

    const queryClient = useQueryClient();

    const bulkUpdateMutation = useMutation({
        mutationFn: async () => {
            const updateData = {};
            if (updates.am_start.enabled) updateData.am_start = updates.am_start.value;
            if (updates.am_end.enabled) updateData.am_end = updates.am_end.value;
            if (updates.pm_start.enabled) updateData.pm_start = updates.pm_start.value;
            if (updates.pm_end.enabled) updateData.pm_end = updates.pm_end.value;
            if (updates.applicable_days.enabled) {
                updateData.applicable_days = company === 'Naser Mohsin Auto Parts' 
                    ? JSON.stringify(updates.applicable_days.value)
                    : updates.applicable_days.value.join(', ');
            }

            await Promise.all(
                selectedShifts.map(shift => 
                    base44.entities.ShiftTiming.update(shift.id, {
                        ...updateData,
                        attendance_id: String(shift.attendance_id)
                    })
                )
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', projectId]);
            toast.success(`${selectedShifts.length} shifts updated`);
            onClose();
        },
        onError: () => {
            toast.error('Failed to update shifts');
        }
    });

    const toggleDay = (day) => {
        setUpdates(prev => ({
            ...prev,
            applicable_days: {
                ...prev.applicable_days,
                value: prev.applicable_days.value.includes(day)
                    ? prev.applicable_days.value.filter(d => d !== day)
                    : [...prev.applicable_days.value, day]
            }
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Bulk Edit {selectedShifts.length} Shifts</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                    <p className="text-sm text-slate-600">
                        Select which fields to update for all selected shifts
                    </p>

                    <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.am_start.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    am_start: { ...prev.am_start, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>AM Start</Label>
                                <Input
                                    placeholder="8:00 AM"
                                    value={updates.am_start.value}
                                    onChange={(e) => setUpdates(prev => ({
                                        ...prev,
                                        am_start: { ...prev.am_start, value: e.target.value }
                                    }))}
                                    disabled={!updates.am_start.enabled}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.am_end.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    am_end: { ...prev.am_end, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>AM End</Label>
                                <Input
                                    placeholder="12:00 PM"
                                    value={updates.am_end.value}
                                    onChange={(e) => setUpdates(prev => ({
                                        ...prev,
                                        am_end: { ...prev.am_end, value: e.target.value }
                                    }))}
                                    disabled={!updates.am_end.enabled}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.pm_start.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    pm_start: { ...prev.pm_start, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>PM Start</Label>
                                <Input
                                    placeholder="1:00 PM"
                                    value={updates.pm_start.value}
                                    onChange={(e) => setUpdates(prev => ({
                                        ...prev,
                                        pm_start: { ...prev.pm_start, value: e.target.value }
                                    }))}
                                    disabled={!updates.pm_start.enabled}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.pm_end.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    pm_end: { ...prev.pm_end, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>PM End</Label>
                                <Input
                                    placeholder="5:00 PM"
                                    value={updates.pm_end.value}
                                    onChange={(e) => setUpdates(prev => ({
                                        ...prev,
                                        pm_end: { ...prev.pm_end, value: e.target.value }
                                    }))}
                                    disabled={!updates.pm_end.enabled}
                                />
                            </div>
                        </div>

                        {company === 'Naser Mohsin Auto Parts' && (
                            <div className="flex items-start space-x-3">
                                <Checkbox
                                    checked={updates.applicable_days.enabled}
                                    onCheckedChange={(checked) => setUpdates(prev => ({
                                        ...prev,
                                        applicable_days: { ...prev.applicable_days, enabled: checked }
                                    }))}
                                    className="mt-2"
                                />
                                <div className="flex-1">
                                    <Label>Applicable Days</Label>
                                    <div className="grid grid-cols-2 gap-2 mt-2 p-3 border rounded-lg">
                                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                            <div key={day} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`bulk-${day}`}
                                                    checked={updates.applicable_days.value.includes(day)}
                                                    onCheckedChange={() => toggleDay(day)}
                                                    disabled={!updates.applicable_days.enabled}
                                                />
                                                <Label htmlFor={`bulk-${day}`} className="font-normal cursor-pointer">
                                                    {day}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            onClick={() => bulkUpdateMutation.mutate()}
                            disabled={bulkUpdateMutation.isPending}
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