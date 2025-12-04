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

export default function DuplicateProjectDialog({ open, onClose, sourceProject, projects }) {
    const [formData, setFormData] = useState({
        name: '',
        date_from: '',
        date_to: ''
    });
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
                department: sourceProject.department,
                status: 'draft',
                use_carried_grace_minutes: sourceProject.use_carried_grace_minutes
            });

            // Duplicate related entities
            const punches = await base44.entities.Punch.filter({ project_id: sourceProject.id });
            const shifts = await base44.entities.ShiftTiming.filter({ project_id: sourceProject.id });
            const exceptions = await base44.entities.Exception.filter({ project_id: sourceProject.id });

            if (punches.length > 0) {
                await base44.entities.Punch.bulkCreate(
                    punches.map(p => ({
                        project_id: newProject.id,
                        attendance_id: p.attendance_id,
                        timestamp_raw: p.timestamp_raw,
                        punch_date: p.punch_date
                    }))
                );
            }

            if (shifts.length > 0) {
                await base44.entities.ShiftTiming.bulkCreate(
                    shifts.map(s => ({
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
                        effective_to: s.effective_to
                    }))
                );
            }

            if (exceptions.length > 0) {
                await base44.entities.Exception.bulkCreate(
                    exceptions.map(e => ({
                        project_id: newProject.id,
                        attendance_id: e.attendance_id,
                        date_from: e.date_from,
                        date_to: e.date_to,
                        type: e.type,
                        new_am_start: e.new_am_start,
                        new_am_end: e.new_am_end,
                        new_pm_start: e.new_pm_start,
                        new_pm_end: e.new_pm_end,
                        details: e.details
                    }))
                );
            }

            return newProject;
        },
        onSuccess: (newProject) => {
            queryClient.invalidateQueries(['projects']);
            toast.success('Project duplicated successfully');
            onClose();
            navigate(createPageUrl(`ProjectDetail?id=${newProject.id}`));
        },
        onError: () => {
            toast.error('Failed to duplicate project');
        }
    });

    const checkOverlap = (start, end) => {
        const startDate = new Date(start);
        const endDate = new Date(end);

        return projects.some(p => {
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

    return (
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
    );
}