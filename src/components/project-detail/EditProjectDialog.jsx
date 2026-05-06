import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import EmployeeSelectionDialog from '../projects/EmployeeSelectionDialog';
import { AL_MARAGHI_MOTORS_COMPANY_ID } from '@/constants/companyIds';

/**
 * EditProjectDialog
 * Extracted verbatim from OverviewTab to be reachable from the ProjectDetail header dropdown.
 * Business logic, validations, and mutation behavior preserved 1:1.
 */
export default function EditProjectDialog({ open, onOpenChange, project }) {
    const queryClient = useQueryClient();
    const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
    const [showGiftDateWarning, setShowGiftDateWarning] = useState(true);

    const [editData, setEditData] = useState({
        name: project.name,
        company: project.company,
        date_from: project.date_from,
        date_to: project.date_to,
        custom_employee_ids: project.custom_employee_ids || '',
        use_carried_grace_minutes: project.use_carried_grace_minutes || false,
        use_gift_minutes: project.use_gift_minutes || false,
        gift_minutes_date_from: project.gift_minutes_date_from || '',
        gift_minutes_date_to: project.gift_minutes_date_to || '',
        skip_double_deduction: project.skip_double_deduction || false,
        skip_double_deduction_date_from: project.skip_double_deduction_date_from || '',
        skip_double_deduction_date_to: project.skip_double_deduction_date_to || '',
        shift_blocks_count: project.shift_blocks_count || 2,
        sync_recurring_adjustments: false
    });

    // Re-sync local state when the project prop changes (e.g. dialog reopened with fresh data)
    useEffect(() => {
        setEditData({
            name: project.name,
            company: project.company,
            date_from: project.date_from,
            date_to: project.date_to,
            custom_employee_ids: project.custom_employee_ids || '',
            use_carried_grace_minutes: project.use_carried_grace_minutes || false,
            use_gift_minutes: project.use_gift_minutes || false,
            gift_minutes_date_from: project.gift_minutes_date_from || '',
            gift_minutes_date_to: project.gift_minutes_date_to || '',
            skip_double_deduction: project.skip_double_deduction || false,
            skip_double_deduction_date_from: project.skip_double_deduction_date_from || '',
            skip_double_deduction_date_to: project.skip_double_deduction_date_to || '',
            shift_blocks_count: project.shift_blocks_count || 2,
            sync_recurring_adjustments: false
        });
    }, [project.id, open]);

    const { data: companyRecord } = useQuery({
        queryKey: ['companyByName', project.company],
        queryFn: () => base44.entities.Company.filter({ name: project.company }).then(r => r[0] || null),
        enabled: !!project.company
    });
    const isAlMaraghiMotors = companyRecord?.company_id === AL_MARAGHI_MOTORS_COMPANY_ID;

    const syncRecurringMutation = useMutation({
        mutationFn: async () => {
            await base44.functions.invoke('seedRecurringAdjustments', { projectId: project.id });
        },
        onSuccess: () => {
            toast.success('Recurring adjustments synchronized successfully');
            queryClient.invalidateQueries(['overtimeData', project.id]);
        },
        onError: (error) => {
            toast.error('Failed to sync recurring adjustments: ' + error.message);
        }
    });

    const updateProjectMutation = useMutation({
        mutationFn: (data) => base44.entities.Project.update(project.id, {
            ...data,
            use_gift_minutes: !!data.use_gift_minutes,
            use_carried_grace_minutes: !!data.use_carried_grace_minutes,
            skip_double_deduction: !!data.skip_double_deduction
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['projects']);
            toast.success('Project updated successfully');
            onOpenChange(false);
        },
        onError: () => {
            toast.error('Failed to update project');
        }
    });

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (!editData.name.trim()) {
            toast.error('Project name is required');
            return;
        }
        if (!editData.date_from || !editData.date_to) {
            toast.error('Date range is required');
            return;
        }
        if (editData.use_gift_minutes && (!editData.gift_minutes_date_from || !editData.gift_minutes_date_to)) {
            toast.error('Gift minutes date range is required when gift minutes is enabled');
            return;
        }
        if (new Date(editData.date_from) > new Date(editData.date_to)) {
            toast.error('Start date must be before end date');
            return;
        }

        if (editData.sync_recurring_adjustments) {
            try {
                await syncRecurringMutation.mutateAsync();
            } catch (err) {
                // Error handled by mutation already
            }
        }

        updateProjectMutation.mutate({
            ...editData,
            sync_recurring_adjustments: undefined
        });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Project Settings</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
                        <div>
                            <Label>Project Name *</Label>
                            <Input
                                value={editData.name}
                                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                placeholder="Enter project name"
                            />
                        </div>
                        <div>
                            <Label>Company *</Label>
                            <Select 
                                value={editData.company} 
                                onValueChange={(value) => setEditData({ ...editData, company: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Al Maraghi Motors">Al Maraghi Motors</SelectItem>
                                    <SelectItem value="Al Maraghi Automotive">Al Maraghi Automotive</SelectItem>
                                    <SelectItem value="Naser Mohsin Auto Parts">Naser Mohsin Auto Parts</SelectItem>
                                    <SelectItem value="Astra Auto Parts">Astra Auto Parts</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Start Date *</Label>
                                <Input
                                    type="date"
                                    value={editData.date_from}
                                    onChange={(e) => setEditData({ ...editData, date_from: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>End Date *</Label>
                                <Input
                                    type="date"
                                    value={editData.date_to}
                                    onChange={(e) => setEditData({ ...editData, date_to: e.target.value })}
                                />
                            </div>
                        </div>
                        {editData.company && (
                            <div>
                                <Label>Custom Employee Selection</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => setShowEmployeeDialog(true)}
                                >
                                    <Users className="w-4 h-4 mr-2" />
                                    {editData.custom_employee_ids 
                                        ? `${editData.custom_employee_ids.split(',').length} employees selected`
                                        : 'Select employees for this project'
                                    }
                                </Button>
                                <p className="text-xs text-slate-500 mt-1">
                                    Leave empty to include all employees
                                </p>
                            </div>
                        )}
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="use_grace" 
                                checked={editData.use_carried_grace_minutes}
                                onCheckedChange={(checked) => setEditData({ ...editData, use_carried_grace_minutes: checked })}
                            />
                            <Label htmlFor="use_grace" className="font-normal">
                                Use carried forward grace minutes
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="use_gift" 
                                checked={editData.use_gift_minutes}
                                onCheckedChange={(checked) => setEditData({ ...editData, use_gift_minutes: checked })}
                                disabled={project.gift_minutes_date_from && project.gift_minutes_date_to}
                            />
                            <Label htmlFor="use_gift" className="font-normal">
                                Enable Gift Minutes
                            </Label>
                        </div>

                        {editData.use_gift_minutes && (
                            <div className="space-y-3 pl-6 border-l-2 border-indigo-100">
                                {!(project.gift_minutes_date_from && project.gift_minutes_date_to) ? (
                                    <>
                                        {showGiftDateWarning && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 relative">
                                                <button 
                                                    type="button"
                                                    onClick={() => setShowGiftDateWarning(false)}
                                                    className="absolute top-2 right-2 text-amber-500 hover:text-amber-700"
                                                >
                                                    ×
                                                </button>
                                                <p className="text-xs text-amber-800 pr-4">
                                                    Please confirm the gift minutes date range as it cannot be changed after saving.
                                                </p>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label className="text-xs">Gift Minutes From *</Label>
                                                <Input
                                                    type="date"
                                                    value={editData.gift_minutes_date_from}
                                                    onChange={(e) => setEditData({ ...editData, gift_minutes_date_from: e.target.value })}
                                                    className="h-8 text-xs"
                                                    min={editData.date_from}
                                                    max={editData.date_to}
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs">Gift Minutes To *</Label>
                                                <Input
                                                    type="date"
                                                    value={editData.gift_minutes_date_to}
                                                    onChange={(e) => setEditData({ ...editData, gift_minutes_date_to: e.target.value })}
                                                    className="h-8 text-xs"
                                                    min={editData.gift_minutes_date_from || editData.date_from}
                                                    max={editData.date_to}
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-medium">GIFT MINUTES FROM</p>
                                                <p className="text-sm font-medium text-slate-900">{new Date(project.gift_minutes_date_from).toLocaleDateString('en-GB')}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-medium">GIFT MINUTES TO</p>
                                                <p className="text-sm font-medium text-slate-900">{new Date(project.gift_minutes_date_to).toLocaleDateString('en-GB')}</p>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-2 italic flex items-center gap-1">
                                            <Lock className="w-3 h-3" />
                                            Gift minutes date range is locked and cannot be changed.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                        <div>
                            <Label>Number of Shift Blocks *</Label>
                            <Select
                                value={String(editData.shift_blocks_count || 2)}
                                onValueChange={(value) => setEditData({ ...editData, shift_blocks_count: parseInt(value) })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 Block</SelectItem>
                                    <SelectItem value="2">2 Blocks</SelectItem>
                                    <SelectItem value="3">3 Blocks</SelectItem>
                                    <SelectItem value="4">4 Blocks</SelectItem>
                                    <SelectItem value="5">5 Blocks</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                How many shift timing blocks this project needs
                            </p>
                        </div>

                        {isAlMaraghiMotors && (
                            <div className="space-y-3 pt-1">
                                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox 
                                            id="skip_double_deduction" 
                                            checked={editData.skip_double_deduction}
                                            onCheckedChange={(checked) => setEditData({ ...editData, skip_double_deduction: !!checked })}
                                        />
                                        <Label htmlFor="skip_double_deduction" className="font-semibold text-slate-900 cursor-pointer">
                                            Skip Double Deduction
                                        </Label>
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-tight">
                                        When enabled, double deduction will be skipped for all employees in this project for the selected date range. Leave dates empty to skip for the entire project period.
                                    </p>
                                    {editData.skip_double_deduction && (
                                        <div className="grid grid-cols-2 gap-3 pl-6 pt-1">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Skip From</Label>
                                                <Input
                                                    type="date"
                                                    value={editData.skip_double_deduction_date_from}
                                                    onChange={(e) => setEditData({ ...editData, skip_double_deduction_date_from: e.target.value })}
                                                    className="h-8 text-xs bg-white"
                                                    min={project.date_from}
                                                    max={project.date_to}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Skip To</Label>
                                                <Input
                                                    type="date"
                                                    value={editData.skip_double_deduction_date_to}
                                                    onChange={(e) => setEditData({ ...editData, skip_double_deduction_date_to: e.target.value })}
                                                    className="h-8 text-xs bg-white"
                                                    min={editData.skip_double_deduction_date_from || project.date_from}
                                                    max={project.date_to}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {project.status !== 'closed' && (
                                    <div className="flex items-center space-x-2 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                                        <Checkbox 
                                            id="sync_recurring_edit" 
                                            checked={editData.sync_recurring_adjustments}
                                            onCheckedChange={(checked) => setEditData({ ...editData, sync_recurring_adjustments: !!checked })}
                                        />
                                        <div className="flex-1">
                                            <Label htmlFor="sync_recurring_edit" className="font-semibold text-indigo-900 cursor-pointer">
                                                Sync Recurring Adjustments
                                            </Label>
                                            <p className="text-[10px] text-indigo-600 mt-0.5">
                                                Fetch latest recurring variables (Housing, etc.) from employee master.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex gap-3 pt-2">
                            <Button
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-700"
                                disabled={updateProjectMutation.isPending}
                            >
                                {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <EmployeeSelectionDialog
                open={showEmployeeDialog}
                onOpenChange={setShowEmployeeDialog}
                company={editData.company}
                initialIds={editData.custom_employee_ids}
                onConfirm={(ids) => setEditData({ ...editData, custom_employee_ids: ids })}
            />
        </>
    );
}