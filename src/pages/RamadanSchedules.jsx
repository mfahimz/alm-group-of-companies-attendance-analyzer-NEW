import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Calendar, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import RamadanShiftDesigner from '../components/ramadan/RamadanShiftDesigner';

export default function RamadanSchedules() {
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [editingDates, setEditingDates] = useState(null);
    const [formData, setFormData] = useState({
        company: '',
        year: new Date().getFullYear(),
        ramadan_start_date: '',
        ramadan_end_date: ''
    });
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: schedules = [] } = useQuery({
        queryKey: ['ramadanSchedules'],
        queryFn: () => base44.entities.RamadanSchedule.list('-year')
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.RamadanSchedule.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['ramadanSchedules']);
            setShowCreateDialog(false);
            setFormData({ company: '', year: new Date().getFullYear(), ramadan_start_date: '', ramadan_end_date: '' });
            toast.success('Ramadan schedule created');
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.RamadanSchedule.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['ramadanSchedules']);
            setEditingDates(null);
            toast.success('Ramadan dates updated');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.RamadanSchedule.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['ramadanSchedules']);
            toast.success('Schedule deleted');
        }
    });

    const handleCreate = (e) => {
        e.preventDefault();
        if (!formData.company || !formData.ramadan_start_date || !formData.ramadan_end_date) {
            toast.error('Please fill all required fields');
            return;
        }
        createMutation.mutate({
            ...formData,
            week1_shifts: '{}',
            week2_shifts: '{}',
            active: true
        });
    };

    const handleDelete = (id) => {
        if (window.confirm('Delete this Ramadan schedule?')) {
            deleteMutation.mutate(id);
        }
    };

    const handleEditDates = (schedule) => {
        setEditingDates({
            id: schedule.id,
            ramadan_start_date: schedule.ramadan_start_date,
            ramadan_end_date: schedule.ramadan_end_date,
            company: schedule.company,
            year: schedule.year
        });
    };

    const handleUpdateDates = (e) => {
        e.preventDefault();
        if (!editingDates.ramadan_start_date || !editingDates.ramadan_end_date) {
            toast.error('Please fill all required fields');
            return;
        }
        updateMutation.mutate({
            id: editingDates.id,
            data: {
                ramadan_start_date: editingDates.ramadan_start_date,
                ramadan_end_date: editingDates.ramadan_end_date
            }
        });
    };

    const isAdmin = currentUser?.role === 'admin';

    return (
        <div className="p-6 lg:p-8 space-y-6">
            <Breadcrumb items={[{ label: 'Ramadan Schedules' }]} />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Ramadan Schedules</h1>
                    <p className="text-slate-600 mt-1">Manage company-specific Ramadan shift schedules</p>
                </div>
                {isAdmin && (
                    <Button onClick={() => setShowCreateDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
                        <Plus className="w-4 h-4 mr-2" />
                        New Schedule
                    </Button>
                )}
            </div>

            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Schedules</CardTitle>
                </CardHeader>
                <CardContent>
                    {schedules.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No Ramadan schedules created yet.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Company</TableHead>
                                    <TableHead>Year</TableHead>
                                    <TableHead>Ramadan Period</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {schedules.map((schedule) => (
                                    <TableRow key={schedule.id}>
                                        <TableCell className="font-medium">{schedule.company}</TableCell>
                                        <TableCell>{schedule.year}</TableCell>
                                        <TableCell>
                                            {new Date(schedule.ramadan_start_date).toLocaleDateString()} - {new Date(schedule.ramadan_end_date).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${schedule.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                                                {schedule.active ? 'Active' : 'Inactive'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-2 justify-end">
                                                {isAdmin && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleEditDates(schedule)}
                                                        title="Edit Ramadan dates"
                                                    >
                                                        <Edit className="w-4 h-4 text-blue-600" />
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setEditingSchedule(schedule)}
                                                    title="Manage shifts"
                                                >
                                                    <Calendar className="w-4 h-4 text-indigo-600" />
                                                </Button>
                                                {isAdmin && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleDelete(schedule.id)}
                                                        title="Delete schedule"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Ramadan Schedule</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4 mt-4">
                        <div>
                            <Label>Company *</Label>
                            <Select value={formData.company} onValueChange={(val) => setFormData({ ...formData, company: val })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select company" />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.map((comp) => (
                                        <SelectItem key={comp.id} value={comp.company}>{comp.company}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Year *</Label>
                            <Input
                                type="number"
                                value={formData.year}
                                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                            />
                        </div>
                        <div>
                            <Label>Ramadan Start Date *</Label>
                            <Input
                                type="date"
                                value={formData.ramadan_start_date}
                                onChange={(e) => setFormData({ ...formData, ramadan_start_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Ramadan End Date *</Label>
                            <Input
                                type="date"
                                value={formData.ramadan_end_date}
                                onChange={(e) => setFormData({ ...formData, ramadan_end_date: e.target.value })}
                            />
                        </div>
                        <div className="flex gap-2 pt-4">
                            <Button type="submit" disabled={createMutation.isPending}>
                                Create
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Dates Dialog */}
            <Dialog open={!!editingDates} onOpenChange={() => setEditingDates(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Ramadan Period</DialogTitle>
                    </DialogHeader>
                    {editingDates && (
                        <form onSubmit={handleUpdateDates} className="space-y-4 mt-4">
                            <div className="bg-slate-50 p-3 rounded-lg">
                                <p className="text-sm text-slate-600">Company: <span className="font-medium text-slate-900">{editingDates.company}</span></p>
                                <p className="text-sm text-slate-600">Year: <span className="font-medium text-slate-900">{editingDates.year}</span></p>
                            </div>
                            <div>
                                <Label>Ramadan Start Date *</Label>
                                <Input
                                    type="date"
                                    value={editingDates.ramadan_start_date}
                                    onChange={(e) => setEditingDates({ ...editingDates, ramadan_start_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Ramadan End Date *</Label>
                                <Input
                                    type="date"
                                    value={editingDates.ramadan_end_date}
                                    onChange={(e) => setEditingDates({ ...editingDates, ramadan_end_date: e.target.value })}
                                />
                            </div>
                            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                                <p className="text-sm text-amber-800">
                                    ⚠️ These dates will be updated everywhere they are used, including existing shift timings and project configurations.
                                </p>
                            </div>
                            <div className="flex gap-2 pt-4">
                                <Button type="submit" disabled={updateMutation.isPending}>
                                    Update Dates
                                </Button>
                                <Button type="button" variant="outline" onClick={() => setEditingDates(null)}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* Shift Designer Dialog */}
            {editingSchedule && (
                <RamadanShiftDesigner
                    schedule={editingSchedule}
                    onClose={() => setEditingSchedule(null)}
                />
            )}
        </div>
    );
}