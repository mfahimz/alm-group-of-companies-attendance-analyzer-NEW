import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function DayOverrideDialog({ 
    isOpen, 
    onClose, 
    employee, 
    projectId, 
    reportRunId,
    onSaved 
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState(null);

    // Override inputs
    const [overridePresentDays, setOverridePresentDays] = useState('');
    const [overrideLopDays, setOverrideLopDays] = useState('');
    const [overrideAnnualLeaveDays, setOverrideAnnualLeaveDays] = useState('');
    const [overrideSickLeaveDays, setOverrideSickLeaveDays] = useState('');
    const [overrideSalaryLeaveDays, setOverrideSalaryLeaveDays] = useState('');
    const [overrideWorkingDays, setOverrideWorkingDays] = useState('');

    // Check if any override is set
    const hasAnyOverride = overridePresentDays || overrideLopDays || overrideAnnualLeaveDays 
        || overrideSickLeaveDays || overrideSalaryLeaveDays || overrideWorkingDays;

    // Initialize from employee snapshot
    const handleOpenDialog = () => {
        setOverridePresentDays(employee?.override_present_days || '');
        setOverrideLopDays(employee?.override_full_absence_count || '');
        setOverrideAnnualLeaveDays(employee?.override_annual_leave_count || '');
        setOverrideSickLeaveDays(employee?.override_sick_leave_count || '');
        setOverrideSalaryLeaveDays(employee?.override_salary_leave_days || '');
        setOverrideWorkingDays(employee?.override_working_days || '');
        setShowPreview(false);
        setPreviewData(null);
    };

    const handlePreview = async () => {
        setIsLoading(true);
        try {
            const response = await base44.functions.invoke('recalculateSalarySnapshot', {
                report_run_id: reportRunId,
                project_id: projectId,
                attendance_id: employee.attendance_id,
                mode: 'PREVIEW'
            });

            if (!response.data.success) {
                toast.error('Preview failed: ' + response.data.error);
                return;
            }

            setPreviewData(response.data);
            setShowPreview(true);
        } catch (error) {
            toast.error('Preview error: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!hasAnyOverride) {
            toast.error('Please set at least one override value');
            return;
        }

        setIsLoading(true);
        try {
            const response = await base44.functions.invoke('saveDayOverride', {
                report_run_id: reportRunId,
                project_id: projectId,
                attendance_id: employee.attendance_id,
                override_present_days: overridePresentDays ? parseFloat(overridePresentDays) : undefined,
                override_full_absence_count: overrideLopDays ? parseFloat(overrideLopDays) : undefined,
                override_annual_leave_count: overrideAnnualLeaveDays ? parseFloat(overrideAnnualLeaveDays) : undefined,
                override_sick_leave_count: overrideSickLeaveDays ? parseFloat(overrideSickLeaveDays) : undefined,
                override_salary_leave_days: overrideSalaryLeaveDays ? parseFloat(overrideSalaryLeaveDays) : undefined,
                override_working_days: overrideWorkingDays ? parseFloat(overrideWorkingDays) : undefined,
                clear_overrides: false
            });

            if (!response.data.success) {
                toast.error('Save failed: ' + response.data.error);
                return;
            }

            toast.success(`Day overrides saved for ${employee.name}. Salary recalculated.`);
            onSaved();
            onClose();
        } catch (error) {
            toast.error('Save error: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearOverrides = async () => {
        if (!confirm('Clear all day overrides for this employee?')) return;

        setIsLoading(true);
        try {
            const response = await base44.functions.invoke('saveDayOverride', {
                report_run_id: reportRunId,
                project_id: projectId,
                attendance_id: employee.attendance_id,
                clear_overrides: true
            });

            if (!response.data.success) {
                toast.error('Clear failed: ' + response.data.error);
                return;
            }

            toast.success(`Day overrides cleared for ${employee.name}`);
            setOverridePresentDays('');
            setOverrideLopDays('');
            setOverrideAnnualLeaveDays('');
            setOverrideSickLeaveDays('');
            setOverrideSalaryLeaveDays('');
            setOverrideWorkingDays('');
            setShowPreview(false);
            setPreviewData(null);
            onSaved();
        } catch (error) {
            toast.error('Clear error: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (open) handleOpenDialog();
            else onClose();
        }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RefreshCw className="w-5 h-5" />
                        Day Override - {employee?.name}
                    </DialogTitle>
                </DialogHeader>

                {!showPreview ? (
                    <div className="space-y-6">
                        {/* Warning */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-amber-900">Admin Only Feature</p>
                                <p className="text-sm text-amber-800 mt-1">
                                    Overriding day values will automatically recalculate leave pay, deductions, and totals. Original finalized attendance is never modified.
                                </p>
                            </div>
                        </div>

                        {/* Original Values */}
                        <Card className="bg-slate-50 p-4">
                            <p className="text-sm font-medium text-slate-700 mb-3">Finalized Values (Read-Only)</p>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <p className="text-slate-600">Present Days</p>
                                    <p className="font-medium text-slate-900">{employee?.present_days || 0}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">LOP Days</p>
                                    <p className="font-medium text-slate-900">{employee?.full_absence_count || 0}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Annual Leave</p>
                                    <p className="font-medium text-slate-900">{employee?.annual_leave_count || 0}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Sick Leave</p>
                                    <p className="font-medium text-slate-900">{employee?.sick_leave_count || 0}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Salary Leave Days</p>
                                    <p className="font-medium text-slate-900">{employee?.salary_leave_days || 0}</p>
                                </div>
                                <div>
                                    <p className="text-slate-600">Working Days</p>
                                    <p className="font-medium text-slate-900">{employee?.working_days || 0}</p>
                                </div>
                            </div>
                        </Card>

                        {/* Override Inputs */}
                        <div className="space-y-4">
                            <p className="text-sm font-medium text-slate-700">Override Values (Leave blank to keep finalized value)</p>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-sm mb-1.5 block">Override Present Days</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder={String(employee?.present_days || 0)}
                                        value={overridePresentDays}
                                        onChange={(e) => setOverridePresentDays(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm mb-1.5 block">Override LOP Days</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder={String(employee?.full_absence_count || 0)}
                                        value={overrideLopDays}
                                        onChange={(e) => setOverrideLopDays(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm mb-1.5 block">Override Annual Leave Days</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder={String(employee?.annual_leave_count || 0)}
                                        value={overrideAnnualLeaveDays}
                                        onChange={(e) => setOverrideAnnualLeaveDays(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm mb-1.5 block">Override Sick Leave Days</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder={String(employee?.sick_leave_count || 0)}
                                        value={overrideSickLeaveDays}
                                        onChange={(e) => setOverrideSickLeaveDays(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm mb-1.5 block">Override Salary Leave Days</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        placeholder={String(employee?.salary_leave_days || 0)}
                                        value={overrideSalaryLeaveDays}
                                        onChange={(e) => setOverrideSalaryLeaveDays(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm mb-1.5 block">Override Working Days</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder={String(employee?.working_days || 0)}
                                        value={overrideWorkingDays}
                                        onChange={(e) => setOverrideWorkingDays(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Current Overrides Info */}
                        {employee?.has_admin_day_override && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                                <p className="font-medium mb-1">Current Overrides Applied</p>
                                <p className="text-xs">Last updated: {employee?.day_override_updated_by} on {new Date(employee?.day_override_updated_at).toLocaleString()}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Preview Mode */
                    <div className="space-y-4">
                        <Card className="bg-green-50 border-green-200 p-4">
                            <p className="font-medium text-green-900 mb-3">Recalculation Preview</p>
                            <div className="space-y-2 text-sm">
                                {Object.entries(previewData.diff || {}).map(([field, change]) => (
                                    <div key={field} className="flex justify-between">
                                        <span className="text-green-800">{field}:</span>
                                        <span className="font-medium text-green-900">
                                            {Number(change.before).toFixed(2)} → {Number(change.after).toFixed(2)}
                                            {change.change > 0 ? (
                                                <span className="text-red-600 ml-2">(+{Number(change.change).toFixed(2)})</span>
                                            ) : change.change < 0 ? (
                                                <span className="text-green-600 ml-2">({Number(change.change).toFixed(2)})</span>
                                            ) : null}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <div className="bg-slate-50 p-4 rounded text-sm">
                            <p className="text-slate-700 mb-2"><strong>Total Impact:</strong></p>
                            <p className="text-slate-600">
                                Final Salary: <span className="font-medium">{previewData.before?.total.toFixed(2)}</span> → 
                                <span className="font-medium ml-2">{previewData.after?.total.toFixed(2)}</span>
                            </p>
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    {showPreview ? (
                        <>
                            <Button 
                                variant="outline" 
                                onClick={() => setShowPreview(false)}
                                disabled={isLoading}
                            >
                                Back to Edit
                            </Button>
                            <Button 
                                onClick={handleSave}
                                disabled={isLoading}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {isLoading ? 'Saving...' : 'Confirm & Apply'}
                            </Button>
                        </>
                    ) : (
                        <>
                            {employee?.has_admin_day_override && (
                                <Button 
                                    variant="destructive" 
                                    onClick={handleClearOverrides}
                                    disabled={isLoading}
                                    className="mr-auto"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Clear Overrides
                                </Button>
                            )}
                            <Button 
                                variant="outline" 
                                onClick={onClose}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button 
                                onClick={handlePreview}
                                disabled={!hasAnyOverride || isLoading}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {isLoading ? 'Loading...' : 'Preview Changes'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}