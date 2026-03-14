import React, { useState } from 'react';
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

import { Plus, Trash2, Search, Download, Save, Edit, Eye, Filter, Sparkles, Calendar } from 'lucide-react';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import BulkEditExceptionDialog from '../exceptions/BulkEditExceptionDialog';
import EditExceptionDialog from '../exceptions/EditExceptionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import TablePagination from '../ui/TablePagination';
import TimePicker from '../ui/TimePicker';
import { formatInUAE } from '@/components/ui/timezone';

// Predefined checklist tasks
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

// Checklist Section Component
function ChecklistSection({ project, checklistItems = [] }) {
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
    const [isCustomType, setIsCustomType] = useState(false);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const initializePredefinedTasksMutation = useMutation({
        mutationFn: async () => {
            const tasksToCreate = PREDEFINED_TASKS.map(task => ({
                project_id: project.id,
                task_type: task.task_type,
                task_description: task.task_description,
                is_predefined: true,
                status: 'pending'
            }));
            await Promise.all(tasksToCreate.map(task => base44.entities.ChecklistItem.create(task)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['checklistItems', project.id]);
            toast.success('Checklist initialized with predefined tasks');
        },
        onError: (error) => {
            toast.error('Failed to initialize checklist: ' + error.message);
        }
    });

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
            setIsCustomType(false);
            setNewTask({ task_type: '', task_description: '', due_date: '', notes: '' });
        },
        onError: (error) => {
            toast.error('Failed to add task: ' + error.message);
        }
    });

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

    // Bulk delete selected checklist tasks
    const bulkDeleteTasksMutation = useMutation({
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

    const taskTypeStats = PREDEFINED_TASKS.reduce((acc, predefinedTask) => {
        acc[predefinedTask.task_type] = { total: 0, completed: 0 };
        return acc;
    }, {});

    checklistItems.forEach(task => {
        if (!taskTypeStats[task.task_type]) {
            taskTypeStats[task.task_type] = { total: 0, completed: 0 };
        }
        taskTypeStats[task.task_type].total++;
        if (task.status === 'completed') {
            taskTypeStats[task.task_type].completed++;
        }
    });

    const handleExportChecklist = async () => {
        if (checklistItems.length === 0) {
            toast.error('No checklist items to export');
            return;
        }

        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
            
            const exportData = checklistItems.map(task => ({
                'Task Type': task.task_type,
                'Description': task.task_description,
                'Status': task.status === 'completed' ? 'Completed' : task.status === 'in_progress' ? 'In Progress' : 'Pending',
                'Completed By': task.completed_by || '—',
                'Completed Date': task.completed_date ? formatInUAE(new Date(task.completed_date), 'dd/MM/yyyy HH:mm') : '—',
                'Notes': task.notes || '—',
                'Is Predefined': task.is_predefined ? 'Yes' : 'No'
            }));
            
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Checklist');
            
            const filename = `checklist_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, filename);
            
            toast.success(`Exported ${exportData.length} checklist items`);
        } catch (error) {
            toast.error('Failed to export: ' + error.message);
        }
    };

    return (
        <Card className="border-0 shadow-sm bg-green-50/30">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <CardTitle>Checklist</CardTitle>
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
                                size="sm"
                                onClick={() => setShowBulkDeleteConfirm(true)}
                                disabled={bulkDeleteTasksMutation.isPending}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Selected ({selectedIds.size})
                            </Button>
                        )}
                        {checklistItems.length > 0 && (
                            <Button
                                onClick={handleExportChecklist}
                                size="sm"
                                variant="outline"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                        )}
                        {checklistItems.length === 0 && (
                            <Button
                                onClick={() => initializePredefinedTasksMutation.mutate()}
                                disabled={initializePredefinedTasksMutation.isPending}
                                className="bg-green-700 hover:bg-green-800"
                            >
                                Initialize Predefined Tasks
                            </Button>
                        )}
                        <Button
                            onClick={() => setShowAddDialog(true)}
                            size="sm"
                            className="bg-green-700 hover:bg-green-800"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Task
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Task Type Overview */}
                {checklistItems.length > 0 && (
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="py-4">
                            <div className="flex items-center gap-2 overflow-x-auto">
                                <span className="text-xs font-medium text-slate-600 whitespace-nowrap mr-2">Quick View:</span>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(taskTypeStats).map(([taskType, stats]) => {
                                        const hasTasks = stats.total > 0;
                                        return (
                                            <div
                                                key={taskType}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                                                    hasTasks 
                                                        ? 'bg-green-50 border-green-200 text-green-700' 
                                                        : 'bg-white border-slate-200 text-slate-500'
                                                }`}
                                            >
                                                <span className="whitespace-nowrap">{taskType}</span>
                                                {hasTasks && (
                                                    <span className="ml-1 text-green-600 font-semibold">
                                                        {stats.total}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Checklist Table */}
                {checklistItems.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                        <p className="mb-4">No tasks in the checklist yet.</p>
                        <Button
                            onClick={() => initializePredefinedTasksMutation.mutate()}
                            disabled={initializePredefinedTasksMutation.isPending}
                            className="bg-green-700 hover:bg-green-800"
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
                                            aria-label="Select all tasks"
                                            className="cursor-pointer"
                                        />
                                    </TableHead>
                                    <TableHead>Task Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {checklistItems.map((task) => (
                                    <TableRow
                                        key={task.id}
                                        className={[
                                            task.status === 'completed' ? 'bg-green-50' : '',
                                            selectedIds.has(task.id) ? 'ring-1 ring-inset ring-green-400 bg-green-50/60' : ''
                                        ].join(' ')}
                                    >
                                        <TableCell className="px-4">
                                            <Checkbox
                                                checked={!!selectedIds.has(task.id)}
                                                onCheckedChange={(checked) => handleSelectRow(task.id, !!checked)}
                                                aria-label={`Select task ${task.id}`}
                                                className="cursor-pointer"
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium">{task.task_type}</TableCell>
                                        <TableCell className={task.status === 'completed' ? 'line-through text-slate-500' : ''}>
                                            {task.task_description}
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

            {/* Bulk Delete Confirmation Dialog */}
            <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete {selectedIds.size} task(s)?</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. The selected checklist tasks will be permanently removed.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => bulkDeleteTasksMutation.mutate(selectedIds)}
                            disabled={bulkDeleteTasksMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {bulkDeleteTasksMutation.isPending ? 'Deleting...' : 'Yes, Delete All'}
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
                            {!isCustomType ? (
                                <Select
                                    value={newTask.task_type}
                                    onValueChange={(value) => {
                                        if (value === '__custom__') {
                                            setIsCustomType(true);
                                            setNewTask({...newTask, task_type: ''});
                                        } else {
                                            setIsCustomType(false);
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
                            ) : (
                                <div className="space-y-2">
                                    <Input
                                        value={newTask.task_type}
                                        onChange={(e) => setNewTask({...newTask, task_type: e.target.value})}
                                        placeholder="Enter custom task type..."
                                        autoFocus
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setIsCustomType(false);
                                            setNewTask({...newTask, task_type: ''});
                                        }}
                                        className="text-xs"
                                    >
                                        ← Back to predefined types
                                    </Button>
                                </div>
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
                        <Button variant="outline" onClick={() => {
                            setShowAddDialog(false);
                            setIsCustomType(false);
                        }}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAddTask}
                            disabled={createTaskMutation.isPending}
                            className="bg-green-700 hover:bg-green-800"
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
                                        notes: editingTask.notes
                                    }
                                });
                            }}
                            disabled={updateTaskMutation.isPending}
                            className="bg-green-700 hover:bg-green-800"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}

// Map user-friendly names to system type codes
const TYPE_MAP = {
    'public holiday': 'PUBLIC_HOLIDAY',
    'holiday': 'PUBLIC_HOLIDAY',
    'shift override': 'SHIFT_OVERRIDE',
    'manual present': 'MANUAL_PRESENT',
    'present': 'MANUAL_PRESENT',
    'manual absent': 'MANUAL_ABSENT',
    'absent': 'MANUAL_ABSENT',
    'manual half': 'MANUAL_HALF',
    'half day': 'MANUAL_HALF',
    'half': 'MANUAL_HALF',
    'sick leave': 'SICK_LEAVE',
    'sick': 'SICK_LEAVE',
    'annual leave': 'ANNUAL_LEAVE',
    'annual': 'ANNUAL_LEAVE',
    'vacation': 'ANNUAL_LEAVE',
    // Also accept the exact system codes
    'public_holiday': 'PUBLIC_HOLIDAY',
    'shift_override': 'SHIFT_OVERRIDE',
    'manual_present': 'MANUAL_PRESENT',
    'manual_absent': 'MANUAL_ABSENT',
    'manual_half': 'MANUAL_HALF',
    'sick_leave': 'SICK_LEAVE',
    'annual_leave': 'ANNUAL_LEAVE',
    'allowed minutes': 'ALLOWED_MINUTES',
    'allowed_minutes': 'ALLOWED_MINUTES'
};

export default function ExceptionsTab({ project }) {
    const [showForm, setShowForm] = useState(false);
    const [nlpText, setNlpText] = useState('');
    const [nlpParsing, setNlpParsing] = useState(false);
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [formData, setFormData] = useState({
        attendance_id: '',
        date_from: '',
        date_to: '',
        type: 'PUBLIC_HOLIDAY',
        new_am_start: '',
        new_am_end: '',
        new_pm_start: '',
        new_pm_end: '',
        early_checkout_minutes: '',
        allowed_minutes: '',
        allowed_minutes_type: 'both',
        details: '',
        include_friday: false,
        other_minutes: '',
        punch_to_skip: 'AM_PUNCH_IN',
        new_weekly_off: '',
        working_day_override: '',
        salary_leave_days: ''
    });
    const [filter, setFilter] = useState({ 
        search: '', 
        type: 'all',
        dateFrom: '',
        dateTo: '',
        department: 'all',
        createdFromReport: 'all',
        useInAnalysis: 'all'
    });
    const [reportFilter, setReportFilter] = useState({ search: '', type: 'all' });
    const [sort, setSort] = useState({ key: 'attendance_id', direction: 'asc' });
    const [uploadProgress, setUploadProgress] = useState(null);
    const [editedRows, setEditedRows] = useState({});
    const [selectedItems, setSelectedItems] = useState([]);
    const [selectedExceptions, setSelectedExceptions] = useState([]);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [viewingException, setViewingException] = useState(null);
    const [editingException, setEditingException] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [importPreview, setImportPreview] = useState(null);
    const [showImportPreview, setShowImportPreview] = useState(false);
    const queryClient = useQueryClient();

    const { data: allExceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });
    
    const exceptions = allExceptions.filter(ex => !ex.created_from_report);
    const reportExceptions = allExceptions.filter(ex => ex.created_from_report);

    const { data: masterEmployees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    // Fetch project-specific employee overrides
    const { data: projectEmployees = [] } = useQuery({
        queryKey: ['projectEmployees', project.id],
        queryFn: () => base44.entities.ProjectEmployee.filter({ project_id: project.id })
    });

    // Combine master employees with project overrides for lookups
    const employees = React.useMemo(() => {
        const combined = [...masterEmployees];
        for (const pe of projectEmployees) {
            // Only add if not already in master list
            if (!masterEmployees.some(e => String(e.attendance_id) === String(pe.attendance_id))) {
                combined.push({
                    id: pe.id,
                    attendance_id: pe.attendance_id,
                    name: pe.name,
                    department: pe.department || 'Admin',
                    weekly_off: pe.weekly_off || 'Sunday',
                    _isProjectOverride: true
                });
            }
        }
        // Filter out employees with empty attendance_id
        return combined.filter(emp => emp.attendance_id && String(emp.attendance_id).trim());
    }, [masterEmployees, projectEmployees]);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: checklistItems = [] } = useQuery({
        queryKey: ['checklistItems', project.id],
        queryFn: () => base44.entities.ChecklistItem.filter({ project_id: project.id }, 'created_date'),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';

    const { data: allUsers = [] } = useQuery({
        queryKey: ['users'],
        queryFn: () => base44.entities.User.list(),
        enabled: !!currentUser && isUser
    });

    const createMutation = useMutation({
        mutationFn: async (data) => {
            // All exceptions are now auto-approved
            const exceptionData = {
                ...data,
                project_id: project.id,
                approval_status: 'approved',
                use_in_analysis: true
            };
            
            return await base44.entities.Exception.create(exceptionData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success('Exception added successfully');
            setShowForm(false);
            resetForm();
        },
        onError: (error) => {
            toast.error('Failed to add exception: ' + (error.message || 'Unknown error'));
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            await base44.entities.Exception.delete(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            setSelectedItems([]);
            setSelectedExceptions([]);
            toast.success('Exception deleted');
        },
        onError: (error) => {
            console.error('Delete exception error:', error);
            toast.error('Failed to delete exception: ' + (error.message || 'Unknown error'));
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids) => {
            await Promise.all(ids.map(id => base44.entities.Exception.delete(id)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            setSelectedExceptions([]);
            toast.success('Selected exceptions deleted');
        },
        onError: (error) => {
            toast.error('Failed to delete exceptions: ' + error.message);
        }
    });

    const bulkToggleUseMutation = useMutation({
        mutationFn: async ({ ids, use_in_analysis }) => {
            await Promise.all(ids.map(id => 
                base44.entities.Exception.update(id, { use_in_analysis })
            ));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            setSelectedExceptions([]);
            toast.success('Selected exceptions updated');
        },
        onError: (error) => {
            toast.error('Failed to update exceptions: ' + error.message);
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Exception.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
        }
    });

    const toggleUseInAnalysisMutation = useMutation({
        mutationFn: ({ id, use_in_analysis }) => base44.entities.Exception.update(id, { use_in_analysis }),
        onSuccess: () => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success('Exception updated');
        }
    });



    const handleCellChange = (exceptionId, field, value) => {
        setEditedRows(prev => ({
            ...prev,
            [exceptionId]: {
                ...(prev[exceptionId] || {}),
                [field]: value
            }
        }));
    };

    const handleSaveRow = (exceptionId) => {
        if (editedRows[exceptionId]) {
            updateMutation.mutate({ id: exceptionId, data: editedRows[exceptionId] }, {
                onSuccess: () => {
                    setEditedRows(prev => {
                        const newState = { ...prev };
                        delete newState[exceptionId];
                        return newState;
                    });
                    toast.success('Exception updated');
                }
            });
        }
    };

    const getFieldValue = (exception, field) => {
        if (editedRows[exception.id] && editedRows[exception.id][field] !== undefined) {
            return editedRows[exception.id][field];
        }
        return exception[field];
    };

    const parseDate = (value) => {
        if (!value) return '';
        // If it's already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        // DD/MM/YYYY format
        const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (match) {
            const [, day, month, year] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // Try Excel serial date number
        if (!isNaN(value)) {
            const date = new Date((value - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
        }
        return '';
    };

    const handleFileImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

                const exceptions = [];
                const errors = [];
                const warnings = [];

                jsonData.forEach((row, index) => {
                    const rowNum = index + 2; // Excel row (header is row 1)
                    
                    // Get attendance_id (support multiple column names)
                    const attendance_id_raw = row.attendance_id || row.employee_id || row.id || row.AttendanceID || row.EmployeeID || '';
                    const attendance_id = attendance_id_raw === 'ALL' ? 'ALL' : (attendance_id_raw ? String(attendance_id_raw).trim() : '');
                    
                    // Get dates
                    const date_from = parseDate(row.date_from || row.from || row.start_date || row.DateFrom || '');
                    const date_to = parseDate(row.date_to || row.to || row.end_date || row.DateTo || date_from);
                    
                    // Get type and map it
                    const typeRaw = (row.type || row.Type || row.exception_type || '').toString().toLowerCase().trim();
                    const type = TYPE_MAP[typeRaw];
                    
                    if (!type) {
                        errors.push(`Row ${rowNum}: Invalid type "${row.type || ''}". Use: Public Holiday, Sick Leave, Present, Absent, Half Day, Shift Override`);
                        return;
                    }
                    
                    if (!date_from) {
                        errors.push(`Row ${rowNum}: Missing or invalid date_from`);
                        return;
                    }
                    
                    // For PUBLIC_HOLIDAY, set attendance_id to ALL
                    const finalAttendanceId = type === 'PUBLIC_HOLIDAY' ? 'ALL' : attendance_id;
                    
                    if (type !== 'PUBLIC_HOLIDAY' && !finalAttendanceId) {
                        errors.push(`Row ${rowNum}: Missing attendance_id`);
                        return;
                    }

                    exceptions.push({
                        project_id: project.id,
                        attendance_id: finalAttendanceId === 'ALL' ? 'ALL' : String(finalAttendanceId),
                        date_from,
                        date_to: date_to || date_from,
                        type,
                        details: row.details || row.reason || row.notes || '',
                        new_am_start: row.new_am_start || row.am_start || '',
                        new_am_end: row.new_am_end || row.am_end || '',
                        new_pm_start: row.new_pm_start || row.pm_start || '',
                        new_pm_end: row.new_pm_end || row.pm_end || '',
                        early_checkout_minutes: row.early_checkout_minutes ? Math.abs(parseInt(row.early_checkout_minutes)) : null,
                        other_minutes: row.other_minutes ? Math.abs(parseInt(row.other_minutes)) : null,
                        allowed_minutes: row.allowed_minutes ? Math.abs(parseInt(row.allowed_minutes)) : null
                    });
                });

                if (errors.length > 0) {
                    toast.error(`${errors.length} errors found:\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''}`);
                    return;
                }

                if (exceptions.length === 0) {
                    toast.error('No valid exceptions found in file');
                    return;
                }

                // Show preview instead of directly importing
                setImportPreview({ exceptions, warnings });
                setShowImportPreview(true);

                // Removed direct import - now shows preview
            } catch (error) {
                toast.error('Failed to import file: ' + error.message);
                setUploadProgress(null);
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const confirmImport = async () => {
        if (!importPreview) return;

        setUploadProgress({ current: 0, total: importPreview.exceptions.length, status: 'Importing exceptions...' });
        setShowImportPreview(false);
        
        const batchSize = 20;
        for (let i = 0; i < importPreview.exceptions.length; i += batchSize) {
            const batch = importPreview.exceptions.slice(i, i + batchSize);
            await base44.entities.Exception.bulkCreate(batch);
            setUploadProgress({ 
                current: Math.min(i + batchSize, importPreview.exceptions.length), 
                total: importPreview.exceptions.length,
                status: `Importing ${Math.min(i + batchSize, importPreview.exceptions.length)}/${importPreview.exceptions.length}...`
            });
        }

        queryClient.invalidateQueries(['exceptions', project.id]);
        toast.success(`Imported ${importPreview.exceptions.length} exceptions successfully`);
        setUploadProgress(null);
        setImportPreview(null);
    };

    const handleBulkDelete = () => {
        if (selectedExceptions.length === 0) return;
        
        if (window.confirm(`Delete ${selectedExceptions.length} selected exception${selectedExceptions.length > 1 ? 's' : ''}? This action cannot be undone.`)) {
            bulkDeleteMutation.mutate(selectedExceptions.map(e => e.id));
        }
    };

    const handleBulkToggleUse = (use_in_analysis) => {
        if (selectedExceptions.length === 0) return;
        
        bulkToggleUseMutation.mutate({
            ids: selectedExceptions.map(e => e.id),
            use_in_analysis
        });
    };

    const clearFilters = () => {
        setFilter({
            search: '',
            type: 'all',
            dateFrom: '',
            dateTo: '',
            department: 'all',
            createdFromReport: 'all',
            useInAnalysis: 'all'
        });
    };

    const hasActiveFilters = filter.search || filter.type !== 'all' || filter.dateFrom || 
                             filter.dateTo || filter.department !== 'all' || 
                             filter.createdFromReport !== 'all' || filter.useInAnalysis !== 'all';

    const downloadTemplate = () => {
        const template = `attendance_id,name,date_from,date_to,type,details,other_minutes
ALL,All Employees,2025-11-15,2025-11-15,Public Holiday,National Day,0
322,Jane Doe,2025-11-12,2025-11-14,Sick Leave,Medical certificate,0
789,John Smith,2025-12-20,2025-12-22,Annual Leave,Vacation,0
123,Bob Johnson,2025-11-20,2025-11-20,Present,Worked from home,0
456,Alice Brown,2025-11-21,2025-11-21,Half Day,Left early,0`;
        
        const blob = new Blob([template], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'exceptions_template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExport = async () => {
        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
            
            const exportData = sortedExceptions.map(ex => {
                const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id));
                return {
                    'Attendance ID': ex.attendance_id === 'ALL' ? 'ALL' : ex.attendance_id,
                    'Employee Name': ex.attendance_id === 'ALL' ? 'All Employees' : (employee?.name || '—'),
                    'Department': ex.attendance_id === 'ALL' ? '—' : (employee?.department || '—'),
                    'Type': ex.is_custom_type ? ex.custom_type_name || 'Custom' : ex.type.replace(/_/g, ' '),
                    'From Date': ex.is_custom_type && (!ex.date_from || ex.date_from === project.date_from) ? '—' : new Date(ex.date_from).toLocaleDateString(),
                    'To Date': ex.is_custom_type && (!ex.date_to || ex.date_to === project.date_to) ? '—' : new Date(ex.date_to).toLocaleDateString(),
                    'Details': ex.details || '',
                    'Use in Analysis': ex.use_in_analysis !== false ? 'Yes' : 'No',
                    'From Report': ex.created_from_report ? 'Yes' : 'No',
                    'Created Date': new Date(ex.created_date).toLocaleDateString(),
                    'Created By': ex.created_by || ''
                };
            });
            
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Exceptions');
            
            const filename = hasActiveFilters 
                ? `exceptions_filtered_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`
                : `exceptions_${project.name}_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            XLSX.writeFile(workbook, filename);
            
            toast.success(`Exported ${exportData.length} exceptions${hasActiveFilters ? ' (filtered)' : ''}`);
        } catch (error) {
            toast.error('Failed to export: ' + error.message);
        }
    };

    const getTypeColor = (type) => {
        const colors = {
            'PUBLIC_HOLIDAY': 'bg-purple-100 text-purple-700 border-purple-200',
            'SICK_LEAVE': 'bg-red-100 text-red-700 border-red-200',
            'ANNUAL_LEAVE': 'bg-blue-100 text-blue-700 border-blue-200',
            'SHIFT_OVERRIDE': 'bg-orange-100 text-orange-700 border-orange-200',
            'MANUAL_PRESENT': 'bg-green-100 text-green-700 border-green-200',
            'MANUAL_ABSENT': 'bg-red-100 text-red-700 border-red-200',
            'MANUAL_HALF': 'bg-yellow-100 text-yellow-700 border-yellow-200',
            'ALLOWED_MINUTES': 'bg-indigo-100 text-indigo-700 border-indigo-200',
            'SKIP_PUNCH': 'bg-cyan-100 text-cyan-700 border-cyan-200',
            'DAY_SWAP': 'bg-pink-100 text-pink-700 border-pink-200'
        };
        return colors[type] || 'bg-slate-100 text-slate-700 border-slate-200';
    };

    const resetForm = () => {
        setFormData({
            attendance_id: '',
            date_from: '',
            date_to: '',
            type: 'PUBLIC_HOLIDAY',
            new_am_start: '',
            new_am_end: '',
            new_pm_start: '',
            new_pm_end: '',
            early_checkout_minutes: '',
            details: '',
            include_friday: false,
            other_minutes: '',
            allowed_minutes: '',
            allowed_minutes_type: 'both',
            punch_to_skip: 'AM_PUNCH_IN',
            new_weekly_off: '',
            working_day_override: '',
            salary_leave_days: ''
        });
        setEmployeeSearch('');
    };

    const handleNlpParse = async () => {
        if (!nlpText.trim()) {
            toast.error('Please enter some text to parse');
            return;
        }

        setNlpParsing(true);
        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Parse this exception request into structured data. Return ONLY valid JSON, no other text.

Project date range: ${project.date_from} to ${project.date_to}
Available employees: ${employees.map(e => `${e.attendance_id} (${e.name})`).join(', ')}

Exception types:
- PUBLIC_HOLIDAY: National/religious holidays affecting all employees
- SHIFT_OVERRIDE: Temporary change to work hours/shift timings
- MANUAL_PRESENT: Mark someone as present when they have no punches
- MANUAL_ABSENT: Mark someone as absent (LOP)
- MANUAL_HALF: Mark someone as half day present
- SICK_LEAVE: Medical leave
- ANNUAL_LEAVE: Vacation/paid leave
- ALLOWED_MINUTES: Excuse late arrival or early checkout (natural calamity, personal reasons)

User request: "${nlpText}"

Return JSON:
{
    "attendance_id": "employee ID or 'ALL' for company-wide",
    "date_from": "YYYY-MM-DD",
    "date_to": "YYYY-MM-DD",
    "type": "one of the types above",
    "details": "brief description",
    "new_am_start": "if SHIFT_OVERRIDE: HH:MM",
    "new_am_end": "if SHIFT_OVERRIDE: HH:MM",
    "new_pm_start": "if SHIFT_OVERRIDE: HH:MM",
    "new_pm_end": "if SHIFT_OVERRIDE: HH:MM",
    "allowed_minutes": "if ALLOWED_MINUTES: number",
    "allowed_minutes_type": "if ALLOWED_MINUTES: 'late'/'early'/'both'"
}

Only include relevant fields. Match employee names/IDs intelligently.`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        attendance_id: { type: "string" },
                        date_from: { type: "string" },
                        date_to: { type: "string" },
                        type: { type: "string" },
                        details: { type: "string" },
                        new_am_start: { type: "string" },
                        new_am_end: { type: "string" },
                        new_pm_start: { type: "string" },
                        new_pm_end: { type: "string" },
                        allowed_minutes: { type: "number" },
                        allowed_minutes_type: { type: "string" }
                    },
                    required: ["type"]
                }
            });

            const parsed = response;
            
            // Pre-fill the form
            setFormData({
                attendance_id: parsed.attendance_id || '',
                date_from: parsed.date_from || '',
                date_to: parsed.date_to || parsed.date_from || '',
                type: parsed.type || 'PUBLIC_HOLIDAY',
                new_am_start: parsed.new_am_start || '',
                new_am_end: parsed.new_am_end || '',
                new_pm_start: parsed.new_pm_start || '',
                new_pm_end: parsed.new_pm_end || '',
                early_checkout_minutes: '',
                details: parsed.details || nlpText,
                include_friday: false,
                other_minutes: '',
                allowed_minutes: parsed.allowed_minutes || '',
                allowed_minutes_type: parsed.allowed_minutes_type || 'both',
                salary_leave_days: parsed.salary_leave_days || ''
            });

            setNlpText('');
            toast.success('Form filled from your description! Review and submit.');
        } catch (error) {
            console.error('NLP parsing error:', error);
            toast.error('Failed to parse: ' + (error.message || 'Unknown error'));
        } finally {
            setNlpParsing(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // For PUBLIC_HOLIDAY, ALLOWED_MINUTES, and SKIP_PUNCH types, attendance_id is optional
        if (formData.type !== 'PUBLIC_HOLIDAY' && formData.type !== 'ALLOWED_MINUTES' && formData.type !== 'SKIP_PUNCH' && !formData.attendance_id) {
            toast.error('Please select an employee');
            return;
        }

        // For ALLOWED_MINUTES and SKIP_PUNCH, default to ALL if not selected
        if ((formData.type === 'ALLOWED_MINUTES' || formData.type === 'SKIP_PUNCH') && !formData.attendance_id) {
            formData.attendance_id = 'ALL';
        }
        
        // Date range is mandatory for all types except SINGLE_SHIFT
        if (formData.type !== 'SINGLE_SHIFT' && (!formData.date_from || !formData.date_to)) {
            toast.error('Please fill in date range');
            return;
        }
        
        // For PUBLIC_HOLIDAY, set attendance_id to 'ALL'
        const submitData = formData.type === 'PUBLIC_HOLIDAY' 
            ? { ...formData, attendance_id: 'ALL' }
            : formData;
        
        // Clean up empty string values and convert early_checkout_minutes to number
         // For SINGLE_SHIFT, use project date range as placeholder
         const cleanedData = {
             attendance_id: submitData.attendance_id === 'ALL' ? 'ALL' : String(submitData.attendance_id),
            date_from: submitData.type === 'SINGLE_SHIFT' ? project.date_from : submitData.date_from,
            date_to: submitData.type === 'SINGLE_SHIFT' ? project.date_to : submitData.date_to,
            type: submitData.type,
            details: submitData.details || null
        };
        
        if (submitData.type === 'SHIFT_OVERRIDE') {
            cleanedData.new_am_start = submitData.new_am_start || null;
            cleanedData.new_am_end = submitData.new_am_end || null;
            cleanedData.new_pm_start = submitData.new_pm_start || null;
            cleanedData.new_pm_end = submitData.new_pm_end || null;
            cleanedData.include_friday = submitData.include_friday || false;
        }

        // Added other_minutes to cleanedData
        if (submitData.other_minutes && !isNaN(parseInt(submitData.other_minutes))) {
            cleanedData.other_minutes = Math.abs(parseInt(submitData.other_minutes));
        } else {
            cleanedData.other_minutes = null;
        }

        // Add allowed_minutes and allowed_minutes_type
        if (submitData.type === 'ALLOWED_MINUTES' && submitData.allowed_minutes) {
            cleanedData.allowed_minutes = Math.abs(parseInt(submitData.allowed_minutes));
            cleanedData.allowed_minutes_type = submitData.allowed_minutes_type || 'both';
        }

        // Add skip punch configuration
        if (submitData.type === 'SKIP_PUNCH') {
            cleanedData.punch_to_skip = submitData.punch_to_skip;
        }

        // Annual leave salary days override (supports decimals)
        if (submitData.type === 'ANNUAL_LEAVE' && submitData.salary_leave_days !== '' && submitData.salary_leave_days !== null && submitData.salary_leave_days !== undefined) {
            const salaryLeaveDays = Number(submitData.salary_leave_days);
            if (Number.isFinite(salaryLeaveDays) && salaryLeaveDays >= 0) {
                cleanedData.salary_leave_days = salaryLeaveDays;
            }
        }

        // Add day swap configuration
        if (submitData.type === 'DAY_SWAP') {
            if (!submitData.new_weekly_off || !submitData.working_day_override) {
                toast.error('Please select both new weekly off and working day');
                return;
            }
            if (submitData.new_weekly_off === submitData.working_day_override) {
                toast.error('New weekly off and working day cannot be the same');
                return;
            }
            cleanedData.new_weekly_off = submitData.new_weekly_off;
            cleanedData.working_day_override = submitData.working_day_override;
        }

        createMutation.mutate(cleanedData);
    };

    const filteredReportExceptions = reportExceptions
        .filter(ex => {
            if (reportFilter.search) {
                const searchLower = reportFilter.search.toLowerCase();
                const matchesId = String(ex.attendance_id).toLowerCase().includes(searchLower);
                const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id));
                const matchesName = employee?.name?.toLowerCase().includes(searchLower);
                if (!matchesId && !matchesName) return false;
            }
            if (reportFilter.type && reportFilter.type !== 'all' && ex.type !== reportFilter.type) return false;
            return true;
        })
        .sort((a, b) => {
            let aVal = a[sort.key];
            let bVal = b[sort.key];
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

    // Get unique departments
    const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

    // Calculate statistics
    const exceptionStats = {
        total: exceptions.length,
        publicHolidays: exceptions.filter(e => e.type === 'PUBLIC_HOLIDAY').length,
        sickLeave: exceptions.filter(e => e.type === 'SICK_LEAVE').length,
        annualLeave: exceptions.filter(e => e.type === 'ANNUAL_LEAVE').length,
        reportGenerated: reportExceptions.length
    };

    const filteredExceptions = exceptions
        .filter(ex => {
            // Search filter
            if (filter.search) {
                const searchLower = filter.search.toLowerCase();
                const matchesId = String(ex.attendance_id).toLowerCase().includes(searchLower);
                const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id));
                const matchesName = employee?.name?.toLowerCase().includes(searchLower);
                const matchesDetails = ex.details?.toLowerCase().includes(searchLower);
                if (!matchesId && !matchesName && !matchesDetails) return false;
            }
            
            // Type filter
            if (filter.type && filter.type !== 'all' && ex.type !== filter.type) return false;
            
            // Date range filter
            if (filter.dateFrom) {
                if (new Date(ex.date_from) < new Date(filter.dateFrom)) return false;
            }
            if (filter.dateTo) {
                if (new Date(ex.date_to) > new Date(filter.dateTo)) return false;
            }
            
            // Department filter
            if (filter.department && filter.department !== 'all') {
                if (ex.attendance_id === 'ALL') return false;
                const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id));
                if (employee?.department !== filter.department) return false;
            }
            
            // Created from report filter
            if (filter.createdFromReport !== 'all') {
                const isFromReport = ex.created_from_report === true;
                if (filter.createdFromReport === 'yes' && !isFromReport) return false;
                if (filter.createdFromReport === 'no' && isFromReport) return false;
            }
            
            // Use in analysis filter
            if (filter.useInAnalysis !== 'all') {
                const isUsed = ex.use_in_analysis !== false;
                if (filter.useInAnalysis === 'yes' && !isUsed) return false;
                if (filter.useInAnalysis === 'no' && isUsed) return false;
            }
            
            return true;
        })
        .sort((a, b) => {
            let aVal = a[sort.key];
            let bVal = b[sort.key];
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const needsShiftOverride = formData.type === 'SHIFT_OVERRIDE';
    const needsAllowedMinutes = formData.type === 'ALLOWED_MINUTES';
    const needsSkipPunch = formData.type === 'SKIP_PUNCH';
    const needsDaySwap = formData.type === 'DAY_SWAP';
    const needsSalaryLeaveDays = formData.type === 'ANNUAL_LEAVE';

    // Group and flatten exceptions by type and custom name (invisible grouping)
    const sortedExceptions = React.useMemo(() => {
        const groups = {};
        
        filteredExceptions.forEach(ex => {
            let groupKey;
            if (ex.is_custom_type) {
                // For custom types, group by custom_type_name (case-insensitive)
                const customName = (ex.custom_type_name || 'Custom').toLowerCase();
                groupKey = `CUSTOM_${customName}`;
            } else {
                groupKey = ex.type;
            }
            
            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }
            groups[groupKey].push(ex);
        });
        
        // Flatten groups into a single sorted array
        return Object.values(groups).flat();
    }, [filteredExceptions]);

    const paginatedExceptions = sortedExceptions.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const handleGroupExport = async () => {
        try {
            const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
            const workbook = XLSX.utils.book_new();
            
            // Export Exceptions Sheet
            if (sortedExceptions.length > 0) {
                const exceptionsData = sortedExceptions.map(ex => {
                    const employee = employees.find(e => String(e.attendance_id) === String(ex.attendance_id));
                    return {
                        'Attendance ID': ex.attendance_id === 'ALL' ? 'ALL' : ex.attendance_id,
                        'Employee Name': ex.attendance_id === 'ALL' ? 'All Employees' : (employee?.name || '—'),
                        'Department': ex.attendance_id === 'ALL' ? '—' : (employee?.department || '—'),
                        'Type': ex.is_custom_type ? ex.custom_type_name || 'Custom' : ex.type.replace(/_/g, ' '),
                        'From Date': ex.is_custom_type && (!ex.date_from || ex.date_from === project.date_from) ? '—' : new Date(ex.date_from).toLocaleDateString(),
                        'To Date': ex.is_custom_type && (!ex.date_to || ex.date_to === project.date_to) ? '—' : new Date(ex.date_to).toLocaleDateString(),
                        'Details': ex.details || '',
                        'Use in Analysis': ex.use_in_analysis !== false ? 'Yes' : 'No',
                        'From Report': ex.created_from_report ? 'Yes' : 'No'
                    };
                });
                
                const exceptionsSheet = XLSX.utils.json_to_sheet(exceptionsData);
                XLSX.utils.book_append_sheet(workbook, exceptionsSheet, 'Exceptions');
            }
            
            // Export Checklist Sheet
            if (checklistItems.length > 0) {
                const checklistData = checklistItems.map(task => ({
                    'Task Type': task.task_type,
                    'Description': task.task_description,
                    'Status': task.status === 'completed' ? 'Completed' : task.status === 'in_progress' ? 'In Progress' : 'Pending',
                    'Completed By': task.completed_by || '—',
                    'Completed Date': task.completed_date ? formatInUAE(new Date(task.completed_date), 'dd/MM/yyyy HH:mm') : '—',
                    'Notes': task.notes || '—',
                    'Is Predefined': task.is_predefined ? 'Yes' : 'No'
                }));
                
                const checklistSheet = XLSX.utils.json_to_sheet(checklistData);
                XLSX.utils.book_append_sheet(workbook, checklistSheet, 'Checklist');
            }
            
            const filename = `${project.name}_exceptions_checklist_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, filename);
            
            toast.success(`Exported exceptions and checklist data`);
        } catch (error) {
            toast.error('Failed to export: ' + error.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Group Export Button */}
            <Card className="border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-green-50">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-slate-900">Export All Data</p>
                            <p className="text-sm text-slate-600 mt-1">Export exceptions and checklist together in one file</p>
                        </div>
                        <Button
                            onClick={handleGroupExport}
                            disabled={sortedExceptions.length === 0 && checklistItems.length === 0}
                            className="bg-gradient-to-r from-indigo-600 to-green-600 hover:from-indigo-700 hover:to-green-700"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export All
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Upload Progress */}
            {uploadProgress && (
                <Card className="border-0 shadow-sm bg-indigo-50 border-indigo-200">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex-1">
                                <p className="font-medium text-indigo-900">{uploadProgress.status}</p>
                                <p className="text-sm text-indigo-700 mt-1">
                                    {uploadProgress.current} / {uploadProgress.total} batches completed
                                </p>
                            </div>
                        </div>
                        <div className="w-full bg-indigo-200 rounded-full h-2">
                            <div 
                                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Add Exception Form */}
            {showForm && (
                <Card className="border-0 shadow-sm">
                    <CardHeader>
                        <CardTitle>Add Exception</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Quick Entry with NLP */}
                            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="w-4 h-4 text-indigo-600" />
                                    <Label className="font-medium text-indigo-900">Quick Entry (Optional)</Label>
                                </div>
                                <p className="text-xs text-slate-600 mb-3">
                                    Describe in natural language and we'll fill the form below
                                </p>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="e.g., Mark Ahmed as annual leave from Jan 15-20"
                                        value={nlpText}
                                        onChange={(e) => setNlpText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !nlpParsing) {
                                                e.preventDefault();
                                                handleNlpParse();
                                            }
                                        }}
                                        disabled={nlpParsing}
                                        className="flex-1"
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleNlpParse}
                                        disabled={nlpParsing || !nlpText.trim()}
                                        size="sm"
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        {nlpParsing ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                                                Parsing...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                Fill Form
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Employee {formData.type !== 'PUBLIC_HOLIDAY' && formData.type !== 'ALLOWED_MINUTES' && formData.type !== 'SKIP_PUNCH' && '*'}</Label>
                                    {formData.type === 'PUBLIC_HOLIDAY' || formData.type === 'SKIP_PUNCH' ? (
                                        <Input 
                                            value="All Employees" 
                                            disabled 
                                            className="bg-slate-50"
                                        />
                                    ) : formData.type === 'ALLOWED_MINUTES' ? (
                                        <Select
                                            value={formData.attendance_id || undefined}
                                            onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select employee or all..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">All Employees</SelectItem>
                                                <div className="p-2 border-t">
                                                    <Input
                                                        placeholder="Type to search..."
                                                        value={employeeSearch}
                                                        onChange={(e) => setEmployeeSearch(e.target.value)}
                                                        className="mb-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto">
                                                    {employees
                                                        .filter(emp => {
                                                            if (!employeeSearch) return true;
                                                            const search = employeeSearch.toLowerCase();
                                                            return emp.name.toLowerCase().includes(search) || 
                                                                   String(emp.attendance_id).toLowerCase().includes(search);
                                                        })
                                                        .filter(emp => emp.attendance_id && String(emp.attendance_id).trim() !== '')
                                                        .map(emp => (
                                                           <SelectItem key={emp.id} value={String(emp.attendance_id)}>
                                                               {emp.attendance_id} - {emp.name}
                                                           </SelectItem>
                                                        ))}
                                                        </div>
                                                        </SelectContent>
                                                        </Select>
                                                        ) : (
                                                        <Select
                                                        value={formData.attendance_id || undefined}
                                            onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Search and select employee..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <div className="p-2">
                                                    <Input
                                                        placeholder="Type to search..."
                                                        value={employeeSearch}
                                                        onChange={(e) => setEmployeeSearch(e.target.value)}
                                                        className="mb-2"
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto">
                                                    {employees
                                                        .filter(emp => {
                                                            if (!employeeSearch) return true;
                                                            const search = employeeSearch.toLowerCase();
                                                            return emp.name.toLowerCase().includes(search) || 
                                                                   String(emp.attendance_id).toLowerCase().includes(search);
                                                        })
                                                        .filter(emp => emp.attendance_id && String(emp.attendance_id).trim() !== '')
                                                        .map(emp => (
                                                           <SelectItem key={emp.id} value={String(emp.attendance_id)}>
                                                               {emp.attendance_id} - {emp.name}
                                                           </SelectItem>
                                                        ))}
                                                        </div>
                                                        </SelectContent>
                                                        </Select>
                                                        )}
                                                        </div>
                                                        <div>
                                                        <Label>Exception Type *</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                            <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                            <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                            <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                            <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                            <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                                            <SelectItem value="ANNUAL_LEAVE">Annual Leave / Vacation</SelectItem>
                                            <SelectItem value="ALLOWED_MINUTES">Allowed Minutes (Grace)</SelectItem>
                                            <SelectItem value="SKIP_PUNCH">Skip Specific Punch</SelectItem>
                                            <SelectItem value="DAY_SWAP">Day Swap (Weekly Off Override)</SelectItem>
                                            {/* MANUAL_LATE, MANUAL_EARLY_CHECKOUT, MANUAL_OTHER_MINUTES are excluded - only creatable from report edits */}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {formData.type !== 'SINGLE_SHIFT' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                       <Label>From Date <span className="text-red-500">*</span></Label>
                                        <Input
                                            type="date"
                                            value={formData.date_from}
                                            onChange={(e) => {
                                                const newDate = e.target.value;
                                                if (newDate >= project.date_from && newDate <= project.date_to) {
                                                    setFormData(prev => {
                                                        const next = { ...prev, date_from: newDate };
                                                        if (prev.type === 'ANNUAL_LEAVE' && prev.date_to) {
                                                            const from = new Date(newDate);
                                                            const to = new Date(prev.date_to);
                                                            const diffDays = Math.ceil((Math.abs(to - from)) / (1000 * 60 * 60 * 24)) + 1;
                                                            next.salary_leave_days = Number.isFinite(diffDays) ? diffDays.toFixed(2) : prev.salary_leave_days;
                                                        }
                                                        return next;
                                                    });
                                                }
                                            }}
                                            min={project.date_from}
                                            max={project.date_to}
                                            title="Date must be within project period"
                                        />
                                    </div>
                                    <div>
                                       <Label>To Date <span className="text-red-500">*</span></Label>
                                        <Input
                                            type="date"
                                            value={formData.date_to}
                                            onChange={(e) => {
                                                const newDate = e.target.value;
                                                if (newDate >= formData.date_from && newDate <= project.date_to && newDate >= project.date_from) {
                                                    setFormData(prev => {
                                                        const next = { ...prev, date_to: newDate };
                                                        if (prev.type === 'ANNUAL_LEAVE' && prev.date_from) {
                                                            const from = new Date(prev.date_from);
                                                            const to = new Date(newDate);
                                                            const diffDays = Math.ceil((Math.abs(to - from)) / (1000 * 60 * 60 * 24)) + 1;
                                                            next.salary_leave_days = Number.isFinite(diffDays) ? diffDays.toFixed(2) : prev.salary_leave_days;
                                                        }
                                                        return next;
                                                    });
                                                }
                                            }}
                                            min={formData.date_from}
                                            max={project.date_to}
                                            title="Date must be within project period"
                                        />
                                    </div>
                                </div>
                            )}

                            {needsSalaryLeaveDays && (
                                <div className="space-y-2 border-t pt-4">
                                    <Label>Salary Leave Days (for salary calculation only) <span className="text-red-500">*</span></Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={formData.salary_leave_days}
                                        onChange={(e) => setFormData({ ...formData, salary_leave_days: e.target.value })}
                                        placeholder="e.g. 14.17"
                                    />
                                    {formData.date_from && formData.date_to && (
                                        <p className="text-xs text-emerald-700">
                                            💡 Calculated: {Math.ceil((Math.abs(new Date(formData.date_to) - new Date(formData.date_from))) / (1000 * 60 * 60 * 24)) + 1} days between selected dates.
                                            Edit if partial days are needed.
                                        </p>
                                    )}
                                </div>
                            )}

                            {needsShiftOverride && (
                                <div className="space-y-4">
                                    <Label className="block">Override Shift Times</Label>
                                    <div className="grid grid-cols-4 gap-4">
                                        <div>
                                            <Label className="text-xs">AM Start</Label>
                                            <TimePicker
                                                placeholder="08:00 AM"
                                                value={formData.new_am_start}
                                                onChange={(value) => setFormData({ ...formData, new_am_start: value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">AM End</Label>
                                            <TimePicker
                                                placeholder="12:00 PM"
                                                value={formData.new_am_end}
                                                onChange={(value) => setFormData({ ...formData, new_am_end: value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM Start</Label>
                                            <TimePicker
                                                placeholder="01:00 PM"
                                                value={formData.new_pm_start}
                                                onChange={(value) => setFormData({ ...formData, new_pm_start: value })}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">PM End</Label>
                                            <TimePicker
                                                placeholder="05:00 PM"
                                                value={formData.new_pm_end}
                                                onChange={(value) => setFormData({ ...formData, new_pm_end: value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-slate-50">
                                        <Checkbox
                                            id="include-friday"
                                            checked={formData.include_friday}
                                            onCheckedChange={(checked) => setFormData({ ...formData, include_friday: checked })}
                                        />
                                        <Label htmlFor="include-friday" className="cursor-pointer">
                                            Include Friday in shift override
                                        </Label>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {formData.include_friday 
                                            ? 'This override will apply to all days including Friday' 
                                            : 'This override will apply to all working days except Friday'}
                                    </p>
                                </div>
                            )}

                            {needsAllowedMinutes && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Allowed Minutes *</Label>
                                            <Input
                                                type="number"
                                                placeholder="e.g. 60"
                                                value={formData.allowed_minutes}
                                                onChange={(e) => {
                                                    const value = Math.abs(parseInt(e.target.value) || 0);
                                                    setFormData({ ...formData, allowed_minutes: value || '' });
                                                }}
                                                min="1"
                                            />
                                        </div>
                                        <div>
                                            <Label>Apply To *</Label>
                                            <Select
                                                value={formData.allowed_minutes_type}
                                                onValueChange={(value) => setFormData({ ...formData, allowed_minutes_type: value })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="late">Late Arrivals Only</SelectItem>
                                                    <SelectItem value="early">Early Checkouts Only</SelectItem>
                                                    <SelectItem value="both">Both Late & Early</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500">Minutes to excuse due to natural calamity or personal reasons</p>
                                </div>
                            )}

                            {needsSkipPunch && (
                                <div className="space-y-4">
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                        <p className="text-sm text-amber-800 mb-3">
                                            This exception will skip a specific punch (AM Punch In or PM Punch Out) from the analysis for the selected dates.
                                        </p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label>Apply To *</Label>
                                                <Select
                                                    value={formData.attendance_id || 'ALL'}
                                                    onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select scope..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ALL">All Employees</SelectItem>
                                                        <div className="p-2 border-t">
                                                            <Input
                                                                placeholder="Search employees..."
                                                                value={employeeSearch}
                                                                onChange={(e) => setEmployeeSearch(e.target.value)}
                                                                className="mb-2"
                                                                onClick={(e) => e.stopPropagation()}
                                                                onKeyDown={(e) => e.stopPropagation()}
                                                            />
                                                        </div>
                                                        <div className="max-h-[200px] overflow-y-auto">
                                                            {employees
                                                                .filter(emp => {
                                                                    if (!employeeSearch) return true;
                                                                    const search = employeeSearch.toLowerCase();
                                                                    return emp.name.toLowerCase().includes(search) || 
                                                                           String(emp.attendance_id).toLowerCase().includes(search);
                                                                })
                                                                .filter(emp => emp.attendance_id && String(emp.attendance_id).trim() !== '')
                                                                .map(emp => (
                                                                   <SelectItem key={emp.id} value={String(emp.attendance_id)}>
                                                                       {emp.attendance_id} - {emp.name}
                                                                   </SelectItem>
                                                                ))}
                                                        </div>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div>
                                                <Label>Punch to Skip *</Label>
                                                <Select
                                                    value={formData.punch_to_skip}
                                                    onValueChange={(value) => setFormData({ ...formData, punch_to_skip: value })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="AM_PUNCH_IN">AM Punch In (Morning Start)</SelectItem>
                                                        <SelectItem value="PM_PUNCH_OUT">PM Punch Out (Evening End)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {needsDaySwap && (() => {
                                const selectedEmployee = employees.find(e => String(e.attendance_id) === String(formData.attendance_id));
                                const currentWeeklyOff = selectedEmployee?.weekly_off || 'Sunday';
                                
                                return (
                                <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <p className="text-sm text-blue-800 mb-4">
                                            This exception swaps a weekly off day with a working day for the selected date range.
                                        </p>
                                        
                                        {formData.attendance_id && selectedEmployee && (
                                            <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-lg">
                                                <p className="text-sm font-medium text-blue-900">
                                                    Current Weekly Off: <span className="text-blue-700 font-bold">{currentWeeklyOff}</span>
                                                </p>
                                                <p className="text-xs text-blue-700 mt-1">
                                                    Select a new weekly off day below, and {currentWeeklyOff} will automatically become a working day
                                                </p>
                                            </div>
                                        )}
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label>New Weekly Off Day *</Label>
                                                <Select
                                                    value={formData.new_weekly_off}
                                                    onValueChange={(value) => {
                                                        setFormData({ 
                                                            ...formData, 
                                                            new_weekly_off: value,
                                                            working_day_override: currentWeeklyOff
                                                        });
                                                    }}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select day..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Sunday">Sunday</SelectItem>
                                                        <SelectItem value="Monday">Monday</SelectItem>
                                                        <SelectItem value="Tuesday">Tuesday</SelectItem>
                                                        <SelectItem value="Wednesday">Wednesday</SelectItem>
                                                        <SelectItem value="Thursday">Thursday</SelectItem>
                                                        <SelectItem value="Friday">Friday</SelectItem>
                                                        <SelectItem value="Saturday">Saturday</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-slate-500 mt-1">This day will become the holiday</p>
                                            </div>
                                            <div>
                                                <Label>New Working Day (Auto-filled) *</Label>
                                                <Input
                                                    value={formData.working_day_override}
                                                    disabled
                                                    className="bg-slate-100"
                                                />
                                                <p className="text-xs text-green-600 mt-1">
                                                    ✓ Automatically set to current weekly off
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                );
                            })()}



                            <div>
                                <Label>Details / Reason</Label>
                                <Input
                                    value={formData.details}
                                    onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                                    placeholder="Optional notes"
                                />
                            </div>

                            <div className="flex gap-3">
                                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={createMutation.isPending}>
                                    {createMutation.isPending ? 'Adding...' : 'Add Exception'}
                                </Button>
                                <Button type="button" variant="outline" onClick={() => {
                                    setShowForm(false);
                                    resetForm();
                                }}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}



            {/* Exceptions Section */}
            <Card className="border-0 shadow-sm bg-blue-50/30">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Exceptions ({filteredExceptions.length})</CardTitle>
                        <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                                try {
                                    const response = await base44.functions.invoke('importAnnualLeavesToProject', {
                                        projectId: project.id
                                    });
                                    if (response.data.success) {
                                        toast.success(response.data.message);
                                        queryClient.invalidateQueries(['exceptions', project.id]);
                                    }
                                } catch (error) {
                                    toast.error('Failed to import: ' + error.message);
                                }
                            }}
                            className="text-green-600 border-green-300 hover:bg-green-50"
                        >
                            <Calendar className="w-4 h-4 mr-2" />
                            Import Annual Leaves
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                            disabled={filteredExceptions.length === 0}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export
                        </Button>
                        {!showForm && (
                            <Button 
                                onClick={() => setShowForm(true)}
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Exception
                            </Button>
                        )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            {selectedExceptions.length > 0 && !isUser && (
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={() => setShowBulkEdit(true)}
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Edit ({selectedExceptions.length})
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleBulkToggleUse(true)}
                                    >
                                        Enable Use
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleBulkToggleUse(false)}
                                    >
                                        Disable Use
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={handleBulkDelete}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                    </Button>
                                </div>
                            )}
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search ID, name, or details..."
                                    value={filter.search}
                                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                                    className="pl-9"
                                />
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                            >
                                <Filter className="w-4 h-4 mr-2" />
                                {showAdvancedFilters ? 'Hide' : 'Show'} Filters
                            </Button>
                            {hasActiveFilters && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={clearFilters}
                                    className="text-red-600 hover:text-red-700"
                                >
                                    Clear All
                                </Button>
                            )}
                        </div>

                        {/* Advanced Filters */}
                        {showAdvancedFilters && (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg border">
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">Type</Label>
                                    <Select
                                        value={filter.type}
                                        onValueChange={(value) => setFilter({ ...filter, type: value })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="All types" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All types</SelectItem>
                                            <SelectItem value="PUBLIC_HOLIDAY">Public Holiday</SelectItem>
                                            <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                            <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                            <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                            <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                            <SelectItem value="SICK_LEAVE">Sick Leave</SelectItem>
                                            <SelectItem value="ANNUAL_LEAVE">Annual Leave</SelectItem>
                                            <SelectItem value="ALLOWED_MINUTES">Allowed Minutes</SelectItem>
                                            <SelectItem value="SKIP_PUNCH">Skip Specific Punch</SelectItem>
                                            <SelectItem value="DAY_SWAP">Day Swap</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">Department</Label>
                                    <Select
                                        value={filter.department}
                                        onValueChange={(value) => setFilter({ ...filter, department: value })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="All departments" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All departments</SelectItem>
                                            {departments.filter(dept => dept && dept.trim() !== '').map(dept => (
                                                <SelectItem key={dept} value={dept || 'unknown'}>{dept}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">From Date</Label>
                                    <Input
                                        type="date"
                                        value={filter.dateFrom}
                                        onChange={(e) => {
                                            const newDate = e.target.value;
                                            if (!newDate || (newDate >= project.date_from && newDate <= project.date_to)) {
                                                setFilter({ ...filter, dateFrom: newDate });
                                            }
                                        }}
                                        min={project.date_from}
                                        max={project.date_to}
                                        className="h-9"
                                        title="Date must be within project period"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">To Date</Label>
                                    <Input
                                        type="date"
                                        value={filter.dateTo}
                                        onChange={(e) => {
                                            const newDate = e.target.value;
                                            if (!newDate || (newDate >= project.date_from && newDate <= project.date_to && (!filter.dateFrom || newDate >= filter.dateFrom))) {
                                                setFilter({ ...filter, dateTo: newDate });
                                            }
                                        }}
                                        min={filter.dateFrom || project.date_from}
                                        max={project.date_to}
                                        className="h-9"
                                        title="Date must be within project period"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-slate-600 mb-1">From Report</Label>
                                    <Select
                                        value={filter.createdFromReport}
                                        onValueChange={(value) => setFilter({ ...filter, createdFromReport: value })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="yes">Yes</SelectItem>
                                            <SelectItem value="no">No</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Table */}
                    {filteredExceptions.length === 0 ? (
                        <p className="text-slate-500 text-center py-8">No exceptions found</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {!isUser && (
                                            <TableHead className="w-12">
                                                <Checkbox
                                                    checked={selectedExceptions.length === filteredExceptions.length && filteredExceptions.length > 0}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedExceptions(filteredExceptions);
                                                        } else {
                                                            setSelectedExceptions([]);
                                                        }
                                                    }}
                                                />
                                            </TableHead>
                                        )}
                                        <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                              Att ID
                                          </SortableTableHead>
                                         <TableHead>Name</TableHead>
                                         <SortableTableHead sortKey="type" currentSort={sort} onSort={setSort}>
                                              Type
                                          </SortableTableHead>
                                        <SortableTableHead sortKey="date_from" currentSort={sort} onSort={setSort}>
                                            From
                                        </SortableTableHead>
                                        <SortableTableHead sortKey="date_to" currentSort={sort} onSort={setSort}>
                                            To
                                        </SortableTableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                   {paginatedExceptions.map((exception) => {
                                       const employeeName = employees.find(e => String(e.attendance_id) === String(exception.attendance_id) && e.company === project.company)?.name || '—';
                                       return (
                                           <TableRow key={exception.id}>
                                           {!isUser && (
                                                <TableCell className="p-1">
                                                    <Checkbox
                                                        checked={selectedExceptions.some(e => e.id === exception.id)}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedExceptions([...selectedExceptions, exception]);
                                                            } else {
                                                                setSelectedExceptions(selectedExceptions.filter(e => e.id !== exception.id));
                                                            }
                                                        }}
                                                    />
                                                </TableCell>
                                            )}
                                             <TableCell className="p-1 text-sm font-mono">
                                                 <span className="text-slate-900">
                                                     {exception.type === 'PUBLIC_HOLIDAY' ? 'ALL' : exception.attendance_id}
                                                 </span>
                                             </TableCell>
                                             <TableCell className="p-1 text-sm">
                                                 <span className="text-slate-900">
                                                     {exception.type === 'PUBLIC_HOLIDAY' ? '—' : employeeName}
                                                 </span>
                                             </TableCell>
                                             <TableCell className="p-1">
                                                 {exception.is_custom_type ? (
                                                     <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                                                         {exception.custom_type_name || 'Custom'}
                                                     </span>
                                                 ) : (
                                                     <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getTypeColor(exception.type)}`}>
                                                         {exception.type.replace(/_/g, ' ')}
                                                     </span>
                                                 )}
                                             </TableCell>
                                             <TableCell className="p-1 text-sm">
                                                 {exception.is_custom_type && (!exception.date_from || exception.date_from === project.date_from) 
                                                     ? '—' 
                                                     : new Date(exception.date_from).toLocaleDateString()}
                                             </TableCell>
                                             <TableCell className="p-1 text-sm">
                                                 {exception.is_custom_type && (!exception.date_to || exception.date_to === project.date_to) 
                                                     ? '—' 
                                                     : new Date(exception.date_to).toLocaleDateString()}
                                             </TableCell>
                                             <TableCell className="p-1 text-sm max-w-xs truncate">
                                                 {exception.details || '-'}
                                             </TableCell>
                                            <TableCell className="text-right p-1">
                                                <div className="flex gap-1 justify-end">
                                                    <Button
                                                       size="sm"
                                                       variant="ghost"
                                                       onClick={() => setViewingException(exception)}
                                                       title="View exception"
                                                    >
                                                       <Eye className="w-4 h-4 text-indigo-600" />
                                                    </Button>
                                                    <Button
                                                       size="sm"
                                                       variant="ghost"
                                                       onClick={() => setEditingException(exception)}
                                                       title="Edit exception"
                                                    >
                                                       <Edit className="w-4 h-4 text-blue-600" />
                                                    </Button>

                                                    <Button
                                                       size="sm"
                                                       variant="ghost"
                                                       onClick={() => deleteMutation.mutate(exception.id)}
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
                    )}
                    {sortedExceptions.length > 0 && (
                        <TablePagination
                            totalItems={sortedExceptions.length}
                            currentPage={currentPage}
                            rowsPerPage={rowsPerPage}
                            onPageChange={setCurrentPage}
                            onRowsPerPageChange={(value) => {
                                setRowsPerPage(value);
                                setCurrentPage(1);
                            }}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Payroll Checklist Section */}
            <ChecklistSection project={project} checklistItems={checklistItems} />

            {/* Report-Generated Exceptions */}
            {reportExceptions.length > 0 && (
                <Card className="border-0 shadow-sm bg-purple-50/30 ring-1 ring-purple-200">
                    <CardHeader>
                        <CardTitle className="text-purple-900">Report-Generated Exceptions ({reportExceptions.length})</CardTitle>
                        <p className="text-sm text-purple-700 mt-1">
                            These exceptions were automatically created from saved reports
                        </p>
                    </CardHeader>
                    <CardContent>
                        {/* Search and Filters for Report Exceptions */}
                        <div className="flex gap-4 mb-4">
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search by ID or name..."
                                    value={reportFilter.search}
                                    onChange={(e) => setReportFilter({ ...reportFilter, search: e.target.value })}
                                    className="pl-9"
                                />
                            </div>
                            <Select
                                value={reportFilter.type}
                                onValueChange={(value) => setReportFilter({ ...reportFilter, type: value })}
                            >
                                <SelectTrigger className="max-w-xs">
                                    <SelectValue placeholder="All types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All types</SelectItem>
                                    <SelectItem value="MANUAL_LATE">Manual Late</SelectItem>
                                    <SelectItem value="MANUAL_EARLY_CHECKOUT">Manual Early Checkout</SelectItem>
                                    <SelectItem value="MANUAL_OTHER_MINUTES">Manual Other Minutes</SelectItem>
                                    <SelectItem value="SHIFT_OVERRIDE">Shift Override</SelectItem>
                                    <SelectItem value="MANUAL_PRESENT">Manual Present</SelectItem>
                                    <SelectItem value="MANUAL_ABSENT">Manual Absent</SelectItem>
                                    <SelectItem value="MANUAL_HALF">Manual Half Day</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-12">Use</TableHead>
                                        <TableHead className="w-24">ID</TableHead>
                                        <TableHead>Attendance ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>From</TableHead>
                                        <TableHead>To</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredReportExceptions.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                                                No report exceptions found
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredReportExceptions.map((exception) => (
                                        <TableRow key={exception.id}>
                                            <TableCell className="p-1">
                                                <Checkbox
                                                    checked={exception.use_in_analysis !== false}
                                                    onCheckedChange={(checked) => {
                                                        toggleUseInAnalysisMutation.mutate({
                                                            id: exception.id,
                                                            use_in_analysis: checked
                                                        });
                                                    }}
                                                />
                                                </TableCell>
                                                <TableCell className="p-1 text-xs text-slate-500 font-mono">
                                                {exception.id.substring(0, 8)}
                                                </TableCell>
                                                <TableCell className="p-1">
                                                <span className="text-sm text-slate-900">
                                                    {exception.attendance_id === 'ALL' ? 'ALL' : exception.attendance_id}
                                                </span>
                                                </TableCell>
                                            <TableCell className="p-1">
                                                <span className="text-sm text-slate-900">
                                                   {exception.attendance_id === 'ALL' ? '—' : (employees.find(e => String(e.attendance_id) === String(exception.attendance_id) && e.company === project.company)?.name || '—')}
                                                </span>
                                                </TableCell>
                                                <TableCell className="p-1">
                                                <div className="flex flex-col gap-1">
                                                  {exception.is_custom_type ? (
                                                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 inline-block w-fit">
                                                          {exception.custom_type_name || 'Custom'}
                                                      </span>
                                                  ) : (
                                                      <span className="text-sm">{exception.type.replace(/_/g, ' ')}</span>
                                                  )}
                                                  {exception.late_minutes > 0 && (
                                                      <span className="text-xs text-orange-600">Late: {exception.late_minutes}m</span>
                                                  )}
                                                  {exception.early_checkout_minutes > 0 && (
                                                      <span className="text-xs text-blue-600">Early: {exception.early_checkout_minutes}m</span>
                                                  )}
                                                  {exception.other_minutes > 0 && (
                                                      <span className="text-xs text-purple-600">Other: {exception.other_minutes}m</span>
                                                  )}
                                                </div>
                                                </TableCell>
                                            <TableCell className="p-1 text-sm">
                                                {exception.is_custom_type && (!exception.date_from || exception.date_from === project.date_from) 
                                                    ? '—' 
                                                    : new Date(exception.date_from).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="p-1 text-sm">
                                                {exception.is_custom_type && (!exception.date_to || exception.date_to === project.date_to) 
                                                    ? '—' 
                                                    : new Date(exception.date_to).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="p-1 text-xs text-slate-600 max-w-xs truncate">
                                                {exception.details || '-'}
                                            </TableCell>
                                            <TableCell className="text-right p-1">
                                                <div className="flex gap-1 justify-end">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => setEditingException(exception)}
                                                        title="Edit exception"
                                                    >
                                                        <Edit className="w-4 h-4 text-indigo-600" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => deleteMutation.mutate(exception.id)}
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
                        <p className="text-xs text-purple-600 mt-4">
                            💡 Uncheck "Use" to exclude an exception from future analysis runs. You can also delete report-generated exceptions if needed.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Edit Exception Dialog */}
            <EditExceptionDialog
                open={!!editingException}
                onClose={() => setEditingException(null)}
                exception={editingException}
                projectId={project.id}
            />

            {/* Bulk Edit Dialog */}
            <BulkEditExceptionDialog
                open={showBulkEdit}
                onClose={() => {
                    setShowBulkEdit(false);
                    setSelectedExceptions([]);
                }}
                selectedExceptions={selectedExceptions}
                projectId={project.id}
            />

            {/* View Exception Dialog */}
            <Dialog open={!!viewingException} onOpenChange={() => setViewingException(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Exception Details</DialogTitle>
                    </DialogHeader>
                    {viewingException && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-slate-500 text-xs">Employee ID</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.attendance_id === 'ALL' ? 'All Employees' : viewingException.attendance_id}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Employee Name</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.attendance_id === 'ALL' 
                                            ? '—' 
                                            : employees.find(e => String(e.attendance_id) === String(viewingException.attendance_id) && e.company === project.company)?.name || '—'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Exception Type</Label>
                                    {viewingException.is_custom_type ? (
                                        <div>
                                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 inline-block">
                                                {viewingException.custom_type_name || 'Custom'}
                                            </span>
                                            <p className="text-xs text-amber-600 mt-1">Not used in analysis</p>
                                        </div>
                                    ) : (
                                        <p className="font-medium text-slate-900">{viewingException.type.replace(/_/g, ' ')}</p>
                                    )}
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">Created From Report</Label>
                                    <p className="font-medium text-slate-900">
                                        {viewingException.created_from_report ? 'Yes' : 'No'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">From Date</Label>
                                    <p className="font-medium text-slate-900">
                                        {new Date(viewingException.date_from).toLocaleDateString()}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-slate-500 text-xs">To Date</Label>
                                    <p className="font-medium text-slate-900">
                                        {new Date(viewingException.date_to).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>

                            {viewingException.type === 'SHIFT_OVERRIDE' && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs mb-2 block">Shift Override Times</Label>
                                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg">
                                        <div>
                                            <span className="text-xs text-slate-600">AM Start:</span>
                                            <p className="font-medium">{viewingException.new_am_start || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">AM End:</span>
                                            <p className="font-medium">{viewingException.new_am_end || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">PM Start:</span>
                                            <p className="font-medium">{viewingException.new_pm_start || '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-slate-600">PM End:</span>
                                            <p className="font-medium">{viewingException.new_pm_end || '—'}</p>
                                        </div>
                                    </div>
                                    {viewingException.include_friday !== undefined && (
                                        <p className="text-sm text-slate-600 mt-2">
                                            {viewingException.include_friday 
                                                ? '✓ Includes Friday' 
                                                : '✗ Excludes Friday'}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Added display for other_minutes */}
                            {viewingException.other_minutes && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Other Minutes</Label>
                                    <p className="font-medium text-slate-900">{viewingException.other_minutes} minutes</p>
                                </div>
                            )}

                            {viewingException.allowed_minutes && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Allowed Minutes (Excused)</Label>
                                    <p className="font-medium text-slate-900">{viewingException.allowed_minutes} minutes</p>
                                </div>
                            )}

                            {viewingException.details && (
                                <div className="border-t pt-4">
                                    <Label className="text-slate-500 text-xs">Details / Reason</Label>
                                    <p className="text-slate-900 mt-1">{viewingException.details}</p>
                                </div>
                            )}

                            <div className="border-t pt-4">
                                <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
                                    <div>
                                        <span>Created:</span>
                                        <p className="text-slate-900">
                                            {new Date(viewingException.created_date).toLocaleString('en-US', {
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                hour12: true,
                                                timeZone: 'Asia/Dubai'
                                            })}
                                        </p>
                                    </div>
                                    <div>
                                        <span>Created By:</span>
                                        <p className="text-slate-900">{viewingException.created_by || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex justify-end">
                        <Button onClick={() => setViewingException(null)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Import Preview Dialog */}
            <Dialog open={showImportPreview} onOpenChange={setShowImportPreview}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>Import Preview - Review Before Importing</DialogTitle>
                    </DialogHeader>
                    {importPreview && (
                        <div className="space-y-4 overflow-y-auto">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    Ready to import <strong>{importPreview.exceptions.length}</strong> exception{importPreview.exceptions.length > 1 ? 's' : ''}.
                                    {importPreview.warnings.length > 0 && (
                                        <span className="block mt-2 text-amber-700">
                                            ⚠️ {importPreview.warnings.length} warning{importPreview.warnings.length > 1 ? 's' : ''} found
                                        </span>
                                    )}
                                </p>
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Attendance ID</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>From</TableHead>
                                            <TableHead>To</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {importPreview.exceptions.slice(0, 10).map((ex, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="text-sm">{ex.attendance_id}</TableCell>
                                                <TableCell className="text-sm">
                                                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${getTypeColor(ex.type)}`}>
                                                        {ex.type.replace(/_/g, ' ')}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-sm">{new Date(ex.date_from).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm">{new Date(ex.date_to).toLocaleDateString()}</TableCell>
                                                <TableCell className="text-sm">{ex.details || '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                {importPreview.exceptions.length > 10 && (
                                    <div className="p-3 bg-slate-50 text-center text-sm text-slate-600 border-t">
                                        ... and {importPreview.exceptions.length - 10} more
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowImportPreview(false);
                                        setImportPreview(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="bg-green-600 hover:bg-green-700"
                                    onClick={confirmImport}
                                >
                                    Confirm & Import {importPreview.exceptions.length} Exception{importPreview.exceptions.length > 1 ? 's' : ''}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}