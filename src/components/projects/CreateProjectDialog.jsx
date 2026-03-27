import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import EmployeeSelectionDialog from './EmployeeSelectionDialog';
import { useCompanyFilter } from '../context/CompanyContext';

export default function CreateProjectDialog({ open, onClose }) {
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });
    const { selectedCompany: contextCompany } = useCompanyFilter();

    const [formData, setFormData] = useState({
        name: '',
        company: '',
        date_from: '',
        date_to: '',
        custom_employee_ids: '',
        use_carried_grace_minutes: false,
        use_gift_minutes: false,
        gift_minutes_date_from: '', // Added: Gift minutes date range tracking
        gift_minutes_date_to: '',   // Added: Gift minutes date range tracking
        weekly_off_override: '',
        salary_calculation_days: 30,
        fetch_recurring_adjustments: true
    });
    const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
    const [showRamadanDialog, setShowRamadanDialog] = useState(false);
    const [ramadanSchedule, setRamadanSchedule] = useState(null);
    const [applyRamadan, setApplyRamadan] = useState(false);
    const [ramadanDateRange, setRamadanDateRange] = useState({ from: '', to: '' });
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Pre-fill company from context (switched company) or user's assigned company
    React.useEffect(() => {
        if (open) {
            const companyToUse = contextCompany || (currentUser?.company);
            if (companyToUse) {
                setFormData(prev => ({ ...prev, company: companyToUse }));
            }
        }
    }, [open, currentUser, contextCompany]);

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list(),
        enabled: open
    });

    const { data: ramadanSchedules = [] } = useQuery({
        queryKey: ['ramadanSchedules', formData.company],
        queryFn: () => base44.entities.RamadanSchedule.filter({ company: formData.company, active: true }),
        enabled: open && !!formData.company
    });

    // Smart defaults: Use previous project's settings as defaults
    React.useEffect(() => {
        if (open && projects.length > 0) {
            const sortedProjects = [...projects].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
            const lastProject = sortedProjects[0];
            
            if (lastProject) {
                setFormData(prev => ({
                    ...prev,
                    company: prev.company || lastProject.company,
                    use_carried_grace_minutes: lastProject.use_carried_grace_minutes || false,
                    weekly_off_override: lastProject.weekly_off_override || '',
                    salary_calculation_days: lastProject.salary_calculation_days || 30
                }));
            }
        }
    }, [open, projects]);

    const createMutation = useMutation({
        mutationFn: async (data) => {
            const project = await base44.entities.Project.create(data);
            
            // Apply Ramadan shifts if requested
            if (applyRamadan && ramadanSchedule && ramadanDateRange.from && ramadanDateRange.to) {
                await base44.functions.invoke('applyRamadanShifts', {
                    projectId: project.id,
                    ramadanScheduleId: ramadanSchedule.id,
                    ramadanFrom: ramadanDateRange.from,
                    ramadanTo: ramadanDateRange.to
                });
            }

            // Apply Recurring Adjustments if requested
            if (data.fetch_recurring_adjustments) {
                try {
                    await base44.functions.invoke('seedRecurringAdjustments', {
                        projectId: project.id
                    });
                    console.log(`[CreateProjectDialog] Recurring adjustments seeded for project ${project.id}`);
                } catch (error) {
                    console.error('[CreateProjectDialog] Failed to seed recurring adjustments:', error);
                    toast.error('Project created, but failed to seed recurring adjustments');
                }
            }
            
            return project;
        },
        onSuccess: (project) => {
            queryClient.invalidateQueries(['projects']);
            toast.success(applyRamadan ? 'Project created with Ramadan shifts applied' : 'Project created successfully');
            onClose();
            navigate(createPageUrl(`ProjectDetail?id=${project.id}`));
        },
        onError: () => {
            toast.error('Failed to create project');
        }
    });

    const checkOverlap = (start, end, company) => {
        const startDate = new Date(start);
        const endDate = new Date(end);

        return projects.some(p => {
            if (p.company !== company) return false; // Only check within same company
            const pStart = new Date(p.date_from);
            const pEnd = new Date(p.date_to);
            return (startDate <= pEnd && endDate >= pStart);
        });
    };

    const checkRamadanOverlap = (from, to) => {
        if (!from || !to || ramadanSchedules.length === 0) {
            setShowRamadanDialog(false);
            return;
        }

        const projectStart = new Date(from);
        const projectEnd = new Date(to);

        const overlappingSchedule = ramadanSchedules.find(schedule => {
            const ramadanStart = new Date(schedule.ramadan_start_date);
            const ramadanEnd = new Date(schedule.ramadan_end_date);
            return projectStart <= ramadanEnd && projectEnd >= ramadanStart;
        });

        if (overlappingSchedule) {
            setRamadanSchedule(overlappingSchedule);
            setShowRamadanDialog(true);
            
            const overlapStart = new Date(Math.max(projectStart, new Date(overlappingSchedule.ramadan_start_date)));
            const overlapEnd = new Date(Math.min(projectEnd, new Date(overlappingSchedule.ramadan_end_date)));
            setRamadanDateRange({
                from: overlapStart.toISOString().split('T')[0],
                to: overlapEnd.toISOString().split('T')[0]
            });
        } else {
            setShowRamadanDialog(false);
            setApplyRamadan(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!formData.name || !formData.company || !formData.date_from || !formData.date_to) {
            toast.error('Please fill in all required fields');
            return;
        }

        // Added: Validation for Gift Minutes date range
        if (formData.use_gift_minutes && (!formData.gift_minutes_date_from || !formData.gift_minutes_date_to)) {
            toast.error('Gift minutes date range is required when gift minutes is enabled');
            return;
        }

        const dateFrom = new Date(formData.date_from);
        const dateTo = new Date(formData.date_to);
        
        if (dateTo < dateFrom) {
            toast.error('End date must be after start date');
            return;
        }

        if (checkOverlap(formData.date_from, formData.date_to, formData.company)) {
            toast.error(`A project for ${formData.company} already exists within this date range`);
            return;
        }

        createMutation.mutate({
            ...formData,
            status: 'draft'
        });
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="name">Project Name *</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. October Week 1"
                        />
                    </div>

                    <div>
                        <Label htmlFor="company">Company *</Label>
                        <Input
                            value={formData.company}
                            disabled
                            className="bg-slate-50"
                        />
                        <p className="text-xs text-slate-500 mt-1">Company is set to your active company</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="date_from">Start Date *</Label>
                            <Input
                               id="date_from"
                               type="date"
                               value={formData.date_from}
                               onChange={(e) => {
                                   const newFrom = e.target.value;
                                   setFormData({ ...formData, date_from: newFrom });
                                   checkRamadanOverlap(newFrom, formData.date_to);
                               }}
                            />
                            </div>
                            <div>
                            <Label htmlFor="date_to">End Date *</Label>
                            <Input
                               id="date_to"
                               type="date"
                               value={formData.date_to}
                               onChange={(e) => {
                                   const newTo = e.target.value;
                                   setFormData({ ...formData, date_to: newTo });
                                   checkRamadanOverlap(formData.date_from, newTo);
                               }}
                            />
                            </div>
                            </div>

                            {showRamadanDialog && ramadanSchedule && (
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                            <div className="flex items-start gap-2">
                               <div className="flex-1">
                                   <p className="font-medium text-purple-900">🌙 Ramadan Period Detected</p>
                                   <p className="text-sm text-purple-700 mt-1">
                                       Your project overlaps with Ramadan ({new Date(ramadanSchedule.ramadan_start_date).toLocaleDateString()} - {new Date(ramadanSchedule.ramadan_end_date).toLocaleDateString()})
                                   </p>
                               </div>
                            </div>
                            <div className="flex items-center space-x-2">
                               <Checkbox 
                                   id="apply_ramadan" 
                                   checked={applyRamadan}
                                   onCheckedChange={(checked) => setApplyRamadan(checked)}
                               />
                               <Label htmlFor="apply_ramadan" className="font-normal text-sm">
                                   Apply Ramadan shift schedule
                               </Label>
                            </div>
                            {applyRamadan && (
                               <div className="grid grid-cols-2 gap-3 pt-2">
                                   <div>
                                       <Label className="text-xs">Ramadan From</Label>
                                       <Input
                                           type="date"
                                           value={ramadanDateRange.from}
                                           onChange={(e) => setRamadanDateRange({ ...ramadanDateRange, from: e.target.value })}
                                           className="h-8"
                                           min={formData.date_from}
                                           max={formData.date_to}
                                       />
                                   </div>
                                   <div>
                                       <Label className="text-xs">Ramadan To</Label>
                                       <Input
                                           type="date"
                                           value={ramadanDateRange.to}
                                           onChange={(e) => setRamadanDateRange({ ...ramadanDateRange, to: e.target.value })}
                                           className="h-8"
                                           min={ramadanDateRange.from || formData.date_from}
                                           max={formData.date_to}
                                       />
                                   </div>
                               </div>
                            )}
                            </div>
                            )}

                    {formData.company && (
                        <div>
                            <Label>Custom Employee Selection</Label>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => setShowEmployeeDialog(true)}
                            >
                                <Users className="w-4 h-4 mr-2" />
                                {formData.custom_employee_ids 
                                    ? `${formData.custom_employee_ids.split(',').length} employees selected`
                                    : 'Select employees for this project'
                                }
                            </Button>
                            <p className="text-xs text-slate-500 mt-1">
                                All employees are selected by default (cannot be unselected)
                            </p>
                        </div>
                    )}

                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="use_grace" 
                            checked={formData.use_carried_grace_minutes}
                            onCheckedChange={(checked) => setFormData({ ...formData, use_carried_grace_minutes: checked })}
                        />
                        <Label htmlFor="use_grace" className="font-normal">
                            Use carried forward grace minutes from employee master
                        </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="use_gift" 
                            checked={formData.use_gift_minutes}
                            onCheckedChange={(checked) => setFormData({ ...formData, use_gift_minutes: checked })}
                        />
                        <Label htmlFor="use_gift" className="font-normal">
                            Enable Gift Minutes
                        </Label>
                    </div>

                    {/* Added: Gift Minutes Date Range inputs */}
                    {formData.use_gift_minutes && (
                        <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-indigo-100">
                            <div>
                                <Label htmlFor="gift_from" className="text-xs">Gift Minutes From *</Label>
                                <Input
                                    id="gift_from"
                                    type="date"
                                    value={formData.gift_minutes_date_from}
                                    onChange={(e) => setFormData({ ...formData, gift_minutes_date_from: e.target.value })}
                                    className="h-8 text-xs"
                                    min={formData.date_from}
                                    max={formData.date_to}
                                />
                            </div>
                            <div>
                                <Label htmlFor="gift_to" className="text-xs">Gift Minutes To *</Label>
                                <Input
                                    id="gift_to"
                                    type="date"
                                    value={formData.gift_minutes_date_to}
                                    onChange={(e) => setFormData({ ...formData, gift_minutes_date_to: e.target.value })}
                                    className="h-8 text-xs"
                                    min={formData.gift_minutes_date_from || formData.date_from}
                                    max={formData.date_to}
                                />
                            </div>
                        </div>
                    )}


                    {formData.company === 'Naser Mohsin Auto Parts' && (
                        <div>
                            <Label htmlFor="weekly_off_override">Weekly Off Override</Label>
                            <Select
                                value={formData.weekly_off_override}
                                onValueChange={(value) => setFormData({ ...formData, weekly_off_override: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Use employee settings" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>Use employee settings</SelectItem>
                                    <SelectItem value="Sunday">Sunday</SelectItem>
                                    <SelectItem value="Monday">Monday</SelectItem>
                                    <SelectItem value="Tuesday">Tuesday</SelectItem>
                                    <SelectItem value="Wednesday">Wednesday</SelectItem>
                                    <SelectItem value="Thursday">Thursday</SelectItem>
                                    <SelectItem value="Friday">Friday</SelectItem>
                                    <SelectItem value="Saturday">Saturday</SelectItem>
                                    <SelectItem value="None">None (All 7 days working)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                Override weekly off for all employees in this project
                            </p>
                        </div>
                    )}

                    {formData.company === 'Al Maraghi Motors' && currentUser && currentUser.role === 'admin' && (
                        <div>
                            <Label htmlFor="salary_calculation_days">Salary Calculation Days</Label>
                            <Input
                                id="salary_calculation_days"
                                type="number"
                                min="1"
                                value={formData.salary_calculation_days}
                                onChange={(e) => setFormData({ ...formData, salary_calculation_days: Math.max(1, parseInt(e.target.value) || 30) })}
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Number of days used as divisor for salary calculations (default: 30)
                            </p>
                        </div>
                    )}

                    <div className="flex items-center space-x-2 bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50">
                        <Checkbox 
                            id="fetch_recurring" 
                            checked={formData.fetch_recurring_adjustments}
                            onCheckedChange={(checked) => setFormData({ ...formData, fetch_recurring_adjustments: checked })}
                        />
                        <div className="flex-1">
                            <Label htmlFor="fetch_recurring" className="font-semibold text-indigo-900 cursor-pointer">
                                Fetch and Apply Recurring Adjustments
                            </Label>
                            <p className="text-[10px] text-indigo-600 mt-0.5">
                                Automatically pre-populate adjustments from employee master (Housing, Incentive, etc.)
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-indigo-600 hover:bg-indigo-700"
                            disabled={createMutation.isPending}
                        >
                            {createMutation.isPending ? 'Creating...' : 'Create Project'}
                        </Button>
                    </div>
                </form>
            </DialogContent>

            <EmployeeSelectionDialog
                open={showEmployeeDialog}
                onOpenChange={setShowEmployeeDialog}
                company={formData.company}
                initialIds={formData.custom_employee_ids}
                onConfirm={(ids) => setFormData({ ...formData, custom_employee_ids: ids })}
            />
        </Dialog>
    );
}