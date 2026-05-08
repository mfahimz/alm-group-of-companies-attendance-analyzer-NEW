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

const ACTIVE_UPLOAD_STATUSES = ['pending', 'processing', 'rolling_back'];
const FINAL_UPLOAD_STATUSES = ['completed', 'failed'];
const TRACKED_UPLOAD_STATUSES = [...ACTIVE_UPLOAD_STATUSES, ...FINAL_UPLOAD_STATUSES];

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
    const handledUploadJobsRef = React.useRef(new Set());

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

    // Non-truncating punch fetch with correct SDK pagination
    const fetchAllPunches = async (projectId) => {
        const all = [];
        let skip = 0;
        const limit = 500;
        while (true) {
            const batch = await base44.entities.Punch.filter({ project_id: projectId }, '-created_date', limit, skip);
            all.push(...batch);
            if (!Array.isArray(batch) || batch.length < limit) break;
            skip += limit;
        }
        return all;
    };

    const { data: punches = [], isFetching: isFetchingPunches, refetch: refetchPunches } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => fetchAllPunches(project.id)
    });

    React.useEffect(() => {
        if (!project?.id) return;

        let refreshTimer;
        const scheduleRefresh = () => {
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
                refetchPunches();
            }, 800);
        };

        const unsubscribe = base44.entities.Punch.subscribe((event) => {
            if (event?.data?.project_id === project.id) {
                scheduleRefresh();
            }
        });

        return () => {
            clearTimeout(refreshTimer);
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }, [project?.id, queryClient, refetchPunches]);

    // Note: Astra Excel parsing logic is now handled in the backend processPunchUpload function
    // parseAstraExcel frontend version is preserved here only as a reference for Phase 2 previews if needed
    // or removed if strictly following "small and safe" Phase 1.
    // I will remove it to avoid confusion.

    // Poll latest UploadJob so the UI can show active progress and also catch completion/failure once.
    const { data: activeJob, refetch: refetchJob } = useQuery({
        queryKey: ['activeUploadJob', project.id, currentUser?.email],
        queryFn: async () => {
            const jobs = await base44.entities.UploadJob.filter({ 
                project_id: project.id, 
                user_email: currentUser?.email
            }, '-created_date', 10);
            return jobs.find(job => ACTIVE_UPLOAD_STATUSES.includes(job.status)) || null;
        },
        enabled: !!currentUser?.email,
        refetchInterval: (query) => {
            const job = query.state.data;
            if (uploadProgress || (job && ACTIVE_UPLOAD_STATUSES.includes(job.status))) {
                return 2000;
            }
            return false;
        }
    });

    const visibleJob = activeJob && ACTIVE_UPLOAD_STATUSES.includes(activeJob.status) ? activeJob : null;

    // Handle job completion/failure and always clear local progress so the page never gets stuck.
    React.useEffect(() => {
        if (!activeJob?.id || !FINAL_UPLOAD_STATUSES.includes(activeJob.status)) return;
        if (handledUploadJobsRef.current.has(activeJob.id)) return;
        handledUploadJobsRef.current.add(activeJob.id);

        if (activeJob.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
            refetchPunches();
            setCurrentPage(1);
            const saved = activeJob.records_saved || 0;
            const skipped = (activeJob.records_invalid_data || 0) + (activeJob.records_invalid_format || 0) + (activeJob.records_duplicate || 0);
            toast.success(`Upload finished. ${saved} punch records saved${skipped ? `, ${skipped} skipped` : ''}.`);
            base44.entities.UploadJob.update(activeJob.id, { status: 'archived' });
            setUploadProgress(null);
            setFile(null);
            setPreviewPunches([]);
        } else if (activeJob.status === 'failed') {
            toast.error(activeJob.error_message || 'Upload failed. No punch records were saved.', { duration: 10000 });
            base44.entities.UploadJob.update(activeJob.id, { status: 'archived_failed' });
            setUploadProgress(null);
        }
    }, [activeJob?.id, activeJob?.status, project.id, queryClient, refetchPunches]);

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
                current: 5,
                total: 100
            });
            setTimeout(() => refetchJob(), 1000);
        },
        mutationFn: async (selectedFile) => {
            // 1. Upload to private storage
            setUploadProgress({ phase: 'Uploading file...', current: 10, total: 100 });
            const { file_uri } = await base44.integrations.Core.UploadPrivateFile({
                file: selectedFile
            });

            // 2. Start processPunchUpload
            setUploadProgress({
                phase: 'Checking and saving punch records...',
                current: 20,
                total: 100
            });
            setTimeout(() => refetchJob(), 1500);
            
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
        onSuccess: async (result) => {
            setPreviewPunches([]);
            await queryClient.invalidateQueries({ queryKey: ['activeUploadJob', project.id, currentUser?.email] });
            await refetchJob();

            if (result?.success) {
                await queryClient.invalidateQueries({ queryKey: ['punches', project.id] });
                await refetchPunches();
                setCurrentPage(1);
                setUploadProgress(null);
                setFile(null);

                toast.success(`Upload finished. ${result.records_saved || 0} punch records saved${result.records_skipped ? `, ${result.records_skipped} skipped` : ''}.`);

                if (result.upload_job_id) {
                    await base44.entities.UploadJob.update(result.upload_job_id, { status: 'archived' });
                }
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

    const uploadFeedback = (() => {
        const localValue = ((uploadProgress?.current || 0) / (uploadProgress?.total || 100)) * 100;

        if (!visibleJob) {
            return {
                title: uploadProgress?.phase || uploadProgress?.status || 'Preparing upload...',
                detail: uploadMutation.isPending
                    ? `${previewPunches.length || 0} records selected. Upload is starting...`
                    : 'Checking latest upload status...',
                value: localValue
            };
        }

        const total = visibleJob.records_total || visibleJob.records_parsed || 0;
        const toSave = visibleJob.records_to_save || 0;
        const saved = visibleJob.records_saved || 0;
        const skipped = (visibleJob.records_invalid_data || 0) + (visibleJob.records_invalid_format || 0) + (visibleJob.records_duplicate || 0);
        const progress = visibleJob.progress || 0;

        let title = 'Processing upload...';
        if (visibleJob.status === 'pending') title = 'Upload queued...';
        if (visibleJob.status === 'processing') {
            if (progress < 30 || total === 0) title = 'Reading and parsing punch file...';
            else if (progress < 50) title = 'Validating employees and duplicates...';
            else title = 'Saving punch records...';
        }
        if (visibleJob.status === 'rolling_back') title = 'Cleaning up failed upload...';

        return {
            title,
            detail: total > 0
                ? `Scanned ${total} records. Saved ${saved}${toSave ? ` of ${toSave} valid records` : ''}${skipped ? `. Skipped ${skipped}` : ''}.`
                : 'Reading the file and detecting punch rows...',
            value: progress
        };
    })();

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-12">
            {/* 1. Strong Section Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1.5">
                    <h2 className="text-3xl font-bold tracking-tight text-slate-900">Punch Data Management</h2>
                    <p className="text-slate-500 text-base max-w-2xl">
                        Upload employee attendance records, verify data integrity, and manage existing punch logs for this project.
                    </p>
                </div>
            </div>

            {/* 3. Upload status / active job card - Improved */}
            {((uploadMutation.isPending && uploadProgress) || visibleJob) && (
                <Card className="border-0 shadow-lg bg-white overflow-hidden ring-1 ring-indigo-100 rounded-2xl">
                    <div className="h-1.5 bg-indigo-100 w-full overflow-hidden">
                        <div 
                            className="h-full bg-indigo-600 transition-all duration-500 ease-out" 
                            style={{ width: `${uploadFeedback.value}%` }}
                        />
                    </div>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-5">
                            <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                                <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent" />
                            </div>
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                    <p className="font-bold text-lg text-slate-900">
                                        {uploadFeedback.title}
                                    </p>
                                    <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">
                                        {Math.round(uploadFeedback.value)}%
                                    </span>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                    <p>
                                        {uploadFeedback.detail}
                                    </p>
                                    <div className="h-1 w-1 rounded-full bg-slate-300" />
                                    <p className="italic">Please do not close this window</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* 2. Upload card - Prominent & Polished */}
                <Card className="lg:col-span-4 border-0 shadow-sm bg-white overflow-hidden rounded-2xl flex flex-col">
                    <CardHeader className="border-b border-slate-50 bg-slate-50/30">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                                <Upload className="w-5 h-5" />
                            </div>
                            <CardTitle className="text-xl">Import Data</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6 flex-1 flex flex-col justify-between">
                        <div className="space-y-6">
                            <div className="relative group">
                                <input
                                    type="file"
                                    id="punch-upload"
                                    className="hidden"
                                    accept=".csv, .xlsx, .xls"
                                    onChange={handleFileChange}
                                    disabled={uploadMutation.isPending || (visibleJob && ACTIVE_UPLOAD_STATUSES.includes(visibleJob.status))}
                                />
                                <label 
                                    htmlFor="punch-upload"
                                    className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300
                                        ${uploadMutation.isPending || (visibleJob && ACTIVE_UPLOAD_STATUSES.includes(visibleJob.status))
                                            ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60' 
                                            : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-400 hover:shadow-md'
                                        }`}
                                >
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                                        <div className={`p-3 rounded-full mb-3 transition-colors ${uploadMutation.isPending ? 'bg-slate-100' : 'bg-indigo-50 group-hover:bg-indigo-100'}`}>
                                            <Upload className={`w-8 h-8 ${uploadMutation.isPending ? 'text-slate-400' : 'text-indigo-600'}`} />
                                        </div>
                                        <p className="mb-2 text-sm text-slate-700 font-semibold">
                                            {isPreviewing ? 'Reading file...' : 'Click to upload or drag and drop'}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            Excel or CSV files only
                                        </p>
                                    </div>
                                </label>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Instructions</h4>
                                <div className="space-y-4">
                                    {project.company === 'Astra Auto Parts' ? (
                                        <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-amber-900">
                                            <p className="text-xs font-semibold mb-1">Astra Format Detected</p>
                                            <p className="text-xs leading-relaxed opacity-80">
                                                Please upload the monthly "In-Out" report. Ensure the project dates match the report month.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex gap-3">
                                                <div className="h-5 w-5 rounded bg-slate-100 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</div>
                                                <p className="text-xs text-slate-600 leading-relaxed">
                                                    Required columns: <span className="font-semibold text-slate-900">attendance_id</span> and <span className="font-semibold text-slate-900">timestamp</span>.
                                                </p>
                                            </div>
                                            <div className="flex gap-3">
                                                <div className="h-5 w-5 rounded bg-slate-100 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</div>
                                                <p className="text-xs text-slate-600 leading-relaxed">
                                                    Timestamp format: <code className="bg-slate-100 px-1 rounded text-indigo-600">DD/MM/YYYY HH:MM AM/PM</code>
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-slate-50 mt-auto">
                            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                                For best results, use the standard attendance export from your ZKTeco or BioTime machine.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* 4. Punch data workspace card - Cleaner & Stronger */}
                <Card className="lg:col-span-8 border-0 shadow-sm bg-white overflow-hidden rounded-2xl">
                    <CardHeader className="border-b border-slate-50 bg-slate-50/30 flex-row items-center justify-between space-y-0 py-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                                <Search className="w-5 h-5" />
                            </div>
                            <CardTitle className="text-xl">Records Explorer</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                             <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                                {punches.length} total records
                            </span>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        {punches.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
                                <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                    <Upload className="w-10 h-10 text-slate-200" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-900">No punch data yet</h3>
                                <p className="text-slate-500 max-w-sm mt-1">
                                    Start by uploading an attendance file. Once processed, your records will appear here for management.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                {/* Toolbar */}
                                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-2 p-1 bg-white rounded-lg border border-slate-200 shadow-sm">
                                            <input
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
                                                className="bg-transparent border-0 text-sm focus:ring-0 w-36 px-2 py-1 h-8"
                                            />
                                            <div className="h-4 w-px bg-slate-200" />
                                            <input
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
                                                className="bg-transparent border-0 text-sm focus:ring-0 w-36 px-2 py-1 h-8"
                                            />
                                        </div>

                                        <div className="relative group">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                            <Input
                                                placeholder="Search ID..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="pl-9 h-10 w-48 bg-white border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 transition-all rounded-lg"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {selectedPunches.length > 0 && !isUser && (
                                            <Button 
                                                onClick={handleBulkDelete}
                                                variant="destructive"
                                                size="sm"
                                                className="h-10 px-4 rounded-lg shadow-sm animate-in fade-in slide-in-from-right-2"
                                                disabled={bulkDeleteMutation.isPending}
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                Delete Selected ({selectedPunches.length})
                                            </Button>
                                        )}
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
                                            <TableRow key={punch.id} className="hover:bg-indigo-50/30 transition-colors duration-200 border-b border-slate-100 last:border-0 text-slate-700 group">
                                               {!isUser && (
                                                   <TableCell className="py-4">
                                                       <Checkbox
                                                           checked={selectedPunches.includes(punch.id)}
                                                           onCheckedChange={() => toggleSelectPunch(punch.id)}
                                                           className="border-slate-300 data-[state=checked]:bg-indigo-600 shadow-sm"
                                                       />
                                                   </TableCell>
                                               )}

                                                <TableCell className="font-semibold text-slate-900 py-4">

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
                                                    <TableCell className="text-right py-4">
                                                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                                onClick={() => {
                                                                    if (window.confirm('Delete this punch record?')) {
                                                                        deleteMutation.mutate(punch.id);
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
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
            </div>
            <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 border-0 shadow-2xl rounded-2xl overflow-hidden">
                    <DialogHeader className="p-6 bg-white border-b">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <DialogTitle className="text-2xl font-bold text-slate-900">Verify Import Data</DialogTitle>
                                <p className="text-slate-500 text-sm">Review identified records and potential issues before saving.</p>
                            </div>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-auto bg-slate-50/50 p-6 space-y-6">
                        {previewIssues.layoutError ? (
                            <div className="bg-red-50 border border-red-100 p-5 rounded-2xl flex items-start gap-4">
                                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-6 h-6 text-red-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-red-900 text-lg">Unsupported File Layout</p>
                                    <p className="text-sm text-red-700 mt-1 leading-relaxed">
                                        The file structure doesn't match our required template. Please ensure your file matches the column format shown in the instructions.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Summary Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className={`p-4 rounded-2xl border bg-white shadow-sm transition-all ${previewIssues.missingId > 0 ? 'border-red-100' : 'border-slate-100'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Missing IDs</p>
                                        <div className="flex items-baseline gap-2">
                                            <p className={`text-2xl font-black ${previewIssues.missingId > 0 ? 'text-red-600' : 'text-slate-900'}`}>{previewIssues.missingId}</p>
                                            {previewIssues.missingId > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
                                        </div>
                                    </div>
                                    <div className={`p-4 rounded-2xl border bg-white shadow-sm transition-all ${previewIssues.unmatchedId > 0 ? 'border-amber-100' : 'border-slate-100'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Unknown Staff</p>
                                        <p className={`text-2xl font-black ${previewIssues.unmatchedId > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{previewIssues.unmatchedId}</p>
                                    </div>
                                    <div className={`p-4 rounded-2xl border bg-white shadow-sm transition-all ${previewIssues.invalidTime > 0 ? 'border-red-100' : 'border-slate-100'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Invalid Time</p>
                                        <p className={`text-2xl font-black ${previewIssues.invalidTime > 0 ? 'text-red-600' : 'text-slate-900'}`}>{previewIssues.invalidTime}</p>
                                    </div>
                                    <div className={`p-4 rounded-2xl border bg-white shadow-sm transition-all ${previewIssues.duplicates > 0 ? 'border-blue-100' : 'border-slate-100'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Duplicates</p>
                                        <p className={`text-2xl font-black ${previewIssues.duplicates > 0 ? 'text-blue-600' : 'text-slate-900'}`}>{previewIssues.duplicates}</p>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <h3 className="text-sm font-bold text-slate-900">Data Preview (First 50 records)</h3>
                                        <p className="text-xs text-slate-500">Source: <span className="font-medium text-slate-700 italic">{file?.name}</span></p>
                                    </div>
                                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                                        <Table>
                                            <TableHeader className="bg-slate-50/50">
                                                <TableRow className="hover:bg-transparent border-b border-slate-100">
                                                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Employee ID</TableHead>
                                                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Employee Name</TableHead>
                                                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Timestamp (Raw)</TableHead>
                                                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {previewPunches.slice(0, 50).map((p, i) => {
                                                    const hasError = p._issues.missingId || p._issues.unmatchedId || p._issues.invalidTime;
                                                    const isWarning = p._issues.duplicate;
                                                    
                                                    return (
                                                        <TableRow key={i} className={`border-b border-slate-50 last:border-0 ${hasError ? 'bg-red-50/30' : isWarning ? 'bg-amber-50/20' : ''}`}>
                                                            <TableCell className="py-3">
                                                                <span className={`font-mono text-xs px-2 py-1 rounded bg-slate-100 ${p._issues.missingId ? 'text-red-600 bg-red-100 font-bold' : 'text-slate-700'}`}>
                                                                    {p.attendance_id || 'MISSING'}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="py-3">
                                                                {employees.find(e => String(e.attendance_id) === String(p.attendance_id))?.name || (
                                                                    <span className="text-slate-400 italic text-sm">Unknown Employee</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className={`py-3 text-sm ${p._issues.invalidTime ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                                                                {p.timestamp_raw}
                                                            </TableCell>
                                                            <TableCell className="py-3 text-right">
                                                                {hasError ? (
                                                                    <div className="flex items-center justify-end gap-1.5 text-red-600">
                                                                        <span className="text-[10px] font-bold uppercase tracking-tighter">Fix Required</span>
                                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                                    </div>
                                                                ) : isWarning ? (
                                                                    <div className="flex items-center justify-end gap-1.5 text-amber-600">
                                                                        <span className="text-[10px] font-bold uppercase tracking-tighter">Duplicate</span>
                                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center justify-end gap-1.5 text-emerald-600">
                                                                        <span className="text-[10px] font-bold uppercase tracking-tighter">Ready</span>
                                                                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                                {previewPunches.length > 50 && (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="text-center text-slate-400 italic py-6 bg-slate-50/30">
                                                            And {previewPunches.length - 50} more records in this file...
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    
                    <div className="p-6 bg-white border-t flex items-center justify-between">
                        <div className="text-xs text-slate-400">
                            {previewIssues.unmatchedId > 0 && "* Unknown records will be automatically ignored."}
                        </div>
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={() => setShowPreviewDialog(false)} className="px-6 text-slate-500 hover:text-slate-900">
                                Cancel
                            </Button>
                            <Button 
                                onClick={() => uploadMutation.mutate(file)}
                                disabled={uploadMutation.isPending || previewIssues.layoutError || previewPunches.length === 0}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 h-11 rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95"
                            >
                                {uploadMutation.isPending ? (
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                        <span>Saving...</span>
                                    </div>
                                ) : (
                                    `Confirm & Save ${previewPunches.length} Records`
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
}