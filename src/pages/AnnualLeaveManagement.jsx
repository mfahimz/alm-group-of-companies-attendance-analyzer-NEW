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
import { Plus, Check, X, FileText, AlertCircle } from 'lucide-react';
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
            company: '',
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
                <Button onClick={() => { resetForm(); setShowDialog(true); }} className="bg-[#0F1E36]">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Leave
                </Button>
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
        </div>
    );
}