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
    ChevronDown
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
        <tr className="hover:bg-slate-50/80 transition-colors group border-b border-slate-100 last:border-0">
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

const SectionContainer = ({ title, items, onUpdate, onDelete, onAdd }) => {
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
                                <th className="px-3 py-3">Change</th>
                                <th className="px-3 py-3">Priority</th>
                                <th className="px-3 py-3">Status</th>
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
                            <p className="text-sm italic font-medium">No {title} logged yet.</p>
                            <p className="text-xs opacity-60">Click the + button in the header to add an entry.</p>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default function ChangeTracker() {
    const queryClient = useQueryClient();

    // Data Fetching
    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: allRecords = [], isLoading } = useQuery({
        queryKey: ['developerChangeRequests'],
        queryFn: () => base44.entities.DeveloperChangeLog.list('-created_at')
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
                <div className="flex items-center gap-3">
                    <div className="text-right hidden md:block">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Signed in as</p>
                        <p className="text-sm font-medium text-slate-700">{user?.email || 'Administrator'}</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                        <Terminal className="w-5 h-5" />
                    </div>
                </div>
            </header>

            <script>{`console.log('Developer Portal Spreadsheet Mode v2.1 Activated')`}</script>

            <div className="grid grid-cols-1 gap-12">
                {SECTIONS.map(section => (
                    <SectionContainer 
                        key={section}
                        title={section}
                        items={allRecords.filter(r => r.section_type === section)}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                        onAdd={handleAdd}
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