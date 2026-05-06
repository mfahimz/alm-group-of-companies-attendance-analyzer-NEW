import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EXCEPTION_TYPES, formatExceptionTypeLabel, getFilteredExceptionTypes } from '@/lib/exception-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Search, Download, Edit, Eye, Filter, Sparkles, Calendar, Loader2 } from 'lucide-react';
import SortableTableHead from '../ui/SortableTableHead';
import TablePagination from '../ui/TablePagination';
import TimePicker from '../ui/QuickTimePicker';
import { toast } from 'sonner';
import BulkEditExceptionDialog from '../exceptions/BulkEditExceptionDialog';
import EditExceptionDialog from '../exceptions/EditExceptionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import ExcelPreviewDialog from '@/components/ui/ExcelPreviewDialog';
import ChecklistSection, { formatMergedWorksheet } from './ChecklistSection';
import ReportGeneratedExceptions from '../exceptions/ReportGeneratedExceptions';
import CreateExceptionDialog from '../exceptions/CreateExceptionDialog';

// Map user-friendly names to system type codes generated from central source
const TYPE_MAP = EXCEPTION_TYPES.reduce((acc, type) => {
    const key = type.value.toLowerCase().replace(/_/g, ' ');
    acc[key] = type.value;
    if (type.value === 'PUBLIC_HOLIDAY') acc['holiday'] = 'PUBLIC_HOLIDAY';
    if (type.value === 'MANUAL_PRESENT') acc['present'] = 'MANUAL_PRESENT';
    if (type.value === 'MANUAL_ABSENT') acc['absent'] = 'MANUAL_ABSENT';
    return acc;
}, {
    'manual_absent': 'MANUAL_ABSENT'
});

export default function ExceptionsTab({ project }) {
    const [showForm, setShowForm] = useState(false);
    const [isImportingLeaves, setIsImportingLeaves] = useState(false);
    const [employeeSearch, setEmployeeSearch] = useState('');

    const [filter, setFilter] = useState({ 
        search: '', 
        type: 'all',
        dateFrom: '',
        dateTo: '',
        department: 'all',
        createdFromReport: 'all',
        useInAnalysis: 'all',
        approvalStatus: 'all'
    });
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

    const [previewConfig, setPreviewConfig] = useState({
        isOpen: false,
        data: [],
        headers: [],
        fileName: '',
        onConfirm: null
    });

    const queryClient = useQueryClient();

    const { data: allExceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });
    
    const exceptions = allExceptions.filter(ex => !ex.created_from_report);
    const reportExceptions = allExceptions.filter(ex => ex.created_from_report);

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
        return combined.filter(emp => emp.attendance_id && String(emp.attendance_id).trim());
    }, [masterEmployees, projectEmployees]);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: checklistItems = [], isLoading: checklistLoading } = useQuery({
        queryKey: ['checklistItems', project.id],
        queryFn: () => base44.entities.ChecklistItem.filter({ project_id: project.id }, 'created_date'),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const canEditAllowedMinutes = ['admin', 'ceo'].includes(userRole);

    const sortedChecklistItems = useMemo(() => {
        if (!checklistItems) return [];
        return [...checklistItems].sort((a, b) => {
            const typeA = (a.task_type || '').toLowerCase();
            const typeB = (b.task_type || '').toLowerCase();
            if (typeA < typeB) return -1;
            if (typeA > typeB) return 1;
            const descA = (a.task_description || '').toLowerCase();
            const descB = (b.task_description || '').toLowerCase();
            if (descA < descB) return -1;
            if (descA > descB) return 1;
            return 0;
        });
    }, [checklistItems]);

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            await base44.entities.Exception.delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
            setSelectedItems([]);
            setSelectedExceptions([]);
            toast.success('Exception deleted');
        },
        onError: (error) => {
            toast.error('Failed to delete exception: ' + (error.message || 'Unknown error'));
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            await Promise.all(ids.map(id => base44.entities.Exception.delete(id)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
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
            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
            setSelectedExceptions([]);
            toast.success('Selected exceptions updated');
        },
        onError: (error) => {
            toast.error('Failed to update exceptions: ' + error.message);
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Exception.update(id, data),
        onSuccess: (updatedException) => {
            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
            toast.success('Exception updated');

            // Part B: Sync to AnnualLeave (Silent background sync)
            if (updatedException && updatedException.type === 'ANNUAL_LEAVE') {
                (async () => {
                    try {
                        // Find matching AnnualLeave record by attendance_id and overlapping date range
                        const leaves = await base44.entities.AnnualLeave.filter({
                            attendance_id: updatedException.attendance_id
                        });
                        const matchingLeave = leaves.find(l => 
                            (updatedException.date_from <= l.date_to && updatedException.date_to >= l.date_from)
                        );
                        if (matchingLeave) {
                            await base44.entities.AnnualLeave.update(matchingLeave.id, {
                                date_from: updatedException.date_from,
                                date_to: updatedException.date_to,
                                salary_leave_days: updatedException.salary_leave_days
                            });
                        }

                        // ChecklistItem Sync: Update related checklist items
                        if (updatedException.annual_leave_id) {
                            const checklistItems = await base44.entities.ChecklistItem.filter({
                                project_id: updatedException.project_id,
                                linked_annual_leave_id: updatedException.annual_leave_id
                            });

                            for (let i = 0; i < checklistItems.length; i += 10) {
                                const batch = checklistItems.slice(i, i + 10);
                                await Promise.all(batch.map(async (item) => {
                                    const employeeName = item.task_description.split(' | ')[0];
                                    const newDateRangeStr = `${updatedException.date_from} to ${updatedException.date_to}`;
                                    const newDays = updatedException.salary_leave_days || '';
                                    const newDescription = `${employeeName} | ${newDateRangeStr} | Days: ${newDays}`;
                                    return base44.entities.ChecklistItem.update(item.id, {
                                        task_description: newDescription
                                    });
                                }));
                                if (i + 10 < checklistItems.length) {
                                    await new Promise(resolve => setTimeout(resolve, 300));
                                }
                            }
                        }
                    } catch (e) {
                        // Skip silently - no error shown to user
                    }
                })();
            }
        },
        onError: (error) => {
            toast.error('Failed to update exception: ' + (error.message || 'Unknown error'));
        }
    });

    const handleCellChange = (exceptionId, field, value) => {
        const exception = allExceptions.find(e => e.id === exceptionId);
        if (exception?.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes) return;
        setEditedRows(prev => ({
            ...prev,
            [exceptionId]: { ...(prev[exceptionId] || {}), [field]: value }
        }));
    };

    const handleSaveRow = (exceptionId) => {
        const exception = allExceptions.find(e => e.id === exceptionId);
        if (exception?.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes) {
            toast.error("Only Admin and CEO can edit allowed minutes.");
            return;
        }
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
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
            const [, day, month, year] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
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
                    const rowNum = index + 2;
                    const attendance_id_raw = row.attendance_id || row.employee_id || row.id || row.AttendanceID || row.EmployeeID || '';
                    const attendance_id = attendance_id_raw === 'ALL' ? 'ALL' : (attendance_id_raw ? String(attendance_id_raw).trim() : '');
                    const date_from = parseDate(row.date_from || row.from || row.start_date || row.DateFrom || '');
                    const date_to = parseDate(row.date_to || row.to || row.end_date || row.DateTo || date_from);
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
                    const finalAttendanceId = type === 'PUBLIC_HOLIDAY' ? 'ALL' : attendance_id;
                    if (type !== 'PUBLIC_HOLIDAY' && !finalAttendanceId) {
                        errors.push(`Row ${rowNum}: Missing attendance_id`);
                        return;
                    }

                    exceptions.push({
                        project_id: project.id,
                        attendance_id: finalAttendanceId === 'ALL' ? 'ALL' : String(finalAttendanceId),
                        date_from,
                        date_to: date_to || date_from,
                        type,
                        details: row.details || row.reason || row.notes || '',
                        new_am_start: row.new_am_start || row.am_start || '',
                        new_am_end: row.new_am_end || row.am_end || '',
                        new_pm_start: row.new_pm_start || row.pm_start || '',
                        new_pm_end: row.new_pm_end || row.pm_end || '',
                        early_checkout_minutes: (row.early_checkout_minutes !== '' && row.early_checkout_minutes != null) ? Math.abs(parseInt(row.early_checkout_minutes)) : null,
                        other_minutes: (row.other_minutes !== '' && row.other_minutes != null) ? Math.abs(parseInt(row.other_minutes)) : null,
                        allowed_minutes: (row.allowed_minutes !== '' && row.allowed_minutes != null) ? Math.abs(parseInt(row.allowed_minutes)) : null
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

                setImportPreview({ exceptions, warnings });
                setShowImportPreview(true);
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
        
        try {
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
            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
            toast.success(`Imported ${importPreview.exceptions.length} exceptions successfully`);
        } catch (error) {
            toast.error('Import failed: ' + (error.message || 'Unknown error'));
        } finally {
            setUploadProgress(null);
            setImportPreview(null);
        }
    };

    const handleBulkDelete = () => {
        if (selectedExceptions.length === 0) return;
        if (window.confirm(`Delete ${selectedExceptions.length} selected exception${selectedExceptions.length > 1 ? 's' : ''}? This action cannot be undone.`)) {
            bulkDeleteMutation.mutate(selectedExceptions.map(e => e.id));
        }
    };

    const handleBulkToggleUse = (use_in_analysis) => {
        if (selectedExceptions.length === 0) return;
        bulkToggleUseMutation.mutate({ ids: selectedExceptions.map(e => e.id), use_in_analysis });
    };

    const clearFilters = () => {
        setFilter({ search: '', type: 'all', dateFrom: '', dateTo: '', department: 'all', createdFromReport: 'all', useInAnalysis: 'all', approvalStatus: 'all' });
    };

    const hasActiveFilters = filter.search || filter.type !== 'all' || filter.dateFrom || 
                             filter.dateTo || filter.department !== 'all' || 
                             filter.createdFromReport !== 'all' || filter.useInAnalysis !== 'all' ||
                             filter.approvalStatus !== 'all';

    const hasAdvancedFiltersActive = filter.type !== 'all' || filter.dateFrom || 
                                     filter.dateTo || filter.department !== 'all' || 
                                     filter.createdFromReport !== 'all' || filter.useInAnalysis !== 'all' ||
                                     filter.approvalStatus !== 'all';

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
        const employeeMap = employees.reduce((acc, emp) => {
            acc[String(emp.attendance_id)] = emp.name;
            return acc;
        }, {});

        const exportData = sortedExceptions.map(ex => {
            const empName = ex.attendance_id === 'ALL' ? 'All Employees' : (employeeMap[String(ex.attendance_id)] || '—');
            return {
                'Employee ID': ex.attendance_id,
                'Employee Name': empName,
                'Type': ex.is_custom_type ? (ex.custom_type_name || 'Custom') : ex.type.replace(/_/g, ' '),
                'From': ex.date_from ? new Date(ex.date_from).toLocaleDateString() : '—',
                'To': ex.date_to ? new Date(ex.date_to).toLocaleDateString() : '—',
                'Details': ex.details || '-',
                'From Report': ex.created_from_report ? 'Yes' : 'No',
                'Created By': ex.created_by || 'System',
                'Created Date': ex.created_date ? new Date(ex.created_date).toLocaleString() : '—'
            };
        });

        setPreviewConfig({
            isOpen: true,
            data: exportData,
            headers: ['Employee ID', 'Employee Name', 'Type', 'From', 'To', 'Details', 'From Report', 'Created By', 'Created Date'],
            fileName: `Exceptions_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`,
            onConfirm: executeExportDownload
        });
    };

    const executeExportDownload = async () => {
        if (previewConfig.data.length === 0) return;
        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
            const worksheet = XLSX.utils.json_to_sheet(previewConfig.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Exceptions");
            const wscols = [{ wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
            worksheet['!cols'] = wscols;
            XLSX.writeFile(workbook, previewConfig.fileName);
            toast.success('Exceptions exported to Excel');
        } catch (error) {
            toast.error('Export failed: ' + error.message);
        }
    };

    const getTypeColor = (type) => {
        const colors = {
            'PUBLIC_HOLIDAY': 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
            'SICK_LEAVE': 'bg-red-50 text-red-700 ring-1 ring-red-200',
            'ANNUAL_LEAVE': 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
            'SHIFT_OVERRIDE': 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
            'MANUAL_PRESENT': 'bg-green-50 text-green-700 ring-1 ring-green-200',
            'MANUAL_ABSENT': 'bg-red-50 text-red-700 ring-1 ring-red-200',
            'ALLOWED_MINUTES': 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
            'SKIP_PUNCH': 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
            'DAY_SWAP': 'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
        };
        return colors[type] || 'bg-slate-50 text-slate-700 ring-1 ring-slate-200';
    };


    const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

    const exceptionStats = {
        total: exceptions.length,
        publicHolidays: exceptions.filter(e => e.type === 'PUBLIC_HOLIDAY').length,
        sickLeave: exceptions.filter(e => e.type === 'SICK_LEAVE').length,
        annualLeave: exceptions.filter(e => e.type === 'ANNUAL_LEAVE').length,
        reportGenerated: reportExceptions.length
    };

    const filteredExceptions = exceptions
        .filter(ex => {
            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                const matchesId = String(ex.attendance_id).toLowerCase().includes(searchLower);
                const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id));
                const matchesName = employee?.name?.toLowerCase().includes(searchLower);
                const matchesDetails = ex.details?.toLowerCase().includes(searchLower);
                const matchesType = ex.type.toLowerCase().includes(searchLower);
                if (!matchesId && !matchesName && !matchesDetails && !matchesType) return false;
            }
            if (filter.type && filter.type !== 'all' && ex.type !== filter.type) return false;
            if (filter.dateFrom || filter.dateTo) {
                const exStart = ex.date_from;
                const exEnd = ex.date_to;
                if (filter.dateTo && exStart > filter.dateTo) return false;
                if (filter.dateFrom && exEnd < filter.dateFrom) return false;
            }
            if (filter.department && filter.department !== 'all') {
                if (ex.attendance_id === 'ALL') return false;
                const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id));
                if (employee?.department !== filter.department) return false;
            }
            if (filter.createdFromReport !== 'all') {
                const isFromReport = ex.created_from_report === true;
                if (filter.createdFromReport === 'yes' && !isFromReport) return false;
                if (filter.createdFromReport === 'no' && isFromReport) return false;
            }
            if (filter.useInAnalysis !== 'all') {
                const isUsed = ex.use_in_analysis !== false;
                if (filter.useInAnalysis === 'yes' && !isUsed) return false;
                if (filter.useInAnalysis === 'no' && isUsed) return false;
            }
            if (filter.approvalStatus !== 'all') {
                if (ex.approval_status !== filter.approvalStatus) return false;
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


    const sortedExceptions = useMemo(() => {
        return [...filteredExceptions].sort((a, b) => {
            const typeA = (a.is_custom_type ? (a.custom_type_name || 'Custom') : a.type.replace(/_/g, ' ')).toLowerCase();
            const typeB = (b.is_custom_type ? (b.custom_type_name || 'Custom') : b.type.replace(/_/g, ' ')).toLowerCase();
            if (typeA < typeB) return -1;
            if (typeA > typeB) return 1;
            const nameA = (employees.find(e => String(e.attendance_id) === String(a.attendance_id) && e.company === project.company)?.name || '').toLowerCase();
            const nameB = (employees.find(e => String(e.attendance_id) === String(b.attendance_id) && e.company === project.company)?.name || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });
    }, [filteredExceptions, employees, project.company]);

    const paginatedExceptions = sortedExceptions.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const handleGroupExport = async () => {
        const filteredExceptionsForExport = sortedExceptions.filter(ex => {
            const typeName = (ex.is_custom_type ? (ex.custom_type_name || 'Custom') : ex.type.replace(/_/g, ' ')).toLowerCase().trim();
            return typeName !== 'annual leave';
        });

        const combinedData = [
            ...filteredExceptionsForExport.map(ex => {
                const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id) && e.company === project.company);
                const typeName = ex.is_custom_type ? (ex.custom_type_name || 'Custom') : ex.type.replace(/_/g, ' ');
                const empName = ex.attendance_id === 'ALL' ? 'All Employees' : (employee?.name || '—');
                return {
                    type: typeName,
                    category: 'Attendance Exception',
                    id: ex.attendance_id === 'ALL' ? 'ALL' : ex.attendance_id,
                    employeeTask: empName,
                    details: ex.details || '-',
                    context: `${typeName}${ex.created_from_report ? ' (From Report)' : ''}`,
                    sortType: typeName.toLowerCase(),
                    sortName: empName.toLowerCase()
                };
            }),
            ...sortedChecklistItems.map(task => {
                const taskType = task.task_type || 'General';
                const taskDesc = task.task_description || '—';
                return {
                    type: taskType,
                    category: 'Checklist Task',
                    id: taskType,
                    employeeTask: taskDesc,
                    details: task.notes || '-',
                    context: `${task.is_predefined ? 'Predefined' : 'Project Task'}${task.completed_by ? ` (By: ${task.completed_by})` : ''}`,
                    sortType: taskType.toLowerCase(),
                    sortName: taskDesc.toLowerCase()
                };
            })
        ];

        combinedData.sort((a, b) => {
            if (a.sortType < b.sortType) return -1;
            if (a.sortType > b.sortType) return 1;
            if (a.sortName < b.sortName) return -1;
            if (a.sortName > b.sortName) return 1;
            return 0;
        });

        const exportRows = combinedData.map(item => ({
            'Type': item.type,
            'Category': item.category,
            'Employee / Task': item.employeeTask,
            'Details': item.details,
            'Additional Context': item.context
        }));

        setPreviewConfig({
            isOpen: true,
            data: exportRows,
            headers: ['Type', 'Category', 'Employee / Task', 'Details', 'Additional Context'],
            fileName: `Unified_Export_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`,
            onConfirm: executeGroupExportDownload,
            simulateMergeColumns: ['Type']
        });
    };

    const executeGroupExportDownload = async () => {
        if (previewConfig.data.length === 0) return;
        try {
            const XLSX = await import('xlsx');
            const worksheet = XLSX.utils.json_to_sheet(previewConfig.data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Unified Export");
            formatMergedWorksheet(worksheet, previewConfig.data, XLSX);
            const wscols = [{ wch: 25 }, { wch: 25 }, { wch: 60 }, { wch: 40 }, { wch: 40 }];
            worksheet['!cols'] = wscols;
            XLSX.writeFile(workbook, previewConfig.fileName);
            toast.success('Unified export downloaded with dynamic grouping');
        } catch (error) {
            toast.error('Export failed: ' + error.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Group Export Button */}
            <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-green-50">
                <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <p className="font-medium text-slate-900">Export All Data</p>
                            <p className="text-sm text-slate-600 mt-1">Export exceptions and checklist together in a single consolidated sheet</p>
                        </div>
                        <Button
                            onClick={handleGroupExport}
                            disabled={sortedExceptions.length === 0 && checklistItems.length === 0}
                            className="bg-gradient-to-r from-indigo-600 to-green-600 hover:from-indigo-700 hover:to-green-700"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export Unified
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Upload Progress */}
            {uploadProgress && (
                <Card className="border-0 shadow-sm bg-indigo-50 border-indigo-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-medium text-indigo-900">{uploadProgress.status}</p>
                                <p className="text-sm text-indigo-700 mt-1">{uploadProgress.current} / {uploadProgress.total} batches completed</p>
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
            <CreateExceptionDialog
                open={showForm}
                onClose={() => setShowForm(false)}
                project={project}
                employees={employees}
                isAdmin={isAdmin}
                isSupervisor={isSupervisor}
                canEditAllowedMinutes={canEditAllowedMinutes}
            />

            {/* Exceptions Section */}
            <Card className="border-0 shadow-sm bg-blue-50/30">
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <CardTitle>Exceptions ({filteredExceptions.length})</CardTitle>
                        <div className="flex gap-2">
                            <div className="relative">
                                <Button variant="outline" size="sm" disabled={isImportingLeaves} onClick={async () => {
                                    try {
                                        setIsImportingLeaves(true);
                                        const response = await base44.functions.invoke('importAnnualLeavesToProject', { projectId: project.id });
                                        if (response.data.success) {
                                            toast.success(response.data.message);
                                            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
                                            await new Promise(r => setTimeout(r, 500));
                                            queryClient.invalidateQueries({ queryKey: ['checklistItems', project.id] });
                                        }
                                    } catch (error) {
                                        toast.error('Failed to import: ' + error.message);
                                    } finally {
                                        setIsImportingLeaves(false);
                                    }
                                }} className="text-green-600 border-green-300 hover:bg-green-50">
                                    {isImportingLeaves ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : <><Calendar className="w-4 h-4 mr-2" />Import Annual Leaves</>}
                                </Button>
                                {isImportingLeaves && <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-green-400 animate-pulse rounded-full" />}
                            </div>
                            <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredExceptions.length === 0}>
                                <Download className="w-4 h-4 mr-2" />Export
                            </Button>
                            {!showForm && (
                                <Button onClick={() => setShowForm(true)} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                                    <Plus className="w-4 h-4 mr-2" />Add Exception
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            {selectedExceptions.length > 0 && !isUser && (
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => setShowBulkEdit(true)} className="bg-indigo-600 hover:bg-indigo-700"><Edit className="w-4 h-4 mr-2" />Edit ({selectedExceptions.length})</Button>
                                    <Button size="sm" variant="outline" onClick={() => handleBulkToggleUse(true)}>Enable Use</Button>
                                    <Button size="sm" variant="outline" onClick={() => handleBulkToggleUse(false)}>Disable Use</Button>
                                    <Button size="sm" variant="destructive" onClick={handleBulkDelete}><Trash2 className="w-4 h-4 mr-2" />Delete</Button>
                                </div>
                            )}
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input className="border-slate-200 pl-9" placeholder="Search ID, name, or details..." value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
                            </div>
                            <Button size="sm" variant="outline" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className="relative">
                                <Filter className="w-4 h-4 mr-2" />{showAdvancedFilters ? 'Hide' : 'Show'} Filters
                                {hasAdvancedFiltersActive && (
                                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                    </span>
                                )}
                            </Button>
                            {hasActiveFilters && <Button size="sm" variant="ghost" onClick={clearFilters} className="text-red-600 hover:text-red-700">Clear All</Button>}
                        </div>

                        {showAdvancedFilters && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg border">
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">Type</Label>
                                    <Select value={filter.type} onValueChange={(value) => setFilter({ ...filter, type: value })}>
                                        <SelectTrigger className="border-slate-200 h-9"><SelectValue placeholder="All types" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All types</SelectItem>
                                            {getFilteredExceptionTypes('filter', true).map(type => (
                                                <SelectItem key={type.value} value={type.value}>{type.label || formatExceptionTypeLabel(type.value)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">Department</Label>
                                    <Select value={filter.department} onValueChange={(value) => setFilter({ ...filter, department: value })}>
                                        <SelectTrigger className="border-slate-200 h-9"><SelectValue placeholder="All departments" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All departments</SelectItem>
                                            {departments.filter(dept => dept && dept.trim() !== '').map(dept => <SelectItem key={dept} value={dept || 'unknown'}>{dept}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">From Date</Label>
                                    <Input type="date" value={filter.dateFrom} onChange={(e) => { const v = e.target.value; if (!v || (v >= project.date_from && v <= project.date_to)) setFilter({ ...filter, dateFrom: v }); }} min={project.date_from} max={project.date_to} className="h-9 border-slate-200" />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">To Date</Label>
                                    <Input type="date" value={filter.dateTo} onChange={(e) => { const v = e.target.value; if (!v || (v >= project.date_from && v <= project.date_to && (!filter.dateFrom || v >= filter.dateFrom))) setFilter({ ...filter, dateTo: v }); }} min={filter.dateFrom || project.date_from} max={project.date_to} className="h-9 border-slate-200" />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">From Report</Label>
                                    <Select value={filter.createdFromReport} onValueChange={(value) => setFilter({ ...filter, createdFromReport: value })}>
                                        <SelectTrigger className="border-slate-200 h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">Use in Analysis</Label>
                                    <Select value={filter.useInAnalysis} onValueChange={(value) => setFilter({ ...filter, useInAnalysis: value })}>
                                        <SelectTrigger className="border-slate-200 h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">Approval Status</Label>
                                    <Select value={filter.approvalStatus} onValueChange={(value) => setFilter({ ...filter, approvalStatus: value })}>
                                        <SelectTrigger className="border-slate-200 h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="pending_dept_head">Pending Dept Head</SelectItem>
                                            <SelectItem value="approved_dept_head">Approved Dept Head</SelectItem>
                                            <SelectItem value="pending_hr">Pending HR</SelectItem>
                                            <SelectItem value="approved_hr">Approved HR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>

                    {filteredExceptions.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No exceptions found</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="sticky top-0 bg-slate-50/80 backdrop-blur-md z-10 border-b border-slate-200">
                                    <TableRow className="hover:bg-transparent border-none">
                                        {!isUser && (
                                            <TableHead className="w-12">
                                                <Checkbox checked={selectedExceptions.length === filteredExceptions.length && filteredExceptions.length > 0} onCheckedChange={(checked) => { if (checked) { setSelectedExceptions(filteredExceptions); } else { setSelectedExceptions([]); } }} />
                                            </TableHead>
                                        )}
                                        <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>Att ID</SortableTableHead>
                                        <TableHead>Name</TableHead>
                                        <SortableTableHead sortKey="type" currentSort={sort} onSort={setSort}>Type</SortableTableHead>
                                        <SortableTableHead sortKey="date_from" currentSort={sort} onSort={setSort}>From</SortableTableHead>
                                        <SortableTableHead sortKey="date_to" currentSort={sort} onSort={setSort}>To</SortableTableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedExceptions.map((exception) => {
                                        const employeeName = employees.find(e => String(e.attendance_id) === String(exception.attendance_id) && e.company === project.company)?.name || '—';
                                        return (
                                            <TableRow key={exception.id} className="hover:bg-slate-100/50 transition-colors duration-200">
                                                {!isUser && (
                                                    <TableCell className="p-1">
                                                        <Checkbox checked={selectedExceptions.some(e => e.id === exception.id)} onCheckedChange={(checked) => { if (checked) { setSelectedExceptions([...selectedExceptions, exception]); } else { setSelectedExceptions(selectedExceptions.filter(e => e.id !== exception.id)); } }} />
                                                    </TableCell>
                                                )}
                                                <TableCell className="p-1 text-sm font-mono text-slate-900">{exception.type === 'PUBLIC_HOLIDAY' ? 'ALL' : exception.attendance_id}</TableCell>
                                                <TableCell className="p-1 text-sm text-slate-900">{exception.type === 'PUBLIC_HOLIDAY' ? '—' : employeeName}</TableCell>
                                                <TableCell className="p-1">
                                                    {exception.is_custom_type ? (
                                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">{exception.custom_type_name || 'Custom'}</span>
                                                    ) : (
                                                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getTypeColor(exception.type)}`}>{exception.type.replace(/_/g, ' ')}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="p-1 text-sm">{exception.is_custom_type && (!exception.date_from || exception.date_from === project.date_from) ? '—' : new Date(exception.date_from).toLocaleDateString()}</TableCell>
                                                <TableCell className="p-1 text-sm">{exception.is_custom_type && (!exception.date_to || exception.date_to === project.date_to) ? '—' : new Date(exception.date_to).toLocaleDateString()}</TableCell>
                                                <TableCell className="p-1 text-sm max-w-xs truncate">{exception.details || '-'}</TableCell>
                                                <TableCell className="text-right p-1">
                                                    <div className="flex gap-1 justify-end">
                                                        <Button size="sm" variant="ghost" onClick={() => setViewingException(exception)} title="View exception"><Eye className="w-4 h-4 text-indigo-600" /></Button>
                                                        <Button size="sm" variant="ghost" onClick={() => { if (exception.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes) { toast.error("Only Admin and CEO can edit allowed minutes."); return; } setEditingException(exception); }} disabled={exception.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes}><Edit className={`w-4 h-4 ${exception.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes ? 'text-slate-400' : 'text-blue-600'}`} /></Button>
                                                        <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(exception.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {sortedExceptions.length > 0 && (
                        <TablePagination totalItems={sortedExceptions.length} currentPage={currentPage} rowsPerPage={rowsPerPage} onPageChange={setCurrentPage} onRowsPerPageChange={(value) => { setRowsPerPage(value); setCurrentPage(1); }} />
                    )}
                </CardContent>
            </Card>

            {/* Payroll Checklist Section */}
            <ChecklistSection project={project} checklistItems={sortedChecklistItems} currentUser={currentUser} reportRunId={undefined} />

            {/* Report-Generated Exceptions (grouped by report) */}
            <ReportGeneratedExceptions
                project={project}
                reportExceptions={reportExceptions}
                employees={employees}
                canEditAllowedMinutes={canEditAllowedMinutes}
            />

            {/* Edit Exception Dialog */}
            <EditExceptionDialog open={!!editingException} onClose={() => setEditingException(null)} exception={editingException} projectId={project.id} canEditAllowedMinutes={canEditAllowedMinutes} />

            {/* Bulk Edit Dialog */}
            <BulkEditExceptionDialog open={showBulkEdit} onClose={() => { setShowBulkEdit(false); setSelectedExceptions([]); }} selectedExceptions={selectedExceptions} projectId={project.id} canEditAllowedMinutes={canEditAllowedMinutes} />

            {/* View Exception Dialog */}
            <Dialog open={!!viewingException} onOpenChange={() => setViewingException(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader><DialogTitle>Exception Details</DialogTitle></DialogHeader>
                    {viewingException && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-slate-500 text-xs">Employee ID</Label><p className="font-medium text-slate-900">{viewingException.attendance_id === 'ALL' ? 'All Employees' : viewingException.attendance_id}</p></div>
                                <div><Label className="text-slate-500 text-xs">Employee Name</Label><p className="font-medium text-slate-900">{viewingException.attendance_id === 'ALL' ? '—' : employees.find(e => String(e.attendance_id) === String(viewingException.attendance_id) && e.company === project.company)?.name || '—'}</p></div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Exception Type</Label>
                                    {viewingException.is_custom_type ? (
                                        <div><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 inline-block">{viewingException.custom_type_name || 'Custom'}</span><p className="text-xs text-amber-600 mt-1">Not used in analysis</p></div>
                                    ) : (
                                        <p className="font-medium text-slate-900">{viewingException.type.replace(/_/g, ' ')}</p>
                                    )}
                                </div>
                                <div><Label className="text-slate-500 text-xs">Created From Report</Label><p className="font-medium text-slate-900">{viewingException.created_from_report ? 'Yes' : 'No'}</p></div>
                                <div><Label className="text-slate-500 text-xs">From Date</Label><p className="font-medium text-slate-900">{new Date(viewingException.date_from).toLocaleDateString()}</p></div>
                                <div><Label className="text-slate-500 text-xs">To Date</Label><p className="font-medium text-slate-900">{new Date(viewingException.date_to).toLocaleDateString()}</p></div>
                            </div>
                            {viewingException.type === 'SHIFT_OVERRIDE' && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs mb-2 block">Shift Override Times</Label>
                                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg">
                                        <div><span className="text-xs text-slate-600">AM Start:</span><p className="font-medium">{viewingException.new_am_start || '—'}</p></div>
                                        <div><span className="text-xs text-slate-600">AM End:</span><p className="font-medium">{viewingException.new_am_end || '—'}</p></div>
                                        <div><span className="text-xs text-slate-600">PM Start:</span><p className="font-medium">{viewingException.new_pm_start || '—'}</p></div>
                                        <div><span className="text-xs text-slate-600">PM End:</span><p className="font-medium">{viewingException.new_pm_end || '—'}</p></div>
                                    </div>
                                    {viewingException.include_friday !== undefined && <p className="text-sm text-slate-600 mt-2">{viewingException.include_friday ? '✓ Includes Friday' : '✗ Excludes Friday'}</p>}
                                </div>
                            )}
                            {viewingException.other_minutes && (<div className="border-t pt-4"><Label className="text-slate-500 text-xs">Other Minutes</Label><p className="font-medium text-slate-900">{viewingException.other_minutes} minutes</p></div>)}
                            {viewingException.allowed_minutes && (<div className="border-t pt-4"><Label className="text-slate-500 text-xs">Allowed Minutes (Excused)</Label><p className="font-medium text-slate-900">{viewingException.allowed_minutes} minutes</p></div>)}
                            {viewingException.details && (<div className="border-t pt-4"><Label className="text-slate-500 text-xs">Details / Reason</Label><p className="text-slate-900 mt-1">{viewingException.details}</p></div>)}
                            <div className="border-t pt-4">
                                <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
                                    <div><span>Created:</span><p className="text-slate-900">{new Date(viewingException.created_date).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' })}</p></div>
                                    <div><span>Created By:</span><p className="text-slate-900">{viewingException.created_by || '—'}</p></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end"><Button onClick={() => setViewingException(null)}>Close</Button></div>
                </DialogContent>
            </Dialog>

            {/* Import Preview Dialog */}
            <Dialog open={showImportPreview} onOpenChange={setShowImportPreview}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                    <DialogHeader><DialogTitle>Import Preview - Review Before Importing</DialogTitle></DialogHeader>
                    {importPreview && (
                        <div className="space-y-4 overflow-y-auto">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    Ready to import <strong>{importPreview.exceptions.length}</strong> exception{importPreview.exceptions.length > 1 ? 's' : ''}.
                                    {importPreview.warnings.length > 0 && <span className="block mt-2 text-amber-700">⚠️ {importPreview.warnings.length} warning{importPreview.warnings.length > 1 ? 's' : ''} found</span>}
                                </p>
                            </div>
                            <div className="border rounded-lg overflow-x-auto">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Attendance ID</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {importPreview.exceptions.slice(0, 10).map((ex, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-sm">{ex.attendance_id}</TableCell>
                                                <TableCell className="text-sm"><span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getTypeColor(ex.type)}`}>{ex.type.replace(/_/g, ' ')}</span></TableCell>
                                                <TableCell className="text-sm">{new Date(ex.date_from).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm">{new Date(ex.date_to).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm">{ex.details || '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {importPreview.exceptions.length > 10 && <div className="p-3 bg-slate-50 text-center text-sm text-slate-600 border-t">... and {importPreview.exceptions.length - 10} more</div>}
                            </div>
                            <div className="flex gap-3 justify-end">
                                <Button variant="outline" onClick={() => { setShowImportPreview(false); setImportPreview(null); }}>Cancel</Button>
                                <Button className="bg-green-600 hover:bg-green-700" onClick={confirmImport}>Confirm & Import {importPreview.exceptions.length} Exception{importPreview.exceptions.length > 1 ? 's' : ''}</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <ExcelPreviewDialog
                isOpen={previewConfig.isOpen}
                onClose={() => setPreviewConfig(prev => ({ ...prev, isOpen: false }))}
                data={previewConfig.data}
                headers={previewConfig.headers}
                fileName={previewConfig.fileName}
                onConfirm={previewConfig.onConfirm}
                simulateMergeColumns={previewConfig.simulateMergeColumns}
            />
        </div>
    );
}