import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Plus, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function ProjectEmployeeOverrideDialog({ open, onOpenChange, project }) {
    const queryClient = useQueryClient();
    const [showAddForm, setShowAddForm] = useState(false);
    const [newEmployee, setNewEmployee] = useState({
        attendance_id: '',
        name: '',
        department: '',
        weekly_off: 'Sunday',
        notes: ''
    });

    // Fetch existing project-specific employees
    const { data: projectEmployees = [], isLoading } = useQuery({
        queryKey: ['projectEmployees', project?.id],
        queryFn: () => base44.entities.ProjectEmployee.filter({ project_id: project.id }),
        enabled: open && !!project?.id
    });

    // Fetch punches to find unmatched attendance IDs
    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project?.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id }),
        enabled: open && !!project?.id
    });

    // Fetch master employees for this company
    const { data: masterEmployees = [] } = useQuery({
        queryKey: ['employees', project?.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company }),
        enabled: open && !!project?.company
    });

    // Find unmatched attendance IDs (in punches but not in master or project employees)
    const unmatchedIds = React.useMemo(() => {
        if (!punches.length) return [];
        
        const masterIds = new Set(masterEmployees.map(e => String(e.attendance_id)));
        const projectIds = new Set(projectEmployees.map(e => String(e.attendance_id)));
        const punchIds = new Set(punches.map(p => String(p.attendance_id)));
        
        return Array.from(punchIds).filter(id => !masterIds.has(id) && !projectIds.has(id));
    }, [punches, masterEmployees, projectEmployees]);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setShowAddForm(false);
            setNewEmployee({
                attendance_id: '',
                name: '',
                department: '',
                weekly_off: 'Sunday',
                notes: ''
            });
        }
    }, [open]);

    const addMutation = useMutation({
        mutationFn: async (data) => {
            return base44.entities.ProjectEmployee.create({
                ...data,
                project_id: project.id
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projectEmployees', project.id]);
            toast.success('Project employee override added');
            setShowAddForm(false);
            setNewEmployee({
                attendance_id: '',
                name: '',
                department: '',
                weekly_off: 'Sunday',
                notes: ''
            });
        },
        onError: (err) => {
            toast.error('Failed to add: ' + err.message);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.ProjectEmployee.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['projectEmployees', project.id]);
            toast.success('Override removed');
        },
        onError: (err) => {
            toast.error('Failed to remove: ' + err.message);
        }
    });

    const handleAdd = () => {
        if (!newEmployee.attendance_id.trim()) {
            toast.error('Attendance ID is required');
            return;
        }
        if (!newEmployee.name.trim()) {
            toast.error('Name is required');
            return;
        }
        // Check if already exists
        const exists = projectEmployees.some(e => String(e.attendance_id) === String(newEmployee.attendance_id));
        if (exists) {
            toast.error('This attendance ID already has an override');
            return;
        }
        addMutation.mutate(newEmployee);
    };

    const handleQuickAdd = (attendanceId) => {
        setNewEmployee(prev => ({ ...prev, attendance_id: attendanceId }));
        setShowAddForm(true);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-amber-600" />
                        Project Employee Overrides
                    </DialogTitle>
                    <DialogDescription>
                        Add employees that exist in punch data but not in the master employee list.
                        These overrides only apply to this project.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* Unmatched IDs Warning */}
                    {unmatchedIds.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-900">
                                        {unmatchedIds.length} Unmatched Attendance ID{unmatchedIds.length > 1 ? 's' : ''} Found
                                    </p>
                                    <p className="text-sm text-amber-700 mt-1">
                                        The following IDs have punch data but no employee record:
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {unmatchedIds.map(id => (
                                            <Button
                                                key={id}
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs border-amber-300 hover:bg-amber-100"
                                                onClick={() => handleQuickAdd(id)}
                                            >
                                                <Plus className="w-3 h-3 mr-1" />
                                                {id}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Existing Overrides */}
                    {projectEmployees.length > 0 && (
                        <div>
                            <h4 className="text-sm font-medium text-slate-700 mb-2">
                                Current Overrides ({projectEmployees.length})
                            </h4>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Attendance ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Weekly Off</TableHead>
                                        <TableHead className="w-[80px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {projectEmployees.map(emp => (
                                        <TableRow key={emp.id}>
                                            <TableCell className="font-mono">{emp.attendance_id}</TableCell>
                                            <TableCell>{emp.name}</TableCell>
                                            <TableCell>{emp.department || '-'}</TableCell>
                                            <TableCell>{emp.weekly_off}</TableCell>
                                            <TableCell>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => {
                                                        if (confirm('Remove this override?')) {
                                                            deleteMutation.mutate(emp.id);
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {/* Add New Override */}
                    {!showAddForm ? (
                        <Button
                            variant="outline"
                            onClick={() => setShowAddForm(true)}
                            className="w-full"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Manual Override
                        </Button>
                    ) : (
                        <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
                            <h4 className="font-medium text-slate-900">Add Employee Override</h4>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Attendance ID *</Label>
                                    <Input
                                        value={newEmployee.attendance_id}
                                        onChange={(e) => setNewEmployee({ ...newEmployee, attendance_id: e.target.value })}
                                        placeholder="e.g., 36"
                                    />
                                </div>
                                <div>
                                    <Label>Name *</Label>
                                    <Input
                                        value={newEmployee.name}
                                        onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                                        placeholder="Employee name"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Department</Label>
                                    <Input
                                        value={newEmployee.department}
                                        onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div>
                                    <Label>Weekly Off</Label>
                                    <Select
                                        value={newEmployee.weekly_off}
                                        onValueChange={(v) => setNewEmployee({ ...newEmployee, weekly_off: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
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
                                </div>
                            </div>

                            <div>
                                <Label>Notes</Label>
                                <Input
                                    value={newEmployee.notes}
                                    onChange={(e) => setNewEmployee({ ...newEmployee, notes: e.target.value })}
                                    placeholder="Why is this override needed?"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    onClick={handleAdd}
                                    disabled={addMutation.isPending}
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    {addMutation.isPending ? 'Adding...' : 'Add Override'}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowAddForm(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}