import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, AlertTriangle, Search, Trash2, Edit, Plus } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import EditShiftDialog from './EditShiftDialog';
import TablePagination from '../ui/TablePagination';

export default function ShiftTimingsTab({ project }) {
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedShifts, setSelectedShifts] = useState([]);
    const [editingShift, setEditingShift] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [isSingleShift, setIsSingleShift] = useState(false);
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [uploadDateRange, setUploadDateRange] = useState({ from: project.date_from, to: project.date_to });
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const queryClient = useQueryClient();

    const formatTime = (timeStr) => {
        if (!timeStr || timeStr === '—') return '—';
        
        // If already in AM/PM format, return as is
        if (/AM|PM/i.test(timeStr)) return timeStr;
        
        // Parse 24-hour format (HH:MM or HH:MM:SS)
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return timeStr;
        
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = hours >= 12 ? 'PM' : 'AM';
        
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        
        return `${hours}:${minutes} ${period}`;
    };

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            parseCSV(selectedFile);
        }
    };

    const normalizeTime = (timeStr) => {
        if (!timeStr || timeStr === '—') return '—';
        
        // If already in AM/PM format, return as is
        if (/AM|PM/i.test(timeStr)) {
            // Ensure format is "H:MM AM/PM" or "HH:MM AM/PM"
            const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (match) {
                return `${match[1]}:${match[2]} ${match[3].toUpperCase()}`;
            }
            return timeStr;
        }
        
        // Parse 24-hour format (HH:MM or HH:MM:SS)
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return timeStr;
        
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = hours >= 12 ? 'PM' : 'AM';
        
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        
        return `${hours}:${minutes} ${period}`;
    };

    const parseCSV = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter(line => line.trim());
            
            const data = [];
            const newWarnings = [];

            // Skip header row
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 7) {
                    const attendance_id = values[0];
                    // values[1] = name (not needed for shift timing)
                    // values[2] = department (not needed)
                    const am_start = normalizeTime(values[3]); // morning start
                    const am_end = normalizeTime(values[4]);   // morning end
                    const pm_start = normalizeTime(values[5]); // evening start
                    const pm_end = normalizeTime(values[6]);   // evening end
                    // values[7] = total hours (optional)
                    const applicableDays = values[8] || ''; // applicable days

                    // Check if employee exists
                    const employeeExists = employees.some(e => e.attendance_id === attendance_id);
                    if (!employeeExists) {
                        newWarnings.push(`Unknown employee: ${attendance_id}`);
                    }

                    // Parse applicable days to detect Friday shifts
                    const is_friday_shift = applicableDays.toLowerCase().includes('friday');

                    data.push({
                        attendance_id,
                        date: null, // General shift, no specific date
                        is_friday_shift,
                        applicable_days: applicableDays,
                        am_start,
                        am_end,
                        pm_start,
                        pm_end,
                        employeeExists
                    });
                }
            }

            setParsedData(data);
            setWarnings([...new Set(newWarnings)]);
            toast.success(`Parsed ${data.length} shift records`);
        };
        reader.readAsText(file);
    };

    const uploadMutation = useMutation({
        mutationFn: async () => {
            // Delete existing shifts for this project
            const existingShifts = await base44.entities.ShiftTiming.filter({ project_id: project.id });
            await Promise.all(existingShifts.map(s => base44.entities.ShiftTiming.delete(s.id)));

            // Insert new shifts
            const shiftRecords = parsedData.map(s => ({
                project_id: project.id,
                attendance_id: s.attendance_id,
                date: s.date,
                is_friday_shift: s.is_friday_shift,
                applicable_days: s.applicable_days,
                am_start: s.am_start,
                am_end: s.am_end,
                pm_start: s.pm_start,
                pm_end: s.pm_end,
                effective_from: uploadDateRange.from,
                effective_to: uploadDateRange.to
            }));

            await base44.entities.ShiftTiming.bulkCreate(shiftRecords);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Shift timings uploaded successfully');
            setParsedData([]);
            setFile(null);
        },
        onError: () => {
            toast.error('Failed to upload shift timings');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.ShiftTiming.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Shift deleted');
        },
        onError: () => {
            toast.error('Failed to delete shift');
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            await Promise.all(ids.map(id => base44.entities.ShiftTiming.delete(id)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            setSelectedShifts([]);
            toast.success('Shifts deleted successfully');
        },
        onError: () => {
            toast.error('Failed to delete shifts');
        }
    });

    const createShiftMutation = useMutation({
        mutationFn: (data) => base44.entities.ShiftTiming.create({
            ...data,
            project_id: project.id
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Shift timing added successfully');
            setShowAddForm(false);
        },
        onError: () => {
            toast.error('Failed to add shift timing');
        }
    });

    const filteredShifts = shifts
        .filter(shift => {
            const employee = employees.find(e => e.attendance_id === shift.attendance_id);
            const matchesSearch = !searchTerm || 
                shift.attendance_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                employee?.name.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesDept = departmentFilter === 'all' || employee?.department === departmentFilter;

            return matchesSearch && matchesDept;
        })
        .sort((a, b) => {
            let aVal, bVal;
            if (sort.key === 'name') {
                aVal = employees.find(e => e.attendance_id === a.attendance_id)?.name || '';
                bVal = employees.find(e => e.attendance_id === b.attendance_id)?.name || '';
            } else {
                aVal = a[sort.key];
                bVal = b[sort.key];
            }
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const paginatedShifts = filteredShifts.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const toggleSelectAll = () => {
        if (selectedShifts.length === filteredShifts.length) {
            setSelectedShifts([]);
        } else {
            setSelectedShifts(filteredShifts.map(s => s.id));
        }
    };

    const toggleSelectShift = (id) => {
        setSelectedShifts(prev => 
            prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = () => {
        if (window.confirm(`Delete ${selectedShifts.length} selected shift records?`)) {
            bulkDeleteMutation.mutate(selectedShifts);
        }
    };

    return (
        <div className="space-y-6">
            {/* Add Shift Form */}
            {showAddForm && (
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle>Add Shift Timing</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                            const attendance_id = formData.get('attendance_id');
                            const is_friday_shift = formData.get('is_friday_shift') === 'true';
                            const applicable_days = formData.get('applicable_days');
                            const am_start = normalizeTime(formData.get('am_start'));
                            const am_end = isSingleShift ? null : normalizeTime(formData.get('am_end'));
                            const pm_start = isSingleShift ? null : normalizeTime(formData.get('pm_start'));
                            const pm_end = normalizeTime(formData.get('pm_end'));

                            if (!attendance_id || !am_start || !pm_end) {
                                toast.error('Please fill in all required fields');
                                return;
                            }
                            if (!isSingleShift && (!am_end || !pm_start)) {
                                toast.error('Please fill in all shift times');
                                return;
                            }

                            createShiftMutation.mutate({
                                attendance_id,
                                date: null,
                                is_friday_shift,
                                is_single_shift: isSingleShift,
                                applicable_days,
                                am_start,
                                am_end,
                                pm_start,
                                pm_end
                            });
                            setIsSingleShift(false);
                        }} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Employee *</Label>
                                    <Select name="attendance_id" required>
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
                                </div>
                                <div>
                                    <Label>Shift Type</Label>
                                    <Select name="is_friday_shift" defaultValue="false">
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="false">Regular (Sat-Wed)</SelectItem>
                                            <SelectItem value="true">Friday Shift</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <Label>Applicable Days *</Label>
                                <Select name="applicable_days" defaultValue="Monday to Thursday and Saturday" required>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Monday to Thursday and Saturday">Monday to Thursday and Saturday</SelectItem>
                                        <SelectItem value="Friday">Friday</SelectItem>
                                        <SelectItem value="Monday to Saturday">Monday to Saturday</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                                <Switch
                                    id="single-shift"
                                    checked={isSingleShift}
                                    onCheckedChange={setIsSingleShift}
                                />
                                <Label htmlFor="single-shift" className="cursor-pointer">
                                    Single Shift (No break - only Punch In and Punch Out)
                                </Label>
                            </div>

                            <div>
                                <Label className="mb-2 block">
                                    {isSingleShift ? 'Shift Times (Punch In / Punch Out) *' : 'Shift Times *'}
                                </Label>
                                {isSingleShift ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-xs">Punch In</Label>
                                            <Input
                                                name="am_start"
                                                placeholder="08:00 AM"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Punch Out</Label>
                                            <Input
                                                name="pm_end"
                                                placeholder="05:00 PM"
                                                required
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-4 gap-4">
                                        <div>
                                            <Label className="text-xs">AM Start</Label>
                                            <Input
                                                name="am_start"
                                                placeholder="08:00 AM"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">AM End</Label>
                                            <Input
                                                name="am_end"
                                                placeholder="12:00 PM"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM Start</Label>
                                            <Input
                                                name="pm_start"
                                                placeholder="01:00 PM"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM End</Label>
                                            <Input
                                                name="pm_end"
                                                placeholder="05:00 PM"
                                                required
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={createShiftMutation.isPending}>
                                    {createShiftMutation.isPending ? 'Adding...' : 'Add Shift'}
                                </Button>
                                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Upload Section */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Upload Shift Timings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                        />
                        <p className="text-sm text-slate-500 mt-2">
                            CSV format: attendance_id, name, department, morning_start, morning_end, evening_start, evening_end, total_hours, applicable_days
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Time format: HH:MM AM/PM or 24-hour (will be converted). System auto-detects Friday shifts from applicable_days column.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Shift Effective From</Label>
                            <Input 
                                type="date" 
                                value={uploadDateRange.from}
                                onChange={(e) => setUploadDateRange({...uploadDateRange, from: e.target.value})}
                            />
                        </div>
                        <div>
                            <Label>Shift Effective To</Label>
                            <Input 
                                type="date" 
                                value={uploadDateRange.to}
                                onChange={(e) => setUploadDateRange({...uploadDateRange, to: e.target.value})}
                            />
                        </div>
                    </div>

                    {warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-900">Warnings</p>
                                    <ul className="text-sm text-amber-700 mt-1 space-y-1">
                                        {warnings.map((warning, idx) => (
                                            <li key={idx}>• {warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {parsedData.length > 0 && (
                        <div>
                            <p className="text-sm text-slate-600 mb-2">
                                Preview: {parsedData.length} records ready to upload
                            </p>
                            <Button 
                                onClick={() => uploadMutation.mutate()}
                                disabled={uploadMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {uploadMutation.isPending ? 'Uploading...' : 'Upload Shifts'}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Current Shifts */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Current Shift Timings</CardTitle>
                        {!showAddForm && (
                            <Button 
                                onClick={() => setShowAddForm(true)}
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Shift Timing
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {shifts.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No shifts uploaded yet</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-slate-600">
                                    Total: {shifts.length} shift records
                                    {filteredShifts.length !== shifts.length && ` (${filteredShifts.length} shown)`}
                                </p>
                                <div className="flex gap-3">
                                    {selectedShifts.length > 0 && (
                                        <Button 
                                            onClick={handleBulkDelete}
                                            variant="destructive"
                                            size="sm"
                                            disabled={bulkDeleteMutation.isPending}
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete {selectedShifts.length} Selected
                                        </Button>
                                    )}
                                    <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                                        <SelectTrigger className="w-40">
                                            <SelectValue placeholder="Department" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Departments</SelectItem>
                                            <SelectItem value="Admin">Admin</SelectItem>
                                            <SelectItem value="Operations">Operations</SelectItem>
                                            <SelectItem value="Front Office">Front Office</SelectItem>
                                            <SelectItem value="Housekeeping">Housekeeping</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="relative w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <Input
                                            placeholder="Search by ID or name..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="max-h-96 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={selectedShifts.length === filteredShifts.length && filteredShifts.length > 0}
                                                    onCheckedChange={toggleSelectAll}
                                                />
                                            </TableHead>
                                            <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                                Attendance ID
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort}>
                                                Employee Name
                                            </SortableTableHead>
                                            <TableHead>Department</TableHead>
                                            <TableHead>Shift Type</TableHead>
                                            <TableHead>Shift Times</TableHead>
                                            <TableHead>Applicable Days</TableHead>
                                            <TableHead>Effective Range</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedShifts.map((shift) => {
                                            const employee = employees.find(e => e.attendance_id === shift.attendance_id);
                                            return (
                                                <TableRow key={shift.id}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedShifts.includes(shift.id)}
                                                            onCheckedChange={() => toggleSelectShift(shift.id)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium">{shift.attendance_id}</TableCell>
                                                    <TableCell>{employee?.name || '-'}</TableCell>
                                                    <TableCell>{employee?.department || '-'}</TableCell>
                                                    <TableCell>
                                                        {shift.is_single_shift ? (
                                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">Single Shift</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Regular</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {shift.is_single_shift ? (
                                                            <span>{formatTime(shift.am_start)} → {formatTime(shift.pm_end)}</span>
                                                        ) : (
                                                            <span>{formatTime(shift.am_start)}-{formatTime(shift.am_end)} / {formatTime(shift.pm_start)}-{formatTime(shift.pm_end)}</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {shift.applicable_days || (shift.date ? new Date(shift.date).toLocaleDateString('en-GB') : 'All days')}
                                                        {shift.is_friday_shift && (
                                                            <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded">
                                                                Friday
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {shift.effective_from && shift.effective_to ? (
                                                            <span className="text-xs text-slate-500">
                                                                {new Date(shift.effective_from).toLocaleDateString('en-GB')} - {new Date(shift.effective_to).toLocaleDateString('en-GB')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">All Project</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex gap-1 justify-end">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setEditingShift(shift)}
                                                            >
                                                                <Edit className="w-4 h-4 text-indigo-600" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    if (window.confirm('Delete this shift record?')) {
                                                                        deleteMutation.mutate(shift.id);
                                                                    }
                                                                }}
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
                            </div>
                            {filteredShifts.length > 0 && (
                                <TablePagination
                                    totalItems={filteredShifts.length}
                                    currentPage={currentPage}
                                    rowsPerPage={rowsPerPage}
                                    onPageChange={setCurrentPage}
                                    onRowsPerPageChange={(value) => {
                                        setRowsPerPage(value);
                                        setCurrentPage(1);
                                    }}
                                />
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Edit Shift Dialog */}
            <EditShiftDialog
                open={!!editingShift}
                onClose={() => setEditingShift(null)}
                shift={editingShift}
                projectId={project.id}
            />
        </div>
    );
}