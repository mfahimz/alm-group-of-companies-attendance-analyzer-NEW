import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Users, Search, Filter, CheckCircle } from 'lucide-react';
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
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCompany, setFilterCompany] = useState('all');
    const [filterDepartment, setFilterDepartment] = useState('all');
    const [managedEmployeesSearch, setManagedEmployeesSearch] = useState('');
    const [editManagedEmployeesSearch, setEditManagedEmployeesSearch] = useState('');
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

    const { data: users = [] } = useQuery({
        queryKey: ['users'],
        queryFn: () => base44.entities.User.list()
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions'],
        queryFn: () => base44.entities.Exception.list()
    });

    const companies = ['Al Maraghi Auto Repairs', 'Al Maraghi Automotive', 'Naser Mohsin Auto Parts', 'Astra Auto Parts'];

    const departments = React.useMemo(() => {
        if (!selectedCompany) return [];
        const setting = companySettings.find(s => s.company === selectedCompany);
        if (!setting) return ['Admin'];
        return ['Admin', ...setting.departments.split(',').map(d => d.trim()).filter(Boolean)];
    }, [selectedCompany, companySettings]);

    // Get all employee IDs that are already assigned as department heads
    const assignedDeptHeadIds = deptHeads
        .filter(dh => dh.active)
        .map(dh => dh.employee_id);

    // Available employees = company match, active, and NOT already a dept head (unless editing that specific head)
    const availableEmployees = employees.filter(e => {
        if (e.company !== selectedCompany || !e.active) return false;
        // If editing, allow the current dept head employee to remain in list
        if (editingHead && e.id === editingHead.employee_id) return true;
        // Otherwise, exclude employees who are already dept heads
        return !assignedDeptHeadIds.includes(e.id);
    });

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

            // Check if this employee is already assigned as a department head anywhere
            const existingAssignment = deptHeads.find(dh => 
                dh.active && 
                dh.employee_id === selectedEmployee
            );
            
            if (existingAssignment) {
                const empName = getDeptHeadName(selectedEmployee);
                throw new Error(`${empName} is already assigned as department head for ${existingAssignment.department} in ${existingAssignment.company}`);
            }

            // Check if this company+department combination already has a department head
            const duplicateDept = deptHeads.find(dh => 
                dh.active && 
                dh.company === selectedCompany && 
                dh.department === selectedDepartment
            );
            
            if (duplicateDept) {
                throw new Error(`${selectedDepartment} in ${selectedCompany} already has a department head: ${getDeptHeadName(duplicateDept.employee_id)}`);
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

    const getReportsToName = (reportsToValue) => {
        // Check if it's HR Manager
        if (reportsToValue === 'HR_MANAGER') {
            const hrManagers = users.filter(u => (u.extended_role || u.role) === 'hr_manager');
            if (hrManagers.length > 0) {
                return `HR Manager (${hrManagers.map(h => h.full_name).join(', ')})`;
            }
            return 'HR Manager';
        }
        
        // Check if it's a department head
        const dh = deptHeads.find(d => d.id === reportsToValue);
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
        setEditManagedEmployeesSearch('');
        setShowEditDialog(true);
    };

    const handleSaveEdit = () => {
        updateMutation.mutate({
            managed_employee_ids: selectedManagedEmployees.join(','),
            reports_to: selectedReportsTo
        });
    };

    const toggleManagedEmployee = (employeeId) => {
        // Check if trying to select someone who is already a dept head
        const isAlreadyDeptHead = assignedDeptHeadIds.includes(employeeId);
        
        if (isAlreadyDeptHead && !selectedManagedEmployees.includes(employeeId)) {
            const emp = employees.find(e => e.id === employeeId);
            const deptHeadAssignment = deptHeads.find(dh => dh.active && dh.employee_id === employeeId);
            toast.error(`${emp?.name || 'Employee'} is already assigned as department head for ${deptHeadAssignment?.department || 'another department'} in ${deptHeadAssignment?.company || 'another company'}`);
            return;
        }

        setSelectedManagedEmployees(prev => 
            prev.includes(employeeId) 
                ? prev.filter(id => id !== employeeId)
                : [...prev, employeeId]
        );
    };



    // Filter department heads
    const filteredDeptHeads = deptHeads.filter(dh => {
        if (!dh.active) return false;
        
        const matchesSearch = searchTerm === '' || 
            getDeptHeadName(dh.employee_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
            dh.department.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesCompany = filterCompany === 'all' || dh.company === filterCompany;
        const matchesDepartment = filterDepartment === 'all' || dh.department === filterDepartment;
        
        return matchesSearch && matchesCompany && matchesDepartment;
    });

    const allDepartments = [...new Set(deptHeads.filter(dh => dh.active).map(dh => dh.department))];



    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Settings', href: 'RulesSettings' }, { label: 'Department Heads' }]} />

            <div>
                <h1 className="text-3xl font-bold text-slate-900">Department Head Settings</h1>
                <p className="text-slate-600 mt-2">Manage department heads, their teams, and approval workflows</p>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Total Dept Heads</p>
                                <p className="text-2xl font-bold text-slate-900">{deptHeads.filter(dh => dh.active).length}</p>
                            </div>
                            <Users className="w-8 h-8 text-indigo-600 opacity-20" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Total Managed Employees</p>
                                <p className="text-2xl font-bold text-blue-600">
                                    {deptHeads.filter(dh => dh.active).reduce((sum, dh) => {
                                        return sum + (dh.managed_employee_ids ? dh.managed_employee_ids.split(',').filter(Boolean).length : 0);
                                    }, 0)}
                                </p>
                            </div>
                            <Users className="w-8 h-8 text-blue-600 opacity-20" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Companies Covered</p>
                                <p className="text-2xl font-bold text-purple-600">
                                    {[...new Set(deptHeads.filter(dh => dh.active).map(dh => dh.company))].length}
                                </p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-purple-600 opacity-20" />
                        </div>
                    </CardContent>
                </Card>
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
                                onValueChange={(val) => {
                                    setSelectedEmployee(val);
                                    // Auto-uncheck the selected employee from managed employees
                                    setSelectedManagedEmployees(prev => prev.filter(id => id !== val));
                                }}
                                disabled={!selectedCompany}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableEmployees.length === 0 ? (
                                        <div className="p-2 text-sm text-slate-500">
                                            No available employees (all assigned as dept heads)
                                        </div>
                                    ) : (
                                        availableEmployees.map(e => (
                                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                Only employees not assigned as department heads are shown
                            </p>
                        </div>
                    </div>

                    {selectedCompany && (
                        <>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label>Managed Employees (Optional)</Label>
                                    {selectedManagedEmployees.length > 0 && (
                                        <span className="text-xs text-indigo-600 font-medium">
                                            {selectedManagedEmployees.length} selected
                                        </span>
                                    )}
                                </div>
                                <div className="border rounded-lg bg-slate-50">
                                    <div className="p-2 border-b bg-white">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                placeholder="Search employees..."
                                                value={managedEmployeesSearch}
                                                onChange={(e) => setManagedEmployeesSearch(e.target.value)}
                                                className="pl-9 h-9"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3 max-h-48 overflow-y-auto">
                                        {availableEmployees.length === 0 ? (
                                            <p className="text-sm text-slate-500">No employees available</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {availableEmployees
                                                    .filter(emp => {
                                                        if (!managedEmployeesSearch) return true;
                                                        const search = managedEmployeesSearch.toLowerCase();
                                                        const attendanceIdStr = emp.attendance_id != null ? String(emp.attendance_id) : '';
                                                        return emp.name.toLowerCase().includes(search) || 
                                                               attendanceIdStr.toLowerCase().includes(search);
                                                    })
                                                    .map(emp => {
                                                        const isDeptHeadForThis = emp.id === selectedEmployee;

                                                        return (
                                                            <label key={emp.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-2 rounded">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedManagedEmployees.includes(emp.id)}
                                                                    onChange={() => toggleManagedEmployee(emp.id)}
                                                                    disabled={isDeptHeadForThis}
                                                                    className="rounded border-slate-300"
                                                                />
                                                                <span className={`text-sm flex-1 ${isDeptHeadForThis ? 'text-slate-400' : ''}`}>
                                                                    {emp.name} ({emp.attendance_id})
                                                                </span>
                                                                {isDeptHeadForThis && (
                                                                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                                                        Department Head
                                                                    </span>
                                                                )}
                                                            </label>
                                                        );
                                                    })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    Select employees managed by this department head. Department head cannot manage themselves.
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
                                        <SelectItem value="HR_MANAGER">HR Manager</SelectItem>
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
                    <div className="flex items-center justify-between">
                        <CardTitle>Current Department Heads</CardTitle>
                        <div className="flex gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 w-64"
                                />
                            </div>
                            <Select value={filterCompany} onValueChange={setFilterCompany}>
                                <SelectTrigger className="w-48">
                                    <Filter className="w-4 h-4 mr-2" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Companies</SelectItem>
                                    {companies.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                                <SelectTrigger className="w-48">
                                    <SelectValue placeholder="All Departments" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Departments</SelectItem>
                                    {allDepartments.map(d => (
                                        <SelectItem key={d} value={d}>{d}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {filteredDeptHeads.length === 0 ? (
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
                                {filteredDeptHeads.map(dh => {
                                    const managedCount = dh.managed_employee_ids 
                                        ? dh.managed_employee_ids.split(',').filter(Boolean).length 
                                        : 0;
                                    
                                    return (
                                        <TableRow key={dh.id}>
                                            <TableCell className="text-sm">{dh.company}</TableCell>
                                            <TableCell className="font-medium">{dh.department}</TableCell>
                                            <TableCell className="font-medium text-slate-900">
                                                {getDeptHeadName(dh.employee_id)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-slate-400" />
                                                    <span className="text-sm font-medium">{managedCount}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-slate-600">
                                                {dh.reports_to ? getReportsToName(dh.reports_to) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleEditClick(dh)}
                                                        title="Edit"
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
                                                        title="Delete"
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

                            {selectedManagedEmployees.length > 0 && (
                                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                                    <p className="text-xs font-medium text-indigo-900 mb-2">
                                        Selected Employees ({selectedManagedEmployees.length})
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedManagedEmployees.map(empId => {
                                            const emp = employees.find(e => e.id === empId);
                                            return emp ? (
                                                <span key={empId} className="inline-flex items-center px-2 py-1 bg-white border border-indigo-200 rounded text-xs text-slate-700">
                                                    {emp.name}
                                                </span>
                                            ) : null;
                                        })}
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label>Managed Employees</Label>
                                    {selectedManagedEmployees.length > 0 && (
                                        <span className="text-xs text-indigo-600 font-medium">
                                            {selectedManagedEmployees.length} selected
                                        </span>
                                    )}
                                </div>
                                <div className="border rounded-lg bg-slate-50">
                                    <div className="p-2 border-b bg-white">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <Input
                                                placeholder="Search employees..."
                                                value={editManagedEmployeesSearch}
                                                onChange={(e) => setEditManagedEmployeesSearch(e.target.value)}
                                                className="pl-9 h-9"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3 max-h-64 overflow-y-auto">
                                        {employees.filter(e => e.company === editingHead.company && e.active).length === 0 ? (
                                            <p className="text-sm text-slate-500">No employees available</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {employees
                                                    .filter(e => e.company === editingHead.company && e.active)
                                                    .filter(emp => {
                                                        if (!editManagedEmployeesSearch) return true;
                                                        const search = editManagedEmployeesSearch.toLowerCase();
                                                        const attendanceIdStr = emp.attendance_id != null ? String(emp.attendance_id) : '';
                                                        return emp.name.toLowerCase().includes(search) || 
                                                               attendanceIdStr.toLowerCase().includes(search);
                                                    })
                                                    .map(emp => {
                                                         const isDeptHeadForThis = emp.id === editingHead.employee_id;
                                                         const assignedDeptHead = deptHeads.find(dh => 
                                                             dh.active && 
                                                             dh.employee_id === emp.id && 
                                                             dh.id !== editingHead.id
                                                         );

                                                         return (
                                                             <label key={emp.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-2 rounded">
                                                                 <input
                                                                     type="checkbox"
                                                                     checked={selectedManagedEmployees.includes(emp.id)}
                                                                     onChange={() => toggleManagedEmployee(emp.id)}
                                                                     disabled={isDeptHeadForThis}
                                                                     className="rounded border-slate-300"
                                                                 />
                                                                 <span className={`text-sm flex-1 ${isDeptHeadForThis ? 'text-slate-400' : ''}`}>
                                                                     {emp.name} ({emp.attendance_id})
                                                                 </span>
                                                                 {isDeptHeadForThis && (
                                                                     <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                                                         Department Head
                                                                     </span>
                                                                 )}
                                                                 {assignedDeptHead && (
                                                                     <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                                                                         Assigned: {assignedDeptHead.department}
                                                                     </span>
                                                                 )}
                                                             </label>
                                                         );
                                                     })}
                                            </div>
                                        )}
                                    </div>
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
                                        <SelectItem value="HR_MANAGER">HR Manager</SelectItem>
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