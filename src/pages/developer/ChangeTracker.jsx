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
    SortDesc,
    Cloud, 
    CloudOffIcon, 
    Zap, 
    Trophy,
    Sparkles,
    LayoutList,
    LayoutDashboard as LayoutBoard,
    MoreVertical,
    GripVertical
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { 
    PRIORITIES, 
    STATUSES, 
    SECTIONS, 
    sortChangeLogs, 
    parseQuickAdd, 
    calculateKarma 
} from '@/domain/changeLogRules';

const EditableRow = ({ item, onUpdate, onDelete }) => {
    const [localItem, setLocalItem] = useState(item);
    const [isSaving, setIsSaving] = useState(false);
    const [hasError, setHasError] = useState(false);

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
                                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none" onClick={() => onSort('description')}>
                                    <div className="flex items-center gap-2">Change <SortIcon column="description" /></div>
                                </th>
                                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none w-32" onClick={() => onSort('priority')}>
                                    <div className="flex items-center gap-2">Priority <SortIcon column="priority" /></div>
                                </th>
                                <th className="px-3 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none w-40" onClick={() => onSort('status')}>
                                    <div className="flex items-center gap-2">Status <SortIcon column="status" /></div>
                                </th>
                                <th className="px-3 py-3 w-24 text-right">
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700" onClick={() => onAdd(title)}>
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {items.map(item => (
                                <EditableRow key={item.id} item={item} onUpdate={onUpdate} onDelete={onDelete} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

const KanbanColumn = ({ title, items, onUpdate, onDelete, onAdd }) => {
    return (
        <div className="flex flex-col w-full min-w-[320px] max-w-[380px] h-full space-y-4">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                    <h3 className="font-black text-slate-800 text-sm tracking-tight capitalize">{title}</h3>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 h-4 border-none">
                        {items.length}
                    </Badge>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-white active:scale-95 transition-all" onClick={() => onAdd(title)}>
                        <Plus className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                        <MoreVertical className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <Droppable droppableId={title}>
                {(provided, snapshot) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                            "flex-1 min-h-[500px] transition-all duration-300 rounded-2xl p-2",
                            snapshot.isDraggingOver ? "bg-indigo-50/50 ring-2 ring-indigo-200 ring-dashed" : "bg-slate-50/40"
                        )}
                    >
                        {items.map((item, index) => (
                            <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className="mb-3"
                                    >
                                        <Card className={cn(
                                            "group p-4 border-slate-200 hover:border-indigo-300 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white cursor-default select-none relative overflow-hidden",
                                            snapshot.isDragging && "shadow-2xl border-indigo-500 rotate-[2deg] scale-105 z-50 ring-4 ring-indigo-100",
                                            item.status === 'Completed' && "bg-emerald-50/20 border-emerald-100 opacity-80"
                                        )}>
                                            <div {...provided.dragHandleProps} className="absolute left-0 top-0 bottom-0 w-1 flex items-center justify-center opacity-0 group-hover:opacity-100 text-slate-300 hover:text-indigo-400 transition-opacity cursor-grab active:cursor-grabbing hover:bg-indigo-50">
                                                <GripVertical className="w-3 h-3" />
                                            </div>
                                            
                                            <div className="space-y-4 pl-1">
                                                <p className={cn(
                                                    "text-sm font-semibold text-slate-700 leading-relaxed break-words line-clamp-4",
                                                    item.status === 'Completed' && "text-slate-400 line-through"
                                                )}>
                                                    {item.description || "Untitled Task"}
                                                </p>
                                                
                                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <Badge variant="secondary" className={cn(
                                                            "text-[9px] font-black px-1.5 py-0.5 h-4 uppercase tracking-wider",
                                                            item.priority === 'Critical' ? "bg-red-100 text-red-700 border-red-200" :
                                                            item.priority === 'High' ? "bg-orange-100 text-orange-700 border-orange-200" :
                                                            "bg-blue-100 text-blue-700 border-blue-200"
                                                        )}>
                                                            {item.priority}
                                                        </Badge>
                                                        {item.status === 'Completed' && (
                                                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px] font-black px-1.5 py-0.5 h-4 uppercase">
                                                                DONE
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-slate-600 active:scale-90 transition-all">
                                                                <MoreVertical className="w-3.5 h-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48 p-1 rounded-xl shadow-2xl border-slate-200">
                                                            <div className="px-2 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Update Status</div>
                                                            {STATUSES.map(s => (
                                                                <DropdownMenuItem key={s} className="rounded-lg text-xs font-medium focus:bg-indigo-50 focus:text-indigo-700" onClick={() => onUpdate(item.id, { status: s })}>
                                                                    <div className={cn("w-2 h-2 rounded-full mr-2", s === 'Completed' ? 'bg-emerald-500' : 'bg-slate-300')} />
                                                                    {s}
                                                                </DropdownMenuItem>
                                                            ))}
                                                            <div className="h-px bg-slate-100 my-1" />
                                                            <DropdownMenuItem className="rounded-lg text-xs font-bold text-red-600 focus:bg-red-50 focus:text-red-700" onClick={() => onDelete(item.id)}>
                                                                <Trash2 className="w-3 h-3 mr-2" />
                                                                Delete Task
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        </Card>
                                    </div>
                                )}
                            </Draggable>
                        ))}
                        {provided.placeholder}
                        <Button 
                            variant="ghost" 
                            className="w-full justify-start text-[11px] font-bold text-slate-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm border border-dashed border-transparent hover:border-indigo-100 py-3 transition-all rounded-xl mt-2 group"
                            onClick={() => onAdd(title)}
                        >
                            <Plus className="w-3.5 h-3.5 mr-2 opacity-50 group-hover:opacity-100 transition-opacity" />
                            Add Change
                        </Button>
                    </div>
                )}
            </Droppable>
        </div>
    );
};

export default function ChangeTracker() {
    const queryClient = useQueryClient();
    const [viewMode, setViewMode] = useState('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [quickAddValue, setQuickAddValue] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'description', direction: 'asc' });
    const [syncQueue, setSyncQueue] = useState({});
    const [isProcessingSync, setIsProcessingSync] = useState(false);

    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: allRecords = [], isLoading } = useQuery({
        queryKey: ['developerChangeRequests'],
        queryFn: () => base44.entities.DeveloperChangeLog.list()
    });

    const handleUpdate = useCallback(async (id, data) => {
        setSyncQueue(prev => ({
            ...prev,
            [id]: { ...(prev[id] || {}), ...data }
        }));
    }, []);

    useEffect(() => {
        if (Object.keys(syncQueue).length === 0 || isProcessingSync) return;
        const timer = setTimeout(async () => {
            setIsProcessingSync(true);
            const currentQueue = { ...syncQueue };
            setSyncQueue({});
            try {
                const promises = Object.entries(currentQueue).map(([id, data]) => 
                    base44.entities.DeveloperChangeLog.update(id, data)
                );
                await Promise.all(promises);
                queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            } catch (error) {
                toast.error("Background sync failed");
            } finally {
                setIsProcessingSync(false);
            }
        }, 5000);
        return () => clearTimeout(timer);
    }, [syncQueue, isProcessingSync, queryClient]);

    const handleDelete = (id) => {
        if (confirm('Permanently delete this?')) {
            base44.entities.DeveloperChangeLog.delete(id).then(() => {
                queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
                toast.success('Deleted successfully');
            });
        }
    };

    const handleAdd = (sectionOrData) => {
        const baseData = typeof sectionOrData === 'string' ? { section_type: sectionOrData, description: '' } : sectionOrData;
        base44.entities.DeveloperChangeLog.create({
            title: 'Request',
            category: 'Logic',
            priority: 'Medium',
            status: 'Pending',
            created_by: user?.email || 'admin',
            created_at: new Date().toISOString(),
            ...baseData
        }).then(() => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Added successfully');
        });
    };

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleQuickAdd = (e) => {
        if (e.key === 'Enter' && quickAddValue.trim()) {
            handleAdd(parseQuickAdd(quickAddValue));
            setQuickAddValue('');
            toast.success("Quick Add successful", { icon: <Sparkles className="w-4 h-4 text-indigo-500" /> });
        }
    };

    const onDragEnd = (result) => {
        const { destination, source, draggableId } = result;
        if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;
        handleUpdate(draggableId, { section_type: destination.droppableId });
        toast.success(`Moved to ${destination.droppableId}`, { icon: <Zap className="w-3.5 h-3.5 text-indigo-500" /> });
    };

    const processedRecords = React.useMemo(() => {
        let result = [...allRecords];
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(r => (r.description || '').toLowerCase().includes(query) || (r.section_type || '').toLowerCase().includes(query));
        }
        return sortChangeLogs(result, sortConfig);
    }, [allRecords, searchQuery, sortConfig]);

    const karmaScore = React.useMemo(() => calculateKarma(allRecords), [allRecords]);

    if (isLoading) return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <div className="text-center font-bold text-slate-900">Loading Portal...</div>
        </div>
    );

    return (
        <div className="max-w-[1600px] mx-auto py-12 px-6 lg:px-12 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-10 border-b border-slate-100 pb-12">
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100 shadow-sm">
                            <Terminal className="w-3.5 h-3.5" /> Internal System
                        </div>
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black border border-amber-100 shadow-sm">
                            <Trophy className="w-3.5 h-3.5" /> Karma: {karmaScore}
                        </div>
                        <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", Object.keys(syncQueue).length > 0 ? "text-blue-600 bg-blue-50 border border-blue-100 shadow-sm" : "text-emerald-600 bg-emerald-50 border border-emerald-100")}>
                            {Object.keys(syncQueue).length > 0 ? <><Cloud className="w-3.5 h-3.5 animate-bounce" /> Syncing...</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Synced</>}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-6xl font-black text-slate-900 tracking-tighter leading-tight">Project Board</h1>
                        <p className="text-slate-500 text-xl font-medium max-w-2xl leading-relaxed">High-performance engineering portal with <b>Todoist-inspired</b> architecture and <b>Command Batching</b>.</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-6">
                    <Tabs value={viewMode} onValueChange={setViewMode} className="w-full sm:w-[240px]">
                        <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1.5 rounded-2xl h-12 border border-slate-200/50 shadow-inner">
                            <TabsTrigger value="list" className="rounded-xl text-[11px] font-black data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600 transition-all uppercase tracking-wider">
                                <LayoutList className="w-4 h-4 mr-2" /> List
                            </TabsTrigger>
                            <TabsTrigger value="board" className="rounded-xl text-[11px] font-black data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600 transition-all uppercase tracking-wider">
                                <LayoutBoard className="w-4 h-4 mr-2" /> Board
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    
                    <div className="flex flex-col gap-4 w-full xl:w-[500px]">
                        <div className="relative group w-full">
                            <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 z-10 opacity-40 group-focus-within:opacity-100 group-hover:opacity-100 transition-all" />
                            <Input 
                                placeholder="Quick Add: 'Fix bug #High @In Progress [Changes]'" 
                                value={quickAddValue} 
                                onChange={(e) => setQuickAddValue(e.target.value)} 
                                onKeyDown={handleQuickAdd} 
                                className="pl-12 h-14 bg-slate-50 border-2 border-transparent hover:border-indigo-100 focus:bg-white focus:border-indigo-600 focus:ring-8 focus:ring-indigo-50 transition-all text-sm font-medium rounded-2xl shadow-sm italic placeholder:text-slate-400"
                            />
                        </div>
                        <div className="relative w-full group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 group-focus-within:text-indigo-500 transition-colors" />
                            <Input 
                                placeholder="Filter changes..." 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="pl-12 h-12 bg-white border-2 border-slate-100 hover:border-slate-200 focus:border-indigo-500 focus:ring-0 transition-all text-sm font-semibold rounded-xl shadow-none placeholder:text-slate-300"
                            />
                        </div>
                    </div>
                </div>
            </header>

            <main className="min-h-[800px]">
                {viewMode === 'list' ? (
                    <div className="space-y-16">
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
                ) : (
                    <DragDropContext onDragEnd={onDragEnd}>
                        <div className="flex items-start gap-8 overflow-x-auto pb-12 min-h-[700px] -mx-8 px-8 custom-scrollbar scroll-smooth">
                            {SECTIONS.map(section => (
                                <KanbanColumn 
                                    key={section} 
                                    title={section} 
                                    items={processedRecords.filter(r => r.section_type === section)} 
                                    onUpdate={handleUpdate} 
                                    onDelete={handleDelete} 
                                    onAdd={handleAdd} 
                                />
                            ))}
                        </div>
                    </DragDropContext>
                )}
            </main>

            <footer className="pt-24 pb-12 text-center border-t border-slate-100">
                <div className="flex items-center justify-center gap-4 mb-4">
                    <div className="w-8 h-px bg-slate-200" />
                    <Terminal className="w-5 h-5 text-slate-300" />
                    <div className="w-8 h-px bg-slate-200" />
                </div>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em]">Powered by Base44 • Attendance Analyzer v4.2.0 • Pro Engineering</p>
            </footer>
        </div>
    );
}