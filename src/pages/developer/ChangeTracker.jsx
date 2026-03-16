import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
    Terminal, 
    Plus, 
    Trash2, 
    Loader2, 
    CheckCircle2, 
    AlertCircle,
    ChevronDown,
    Search,
    ArrowUpDown,
    SortAsc,
    SortDesc
} from 'lucide-react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// --- Constants ---
const SECTIONS = ["Changes", "User Requests", "CEO Approval"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Pending", "In Progress", "Frozen", "Completed"];

const EditableRow = ({ item, onUpdate, onDelete }) => {
    const [localItem, setLocalItem] = useState(item);
    const [isSaving, setIsSaving] = useState(false);
    const [hasError, setHasError] = useState(false);

    // Sync with external updates
    useEffect(() => {
        setLocalItem(item);
    }, [item]);

    const handleChange = (field, value) => {
        setLocalItem(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async (updatedField = null) => {
        const currentData = updatedField ? { ...localItem, ...updatedField } : localItem;
        
        const hasChanged = 
            currentData.priority !== item.priority ||
            currentData.status !== item.status ||
            currentData.description !== item.description;

        if (!hasChanged) return;

        setIsSaving(true);
        setHasError(false);
        try {
            await onUpdate(item.id, currentData);
            setHasError(false);
        } catch (error) {
            setHasError(true);
            toast.error(`Auto-save failed`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <tr className={cn(
            "hover:bg-slate-50/80 transition-colors group border-b border-slate-100 last:border-0",
            localItem.status === 'Completed' && "bg-emerald-50/60 hover:bg-emerald-100/60"
        )}>
            <td className="p-2 flex-1 min-w-[400px]">
                <Textarea 
                    value={localItem.description || ''} 
                    onChange={(e) => handleChange('description', e.target.value)}
                    onBlur={() => handleSave()}
                    className="min-h-[60px] w-full text-sm bg-transparent border-transparent hover:border-slate-200 focus:bg-white focus:border-slate-300 shadow-none focus:ring-0 px-2 py-1.5 resize-y transition-all"
                    placeholder="Describe the change..."
                />
            </td>
            <td className="p-2 w-32 align-top pt-3">
                <Select 
                    value={localItem.priority || "Medium"} 
                    onValueChange={(v) => {
                        handleChange('priority', v);
                        handleSave({ priority: v });
                    }}
                >
                    <SelectTrigger className="h-8 text-xs border-transparent hover:border-slate-200 bg-transparent focus:ring-0 shadow-none px-2">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PRIORITIES.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                    </SelectContent>
                </Select>
            </td>
            <td className="p-2 w-40 align-top pt-3">
                <Select 
                    value={localItem.status || "Pending"} 
                    onValueChange={(v) => {
                        handleChange('status', v);
                        handleSave({ status: v });
                    }}
                >
                    <SelectTrigger className="h-8 text-xs border-transparent hover:border-slate-200 bg-transparent focus:ring-0 shadow-none px-2">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                </Select>
            </td>
            <td className="p-2 w-20 text-right align-top pt-3">
                <div className="flex items-center justify-end gap-1.5 px-2">
                    <div className="min-w-[14px]">
                        {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                        ) : hasError ? (
                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 opacity-0 group-hover:opacity-40 transition-opacity" />
                        )}
                    </div>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        onClick={() => onDelete(item.id)}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </td>
        </tr>
    );
};

const SectionContainer = ({ title, items, onUpdate, onDelete, onAdd, sortConfig, onSort }) => {
    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity" />;
        return sortConfig.direction === 'asc' ? <SortAsc className="w-3 h-3 text-indigo-600" /> : <SortDesc className="w-3 h-3 text-indigo-600" />;
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3 px-1">
                <div className="bg-indigo-600 w-1.5 h-5 rounded-full" />
                <h2 className="text-lg font-black text-slate-800 tracking-tight">{title}</h2>
                <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] font-bold">
                    {items.length}
                </Badge>
            </div>
            
            <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            <tr>
                                <th 
                                    className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                    onClick={() => onSort('description')}
                                >
                                    <div className="flex items-center gap-2">
                                        Change <SortIcon column="description" />
                                    </div>
                                </th>
                                <th 
                                    className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none w-32"
                                    onClick={() => onSort('priority')}
                                >
                                    <div className="flex items-center gap-2">
                                        Priority <SortIcon column="priority" />
                                    </div>
                                </th>
                                <th 
                                    className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none w-40"
                                    onClick={() => onSort('status')}
                                >
                                    <div className="flex items-center gap-2">
                                        Status <SortIcon column="status" />
                                    </div>
                                </th>
                                <th className="px-3 py-3 w-24 text-right">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                                        onClick={() => onAdd(title)}
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {items.map(item => (
                                <EditableRow 
                                    key={item.id} 
                                    item={item} 
                                    onUpdate={onUpdate} 
                                    onDelete={onDelete} 
                                />
                            ))}
                        </tbody>
                    </table>
                    
                    {items.length === 0 && (
                        <div className="py-14 flex flex-col items-center justify-center text-slate-400">
                            <div className="p-4 bg-slate-50 rounded-2xl mb-4">
                                <Plus className="w-8 h-8 opacity-10" />
                            </div>
                            <p className="text-sm italic font-medium">No results found.</p>
                            <p className="text-xs opacity-60">Try adjusting your filters or click the + button to add an entry.</p>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default function ChangeTracker() {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'description', direction: 'asc' });

    // Weight maps for intelligent sorting
    const priorityWeight = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
    const statusWeight = { 'Pending': 1, 'In Progress': 2, 'Frozen': 3, 'Completed': 4 };

    // Data Fetching
    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: allRecords = [], isLoading } = useQuery({
        queryKey: ['developerChangeRequests'],
        queryFn: () => base44.entities.DeveloperChangeLog.list()
    });

    // Mutations
    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.DeveloperChangeLog.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
        }
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.DeveloperChangeLog.create({
            ...data,
            created_by: user?.email || 'admin',
            created_at: new Date().toISOString()
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Row added successfully');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.DeveloperChangeLog.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Row deleted');
        }
    });

    // Handlers
    const handleUpdate = async (id, data) => {
        return updateMutation.mutateAsync({ id, data });
    };

    const handleDelete = (id) => {
        if (confirm('Permanently delete this row?')) {
            deleteMutation.mutate(id);
        }
    };

    const handleAdd = (section) => {
        createMutation.mutate({
            title: 'Request',
            section_type: section,
            category: 'Logic',
            priority: 'Medium',
            status: 'Pending',
            description: ''
        });
    };

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    // Filter and Sort Logic
    const processedRecords = React.useMemo(() => {
        let result = [...allRecords];

        // Search Filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(r => 
                (r.description || '').toLowerCase().includes(query) ||
                (r.section_type || '').toLowerCase().includes(query)
            );
        }

        // Sorting
        result.sort((a, b) => {
            // Rule 1: 'Completed' tasks are always pinned to the bottom
            const isACompleted = a.status === 'Completed';
            const isBCompleted = b.status === 'Completed';

            if (isACompleted && !isBCompleted) return 1;
            if (!isACompleted && isBCompleted) return -1;

            // Rule 2: Normal sorting logic for non-completed items (or between two completed items)
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            // Custom weights for specific columns
            if (sortConfig.key === 'priority') {
                valA = priorityWeight[valA] || 0;
                valB = priorityWeight[valB] || 0;
            } else if (sortConfig.key === 'status') {
                valA = statusWeight[valA] || 0;
                valB = statusWeight[valB] || 0;
            } else {
                valA = (valA || '').toString().toLowerCase();
                valB = (valB || '').toString().toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [allRecords, searchQuery, sortConfig]);

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <div className="text-center">
                    <p className="text-slate-900 font-bold">Loading Portal</p>
                    <p className="text-slate-400 text-sm">Fetching change logs from the cloud...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-8">
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-black uppercase tracking-widest border border-indigo-100">
                        <Terminal className="w-3.5 h-3.5" />
                        Internal System
                    </div>
                    <h1 className="text-5xl font-black text-slate-900 tracking-tighter">Developer Portal v2</h1>
                    <p className="text-slate-500 text-lg leading-relaxed max-w-2xl">
                        Streamlined, inline-editable management for all system changes, user requests, and CEO approvals.
                    </p>
                </div>
                <div className="flex items-center gap-4 w-full md:w-80">
                    <div className="relative w-full group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 z-10" />
                        <Input 
                            placeholder="Type to filter changes..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-11 h-11 bg-white border-2 border-indigo-100 hover:border-indigo-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50 transition-all text-sm rounded-2xl shadow-sm placeholder:text-slate-400"
                        />
                    </div>
                </div>
            </header>

            <script>{`console.log('Developer Portal Spreadsheet Mode v2.1 Activated')`}</script>

            <div className="grid grid-cols-1 gap-12">
                {SECTIONS.map(section => (
                    <SectionContainer 
                        key={section}
                        title={section}
                        items={processedRecords.filter(r => r.section_type === section)}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onAdd={handleAdd}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                    />
                ))}
            </div>

            <footer className="pt-20 pb-10 text-center border-t border-slate-100">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">
                    Powered by Base44 • Attendance Analyzer v4.0.0
                </p>
            </footer>
        </div>
    );
}