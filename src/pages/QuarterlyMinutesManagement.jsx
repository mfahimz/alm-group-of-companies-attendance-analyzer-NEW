import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Save, RefreshCw, Edit2, AlertCircle, Trash2 } from 'lucide-react';
import SortableTableHead from '@/components/ui/SortableTableHead';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCompanyFilter } from '../components/context/CompanyContext';

export default function QuarterlyMinutesManagement() {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [yearFilter, setYearFilter] = useState('all');
    const [halfFilter, setHalfFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'employee_name', direction: 'asc' });
    const [editingValues, setEditingValues] = useState({});
    const [selectedRecords, setSelectedRecords] = useState([]);
    const { selectedCompany: companyFilter } = useCompanyFilter();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrCEO = userRole === 'admin' || userRole === 'ceo';
    const userCompany = currentUser?.company;

    const { data: employees = [], isLoading: employeesLoading } = useQuery({
        queryKey: ['employees', companyFilter],
        queryFn: async () => {
            if (companyFilter) {
                return base44.entities.Employee.filter({ company: companyFilter });
            }
            return base44.entities.Employee.list();
        }
    });

    const { data: quarterlyMinutes = [], isLoading: minutesLoading } = useQuery({
        queryKey: ['quarterlyMinutes', companyFilter],
        queryFn: async () => {
            if (companyFilter) {
                return base44.entities.EmployeeQuarterlyMinutes.filter({ company: companyFilter });
            }
            return base44.entities.EmployeeQuarterlyMinutes.list();
        }
    });

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list()
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    // Terminology migrated from quarterly to half-yearly to match new entity structure (year + half).
    const getHalfYearPeriod = (half, year) => {
        const periods = {
            1: `H1 Jan-Jun ${year}`,
            2: `H2 Jul-Dec ${year}`
        };
        return periods[half] || `H${half} ${year}`;
    };

    const updateMinutesMutation = useMutation({
        mutationFn: async ({ recordId, updates }) => {
            // Update EmployeeQuarterlyMinutes
            const result = await base44.entities.EmployeeQuarterlyMinutes.update(recordId, updates);
            
            // Sync total_minutes back to Employee profile (bidirectional)
            if (updates.total_minutes !== undefined) {
                await base44.functions.invoke('syncQuarterlyMinutesToEmployee', {
                    quarterly_minutes_id: recordId,
                    total_minutes: updates.total_minutes
                });
            }
            
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quarterlyMinutes'] });
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            toast.success('Half-yearly minutes updated and synced to employee profile');
        },
        onError: (error) => {
            toast.error('Failed to update: ' + error.message);
        }
    });

    const deleteRecordMutation = useMutation({
        mutationFn: async (recordId) => {
            await base44.entities.EmployeeQuarterlyMinutes.delete(recordId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quarterlyMinutes'] });
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            toast.success('Record deleted successfully');
        },
        onError: (error) => {
            toast.error('Failed to delete: ' + error.message);
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (recordIds) => {
            await Promise.all(recordIds.map(id => 
                base44.entities.EmployeeQuarterlyMinutes.delete(id)
            ));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['quarterlyMinutes'] });
            queryClient.invalidateQueries({ queryKey: ['employees'] });
            setSelectedRecords([]);
            toast.success('Records deleted successfully');
        },
        onError: (error) => {
            toast.error('Failed to delete records: ' + error.message);
        }
    });

    // Combine employee and half-yearly minutes data
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
                employee_department: employee?.department || '-',
                half_year_period: getHalfYearPeriod(qm.half, qm.year)
            };
        });
    }, [quarterlyMinutes, employees]);

    // Filter and sort data
    const filteredAndSortedData = useMemo(() => {
        let filtered = combinedData.filter(item => {
            const matchesSearch = 
                item.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(item.employee_attendance_id).toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(item.employee_id).toLowerCase().includes(searchQuery.toLowerCase());

            const matchesCompany = !companyFilter || item.employee_company === companyFilter;
            const matchesDepartment = departmentFilter === 'all' || item.employee_department === departmentFilter;
            const matchesYear = yearFilter === 'all' || String(item.year) === yearFilter;
            const matchesHalf = halfFilter === 'all' || String(item.half) === halfFilter;

            // User role filtering
            const matchesRole = isAdminOrCEO || item.employee_company === userCompany;

            return matchesSearch && matchesCompany && matchesDepartment && matchesYear && matchesHalf && matchesRole;
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
    }, [combinedData, searchQuery, companyFilter, departmentFilter, yearFilter, halfFilter, sortConfig, isAdminOrCEO, userCompany]);

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

    const handleDelete = (recordId) => {
        if (confirm('Are you sure you want to delete this half-yearly minutes record?')) {
            deleteRecordMutation.mutate(recordId);
        }
    };

    const handleBulkDelete = () => {
        if (selectedRecords.length === 0) {
            toast.error('No records selected');
            return;
        }
        if (confirm(`Are you sure you want to delete ${selectedRecords.length} selected record(s)?`)) {
            bulkDeleteMutation.mutate(selectedRecords);
        }
    };

    const toggleSelectAll = () => {
        if (selectedRecords.length === filteredAndSortedData.length) {
            setSelectedRecords([]);
        } else {
            setSelectedRecords(filteredAndSortedData.map(r => r.id));
        }
    };

    const toggleSelectRecord = (recordId) => {
        setSelectedRecords(prev => 
            prev.includes(recordId) 
                ? prev.filter(id => id !== recordId)
                : [...prev, recordId]
        );
    };

    const availableCompanies = [...new Set(combinedData.map(d => d.employee_company))].filter(Boolean);
    const availableDepartments = [...new Set(combinedData.map(d => d.employee_department))].filter(Boolean);
    const availableYears = [...new Set(combinedData.map(d => d.year))].filter(Boolean).sort((a, b) => b - a);
    const availableHalves = [...new Set(combinedData.map(d => d.half))].filter(Boolean).sort();

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
                    <h1 className="text-2xl font-bold text-slate-900">Half-Yearly Minutes Management</h1>
                    <p className="text-sm text-slate-600 mt-1">
                        Manage approved minutes allowances for all employees
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedRecords.length > 0 && (
                        <Button
                            variant="destructive"
                            onClick={handleBulkDelete}
                            disabled={bulkDeleteMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete {selectedRecords.length} Selected
                        </Button>
                    )}
                    <Button
                        variant="destructive"
                        onClick={() => {
                            const invalidRecords = combinedData.filter(r => !r.year || !r.half);
                            if (invalidRecords.length === 0) {
                                toast.info('No records without year/half found');
                                return;
                            }
                            if (confirm(`Delete ${invalidRecords.length} record(s) without year/half?`)) {
                                bulkDeleteMutation.mutate(invalidRecords.map(r => r.id));
                            }
                        }}
                        disabled={bulkDeleteMutation.isPending}
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Invalid Records
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => {
                            queryClient.invalidateQueries({ queryKey: ['quarterlyMinutes'] });
                            queryClient.invalidateQueries({ queryKey: ['employees'] });
                            toast.success('Data refreshed');
                        }}
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
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

                        <Select value={halfFilter} onValueChange={setHalfFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Half-Years" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Half-Years</SelectItem>
                                {availableHalves.map(h => (
                                    <SelectItem key={h} value={String(h)}>{h === 1 ? "First Half (Jan-Jun)" : "Second Half (Jul-Dec)"}</SelectItem>
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
                            <p className="font-medium">📅 Calendar-Based Half-Yearly Tracking</p>
                            <p className="text-blue-800 mt-1">
                                Each employee gets 120 minutes per calendar half-year (H1: Jan-Jun, H2: Jul-Dec).
                                Minutes are shared across ALL projects in that half-year. When a department head approves minutes on any date,
                                it deducts from that half-year allowance regardless of which project is running.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        Half-Yearly Minutes Records
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
                                    <TableHead className="w-12">
                                        <input
                                            type="checkbox"
                                            checked={selectedRecords.length === filteredAndSortedData.length && filteredAndSortedData.length > 0}
                                            onChange={toggleSelectAll}
                                            className="rounded border-slate-300"
                                        />
                                    </TableHead>
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
                                        label="Half-Year"
                                        sortKey="half"
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
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAndSortedData.length === 0 ? (
                                   <TableRow>
                                       <TableCell colSpan={isAdminOrCEO ? 13 : 12} className="text-center py-8 text-slate-500">
                                           No half-yearly minutes records found
                                       </TableCell>
                                   </TableRow>
                                ) : (
                                    filteredAndSortedData.map(record => {
                                        const isEditing = editingValues[record.id];
                                        const totalMinutes = isEditing?.total_minutes ?? record.total_minutes;
                                        const usedMinutes = isEditing?.used_minutes ?? record.used_minutes;
                                        const remainingMinutes = totalMinutes - usedMinutes;
                                        const isSelected = selectedRecords.includes(record.id);

                                        return (
                                            <TableRow key={record.id} className={isSelected ? 'bg-blue-50' : ''}>
                                                <TableCell>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelectRecord(record.id)}
                                                        className="rounded border-slate-300"
                                                    />
                                                </TableCell>
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
                                                    {record.half ? `H${record.half}` : '-'}
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
                                                <TableCell className="text-sm text-slate-700">
                                                    {record.half_year_period}
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
                                                        <div className="flex items-center justify-end gap-2">
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
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleDelete(record.id)}
                                                                disabled={deleteRecordMutation.isPending}
                                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
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