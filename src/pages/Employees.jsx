import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Pencil, UserX, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import EmployeeDialog from '../components/employees/EmployeeDialog';

export default function Employees() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
    const queryClient = useQueryClient();

    const { data: employees = [], isLoading } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list('-created_date')
    });

    const toggleStatusMutation = useMutation({
        mutationFn: ({ id, status }) => base44.entities.Employee.update(id, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries(['employees']);
            toast.success('Employee status updated');
        }
    });

    const filteredEmployees = employees.filter(emp =>
        emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.attendance_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.department?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleEdit = (employee) => {
        setSelectedEmployee(employee);
        setShowDialog(true);
    };

    const handleToggleStatus = (employee) => {
        const newStatus = employee.status === 'active' ? 'inactive' : 'active';
        toggleStatusMutation.mutate({ id: employee.id, status: newStatus });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Employees</h1>
                    <p className="text-slate-600 mt-2">Manage employee master list</p>
                </div>
                <Button 
                    onClick={() => {
                        setSelectedEmployee(null);
                        setShowDialog(true);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Employee
                </Button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                    placeholder="Search by name, attendance ID, or department..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Employees Table */}
            <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-8 text-center text-slate-500">Loading employees...</div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            {searchTerm ? 'No employees found matching your search.' : 'No employees yet. Add your first employee to get started.'}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Attendance ID</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredEmployees.map((employee) => (
                                    <TableRow key={employee.id}>
                                        <TableCell className="font-medium">{employee.attendance_id}</TableCell>
                                        <TableCell>{employee.name}</TableCell>
                                        <TableCell>{employee.department || '-'}</TableCell>
                                        <TableCell>
                                            <span className={`
                                                px-2.5 py-1 rounded-full text-xs font-medium
                                                ${employee.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}
                                            `}>
                                                {employee.status}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-slate-600">
                                            {new Date(employee.created_date).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleEdit(employee)}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleToggleStatus(employee)}
                                                    title={employee.status === 'active' ? 'Deactivate' : 'Activate'}
                                                >
                                                    {employee.status === 'active' ? (
                                                        <UserX className="w-4 h-4 text-amber-600" />
                                                    ) : (
                                                        <UserCheck className="w-4 h-4 text-green-600" />
                                                    )}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <EmployeeDialog
                open={showDialog}
                onClose={() => {
                    setShowDialog(false);
                    setSelectedEmployee(null);
                }}
                employee={selectedEmployee}
            />
        </div>
    );
}