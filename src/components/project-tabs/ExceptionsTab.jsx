import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Plus, Trash2, Search, Upload, Download, Save, Edit, Eye, Filter } from 'lucide-react';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import BulkEditExceptionDialog from '../exceptions/BulkEditExceptionDialog';
import EditExceptionDialog from '../exceptions/EditExceptionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import TablePagination from '../ui/TablePagination';
import TimePicker from '../ui/TimePicker';

// Map user-friendly names to system type codes
const TYPE_MAP = {
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
    'sick leave': 'SICK_LEAVE',
    'sick': 'SICK_LEAVE',
    'annual leave': 'ANNUAL_LEAVE',
    'annual': 'ANNUAL_LEAVE',
    'vacation': 'ANNUAL_LEAVE',
    // Also accept the exact system codes
    'public_holiday': 'PUBLIC_HOLIDAY',
    'shift_override': 'SHIFT_OVERRIDE',
    'manual_present': 'MANUAL_PRESENT',
    'manual_absent': 'MANUAL_ABSENT',
    'manual_half': 'MANUAL_HALF',
    'sick_leave': 'SICK_LEAVE',
    'annual_leave': 'ANNUAL_LEAVE',
    'allowed minutes': 'ALLOWED_MINUTES',
    'allowed_minutes': 'ALLOWED_MINUTES'
};

export default function ExceptionsTab({ project }) {
    const [showForm, setShowForm] = useState(false);
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [formData, setFormData] = useState({
        attendance_id: '',
        date_from: '',
        date_to: '',
        type: 'PUBLIC_HOLIDAY',
        custom_type_name: '',
        new_am_start: '',
        new_am_end: '',
        new_pm_start: '',
        new_pm_end: '',
        early_checkout_minutes: '',
        allowed_minutes: '',
        allowed_minutes_type: 'both',
        details: '',
        include_friday: false,
        other_minutes: ''
    });
    const [filter, setFilter] = useState({ 
        search: '', 
        type: 'all',
        dateFrom: '',
        dateTo: '',
        department: 'all',
        createdFromReport: 'all',
        useInAnalysis: 'all'
    });
    const [reportFilter, setReportFilter] = useState({ search: '', type: 'all' });
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [uploadProgress, setUploadProgress] = useState(null);
    const [editedRows, setEditedRows] = useState({});
    const [selectedItems, setSelectedItems] = useState([]);
    const [selectedExceptions, setSelectedExceptions] = useState([]);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [viewingException, setViewingException] = useState(null);
    const [editingException, setEditingException] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [showImportPreview, setShowImportPreview] = useState(false);
    const queryClient = useQueryClient();

    const { data: allExceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });
    
    const exceptions = allExceptions.filter(ex => !ex.created_from_report);
    const reportExceptions = allExceptions.filter(ex => ex.created_from_report);

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';

    const { data: allUsers = [] } = useQuery({
        queryKey: ['users'],
        queryFn: () => base44.entities.User.list(),
        enabled: !!currentUser && isUser
    });

    const createMutation = useMutation({
        mutationFn: async (data) => {
            // All exceptions are now auto-approved
            const exceptionData = {
                ...data,
                project_id: project.id,
                approval_status: 'approved',
                // If type is CUSTOM, mark it and ensure it's never used in analysis
                is_custom_type: data.type === 'CUSTOM',
                use_in_analysis: data.type === 'CUSTOM' ? false : true
            };
            
            return await base44.entities.Exception.create(exceptionData);
        },
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
        mutationFn: async (id) => {
            await base44.entities.Exception.delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            setSelectedItems([]);
            setSelectedExceptions([]);
            toast.success('Exception deleted');
        },
        onError: (error) => {
            console.error('Delete exception error:', error);
            toast.error('Failed to delete exception: ' + (error.message || 'Unknown error'));
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            await Promise.all(ids.map(id => base44.entities.Exception.delete(id)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            setSelectedExceptions([]);
            toast.success('Selected exceptions deleted');
        },
        onError: (error) => {
            toast.error('Failed to delete exceptions: ' + error.message);
        }
    });

    const bulkToggleUseMutation = useMutation({
        mutationFn: async ({ ids, use_in_analysis }) => {
            await Promise.all(ids.map(id => 
                base44.entities.Exception.update(id, { use_in_analysis })
            ));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            setSelectedExceptions([]);
            toast.success('Selected exceptions updated');
        },
        onError: (error) => {
            toast.error('Failed to update exceptions: ' + error.message);
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Exception.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
        }
    });

    const toggleUseInAnalysisMutation = useMutation({
        mutationFn: ({ id, use_in_analysis }) => base44.entities.Exception.update(id, { use_in_analysis }),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success('Exception updated');
        }
    });

    const handleCellChange = (exceptionId, field, value) => {
        setEditedRows(prev => ({
            ...prev,
            [exceptionId]: {
                ...(prev[exceptionId] || {}),
                [field]: value
            }
        }));
    };

    const handleSaveRow = (exceptionId) => {
        if (editedRows[exceptionId]) {
            updateMutation.mutate({ id: exceptionId, data: editedRows[exceptionId] }, {
                onSuccess: () => {
                    setEditedRows(prev => {
                        const newState = { ...prev };
                        delete newState[exceptionId];
                        return newState;
                    });
                    toast.success('Exception updated');
                }
            });
        }
    };

    const getFieldValue = (exception, field) => {
        if (editedRows[exception.id] && editedRows[exception.id][field] !== undefined) {
            return editedRows[exception.id][field];
        }
        return exception[field];
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
                const warnings = [];

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
                        errors.push(`Row ${rowNum}: Invalid type "${row.type || ''}". Use: Public Holiday, Sick Leave, Present, Absent, Half Day, Shift Override`);
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
                        early_checkout_minutes: row.early_checkout_minutes ? parseInt(row.early_checkout_minutes) : null,
                        other_minutes: row.other_minutes ? parseInt(row.other_minutes) : null,
                        allowed_minutes: row.allowed_minutes ? parseInt(row.allowed_minutes) : null // Added other_minutes
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

                // Show preview instead of directly importing
                setImportPreview({ exceptions, warnings });
                setShowImportPreview(true);

                // Removed direct import - now shows preview
            } catch (error) {
                toast.error('Failed to import file: ' + error.message);
                setUploadProgress(null);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const confirmImport = async () => {
        if (!importPreview) return;

        setUploadProgress({ current: 0, total: importPreview.exceptions.length, status: 'Importing exceptions...' });
        setShowImportPreview(false);
        
        const batchSize = 20;
        for (let i = 0; i < importPreview.exceptions.length; i += batchSize) {
            const batch = importPreview.exceptions.slice(i, i + batchSize);
            await base44.entities.Exception.bulkCreate(batch);
            setUploadProgress({ 
                current: Math.min(i + batchSize, importPreview.exceptions.length), 
                total: importPreview.exceptions.length,
                status: `Importing ${Math.min(i + batchSize, importPreview.exceptions.length)}/${importPreview.exceptions.length}...`
            });
        }

        queryClient.invalidateQueries(['exceptions', project.id]);
        toast.success(`Imported ${importPreview.exceptions.length} exceptions successfully`);
        setUploadProgress(null);
        setImportPreview(null);
    };

    const handleBulkDelete = () => {
        if (selectedExceptions.length === 0) return;
        
        if (window.confirm(`Delete ${selectedExceptions.length} selected exception${selectedExceptions.length > 1 ? 's' : ''}? This action cannot be undone.`)) {
            bulkDeleteMutation.mutate(selectedExceptions.map(e => e.id));
        }
    };

    const handleBulkToggleUse = (use_in_analysis) => {
        if (selectedExceptions.length === 0) return;
        
        bulkToggleUseMutation.mutate({
            ids: selectedExceptions.map(e => e.id),
            use_in_analysis
        });
    };

    const clearFilters = () => {
        setFilter({
            search: '',
            type: 'all',
            dateFrom: '',
            dateTo: '',
            department: 'all',
            createdFromReport: 'all',
            useInAnalysis: 'all'
        });
    };

    const hasActiveFilters = filter.search || filter.type !== 'all' || filter.dateFrom || 
                             filter.dateTo || filter.department !== 'all' || 
                             filter.createdFromReport !== 'all' || filter.useInAnalysis !== 'all';

    const downloadTemplate = () => {
        const template = `attendance_id,name,date_from,date_to,type,details,other_minutes
ALL,All Employees,2025-11-15,2025-11-15,Public Holiday,National Day,0
322,Jane Doe,2025-11-12,2025-11-14,Sick Leave,Medical certificate,0
789,John Smith,2025-12-20,2025-12-22,Annual Leave,Vacation,0
123,Bob Johnson,2025-11-20,2025-11-20,Present,Worked from home,0
456,Alice Brown,2025-11-21,2025-11-21,Half Day,Left early,0`;
        
        const blob = new Blob([template], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'exceptions_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExport = async () => {
        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
            
            const exportData = filteredExceptions.map(ex => {
                const employee = employees.find(e => e.attendance_id === ex.attendance_id);
                return {
                    'Attendance ID': ex.attendance_id === 'ALL' ? 'ALL' : ex.attendance_id,
                    'Employee Name': ex.attendance_id === 'ALL' ? 'All Employees' : (employee?.name || '—'),
                    'Department': ex.attendance_id === 'ALL' ? '—' : (employee?.department || '—'),
                    'Type': ex.is_custom_type ? ex.custom_type_name || 'Custom' : ex.type.replace(/_/g, ' '),
                    'From Date': ex.is_custom_type && (!ex.date_from || ex.date_from === project.date_from) ? '—' : new Date(ex.date_from).toLocaleDateString(),
                    'To Date': ex.is_custom_type && (!ex.date_to || ex.date_to === project.date_to) ? '—' : new Date(ex.date_to).toLocaleDateString(),
                    'Details': ex.details || '',
                    'Use in Analysis': ex.use_in_analysis !== false ? 'Yes' : 'No',
                    'From Report': ex.created_from_report ? 'Yes' : 'No',
                    'Created Date': new Date(ex.created_date).toLocaleDateString(),
                    'Created By': ex.created_by || ''
                };
            });
            
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Exceptions');
            
            const filename = hasActiveFilters 
                ? `exceptions_filtered_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`
                : `exceptions_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            XLSX.writeFile(workbook, filename);
            
            toast.success(`Exported ${exportData.length} exceptions${hasActiveFilters ? ' (filtered)' : ''}`);
        } catch (error) {
            toast.error('Failed to export: ' + error.message);
        }
    };

    const getTypeColor = (type) => {
        const colors = {
            'PUBLIC_HOLIDAY': 'bg-purple-100 text-purple-700 border-purple-200',
            'SICK_LEAVE': 'bg-red-100 text-red-700 border-red-200',
            'ANNUAL_LEAVE': 'bg-blue-100 text-blue-700 border-blue-200',
            'SHIFT_OVERRIDE': 'bg-orange-100 text-orange-700 border-orange-200',
            'MANUAL_PRESENT': 'bg-green-100 text-green-700 border-green-200',
            'MANUAL_ABSENT': 'bg-red-100 text-red-700 border-red-200',
            'MANUAL_HALF': 'bg-yellow-100 text-yellow-700 border-yellow-200',
            'ALLOWED_MINUTES': 'bg-indigo-100 text-indigo-700 border-indigo-200'
        };
        return colors[type] || 'bg-slate-100 text-slate-700 border-slate-200';
    };

    const resetForm = () => {
        setFormData({
            attendance_id: '',
            date_from: '',
            date_to: '',
            type: 'PUBLIC_HOLIDAY',
            custom_type_name: '',
            new_am_start: '',
            new_am_end: '',
            new_pm_start: '',
            new_pm_end: '',
            early_checkout_minutes: '',
            details: '',
            include_friday: false,
            other_minutes: ''
        });
        setEmployeeSearch('');
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // For PUBLIC_HOLIDAY, ALLOWED_MINUTES, and CUSTOM types, attendance_id is optional
        if (formData.type !== 'PUBLIC_HOLIDAY' && formData.type !== 'ALLOWED_MINUTES' && formData.type !== 'CUSTOM' && !formData.attendance_id) {
            toast.error('Please select an employee');
            return;
        }

        // For ALLOWED_MINUTES and CUSTOM, default to ALL if not selected
        if ((formData.type === 'ALLOWED_MINUTES' || formData.type === 'CUSTOM') && !formData.attendance_id) {
            formData.attendance_id = 'ALL';
        }
        
        // Date range is mandatory for all types except SINGLE_SHIFT and CUSTOM
        if (formData.type !== 'SINGLE_SHIFT' && formData.type !== 'CUSTOM' && (!formData.date_from || !formData.date_to)) {
            toast.error('Please fill in date range');
            return;
        }
        
        // For PUBLIC_HOLIDAY, set attendance_id to 'ALL'
        const submitData = formData.type === 'PUBLIC_HOLIDAY' 
            ? { ...formData, attendance_id: 'ALL' }
            : formData;
        
        // Clean up empty string values and convert early_checkout_minutes to number
        // For SINGLE_SHIFT or CUSTOM (if no dates), use project date range as placeholder
        const cleanedData = {
            attendance_id: submitData.attendance_id,
            date_from: submitData.type === 'SINGLE_SHIFT' ? project.date_from : 
                       (submitData.type === 'CUSTOM' && !submitData.date_from) ? project.date_from :
                       submitData.date_from,
            date_to: submitData.type === 'SINGLE_SHIFT' ? project.date_to : 
                     (submitData.type === 'CUSTOM' && !submitData.date_to) ? project.date_to :
                     submitData.date_to,
            type: submitData.type,
            custom_type_name: submitData.type === 'CUSTOM' ? (submitData.custom_type_name?.trim() || 'Custom') : null,
            details: submitData.details || null
        };
        
        if (submitData.type === 'SHIFT_OVERRIDE') {
            cleanedData.new_am_start = submitData.new_am_start || null;
            cleanedData.new_am_end = submitData.new_am_end || null;
            cleanedData.new_pm_start = submitData.new_pm_start || null;
            cleanedData.new_pm_end = submitData.new_pm_end || null;
            cleanedData.include_friday = submitData.include_friday || false;
        }

        // Added other_minutes to cleanedData
        if (submitData.other_minutes && !isNaN(parseInt(submitData.other_minutes))) {
            cleanedData.other_minutes = parseInt(submitData.other_minutes);
        } else {
            cleanedData.other_minutes = null;
        }

        // Add allowed_minutes and allowed_minutes_type
        if (submitData.type === 'ALLOWED_MINUTES' && submitData.allowed_minutes) {
            cleanedData.allowed_minutes = parseInt(submitData.allowed_minutes);
            cleanedData.allowed_minutes_type = submitData.allowed_minutes_type || 'both';
        }

        createMutation.mutate(cleanedData);
    };

    const filteredReportExceptions = reportExceptions
        .filter(ex => {
            if (reportFilter.search) {
                const searchLower = reportFilter.search.toLowerCase();
                const matchesId = String(ex.attendance_id).toLowerCase().includes(searchLower);
                const employee = employees.find(e => e.attendance_id === ex.attendance_id);
                const matchesName = employee?.name?.toLowerCase().includes(searchLower);
                if (!matchesId && !matchesName) return false;
            }
            if (reportFilter.type && reportFilter.type !== 'all' && ex.type !== reportFilter.type) return false;
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

    // Get unique departments
    const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

    // Calculate statistics
    const exceptionStats = {
        total: exceptions.length,
        publicHolidays: exceptions.filter(e => e.type === 'PUBLIC_HOLIDAY').length,
        sickLeave: exceptions.filter(e => e.type === 'SICK_LEAVE').length,
        annualLeave: exceptions.filter(e => e.type === 'ANNUAL_LEAVE').length,
        reportGenerated: reportExceptions.length
    };

    const filteredExceptions = exceptions
        .filter(ex => {
            // Search filter
            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                const matchesId = String(ex.attendance_id).toLowerCase().includes(searchLower);
                const employee = employees.find(e => e.attendance_id === ex.attendance_id);
                const matchesName = employee?.name?.toLowerCase().includes(searchLower);
                const matchesDetails = ex.details?.toLowerCase().includes(searchLower);
                if (!matchesId && !matchesName && !matchesDetails) return false;
            }
            
            // Type filter
            if (filter.type && filter.type !== 'all' && ex.type !== filter.type) return false;
            
            // Date range filter
            if (filter.dateFrom) {
                if (new Date(ex.date_from) < new Date(filter.dateFrom)) return false;
            }
            if (filter.dateTo) {
                if (new Date(ex.date_to) > new Date(filter.dateTo)) return false;
            }
            
            // Department filter
            if (filter.department && filter.department !== 'all') {
                if (ex.attendance_id === 'ALL') return false;
                const employee = employees.find(e => e.attendance_id === ex.attendance_id);
                if (employee?.department !== filter.department) return false;
            }
            
            // Created from report filter
            if (filter.createdFromReport !== 'all') {
                const isFromReport = ex.created_from_report === true;
                if (filter.createdFromReport === 'yes' && !isFromReport) return false;
                if (filter.createdFromReport === 'no' && isFromReport) return false;
            }
            
            // Use in analysis filter
            if (filter.useInAnalysis !== 'all') {
                const isUsed = ex.use_in_analysis !== false;
                if (filter.useInAnalysis === 'yes' && !isUsed) return false;
                if (filter.useInAnalysis === 'no' && isUsed) return false;
            }
            
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
    const needsAllowedMinutes = formData.type === 'ALLOWED_MINUTES';

    const paginatedExceptions = filteredExceptions.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

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
                                    <Label>Employee {formData.type !== 'PUBLIC_HOLIDAY' && formData.type !== 'ALLOWED_MINUTES' && formData.type !== 'CUSTOM' && '*'}</Label>
                                    {formData.type === 'PUBLIC_HOLIDAY' ? (
                                        <Input 
                                            value="All Employees" 
                                            disabled 
                                            className="bg-slate-50"
                                        />
                                    ) : (formData.type === 'ALLOWED_MINUTES' || formData.type === 'CUSTOM') ? (
                                        <Select
                                            value={formData.attendance_id || 'ALL'}
                                            onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select employee or all..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">All Employees</SelectItem>
                                                <div className="p-2 border-t">
                                                    <Input
                                                        placeholder="Type to search..."
                                                        value={employeeSearch}
                                                        onChange={(e) => setEmployeeSearch(e.target.value)}
                                                        className="mb-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto">
                                                    {employees
                                                        .filter(emp => {
                                                            if (!employeeSearch) return true;
                                                            const search = employeeSearch.toLowerCase();
                                                            return emp.name.toLowerCase().includes(search) || 
                                                                   String(emp.attendance_id).toLowerCase().includes(search);
                                                        })
                                                        .map(emp => (
                                                            <SelectItem key={emp.id} value={emp.attendance_id}>
                                                                {emp.attendance_id} - {emp.name}
                                                            </SelectItem>
                                                        ))}
                                                </div>
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Select
                                            value={formData.attendance_id}
                                            onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Search and select employee..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <div className="p-2">
                                                    <Input
                                                        placeholder="Type to search..."
                                                        value={employeeSearch}
                                                        onChange={(e) => setEmployeeSearch(e.target.value)}
                                                        className="mb-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto">
                                                    {employees
                                                        .filter(emp => {
                                                            if (!employeeSearch) return true;
                                                            const search = employeeSearch.toLowerCase();
                                                            return emp.name.toLowerCase().includes(search) || 
                                                                   String(emp.attendance_id).toLowerCase().includes(search);
                                                        })
                                                        .map(emp => (
                                                            <SelectItem key={emp.id} value={emp.attendance_id}>
                                                                {emp.attendance_id} - {emp.name}
                                                            </SelectItem>
                                                        ))}
                                                </div>
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
                                            <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                            <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                            <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                            <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                            <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                            <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                                            <SelectItem value="ANNUAL_LEAVE">Annual Leave / Vacation</SelectItem>
                                            <SelectItem value="ALLOWED_MINUTES">Allowed Minutes (Grace)</SelectItem>
                                            <SelectItem value="CUSTOM">Custom Type (Not used in analysis)</SelectItem>
                                            {/* MANUAL_LATE, MANUAL_EARLY_CHECKOUT, MANUAL_OTHER_MINUTES are excluded - only creatable from report edits */}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {formData.type !== 'SINGLE_SHIFT' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>From Date {formData.type !== 'CUSTOM' && <span className="text-red-500">*</span>}</Label>
                                        <Input
                                            type="date"
                                            value={formData.date_from}
                                            onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>To Date {formData.type !== 'CUSTOM' && <span className="text-red-500">*</span>}</Label>
                                        <Input
                                            type="date"
                                            value={formData.date_to}
                                            onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            {needsShiftOverride && (
                                <div className="space-y-4">
                                    <Label className="block">Override Shift Times</Label>
                                    <div className="grid grid-cols-4 gap-4">
                                        <div>
                                            <Label className="text-xs">AM Start</Label>
                                            <TimePicker
                                                placeholder="08:00 AM"
                                                value={formData.new_am_start}
                                                onChange={(value) => setFormData({ ...formData, new_am_start: value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">AM End</Label>
                                            <TimePicker
                                                placeholder="12:00 PM"
                                                value={formData.new_am_end}
                                                onChange={(value) => setFormData({ ...formData, new_am_end: value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM Start</Label>
                                            <TimePicker
                                                placeholder="01:00 PM"
                                                value={formData.new_pm_start}
                                                onChange={(value) => setFormData({ ...formData, new_pm_start: value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM End</Label>
                                            <TimePicker
                                                placeholder="05:00 PM"
                                                value={formData.new_pm_end}
                                                onChange={(value) => setFormData({ ...formData, new_pm_end: value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-slate-50">
                                        <Checkbox
                                            id="include-friday"
                                            checked={formData.include_friday}
                                            onCheckedChange={(checked) => setFormData({ ...formData, include_friday: checked })}
                                        />
                                        <Label htmlFor="include-friday" className="cursor-pointer">
                                            Include Friday in shift override
                                        </Label>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {formData.include_friday 
                                            ? 'This override will apply to all days including Friday' 
                                            : 'This override will apply to all working days except Friday'}
                                    </p>
                                </div>
                            )}

                            {needsAllowedMinutes && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Allowed Minutes *</Label>
                                            <Input
                                                type="number"
                                                placeholder="e.g. 60"
                                                value={formData.allowed_minutes}
                                                onChange={(e) => setFormData({ ...formData, allowed_minutes: e.target.value })}
                                                min="1"
                                            />
                                        </div>
                                        <div>
                                            <Label>Apply To *</Label>
                                            <Select
                                                value={formData.allowed_minutes_type}
                                                onValueChange={(value) => setFormData({ ...formData, allowed_minutes_type: value })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="late">Late Arrivals Only</SelectItem>
                                                    <SelectItem value="early">Early Checkouts Only</SelectItem>
                                                    <SelectItem value="both">Both Late & Early</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500">Minutes to excuse due to natural calamity or personal reasons</p>
                                </div>
                            )}

                            {formData.type === 'CUSTOM' && (
                                <div>
                                    <Label>Custom Exception Type Name (Optional)</Label>
                                    <Input
                                        placeholder="Enter custom type name (e.g. Training, Site Visit)"
                                        value={formData.custom_type_name}
                                        onChange={(e) => setFormData({ ...formData, custom_type_name: e.target.value })}
                                    />
                                    <p className="text-xs text-amber-600 mt-1">
                                        ⚠️ Custom types are for record-keeping only and will never be used in analysis calculations
                                    </p>
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

            {/* Statistics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-sm text-slate-600">Total</div>
                        <div className="text-2xl font-bold text-slate-900">{exceptionStats.total}</div>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-sm text-slate-600">Public Holidays</div>
                        <div className="text-2xl font-bold text-purple-600">{exceptionStats.publicHolidays}</div>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-sm text-slate-600">Sick Leave</div>
                        <div className="text-2xl font-bold text-red-600">{exceptionStats.sickLeave}</div>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-sm text-slate-600">Annual Leave</div>
                        <div className="text-2xl font-bold text-blue-600">{exceptionStats.annualLeave}</div>
                    </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                        <div className="text-sm text-slate-600">From Reports</div>
                        <div className="text-2xl font-bold text-indigo-600">{exceptionStats.reportGenerated}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Exceptions List */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Exceptions ({filteredExceptions.length})</CardTitle>
                        <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                            disabled={filteredExceptions.length === 0}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export
                        </Button>
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
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            {selectedExceptions.length > 0 && !isUser && (
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={() => setShowBulkEdit(true)}
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Edit ({selectedExceptions.length})
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleBulkToggleUse(true)}
                                    >
                                        Enable Use
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleBulkToggleUse(false)}
                                    >
                                        Disable Use
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={handleBulkDelete}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </Button>
                                </div>
                            )}
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search ID, name, or details..."
                                    value={filter.search}
                                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                    className="pl-9"
                                />
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                            >
                                <Filter className="w-4 h-4 mr-2" />
                                {showAdvancedFilters ? 'Hide' : 'Show'} Filters
                            </Button>
                            {hasActiveFilters && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={clearFilters}
                                    className="text-red-600 hover:text-red-700"
                                >
                                    Clear All
                                </Button>
                            )}
                        </div>

                        {/* Advanced Filters */}
                        {showAdvancedFilters && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg border">
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">Type</Label>
                                    <Select
                                        value={filter.type}
                                        onValueChange={(value) => setFilter({ ...filter, type: value })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="All types" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All types</SelectItem>
                                            <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                            <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                            <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                            <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                            <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                            <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                                            <SelectItem value="ANNUAL_LEAVE">Annual Leave</SelectItem>
                                            <SelectItem value="ALLOWED_MINUTES">Allowed Minutes</SelectItem>
                                            <SelectItem value="CUSTOM">Custom Type</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">Department</Label>
                                    <Select
                                        value={filter.department}
                                        onValueChange={(value) => setFilter({ ...filter, department: value })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="All departments" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All departments</SelectItem>
                                            {departments.map(dept => (
                                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">From Date</Label>
                                    <Input
                                        type="date"
                                        value={filter.dateFrom}
                                        onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value })}
                                        className="h-9"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">To Date</Label>
                                    <Input
                                        type="date"
                                        value={filter.dateTo}
                                        onChange={(e) => setFilter({ ...filter, dateTo: e.target.value })}
                                        className="h-9"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">From Report</Label>
                                    <Select
                                        value={filter.createdFromReport}
                                        onValueChange={(value) => setFilter({ ...filter, createdFromReport: value })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="yes">Yes</SelectItem>
                                            <SelectItem value="no">No</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Table */}
                    {filteredExceptions.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No exceptions found</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {!isUser && (
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={selectedExceptions.length === filteredExceptions.length && filteredExceptions.length > 0}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedExceptions(filteredExceptions);
                                                        } else {
                                                            setSelectedExceptions([]);
                                                        }
                                                    }}
                                                />
                                            </TableHead>
                                        )}
                                        <TableHead className="w-24">ID</TableHead>
                                        <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                            Attendance ID
                                        </SortableTableHead>
                                                                                      <TableHead>Name</TableHead>
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
                                    {paginatedExceptions.map((exception) => (
                                        <TableRow key={exception.id}>
                                            {!isUser && (
                                                <TableCell className="p-1">
                                                    <Checkbox
                                                        checked={selectedExceptions.some(e => e.id === exception.id)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedExceptions([...selectedExceptions, exception]);
                                                            } else {
                                                                setSelectedExceptions(selectedExceptions.filter(e => e.id !== exception.id));
                                                            }
                                                        }}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className="p-1">
                                                <span className="text-sm text-slate-900">
                                                    {exception.type === 'PUBLIC_HOLIDAY' ? 'ALL' : exception.attendance_id}
                                                </span>
                                            </TableCell>
                                            <TableCell className="p-1">
                                                <span className="text-sm text-slate-900">
                                                    {exception.type === 'PUBLIC_HOLIDAY' ? '—' : (employees.find(e => e.attendance_id === exception.attendance_id && e.company === project.company)?.name || '—')}
                                                </span>
                                            </TableCell>
                                            <TableCell className="p-1">
                                                {exception.is_custom_type ? (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                                                        {exception.custom_type_name || 'Custom'}
                                                    </span>
                                                ) : (
                                                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getTypeColor(exception.type)}`}>
                                                        {exception.type.replace(/_/g, ' ')}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="p-1 text-sm">
                                                {exception.is_custom_type && (!exception.date_from || exception.date_from === project.date_from) 
                                                    ? '—' 
                                                    : new Date(exception.date_from).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="p-1 text-sm">
                                                {exception.is_custom_type && (!exception.date_to || exception.date_to === project.date_to) 
                                                    ? '—' 
                                                    : new Date(exception.date_to).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="p-1 text-sm max-w-xs truncate">
                                                {exception.details || '-'}
                                            </TableCell>
                                            <TableCell className="text-right p-1">
                                                <div className="flex gap-1 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setViewingException(exception)}
                                                        title="View exception"
                                                    >
                                                        <Eye className="w-4 h-4 text-indigo-600" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setEditingException(exception)}
                                                        title="Edit exception"
                                                    >
                                                        <Edit className="w-4 h-4 text-blue-600" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => deleteMutation.mutate(exception.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {filteredExceptions.length > 0 && (
                        <TablePagination
                            totalItems={filteredExceptions.length}
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

            {/* Report-Generated Exceptions */}
            {reportExceptions.length > 0 && (
                <Card className="border-0 shadow-sm bg-purple-50/50 ring-1 ring-purple-200">
                    <CardHeader>
                        <CardTitle className="text-purple-900">Report-Generated Exceptions ({reportExceptions.length})</CardTitle>
                        <p className="text-sm text-purple-700 mt-1">
                            These exceptions were automatically created from saved reports
                        </p>
                    </CardHeader>
                    <CardContent>
                        {/* Search and Filters for Report Exceptions */}
                        <div className="flex gap-4 mb-4">
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search by ID or name..."
                                    value={reportFilter.search}
                                    onChange={(e) => setReportFilter({ ...reportFilter, search: e.target.value })}
                                    className="pl-9"
                                />
                            </div>
                            <Select
                                value={reportFilter.type}
                                onValueChange={(value) => setReportFilter({ ...reportFilter, type: value })}
                            >
                                <SelectTrigger className="max-w-xs">
                                    <SelectValue placeholder="All types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All types</SelectItem>
                                    <SelectItem value="MANUAL_LATE">Manual Late</SelectItem>
                                    <SelectItem value="MANUAL_EARLY_CHECKOUT">Manual Early Checkout</SelectItem>
                                    <SelectItem value="MANUAL_OTHER_MINUTES">Manual Other Minutes</SelectItem>
                                    <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                    <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                    <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                    <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                    <SelectItem value="CUSTOM">Custom Type</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">Use</TableHead>
                                        <TableHead className="w-24">ID</TableHead>
                                        <TableHead>Attendance ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>From</TableHead>
                                        <TableHead>To</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredReportExceptions.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                                                No report exceptions found
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredReportExceptions.map((exception) => (
                                        <TableRow key={exception.id}>
                                            <TableCell className="p-1">
                                                <Checkbox
                                                    checked={exception.use_in_analysis !== false}
                                                    onCheckedChange={(checked) => {
                                                        toggleUseInAnalysisMutation.mutate({
                                                            id: exception.id,
                                                            use_in_analysis: checked
                                                        });
                                                    }}
                                                />
                                                </TableCell>
                                                <TableCell className="p-1 text-xs text-slate-500 font-mono">
                                                {exception.id.substring(0, 8)}
                                                </TableCell>
                                                <TableCell className="p-1">
                                                <span className="text-sm text-slate-900">
                                                    {exception.attendance_id === 'ALL' ? 'ALL' : exception.attendance_id}
                                                </span>
                                                </TableCell>
                                            <TableCell className="p-1">
                                                <span className="text-sm text-slate-900">
                                                   {exception.attendance_id === 'ALL' ? '—' : (employees.find(e => e.attendance_id === exception.attendance_id && e.company === project.company)?.name || '—')}
                                                </span>
                                                </TableCell>
                                                <TableCell className="p-1">
                                                <div className="flex flex-col gap-1">
                                                  {exception.is_custom_type ? (
                                                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 inline-block w-fit">
                                                          {exception.custom_type_name || 'Custom'}
                                                      </span>
                                                  ) : (
                                                      <span className="text-sm">{exception.type.replace(/_/g, ' ')}</span>
                                                  )}
                                                  {exception.late_minutes > 0 && (
                                                      <span className="text-xs text-orange-600">Late: {exception.late_minutes}m</span>
                                                  )}
                                                  {exception.early_checkout_minutes > 0 && (
                                                      <span className="text-xs text-blue-600">Early: {exception.early_checkout_minutes}m</span>
                                                  )}
                                                  {exception.other_minutes > 0 && (
                                                      <span className="text-xs text-purple-600">Other: {exception.other_minutes}m</span>
                                                  )}
                                                </div>
                                                </TableCell>
                                            <TableCell className="p-1 text-sm">
                                                {exception.is_custom_type && (!exception.date_from || exception.date_from === project.date_from) 
                                                    ? '—' 
                                                    : new Date(exception.date_from).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="p-1 text-sm">
                                                {exception.is_custom_type && (!exception.date_to || exception.date_to === project.date_to) 
                                                    ? '—' 
                                                    : new Date(exception.date_to).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="p-1 text-xs text-slate-600 max-w-xs truncate">
                                                {exception.details || '-'}
                                            </TableCell>
                                            <TableCell className="text-right p-1">
                                                <div className="flex gap-1 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setEditingException(exception)}
                                                        title="Edit exception"
                                                    >
                                                        <Edit className="w-4 h-4 text-indigo-600" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => deleteMutation.mutate(exception.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="text-xs text-purple-600 mt-4">
                            💡 Uncheck "Use" to exclude an exception from future analysis runs. You can also delete report-generated exceptions if needed.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Edit Exception Dialog */}
            <EditExceptionDialog
                open={!!editingException}
                onClose={() => setEditingException(null)}
                exception={editingException}
                projectId={project.id}
            />

            {/* Bulk Edit Dialog */}
            <BulkEditExceptionDialog
                open={showBulkEdit}
                onClose={() => {
                    setShowBulkEdit(false);
                    setSelectedExceptions([]);
                }}
                selectedExceptions={selectedExceptions}
                projectId={project.id}
            />

            {/* View Exception Dialog */}
            <Dialog open={!!viewingException} onOpenChange={() => setViewingException(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Exception Details</DialogTitle>
                    </DialogHeader>
                    {viewingException && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-slate-500 text-xs">Employee ID</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.attendance_id === 'ALL' ? 'All Employees' : viewingException.attendance_id}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Employee Name</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.attendance_id === 'ALL' 
                                            ? '—' 
                                            : employees.find(e => e.attendance_id === viewingException.attendance_id && e.company === project.company)?.name || '—'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Exception Type</Label>
                                    {viewingException.is_custom_type ? (
                                        <div>
                                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 inline-block">
                                                {viewingException.custom_type_name || 'Custom'}
                                            </span>
                                            <p className="text-xs text-amber-600 mt-1">Not used in analysis</p>
                                        </div>
                                    ) : (
                                        <p className="font-medium text-slate-900">{viewingException.type.replace(/_/g, ' ')}</p>
                                    )}
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Created From Report</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.created_from_report ? 'Yes' : 'No'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">From Date</Label>
                                    <p className="font-medium text-slate-900">
                                        {new Date(viewingException.date_from).toLocaleDateString()}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">To Date</Label>
                                    <p className="font-medium text-slate-900">
                                        {new Date(viewingException.date_to).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>

                            {viewingException.type === 'SHIFT_OVERRIDE' && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs mb-2 block">Shift Override Times</Label>
                                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg">
                                        <div>
                                            <span className="text-xs text-slate-600">AM Start:</span>
                                            <p className="font-medium">{viewingException.new_am_start || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">AM End:</span>
                                            <p className="font-medium">{viewingException.new_am_end || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">PM Start:</span>
                                            <p className="font-medium">{viewingException.new_pm_start || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">PM End:</span>
                                            <p className="font-medium">{viewingException.new_pm_end || '—'}</p>
                                        </div>
                                    </div>
                                    {viewingException.include_friday !== undefined && (
                                        <p className="text-sm text-slate-600 mt-2">
                                            {viewingException.include_friday 
                                                ? '✓ Includes Friday' 
                                                : '✗ Excludes Friday'}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Added display for other_minutes */}
                            {viewingException.other_minutes && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Other Minutes</Label>
                                    <p className="font-medium text-slate-900">{viewingException.other_minutes} minutes</p>
                                </div>
                            )}

                            {viewingException.allowed_minutes && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Allowed Minutes (Excused)</Label>
                                    <p className="font-medium text-slate-900">{viewingException.allowed_minutes} minutes</p>
                                </div>
                            )}

                            {viewingException.details && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Details / Reason</Label>
                                    <p className="text-slate-900 mt-1">{viewingException.details}</p>
                                </div>
                            )}

                            <div className="border-t pt-4">
                                <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
                                    <div>
                                        <span>Created:</span>
                                        <p className="text-slate-900">
                                            {new Date(viewingException.created_date).toLocaleString('en-US', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true,
                                                timeZone: 'Asia/Dubai'
                                            })}
                                        </p>
                                    </div>
                                    <div>
                                        <span>Created By:</span>
                                        <p className="text-slate-900">{viewingException.created_by || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end">
                        <Button onClick={() => setViewingException(null)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Import Preview Dialog */}
            <Dialog open={showImportPreview} onOpenChange={setShowImportPreview}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>Import Preview - Review Before Importing</DialogTitle>
                    </DialogHeader>
                    {importPreview && (
                        <div className="space-y-4 overflow-y-auto">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    Ready to import <strong>{importPreview.exceptions.length}</strong> exception{importPreview.exceptions.length > 1 ? 's' : ''}.
                                    {importPreview.warnings.length > 0 && (
                                        <span className="block mt-2 text-amber-700">
                                            ⚠️ {importPreview.warnings.length} warning{importPreview.warnings.length > 1 ? 's' : ''} found
                                        </span>
                                    )}
                                </p>
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Attendance ID</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>From</TableHead>
                                            <TableHead>To</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importPreview.exceptions.slice(0, 10).map((ex, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-sm">{ex.attendance_id}</TableCell>
                                                <TableCell className="text-sm">
                                                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getTypeColor(ex.type)}`}>
                                                        {ex.type.replace(/_/g, ' ')}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-sm">{new Date(ex.date_from).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm">{new Date(ex.date_to).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm">{ex.details || '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {importPreview.exceptions.length > 10 && (
                                    <div className="p-3 bg-slate-50 text-center text-sm text-slate-600 border-t">
                                        ... and {importPreview.exceptions.length - 10} more
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowImportPreview(false);
                                        setImportPreview(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={confirmImport}
                                >
                                    Confirm & Import {importPreview.exceptions.length} Exception{importPreview.exceptions.length > 1 ? 's' : ''}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}