import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { parseISO, addDays, subDays, isAfter } from 'date-fns';
import { nowInUAE, formatDateForInput } from '@/components/ui/timezone';

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

    const [showLimitWarning, setShowLimitWarning] = useState(false);
    const queryClient = useQueryClient();

    const todayUAE = nowInUAE();
    const minAllowedDate = formatDateForInput(subDays(todayUAE, 5));
    const maxAllowedDate = formatDateForInput(addDays(todayUAE, 5));

    // Check if company supports half-yearly minutes
    const supportsHalfYearlyMinutes = currentProject?.company === 'Al Maraghi Motors';

    // Fetch half-yearly minutes for selected employee based on date
    const selectedEmployee = employees.find(emp => String(emp.attendance_id) === formData.attendance_id);
    const { data: halfYearlyMinutes } = useQuery({
        queryKey: ['employeeHalfYearlyMinutes', selectedEmployee?.hrms_id, formData.date_from],
        queryFn: async () => {
            if (!selectedEmployee || !formData.date_from || !supportsHalfYearlyMinutes) return null;

            // Get or create half-yearly minutes for this employee and date
            const response = await base44.functions.invoke('getOrCreateQuarterlyMinutes', {
                employee_id: String(selectedEmployee.hrms_id),
                company: selectedEmployee.company,
                date: formData.date_from
            });

            return response.data.success ? response.data : null;
        },
        enabled: !!selectedEmployee && !!formData.date_from && supportsHalfYearlyMinutes
    });

    const createMutation = useMutation({
        mutationFn: async (data) => {
            const minutesToApprove = parseInt(data.allowed_minutes);

            // Update half-yearly minutes usage first (only for companies that support it)
            if (supportsHalfYearlyMinutes) {
                const updateResponse = await base44.functions.invoke('updateQuarterlyMinutes', {
                    employee_id: String(selectedEmployee.hrms_id),
                    company: selectedEmployee.company,
                    date: data.date_from,
                    minutes_to_add: minutesToApprove
                });

                if (!updateResponse.data.success) {
                    throw new Error(updateResponse.data.error || 'Failed to update half-yearly minutes');
                }
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
            queryClient.invalidateQueries(['employeeHalfYearlyMinutes']);
            queryClient.invalidateQueries(['halfYearlyMinutes']);
            toast.success('Pre-approved minutes saved and deducted from half-yearly allowance');
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

        if (formData.date_from < minAllowedDate || formData.date_from > maxAllowedDate) {
            toast.error(`Date must be within ${minAllowedDate} to ${maxAllowedDate}`);
            return;
        }

        // Only check half-yearly minutes balance for companies that support it
        if (supportsHalfYearlyMinutes) {
            const availableMinutes = halfYearlyMinutes?.remaining_minutes || 0;
            if (minutes > availableMinutes) {
                setShowLimitWarning(true);
                return;
            }
        }

        // SINGLE-DAY VALIDATION: date_to must be same as date_from for allowed minutes
        if (formData.date_to && formData.date_to !== formData.date_from) {
            toast.error('Pre-approved minutes can only be for a single day. From and To dates must be the same.');
            return;
        }

        const cutoffDate = parseISO(currentProject.date_to);
        if (isAfter(new Date(), cutoffDate)) {
            toast.error('Approval period has ended. Cannot add new approvals.');
            return;
        }

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
        <>
        {/* Limit Exceeded Warning Popup */}
        {showLimitWarning && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
                <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                    <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="w-6 h-6 text-white" />
                            <h3 className="text-white font-bold text-lg">Minutes Limit Exceeded</h3>
                        </div>
                        <button
                            onClick={() => setShowLimitWarning(false)}
                            className="text-white hover:text-red-200 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="px-6 py-6 text-center space-y-4">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                            <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                        <p className="text-slate-800 font-medium text-base leading-relaxed">
                            You have tried to enter more than the available limit.
                        </p>
                        <p className="text-slate-600 text-sm leading-relaxed">
                            Please contact your reporting officer for further instructions.
                        </p>
                        <div className="pt-2">
                            <Button
                                onClick={() => setShowLimitWarning(false)}
                                className="bg-red-600 hover:bg-red-700 text-white px-8"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        )}

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
                            min={minAllowedDate}
                            max={maxAllowedDate}
                        />
                        <p className="text-xs text-slate-500 mt-1">Pre-approved minutes apply to a single day only (allowed range: {minAllowedDate} to {maxAllowedDate})</p>
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
                                        <SelectItem value="both">Both Late &amp; Early</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
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
        </>
    );
}