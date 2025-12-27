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
import TimePicker from '../ui/TimePicker';

export default function EditDayRecordDialog({ open, onClose, onSave, dayRecord, project, attendanceId, analysisResult }) {
    const [formData, setFormData] = useState({
        type: 'MANUAL_PRESENT',
        details: '',
        lateMinutes: 0,
        earlyCheckoutMinutes: 0,
        otherMinutes: 0,
        isAbnormal: false,
        shiftOverride: {
            enabled: false,
            am_start: '',
            am_end: '',
            pm_start: '',
            pm_end: ''
        }
    });
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project?.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id }),
        enabled: !!dayRecord && !!project?.id
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project?.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id }),
        enabled: !!dayRecord && !!project?.id
    });

    const parseTime = (timeStr) => {
        try {
            if (!timeStr || timeStr === '—') return null;
            
            let timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const period = timeMatch[3].toUpperCase();
                
                if (period === 'PM' && hours !== 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;
                
                const date = new Date();
                date.setHours(hours, minutes, 0, 0);
                return date;
            }
            
            timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                
                const date = new Date();
                date.setHours(hours, minutes, 0, 0);
                return date;
            }
            
            return null;
        } catch {
            return null;
        }
    };

    const matchPunchesToShiftPoints = (dayPunches, shift) => {
        if (!shift || dayPunches.length === 0) return [];
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time).sort((a, b) => a.time - b.time);
        
        if (punchesWithTime.length === 0) return [];
        
        const shiftPoints = [
            { type: 'AM_START', time: parseTime(shift.am_start), label: shift.am_start },
            { type: 'AM_END', time: parseTime(shift.am_end), label: shift.am_end },
            { type: 'PM_START', time: parseTime(shift.pm_start), label: shift.pm_start },
            { type: 'PM_END', time: parseTime(shift.pm_end), label: shift.pm_end }
        ].filter(sp => sp.time);
        
        const matches = [];
        const usedShiftPoints = new Set();
        
        for (const punch of punchesWithTime) {
            let closestMatch = null;
            let minDistance = Infinity;
            let isExtendedMatch = false;
            
            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;
                
                const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                
                if (distance <= 60 && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                }
            }
            
            if (!closestMatch) {
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    
                    const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                    
                    if (distance <= 120 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                        isExtendedMatch = true;
                    }
                }
            }
            
            if (closestMatch) {
                matches.push({
                    punch,
                    matchedTo: closestMatch.type,
                    shiftTime: closestMatch.time,
                    distance: minDistance,
                    isExtendedMatch
                });
                usedShiftPoints.add(closestMatch.type);
            } else {
                matches.push({
                    punch,
                    matchedTo: null,
                    shiftTime: null,
                    distance: null,
                    isExtendedMatch: false
                });
            }
        }
        
        return matches;
    };

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

            // Get current shift for this day
            const currentShift = dayRecord.shift || '';
            const shiftTimes = currentShift.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi) || [];
            
            if (existingOverride) {
                setFormData({
                    type: existingOverride.type || 'MANUAL_PRESENT',
                    details: existingOverride.details || '',
                    lateMinutes: existingOverride.lateMinutes || 0,
                    earlyCheckoutMinutes: existingOverride.earlyCheckoutMinutes || 0,
                    otherMinutes: existingOverride.otherMinutes || 0,
                    isAbnormal: existingOverride.isAbnormal || false,
                    shiftOverride: {
                        enabled: !!existingOverride.shiftOverride,
                        am_start: existingOverride.shiftOverride?.am_start || shiftTimes[0] || '',
                        am_end: existingOverride.shiftOverride?.am_end || shiftTimes[1] || '',
                        pm_start: existingOverride.shiftOverride?.pm_start || shiftTimes[2] || '',
                        pm_end: existingOverride.shiftOverride?.pm_end || shiftTimes[3] || ''
                    }
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
                    otherMinutes: 0,
                    isAbnormal: dayRecord.abnormal || false,
                    shiftOverride: {
                        enabled: false,
                        am_start: shiftTimes[0] || '',
                        am_end: shiftTimes[1] || '',
                        pm_start: shiftTimes[2] || '',
                        pm_end: shiftTimes[3] || ''
                    }
                });
            }
        }
        }, [dayRecord, open, analysisResult]);

        // Auto-calculate late and early checkout when shift override changes
        React.useEffect(() => {
        if (!formData.shiftOverride.enabled || !dayRecord) return;

        const dayPunches = getDayPunches();
        if (dayPunches.length === 0) return;

        const overriddenShift = {
            am_start: formData.shiftOverride.am_start,
            am_end: formData.shiftOverride.am_end,
            pm_start: formData.shiftOverride.pm_start,
            pm_end: formData.shiftOverride.pm_end
        };

        // Check if all shift times are provided
        if (!overriddenShift.am_start || !overriddenShift.pm_end) return;

        const punchMatches = matchPunchesToShiftPoints(dayPunches, overriddenShift);

        let calculatedLate = 0;
        let calculatedEarlyCheckout = 0;

        for (const match of punchMatches) {
            if (!match.matchedTo) continue;

            const punchTime = match.punch.time;
            const shiftTime = match.shiftTime;

            if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                if (punchTime > shiftTime) {
                    const minutes = Math.round((punchTime - shiftTime) / (1000 * 60));
                    calculatedLate += minutes;
                }
            }

            if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                if (punchTime < shiftTime) {
                    const minutes = Math.round((shiftTime - punchTime) / (1000 * 60));
                    calculatedEarlyCheckout += minutes;
                }
            }
        }

        setFormData(prev => ({
            ...prev,
            lateMinutes: calculatedLate,
            earlyCheckoutMinutes: calculatedEarlyCheckout
        }));
        }, [formData.shiftOverride.enabled, formData.shiftOverride.am_start, formData.shiftOverride.am_end, formData.shiftOverride.pm_start, formData.shiftOverride.pm_end, dayRecord]);

    const updateDayMutation = useMutation({
        mutationFn: async (data) => {
            const [day, month, year] = dayRecord.date.split('/');
            const dateStr = `${year}-${month}-${day}`;

            // For regular users, create a pending exception instead of directly updating
            if (isUser) {
                const exceptionData = {
                    project_id: project.id,
                    attendance_id: attendanceId,
                    date_from: dateStr,
                    date_to: dateStr,
                    type: data.type,
                    details: data.details || 'User-requested edit from report',
                    approval_status: 'pending',
                    use_in_analysis: false
                };

                // Add late/early minutes if applicable
                if (data.type === 'MANUAL_EARLY_CHECKOUT' || data.earlyCheckoutMinutes > 0) {
                    exceptionData.early_checkout_minutes = data.earlyCheckoutMinutes;
                }
                if (data.otherMinutes > 0) {
                    exceptionData.other_minutes = data.otherMinutes;
                }

                // Add shift override if enabled
                if (data.shiftOverride?.enabled) {
                    exceptionData.type = 'SHIFT_OVERRIDE';
                    exceptionData.new_am_start = data.shiftOverride.am_start;
                    exceptionData.new_am_end = data.shiftOverride.am_end;
                    exceptionData.new_pm_start = data.shiftOverride.pm_start;
                    exceptionData.new_pm_end = data.shiftOverride.pm_end;
                }

                return await base44.entities.Exception.create(exceptionData);
            }

            // For admin/supervisor, update directly
            const latestResults = await base44.entities.AnalysisResult.filter({ 
                id: analysisResult.id 
            });
            const latestResult = latestResults[0] || analysisResult;

            let overrides = {};
            if (latestResult.day_overrides) {
                try {
                    overrides = JSON.parse(latestResult.day_overrides);
                } catch (e) {
                    overrides = {};
                }
            }

            const existingOverride = overrides[dateStr];
            overrides[dateStr] = {
                type: data.type,
                details: data.details,
                lateMinutes: data.lateMinutes,
                earlyCheckoutMinutes: data.earlyCheckoutMinutes,
                otherMinutes: data.otherMinutes,
                isAbnormal: data.isAbnormal,
                originalLateMinutes: existingOverride?.originalLateMinutes ?? data.originalLateMinutes,
                originalEarlyCheckout: existingOverride?.originalEarlyCheckout ?? data.originalEarlyCheckout,
                originalOtherMinutes: existingOverride?.originalOtherMinutes ?? data.originalOtherMinutes,
                shiftOverride: data.shiftOverride?.enabled ? {
                    am_start: data.shiftOverride.am_start,
                    am_end: data.shiftOverride.am_end,
                    pm_start: data.shiftOverride.pm_start,
                    pm_end: data.shiftOverride.pm_end
                } : null
            };

            const updatedTotals = recalculateTotals(latestResult, overrides);

            return await base44.entities.AnalysisResult.update(analysisResult.id, {
                day_overrides: JSON.stringify(overrides),
                ...updatedTotals
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(['results', project.id]);
            await queryClient.invalidateQueries(['exceptions', project.id]);
            await queryClient.refetchQueries(['results', project.id]);
            if (isUser) {
                toast.success('Edit request submitted for approval');
            } else {
                toast.success('Day record updated for this report');
            }
            if (onSave) onSave();
            onClose();
        },
        onError: () => {
            toast.error(isUser ? 'Failed to submit edit request' : 'Failed to update day record');
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
        let originalOtherMinutes = existingOverride?.originalOtherMinutes;
        
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
        
        if (originalOtherMinutes === undefined) {
            originalOtherMinutes = 0;
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
            originalEarlyCheckout,
            originalOtherMinutes
        });
    };

    if (!dayRecord) return null;

    const dayPunches = getDayPunches();

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Day Record: {dayRecord.date}</DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                        {isUser 
                            ? 'Your changes will be submitted for admin/supervisor approval' 
                            : 'Changes apply only to this specific report'}
                    </p>
                </DialogHeader>
                {isUser && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                        <p className="text-sm text-amber-800">
                            ⚠️ Your edit request will be sent to administrators for approval and will not take effect until approved.
                        </p>
                    </div>
                )}
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
                            disabled={formData.shiftOverride.enabled}
                            className={formData.shiftOverride.enabled ? 'bg-slate-100' : ''}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            {formData.shiftOverride.enabled ? 'Auto-calculated from shift override' : 'Combined AM + PM late minutes'}
                        </p>
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
                            disabled={formData.shiftOverride.enabled}
                            className={formData.shiftOverride.enabled ? 'bg-slate-100' : ''}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            {formData.shiftOverride.enabled ? 'Auto-calculated from shift override' : 'Combined AM + PM early checkout minutes'}
                        </p>
                    </div>

                    {/* Other Minutes */}
                    <div>
                        <Label htmlFor="otherMinutes">Other Minutes</Label>
                        <Input
                            id="otherMinutes"
                            type="number"
                            min="0"
                            value={formData.otherMinutes}
                            onChange={(e) => setFormData({ ...formData, otherMinutes: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Manually add other late/early minutes not captured by regular calculations.
                        </p>
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

                    {/* Shift Override Section */}
                    <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="enableShiftOverride"
                                checked={formData.shiftOverride.enabled}
                                onCheckedChange={(checked) => setFormData({ 
                                    ...formData, 
                                    shiftOverride: { ...formData.shiftOverride, enabled: checked }
                                })}
                            />
                            <div className="flex-1">
                                <label htmlFor="enableShiftOverride" className="text-sm font-semibold cursor-pointer">
                                    Override Shift Times for This Day
                                </label>
                                <p className="text-xs text-slate-500">Late/Early calculations will use these times</p>
                            </div>
                        </div>

                        {formData.shiftOverride.enabled && (
                            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                                <div>
                                    <Label className="text-xs">AM Start</Label>
                                    <TimePicker
                                        value={formData.shiftOverride.am_start}
                                        onChange={(value) => setFormData({
                                            ...formData,
                                            shiftOverride: { ...formData.shiftOverride, am_start: value }
                                        })}
                                        placeholder="8:00 AM"
                                        className="h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">AM End</Label>
                                    <TimePicker
                                        value={formData.shiftOverride.am_end}
                                        onChange={(value) => setFormData({
                                            ...formData,
                                            shiftOverride: { ...formData.shiftOverride, am_end: value }
                                        })}
                                        placeholder="12:00 PM"
                                        className="h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">PM Start</Label>
                                    <TimePicker
                                        value={formData.shiftOverride.pm_start}
                                        onChange={(value) => setFormData({
                                            ...formData,
                                            shiftOverride: { ...formData.shiftOverride, pm_start: value }
                                        })}
                                        placeholder="1:00 PM"
                                        className="h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">PM End</Label>
                                    <TimePicker
                                        value={formData.shiftOverride.pm_end}
                                        onChange={(value) => setFormData({
                                            ...formData,
                                            shiftOverride: { ...formData.shiftOverride, pm_end: value }
                                        })}
                                        placeholder="5:00 PM"
                                        className="h-8"
                                    />
                                </div>
                            </div>
                        )}
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
                            {updateDayMutation.isPending ? (isUser ? 'Submitting...' : 'Saving...') : (isUser ? 'Submit for Approval' : 'Save Changes')}
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