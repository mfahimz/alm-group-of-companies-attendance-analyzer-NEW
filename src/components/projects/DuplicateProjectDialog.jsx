import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import ShiftConfirmationDialog from './ShiftConfirmationDialog';

export default function DuplicateProjectDialog({ open, onClose, sourceProject, projects }) {
    const [formData, setFormData] = useState({
        name: '',
        date_from: '',
        date_to: ''
    });
    const [showShiftConfirmation, setShowShiftConfirmation] = useState(false);
    const [newProjectData, setNewProjectData] = useState(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    useEffect(() => {
        if (sourceProject) {
            setFormData({
                name: `${sourceProject.name} (Copy)`,
                date_from: sourceProject.date_from,
                date_to: sourceProject.date_to
            });
        }
    }, [sourceProject]);

    const duplicateMutation = useMutation({
        mutationFn: async (data) => {
            const newProject = await base44.entities.Project.create({
                ...data,
                company: sourceProject.company,
                status: 'draft',
                use_carried_grace_minutes: sourceProject.use_carried_grace_minutes,
                shift_blocks_count: sourceProject.shift_blocks_count,
                shift_block_ranges: sourceProject.shift_block_ranges,
                weekly_off_override: sourceProject.weekly_off_override,
                custom_employee_ids: sourceProject.custom_employee_ids
            });

            // Duplicate shift timings exactly as they are in the source project
            const shifts = await base44.entities.ShiftTiming.filter({ project_id: sourceProject.id });

            if (shifts.length > 0) {
                const shiftsToCreate = shifts.map(s => ({
                    project_id: newProject.id,
                    attendance_id: s.attendance_id,
                    date: s.date,
                    is_friday_shift: s.is_friday_shift,
                    is_single_shift: s.is_single_shift,
                    applicable_days: s.applicable_days,
                    am_start: s.am_start,
                    am_end: s.am_end,
                    pm_start: s.pm_start,
                    pm_end: s.pm_end,
                    effective_from: s.effective_from,
                    effective_to: s.effective_to,
                    shift_block: s.shift_block
                }));

                for (const shift of shiftsToCreate) {
                    await base44.entities.ShiftTiming.create(shift);
                }
            }

            return newProject;
        },
        onSuccess: (newProject) => {
            queryClient.invalidateQueries(['projects']);
            toast.success('Project duplicated successfully');
            setNewProjectData(newProject);
            setShowShiftConfirmation(true);
        },
        onError: () => {
            toast.error('Failed to duplicate project');
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

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!formData.name || !formData.date_from || !formData.date_to) {
            toast.error('Please fill in all required fields');
            return;
        }

        const dateFrom = new Date(formData.date_from);
        const dateTo = new Date(formData.date_to);
        
        if (dateTo < dateFrom) {
            toast.error('End date must be after start date');
            return;
        }

        if (checkOverlap(formData.date_from, formData.date_to)) {
            if (!window.confirm('A project already exists within this date range. Do you want to continue?')) {
                return;
            }
        }

        duplicateMutation.mutate(formData);
    };

    const handleConfirmShifts = () => {
        setShowShiftConfirmation(false);
        onClose();
        navigate(createPageUrl(`ProjectDetail?id=${newProjectData.id}`));
    };

    return (
        <>
            <ShiftConfirmationDialog
                open={showShiftConfirmation}
                onClose={() => setShowShiftConfirmation(false)}
                onConfirm={handleConfirmShifts}
                projectName={newProjectData?.name}
            />
            <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Duplicate Project</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="dup_name">Project Name *</Label>
                        <Input
                            id="dup_name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="dup_date_from">Start Date *</Label>
                            <Input
                                id="dup_date_from"
                                type="date"
                                value={formData.date_from}
                                onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="dup_date_to">End Date *</Label>
                            <Input
                                id="dup_date_to"
                                type="date"
                                value={formData.date_to}
                                onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-indigo-600 hover:bg-indigo-700"
                            disabled={duplicateMutation.isPending}
                        >
                            {duplicateMutation.isPending ? 'Duplicating...' : 'Duplicate Project'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
        </>
    );
}