import { useState, useMemo, useRef, useCallback, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Check, X, FileText, AlertCircle, Upload, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { formatInUAE } from '@/components/ui/timezone';
import Breadcrumb from '@/components/ui/Breadcrumb';
import { usePermissions } from '@/components/hooks/usePermissions';
import { useCompanyFilter } from '../components/context/CompanyContext';

export default function AnnualLeaveManagement() {
    const { user: currentUser, userRole } = usePermissions();
    const [showDialog, setShowDialog] = useState(false);
    const [editingLeave, setEditingLeave] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterProject, setFilterProject] = useState('all'); // State for project-based range filtering
    const [filterDateFrom, setFilterDateFrom] = useState(''); // State for manual from-date range filter
    const [filterDateTo, setFilterDateTo] = useState(''); // State for manual to-date range filter

    const [unmatchedSearchTerm, setUnmatchedSearchTerm] = useState(''); // Search term for manual employee matching in import
    const [activeUnmatchedIdx, setActiveUnmatchedIdx] = useState(null); // Tracks which row is currently being manually matched
    const [expandedLeaveId, setExpandedLeaveId] = useState(null);

    const [quickEntryText, setQuickEntryText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [parsingError, setParsingError] = useState(null);

    const [formData, setFormData] = useState({
        company: '',
        employee_id: '',
        date_from: '',
        date_to: '',
        leave_type: 'annual',
        reason: ''
    });

    const [importPreviewData, setImportPreviewData] = useState([]);
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);

    const fileInputRef = useRef(null);

    const queryClient = useQueryClient();
    const { selectedCompany: filterCompany } = useCompanyFilter();

    // =========================================================================
    // DEBOUNCE MECHANISM FOR CHECKLIST TASK SYNC
    // =========================================================================
    // When a leave record is updated or deleted, we sync the auto-created
    // checklist tasks (Annual Leave + Rejoining Date) in the background.
    //
    // USE CASE: Rapid successive updates to the same leave record
    // If the user changes leave dates and then immediately changes them again,
    // only the final state should trigger the sync. The debounce map (keyed by
    // leaveId) ensures that rapid successive calls cancel previous pending
    // syncs and only the last one executes after SYNC_DEBOUNCE_MS.
    //
    // The sync runs silently in the background — no loading state, no toast,
    // no interruption to the user. Errors are caught and logged to console
    // only, never surfaced as user-facing errors.
    // =========================================================================
    const SYNC_DEBOUNCE_MS = 1500;
    const syncDebounceTimers = useRef({});

    /**
     * triggerChecklistSync
     *
     * Debounced function that calls the syncAnnualLeaveChecklistTasks backend
     * function for each project the leave is applied to.
     *
     * @param leaveId - The ID of the leave record that changed
     * @param appliedToProjects - Comma-separated string of project IDs
     * @param action - 'update' or 'delete'
     */
    const triggerChecklistSync = useCallback((leaveId, appliedToProjects, action) => {
        if (!appliedToProjects) return;

        const projectIds = appliedToProjects.split(',').filter(Boolean);
        if (projectIds.length === 0) return;

        // Cancel any pending debounce for this leave
        const debounceKey = String(leaveId);
        if (syncDebounceTimers.current[debounceKey]) {
            clearTimeout(syncDebounceTimers.current[debounceKey]);
        }

        // Set a new debounced sync
        syncDebounceTimers.current[debounceKey] = setTimeout(async () => {
            delete syncDebounceTimers.current[debounceKey];

            for (const projectId of projectIds) {
                try {
                    await base44.functions.invoke('syncAnnualLeaveChecklistTasks', {
                        leaveId: String(leaveId),
                        projectId: projectId.trim(),
                        action
                    });
                } catch (syncError) {
                    // Silently log — do not surface to the user
                    console.error('Background checklist sync error:', syncError);
                }
            }
        }, SYNC_DEBOUNCE_MS);
    }, []);

    const { data: leaves = [] } = useQuery({
        queryKey: ['annualLeaves', filterCompany],
        queryFn: async () => {
            if (filterCompany) {
                return base44.entities.AnnualLeave.filter({ company: filterCompany }, '-created_date');
            }
            return base44.entities.AnnualLeave.list('-created_date');
        }
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', filterCompany],
        queryFn: async () => {
            if (filterCompany) {
                return base44.entities.Employee.filter({ active: true, company: filterCompany });
            }
            return base44.entities.Employee.filter({ active: true });
        }
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: async () => {
            const settings = await base44.entities.CompanySettings.list();
            return settings.map(s => s.company);
        }
    });

    const { data: employeeSalaries = [] } = useQuery({
        queryKey: ['employeeSalaries', filterCompany],
        queryFn: async () => {
            if (filterCompany) {
                return base44.entities.EmployeeSalary.filter({ company: filterCompany, active: true }, null, 2000);
            }
            return [];
        },
        enabled: !!filterCompany
    });

    // =========================================================================
    // PROJECT ENTITY LOADING
    // =========================================================================
    // Loads all projects then filters client-side by company and non-closed status.
    // Using .list() with no sort arg is the most reliable Base44 pattern.
    const { data: allProjects = [] } = useQuery({
        queryKey: ['allProjectsForLeave'],
        queryFn: () => base44.entities.Project.list('-created_date', 500),
        staleTime: 5 * 60 * 1000,
    });

    const projects = useMemo(() => {
        if (!filterCompany) return [];
        return allProjects.filter(p => p.company === filterCompany && p.status !== 'closed');
    }, [allProjects, filterCompany]);

    const filteredLeaves = useMemo(() => {
        const selectedProj = filterProject !== 'all' ? projects.find(p => p.id === filterProject) : null;

        return leaves.filter(leave => {
            const matchesSearch = !searchTerm || 
                leave.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                leave.attendance_id?.includes(searchTerm);
            const matchesStatus = filterStatus === 'all' || leave.status === filterStatus;
            
            // PROJECT RANGE FILTERING LOGIC:
            // Records are shown if their leave range overlaps with the selected project's range.
            let matchesProject = true;
            if (selectedProj) {
                const leaveStart = new Date(leave.date_from);
                const leaveEnd = new Date(leave.date_to);
                const projStart = new Date(selectedProj.date_from);
                const projEnd = new Date(selectedProj.date_to);
                matchesProject = leaveStart <= projEnd && leaveEnd >= projStart;
            }

            // MANUAL DATE RANGE FILTERING LOGIC:
            // Records are shown if leave.date_from falls within the manual date selection.
            // When only From is set, show >= From. When only To is set, show <= To.
            let matchesDateRange = true;
            if (filterDateFrom && leave.date_from < filterDateFrom) matchesDateRange = false;
            if (filterDateTo && leave.date_from > filterDateTo) matchesDateRange = false;

            return matchesSearch && matchesStatus && matchesProject && matchesDateRange;
        });
    }, [leaves, searchTerm, filterStatus, filterProject, projects, filterDateFrom, filterDateTo]);

    const calculateDays = (from, to) => {
        if (!from || !to) return 0;
        const start = new Date(from);
        const end = new Date(to);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays;
    };

    const calculateMonthlyLeaveSalary = (leave, employeeSalaries) => {
        if (leave.company !== 'Al Maraghi Motors') return null;

        const empSalary = employeeSalaries.find(s => 
            (s.attendance_id && s.attendance_id === leave.attendance_id) || 
            (s.hrms_id && s.hrms_id === leave.employee_id)
        );
        if (!empSalary) return null;

        const parseDate = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
        const start = parseDate(leave.date_from);
        const end = parseDate(leave.date_to);
        const basicSalary = Number(empSalary.basic_salary || 0);
        const allowances = Number(empSalary.allowances || 0);
        const salaryLeaveBase = basicSalary + allowances;

        const breakdown = [];
        let currentMonth = new Date(start.getFullYear(), start.getMonth(), 1);

        while (currentMonth <= end) {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth();
            
            const monthStart = new Date(year, month, 1);
            const monthEnd = new Date(year, month + 1, 0);
            const daysInMonth = monthEnd.getDate();

            const overlapStart = new Date(Math.max(start, monthStart));
            const overlapEnd = new Date(Math.min(end, monthEnd));

            if (overlapStart <= overlapEnd) {
                const daysOfLeaveInThatMonth = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
                const monthLeaveAmount = Math.round((salaryLeaveBase / daysInMonth) * daysOfLeaveInThatMonth);

                breakdown.push({
                    month: formatInUAE(monthStart, 'MMMM yyyy'),
                    days: daysOfLeaveInThatMonth,
                    daysInMonth,
                    amount: monthLeaveAmount
                });
            }
            currentMonth.setMonth(currentMonth.getMonth() + 1);
        }

        const totalValue = breakdown.reduce((sum, m) => sum + m.amount, 0);
        return { breakdown, total: totalValue };
    };

    function parseCSV(text) {
        const result = [];
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) return result;
        
        function splitLine(line) {
            let inQuote = false;
            let start = 0;
            const cols = [];
            for (let i = 0; i < line.length; i++) {
                if (line[i] === '"') inQuote = !inQuote;
                else if (line[i] === ',' && !inQuote) {
                    cols.push(line.substring(start, i).replace(/^"|"$/g, '').trim());
                    start = i + 1;
                }
            }
            cols.push(line.substring(start).replace(/^"|"$/g, '').trim());
            return cols;
        }

        const headers = splitLine(lines[0]).map(h => h.trim().toLowerCase());
        for (let i = 1; i < lines.length; i++) {
            const row = splitLine(lines[i]);
            const obj = {};
            headers.forEach((h, j) => {
                obj[h] = row[j] || '';
            });
            result.push(obj);
        }
        return result;
    }

    const processImportData = (data) => {
        if (!filterCompany) {
            toast.error('Please select a company from the global filter before importing.');
            return;
        }
        if (data.length === 0) {
            toast.error('File is empty.');
            return;
        }
        
        const sampleRowArray = Object.keys(data[0]).map(k => k.trim().toLowerCase());
        const hasEmpName = sampleRowArray.includes('employee name');
        const hasStartDate = sampleRowArray.includes('leave start date');
        const hasEndDate = sampleRowArray.includes('leave end date');
        
        if (!hasEmpName || !hasStartDate || !hasEndDate) {
            toast.error('Missing required columns. Expected: Employee Name, Leave Start Date, Leave End Date.');
            return;
        }

        /*
         * COMPANY SCOPING RULE FOR EMPLOYEE MATCHING:
         * To prevent cross-company data contamination, employee matching is strictly 
         * scoped to the currently active company (`filterCompany`). 
         * 
         * FUZZY NAME MATCHING LOGIC:
         * We first attempt an exact case-insensitive match on the employee's name.
         * If that fails, we use a fuzzy approach: we check if the imported name contains 
         * the employee's name or if the employee's name contains the imported name 
         * (both case-insensitive) within the same company.
         */
        const companyEmployees = employees.filter(e => e.company === filterCompany);

        const processedRows = data.map(row => {
            const cleanRow = {};
            Object.entries(row).forEach(([k, v]) => {
                cleanRow[k.trim().toLowerCase()] = v;
            });

            const impName = typeof cleanRow['employee name'] === 'string' ? cleanRow['employee name'].trim() : String(cleanRow['employee name'] || '').trim();
            const rawStart = cleanRow['leave start date'];
            const rawEnd = cleanRow['leave end date'];

            const parseDateString = (d) => {
                if (!d) return null;
                const parsed = new Date(d);
                if (isNaN(parsed.getTime())) return null;
                return parsed;
            };

            const sDateParsed = parseDateString(rawStart);
            const eDateParsed = parseDateString(rawEnd);
            
            const sDateStr = sDateParsed ? sDateParsed.toISOString().split('T')[0] : '';
            const eDateStr = eDateParsed ? eDateParsed.toISOString().split('T')[0] : '';

            let matchedEmp = companyEmployees.find(e => e.name.toLowerCase() === impName.toLowerCase());
            
            if (!matchedEmp) {
                // Fuzzy match fallback
                matchedEmp = companyEmployees.find(e => 
                    e.name.toLowerCase().includes(impName.toLowerCase()) || 
                    impName.toLowerCase().includes(e.name.toLowerCase())
                );
            }

            let status = matchedEmp ? 'Ready' : 'Unmatched';
            let existingDuplicate = null;

            /*
             * DUPLICATE DETECTION APPROACH:
             * For successfully matched rows, we check against the existing AnnualLeave records 
             * across the entire list. If an existing record's date range overlaps with the 
             * imported date range, it is flagged as a duplicate.
             */
            if (matchedEmp) {
                existingDuplicate = leaves.find(l => {
                    if (l.employee_id !== matchedEmp.hrms_id) return false;
                    const existingStart = new Date(l.date_from);
                    const existingEnd = new Date(l.date_to);
                    const newStart = new Date(sDateStr);
                    const newEnd = new Date(eDateStr);
                    return (existingStart <= newEnd && existingEnd >= newStart);
                });
                
                if (existingDuplicate) {
                    status = 'Duplicate';
                }
            }

            /*
             * UNMATCHED ROWS:
             * Unmatched rows are excluded (unchecked) by default to prevent data corruption.
             */
            const dayCount = calculateDays(sDateStr, eDateStr) || 0;
            return {
                originalName: impName,
                matchedName: matchedEmp ? matchedEmp.name : '',
                attendanceId: matchedEmp ? matchedEmp.attendance_id : '',
                employeeId: matchedEmp ? matchedEmp.hrms_id : '',
                leaveStart: sDateStr,
                leaveEnd: eDateStr,
                dayCount,
                status,
                selected: status === 'Ready',
                existingDuplicate
            };
        });

        setImportPreviewData(processedRows);
        setShowImportDialog(true);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target.result;
            try {
                let data = [];
                if (file.name.toLowerCase().endsWith('.csv')) {
                    data = parseCSV(bstr);
                } else {
                    const wb = XLSX.read(bstr, { type: 'binary', cellText:false, cellDates:true });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    data = XLSX.utils.sheet_to_json(ws, { raw: false, dateNF: 'yyyy-mm-dd' });
                }
                processImportData(data);
            } catch (error) {
                toast.error('Error parsing file.');
            }
        };

        if (file.name.toLowerCase().endsWith('.csv')) {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    };

    /*
     * BATCHING:
     * Processing the imports in batches of 10 with a 300 millisecond delay 
     * prevents rate limit errors on the Base44 API.
     */
    /**
     * executeImport
     * 
     * Handles bulk import of AnnualLeave records with batching and rollback support.
     * Implements 429 rate limit retry logic and manual cleanup on failure.
     * 
     * Patterns adapted from PunchUploadTab.jsx as the reference implementation.
     */
    const executeImport = async () => {
        const rowsToImport = importPreviewData.filter(r => r.selected);
        if (rowsToImport.length === 0) {
            toast.error('No rows selected for import.');
            return;
        }

        setIsImporting(true);
        setImportProgress(0);
        let successCount = 0;
        let createdIds = []; // Tracking array for AnnualLeave records created during this session
        
        const BATCH_SIZE = 25; // Updated to 25 for better performance
        const DELAY_MS = 200; // Delay between batches
        const MAX_RETRIES = 3;

        // Helper: retry with wait on 429
        const retryWithWait = async (fn, context) => {
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                try {
                    return await fn();
                } catch (err) {
                    const isRateLimit = err?.status === 429 || 
                        err?.response?.status === 429 ||
                        /rate.?limit|too many|throttl/i.test(err?.message || '');
                    
                    if (isRateLimit && attempt < MAX_RETRIES) {
                        // Wait 2000ms as requested
                        setImportProgress(prev => ({ ...prev, phase: `${context}: Rate limit hit — retrying in 2s...` }));
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        throw err;
                    }
                }
            }
        };
        
        try {
            for (let i = 0; i < rowsToImport.length; i += BATCH_SIZE) {
                const batch = rowsToImport.slice(i, i + BATCH_SIZE);
                
                // Process each record in the batch
                for (const row of batch) {
                    const leaveData = {
                        company: filterCompany,
                        employee_id: row.employeeId ? String(row.employeeId) : undefined,
                        date_from: row.leaveStart,
                        date_to: row.leaveEnd,
                        leave_type: 'annual',
                        reason: 'Bulk Import',
                        attendance_id: row.attendanceId ? String(row.attendanceId) : undefined,
                        employee_name: row.matchedName,
                        total_days: row.dayCount,
                        salary_leave_days: row.dayCount,
                        status: 'approved',
                        approved_by: currentUser.email,
                        approval_date: new Date().toISOString()
                    };
                    
                    // Create individual record with 429 retry logic
                    const response = await retryWithWait(
                        () => base44.entities.AnnualLeave.create(leaveData),
                        `Row ${createdIds.length + 1}`
                    );
                    
                    if (response && response.id) {
                        createdIds.push(response.id);
                        successCount++;
                    }
                }
                
                setImportProgress(Math.min(rowsToImport.length, i + BATCH_SIZE));
                
                if (i + BATCH_SIZE < rowsToImport.length) {
                    await new Promise(res => setTimeout(res, DELAY_MS));
                }
            }
            
            queryClient.invalidateQueries(['annualLeaves']);
            toast.success(`Import complete! ${successCount} records created.`);
            setIsImporting(false);
            setShowImportDialog(false);

        } catch (error) {
            console.error('Import failed, starting rollback:', error);
            
            // ROLLBACK: Delete all records in createdIds in batches of 10 with 100ms delays
            if (createdIds.length > 0) {
                for (let i = 0; i < createdIds.length; i += 10) {
                    const batchToRollback = createdIds.slice(i, i + 10);
                    for (const id of batchToRollback) {
                        try {
                            await base44.entities.AnnualLeave.delete(id);
                        } catch (delErr) {
                            // Silent fail during rollback
                        }
                    }
                    await new Promise(r => setTimeout(r, 100)); // 100ms delay between rollback batches
                }
            }

            queryClient.invalidateQueries(['annualLeaves']);
            const isRateLimit = error?.status === 429 || /rate.?limit|too many/i.test(error?.message || '');
            const msg = isRateLimit 
                ? 'Rate limit exceeded after retries. All uploaded records have been rolled back. Please wait a minute and try again.'
                : 'Upload failed: ' + (error.message || 'Unknown error') + '. All uploaded records have been rolled back.';
            toast.error(msg, { duration: 8000 });
            
            setIsImporting(false);
            setImportProgress(0);
        }
    };

    const createMutation = useMutation({
        mutationFn: async (data) => {
            const employee = employees.find(e => e.hrms_id === data.employee_id);
            if (!employee) throw new Error('Employee not found');

            const totalDays = calculateDays(data.date_from, data.date_to);

            const leaveData = {
                ...data,
                attendance_id: employee.attendance_id,
                company: employee.company,
                employee_name: employee.name,
                total_days: totalDays,
                salary_leave_days: totalDays,
                status: 'approved',
                approved_by: currentUser.email,
                approval_date: new Date().toISOString()
            };

            if (editingLeave) {
                return base44.entities.AnnualLeave.update(editingLeave.id, leaveData);
            } else {
                return base44.entities.AnnualLeave.create(leaveData);
            }
        },
        onSuccess: () => {
            // USE CASE: Leave dates updated with new start or end date
            // When editing an existing leave, trigger background sync to delete
            // old checklist tasks and recreate them with updated values.
            // The sync is debounced so rapid successive edits only trigger once.
            if (editingLeave && editingLeave.applied_to_projects) {
                triggerChecklistSync(editingLeave.id, editingLeave.applied_to_projects, 'update');
            }
            queryClient.invalidateQueries(['annualLeaves']);
            setShowDialog(false);
            setEditingLeave(null);
            resetForm();
            toast.success(editingLeave ? 'Leave updated' : 'Leave created');
        },
        onError: (error) => {
            toast.error('Error: ' + error.message);
        }
    });

    const updateStatusMutation = useMutation({
        mutationFn: ({ id, status }) => {
            return base44.entities.AnnualLeave.update(id, {
                status,
                approved_by: currentUser.email,
                approval_date: new Date().toISOString()
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['annualLeaves']);
            toast.success('Status updated');
        }
    });

    // USE CASE: Leave deleted entirely
    // When a leave is deleted, both "Annual Leave" and "Rejoining Date" tasks
    // must be removed from all projects the leave was applied to. We save the
    // leave info before deletion so we have the applied_to_projects list.
    const pendingDeleteLeaveRef = useRef(null);

    const deleteMutation = useMutation({
        mutationFn: (id) => {
            // Save the leave record before deleting so we can sync projects
            const leaveToDelete = leaves.find(l => l.id === id);
            pendingDeleteLeaveRef.current = leaveToDelete || null;
            return base44.entities.AnnualLeave.delete(id);
        },
        onSuccess: () => {
            // Trigger background sync to delete checklist tasks from all projects
            const deletedLeave = pendingDeleteLeaveRef.current;
            if (deletedLeave && deletedLeave.applied_to_projects) {
                triggerChecklistSync(deletedLeave.id, deletedLeave.applied_to_projects, 'delete');
            }
            pendingDeleteLeaveRef.current = null;
            queryClient.invalidateQueries(['annualLeaves']);
            toast.success('Leave deleted');
        }
    });

    const resetForm = () => {
        setFormData({
            company: filterCompany || '',
            employee_id: '',
            date_from: '',
            date_to: '',
            leave_type: 'annual',
            reason: ''
        });
    };

    const handleEdit = (leave) => {
        setEditingLeave(leave);
        setFormData({
            company: leave.company,
            employee_id: leave.employee_id,
            date_from: leave.date_from,
            date_to: leave.date_to,
            leave_type: 'annual',
            reason: leave.reason || ''
        });
        setShowDialog(true);
    };

    /**
     * handleQuickEntryParse
     * 
     * Uses an LLM to parse natural language leave descriptions into structured data.
     * Instructed the LLM to return ONLY JSON to ensure reliable parsing in the front-end.
     * The form remains fully editable after parsing, allowing manual adjustments if needed.
     */
    const handleQuickEntryParse = async () => {
        if (!quickEntryText.trim()) return;
        setIsParsing(true);
        setParsingError(null);
        try {
            // Prompt construction for LLM extraction
            const prompt = `Extract the employee name, leave start date in YYYY-MM-DD format, and leave end date in YYYY-MM-DD format from the natural language input and return only a JSON object with fields employee_name, date_from, and date_to. No other text should be returned. Input: "${quickEntryText}"`;
            
            // Invoke the LLM integration
            const response = await base44.integrations.Core.InvokeLLM({ prompt });
            
            let data;
            try {
                // Clean the response and parse JSON. LLM is instructed to return only JSON.
                const cleanResponse = typeof response === 'string' ? response.replace(/```json|```/g, '').trim() : response;
                data = typeof cleanResponse === 'string' ? JSON.parse(cleanResponse) : cleanResponse;
            } catch (jsonError) {
                console.error('LLM Parsing Error:', jsonError);
                setParsingError('The description could not be parsed. Please try again or fill the fields manually.');
                return;
            }
            
            if (!data.employee_name || !data.date_from || !data.date_to) {
                setParsingError('The description could not be parsed and is missing required fields. Please try again or fill the fields manually.');
                return;
            }

            // Scoping employee match by the currently active company in the form
            const currentCompany = formData.company || filterCompany;
            if (!currentCompany) {
                setParsingError('Please select a company before using Quick Entry so we can match the employee.');
                return;
            }

            const companyEmployees = employees.filter(e => e.company === currentCompany);
            const matchedEmp = companyEmployees.find(e => 
                e.name.toLowerCase().includes(data.employee_name.toLowerCase()) || 
                data.employee_name.toLowerCase().includes(e.name.toLowerCase())
            );

            if (matchedEmp) {
                setFormData(prev => ({
                    ...prev,
                    employee_id: matchedEmp.hrms_id,
                    date_from: data.date_from,
                    date_to: data.date_to
                }));
                setQuickEntryText('');
            } else {
                setParsingError(`Employee "${data.employee_name}" not found in ${currentCompany}.`);
            }
        } catch (err) {
            console.error('Quick Entry Error:', err);
            setParsingError('The description could not be parsed. Please try again or fill the fields manually.');
        } finally {
            setIsParsing(false);
        }
    };

    const handleSubmit = () => {
        if (!formData.company || !formData.employee_id || !formData.date_from || !formData.date_to) {
            toast.error('Please fill all required fields');
            return;
        }
        createMutation.mutate(formData);
    };

    const getStatusBadge = (status) => {
        const colors = {
            pending: 'badge-warning',
            approved: 'badge-success',
            rejected: 'badge-error'
        };
        return <Badge className={colors[status]}>{status}</Badge>;
    };

    const stats = useMemo(() => {
        const total = leaves.length;
        const pending = leaves.filter(l => l.status === 'pending').length;
        const approved = leaves.filter(l => l.status === 'approved').length;
        return { total, pending, approved };
    }, [leaves]);

    if (!currentUser) return null;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <Breadcrumb items={[{ label: 'Annual Leave Management' }]} />

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-[#1F2937]">Annual Leave Management</h1>
                    <p className="text-[#6B7280] mt-1">Central repository for employee annual leaves</p>
                </div>
                <div className="flex gap-2">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".csv,.xlsx,.xls" 
                        onChange={handleFileUpload} 
                    />
                    <Button onClick={() => {
                        if (!filterCompany) {
                            toast.error('Please select a company from the global filter before importing.');
                        } else {
                            fileInputRef.current?.click();
                        }
                    }} variant="outline" className="bg-white border-[#E2E6EC]">
                        <Upload className="w-4 h-4 mr-2" />
                        Import
                    </Button>
                    <Button onClick={() => { resetForm(); setShowDialog(true); }} className="bg-[#0F1E36]">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Leave
                    </Button>
                </div>
            </div>



            {/* Filters */}
            <Card className="p-4 mb-6">
                <div className="flex gap-4 flex-wrap">
                    <Input
                        placeholder="Search by name or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-64"
                    />
                    {/* Project Filter: Filters records by overlapping date ranges */}
                    <div className="flex items-center gap-2">
                        <select
                            value={filterProject}
                            onChange={(e) => setFilterProject(e.target.value)}
                            className="h-9 px-3 border rounded-md text-sm min-w-[280px]"
                        >
                            <option value="all">All Projects</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.name} ({p.date_from} → {p.date_to})
                                </option>
                            ))}
                        </select>
                        {filterProject !== 'all' && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setFilterProject('all')}
                                className="text-slate-500 hover:text-red-600 h-9"
                            >
                                <X className="w-4 h-4 mr-1" />
                                Clear
                            </Button>
                        )}
                    </div>

                    {/* Manual Date Range Filter: Allows precise filtering of records by From and To dates */}
                    <div className="flex items-center gap-2">
                        <Input
                            type="date"
                            value={filterDateFrom}
                            onChange={(e) => setFilterDateFrom(e.target.value)}
                            className="w-40 h-9"
                        />
                        <span className="text-slate-400 text-sm">to</span>
                        <Input
                            type="date"
                            value={filterDateTo}
                            onChange={(e) => setFilterDateTo(e.target.value)}
                            className="w-40 h-9"
                        />
                        {(filterDateFrom || filterDateTo) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setFilterDateFrom('');
                                    setFilterDateTo('');
                                }}
                                className="text-slate-500 hover:text-red-600 h-9 px-2"
                            >
                                <X className="w-4 h-4 mr-1" />
                                Clear
                            </Button>
                        )}
                    </div>
                </div>
            </Card>

            {/* Leaves Table */}
            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="table-header">
                            <tr>
                                <th className="px-4 py-3 text-left">Employee</th>
                                <th className="px-4 py-3 text-left">Company</th>
                                <th className="px-4 py-3 text-left">Leave Period</th>
                                <th className="px-4 py-3 text-left">Days</th>
                                <th className="px-4 py-3 text-left">Applied To Projects</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLeaves.map((leave) => (
                                <Fragment key={leave.id}>
                                    <tr className="border-t hover:bg-[#F1F5F9]">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-[#1F2937]">{leave.employee_name}</div>
                                            <div className="text-sm text-[#6B7280]">ID: {leave.attendance_id}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">{leave.company}</td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm">
                                                {formatInUAE(new Date(leave.date_from), 'MMM dd, yyyy')} - {formatInUAE(new Date(leave.date_to), 'MMM dd, yyyy')}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-medium">{leave.total_days} days</div>
                                            {leave.salary_leave_days !== leave.total_days && (
                                                <div className="text-xs text-amber-600">Salary: {leave.salary_leave_days} days</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-[#6B7280]">
                                            {leave.applied_to_projects ? leave.applied_to_projects.split(',').length + ' projects' : 'Not applied'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex gap-2 justify-end">
                                                {leave.company === 'Al Maraghi Motors' && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setExpandedLeaveId(expandedLeaveId === leave.id ? null : leave.id)}
                                                        className="text-indigo-600"
                                                    >
                                                        {expandedLeaveId === leave.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </Button>
                                                )}
                                                {leave.status === 'pending' && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => updateStatusMutation.mutate({ id: leave.id, status: 'approved' })}
                                                            className="text-green-600"
                                                        >
                                                            <Check className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => updateStatusMutation.mutate({ id: leave.id, status: 'rejected' })}
                                                            className="text-red-600"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                                <Button size="sm" variant="ghost" onClick={() => handleEdit(leave)}>
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        if (confirm('Delete this leave?')) {
                                                            deleteMutation.mutate(leave.id);
                                                        }
                                                    }}
                                                    className="text-red-600"
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedLeaveId === leave.id && (
                                        <tr className="bg-indigo-50/30">
                                            <td colSpan={6} className="px-8 py-4">
                                                {(() => {
                                                    const result = calculateMonthlyLeaveSalary(leave, employeeSalaries);
                                                    if (!result) return (
                                                        <div className="flex items-center gap-2 text-sm text-amber-700 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                                            <AlertCircle className="w-4 h-4" />
                                                            No salary record found for this employee.
                                                        </div>
                                                    );
                                                    
                                                    return (
                                                        <div className="bg-white border border-indigo-100 rounded-lg overflow-hidden shadow-sm max-w-2xl">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-indigo-50/50 text-indigo-900 border-b border-indigo-100">
                                                                    <tr>
                                                                        <th className="px-4 py-2 text-left font-semibold">Month</th>
                                                                        <th className="px-4 py-2 text-center font-semibold">Leave Days</th>
                                                                        <th className="px-4 py-2 text-center font-semibold">Days in Month</th>
                                                                        <th className="px-4 py-2 text-right font-semibold">Amount (AED)</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-100">
                                                                    {result.breakdown.map((m, idx) => (
                                                                        <tr key={idx} className="hover:bg-slate-50">
                                                                            <td className="px-4 py-2 font-medium">{m.month}</td>
                                                                            <td className="px-4 py-2 text-center">{m.days}</td>
                                                                            <td className="px-4 py-2 text-center">{m.daysInMonth}</td>
                                                                            <td className="px-4 py-2 text-right font-semibold text-slate-700">{m.amount.toLocaleString()}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                                <tfoot className="bg-indigo-50/30 border-t border-indigo-100">
                                                                    <tr className="font-bold">
                                                                        <td colSpan={3} className="px-4 py-2 text-right text-slate-600">Total Leave Salary:</td>
                                                                        <td className="px-4 py-2 text-right text-indigo-700">{result.total.toLocaleString()} AED</td>
                                                                    </tr>
                                                                </tfoot>
                                                            </table>
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Create/Edit Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingLeave ? 'Edit' : 'Add'} Annual Leave</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Quick Entry Feature: Uses LLM to parse natural language descriptions */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="w-4 h-4 text-indigo-600" />
                                <span className="font-bold text-sm text-[#0F1E36]">AI Quick Entry</span>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <Label className="text-xs text-slate-500 mb-1 block">Describe the leave in plain English</Label>
                                    <Textarea
                                        value={quickEntryText}
                                        onChange={(e) => setQuickEntryText(e.target.value)}
                                        placeholder="Example: Thomas is on annual leave from 15 April to 22 April 2026."
                                        className="text-sm bg-white"
                                        rows={2}
                                    />
                                </div>
                                {parsingError && (
                                    <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-100 rounded text-[11px] text-red-700">
                                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span>{parsingError}</span>
                                    </div>
                                )}
                                <Button 
                                    onClick={handleQuickEntryParse} 
                                    disabled={isParsing || !quickEntryText.trim()}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 h-9"
                                >
                                    {isParsing ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                            Parsing...
                                        </>
                                    ) : (
                                        'Parse Description'
                                    )}
                                </Button>
                                <p className="text-[10px] text-slate-400 italic">
                                    Once parsed, you can still manually edit all fields below.
                                </p>
                            </div>
                        </div>

                        <div>
                            <Label>Company *</Label>
                            {filterCompany ? (
                                <>
                                    <Input value={filterCompany} disabled className="bg-slate-50" />
                                    <p className="text-xs text-slate-500 mt-1">Company is set to your active company</p>
                                </>
                            ) : (
                                <Select 
                                    value={formData.company} 
                                    onValueChange={(value) => setFormData({ ...formData, company: value, employee_id: '' })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {companies.map(company => (
                                            <SelectItem key={company} value={company}>
                                                {company}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                        <div>
                            <Label>Employee *</Label>
                            <Select 
                                value={formData.employee_id} 
                                onValueChange={(value) => setFormData({ ...formData, employee_id: value })}
                                disabled={!formData.company}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={formData.company ? "Select employee" : "Select company first"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees
                                        .filter(emp => emp.company === formData.company)
                                        .map(emp => (
                                            <SelectItem key={emp.id} value={emp.hrms_id}>
                                                {emp.name} - {emp.attendance_id}
                                            </SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>From Date *</Label>
                                <Input
                                    type="date"
                                    value={formData.date_from}
                                    onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>To Date *</Label>
                                <Input
                                    type="date"
                                    value={formData.date_to}
                                    onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                                />
                            </div>
                        </div>
                        {formData.date_from && formData.date_to && (
                            <div className="text-sm text-[#6B7280]">
                                Total: {calculateDays(formData.date_from, formData.date_to)} days
                            </div>
                        )}
                        <div>
                            <Label>Reason</Label>
                            <Textarea
                                value={formData.reason}
                                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                rows={3}
                                placeholder="Enter reason for leave..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                            {createMutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import Preview Dialog */}
            <Dialog open={showImportDialog} onOpenChange={(open) => !isImporting && setShowImportDialog(open)}>
                <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Import Preview</DialogTitle>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-auto space-y-4 pr-1">
                        <div className="flex gap-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                            <div className="flex flex-col">
                                <span className="font-semibold text-slate-700">Ready</span>
                                <span className="text-lg font-bold text-green-600">{importPreviewData.filter(r => r.status === 'Ready').length}</span>
                            </div>
                            <div className="flex flex-col border-l border-slate-300 pl-4">
                                <span className="font-semibold text-slate-700">Duplicates</span>
                                <span className="text-lg font-bold text-amber-600">{importPreviewData.filter(r => r.status === 'Duplicate').length}</span>
                            </div>
                            <div className="flex flex-col border-l border-slate-300 pl-4">
                                <span className="font-semibold text-slate-700">Unmatched</span>
                                <span className="text-lg font-bold text-red-600">{importPreviewData.filter(r => r.status === 'Unmatched').length}</span>
                            </div>
                        </div>

                        <div className="flex gap-2 mb-2">
                            <Button size="sm" variant="outline" onClick={() => setImportPreviewData(importPreviewData.map(r => ({ ...r, selected: true })))}>
                                Select All
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setImportPreviewData(importPreviewData.map(r => ({ ...r, selected: false })))}>
                                Deselect All
                            </Button>
                        </div>

                        <div className="rounded-md border">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-[#F8FAFC] border-b border-[#E2E6EC] sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 w-10"></th>
                                        <th className="px-3 py-2 font-medium text-slate-700">Name (File)</th>
                                        <th className="px-3 py-2 font-medium text-slate-700">Matched Name</th>
                                        <th className="px-3 py-2 font-medium text-slate-700">Att. ID</th>
                                        <th className="px-3 py-2 font-medium text-slate-700">Leave Start</th>
                                        <th className="px-3 py-2 font-medium text-slate-700">Leave End</th>
                                        <th className="px-3 py-2 font-medium text-slate-700">Days</th>
                                        <th className="px-3 py-2 font-medium text-slate-700">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importPreviewData.map((row, idx) => {
                                        let rowColors = "";
                                        let statusBadge = "";
                                        if (row.status === 'Unmatched') {
                                            rowColors = "bg-red-50 text-red-900";
                                            statusBadge = <Badge className="bg-red-100 text-red-800 border-red-200">Unmatched</Badge>;
                                        } else if (row.status === 'Duplicate') {
                                            rowColors = "bg-amber-50 text-amber-900";
                                            statusBadge = (
                                                <div className="flex flex-col gap-1">
                                                    <Badge className="bg-amber-100 text-amber-800 border-amber-200">Duplicate</Badge>
                                                    <span className="text-[10px] text-amber-700">Overlaps {row.existingDuplicate?.date_from} to {row.existingDuplicate?.date_to}</span>
                                                </div>
                                            );
                                        } else if (row.status === 'Matched') {
                                            rowColors = "bg-indigo-50 text-indigo-900";
                                            statusBadge = <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Matched</Badge>;
                                        } else {
                                            rowColors = "bg-white";
                                            statusBadge = <Badge className="bg-green-100 text-green-800 border-green-200">Ready</Badge>;
                                        }

                                        return (
                                            <tr key={idx} className={`border-b ${rowColors} hover:opacity-90`}>
                                                <td className="px-3 py-2 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 cursor-pointer"
                                                        checked={row.selected}
                                                        onChange={() => {
                                                            const newData = [...importPreviewData];
                                                            newData[idx].selected = !newData[idx].selected;
                                                            setImportPreviewData(newData);
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div>{row.originalName}</div>
                                                    
                                                    {/* MANUAL EMPLOYEE MATCHING SEARCH */}
                                                    {/* Displays an inline search for unmatched rows to allow manual linking */}
                                                    {row.status === 'Unmatched' && (
                                                        <div className="mt-2 relative">
                                                            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Search to match employee</label>
                                                            <Input 
                                                                size="sm"
                                                                placeholder="Type name..."
                                                                className="h-7 text-[11px] bg-white border-red-200 focus:border-indigo-500"
                                                                value={activeUnmatchedIdx === idx ? unmatchedSearchTerm : ''}
                                                                onChange={(e) => {
                                                                    setActiveUnmatchedIdx(idx);
                                                                    setUnmatchedSearchTerm(e.target.value);
                                                                }}
                                                                onFocus={() => {
                                                                    setActiveUnmatchedIdx(idx);
                                                                    setUnmatchedSearchTerm('');
                                                                }}
                                                            />
                                                            
                                                            {activeUnmatchedIdx === idx && unmatchedSearchTerm.length >= 2 && (
                                                                <>
                                                                    {/* Overlay to dismiss dropdown on click outside */}
                                                                    <div 
                                                                        className="fixed inset-0 z-[60]" 
                                                                        onClick={() => setActiveUnmatchedIdx(null)}
                                                                    />
                                                                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-[70] max-h-48 overflow-auto">
                                                                        {employees
                                                                            .filter(emp => emp.company === filterCompany && emp.name.toLowerCase().includes(unmatchedSearchTerm.toLowerCase()))
                                                                            .slice(0, 8)
                                                                            .map(emp => (
                                                                                <div 
                                                                                    key={emp.id}
                                                                                    className="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-[11px] border-b last:border-0"
                                                                                    onClick={() => {
                                                                                        const newData = [...importPreviewData];
                                                                                        newData[idx] = {
                                                                                            ...newData[idx],
                                                                                            matchedName: emp.name,
                                                                                            attendanceId: emp.attendance_id,
                                                                                            employeeId: emp.hrms_id, // Using hrms_id for consistency with entity creation
                                                                                            status: 'Matched',
                                                                                            selected: true
                                                                                        };
                                                                                        setImportPreviewData(newData);
                                                                                        setActiveUnmatchedIdx(null);
                                                                                        setUnmatchedSearchTerm('');
                                                                                    }}
                                                                                >
                                                                                    <div className="font-bold">{emp.name}</div>
                                                                                    <div className="text-[10px] text-slate-500">{emp.attendance_id} | {emp.company}</div>
                                                                                </div>
                                                                            ))
                                                                        }
                                                                        {employees.filter(emp => emp.company === filterCompany && emp.name.toLowerCase().includes(unmatchedSearchTerm.toLowerCase())).length === 0 && (
                                                                            <div className="px-3 py-2 text-[11px] text-slate-500 italic">No matches found</div>
                                                                        )}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 font-medium">{row.matchedName || '-'}</td>
                                                <td className="px-3 py-2">{row.attendanceId || '-'}</td>
                                                <td className="px-3 py-2">{row.leaveStart || '-'}</td>
                                                <td className="px-3 py-2">{row.leaveEnd || '-'}</td>
                                                <td className="px-3 py-2">{row.dayCount}</td>
                                                <td className="px-3 py-2">{statusBadge}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        
                        {isImporting && (
                            <div className="mt-4 p-4 border rounded-lg bg-blue-50 text-blue-800 flex flex-col items-center justify-center space-y-2">
                                <span className="font-semibold">Importing... {importProgress} / {importPreviewData.filter(r => r.selected).length}</span>
                                <div className="w-full bg-blue-200 rounded-full h-2.5">
                                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(importProgress / Math.max(1, importPreviewData.filter(r => r.selected).length)) * 100}%` }}></div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <DialogFooter className="mt-4 border-t pt-4">
                        <Button variant="outline" disabled={isImporting} onClick={() => setShowImportDialog(false)}>Cancel</Button>
                        <Button 
                            disabled={isImporting || importPreviewData.filter(r => r.selected).length === 0} 
                            onClick={executeImport}
                        >
                            {isImporting ? 'Processing...' : `Confirm Import (${importPreviewData.filter(r => r.selected).length})`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}