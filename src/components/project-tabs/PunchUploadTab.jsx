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
    const [previewIssues, setPreviewIssues] = useState({
        missingId: 0,
        unmatchedId: 0,
        invalidTime: 0,
        duplicates: 0,
        layoutError: false
    });
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

    // Poll latest UploadJob so the UI can always resolve processing, success, or failure states
    const { data: activeJob, refetch: refetchJob } = useQuery({
        queryKey: ['activeUploadJob', project.id, currentUser?.email],
        queryFn: async () => {
            const jobs = await base44.entities.UploadJob.filter({ 
                project_id: project.id, 
                user_email: currentUser?.email
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

    const visibleJob = activeJob && !['archived', 'archived_failed'].includes(activeJob.status) ? activeJob : null;

    // Handle job completion/failure and always clear local progress so the page never gets stuck
    React.useEffect(() => {
        if (!activeJob?.id) return;

        if (activeJob.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
            const saved = activeJob.records_saved || 0;
            const skipped = (activeJob.records_invalid_data || 0) + (activeJob.records_invalid_format || 0) + (activeJob.records_duplicate || 0);
            toast.success(`Upload finished. ${saved} punch records saved${skipped ? `, ${skipped} skipped` : ''}.`);
            base44.entities.UploadJob.update(activeJob.id, { status: 'archived' });
            setUploadProgress(null);
            setFile(null);
        } else if (activeJob.status === 'failed') {
            toast.error(activeJob.error_message || 'Upload failed. No punch records were saved.', { duration: 10000 });
            base44.entities.UploadJob.update(activeJob.id, { status: 'archived_failed' });
            setUploadProgress(null);
        }
    }, [activeJob?.id, activeJob?.status, project.id, queryClient]);

    const parseFileForPreview = async (selectedFile) => {
        try {
            setIsPreviewing(true);
            const data = await selectedFile.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const upload_type = project.company === 'Astra Auto Parts' ? 'astra' : 'universal';
            
            let parsedRecords = [];
            let issues = {
                missingId: 0,
                unmatchedId: 0,
                invalidTime: 0,
                duplicates: 0,
                layoutError: false
            };
            
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
                                if (!cleaned || cleaned === '00:00') return null;
                                
                                const [hhRaw, mm] = cleaned.split(':');
                                let hh = parseInt(hhRaw || '0', 10);
                                if (isNaN(hh)) return null;
                                
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
                                    const ts = convertToAmPm(inStr, punch_date);
                                    if (ts) {
                                        parsedRecords.push({ attendance_id: empCode, punch_date, timestamp_raw: ts });
                                    } else {
                                        issues.invalidTime++;
                                    }
                                }
                                if (outStr && outStr !== '00:00' && !/\(SE\)\s*$/.test(outStr)) {
                                    const ts = convertToAmPm(outStr, punch_date);
                                    if (ts) {
                                        parsedRecords.push({ attendance_id: empCode, punch_date, timestamp_raw: ts });
                                    } else {
                                        issues.invalidTime++;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    issues.layoutError = true;
                }
            } else {
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const csvData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                if (csvData.length <= 1) {
                    issues.layoutError = true;
                }

                for (let i = 1; i < csvData.length; i++) {
                    const values = csvData[i];
                    if (values.length < 2) continue;
                    
                    const attendance_id = values[0] != null ? String(values[0]).trim() : '';
                    let timestamp_raw = '';
                    if (values.length >= 4 && (String(values[2]).includes('/') || String(values[2]).includes('-'))) {
                        timestamp_raw = `${values[2]} ${values[3]}`;
                    } else if (values.length >= 3 && (String(values[2]).includes('/') || String(values[2]).includes('-'))) {
                        timestamp_raw = values[2];
                    } else {
                        timestamp_raw = values[1] || '';
                    }

                    if (attendance_id || timestamp_raw) {
                        parsedRecords.push({ attendance_id, timestamp_raw });
                    }
                }
            }

            // In-app inconsistency checks
            const seen = new Set();
            parsedRecords = parsedRecords.map(rec => {
                const hasId = !!rec.attendance_id;
                const empExists = hasId && employees.some(e => String(e.attendance_id) === String(rec.attendance_id));
                
                const key = `${rec.attendance_id}_${rec.timestamp_raw}`;
                const isDuplicate = seen.has(key);
                seen.add(key);

                // Simple time check for universal format
                let timeInvalid = false;
                if (upload_type !== 'astra' && rec.timestamp_raw) {
                    // Expecting something with / or - and :
                    if (!rec.timestamp_raw.match(/[\/\-].*[:]/)) {
                        timeInvalid = true;
                    }
                }

                if (!hasId) issues.missingId++;
                else if (!empExists) issues.unmatchedId++;
                if (isDuplicate) issues.duplicates++;
                if (timeInvalid) issues.invalidTime++;

                return {
                    ...rec,
                    _issues: {
                        missingId: !hasId,
                        unmatchedId: hasId && !empExists,
                        duplicate: isDuplicate,
                        invalidTime: timeInvalid
                    }
                };
            });

            setPreviewIssues(issues);
            setPreviewPunches(parsedRecords);
            setShowPreviewDialog(true);
            setFile(selectedFile);
        } catch (err) {
            toast.error('Could not read the file correctly. Please check the file format and try again.');
        } finally {
            setIsPreviewing(false);
        }
    };

    const uploadMutation = useMutation({
        onMutate: () => {
            setShowPreviewDialog(false);
            setUploadProgress({
                phase: 'Uploading file...',
                current: 0,
                total: previewPunches.length || 1
            });
        },
        mutationFn: async (selectedFile) => {
            // 1. Upload to private storage
            setUploadProgress({ phase: 'Uploading file...', current: 0, total: previewPunches.length || 1 });
            const { file_uri } = await base44.integrations.Core.UploadPrivateFile({
                file: selectedFile
            });

            // 2. Start processPunchUpload
            setUploadProgress({
                phase: 'Checking and saving punch records...',
                current: 0,
                total: previewPunches.length || 1
            });
            
            // Determine upload type based on company
            let upload_type = 'universal';
            if (project.company === 'Astra Auto Parts') upload_type = 'astra';
            // Naser Mohsin uses universal parser logic in the backend too

            const response = await base44.functions.invoke('processPunchUpload', {
                project_id: project.id,
                file_uri,
                file_metadata: {
                    name: selectedFile.name,
                    type: selectedFile.type,
                    size: selectedFile.size
                },
                upload_type
            });

            return response.data;
        },
        onSuccess: (result) => {
            setPreviewPunches([]);
            refetchJob();

            if (result?.success) {
                queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
                setUploadProgress(null);
                setFile(null);
                toast.success(`Upload finished. ${result.records_saved || 0} punch records saved${result.records_skipped ? `, ${result.records_skipped} skipped` : ''}.`);
            }
        },
        onError: (error) => {
            setShowPreviewDialog(false);
            setUploadProgress(null);
            setPreviewPunches([]);
            refetchJob();
            const message = error?.response?.data?.error || error?.message || 'Upload failed. No punch records were saved.';
            toast.error(message, { duration: 10000 });
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
            {(uploadProgress || visibleJob) && (
                <Card className="border-0 shadow-sm bg-indigo-50/50 ring-1 ring-indigo-100 rounded-xl">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-semibold text-indigo-900">
                                    {visibleJob?.status === 'processing' ? 'Processing records...' : 
                                     visibleJob?.status === 'rolling_back' ? 'Cleaning up failed upload...' :
                                     uploadProgress?.phase || 'Initializing...'}
                                </p>
                                <p className="text-sm text-indigo-700 mt-1">
                                    {visibleJob ? (
                                        <>
                                            {visibleJob.records_saved} / {visibleJob.records_total} records processed 
                                            {visibleJob.records_invalid_data > 0 && ` (${visibleJob.records_invalid_data} invalid)`}
                                        </>
                                    ) : (
                                        `${uploadProgress?.total || 0} records selected for import`
                                    )}
                                </p>
                            </div>
                        </div>
                        <Progress value={visibleJob ? (visibleJob.progress || 0) : (uploadProgress?.current / uploadProgress?.total) * 100} className="bg-indigo-100" />
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
                        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {previewIssues.layoutError ? (
                                <div className="col-span-full bg-red-50 border border-red-100 p-4 rounded-lg flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-red-900">Unsupported File Layout</p>
                                        <p className="text-sm text-red-700">The file structure doesn't match what we expect. Please check the sample format above.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className={`p-3 rounded-lg border ${previewIssues.missingId > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Missing IDs</p>
                                        <p className={`text-2xl font-bold ${previewIssues.missingId > 0 ? 'text-amber-600' : 'text-slate-600'}`}>{previewIssues.missingId}</p>
                                    </div>
                                    <div className={`p-3 rounded-lg border ${previewIssues.unmatchedId > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Unknown Employees</p>
                                        <p className={`text-2xl font-bold ${previewIssues.unmatchedId > 0 ? 'text-amber-600' : 'text-slate-600'}`}>{previewIssues.unmatchedId}</p>
                                    </div>
                                    <div className={`p-3 rounded-lg border ${previewIssues.invalidTime > 0 ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Invalid Times</p>
                                        <p className={`text-2xl font-bold ${previewIssues.invalidTime > 0 ? 'text-amber-600' : 'text-slate-600'}`}>{previewIssues.invalidTime}</p>
                                    </div>
                                    <div className={`p-3 rounded-lg border ${previewIssues.duplicates > 0 ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Duplicate Rows</p>
                                        <p className={`text-2xl font-bold ${previewIssues.duplicates > 0 ? 'text-blue-600' : 'text-slate-600'}`}>{previewIssues.duplicates}</p>
                                    </div>
                                </>
                            )}
                        </div>

                        <p className="text-sm text-slate-500 mb-4">
                            Showing first 50 records from <strong>{file?.name}</strong>. 
                            {previewIssues.unmatchedId > 0 && " Records with unknown IDs will be skipped during upload."}
                        </p>
                        
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>Employee ID</TableHead>
                                        <TableHead>Employee Name</TableHead>
                                        <TableHead>Timestamp (Raw)</TableHead>
                                        <TableHead className="w-24 text-center">Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previewPunches.slice(0, 50).map((p, i) => {
                                        const hasError = p._issues.missingId || p._issues.unmatchedId || p._issues.invalidTime;
                                        const isWarning = p._issues.duplicate;
                                        
                                        return (
                                            <TableRow key={i} className={hasError ? 'bg-red-50/50' : isWarning ? 'bg-amber-50/50' : ''}>
                                                <TableCell className="font-mono text-xs">{p.attendance_id || <span className="text-red-500 font-sans italic">Missing</span>}</TableCell>
                                                <TableCell>{employees.find(e => String(e.attendance_id) === String(p.attendance_id))?.name || <span className="text-slate-400 italic">Unknown</span>}</TableCell>
                                                <TableCell className={p._issues.invalidTime ? 'text-red-600' : ''}>{p.timestamp_raw}</TableCell>
                                                <TableCell className="text-center">
                                                    {hasError ? (
                                                        <AlertTriangle className="w-4 h-4 text-red-500 mx-auto" />
                                                    ) : isWarning ? (
                                                        <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" title="Duplicate record" />
                                                    ) : (
                                                        <span className="text-green-600 text-xs font-medium">Ready</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {previewPunches.length > 50 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-slate-400 italic py-4">
                                                ... and {previewPunches.length - 50} more records
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button variant="outline" onClick={() => setShowPreviewDialog(false)} disabled={uploadMutation.isPending}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={() => uploadMutation.mutate(file)}
                            disabled={uploadMutation.isPending || previewIssues.layoutError || previewPunches.length === 0}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {uploadMutation.isPending ? 'Starting Upload...' : `Confirm & Save ${previewPunches.length} Records`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}