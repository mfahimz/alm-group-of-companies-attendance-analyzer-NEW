import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, AlertTriangle, Search, Trash2, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import SortableTableHead from '../ui/SortableTableHead';
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
    const queryClient = useQueryClient();

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
    });

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            parseCSV(selectedFile);
        }
    };

    const validateTimestamp = (timestamp) => {
        if (!timestamp || timestamp.trim() === '') {
            return { valid: false, error: 'Empty timestamp', warning: false };
        }
        
        // Check date format (D/M/YYYY or DD/MM/YYYY)
        const dateMatch = timestamp.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!dateMatch) {
            return { valid: false, error: 'Invalid date format', warning: false };
        }
        
        const [, day, month, year] = dateMatch;
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
                    
                    // Check if we have 4 columns: ID, Name, Date, Time (Naser Mohsin format)
                    if (values.length >= 4 && values[2].match(/\d{1,2}\/\d{1,2}\/\d{4}/) && values[3].match(/\d{1,2}:\d{2}/)) {
                        // Format: ID, Name, Date, Time (separate columns)
                        const dateStr = values[2]; // e.g., "02/10/2025"
                        let timeStr = values[3]; // e.g., "8:54" or "14:30"
                        
                        // Convert time to AM/PM format if it's in 24-hour format
                        if (!timeStr.match(/AM|PM/i)) {
                            timeStr = convertTo12Hour(timeStr);
                        }
                        
                        // Combine date and time
                        timestamp_raw = `${dateStr} ${timeStr}`;
                        
                        // Extract punch_date
                        const dateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                        if (dateMatch) {
                            const [, day, month, year] = dateMatch;
                            punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
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
                    const employeeExists = employees.some(e => e.attendance_id === attendance_id);
                    if (!employeeExists) {
                        newWarnings.push(`Row ${i + 1}: Unknown employee ${attendance_id}`);
                    }

                    // Validate timestamp
                    const timestampValidation = validateTimestamp(timestamp_raw);
                    if (!timestampValidation.valid) {
                        newWarnings.push(`Row ${i + 1} (${attendance_id}): ${timestampValidation.error}`);
                    }

                    data.push({
                        attendance_id,
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

            setUploadProgress({ phase: 'Uploading records...', current: 0, total: punchRecords.length });
            
            const batchSize = 100;
            for (let i = 0; i < punchRecords.length; i += batchSize) {
                const batch = punchRecords.slice(i, i + batchSize);
                await base44.entities.Punch.bulkCreate(batch);
                setUploadProgress({ phase: 'Uploading records...', current: Math.min(i + batchSize, punchRecords.length), total: punchRecords.length });
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

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Punch.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            toast.success('Punch deleted');
        },
        onError: () => {
            toast.error('Failed to delete punch');
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const batchSize = 20;
            for (let i = 0; i < ids.length; i += batchSize) {
                const batch = ids.slice(i, i + batchSize);
                await Promise.all(batch.map(id => base44.entities.Punch.delete(id)));
                if (i + batchSize < ids.length) {
                    await delay(500);
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', project.id]);
            setSelectedPunches([]);
            toast.success('Punches deleted successfully');
        },
        onError: () => {
            toast.error('Failed to delete punches');
        }
    });

    // Filter punches based on search and date range
    const filteredPunches = punches.filter(punch => {
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

    // Enrich punches with employee names
    const enrichedPunches = filteredPunches
        .map(punch => ({
            ...punch,
            employee_name: employees.find(e => e.attendance_id === punch.attendance_id)?.name || '-'
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

    const toggleSelectAll = () => {
        if (selectedPunches.length === enrichedPunches.length) {
            setSelectedPunches([]);
        } else {
            setSelectedPunches(enrichedPunches.map(p => p.id));
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
            {/* Upload Section */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Upload Punch Data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                        />
                        <p className="text-sm text-slate-500 mt-2">
                            CSV format: attendance_id, name (optional), timestamp
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                            Timestamp format: DD/MM/YYYY HH:MM AM/PM (e.g., 02/10/2025 8:54 AM)
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
                                    {selectedPunches.length > 0 && (
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
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="w-40"
                                        placeholder="From date"
                                    />
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="w-40"
                                        placeholder="To date"
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
                            <div className="max-h-96 overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={selectedPunches.length === enrichedPunches.length && enrichedPunches.length > 0}
                                                    onCheckedChange={toggleSelectAll}
                                                />
                                            </TableHead>
                                            <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                                Employee ID
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="employee_name" currentSort={sort} onSort={setSort}>
                                                Employee Name
                                            </SortableTableHead>
                                            <SortableTableHead sortKey="timestamp_raw" currentSort={sort} onSort={setSort}>
                                                Time
                                            </SortableTableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {enrichedPunches.map((punch) => (
                                            <TableRow key={punch.id}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedPunches.includes(punch.id)}
                                                        onCheckedChange={() => toggleSelectPunch(punch.id)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">{punch.attendance_id}</TableCell>
                                                <TableCell>{punch.employee_name}</TableCell>
                                                <TableCell>{punch.timestamp_raw}</TableCell>
                                                <TableCell className="text-right">
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
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
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
                                        <TableHead>Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedData.map((row, index) => {
                                        const employee = employees.find(e => e.attendance_id === row.attendance_id);
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
                                                <TableCell className="text-sm">{row.punch_date || '—'}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        {uploadProgress && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                <p className="text-sm font-medium text-indigo-900 mb-2">{uploadProgress.phase}</p>
                                <div className="w-full bg-indigo-200 rounded-full h-2">
                                    <div 
                                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                        style={{ width: uploadProgress.total > 0 ? `${(uploadProgress.current / uploadProgress.total) * 100}%` : '0%' }}
                                    />
                                </div>
                                <p className="text-xs text-indigo-700 mt-1">
                                    {uploadProgress.current} / {uploadProgress.total}
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