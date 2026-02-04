import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Save, RefreshCw, Edit2, AlertCircle, Clock } from 'lucide-react';
import SortableTableHead from '@/components/ui/SortableTableHead';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function GraceMinutesManagement() {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [companyFilter, setCompanyFilter] = useState('all');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
    const [editingValues, setEditingValues] = useState({});

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';
    const userCompany = currentUser?.company;

    const { data: employees = [], isLoading: employeesLoading } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.filter({ active: true }, null, 5000)
    });

    const updateGraceMutation = useMutation({
        mutationFn: async ({ employeeId, carried_grace_minutes }) => {
            await base44.entities.Employee.update(employeeId, {
                carried_grace_minutes: carried_grace_minutes
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            toast.success('Carried grace minutes updated');
        },
        onError: (error) => {
            toast.error('Failed to update: ' + error.message);
        }
    });

    // Filter and sort data
    const filteredAndSortedData = useMemo(() => {
        let filtered = employees.filter(emp => {
            const matchesSearch = 
                emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(emp.attendance_id).toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(emp.hrms_id).toLowerCase().includes(searchQuery.toLowerCase());

            const matchesCompany = companyFilter === 'all' || emp.company === companyFilter;
            const matchesDepartment = departmentFilter === 'all' || emp.department === departmentFilter;

            // User role filtering
            const matchesRole = isAdminOrCEO || emp.company === userCompany;

            return matchesSearch && matchesCompany && matchesDepartment && matchesRole;
        });

        // Sort
        filtered.sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [employees, searchQuery, companyFilter, departmentFilter, sortConfig, isAdminOrCEO, userCompany]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleEditChange = (employeeId, value) => {
        setEditingValues(prev => ({
            ...prev,
            [employeeId]: value
        }));
    };

    const handleSave = (employee) => {
        const editedValue = editingValues[employee.id];
        if (editedValue === undefined) return;

        const graceMins = parseInt(editedValue) || 0;

        updateGraceMutation.mutate({
            employeeId: employee.id,
            carried_grace_minutes: graceMins
        });

        // Clear editing state
        setEditingValues(prev => {
            const newState = { ...prev };
            delete newState[employee.id];
            return newState;
        });
    };

    const availableCompanies = [...new Set(employees.map(e => e.company))].filter(Boolean);
    const availableDepartments = [...new Set(employees.map(e => e.department))].filter(Boolean);

    if (employeesLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Carried Grace Minutes Management</h1>
                    <p className="text-sm text-slate-600 mt-1">
                        Manage unused grace minutes carried forward from closed projects
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ['employees'] });
                        toast.success('Data refreshed');
                    }}
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search employee..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {isAdminOrCEO && (
                            <Select value={companyFilter} onValueChange={setCompanyFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All Companies" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Companies</SelectItem>
                                    {availableCompanies.map(company => (
                                        <SelectItem key={company} value={company}>{company}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Departments" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {availableDepartments.map(dept => (
                                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Alert */}
            <Card className="border-indigo-200 bg-indigo-50">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5" />
                        <div className="text-sm text-indigo-900">
                            <p className="font-medium">⏱️ Grace Minutes Carryover System</p>
                            <p className="text-indigo-800 mt-1">
                                When projects close with unused grace minutes, those minutes can be carried forward to future projects. 
                                This table shows each employee's carried grace minutes balance. Changes here sync bidirectionally with the employee profile.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-indigo-600" />
                        Carried Grace Minutes
                        <span className="text-sm font-normal text-slate-600 ml-3">
                            ({filteredAndSortedData.length} employees)
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableTableHead
                                        label="HRMS ID"
                                        sortKey="hrms_id"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Att ID"
                                        sortKey="attendance_id"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Name"
                                        sortKey="name"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    {isAdminOrCEO && (
                                        <SortableTableHead
                                            label="Company"
                                            sortKey="company"
                                            currentSort={sortConfig}
                                            onSort={handleSort}
                                        />
                                    )}
                                    <SortableTableHead
                                        label="Department"
                                        sortKey="department"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Carried Grace Minutes"
                                        sortKey="carried_grace_minutes"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAndSortedData.length === 0 ? (
                                   <TableRow>
                                       <TableCell colSpan={isAdminOrCEO ? 7 : 6} className="text-center py-8 text-slate-500">
                                           No employees found
                                       </TableCell>
                                   </TableRow>
                                ) : (
                                    filteredAndSortedData.map(employee => {
                                        const isEditing = editingValues[employee.id] !== undefined;
                                        const displayValue = isEditing 
                                            ? editingValues[employee.id] 
                                            : (employee.carried_grace_minutes || 0);

                                        return (
                                            <TableRow key={employee.id} className="hover:bg-slate-50">
                                                <TableCell className="font-medium">{employee.hrms_id}</TableCell>
                                                <TableCell className="font-medium">
                                                    <Link 
                                                        to={createPageUrl(`EmployeeProfile?id=${employee.id}`)}
                                                        className="text-indigo-600 hover:underline"
                                                    >
                                                        {employee.attendance_id}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{employee.name}</TableCell>
                                                {isAdminOrCEO && (
                                                    <TableCell className="text-sm text-slate-600">
                                                        {employee.company}
                                                    </TableCell>
                                                )}
                                                <TableCell className="text-sm text-slate-600">
                                                    {employee.department || '—'}
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            value={displayValue}
                                                            onChange={(e) => handleEditChange(employee.id, e.target.value)}
                                                            className="w-24"
                                                        />
                                                    ) : (
                                                        <span className={`font-semibold ${
                                                            displayValue > 0 ? 'text-green-600' : 'text-slate-400'
                                                        }`}>
                                                            {displayValue}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isEditing ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleSave(employee)}
                                                                disabled={updateGraceMutation.isPending}
                                                            >
                                                                <Save className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setEditingValues(prev => {
                                                                        const newState = { ...prev };
                                                                        delete newState[employee.id];
                                                                        return newState;
                                                                    });
                                                                }}
                                                            >
                                                                Cancel
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setEditingValues(prev => ({
                                                                    ...prev,
                                                                    [employee.id]: employee.carried_grace_minutes || 0
                                                                }));
                                                            }}
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}