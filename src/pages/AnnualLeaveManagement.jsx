import React, { useState, useMemo } from 'react';
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
import { Calendar, Plus, Filter, Check, X, FileText, Download, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatInUAE } from '@/components/ui/timezone';
import Breadcrumb from '@/components/ui/Breadcrumb';
import { usePermissions } from '@/components/hooks/usePermissions';

export default function AnnualLeaveManagement() {
    const { user: currentUser, userRole } = usePermissions();
    const [showDialog, setShowDialog] = useState(false);
    const [editingLeave, setEditingLeave] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterCompany, setFilterCompany] = useState('all');
    const [formData, setFormData] = useState({
        company: '',
        employee_id: '',
        date_from: '',
        date_to: '',
        leave_type: 'annual',
        reason: ''
    });

    const queryClient = useQueryClient();

    const { data: leaves = [] } = useQuery({
        queryKey: ['annualLeaves'],
        queryFn: () => base44.entities.AnnualLeave.list('-created_date')
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.filter({ active: true })
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
            const matchesCompany = filterCompany === 'all' || leave.company === filterCompany;
            return matchesSearch && matchesStatus && matchesCompany;
        });
    }, [leaves, searchTerm, filterStatus, filterCompany]);

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

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.AnnualLeave.delete(id),
        onSuccess: () => {
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
                    {userRole === 'admin' && (
                        <select
                            value={filterCompany}
                            onChange={(e) => setFilterCompany(e.target.value)}
                            className="h-9 px-3 border rounded-md text-sm"
                        >
                            <option value="all">All Companies</option>
                            {companies.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    )}
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