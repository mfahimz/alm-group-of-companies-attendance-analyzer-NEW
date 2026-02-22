import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Lock, X } from 'lucide-react';
import { toast } from 'sonner';

export default function CalendarCyclesTab() {
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        cutoff_start_date: '',
        cutoff_end_date: '',
        notes: ''
    });

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: cycles = [] } = useQuery({
        queryKey: ['calendarCycles'],
        queryFn: () => base44.entities.CalendarCycle.list('-created_date')
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.functions.invoke('createCalendarCycle', data),
        onSuccess: () => {
            queryClient.invalidateQueries(['calendarCycles']);
            setShowCreateDialog(false);
            setFormData({ name: '', cutoff_start_date: '', cutoff_end_date: '', notes: '' });
            toast.success('Calendar cycle created');
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create cycle');
        }
    });

    const lockMutation = useMutation({
        mutationFn: (cycleId) => base44.functions.invoke('lockCycle', { calendar_cycle_id: cycleId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['calendarCycles']);
            toast.success('Cycle locked');
        }
    });

    const closeMutation = useMutation({
        mutationFn: (cycleId) => base44.functions.invoke('closeCycle', { calendar_cycle_id: cycleId }),
        onSuccess: () => {
            queryClient.invalidateQueries(['calendarCycles']);
            toast.success('Cycle closed and finalized');
        }
    });

    const handleCreate = (e) => {
        e.preventDefault();
        if (!formData.cutoff_start_date || !formData.cutoff_end_date) {
            toast.error('Please fill required fields');
            return;
        }
        createMutation.mutate(formData);
    };

    const handleLock = (cycleId) => {
        if (window.confirm('Lock this cycle? Edits will require admin privileges.')) {
            lockMutation.mutate(cycleId);
        }
    };

    const handleClose = (cycleId) => {
        if (window.confirm('Close and finalize this cycle? This action cannot be undone.')) {
            closeMutation.mutate(cycleId);
        }
    };

    const isAdmin = currentUser?.role === 'admin';

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Calendar Cycles</CardTitle>
                {isAdmin && (
                    <Button onClick={() => setShowCreateDialog(true)} size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        New Cycle
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                {cycles.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        No calendar cycles created yet.
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Cutoff Period</TableHead>
                                <TableHead>Payroll Month</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cycles.map((cycle) => (
                                <TableRow key={cycle.id}>
                                    <TableCell className="font-medium">{cycle.name}</TableCell>
                                    <TableCell>
                                        {new Date(cycle.cutoff_start_date).toLocaleDateString()} - {new Date(cycle.cutoff_end_date).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>{cycle.payroll_month_label}</TableCell>
                                    <TableCell>
                                        <Badge
                                            className={
                                                cycle.status === 'draft' ? 'bg-slate-100 text-slate-700' :
                                                cycle.status === 'locked' ? 'bg-amber-100 text-amber-700' :
                                                'bg-green-100 text-green-700'
                                            }
                                        >
                                            {cycle.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex gap-2 justify-end">
                                            {isAdmin && cycle.status === 'draft' && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleLock(cycle.id)}
                                                >
                                                    <Lock className="w-4 h-4 text-amber-600" />
                                                </Button>
                                            )}
                                            {isAdmin && cycle.status === 'locked' && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleClose(cycle.id)}
                                                >
                                                    <X className="w-4 h-4 text-green-600" />
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

            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Calendar Cycle</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4 mt-4">
                        <div>
                            <Label>Cycle Name</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Payroll Jan 2026"
                            />
                        </div>
                        <div>
                            <Label>Cutoff Start Date *</Label>
                            <Input
                                type="date"
                                value={formData.cutoff_start_date}
                                onChange={(e) => setFormData({ ...formData, cutoff_start_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Cutoff End Date *</Label>
                            <Input
                                type="date"
                                value={formData.cutoff_end_date}
                                onChange={(e) => setFormData({ ...formData, cutoff_end_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Notes</Label>
                            <Input
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Optional notes"
                            />
                        </div>
                        <div className="flex gap-2 pt-4">
                            <Button type="submit" disabled={createMutation.isPending}>
                                Create Cycle
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}