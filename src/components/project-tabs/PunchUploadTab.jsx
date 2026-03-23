import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, AlertTriangle, Search, Trash2, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from "@/components/ui/progress";
import SortableTableHead from '../ui/SortableTableHead';
import TablePagination from '../ui/TablePagination';
import { toast } from 'sonner';

export default function PunchUploadTab({ project }) {
    const [file, setFile] = useState(null);
    const [parsedData, setParsedData] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedPunches, setSelectedPunches] = useState([]);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [uploadProgress, setUploadProgress] = useState(null);
    const [showPreviewDialog, setShowPreviewDialog] = useState(false);
    const [editingPunch, setEditingPunch] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [punchToDelete, setPunchToDelete] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
    });

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

    const validateTimestamp = (timestamp) => {
        if (!timestamp || timestamp.trim() === '') {
            return { valid: false, error: 'Empty timestamp', warning: false };
        }
        
        // Check date format - accept both DD/MM/YYYY and YYYY-MM-DD
        const ddmmyyyyMatch = timestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        const yyyymmddMatch = timestamp.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        
        let day, month, year;
        
        if (ddmmyyyyMatch) {
            [, day, month, year] = ddmmyyyyMatch;
        } else if (yyyymmddMatch) {
            [, year, month, day] = yyyymmddMatch;
        } else {
            return { valid: false, error: 'Invalid date format', warning: false };
        }
        
        const dayNum = parseInt(day);
        const monthNum = parseInt(month);
        const yearNum = parseInt(year);
        
        if (dayNum < 1 || dayNum > 31) {
            return { valid: false, error: 'Invalid day (1-31)', warning: false };
        }
        if (monthNum < 1 || monthNum > 12) {
            return { valid: false, error: 'Invalid month (1-12)', warning: false };
        }
        
        // Make year validation a warning, not an error
        if (yearNum < 2020 || yearNum > 2030) {
            return { valid: true, error: 'Year seems unusual', warning: true };
        }
        
        // Check time format if present
        const timeMatch = timestamp.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            
            if (hours < 1 || hours > 12) {
                return { valid: false, error: 'Hours must be 1-12', warning: false };
            }
            if (minutes < 0 || minutes > 59) {
                return { valid: false, error: 'Minutes must be 0-59', warning: false };
            }
        }
        
        return { valid: true, error: null, warning: false };
    };

    const convertTo12Hour = (time24) => {
        // Parse 24-hour time and convert to 12-hour AM/PM format
        const timeMatch = time24.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!timeMatch) return time24; // Return as-is if not recognized
        
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2];
        
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
            const headers = lines[0].split(',').map(h => h.trim());
            
            const data = [];
            const newWarnings = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 2) {
                    const attendance_id = values[0];
                    
                    let timestamp_raw = '';
                    let punch_date = '';
                    
                    // Al Maraghi Automotive format: ID, name, timestamp (3 columns)
                    // Supports: M/D/YYYY H:MM:SS AM/PM format with seconds
                    if (project.company === 'Al Maraghi Automotive' && values.length >= 3) {
                        timestamp_raw = values[2].trim();

                        // Extract date from timestamp (M/D/YYYY or MM/DD/YYYY HH:MM:SS AM/PM)
                        const dateMatch = timestamp_raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                        if (dateMatch) {
                            const [, month, day, year] = dateMatch;
                            punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    }
                    // Naser Mohsin Auto Parts format: ID, FirstName, Date, Time (4 columns)
                    // Date format: DD/MM/YYYY (Day/Month/Year)
                    else if (project.company === 'Naser Mohsin Auto Parts' && values.length >= 4) {
                        let dateStr = values[2].trim();
                        let timeStr = values[3].trim();
                        
                        // Parse date - expecting DD/MM/YYYY format (Day/Month/Year)
                        let day, month, year;
                        
                        // Check if date is in YYYY-MM-DD format
                        const isoDateMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                        if (isoDateMatch) {
                            [, year, month, day] = isoDateMatch;
                        } else {
                            // Parse as DD/MM/YYYY (Naser Mohsin format - Day/Month/Year)
                            const ddmmyyyyMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                            if (ddmmyyyyMatch) {
                                [, day, month, year] = ddmmyyyyMatch;
                            }
                        }
                        
                        // Keep DD/MM/YYYY for display
                        if (day && month && year) {
                            dateStr = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
                            punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                        
                        // Convert time to AM/PM format
                        if (!timeStr.match(/AM|PM/i)) {
                            timeStr = convertTo12Hour(timeStr);
                        }
                        
                        // Combine date and time
                        timestamp_raw = `${dateStr} ${timeStr}`;
                    }
                    // Standard format: ID, timestamp (or ID, name, timestamp)
                    else {
                        // Detect which column is the timestamp by checking for date pattern
                        if (values[1].match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                            // Format: ID, timestamp
                            timestamp_raw = values[1];
                        } else if (values.length >= 3 && values[2].match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                            // Format: ID, name, timestamp
                            timestamp_raw = values[2];
                        } else {
                            // Fallback to second column
                            timestamp_raw = values[1];
                        }

                        // Extract date from timestamp (D/M/YYYY or DD/MM/YYYY HH:MM AM/PM)
                        const dateMatch = timestamp_raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                        if (dateMatch) {
                            const [, day, month, year] = dateMatch;
                            punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    }

                    // Check if employee exists
                    const employeeExists = employees.some(e => String(e.attendance_id) === String(attendance_id));
                    if (!employeeExists && !newWarnings.includes(`Row ${i + 1}: Unknown employee ${attendance_id}`)) {
                        newWarnings.push(`Row ${i + 1}: Unknown employee ${attendance_id}`);
                    }

                    // Validate timestamp
                    const timestampValidation = validateTimestamp(timestamp_raw);
                    const warningKey = `Row ${i + 1} (${attendance_id}): ${timestampValidation.error}`;
                    if (!timestampValidation.valid && !newWarnings.includes(warningKey)) {
                        newWarnings.push(warningKey);
                    }

                    data.push({
                        attendance_id: String(attendance_id),
                        timestamp_raw,
                        punch_date,
                        employeeExists,
                        timestampValidation,
                        hasInvalidTimestamp: !timestampValidation.valid
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
            // Insert new punches in batches (append mode - no deletion)
            const punchRecords = parsedData.map(p => ({
                project_id: project.id,
                attendance_id: p.attendance_id,
                timestamp_raw: p.timestamp_raw,
                punch_date: p.punch_date
            }));

            setUploadProgress({ 
              phase: 'Uploading punch records to database...', 
              current: 0, 
              total: punchRecords.length 
            });

            const batchSize = 10;
            for (let i = 0; i < punchRecords.length; i += batchSize) {
              const batch = punchRecords.slice(i, i + batchSize);
              await base44.entities.Punch.bulkCreate(batch);
              await new Promise(r => setTimeout(r, 300));
              const uploaded = Math.min(i + batchSize, punchRecords.length);
              setUploadProgress({ 
                  phase: `Uploading batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(punchRecords.length / batchSize)}...`, 
                  current: uploaded, 
                  total: punchRecords.length 
              });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            toast.success('Punches uploaded successfully');
            setParsedData([]);
            setFile(null);
            setUploadProgress(null);
            setShowPreviewDialog(false);
        },
        onError: (error) => {
            toast.error('Failed to upload punches: ' + (error.message || 'Unknown error'));
            setUploadProgress(null);
        }
    });

    const updatePunchMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Punch.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            setEditingPunch(null);
            toast.success('Punch updated');
        },
        onError: () => {
            toast.error('Failed to update punch');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            await base44.entities.Punch.delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            setPunchToDelete(null);
            setDeleteDialogOpen(false);
            setSelectedPunches([]);
            toast.success('Punch deleted');
        },
        onError: (error) => {
            console.error('Delete punch error:', error);
            toast.error('Failed to delete punch: ' + (error.message || 'Unknown error'));
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            const total = ids.length;
            setUploadProgress({ current: 0, total, status: 'Deleting punch records...' });
            
            const batchSize = 10;
            for (let i = 0; i < ids.length; i += batchSize) {
                const batch = ids.slice(i, i + batchSize);
                for (const id of batch) {
                    await base44.entities.Punch.delete(id);
                }
                await new Promise(r => setTimeout(r, 300));
                setUploadProgress({ current: Math.min(i + batchSize, total), total, status: `Deleting ${Math.min(i + batchSize, total)}/${total}...` });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            setSelectedPunches([]);
            toast.success('Punches deleted successfully');
            setUploadProgress(null);
        },
        onError: (error) => {
            console.error('Bulk delete error:', error);
            toast.error('Failed to delete punches: ' + (error.message || 'Unknown error'));
            setUploadProgress(null);
        }
    });

    // Filter and enrich punches - optimized with useMemo
    const enrichedPunches = React.useMemo(() => {
        const filtered = punches.filter(punch => {
            const matchesSearch = !searchTerm || punch.attendance_id.toLowerCase().includes(searchTerm.toLowerCase());
            
            let matchesDateRange = true;
            if (dateFrom && dateTo) {
                matchesDateRange = punch.punch_date >= dateFrom && punch.punch_date <= dateTo;
            } else if (dateFrom) {
                matchesDateRange = punch.punch_date >= dateFrom;
            } else if (dateTo) {
                matchesDateRange = punch.punch_date <= dateTo;
            }
            
            return matchesSearch && matchesDateRange;
        });

        return filtered
            .map(punch => ({
                ...punch,
                employee_name: employees.find(e => String(e.attendance_id) === String(punch.attendance_id))?.name || '-'
            }))
            .sort((a, b) => {
                let aVal = a[sort.key];
                let bVal = b[sort.key];
                
                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                
                if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [punches, searchTerm, dateFrom, dateTo, employees, sort]);

    const paginatedPunches = React.useMemo(() => {
        return enrichedPunches.slice(
            (currentPage - 1) * rowsPerPage,
            currentPage * rowsPerPage
        );
    }, [enrichedPunches, currentPage, rowsPerPage]);

    const toggleSelectAll = () => {
        if (selectedPunches.length === paginatedPunches.length) {
            setSelectedPunches([]);
        } else {
            setSelectedPunches(paginatedPunches.map(p => p.id));
        }
    };

    const toggleSelectPunch = (id) => {
        setSelectedPunches(prev => 
            prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
        );
    };

    const handleBulkDelete = () => {
        if (window.confirm(`Delete ${selectedPunches.length} selected punch records?`)) {
            bulkDeleteMutation.mutate(selectedPunches);
        }
    };

    return (
        <div className="space-y-6">
            {/* Upload Progress */}
            {uploadProgress && (
                <Card className="border-0 shadow-sm bg-indigo-50 border-indigo-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-medium text-indigo-900">{uploadProgress.status || uploadProgress.phase}</p>
                                <p className="text-sm text-indigo-700 mt-1">
                                    {uploadProgress.current} / {uploadProgress.total} records completed
                                </p>
                            </div>
                        </div>
                        <Progress value={uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0} />
                    </CardContent>
                </Card>
            )}

            {/* Upload Section */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Upload Punch Data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Input
                            type="file"
                            accept=".csv, .xlsx, .xls"
                            onChange={handleFileChange}
                        />
                        {project.company === 'Al Maraghi Automotive' ? (
                            <>
                                <p className="text-sm text-slate-500 mt-2">
                                    CSV format: attendance_id, name, timestamp
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Timestamp format: M/D/YYYY H:MM:SS AM/PM (e.g., 11/1/2025 8:28:22 AM)
                                </p>
                            </>
                        ) : project.company === 'Naser Mohsin Auto Parts' ? (
                            <>
                                <p className="text-sm text-slate-500 mt-2">
                                    CSV format: attendance_id, first_name, date, time
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Date format: DD/MM/YYYY (Day/Month/Year), Time format: HH:MM (will be converted to AM/PM automatically)
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-slate-500 mt-2">
                                    CSV format: attendance_id, name (optional), timestamp
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    Timestamp format: DD/MM/YYYY HH:MM AM/PM (e.g., 02/10/2025 8:54 AM)
                                </p>
                            </>
                        )}
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
                        <div className="space-y-3">
                            <p className="text-sm text-slate-600">
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

            {/* Current Punches */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Current Punch Data</CardTitle>
                </CardHeader>
                <CardContent>
                    {punches.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No punches uploaded yet</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-slate-600">
                                    Total: {punches.length} punch records from {new Set(punches.map(p => p.attendance_id)).size} employees
                                    {enrichedPunches.length !== punches.length && ` (${enrichedPunches.length} shown)`}
                                </p>
                                <div className="flex gap-3">
                                    {selectedPunches.length > 0 && !isUser && (
                                        <Button 
                                            onClick={handleBulkDelete}
                                            variant="destructive"
                                            size="sm"
                                            disabled={bulkDeleteMutation.isPending}
                                        >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete {selectedPunches.length} Selected
                                        </Button>
                                    )}
                                    <Input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => {
                                            const newDate = e.target.value;
                                            if (newDate >= project.date_from && newDate <= project.date_to) {
                                                setDateFrom(newDate);
                                            }
                                        }}
                                        min={project.date_from}
                                        max={project.date_to}
                                        className="w-40"
                                        placeholder="From date"
                                        title="Date range must be within project period"
                                    />
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => {
                                            const newDate = e.target.value;
                                            if (newDate >= dateFrom && newDate <= project.date_to && newDate >= project.date_from) {
                                                setDateTo(newDate);
                                            }
                                        }}
                                        min={dateFrom}
                                        max={project.date_to}
                                        className="w-40"
                                        placeholder="To date"
                                        title="Date range must be within project period"
                                    />
                                    <div className="relative w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <Input
                                            placeholder="Filter by attendance ID..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-auto">
                                <Table>
                                    <TableHeader>
                                       <TableRow>
                                           {!isUser && (
                                               <TableHead className="w-12">
                                                   <Checkbox
                                                       checked={selectedPunches.length === paginatedPunches.length && paginatedPunches.length > 0}
                                                       onCheckedChange={toggleSelectAll}
                                                   />
                                               </TableHead>
                                           )}
                                            <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                                Employee ID
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="employee_name" currentSort={sort} onSort={setSort}>
                                                Employee Name
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="timestamp_raw" currentSort={sort} onSort={setSort}>
                                                Time
                                            </SortableTableHead>
                                            {!isUser && <TableHead className="text-right">Actions</TableHead>}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                       {paginatedPunches.map((punch) => (
                                           <TableRow key={punch.id}>
                                               {!isUser && (
                                                   <TableCell>
                                                       <Checkbox
                                                           checked={selectedPunches.includes(punch.id)}
                                                           onCheckedChange={() => toggleSelectPunch(punch.id)}
                                                       />
                                                   </TableCell>
                                               )}
                                                <TableCell className="font-medium">
                                                    {editingPunch?.id === punch.id ? (
                                                        <Input
                                                            value={editingPunch.attendance_id}
                                                            onChange={(e) => setEditingPunch({ ...editingPunch, attendance_id: e.target.value })}
                                                            className="h-8 w-24"
                                                        />
                                                    ) : (
                                                        punch.attendance_id
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {editingPunch?.id === punch.id 
                                                        ? employees.find(e => e.attendance_id === editingPunch.attendance_id)?.name || '-'
                                                        : punch.employee_name
                                                    }
                                                </TableCell>
                                                <TableCell>
                                                    {editingPunch?.id === punch.id ? (
                                                        <Input
                                                            value={editingPunch.timestamp_raw}
                                                            onChange={(e) => setEditingPunch({ ...editingPunch, timestamp_raw: e.target.value })}
                                                            className="h-8 w-48"
                                                        />
                                                    ) : (
                                                        punch.timestamp_raw
                                                    )}
                                                </TableCell>
                                                {!isUser && (
                                                    <TableCell className="text-right">
                                                        <div className="flex gap-1 justify-end">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    if (window.confirm('Delete this punch record?')) {
                                                                        deleteMutation.mutate(punch.id);
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 className="w-4 h-4 text-red-600" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                            <TablePagination
                                totalItems={enrichedPunches.length}
                                currentPage={currentPage}
                                rowsPerPage={rowsPerPage}
                                onPageChange={setCurrentPage}
                                onRowsPerPageChange={(value) => {
                                    setRowsPerPage(value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Preview Dialog */}
            <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Preview & Edit Punch Data</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600">
                            {parsedData.length} punch records ready for upload
                        </p>
                        
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

                        <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Attendance ID</TableHead>
                                        <TableHead>Employee Name</TableHead>
                                        <TableHead>Timestamp</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedData.map((row, index) => {
                                        const employee = employees.find(e => String(e.attendance_id) === String(row.attendance_id));
                                        const rowClass = !row.employeeExists ? 'bg-red-50' : row.hasInvalidTimestamp ? 'bg-amber-50' : '';
                                        
                                        return (
                                            <TableRow key={index} className={rowClass}>
                                                <TableCell className="font-medium">
                                                    {row.attendance_id}
                                                    {row.hasInvalidTimestamp && (
                                                        <AlertTriangle className="w-4 h-4 text-amber-600 inline ml-1" />
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-sm">{employee?.name || '❌ Unknown'}</TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={row.timestamp_raw}
                                                        onChange={(e) => {
                                                            const newTimestamp = e.target.value;
                                                            setParsedData(prev => prev.map((r, i) => {
                                                                if (i === index) {
                                                                    // Recalculate punch_date when timestamp changes
                                                                    const dateMatch = newTimestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                                                                    let punch_date = '';
                                                                    if (dateMatch) {
                                                                        const [, day, month, year] = dateMatch;
                                                                        punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                                                    }
                                                                    
                                                                    // Re-validate
                                                                    const timestampValidation = validateTimestamp(newTimestamp);
                                                                    
                                                                    return { 
                                                                        ...r, 
                                                                        timestamp_raw: newTimestamp,
                                                                        punch_date,
                                                                        timestampValidation,
                                                                        hasInvalidTimestamp: !timestampValidation.valid
                                                                    };
                                                                }
                                                                return r;
                                                            }));
                                                        }}
                                                        className={`h-8 w-48 ${row.timestampValidation?.valid === false ? 'border-red-500' : ''}`}
                                                    />
                                                    {row.timestampValidation?.valid === false && (
                                                        <p className="text-xs text-red-600 mt-0.5">{row.timestampValidation.error}</p>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        {uploadProgress && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                <p className="text-sm font-medium text-indigo-900 mb-2">{uploadProgress.phase || uploadProgress.status}</p>
                                <Progress value={uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0} />
                                <p className="text-xs text-indigo-700 mt-2">
                                    {uploadProgress.current} / {uploadProgress.total} records
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4">
                            <Button 
                                onClick={() => uploadMutation.mutate()}
                                disabled={uploadMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {uploadMutation.isPending ? 'Uploading...' : 'Confirm & Upload'}
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
        </div>
    );
}