// FIX 1: This component previously called base44.entities.ChangeRequest throughout.
// ChangeRequest has no corresponding JSON schema file in entities/ and does not exist
// in the platform. DeveloperChangeLog is the correct, existing entity for all developer
// change tracking. All entity calls now use base44.entities.DeveloperChangeLog.
//
// Field mapping changes applied:
//   - notes       → technical_notes  (matches DeveloperChangeLog schema field name)
//   - target_date → removed          (field does not exist in DeveloperChangeLog schema)
//   - updated_at  → removed from update payloads (field not declared in schema)
//   - sort by '-created_date' → '-created_at' (correct field name in DeveloperChangeLog)
//
// FIX 5: Removed unused imports: Filter, ChevronRight, MessageSquare, Highlighter,
//         Tabs, TabsContent, TabsList, TabsTrigger.
//
// FIX 6: CATEGORIES constant updated to match DeveloperChangeLog entity schema exactly.
//         Schema enum is ['Logic', 'UI', 'Architecture']. Removed 'UI/UX' and 'Bug'
//         which were invalid values not present in the schema.
//         CATEGORY_COLORS updated accordingly: removed 'UI/UX' and 'Bug', added 'UI'.

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
    Search,
    Loader2,
    Trash2,
    Pencil,
    StickyNote,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { toast } from 'sonner';

// --- Constants ---
const STATUSES = ['Pending', 'In Progress', 'Frozen', 'Completed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

// FIX 6: Values now match DeveloperChangeLog entity schema enum exactly.
// Previously: ['Architecture', 'UI/UX', 'Logic', 'Bug'] — 'UI/UX' and 'Bug' were invalid.
const CATEGORIES = ['Architecture', 'UI', 'Logic'];

const STATUS_ICONS = {
    'Pending': <Clock className="w-4 h-4 text-slate-400" />,
    'In Progress': <Loader2 className="w-4 h-4 text-blue-500 animate-spin-slow" />,
    'Frozen': <Snowflake className="w-4 h-4 text-cyan-500" />,
    'Completed': <CheckCircle2 className="w-4 h-4 text-emerald-500" />
};

const PRIORITY_COLORS = {
    'Low': 'bg-slate-100 text-slate-700 border-slate-200',
    'Medium': 'bg-blue-50 text-blue-700 border-blue-200',
    'High': 'bg-orange-50 text-orange-700 border-orange-200',
    'Critical': 'bg-red-50 text-red-700 border-red-200'
};

// FIX 6: Removed 'UI/UX' and 'Bug' keys. Added 'UI' to match entity schema.
const CATEGORY_COLORS = {
    'Architecture': 'bg-purple-50 text-purple-700 border-purple-200',
    'UI': 'bg-pink-50 text-pink-700 border-pink-200',
    'Logic': 'bg-indigo-50 text-indigo-700 border-indigo-200',
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

    // FIX 1: Renamed 'notes' → 'technical_notes' to match DeveloperChangeLog schema.
    // FIX 1: Removed 'target_date' — this field does not exist in DeveloperChangeLog.
    const [formValues, setFormValues] = useState({
        title: '',
        description: '',
        priority: 'Medium',
        status: 'Pending',
        category: 'Logic',
        technical_notes: ''
    });

    // Filtering
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilters, setActiveFilters] = useState({
        priority: 'all',
        category: 'all'
    });

    // FIX 1: Now calls base44.entities.DeveloperChangeLog instead of base44.entities.ChangeRequest.
    // ChangeRequest entity does not exist. Removed the guard check that warned about it.
    // Sort field corrected from '-created_date' to '-created_at' to match DeveloperChangeLog schema.
    const fetchRequests = useCallback(async () => {
        setIsLoading(true);
        try {
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
            // FIX 1: Reads req.technical_notes (was req.notes). Removed req.target_date.
            setFormValues({
                title: req.title || '',
                description: req.description || '',
                priority: req.priority || 'Medium',
                status: req.status || 'Pending',
                category: req.category || 'Logic',
                technical_notes: req.technical_notes || ''
            });
        } else {
            setEditingRequest(null);
            setFormValues({
                title: '',
                description: '',
                priority: 'Medium',
                status: 'Pending',
                category: 'Logic',
                technical_notes: ''
            });
        }
        setIsModalOpen(true);
    };

    // FIX 1: Now calls base44.entities.DeveloperChangeLog instead of base44.entities.ChangeRequest.
    // Removed updated_at from the update payload — not a declared field in DeveloperChangeLog schema.
    const handleSave = async () => {
        if (!formValues.title.trim()) {
            toast.error('Title is required');
            return;
        }

        setIsSaving(true);
        try {
            if (editingRequest) {
                await base44.entities.DeveloperChangeLog.update(editingRequest.id, {
                    ...formValues
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

    // FIX 1: Now calls base44.entities.DeveloperChangeLog instead of base44.entities.ChangeRequest.
    // Removed updated_at from the payload — not a declared field in DeveloperChangeLog schema.
    const handleUpdateStatus = async (id, newStatus) => {
        try {
            await base44.entities.DeveloperChangeLog.update(id, { status: newStatus });
            fetchRequests();
            toast.success(`Status updated to ${newStatus}`);
        } catch (error) {
            toast.error('Failed to update status');
        }
    };

    // FIX 1: Now calls base44.entities.DeveloperChangeLog instead of base44.entities.ChangeRequest.
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
                        <SelectTrigger className="w-32 h-10">
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
                    <Button onClick={() => handleOpenModal()} className="h-10 bg-slate-900">
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
                                {/* FIX 1: Replaced 'Target Date' column — target_date does not exist in DeveloperChangeLog.
                                    Using implemented_date which is a valid DeveloperChangeLog field. */}
                                <th className="px-4 py-3">Implemented Date</th>
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
                                    {/* FIX 1: Display implemented_date (valid schema field) instead of target_date */}
                                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                                        {req.implemented_date || 'Not set'}
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
                <DialogContent className="max-w-2xl">
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
                            {/* FIX 6: Dropdown now shows only valid schema values: Architecture, UI, Logic */}
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
                        {/* FIX 1: Removed Target Date field entirely — target_date does not exist
                            in DeveloperChangeLog schema. The grid slot is intentionally left empty
                            so the col-span-2 technical_notes field below aligns correctly. */}
                        <div className="col-span-2 space-y-2">
                            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                <StickyNote className="w-3.5 h-3.5" />
                                Technical Notes / Implementation Details
                            </label>
                            {/* FIX 1: Field renamed from 'notes' to 'technical_notes' to match
                                DeveloperChangeLog schema. Data is stored in technical_notes on the entity. */}
                            <textarea
                                className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono text-[11px]"
                                placeholder="Paste relevant AI prompts or implementation notes here..."
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
                        {/* FIX 1: Removed target_date display — field does not exist in DeveloperChangeLog schema */}
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

                {/* FIX 1: Changed request.notes → request.technical_notes to match DeveloperChangeLog schema */}
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
