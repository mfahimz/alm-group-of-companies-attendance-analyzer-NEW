import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function EmployeeDialog({ open, onClose, employee }) {
    const [formData, setFormData] = useState({
        hrms_id: '',
        attendance_id: '',
        name: '',
        company: '',
        department: '',
        weekly_off: 'Sunday',
        active: true
    });
    const queryClient = useQueryClient();

    useEffect(() => {
        if (employee) {
            setFormData({
                hrms_id: employee.hrms_id || '',
                attendance_id: employee.attendance_id || '',
                name: employee.name || '',
                company: employee.company || '',
                department: employee.department || '',
                weekly_off: employee.weekly_off || 'Sunday',
                active: employee.active ?? true
            });
        } else {
            setFormData({
                hrms_id: '',
                attendance_id: '',
                name: '',
                company: '',
                department: '',
                weekly_off: 'Sunday',
                active: true
            });
        }
    }, [employee]);

    const { data: existingEmployees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: companySettings = [] } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    const selectedCompanySettings = companySettings.find(cs => cs.company === formData.company);
    const departments = selectedCompanySettings 
        ? selectedCompanySettings.departments.split(',').map(d => d.trim())
        : ['Admin'];

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

        if (!formData.hrms_id || !formData.attendance_id || !formData.name || !formData.company) {
            toast.error('Please fill in all required fields');
            return;
        }

        // Check for duplicate hrms_id
        const duplicateHrms = existingEmployees.find(
            emp => emp.hrms_id === formData.hrms_id && emp.id !== employee?.id
        );
        if (duplicateHrms) {
            toast.error('HRMS ID already exists');
            return;
        }

        // Check for duplicate attendance_id
        const duplicateAttendance = existingEmployees.find(
            emp => emp.attendance_id === formData.attendance_id && emp.id !== employee?.id
        );
        if (duplicateAttendance) {
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
                        <Label htmlFor="hrms_id">HRMS ID *</Label>
                        <Input
                            id="hrms_id"
                            value={formData.hrms_id}
                            onChange={(e) => setFormData({ ...formData, hrms_id: e.target.value })}
                            placeholder="e.g. H001"
                            disabled={!!employee}
                        />
                        {employee && (
                            <p className="text-xs text-slate-500 mt-1">HRMS ID cannot be changed</p>
                        )}
                    </div>

                    <div>
                        <Label htmlFor="attendance_id">Attendance ID *</Label>
                        <Input
                            id="attendance_id"
                            value={formData.attendance_id}
                            onChange={(e) => setFormData({ ...formData, attendance_id: e.target.value })}
                            placeholder="e.g. EMP001"
                        />
                        <p className="text-xs text-slate-500 mt-1">Used for matching punch data</p>
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

                    <div>
                        <Label htmlFor="company">Company *</Label>
                        <Select
                            value={formData.company}
                            onValueChange={(value) => setFormData({ ...formData, company: value, department: '' })}
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

                    <div>
                        <Label htmlFor="department">Department</Label>
                        <Select
                            value={formData.department}
                            onValueChange={(value) => setFormData({ ...formData, department: value })}
                            disabled={!formData.company}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                            <SelectContent>
                                {departments.map(dept => (
                                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="weekly_off">Weekly Off *</Label>
                        <Select
                            value={formData.weekly_off}
                            onValueChange={(value) => setFormData({ ...formData, weekly_off: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select weekly off day" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Sunday">Sunday</SelectItem>
                                <SelectItem value="Monday">Monday</SelectItem>
                                <SelectItem value="Tuesday">Tuesday</SelectItem>
                                <SelectItem value="Wednesday">Wednesday</SelectItem>
                                <SelectItem value="Thursday">Thursday</SelectItem>
                                <SelectItem value="Friday">Friday</SelectItem>
                                <SelectItem value="Saturday">Saturday</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="active">Active Status</Label>
                            <p className="text-xs text-slate-500">Active employees will be included in projects</p>
                        </div>
                        <Switch
                            id="active"
                            checked={formData.active}
                            onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
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