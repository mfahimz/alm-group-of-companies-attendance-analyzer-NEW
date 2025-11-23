import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function EmployeeDialog({ open, onClose, employee }) {
    const [formData, setFormData] = useState({
        attendance_id: '',
        name: ''
    });
    const queryClient = useQueryClient();

    useEffect(() => {
        if (employee) {
            setFormData({
                attendance_id: employee.attendance_id || '',
                name: employee.name || ''
            });
        } else {
            setFormData({
                attendance_id: '',
                name: ''
            });
        }
    }, [employee]);

    const { data: existingEmployees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.Employee.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['employees']);
            toast.success('Employee added successfully');
            onClose();
        },
        onError: () => {
            toast.error('Failed to add employee');
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Employee.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['employees']);
            toast.success('Employee updated successfully');
            onClose();
        },
        onError: () => {
            toast.error('Failed to update employee');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.attendance_id || !formData.name) {
            toast.error('Please fill in all required fields');
            return;
        }

        // Check for duplicate attendance_id
        const duplicate = existingEmployees.find(
            emp => emp.attendance_id === formData.attendance_id && emp.id !== employee?.id
        );
        if (duplicate) {
            toast.error('Attendance ID already exists');
            return;
        }

        if (employee) {
            updateMutation.mutate({ id: employee.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{employee ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="attendance_id">Attendance ID *</Label>
                        <Input
                            id="attendance_id"
                            value={formData.attendance_id}
                            onChange={(e) => setFormData({ ...formData, attendance_id: e.target.value })}
                            placeholder="e.g. EMP001"
                            disabled={!!employee}
                        />
                        {employee && (
                            <p className="text-xs text-slate-500 mt-1">Attendance ID cannot be changed</p>
                        )}
                    </div>

                    <div>
                        <Label htmlFor="name">Name *</Label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Full name"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-indigo-600 hover:bg-indigo-700"
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : (employee ? 'Update' : 'Add')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}