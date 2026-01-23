import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { format, parseISO, addDays, isAfter } from 'date-fns';

export default function PreApprovalDialog({ 
    open, 
    onClose, 
    projectId, 
    employees, 
    deptHeadVerification, 
    currentProject,
    onSuccess 
}) {
    const [formData, setFormData] = useState({
        attendance_id: '',
        date_from: '',
        date_to: '',
        allowed_minutes: '',
        allowed_minutes_type: 'both',
        details: ''
    });

    const queryClient = useQueryClient();

    // Fetch quarterly minutes for selected employee based on date
    const selectedEmployee = employees.find(emp => String(emp.attendance_id) === formData.attendance_id);
    const { data: quarterlyMinutes } = useQuery({
        queryKey: ['employeeQuarterlyMinutes', selectedEmployee?.hrms_id, formData.date_from],
        queryFn: async () => {
            if (!selectedEmployee || !formData.date_from) return null;
            
            // Get or create quarterly minutes for this employee and date
            const response = await base44.functions.invoke('getOrCreateQuarterlyMinutes', {
                employee_id: String(selectedEmployee.hrms_id),
                company: selectedEmployee.company,
                date: formData.date_from
            });
            
            return response.data.success ? response.data : null;
        },
        enabled: !!selectedEmployee && !!formData.date_from
    });

    const createMutation = useMutation({
        mutationFn: async (data) => {
            const minutesToApprove = parseInt(data.allowed_minutes);
            
            // Update quarterly minutes usage first
            const updateResponse = await base44.functions.invoke('updateQuarterlyMinutes', {
                employee_id: String(selectedEmployee.hrms_id),
                company: selectedEmployee.company,
                date: data.date_from,
                minutes_to_add: minutesToApprove
            });

            if (!updateResponse.data.success) {
                throw new Error(updateResponse.data.error || 'Failed to update quarterly minutes');
            }

            // Check if approval already exists for this date
            const existing = await base44.entities.Exception.filter({
                project_id: projectId,
                attendance_id: data.attendance_id,
                date_from: data.date_from,
                date_to: data.date_to,
                type: 'ALLOWED_MINUTES'
            });

            if (existing.length > 0) {
                // Update existing
                return await base44.entities.Exception.update(existing[0].id, {
                    allowed_minutes: minutesToApprove,
                    allowed_minutes_type: data.allowed_minutes_type,
                    details: data.details || null
                });
            } else {
                // Create new
                return await base44.entities.Exception.create({
                    project_id: projectId,
                    attendance_id: data.attendance_id,
                    date_from: data.date_from,
                    date_to: data.date_to,
                    type: 'ALLOWED_MINUTES',
                    allowed_minutes: minutesToApprove,
                    allowed_minutes_type: data.allowed_minutes_type || 'both',
                    approval_status: 'approved_dept_head',
                    approved_by_dept_head: deptHeadVerification.assignment.employee_id,
                    dept_head_approval_date: new Date().toISOString(),
                    details: data.details || null,
                    use_in_analysis: true
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['preApprovals', projectId]);
            queryClient.invalidateQueries(['employeeQuarterlyMinutes']);
            queryClient.invalidateQueries(['quarterlyMinutes']);
            toast.success('Pre-approved minutes saved and deducted from quarterly allowance');
            handleClose();
            onSuccess?.();
        },
        onError: (error) => {
            toast.error('Failed to save pre-approval: ' + error.message);
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.attendance_id || !formData.date_from || !formData.allowed_minutes) {
            toast.error('Please fill in all required fields');
            return;
        }

        const minutes = parseInt(formData.allowed_minutes);
        if (isNaN(minutes) || minutes <= 0) {
            toast.error('Please enter valid minutes');
            return;
        }

        const availableMinutes = quarterlyMinutes?.remaining_minutes || 0;
        if (minutes > availableMinutes) {
            toast.error(`Allowed minutes cannot exceed available balance of ${availableMinutes} minutes`);
            return;
        }

        // SINGLE-DAY VALIDATION: date_to must be same as date_from for allowed minutes
        if (formData.date_to && formData.date_to !== formData.date_from) {
            toast.error('Pre-approved minutes can only be for a single day. From and To dates must be the same.');
            return;
        }

        // ========== TEST MODE: Disable date limit check ==========
        // TODO: REVERT THIS AFTER TESTING - Re-enable cutoff date validation
        // const cutoffDate = addDays(parseISO(currentProject.date_to), -1);
        // if (isAfter(new Date(), cutoffDate)) {
        //     toast.error('Approval period has ended. Cannot add new approvals.');
        //     return;
        // }
        // ========== END TEST MODE ==========

        createMutation.mutate({
            ...formData,
            date_to: formData.date_from
        });
    };

    const handleClose = () => {
        setFormData({
            attendance_id: '',
            date_from: '',
            date_to: '',
            allowed_minutes: '',
            allowed_minutes_type: 'both',
            details: ''
        });
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add Pre-Approved Minutes</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Employee *</Label>
                            <Select
                                value={formData.attendance_id}
                                onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.length === 0 ? (
                                        <div className="p-2 text-sm text-slate-500">
                                            No subordinate employees available
                                        </div>
                                    ) : (
                                        employees.map(emp => (
                                            <SelectItem key={emp.id} value={String(emp.attendance_id)}>
                                                {emp.name} (ID: {emp.attendance_id})
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Exception Type *</Label>
                            <Input 
                                value="Allowed Minutes (Pre-Approved)"
                                disabled
                                className="bg-slate-50"
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Date *</Label>
                        <Input
                            type="date"
                            value={formData.date_from}
                            onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                        />
                        <p className="text-xs text-slate-500 mt-1">Pre-approved minutes apply to a single day only</p>
                    </div>

                    <div className="border-t pt-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Allowed Minutes *</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g., 60"
                                    value={formData.allowed_minutes}
                                    onChange={(e) => setFormData({ ...formData, allowed_minutes: e.target.value })}
                                    min="1"
                                    max={quarterlyMinutes?.remaining_minutes || 0}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Available in {quarterlyMinutes?.quarter_name || 'quarter'}: {quarterlyMinutes?.remaining_minutes || 0} minutes
                                </p>
                                <p className="text-xs text-blue-600 mt-1">
                                    {quarterlyMinutes?.quarter_period || 'Select date to see quarter'}
                                </p>
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
                        <p className="text-xs text-slate-500">Minutes to waive due to approved reasons</p>
                    </div>

                    <div className="border-t pt-4">
                        <Label>Details / Reason</Label>
                        <Input
                            value={formData.details}
                            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                            placeholder="e.g., Hospital appointment, Personal emergency"
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button 
                            type="submit" 
                            className="bg-indigo-600 hover:bg-indigo-700"
                            disabled={createMutation.isPending}
                        >
                            {createMutation.isPending ? 'Saving...' : 'Save Pre-Approval'}
                        </Button>
                        <Button type="button" variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}