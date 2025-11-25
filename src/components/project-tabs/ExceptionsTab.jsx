import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Search } from 'lucide-react';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';

export default function ExceptionsTab({ project }) {
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        attendance_id: '',
        date_from: '',
        date_to: '',
        type: 'OFF',
        new_am_start: '',
        new_am_end: '',
        new_pm_start: '',
        new_pm_end: '',
        early_checkout_minutes: '',
        details: ''
    });
    const [filter, setFilter] = useState({ search: '', type: '' });
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const queryClient = useQueryClient();

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.Exception.create({
            ...data,
            project_id: project.id
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success('Exception added successfully');
            setShowForm(false);
            resetForm();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.Exception.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success('Exception deleted');
        }
    });

    const resetForm = () => {
        setFormData({
            attendance_id: '',
            date_from: '',
            date_to: '',
            type: 'OFF',
            new_am_start: '',
            new_am_end: '',
            new_pm_start: '',
            new_pm_end: '',
            early_checkout_minutes: '',
            details: ''
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // For PUBLIC_HOLIDAY, attendance_id is not required
        if (formData.type !== 'PUBLIC_HOLIDAY' && !formData.attendance_id) {
            toast.error('Please select an employee');
            return;
        }
        
        if (!formData.date_from || !formData.date_to) {
            toast.error('Please fill in date range');
            return;
        }
        
        // For PUBLIC_HOLIDAY, set attendance_id to 'ALL'
        const submitData = formData.type === 'PUBLIC_HOLIDAY' 
            ? { ...formData, attendance_id: 'ALL' }
            : formData;
        
        createMutation.mutate(submitData);
    };

    const filteredExceptions = exceptions
        .filter(ex => {
            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                const matchesId = ex.attendance_id.toLowerCase().includes(searchLower);
                const employee = employees.find(e => e.attendance_id === ex.attendance_id);
                const matchesName = employee?.name.toLowerCase().includes(searchLower);
                if (!matchesId && !matchesName) return false;
            }
            if (filter.type && ex.type !== filter.type) return false;
            return true;
        })
        .sort((a, b) => {
            let aVal = a[sort.key];
            let bVal = b[sort.key];
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const needsShiftOverride = formData.type === 'SHIFT_OVERRIDE';
    const needsEarlyCheckoutMinutes = formData.type === 'MANUAL_EARLY_CHECKOUT';

    return (
        <div className="space-y-6">
            {/* Add Exception Form */}
            {showForm && (
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle>Add Exception</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Employee {formData.type !== 'PUBLIC_HOLIDAY' && '*'}</Label>
                                    {formData.type === 'PUBLIC_HOLIDAY' ? (
                                        <Input 
                                            value="All Employees" 
                                            disabled 
                                            className="bg-slate-50"
                                        />
                                    ) : (
                                        <Select
                                            value={formData.attendance_id}
                                            onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select employee" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {employees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.attendance_id}>
                                                        {emp.attendance_id} - {emp.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                                <div>
                                    <Label>Exception Type *</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="OFF">Off / Leave</SelectItem>
                                            <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                            <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                            <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                            <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                            <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                            <SelectItem value="MANUAL_EARLY_CHECKOUT">Manual Early Checkout</SelectItem>
                                            <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
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

                            {needsShiftOverride && (
                                <div>
                                    <Label className="mb-2 block">Override Shift Times</Label>
                                    <div className="grid grid-cols-4 gap-4">
                                        <div>
                                            <Label className="text-xs">AM Start</Label>
                                            <Input
                                                placeholder="08:00 AM"
                                                value={formData.new_am_start}
                                                onChange={(e) => setFormData({ ...formData, new_am_start: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">AM End</Label>
                                            <Input
                                                placeholder="12:00 PM"
                                                value={formData.new_am_end}
                                                onChange={(e) => setFormData({ ...formData, new_am_end: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM Start</Label>
                                            <Input
                                                placeholder="01:00 PM"
                                                value={formData.new_pm_start}
                                                onChange={(e) => setFormData({ ...formData, new_pm_start: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM End</Label>
                                            <Input
                                                placeholder="05:00 PM"
                                                value={formData.new_pm_end}
                                                onChange={(e) => setFormData({ ...formData, new_pm_end: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {needsEarlyCheckoutMinutes && (
                                <div className="max-w-xs">
                                    <Label>Early Checkout Minutes *</Label>
                                    <Input
                                        type="number"
                                        placeholder="e.g. 30"
                                        value={formData.early_checkout_minutes}
                                        onChange={(e) => setFormData({ ...formData, early_checkout_minutes: e.target.value })}
                                        min="1"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Minutes to add to early checkout total</p>
                                </div>
                            )}

                            <div>
                                <Label>Details / Reason</Label>
                                <Input
                                    value={formData.details}
                                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                                    placeholder="Optional notes"
                                />
                            </div>

                            <div className="flex gap-3">
                                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                                    Add Exception
                                </Button>
                                <Button type="button" variant="outline" onClick={() => {
                                    setShowForm(false);
                                    resetForm();
                                }}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Exceptions List */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Exceptions</CardTitle>
                        {!showForm && (
                            <Button 
                                onClick={() => setShowForm(true)}
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Exception
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="flex gap-4">
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by ID or name..."
                                value={filter.search}
                                onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                className="pl-9"
                            />
                        </div>
                        <Select
                            value={filter.type}
                            onValueChange={(value) => setFilter({ ...filter, type: value })}
                        >
                            <SelectTrigger className="max-w-xs">
                                <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={null}>All types</SelectItem>
                                <SelectItem value="OFF">Off / Leave</SelectItem>
                                <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                <SelectItem value="MANUAL_EARLY_CHECKOUT">Manual Early Checkout</SelectItem>
                                <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Table */}
                    {filteredExceptions.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No exceptions found</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                        Employee
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="type" currentSort={sort} onSort={setSort}>
                                        Type
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="date_from" currentSort={sort} onSort={setSort}>
                                        From
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="date_to" currentSort={sort} onSort={setSort}>
                                        To
                                    </SortableTableHead>
                                    <TableHead>Details</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredExceptions.map((exception) => (
                                    <TableRow key={exception.id}>
                                        <TableCell className="font-medium">{exception.attendance_id}</TableCell>
                                        <TableCell>
                                            <span className={`
                                                px-2 py-1 rounded text-xs font-medium
                                                ${exception.type === 'OFF' ? 'bg-slate-100 text-slate-700' : ''}
                                                ${exception.type === 'PUBLIC_HOLIDAY' ? 'bg-purple-100 text-purple-700' : ''}
                                                ${exception.type === 'SHIFT_OVERRIDE' ? 'bg-blue-100 text-blue-700' : ''}
                                                ${exception.type === 'MANUAL_PRESENT' ? 'bg-green-100 text-green-700' : ''}
                                                ${exception.type === 'MANUAL_ABSENT' ? 'bg-red-100 text-red-700' : ''}
                                                ${exception.type === 'MANUAL_HALF' ? 'bg-amber-100 text-amber-700' : ''}
                                                ${exception.type === 'MANUAL_EARLY_CHECKOUT' ? 'bg-cyan-100 text-cyan-700' : ''}
                                                ${exception.type === 'SICK_LEAVE' ? 'bg-orange-100 text-orange-700' : ''}
                                            `}>
                                                {exception.type === 'MANUAL_EARLY_CHECKOUT' 
                                                    ? `Early Checkout (${exception.early_checkout_minutes || 0} min)`
                                                    : exception.type.replace(/_/g, ' ')}
                                            </span>
                                        </TableCell>
                                        <TableCell>{new Date(exception.date_from).toLocaleDateString()}</TableCell>
                                        <TableCell>{new Date(exception.date_to).toLocaleDateString()}</TableCell>
                                        <TableCell className="max-w-xs truncate">{exception.details || '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => deleteMutation.mutate(exception.id)}
                                            >
                                                <Trash2 className="w-4 h-4 text-red-600" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}