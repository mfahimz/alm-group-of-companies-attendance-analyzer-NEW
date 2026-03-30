import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, Circle, Clock, Plus, Trash2, Edit, Save } from 'lucide-react';
import { toast } from 'sonner';
import { formatInUAE } from '@/components/ui/timezone';

// Predefined checklist tasks for Al Maraghi Motors
const PREDEFINED_TASKS = [
    {
        task_type: 'Salary Split',
        task_description: 'Review special salary adjustments and calculations'
    },
    {
        task_type: 'Leave Salary Hold',
        task_description: 'Check and release any held salaries'
    },
    {
        task_type: 'Increment',
        task_description: 'Process salary increments and update employee records'
    },
    {
        task_type: 'Over Time',
        task_description: 'Verify overtime hours and calculate overtime pay'
    },
    {
        task_type: 'Incentives',
        task_description: 'Process salary increments and update employee records'
    },
    {
        task_type: 'Variable Salary',
        task_description: 'Calculate and apply variable salary components'
    },
    {
        task_type: 'Allowance / Additions',
        task_description: 'Review and add allowances and additional payments'
    },
    {
        task_type: 'Deductions',
        task_description: 'Verify all deductions (late, early, other) are correctly applied'
    },
    {
        task_type: 'New Joining',
        task_description: 'Generate and verify leave salary calculation sheets'
    },
    {
        task_type: 'Bank account changes',
        task_description: 'Update employee bank account details for payroll transfer'
    },
    {
        task_type: 'Attendance',
        task_description: 'Verify attendance data and resolve any anomalies'
    },
    {
        task_type: 'Leave Salary Sheets',
        task_description: 'Generate and verify leave salary calculation sheets'
    },
    {
        task_type: 'Exit',
        task_description: 'Process certificates and related documentation'
    }
];

export default function ChecklistTab({ project }) {
    const queryClient = useQueryClient();
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
    const [newTask, setNewTask] = useState({
        task_type: '',
        task_description: '',
        due_date: '',
        notes: ''
    });
    const [selectedTaskType, setSelectedTaskType] = useState(null);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    // Fetch all checklist items for this project
    const { data: checklistItems = [], isLoading } = useQuery({
        queryKey: ['checklistItems', project.id],
        queryFn: () => base44.entities.ChecklistItem.filter({ project_id: project.id }, 'created_date'),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false
    });

    // Initialize predefined tasks if none exist
    const initializePredefinedTasksMutation = useMutation({
        mutationFn: async () => {
            const tasksToCreate = PREDEFINED_TASKS.map(task => ({
                project_id: project.id,
                task_type: task.task_type,
                task_description: task.task_description,
                is_predefined: true,
                status: 'pending'
            }));
            
            // Create all tasks
            await Promise.all(tasksToCreate.map(task => 
                base44.entities.ChecklistItem.create(task)
            ));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['checklistItems', project.id]);
            toast.success('Checklist initialized with predefined tasks');
        },
        onError: (error) => {
            toast.error('Failed to initialize checklist: ' + error.message);
        }
    });

    // Create new custom task
    const createTaskMutation = useMutation({
        mutationFn: (taskData) => base44.entities.ChecklistItem.create({
            ...taskData,
            project_id: project.id,
            is_predefined: false,
            status: 'pending'
        }),
        onSuccess: () => {
            queryClient.invalidateQueries(['checklistItems', project.id]);
            toast.success('Task added to checklist');
            setShowAddDialog(false);
            setNewTask({ task_type: '', task_description: '', due_date: '', notes: '' });
        },
        onError: (error) => {
            toast.error('Failed to add task: ' + error.message);
        }
    });

    // Update task status or details
    const updateTaskMutation = useMutation({
        mutationFn: ({ id, updates }) => base44.entities.ChecklistItem.update(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries(['checklistItems', project.id]);
            toast.success('Task updated');
            setEditingTask(null);
        },
        onError: (error) => {
            toast.error('Failed to update task: ' + error.message);
        }
    });

    // Delete single task
    const deleteTaskMutation = useMutation({
        mutationFn: (id) => base44.entities.ChecklistItem.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['checklistItems', project.id]);
            toast.success('Task deleted');
        },
        onError: (error) => {
            toast.error('Failed to delete task: ' + error.message);
        }
    });

    // Bulk delete selected tasks
    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            await Promise.all([...ids].map(id => base44.entities.ChecklistItem.delete(id)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['checklistItems', project.id]);
            toast.success(`${selectedIds.size} task(s) deleted`);
            setSelectedIds(new Set());
            setShowBulkDeleteConfirm(false);
        },
        onError: (error) => {
            toast.error('Bulk delete failed: ' + error.message);
        }
    });

    const handleToggleStatus = (task) => {
        const newStatus = task.status === 'completed' ? 'pending' : 'completed';
        const updates = {
            status: newStatus,
            ...(newStatus === 'completed' ? {
                completed_by: currentUser?.email,
                completed_date: new Date().toISOString()
            } : {
                completed_by: null,
                completed_date: null
            })
        };
        updateTaskMutation.mutate({ id: task.id, updates });
    };

    const handleAddTask = () => {
        if (!newTask.task_type || !newTask.task_description) {
            toast.error('Please fill in task type and description');
            return;
        }
        createTaskMutation.mutate(newTask);
    };

    const handleDeleteTask = (task) => {
        if (task.is_predefined) {
            if (!window.confirm('Delete this predefined task? You can re-initialize all predefined tasks later.')) {
                return;
            }
        }
        deleteTaskMutation.mutate(task.id);
    };

    const completedCount = checklistItems.filter(t => t.status === 'completed').length;
    const totalCount = checklistItems.length;
    const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Selection helpers
    const allSelected = checklistItems.length > 0 && selectedIds.size === checklistItems.length;
    const someSelected = selectedIds.size > 0 && selectedIds.size < checklistItems.length;

    const handleSelectAll = (checked) => {
        if (checked) {
            setSelectedIds(new Set(checklistItems.map(t => t.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id, checked) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
        });
    };

    // Group tasks by type for overview - only include types that have actual items
    const taskTypeStats = {};
    checklistItems.forEach(task => {
        const type = (task.task_type || 'Uncategorized').trim();
        if (!taskTypeStats[type]) {
            taskTypeStats[type] = { total: 0, completed: 0 };
        }
        taskTypeStats[type].total++;
        if (task.status === 'completed') {
            taskTypeStats[type].completed++;
        }
    });

    // Sort task types: incomplete first (by total desc), then completed (by total desc)
    const sortedTaskTypes = Object.entries(taskTypeStats).sort(([, a], [, b]) => {
        const aComplete = a.total > 0 && a.completed === a.total;
        const bComplete = b.total > 0 && b.completed === b.total;
        if (aComplete !== bComplete) return aComplete ? 1 : -1;
        return b.total - a.total;
    });

    const filteredChecklistItems = selectedTaskType 
        ? checklistItems.filter(t => (t.task_type || 'Uncategorized').trim() === selectedTaskType)
        : checklistItems;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-slate-600">Loading checklist...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Task Type Filter Bar */}
            {checklistItems.length > 0 && sortedTaskTypes.length > 0 && (
                <Card className="border-0 shadow-sm">
                    <CardContent className="py-4">
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
                                                    ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                                        }`}
                                    >
                                        {isComplete ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                                        ) : (
                                            <Circle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                        )}
                                        <span className="whitespace-nowrap">{taskType}</span>
                                        <span className={`tabular-nums ${isComplete ? 'text-green-600' : 'text-slate-400'}`}>
                                            {stats.completed}/{stats.total}
                                        </span>
                                    </button>
                                );
                            })}
                            {selectedTaskType && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedTaskType(null)}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2 ml-1"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Progress Card */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 to-white">
                <CardContent className="pt-6">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-900">Payroll Preparation Progress</h3>
                            <span className="text-2xl font-bold text-indigo-600">{progressPercentage}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-3">
                            <div 
                                className="bg-indigo-600 h-3 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                        <p className="text-sm text-slate-600 mt-2">
                            {completedCount} of {totalCount} tasks completed
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Main Checklist */}
            <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <CardTitle>Payroll Checklist</CardTitle>
                        {selectedIds.size > 0 && (
                            <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                {selectedIds.size} selected
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {selectedIds.size > 0 && (
                            <Button
                                variant="destructive"
                                onClick={() => setShowBulkDeleteConfirm(true)}
                                disabled={bulkDeleteMutation.isPending}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Selected ({selectedIds.size})
                            </Button>
                        )}
                        {checklistItems.length === 0 && (
                            <Button
                                onClick={() => initializePredefinedTasksMutation.mutate()}
                                disabled={initializePredefinedTasksMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                Initialize Predefined Tasks
                            </Button>
                        )}
                        <Button
                            onClick={() => setShowAddDialog(true)}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Task
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {checklistItems.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <p className="mb-4">No tasks in the checklist yet.</p>
                            <Button
                                onClick={() => initializePredefinedTasksMutation.mutate()}
                                disabled={initializePredefinedTasksMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                Initialize Predefined Tasks
                            </Button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10 px-4">
                                            <Checkbox
                                                checked={someSelected ? 'indeterminate' : allSelected}
                                                onCheckedChange={handleSelectAll}
                                                aria-label="Select all rows"
                                                className="cursor-pointer"
                                            />
                                        </TableHead>
                                        <TableHead className="w-12">Status</TableHead>
                                        <TableHead>Task Type</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Completed By</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredChecklistItems.map((task) => (
                                        <TableRow
                                            key={task.id}
                                            className={[
                                                task.status === 'completed' ? 'bg-green-50' : '',
                                                selectedIds.has(task.id) ? 'ring-1 ring-inset ring-indigo-300 bg-indigo-50/40' : ''
                                            ].join(' ')}
                                        >
                                            <TableCell className="px-4">
                                                <Checkbox
                                                    checked={!!selectedIds.has(task.id)}
                                                    onCheckedChange={(checked) => handleSelectRow(task.id, !!checked)}
                                                    aria-label={`Select row ${task.id}`}
                                                    className="cursor-pointer"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <button
                                                    onClick={() => handleToggleStatus(task)}
                                                    disabled={updateTaskMutation.isPending}
                                                    className="hover:opacity-70 transition-opacity"
                                                >
                                                    {task.status === 'completed' ? (
                                                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                                                    ) : task.status === 'in_progress' ? (
                                                        <Clock className="w-6 h-6 text-amber-600" />
                                                    ) : (
                                                        <Circle className="w-6 h-6 text-slate-400" />
                                                    )}
                                                </button>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {task.task_type}
                                            </TableCell>
                                            <TableCell className={task.status === 'completed' ? 'line-through text-slate-500' : ''}>
                                                {task.task_description}
                                            </TableCell>
                                            <TableCell>
                                                {task.completed_by ? (
                                                    <div className="text-sm">
                                                        <div className="text-slate-900">{task.completed_by}</div>
                                                        <div className="text-slate-500">
                                                            {formatInUAE(new Date(task.completed_date), 'MMM dd, HH:mm')}
                                                        </div>
                                                    </div>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-1 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setEditingTask(task)}
                                                        title="Edit task"
                                                    >
                                                        <Edit className="w-4 h-4 text-slate-600" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleDeleteTask(task)}
                                                        disabled={deleteTaskMutation.isPending}
                                                        title="Delete task"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-600" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Bulk Delete Confirmation Dialog */}
            <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete {selectedIds.size} task(s)?</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. The selected tasks will be permanently removed from the checklist.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => bulkDeleteMutation.mutate(selectedIds)}
                            disabled={bulkDeleteMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {bulkDeleteMutation.isPending ? 'Deleting...' : 'Yes, Delete All'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Task Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label>Task Type *</Label>
                            <Select
                                value={newTask.task_type}
                                onValueChange={(value) => {
                                    if (value === '__custom__') {
                                        setNewTask({...newTask, task_type: ''});
                                    } else {
                                        setNewTask({...newTask, task_type: value});
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select task type..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {PREDEFINED_TASKS.map(task => (
                                        <SelectItem key={task.task_type} value={task.task_type}>
                                            {task.task_type}
                                        </SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">Enter Custom Type...</SelectItem>
                                </SelectContent>
                            </Select>
                            {newTask.task_type === '' && (
                                <Input
                                    className="mt-2"
                                    value={newTask.task_type}
                                    onChange={(e) => setNewTask({...newTask, task_type: e.target.value})}
                                    placeholder="Enter custom task type..."
                                    autoFocus
                                />
                            )}
                        </div>
                        <div>
                            <Label>Description *</Label>
                            <Textarea
                                value={newTask.task_description}
                                onChange={(e) => setNewTask({...newTask, task_description: e.target.value})}
                                placeholder="Describe the task in detail..."
                                rows={3}
                            />
                        </div>
                        <div>
                            <Label>Notes (Optional)</Label>
                            <Textarea
                                value={newTask.notes}
                                onChange={(e) => setNewTask({...newTask, notes: e.target.value})}
                                placeholder="Additional notes..."
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAddTask}
                            disabled={createTaskMutation.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            Add Task
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Task Dialog */}
            <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Task</DialogTitle>
                    </DialogHeader>
                    {editingTask && (
                        <div className="space-y-4 py-4">
                            <div>
                                <Label>Task Type</Label>
                                <Input
                                    value={editingTask.task_type}
                                    onChange={(e) => setEditingTask({...editingTask, task_type: e.target.value})}
                                />
                            </div>
                            <div>
                                <Label>Description</Label>
                                <Textarea
                                    value={editingTask.task_description}
                                    onChange={(e) => setEditingTask({...editingTask, task_description: e.target.value})}
                                    rows={3}
                                />
                            </div>
                            <div>
                                <Label>Due Date</Label>
                                <Input
                                    type="date"
                                    value={editingTask.due_date || ''}
                                    onChange={(e) => setEditingTask({...editingTask, due_date: e.target.value})}
                                />
                            </div>
                            <div>
                                <Label>Notes</Label>
                                <Textarea
                                    value={editingTask.notes || ''}
                                    onChange={(e) => setEditingTask({...editingTask, notes: e.target.value})}
                                    rows={2}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingTask(null)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                updateTaskMutation.mutate({
                                    id: editingTask.id,
                                    updates: {
                                        task_type: editingTask.task_type,
                                        task_description: editingTask.task_description,
                                        due_date: editingTask.due_date,
                                        notes: editingTask.notes
                                    }
                                });
                            }}
                            disabled={updateTaskMutation.isPending}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}