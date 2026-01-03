import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Users } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function DepartmentHeadSettings() {
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedManagedEmployees, setSelectedManagedEmployees] = useState([]);
    const [selectedReportsTo, setSelectedReportsTo] = useState('');
    const [editingHead, setEditingHead] = useState(null);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const queryClient = useQueryClient();

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: deptHeads = [] } = useQuery({
        queryKey: ['deptHeads'],
        queryFn: () => base44.entities.DepartmentHead.list()
    });

    const { data: companySettings = [] } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    const companies = ['Al Maraghi Auto Repairs', 'Al Maraghi Automotive', 'Naser Mohsin Auto Parts', 'Astra Auto Parts'];

    const departments = React.useMemo(() => {
        if (!selectedCompany) return [];
        const setting = companySettings.find(s => s.company === selectedCompany);
        if (!setting) return ['Admin'];
        return ['Admin', ...setting.departments.split(',').map(d => d.trim()).filter(Boolean)];
    }, [selectedCompany, companySettings]);

    const availableEmployees = employees.filter(e => e.company === selectedCompany && e.active);

    // Get department heads that can be reported to (exclude self if editing)
    const availableReportsTo = deptHeads.filter(dh => 
        dh.company === selectedCompany && 
        dh.active && 
        (!editingHead || dh.id !== editingHead.id)
    );

    const createMutation = useMutation({
        mutationFn: async () => {
            if (!selectedCompany || !selectedDepartment || !selectedEmployee) {
                throw new Error('Please select company, department, and employee');
            }

            await base44.entities.DepartmentHead.create({
                company: selectedCompany,
                department: selectedDepartment,
                employee_id: selectedEmployee,
                managed_employee_ids: selectedManagedEmployees.join(','),
                reports_to: selectedReportsTo || null,
                active: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['deptHeads']);
            setSelectedCompany('');
            setSelectedDepartment('');
            setSelectedEmployee('');
            setSelectedManagedEmployees([]);
            setSelectedReportsTo('');
            toast.success('Department head assigned successfully');
        },
        onError: (error) => {
            toast.error(error.message);
        }
    });

    const updateMutation = useMutation({
        mutationFn: async (data) => {
            await base44.entities.DepartmentHead.update(editingHead.id, {
                managed_employee_ids: data.managed_employee_ids,
                reports_to: data.reports_to || null
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['deptHeads']);
            setShowEditDialog(false);
            setEditingHead(null);
            toast.success('Department head updated successfully');
        },
        onError: (error) => {
            toast.error(error.message);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.DepartmentHead.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['deptHeads']);
            toast.success('Department head removed');
        }
    });

    const getDeptHeadName = (employeeId) => {
        const emp = employees.find(e => e.id === employeeId);
        return emp?.name || 'Unknown';
    };

    const getReportsToName = (deptHeadId) => {
        const dh = deptHeads.find(d => d.id === deptHeadId);
        if (!dh) return '—';
        return getDeptHeadName(dh.employee_id);
    };

    const handleEditClick = (deptHead) => {
        setEditingHead(deptHead);
        // If no managed employees set, auto-select from department
        const managedIds = deptHead.managed_employee_ids ? deptHead.managed_employee_ids.split(',').filter(Boolean) : [];
        if (managedIds.length === 0) {
            const deptEmployees = employees
                .filter(e => e.company === deptHead.company && e.active && e.department === deptHead.department)
                .map(e => e.id);
            setSelectedManagedEmployees(deptEmployees);
        } else {
            setSelectedManagedEmployees(managedIds);
        }
        setSelectedReportsTo(deptHead.reports_to || '');
        setShowEditDialog(true);
    };

    const handleSaveEdit = () => {
        updateMutation.mutate({
            managed_employee_ids: selectedManagedEmployees.join(','),
            reports_to: selectedReportsTo
        });
    };

    const toggleManagedEmployee = (employeeId) => {
        setSelectedManagedEmployees(prev => 
            prev.includes(employeeId) 
                ? prev.filter(id => id !== employeeId)
                : [...prev, employeeId]
        );
    };

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Settings', href: 'RulesSettings' }, { label: 'Department Heads' }]} />

            <div>
                <h1 className="text-3xl font-bold text-slate-900">Department Head Settings</h1>
                <p className="text-slate-600 mt-2">Assign department heads with managed employees and reporting hierarchy</p>
            </div>

            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle>Assign New Department Head</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label>Company</Label>
                            <Select value={selectedCompany} onValueChange={(val) => {
                                setSelectedCompany(val);
                                setSelectedDepartment('');
                                setSelectedEmployee('');
                                setSelectedManagedEmployees([]);
                                setSelectedReportsTo('');
                            }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select company" />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Department</Label>
                            <Select 
                                value={selectedDepartment} 
                                onValueChange={(val) => {
                                    setSelectedDepartment(val);
                                    // Auto-select employees from this department
                                    const deptEmployees = availableEmployees
                                        .filter(e => e.department === val)
                                        .map(e => e.id);
                                    setSelectedManagedEmployees(deptEmployees);
                                }}
                                disabled={!selectedCompany}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                                <SelectContent>
                                    {departments.map(d => (
                                        <SelectItem key={d} value={d}>{d}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Employee (Department Head)</Label>
                            <Select 
                                value={selectedEmployee} 
                                onValueChange={setSelectedEmployee}
                                disabled={!selectedCompany}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableEmployees.map(e => (
                                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {selectedCompany && (
                        <>
                            <div>
                                <Label>Managed Employees (Optional)</Label>
                                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-slate-50">
                                    {availableEmployees.length === 0 ? (
                                        <p className="text-sm text-slate-500">No employees available</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {availableEmployees.map(emp => (
                                                <label key={emp.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-2 rounded">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedManagedEmployees.includes(emp.id)}
                                                        onChange={() => toggleManagedEmployee(emp.id)}
                                                        className="rounded border-slate-300"
                                                    />
                                                    <span className="text-sm">{emp.name} ({emp.attendance_id})</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Select employees managed by this department head
                                </p>
                            </div>

                            <div>
                                <Label>Reports To (Optional)</Label>
                                <Select 
                                    value={selectedReportsTo} 
                                    onValueChange={setSelectedReportsTo}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select reporting head (none)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={null}>None</SelectItem>
                                        {availableReportsTo.map(dh => (
                                            <SelectItem key={dh.id} value={dh.id}>
                                                {getDeptHeadName(dh.employee_id)} ({dh.department})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500 mt-1">
                                    Set reporting hierarchy if needed
                                </p>
                            </div>
                        </>
                    )}

                    <Button
                        onClick={() => createMutation.mutate()}
                        disabled={!selectedCompany || !selectedDepartment || !selectedEmployee || createMutation.isPending}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Assign Department Head
                    </Button>
                </CardContent>
            </Card>

            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle>Current Department Heads</CardTitle>
                </CardHeader>
                <CardContent>
                    {deptHeads.filter(dh => dh.active).length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No department heads assigned yet
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Department Head</TableHead>
                                    <TableHead>Managed Employees</TableHead>
                                    <TableHead>Reports To</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deptHeads.filter(dh => dh.active).map(dh => {
                                    const managedCount = dh.managed_employee_ids 
                                        ? dh.managed_employee_ids.split(',').filter(Boolean).length 
                                        : 0;
                                    
                                    return (
                                        <TableRow key={dh.id}>
                                            <TableCell>{dh.company}</TableCell>
                                            <TableCell>{dh.department}</TableCell>
                                            <TableCell className="font-medium">
                                                {getDeptHeadName(dh.employee_id)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-slate-400" />
                                                    <span className="text-sm">{managedCount} employees</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-600">
                                                {dh.reports_to ? getReportsToName(dh.reports_to) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleEditClick(dh)}
                                                    >
                                                        <Edit className="w-4 h-4 text-indigo-600" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            if (window.confirm('Remove this department head assignment?')) {
                                                                deleteMutation.mutate(dh.id);
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit Department Head: {editingHead && getDeptHeadName(editingHead.employee_id)}</DialogTitle>
                    </DialogHeader>
                    
                    {editingHead && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-lg">
                                <div>
                                    <p className="text-xs text-slate-500">Company</p>
                                    <p className="font-medium">{editingHead.company}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Department</p>
                                    <p className="font-medium">{editingHead.department}</p>
                                </div>
                            </div>

                            <div>
                                <Label>Managed Employees</Label>
                                <div className="border rounded-lg p-3 max-h-64 overflow-y-auto bg-slate-50">
                                    {employees.filter(e => e.company === editingHead.company && e.active).length === 0 ? (
                                        <p className="text-sm text-slate-500">No employees available</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {employees.filter(e => e.company === editingHead.company && e.active).map(emp => (
                                                <label key={emp.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-2 rounded">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedManagedEmployees.includes(emp.id)}
                                                        onChange={() => toggleManagedEmployee(emp.id)}
                                                        className="rounded border-slate-300"
                                                    />
                                                    <span className="text-sm">{emp.name} ({emp.attendance_id})</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <Label>Reports To</Label>
                                <Select value={selectedReportsTo} onValueChange={setSelectedReportsTo}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select reporting head (none)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={null}>None</SelectItem>
                                        {deptHeads.filter(dh => 
                                            dh.company === editingHead.company && 
                                            dh.active && 
                                            dh.id !== editingHead.id
                                        ).map(dh => (
                                            <SelectItem key={dh.id} value={dh.id}>
                                                {getDeptHeadName(dh.employee_id)} ({dh.department})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleSaveEdit}
                                    disabled={updateMutation.isPending}
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}