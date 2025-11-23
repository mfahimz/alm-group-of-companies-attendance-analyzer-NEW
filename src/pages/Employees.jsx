import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Pencil, UserX, UserCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import EmployeeDialog from '../components/employees/EmployeeDialog';

export default function Employees() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
    const [importFile, setImportFile] = useState(null);
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

    const importMutation = useMutation({
        mutationFn: async (employeeList) => {
            return base44.entities.Employee.bulkCreate(employeeList);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['employees']);
            toast.success('Employees imported successfully');
            setImportFile(null);
        },
        onError: () => {
            toast.error('Failed to import employees');
        }
    });

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

        if (isExcel) {
            // Handle Excel files using integration
            try {
                toast.info('Uploading file...');
                const { file_url } = await base44.integrations.Core.UploadFile({ file });
                
                toast.info('Extracting data...');
                const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
                    file_url,
                    json_schema: {
                        type: 'object',
                        properties: {
                            employees: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        attendance_id: { type: 'string' },
                                        name: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                });

                if (result.status === 'success' && result.output?.employees) {
                    const employeeList = result.output.employees.map(emp => ({
                        attendance_id: emp.attendance_id,
                        name: emp.name,
                        status: 'active'
                    }));
                    importMutation.mutate(employeeList);
                } else {
                    toast.error('Failed to extract data from Excel file');
                }
            } catch (error) {
                toast.error('Error processing Excel file: ' + error.message);
            }
        } else {
            // Handle CSV files
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                const lines = text.split('\n').filter(line => line.trim());
                
                const employeeList = [];
                
                // Skip header, parse rows
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim());
                    if (values.length >= 2 && values[0] && values[1]) {
                        employeeList.push({
                            attendance_id: values[0],
                            name: values[1],
                            status: 'active'
                        });
                    }
                }

                if (employeeList.length > 0) {
                    importMutation.mutate(employeeList);
                } else {
                    toast.error('No valid employee data found in file');
                }
            };
            reader.readAsText(file);
        }
        
        e.target.value = '';
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Employees</h1>
                    <p className="text-slate-600 mt-2">Manage employee master list</p>
                </div>
                <div className="flex gap-3">
                    <label>
                        <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleImport}
                            className="hidden"
                        />
                        <Button 
                            onClick={(e) => e.currentTarget.previousElementSibling.click()}
                            variant="outline"
                            disabled={importMutation.isPending}
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            {importMutation.isPending ? 'Importing...' : 'Import'}
                        </Button>
                    </label>
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