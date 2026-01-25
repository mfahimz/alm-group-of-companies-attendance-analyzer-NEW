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

export default function EditExceptionDialog({ open, onClose, exception, projectId }) {
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
        salary_leave_days: ''
    });

    const queryClient = useQueryClient();

    useEffect(() => {
        if (exception && project) {
            // Calculate default salary_leave_days if not set
            let calculatedDays = '';
            if (exception.type === 'ANNUAL_LEAVE' && exception.date_from && exception.date_to) {
                const from = new Date(exception.date_from);
                const to = new Date(exception.date_to);
                const diffTime = Math.abs(to - from);
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
                salary_leave_days: calculatedDays
            });
        }
    }, [exception, project]);

    const updateMutation = useMutation({
        mutationFn: (data) => base44.entities.Exception.update(exception.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', projectId]);
            toast.success('Exception updated successfully');
            onClose();
        },
        onError: () => {
            toast.error('Failed to update exception');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
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

        if (formData.type === 'ANNUAL_LEAVE' && formData.salary_leave_days) {
            cleanedData.salary_leave_days = parseFloat(formData.salary_leave_days);
        }

        updateMutation.mutate(cleanedData);
    };

    if (!exception) return null;

    const needsShiftOverride = formData.type === 'SHIFT_OVERRIDE';
    const needsAllowedMinutes = formData.type === 'ALLOWED_MINUTES';
    const needsEarlyCheckoutMinutes = formData.type === 'MANUAL_EARLY_CHECKOUT';
    const needsSalaryLeaveDays = formData.type === 'ANNUAL_LEAVE';
    
    // Calculate days between dates for annual leave
    const calculateDaysBetween = () => {
        if (formData.date_from && formData.date_to) {
            const from = new Date(formData.date_from);
            const to = new Date(formData.date_to);
            const diffTime = Math.abs(to - from);
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
                                    <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                    <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                    <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                    <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                    <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                    <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                                    <SelectItem value="ANNUAL_LEAVE">Annual Leave / Vacation</SelectItem>
                                    <SelectItem value="ALLOWED_MINUTES">Allowed Minutes (Grace)</SelectItem>
                                    <SelectItem value="CUSTOM">Custom Type (Not used in analysis)</SelectItem>
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
                                        const from = new Date(e.target.value);
                                        const to = new Date(formData.date_to);
                                        const diffTime = Math.abs(to - from);
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
                                        const from = new Date(formData.date_from);
                                        const to = new Date(e.target.value);
                                        const diffTime = Math.abs(to - from);
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
                            <Label className="block">Override Shift Times</Label>
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
                                onChange={(e) => setFormData({ ...formData, early_checkout_minutes: e.target.value })}
                                min="1"
                            />
                            <p className="text-xs text-slate-500 mt-1">Minutes to add to early checkout total</p>
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
                                        onChange={(e) => setFormData({ ...formData, allowed_minutes: e.target.value })}
                                        min="1"
                                    />
                                </div>
                                <div>
                                    <Label>Apply To *</Label>
                                    <Select
                                        value={formData.allowed_minutes_type}
                                        onValueChange={(value) => setFormData({ ...formData, allowed_minutes_type: value })}
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
                            <p className="text-xs text-slate-500">Minutes to excuse due to natural calamity or personal reasons</p>
                        </div>
                    )}

                    {needsSalaryLeaveDays && (
                        <div className="border-t pt-4">
                            <Label>Salary Leave Days (for salary calculation only) *</Label>
                            <Input
                                type="number"
                                step="0.01"
                                placeholder={project?.company === 'Al Maraghi Auto Repairs' ? "e.g. 9.00" : "e.g. 9"}
                                value={formData.salary_leave_days}
                                onChange={(e) => setFormData({ ...formData, salary_leave_days: e.target.value })}
                                min="0"
                            />
                            <p className="text-xs text-green-600 mt-1">
                                💡 Calculated: {calculateDaysBetween()} days between selected dates. Edit if partial days needed.
                            </p>
                            {project?.company === 'Al Maraghi Auto Repairs' && (
                                <p className="text-xs text-amber-600 mt-1">
                                    ⚠️ This value is used ONLY for salary calculation, not for attendance reports.
                                </p>
                            )}
                        </div>
                    )}

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
                            disabled={updateMutation.isPending}
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