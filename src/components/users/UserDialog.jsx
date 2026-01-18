import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function UserDialog({ open, onClose, user }) {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        display_name: '',
        extended_role: 'user',
        company: '',
        department: '',
        hrms_id: ''
    });
    const queryClient = useQueryClient();

    const { data: systemSettings = [] } = useQuery({
        queryKey: ['systemSettings'],
        queryFn: () => base44.entities.SystemSettings.list(),
        enabled: open
    });

    const { data: companySettings = [] } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list(),
        enabled: formData.extended_role === 'department_head' && !!formData.company
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', formData.company],
        queryFn: () => base44.entities.Employee.filter({ company: formData.company }),
        enabled: formData.extended_role === 'department_head' && !!formData.company
    });

    const availableDepartments = React.useMemo(() => {
        if (!formData.company || formData.extended_role !== 'department_head') return [];
        const setting = companySettings.find(s => s.company === formData.company);
        if (!setting) return [];
        return setting.departments.split(',').map(d => d.trim()).filter(Boolean);
    }, [formData.company, formData.extended_role, companySettings]);

    useEffect(() => {
        if (user) {
            setFormData({
                full_name: user.full_name || '',
                email: user.email || '',
                display_name: user.display_name || '',
                extended_role: user.extended_role || user.role || 'user',
                company: user.company || '',
                department: user.department || '',
                hrms_id: user.hrms_id || ''
            });
        } else {
            setFormData({
                full_name: '',
                email: '',
                display_name: '',
                extended_role: 'user',
                company: '',
                department: '',
                hrms_id: ''
            });
        }
    }, [user]);

    const updateMutation = useMutation({
        mutationFn: async ({ id, data, previousUser }) => {
            // Update user record
            await base44.entities.User.update(id, data);
            
            // If setting as department_head, create/update DepartmentHead record
            if (data.extended_role === 'department_head' && data.hrms_id && data.company && data.department) {
                try {
                    // Check if DepartmentHead record exists for this employee
                    const existingDeptHeads = await base44.entities.DepartmentHead.filter({
                        employee_id: data.hrms_id
                    });
                    
                    const existingRecord = existingDeptHeads.find(dh => 
                        dh.company === data.company && dh.department === data.department
                    );
                    
                    if (existingRecord) {
                        // Update existing to active
                        await base44.entities.DepartmentHead.update(existingRecord.id, {
                            active: true
                        });
                    } else {
                        // Create new DepartmentHead record
                        await base44.entities.DepartmentHead.create({
                            company: data.company,
                            department: data.department,
                            employee_id: data.hrms_id,
                            active: true
                        });
                    }
                } catch (err) {
                    console.error('Failed to create/update DepartmentHead record:', err);
                    throw new Error('Failed to setup department head assignment: ' + err.message);
                }
            }
            
            // If removing department_head role, deactivate DepartmentHead record
            if (data.extended_role !== 'department_head' && previousUser?.hrms_id) {
                try {
                    const existingDeptHeads = await base44.entities.DepartmentHead.filter({
                        employee_id: previousUser.hrms_id,
                        active: true
                    });
                    
                    for (const dh of existingDeptHeads) {
                        await base44.entities.DepartmentHead.update(dh.id, { active: false });
                    }
                } catch (err) {
                    console.error('Failed to deactivate DepartmentHead record:', err);
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['currentUser'] });
            queryClient.invalidateQueries({ queryKey: ['deptHeadVerification'] });
            toast.success('User updated successfully.');
            onClose();
        },
        onError: (error) => {
            console.error('Update error:', error);
            toast.error('Failed to update user: ' + (error.message || 'Unknown error'));
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.full_name || !formData.email || !formData.display_name) {
            toast.error('Please fill in all required fields');
            return;
        }

        // Validate email domain
        const allowedDomainsSetting = systemSettings.find(s => s.setting_key === 'allowed_email_domains');
        if (allowedDomainsSetting && allowedDomainsSetting.setting_value) {
            const domains = allowedDomainsSetting.setting_value.split(',').map(d => d.trim().toLowerCase());
            const userDomain = '@' + formData.email.split('@')[1]?.toLowerCase();
            
            if (!domains.some(d => userDomain === d.toLowerCase())) {
                toast.error(`Email domain not allowed. Allowed domains: ${allowedDomainsSetting.setting_value}`);
                return;
            }
        }

        // Validate company assignment for user and department_head roles
        if ((formData.extended_role === 'user' || formData.extended_role === 'department_head') && !formData.company) {
            toast.error('Please assign a company to this user');
            return;
        }

        // Validate department assignment for department_head role
        if (formData.extended_role === 'department_head' && !formData.department) {
            toast.error('Please assign a department for the department head');
            return;
        }

        // Validate employee link for department_head role
        if (formData.extended_role === 'department_head' && !formData.hrms_id) {
            toast.error('Please link this department head to an employee');
            return;
        }

        // Validate that admin/supervisor don't have company/department/hrms_id set
        if ((formData.extended_role === 'admin' || formData.extended_role === 'supervisor' || formData.extended_role === 'ceo') && formData.hrms_id) {
            toast.error(`${formData.extended_role} users should not have an employee link`);
            return;
        }

        // Only submit fields that should be updated
        const dataToSubmit = {
            full_name: formData.full_name,
            display_name: formData.display_name,
            extended_role: formData.extended_role
        };
        
        // Only include company field based on role
        if (formData.extended_role === 'user' || formData.extended_role === 'department_head') {
            dataToSubmit.company = formData.company;
            // Include department and hrms_id only for department_head role
            if (formData.extended_role === 'department_head') {
                dataToSubmit.department = formData.department;
                dataToSubmit.hrms_id = formData.hrms_id;
            } else {
                dataToSubmit.department = null;
                dataToSubmit.hrms_id = null;
            }
        } else if (formData.extended_role === 'admin' || formData.extended_role === 'supervisor') {
            dataToSubmit.company = null;
            dataToSubmit.department = null;
            dataToSubmit.hrms_id = null;
        }

        if (user) {
            console.log('Updating user with data:', dataToSubmit);
            updateMutation.mutate({ id: user.id, data: dataToSubmit, previousUser: user });
        } else {
            toast.info('To add new users, please use the invite feature in your admin dashboard');
            onClose();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{user ? 'Edit User' : 'User Information'}</DialogTitle>
                </DialogHeader>
                {user ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <Label htmlFor="full_name">Full Name *</Label>
                            <Input
                                id="full_name"
                                value={formData.full_name}
                                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                placeholder="John Doe"
                            />
                        </div>

                        <div>
                            <Label htmlFor="display_name">Display Name *</Label>
                            <Input
                                id="display_name"
                                value={formData.display_name}
                                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                placeholder="e.g., John D. or J. Doe"
                            />
                            <p className="text-xs text-slate-500 mt-1">Short name shown in system</p>
                        </div>

                        <div>
                            <Label htmlFor="email">Email *</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                disabled
                                className="bg-slate-50"
                            />
                            <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
                        </div>

                        <div>
                            <Label htmlFor="role">Role *</Label>
                            <Select
                                value={formData.extended_role}
                                onValueChange={(value) => setFormData({ ...formData, extended_role: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="department_head">Department Head</SelectItem>
                                    <SelectItem value="supervisor">Supervisor</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                {formData.extended_role === 'admin' && 'Full system access'}
                                {formData.extended_role === 'supervisor' && 'All projects & employees, no system settings'}
                                {formData.extended_role === 'department_head' && 'Department approval access only'}
                                {formData.extended_role === 'user' && 'Company-specific access only'}
                            </p>
                        </div>

                        {(formData.extended_role === 'user' || formData.extended_role === 'department_head') && (
                            <div>
                                <Label htmlFor="company">Assigned Company *</Label>
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
                                <p className="text-xs text-slate-500 mt-1">
                                    {formData.extended_role === 'department_head' ? 'Department head will only see data from this company' : 'User will only see data from this company'}
                                </p>
                            </div>
                        )}

                        {formData.extended_role === 'department_head' && formData.company && (
                            <>
                                <div>
                                    <Label htmlFor="department">Assigned Department *</Label>
                                    <Select
                                        value={formData.department}
                                        onValueChange={(value) => setFormData({ ...formData, department: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableDepartments.map((dept) => (
                                                <SelectItem key={dept} value={dept}>
                                                    {dept}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Only employees in this department will be visible to this department head
                                    </p>
                                </div>

                                <div>
                                    <Label htmlFor="employee">Link to Employee *</Label>
                                    <Select
                                        value={formData.hrms_id}
                                        onValueChange={(value) => setFormData({ ...formData, hrms_id: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select employee" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {employees.map((emp) => (
                                                <SelectItem key={emp.hrms_id} value={emp.hrms_id.toString()}>
                                                    {emp.name} (ID: {emp.hrms_id})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Link this user to their employee record in the employee master
                                    </p>
                                </div>
                            </>
                        )}

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className="bg-indigo-600 hover:bg-indigo-700"
                                disabled={updateMutation.isPending}
                            >
                                {updateMutation.isPending ? 'Saving...' : 'Update User'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-4">
                        <p className="text-slate-600">
                            New users must be invited through the Base44 platform. Please use the invite functionality in your admin dashboard to add new users to the system.
                        </p>
                        <div className="flex justify-end pt-4">
                            <Button onClick={onClose}>
                                Close
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}