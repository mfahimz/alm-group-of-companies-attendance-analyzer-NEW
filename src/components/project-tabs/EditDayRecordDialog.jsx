import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function EditDayRecordDialog({ open, onClose, dayRecord, project, attendanceId }) {
    const [formData, setFormData] = useState({
        type: 'MANUAL_PRESENT',
        details: `Manual edit for ${dayRecord?.date || ''}`,
        selectedPunches: [],
        lateMinutes: 0,
        earlyCheckoutMinutes: 0,
        isAbnormal: false
    });
    const queryClient = useQueryClient();

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id }),
        enabled: !!dayRecord
    });

    const getDayPunches = () => {
        if (!dayRecord) return [];
        const [day, month, year] = dayRecord.date.split('/');
        const dateStr = `${year}-${month}-${day}`;
        return punches.filter(p => p.punch_date === dateStr && p.attendance_id === attendanceId)
            .sort((a, b) => {
                const timeA = new Date(a.timestamp_raw);
                const timeB = new Date(b.timestamp_raw);
                return timeA - timeB;
            });
    };

    useEffect(() => {
        if (dayRecord && open) {
            const dayPunches = getDayPunches();
            
            // Parse late minutes from lateInfo
            let lateMinutes = 0;
            if (dayRecord.lateInfo && dayRecord.lateInfo !== '-') {
                const matches = dayRecord.lateInfo.match(/(\d+)\s*min/g);
                if (matches) {
                    lateMinutes = matches.reduce((sum, match) => {
                        const num = parseInt(match.match(/\d+/)[0]);
                        return sum + num;
                    }, 0);
                }
            }

            // Parse early checkout minutes from earlyCheckoutInfo
            let earlyCheckoutMinutes = 0;
            if (dayRecord.earlyCheckoutInfo && dayRecord.earlyCheckoutInfo !== '-') {
                const matches = dayRecord.earlyCheckoutInfo.match(/(\d+)\s*min/g);
                if (matches) {
                    earlyCheckoutMinutes = matches.reduce((sum, match) => {
                        const num = parseInt(match.match(/\d+/)[0]);
                        return sum + num;
                    }, 0);
                }
            }

            // Map current status to type
            let statusType = 'MANUAL_PRESENT';
            if (dayRecord.status.includes('Absent')) {
                statusType = 'MANUAL_ABSENT';
            } else if (dayRecord.status.includes('Half')) {
                statusType = 'MANUAL_HALF';
            } else if (dayRecord.status.includes('Off')) {
                statusType = 'OFF';
            } else if (dayRecord.status.includes('Present')) {
                statusType = 'MANUAL_PRESENT';
            }

            setFormData({
                type: statusType,
                details: `Manual edit for ${dayRecord.date}`,
                selectedPunches: dayPunches.map(p => p.id),
                lateMinutes: lateMinutes,
                earlyCheckoutMinutes: earlyCheckoutMinutes,
                isAbnormal: dayRecord.abnormal || false
            });
        }
    }, [dayRecord, punches, open]);

    const updateDayMutation = useMutation({
        mutationFn: async (data) => {
            // This would typically update the analysis result directly
            // For now, we create an exception to track manual overrides
            const [day, month, year] = dayRecord.date.split('/');
            const dateStr = `${year}-${month}-${day}`;

            // Store the punch selections and adjustments
            return await base44.entities.Exception.create({
                project_id: project.id,
                attendance_id: attendanceId,
                date_from: dateStr,
                date_to: dateStr,
                type: 'MANUAL_ADJUSTMENT',
                details: JSON.stringify({
                    selectedPunches: data.selectedPunches,
                    lateMinutes: data.lateMinutes,
                    earlyCheckoutMinutes: data.earlyCheckoutMinutes,
                    isAbnormal: data.isAbnormal,
                    notes: data.details
                })
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            queryClient.invalidateQueries(['results', project.id]);
            toast.success('Day record updated successfully. Re-run analysis to apply changes.');
            onClose();
        },
        onError: () => {
            toast.error('Failed to update day record');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!dayRecord) return;
        updateDayMutation.mutate(formData);
    };

    const togglePunch = (punchId) => {
        setFormData(prev => ({
            ...prev,
            selectedPunches: prev.selectedPunches.includes(punchId)
                ? prev.selectedPunches.filter(id => id !== punchId)
                : [...prev.selectedPunches, punchId]
        }));
    };

    if (!dayRecord) return null;

    const dayPunches = getDayPunches();

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Day Record: {dayRecord.date}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                    <div>
                        <Label>Status Override</Label>
                        <Select
                            value={formData.type}
                            onValueChange={(value) => setFormData({ ...formData, type: value })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MANUAL_PRESENT">Present</SelectItem>
                                <SelectItem value="MANUAL_ABSENT">Absent</SelectItem>
                                <SelectItem value="MANUAL_HALF">Half Day</SelectItem>
                                <SelectItem value="OFF">Off/Leave</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Punch Selection */}
                    <div className="border rounded-lg p-4 space-y-3">
                        <Label className="text-base font-semibold">Select Punches to Include</Label>
                        <p className="text-sm text-slate-600">Choose which punches should be used for calculations</p>
                        {dayPunches.length === 0 ? (
                            <p className="text-sm text-slate-500 italic">No punches recorded for this day</p>
                        ) : (
                            <div className="space-y-2">
                                {dayPunches.map((punch) => (
                                    <div key={punch.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded">
                                        <Checkbox
                                            id={`punch-${punch.id}`}
                                            checked={formData.selectedPunches.includes(punch.id)}
                                            onCheckedChange={() => togglePunch(punch.id)}
                                        />
                                        <label
                                            htmlFor={`punch-${punch.id}`}
                                            className="text-sm flex-1 cursor-pointer"
                                        >
                                            {punch.timestamp_raw}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Late Minutes */}
                    <div>
                        <Label htmlFor="lateMinutes">Late Minutes (Total)</Label>
                        <Input
                            id="lateMinutes"
                            type="number"
                            min="0"
                            value={formData.lateMinutes}
                            onChange={(e) => setFormData({ ...formData, lateMinutes: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                        />
                        <p className="text-xs text-slate-500 mt-1">Combined AM + PM late minutes</p>
                    </div>

                    {/* Early Checkout Minutes */}
                    <div>
                        <Label htmlFor="earlyCheckoutMinutes">Early Checkout Minutes (Total)</Label>
                        <Input
                            id="earlyCheckoutMinutes"
                            type="number"
                            min="0"
                            value={formData.earlyCheckoutMinutes}
                            onChange={(e) => setFormData({ ...formData, earlyCheckoutMinutes: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                        />
                        <p className="text-xs text-slate-500 mt-1">Combined AM + PM early checkout minutes</p>
                    </div>

                    {/* Abnormality Toggle */}
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                        <Checkbox
                            id="isAbnormal"
                            checked={formData.isAbnormal}
                            onCheckedChange={(checked) => setFormData({ ...formData, isAbnormal: checked })}
                        />
                        <div className="flex-1">
                            <label htmlFor="isAbnormal" className="text-sm font-medium cursor-pointer">
                                Mark as Abnormal
                            </label>
                            <p className="text-xs text-slate-500">Flag this day for special attention</p>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <Label>Notes/Reason</Label>
                        <Input
                            value={formData.details}
                            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                            placeholder="Reason for manual edit"
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={updateDayMutation.isPending}>
                            {updateDayMutation.isPending ? 'Saving...' : 'Save Changes'}
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