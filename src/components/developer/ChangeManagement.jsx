import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { usePermissions } from '@/components/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { 
    Plus, 
    MoreVertical, 
    Calendar, 
    AlertCircle, 
    CheckCircle2, 
    Clock, 
    Snowflake,
    Filter,
    Search,
    Loader2,
    Trash2,
    Pencil,
    ChevronRight,
    StickyNote,
    MessageSquare,
    Highlighter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

// --- Constants ---
const STATUSES = ['Backlog', 'Prompt Drafting', 'AI Generating', 'Testing', 'Deployed'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const CATEGORIES = ['UI/UX', 'Backend Logic', 'Database/Schema'];

const STATUS_ICONS = {
    'Backlog': <Clock className="w-4 h-4 text-slate-400" />,
    'Prompt Drafting': <StickyNote className="w-4 h-4 text-orange-400" />,
    'AI Generating': <Loader2 className="w-4 h-4 text-blue-500 animate-spin-slow" />,
    'Testing': <Filter className="w-4 h-4 text-purple-500" />,
    'Deployed': <CheckCircle2 className="w-4 h-4 text-emerald-500" />
};

const PRIORITY_COLORS = {
    'Low': 'bg-slate-100 text-slate-700 border-slate-200',
    'Medium': 'bg-blue-50 text-blue-700 border-blue-200',
    'High': 'bg-orange-50 text-orange-700 border-orange-200',
    'Critical': 'bg-red-50 text-red-700 border-red-200'
};

const CATEGORY_COLORS = {
    'UI/UX': 'bg-pink-50 text-pink-700 border-pink-200',
    'Backend Logic': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Database/Schema': 'bg-purple-50 text-purple-700 border-purple-200'
};

export default function ChangeManagement() {
    const { user } = usePermissions();
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState('board'); // 'board' | 'list'
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRequest, setEditingRequest] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formValues, setFormValues] = useState({
        title: '',
        description: '',
        priority: 'Medium',
        status: 'Backlog',
        category: 'UI/UX',
        implemented_date: '',
        technical_notes: ''
    });

    // Filtering
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilters, setActiveFilters] = useState({
        priority: 'all',
        category: 'all'
    });

    const fetchRequests = useCallback(async () => {
        setIsLoading(true);
        try {
            // Check if DeveloperChangeLog exists in SDK before fetch
            if (!base44.entities.DeveloperChangeLog) {
                console.warn('DeveloperChangeLog entity not found in SDK. Ensure it is defined in the platform.');
                setRequests([]);
                return;
            }
            const data = await base44.entities.DeveloperChangeLog.list('-created_at', 1000);
            setRequests(data || []);
        } catch (error) {
            console.error('Failed to fetch change requests:', error);
            toast.error('Failed to load change requests. Check console for details.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const filteredRequests = useMemo(() => {
        return requests.filter(req => {
            const matchesSearch = req.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                 req.description?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesPriority = activeFilters.priority === 'all' || req.priority === activeFilters.priority;
            const matchesCategory = activeFilters.category === 'all' || req.category === activeFilters.category;
            return matchesSearch && matchesPriority && matchesCategory;
        });
    }, [requests, searchTerm, activeFilters]);

    const handleOpenModal = (req = null) => {
        if (req) {
            setEditingRequest(req);
            setFormValues({
                title: req.title || '',
                description: req.description || '',
                priority: req.priority || 'Medium',
                status: req.status || 'Backlog',
                category: req.category || 'UI/UX',
                implemented_date: req.implemented_date || '',
                technical_notes: req.technical_notes || ''
            });
        } else {
            setEditingRequest(null);
            setFormValues({
                title: '',
                description: '',
                priority: 'Medium',
                status: 'Backlog',
                category: 'UI/UX',
                implemented_date: '',
                technical_notes: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formValues.title.trim()) {
            toast.error('Title is required');
            return;
        }

        setIsSaving(true);
        try {
            if (editingRequest) {
                await base44.entities.DeveloperChangeLog.update(editingRequest.id, {
                    ...formValues,
                    updated_at: new Date().toISOString()
                });
                toast.success('Change request updated');
            } else {
                await base44.entities.DeveloperChangeLog.create({
                    ...formValues,
                    created_by: user?.email || 'admin',
                    created_at: new Date().toISOString()
                });
                toast.success('Change request created');
            }
            setIsModalOpen(false);
            fetchRequests();
        } catch (error) {
            console.error('Save failed:', error);
            toast.error('Failed to save change request');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            await base44.entities.DeveloperChangeLog.update(id, { 
                status: newStatus,
                updated_at: new Date().toISOString()
            });
            fetchRequests();
            toast.success(`Status updated to ${newStatus}`);
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;
        try {
            await base44.entities.DeveloperChangeLog.delete(id);
            fetchRequests();
            toast.success('Deleted successfully');
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header / Actions Area */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input 
                            placeholder="Search requests..." 
                            className="pl-9 h-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Select value={activeFilters.priority} onValueChange={(v) => setActiveFilters(f => ({...f, priority: v}))}>
                        <SelectTrigger className="w-32 h-10">
                            <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Priorities</SelectItem>
                            {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={activeFilters.category} onValueChange={(v) => setActiveFilters(f => ({...f, category: v}))}>
                        <SelectTrigger className="w-40 h-10">
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-slate-100 p-1 rounded-lg flex items-center gap-1 border border-slate-200">
                        <Button 
                            variant={view === 'board' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="h-8 text-xs font-semibold"
                            onClick={() => setView('board')}
                        >
                            Board
                        </Button>
                        <Button 
                            variant={view === 'list' ? 'secondary' : 'ghost'} 
                            size="sm" 
                            className="h-8 text-xs font-semibold"
                            onClick={() => setView('list')}
                        >
                            List
                        </Button>
                    </div>
                    <Button onClick={() => handleOpenModal()} className="h-10 bg-slate-900 hover:bg-slate-800 text-white">
                        <Plus className="w-4 h-4 mr-2" />
                        Add New Change
                    </Button>
                </div>
            </div>

            {/* Content Area */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24">
                    <Loader2 className="w-10 h-10 text-slate-300 animate-spin" />
                    <p className="mt-4 text-slate-500 font-medium">Loading requests...</p>
                </div>
            ) : view === 'board' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-h-[600px]">
                    {STATUSES.map(status => (
                        <div key={status} className="flex flex-col gap-4">
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-slate-700 text-sm">{status}</h3>
                                    <Badge variant="secondary" className="bg-slate-200 text-slate-600 rounded-full w-6 h-6 flex items-center justify-center p-0">
                                        {filteredRequests.filter(r => r.status === status).length}
                                    </Badge>
                                </div>
                            </div>
                            
                            <div className="flex-1 bg-slate-50/50 rounded-xl border border-slate-200/60 p-2 space-y-3">
                                {filteredRequests.filter(r => r.status === status).map(req => (
                                    <RequestCard 
                                        key={req.id} 
                                        request={req} 
                                        onEdit={() => handleOpenModal(req)}
                                        onStatusChange={(s) => handleUpdateStatus(req.id, s)}
                                        onDelete={() => handleDelete(req.id)}
                                    />
                                ))}
                                {filteredRequests.filter(r => r.status === status).length === 0 && (
                                    <div className="py-12 flex flex-col items-center justify-center text-slate-300 border border-dashed border-slate-200 rounded-lg">
                                        <Plus className="w-6 h-6 opacity-20" />
                                        <p className="text-[10px] mt-1 font-medium italic">Empty</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium whitespace-nowrap">
                            <tr>
                                <th className="px-4 py-3">Title</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Priority</th>
                                <th className="px-4 py-3">Category</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRequests.map(req => (
                                <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 font-medium text-slate-800">{req.title}</td>
                                    <td className="px-4 py-3">
                                        <Badge variant="outline" className="flex items-center gap-1.5 w-fit">
                                            {STATUS_ICONS[req.status]}
                                            {req.status}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant="outline" className={cn("border", PRIORITY_COLORS[req.priority])}>
                                            {req.priority}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant="outline" className={cn("border", CATEGORY_COLORS[req.category])}>
                                            {req.category}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600" onClick={() => handleOpenModal(req)}>
                                                <Pencil className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => handleDelete(req.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredRequests.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400 italic">No requests found matching filters</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Upsert Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-2xl bg-white border shadow-lg">
                    <DialogHeader>
                        <DialogTitle>{editingRequest ? 'Edit Change Request' : 'Create New Change Request'}</DialogTitle>
                        <DialogDescription>
                            Define the requirements and priority for the upcoming change.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div className="col-span-2 space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Title</label>
                            <Input 
                                placeholder="Feature or Bug title..." 
                                value={formValues.title}
                                onChange={(e) => setFormValues({...formValues, title: e.target.value})}
                            />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Description</label>
                            <textarea 
                                className="flex min-h-[100px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Detailed requirements..."
                                value={formValues.description}
                                onChange={(e) => setFormValues({...formValues, description: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Priority</label>
                            <Select value={formValues.priority} onValueChange={(v) => setFormValues({...formValues, priority: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Category</label>
                            <Select value={formValues.category} onValueChange={(v) => setFormValues({...formValues, category: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Status</label>
                            <Select value={formValues.status} onValueChange={(v) => setFormValues({...formValues, status: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Implemented Date</label>
                            <Input 
                                type="date"
                                value={formValues.implemented_date}
                                onChange={(e) => setFormValues({...formValues, implemented_date: e.target.value})}
                            />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <StickyNote className="w-3.5 h-3.5" />
                                AI Prompt & Technical Notes
                            </label>
                            <textarea 
                                className="flex min-h-[160px] w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono text-[11px]"
                                placeholder="Paste relevant AI prompts or technical context here..."
                                rows={8}
                                value={formValues.technical_notes}
                                onChange={(e) => setFormValues({...formValues, technical_notes: e.target.value})}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {editingRequest ? 'Update' : 'Create'} Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function RequestCard({ request, onEdit, onStatusChange, onDelete }) {
    return (
        <Card className="shadow-sm border-slate-200/80 hover:border-slate-300 transition-all group overflow-hidden bg-white">
            <CardContent className="p-3 pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 uppercase font-bold border", CATEGORY_COLORS[request.category])}>
                        {request.category}
                    </Badge>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600" onClick={onEdit}>
                            <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-600" onClick={onDelete}>
                            <Trash2 className="w-3 h-3" />
                        </Button>
                    </div>
                </div>

                <div className="space-y-1">
                    <h4 className="font-bold text-slate-900 text-[13px] leading-tight group-hover:text-blue-600 transition-colors cursor-pointer" onClick={onEdit}>
                        {request.title}
                    </h4>
                    {request.description && (
                        <p className="text-slate-500 text-[11px] line-clamp-2 leading-relaxed">
                            {request.description}
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                    <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={cn("text-[9px] py-0 border", PRIORITY_COLORS[request.priority])}>
                            {request.priority}
                        </Badge>
                        {request.implemented_date && (
                            <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                                <Calendar className="w-2.5 h-2.5" />
                                {request.implemented_date}
                            </div>
                        )}
                    </div>
                    <Select value={request.status} onValueChange={onStatusChange}>
                        <SelectTrigger className="h-6 text-[10px] w-auto border-0 shadow-none hover:bg-slate-50 px-1 gap-1">
                            <MoreVertical className="w-3 h-3 text-slate-400" />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUSES.map(s => <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                {request.technical_notes && (
                    <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-1.5">
                        <StickyNote className="w-3 h-3 text-slate-400" />
                        <span className="text-[9px] text-slate-400 italic">Has technical notes</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
