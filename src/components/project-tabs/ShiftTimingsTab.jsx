import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import EditShiftDialog from './EditShiftDialog';
import BulkEditShiftDialog from '../shifts/BulkEditShiftDialog';
import TimePicker from '../ui/QuickTimePicker';
import RamadanShiftSection from './RamadanShiftSection';
import ExcelPreviewDialog from '@/components/ui/ExcelPreviewDialog';
import ShiftTable from './shifts/ShiftTable';
import ShiftCommandCenter from './shifts/ShiftCommandCenter';
import ShiftFilters from './shifts/ShiftFilters';
import BlockSettings from './shifts/BlockSettings';

export default function ShiftTimingsTab({ project }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [editingShift, setEditingShift] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [nlpText, setNlpText] = useState('');
    const [nlpParsing, setNlpParsing] = useState(false);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [applicableDayFilter, setApplicableDayFilter] = useState('all');
    const [shiftTypeFilter, setShiftTypeFilter] = useState('all');
    const [selectedBlock, setSelectedBlock] = useState('block1');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [editingBlockRange, setEditingBlockRange] = useState(null);
    const [showPreviewDialog, setShowPreviewDialog] = useState(false);
    const [parsedData, setParsedData] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [selectedShifts, setSelectedShifts] = useState([]);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [copySource, setCopySource] = useState({ type: 'block', blockId: 'block1', projectId: '', sourceProjectBlockId: 'block1' });
    const [rangeUpdateProgress, setRangeUpdateProgress] = useState(null);
    const [astraFile, setAstraFile] = useState(null);
    const [blockDateRanges, setBlockDateRanges] = useState(() => {
        if (!project?.date_from || !project?.date_to) {
            return { block1: { from: '', to: '' }, block2: { from: '', to: '' } };
        }
        return {
            block1: { from: project.date_from, to: project.date_to },
            block2: { from: project.date_from, to: project.date_to }
        };
    });

    const [formData, setFormData] = useState({
        attendance_id: '',
        am_start: '',
        am_end: '',
        pm_start: '',
        pm_end: '',
        is_single_shift: false,
        is_friday_shift: false,
        applicable_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday']
    });

    const [exportPreviewConfig, setExportPreviewConfig] = useState({
        isOpen: false,
        data: [],
        headers: [],
        fileName: '',
        onConfirm: () => { }
    });

    const queryClient = useQueryClient();
    const copyLockRef = useRef(false);
    const isAstra = project.company === 'Astra Auto Parts';

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const { data: masterEmployees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    const { data: projectEmployees = [] } = useQuery({
        queryKey: ['projectEmployees', project.id],
        queryFn: () => base44.entities.ProjectEmployee.filter({ project_id: project.id })
    });

    const employees = useMemo(() => {
        const combined = [...masterEmployees];
        for (const pe of projectEmployees) {
            if (!masterEmployees.some(e => String(e.attendance_id) === String(pe.attendance_id))) {
                combined.push({
                    id: pe.id,
                    attendance_id: pe.attendance_id,
                    name: pe.name,
                    department: pe.department || 'Admin',
                    weekly_off: pe.weekly_off || 'Sunday',
                    _isProjectOverride: true
                });
            }
        }
        return combined.filter(emp => emp.attendance_id);
    }, [masterEmployees, projectEmployees]);

    const { data: allProjects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list(),
        enabled: showCopyDialog
    });

    const { data: companySettings = [] } = useQuery({
        queryKey: ['companySettings', project.company],
        queryFn: () => base44.entities.CompanySettings.filter({ company: project.company })
    });

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
            } catch (_e) {
                setBlockDateRanges(defaultRanges);
            }
        } else {
            setBlockDateRanges(defaultRanges);
        }
    }, [project.shift_block_ranges, project.date_from, project.date_to, project.shift_blocks_count]);
    
    // Reset page to 1 when filters or search change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, departmentFilter, applicableDayFilter, shiftTypeFilter]);

    const shiftsByBlock = useMemo(() => {
        const blocksCount = project.shift_blocks_count || 2;
        const result = {};
        for (let i = 1; i <= blocksCount; i++) {
            const blockId = `block${i}`;
            result[blockId] = shifts.filter(s => {
                if (s.shift_block === blockId) return true;
                if (!s.shift_block && s.effective_from && s.effective_to && blockDateRanges[blockId]) {
                    const blockRange = blockDateRanges[blockId];
                    if (s.effective_from === blockRange.from && s.effective_to === blockRange.to) {
                        return true;
                    }
                }
                return false;
            });
        }
        return result;
    }, [shifts, project.shift_blocks_count, blockDateRanges]);

    const filteredShifts = useMemo(() => {
        const activeBlockShifts = shiftsByBlock[selectedBlock] || [];
        return activeBlockShifts
            .filter(shift => {
                const employee = employees.find(e => String(e.attendance_id) === String(shift.attendance_id));
                const matchesSearch = !searchTerm ||
                    String(shift.attendance_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
                    employee?.name.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesDept = departmentFilter === 'all' || employee?.department === departmentFilter;
                const matchesShiftType = shiftTypeFilter === 'all' ||
                    (shiftTypeFilter === 'single' && shift.is_single_shift) ||
                    (shiftTypeFilter === 'regular' && !shift.is_single_shift);

                let matchesDay = true;
                if (applicableDayFilter !== 'all') {
                    let applicableDays = [];
                    if (shift.applicable_days) {
                        try {
                            const parsed = JSON.parse(shift.applicable_days);
                            applicableDays = Array.isArray(parsed) ? parsed : [parsed];
                        } catch {
                            if (typeof shift.applicable_days === 'string') {
                                if (shift.applicable_days.includes(',')) {
                                    applicableDays = shift.applicable_days.split(',').map(d => d.trim()).filter(Boolean);
                                } else {
                                    const str = shift.applicable_days.trim().toLowerCase();
                                    if (str === 'monday to thursday and saturday') {
                                        applicableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'];
                                    } else if (str === 'monday to saturday') {
                                        applicableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                    } else if (str === 'monday to friday') {
                                        applicableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                                    } else if (str === 'sunday to thursday') {
                                        applicableDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
                                    } else {
                                        applicableDays = [shift.applicable_days.trim()];
                                    }
                                }
                            }
                        }
                    }

                    if (shift.is_friday_shift && !applicableDays.includes('Friday')) {
                        applicableDays.push('Friday');
                    }

                    // Defaulting for legacy/untouched records
                    if (applicableDays.length === 0) {
                        if (shift.is_friday_shift) {
                            applicableDays = ['Friday'];
                        } else {
                            applicableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'];
                        }
                    }

                    matchesDay = applicableDays.some(day => day.toLowerCase() === applicableDayFilter.toLowerCase());
                }

                return matchesSearch && matchesDept && matchesShiftType && matchesDay;
            })
            .sort((a, b) => {
                let aVal, bVal;
                if (sort.key === 'name') {
                    aVal = employees.find(e => String(e.attendance_id) === String(a.attendance_id))?.name || '';
                    bVal = employees.find(e => String(e.attendance_id) === String(b.attendance_id))?.name || '';
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
    }, [shiftsByBlock, selectedBlock, searchTerm, departmentFilter, shiftTypeFilter, applicableDayFilter, sort, employees]);

    const paginatedShifts = useMemo(() => {
        return filteredShifts.slice(
            (currentPage - 1) * rowsPerPage,
            currentPage * rowsPerPage
        );
    }, [filteredShifts, currentPage, rowsPerPage]);

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

    const normalizeTime = (timeStr) => {
        if (!timeStr || timeStr === '—' || timeStr.trim() === '') return '—';
        if (/AM|PM/i.test(timeStr)) {
            const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (match) {
                let hours = parseInt(match[1]);
                const minutes = match[2];
                const period = match[3].toUpperCase();
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
        const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (ampmMatch) {
            const hours = parseInt(ampmMatch[1]);
            const minutes = parseInt(ampmMatch[2]);
            if (hours < 1 || hours > 12) return { valid: false, error: 'Hours must be 1-12' };
            if (minutes < 0 || minutes > 59) return { valid: false, error: 'Minutes must be 0-59' };
            return { valid: true, error: null };
        }
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            if (hours < 0 || hours > 23) return { valid: false, error: 'Hours must be 0-23' };
            if (minutes < 0 || minutes > 59) return { valid: false, error: 'Minutes must be 0-59' };
            return { valid: true, error: null };
        }
        return { valid: false, error: 'Invalid time format' };
    };

    const normalizeApplicableDays = (value) => {
        if (!value) return null;
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return value;
        } catch { }
        const str = String(value).trim().toLowerCase();
        if (str === 'friday') return JSON.stringify(['Friday']);
        if (str === 'monday to thursday and saturday' || str === 'mon to thu and sat')
            return JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday']);
        if (str === 'monday to saturday' || str === 'mon to sat')
            return JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
        if (str === 'monday to friday' || str === 'mon to fri')
            return JSON.stringify(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
        if (str === 'sunday to thursday' || str === 'sun to thu')
            return JSON.stringify(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']);
        const dayMap = {
            'sunday': 'Sunday', 'sun': 'Sunday',
            'monday': 'Monday', 'mon': 'Monday',
            'tuesday': 'Tuesday', 'tue': 'Tuesday',
            'wednesday': 'Wednesday', 'wed': 'Wednesday',
            'thursday': 'Thursday', 'thu': 'Thursday',
            'friday': 'Friday', 'fri': 'Friday',
            'saturday': 'Saturday', 'sat': 'Saturday'
        };
        const parts = str.split(',').map(s => s.trim()).filter(Boolean);
        const mapped = parts.map(p => dayMap[p]).filter(Boolean);
        if (mapped.length > 0) return JSON.stringify(mapped);
        return JSON.stringify([String(value).trim()]);
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
                if (values.length >= 9) {
                    const attendance_id = values[0];
                    const am_start = normalizeTime(values[3]);
                    const am_end = normalizeTime(values[4]);
                    const pm_start = normalizeTime(values[5]);
                    const pm_end = normalizeTime(values[6]);
                    const shiftType = values[8] ? values[8].trim().toLowerCase() : '';
                    const is_single_shift = shiftType === 'single shift';
                    let applicableDays = values[9] ? values[9].trim() : '';
                    let is_friday_shift = false;
                    if (applicableDays) {
                        applicableDays = normalizeApplicableDays(applicableDays);
                        try {
                            const daysArray = JSON.parse(applicableDays);
                            is_friday_shift = daysArray.some(day => String(day).toLowerCase() === 'friday') && daysArray.length === 1;
                        } catch { }
                    }
                    const employeeExists = employees.some(e => String(e.attendance_id) === String(attendance_id));
                    if (!employeeExists) {
                        newWarnings.push(`Unknown employee: ${attendance_id}`);
                    }
                    data.push({
                        attendance_id: String(attendance_id),
                        date: null,
                        is_friday_shift,
                        is_single_shift,
                        applicable_days: applicableDays,
                        am_start,
                        am_end,
                        pm_start,
                        pm_end,
                        employeeExists,
                        timeValidations: {
                            am_start: validateTime(am_start),
                            am_end: validateTime(am_end),
                            pm_start: validateTime(pm_start),
                            pm_end: validateTime(pm_end)
                        }
                    });
                }
            }
            setParsedData(data);
            setWarnings([...new Set(newWarnings)]);
            setShowPreviewDialog(true);
        };
        reader.readAsText(file);
    };

    const handleFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
            if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const data = event.target.result;
                    const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const csvData = XLSX.utils.sheet_to_csv(worksheet);
                    parseCSV(new Blob([csvData], { type: 'text/csv' }));
                };
                reader.readAsArrayBuffer(selectedFile);
            } else {
                parseCSV(selectedFile);
            }
        }
    };

    const uploadMutation = useMutation({
        mutationFn: async () => {
            const blockRange = blockDateRanges[selectedBlock];
            const records = parsedData.map(s => ({
                project_id: project.id,
                attendance_id: String(s.attendance_id),
                date: s.date,
                is_friday_shift: s.is_friday_shift,
                is_single_shift: s.is_single_shift,
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
            const totalBatches = Math.ceil(records.length / batchSize);
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                await base44.entities.ShiftTiming.bulkCreate(batch);
                setUploadProgress({ current: Math.floor(i / batchSize) + 1, total: totalBatches, status: 'Uploading...' });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Upload complete');
            setShowPreviewDialog(false);
            setParsedData([]);
            setUploadProgress(null);
        }
    });

    const astraUploadMutation = useMutation({
        mutationFn: async () => {
            if (!astraFile) throw new Error("No file selected");
            return new Promise((resolve, reject) => {
                const processCSVText = async (text) => {
                    try {
                        const lines = text.split('\n').filter(line => line.trim());
                        const range = blockDateRanges[selectedBlock];
                        const records = [];
                        for (let i = 1; i < lines.length; i++) {
                            const v = lines[i].split(',').map(x => x.trim());
                            if (v.length >= 9) {
                                let applicableDays = v[9] ? v[9].trim() : '';
                                let is_friday_shift = false;
                                if (applicableDays) {
                                    applicableDays = normalizeApplicableDays(applicableDays);
                                    try {
                                        const daysArray = JSON.parse(applicableDays);
                                        is_friday_shift = daysArray.some(d => String(d).toLowerCase() === 'friday') && daysArray.length === 1;
                                    } catch { }
                                }
                                records.push({
                                    project_id: project.id,
                                    attendance_id: String(v[0]),
                                    am_start: normalizeTime(v[3]),
                                    am_end: normalizeTime(v[4]),
                                    pm_start: normalizeTime(v[5]),
                                    pm_end: normalizeTime(v[6]),
                                    is_single_shift: v[8]?.toLowerCase() === 'single shift',
                                    is_friday_shift,
                                    applicable_days: applicableDays,
                                    shift_block: selectedBlock,
                                    effective_from: range.from,
                                    effective_to: range.to
                                });
                            }
                        }
                        const batchSize = 50;
                        for (let i = 0; i < records.length; i += batchSize) {
                            await base44.entities.ShiftTiming.bulkCreate(records.slice(i, i + batchSize));
                        }
                        resolve();
                    } catch (err) { reject(err); }
                };

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const fileExtension = astraFile.name.split('.').pop().toLowerCase();
                    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                        processCSVText(XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]));
                    } else {
                        processCSVText(e.target.result);
                    }
                };
                reader.readAsArrayBuffer(astraFile);
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Astra upload complete');
            setAstraFile(null);
        }
    });

    const exportShiftsToCSV = async () => {
        if (shifts.length === 0) {
            toast.error('No data to export');
            return;
        }
        const data = shifts.map(s => {
            const emp = employees.find(e => String(e.attendance_id) === String(s.attendance_id));
            return {
                'Attendance ID': s.attendance_id,
                'Employee Name': emp?.name || '-',
                'Department': emp?.department || '-',
                'AM Start': s.am_start || '-',
                'AM End': s.am_end || '-',
                'PM Start': s.pm_start || '-',
                'PM End': s.pm_end || '-',
                'Weekly Off': emp?.weekly_off || 'Sunday',
                'Shift Type': s.is_single_shift ? 'Single Shift' : 'Regular',
                'Applicable Days': s.applicable_days ? s.applicable_days : (s.date || '')
            };
        });
        setExportPreviewConfig({
            isOpen: true,
            data,
            headers: Object.keys(data[0]),
            fileName: `${project.name}_shifts.xlsx`,
            onConfirm: executeExportDownload
        });
    };

    const executeExportDownload = async () => {
        const ws = XLSX.utils.json_to_sheet(exportPreviewConfig.data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Shifts');
        XLSX.writeFile(wb, exportPreviewConfig.fileName);
        toast.success('Exported');
        setExportPreviewConfig(p => ({ ...p, isOpen: false }));
    };

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.ShiftTiming.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Deleted');
        }
    });

    const deleteBlockShiftsMutation = useMutation({
        mutationFn: async (blockId) => {
            const blockShifts = shiftsByBlock[blockId] || [];
            for (const s of blockShifts) await base44.entities.ShiftTiming.delete(s.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Block cleared');
        }
    });

    const updateBlockRangeMutation = useMutation({
        mutationFn: async ({ block, newRange }) => {
            const blockShifts = shiftsByBlock[block] || [];
            const total = blockShifts.length;
            const batchSize = 10;
            
            setRangeUpdateProgress({ status: 'Updating shift block...' });
            
            for (let i = 0; i < total; i += batchSize) {
                const batch = blockShifts.slice(i, i + batchSize);
                await Promise.all(batch.map(s => 
                    base44.entities.ShiftTiming.update(s.id, {
                        effective_from: newRange.from,
                        effective_to: newRange.to,
                        shift_block: block
                    })
                ));
            }
            
            setRangeUpdateProgress({ status: 'Finalizing settings...' });
            const currentRanges = project.shift_block_ranges ? JSON.parse(project.shift_block_ranges) : {};
            await base44.entities.Project.update(project.id, {
                shift_block_ranges: JSON.stringify({ ...currentRanges, [block]: newRange })
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            queryClient.invalidateQueries(['project', project.id]);
            toast.success('Range updated');
            setEditingBlockRange(null);
            setRangeUpdateProgress(null);
        },
        onError: () => {
            setRangeUpdateProgress(null);
            toast.error('Failed to update range');
        }
    });

    const copyShiftsMutation = useMutation({
        mutationFn: async ({ sourceType, sourceBlockId, sourceProjectId, targetBlockId }) => {
            let srcShifts = [];
            if (sourceType === 'block') {
                srcShifts = shiftsByBlock[sourceBlockId] || [];
            } else {
                if (!sourceProjectId) throw new Error('Select a source project first');
                srcShifts = await base44.entities.ShiftTiming.filter({ project_id: sourceProjectId }, null, 500);
            }

            const targetRange = blockDateRanges[targetBlockId];
            if (!targetRange?.from || !targetRange?.to) throw new Error('Target block date range is missing');

            const uniqueSourceShifts = Array.from(
                new Map(srcShifts.map(s => [
                    [s.attendance_id, s.date || '', s.is_friday_shift ? 'fri' : 'std', s.is_single_shift ? 'single' : 'regular', s.applicable_days || '', s.am_start || '', s.am_end || '', s.pm_start || '', s.pm_end || ''].join('|'),
                    s
                ])).values()
            );

            if (uniqueSourceShifts.length === 0) throw new Error('No shifts found to copy');
            if (uniqueSourceShifts.length > 500) throw new Error(`Copy stopped: source has ${uniqueSourceShifts.length} shifts. Please clean duplicates before copying.`);

            const existingTargetKeys = new Set(shifts.map(s => [
                s.attendance_id,
                s.date || '',
                targetBlockId,
                s.is_friday_shift ? 'fri' : 'std',
                s.is_single_shift ? 'single' : 'regular',
                s.applicable_days || '',
                s.am_start || '',
                s.am_end || '',
                s.pm_start || '',
                s.pm_end || ''
            ].join('|')));

            const newRecords = uniqueSourceShifts
                .map(s => ({
                    project_id: project.id,
                    attendance_id: String(s.attendance_id),
                    date: s.date || null,
                    is_friday_shift: !!s.is_friday_shift,
                    is_single_shift: !!s.is_single_shift,
                    applicable_days: s.applicable_days || null,
                    am_start: s.am_start || '',
                    am_end: s.am_end || '',
                    pm_start: s.pm_start || '',
                    pm_end: s.pm_end || '',
                    shift_block: targetBlockId,
                    effective_from: targetRange.from,
                    effective_to: targetRange.to
                }))
                .filter(s => !existingTargetKeys.has([
                    s.attendance_id,
                    s.date || '',
                    s.shift_block,
                    s.is_friday_shift ? 'fri' : 'std',
                    s.is_single_shift ? 'single' : 'regular',
                    s.applicable_days || '',
                    s.am_start || '',
                    s.am_end || '',
                    s.pm_start || '',
                    s.pm_end || ''
                ].join('|')));

            if (newRecords.length === 0) throw new Error('All selected shifts already exist in the target block');

            for (let i = 0; i < newRecords.length; i += 50) {
                await base44.entities.ShiftTiming.bulkCreate(newRecords.slice(i, i + 50));
            }

            return newRecords.length;
        },
        onSuccess: (count) => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success(`${count} shift${count === 1 ? '' : 's'} copied`);
            setShowCopyDialog(false);
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to copy shifts');
        },
        onSettled: () => {
            copyLockRef.current = false;
        }
    });

    const handleCopyShifts = () => {
        if (copyLockRef.current || copyShiftsMutation.isPending) return;
        copyLockRef.current = true;
        copyShiftsMutation.mutate({ ...copySource, targetBlockId: selectedBlock });
    };

    const createShiftMutation = useMutation({
        mutationFn: (data) => base44.entities.ShiftTiming.create({
            ...data,
            project_id: project.id,
            shift_block: selectedBlock,
            effective_from: blockDateRanges[selectedBlock].from,
            effective_to: blockDateRanges[selectedBlock].to,
            applicable_days: data.applicable_days.length > 0 ? JSON.stringify(data.applicable_days) : null
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success('Added');
            setShowAddForm(false);
            setFormData({
                attendance_id: '',
                am_start: '',
                am_end: '',
                pm_start: '',
                pm_end: '',
                is_single_shift: false,
                is_friday_shift: false,
                applicable_days: project.company === 'Naser Mohsin Auto Parts'
                    ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday']
                    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday']
            });
        }
    });

    const handleNlpParse = async () => {
        if (!nlpText.trim()) return;
        setNlpParsing(true);
        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Parse shift request. Available employees: ${employees.map(e => `${e.attendance_id} (${e.name})`).join(', ')}. Request: "${nlpText}". Return JSON with attendance_id, am_start, am_end, pm_start, pm_end, is_single_shift, is_friday_shift, applicable_days (array). If "all" employees, set attendance_id to "ALL".`,
                response_json_schema: { type: "object", properties: { attendance_id: { type: "string" }, am_start: { type: "string" }, am_end: { type: "string" }, pm_start: { type: "string" }, pm_end: { type: "string" }, is_single_shift: { type: "boolean" }, is_friday_shift: { type: "boolean" }, applicable_days: { type: "array", items: { type: "string" } } }, required: ["attendance_id"] }
            });
            if (response.attendance_id === 'ALL') {
                const range = blockDateRanges[selectedBlock];
                const records = employees.map(e => ({
                    project_id: project.id,
                    attendance_id: String(e.attendance_id),
                    shift_block: selectedBlock,
                    effective_from: range.from,
                    effective_to: range.to,
                    am_start: response.am_start || '',
                    am_end: response.am_end || '',
                    pm_start: response.pm_start || '',
                    pm_end: response.pm_end || '',
                    is_single_shift: response.is_single_shift || false,
                    is_friday_shift: response.is_friday_shift || false,
                    applicable_days: response.applicable_days?.length ? JSON.stringify(response.applicable_days) : null
                }));
                await base44.entities.ShiftTiming.bulkCreate(records);
                queryClient.invalidateQueries(['shifts', project.id]);
                toast.success('Added to all');
                setNlpText('');
            } else {
                setFormData({ ...formData, ...response });
                toast.success('Form filled');
            }
        } catch (_e) { toast.error('Failed to parse'); }
        finally { setNlpParsing(false); }
    };

    const blockIds = Array.from({ length: project.shift_blocks_count || 2 }, (_, i) => `block${i + 1}`);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <RamadanShiftSection project={project} shifts={shifts} employees={employees} />

            <ShiftCommandCenter
                onAddShift={() => setShowAddForm(true)}
                onExportAll={exportShiftsToCSV}
                isAstra={isAstra}
                shiftBlocks={blockIds}
                activeBlock={selectedBlock}
                onBlockChange={(b) => { setSelectedBlock(b); setCurrentPage(1); }}
                blockRanges={blockDateRanges}
            />

            {/* Hidden Inputs for Upload */}
            <Input
                id="shift-file-upload"
                type="file"
                className="hidden"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileChange}
            />
            <Input
                id="astra-shift-file"
                type="file"
                className="hidden"
                accept=".csv, .xlsx, .xls"
                onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) {
                        setAstraFile(f);
                        astraUploadMutation.mutate();
                    }
                }}
            />

            {uploadProgress && (
                <Card className="border-0 shadow-lg bg-white ring-1 ring-indigo-100">
                    <CardContent className="p-6">
                        <p className="font-bold">{uploadProgress.status}</p>
                        <div className="w-full bg-slate-100 h-3 rounded-full mt-2">
                            <div className="bg-indigo-600 h-3 rounded-full transition-all duration-300" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} />
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-900">
                            {selectedBlock.replace('block', 'Block ')} Active Shifts
                        </h3>
                    </div>
                    {selectedShifts.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-500">{selectedShifts.length} selected</span>
                            <Button size="sm" onClick={() => setShowBulkEdit(true)}>Bulk Edit</Button>
                            <Button size="sm" variant="outline" onClick={() => setSelectedShifts([])}>Clear</Button>
                        </div>
                    )}
                </div>

                <BlockSettings
                    blockId={selectedBlock}
                    blockRange={blockDateRanges[selectedBlock]}
                    isEditing={editingBlockRange === selectedBlock}
                    onEdit={() => setEditingBlockRange(selectedBlock)}
                    onCancel={() => setEditingBlockRange(null)}
                    onRangeChange={(f, v) => setBlockDateRanges(p => ({ ...p, [selectedBlock]: { ...p[selectedBlock], [f]: v } }))}
                    onSave={() => updateBlockRangeMutation.mutate({ block: selectedBlock, newRange: blockDateRanges[selectedBlock] })}
                    onCopy={() => setShowCopyDialog(true)}
                    onDeleteAll={() => {
                        if (window.confirm('Delete all shifts in this block?')) deleteBlockShiftsMutation.mutate(selectedBlock);
                    }}
                    isSaving={updateBlockRangeMutation.isPending}
                    updateProgress={rangeUpdateProgress}
                    minDate={project.date_from}
                    maxDate={project.date_to}
                />

                <ShiftFilters
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    departmentFilter={departmentFilter}
                    onDepartmentChange={setDepartmentFilter}
                    shiftTypeFilter={shiftTypeFilter}
                    onShiftTypeChange={setShiftTypeFilter}
                    applicableDayFilter={applicableDayFilter}
                    onApplicableDayChange={setApplicableDayFilter}
                    departments={companySettings[0]?.departments?.split(',').map(d => d.trim()).filter(Boolean) || []}
                    onReset={() => { setSearchTerm(''); setDepartmentFilter('all'); setShiftTypeFilter('all'); setApplicableDayFilter('all'); }}
                />

                <ShiftTable
                    shifts={paginatedShifts}
                    employees={employees}
                    selectedShifts={selectedShifts}
                    onSelectShift={(s, c) => setSelectedShifts(c ? [...selectedShifts, s] : selectedShifts.filter(x => x.id !== s.id))}
                    onSelectAll={(c) => setSelectedShifts(c ? paginatedShifts : [])}
                    onEdit={setEditingShift}
                    onDelete={(s) => {
                        if (window.confirm('Delete this shift?')) deleteMutation.mutate(s.id);
                    }}
                    sort={sort}
                    onSort={setSort}
                    currentPage={currentPage}
                    rowsPerPage={rowsPerPage}
                    onPageChange={setCurrentPage}
                    onRowsPerPageChange={(v) => { setRowsPerPage(v); setCurrentPage(1); }}
                    company={project.company}
                    formatTime={formatTime}
                    totalItems={filteredShifts.length}
                />
            </div>

            <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <DialogTitle>Add New Shift Timing</DialogTitle>
                            <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                                Target: {selectedBlock.toUpperCase().replace('BLOCK', 'Block ')}
                            </span>
                        </div>
                    </DialogHeader>
                    <div className="space-y-6 p-4">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                            <div className="flex items-center gap-2 mb-3">
                                <Label className="font-bold text-slate-700">AI Quick Entry</Label>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    value={nlpText}
                                    onChange={e => setNlpText(e.target.value)}
                                    placeholder="e.g. Ali 8am-5pm single shift..."
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleNlpParse(); }}
                                    className="bg-white"
                                />
                                <Button onClick={handleNlpParse} disabled={nlpParsing} className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50">
                                    {nlpParsing ? 'Parsing...' : 'Parse'}
                                </Button>
                            </div>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); createShiftMutation.mutate(formData); }} className="space-y-4">
                            <div>
                                <Label>Employee</Label>
                                <Select value={formData.attendance_id} onValueChange={v => setFormData({ ...formData, attendance_id: v })}>
                                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                    <SelectContent>
                                        {employees.map(e => <SelectItem key={e.id} value={String(e.attendance_id)}>{e.attendance_id} - {e.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-8">
                                <div className="flex items-center gap-2">
                                    <Switch checked={formData.is_single_shift} onCheckedChange={c => setFormData({ ...formData, is_single_shift: c })} />
                                    <Label>Single Shift</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch checked={formData.is_friday_shift} onCheckedChange={c => setFormData({ ...formData, is_friday_shift: c, applicable_days: c ? ['Friday'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'] })} />
                                    <Label>Friday Shift</Label>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-slate-900 font-bold">Applicable Days</Label>
                                {project.company === 'Naser Mohsin Auto Parts' ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                            <div key={day} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`new-day-${day}`}
                                                    checked={formData.applicable_days.includes(day)}
                                                    onCheckedChange={(checked) => {
                                                        const newDays = checked
                                                            ? [...formData.applicable_days, day]
                                                            : formData.applicable_days.filter(d => d !== day);
                                                        setFormData({ ...formData, applicable_days: newDays });
                                                    }}
                                                />
                                                <Label htmlFor={`new-day-${day}`} className="font-medium text-slate-700 cursor-pointer">{day}</Label>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Select
                                        value={
                                            formData.applicable_days.length === 1 && formData.applicable_days.includes('Friday')
                                                ? 'Friday'
                                                : formData.applicable_days.length === 6
                                                    ? 'Monday to Saturday'
                                                    : 'Monday to Thursday and Saturday'
                                        }
                                        onValueChange={(value) => {
                                            let newArray = [];
                                            if (value === 'Monday to Thursday and Saturday') {
                                                newArray = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'];
                                            } else if (value === 'Friday') {
                                                newArray = ['Friday'];
                                            } else if (value === 'Monday to Saturday') {
                                                newArray = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                            }
                                            setFormData({ ...formData, applicable_days: newArray, is_friday_shift: value === 'Friday' });
                                        }}
                                    >
                                        <SelectTrigger className="h-11 bg-slate-50 border-slate-100 rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Monday to Thursday and Saturday">Monday to Thursday and Saturday</SelectItem>
                                            <SelectItem value="Friday">Friday</SelectItem>
                                            <SelectItem value="Monday to Saturday">Monday to Saturday</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div><Label>AM Start</Label><TimePicker value={formData.am_start} onChange={v => setFormData({ ...formData, am_start: v })} /></div>
                                <div><Label>AM End</Label><TimePicker value={formData.am_end} onChange={v => setFormData({ ...formData, am_end: v })} /></div>
                                <div><Label>PM Start</Label><TimePicker value={formData.pm_start} onChange={v => setFormData({ ...formData, pm_start: v })} /></div>
                                <div><Label>PM End</Label><TimePicker value={formData.pm_end} onChange={v => setFormData({ ...formData, pm_end: v })} /></div>
                            </div>
                            <div className="flex gap-3 justify-end pt-4">
                                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                                <Button type="submit" disabled={createShiftMutation.isPending}>{createShiftMutation.isPending ? 'Saving...' : 'Save Shift'}</Button>
                            </div>
                        </form>
                    </div>
                </DialogContent>
            </Dialog>

            <ExcelPreviewDialog
                isOpen={showPreviewDialog}
                onClose={() => setShowPreviewDialog(false)}
                data={parsedData}
                warnings={warnings}
                onUpload={() => uploadMutation.mutate()}
                isUploading={uploadMutation.isPending}
                onUpdateRow={(idx, field, val) => setParsedData(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r))}
                employees={employees}
                title={`Shift Timings Preview - ${selectedBlock.replace('block', 'Block ')}`}
            />

            <EditShiftDialog open={!!editingShift} onClose={() => setEditingShift(null)} shift={editingShift} projectId={project.id} />
            <BulkEditShiftDialog open={showBulkEdit} onClose={() => { setShowBulkEdit(false); setSelectedShifts([]); }} selectedShifts={selectedShifts} projectId={project.id} company={project.company} />

            {/* Copy Shifts Dialog */}
            <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Copy Shifts</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Copy From</Label>
                            <Select value={copySource.type} onValueChange={t => setCopySource({ ...copySource, type: t })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="block">Another Block</SelectItem>
                                    <SelectItem value="project">Another Project</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {copySource.type === 'block' ? (
                            <div>
                                <Label>Source Block</Label>
                                <Select value={copySource.blockId} onValueChange={b => setCopySource({ ...copySource, blockId: b })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {blockIds.map(b => <SelectItem key={b} value={b}>{b.replace('block', 'Block ')}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div>
                                <Label>Source Project</Label>
                                <Select value={copySource.projectId} onValueChange={p => setCopySource({ ...copySource, projectId: p })}>
                                    <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                                    <SelectContent>
                                        {allProjects.filter(p => p.id !== project.id && p.company === project.company).map(p => (
                                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <Button 
                            className="w-full mt-4" 
                            onClick={handleCopyShifts} 
                            disabled={copyShiftsMutation.isPending || copyLockRef.current || (copySource.type === 'project' && !copySource.projectId)}
                        >
                            {copyShiftsMutation.isPending || copyLockRef.current ? 'Copying...' : 'Copy Now'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Export Preview Config Hidden Logic */}
            <Dialog open={exportPreviewConfig.isOpen} onOpenChange={(_o) => setExportPreviewConfig(p => ({ ...p, isOpen: _o }))}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Export Preview</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b">
                                    <tr>{exportPreviewConfig.headers.map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {exportPreviewConfig.data.slice(0, 10).map((r, i) => (
                                        <tr key={i} className="border-b">{exportPreviewConfig.headers.map(h => <td key={h} className="p-2">{r[h]}</td>)}</tr>
                                    ))}
                                </tbody>
                            </table>
                            {exportPreviewConfig.data.length > 10 && <p className="p-2 text-center text-slate-500 text-xs">...and {exportPreviewConfig.data.length - 10} more rows</p>}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setExportPreviewConfig(p => ({ ...p, isOpen: false }))}>Cancel</Button>
                            <Button onClick={executeExportDownload}>Download Excel</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}