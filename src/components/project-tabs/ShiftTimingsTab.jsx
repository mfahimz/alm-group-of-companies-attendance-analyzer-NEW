import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, AlertTriangle, Search, Trash2, Edit, Plus, Calendar, Download } from 'lucide-react';
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
    const [editingShift, setEditingShift] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [isSingleShift, setIsSingleShift] = useState(false);
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [selectedBlock, setSelectedBlock] = useState('block1');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [editingBlockRange, setEditingBlockRange] = useState(null);
    const [blockDateRanges, setBlockDateRanges] = useState({
        block1: { from: project.date_from, to: project.date_to },
        block2: { from: project.date_from, to: project.date_to }
    });
    const queryClient = useQueryClient();

    const formatTime = (timeStr) => {
        if (!timeStr || timeStr === '—') return '—';
        if (/AM|PM/i.test(timeStr)) return timeStr;
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

    // Load date ranges from project configuration
    useEffect(() => {
        if (project.shift_block_ranges) {
            try {
                const savedRanges = JSON.parse(project.shift_block_ranges);
                setBlockDateRanges(savedRanges);
            } catch (e) {
                // Invalid JSON, use defaults
                setBlockDateRanges({
                    block1: { from: project.date_from, to: project.date_to },
                    block2: { from: project.date_from, to: project.date_to }
                });
            }
        }
    }, [project.shift_block_ranges, project.date_from, project.date_to]);

    // Group shifts by blocks - intelligently assign legacy shifts based on date ranges
    const block1Shifts = shifts.filter(s => {
        if (s.shift_block === 'block1') return true;
        if (s.shift_block === 'block2') return false;
        
        // For legacy shifts without shift_block, check date ranges
        if (!s.shift_block && s.effective_from && s.effective_to) {
            const block1Range = blockDateRanges.block1;
            // If shift dates match block1 range exactly or are within it, assign to block1
            if (s.effective_from === block1Range.from && s.effective_to === block1Range.to) {
                return true;
            }
        }
        return false;
    });
    
    const block2Shifts = shifts.filter(s => {
        if (s.shift_block === 'block2') return true;
        if (s.shift_block === 'block1') return false;
        
        // For legacy shifts without shift_block, check date ranges
        if (!s.shift_block && s.effective_from && s.effective_to) {
            const block2Range = blockDateRanges.block2;
            // If shift dates match block2 range exactly or are within it, assign to block2
            if (s.effective_from === block2Range.from && s.effective_to === block2Range.to) {
                return true;
            }
        }
        return false;
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
        if (/AM|PM/i.test(timeStr)) {
            const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (match) {
                return `${match[1]}:${match[2]} ${match[3].toUpperCase()}`;
            }
            return timeStr;
        }
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

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 7) {
                    const attendance_id = values[0];
                    const am_start = normalizeTime(values[3]);
                    const am_end = normalizeTime(values[4]);
                    const pm_start = normalizeTime(values[5]);
                    const pm_end = normalizeTime(values[6]);
                    const applicableDays = values[8] || '';

                    const employeeExists = employees.some(e => e.attendance_id === attendance_id);
                    if (!employeeExists) {
                        newWarnings.push(`Unknown employee: ${attendance_id}`);
                    }

                    const is_friday_shift = applicableDays.toLowerCase().includes('friday');

                    data.push({
                        attendance_id,
                        date: null,
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
            const blockRange = blockDateRanges[selectedBlock];
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
                effective_from: blockRange.from,
                effective_to: blockRange.to,
                shift_block: selectedBlock
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

    const updateBlockRangeMutation = useMutation({
        mutationFn: async ({ block, newRange }) => {
            // Save date ranges to project configuration
            const updatedRanges = {
                ...blockDateRanges,
                [block]: newRange
            };
            
            await base44.entities.Project.update(project.id, {
                shift_block_ranges: JSON.stringify(updatedRanges)
            });
            
            // Also update existing shifts in this block if any
            const blockShifts = shifts.filter(s => s.shift_block === block);
            if (blockShifts.length > 0) {
                await Promise.all(
                    blockShifts.map(shift => 
                        base44.entities.ShiftTiming.update(shift.id, {
                            effective_from: newRange.from,
                            effective_to: newRange.to
                        })
                    )
                );
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            queryClient.invalidateQueries(['project', project.id]);
            toast.success('Date range saved successfully');
            setEditingBlockRange(null);
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to save date range');
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

    const deleteBlockShiftsMutation = useMutation({
        mutationFn: async (blockId) => {
            const blockShifts = shifts.filter(s => s.shift_block === blockId);
            await Promise.all(blockShifts.map(shift => base44.entities.ShiftTiming.delete(shift.id)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('All shifts deleted from block');
        },
        onError: () => {
            toast.error('Failed to delete block shifts');
        }
    });

    const createShiftMutation = useMutation({
        mutationFn: (data) => base44.entities.ShiftTiming.create({
            ...data,
            project_id: project.id,
            shift_block: selectedBlock,
            effective_from: blockDateRanges[selectedBlock].from,
            effective_to: blockDateRanges[selectedBlock].to
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

    const exportShiftsToCSV = () => {
        if (shifts.length === 0) {
            toast.error('No shift data to export');
            return;
        }

        const headers = ['Attendance ID', 'Employee Name', 'Department', 'Shift Type', 'Applicable Days', 'AM Start', 'AM End', 'PM Start', 'PM End', 'Block', 'Effective From', 'Effective To'];
        const rows = shifts.map(shift => {
            const employee = employees.find(e => e.attendance_id === shift.attendance_id);
            return [
                shift.attendance_id,
                employee?.name || '-',
                employee?.department || '-',
                shift.is_single_shift ? 'Single Shift' : 'Regular',
                shift.applicable_days || (shift.date ? new Date(shift.date).toLocaleDateString('en-GB') : 'All days'),
                shift.am_start || '-',
                shift.am_end || '-',
                shift.pm_start || '-',
                shift.pm_end || '-',
                shift.shift_block === 'block2' ? 'Block 2' : 'Block 1',
                shift.effective_from ? new Date(shift.effective_from).toLocaleDateString('en-GB') : '-',
                shift.effective_to ? new Date(shift.effective_to).toLocaleDateString('en-GB') : '-'
            ];
        });

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name}_shift_timings.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast.success('Shift timings exported');
    };

    const renderShiftBlock = (blockId, blockShifts, blockLabel) => {
        const blockRange = blockDateRanges[blockId];
        
        const filteredShifts = blockShifts
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

        return (
            <Card className="border-0 shadow-sm">
                <CardHeader className="bg-slate-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Calendar className="w-5 h-5 text-indigo-600" />
                            <div>
                                <CardTitle className="text-base">{blockLabel}</CardTitle>
                                {editingBlockRange === blockId ? (
                                    <div className="flex gap-2 mt-2">
                                        <Input
                                            type="date"
                                            value={blockDateRanges[blockId]?.from || ''}
                                            onChange={(e) => setBlockDateRanges(prev => ({
                                                ...prev,
                                                [blockId]: { ...prev[blockId], from: e.target.value }
                                            }))}
                                            className="w-40"
                                        />
                                        <Input
                                            type="date"
                                            value={blockDateRanges[blockId]?.to || ''}
                                            onChange={(e) => setBlockDateRanges(prev => ({
                                                ...prev,
                                                [blockId]: { ...prev[blockId], to: e.target.value }
                                            }))}
                                            className="w-40"
                                        />
                                        <Button
                                            size="sm"
                                            onClick={() => updateBlockRangeMutation.mutate({ block: blockId, newRange: blockDateRanges[blockId] })}
                                            disabled={updateBlockRangeMutation.isPending}
                                        >
                                            Save
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setEditingBlockRange(null);
                                                // Reset to saved values
                                                const savedShift = shifts.find(s => s.shift_block === blockId);
                                                if (savedShift) {
                                                    setBlockDateRanges(prev => ({
                                                        ...prev,
                                                        [blockId]: { from: savedShift.effective_from, to: savedShift.effective_to }
                                                    }));
                                                }
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500 mt-1">
                                        {new Date(blockRange.from).toLocaleDateString('en-GB')} - {new Date(blockRange.to).toLocaleDateString('en-GB')} ({blockShifts.length} shifts)
                                    </p>
                                )}
                            </div>
                        </div>
                        {editingBlockRange !== blockId && (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingBlockRange(blockId)}
                                >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit Date Range
                                </Button>
                                {blockShifts.length > 0 && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => {
                                            if (window.confirm(`Delete all ${blockShifts.length} shifts from ${blockLabel}?`)) {
                                                deleteBlockShiftsMutation.mutate(blockId);
                                            }
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete All Shifts
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="pt-4">
                    <div className="space-y-4">
                        {blockShifts.length === 0 ? (
                            <p className="text-slate-500 text-center py-8">No shifts uploaded to this block yet</p>
                        ) : (
                            <>
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-slate-600">
                                        {filteredShifts.length !== blockShifts.length && `${filteredShifts.length} of ${blockShifts.length} shown`}
                                    </p>
                                    <div className="flex gap-3">
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
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {paginatedShifts.map((shift) => {
                                                const employee = employees.find(e => e.attendance_id === shift.attendance_id);
                                                return (
                                                    <TableRow key={shift.id}>
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
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-6">
            {/* Upload Section */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Upload Shift Timings</CardTitle>
                        <Button 
                            onClick={exportShiftsToCSV}
                            size="sm"
                            variant="outline"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export All Shifts
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Select Block to Upload To *</Label>
                        <Select value={selectedBlock} onValueChange={setSelectedBlock}>
                            <SelectTrigger className="mt-2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="block1">Block 1 ({new Date(blockDateRanges.block1.from).toLocaleDateString('en-GB')} - {new Date(blockDateRanges.block1.to).toLocaleDateString('en-GB')})</SelectItem>
                                <SelectItem value="block2">Block 2 ({new Date(blockDateRanges.block2.from).toLocaleDateString('en-GB')} - {new Date(blockDateRanges.block2.to).toLocaleDateString('en-GB')})</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label>Upload Shift Timings CSV *</Label>
                        <div className="mt-2">
                            <Input
                                type="file"
                                accept=".csv"
                                onChange={handleFileChange}
                            />
                        </div>
                        <p className="text-sm text-slate-500 mt-2">
                            CSV format: attendance_id, name, department, morning_start, morning_end, evening_start, evening_end, total_hours, applicable_days
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Shifts will be uploaded to {selectedBlock === 'block1' ? 'Block 1' : 'Block 2'} with date range {new Date(blockDateRanges[selectedBlock].from).toLocaleDateString('en-GB')} - {new Date(blockDateRanges[selectedBlock].to).toLocaleDateString('en-GB')}
                        </p>
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
                                Preview: {parsedData.length} records ready to upload to {selectedBlock === 'block1' ? 'Block 1' : 'Block 2'}
                            </p>
                            <Button 
                                onClick={() => uploadMutation.mutate()}
                                disabled={uploadMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {uploadMutation.isPending ? 'Uploading...' : `Upload to ${selectedBlock === 'block1' ? 'Block 1' : 'Block 2'}`}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Block 1 */}
            {renderShiftBlock('block1', block1Shifts, 'Block 1')}

            {/* Block 2 */}
            {renderShiftBlock('block2', block2Shifts, 'Block 2')}

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