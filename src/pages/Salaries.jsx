import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, Trash2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import SortableTableHead from '../components/ui/SortableTableHead';

export default function Salaries() {
    const [searchTerm, setSearchTerm] = useState('');
    const [companyFilter, setCompanyFilter] = useState('all');
    const [showDialog, setShowDialog] = useState(false);
    const [editingSalary, setEditingSalary] = useState(null);
    const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
    
    const [formData, setFormData] = useState({
        employee_id: '',
        attendance_id: '',
        name: '',
        company: '',
        working_hours: 9,
        basic_salary: 0,
        housing_allowance: 0,
        transport_allowance: 0,
        food_allowance: 0,
        other_allowances: 0
    });

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const canAccessAllCompanies = isAdmin || isSupervisor;

    const { data: salaries = [] } = useQuery({
        queryKey: ['salaries'],
        queryFn: () => base44.entities.EmployeeSalary.list('-created_date')
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: async () => {
            const settings = await base44.entities.CompanySettings.list();
            return settings.map(s => s.company);
        }
    });

    const createSalaryMutation = useMutation({
        mutationFn: (data) => {
            const allowances = {
                housing: data.housing_allowance || 0,
                transport: data.transport_allowance || 0,
                food: data.food_allowance || 0,
                others: data.other_allowances || 0
            };
            const total = data.basic_salary + allowances.housing + allowances.transport + allowances.food + allowances.others;
            
            return base44.entities.EmployeeSalary.create({
                employee_id: data.employee_id,
                attendance_id: data.attendance_id,
                name: data.name,
                company: data.company,
                working_hours: data.working_hours || 9,
                basic_salary: data.basic_salary,
                allowances: JSON.stringify(allowances),
                total_salary: total,
                deduction_per_minute: total / (30 * (data.working_hours || 9) * 60)
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['salaries']);
            toast.success('Salary record created');
            setShowDialog(false);
            resetForm();
        },
        onError: () => {
            toast.error('Failed to create salary record');
        }
    });

    const updateSalaryMutation = useMutation({
        mutationFn: ({ id, data }) => {
            const allowances = {
                housing: data.housing_allowance || 0,
                transport: data.transport_allowance || 0,
                food: data.food_allowance || 0,
                others: data.other_allowances || 0
            };
            const total = data.basic_salary + allowances.housing + allowances.transport + allowances.food + allowances.others;
            
            return base44.entities.EmployeeSalary.update(id, {
                working_hours: data.working_hours || 9,
                basic_salary: data.basic_salary,
                allowances: JSON.stringify(allowances),
                total_salary: total,
                deduction_per_minute: total / (30 * (data.working_hours || 9) * 60)
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['salaries']);
            toast.success('Salary record updated');
            setShowDialog(false);
            resetForm();
        },
        onError: () => {
            toast.error('Failed to update salary record');
        }
    });

    const deleteSalaryMutation = useMutation({
        mutationFn: (id) => base44.entities.EmployeeSalary.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['salaries']);
            toast.success('Salary record deleted');
        },
        onError: () => {
            toast.error('Failed to delete salary record');
        }
    });

    const resetForm = () => {
        setFormData({
            employee_id: '',
            attendance_id: '',
            name: '',
            company: '',
            working_hours: 9,
            basic_salary: 0,
            housing_allowance: 0,
            transport_allowance: 0,
            food_allowance: 0,
            other_allowances: 0
        });
        setEditingSalary(null);
    };

    const handleEmployeeSelect = (employeeId) => {
        const employee = employees.find(e => e.id === employeeId);
        if (employee) {
            setFormData(prev => ({
                ...prev,
                employee_id: employee.id,
                attendance_id: employee.attendance_id,
                name: employee.name,
                company: employee.company
            }));
        }
    };

    const handleEdit = (salary) => {
        const allowances = JSON.parse(salary.allowances || '{}');
        setFormData({
            employee_id: salary.employee_id,
            attendance_id: salary.attendance_id,
            name: salary.name,
            company: salary.company,
            working_hours: salary.working_hours || 9,
            basic_salary: salary.basic_salary,
            housing_allowance: allowances.housing || 0,
            transport_allowance: allowances.transport || 0,
            food_allowance: allowances.food || 0,
            other_allowances: allowances.others || 0
        });
        setEditingSalary(salary);
        setShowDialog(true);
    };

    const handleSubmit = () => {
        if (editingSalary) {
            updateSalaryMutation.mutate({ id: editingSalary.id, data: formData });
        } else {
            createSalaryMutation.mutate(formData);
        }
    };

    const handleDelete = (id) => {
        if (window.confirm('Delete this salary record?')) {
            deleteSalaryMutation.mutate(id);
        }
    };

    const filteredSalaries = salaries
        .filter(s => {
            if (!canAccessAllCompanies && currentUser && s.company !== currentUser.company) return false;
            if (companyFilter !== 'all' && s.company !== companyFilter) return false;
            const searchLower = searchTerm.toLowerCase();
            return s.name.toLowerCase().includes(searchLower) || 
                   s.attendance_id.toLowerCase().includes(searchLower) ||
                   s.employee_id.toLowerCase().includes(searchLower);
        })
        .sort((a, b) => {
            let aVal = a[sort.key];
            let bVal = b[sort.key];
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const availableEmployees = employees.filter(emp => {
        const hasExistingSalary = salaries.some(s => s.employee_id === emp.id && s.active);
        return !hasExistingSalary;
    });

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Salaries' }]} />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Employee Salaries</h1>
                    <p className="text-slate-600 mt-1">Manage employee salary and allowances</p>
                </div>
                {(isAdmin || isSupervisor) && (
                    <Button onClick={() => setShowDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Salary Record
                    </Button>
                )}
            </div>

            <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                    <div className="flex gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by name, ID..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        {canAccessAllCompanies && (
                            <Select value={companyFilter} onValueChange={setCompanyFilter}>
                                <SelectTrigger className="w-64">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Companies</SelectItem>
                                    {companies.map(company => (
                                        <SelectItem key={company} value={company}>{company}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Salary Records ({filteredSalaries.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                        Attendance ID
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort}>
                                        Name
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="company" currentSort={sort} onSort={setSort}>
                                        Company
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="working_hours" currentSort={sort} onSort={setSort}>
                                        Working Hours
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="basic_salary" currentSort={sort} onSort={setSort}>
                                        Basic
                                    </SortableTableHead>
                                    <TableHead>Allowance</TableHead>
                                    {(isAdmin || isSupervisor) && <TableHead className="text-right">Actions</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredSalaries.map((salary) => {
                                    const allowances = JSON.parse(salary.allowances || '{}');
                                    return (
                                        <TableRow key={salary.id}>
                                            <TableCell className="font-medium">{salary.attendance_id}</TableCell>
                                            <TableCell>{salary.name}</TableCell>
                                            <TableCell>{salary.company}</TableCell>
                                            <TableCell>
                                                {salary.working_hours || 9} hrs/day
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                AED {salary.basic_salary.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="font-semibold">
                                                AED {((allowances.housing || 0) + (allowances.transport || 0) + (allowances.food || 0) + (allowances.others || 0)).toLocaleString()}
                                            </TableCell>
                                            {(isAdmin || isSupervisor) && (
                                                <TableCell className="text-right">
                                                    <div className="flex gap-1 justify-end">
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost"
                                                            onClick={() => handleEdit(salary)}
                                                        >
                                                            <Edit className="w-4 h-4 text-indigo-600" />
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost"
                                                            onClick={() => handleDelete(salary.id)}
                                                        >
                                                            <Trash2 className="w-4 h-4 text-red-600" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={showDialog} onOpenChange={(open) => {
                if (!open) {
                    setShowDialog(false);
                    resetForm();
                }
            }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingSalary ? 'Edit Salary Record' : 'Add Salary Record'}</DialogTitle>
                    </DialogHeader>
                    
                    <div className="grid grid-cols-2 gap-4 py-4">
                        {!editingSalary && (
                            <div className="col-span-2">
                                <Label>Employee</Label>
                                <Select 
                                    value={formData.employee_id} 
                                    onValueChange={handleEmployeeSelect}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select employee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableEmployees.map(emp => (
                                            <SelectItem key={emp.id} value={emp.id}>
                                                {emp.name} ({emp.attendance_id}) - {emp.company}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {editingSalary && (
                            <>
                                <div className="col-span-2">
                                    <Label>Employee</Label>
                                    <Input value={`${formData.name} (${formData.attendance_id})`} disabled />
                                </div>
                            </>
                        )}

                        <div>
                            <Label>Working Hours per Day</Label>
                            <Input
                                type="number"
                                value={formData.working_hours}
                                onChange={(e) => setFormData({...formData, working_hours: parseFloat(e.target.value) || 9})}
                            />
                        </div>

                        <div>
                            <Label>Basic Salary (AED)</Label>
                            <Input
                                type="number"
                                value={formData.basic_salary}
                                onChange={(e) => setFormData({...formData, basic_salary: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div>
                            <Label>Housing Allowance (AED)</Label>
                            <Input
                                type="number"
                                value={formData.housing_allowance}
                                onChange={(e) => setFormData({...formData, housing_allowance: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div>
                            <Label>Transport Allowance (AED)</Label>
                            <Input
                                type="number"
                                value={formData.transport_allowance}
                                onChange={(e) => setFormData({...formData, transport_allowance: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div>
                            <Label>Food Allowance (AED)</Label>
                            <Input
                                type="number"
                                value={formData.food_allowance}
                                onChange={(e) => setFormData({...formData, food_allowance: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div>
                            <Label>Other Allowances (AED)</Label>
                            <Input
                                type="number"
                                value={formData.other_allowances}
                                onChange={(e) => setFormData({...formData, other_allowances: parseFloat(e.target.value) || 0})}
                            />
                        </div>

                        <div className="col-span-2 bg-slate-50 rounded-lg p-4">
                            <div className="text-sm text-slate-600">Total Salary</div>
                            <div className="text-2xl font-bold text-green-600">
                                AED {(
                                    formData.basic_salary + 
                                    formData.housing_allowance + 
                                    formData.transport_allowance + 
                                    formData.food_allowance + 
                                    formData.other_allowances
                                ).toLocaleString()}
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowDialog(false);
                            resetForm();
                        }}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSubmit}
                            disabled={!formData.employee_id || formData.basic_salary <= 0}
                        >
                            {editingSalary ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}