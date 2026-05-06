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
import TimePicker from '../ui/QuickTimePicker';
import { useQuery } from '@tanstack/react-query';
import { getFilteredExceptionTypes, formatExceptionTypeLabel } from '@/lib/exception-types';
import ExceptionForm from './ExceptionForm';

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


    const selectedEmployeeAttId = exception?.attendance_id && exception?.attendance_id !== 'ALL' ? exception?.attendance_id : null;
    const { data: employeeShifts = [] } = useQuery({
        queryKey: ['shiftsForEmployee', projectId, selectedEmployeeAttId],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: projectId, attendance_id: selectedEmployeeAttId }),
        enabled: !!selectedEmployeeAttId && formData.type === 'SKIP_PUNCH',
    });
    const selectedEmployeeIsSingleShift = employeeShifts.length > 0
        ? (employeeShifts[0].is_single_shift === true || !employeeShifts[0].am_end || !employeeShifts[0].pm_start ||
           String(employeeShifts[0].am_end).trim() === '' || String(employeeShifts[0].pm_start).trim() === '' ||
           employeeShifts[0].am_end === '-' || employeeShifts[0].pm_start === '-')
        : null;

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
                early_checkout_minutes: exception.early_checkout_minutes ?? '',
                allowed_minutes: exception.allowed_minutes ?? '',
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
        onSuccess: (updatedException) => {
            queryClient.invalidateQueries({ queryKey: ['exceptions', projectId] });
            toast.success('Exception updated successfully');

            // Part B: Sync to AnnualLeave (Silent background sync)
            if (updatedException && updatedException.type === 'ANNUAL_LEAVE') {
                (async () => {
                    try {
                        const leaves = await base44.entities.AnnualLeave.filter({
                            attendance_id: updatedException.attendance_id
                        });
                        const matchingLeave = leaves.find(l => 
                            (updatedException.date_from <= l.date_to && updatedException.date_to >= l.date_from)
                        );
                        if (matchingLeave) {
                            await base44.entities.AnnualLeave.update(matchingLeave.id, {
                                date_from: updatedException.date_from,
                                date_to: updatedException.date_to,
                                salary_leave_days: updatedException.salary_leave_days
                            });
                        }

                        // ChecklistItem Sync: Update related checklist items
                        if (updatedException.annual_leave_id) {
                            const checklistItems = await base44.entities.ChecklistItem.filter({
                                project_id: updatedException.project_id,
                                linked_annual_leave_id: updatedException.annual_leave_id
                            });

                            for (let i = 0; i < checklistItems.length; i += 10) {
                                const batch = checklistItems.slice(i, i + 10);
                                await Promise.all(batch.map(async (item) => {
                                    const employeeName = item.task_description.split(' | ')[0];
                                    const newDateRangeStr = `${updatedException.date_from} to ${updatedException.date_to}`;
                                    const newDays = updatedException.salary_leave_days || '';
                                    const newDescription = `${employeeName} | ${newDateRangeStr} | Days: ${newDays}`;
                                    return base44.entities.ChecklistItem.update(item.id, {
                                        task_description: newDescription
                                    });
                                }));
                                if (i + 10 < checklistItems.length) {
                                    await new Promise(resolve => setTimeout(resolve, 300));
                                }
                            }
                        }
                    } catch (e) {
                        // Skip silently
                    }
                })();
            }

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

        if (formData.type === 'ALLOWED_MINUTES' && (formData.allowed_minutes !== '' && formData.allowed_minutes != null)) {
            const val = parseInt(formData.allowed_minutes);
            if (!isNaN(val)) {
                cleanedData.allowed_minutes = val;
                cleanedData.allowed_minutes_type = formData.allowed_minutes_type || 'both';
            }
        }

        if (formData.type === 'MANUAL_OTHER_MINUTES' && (formData.allowed_minutes !== '' && formData.allowed_minutes != null)) {
            const val = parseInt(formData.allowed_minutes);
            if (!isNaN(val)) {
                cleanedData.allowed_minutes = val;
            }
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
    // needsSalaryLeaveDays: salary leave days field is only relevant for Al Maraghi Motors
    // other companies do not use this field for salary calculation
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
                    <ExceptionForm
                        formData={formData}
                        setFormData={setFormData}
                        employees={[]} // Not needed in edit mode
                        project={project}
                        isAdmin={true} // Edit mode usually has admin perms or is restricted at dialog level
                        isSupervisor={true}
                        canEditAllowedMinutes={canEditAllowedMinutes}
                        mode="edit"
                        selectedEmployeeIsSingleShift={selectedEmployeeIsSingleShift}
                    />

                    <div className="flex gap-3 pt-4 border-t">
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