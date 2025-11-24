import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Pencil, Upload, Trash2, Filter, AlertCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import EmployeeDialog from '../components/employees/EmployeeDialog';

export default function Employees() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const queryClient = useQueryClient();

    const { data: employees = [], isLoading } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list('-created_date')
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Employee.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['employees']);
            toast.success('Employee deleted successfully');
        },
        onError: () => {
            toast.error('Failed to delete employee');
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            const results = [];
            for (const id of ids) {
                try {
                    await base44.entities.Employee.delete(id);
                    results.push(id);
                } catch (error) {
                    console.error('Failed to delete employee:', id, error);
                }
            }
            return results;
        },
        onSuccess: (results) => {
            queryClient.invalidateQueries(['employees']);
            setSelectedEmployeeIds([]);
            toast.success(`${results.length} employee${results.length > 1 ? 's' : ''} deleted successfully`);
        },
        onError: (error) => {
            toast.error('Failed to delete employees: ' + error.message);
        }
    });

    // Detect duplicates
    const duplicateAttendanceIds = new Set();
    const duplicateNames = new Set();
    const attendanceIdCounts = {};
    const nameCounts = {};
    
    employees.forEach(emp => {
        const aid = emp.attendance_id?.toLowerCase();
        const name = emp.name?.toLowerCase();
        
        attendanceIdCounts[aid] = (attendanceIdCounts[aid] || 0) + 1;
        nameCounts[name] = (nameCounts[name] || 0) + 1;
    });
    
    Object.keys(attendanceIdCounts).forEach(aid => {
        if (attendanceIdCounts[aid] > 1) duplicateAttendanceIds.add(aid);
    });
    
    Object.keys(nameCounts).forEach(name => {
        if (nameCounts[name] > 1) duplicateNames.add(name);
    });

    const isDuplicate = (emp) => {
        return duplicateAttendanceIds.has(emp.attendance_id?.toLowerCase()) || 
               duplicateNames.has(emp.name?.toLowerCase());
    };

    const filteredEmployees = employees
        .filter(emp => {
            const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                emp.attendance_id?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesDuplicateFilter = !showOnlyDuplicates || isDuplicate(emp);
            return matchesSearch && matchesDuplicateFilter;
        });

    const totalDuplicates = employees.filter(isDuplicate).length;

    const handleEdit = (employee) => {
        setSelectedEmployee(employee);
        setShowDialog(true);
    };

    const handleDelete = (employee) => {
        if (window.confirm(`Are you sure you want to delete ${employee.name}?`)) {
            deleteMutation.mutate(employee.id);
        }
    };

    const handleBulkDelete = () => {
        if (window.confirm(`Are you sure you want to delete ${selectedEmployeeIds.length} selected employee${selectedEmployeeIds.length > 1 ? 's' : ''}?`)) {
            bulkDeleteMutation.mutate(selectedEmployeeIds);
        }
    };

    const toggleSelectAll = () => {
        if (selectedEmployeeIds.length === filteredEmployees.length) {
            setSelectedEmployeeIds([]);
        } else {
            setSelectedEmployeeIds(filteredEmployees.map(emp => emp.id));
        }
    };

    const toggleSelectEmployee = (id) => {
        setSelectedEmployeeIds(prev => 
            prev.includes(id) ? prev.filter(empId => empId !== id) : [...prev, id]
        );
    };

    const importMutation = useMutation({
        mutationFn: async (employeeList) => {
            const results = [];
            for (const emp of employeeList) {
                try {
                    const result = await base44.entities.Employee.create(emp);
                    results.push(result);
                } catch (error) {
                    console.error('Failed to create employee:', emp, error);
                }
            }
            return results;
        },
        onSuccess: (results) => {
            queryClient.invalidateQueries(['employees']);
            toast.success(`${results.length} employees imported successfully`);
            setImportFile(null);
        },
        onError: (error) => {
            toast.error('Failed to import employees: ' + error.message);
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
                    const employeeList = result.output.employees
                        .filter(emp => emp.attendance_id && emp.name)
                        .map(emp => ({
                            attendance_id: String(emp.attendance_id).trim(),
                            name: String(emp.name).trim()
                        }));
                    
                    if (employeeList.length > 0) {
                        importMutation.mutate(employeeList);
                    } else {
                        toast.error('No valid employees found in file');
                    }
                } else {
                    toast.error('Failed to extract data from Excel file: ' + (result.details || 'Unknown error'));
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
                    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                    if (values.length >= 2 && values[0] && values[1]) {
                        employeeList.push({
                            attendance_id: String(values[0]).trim(),
                            name: String(values[1]).trim()
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
                    {selectedEmployeeIds.length > 0 && (
                        <Button 
                            onClick={handleBulkDelete}
                            variant="destructive"
                            disabled={bulkDeleteMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete {selectedEmployeeIds.length} Selected
                        </Button>
                    )}
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

            {/* Search and Filters */}
            <div className="flex gap-4 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                        placeholder="Search by name or attendance ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <Button
                    variant={showOnlyDuplicates ? "default" : "outline"}
                    onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
                    className={showOnlyDuplicates ? "bg-amber-600 hover:bg-amber-700" : ""}
                >
                    <Filter className="w-4 h-4 mr-2" />
                    Duplicates Only {totalDuplicates > 0 && `(${totalDuplicates})`}
                </Button>
            </div>

            {/* Duplicate Warning */}
            {totalDuplicates > 0 && !showOnlyDuplicates && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                        <p className="font-medium text-amber-900">Duplicate Entries Detected</p>
                        <p className="text-sm text-amber-700 mt-1">
                            Found {totalDuplicates} employee{totalDuplicates > 1 ? 's' : ''} with duplicate attendance IDs or names.{' '}
                            <button 
                                onClick={() => setShowOnlyDuplicates(true)}
                                className="underline font-medium hover:text-amber-900"
                            >
                                View duplicates
                            </button>
                        </p>
                    </div>
                </div>
            )}

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
                                    <TableHead className="w-12">
                                        <Checkbox
                                            checked={selectedEmployeeIds.length === filteredEmployees.length && filteredEmployees.length > 0}
                                            onCheckedChange={toggleSelectAll}
                                        />
                                    </TableHead>
                                    <TableHead>Attendance ID</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredEmployees.map((employee) => {
                                    const hasDuplicate = isDuplicate(employee);
                                    return (
                                        <TableRow key={employee.id} className={hasDuplicate ? "bg-amber-50" : ""}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedEmployeeIds.includes(employee.id)}
                                                    onCheckedChange={() => toggleSelectEmployee(employee.id)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    {employee.attendance_id}
                                                    {duplicateAttendanceIds.has(employee.attendance_id?.toLowerCase()) && (
                                                        <AlertCircle className="w-4 h-4 text-amber-600" title="Duplicate attendance ID" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {employee.name}
                                                    {duplicateNames.has(employee.name?.toLowerCase()) && (
                                                        <AlertCircle className="w-4 h-4 text-amber-600" title="Duplicate name" />
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`
                                                    px-2 py-1 rounded-full text-xs font-medium
                                                    ${employee.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}
                                                `}>
                                                    {employee.active ? 'Active' : 'Inactive'}
                                                </span>
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
                                                    onClick={() => handleDelete(employee)}
                                                    title="Delete employee"
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