import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import TimePicker from '../ui/TimePicker';
import { useQuery } from '@tanstack/react-query';
import { getFilteredExceptionTypes, formatExceptionTypeLabel } from '@/lib/exception-types';

export default function EditExceptionDialog({ open, onClose, exception, projectId, canEditAllowedMinutes }) {
    const { data: project } = useQuery({
        queryKey: ['project', projectId],
        queryFn: async () => {
            const projects = await base44.entities.Project.filter({ id: projectId });
            return projects[0];
        },
        enabled: !!projectId
    });
    const [formData, setFormData] = useState({
        type: '',
        date_from: '',
        date_to: '',
        details: '',
        custom_type_name: '',
        new_am_start: '',
        new_am_end: '',
        new_pm_start: '',
        new_pm_end: '',
        early_checkout_minutes: '',
        allowed_minutes: '',
        allowed_minutes_type: 'both',
        include_friday: false,
        salary_leave_days: '',
        punch_to_skip: 'AM_PUNCH_IN',
        half_day_target: 'AM',
        target_punch: 'AM_START',
        new_weekly_off: '',
        working_day_override: ''
    });

    const queryClient = useQueryClient();

    /**
     * Clears only the four shift override time fields (new_am_start, new_am_end,
     * new_pm_start, new_pm_end) in the formData state to empty strings.
     * The section remains visible since the type stays SHIFT_OVERRIDE.
     */
    const clearShiftOverride = () => {
        setFormData(prev => ({
            ...prev,
            new_am_start: '',
            new_am_end: '',
            new_pm_start: '',
            new_pm_end: ''
        }));
    };

    useEffect(() => {
        if (exception && project) {
            // Calculate default salary_leave_days if not set
            let calculatedDays = '';
            if (exception.type === 'ANNUAL_LEAVE' && exception.date_from && exception.date_to) {
                const fromTime = new Date(exception.date_from).getTime();
                const toTime = new Date(exception.date_to).getTime();
                const diffTime = Math.abs(toTime - fromTime);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                calculatedDays = exception.salary_leave_days ?? diffDays;
            }

            setFormData({
                type: exception.type || '',
                date_from: exception.date_from || '',
                date_to: exception.date_to || '',
                details: exception.details || '',
                custom_type_name: exception.custom_type_name || '',
                new_am_start: exception.new_am_start || '',
                new_am_end: exception.new_am_end || '',
                new_pm_start: exception.new_pm_start || '',
                new_pm_end: exception.new_pm_end || '',
                early_checkout_minutes: exception.early_checkout_minutes || '',
                allowed_minutes: exception.allowed_minutes || '',
                allowed_minutes_type: exception.allowed_minutes_type || 'both',
                include_friday: exception.include_friday || false,
                salary_leave_days: calculatedDays,
                punch_to_skip: exception.punch_to_skip || 'AM_PUNCH_IN',
                half_day_target: exception.half_day_target || 'AM',
                target_punch: exception.target_punch || 'AM_START',
                new_weekly_off: exception.new_weekly_off || '',
                working_day_override: exception.working_day_override || ''
            });
        }
    }, [exception, project]);

    const updateMutation = useMutation({
        mutationFn: (data) => base44.entities.Exception.update(exception.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exceptions', projectId] });
            toast.success('Exception updated successfully');
            onClose();
        },
        onError: () => {
            toast.error('Failed to update exception');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if ((exception?.type === 'ALLOWED_MINUTES' || formData.type === 'ALLOWED_MINUTES') && !canEditAllowedMinutes) {
            toast.error("Only Admin and CEO can edit allowed minutes.");
            return;
        }
        
        // Clean up data based on type
        const cleanedData = {
            type: formData.type,
            date_from: formData.date_from,
            date_to: formData.date_to,
            details: formData.details || null
        };

        if (formData.type === 'CUSTOM') {
            cleanedData.custom_type_name = formData.custom_type_name?.trim() || 'Custom';
            cleanedData.is_custom_type = true;
            cleanedData.use_in_analysis = false;
        }

        if (formData.type === 'SHIFT_OVERRIDE') {
            cleanedData.new_am_start = formData.new_am_start || null;
            cleanedData.new_am_end = formData.new_am_end || null;
            cleanedData.new_pm_start = formData.new_pm_start || null;
            cleanedData.new_pm_end = formData.new_pm_end || null;
            cleanedData.include_friday = formData.include_friday || false;
        }

        if (formData.type === 'ALLOWED_MINUTES' && formData.allowed_minutes) {
            cleanedData.allowed_minutes = parseInt(formData.allowed_minutes);
            cleanedData.allowed_minutes_type = formData.allowed_minutes_type || 'both';
        }

        // MANUAL_OTHER_MINUTES: save the entered minutes into allowed_minutes.
        // The analysis engine reads allowed_minutes for this type and adds it
        // directly to other_minutes for the day — no late/early impact.
        if (formData.type === 'MANUAL_OTHER_MINUTES' && formData.allowed_minutes) {
            cleanedData.allowed_minutes = parseInt(formData.allowed_minutes);
        }

        if (formData.type === 'ANNUAL_LEAVE' && formData.salary_leave_days !== '' && formData.salary_leave_days !== null && formData.salary_leave_days !== undefined) {
            const salaryLeaveDays = Number(formData.salary_leave_days);
            if (Number.isFinite(salaryLeaveDays) && salaryLeaveDays >= 0) {
                cleanedData.salary_leave_days = salaryLeaveDays;
            }
        }

        if (formData.type === 'SKIP_PUNCH') {
            cleanedData.punch_to_skip = formData.punch_to_skip;
        }

        if (formData.type === 'HALF_DAY_HOLIDAY') {
            cleanedData.half_day_target = formData.half_day_target || 'AM';
            cleanedData.attendance_id = 'ALL';
        }

        if (formData.type === 'ALLOWED_MINUTES' && formData.allowed_minutes) {
            cleanedData.target_punch = formData.target_punch || null;
        }

        if (formData.type === 'DAY_SWAP') {
            cleanedData.new_weekly_off = formData.new_weekly_off;
            cleanedData.working_day_override = formData.working_day_override;
        }

        updateMutation.mutate(cleanedData);
    };

    if (!exception) return null;

    const needsShiftOverride = formData.type === 'SHIFT_OVERRIDE';
    const needsAllowedMinutes = formData.type === 'ALLOWED_MINUTES';
    const needsEarlyCheckoutMinutes = formData.type === 'MANUAL_EARLY_CHECKOUT';
    const needsSalaryLeaveDays = formData.type === 'ANNUAL_LEAVE';
    const needsSkipPunch = formData.type === 'SKIP_PUNCH';
    const needsHalfDayHoliday = formData.type === 'HALF_DAY_HOLIDAY';
    const needsDaySwap = formData.type === 'DAY_SWAP';
    // Controls the Other Minutes input — shown only for MANUAL_OTHER_MINUTES type.
    // These minutes are added directly to the other_minutes field in analysis, not to late/early.
    const needsManualOtherMinutes = formData.type === 'MANUAL_OTHER_MINUTES';
    
    // Calculate days between dates for annual leave
    const calculateDaysBetween = () => {
        if (formData.date_from && formData.date_to) {
            const fromTime = new Date(formData.date_from).getTime();
            const toTime = new Date(formData.date_to).getTime();
            const diffTime = Math.abs(toTime - fromTime);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            return diffDays;
        }
        return 0;
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Exception</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Employee ID</Label>
                            <Input 
                                value={exception.attendance_id === 'ALL' ? 'All Employees' : exception.attendance_id}
                                disabled
                                className="bg-slate-50"
                            />
                        </div>
                        <div>
                            <Label>Exception Type *</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(value) => setFormData({ ...formData, type: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
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

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>From Date *</Label>
                            <Input
                                type="date"
                                value={formData.date_from}
                                onChange={(e) => {
                                    setFormData({ ...formData, date_from: e.target.value });
                                    // Auto-calculate salary_leave_days for annual leave
                                    if (needsSalaryLeaveDays && formData.date_to) {
                                        const fromTime = new Date(e.target.value).getTime();
                                        const toTime = new Date(formData.date_to).getTime();
                                        const diffTime = Math.abs(toTime - fromTime);
                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                                        setFormData(prev => ({ ...prev, salary_leave_days: diffDays.toFixed(2) }));
                                    }
                                }}
                            />
                        </div>
                        <div>
                            <Label>To Date *</Label>
                            <Input
                                type="date"
                                value={formData.date_to}
                                onChange={(e) => {
                                    setFormData({ ...formData, date_to: e.target.value });
                                    // Auto-calculate salary_leave_days for annual leave
                                    if (needsSalaryLeaveDays && formData.date_from) {
                                        const fromTime = new Date(formData.date_from).getTime();
                                        const toTime = new Date(e.target.value).getTime();
                                        const diffTime = Math.abs(toTime - fromTime);
                                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                                        setFormData(prev => ({ ...prev, salary_leave_days: diffDays.toFixed(2) }));
                                    }
                                }}
                            />
                        </div>
                    </div>

                    {formData.type === 'CUSTOM' && (
                        <div className="border-t pt-4">
                            <Label>Custom Exception Type Name</Label>
                            <Input
                                placeholder="Enter custom type name (e.g. Training, Site Visit)"
                                value={formData.custom_type_name}
                                onChange={(e) => setFormData({ ...formData, custom_type_name: e.target.value })}
                            />
                            <p className="text-xs text-amber-600 mt-1">
                                ⚠️ Custom types are for record-keeping only and will never be used in analysis calculations
                            </p>
                        </div>
                    )}

                    {needsShiftOverride && (
                        <div className="space-y-4 border-t pt-4">
                            <div className="flex items-center justify-between">
                                <Label className="block">Override Shift Times</Label>
                                {/* Clear Shift Override Button: Resets the four time input fields to empty strings */}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearShiftOverride}
                                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                    Clear Shift Override
                                </Button>
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                                <div>
                                    <Label className="text-xs">AM Start</Label>
                                    <TimePicker
                                        placeholder="08:00 AM"
                                        value={formData.new_am_start}
                                        onChange={(value) => setFormData({ ...formData, new_am_start: value })}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">AM End</Label>
                                    <TimePicker
                                        placeholder="12:00 PM"
                                        value={formData.new_am_end}
                                        onChange={(value) => setFormData({ ...formData, new_am_end: value })}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">PM Start</Label>
                                    <TimePicker
                                        placeholder="01:00 PM"
                                        value={formData.new_pm_start}
                                        onChange={(value) => setFormData({ ...formData, new_pm_start: value })}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">PM End</Label>
                                    <TimePicker
                                        placeholder="05:00 PM"
                                        value={formData.new_pm_end}
                                        onChange={(value) => setFormData({ ...formData, new_pm_end: value })}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 border rounded-lg bg-slate-50">
                                <Checkbox
                                    id="include-friday-edit"
                                    checked={formData.include_friday}
                                    onCheckedChange={(checked) => setFormData({ ...formData, include_friday: checked })}
                                />
                                <Label htmlFor="include-friday-edit" className="cursor-pointer">
                                    Include Friday in shift override
                                </Label>
                            </div>
                            <p className="text-xs text-slate-500">
                                {formData.include_friday 
                                    ? 'This override will apply to all days including Friday' 
                                    : 'This override will apply to all working days except Friday'}
                            </p>
                        </div>
                    )}

                    {needsEarlyCheckoutMinutes && (
                        <div className="max-w-xs border-t pt-4">
                            <Label>Early Checkout Minutes *</Label>
                            <Input
                                type="number"
                                placeholder="e.g. 30"
                                value={formData.early_checkout_minutes}
                                onChange={(e) => {
                                    const value = Math.abs(parseInt(e.target.value) || 0);
                                    setFormData({ ...formData, early_checkout_minutes: value || '' });
                                }}
                                min="1"
                            />
                            <p className="text-xs text-slate-500 mt-1">Minutes to add to early checkout total</p>
                        </div>
                    )}

                    {/* MANUAL_OTHER_MINUTES input — shown only when the type is Manual Other Minutes.
                        The entered value is saved to allowed_minutes and read by the analysis engine,
                        which adds it directly to the other_minutes accumulator for the selected day.
                        It does NOT reduce or affect late or early checkout minute totals. */}
                    {needsManualOtherMinutes && (
                        <div className="max-w-xs border-t pt-4">
                            <Label>Other Minutes *</Label>
                            <Input
                                type="number"
                                placeholder="e.g. 30"
                                value={formData.allowed_minutes}
                                onChange={(e) => {
                                    const value = Math.abs(parseInt(e.target.value) || 0);
                                    setFormData({ ...formData, allowed_minutes: value || '' });
                                }}
                                min="1"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Minutes added directly to other minutes in attendance analysis for this day
                            </p>
                        </div>
                    )}

                    {needsAllowedMinutes && (
                        <div className="border-t pt-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Allowed Minutes *</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 60"
                                        value={formData.allowed_minutes}
                                        onChange={(e) => {
                                            const value = Math.abs(parseInt(e.target.value) || 0);
                                            setFormData({ ...formData, allowed_minutes: value || '' });
                                        }}
                                        min="1"
                                        disabled={(exception?.type === 'ALLOWED_MINUTES' || formData.type === 'ALLOWED_MINUTES') && !canEditAllowedMinutes}
                                    />
                                </div>
                                <div>
                                    <Label>Apply To *</Label>
                                    <Select
                                        value={formData.allowed_minutes_type}
                                        onValueChange={(value) => setFormData({ ...formData, allowed_minutes_type: value })}
                                        disabled={(exception?.type === 'ALLOWED_MINUTES' || formData.type === 'ALLOWED_MINUTES') && !canEditAllowedMinutes}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="late">Late Arrivals Only</SelectItem>
                                            <SelectItem value="early">Early Checkouts Only</SelectItem>
                                            <SelectItem value="both">Both Late & Early</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            <div className="border border-indigo-100 bg-indigo-50/30 p-3 rounded-lg">
                                <Label className="text-xs text-indigo-700 mb-2 block font-semibold">Unified Grace (Optional)</Label>
                                <Label className="text-[10px] text-indigo-600 mb-1 block">Target a specific punch for these minutes (Report-wide if ID is ALL)</Label>
                                <Select
                                    value={formData.target_punch || 'none'}
                                    onValueChange={(value) => setFormData({ ...formData, target_punch: value === 'none' ? null : value })}
                                    disabled={(exception?.type === 'ALLOWED_MINUTES' || formData.type === 'ALLOWED_MINUTES') && !canEditAllowedMinutes}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="No specific punch target" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">General (Late/Early Deductible)</SelectItem>
                                        <SelectItem value="AM_START">AM Start (Shift In)</SelectItem>
                                        <SelectItem value="AM_END">AM End (Morning Out)</SelectItem>
                                        <SelectItem value="PM_START">PM Start (Afternoon In)</SelectItem>
                                        <SelectItem value="PM_END">PM End (Shift Out)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <p className="text-xs text-slate-500">Minutes to excuse due to natural calamity or personal reasons</p>
                        </div>
                    )}

                    {needsSalaryLeaveDays && (() => {
                        const originalCalendarDays = calculateDaysBetween();
                        const currentVal = parseFloat(formData.salary_leave_days || 0);
                        const lopDays = originalCalendarDays - currentVal;
                        
                        return (
                            <div className="border-t pt-4">
                                <Label>Salary Leave Days (for salary calculation only) *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder={project?.company === 'Al Maraghi Auto Repairs' ? "e.g. 9.00" : "e.g. 9"}
                                    value={formData.salary_leave_days}
                                    onChange={(e) => {
                                        const valStr = e.target.value;
                                        if (valStr && parseFloat(valStr) > originalCalendarDays) {
                                            setFormData({ ...formData, salary_leave_days: originalCalendarDays.toString() });
                                        } else {
                                            setFormData({ ...formData, salary_leave_days: valStr });
                                        }
                                    }}
                                    min="0"
                                    max={originalCalendarDays}
                                />
                                {currentVal > originalCalendarDays && (
                                    <p className="text-xs text-red-500 mt-1">
                                        Cannot exceed original leave duration of {originalCalendarDays} days.
                                    </p>
                                )}
                                <p className="text-xs text-green-600 mt-1">
                                    💡 Calculated: {originalCalendarDays} days between selected dates. Edit if partial days needed.
                                </p>
                                {lopDays > 0 && formData.type === 'ANNUAL_LEAVE' && (
                                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-300 p-2 rounded mt-2">
                                        ⚠️ {lopDays.toFixed(1)} day(s) will become LOP (Loss of Pay)
                                    </div>
                                )}
                                {project?.company === 'Al Maraghi Auto Repairs' && (
                                    <p className="text-xs text-amber-600 mt-1">
                                        ⚠️ This value is used ONLY for salary calculation, not for attendance reports.
                                    </p>
                                )}
                            </div>
                        );
                    })()}

                    {needsSkipPunch && (
                        <div className="border-t pt-4">
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <p className="text-sm text-amber-800 mb-3">
                                    This exception will skip a specific punch (AM Punch In or PM Punch Out) from the analysis.
                                </p>
                                <div>
                                    <Label>Punch to Skip *</Label>
                                    <Select
                                        value={formData.punch_to_skip}
                                        onValueChange={(value) => setFormData({ ...formData, punch_to_skip: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="AM_PUNCH_IN">AM Punch In (Shift Start)</SelectItem>
                                            <SelectItem value="AM_PUNCH_OUT">AM Punch Out (Morning End)</SelectItem>
                                            <SelectItem value="PM_PUNCH_IN">PM Punch In (Afternoon Start)</SelectItem>
                                            <SelectItem value="PM_PUNCH_OUT">PM Punch Out (Shift End)</SelectItem>
                                            <SelectItem value="FULL_SKIP">Full Skip (Ignore All Punches)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    )}

                    {needsHalfDayHoliday && (
                        <div className="border-t pt-4">
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                <p className="text-sm text-indigo-800 mb-3 font-medium">
                                    Half-Day Holiday (Global Configuration)
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Holiday Target *</Label>
                                        <Select
                                            value={formData.half_day_target}
                                            onValueChange={(value) => setFormData({ ...formData, half_day_target: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="AM">Morning Shift (AM)</SelectItem>
                                                <SelectItem value="PM">Afternoon/Evening Shift (PM)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <p className="text-[10px] text-indigo-600">
                                            This will mark the selected shift as a holiday for ALL employees.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {needsDaySwap && (() => {
                        // Show the working_day_override as read-only display
                        return (
                        <div className="border-t pt-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800 mb-4">
                                    This exception swaps a weekly off day with a working day for the selected date range.
                                </p>
                                
                                {formData.working_day_override && (
                                    <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-lg">
                                        <p className="text-sm font-medium text-blue-900">
                                            Current Weekly Off: <span className="text-blue-700 font-bold">{formData.working_day_override}</span>
                                        </p>
                                        <p className="text-xs text-blue-700 mt-1">
                                            This is automatically set as the new working day when you change the weekly off
                                        </p>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>New Weekly Off Day *</Label>
                                        <Select
                                            value={formData.new_weekly_off}
                                            onValueChange={(value) => setFormData({ ...formData, new_weekly_off: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select day..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Sunday">Sunday</SelectItem>
                                                <SelectItem value="Monday">Monday</SelectItem>
                                                <SelectItem value="Tuesday">Tuesday</SelectItem>
                                                <SelectItem value="Wednesday">Wednesday</SelectItem>
                                                <SelectItem value="Thursday">Thursday</SelectItem>
                                                <SelectItem value="Friday">Friday</SelectItem>
                                                <SelectItem value="Saturday">Saturday</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-slate-500 mt-1">This day will become the holiday</p>
                                    </div>
                                    <div>
                                        <Label>New Working Day (Auto-filled) *</Label>
                                        <Input
                                            value={formData.working_day_override}
                                            disabled
                                            className="bg-slate-100"
                                        />
                                        <p className="text-xs text-green-600 mt-1">
                                            ✓ Automatically set to current weekly off
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        );
                    })()}

                    <div className="border-t pt-4">
                        <Label>Details / Reason</Label>
                        <Input
                            value={formData.details}
                            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                            placeholder="Optional notes"
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button 
                            type="submit" 
                            className="bg-indigo-600 hover:bg-indigo-700"
                            disabled={updateMutation.isPending || ((exception?.type === 'ALLOWED_MINUTES' || formData.type === 'ALLOWED_MINUTES') && !canEditAllowedMinutes)}
                        >
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