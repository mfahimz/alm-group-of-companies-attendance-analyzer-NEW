import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Terminal, Plus, Clock, CheckCircle2, AlertCircle, PlayCircle, Snowflake, Braces, GitPullRequest, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ["Logic", "UI", "Architecture"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Pending", "In Progress", "Frozen", "Completed"];

const StatusIcon = ({ status }) => {
    switch (status) {
        case 'Pending': return <Clock className="w-4 h-4 text-slate-400" />;
        case 'In Progress': return <PlayCircle className="w-4 h-4 text-blue-500" />;
        case 'Frozen': return <AlertCircle className="w-4 h-4 text-amber-500" />;
        case 'Completed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
        default: return null;
    }
};

const PriorityBadge = ({ priority }) => {
    const variants = {
        Low: "outline",
        Medium: "secondary",
        High: "destructive",
        Critical: "destructive"
    };
    return <Badge variant={variants[priority] || "default"}>{priority}</Badge>;
};

export default function DeveloperPortal() {
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [newRequest, setNewRequest] = useState({
        title: '',
        category: 'Logic',
        priority: 'Medium',
        description: '',
        status: 'Pending',
        technical_notes: ''
    });
    const [selectedNotes, setSelectedNotes] = useState(null);

    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ['developerChangeRequests'],
        queryFn: () => base44.entities.DeveloperChangeLog.list('-created_at')
    });

    const createMutation = useMutation({
        mutationFn: (requestData) => base44.entities.DeveloperChangeLog.create({
            ...requestData,
            created_by: user?.email,
            created_at: new Date().toISOString()
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Request added');
            setNewRequest({ title: '', category: 'Logic', priority: 'Medium', description: '', status: 'Pending', technical_notes: '' });
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.DeveloperChangeLog.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Changes saved');
            setEditingId(null);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.DeveloperChangeLog.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Request deleted');
        }
    });

    const handleAdd = () => {
        if (!newRequest.title) {
            toast.error('Title is required');
            return;
        }
        createMutation.mutate(newRequest);
    };

    const startEditing = (req) => {
        setEditingId(req.id);
        setEditForm(req);
    };

    const handleSaveEdit = () => {
        updateMutation.mutate({ id: editingId, data: editForm });
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-indigo-600 font-semibold mb-2">
                        <Terminal className="w-5 h-5" />
                        <span>Developer Portal</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Change Management</h1>
                    <p className="text-slate-500">
                        Excel-style maintenance for architectural and logic changes.
                    </p>
                </div>
            </header>

            <Card className="border-none shadow-sm overflow-hidden bg-white">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[200px]">Title</TableHead>
                            <TableHead className="w-[120px]">Category</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[120px]">Priority</TableHead>
                            <TableHead className="w-[140px]">Status</TableHead>
                            <TableHead className="w-[100px]">Notes</TableHead>
                            <TableHead className="w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {/* Inline Add Row */}
                        <TableRow className="bg-slate-50/50">
                            <TableCell>
                                <Input 
                                    placeholder="New request title..." 
                                    className="h-8 text-sm"
                                    value={newRequest.title}
                                    onChange={(e) => setNewRequest({...newRequest, title: e.target.value})}
                                />
                            </TableCell>
                            <TableCell>
                                <Select 
                                    value={newRequest.category} 
                                    onValueChange={(val) => setNewRequest({...newRequest, category: val})}
                                >
                                    <SelectTrigger className="h-8 text-xs bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell>
                                <Input 
                                    placeholder="Quick description..." 
                                    className="h-8 text-sm"
                                    value={newRequest.description}
                                    onChange={(e) => setNewRequest({...newRequest, description: e.target.value})}
                                />
                            </TableCell>
                            <TableCell>
                                <Select 
                                    value={newRequest.priority} 
                                    onValueChange={(val) => setNewRequest({...newRequest, priority: val})}
                                >
                                    <SelectTrigger className="h-8 text-xs bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell>
                                <Select 
                                    value={newRequest.status} 
                                    onValueChange={(val) => setNewRequest({...newRequest, status: val})}
                                >
                                    <SelectTrigger className="h-8 text-xs bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 h-8 px-2 text-slate-400 hover:text-indigo-600"
                                    onClick={() => setSelectedNotes({ isNew: true })}
                                >
                                    <Braces className="w-4 h-4" />
                                </Button>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button 
                                    size="sm" 
                                    className="h-8 bg-indigo-600 hover:bg-indigo-700 h-8"
                                    onClick={handleAdd}
                                    disabled={createMutation.isPending}
                                >
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </TableCell>
                        </TableRow>

                        {/* Existing Requests */}
                        {isLoading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">Loading data...</TableCell></TableRow>
                        ) : requests.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No requests found. Start by adding one above.</TableCell></TableRow>
                        ) : (
                            requests.map((req) => (
                                <TableRow key={req.id} className={editingId === req.id ? "bg-indigo-50/30" : ""}>
                                    {editingId === req.id ? (
                                        <>
                                            <TableCell>
                                                <Input 
                                                    className="h-8 text-sm"
                                                    value={editForm.title}
                                                    onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Select 
                                                    value={editForm.category} 
                                                    onValueChange={(val) => setEditForm({...editForm, category: val})}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Input 
                                                    className="h-8 text-sm"
                                                    value={editForm.description}
                                                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Select 
                                                    value={editForm.priority} 
                                                    onValueChange={(val) => setEditForm({...editForm, priority: val})}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Select 
                                                    value={editForm.status} 
                                                    onValueChange={(val) => setEditForm({...editForm, status: val})}
                                                >
                                                    <SelectTrigger className="h-8 text-xs bg-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-8 h-8 px-2 text-indigo-600"
                                                    onClick={() => setSelectedNotes(req)}
                                                >
                                                    <Braces className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={handleSaveEdit}>
                                                    <Save className="w-4 h-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={() => setEditingId(null)}>
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </>
                                    ) : (
                                        <>
                                            <TableCell className="font-medium cursor-pointer" onClick={() => startEditing(req)}>{req.title}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[10px] uppercase">{req.category}</Badge>
                                            </TableCell>
                                            <TableCell className="max-w-[300px] truncate text-slate-500 cursor-pointer" onClick={() => startEditing(req)}>
                                                {req.description}
                                            </TableCell>
                                            <TableCell>
                                                <PriorityBadge priority={req.priority} />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <StatusIcon status={req.status} />
                                                    <span>{req.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-8 h-8 px-2 text-slate-400 hover:text-indigo-600"
                                                    onClick={() => setSelectedNotes(req)}
                                                >
                                                    <Braces className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                            <TableCell className="text-right space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 p-0" onClick={() => startEditing(req)}>
                                                    <GitPullRequest className="w-4 h-4 text-indigo-400" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 p-0" onClick={() => deleteMutation.mutate(req.id)}>
                                                    <Trash2 className="w-4 h-4 text-rose-400" />
                                                </Button>
                                            </TableCell>
                                        </>
                                    )}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            <Dialog open={!!selectedNotes} onOpenChange={() => setSelectedNotes(null)}>
                <DialogContent className="sm:max-w-[700px]">
                    <DialogHeader>
                        <DialogTitle>Implementation Prompt Base</DialogTitle>
                        <DialogDescription>
                            Rich technical notes and prompt sequences for this change.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea 
                            className="min-h-[400px] font-mono text-sm bg-slate-900 text-slate-100 p-4 rounded-lg focus:ring-indigo-500"
                            placeholder="Paste implementation prompts or technical architecture details here..."
                            value={selectedNotes?.isNew ? newRequest.technical_notes : (editingId === selectedNotes?.id ? editForm.technical_notes : selectedNotes?.technical_notes)}
                            onChange={(e) => {
                                if (selectedNotes?.isNew) {
                                    setNewRequest({...newRequest, technical_notes: e.target.value});
                                } else if (editingId === selectedNotes?.id) {
                                    setEditForm({...editForm, technical_notes: e.target.value});
                                } else {
                                    // If not editing, we might want to allow quick update or require entering edit mode
                                    setEditForm({...selectedNotes, technical_notes: e.target.value});
                                    setEditingId(selectedNotes.id);
                                }
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setSelectedNotes(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
