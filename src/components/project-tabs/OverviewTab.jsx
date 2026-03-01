import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Lock, Copy, Trash2, Calendar, Users, AlertCircle, FileText, Pencil, CheckCircle, UserPlus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import AnomalyDetectionCard from './AnomalyDetectionCard';
import EmployeeSelectionDialog from '../projects/EmployeeSelectionDialog';
import CloseProjectDialog from './CloseProjectDialog';
import ProjectEmployeeOverrideDialog from '../projects/ProjectEmployeeOverrideDialog';

export default function OverviewTab({ project }) {
    const [showCloseDialog, setShowCloseDialog] = useState(false);
    const [showEmployeeOverrideDialog, setShowEmployeeOverrideDialog] = useState(false);

    const { data: lastSavedReport } = useQuery({
        queryKey: ['lastSavedReport', project.last_saved_report_id],
        queryFn: () => project.last_saved_report_id 
            ? base44.entities.ReportRun.filter({ id: project.last_saved_report_id }).then(r => r[0])
            : null,
        enabled: !!project.last_saved_report_id
    });
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
    const [editData, setEditData] = useState({
        name: project.name,
        company: project.company,
        date_from: project.date_from,
        date_to: project.date_to,
        custom_employee_ids: project.custom_employee_ids || '',
        use_carried_grace_minutes: project.use_carried_grace_minutes || false,
        shift_blocks_count: project.shift_blocks_count || 2
    });

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isAdminOrSupervisor = isAdmin || isSupervisor;
    const isUser = userRole === 'user';

    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id })
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id })
    });

    const { data: results = [] } = useQuery({
        queryKey: ['results', project.id],
        queryFn: () => base44.entities.AnalysisResult.filter({ project_id: project.id })
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company })
    });

    // Fetch project-specific employee overrides
    const { data: projectEmployees = [] } = useQuery({
        queryKey: ['projectEmployees', project.id],
        queryFn: () => base44.entities.ProjectEmployee.filter({ project_id: project.id })
    });

    const uniqueEmployees = new Set(punches.map(p => String(p.attendance_id))).size;

    // Check for unmatched attendance IDs
    const unmatchedCount = React.useMemo(() => {
        if (!punches.length) return 0;
        const masterIds = new Set(employees.map(e => String(e.attendance_id)));
        const projectIds = new Set(projectEmployees.map(e => String(e.attendance_id)));
        const punchIds = new Set(punches.map(p => String(p.attendance_id)));
        return Array.from(punchIds).filter(id => !masterIds.has(id) && !projectIds.has(id)).length;
    }, [punches, employees, projectEmployees]);

    // Calculate working days (Monday to Saturday, excluding Sundays)
    const calculateWorkingDays = () => {
        const startDate = new Date(project.date_from);
        const endDate = new Date(project.date_to);
        let workingDays = 0;
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            if (dayOfWeek !== 0) { // Exclude Sunday
                workingDays++;
            }
        }
        
        return workingDays;
    };

    const workingDays = calculateWorkingDays();

    const lockMutation = useMutation({
        mutationFn: () => base44.entities.Project.update(project.id, { status: 'locked' }),
        onSuccess: () => {
            queryClient.invalidateQueries(['project', project.id]);
            toast.success('Project locked successfully');
        }
    });

    const closeMutation = useMutation({
        mutationFn: async () => {
            // 1. Update employees with unused grace minutes
            const updates = results.map(result => {
                const employee = employees.find(e => e.attendance_id === result.attendance_id);
                if (!employee) return null;

                const effectiveGrace = result.grace_minutes || 15;
                const totalLateMinutes = result.late_minutes || 0;
                const totalEarlyCheckoutMinutes = result.early_checkout_minutes || 0;
                const unused = Math.max(0, effectiveGrace - (totalLateMinutes + totalEarlyCheckoutMinutes));

                // If project used carried grace, it means current allowance included previous balance.
                // The new balance is simply what's left.
                // If project didn't use carried grace, the new balance is just this month's unused.
                // Wait, user said "add... total available".
                // If I didn't use carried grace, does it mean I still have it?
                // Assume yes: New Balance = (UseCarried ? 0 : OldBalance) + Unused
                // BUT User said: "ask if this project can use... total available".
                // Simplest logic: Whatever is calculated as "unused" from the report becomes the new "total available".
                // Because report calculation already factored in (Base + Carried) if flag was checked.
                // So Unused = (Base + Carried) - Used. This is the new Carried.
                // If flag was NOT checked: Unused = Base - Used.
                // What happens to old Carried? It should probably persist if not used?
                // "carry forward the 10 minutes... total 25".
                // If I assume "Bank" model:
                // New Balance = (project.use_carried_grace_minutes ? 0 : employee.carried_grace_minutes) + Math.max(0, (result.grace_minutes - result.late_minutes));
                // Note: result.grace_minutes already includes Carried if flag is true.
                // So: Unused = result.grace_minutes - result.late_minutes.
                // If flag True: result.grace = Base + Carried. Unused = Base + Carried - Used. -> New Balance.
                // If flag False: result.grace = Base. Unused = Base - Used.
                // Should we add Old Carried? "carry forward... total available".
                // If I didn't use it, I keep it.
                // So: New Balance = Unused + (project.use_carried_grace_minutes ? 0 : employee.carried_grace_minutes).
                
                const newBalance = Math.max(0, unused + (project.use_carried_grace_minutes ? 0 : (employee.carried_grace_minutes || 0)));

                return base44.entities.Employee.update(employee.id, {
                    carried_grace_minutes: newBalance
                });
            }).filter(Boolean);

            await Promise.all(updates);

            // 2. Close project
            return base44.entities.Project.update(project.id, { status: 'closed' });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['employees']);
            toast.success('Project closed and grace minutes updated');
        }
    });

    const duplicateMutation = useMutation({
        mutationFn: async () => {
            const newProject = await base44.entities.Project.create({
                name: `${project.name} (Copy)`,
                date_from: project.date_from,
                date_to: project.date_to,
                department: project.department,
                status: 'draft'
            });
            return newProject;
        },
        onSuccess: (newProject) => {
            queryClient.invalidateQueries(['projects']);
            toast.success('Project duplicated successfully');
            navigate(createPageUrl(`ProjectDetail?id=${newProject.id}`));
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const batchSize = 20;
            
            // Helper to delete in batches with delay
            const deleteBatch = async (items, entityType) => {
                for (let i = 0; i < items.length; i += batchSize) {
                    const batch = items.slice(i, i + batchSize);
                    await Promise.all(batch.map(item => entityType.delete(item.id)));
                    if (i + batchSize < items.length) {
                        await delay(500); // Wait between batches
                    }
                }
            };
            
            // Delete all ReportRuns first
            const reportRuns = await base44.entities.ReportRun.filter({ project_id: project.id });
            await deleteBatch(reportRuns, base44.entities.ReportRun);
            await delay(500);
            
            // Delete all related data
            const punchItems = await base44.entities.Punch.filter({ project_id: project.id });
            await deleteBatch(punchItems, base44.entities.Punch);
            await delay(500);
            
            const exceptionItems = await base44.entities.Exception.filter({ project_id: project.id });
            await deleteBatch(exceptionItems, base44.entities.Exception);
            await delay(500);
            
            const resultItems = await base44.entities.AnalysisResult.filter({ project_id: project.id });
            await deleteBatch(resultItems, base44.entities.AnalysisResult);
            await delay(500);
            
            const shiftItems = await base44.entities.ShiftTiming.filter({ project_id: project.id });
            await deleteBatch(shiftItems, base44.entities.ShiftTiming);
            await delay(500);
            
            // Finally delete the project
            await base44.entities.Project.delete(project.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projects']);
            toast.success('Project deleted successfully');
            navigate(createPageUrl('Projects'));
        },
        onError: (error) => {
            toast.error('Failed to delete project: ' + error.message);
        }
    });

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            deleteMutation.mutate();
        }
    };

    const updateProjectMutation = useMutation({
        mutationFn: (data) => base44.entities.Project.update(project.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['projects']);
            toast.success('Project updated successfully');
            setShowEditDialog(false);
        },
        onError: () => {
            toast.error('Failed to update project');
        }
    });

    const handleEditSubmit = (e) => {
        e.preventDefault();
        if (!editData.name.trim()) {
            toast.error('Project name is required');
            return;
        }
        if (!editData.date_from || !editData.date_to) {
            toast.error('Date range is required');
            return;
        }
        if (new Date(editData.date_from) > new Date(editData.date_to)) {
            toast.error('Start date must be before end date');
            return;
        }
        updateProjectMutation.mutate(editData);
    };

    const stats = [
        { label: 'Working Days', value: workingDays, icon: Calendar, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Employees', value: uniqueEmployees, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Punches', value: punches.length, icon: FileText, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Exceptions', value: exceptions.length, icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50' }
    ];

    const canCloseProject = project.status === 'analyzed' && project.status !== 'closed';

    return (
        <div className="space-y-6">
            {/* Close & Finalize Button - Admin Only */}
            {canCloseProject && isAdmin && (
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium text-red-900">Ready to close this project?</p>
                                <p className="text-sm text-red-700 mt-1">
                                    Once closed, all punch data will be deleted and the project becomes read-only
                                </p>
                            </div>
                            <Button 
                                onClick={() => setShowCloseDialog(true)}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                <Lock className="w-4 h-4 mr-2" />
                                Close & Finalize
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Card key={stat.label} className="border-0 bg-white shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-600">{stat.label}</p>
                                        <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                                    </div>
                                    <div className={`${stat.bg} p-3 rounded-lg`}>
                                        <Icon className={`w-5 h-5 ${stat.color}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Details */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-slate-900">Project Details</CardTitle>
                        {(isAdmin || isSupervisor || isUser) && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setEditData({
                                       name: project.name,
                                       company: project.company,
                                       date_from: project.date_from,
                                       date_to: project.date_to,
                                       custom_employee_ids: project.custom_employee_ids || '',
                                       use_carried_grace_minutes: project.use_carried_grace_minutes || false,
                                       shift_blocks_count: project.shift_blocks_count || 2
                                    });
                                    setShowEditDialog(true);
                                }}
                                disabled={project.status === 'locked' || project.status === 'closed'}
                            >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-slate-600">Project Name</p>
                            <p className="font-medium text-slate-900 mt-1">{project.name}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-600">Company</p>
                            <p className="font-medium text-slate-900 mt-1">{project.company || '-'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-600">Date Range</p>
                            <p className="font-medium text-slate-900 mt-1">
                                {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                            </p>
                        </div>

                        <div>
                            <p className="text-sm text-slate-600">Created By</p>
                            <p className="font-medium text-slate-900 mt-1">{project.created_by || '-'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-600">Created Date</p>
                            <p className="font-medium text-slate-900 mt-1">
                                {new Date(project.created_date).toLocaleString('en-US', {
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
                        {project.updated_date && (
                            <div>
                                <p className="text-sm text-slate-600">Last Analysis</p>
                                <p className="font-medium text-slate-900 mt-1">
                                    {new Date(project.updated_date).toLocaleString('en-US', {
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
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* AI Anomaly Detection */}
            <AnomalyDetectionCard project={project} />

            {/* Unmatched Employees Warning */}
            {unmatchedCount > 0 && isAdmin && (
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div>
                                    <p className="font-medium text-amber-900">
                                        {unmatchedCount} Unmatched Attendance ID{unmatchedCount > 1 ? 's' : ''} Found
                                    </p>
                                    <p className="text-sm text-amber-700 mt-1">
                                        Some punch records have attendance IDs that don't exist in the employee master list.
                                        Add project-specific overrides to include them in analysis.
                                    </p>
                                </div>
                            </div>
                            <Button 
                                onClick={() => setShowEmployeeOverrideDialog(true)}
                                variant="outline"
                                className="border-amber-300 hover:bg-amber-100"
                            >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Manage Overrides
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Actions */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="text-slate-900">Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                    {(isAdmin || isSupervisor || isUser) && (
                    <>
                        {isAdmin && (
                            <Button
                                onClick={() => setShowEmployeeOverrideDialog(true)}
                                variant="outline"
                                disabled={project.status === 'closed'}
                            >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Employee Overrides
                                {projectEmployees.length > 0 && (
                                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded">
                                        {projectEmployees.length}
                                    </span>
                                )}
                            </Button>
                        )}
                        <Button
                            onClick={() => lockMutation.mutate()}
                            disabled={project.status === 'locked' || project.status === 'closed' || lockMutation.isPending}
                            variant="outline"
                        >
                            <Lock className="w-4 h-4 mr-2" />
                            {project.status === 'locked' ? 'Locked' : 'Lock Project'}
                        </Button>

                        {isAdmin && project.status === 'analyzed' && (
                            <Button
                                onClick={() => {
                                    if (window.confirm('This will finalize the project and update employee grace minutes. Continue?')) {
                                        closeMutation.mutate();
                                    }
                                }}
                                disabled={closeMutation.isPending}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Close & Finalize
                            </Button>
                        )}

                        <Button
                            onClick={() => duplicateMutation.mutate()}
                            disabled={duplicateMutation.isPending}
                            variant="outline"
                        >
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate Project
                        </Button>

                        {isAdmin && (
                            <Button
                                onClick={handleDelete}
                                disabled={deleteMutation.isPending}
                                variant="outline"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Project
                            </Button>
                        )}
                    </>
                    )}
                </CardContent>
            </Card>

            {/* Edit Project Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Project Settings</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
                        <div>
                            <Label>Project Name *</Label>
                            <Input
                                value={editData.name}
                                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                placeholder="Enter project name"
                            />
                        </div>
                        <div>
                            <Label>Company *</Label>
                            <Select 
                                value={editData.company} 
                                onValueChange={(value) => setEditData({ ...editData, company: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Al Maraghi Motors">Al Maraghi Motors</SelectItem>
                                    <SelectItem value="Al Maraghi Automotive">Al Maraghi Automotive</SelectItem>
                                    <SelectItem value="Naser Mohsin Auto Parts">Naser Mohsin Auto Parts</SelectItem>
                                    <SelectItem value="Astra Auto Parts">Astra Auto Parts</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Start Date *</Label>
                                <Input
                                    type="date"
                                    value={editData.date_from}
                                    onChange={(e) => setEditData({ ...editData, date_from: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>End Date *</Label>
                                <Input
                                    type="date"
                                    value={editData.date_to}
                                    onChange={(e) => setEditData({ ...editData, date_to: e.target.value })}
                                />
                            </div>
                        </div>
                        {editData.company && (
                            <div>
                                <Label>Custom Employee Selection</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => setShowEmployeeDialog(true)}
                                >
                                    <Users className="w-4 h-4 mr-2" />
                                    {editData.custom_employee_ids 
                                        ? `${editData.custom_employee_ids.split(',').length} employees selected`
                                        : 'Select employees for this project'
                                    }
                                </Button>
                                <p className="text-xs text-slate-500 mt-1">
                                    Leave empty to include all employees
                                </p>
                            </div>
                        )}
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="use_grace" 
                                checked={editData.use_carried_grace_minutes}
                                onCheckedChange={(checked) => setEditData({ ...editData, use_carried_grace_minutes: checked })}
                            />
                            <Label htmlFor="use_grace" className="font-normal">
                                Use carried forward grace minutes
                            </Label>
                        </div>
                        <div>
                            <Label>Number of Shift Blocks *</Label>
                            <Select
                                value={String(editData.shift_blocks_count || 2)}
                                onValueChange={(value) => setEditData({ ...editData, shift_blocks_count: parseInt(value) })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 Block</SelectItem>
                                    <SelectItem value="2">2 Blocks</SelectItem>
                                    <SelectItem value="3">3 Blocks</SelectItem>
                                    <SelectItem value="4">4 Blocks</SelectItem>
                                    <SelectItem value="5">5 Blocks</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                How many shift timing blocks this project needs
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Button
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-700"
                                disabled={updateProjectMutation.isPending}
                            >
                                {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowEditDialog(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <EmployeeSelectionDialog
                open={showEmployeeDialog}
                onOpenChange={setShowEmployeeDialog}
                company={editData.company}
                initialIds={editData.custom_employee_ids}
                onConfirm={(ids) => setEditData({ ...editData, custom_employee_ids: ids })}
            />
            <CloseProjectDialog
                open={showCloseDialog}
                onClose={() => setShowCloseDialog(false)}
                project={project}
                lastSavedReport={lastSavedReport}
            />

            <ProjectEmployeeOverrideDialog
                open={showEmployeeOverrideDialog}
                onOpenChange={setShowEmployeeOverrideDialog}
                project={project}
            />
        </div>
    );
}