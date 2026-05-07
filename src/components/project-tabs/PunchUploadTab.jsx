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
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedPunches, setSelectedPunches] = useState([]);
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [uploadProgress, setUploadProgress] = useState(null);
    const [previewPunches, setPreviewPunches] = useState([]);
    const [showPreviewDialog, setShowPreviewDialog] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
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

    // Non-truncating punch fetch for Phase 1
    const fetchAllPunches = async (projectId) => {
        const all = [];
        let skip = 0;
        const limit = 1000;
        while (true) {
            const batch = await base44.entities.Punch.filter({ project_id: projectId }, { skip, limit });
            all.push(...batch);
            if (batch.length < limit) break;
            skip += limit;
        }
        return all;
    };

    const { data: punches = [], isFetching: isFetchingPunches } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => fetchAllPunches(project.id)
    });

    // Note: Astra Excel parsing logic is now handled in the backend processPunchUpload function
    // parseAstraExcel frontend version is preserved here only as a reference for Phase 2 previews if needed
    // or removed if strictly following "small and safe" Phase 1.
    // I will remove it to avoid confusion.

    // Polling for active UploadJob
    const { data: activeJob, refetch: refetchJob } = useQuery({
        queryKey: ['activeUploadJob', project.id, currentUser?.email],
        queryFn: async () => {
            const jobs = await base44.entities.UploadJob.filter({ 
                project_id: project.id, 
                user_email: currentUser?.email,
                status: ['pending', 'processing', 'rolling_back']
            }, { sort: { created_date: 'desc' }, limit: 1 });
            return jobs[0] || null;
        },
        enabled: !!currentUser?.email,
        refetchInterval: (query) => {
            const job = query.state.data;
            if (job && ['pending', 'processing', 'rolling_back'].includes(job.status)) {
                return 2000;
            }
            return false;
        }
    });

    // Handle job completion/failure
    React.useEffect(() => {
        if (activeJob?.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
            toast.success(`Upload completed successfully! ${activeJob.records_saved} records processed.`);
            // Clean up the job status so it doesn't keep showing as completed in a way that blocks UI
            base44.entities.UploadJob.update(activeJob.id, { status: 'archived' });
            setUploadProgress(null);
        } else if (activeJob?.status === 'failed') {
            toast.error(activeJob.error_message || 'The upload failed. Please try again.', { duration: 8000 });
            base44.entities.UploadJob.update(activeJob.id, { status: 'archived_failed' });
            setUploadProgress(null);
        }
    }, [activeJob?.status, project.id, queryClient]);

    const parseFileForPreview = async (selectedFile) => {
        try {
            setIsPreviewing(true);
            const data = await selectedFile.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const upload_type = project.company === 'Astra Auto Parts' ? 'astra' : 'universal';
            
            let parsedRecords = [];
            
            if (upload_type === 'astra') {
                if (!project.date_from) throw new Error("Astra Excel: Project dates are missing");
                const reportYear = project.date_from.split('-')[0];
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                const dayToDateMap = {};
                let daysRowIndex = -1;
                const monthMap = {
                    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
                    May: '05', Jun: '06', Jul: '07', Aug: '08',
                    Sep: '09', Oct: '10', Nov: '11', Dec: '12'
                };

                for (let r = 0; r < rows.length; r++) {
                    if (rows[r] && rows[r][1] && String(rows[r][1]).trim() === 'Days') {
                        daysRowIndex = r;
                        break;
                    }
                }

                if (daysRowIndex !== -1) {
                    const dateRow = rows[daysRowIndex];
                    for (let c = 0; c < dateRow.length; c++) {
                        const cellVal = dateRow[c];
                        if (cellVal && typeof cellVal === 'string') {
                            const dateMatch = cellVal.trim().match(/^(\d{2})-([A-Za-z]{3})$/);
                            if (dateMatch) {
                                const monthAbbr = dateMatch[2].charAt(0).toUpperCase() + dateMatch[2].slice(1).toLowerCase();
                                if (monthMap[monthAbbr]) {
                                    dayToDateMap[c] = `${reportYear}-${monthMap[monthAbbr]}-${dateMatch[1]}`;
                                }
                            }
                        }
                    }

                    for (let r = 0; r < rows.length; r++) {
                        const row = rows[r];
                        if (row && typeof row[1] === 'string' && row[1].trim().startsWith('Employee Code:-')) {
                            const empCode = row[6] != null ? String(row[6]).trim() : '';
                            let inTimeRow = null, outTimeRow = null;
                            for (let offset = 1; offset <= 12 && (r + offset) < rows.length; offset++) {
                                const label = rows[r + offset]?.[1];
                                if (label === 'In Time') inTimeRow = rows[r + offset];
                                else if (label === 'Out Time') outTimeRow = rows[r + offset];
                            }

                            const convertToAmPm = (time24, dateStr) => {
                                const cleaned = time24.replace(/\s*\(SE\)\s*$/i, '').trim();
                                const [hhRaw, mm] = cleaned.split(':');
                                let hh = parseInt(hhRaw || '0', 10);
                                const period = hh >= 12 ? 'PM' : 'AM';
                                if (hh > 12) hh -= 12;
                                if (hh === 0) hh = 12;
                                const [y, m, d] = dateStr.split('-');
                                return `${d}/${m}/${y} ${hh}:${(mm || '00').padStart(2, '0')} ${period}`;
                            };

                            for (const [colIndexStr, punch_date] of Object.entries(dayToDateMap)) {
                                const colIndex = parseInt(colIndexStr, 10);
                                const inStr = String(inTimeRow?.[colIndex] || '').trim();
                                const outStr = String(outTimeRow?.[colIndex] || '').trim();

                                if (inStr && inStr !== '00:00') {
                                    parsedRecords.push({ attendance_id: empCode, punch_date, timestamp_raw: convertToAmPm(inStr, punch_date) });
                                }
                                if (outStr && outStr !== '00:00' && !/\(SE\)\s*$/.test(outStr)) {
                                    parsedRecords.push({ attendance_id: empCode, punch_date, timestamp_raw: convertToAmPm(outStr, punch_date) });
                                }
                            }
                        }
                    }
                }
            } else {
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const csvData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                for (let i = 1; i < csvData.length; i++) {
                    const values = csvData[i];
                    if (values.length < 2) continue;
                    
                    const attendance_id = String(values[0]).trim();
                    let timestamp_raw = '';
                    if (values.length >= 4 && (String(values[2]).includes('/') || String(values[2]).includes('-'))) {
                        timestamp_raw = `${values[2]} ${values[3]}`;
                    } else if (values.length >= 3 && (String(values[2]).includes('/') || String(values[2]).includes('-'))) {
                        timestamp_raw = values[2];
                    } else {
                        timestamp_raw = values[1] || '';
                    }

                    if (attendance_id && timestamp_raw) {
                        parsedRecords.push({ attendance_id, timestamp_raw });
                    }
                }
            }

            setPreviewPunches(parsedRecords);
            setShowPreviewDialog(true);
            setFile(selectedFile);
        } catch (err) {
            toast.error('Failed to read file: ' + err.message);
        } finally {
            setIsPreviewing(false);
        }
    };

    const uploadMutation = useMutation({
        mutationFn: async (selectedFile) => {
            // 1. Upload to private storage
            setUploadProgress({ phase: 'Uploading file...', current: 0, total: 100 });
            const { file_uri } = await base44.integrations.Core.UploadPrivateFile({
                file: selectedFile
            });

            // 2. Start processPunchUpload
            setUploadProgress({ phase: 'Starting processing...', current: 0, total: 100 });
            
            // Determine upload type based on company
            let upload_type = 'universal';
            if (project.company === 'Astra Auto Parts') upload_type = 'astra';
            // Naser Mohsin uses universal parser logic in the backend too

            await base44.functions.invoke('processPunchUpload', {
                project_id: project.id,
                file_uri,
                file_metadata: {
                    name: selectedFile.name,
                    type: selectedFile.type,
                    size: selectedFile.size
                },
                upload_type
            });
        },
        onSuccess: () => {
            setFile(null);
            setShowPreviewDialog(false);
            setPreviewPunches([]);
            refetchJob();
        },
        onError: (error) => {
            setUploadProgress(null);
            toast.error('Failed to start upload: ' + (error.message || 'Unknown error'));
        }
    });

    const handleFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            parseFileForPreview(selectedFile);
        }
    };

    // Removed legacy client-side upload mutation

    const updatePunchMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Punch.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
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
            queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
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
            queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
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
            {/* Upload Progress (Backend Job) */}
            {(uploadProgress || activeJob) && (
                <Card className="border-0 shadow-sm bg-indigo-50/50 ring-1 ring-indigo-100 rounded-xl">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-semibold text-indigo-900">
                                    {activeJob?.status === 'processing' ? 'Processing records...' : 
                                     activeJob?.status === 'rolling_back' ? 'Cleaning up failed upload...' :
                                     uploadProgress?.phase || 'Initializing...'}
                                </p>
                                <p className="text-sm text-indigo-700 mt-1">
                                    {activeJob ? (
                                        <>
                                            {activeJob.records_saved} / {activeJob.records_total} records processed 
                                            {activeJob.records_invalid_data > 0 && ` (${activeJob.records_invalid_data} invalid)`}
                                        </>
                                    ) : (
                                        `${uploadProgress?.current || 0} / ${uploadProgress?.total || 100} records completed`
                                    )}
                                </p>
                            </div>
                        </div>
                        <Progress value={activeJob ? activeJob.progress : (uploadProgress?.current / uploadProgress?.total) * 100} className="bg-indigo-100" />
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
                            disabled={uploadMutation.isPending || (activeJob && ['pending', 'processing', 'rolling_back'].includes(activeJob.status))}
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
                                    <TableHeader className="sticky top-0 bg-slate-50/90 backdrop-blur-md z-10 border-b border-slate-200/60 shadow-sm">
                                        <TableRow className="hover:bg-transparent border-b border-slate-200">
                                           {!isUser && (
                                               <TableHead className="w-12">
                                                   <Checkbox
                                                       checked={selectedPunches.length === paginatedPunches.length && paginatedPunches.length > 0}
                                                       onCheckedChange={toggleSelectAll}
                                                       className="border-slate-300 data-[state=checked]:bg-indigo-600"
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
                                           <TableRow key={punch.id} className="hover:bg-slate-50/80 transition-colors duration-200 border-b border-slate-100 last:border-0 text-slate-700">
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
            <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Preview Punch Records</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto py-4">
                        <p className="text-sm text-slate-500 mb-4">
                            Found {previewPunches.length} potential records in <strong>{file?.name}</strong>. 
                            Please review the first few records below.
                        </p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee ID</TableHead>
                                    <TableHead>Employee Name</TableHead>
                                    <TableHead>Timestamp (Raw)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewPunches.slice(0, 10).map((p, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{p.attendance_id}</TableCell>
                                        <TableCell>{employees.find(e => String(e.attendance_id) === String(p.attendance_id))?.name || 'Unknown'}</TableCell>
                                        <TableCell>{p.timestamp_raw}</TableCell>
                                    </TableRow>
                                ))}
                                {previewPunches.length > 10 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-slate-400 italic">
                                            ... and {previewPunches.length - 10} more records
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={() => uploadMutation.mutate(file)}
                            disabled={uploadMutation.isPending}
                        >
                            {uploadMutation.isPending ? 'Starting Upload...' : `Confirm Upload (${previewPunches.length} records)`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}