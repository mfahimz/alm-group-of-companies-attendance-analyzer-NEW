import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function JobPositions() {
    const [showDialog, setShowDialog] = useState(false);
    const [editingPosition, setEditingPosition] = useState(null);
    const [selectedPosition, setSelectedPosition] = useState(null);
    const [showReqDialog, setShowReqDialog] = useState(false);
    const [newReq, setNewReq] = useState({ requirement_text: '', importance: 'must_have', weight: 1 });
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: jobPositions = [] } = useQuery({
        queryKey: ['jobPositions'],
        queryFn: () => base44.entities.JobPosition.list('-created_date'),
        enabled: !!currentUser
    });

    const { data: jobRequirements = [] } = useQuery({
        queryKey: ['jobRequirements'],
        queryFn: () => base44.entities.JobRequirement.list(),
        enabled: !!currentUser
    });

    const createPositionMutation = useMutation({
        mutationFn: async (data) => {
            const position = await base44.entities.JobPosition.create({
                ...data,
                created_by_name: currentUser.full_name
            });
            return position;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobPositions'] });
            setShowDialog(false);
            setEditingPosition(null);
            toast.success('Position created successfully');
        },
        onError: (error) => toast.error(error.message)
    });

    const updatePositionMutation = useMutation({
        mutationFn: (data) => base44.entities.JobPosition.update(editingPosition.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobPositions'] });
            setShowDialog(false);
            setEditingPosition(null);
            toast.success('Position updated successfully');
        },
        onError: (error) => toast.error(error.message)
    });

    const deletePositionMutation = useMutation({
        mutationFn: (id) => base44.entities.JobPosition.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobPositions'] });
            toast.success('Position deleted');
        },
        onError: (error) => toast.error(error.message)
    });

    const addRequirementMutation = useMutation({
        mutationFn: () => base44.entities.JobRequirement.create({
            job_position_id: selectedPosition.id,
            ...newReq
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobRequirements'] });
            setNewReq({ requirement_text: '', importance: 'must_have', weight: 1 });
            setShowReqDialog(false);
            toast.success('Requirement added');
        },
        onError: (error) => toast.error(error.message)
    });

    const deleteRequirementMutation = useMutation({
        mutationFn: (id) => base44.entities.JobRequirement.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobRequirements'] });
            toast.success('Requirement deleted');
        },
        onError: (error) => toast.error(error.message)
    });

    const positionRequirements = selectedPosition ? jobRequirements.filter(r => r.job_position_id === selectedPosition.id) : [];

    const handleSavePosition = (data) => {
        if (editingPosition) {
            updatePositionMutation.mutate(data);
        } else {
            createPositionMutation.mutate(data);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-slate-900">Job Positions</h1>
                <Button onClick={() => {
                    setEditingPosition(null);
                    setShowDialog(true);
                }}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Position
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Positions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Title</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Requirements</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobPositions.map(pos => {
                                    const reqCount = jobRequirements.filter(r => r.job_position_id === pos.id).length;
                                    return (
                                        <TableRow key={pos.id}>
                                            <TableCell className="font-medium">{pos.title}</TableCell>
                                            <TableCell>{pos.created_by_name}</TableCell>
                                            <TableCell>{reqCount}</TableCell>
                                            <TableCell>
                                                {pos.active ? (
                                                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Active</span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">Inactive</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setSelectedPosition(pos);
                                                            setShowReqDialog(true);
                                                        }}
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            if (confirm('Delete this position?')) {
                                                                deletePositionMutation.mutate(pos.id);
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Position Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingPosition ? 'Edit Position' : 'New Job Position'}</DialogTitle>
                    </DialogHeader>
                    <JobPositionForm
                        position={editingPosition}
                        onSave={handleSavePosition}
                        onCancel={() => {
                            setShowDialog(false);
                            setEditingPosition(null);
                        }}
                        isLoading={createPositionMutation.isPending || updatePositionMutation.isPending}
                    />
                </DialogContent>
            </Dialog>

            {/* Requirements Dialog */}
            <Dialog open={showReqDialog} onOpenChange={setShowReqDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Requirements for {selectedPosition?.title}</DialogTitle>
                    </DialogHeader>
                    {selectedPosition && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Add Requirement</Label>
                                <Textarea
                                    placeholder="e.g., 5+ years of React experience"
                                    value={newReq.requirement_text}
                                    onChange={(e) => setNewReq({ ...newReq, requirement_text: e.target.value })}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <Select value={newReq.importance} onValueChange={(val) => setNewReq({ ...newReq, importance: val })}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="must_have">Must Have</SelectItem>
                                            <SelectItem value="nice_to_have">Nice to Have</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        type="number"
                                        min="1"
                                        max="5"
                                        value={newReq.weight}
                                        onChange={(e) => setNewReq({ ...newReq, weight: parseInt(e.target.value) })}
                                        placeholder="Weight (1-5)"
                                    />
                                </div>
                                <Button onClick={() => addRequirementMutation.mutate()} className="w-full">
                                    Add Requirement
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <h3 className="font-medium">Current Requirements</h3>
                                {positionRequirements.length === 0 ? (
                                    <p className="text-sm text-slate-500">No requirements added yet</p>
                                ) : (
                                    <div className="space-y-2">
                                        {positionRequirements.map(req => (
                                            <div key={req.id} className="flex justify-between items-start p-3 border rounded bg-slate-50">
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium">{req.requirement_text}</p>
                                                    <div className="flex gap-2 mt-1 text-xs text-slate-600">
                                                        <span className="px-2 py-0.5 bg-white rounded">{req.importance}</span>
                                                        <span className="px-2 py-0.5 bg-white rounded">Weight: {req.weight}</span>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => deleteRequirementMutation.mutate(req.id)}
                                                >
                                                    <X className="w-4 h-4 text-red-600" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function JobPositionForm({ position, onSave, onCancel, isLoading }) {
    const [formData, setFormData] = React.useState({
        title: position?.title || '',
        description: position?.description || '',
        active: position?.active ?? true
    });

    return (
        <div className="space-y-4">
            <div>
                <Label>Position Title</Label>
                <Input
                    placeholder="e.g., Senior React Developer"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
            </div>
            <div>
                <Label>Description</Label>
                <Textarea
                    placeholder="Job description and details"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                />
            </div>
            <div>
                <Label>Status</Label>
                <Select value={formData.active ? 'active' : 'inactive'} onValueChange={(val) => setFormData({ ...formData, active: val === 'active' })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button onClick={() => onSave(formData)} disabled={isLoading || !formData.title}>
                    {isLoading ? 'Saving...' : 'Save'}
                </Button>
            </div>
        </div>
    );
}