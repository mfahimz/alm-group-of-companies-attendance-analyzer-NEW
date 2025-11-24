import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function EditDayRecordDialog({ open, onClose, dayRecord, project, attendanceId }) {
    const [formData, setFormData] = useState({
        type: 'MANUAL_PRESENT',
        details: `Manual edit for ${dayRecord?.date || ''}`
    });
    const queryClient = useQueryClient();

    const createExceptionMutation = useMutation({
        mutationFn: (data) => base44.entities.Exception.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success('Day record updated successfully');
            onClose();
        },
        onError: () => {
            toast.error('Failed to update day record');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!dayRecord) return;

        // Parse DD/MM/YYYY format to YYYY-MM-DD
        const [day, month, year] = dayRecord.date.split('/');
        const dateStr = `${year}-${month}-${day}`;

        createExceptionMutation.mutate({
            project_id: project.id,
            attendance_id: attendanceId,
            date_from: dateStr,
            date_to: dateStr,
            type: formData.type,
            details: formData.details
        });
    };

    if (!dayRecord) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Day Record: {dayRecord.date}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div>
                        <Label>Current Status</Label>
                        <Input value={dayRecord.status} disabled className="bg-slate-50" />
                    </div>
                    <div>
                        <Label>Current Punches</Label>
                        <Input value={`${dayRecord.punches} punches`} disabled className="bg-slate-50" />
                    </div>
                    <div>
                        <Label>Override Status *</Label>
                        <Select
                            value={formData.type}
                            onValueChange={(value) => setFormData({ ...formData, type: value })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="MANUAL_PRESENT">Mark as Present</SelectItem>
                                <SelectItem value="MANUAL_ABSENT">Mark as Absent</SelectItem>
                                <SelectItem value="MANUAL_HALF">Mark as Half Day</SelectItem>
                                <SelectItem value="OFF">Mark as Off/Leave</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Notes/Reason</Label>
                        <Input
                            value={formData.details}
                            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                            placeholder="Reason for manual edit"
                        />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={createExceptionMutation.isPending}>
                            {createExceptionMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}