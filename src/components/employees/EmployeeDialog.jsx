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
        active: true,
        carried_grace_minutes: 0
    });
    const [showNewDeptDialog, setShowNewDeptDialog] = useState(false);
    const [showNewSubDeptDialog, setShowNewSubDeptDialog] = useState(false);
    const [newDeptName, setNewDeptName] = useState('');
    const [newSubDeptName, setNewSubDeptName] = useState('');
    const [generatingHrmsId, setGeneratingHrmsId] = useState(false);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isAdminOrSupervisor = isAdmin || isSupervisor;

    useEffect(() => {
        if (employee && open) {
            setFormData({
                hrms_id: employee.hrms_id || '',
                attendance_id: employee.attendance_id || '',
                name: employee.name || '',
                company: employee.company || '',
                department: employee.department || '',
                weekly_off: employee.weekly_off || 'Sunday',
                active: employee.active ?? true,
                carried_grace_minutes: employee.carried_grace_minutes || 0
            });
        } else if (open && !employee) {
            // Auto-generate HRMS ID for new employees
            const generateHrmsId = async () => {
                setGeneratingHrmsId(true);
                try {
                    const { data } = await base44.functions.invoke('generateHrmsId', {});
                    setFormData({
                        hrms_id: data.hrms_id,
                        attendance_id: '',
                        name: '',
                        company: '',
                        department: '',
                        weekly_off: 'Sunday',
                        active: true,
                        carried_grace_minutes: 0
                    });
                } catch (error) {
                    toast.error('Failed to generate HRMS ID');
                    setFormData({
                        hrms_id: '',
                        attendance_id: '',
                        name: '',
                        company: '',
                        department: '',
                        weekly_off: 'Sunday',
                        active: true,
                        carried_grace_minutes: 0
                    });
                } finally {
                    setGeneratingHrmsId(false);
                }
            };
            generateHrmsId();
        }
    }, [employee, open]);

    const { data: existingEmployees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: companySettings = [] } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    const selectedCompanySettings = companySettings.find(cs => cs.company === formData.company);
    let departments = selectedCompanySettings 
        ? selectedCompanySettings.departments.split(',').map(d => d.trim()).filter(Boolean)
        : ['Admin'];
    
    // Ensure current department is in the list (in case it was saved but not in settings)
    if (formData.department && !departments.includes(formData.department)) {
        departments = [...departments, formData.department];
    }

    const createDepartmentMutation = useMutation({
        mutationFn: async (deptName) => {
            if (selectedCompanySettings) {
                const currentDepts = selectedCompanySettings.departments.split(',').map(d => d.trim()).filter(Boolean);
                if (currentDepts.includes(deptName)) {
                    throw new Error('Department already exists');
                }
                const updatedDepts = [...currentDepts, deptName].join(',');
                await base44.entities.CompanySettings.update(selectedCompanySettings.id, {
                    departments: updatedDepts
                });
            } else {
                await base44.entities.CompanySettings.create({
                    company: formData.company,
                    departments: `Admin,${deptName}`
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['companySettings']);
            toast.success('Department created successfully');
            setShowNewDeptDialog(false);
            setNewDeptName('');
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create department');
        }
    });

    const createSubDepartmentMutation = useMutation({
        mutationFn: async (subDeptName) => {
            if (!formData.department) {
                throw new Error('Please select a parent department first');
            }
            const fullName = `${formData.department} - ${subDeptName}`;
            if (selectedCompanySettings) {
                const currentDepts = selectedCompanySettings.departments.split(',').map(d => d.trim()).filter(Boolean);
                if (currentDepts.includes(fullName)) {
                    throw new Error('Sub-department already exists');
                }
                const updatedDepts = [...currentDepts, fullName].join(',');
                await base44.entities.CompanySettings.update(selectedCompanySettings.id, {
                    departments: updatedDepts
                });
            } else {
                await base44.entities.CompanySettings.create({
                    company: formData.company,
                    departments: `Admin,${fullName}`
                });
            }
            return fullName;
        },
        onSuccess: (fullName) => {
            queryClient.invalidateQueries(['companySettings']);
            setFormData({ ...formData, department: fullName });
            toast.success('Sub-department created successfully');
            setShowNewSubDeptDialog(false);
            setNewSubDeptName('');
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create sub-department');
        }
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
        mutationFn: async ({ id, data, oldData }) => {
            await base44.entities.Employee.update(id, data);
            
            // Log the update to audit trail
            const changes = [];
            if (oldData.company !== data.company) changes.push(`Company: ${oldData.company} → ${data.company}`);
            if (oldData.department !== data.department) changes.push(`Department: ${oldData.department} → ${data.department}`);
            if (oldData.active !== data.active) changes.push(`Status: ${oldData.active ? 'Active' : 'Inactive'} → ${data.active ? 'Active' : 'Inactive'}`);
            if (oldData.name !== data.name) changes.push(`Name: ${oldData.name} → ${data.name}`);
            if (oldData.attendance_id !== data.attendance_id) changes.push(`Attendance ID: ${oldData.attendance_id} → ${data.attendance_id}`);
            if (oldData.weekly_off !== data.weekly_off) changes.push(`Weekly Off: ${oldData.weekly_off} → ${data.weekly_off}`);
            
            if (changes.length > 0) {
                try {
                    await base44.functions.invoke('logAudit', {
                        action: 'UPDATE',
                        entity_type: 'Employee',
                        entity_id: id,
                        entity_name: data.name,
                        old_data: oldData,
                        new_data: data,
                        details: `Modified fields: ${changes.join(', ')}`,
                        company: data.company
                    });
                } catch (e) {
                    console.error('Failed to log audit:', e);
                }
            }
        },
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

        if (employee) {
            updateMutation.mutate({ id: employee.id, data: formData, oldData: employee });
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
                            placeholder="Auto-generated"
                            disabled={!employee && generatingHrmsId}
                            className={!employee ? 'bg-slate-50' : ''}
                        />
                        {!employee && <p className="text-xs text-slate-500 mt-1">Auto-generated unique ID</p>}
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
                        <div className="flex gap-2">
                            <Select
                                value={formData.department}
                                onValueChange={(value) => {
                                    if (value === '__create_new__') {
                                        setShowNewDeptDialog(true);
                                    } else if (value === '__create_sub__') {
                                        setShowNewSubDeptDialog(true);
                                    } else {
                                        setFormData({ ...formData, department: value });
                                    }
                                }}
                                disabled={!formData.company}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                                <SelectContent>
                                    {departments.map(dept => (
                                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                    ))}
                                    {isAdminOrSupervisor && (
                                        <>
                                            <SelectItem value="__create_new__" className="text-indigo-600 font-medium">
                                                + Create New Department
                                            </SelectItem>
                                            <SelectItem value="__create_sub__" className="text-purple-600 font-medium">
                                                + Create Sub-Department
                                            </SelectItem>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        {formData.department && (
                            <p className="text-xs text-slate-500 mt-1">
                                Current: {formData.department}
                            </p>
                        )}
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

                    <div>
                        <Label htmlFor="carried_grace">Carried Grace Minutes</Label>
                        <Input
                            id="carried_grace"
                            type="number"
                            value={formData.carried_grace_minutes || 0}
                            onChange={(e) => setFormData({ ...formData, carried_grace_minutes: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            min="0"
                        />
                        <p className="text-xs text-slate-500 mt-1">Unused grace minutes carried from previous projects</p>
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

            {/* Create New Department Dialog */}
            <Dialog open={showNewDeptDialog} onOpenChange={setShowNewDeptDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create New Department</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="newDept">Department Name</Label>
                            <Input
                                id="newDept"
                                value={newDeptName}
                                onChange={(e) => setNewDeptName(e.target.value)}
                                placeholder="e.g. Sales, Operations"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => {
                                setShowNewDeptDialog(false);
                                setNewDeptName('');
                            }}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={() => {
                                    if (newDeptName.trim()) {
                                        createDepartmentMutation.mutate(newDeptName.trim());
                                    }
                                }}
                                disabled={!newDeptName.trim() || createDepartmentMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                {createDepartmentMutation.isPending ? 'Creating...' : 'Create'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Sub-Department Dialog */}
            <Dialog open={showNewSubDeptDialog} onOpenChange={setShowNewSubDeptDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Sub-Department</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {!formData.department ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                                Please select a parent department first
                            </div>
                        ) : (
                            <>
                                <div>
                                    <Label>Parent Department</Label>
                                    <div className="mt-1 text-sm font-medium text-slate-700">
                                        {formData.department}
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="newSubDept">Sub-Department Name</Label>
                                    <Input
                                        id="newSubDept"
                                        value={newSubDeptName}
                                        onChange={(e) => setNewSubDeptName(e.target.value)}
                                        placeholder="e.g. Regional, Warehouse"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        Will be created as: {formData.department} - {newSubDeptName}
                                    </p>
                                </div>
                            </>
                        )}
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => {
                                setShowNewSubDeptDialog(false);
                                setNewSubDeptName('');
                            }}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={() => {
                                    if (newSubDeptName.trim() && formData.department) {
                                        createSubDepartmentMutation.mutate(newSubDeptName.trim());
                                    }
                                }}
                                disabled={!newSubDeptName.trim() || !formData.department || createSubDepartmentMutation.isPending}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                {createSubDepartmentMutation.isPending ? 'Creating...' : 'Create'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}