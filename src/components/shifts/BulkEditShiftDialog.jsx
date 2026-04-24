import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
            if (updates.am_start.enabled && updates.am_start.value) updateData.am_start = updates.am_start.value;
            if (updates.am_end.enabled && updates.am_end.value) updateData.am_end = updates.am_end.value;
            if (updates.pm_start.enabled && updates.pm_start.value) updateData.pm_start = updates.pm_start.value;
            if (updates.pm_end.enabled && updates.pm_end.value) updateData.pm_end = updates.pm_end.value;
            if (updates.applicable_days.enabled) {
                updateData.applicable_days = JSON.stringify(updates.applicable_days.value);
            }

            // Check if there's anything to update
            if (Object.keys(updateData).length === 0) {
                throw new Error('No fields selected to update');
            }

            // Helper function to update with retry
            const updateWithRetry = async (shift, maxRetries = 3) => {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        await base44.entities.ShiftTiming.update(shift.id, {
                            ...updateData,
                            attendance_id: String(shift.attendance_id)
                        });
                        return; // Success
                    } catch (err) {
                        if (attempt === maxRetries) throw err;
                        // Wait with exponential backoff before retry
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                }
            };

            // Update shifts sequentially with retry logic
            let successCount = 0;
            const errors = [];
            
            for (const shift of selectedShifts) {
                try {
                    await updateWithRetry(shift);
                    successCount++;
                    // Small delay between updates to avoid overwhelming the server
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (err) {
                    errors.push({ shift, error: err.message });
                }
            }

            if (errors.length > 0) {
                throw new Error(`Updated ${successCount}/${selectedShifts.length} shifts. ${errors.length} failed.`);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', projectId]);
            toast.success(`${selectedShifts.length} shifts updated`);
            onClose();
        },
        onError: (error) => {
            console.error('Bulk update error:', error);
            queryClient.invalidateQueries(['shifts', projectId]); // Refresh to show partial updates
            toast.error(error.message || 'Failed to update shifts');
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
                                <Input className="border-slate-200 focus:ring-indigo-100"
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
                                <Input className="border-slate-200 focus:ring-indigo-100"
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
                                <Input className="border-slate-200 focus:ring-indigo-100"
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
                                <Input className="border-slate-200 focus:ring-indigo-100"
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
                                {company === 'Naser Mohsin Auto Parts' ? (
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
                                ) : (
                                    <div className="mt-2">
                                        <Select
                                            disabled={!updates.applicable_days.enabled}
                                            value={
                                                updates.applicable_days.value.length > 0 
                                                ? (
                                                    updates.applicable_days.value.length === 1 && updates.applicable_days.value.includes('Friday') 
                                                        ? 'Friday' 
                                                        : updates.applicable_days.value.length === 6 
                                                            ? 'Monday to Saturday' 
                                                            : 'Monday to Thursday and Saturday'
                                                ) 
                                                : ''
                                            }
                                            onValueChange={(value) => {
                                                let newArray = [];
                                                if (value === 'Monday to Thursday and Saturday') {
                                                    newArray = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'];
                                                } else if (value === 'Friday') {
                                                    newArray = ['Friday'];
                                                } else if (value === 'Monday to Saturday') {
                                                    newArray = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                                }
                                                setUpdates(prev => ({
                                                    ...prev,
                                                    applicable_days: {
                                                        ...prev.applicable_days,
                                                        value: newArray
                                                    }
                                                }));
                                            }}
                                        >
                                            <SelectTrigger className="border-slate-200 hover:bg-slate-50 transition-all duration-200 focus:ring-indigo-100">
                                                <SelectValue placeholder="Select working days" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Monday to Thursday and Saturday">Monday to Thursday and Saturday</SelectItem>
                                                <SelectItem value="Friday">Friday</SelectItem>
                                                <SelectItem value="Monday to Saturday">Monday to Saturday</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            onClick={() => bulkUpdateMutation.mutate()}
                            disabled={bulkUpdateMutation.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {bulkUpdateMutation.isPending ? 'Updating...' : 'Update All'}
                        </Button>
                        <Button variant="ghost" className="hover:bg-slate-50 transition-all duration-200" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}