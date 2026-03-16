import React, { useState, useEffect, useMemo } from 'react';
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

export default function EditDayRecordDialog({ open, onClose, onSave, dayRecord, project, attendanceId, analysisResult, dailyBreakdownData }) {
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
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';

    useEffect(() => {
        if (dayRecord) {
            setFormData({
                type: dayRecord.status === 'Absent' ? 'MANUAL_ABSENT' : 
                      dayRecord.status.includes('Half') ? 'MANUAL_HALF' : 
                      dayRecord.status.includes('Off') ? 'OFF' : 'MANUAL_PRESENT',
                details: dayRecord.details || '',
                lateMinutes: dayRecord.lateMinutesTotal || 0,
                earlyCheckoutMinutes: parseInt(dayRecord.earlyCheckoutInfo) || 0,
                otherMinutes: dayRecord.otherMinutes || 0,
                isAbnormal: dayRecord.abnormal || false,
                shiftOverride: dayRecord.hasOverride && dayRecord.shiftObject ? {
                    enabled: true,
                    am_start: dayRecord.shiftObject.am_start || '',
                    am_end: dayRecord.shiftObject.am_end || '',
                    pm_start: dayRecord.shiftObject.pm_start || '',
                    pm_end: dayRecord.shiftObject.pm_end || ''
                } : {
                    enabled: false,
                    am_start: '',
                    am_end: '',
                    pm_start: '',
                    pm_end: ''
                }
            });
        }
    }, [dayRecord]);

    const parseTime = (timeStr, includeSeconds = false) => {
        try {
            if (!timeStr || timeStr === '—' || timeStr === '-') return null;
            if (includeSeconds) {
                let match = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
                if (match) {
                    let h = parseInt(match[1]);
                    if (match[4].toUpperCase() === 'PM' && h !== 12) h += 12;
                    if (match[4].toUpperCase() === 'AM' && h === 12) h = 0;
                    const d = new Date(); d.setHours(h, parseInt(match[2]), parseInt(match[3]), 0);
                    return d;
                }
            }
            let match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (match) {
                let h = parseInt(match[1]);
                if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
                if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
                const d = new Date(); d.setHours(h, parseInt(match[2]), 0, 0);
                return d;
            }
            return null;
        } catch { return null; }
    };

    const matchPunchesToShiftPoints = (dayPunches, shift, nextDateStr = null) => {
        if (!shift || dayPunches.length === 0) return [];
        const includeSeconds = project?.company?.includes('Al Maraghi');
        const punchesWithTime = dayPunches.map(p => {
            const t = parseTime(p.timestamp_raw, includeSeconds);
            if (!t) return null;
            const isNext = nextDateStr && (p.punch_date === nextDateStr || p._isNextDayPunch);
            const adj = isNext ? new Date(t.getTime() + 86400000) : t;
            return { ...p, time: adj };
        }).filter(p => p).sort((a, b) => a.time.getTime() - b.time.getTime());

        const pmEnd = parseTime(shift.pm_end, includeSeconds);
        let adjPmEnd = pmEnd;
        if (pmEnd && pmEnd.getHours() === 0 && pmEnd.getMinutes() === 0) adjPmEnd = new Date(pmEnd.getTime() + 86400000);

        const points = [
            { type: 'AM_START', time: parseTime(shift.am_start, includeSeconds) },
            { type: 'AM_END', time: parseTime(shift.am_end, includeSeconds) },
            { type: 'PM_START', time: parseTime(shift.pm_start, includeSeconds) },
            { type: 'PM_END', time: adjPmEnd }
        ].filter(p => p.time);

        return punchesWithTime.map(p => {
            let best = null, minDist = Infinity;
            points.forEach(pt => {
                const dist = Math.abs(p.time.getTime() - pt.time.getTime()) / 60000;
                if (dist < 180 && dist < minDist) { minDist = dist; best = pt; }
            });
            return { punch: p, matchedTo: best?.type, shiftTime: best?.time };
        });
    };

    const recalculateTotals = (result, overrides) => {
        let late = result.late_minutes || 0, early = result.early_checkout_minutes || 0, other = result.other_minutes || 0;
        const abnormal = new Set((result.abnormal_dates || '').split(',').filter(Boolean));
        Object.entries(overrides).forEach(([date, ov]) => {
            if (ov) {
                late = late - (ov.originalLateMinutes || 0) + (ov.lateMinutes || 0);
                early = early - (ov.originalEarlyCheckout || 0) + (ov.earlyCheckoutMinutes || 0);
                other = other - (ov.originalOtherMinutes || 0) + (ov.otherMinutes || 0);
                if (ov.isAbnormal) abnormal.add(date); else abnormal.delete(date);
            }
        });
        const totalGrace = result.grace_minutes || 0;
        const baseAfterGrace = Math.max(0, (late + early) - totalGrace);
        const deductible = Math.max(0, baseAfterGrace - (result.approved_minutes || 0));
        return { late, early, other, deductible, abnormal: Array.from(abnormal).join(',') };
    };

    const updateDayMutation = useMutation({
        mutationFn: async (data) => {
            const [d, m, y] = dayRecord.date.split('/');
            const dateStr = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
            const latest = (await base44.entities.AnalysisResult.filter({ id: analysisResult.id }))[0] || analysisResult;
            let overrides = {}; try { if (latest.day_overrides) overrides = JSON.parse(latest.day_overrides); } catch(e){}
            const ex = overrides[dateStr];
            overrides[dateStr] = {
                type: data.type, details: data.details, lateMinutes: Number(data.lateMinutes), earlyCheckoutMinutes: Number(data.earlyCheckoutMinutes),
                otherMinutes: Number(data.otherMinutes), isAbnormal: !!data.isAbnormal, is_ramadan_day: false,
                is_manual_minutes: true,
                originalLateMinutes: ex?.originalLateMinutes ?? (Number(dayRecord.lateMinutesTotal) || 0),
                originalEarlyCheckout: ex?.originalEarlyCheckout ?? (parseInt(dayRecord.earlyCheckoutInfo) || 0),
                originalOtherMinutes: ex?.originalOtherMinutes ?? (Number(dayRecord.otherMinutes) || 0),
                shiftOverride: data.shiftOverride.enabled ? { am_start: data.shiftOverride.am_start, am_end: data.shiftOverride.am_end, pm_start: data.shiftOverride.pm_start, pm_end: data.shiftOverride.pm_end } : null
            };
            const totals = recalculateTotals(latest, overrides);
            await base44.entities.AnalysisResult.update(analysisResult.id, {
                day_overrides: JSON.stringify(overrides), late_minutes: totals.late, early_checkout_minutes: totals.early,
                other_minutes: totals.other, deductible_minutes: totals.deductible, abnormal_dates: totals.abnormal
            });
        },
        onSuccess: () => { queryClient.invalidateQueries(['results']); toast.success('Saved'); onSave?.(); onClose(); }
    });

    const handleSave = (e) => { e.preventDefault(); updateDayMutation.mutate(formData); };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader><DialogTitle>Edit Day Record: {dayRecord?.date}</DialogTitle></DialogHeader>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={formData.type} onValueChange={(val) => setFormData({...formData, type: val})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MANUAL_PRESENT">Present</SelectItem>
                                    <SelectItem value="MANUAL_ABSENT">Absent</SelectItem>
                                    <SelectItem value="MANUAL_HALF">Half Day</SelectItem>
                                    <SelectItem value="OFF">Off</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2"><Label>Late Minutes</Label><Input type="number" value={formData.lateMinutes} onChange={(e) => setFormData({...formData, lateMinutes: e.target.value})} /></div>
                        <div className="space-y-2"><Label>Early Minutes</Label><Input type="number" value={formData.earlyCheckoutMinutes} onChange={(e) => setFormData({...formData, earlyCheckoutMinutes: e.target.value})} /></div>
                        <div className="space-y-2"><Label>Other Minutes</Label><Input type="number" value={formData.otherMinutes} onChange={(e) => setFormData({...formData, otherMinutes: e.target.value})} /></div>
                    </div>
                    <div className="flex items-center space-x-2"><Checkbox id="abnormal" checked={formData.isAbnormal} onCheckedChange={(val) => setFormData({...formData, isAbnormal: !!val})} /><Label htmlFor="abnormal">Abnormal</Label></div>
                    <div className="flex items-center space-x-2"><Checkbox id="shift" checked={formData.shiftOverride.enabled} onCheckedChange={(val) => setFormData({...formData, shiftOverride: {...formData.shiftOverride, enabled: !!val}})} /><Label htmlFor="shift">Override Shift</Label></div>
                    {formData.shiftOverride.enabled && (
                        <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 rounded">
                            <Input placeholder="AM Start" value={formData.shiftOverride.am_start} onChange={(e) => setFormData({...formData, shiftOverride: {...formData.shiftOverride, am_start: e.target.value}})} />
                            <Input placeholder="AM End" value={formData.shiftOverride.am_end} onChange={(e) => setFormData({...formData, shiftOverride: {...formData.shiftOverride, am_end: e.target.value}})} />
                            <Input placeholder="PM Start" value={formData.shiftOverride.pm_start} onChange={(e) => setFormData({...formData, shiftOverride: {...formData.shiftOverride, pm_start: e.target.value}})} />
                            <Input placeholder="PM End" value={formData.shiftOverride.pm_end} onChange={(e) => setFormData({...formData, shiftOverride: {...formData.shiftOverride, pm_end: e.target.value}})} />
                        </div>
                    )}
                    <div className="space-y-2"><Label>Notes</Label><Input value={formData.details} onChange={(e) => setFormData({...formData, details: e.target.value})} /></div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={updateDayMutation.isPending}>{updateDayMutation.isPending ? 'Saving...' : 'Save'}</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
}