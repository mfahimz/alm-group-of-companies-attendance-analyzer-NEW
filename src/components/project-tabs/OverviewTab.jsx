import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Lock, Copy, Trash2, Calendar, Users, AlertCircle, FileText, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import AnomalyDetectionCard from './AnomalyDetectionCard';

export default function OverviewTab({ project }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editData, setEditData] = useState({
        name: project.name,
        date_from: project.date_from,
        date_to: project.date_to
    });

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const isAdmin = currentUser?.role === 'admin';

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

    const uniqueEmployees = new Set(punches.map(p => p.attendance_id)).size;

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
            // Delete all ReportRuns first
            const reportRuns = await base44.entities.ReportRun.filter({ project_id: project.id });
            await Promise.all(reportRuns.map(item => base44.entities.ReportRun.delete(item.id)));
            
            // Delete all related data
            const punchItems = await base44.entities.Punch.filter({ project_id: project.id });
            await Promise.all(punchItems.map(item => base44.entities.Punch.delete(item.id)));
            
            const exceptionItems = await base44.entities.Exception.filter({ project_id: project.id });
            await Promise.all(exceptionItems.map(item => base44.entities.Exception.delete(item.id)));
            
            const resultItems = await base44.entities.AnalysisResult.filter({ project_id: project.id });
            await Promise.all(resultItems.map(item => base44.entities.AnalysisResult.delete(item.id)));
            
            const shiftItems = await base44.entities.ShiftTiming.filter({ project_id: project.id });
            await Promise.all(shiftItems.map(item => base44.entities.ShiftTiming.delete(item.id)));
            
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

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    // Dark mode color adjustment
                    let darkBg = stat.bg;
                    let darkColor = stat.color;
                    if (stat.bg === 'bg-indigo-50') { darkBg = 'bg-indigo-500/20'; darkColor = 'text-indigo-400'; }
                    if (stat.bg === 'bg-blue-50') { darkBg = 'bg-blue-500/20'; darkColor = 'text-blue-400'; }
                    if (stat.bg === 'bg-green-50') { darkBg = 'bg-green-500/20'; darkColor = 'text-green-400'; }
                    if (stat.bg === 'bg-amber-50') { darkBg = 'bg-amber-500/20'; darkColor = 'text-amber-400'; }

                    return (
                        <Card key={stat.label} className="border-slate-800 bg-slate-900 shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-400">{stat.label}</p>
                                        <p className="text-2xl font-bold text-slate-50 mt-1">{stat.value}</p>
                                    </div>
                                    <div className={`${darkBg} p-3 rounded-lg`}>
                                        <Icon className={`w-5 h-5 ${darkColor}`} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Details */}
            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-slate-50">Project Details</CardTitle>
                        {isAdmin && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-slate-700 bg-transparent text-slate-400 hover:text-white hover:bg-slate-800"
                                onClick={() => {
                                    setEditData({
                                        name: project.name,
                                        date_from: project.date_from,
                                        date_to: project.date_to
                                    });
                                    setShowEditDialog(true);
                                }}
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
                            <p className="text-sm text-slate-400">Project Name</p>
                            <p className="font-medium text-slate-200 mt-1">{project.name}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Date Range</p>
                            <p className="font-medium text-slate-200 mt-1">
                                {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Department</p>
                            <p className="font-medium text-slate-200 mt-1">{project.department || 'All'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Created By</p>
                            <p className="font-medium text-slate-200 mt-1">{project.created_by || '-'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Created Date</p>
                            <p className="font-medium text-slate-200 mt-1">
                                {new Date(project.created_date).toLocaleDateString('en-GB')}
                            </p>
                        </div>
                        {project.updated_date && (
                            <div>
                                <p className="text-sm text-slate-400">Last Analysis</p>
                                <p className="font-medium text-slate-200 mt-1">
                                    {new Date(project.updated_date).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* AI Anomaly Detection */}
            <AnomalyDetectionCard project={project} />

            {/* Actions */}
            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-slate-50">Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                    <Button
                        onClick={() => lockMutation.mutate()}
                        disabled={project.status === 'locked' || lockMutation.isPending}
                        variant="outline"
                        className="border-slate-700 bg-transparent text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        <Lock className="w-4 h-4 mr-2" />
                        {project.status === 'locked' ? 'Locked' : 'Lock Project'}
                    </Button>
                    <Button
                        onClick={() => duplicateMutation.mutate()}
                        disabled={duplicateMutation.isPending}
                        variant="outline"
                        className="border-slate-700 bg-transparent text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate Project
                    </Button>
                    <Button
                        onClick={handleDelete}
                        disabled={deleteMutation.isPending}
                        variant="outline"
                        className="border-slate-700 bg-transparent text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Project
                    </Button>
                </CardContent>
            </Card>

            {/* Edit Project Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-50">
                    <DialogHeader>
                        <DialogTitle className="text-slate-50">Edit Project</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
                        <div>
                            <Label className="text-slate-300">Project Name *</Label>
                            <Input
                                value={editData.name}
                                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                                placeholder="Enter project name"
                                className="bg-slate-950 border-slate-800 text-slate-50"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-slate-300">Start Date *</Label>
                                <Input
                                    type="date"
                                    value={editData.date_from}
                                    onChange={(e) => setEditData({ ...editData, date_from: e.target.value })}
                                    className="bg-slate-950 border-slate-800 text-slate-50"
                                />
                            </div>
                            <div>
                                <Label className="text-slate-300">End Date *</Label>
                                <Input
                                    type="date"
                                    value={editData.date_to}
                                    onChange={(e) => setEditData({ ...editData, date_to: e.target.value })}
                                    className="bg-slate-950 border-slate-800 text-slate-50"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <Button
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-500"
                                disabled={updateProjectMutation.isPending}
                            >
                                {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowEditDialog(false)}
                                className="border-slate-700 bg-transparent text-slate-400 hover:text-white hover:bg-slate-800"
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}