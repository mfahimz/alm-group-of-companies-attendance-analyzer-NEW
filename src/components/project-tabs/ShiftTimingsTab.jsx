import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, AlertTriangle, Search, Trash2, Edit, Plus, Calendar, Download, Eye, Copy } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import EditShiftDialog from './EditShiftDialog';
import TablePagination from '../ui/TablePagination';
import BulkEditShiftDialog from '../shifts/BulkEditShiftDialog';
import { Checkbox } from '@/components/ui/checkbox';
import TimePicker from '../ui/TimePicker';

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
    const [applicableDayFilter, setApplicableDayFilter] = useState('all');
    const [selectedBlock, setSelectedBlock] = useState('block1');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [editingBlockRange, setEditingBlockRange] = useState(null);
    const [showPreviewDialog, setShowPreviewDialog] = useState(false);
    const [blockDateRanges, setBlockDateRanges] = useState({
        block1: { from: project.date_from, to: project.date_to },
        block2: { from: project.date_from, to: project.date_to }
    });
    const [selectedShifts, setSelectedShifts] = useState([]);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [copySource, setCopySource] = useState({ type: 'block', blockId: 'block1', projectId: '' });
    const [formData, setFormData] = useState({
        attendance_id: '',
        am_start: '',
        am_end: '',
        pm_start: '',
        pm_end: '',
        is_single_shift: false,
        is_friday_shift: false
    });
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';

    const formatTime = (timeStr) => {
        if (!timeStr || timeStr === '—' || timeStr.trim() === '') return '—';
        if (/AM|PM/i.test(timeStr)) return timeStr;
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return '—';
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = hours >= 12 ? 'PM' : 'AM';
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        return `${hours}:${minutes} ${period}`;
    };

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const { data: allProjects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list(),
        enabled: showCopyDialog
    });

    // Load date ranges from project configuration
    useEffect(() => {
        const blocksCount = project.shift_blocks_count || 2;
        const defaultRanges = {};
        for (let i = 1; i <= blocksCount; i++) {
            defaultRanges[`block${i}`] = { from: project.date_from, to: project.date_to };
        }

        if (project.shift_block_ranges) {
            try {
                const savedRanges = JSON.parse(project.shift_block_ranges);
                setBlockDateRanges({ ...defaultRanges, ...savedRanges });
            } catch (e) {
                setBlockDateRanges(defaultRanges);
            }
        } else {
            setBlockDateRanges(defaultRanges);
        }
    }, [project.shift_block_ranges, project.date_from, project.date_to, project.shift_blocks_count]);

    // Group shifts by blocks dynamically
    const blocksCount = project.shift_blocks_count || 2;
    const shiftsByBlock = {};

    for (let i = 1; i <= blocksCount; i++) {
        const blockId = `block${i}`;
        shiftsByBlock[blockId] = shifts.filter(s => {
            if (s.shift_block === blockId) return true;

            // For legacy shifts without shift_block, check date ranges
            if (!s.shift_block && s.effective_from && s.effective_to && blockDateRanges[blockId]) {
                const blockRange = blockDateRanges[blockId];
                if (s.effective_from === blockRange.from && s.effective_to === blockRange.to) {
                    return true;
                }
            }
            return false;
        });
    }

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            parseCSV(selectedFile);
        }
    };

    const normalizeTime = (timeStr) => {
        if (!timeStr || timeStr === '—' || timeStr.trim() === '') return '—';

        // Handle AM/PM format - fix invalid hours if present
        if (/AM|PM/i.test(timeStr)) {
            const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (match) {
                let hours = parseInt(match[1]);
                const minutes = match[2];
                const period = match[3].toUpperCase();

                // Fix invalid hours (e.g., "14:00 PM" or "0:00 AM")
                if (hours === 0 || hours > 12) {
                    const newPeriod = hours >= 12 ? 'PM' : 'AM';
                    if (hours > 12) hours -= 12;
                    if (hours === 0) hours = 12;
                    return `${hours}:${minutes} ${newPeriod}`;
                }

                return `${hours}:${minutes} ${period}`;
            }
            return timeStr;
        }

        // Handle 24-hour format
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return timeStr;
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = hours >= 12 ? 'PM' : 'AM';
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        return `${hours}:${minutes} ${period}`;
    };

    const validateTime = (timeStr) => {
        if (!timeStr || timeStr === '—' || timeStr.trim() === '') return { valid: true, error: null };
        
        // Check for AM/PM format
        const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (ampmMatch) {
            const hours = parseInt(ampmMatch[1]);
            const minutes = parseInt(ampmMatch[2]);
            
            if (hours < 1 || hours > 12) {
                return { valid: false, error: 'Hours must be 1-12' };
            }
            if (minutes < 0 || minutes > 59) {
                return { valid: false, error: 'Minutes must be 0-59' };
            }
            return { valid: true, error: null };
        }
        
        // Check for 24-hour format
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            
            if (hours < 0 || hours > 23) {
                return { valid: false, error: 'Hours must be 0-23' };
            }
            if (minutes < 0 || minutes > 59) {
                return { valid: false, error: 'Minutes must be 0-59' };
            }
            return { valid: true, error: null };
        }
        
        return { valid: false, error: 'Invalid time format' };
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

                    let applicableDays = values[8] ? values[8].trim() : '';
                    let applicableDaysArray = [];
                    let is_friday_shift = false;

                    // Parse comma-separated day names from CSV
                    if (applicableDays) {
                        // Split by comma and clean up each day name
                        applicableDaysArray = applicableDays.split(',').map(day => day.trim()).filter(day => day.length > 0);
                        
                        // Check if it's a Friday-only shift or if Friday is in the list
                        const hasFriday = applicableDaysArray.some(day => day.toLowerCase() === 'friday');
                        is_friday_shift = hasFriday && applicableDaysArray.length === 1;
                        
                        // Store as JSON array
                        applicableDays = JSON.stringify(applicableDaysArray);
                    } else {
                        // Default: empty applicable days
                        applicableDays = '';
                    }

                    const employeeExists = employees.some(e => e.attendance_id === attendance_id);
                    if (!employeeExists) {
                        newWarnings.push(`Unknown employee: ${attendance_id}`);
                    }

                    // Validate times
                    const timeValidations = {
                        am_start: validateTime(am_start),
                        am_end: validateTime(am_end),
                        pm_start: validateTime(pm_start),
                        pm_end: validateTime(pm_end)
                    };

                    const hasInvalidTime = Object.values(timeValidations).some(v => !v.valid);
                    if (hasInvalidTime) {
                        const invalidFields = Object.entries(timeValidations)
                            .filter(([_, v]) => !v.valid)
                            .map(([field, v]) => `${field}: ${v.error}`)
                            .join(', ');
                        newWarnings.push(`Row ${i + 1} (${attendance_id}): ${invalidFields}`);
                    }

                    data.push({
                        attendance_id,
                        date: null,
                        is_friday_shift,
                        applicable_days: applicableDays,
                        am_start,
                        am_end,
                        pm_start,
                        pm_end,
                        employeeExists,
                        timeValidations,
                        hasInvalidTime
                    });
                }
            }

            setParsedData(data);
            setWarnings([...new Set(newWarnings)]);
            setShowPreviewDialog(true);
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

            const batchSize = 50;
            const totalBatches = Math.ceil(shiftRecords.length / batchSize);
            
            setUploadProgress({ current: 0, total: totalBatches, status: 'Uploading shift timings...' });
            
            for (let i = 0; i < shiftRecords.length; i += batchSize) {
                const batch = shiftRecords.slice(i, i + batchSize);
                await base44.entities.ShiftTiming.bulkCreate(batch);
                
                const batchNumber = Math.floor(i / batchSize) + 1;
                setUploadProgress({ 
                    current: batchNumber, 
                    total: totalBatches, 
                    status: `Uploading batch ${batchNumber}/${totalBatches}...` 
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Shift timings uploaded successfully');
            setParsedData([]);
            setFile(null);
            setShowPreviewDialog(false);
            setUploadProgress(null);
        },
        onError: () => {
            toast.error('Failed to upload shift timings');
            setUploadProgress(null);
        }
    });

    const handleUpdatePreviewRow = (index, field, value) => {
        setParsedData(prev => prev.map((row, i) => 
            i === index ? { ...row, [field]: value } : row
        ));
    };

    const updateBlockRangeMutation = useMutation({
        mutationFn: async ({ block, newRange, oldRange }) => {
            // Find all shifts in this block - include those matching old date range
            const blockShifts = shifts.filter(s => {
                // Direct match by shift_block
                if (s.shift_block === block) return true;
                
                // Legacy shifts without shift_block - match by old date range
                if (!s.shift_block && s.effective_from && s.effective_to && oldRange) {
                    if (s.effective_from === oldRange.from && s.effective_to === oldRange.to) {
                        return true;
                    }
                }
                return false;
            });
            
            // Update all shifts with new date range
            if (blockShifts.length > 0) {
                for (const shift of blockShifts) {
                    await base44.entities.ShiftTiming.update(shift.id, {
                        effective_from: newRange.from,
                        effective_to: newRange.to,
                        shift_block: block
                    });
                }
            }
            
            // Save date ranges to project configuration
            let currentRanges = {};
            try {
                currentRanges = project.shift_block_ranges ? JSON.parse(project.shift_block_ranges) : {};
            } catch (e) {
                currentRanges = {};
            }
            
            const updatedRanges = {
                ...currentRanges,
                [block]: newRange
            };
            
            await base44.entities.Project.update(project.id, {
                shift_block_ranges: JSON.stringify(updatedRanges)
            });
            
            return blockShifts.length;
        },
        onSuccess: (shiftCount) => {
            queryClient.invalidateQueries(['shifts', project.id]);
            queryClient.invalidateQueries(['project', project.id]);
            toast.success(`Date range updated. ${shiftCount} shift${shiftCount !== 1 ? 's' : ''} updated to new date range.`);
            setEditingBlockRange(null);
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to save date range');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            await base44.entities.ShiftTiming.delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            setSelectedShifts([]);
            toast.success('Shift deleted');
        },
        onError: (error) => {
            console.error('Delete error:', error);
            toast.error('Failed to delete shift: ' + (error.message || 'Unknown error'));
        }
    });

    const deleteBlockShiftsMutation = useMutation({
        mutationFn: async (blockId) => {
            const blockShifts = shifts.filter(s => s.shift_block === blockId);
            for (const shift of blockShifts) {
                await base44.entities.ShiftTiming.delete(shift.id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            setSelectedShifts([]);
            toast.success('All shifts deleted from block');
        },
        onError: (error) => {
            console.error('Delete block shifts error:', error);
            toast.error('Failed to delete block shifts: ' + (error.message || 'Unknown error'));
        }
    });

    const copyShiftsMutation = useMutation({
        mutationFn: async ({ sourceType, sourceBlockId, sourceProjectId, targetBlockId }) => {
            let sourceShifts = [];
            
            if (sourceType === 'block') {
                // Copy from another block in the same project
                sourceShifts = shifts.filter(s => s.shift_block === sourceBlockId);
            } else if (sourceType === 'project') {
                // Copy from another project
                const otherProjectShifts = await base44.entities.ShiftTiming.filter({ project_id: sourceProjectId });
                sourceShifts = otherProjectShifts;
            }
            
            if (sourceShifts.length === 0) {
                throw new Error('No shifts found in source');
            }
            
            const targetRange = blockDateRanges[targetBlockId];
            const newShifts = sourceShifts.map(shift => ({
                project_id: project.id,
                attendance_id: shift.attendance_id,
                date: shift.date,
                is_friday_shift: shift.is_friday_shift,
                applicable_days: shift.applicable_days,
                is_single_shift: shift.is_single_shift,
                am_start: shift.am_start,
                am_end: shift.am_end,
                pm_start: shift.pm_start,
                pm_end: shift.pm_end,
                effective_from: targetRange.from,
                effective_to: targetRange.to,
                shift_block: targetBlockId
            }));
            
            const batchSize = 50;
            for (let i = 0; i < newShifts.length; i += batchSize) {
                const batch = newShifts.slice(i, i + batchSize);
                await base44.entities.ShiftTiming.bulkCreate(batch);
            }
            
            return newShifts.length;
        },
        onSuccess: (count) => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success(`${count} shifts copied successfully`);
            setShowCopyDialog(false);
        },
        onError: (error) => {
            toast.error('Failed to copy shifts: ' + error.message);
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
            setFormData({
                attendance_id: '',
                am_start: '',
                am_end: '',
                pm_start: '',
                pm_end: '',
                is_single_shift: false,
                is_friday_shift: false
            });
        },
        onError: () => {
            toast.error('Failed to add shift timing');
        }
    });

    const handleSubmitShift = (e) => {
        e.preventDefault();
        if (!formData.attendance_id) {
            toast.error('Please select an employee');
            return;
        }
        if (!formData.am_start || !formData.pm_end) {
            toast.error('Please fill in shift start and end times');
            return;
        }
        createShiftMutation.mutate(formData);
    };

    const exportShiftsToCSV = async () => {
        if (shifts.length === 0) {
            toast.error('No shift data to export');
            return;
        }

        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
            
            const data = shifts.map(shift => {
                const employee = employees.find(e => e.attendance_id === shift.attendance_id);
                return {
                    'Attendance ID': shift.attendance_id,
                    'Employee Name': employee?.name || '-',
                    'Department': employee?.department || '-',
                    'Weekly Off': employee?.weekly_off || 'Sunday',
                    'Shift Type': shift.is_single_shift ? 'Single Shift' : 'Regular',
                    'Applicable Days': shift.applicable_days ? 
                        ((() => {
                            try {
                                const daysArray = JSON.parse(shift.applicable_days);
                                return Array.isArray(daysArray) ? daysArray.join(', ') : shift.applicable_days;
                            } catch { return shift.applicable_days; }
                        })()) : 
                        (shift.date ? new Date(shift.date).toLocaleDateString('en-GB') : 'All days'),
                    'AM Start': shift.am_start || '-',
                    'AM End': shift.am_end || '-',
                    'PM Start': shift.pm_start || '-',
                    'PM End': shift.pm_end || '-',
                    'Block': shift.shift_block === 'block2' ? 'Block 2' : 'Block 1',
                    'Effective From': shift.effective_from ? new Date(shift.effective_from).toLocaleDateString('en-GB') : '-',
                    'Effective To': shift.effective_to ? new Date(shift.effective_to).toLocaleDateString('en-GB') : '-'
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Shift Timings');
            
            XLSX.writeFile(workbook, `${project.name}_shift_timings.xlsx`);
            toast.success('Shift timings exported to Excel');
        } catch (error) {
            toast.error('Failed to export');
            console.error(error);
        }
    };

    const exportBlockShiftsToCSV = async (blockId, blockShifts) => {
        if (blockShifts.length === 0) {
            toast.error('No shifts in this block to export');
            return;
        }

        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
            
            const data = blockShifts.map(shift => {
                const employee = employees.find(e => e.attendance_id === shift.attendance_id);
                return {
                    'Attendance ID': shift.attendance_id,
                    'Employee Name': employee?.name || '-',
                    'Department': employee?.department || '-',
                    'Weekly Off': employee?.weekly_off || 'Sunday',
                    'Shift Type': shift.is_single_shift ? 'Single Shift' : 'Regular',
                    'Applicable Days': shift.applicable_days ? 
                        ((() => {
                            try {
                                const daysArray = JSON.parse(shift.applicable_days);
                                return Array.isArray(daysArray) ? daysArray.join(', ') : shift.applicable_days;
                            } catch { return shift.applicable_days; }
                        })()) : 
                        (shift.date ? new Date(shift.date).toLocaleDateString('en-GB') : 'All days'),
                    'AM Start': shift.am_start || '-',
                    'AM End': shift.am_end || '-',
                    'PM Start': shift.pm_start || '-',
                    'PM End': shift.pm_end || '-',
                    'Effective From': shift.effective_from ? new Date(shift.effective_from).toLocaleDateString('en-GB') : '-',
                    'Effective To': shift.effective_to ? new Date(shift.effective_to).toLocaleDateString('en-GB') : '-'
                };
            });

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, blockId.replace('block', 'Block '));
            
            XLSX.writeFile(workbook, `${project.name}_${blockId}_shifts.xlsx`);
            toast.success(`${blockId.replace('block', 'Block ')} shifts exported to Excel`);
        } catch (error) {
            toast.error('Failed to export');
            console.error(error);
        }
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
                
                // Filter by applicable day
                let matchesDay = true;
                if (applicableDayFilter !== 'all') {
                    if (!shift.applicable_days) {
                        matchesDay = true; // 'All days' shifts match any filter
                    } else {
                        try {
                            const daysArray = JSON.parse(shift.applicable_days);
                            if (Array.isArray(daysArray)) {
                                matchesDay = daysArray.some(day => day.toLowerCase() === applicableDayFilter.toLowerCase());
                            }
                        } catch {
                            matchesDay = true;
                        }
                    }
                }
                
                return matchesSearch && matchesDept && matchesDay;
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
                                            onClick={() => {
                                                // Get the old range from the first shift in this block, or from saved config
                                                let oldRange = null;
                                                const firstShift = shifts.find(s => s.shift_block === blockId);
                                                if (firstShift) {
                                                    oldRange = { from: firstShift.effective_from, to: firstShift.effective_to };
                                                } else {
                                                    // Try to get from project config
                                                    try {
                                                        const savedRanges = project.shift_block_ranges ? JSON.parse(project.shift_block_ranges) : {};
                                                        oldRange = savedRanges[blockId] || null;
                                                    } catch (e) {
                                                        oldRange = null;
                                                    }
                                                }
                                                updateBlockRangeMutation.mutate({ 
                                                    block: blockId, 
                                                    newRange: blockDateRanges[blockId],
                                                    oldRange: oldRange
                                                });
                                            }}
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
                        {editingBlockRange !== blockId && !isUser && (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setCopySource({ ...copySource, type: 'block', targetBlockId: blockId });
                                        setShowCopyDialog(true);
                                    }}
                                >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy Shifts
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingBlockRange(blockId)}
                                >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Edit Date Range
                                </Button>
                                {blockShifts.length > 0 && (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => exportBlockShiftsToCSV(blockId, blockShifts)}
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Export {blockLabel}
                                        </Button>
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
                                    </>
                                )}
                            </div>
                        )}
                        {editingBlockRange !== blockId && isUser && blockShifts.length > 0 && (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => exportBlockShiftsToCSV(blockId, blockShifts)}
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Export {blockLabel}
                                </Button>
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
                                    <div className="flex items-center gap-3">
                                        <p className="text-sm text-slate-600">
                                            {filteredShifts.length !== blockShifts.length && `${filteredShifts.length} of ${blockShifts.length} shown`}
                                        </p>
                                        {selectedShifts.length > 0 && !isUser && (
                                            <Button
                                                size="sm"
                                                onClick={() => setShowBulkEdit(true)}
                                                className="bg-indigo-600 hover:bg-indigo-700"
                                            >
                                                <Edit className="w-4 h-4 mr-2" />
                                                Bulk Edit ({selectedShifts.length})
                                            </Button>
                                        )}
                                    </div>
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
                                        <Select value={applicableDayFilter} onValueChange={setApplicableDayFilter}>
                                            <SelectTrigger className="w-36">
                                                <SelectValue placeholder="Day" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Days</SelectItem>
                                                <SelectItem value="Sunday">Sunday</SelectItem>
                                                <SelectItem value="Monday">Monday</SelectItem>
                                                <SelectItem value="Tuesday">Tuesday</SelectItem>
                                                <SelectItem value="Wednesday">Wednesday</SelectItem>
                                                <SelectItem value="Thursday">Thursday</SelectItem>
                                                <SelectItem value="Friday">Friday</SelectItem>
                                                <SelectItem value="Saturday">Saturday</SelectItem>
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
                                                {!isUser && (
                                                    <TableHead className="w-12">
                                                        <Checkbox
                                                            checked={selectedShifts.length === filteredShifts.length && filteredShifts.length > 0}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedShifts(filteredShifts.map(s => s));
                                                                } else {
                                                                    setSelectedShifts([]);
                                                                }
                                                            }}
                                                        />
                                                    </TableHead>
                                                )}
                                                <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                                    Attendance ID
                                                </SortableTableHead>
                                                <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort}>
                                                    Employee Name
                                                </SortableTableHead>
                                                <TableHead>Department</TableHead>
                                                {project.company === 'Naser Mohsin Auto Parts' && (
                                                    <TableHead>Weekly Off</TableHead>
                                                )}
                                                <TableHead>Shift Type</TableHead>
                                                <TableHead>Shift Times</TableHead>
                                                <TableHead>Applicable Days</TableHead>
                                                {!isUser && <TableHead className="text-right">Actions</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {paginatedShifts.map((shift) => {
                                                const employee = employees.find(e => e.attendance_id === shift.attendance_id);
                                                return (
                                                    <TableRow key={shift.id}>
                                                        {!isUser && (
                                                            <TableCell>
                                                                <Checkbox
                                                                    checked={selectedShifts.some(s => s.id === shift.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        if (checked) {
                                                                            setSelectedShifts([...selectedShifts, shift]);
                                                                        } else {
                                                                            setSelectedShifts(selectedShifts.filter(s => s.id !== shift.id));
                                                                        }
                                                                    }}
                                                                />
                                                            </TableCell>
                                                        )}
                                                        <TableCell className="font-medium">{shift.attendance_id}</TableCell>
                                                        <TableCell>{employee?.name || '-'}</TableCell>
                                                        <TableCell>{employee?.department || '-'}</TableCell>
                                                        {project.company === 'Naser Mohsin Auto Parts' && (
                                                            <TableCell>{employee?.weekly_off || 'Sunday'}</TableCell>
                                                        )}
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
                                                            {(() => {
                                                                if (shift.date) return new Date(shift.date).toLocaleDateString('en-GB');
                                                                if (!shift.applicable_days) return 'All days';

                                                                // Try to parse as JSON array (Naser Mohsin format)
                                                                try {
                                                                    const daysArray = JSON.parse(shift.applicable_days);
                                                                    if (Array.isArray(daysArray)) {
                                                                        return daysArray.join(', ');
                                                                    }
                                                                } catch {
                                                                    // Not JSON, return as string
                                                                }

                                                                return shift.applicable_days;
                                                            })()}
                                                            {shift.is_friday_shift && (
                                                                <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded">
                                                                    Friday
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        {!isUser && (
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
                                                        )}
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
            {/* Upload Progress */}
            {uploadProgress && (
                <Card className="border-0 shadow-sm bg-indigo-50 border-indigo-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-medium text-indigo-900">{uploadProgress.status}</p>
                                <p className="text-sm text-indigo-700 mt-1">
                                    {uploadProgress.current} / {uploadProgress.total} batches completed
                                </p>
                            </div>
                        </div>
                        <div className="w-full bg-indigo-200 rounded-full h-2">
                            <div 
                                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Add Shift Form */}
            {showAddForm && !isUser && (
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle>Add Shift Timing</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmitShift} className="space-y-4">
                            <div>
                                <Label>Employee *</Label>
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
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        checked={formData.is_single_shift}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_single_shift: checked })}
                                    />
                                    <Label>Single Shift (Punch In/Out only)</Label>
                                </div>
                                {project.company === 'Naser Mohsin Auto Parts' && (
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            checked={formData.is_friday_shift}
                                            onCheckedChange={(checked) => setFormData({ ...formData, is_friday_shift: checked })}
                                        />
                                        <Label>Friday Shift</Label>
                                    </div>
                                )}
                            </div>

                            {formData.is_single_shift ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Punch In *</Label>
                                        <TimePicker
                                            placeholder="8:00 AM"
                                            value={formData.am_start}
                                            onChange={(value) => setFormData({ ...formData, am_start: value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Punch Out *</Label>
                                        <TimePicker
                                            placeholder="5:00 PM"
                                            value={formData.pm_end}
                                            onChange={(value) => setFormData({ ...formData, pm_end: value })}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-4">
                                    <div>
                                        <Label>AM Start *</Label>
                                        <TimePicker
                                            placeholder="8:00 AM"
                                            value={formData.am_start}
                                            onChange={(value) => setFormData({ ...formData, am_start: value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>AM End</Label>
                                        <TimePicker
                                            placeholder="12:00 PM"
                                            value={formData.am_end}
                                            onChange={(value) => setFormData({ ...formData, am_end: value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>PM Start</Label>
                                        <TimePicker
                                            placeholder="1:00 PM"
                                            value={formData.pm_start}
                                            onChange={(value) => setFormData({ ...formData, pm_start: value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>PM End *</Label>
                                        <TimePicker
                                            placeholder="5:00 PM"
                                            value={formData.pm_end}
                                            onChange={(value) => setFormData({ ...formData, pm_end: value })}
                                        />
                                    </div>
                                </div>
                            )}

                            <p className="text-sm text-slate-500">
                                This shift will be added to <strong>{selectedBlock === 'block1' ? 'Block 1' : 'Block 2'}</strong> ({new Date(blockDateRanges[selectedBlock].from).toLocaleDateString('en-GB')} - {new Date(blockDateRanges[selectedBlock].to).toLocaleDateString('en-GB')})
                            </p>

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
                    <div className="flex items-center justify-between">
                        <CardTitle>Upload Shift Timings</CardTitle>
                        <div className="flex gap-2">
                            <Button 
                                onClick={exportShiftsToCSV}
                                size="sm"
                                variant="outline"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export All Shifts
                            </Button>
                            {!showAddForm && !isUser && (
                                <Button
                                    onClick={() => setShowAddForm(true)}
                                    size="sm"
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Shift
                                </Button>
                            )}
                        </div>
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
                                {Array.from({ length: blocksCount }, (_, i) => i + 1).map(num => {
                                    const blockId = `block${num}`;
                                    const range = blockDateRanges[blockId];
                                    return (
                                        <SelectItem key={blockId} value={blockId}>
                                            Block {num} ({range ? `${new Date(range.from).toLocaleDateString('en-GB')} - ${new Date(range.to).toLocaleDateString('en-GB')}` : 'Not configured'})
                                        </SelectItem>
                                    );
                                })}
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
                                {parsedData.length} records parsed and ready for review
                            </p>
                            <Button 
                                onClick={() => setShowPreviewDialog(true)}
                                variant="outline"
                            >
                                <Eye className="w-4 h-4 mr-2" />
                                Preview & Edit
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Render dynamic blocks */}
            {Array.from({ length: blocksCount }, (_, i) => i + 1).map(num => {
                const blockId = `block${num}`;
                return renderShiftBlock(blockId, shiftsByBlock[blockId] || [], `Block ${num}`);
            })}

            {/* Edit Shift Dialog */}
            <EditShiftDialog
                open={!!editingShift}
                onClose={() => setEditingShift(null)}
                shift={editingShift}
                projectId={project.id}
            />

            {/* Bulk Edit Dialog */}
            <BulkEditShiftDialog
                open={showBulkEdit}
                onClose={() => {
                    setShowBulkEdit(false);
                    setSelectedShifts([]);
                }}
                selectedShifts={selectedShifts}
                projectId={project.id}
                company={project.company}
            />

            {/* Preview Dialog */}
            <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Preview & Edit Shift Data</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-600">
                                {parsedData.length} shifts | Uploading to: <strong>{selectedBlock === 'block1' ? 'Block 1' : 'Block 2'}</strong> ({new Date(blockDateRanges[selectedBlock].from).toLocaleDateString('en-GB')} - {new Date(blockDateRanges[selectedBlock].to).toLocaleDateString('en-GB')})
                            </p>
                        </div>
                        
                        {warnings.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-amber-900">Warnings</p>
                                        <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
                                            {warnings.map((warning, idx) => (
                                                <li key={idx}>• {warning}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>AM Start</TableHead>
                                        <TableHead>AM End</TableHead>
                                        <TableHead>PM Start</TableHead>
                                        <TableHead>PM End</TableHead>
                                        <TableHead>Days</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedData.map((row, index) => {
                                        const employee = employees.find(e => e.attendance_id === row.attendance_id);
                                        const rowClass = !row.employeeExists ? 'bg-red-50' : row.hasInvalidTime ? 'bg-amber-50' : '';

                                        return (
                                            <TableRow key={index} className={rowClass}>
                                                <TableCell className="font-medium">
                                                    {row.attendance_id}
                                                    {row.hasInvalidTime && (
                                                        <AlertTriangle className="w-4 h-4 text-amber-600 inline ml-1" />
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm">{employee?.name || '❌ Unknown'}</TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={row.am_start}
                                                        onChange={(e) => handleUpdatePreviewRow(index, 'am_start', e.target.value)}
                                                        className={`h-8 w-24 ${row.timeValidations?.am_start?.valid === false ? 'border-red-500' : ''}`}
                                                        placeholder="—"
                                                    />
                                                    {row.timeValidations?.am_start?.valid === false && (
                                                        <p className="text-xs text-red-600 mt-0.5">{row.timeValidations.am_start.error}</p>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={row.am_end}
                                                        onChange={(e) => handleUpdatePreviewRow(index, 'am_end', e.target.value)}
                                                        className={`h-8 w-24 ${row.timeValidations?.am_end?.valid === false ? 'border-red-500' : ''}`}
                                                        placeholder="—"
                                                    />
                                                    {row.timeValidations?.am_end?.valid === false && (
                                                        <p className="text-xs text-red-600 mt-0.5">{row.timeValidations.am_end.error}</p>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={row.pm_start}
                                                        onChange={(e) => handleUpdatePreviewRow(index, 'pm_start', e.target.value)}
                                                        className={`h-8 w-24 ${row.timeValidations?.pm_start?.valid === false ? 'border-red-500' : ''}`}
                                                        placeholder="—"
                                                    />
                                                    {row.timeValidations?.pm_start?.valid === false && (
                                                        <p className="text-xs text-red-600 mt-0.5">{row.timeValidations.pm_start.error}</p>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={row.pm_end}
                                                        onChange={(e) => handleUpdatePreviewRow(index, 'pm_end', e.target.value)}
                                                        className={`h-8 w-24 ${row.timeValidations?.pm_end?.valid === false ? 'border-red-500' : ''}`}
                                                        placeholder="—"
                                                    />
                                                    {row.timeValidations?.pm_end?.valid === false && (
                                                        <p className="text-xs text-red-600 mt-0.5">{row.timeValidations.pm_end.error}</p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {row.is_friday_shift && (
                                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">Friday</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button 
                                onClick={() => uploadMutation.mutate()}
                                disabled={uploadMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {uploadMutation.isPending ? 'Uploading...' : `Confirm & Upload`}
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={() => {
                                    setShowPreviewDialog(false);
                                    setParsedData([]);
                                    setFile(null);
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Copy Shifts Dialog */}
            <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Copy Shifts to {copySource.targetBlockId === 'block1' ? 'Block 1' : 'Block 2'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Copy From</Label>
                            <Select
                                value={copySource.type}
                                onValueChange={(value) => setCopySource({ ...copySource, type: value })}
                            >
                                <SelectTrigger className="mt-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="block">Another Block in This Project</SelectItem>
                                    <SelectItem value="project">Another Project</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {copySource.type === 'block' && (
                            <div>
                                <Label>Source Block</Label>
                                <Select
                                    value={copySource.blockId}
                                    onValueChange={(value) => setCopySource({ ...copySource, blockId: value })}
                                >
                                    <SelectTrigger className="mt-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: blocksCount }, (_, i) => i + 1).map(num => {
                                            const blockId = `block${num}`;
                                            const range = blockDateRanges[blockId];
                                            const count = (shiftsByBlock[blockId] || []).length;
                                            return (
                                                <SelectItem key={blockId} value={blockId}>
                                                    Block {num} ({count} shifts)
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {copySource.type === 'project' && (
                            <div>
                                <Label>Source Project</Label>
                                <Select
                                    value={copySource.projectId}
                                    onValueChange={(value) => setCopySource({ ...copySource, projectId: value })}
                                >
                                    <SelectTrigger className="mt-2">
                                        <SelectValue placeholder="Select project..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allProjects
                                            .filter(p => p.id !== project.id && p.company === project.company)
                                            .map(p => (
                                                <SelectItem key={p.id} value={p.id}>
                                                    {p.name} ({new Date(p.date_from).toLocaleDateString()})
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-sm text-amber-800">
                                ⚠️ This will copy all shifts from the source to {copySource.targetBlockId === 'block1' ? 'Block 1' : 'Block 2'} with the current date range.
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowCopyDialog(false)}>Cancel</Button>
                        <Button
                            onClick={() => copyShiftsMutation.mutate({
                                sourceType: copySource.type,
                                sourceBlockId: copySource.blockId,
                                sourceProjectId: copySource.projectId,
                                targetBlockId: copySource.targetBlockId
                            })}
                            disabled={copyShiftsMutation.isPending || (copySource.type === 'project' && !copySource.projectId)}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {copyShiftsMutation.isPending ? 'Copying...' : 'Copy Shifts'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}