import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tantml/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function DepartmentHeadSettings() {
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState('');
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

    const createMutation = useMutation({
        mutationFn: async () => {
            if (!selectedCompany || !selectedDepartment || !selectedEmployee) {
                throw new Error('Please select all fields');
            }

            // Check if already exists
            const existing = deptHeads.find(dh => 
                dh.company === selectedCompany && 
                dh.department === selectedDepartment &&
                dh.active
            );

            if (existing) {
                throw new Error('Department head already assigned for this department');
            }

            await base44.entities.DepartmentHead.create({
                company: selectedCompany,
                department: selectedDepartment,
                employee_id: selectedEmployee,
                active: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['deptHeads']);
            setSelectedCompany('');
            setSelectedDepartment('');
            setSelectedEmployee('');
            toast.success('Department head assigned successfully');
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

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Settings', href: 'RulesSettings' }, { label: 'Department Heads' }]} />

            <div>
                <h1 className="text-3xl font-bold text-slate-900">Department Head Settings</h1>
                <p className="text-slate-600 mt-2">Assign department heads for approval workflow</p>
            </div>

            <Card className="border-0 shadow-md">
                <CardHeader>
                    <CardTitle>Assign Department Head</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label>Company</Label>
                            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
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
                                onValueChange={setSelectedDepartment}
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
                                    <TableHead>Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deptHeads.filter(dh => dh.active).map(dh => (
                                    <TableRow key={dh.id}>
                                        <TableCell>{dh.company}</TableCell>
                                        <TableCell>{dh.department}</TableCell>
                                        <TableCell className="font-medium">
                                            {getDeptHeadName(dh.employee_id)}
                                        </TableCell>
                                        <TableCell>
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
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}