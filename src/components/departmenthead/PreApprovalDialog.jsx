import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, X, AlertCircle } from 'lucide-react';
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

    // FIX 1: showLimitWarning is now rendered INSIDE DialogContent so Radix UI's
    // focus trap does not block interaction with the warning's buttons.
    const [showLimitWarning, setShowLimitWarning] = useState(false);
    const queryClient = useQueryClient();

    // Get current user role using the pre-initialized client
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me(),
        staleTime: Infinity
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    // Admin and CEO bypass logic — must remain completely untouched
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';

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

    // ---------------------------------------------------------------------------
    // STANDARD MUTATION — used when minutes do NOT exceed the half-yearly balance.
    // Admin/CEO also use this path (they bypass the balance check in handleSubmit).
    // This mutation is unchanged from the original implementation.
    // ---------------------------------------------------------------------------
    const createMutation = useMutation({
        mutationFn: async (data) => {
            const minutesToApprove = parseInt(data.allowed_minutes);

            // Update half-yearly minutes usage first (only for companies that support it)
            if (supportsHalfYearlyMinutes) {
                const availableMinutes = halfYearlyMinutes?.remaining_minutes || 0;

                // Admin and CEO bypass the limit; however, excess minutes are intentionally not tracked in used_minutes
                const minutesToUpdate = isAdminOrCEO
                    ? Math.min(minutesToApprove, availableMinutes)
                    : minutesToApprove;

                if (minutesToUpdate > 0) {
                    const updateResponse = await base44.functions.invoke('updateQuarterlyMinutes', {
                        employee_id: String(selectedEmployee.hrms_id),
                        company: selectedEmployee.company,
                        date: data.date_from,
                        minutes_to_add: minutesToUpdate
                    });

                    if (!updateResponse.data.success) {
                        throw new Error(updateResponse.data.error || 'Failed to update half-yearly minutes');
                    }
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

    // ---------------------------------------------------------------------------
    // FIX 3 — SPLIT MUTATION (department head role only, NOT admin or CEO).
    //
    // When a department head approves more minutes than the employee's remaining
    // half-yearly balance, the system splits the total into two separate exceptions
    // on the same date:
    //
    //   1. ALLOWED_MINUTES exception  — amount = employee's remaining balance.
    //      This consumes the full available half-yearly allowance.
    //
    //   2. MANUAL_OTHER_MINUTES exception — amount = excess minutes beyond the balance.
    //      These are treated as "other minutes" which are deductible from attendance.
    //
    // After creating both exceptions the half-yearly record is updated to set
    // remaining minutes to zero (the full balance was consumed by ALLOWED_MINUTES).
    //
    // NOTE: The numeric breakdown is intentionally hidden from the department head
    // in the warning dialog (FIX 2). The dept head only sees a plain-language
    // warning without any amounts or balances. This keeps the UX simple.
    // ---------------------------------------------------------------------------
    const splitMutation = useMutation({
        mutationFn: async (data) => {
            // Compute split amounts for the two exceptions
            const totalMinutes = parseInt(data.allowed_minutes);
            const availableMinutes = halfYearlyMinutes?.remaining_minutes || 0;
            // excessMinutes is the portion that exceeds the half-yearly balance
            const excessMinutes = totalMinutes - availableMinutes;

            const sharedFields = {
                project_id: projectId,
                attendance_id: data.attendance_id,
                date_from: data.date_from,
                date_to: data.date_from, // single-day approval
                allowed_minutes_type: data.allowed_minutes_type || 'both',
                approval_status: 'approved_dept_head',
                approved_by_dept_head: deptHeadVerification.assignment.employee_id,
                dept_head_approval_date: new Date().toISOString(),
                details: data.details || null,
                use_in_analysis: true
            };

            // First exception: ALLOWED_MINUTES — consumes the full remaining balance
            await base44.entities.Exception.create({
                ...sharedFields,
                type: 'ALLOWED_MINUTES',
                allowed_minutes: availableMinutes
            });

            // Second exception: MANUAL_OTHER_MINUTES — records the excess minutes
            // which are deductible from the employee's attendance as "other minutes"
            await base44.entities.Exception.create({
                ...sharedFields,
                type: 'MANUAL_OTHER_MINUTES',
                allowed_minutes: excessMinutes
            });

            // Update the half-yearly record to reflect that the full balance was consumed.
            // We add the full availableMinutes as used, bringing remaining to zero.
            if (availableMinutes > 0) {
                const updateResponse = await base44.functions.invoke('updateQuarterlyMinutes', {
                    employee_id: String(selectedEmployee.hrms_id),
                    company: selectedEmployee.company,
                    date: data.date_from,
                    minutes_to_add: availableMinutes
                });

                if (!updateResponse.data.success) {
                    throw new Error(updateResponse.data.error || 'Failed to update half-yearly minutes');
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['preApprovals', projectId]);
            queryClient.invalidateQueries(['employeeHalfYearlyMinutes']);
            queryClient.invalidateQueries(['halfYearlyMinutes']);
            // Show a plain success message without exposing numeric details
            toast.success('Approval submitted successfully');
            handleClose();
            onSuccess?.();
        },
        onError: (error) => {
            toast.error('Failed to submit approval: ' + error.message);
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

        // Only check half-yearly minutes balance for companies that support it.
        // FIX 2: For department head role, when minutes exceed the balance, show
        // the yellow warning dialog instead of blocking with an error.
        // Admin and CEO bypass this check entirely — their path is unchanged.
        if (supportsHalfYearlyMinutes) {
            const availableMinutes = halfYearlyMinutes?.remaining_minutes || 0;
            // Admin and CEO bypass the balance check validation
            if (!isAdminOrCEO && minutes > availableMinutes) {
                // Show yellow warning inside the dialog (fixes the uncloseable popup issue)
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

    // FIX 3: Called when the department head clicks Submit inside the yellow warning.
    // Triggers the split mutation that creates both exceptions automatically.
    const handleWarningSubmit = () => {
        const cutoffDate = parseISO(currentProject.date_to);
        if (isAfter(new Date(), cutoffDate)) {
            toast.error('Approval period has ended. Cannot add new approvals.');
            return;
        }

        splitMutation.mutate({
            ...formData,
            date_to: formData.date_from
        });
    };

    const handleClose = () => {
        // Reset warning state along with form data on close
        setShowLimitWarning(false);
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

                {/* ---------------------------------------------------------------
                    FIX 1 & FIX 2 — Yellow warning rendered INSIDE DialogContent.
                    Rendering inside the Dialog keeps us within Radix UI's focus
                    trap scope, so the close/cancel button and submit button respond
                    to clicks correctly. The old approach (separate fixed-position
                    overlay rendered before the Dialog) was blocked by the focus trap.

                    FIX 2: This warning applies to department head role only.
                    It intentionally shows NO numeric breakdown — no amounts, no
                    remaining balance, no split details. The dept head only reads
                    a plain-language warning before confirming with Submit.
                    Admin and CEO never reach this path (they bypass the check above).
                --------------------------------------------------------------- */}
                {showLimitWarning ? (
                    <div className="py-4 space-y-6">
                        {/* Yellow warning header */}
                        <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
                            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                            <span className="text-amber-800 font-semibold text-base">Minutes Exceed Available Balance</span>
                        </div>

                        {/* Warning body — intentionally no numbers shown to dept head */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-5">
                            <p className="text-amber-900 text-sm leading-relaxed">
                                some of the minutes you are approving exceed the available balance and will be
                                considered as other minutes which are deductible from this employee's attendance.
                            </p>
                        </div>

                        {/* Action buttons: Close to cancel, Submit to confirm the split */}
                        <div className="flex gap-3 pt-2">
                            {/* Submit triggers FIX 3 split logic */}
                            <Button
                                type="button"
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                                onClick={handleWarningSubmit}
                                disabled={splitMutation.isPending}
                            >
                                {splitMutation.isPending ? 'Submitting...' : 'Submit'}
                            </Button>
                            {/* Close returns the dept head to the editing form */}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowLimitWarning(false)}
                                disabled={splitMutation.isPending}
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Normal form — shown when no warning is active */
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
                                    {/* Admin/CEO inline advisory — shown to admin and CEO only, unchanged */}
                                    {isAdminOrCEO && formData.allowed_minutes && supportsHalfYearlyMinutes &&
                                        parseInt(formData.allowed_minutes) > (halfYearlyMinutes?.remaining_minutes || 0) && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-2 text-amber-800 text-xs mt-2">
                                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                            <p>
                                                Warning: The entered amount is {parseInt(formData.allowed_minutes) - (halfYearlyMinutes?.remaining_minutes || 0)} minutes more than the available balance.
                                                Only the available balance will be deducted from the allowance.
                                            </p>
                                        </div>
                                    )}
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
                )}
            </DialogContent>
        </Dialog>
    );
}
