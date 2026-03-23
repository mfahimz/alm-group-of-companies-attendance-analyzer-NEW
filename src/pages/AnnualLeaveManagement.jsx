import { useState, useMemo, useRef, useCallback } from 'react';
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
import { Plus, Check, X, FileText, AlertCircle, Upload } from 'lucide-react';
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

    const filteredLeaves = useMemo(() => {
        return leaves.filter(leave => {
            const matchesSearch = !searchTerm || 
                leave.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                leave.attendance_id?.includes(searchTerm);
            const matchesStatus = filterStatus === 'all' || leave.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [leaves, searchTerm, filterStatus]);

    const calculateDays = (from, to) => {
        if (!from || !to) return 0;
        const start = new Date(from);
        const end = new Date(to);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays;
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
    const executeImport = async () => {
        const rowsToImport = importPreviewData.filter(r => r.selected);
        if (rowsToImport.length === 0) {
            toast.error('No rows selected for import.');
            return;
        }

        setIsImporting(true);
        setImportProgress(0);
        let successCount = 0;
        
        const BATCH_SIZE = 10;
        const DELAY_MS = 300;
        
        for (let i = 0; i < rowsToImport.length; i += BATCH_SIZE) {
            const batch = rowsToImport.slice(i, i + BATCH_SIZE);
            const promises = batch.map(row => {
                const leaveData = {
                    company: filterCompany,
                    employee_id: row.employeeId,
                    date_from: row.leaveStart,
                    date_to: row.leaveEnd,
                    leave_type: 'annual',
                    reason: 'Bulk Import',
                    attendance_id: row.attendanceId,
                    employee_name: row.matchedName,
                    total_days: row.dayCount,
                    salary_leave_days: row.dayCount,
                    status: 'approved',
                    approved_by: currentUser.email,
                    approval_date: new Date().toISOString()
                };
                return base44.entities.AnnualLeave.create(leaveData).then(() => { successCount++; });
            });
            
            await Promise.allSettled(promises);
            setImportProgress(Math.min(rowsToImport.length, i + BATCH_SIZE));
            
            if (i + BATCH_SIZE < rowsToImport.length) {
                await new Promise(res => setTimeout(res, DELAY_MS));
            }
        }
        
        queryClient.invalidateQueries(['annualLeaves']);
        toast.success(`Import complete! ${successCount} records created.`);
        setIsImporting(false);
        setShowImportDialog(false);
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

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 rounded-lg">
                            <FileText className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-[#6B7280]">Total Leaves</p>
                            <p className="text-2xl font-bold text-[#1F2937]">{stats.total}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-100 rounded-lg">
                            <AlertCircle className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm text-[#6B7280]">Pending Approval</p>
                            <p className="text-2xl font-bold text-[#1F2937]">{stats.pending}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-green-100 rounded-lg">
                            <Check className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-[#6B7280]">Approved</p>
                            <p className="text-2xl font-bold text-[#1F2937]">{stats.approved}</p>
                        </div>
                    </div>
                </Card>
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
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="h-9 px-3 border rounded-md text-sm"
                    >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
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
                                <th className="px-4 py-3 text-left">Type</th>
                                <th className="px-4 py-3 text-left">Status</th>
                                <th className="px-4 py-3 text-left">Applied To Projects</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLeaves.map((leave) => (
                                <tr key={leave.id} className="border-t hover:bg-[#F1F5F9]">
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
                                    <td className="px-4 py-3">
                                        <Badge className={leave.leave_type === 'annual' ? 'badge-info' : 'badge-warning'}>
                                            {leave.leave_type}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">{getStatusBadge(leave.status)}</td>
                                    <td className="px-4 py-3 text-sm text-[#6B7280]">
                                        {leave.applied_to_projects ? leave.applied_to_projects.split(',').length + ' projects' : 'Not applied'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex gap-2 justify-end">
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
                                                <td className="px-3 py-2">{row.originalName}</td>
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