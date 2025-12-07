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

export default function CreateProjectDialog({ open, onClose }) {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        date_from: '',
        date_to: '',
        department: '',
        custom_employee_ids: '',
        use_carried_grace_minutes: false
    });
    const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list(),
        enabled: open
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.Project.create(data),
        onSuccess: (project) => {
            queryClient.invalidateQueries(['projects']);
            toast.success('Project created successfully');
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

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!formData.name || !formData.company || !formData.date_from || !formData.date_to) {
            toast.error('Please fill in all required fields');
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
                        <Select
                            value={formData.company}
                            onValueChange={(value) => setFormData({ ...formData, company: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select company" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Al Maraghi Auto Repairs">Al Maraghi Auto Repairs</SelectItem>
                                <SelectItem value="Al Maraghi Automotive">Al Maraghi Automotive</SelectItem>
                                <SelectItem value="Naser Mohsin Auto Parts">Naser Mohsin Auto Parts</SelectItem>
                                <SelectItem value="Astra Auto Parts">Astra Auto Parts</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="date_from">Start Date *</Label>
                            <Input
                                id="date_from"
                                type="date"
                                value={formData.date_from}
                                onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="date_to">End Date *</Label>
                            <Input
                                id="date_to"
                                type="date"
                                value={formData.date_to}
                                onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="department">Department</Label>
                        <Input
                            id="department"
                            value={formData.department}
                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                            placeholder="Optional"
                        />
                    </div>

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
                                Leave empty to include all employees
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