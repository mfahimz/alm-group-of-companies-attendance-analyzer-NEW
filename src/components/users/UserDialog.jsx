import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const ROLE_OPTIONS = [
    { value: 'user', label: 'User', description: 'Company-specific access only' },
    { value: 'department_head', label: 'Department Head', description: 'Department approval access only' },
    { value: 'hr_manager', label: 'HR Manager', description: 'HR operations, salary increments, and team management' },
    { value: 'supervisor', label: 'Supervisor', description: 'All projects & employees, no system settings' },
    { value: 'ceo', label: 'CEO', description: 'Executive access with optional department head role' },
    { value: 'admin', label: 'Admin', description: 'Full system access' }
];

export default function UserDialog({ open, onClose, user }) {
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        display_name: '',
        extended_role: 'user',
        company: '',
        department: '',
        hrms_id: '',
        linked_dept_head_id: ''
    });
    const queryClient = useQueryClient();

    const { data: systemSettings = [] } = useQuery({
        queryKey: ['systemSettings'],
        queryFn: () => base44.entities.SystemSettings.list(),
        enabled: open
    });

    const needsDeptHeadData = formData.extended_role === 'department_head' ||
                               formData.extended_role === 'ceo' ||
                               formData.extended_role === 'hr_manager';

    const { data: deptHeads = [] } = useQuery({
        queryKey: ['deptHeads'],
        queryFn: () => base44.entities.DepartmentHead.list(),
        enabled: needsDeptHeadData
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list(),
        enabled: needsDeptHeadData
    });

    const { data: allUsers = [] } = useQuery({
        queryKey: ['allUsersForDeptHeadLink'],
        queryFn: () => base44.entities.User.list(),
        enabled: (formData.extended_role === 'ceo' || formData.extended_role === 'hr_manager')
    });

    const { data: companiesData = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: () => base44.entities.Company.list(),
        enabled: open
    });

    const companies = companiesData.filter(c => c.active).map(c => c.name);

    // Get departments that have active department heads in this company (for department_head role)
    const availableDepartments = React.useMemo(() => {
        if (!formData.company || formData.extended_role !== 'department_head') return [];

        const activeDeptHeads = deptHeads.filter(dh =>
            dh.company === formData.company && dh.active
        );

        const deptMap = {};
        activeDeptHeads.forEach(dh => {
            const empName = employees.find(e => e.id === dh.employee_id)?.name || 'Unknown';
            deptMap[dh.department] = empName;
        });

        return deptMap;
    }, [formData.company, formData.extended_role, deptHeads, employees]);

    // Get available DepartmentHead records for linking to CEO/HR Manager
    // These are active dept heads with employee_id that are NOT yet linked to any user
    const availableDeptHeadLinks = React.useMemo(() => {
        if (formData.extended_role !== 'ceo' && formData.extended_role !== 'hr_manager') return [];

        const activeDeptHeads = deptHeads.filter(dh => dh.active && dh.employee_id);

        // Find which dept heads are already linked to users via hrms_id
        const linkedEmployeeIds = new Set();
        allUsers.forEach(u => {
            if (u.hrms_id && u.id !== user?.id) {
                const emp = employees.find(e => e.hrms_id === u.hrms_id);
                if (emp) linkedEmployeeIds.add(emp.id);
            }
        });

        return activeDeptHeads
            .filter(dh => !linkedEmployeeIds.has(dh.employee_id))
            .map(dh => {
                const emp = employees.find(e => e.id === dh.employee_id);
                return {
                    id: dh.id,
                    company: dh.company,
                    department: dh.department,
                    employee_id: dh.employee_id,
                    employee_name: emp?.name || 'Unknown',
                    employee_hrms_id: emp?.hrms_id || '',
                    managed_count: dh.managed_employee_ids ? dh.managed_employee_ids.split(',').filter(Boolean).length : 0
                };
            });
    }, [formData.extended_role, deptHeads, employees, allUsers, user?.id]);

    // Only re-initialize form when the dialog opens (user prop changes identity or open changes)
    // Do NOT depend on employees/deptHeads to avoid resetting form on every data fetch
    useEffect(() => {
        if (!open) return;
        if (user) {
            setFormData({
                full_name: user.full_name || '',
                email: user.email || '',
                display_name: user.display_name || '',
                extended_role: user.extended_role || user.role || 'user',
                company: user.company || '',
                department: user.department || '',
                hrms_id: user.hrms_id || '',
                linked_dept_head_id: ''
            });
        } else {
            setFormData({
                full_name: '',
                email: '',
                display_name: '',
                extended_role: 'user',
                company: '',
                department: '',
                hrms_id: '',
                linked_dept_head_id: ''
            });
        }
    }, [user?.id, open]);

    // Separately resolve linked_dept_head_id once employees/deptHeads load (without resetting rest of form)
    useEffect(() => {
        if (!user?.hrms_id) return;
        const role = user.extended_role || user.role || '';
        if (role !== 'ceo' && role !== 'hr_manager') return;
        if (employees.length === 0 || deptHeads.length === 0) return;
        const emp = employees.find(e => e.hrms_id === user.hrms_id);
        if (!emp) return;
        const dh = deptHeads.find(d => d.active && d.employee_id === emp.id);
        if (dh) {
            setFormData(prev => ({ ...prev, linked_dept_head_id: dh.id }));
        }
    }, [user?.id, employees.length, deptHeads.length]);

    // Auto-unassign department if no longer has active department head
    // Use a ref to avoid triggering on formData.department itself (loop risk)
    const prevDeptRef = React.useRef('');
    useEffect(() => {
        if (formData.extended_role !== 'department_head' || !formData.company || !formData.department) return;
        const deptHasHead = Object.keys(availableDepartments).includes(formData.department);
        if (!deptHasHead && formData.department !== prevDeptRef.current) {
            prevDeptRef.current = formData.department;
            setFormData(prev => ({ ...prev, department: '' }));
        }
    }, [availableDepartments, formData.extended_role, formData.company, formData.department]);

    // When a dept head link is selected for CEO/HR Manager, auto-fill company/department/hrms_id
    const handleDeptHeadLinkChange = (deptHeadId) => {
        if (!deptHeadId || deptHeadId === 'none') {
            setFormData(prev => ({
                ...prev,
                linked_dept_head_id: '',
                department: '',
                hrms_id: ''
            }));
            return;
        }

        const selectedDh = availableDeptHeadLinks.find(dh => dh.id === deptHeadId);
        if (selectedDh) {
            setFormData(prev => ({
                ...prev,
                linked_dept_head_id: deptHeadId,
                company: selectedDh.company,
                department: selectedDh.department,
                hrms_id: selectedDh.employee_hrms_id
            }));
        }
    };

    const updateMutation = useMutation({
        mutationFn: async ({ id, data, previousUser }) => {
            // Update user record
            await base44.entities.User.update(id, data);

            // If setting as department_head, create/update DepartmentHead record
            if (data.extended_role === 'department_head' && data.hrms_id && data.company && data.department) {
                try {
                    const empRecords = await base44.entities.Employee.filter({
                        hrms_id: data.hrms_id
                    });

                    if (empRecords.length === 0) {
                        throw new Error('Employee record not found for this HRMS ID');
                    }

                    const employeeId = empRecords[0].id;

                    const existingDeptHeads = await base44.entities.DepartmentHead.filter({
                        employee_id: employeeId
                    });

                    const existingRecord = existingDeptHeads.find(dh =>
                        dh.company === data.company && dh.department === data.department
                    );

                    if (existingRecord) {
                        await base44.entities.DepartmentHead.update(existingRecord.id, {
                            active: true
                        });
                    } else {
                        await base44.entities.DepartmentHead.create({
                            company: data.company,
                            department: data.department,
                            employee_id: employeeId,
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
                // Only deactivate if the previous role was department_head
                const prevRole = previousUser.extended_role || previousUser.role || 'user';
                if (prevRole === 'department_head') {
                    try {
                        const empRecords = await base44.entities.Employee.filter({
                            hrms_id: previousUser.hrms_id
                        });

                        if (empRecords.length > 0) {
                            const employeeId = empRecords[0].id;
                            const existingDeptHeads = await base44.entities.DepartmentHead.filter({
                                employee_id: employeeId,
                                active: true
                            });

                            for (const dh of existingDeptHeads) {
                                await base44.entities.DepartmentHead.update(dh.id, { active: false });
                            }
                        }
                    } catch (err) {
                        console.error('Failed to deactivate DepartmentHead record:', err);
                    }
                }
            }

            // Log audit for role changes
            try {
                const prevRole = previousUser?.extended_role || previousUser?.role || 'user';
                if (prevRole !== data.extended_role) {
                    await base44.entities.AuditLog.create({
                        user_email: data.email || previousUser?.email,
                        action: 'role_change',
                        entity_type: 'User',
                        entity_id: id,
                        details: JSON.stringify({
                            previous_role: prevRole,
                            new_role: data.extended_role,
                            linked_dept_head: data.hrms_id || null
                        })
                    });
                }
            } catch (err) {
                console.error('Failed to log audit:', err);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['currentUser'] });
            queryClient.invalidateQueries({ queryKey: ['deptHeadVerification'] });
            queryClient.invalidateQueries({ queryKey: ['allUsersForDeptHeadLink'] });
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

        // Validate company assignment for roles that require it
        // HR Manager does NOT require a company - they have access to all companies
        const rolesRequiringCompany = ['user', 'department_head', 'ceo'];
        if (rolesRequiringCompany.includes(formData.extended_role) && !formData.company) {
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

        // Validate that admin/supervisor don't have employee link set
        if ((formData.extended_role === 'admin' || formData.extended_role === 'supervisor') && formData.hrms_id) {
            toast.error(`${formData.extended_role} users should not have an employee link`);
            return;
        }

        // Build submission data
        const dataToSubmit = {
            full_name: formData.full_name,
            display_name: formData.display_name,
            extended_role: formData.extended_role
        };

        if (formData.extended_role === 'user' || formData.extended_role === 'department_head') {
            dataToSubmit.company = formData.company;
            if (formData.extended_role === 'department_head') {
                dataToSubmit.department = formData.department;
                dataToSubmit.hrms_id = formData.hrms_id;
            } else {
                dataToSubmit.department = null;
                dataToSubmit.hrms_id = null;
            }
        } else if (formData.extended_role === 'ceo') {
            dataToSubmit.company = formData.company;
            if (formData.linked_dept_head_id && formData.hrms_id) {
                dataToSubmit.department = formData.department;
                dataToSubmit.hrms_id = formData.hrms_id;
            } else {
                dataToSubmit.department = null;
                dataToSubmit.hrms_id = null;
            }
        } else if (formData.extended_role === 'hr_manager') {
            // HR Manager has access to all companies - no company restriction
            dataToSubmit.company = null;
            dataToSubmit.department = null;
            dataToSubmit.hrms_id = null;
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

    const currentRoleInfo = ROLE_OPTIONS.find(r => r.value === formData.extended_role);

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
                                onValueChange={(value) => setFormData({
                                    ...formData,
                                    extended_role: value,
                                    linked_dept_head_id: '',
                                    // Clear department/hrms_id when switching roles
                                    ...(value !== formData.extended_role ? { department: '', hrms_id: '' } : {})
                                })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ROLE_OPTIONS.map(role => (
                                        <SelectItem key={role.value} value={role.value}>
                                            {role.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                {currentRoleInfo?.description}
                            </p>
                        </div>

                        {/* Company field for user, department_head, ceo only. HR Manager = all companies */}
                        {['user', 'department_head', 'ceo'].includes(formData.extended_role) && (
                            <div>
                                <Label htmlFor="company">Assigned Company *</Label>
                                <Select
                                    value={formData.company}
                                    onValueChange={(value) => setFormData({ ...formData, company: value, department: '', linked_dept_head_id: '' })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {companies.map(c => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500 mt-1">
                                    {formData.extended_role === 'department_head'
                                        ? 'Department head will only see data from this company'
                                        : formData.extended_role === 'ceo'
                                        ? 'CEO will be associated with this company'
                                        : formData.extended_role === 'hr_manager'
                                        ? 'HR Manager will be associated with this company'
                                        : 'User will only see data from this company'}
                                </p>
                            </div>
                        )}

                        {/* Department head specific fields */}
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
                                            {Object.entries(availableDepartments).map(([dept, headName]) => (
                                                <SelectItem key={dept} value={dept}>
                                                    {dept} → {headName}
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
                                            {employees.filter(emp => emp.company === formData.company).map((emp) => (
                                                <SelectItem key={emp.hrms_id} value={emp.hrms_id}>
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

                        {/* HR Manager info notice */}
                        {formData.extended_role === 'hr_manager' && (
                            <div className="border border-teal-200 rounded-lg p-3 bg-teal-50">
                                <p className="text-sm text-teal-800 font-medium">HR Manager — All Companies Access</p>
                                <p className="text-xs text-teal-600 mt-1">
                                    HR Managers have unrestricted access to all companies. No company assignment needed.
                                </p>
                            </div>
                        )}

                        {/* Optional Department Head linking for CEO only */}
                        {formData.extended_role === 'ceo' && (
                            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                                <Label className="text-sm font-medium">Link Department Head Role (Optional)</Label>
                                <p className="text-xs text-slate-500 mb-2">
                                    Optionally link to an existing department head record to enable team management via the Department Head Dashboard
                                </p>
                                <Select
                                    value={formData.linked_dept_head_id || 'none'}
                                    onValueChange={handleDeptHeadLinkChange}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="No department head link" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No department head link</SelectItem>
                                        {availableDeptHeadLinks.map(dh => (
                                            <SelectItem key={dh.id} value={dh.id}>
                                                {dh.employee_name} — {dh.department}, {dh.company} ({dh.managed_count} subordinates)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {formData.linked_dept_head_id && (
                                    <p className="text-xs text-green-600 mt-1">
                                        Will be linked to department head record. This grants access to the Department Head Dashboard.
                                    </p>
                                )}
                            </div>
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