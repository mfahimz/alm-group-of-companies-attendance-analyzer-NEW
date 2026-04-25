import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, AlertTriangle, Search, Trash2, Edit, Plus, Calendar, Download, Eye, Copy, Sparkles, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import EditShiftDialog from './EditShiftDialog';
import TablePagination from '../ui/TablePagination';
import BulkEditShiftDialog from '../shifts/BulkEditShiftDialog';
import { Checkbox } from '@/components/ui/checkbox';
import TimePicker from '../ui/QuickTimePicker';
import RamadanShiftSection from './RamadanShiftSection';
import ExcelPreviewDialog from '@/components/ui/ExcelPreviewDialog';

export default function ShiftTimingsTab({ project }) {
     const [file, setFile] = useState(null);
     const [parsedData, setParsedData] = useState([]);
     const [warnings, setWarnings] = useState([]);
     const [searchTerm, setSearchTerm] = useState('');
     const [editingShift, setEditingShift] = useState(null);
     const [showAddForm, setShowAddForm] = useState(false);
     const [nlpText, setNlpText] = useState('');
     const [nlpParsing, setNlpParsing] = useState(false);
     const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
     const [isSingleShift, setIsSingleShift] = useState(false);
     const [departmentFilter, setDepartmentFilter] = useState('all');
     const [applicableDayFilter, setApplicableDayFilter] = useState('all');
     const [shiftTypeFilter, setShiftTypeFilter] = useState('all');
     const [selectedBlock, setSelectedBlock] = useState('block1');
     const [currentPage, setCurrentPage] = useState(1);
     const [rowsPerPage, setRowsPerPage] = useState(10);
     const [editingBlockRange, setEditingBlockRange] = useState(null);
     const [showPreviewDialog, setShowPreviewDialog] = useState(false);
     const [blockDateRanges, setBlockDateRanges] = useState(() => {
         if (!project?.date_from || !project?.date_to) {
             return { block1: { from: '', to: '' }, block2: { from: '', to: '' } };
         }
         return {
             block1: { from: project.date_from, to: project.date_to },
             block2: { from: project.date_from, to: project.date_to }
         };
     });
    const [selectedShifts, setSelectedShifts] = useState([]);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [showCopyDialog, setShowCopyDialog] = useState(false);
    const [copySource, setCopySource] = useState({ type: 'block', blockId: 'block1', projectId: '', sourceProjectBlockId: 'block1' });

    const isAstra = project.company === 'Astra Auto Parts';
    const [astraFile, setAstraFile] = useState(null);

    const [formData, setFormData] = useState({
        attendance_id: '',
        am_start: '',
        am_end: '',
        pm_start: '',
        pm_end: '',
        is_single_shift: false,
        is_friday_shift: false,
        applicable_days: []
    });

    // Export Preview State
    const [exportPreviewConfig, setExportPreviewConfig] = useState({
        isOpen: false,
        data: [],
        headers: [],
        fileName: '',
        onConfirm: () => {}
    });
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id })
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = false; // Removed - all users can now create/edit shifts

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

    // Ramadan overlap detection (lightweight, for non-Ramadan UI sections that need it)
    const ramadanSchedules = []; // Ramadan logic moved to RamadanShiftSection

    const { data: masterEmployees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    // Fetch project-specific employee overrides
    const { data: projectEmployees = [] } = useQuery({
        queryKey: ['projectEmployees', project.id],
        queryFn: () => base44.entities.ProjectEmployee.filter({ project_id: project.id })
    });

    // Combine master employees with project overrides for lookups
    // Filter out employees without attendance_id (salary-only employees)
    const employees = React.useMemo(() => {
        const combined = [...masterEmployees];
        for (const pe of projectEmployees) {
            // Only add if not already in master list
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

    // Fetch shifts from selected source project for block selection
    const { data: sourceProjectShifts = [] } = useQuery({
        queryKey: ['sourceProjectShifts', copySource.projectId],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: copySource.projectId }),
        enabled: showCopyDialog && copySource.type === 'project' && !!copySource.projectId
    });

    const { data: companySettings = [] } = useQuery({
        queryKey: ['companySettings', project.company],
        queryFn: () => base44.entities.CompanySettings.filter({ company: project.company })
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

    const handleFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            
            // Detect file type by its extension to determine parsing strategy
            const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
            
            if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                /* 
                   Excel Conversion Logic:
                   If the file is an Excel file, we use SheetJS (XLSX) to read the binary data,
                   extract the first sheet, and convert it to CSV format. This CSV string is 
                   then wrapped in a Blob and passed to the existing parseCSV logic.
                   This ensures that the parsing logic, validation, and column expectations 
                   remain identical for both file types.
                */
                const reader = new FileReader();
                reader.onload = (event) => {
                    const data = event.target.result;
                    if (data && data instanceof ArrayBuffer) {
                        const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        const csvData = XLSX.utils.sheet_to_csv(worksheet);
                        
                        // Create a blob from the CSV string to satisfy the existing parser's File/Blob requirement
                        const blob = new Blob([csvData], { type: 'text/csv' });
                        parseCSV(blob);
                    }
                };
                reader.readAsArrayBuffer(selectedFile);
            } else {
                // For standard CSV files, we use the existing parsing logic directly
                parseCSV(selectedFile);
            }
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

    const normalizeApplicableDays = (value) => {
        if (!value) return null;
        // Already a JSON array string
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return value; // already correct format
        } catch {}
        // Map known human-readable strings
        const str = String(value).trim().toLowerCase();
        if (str === 'friday') return JSON.stringify(['Friday']);
        if (str === 'monday to thursday and saturday' || str === 'mon to thu and sat')
            return JSON.stringify(['Monday','Tuesday','Wednesday','Thursday','Saturday']);
        if (str === 'monday to saturday' || str === 'mon to sat')
            return JSON.stringify(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']);
        if (str === 'monday to friday' || str === 'mon to fri')
            return JSON.stringify(['Monday','Tuesday','Wednesday','Thursday','Friday']);
        if (str === 'sunday to thursday' || str === 'sun to thu')
            return JSON.stringify(['Sunday','Monday','Tuesday','Wednesday','Thursday']);
        // Try comma-separated day names
        const dayMap = {
            'sunday':'Sunday','sun':'Sunday',
            'monday':'Monday','mon':'Monday',
            'tuesday':'Tuesday','tue':'Tuesday',
            'wednesday':'Wednesday','wed':'Wednesday',
            'thursday':'Thursday','thu':'Thursday',
            'friday':'Friday','fri':'Friday',
            'saturday':'Saturday','sat':'Saturday'
        };
        const parts = str.split(',').map(s => s.trim()).filter(Boolean);
        const mapped = parts.map(p => dayMap[p]).filter(Boolean);
        if (mapped.length > 0) return JSON.stringify(mapped);
        // Fallback: wrap raw value in array
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
                    // values[1] = Employee Name (not used)
                    // values[2] = Department (not used)
                    const am_start = normalizeTime(values[3]);
                    const am_end = normalizeTime(values[4]);
                    const pm_start = normalizeTime(values[5]);
                    const pm_end = normalizeTime(values[6]);
                    // values[7] = Weekly Off (not used, read from Employee master)
                    const shiftType = values[8] ? values[8].trim().toLowerCase() : '';
                    const is_single_shift = shiftType === 'single shift';

                    let applicableDays = values[9] ? values[9].trim() : '';
                    let applicableDaysArray = [];
                    let is_friday_shift = false;

                    if (applicableDays) {
                        applicableDays = normalizeApplicableDays(applicableDays);
                        try {
                            applicableDaysArray = JSON.parse(applicableDays);
                        } catch {
                            applicableDaysArray = [];
                        }
                        
                        // Check if it's a Friday-only shift or if Friday is in the list
                        const hasFriday = applicableDaysArray.some(day => String(day).toLowerCase() === 'friday');
                        is_friday_shift = hasFriday && applicableDaysArray.length === 1;
                    } else {
                        // Default: empty applicable days
                        applicableDays = '';
                    }

                    const employeeExists = employees.some(e => String(e.attendance_id) === String(attendance_id));
                    const isProjectOverride = projectEmployees.some(pe => String(pe.attendance_id) === String(attendance_id));
                    if (!employeeExists && !isProjectOverride) {
                        newWarnings.push(`Unknown employee: ${attendance_id} (add via Employee Overrides)`);
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

    const astraUploadMutation = useMutation({
        mutationFn: async () => {
            if (!astraFile || !selectedBlock) throw new Error("Missing file or block");
            return new Promise((resolve, reject) => {
                const fileExtension = astraFile.name.split('.').pop().toLowerCase();
                
                const processCSVText = async (text) => {
                    try {
                        const lines = text.split('\n').filter(line => line.trim());
                        const blockRange = blockDateRanges[selectedBlock];
                        let count = 0;
                        for (let i = 1; i < lines.length; i++) {
                            const values = lines[i].split(',').map(v => v.trim());
                            if (values.length >= 9) {
                                const attendance_id = String(values[0]);
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
                                    let daysArray = [];
                                    try { daysArray = JSON.parse(applicableDays); } catch {}
                                    is_friday_shift = daysArray.some(d => String(d).toLowerCase() === 'friday') && daysArray.length === 1;
                                }

                                await base44.entities.ShiftTiming.create({
                                    project_id: project.id,
                                    attendance_id,
                                    date: null,
                                    is_friday_shift,
                                    is_single_shift,
                                    applicable_days: applicableDays,
                                    am_start,
                                    am_end,
                                    pm_start,
                                    pm_end,
                                    effective_from: blockRange.from,
                                    effective_to: blockRange.to,
                                    shift_block: selectedBlock
                                });
                                count++;
                            }
                        }
                        resolve(count);
                    } catch (err) {
                        reject(err);
                    }
                };

                const reader = new FileReader();
                reader.onload = async (e) => {
                    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                        try {
                            const data = e.target.result;
                            const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });
                            const firstSheetName = workbook.SheetNames[0];
                            const worksheet = workbook.Sheets[firstSheetName];
                            const csvData = XLSX.utils.sheet_to_csv(worksheet);
                            await processCSVText(csvData);
                        } catch (err) {
                            reject(new Error("Failed to parse Excel file"));
                        }
                    } else {
                        await processCSVText(e.target.result);
                    }
                };
                reader.onerror = () => reject(new Error("Failed to read file"));
                
                if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                    reader.readAsArrayBuffer(astraFile);
                } else {
                    reader.readAsText(astraFile);
                }
            });
        },
        onSuccess: (count) => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success(`Successfully uploaded ${count} shift timings for Astra Auto Parts`);
            setAstraFile(null);
            const fileInput = document.getElementById('astra-shift-file');
            if (fileInput) fileInput.value = '';
        },
        onError: (err) => {
            toast.error('Failed to upload shift timings: ' + err.message);
        }
    });

    const uploadMutation = useMutation({
        mutationFn: async () => {
            const blockRange = blockDateRanges[selectedBlock];
            const shiftRecords = parsedData.map(s => ({
                project_id: project.id,
                attendance_id: String(s.attendance_id),
                date: s.date,
                is_friday_shift: s.is_friday_shift,
                is_single_shift: s.is_single_shift || false,
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
            for (const shift of blockShifts) {
                await base44.entities.ShiftTiming.update(shift.id, {
                    attendance_id: String(shift.attendance_id),
                    effective_from: newRange.from,
                    effective_to: newRange.to,
                    shift_block: block
                });
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
        mutationFn: async ({ sourceType, sourceBlockId, sourceProjectId, sourceProjectBlockId, targetBlockId }) => {
            let sourceShifts = [];
            
            if (sourceType === 'block') {
                // Copy from another block in the same project (including legacy shifts)
                const sourceBlockRange = blockDateRanges[sourceBlockId];
                sourceShifts = shifts.filter(s => {
                    if (s.shift_block === sourceBlockId) return true;
                    
                    // For legacy shifts without shift_block, check date ranges
                    if (!s.shift_block && s.effective_from && s.effective_to && sourceBlockRange) {
                        if (s.effective_from === sourceBlockRange.from && s.effective_to === sourceBlockRange.to) {
                            return true;
                        }
                    }
                    return false;
                });
            } else if (sourceType === 'project') {
                // Copy from another project's specific block (including legacy shifts)
                const otherProjectShifts = await base44.entities.ShiftTiming.filter({ project_id: sourceProjectId });
                
                // Get source project to determine block ranges
                const sourceProj = await base44.entities.Project.filter({ id: sourceProjectId });
                let sourceBlockRanges = {};
                try {
                    sourceBlockRanges = sourceProj[0]?.shift_block_ranges ? JSON.parse(sourceProj[0].shift_block_ranges) : {};
                } catch (e) {
                    sourceBlockRanges = {};
                }
                
                const sourceBlockRange = sourceBlockRanges[sourceProjectBlockId] || { 
                    from: sourceProj[0]?.date_from, 
                    to: sourceProj[0]?.date_to 
                };
                
                sourceShifts = otherProjectShifts.filter(s => {
                    if (s.shift_block === sourceProjectBlockId) return true;
                    
                    // For legacy shifts without shift_block, check date ranges
                    if (!s.shift_block && s.effective_from && s.effective_to && sourceBlockRange) {
                        if (s.effective_from === sourceBlockRange.from && s.effective_to === sourceBlockRange.to) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            
            if (sourceShifts.length === 0) {
                throw new Error('No shifts found in source block');
            }
            
            const targetRange = blockDateRanges[targetBlockId];
            const newShifts = sourceShifts.map(shift => ({
                project_id: project.id,
                attendance_id: String(shift.attendance_id),
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

    const handleNlpParse = async () => {
        if (!nlpText.trim()) {
            toast.error('Please enter some text to parse');
            return;
        }

        setNlpParsing(true);
        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Parse this shift request into structured data. Return ONLY valid JSON, no other text.

Available employees: ${employees.map(e => `${e.attendance_id} (${e.name})`).join(', ')}

User request: "${nlpText}"

Return JSON:
{
"attendance_id": "employee ID from list above — match by name or ID. If user says 'all' or references everyone, return 'ALL'",
"am_start": "HH:MM AM/PM (e.g., 8:00 AM)",
"am_end": "HH:MM AM/PM (e.g., 12:00 PM)",
"pm_start": "HH:MM AM/PM (e.g., 1:00 PM)",
"pm_end": "HH:MM AM/PM (e.g., 5:00 PM)",
"is_single_shift": boolean — true if user says 'single shift', 'punch in/out only', or only gives 2 times,
"is_friday_shift": boolean — true if user says 'friday shift' or 'friday only',
"applicable_days": array of full day names e.g. ["Monday","Tuesday","Wednesday","Thursday","Friday"] — null or [] means all working days
}

Rules:

If single shift, set am_start = check-in time, pm_end = check-out time, leave am_end and pm_start empty.

For applicable_days, detect: "Monday to Friday" = Mon-Fri array, "weekdays" = Mon-Fri, "Sunday to Thursday" = Sun-Thu array, "all days" or "all working days" = empty array, specific day names listed.

Match employee names loosely (e.g. "Ali" matches "Ali Hassan", "Ahmed" matches first Ahmed found).

Time formats accepted: "8am", "8:00am", "8:00 AM", "08:00" — always return as "H:MM AM/PM".`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        attendance_id: { type: "string" }, // employee ID or "ALL"
                        am_start: { type: "string" },
                        am_end: { type: "string" },
                        pm_start: { type: "string" },
                        pm_end: { type: "string" },
                        is_single_shift: { type: "boolean" },
                        is_friday_shift: { type: "boolean" },
                        applicable_days: { type: "array", items: { type: "string" } }
                    },
                    required: ["attendance_id"]
                }
            });

            const parsed = response;

            if (parsed.attendance_id === 'ALL') {
                // Bulk: create one record per employee with the same times
                const toastId = toast.loading(`Creating shift for all ${employees.length} employees...`);
                const blockRange = blockDateRanges[selectedBlock];
                const records = employees.map(emp => ({
                    project_id: project.id,
                    attendance_id: String(emp.attendance_id),
                    date: null,
                    is_friday_shift: parsed.is_friday_shift || false,
                    is_single_shift: parsed.is_single_shift || false,
                    applicable_days: parsed.applicable_days?.length ? JSON.stringify(parsed.applicable_days) : '',
                    am_start: parsed.am_start || '',
                    am_end: parsed.am_end || '',
                    pm_start: parsed.pm_start || '',
                    pm_end: parsed.pm_end || '',
                    effective_from: blockRange.from,
                    effective_to: blockRange.to,
                    shift_block: selectedBlock
                }));
                try {
                    const batchSize = 50;
                    for (let i = 0; i < records.length; i += batchSize) {
                        await base44.entities.ShiftTiming.bulkCreate(records.slice(i, i + batchSize));
                    }
                    queryClient.invalidateQueries(['shifts', project.id]);
                    toast.dismiss(toastId);
                    toast.success(`Shift created for all ${records.length} employees`);
                    setNlpText('');
                } catch (err) {
                    toast.dismiss(toastId);
                    toast.error('Bulk create failed: ' + err.message);
                }
                setNlpParsing(false);
                return;
            }
            
            // Pre-fill the form
            setFormData({
                attendance_id: parsed.attendance_id || '',
                am_start: parsed.am_start || '',
                am_end: parsed.am_end || '',
                pm_start: parsed.pm_start || '',
                pm_end: parsed.pm_end || '',
                is_single_shift: parsed.is_single_shift || false,
                is_friday_shift: parsed.is_friday_shift || false,
                applicable_days: parsed.applicable_days || []
            });

            setNlpText('');
            toast.success('Form filled from your description! Review and submit.');
        } catch (error) {
            console.error('NLP parsing error:', error);
            toast.error('Failed to parse: ' + (error.message || 'Unknown error'));
        } finally {
            setNlpParsing(false);
        }
    };

    const createShiftMutation = useMutation({
        mutationFn: (data) => base44.entities.ShiftTiming.create({
            ...data,
            attendance_id: String(data.attendance_id),
            project_id: project.id,
            shift_block: selectedBlock,
            effective_from: blockDateRanges[selectedBlock].from,
            effective_to: blockDateRanges[selectedBlock].to,
            applicable_days: data.applicable_days && data.applicable_days.length > 0 
                ? JSON.stringify(data.applicable_days) 
                : null
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
                is_friday_shift: false,
                applicable_days: []
            });
            setNlpText('');
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
        if (!formData.applicable_days || formData.applicable_days.length === 0) {
            toast.error('Please select applicable days');
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
            const data = shifts.map(shift => {
                const employee = employees.find(e => String(e.attendance_id) === String(shift.attendance_id));
                return {
                    'Attendance ID': shift.attendance_id,
                    'Employee Name': employee?.name || '-',
                    'Department': employee?.department || '-',
                    'AM Start': shift.am_start || '-',
                    'AM End': shift.am_end || '-',
                    'PM Start': shift.pm_start || '-',
                    'PM End': shift.pm_end || '-',
                    'Weekly Off': employee?.weekly_off || 'Sunday',
                    'Shift Type': shift.is_single_shift ? 'Single Shift' : 'Regular',
                    'Applicable Days': shift.applicable_days ? 
                        ((() => {
                            try {
                                const daysArray = JSON.parse(shift.applicable_days);
                                return Array.isArray(daysArray) ? daysArray.join(', ') : shift.applicable_days;
                            } catch { return shift.applicable_days; }
                        })()) : 
                        (shift.date ? new Date(shift.date).toLocaleDateString('en-GB') : '')
                };
            });

            setExportPreviewConfig({
                isOpen: true,
                data: data,
                headers: ['Attendance ID', 'Employee Name', 'Department', 'AM Start', 'AM End', 'PM Start', 'PM End', 'Weekly Off', 'Shift Type', 'Applicable Days'],
                fileName: `${project.name}_shift_timings.xlsx`,
                onConfirm: executeExportDownload
            });
        } catch (error) {
            toast.error('Failed to prepare export');
            console.error(error);
        }
    };

    const executeExportDownload = async () => {
        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
            const worksheet = XLSX.utils.json_to_sheet(exportPreviewConfig.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Shift Timings');
            XLSX.writeFile(workbook, exportPreviewConfig.fileName);
            toast.success('Excel file downloaded');
            setExportPreviewConfig(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
            toast.error('Download failed');
            console.error(error);
        }
    };



    const exportBlockShiftsToCSV = async (blockId, blockShifts) => {
        if (blockShifts.length === 0) {
            toast.error('No shifts in this block to export');
            return;
        }

        try {
            const data = blockShifts.map(shift => {
                const employee = employees.find(e => String(e.attendance_id) === String(shift.attendance_id));
                return {
                    'Attendance ID': shift.attendance_id,
                    'Employee Name': employee?.name || '-',
                    'Department': employee?.department || '-',
                    'AM Start': shift.am_start || '-',
                    'AM End': shift.am_end || '-',
                    'PM Start': shift.pm_start || '-',
                    'PM End': shift.pm_end || '-',
                    'Weekly Off': employee?.weekly_off || 'Sunday',
                    'Shift Type': shift.is_single_shift ? 'Single Shift' : 'Regular',
                    'Applicable Days': shift.applicable_days ? 
                        ((() => {
                            try {
                                const daysArray = JSON.parse(shift.applicable_days);
                                return Array.isArray(daysArray) ? daysArray.join(', ') : shift.applicable_days;
                            } catch { return shift.applicable_days; }
                        })()) : 
                        (shift.date ? new Date(shift.date).toLocaleDateString('en-GB') : '')
                };
            });

            setExportPreviewConfig({
                isOpen: true,
                data: data,
                headers: ['Attendance ID', 'Employee Name', 'Department', 'AM Start', 'AM End', 'PM Start', 'PM End', 'Weekly Off', 'Shift Type', 'Applicable Days'],
                fileName: `${project.name}_${blockId}_shifts.xlsx`,
                onConfirm: async () => {
                    try {
                        const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
                        const worksheet = XLSX.utils.json_to_sheet(data);
                        const workbook = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(workbook, worksheet, blockId.replace('block', 'Block '));
                        XLSX.writeFile(workbook, `${project.name}_${blockId}_shifts.xlsx`);
                        toast.success(`${blockId.replace('block', 'Block ')} shifts exported to Excel`);
                        setExportPreviewConfig(prev => ({ ...prev, isOpen: false }));
                    } catch (error) {
                        toast.error('Download failed');
                    }
                }
            });
        } catch (error) {
            toast.error('Failed to prepare export');
        }
    };

    const renderShiftBlock = (blockId, blockShifts, blockLabel) => {
        // Find duplicate shifts in this block
        const findDuplicateShifts = (shifts) => {
            const duplicates = [];
            const seen = new Map();
            
            shifts.forEach(shift => {
                const key = `${shift.attendance_id}_${shift.am_start}_${shift.am_end}_${shift.pm_start}_${shift.pm_end}_${shift.is_friday_shift}_${shift.applicable_days}`;
                
                if (seen.has(key)) {
                    // Found a duplicate - add both the original and this one
                    const originalShift = seen.get(key);
                    if (!duplicates.some(d => d.id === originalShift.id)) {
                        duplicates.push(originalShift);
                    }
                    duplicates.push(shift);
                } else {
                    seen.set(key, shift);
                }
            });
            
            if (import.meta.env.DEV) {
                console.log(`Duplicate check for ${blockLabel}: Found ${duplicates.length} duplicates out of ${shifts.length} shifts`);
            }
            return duplicates;
        };
        const blockRange = blockDateRanges[blockId] || { from: project.date_from, to: project.date_to };
        
        const filteredShifts = blockShifts
            .filter(shift => {
                const employee = employees.find(e => String(e.attendance_id) === String(shift.attendance_id));
                const matchesSearch = !searchTerm || 
                    String(shift.attendance_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
                    employee?.name.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesDept = departmentFilter === 'all' || employee?.department === departmentFilter;
                const matchesShiftType = shiftTypeFilter === 'all' || 
                    (shiftTypeFilter === 'single' && shift.is_single_shift) ||
                    (shiftTypeFilter === 'regular' && !shift.is_single_shift);
                
                // Filter by applicable day
                let matchesDay = true;
                if (applicableDayFilter !== 'all') {
                    matchesDay = false; // Default to false when filtering
                    
                    // Special case for Friday - check is_friday_shift flag
                    if (applicableDayFilter.toLowerCase() === 'friday' && shift.is_friday_shift) {
                        matchesDay = true;
                    }
                    
                    // Check applicable_days array
                    if (shift.applicable_days) {
                        try {
                            const daysArray = JSON.parse(shift.applicable_days);
                            if (Array.isArray(daysArray) && daysArray.length > 0) {
                                matchesDay = daysArray.some(day => day.toLowerCase() === applicableDayFilter.toLowerCase());
                            }
                        } catch {
                            // If parsing fails, check if it's a string match
                            if (shift.applicable_days.toLowerCase().includes(applicableDayFilter.toLowerCase())) {
                                matchesDay = true;
                            }
                        }
                    } else {
                        // No applicable_days means all days - should match any filter
                        matchesDay = true;
                    }
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

        const paginatedShifts = filteredShifts.slice(
            (currentPage - 1) * rowsPerPage,
            currentPage * rowsPerPage
        );

        return (
            <Card className="border-0 shadow-sm bg-white rounded-xl ring-1 ring-slate-200/80">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-lg">
                                <Calendar className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <CardTitle className="text-base font-semibold text-slate-900">{blockLabel}</CardTitle>
                                {editingBlockRange === blockId ? (
                                    <div className="flex gap-2 mt-2">
                                        <Input
                                            type="date"
                                            value={blockDateRanges[blockId]?.from || ''}
                                            onChange={(e) => {
                                                setBlockDateRanges(prev => ({
                                                    ...prev,
                                                    [blockId]: { ...prev[blockId], from: e.target.value }
                                                }));
                                            }}
                                            min={project.date_from}
                                            max={project.date_to}
                                            className="w-40 border-slate-200 focus:ring-indigo-100"
                                        />
                                        <Input
                                            type="date"
                                            value={blockDateRanges[blockId]?.to || ''}
                                            onChange={(e) => {
                                                setBlockDateRanges(prev => ({
                                                    ...prev,
                                                    [blockId]: { ...prev[blockId], to: e.target.value }
                                                }));
                                            }}
                                            min={blockDateRanges[blockId]?.from || project.date_from}
                                            max={project.date_to}
                                            className="w-40 border-slate-200 focus:ring-indigo-100"
                                        />
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                let oldRange = null;
                                                const firstShift = shifts.find(s => s.shift_block === blockId);
                                                if (firstShift) {
                                                    oldRange = { from: firstShift.effective_from, to: firstShift.effective_to };
                                                } else {
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
                                            className="bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            Save
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setEditingBlockRange(null);
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
                                    onClick={() => {
                                        setCopySource({ ...copySource, type: 'block', targetBlockId: blockId });
                                        setShowCopyDialog(true);
                                    }}
                                    className="border-slate-200 hover:bg-slate-50 transition-all"
                                >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy Shifts
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditingBlockRange(blockId)}
                                    className="border-slate-200 hover:bg-slate-50 transition-all"
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
                                            className="border-slate-200 hover:bg-slate-50 transition-all"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Export
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100 transition-all"
                                            onClick={() => {
                                                if (window.confirm(`Delete all ${blockShifts.length} shifts from ${blockLabel}?`)) {
                                                    deleteBlockShiftsMutation.mutate(blockId);
                                                }
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete All
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        {blockShifts.length === 0 ? (
                            <div className="text-center py-12 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                <p className="text-slate-400 font-medium">No shifts uploaded to this block yet</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-2">
                                    <div className="relative flex-1 max-w-sm">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <Input
                                            placeholder="Search by ID or Name..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 h-10 border-slate-200 focus:ring-indigo-100 transition-all rounded-lg"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {selectedShifts.length > 0 && (
                                            <Button
                                                size="sm"
                                                onClick={() => setShowBulkEdit(true)}
                                                className="bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm"
                                            >
                                                <Edit className="w-4 h-4 mr-2" />
                                                Bulk Edit ({selectedShifts.length})
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                const duplicates = findDuplicateShifts(blockShifts);
                                                if (duplicates.length === 0) {
                                                    toast.info('No duplicate shifts found');
                                                } else {
                                                    setSearchTerm('');
                                                    setSelectedShifts(duplicates);
                                                    toast.success(`Found ${duplicates.length} duplicate shifts selected`);
                                                }
                                            }}
                                            className="text-amber-700 border-amber-200 hover:bg-amber-50"
                                        >
                                            <Search className="w-4 h-4 mr-2" />
                                            Find Duplicates
                                        </Button>
                                        <Select value={departmentFilter || undefined} onValueChange={setDepartmentFilter}>
                                            <SelectTrigger className="border-slate-200 focus:ring-indigo-100 w-[160px]">
                                                <SelectValue placeholder="Department" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Departments</SelectItem>
                                                {companySettings[0]?.departments?.split(',').map(dept => dept.trim()).filter(dept => dept !== '').map(dept => (
                                                    <SelectItem key={dept} value={dept || 'unknown'}>{dept}</SelectItem>
                                                )) || [
                                                    <SelectItem key="Admin" value="Admin">Admin</SelectItem>,
                                                    <SelectItem key="Operations" value="Operations">Operations</SelectItem>
                                                ]}
                                            </SelectContent>
                                        </Select>
                                        <Select value={shiftTypeFilter || undefined} onValueChange={setShiftTypeFilter}>
                                            <SelectTrigger className="border-slate-200 focus:ring-indigo-100 w-[140px]">
                                                <SelectValue placeholder="Shift Type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Types</SelectItem>
                                                <SelectItem value="regular">Regular</SelectItem>
                                                <SelectItem value="single">Single Shift</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Select value={applicableDayFilter || undefined} onValueChange={setApplicableDayFilter}>
                                            <SelectTrigger className="border-slate-200 focus:ring-indigo-100 w-[130px]">
                                                <SelectValue placeholder="Day" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Days</SelectItem>
                                                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                                    <SelectItem key={day} value={day}>{day}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="border rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-200/60 bg-white">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader className="bg-slate-50/90 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200/60">
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="w-12 px-4 text-center">
                                                        <Checkbox
                                                            checked={selectedShifts.length === paginatedShifts.length && paginatedShifts.length > 0}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    setSelectedShifts(paginatedShifts);
                                                                } else {
                                                                    setSelectedShifts([]);
                                                                }
                                                            }}
                                                            className="border-slate-300 data-[state=checked]:bg-indigo-600"
                                                        />
                                                    </TableHead>
                                                    <TableHead className="w-24">ID</TableHead>
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
                                                    <TableHead className="text-right px-6">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paginatedShifts.map((shift) => {
                                                    const employee = employees.find(e => String(e.attendance_id) === String(shift.attendance_id));
                                                    return (
                                                        <TableRow key={shift.id} className="hover:bg-slate-50/80 transition-colors duration-200 border-b border-slate-100 last:border-0 text-slate-700">
                                                            <TableCell className="px-4 text-center">
                                                                <Checkbox
                                                                    checked={selectedShifts.some(s => s.id === shift.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        if (checked) {
                                                                            setSelectedShifts([...selectedShifts, shift]);
                                                                        } else {
                                                                            setSelectedShifts(selectedShifts.filter(s => s.id !== shift.id));
                                                                        }
                                                                    }}
                                                                    className="border-slate-300"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-xs text-slate-400 font-mono">
                                                                {shift.id.substring(0, 8)}
                                                            </TableCell>
                                                            <TableCell className="font-medium text-slate-900">{shift.attendance_id}</TableCell>
                                                            <TableCell>{employee?.name || '-'}</TableCell>
                                                            <TableCell>
                                                                <span className="text-slate-500">{employee?.department || '-'}</span>
                                                            </TableCell>
                                                            {project.company === 'Naser Mohsin Auto Parts' && (
                                                                <TableCell>
                                                                    <span className="text-slate-500">{employee?.weekly_off || 'Sunday'}</span>
                                                                </TableCell>
                                                            )}
                                                            <TableCell>
                                                                {shift.applicable_days?.includes('Ramadan') ? (
                                                                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                                                                        {shift.applicable_days.replace('Ramadan ', '')}
                                                                    </span>
                                                                ) : shift.is_single_shift ? (
                                                                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-100 font-medium">Single</span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-100 font-medium">Regular</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col text-xs">
                                                                    {shift.is_single_shift ? (
                                                                        <span className="font-medium">{formatTime(shift.am_start)} → {formatTime(shift.pm_end)}</span>
                                                                    ) : (
                                                                        <span className="font-medium">{formatTime(shift.am_start)}-{formatTime(shift.am_end)} / {formatTime(shift.pm_start)}-{formatTime(shift.pm_end)}</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {(() => {
                                                                        if (shift.date) return <span className="text-slate-600">{new Date(shift.date).toLocaleDateString('en-GB')}</span>;
                                                                        if (!shift.applicable_days) return <span className="text-slate-400">All Working Days</span>;
                                                                        try {
                                                                            const days = JSON.parse(shift.applicable_days);
                                                                            if (Array.isArray(days)) return days.map(d => (
                                                                                <span key={d} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] uppercase tracking-wider">{d.substring(0, 3)}</span>
                                                                            ));
                                                                        } catch { }
                                                                        return <span className="text-slate-600">{shift.applicable_days}</span>;
                                                                    })()}
                                                                    {shift.is_friday_shift && (
                                                                        <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded text-[10px] uppercase tracking-wider font-semibold">FRI</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right px-6">
                                                                <div className="flex gap-1 justify-end">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => setEditingShift(shift)}
                                                                        className="h-8 w-8 p-0 hover:bg-indigo-50 hover:text-indigo-600"
                                                                    >
                                                                        <Edit className="w-4 h-4" />
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => {
                                                                            if (window.confirm('Delete this shift record?')) {
                                                                                deleteMutation.mutate(shift.id);
                                                                            }
                                                                        }}
                                                                        className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
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
            {/* Ramadan Shift Override Section */}
            <RamadanShiftSection project={project} shifts={shifts} employees={employees} />

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

            {/* Add Shift Dialog */}
            <Dialog open={showAddForm} onOpenChange={(open) => { if (!open) setShowAddForm(false); }}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Add Shift Timing</DialogTitle>
                    </DialogHeader>
                        <form onSubmit={handleSubmitShift} className="space-y-4">
                            {/* Block Selector */}
                            {(project.shiftblockscount || 1) > 1 && (
                            <div>
                                <Label>Add to Block *</Label>
                                <Select value={selectedBlock || undefined} onValueChange={setSelectedBlock}>
                                    <SelectTrigger className="border-slate-200 focus:ring-indigo-100 mt-1">
                                        <SelectValue placeholder="Select block" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: project.shiftblockscount || 1 }, (_, i) => {
                                            const blockId = `block${i + 1}`;
                                            const range = blockDateRanges[blockId];
                                            return (
                                                <SelectItem key={blockId} value={blockId}>
                                                    Block {i + 1}{range ? ` (${new Date(range.from).toLocaleDateString('en-GB')} – ${new Date(range.to).toLocaleDateString('en-GB')})` : ''}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                            )}
                            {/* Quick Entry with NLP */}
                            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="w-4 h-4 text-indigo-600" />
                                    <Label className="font-medium text-indigo-900">Quick Entry (Optional)</Label>
                                    <div className="relative group inline-flex items-center">
                                        <Info className="w-3.5 h-3.5 text-indigo-400 cursor-help" />
                                        <div className="absolute left-5 top-0 z-50 hidden group-hover:block w-72 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl leading-relaxed">
                                            <p className="font-semibold mb-1.5 text-indigo-300">Supported phrases:</p>
                                            <ul className="space-y-1 text-slate-200">
                                                <li>-  <span className="text-white font-medium">Ali 8am to 5pm single shift</span></li>
                                                <li>-  <span className="text-white font-medium">Ahmed 8am-12pm 1pm-5pm</span></li>
                                                <li>-  <span className="text-white font-medium">All employees 8am-5pm single shift</span></li>
                                                <li>-  <span className="text-white font-medium">John 9am-1pm 2pm-6pm Sunday to Thursday</span></li>
                                                <li>-  <span className="text-white font-medium">Sara 8am-12pm Friday only</span></li>
                                            </ul>
                                            <p className="mt-2 text-slate-400 text-xs">Employee names are matched loosely. Times like "8am", "8:00 AM", or "08:00" all work.</p>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-600 mb-3">
                                    Describe in natural language and we'll fill the form below
                                </p>
                                <div className="flex gap-2">
                                    <Input className="border-slate-200 focus:ring-indigo-100"
                                        placeholder="e.g., Ali 8am to 5pm single shift"
                                        value={nlpText}
                                        onChange={(e) => setNlpText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !nlpParsing) {
                                                e.preventDefault();
                                                handleNlpParse();
                                            }
                                        }}
                                        disabled={nlpParsing}
                                        className="flex-1"
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleNlpParse}
                                        disabled={nlpParsing || !nlpText.trim()}
                                        size="sm"
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        {nlpParsing ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                                Parsing...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                Fill Form
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div>
                                <Label>Employee *</Label>
                                <Select
                                    value={formData.attendance_id || undefined}
                                    onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                                >
                                    <SelectTrigger className="border-slate-200 focus:ring-indigo-100">
                                        <SelectValue placeholder="Select employee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees
                                            .filter(emp => emp.attendance_id && String(emp.attendance_id).trim() !== '')
                                            .map(emp => (
                                                <SelectItem key={emp.id} value={String(emp.attendance_id)}>
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
                                        <Label>Shift 1 In *</Label>
                                        <TimePicker
                                            placeholder="8:00 AM"
                                            value={formData.am_start}
                                            onChange={(value) => setFormData({ ...formData, am_start: value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Shift 1 Out *</Label>
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
                                        <Label>Shift 1 In *</Label>
                                        <TimePicker
                                            placeholder="8:00 AM"
                                            value={formData.am_start}
                                            onChange={(value) => setFormData({ ...formData, am_start: value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Shift 1 Out</Label>
                                        <TimePicker
                                            placeholder="12:00 PM"
                                            value={formData.am_end}
                                            onChange={(value) => setFormData({ ...formData, am_end: value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Shift 2 In</Label>
                                        <TimePicker
                                            placeholder="1:00 PM"
                                            value={formData.pm_start}
                                            onChange={(value) => setFormData({ ...formData, pm_start: value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Shift 2 Out *</Label>
                                        <TimePicker
                                            placeholder="5:00 PM"
                                            value={formData.pm_end}
                                            onChange={(value) => setFormData({ ...formData, pm_end: value })}
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <Label>Applicable Days *</Label>
                                {project?.company === 'Naser Mohsin Auto Parts' ? (
                                    <div className="grid grid-cols-4 gap-2">
                                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                            <div key={day} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`day-${day}`}
                                                    checked={formData.applicable_days.includes(day)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setFormData({ 
                                                                ...formData, 
                                                                applicable_days: [...formData.applicable_days, day]
                                                            });
                                                        } else {
                                                            setFormData({ 
                                                                ...formData, 
                                                                applicable_days: formData.applicable_days.filter(d => d !== day)
                                                            });
                                                        }
                                                    }}
                                                />
                                                <Label htmlFor={`day-${day}`} className="cursor-pointer text-sm">{day.substring(0, 3)}</Label>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Select 
                                        value={formData.applicable_days.length > 0 ? JSON.stringify(formData.applicable_days) : ""} 
                                        onValueChange={(val) => setFormData({ ...formData, applicable_days: JSON.parse(val) })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select working days" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={JSON.stringify(["Monday","Tuesday","Wednesday","Thursday","Saturday"])}>Monday to Thursday and Saturday</SelectItem>
                                            <SelectItem value={JSON.stringify(["Friday"])}>Friday</SelectItem>
                                            <SelectItem value={JSON.stringify(["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"])}>Monday to Saturday</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                                {formData.applicable_days.length > 0 && (
                                    <p className="text-xs text-green-600 mt-2">
                                        ✓ Shift applies to: {formData.applicable_days.join(', ')}
                                    </p>
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
                </DialogContent>
            </Dialog>



            {/* Upload Section */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                                <Button
                                    onClick={() => setShowAddForm(true)}
                                    size="sm"
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Shift
                                </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Select Block to Upload To *</Label>
                        <Select value={selectedBlock || undefined} onValueChange={setSelectedBlock}>
                            <SelectTrigger className="border-slate-200 focus:ring-indigo-100 mt-2">
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

                    {isAstra ? (
                        <div className="space-y-3">
                            <Label>Upload Astra Shift Timings *</Label>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                <div className="flex-1 w-full">
                                    <Input
                                        id="astra-shift-file"
                                        type="file"
                                        accept=".csv,.xlsx,.xls,.txt"
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                                setAstraFile(file);
                                            } else {
                                                setAstraFile(null);
                                                e.target.value = '';
                                            }
                                        }}
                                        className="cursor-pointer"
                                    />
                                    {astraFile && (
                                        <p className="text-sm text-slate-600 mt-2">
                                            Selected file: <span className="font-medium">{astraFile.name}</span>
                                        </p>
                                    )}
                                </div>
                                <Button 
                                    onClick={() => astraUploadMutation.mutate()} 
                                    disabled={!astraFile || !selectedBlock || astraUploadMutation.isPending}
                                    className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"
                                >
                                    {astraUploadMutation.isPending ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-4 h-4 mr-2" />
                                            Upload Shifts
                                        </>
                                    )}
                                </Button>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Shifts will be uploaded to {selectedBlock === 'block1' ? 'Block 1' : 'Block 2'} with date range {new Date(blockDateRanges[selectedBlock].from).toLocaleDateString('en-GB')} - {new Date(blockDateRanges[selectedBlock].to).toLocaleDateString('en-GB')}
                            </p>
                        </div>
                    ) : (
                        <div>
                            <Label>Upload Shift Timings CSV *</Label>
                            <div className="mt-2">
                                <Input
                                    type="file"
                                    accept=".csv, .xlsx, .xls"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    id="shift-file-upload"
                                />
                            </div>
                            <p className="text-sm text-slate-500 mt-2">
                                CSV format: Attendance ID, Employee Name, Department, AM Start, AM End, PM Start, PM End, Weekly Off, Shift Type, Applicable Days
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                                Shift Type: "Regular" or "Single Shift" | Applicable Days: comma-separated (e.g., "Monday, Tuesday, Friday")
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                                Shifts will be uploaded to {selectedBlock === 'block1' ? 'Block 1' : 'Block 2'} with date range {new Date(blockDateRanges[selectedBlock].from).toLocaleDateString('en-GB')} - {new Date(blockDateRanges[selectedBlock].to).toLocaleDateString('en-GB')}
                            </p>
                        </div>
                    )}

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

                        <div className="border rounded-lg overflow-x-auto">
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
                                        const employee = employees.find(e => Number(e.attendance_id) === Number(row.attendance_id));
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
                                value={copySource.type || undefined}
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
                                    value={copySource.blockId || undefined}
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
                            <>
                                <div>
                                    <Label>Source Project</Label>
                                    <Select
                                        value={copySource.projectId || undefined}
                                        onValueChange={(value) => setCopySource({ ...copySource, projectId: value, sourceProjectBlockId: 'block1' })}
                                    >
                                        <SelectTrigger className="mt-2">
                                            <SelectValue placeholder="Select project..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allProjects
                                                .filter(p => p.id !== project.id && p.company === project.company)
                                                .map(p => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        {p.name} ({new Date(p.date_from).toLocaleDateString('en-GB')} - {new Date(p.date_to).toLocaleDateString('en-GB')})
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {copySource.projectId && (
                                    <div>
                                        <Label>Source Block</Label>
                                        <Select
                                            value={copySource.sourceProjectBlockId || undefined}
                                            onValueChange={(value) => setCopySource({ ...copySource, sourceProjectBlockId: value })}
                                        >
                                            <SelectTrigger className="mt-2">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {(() => {
                                                    const sourceProj = allProjects.find(p => p.id === copySource.projectId);
                                                    const sourceBlocksCount = sourceProj?.shift_blocks_count || 2;
                                                    let sourceBlockRanges = {};
                                                    
                                                    try {
                                                        sourceBlockRanges = sourceProj?.shift_block_ranges ? JSON.parse(sourceProj.shift_block_ranges) : {};
                                                    } catch (e) {
                                                        sourceBlockRanges = {};
                                                    }

                                                    return Array.from({ length: sourceBlocksCount }, (_, i) => i + 1).map(num => {
                                                        const blockId = `block${num}`;
                                                        const range = sourceBlockRanges[blockId] || { from: sourceProj?.date_from, to: sourceProj?.date_to };
                                                        
                                                        // Count shifts in this block (including legacy shifts without shift_block field)
                                                        const count = sourceProjectShifts.filter(s => {
                                                            if (s.shift_block === blockId) return true;
                                                            
                                                            // For legacy shifts without shift_block, check date ranges
                                                            if (!s.shift_block && s.effective_from && s.effective_to && range) {
                                                                if (s.effective_from === range.from && s.effective_to === range.to) {
                                                                    return true;
                                                                }
                                                            }
                                                            return false;
                                                        }).length;
                                                        
                                                        return (
                                                            <SelectItem key={blockId} value={blockId}>
                                                                Block {num} ({count} shifts) - {range?.from ? new Date(range.from).toLocaleDateString('en-GB') : 'N/A'} to {range?.to ? new Date(range.to).toLocaleDateString('en-GB') : 'N/A'}
                                                            </SelectItem>
                                                        );
                                                    });
                                                })()}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                            </>
                        )}

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-sm text-amber-800">
                                ⚠️ This will copy all shifts from the source to {copySource.targetBlockId === 'block1' ? 'Block 1' : 'Block 2'} with the current date range.
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" className="hover:bg-slate-50 transition-all duration-200" onClick={() => setShowCopyDialog(false)}>Cancel</Button>
                        <Button
                            onClick={() => copyShiftsMutation.mutate({
                                sourceType: copySource.type,
                                sourceBlockId: copySource.blockId,
                                sourceProjectId: copySource.projectId,
                                sourceProjectBlockId: copySource.sourceProjectBlockId,
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
            <ExcelPreviewDialog
                isOpen={exportPreviewConfig.isOpen}
                onClose={() => setExportPreviewConfig(prev => ({ ...prev, isOpen: false }))}
                data={exportPreviewConfig.data}
                headers={exportPreviewConfig.headers}
                fileName={exportPreviewConfig.fileName}
                onConfirm={exportPreviewConfig.onConfirm}
            />
        </div>
    );
}