import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Copy, Trash2, Calendar, Users, AlertCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function OverviewTab({ project }) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

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
            await base44.entities.Punch.filter({ project_id: project.id }).then(items => 
                Promise.all(items.map(item => base44.entities.Punch.delete(item.id)))
            );
            await base44.entities.Exception.filter({ project_id: project.id }).then(items => 
                Promise.all(items.map(item => base44.entities.Exception.delete(item.id)))
            );
            await base44.entities.AnalysisResult.filter({ project_id: project.id }).then(items => 
                Promise.all(items.map(item => base44.entities.AnalysisResult.delete(item.id)))
            );
            await base44.entities.ShiftTiming.filter({ project_id: project.id }).then(items => 
                Promise.all(items.map(item => base44.entities.ShiftTiming.delete(item.id)))
            );
            await base44.entities.Project.delete(project.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projects']);
            toast.success('Project deleted successfully');
            navigate(createPageUrl('Projects'));
        }
    });

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            deleteMutation.mutate();
        }
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
                    return (
                        <Card key={stat.label} className="border-0 shadow-sm">
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
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-slate-600">Date Range</p>
                            <p className="font-medium text-slate-900 mt-1">
                                {new Date(project.date_from).toLocaleDateString()} - {new Date(project.date_to).toLocaleDateString()}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-600">Department</p>
                            <p className="font-medium text-slate-900 mt-1">{project.department || 'All'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-600">Created By</p>
                            <p className="font-medium text-slate-900 mt-1">{project.created_by || '-'}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-600">Created Date</p>
                            <p className="font-medium text-slate-900 mt-1">
                                {new Date(project.created_date).toLocaleDateString()}
                            </p>
                        </div>
                        {project.updated_date && (
                            <div>
                                <p className="text-sm text-slate-600">Last Analysis</p>
                                <p className="font-medium text-slate-900 mt-1">
                                    {new Date(project.updated_date).toLocaleString()}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Actions */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                    <Button
                        onClick={() => lockMutation.mutate()}
                        disabled={project.status === 'locked' || lockMutation.isPending}
                        variant="outline"
                    >
                        <Lock className="w-4 h-4 mr-2" />
                        {project.status === 'locked' ? 'Locked' : 'Lock Project'}
                    </Button>
                    <Button
                        onClick={() => duplicateMutation.mutate()}
                        disabled={duplicateMutation.isPending}
                        variant="outline"
                    >
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate Project
                    </Button>
                    <Button
                        onClick={handleDelete}
                        disabled={deleteMutation.isPending}
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Project
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}