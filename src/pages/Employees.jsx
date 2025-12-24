import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Pencil, Upload, Trash2, Filter, AlertCircle, Edit, UserCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import SortableTableHead from '../components/ui/SortableTableHead';
import { toast } from 'sonner';
import EmployeeDialog from '../components/employees/EmployeeDialog';
import BulkEditDialog from '../components/employees/BulkEditDialog';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Breadcrumb from '../components/ui/Breadcrumb';
import TablePagination from '../components/ui/TablePagination';

export default function Employees() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showDialog, setShowDialog] = useState(false);
    const [importFile, setImportFile] = useState(null);
    const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [companyFilter, setCompanyFilter] = useState('all');
    const [importProgress, setImportProgress] = useState(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: permissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list(),
        enabled: !!currentUser
    });

    useEffect(() => {
        if (currentUser && permissions.length > 0) {
            const permission = permissions.find(p => p.page_name === 'Employees');
            if (permission) {
                const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
                if (!allowedRoles.includes(currentUser.role)) {
                    toast.error('Access denied.');
                    navigate(createPageUrl('Dashboard'));
                }
            }
        }
    }, [currentUser, permissions, navigate]);

    const { data: allEmployees = [], isLoading } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list('-created_date')
    });

    // Filter employees based on user access
    const employees = React.useMemo(() => {
        if (!currentUser) return [];
        const canAccessAll = isAdmin || currentUser.can_access_all_companies;
        if (canAccessAll) return allEmployees;
        return allEmployees.filter(e => e.company === currentUser.company);
    }, [allEmployees, currentUser, isAdmin]);

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            await base44.entities.Employee.delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['employees']);
            toast.success('Employee deleted successfully');
        },
        onError: (error) => {
            console.error('Delete employee error:', error);
            toast.error('Failed to delete employee: ' + (error.message || 'Unknown error'));
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            const results = [];
            const total = ids.length;
            
            setImportProgress({ current: 0, total, status: 'Deleting employees...' });
            
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                try {
                    await base44.entities.Employee.delete(id);
                    results.push(id);
                } catch (error) {
                    console.error('Failed to delete employee:', id, error);
                }
                setImportProgress({ current: i + 1, total, status: `Deleting ${i + 1}/${total}...` });
            }
            return results;
        },
        onSuccess: (results) => {
            queryClient.invalidateQueries(['employees']);
            setSelectedEmployeeIds([]);
            toast.success(`${results.length} employee${results.length > 1 ? 's' : ''} deleted successfully`);
            setImportProgress(null);
        },
        onError: (error) => {
            toast.error('Failed to delete employees: ' + error.message);
            setImportProgress(null);
        }
    });

    const bulkUpdateMutation = useMutation({
        mutationFn: async ({ ids, updates }) => {
            const results = [];
            for (const id of ids) {
                try {
                    await base44.entities.Employee.update(id, updates);
                    results.push(id);
                } catch (error) {
                    console.error('Failed to update employee:', id, error);
                }
            }
            return results;
        },
        onSuccess: (results) => {
            queryClient.invalidateQueries(['employees']);
            setSelectedEmployeeIds([]);
            setShowBulkEditDialog(false);
            toast.success(`${results.length} employees updated successfully`);
        },
        onError: (error) => {
            toast.error('Failed to update employees: ' + error.message);
        }
    });

    // Detect duplicates (HRMS ID only)
    const duplicateHrmsIds = new Set();
    const hrmsIdCounts = {};
    
    employees.forEach(emp => {
        const hrmsId = emp.hrms_id?.toLowerCase();
        if (hrmsId) {
            hrmsIdCounts[hrmsId] = (hrmsIdCounts[hrmsId] || 0) + 1;
        }
    });
    
    Object.keys(hrmsIdCounts).forEach(hrmsId => {
        if (hrmsIdCounts[hrmsId] > 1) duplicateHrmsIds.add(hrmsId);
    });

    const isDuplicate = (emp) => {
        return emp.hrms_id && duplicateHrmsIds.has(emp.hrms_id?.toLowerCase());
    };

    const filteredEmployees = employees
        .filter(emp => {
            const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                emp.attendance_id?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesDuplicateFilter = !showOnlyDuplicates || isDuplicate(emp);
            const matchesCompany = companyFilter === 'all' || emp.company === companyFilter;
            return matchesSearch && matchesDuplicateFilter && matchesCompany;
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

    const totalDuplicates = employees.filter(isDuplicate).length;

    // Pagination
    const paginatedEmployees = filteredEmployees.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, showOnlyDuplicates, companyFilter]);

    if (!currentUser) {
        return <div className="text-center py-12 text-slate-500">Loading...</div>;
    }

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
            const total = employeeList.length;
            
            setImportProgress({ current: 0, total, status: 'Importing employees...' });
            
            for (let i = 0; i < employeeList.length; i++) {
                const emp = employeeList[i];
                try {
                    // Generate HRMS ID if not provided
                    if (!emp.hrms_id) {
                        const { data } = await base44.functions.invoke('generateHrmsId', {});
                        emp.hrms_id = data.hrms_id;
                    }
                    const result = await base44.entities.Employee.create(emp);
                    results.push(result);
                } catch (error) {
                    console.error('Failed to create employee:', emp, error);
                }
                setImportProgress({ current: i + 1, total, status: `Importing ${i + 1}/${total}...` });
            }
            return results;
        },
        onSuccess: (results) => {
            queryClient.invalidateQueries(['employees']);
            toast.success(`${results.length} employees imported successfully`);
            setImportFile(null);
            setImportProgress(null);
        },
        onError: (error) => {
            toast.error('Failed to import employees: ' + error.message);
            setImportProgress(null);
        }
    });

    const importHrmsIdMutation = useMutation({
        mutationFn: async (hrmsData) => {
            const results = [];
            let matched = 0;
            let notMatched = 0;
            
            for (const item of hrmsData) {
                try {
                    // Find employee by attendance_id
                    const existingEmployee = employees.find(emp => 
                        emp.attendance_id?.toLowerCase() === item.attendance_id?.toLowerCase()
                    );
                    
                    if (existingEmployee) {
                        await base44.entities.Employee.update(existingEmployee.id, {
                            hrms_id: item.hrms_id
                        });
                        matched++;
                        results.push(existingEmployee.id);
                    } else {
                        notMatched++;
                    }
                } catch (error) {
                    console.error('Failed to update employee HRMS ID:', item, error);
                }
            }
            
            return { matched, notMatched };
        },
        onSuccess: ({ matched, notMatched }) => {
            queryClient.invalidateQueries(['employees']);
            if (notMatched > 0) {
                toast.success(`${matched} HRMS IDs updated. ${notMatched} attendance IDs not found.`);
            } else {
                toast.success(`${matched} HRMS IDs updated successfully`);
            }
        },
        onError: (error) => {
            toast.error('Failed to import HRMS IDs: ' + error.message);
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

    const handleHrmsIdImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            const lines = text.split('\n').filter(line => line.trim());
            
            const hrmsData = [];
            
            // Skip header, parse rows
            // Format: attendance_id (column 1), hrms_id (column 2)
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                if (values.length >= 2 && values[0] && values[1]) {
                    hrmsData.push({
                        attendance_id: String(values[0]).trim(),
                        hrms_id: String(values[1]).trim()
                    });
                }
            }

            if (hrmsData.length > 0) {
                importHrmsIdMutation.mutate(hrmsData);
            } else {
                toast.error('No valid HRMS ID data found in file');
            }
        };
        reader.readAsText(file);
        
        e.target.value = '';
    };

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Employees' }]} />
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
                    {selectedEmployeeIds.length > 0 && (
                        <Button 
                            onClick={() => setShowBulkEditDialog(true)}
                            variant="outline"
                        >
                            <Edit className="w-4 h-4 mr-2" />
                            Bulk Edit ({selectedEmployeeIds.length})
                        </Button>
                    )}
                    <label>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleHrmsIdImport}
                            className="hidden"
                        />
                        <Button 
                            onClick={(e) => e.currentTarget.previousElementSibling.click()}
                            variant="outline"
                            disabled={importHrmsIdMutation.isPending}
                        >
                            <UserCheck className="w-4 h-4 mr-2" />
                            {importHrmsIdMutation.isPending ? 'Updating...' : 'Import HRMS IDs'}
                        </Button>
                    </label>
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
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                    <SelectTrigger className="w-64">
                        <SelectValue placeholder="All Companies" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Companies</SelectItem>
                        <SelectItem value="Al Maraghi Auto Repairs">Al Maraghi Auto Repairs</SelectItem>
                        <SelectItem value="Al Maraghi Automotive">Al Maraghi Automotive</SelectItem>
                        <SelectItem value="Naser Mohsin Auto Parts">Naser Mohsin Auto Parts</SelectItem>
                        <SelectItem value="Astra Auto Parts">Astra Auto Parts</SelectItem>
                    </SelectContent>
                </Select>
                <Button
                    variant={showOnlyDuplicates ? "default" : "outline"}
                    onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
                    className={showOnlyDuplicates ? "bg-amber-600 hover:bg-amber-700" : ""}
                >
                    <Filter className="w-4 h-4 mr-2" />
                    Duplicates Only {totalDuplicates > 0 && `(${totalDuplicates})`}
                </Button>
            </div>

            {/* Import Progress */}
            {importProgress && (
                <Card className="border-0 shadow-sm bg-indigo-50 border-indigo-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-medium text-indigo-900">{importProgress.status}</p>
                                <p className="text-sm text-indigo-700 mt-1">
                                    {importProgress.current} / {importProgress.total} processed
                                </p>
                            </div>
                        </div>
                        <div className="w-full bg-indigo-200 rounded-full h-2">
                            <div 
                                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Duplicate Warning */}
            {totalDuplicates > 0 && !showOnlyDuplicates && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                        <p className="font-medium text-amber-900">Duplicate Entries Detected</p>
                        <p className="text-sm text-amber-700 mt-1">
                            Found {totalDuplicates} employee{totalDuplicates > 1 ? 's' : ''} with duplicate HRMS IDs.{' '}
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
                                    <SortableTableHead sortKey="hrms_id" currentSort={sort} onSort={setSort}>
                                        HRMS ID
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                        Attendance ID
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort}>
                                        Name
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="company" currentSort={sort} onSort={setSort}>
                                        Company
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="department" currentSort={sort} onSort={setSort}>
                                        Department
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="active" currentSort={sort} onSort={setSort}>
                                        Status
                                    </SortableTableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedEmployees.map((employee) => {
                                    const hasDuplicate = isDuplicate(employee);
                                    return (
                                        <TableRow key={employee.id} className={hasDuplicate ? "bg-amber-50" : ""}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedEmployeeIds.includes(employee.id)}
                                                    onCheckedChange={() => toggleSelectEmployee(employee.id)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium text-slate-600">
                                               <div className="flex items-center gap-2">
                                                   {employee.hrms_id || '-'}
                                                   {employee.hrms_id && duplicateHrmsIds.has(employee.hrms_id?.toLowerCase()) && (
                                                       <AlertCircle className="w-4 h-4 text-amber-600" title="Duplicate HRMS ID" />
                                                   )}
                                               </div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {employee.attendance_id}
                                            </TableCell>
                                            <TableCell>
                                                {employee.name}
                                            </TableCell>
                                            <TableCell className="text-slate-600">{employee.company || '-'}</TableCell>
                                            <TableCell className="text-slate-600">{employee.department || '-'}</TableCell>
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
                    {filteredEmployees.length > 0 && (
                        <TablePagination
                            totalItems={filteredEmployees.length}
                            currentPage={currentPage}
                            rowsPerPage={rowsPerPage}
                            onPageChange={setCurrentPage}
                            onRowsPerPageChange={(value) => {
                                setRowsPerPage(value);
                                setCurrentPage(1);
                            }}
                        />
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

            <BulkEditDialog
                open={showBulkEditDialog}
                onClose={() => setShowBulkEditDialog(false)}
                selectedCount={selectedEmployeeIds.length}
                onConfirm={(updates) => bulkUpdateMutation.mutate({ ids: selectedEmployeeIds, updates })}
                isPending={bulkUpdateMutation.isPending}
            />
        </div>
    );
}