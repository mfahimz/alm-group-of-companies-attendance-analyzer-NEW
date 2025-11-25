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

export default function EditDayRecordDialog({ open, onClose, dayRecord, project, attendanceId, analysisResult }) {
    const [formData, setFormData] = useState({
        type: 'MANUAL_PRESENT',
        details: '',
        lateMinutes: 0,
        earlyCheckoutMinutes: 0,
        isAbnormal: false
    });
    const queryClient = useQueryClient();

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project?.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id }),
        enabled: !!dayRecord && !!project?.id
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
        if (dayRecord && open && analysisResult) {
            const [day, month, year] = dayRecord.date.split('/');
            const dateStr = `${year}-${month}-${day}`;
            
            // Check if there's an existing override for this date in the analysis result
            let existingOverride = null;
            if (analysisResult.day_overrides) {
                try {
                    const overrides = JSON.parse(analysisResult.day_overrides);
                    existingOverride = overrides[dateStr];
                } catch (e) {
                    // Invalid JSON, ignore
                }
            }

            if (existingOverride) {
                setFormData({
                    type: existingOverride.type || 'MANUAL_PRESENT',
                    details: existingOverride.details || '',
                    lateMinutes: existingOverride.lateMinutes || 0,
                    earlyCheckoutMinutes: existingOverride.earlyCheckoutMinutes || 0,
                    isAbnormal: existingOverride.isAbnormal || false
                });
            } else {
                // Default initialization from calculated values
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
                    details: '',
                    lateMinutes: lateMinutes,
                    earlyCheckoutMinutes: earlyCheckoutMinutes,
                    isAbnormal: dayRecord.abnormal || false
                });
            }
        }
    }, [dayRecord, open, analysisResult]);

    const updateDayMutation = useMutation({
        mutationFn: async (data) => {
            const [day, month, year] = dayRecord.date.split('/');
            const dateStr = `${year}-${month}-${day}`;

            // Fetch the latest analysis result to avoid stale data
            const latestResults = await base44.entities.AnalysisResult.filter({ 
                id: analysisResult.id 
            });
            const latestResult = latestResults[0] || analysisResult;

            // Get existing overrides or create new object
            let overrides = {};
            if (latestResult.day_overrides) {
                try {
                    overrides = JSON.parse(latestResult.day_overrides);
                } catch (e) {
                    overrides = {};
                }
            }

            // Store original values for delta calculation (only if not already overridden)
            const existingOverride = overrides[dateStr];
            overrides[dateStr] = {
                type: data.type,
                details: data.details,
                lateMinutes: data.lateMinutes,
                earlyCheckoutMinutes: data.earlyCheckoutMinutes,
                isAbnormal: data.isAbnormal,
                // Preserve original values from first edit
                originalLateMinutes: existingOverride?.originalLateMinutes ?? data.originalLateMinutes,
                originalEarlyCheckout: existingOverride?.originalEarlyCheckout ?? data.originalEarlyCheckout,
                originalStatus: existingOverride?.originalStatus ?? data.originalStatus
            };

            // Recalculate only abnormal dates
            const updatedTotals = recalculateTotals(latestResult, overrides);

            // Update the analysis result with new overrides and recalculated totals
            return await base44.entities.AnalysisResult.update(analysisResult.id, {
                day_overrides: JSON.stringify(overrides),
                ...updatedTotals
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(['results', project.id]);
            await queryClient.refetchQueries(['results', project.id]);
            toast.success('Day record updated for this report');
            onClose();
        },
        onError: () => {
            toast.error('Failed to update day record');
        }
    });

    const recalculateTotals = (result, overrides) => {
        // Only update abnormal_dates - the late/early/absence totals are stored in day_overrides
        // and calculated when displaying the report table
        const abnormalDates = new Set((result.abnormal_dates || '').split(',').filter(Boolean));
        
        Object.entries(overrides).forEach(([dateStr, override]) => {
            if (override.isAbnormal) {
                abnormalDates.add(dateStr);
            } else {
                abnormalDates.delete(dateStr);
            }
        });

        return {
            abnormal_dates: Array.from(abnormalDates).join(',')
        };
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!dayRecord || !analysisResult) return;
        
        const [day, month, year] = dayRecord.date.split('/');
        const dateStr = `${year}-${month}-${day}`;
        
        // Check if there's already an override for this date
        let existingOverride = null;
        if (analysisResult.day_overrides) {
            try {
                const overrides = JSON.parse(analysisResult.day_overrides);
                existingOverride = overrides[dateStr];
            } catch (e) {}
        }
        
        // Parse original values from dayRecord (only if not already edited)
        let originalLateMinutes = existingOverride?.originalLateMinutes;
        let originalEarlyCheckout = existingOverride?.originalEarlyCheckout;
        
        // If no existing override, calculate from display values
        if (originalLateMinutes === undefined) {
            originalLateMinutes = 0;
            if (dayRecord.lateInfo && dayRecord.lateInfo !== '-') {
                const matches = dayRecord.lateInfo.match(/(\d+)/g);
                if (matches) {
                    originalLateMinutes = parseInt(matches[0]) || 0;
                }
            }
        }
        
        if (originalEarlyCheckout === undefined) {
            originalEarlyCheckout = 0;
            if (dayRecord.earlyCheckoutInfo && dayRecord.earlyCheckoutInfo !== '-') {
                const matches = dayRecord.earlyCheckoutInfo.match(/(\d+)/g);
                if (matches) {
                    originalEarlyCheckout = parseInt(matches[0]) || 0;
                }
            }
        }
        
        updateDayMutation.mutate({
            ...formData,
            originalLateMinutes,
            originalEarlyCheckout
        });
    };

    if (!dayRecord) return null;

    const dayPunches = getDayPunches();

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Day Record: {dayRecord.date}</DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">Changes apply only to this specific report</p>
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

                    {/* Punch Times (Read-only display) */}
                    <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
                        <Label className="text-base font-semibold">Punch Times (Read-only)</Label>
                        {dayPunches.length === 0 ? (
                            <p className="text-sm text-slate-500 italic">No punches recorded for this day</p>
                        ) : (
                            <div className="space-y-1">
                                {dayPunches.map((punch, idx) => (
                                    <div key={punch.id} className="text-sm text-slate-700">
                                        {idx + 1}. {punch.timestamp_raw}
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