import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Save, RefreshCw, Edit2, AlertCircle } from 'lucide-react';
import SortableTableHead from '@/components/ui/SortableTableHead';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function QuarterlyMinutesManagement() {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [companyFilter, setCompanyFilter] = useState('all');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [yearFilter, setYearFilter] = useState('all');
    const [quarterFilter, setQuarterFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'employee_name', direction: 'asc' });
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
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: quarterlyMinutes = [], isLoading: minutesLoading } = useQuery({
        queryKey: ['quarterlyMinutes'],
        queryFn: () => base44.entities.EmployeeQuarterlyMinutes.filter({
            company: 'Al Maraghi Auto Repairs'
        })
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    const updateMinutesMutation = useMutation({
        mutationFn: async ({ recordId, updates }) => {
            return await base44.entities.EmployeeQuarterlyMinutes.update(recordId, updates);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quarterlyMinutes'] });
            toast.success('Quarterly minutes updated successfully');
        },
        onError: (error) => {
            toast.error('Failed to update: ' + error.message);
        }
    });

    // Combine employee and quarterly minutes data
    const combinedData = useMemo(() => {
        return quarterlyMinutes.map(qm => {
            const employee = employees.find(e => 
                String(e.hrms_id) === String(qm.employee_id) || 
                String(e.id) === String(qm.employee_id)
            );
            
            return {
                ...qm,
                employee,
                employee_name: employee?.name || 'Unknown',
                employee_attendance_id: employee?.attendance_id || '-',
                employee_company: employee?.company || qm.company,
                employee_department: employee?.department || '-'
            };
        });
    }, [quarterlyMinutes, employees]);

    // Filter and sort data
    const filteredAndSortedData = useMemo(() => {
        let filtered = combinedData.filter(item => {
            const matchesSearch = 
                item.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(item.employee_attendance_id).includes(searchQuery) ||
                String(item.employee_id).includes(searchQuery);

            const matchesCompany = companyFilter === 'all' || item.employee_company === companyFilter;
            const matchesDepartment = departmentFilter === 'all' || item.employee_department === departmentFilter;
            const matchesYear = yearFilter === 'all' || String(item.year) === yearFilter;
            const matchesQuarter = quarterFilter === 'all' || String(item.quarter) === quarterFilter;

            // User role filtering
            const matchesRole = isAdminOrCEO || item.employee_company === userCompany;

            return matchesSearch && matchesCompany && matchesDepartment && matchesYear && matchesQuarter && matchesRole;
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
    }, [combinedData, searchQuery, companyFilter, departmentFilter, yearFilter, quarterFilter, sortConfig, isAdminOrCEO, userCompany]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleEditChange = (recordId, field, value) => {
        setEditingValues(prev => ({
            ...prev,
            [recordId]: {
                ...prev[recordId],
                [field]: value
            }
        }));
    };

    const handleSave = (record) => {
        const edits = editingValues[record.id];
        if (!edits) return;

        const usedMinutes = parseInt(edits.used_minutes ?? record.used_minutes) || 0;
        const totalMinutes = parseInt(edits.total_minutes ?? record.total_minutes) || 120;
        const remainingMinutes = Math.max(0, totalMinutes - usedMinutes);

        updateMinutesMutation.mutate({
            recordId: record.id,
            updates: {
                total_minutes: totalMinutes,
                used_minutes: usedMinutes,
                remaining_minutes: remainingMinutes
            }
        });

        // Clear editing state
        setEditingValues(prev => {
            const newState = { ...prev };
            delete newState[record.id];
            return newState;
        });
    };

    const availableCompanies = [...new Set(combinedData.map(d => d.employee_company))].filter(Boolean);
    const availableDepartments = [...new Set(combinedData.map(d => d.employee_department))].filter(Boolean);
    const availableYears = [...new Set(combinedData.map(d => d.year))].filter(Boolean).sort((a, b) => b - a);
    const availableQuarters = [...new Set(combinedData.map(d => d.quarter))].filter(Boolean).sort();

    if (employeesLoading || minutesLoading) {
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
                    <h1 className="text-2xl font-bold text-slate-900">Quarterly Minutes Management</h1>
                    <p className="text-sm text-slate-600 mt-1">
                        Manage approved minutes allowances for all employees
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['quarterlyMinutes'] })}
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

                        <Select value={yearFilter} onValueChange={setYearFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Years" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Years</SelectItem>
                                {availableYears.map(year => (
                                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select value={quarterFilter} onValueChange={setQuarterFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Quarters" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Quarters</SelectItem>
                                {availableQuarters.map(q => (
                                    <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Alert */}
            <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-900">
                            <p className="font-medium">Bidirectional Sync Enabled</p>
                            <p className="text-blue-800 mt-1">
                                Changes made here are automatically reflected in employee profiles and vice versa. 
                                Used minutes auto-increment when department heads approve exceptions.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Quarterly Minutes Records
                        <span className="text-sm font-normal text-slate-600 ml-3">
                            ({filteredAndSortedData.length} records)
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
                                        sortKey="employee_id"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Att ID"
                                        sortKey="employee_attendance_id"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Name"
                                        sortKey="employee_name"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    {isAdminOrCEO && (
                                        <SortableTableHead
                                            label="Company"
                                            sortKey="employee_company"
                                            currentSort={sortConfig}
                                            onSort={handleSort}
                                        />
                                    )}
                                    <SortableTableHead
                                        label="Department"
                                        sortKey="employee_department"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Year"
                                        sortKey="year"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Quarter"
                                        sortKey="quarter"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Total Minutes"
                                        sortKey="total_minutes"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Used Minutes"
                                        sortKey="used_minutes"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <SortableTableHead
                                        label="Remaining"
                                        sortKey="remaining_minutes"
                                        currentSort={sortConfig}
                                        onSort={handleSort}
                                    />
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAndSortedData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={isAdminOrCEO ? 12 : 11} className="text-center py-8 text-slate-500">
                                            No quarterly minutes records found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredAndSortedData.map(record => {
                                        const isEditing = editingValues[record.id];
                                        const totalMinutes = isEditing?.total_minutes ?? record.total_minutes;
                                        const usedMinutes = isEditing?.used_minutes ?? record.used_minutes;
                                        const remainingMinutes = totalMinutes - usedMinutes;

                                        return (
                                            <TableRow key={record.id}>
                                                <TableCell className="font-medium">{record.employee_id}</TableCell>
                                                <TableCell className="font-medium">
                                                    <Link 
                                                        to={createPageUrl(`EmployeeProfile?id=${record.employee?.id}`)}
                                                        className="text-indigo-600 hover:underline"
                                                    >
                                                        {record.employee_attendance_id}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{record.employee_name}</TableCell>
                                                {isAdminOrCEO && (
                                                    <TableCell className="text-sm text-slate-600">
                                                        {record.employee_company}
                                                    </TableCell>
                                                )}
                                                <TableCell className="text-sm text-slate-600">
                                                    {record.employee_department}
                                                </TableCell>
                                                <TableCell>{record.year || '-'}</TableCell>
                                                <TableCell>
                                                    {record.quarter ? `Q${record.quarter}` : '-'}
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            value={totalMinutes}
                                                            onChange={(e) => handleEditChange(record.id, 'total_minutes', e.target.value)}
                                                            className="w-20"
                                                        />
                                                    ) : (
                                                        totalMinutes
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max={totalMinutes}
                                                            value={usedMinutes}
                                                            onChange={(e) => handleEditChange(record.id, 'used_minutes', e.target.value)}
                                                            className="w-20"
                                                        />
                                                    ) : (
                                                        <span className="font-semibold text-blue-600">{usedMinutes}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className={remainingMinutes <= 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                                        {remainingMinutes}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-500">
                                                    {record.allocation_type}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isEditing ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleSave(record)}
                                                                disabled={updateMinutesMutation.isPending}
                                                            >
                                                                <Save className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setEditingValues(prev => {
                                                                        const newState = { ...prev };
                                                                        delete newState[record.id];
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
                                                                    [record.id]: {
                                                                        total_minutes: record.total_minutes,
                                                                        used_minutes: record.used_minutes
                                                                    }
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