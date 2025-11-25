import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Plus, Trash2, Search, Upload, Download } from 'lucide-react';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';

// Map user-friendly names to system type codes
const TYPE_MAP = {
    'off': 'OFF',
    'leave': 'OFF',
    'off / leave': 'OFF',
    'public holiday': 'PUBLIC_HOLIDAY',
    'holiday': 'PUBLIC_HOLIDAY',
    'shift override': 'SHIFT_OVERRIDE',
    'manual present': 'MANUAL_PRESENT',
    'present': 'MANUAL_PRESENT',
    'manual absent': 'MANUAL_ABSENT',
    'absent': 'MANUAL_ABSENT',
    'manual half': 'MANUAL_HALF',
    'half day': 'MANUAL_HALF',
    'half': 'MANUAL_HALF',
    'manual early checkout': 'MANUAL_EARLY_CHECKOUT',
    'early checkout': 'MANUAL_EARLY_CHECKOUT',
    'sick leave': 'SICK_LEAVE',
    'sick': 'SICK_LEAVE',
    // Also accept the exact system codes
    'off': 'OFF',
    'public_holiday': 'PUBLIC_HOLIDAY',
    'shift_override': 'SHIFT_OVERRIDE',
    'manual_present': 'MANUAL_PRESENT',
    'manual_absent': 'MANUAL_ABSENT',
    'manual_half': 'MANUAL_HALF',
    'manual_early_checkout': 'MANUAL_EARLY_CHECKOUT',
    'sick_leave': 'SICK_LEAVE'
};

export default function ExceptionsTab({ project }) {
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        attendance_id: '',
        date_from: '',
        date_to: '',
        type: 'OFF',
        new_am_start: '',
        new_am_end: '',
        new_pm_start: '',
        new_pm_end: '',
        early_checkout_minutes: '',
        details: ''
    });
    const [filter, setFilter] = useState({ search: '', type: 'all' });
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [importProgress, setImportProgress] = useState(null);
    const queryClient = useQueryClient();

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.Exception.create({
            ...data,
            project_id: project.id
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success('Exception added successfully');
            setShowForm(false);
            resetForm();
        },
        onError: (error) => {
            toast.error('Failed to add exception: ' + (error.message || 'Unknown error'));
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Exception.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success('Exception deleted');
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Exception.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
        }
    });

    const handleCellChange = (exceptionId, field, value) => {
        updateMutation.mutate({ id: exceptionId, data: { [field]: value } });
    };

    const parseDate = (value) => {
        if (!value) return '';
        // If it's already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        // DD/MM/YYYY format
        const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
            const [, day, month, year] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // Try Excel serial date number
        if (!isNaN(value)) {
            const date = new Date((value - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
        }
        return '';
    };

    const handleFileImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

                const exceptions = [];
                const errors = [];

                jsonData.forEach((row, index) => {
                    const rowNum = index + 2; // Excel row (header is row 1)
                    
                    // Get attendance_id (support multiple column names)
                    const attendance_id = row.attendance_id || row.employee_id || row.id || row.AttendanceID || row.EmployeeID || '';
                    
                    // Get dates
                    const date_from = parseDate(row.date_from || row.from || row.start_date || row.DateFrom || '');
                    const date_to = parseDate(row.date_to || row.to || row.end_date || row.DateTo || date_from);
                    
                    // Get type and map it
                    const typeRaw = (row.type || row.Type || row.exception_type || '').toString().toLowerCase().trim();
                    const type = TYPE_MAP[typeRaw];
                    
                    if (!type) {
                        errors.push(`Row ${rowNum}: Invalid type "${row.type || ''}". Use: Off, Public Holiday, Sick Leave, Present, Absent, Half Day, Shift Override, Early Checkout`);
                        return;
                    }
                    
                    if (!date_from) {
                        errors.push(`Row ${rowNum}: Missing or invalid date_from`);
                        return;
                    }
                    
                    // For PUBLIC_HOLIDAY, set attendance_id to ALL
                    const finalAttendanceId = type === 'PUBLIC_HOLIDAY' ? 'ALL' : attendance_id;
                    
                    if (type !== 'PUBLIC_HOLIDAY' && !finalAttendanceId) {
                        errors.push(`Row ${rowNum}: Missing attendance_id`);
                        return;
                    }

                    exceptions.push({
                        project_id: project.id,
                        attendance_id: finalAttendanceId,
                        date_from,
                        date_to: date_to || date_from,
                        type,
                        details: row.details || row.reason || row.notes || '',
                        new_am_start: row.new_am_start || row.am_start || '',
                        new_am_end: row.new_am_end || row.am_end || '',
                        new_pm_start: row.new_pm_start || row.pm_start || '',
                        new_pm_end: row.new_pm_end || row.pm_end || '',
                        early_checkout_minutes: row.early_checkout_minutes ? parseInt(row.early_checkout_minutes) : null
                    });
                });

                if (errors.length > 0) {
                    toast.error(`${errors.length} errors found:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''}`);
                    return;
                }

                if (exceptions.length === 0) {
                    toast.error('No valid exceptions found in file');
                    return;
                }

                setImportProgress({ current: 0, total: exceptions.length });
                
                const batchSize = 20;
                for (let i = 0; i < exceptions.length; i += batchSize) {
                    const batch = exceptions.slice(i, i + batchSize);
                    await base44.entities.Exception.bulkCreate(batch);
                    setImportProgress({ current: Math.min(i + batchSize, exceptions.length), total: exceptions.length });
                }

                queryClient.invalidateQueries(['exceptions', project.id]);
                toast.success(`Imported ${exceptions.length} exceptions successfully`);
                setImportProgress(null);
            } catch (error) {
                toast.error('Failed to import file: ' + error.message);
                setImportProgress(null);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const downloadTemplate = () => {
        const template = `attendance_id,date_from,date_to,type,details
544,2025-11-10,2025-11-10,Off,Annual leave
ALL,2025-11-15,2025-11-15,Public Holiday,National Day
322,2025-11-12,2025-11-14,Sick Leave,Medical certificate
123,2025-11-20,2025-11-20,Present,Worked from home
456,2025-11-21,2025-11-21,Half Day,Left early`;
        
        const blob = new Blob([template], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'exceptions_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const resetForm = () => {
        setFormData({
            attendance_id: '',
            date_from: '',
            date_to: '',
            type: 'OFF',
            new_am_start: '',
            new_am_end: '',
            new_pm_start: '',
            new_pm_end: '',
            early_checkout_minutes: '',
            details: ''
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // For PUBLIC_HOLIDAY, attendance_id is not required
        if (formData.type !== 'PUBLIC_HOLIDAY' && !formData.attendance_id) {
            toast.error('Please select an employee');
            return;
        }
        
        if (!formData.date_from || !formData.date_to) {
            toast.error('Please fill in date range');
            return;
        }
        
        // For PUBLIC_HOLIDAY, set attendance_id to 'ALL'
        const submitData = formData.type === 'PUBLIC_HOLIDAY' 
            ? { ...formData, attendance_id: 'ALL' }
            : formData;
        
        // Clean up empty string values and convert early_checkout_minutes to number
        const cleanedData = {
            attendance_id: submitData.attendance_id,
            date_from: submitData.date_from,
            date_to: submitData.date_to,
            type: submitData.type,
            details: submitData.details || null
        };
        
        if (submitData.type === 'SHIFT_OVERRIDE') {
            cleanedData.new_am_start = submitData.new_am_start || null;
            cleanedData.new_am_end = submitData.new_am_end || null;
            cleanedData.new_pm_start = submitData.new_pm_start || null;
            cleanedData.new_pm_end = submitData.new_pm_end || null;
        }
        
        if (submitData.type === 'MANUAL_EARLY_CHECKOUT' && submitData.early_checkout_minutes) {
            cleanedData.early_checkout_minutes = parseInt(submitData.early_checkout_minutes);
        }
        
        createMutation.mutate(cleanedData);
    };

    const filteredExceptions = exceptions
        .filter(ex => {
            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                const matchesId = ex.attendance_id.toLowerCase().includes(searchLower);
                const employee = employees.find(e => e.attendance_id === ex.attendance_id);
                const matchesName = employee?.name.toLowerCase().includes(searchLower);
                if (!matchesId && !matchesName) return false;
            }
            if (filter.type && filter.type !== 'all' && ex.type !== filter.type) return false;
            return true;
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

    const needsShiftOverride = formData.type === 'SHIFT_OVERRIDE';
    const needsEarlyCheckoutMinutes = formData.type === 'MANUAL_EARLY_CHECKOUT';

    return (
        <div className="space-y-6">
            {/* Add Exception Form */}
            {showForm && (
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle>Add Exception</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Employee {formData.type !== 'PUBLIC_HOLIDAY' && '*'}</Label>
                                    {formData.type === 'PUBLIC_HOLIDAY' ? (
                                        <Input 
                                            value="All Employees" 
                                            disabled 
                                            className="bg-slate-50"
                                        />
                                    ) : (
                                        <Select
                                            value={formData.attendance_id}
                                            onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select employee" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {employees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.attendance_id}>
                                                        {emp.attendance_id} - {emp.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                                <div>
                                    <Label>Exception Type *</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="OFF">Off / Leave</SelectItem>
                                            <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                            <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                            <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                            <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                            <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                            <SelectItem value="MANUAL_EARLY_CHECKOUT">Manual Early Checkout</SelectItem>
                                            <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>From Date *</Label>
                                    <Input
                                        type="date"
                                        value={formData.date_from}
                                        onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label>To Date *</Label>
                                    <Input
                                        type="date"
                                        value={formData.date_to}
                                        onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                                    />
                                </div>
                            </div>

                            {needsShiftOverride && (
                                <div>
                                    <Label className="mb-2 block">Override Shift Times</Label>
                                    <div className="grid grid-cols-4 gap-4">
                                        <div>
                                            <Label className="text-xs">AM Start</Label>
                                            <Input
                                                placeholder="08:00 AM"
                                                value={formData.new_am_start}
                                                onChange={(e) => setFormData({ ...formData, new_am_start: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">AM End</Label>
                                            <Input
                                                placeholder="12:00 PM"
                                                value={formData.new_am_end}
                                                onChange={(e) => setFormData({ ...formData, new_am_end: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM Start</Label>
                                            <Input
                                                placeholder="01:00 PM"
                                                value={formData.new_pm_start}
                                                onChange={(e) => setFormData({ ...formData, new_pm_start: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM End</Label>
                                            <Input
                                                placeholder="05:00 PM"
                                                value={formData.new_pm_end}
                                                onChange={(e) => setFormData({ ...formData, new_pm_end: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {needsEarlyCheckoutMinutes && (
                                <div className="max-w-xs">
                                    <Label>Early Checkout Minutes *</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 30"
                                        value={formData.early_checkout_minutes}
                                        onChange={(e) => setFormData({ ...formData, early_checkout_minutes: e.target.value })}
                                        min="1"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Minutes to add to early checkout total</p>
                                </div>
                            )}

                            <div>
                                <Label>Details / Reason</Label>
                                <Input
                                    value={formData.details}
                                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                                    placeholder="Optional notes"
                                />
                            </div>

                            <div className="flex gap-3">
                                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={createMutation.isPending}>
                                    {createMutation.isPending ? 'Adding...' : 'Add Exception'}
                                </Button>
                                <Button type="button" variant="outline" onClick={() => {
                                    setShowForm(false);
                                    resetForm();
                                }}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Exceptions List */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Exceptions</CardTitle>
                        <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadTemplate}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Template
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('exception-import').click()}
                            disabled={importProgress !== null}
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            {importProgress ? `${importProgress.current}/${importProgress.total}` : 'Import Excel'}
                        </Button>
                        <input
                            id="exception-import"
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileImport}
                            className="hidden"
                        />
                        {!showForm && (
                            <Button 
                                onClick={() => setShowForm(true)}
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Exception
                            </Button>
                        )}
                    </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="flex gap-4">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by ID or name..."
                                value={filter.search}
                                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                className="pl-9"
                            />
                        </div>
                        <Select
                            value={filter.type}
                            onValueChange={(value) => setFilter({ ...filter, type: value })}
                        >
                            <SelectTrigger className="max-w-xs">
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                <SelectItem value="OFF">Off / Leave</SelectItem>
                                <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                <SelectItem value="MANUAL_EARLY_CHECKOUT">Manual Early Checkout</SelectItem>
                                <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Table */}
                    {filteredExceptions.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No exceptions found</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                            Employee
                                        </SortableTableHead>
                                        <SortableTableHead sortKey="type" currentSort={sort} onSort={setSort}>
                                            Type
                                        </SortableTableHead>
                                        <SortableTableHead sortKey="date_from" currentSort={sort} onSort={setSort}>
                                            From
                                        </SortableTableHead>
                                        <SortableTableHead sortKey="date_to" currentSort={sort} onSort={setSort}>
                                            To
                                        </SortableTableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredExceptions.map((exception) => (
                                        <TableRow key={exception.id}>
                                            <TableCell className="p-1">
                                                {exception.type === 'PUBLIC_HOLIDAY' ? (
                                                    <span className="px-2 py-1 text-sm text-slate-600">ALL</span>
                                                ) : (
                                                    <Select
                                                        value={exception.attendance_id}
                                                        onValueChange={(value) => handleCellChange(exception.id, 'attendance_id', value)}
                                                    >
                                                        <SelectTrigger className="h-8 w-44">
                                                            <SelectValue>
                                                                {exception.attendance_id} - {employees.find(e => e.attendance_id === exception.attendance_id)?.name || ''}
                                                            </SelectValue>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {employees.map(emp => (
                                                                <SelectItem key={emp.id} value={emp.attendance_id}>
                                                                    {emp.attendance_id} - {emp.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Select
                                                    value={exception.type}
                                                    onValueChange={(value) => handleCellChange(exception.id, 'type', value)}
                                                >
                                                    <SelectTrigger className="h-8 w-36">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="OFF">Off / Leave</SelectItem>
                                                        <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                                        <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                                        <SelectItem value="MANUAL_PRESENT">Present</SelectItem>
                                                        <SelectItem value="MANUAL_ABSENT">Absent</SelectItem>
                                                        <SelectItem value="MANUAL_HALF">Half Day</SelectItem>
                                                        <SelectItem value="MANUAL_EARLY_CHECKOUT">Early Checkout</SelectItem>
                                                        <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    type="date"
                                                    value={exception.date_from}
                                                    onChange={(e) => handleCellChange(exception.id, 'date_from', e.target.value)}
                                                    className="h-8 w-36"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    type="date"
                                                    value={exception.date_to}
                                                    onChange={(e) => handleCellChange(exception.id, 'date_to', e.target.value)}
                                                    className="h-8 w-36"
                                                />
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    value={exception.details || ''}
                                                    onChange={(e) => handleCellChange(exception.id, 'details', e.target.value)}
                                                    placeholder="Notes..."
                                                    className="h-8 w-40"
                                                />
                                            </TableCell>
                                            <TableCell className="text-right p-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => deleteMutation.mutate(exception.id)}
                                                >
                                                    <Trash2 className="w-4 h-4 text-red-600" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}