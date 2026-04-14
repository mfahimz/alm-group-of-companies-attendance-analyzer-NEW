import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Download, Save, Edit, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import ExcelPreviewDialog from '@/components/ui/ExcelPreviewDialog';

const PREDEFINED_TASKS = [
    { task_type: 'Salary Split', task_description: 'Review special salary adjustments and calculations' },
    { task_type: 'Leave Salary Hold', task_description: 'Check and release any held salaries' },
    { task_type: 'Increment', task_description: 'Process salary increments and update employee records' },
    { task_type: 'Over Time', task_description: 'Verify overtime hours and calculate overtime pay' },
    { task_type: 'Incentives', task_description: 'Process salary increments and update employee records' },
    { task_type: 'Variable Salary', task_description: 'Calculate and apply variable salary components' },
    { task_type: 'Allowance / Additions', task_description: 'Review and add allowances and additional payments' },
    { task_type: 'Deductions', task_description: 'Verify all deductions (late, early, other) are correctly applied' },
    { task_type: 'New Joining', task_description: 'Generate and verify leave salary calculation sheets' },
    { task_type: 'Bank account changes', task_description: 'Update employee bank account details for payroll transfer' },
    { task_type: 'Attendance', task_description: 'Verify attendance data and resolve any anomalies' },
    { task_type: 'Leave Salary Sheets', task_description: 'Generate and verify leave salary calculation sheets' },
    { task_type: 'Exit', task_description: 'Process certificates and related documentation' }
];

const ADD_TASK_PREDEFINED_TYPES = PREDEFINED_TASKS.map(t => t.task_type);


const formatMergedWorksheet = (worksheet, data, XLSX) => {
    if (!worksheet || !worksheet['!ref'] || !data || data.length === 0) return;
    const merges = [];
    const firstColKey = Object.keys(data[0])[0];
    let groupStart = 1;
    for (let i = 0; i < data.length; i++) {
        const currentValue = String(data[i][firstColKey] || '').trim();
        const nextValue = i < data.length - 1 ? String(data[i + 1][firstColKey] || '').trim() : null;
        const cellAddress = XLSX && XLSX.utils ? XLSX.utils.encode_cell({ r: i + 1, c: 0 }) : `A${i + 2}`;
        if (worksheet[cellAddress]) {
            worksheet[cellAddress].s = { alignment: { vertical: "center", horizontal: "center", wrapText: true } };
        }
        if (currentValue === nextValue && currentValue !== '') {
            // group continues
        } else {
            if (i + 1 > groupStart) {
                merges.push({ s: { r: groupStart, c: 0 }, e: { r: i + 1, c: 0 } });
            }
            groupStart = i + 2;
        }
    }
    worksheet['!merges'] = merges;
};

export default function ChecklistSection({ project, checklistItems = [] }) {
    const queryClient = useQueryClient();
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
    const [selectedTaskType, setSelectedTaskType] = useState(null);
    const [newTask, setNewTask] = useState({ task_type: '', task_description: '', due_date: '', notes: '' });
    const [isCustomType, setIsCustomType] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState([]);

    const { data: currentUser } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

    const initializePredefinedTasksMutation = useMutation({
        mutationFn: async () => {
            const tasksToCreate = PREDEFINED_TASKS.map(task => ({
                project_id: project.id, task_type: task.task_type, task_description: task.task_description, is_predefined: true, status: 'pending'
            }));
            await Promise.all(tasksToCreate.map(task => base44.entities.ChecklistItem.create(task)));
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklistItems', project.id] }); toast.success('Checklist initialized'); },
        onError: (error) => { toast.error('Failed: ' + error.message); }
    });

    const createTaskMutation = useMutation({
        mutationFn: (taskData) => base44.entities.ChecklistItem.create({ ...taskData, project_id: project.id, is_predefined: false, status: 'pending' }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklistItems', project.id] }); toast.success('Task added'); setShowAddDialog(false); setIsCustomType(false); setNewTask({ task_type: '', task_description: '', due_date: '', notes: '' }); },
        onError: (error) => { toast.error('Failed: ' + error.message); }
    });

    const updateTaskMutation = useMutation({
        mutationFn: ({ id, updates }) => base44.entities.ChecklistItem.update(id, updates),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklistItems', project.id] }); toast.success('Task updated'); setEditingTask(null); },
        onError: (error) => { toast.error('Failed: ' + error.message); }
    });

    const deleteTaskMutation = useMutation({
        mutationFn: (id) => base44.entities.ChecklistItem.delete(id),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklistItems', project.id] }); toast.success('Task deleted'); },
        onError: (error) => { toast.error('Failed: ' + error.message); }
    });

    const bulkDeleteTasksMutation = useMutation({
        mutationFn: async (ids) => { await Promise.all([...ids].map(id => base44.entities.ChecklistItem.delete(id))); },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['checklistItems', project.id] }); toast.success(`${selectedIds.size} task(s) deleted`); setSelectedIds(new Set()); setShowBulkDeleteConfirm(false); },
        onError: (error) => { toast.error('Bulk delete failed: ' + error.message); }
    });

    const handleToggleStatus = (task) => {
        const newStatus = task.status === 'completed' ? 'pending' : 'completed';
        updateTaskMutation.mutate({ id: task.id, updates: { status: newStatus, ...(newStatus === 'completed' ? { completed_by: currentUser?.email, completed_date: new Date().toISOString() } : { completed_by: null, completed_date: null }) } });
    };

    const handleAddTask = () => {
        if (!newTask.task_type || !newTask.task_description) { toast.error('Please fill in task type and description'); return; }
        createTaskMutation.mutate(newTask);
    };

    const handleDeleteTask = (task) => {
        if (task.is_predefined && !window.confirm('Delete this predefined task?')) return;
        deleteTaskMutation.mutate(task.id);
    };

    // Build stats and merged ordered list for filter chips (ONLY predefined Add Task types)
    const mergedOrderedTypes = [...ADD_TASK_PREDEFINED_TYPES];

    const taskTypeStats = {};
    mergedOrderedTypes.forEach(type => {
        taskTypeStats[type] = { total: 0, completed: 0 };
    });

    checklistItems.forEach(task => {
        const type = (task.task_type || 'Uncategorized').trim();
        // Only count if it's one of the predefined types shown as chips
        if (taskTypeStats[type]) {
            taskTypeStats[type].total++;
            if (task.status === 'completed') taskTypeStats[type].completed++;
        }
    });

    // Use merged order for filter chips
    const sortedTaskTypes = mergedOrderedTypes.map(type => [type, taskTypeStats[type]]);

    const displayedItems = selectedTaskType
        ? checklistItems.filter(t => (t.task_type || 'Uncategorized').trim() === selectedTaskType)
        : checklistItems;


    const allSelected = displayedItems.length > 0 && selectedIds.size === displayedItems.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < displayedItems.length;

    const handleSelectAll = (checked) => { setSelectedIds(checked ? new Set(displayedItems.map(t => t.id)) : new Set()); };
    const handleSelectRow = (id, checked) => { setSelectedIds(prev => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next; }); };

    const handleExportChecklist = async () => {
        const exportData = checklistItems.map(task => ({
            'Task Type': task.task_type, 'ID': task.id?.substring(0, 8), 'Description': task.task_description,
            'Status': task.status, 'Completed By': task.completed_by || '—',
            'Completed Date': task.completed_date ? new Date(task.completed_date).toLocaleString() : '—', 'Notes': task.notes || ''
        }));
        setPreviewData(exportData);
        setIsPreviewOpen(true);
    };

    const executeChecklistDownload = async () => {
        if (previewData.length === 0) return;
        const XLSX = await import('xlsx');
        const worksheet = XLSX.utils.json_to_sheet(previewData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll Checklist");
        formatMergedWorksheet(worksheet, previewData, XLSX);
        worksheet['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 60 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 40 }];
        XLSX.writeFile(workbook, `Checklist_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success('Checklist exported');
    };

    return (
        <Card className="border-0 shadow-sm bg-white rounded-xl ring-1 ring-slate-200/80 overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-lg"><Calendar className="w-5 h-5 text-emerald-600" /></div>
                        <div>
                            <CardTitle className="text-lg font-semibold text-slate-900">Project Checklist</CardTitle>
                            <p className="text-sm text-slate-500 font-normal">Manage verification tasks and compliance</p>
                        </div>
                        {selectedIds.size > 0 && (
                            <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full ring-1 ring-indigo-100">{selectedIds.size} Selected</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {selectedIds.size > 0 && (
                            <Button variant="outline" size="sm" onClick={() => setShowBulkDeleteConfirm(true)} disabled={bulkDeleteTasksMutation.isPending} className="text-red-600 border-red-100 hover:bg-red-50">
                                <Trash2 className="w-4 h-4 mr-2" />Delete ({selectedIds.size})
                            </Button>
                        )}
                        {checklistItems.length > 0 && (
                            <Button onClick={handleExportChecklist} size="sm" variant="outline" className="border-slate-200 hover:bg-slate-50">
                                <Download className="w-4 h-4 mr-2" />Export
                            </Button>
                        )}
                        <Button onClick={() => setShowAddDialog(true)} size="sm" className="bg-indigo-600 hover:bg-indigo-700 shadow-sm">
                            <Plus className="w-4 h-4 mr-2" />Add Task
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
                {/* Task Type Filter Bar - CLICKABLE */}
                {checklistItems.length > 0 && sortedTaskTypes.length > 0 && (
                    <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Filter:</span>
                            {sortedTaskTypes.map(([taskType, stats]) => {
                                const isComplete = stats.total > 0 && stats.completed === stats.total;
                                const isSelected = selectedTaskType === taskType;
                                return (
                                    <button
                                        key={taskType}
                                        type="button"
                                        onClick={() => setSelectedTaskType(prev => prev === taskType ? null : taskType)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-150 cursor-pointer select-none ${
                                            isSelected
                                                ? 'ring-2 ring-indigo-500 ring-offset-1 border-indigo-400 bg-indigo-50 text-indigo-700'
                                                : isComplete
                                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                                        }`}
                                    >
                                        <span className="whitespace-nowrap">{taskType}</span>
                                        <span className={`tabular-nums px-1.5 py-0.5 rounded-full text-[10px] ${
                                            isSelected ? 'bg-indigo-100 text-indigo-800' :
                                            isComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                        }`}>
                                            {stats.total}
                                        </span>
                                    </button>
                                );
                            })}
                            {selectedTaskType && (
                                <button type="button" onClick={() => setSelectedTaskType(null)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2 ml-1">
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Checklist Table */}
                {displayedItems.length === 0 && selectedTaskType ? (
                    <div className="text-center py-8">
                        <p className="text-slate-500">No tasks for "{selectedTaskType}"</p>
                        <button type="button" onClick={() => setSelectedTaskType(null)} className="text-sm text-indigo-600 hover:underline mt-2">Show all tasks</button>
                    </div>
                ) : displayedItems.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        <p className="mb-4">No tasks in the checklist yet.</p>
                        <Button onClick={() => initializePredefinedTasksMutation.mutate()} disabled={initializePredefinedTasksMutation.isPending} className="bg-green-700 hover:bg-green-800">
                            Initialize Predefined Tasks
                        </Button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="sticky top-0 bg-slate-50/80 backdrop-blur-md z-10 border-b border-slate-200">
                                <TableRow className="hover:bg-transparent border-none">
                                    <TableHead className="w-10 px-4">
                                        <Checkbox checked={someSelected ? 'indeterminate' : allSelected} onCheckedChange={handleSelectAll} className="cursor-pointer" />
                                    </TableHead>
                                    <TableHead>Task Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {displayedItems.map((task) => (
                                    <TableRow key={task.id} className={[
                                        'transition-colors duration-200',
                                        task.status === 'completed' ? 'bg-green-50/50 hover:bg-green-100/60' : 'hover:bg-slate-100/50',
                                        selectedIds.has(task.id) ? 'ring-1 ring-inset ring-green-400 bg-green-50/60' : ''
                                    ].join(' ')}>
                                        <TableCell className="px-4">
                                            <Checkbox checked={!!selectedIds.has(task.id)} onCheckedChange={(checked) => handleSelectRow(task.id, !!checked)} className="cursor-pointer" />
                                        </TableCell>
                                        <TableCell className="font-medium">{task.task_type}</TableCell>
                                        <TableCell className={task.status === 'completed' ? 'line-through text-slate-500' : ''}>{task.task_description}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-1 justify-end">
                                                <Button size="sm" variant="ghost" onClick={() => setEditingTask(task)} title="Edit"><Edit className="w-4 h-4 text-slate-600" /></Button>
                                                <Button size="sm" variant="ghost" onClick={() => handleDeleteTask(task)} disabled={deleteTaskMutation.isPending} title="Delete"><Trash2 className="w-4 h-4 text-red-600" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>

            {/* Bulk Delete Confirmation */}
            <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete {selectedIds.size} task(s)?</DialogTitle>
                        <DialogDescription>This action cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={() => bulkDeleteTasksMutation.mutate(selectedIds)} disabled={bulkDeleteTasksMutation.isPending}>
                            <Trash2 className="w-4 h-4 mr-2" />{bulkDeleteTasksMutation.isPending ? 'Deleting...' : 'Yes, Delete All'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Task Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Task Type *</Label>
                            {!isCustomType ? (
                                <Select value={newTask.task_type} onValueChange={(value) => { if (value === '__custom__') { setIsCustomType(true); setNewTask({...newTask, task_type: ''}); } else { setIsCustomType(false); setNewTask({...newTask, task_type: value}); } }}>
                                    <SelectTrigger><SelectValue placeholder="Select task type..." /></SelectTrigger>
                                    <SelectContent>
                                        {PREDEFINED_TASKS.map(task => (<SelectItem key={task.task_type} value={task.task_type}>{task.task_type}</SelectItem>))}
                                        <SelectItem value="__custom__">Enter Custom Type...</SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : (
                                <div className="space-y-2">
                                    <Input value={newTask.task_type} onChange={(e) => setNewTask({...newTask, task_type: e.target.value})} placeholder="Enter custom task type..." autoFocus />
                                    <Button type="button" size="sm" variant="ghost" onClick={() => { setIsCustomType(false); setNewTask({...newTask, task_type: ''}); }} className="text-xs">← Back to predefined types</Button>
                                </div>
                            )}
                        </div>
                        <div>
                            <Label>Description *</Label>
                            <Textarea value={newTask.task_description} onChange={(e) => setNewTask({...newTask, task_description: e.target.value})} placeholder="Describe the task..." rows={3} />
                        </div>
                        <div>
                            <Label>Notes (Optional)</Label>
                            <Textarea value={newTask.notes} onChange={(e) => setNewTask({...newTask, notes: e.target.value})} placeholder="Additional notes..." rows={2} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowAddDialog(false); setIsCustomType(false); }}>Cancel</Button>
                        <Button onClick={handleAddTask} disabled={createTaskMutation.isPending} className="bg-green-700 hover:bg-green-800">Add Task</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Task Dialog */}
            <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
                    {editingTask && (
                        <div className="space-y-4 py-4">
                            <div><Label>Task Type</Label><Input value={editingTask.task_type} onChange={(e) => setEditingTask({...editingTask, task_type: e.target.value})} /></div>
                            <div><Label>Description</Label><Textarea value={editingTask.task_description} onChange={(e) => setEditingTask({...editingTask, task_description: e.target.value})} rows={3} /></div>
                            <div><Label>Notes</Label><Textarea value={editingTask.notes || ''} onChange={(e) => setEditingTask({...editingTask, notes: e.target.value})} rows={2} /></div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingTask(null)}>Cancel</Button>
                        <Button onClick={() => { updateTaskMutation.mutate({ id: editingTask.id, updates: { task_type: editingTask.task_type, task_description: editingTask.task_description, notes: editingTask.notes } }); }} disabled={updateTaskMutation.isPending} className="bg-green-700 hover:bg-green-800">
                            <Save className="w-4 h-4 mr-2" />Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ExcelPreviewDialog isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} data={previewData}
                headers={['Task Type', 'ID', 'Description', 'Status', 'Completed By', 'Completed Date', 'Notes']}
                fileName={`Checklist_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`}
                onConfirm={executeChecklistDownload} simulateMergeColumns={['Task Type']} />
        </Card>
    );
}

export { PREDEFINED_TASKS, formatMergedWorksheet };