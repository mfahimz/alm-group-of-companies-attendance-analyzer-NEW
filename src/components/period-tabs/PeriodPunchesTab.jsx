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
import { Progress } from "@/components/ui/progress";
import SortableTableHead from '../ui/SortableTableHead';
import TablePagination from '../ui/TablePagination';
import { toast } from 'sonner';

/**
 * PeriodPunchesTab — Calendar-based equivalent of PunchUploadTab.
 *
 * Part of the new calendar-based payroll system.
 * Completely independent from the existing project system.
 * Replaces project_id with calendar_period_id for punch data linking.
 * Supports legacy fallback to company/date-range filtering.
 */
export default function PeriodPunchesTab({ calendarPeriod }) {
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

    // Fetch employees for current company
    const { data: employees = [] } = useQuery({
        queryKey: ['employees', calendarPeriod.company],
        queryFn: () => base44.entities.Employee.filter({ company: calendarPeriod.company })
    });

    /* 
     * Fetch punches linked to this calendar period.
     * Filter by calendar_period_id if available, otherwise fall back to 
     * filtering by company and date range for backward compatibility.
     */
    const { data: punches = [] } = useQuery({
        queryKey: ['punches', calendarPeriod.id],
        queryFn: async () => {
            // Priority 1: Use direct calendar_period_id link
            const directPunches = await base44.entities.Punch.filter({ calendar_period_id: calendarPeriod.id });
            if (directPunches.length > 0) return directPunches;

            // Priority 2: Fallback to company + date range filtering
            return await base44.entities.Punch.filter({
                company: calendarPeriod.company,
                punch_date: { '>=': calendarPeriod.date_from, '<=': calendarPeriod.date_to }
            });
        },
        enabled: !!calendarPeriod?.id
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
        
        if (yearNum < 2020 || yearNum > 2030) {
            return { valid: true, error: 'Year seems unusual', warning: true };
        }
        
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
        const timeMatch = time24.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!timeMatch) return time24;
        
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
            if (typeof text !== 'string') return;
            const lines = text.split('\n').filter(line => line.trim());
            const data = [];
            const newWarnings = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                if (values.length >= 2) {
                    const attendance_id = values[0];
                    let timestamp_raw = '';
                    let punch_date = '';
                    
                    if (calendarPeriod.company === 'Al Maraghi Automotive' && values.length >= 3) {
                        timestamp_raw = values[2].trim();
                        const dateMatch = timestamp_raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                        if (dateMatch) {
                            const [, month, day, year] = dateMatch;
                            punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    }
                    else if (calendarPeriod.company === 'Naser Mohsin Auto Parts' && values.length >= 4) {
                        let dateStr = values[2].trim();
                        let timeStr = values[3].trim();
                        let day, month, year;
                        const isoDateMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                        if (isoDateMatch) {
                            [, year, month, day] = isoDateMatch;
                        } else {
                            const ddmmyyyyMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                            if (ddmmyyyyMatch) [, day, month, year] = ddmmyyyyMatch;
                        }
                        if (day && month && year) {
                            dateStr = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
                            punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                        if (!timeStr.match(/AM|PM/i)) timeStr = convertTo12Hour(timeStr);
                        timestamp_raw = `${dateStr} ${timeStr}`;
                    }
                    else {
                        if (values[1].match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                            timestamp_raw = values[1];
                        } else if (values.length >= 3 && values[2].match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                            timestamp_raw = values[2];
                        } else {
                            timestamp_raw = values[1];
                        }
                        const dateMatch = timestamp_raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                        if (dateMatch) {
                            const [, day, month, year] = dateMatch;
                            punch_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                    }

                    const employeeExists = employees.some(e => String(e.attendance_id) === String(attendance_id));
                    if (!employeeExists && !newWarnings.includes(`Row ${i + 1}: Unknown employee ${attendance_id}`)) {
                        newWarnings.push(`Row ${i + 1}: Unknown employee ${attendance_id}`);
                    }

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

    /* 
     * Mutation for uploading punches to the calendar period.
     * Links records via calendar_period_id.
     */
    const uploadMutation = useMutation({
        mutationFn: async () => {
            const punchRecords = parsedData.map(p => ({
                calendar_period_id: calendarPeriod.id, // Linked to calendar period
                attendance_id: p.attendance_id,
                timestamp_raw: p.timestamp_raw,
                punch_date: p.punch_date,
                company: calendarPeriod.company // Preserve company for filtering
            }));

            setUploadProgress({ 
              phase: 'Uploading punch records to database...', 
              current: 0, 
              total: punchRecords.length 
            });

            const batchSize = 25; // Increased batch size of 25 for better performance
            const BASE_DELAY = 200; // Reduced delay to 200ms
            const MAX_RETRIES = 3;
            let createdIds = []; // Tracking array for successful creations

            // Helper: retry with 429 retry logic with 2000ms wait
            const retryWithBackoff = async (fn, context) => {
                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        return await fn();
                    } catch (err) {
                        const isRateLimit = err?.status === 429 || 
                            err?.response?.status === 429 ||
                            /rate.?limit|too many|throttl/i.test(err?.message || '');
                        
                        if (isRateLimit && attempt < MAX_RETRIES) {
                            const backoff = 2000; // Fixed 2000ms wait
                            setUploadProgress(prev => ({
                                ...prev,
                                phase: `${context}: Rate limit hit — retrying in ${Math.round(backoff/1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`
                            }));
                            await new Promise(r => setTimeout(r, backoff));
                        } else {
                            throw err;
                        }
                    }
                }
            };

            try {
                for (let i = 0; i < punchRecords.length; i += batchSize) {
                    const batch = punchRecords.slice(i, i + batchSize);
                    
                    // Call bulkCreate and track IDs from successfully created records
                    const response = await retryWithBackoff(
                        () => base44.entities.Punch.bulkCreate(batch),
                        `Batch ${Math.floor(i / batchSize) + 1}`
                    );

                    // Track IDs for rollback on failure
                    if (response && Array.isArray(response)) {
                        createdIds.push(...response.map(r => r.id));
                    }

                    const uploaded = Math.min(i + batchSize, punchRecords.length);
                    const batchNum = Math.floor(i / batchSize) + 1;
                    const totalBatches = Math.ceil(punchRecords.length / batchSize);
                    
                    setUploadProgress({ 
                        phase: `Uploading batch ${batchNum}/${totalBatches}...`, 
                        current: uploaded, 
                        total: punchRecords.length 
                    });
                    
                    await new Promise(r => setTimeout(r, BASE_DELAY));
                }
            } catch (uploadError) {
                // Rollback: Deletion of all createdIds on failure
                setUploadProgress({
                    phase: `Upload failed — rolling back ${createdIds.length} records...`,
                    current: 0,
                    total: createdIds.length
                });

                if (createdIds.length > 0) {
                    let deletedCount = 0;
                    for (let i = 0; i < createdIds.length; i += 10) {
                        const rollbackBatch = createdIds.slice(i, i + 10);
                        for (const id of rollbackBatch) {
                            try {
                                await base44.entities.Punch.delete(id);
                                deletedCount++;
                            } catch (delErr) {
                                // Silent fail for single record delete during rollback
                            }
                        }
                        setUploadProgress(prev => ({
                            ...prev,
                            current: deletedCount,
                            phase: `Rolling back... ${deletedCount}/${createdIds.length}`
                        }));
                        await new Promise(r => setTimeout(r, 100)); // 100ms delay between rollback batches
                    }
                }
                throw uploadError;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', calendarPeriod.id]);
            toast.success('Punches uploaded successfully');
            setParsedData([]);
            setFile(null);
            setUploadProgress(null);
            setShowPreviewDialog(false);
        },
        onError: (error) => {
            queryClient.invalidateQueries(['punches', calendarPeriod.id]);
            const isRateLimit = error?.status === 429 || /rate.?limit|too many/i.test(error?.message || '');
            const msg = isRateLimit 
                ? 'Rate limit exceeded after retries. All uploaded records have been rolled back. Please wait a minute and try again.'
                : 'Upload failed: ' + (error.message || 'Unknown error') + '. All uploaded records have been rolled back.';
            toast.error(msg, { duration: 8000 });
            setUploadProgress(null);
        }
    });

    const updatePunchMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Punch.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['punches', calendarPeriod.id]);
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
            queryClient.invalidateQueries(['punches', calendarPeriod.id]);
            setSelectedPunches([]);
            toast.success('Punch deleted');
        },
        onError: (error) => {
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
            queryClient.invalidateQueries(['punches', calendarPeriod.id]);
            setSelectedPunches([]);
            toast.success('Punches deleted successfully');
            setUploadProgress(null);
        },
        onError: (error) => {
            toast.error('Failed to delete punches: ' + (error.message || 'Unknown error'));
            setUploadProgress(null);
        }
    });

    const enrichedPunches = React.useMemo(() => {
        const filtered = punches.filter(punch => {
            const matchesSearch = !searchTerm || (punch.attendance_id && punch.attendance_id.toLowerCase().includes(searchTerm.toLowerCase()));
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
            .map((punch) => ({
                id: punch.id,
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

            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Upload Punch Data</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Input type="file" accept=".csv" onChange={handleFileChange} />
                        <p className="text-sm text-slate-500 mt-2">
                            Format: attendance_id, name (optional), timestamp (DD/MM/YYYY HH:MM AM/PM)
                        </p>
                    </div>

                    {warnings.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-900">Warnings</p>
                                    <ul className="text-sm text-amber-700 mt-1 space-y-1">
                                        {warnings.map((warning, idx) => <li key={idx}>• {warning}</li>)}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {parsedData.length > 0 && (
                        <Button onClick={() => setShowPreviewDialog(true)} variant="outline">
                            <Eye className="w-4 h-4 mr-2" />
                            Preview & Edit ({parsedData.length} records)
                        </Button>
                    )}
                </CardContent>
            </Card>

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
                                <div className="text-sm text-slate-600">
                                    Total: {punches.length} records from {new Set(punches.map(p => p.attendance_id)).size} employees
                                </div>
                                <div className="flex gap-3">
                                    {selectedPunches.length > 0 && (
                                        <Button onClick={handleBulkDelete} variant="destructive" size="sm">
                                            <Trash2 className="w-4 h-4 mr-2" /> Delete {selectedPunches.length}
                                        </Button>
                                    )}
                                    <Input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        min={calendarPeriod.date_from}
                                        max={calendarPeriod.date_to}
                                        className="w-40"
                                    />
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        min={dateFrom || calendarPeriod.date_from}
                                        max={calendarPeriod.date_to}
                                        className="w-40"
                                    />
                                    <div className="relative w-64">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <Input
                                            placeholder="Filter ID..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-9"
                                        />
                                    </div>
                                </div>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">
                                            <Checkbox checked={selectedPunches.length === paginatedPunches.length && paginatedPunches.length > 0} onCheckedChange={toggleSelectAll} />
                                        </TableHead>
                                        <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>Employee ID</SortableTableHead>
                                        <SortableTableHead sortKey="employee_name" currentSort={sort} onSort={setSort}>Name</SortableTableHead>
                                        <SortableTableHead sortKey="timestamp_raw" currentSort={sort} onSort={setSort}>Time</SortableTableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedPunches.map((punch) => (
                                        <TableRow key={punch.id}>
                                            <TableCell><Checkbox checked={selectedPunches.includes(punch.id)} onCheckedChange={() => toggleSelectPunch(punch.id)} /></TableCell>
                                            <TableCell className="font-medium">{punch.attendance_id}</TableCell>
                                            <TableCell>{punch.employee_name}</TableCell>
                                            <TableCell>{punch.timestamp_raw}</TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="ghost" onClick={() => window.confirm('Delete?') && deleteMutation.mutate(punch.id)}>
                                                    <Trash2 className="w-4 h-4 text-red-600" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <TablePagination
                                totalItems={enrichedPunches.length}
                                currentPage={currentPage}
                                rowsPerPage={rowsPerPage}
                                onPageChange={setCurrentPage}
                                onRowsPerPageChange={(v) => { setRowsPerPage(v); setCurrentPage(1); }}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Preview Punch Data</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="border rounded-lg overflow-auto max-h-96">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Attendance ID</TableHead>
                                        <TableHead>Employee Name</TableHead>
                                        <TableHead>Timestamp</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedData.map((row, idx) => (
                                        <TableRow key={idx} className={!row.employeeExists ? 'bg-red-50' : ''}>
                                            <TableCell>{row.attendance_id}</TableCell>
                                            <TableCell>{employees.find(e => String(e.attendance_id) === String(row.attendance_id))?.name || 'Unknown'}</TableCell>
                                            <TableCell>{row.timestamp_raw}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex gap-3">
                            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                                {uploadMutation.isPending ? 'Uploading...' : 'Confirm & Upload'}
                            </Button>
                            <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>Cancel</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
