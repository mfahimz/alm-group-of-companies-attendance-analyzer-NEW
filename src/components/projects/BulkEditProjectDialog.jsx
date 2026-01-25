import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function BulkEditProjectDialog({ open, onClose, selectedProjects }) {
    const [updates, setUpdates] = useState({
        status: { enabled: false, value: '' },
        company: { enabled: false, value: '' }
    });

    const queryClient = useQueryClient();

    const bulkUpdateMutation = useMutation({
        mutationFn: async () => {
            const updateData = {};
            if (updates.status.enabled) updateData.status = updates.status.value;
            if (updates.company.enabled) updateData.company = updates.company.value;

            await Promise.all(
                selectedProjects.map(project => 
                    base44.entities.Project.update(project.id, updateData)
                )
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projects']);
            toast.success(`${selectedProjects.length} projects updated`);
            onClose();
        },
        onError: () => {
            toast.error('Failed to update projects');
        }
    });

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Bulk Edit {selectedProjects.length} Projects</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                    <p className="text-sm text-slate-600">
                        Select which fields to update for all selected projects
                    </p>

                    <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.company.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    company: { ...prev.company, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>Company</Label>
                                <Select
                                    value={updates.company.value}
                                    onValueChange={(value) => setUpdates(prev => ({
                                        ...prev,
                                        company: { ...prev.company, value }
                                    }))}
                                    disabled={!updates.company.enabled}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Al Maraghi Auto Repairs">Al Maraghi Auto Repairs</SelectItem>
                                        <SelectItem value="Al Maraghi Automotive">Al Maraghi Automotive</SelectItem>
                                        <SelectItem value="Naser Mohsin Auto Parts">Naser Mohsin Auto Parts</SelectItem>
                                        <SelectItem value="Astra Auto Parts">Astra Auto Parts</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            <Checkbox
                                checked={updates.status.enabled}
                                onCheckedChange={(checked) => setUpdates(prev => ({
                                    ...prev,
                                    status: { ...prev.status, enabled: checked }
                                }))}
                            />
                            <div className="flex-1">
                                <Label>Status</Label>
                                <Select
                                    value={updates.status.value}
                                    onValueChange={(value) => setUpdates(prev => ({
                                        ...prev,
                                        status: { ...prev.status, value }
                                    }))}
                                    disabled={!updates.status.enabled}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">Draft</SelectItem>
                                        <SelectItem value="analyzed">Analyzed</SelectItem>
                                        <SelectItem value="locked">Locked</SelectItem>
                                        <SelectItem value="closed">Closed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button
                            onClick={() => bulkUpdateMutation.mutate()}
                            disabled={bulkUpdateMutation.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {bulkUpdateMutation.isPending ? 'Updating...' : 'Update All'}
                        </Button>
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}