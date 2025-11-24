import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, Copy, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import CreateProjectDialog from '../components/projects/CreateProjectDialog';
import { toast } from 'sonner';

export default function Projects() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: permissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list(),
        enabled: !!currentUser
    });

    useEffect(() => {
        if (currentUser && permissions.length > 0) {
            const permission = permissions.find(p => p.page_name === 'Projects');
            if (permission) {
                const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
                if (!allowedRoles.includes(currentUser.role)) {
                    toast.error('Access denied.');
                    navigate(createPageUrl('Dashboard'));
                }
            }
        }
    }, [currentUser, permissions, navigate]);

    const { data: projects = [], isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list('-created_date')
    });

    const duplicateMutation = useMutation({
        mutationFn: async (projectId) => {
            const project = projects.find(p => p.id === projectId);
            const punches = await base44.entities.Punch.filter({ project_id: projectId });
            const shifts = await base44.entities.ShiftTiming.filter({ project_id: projectId });
            const exceptions = await base44.entities.Exception.filter({ project_id: projectId });

            const newProject = await base44.entities.Project.create({
                name: `${project.name} (Copy)`,
                date_from: project.date_from,
                date_to: project.date_to,
                department: project.department,
                status: 'draft'
            });

            if (punches.length > 0) {
                await base44.entities.Punch.bulkCreate(
                    punches.map(p => ({
                        project_id: newProject.id,
                        attendance_id: p.attendance_id,
                        timestamp_raw: p.timestamp_raw,
                        punch_date: p.punch_date
                    }))
                );
            }

            if (shifts.length > 0) {
                await base44.entities.ShiftTiming.bulkCreate(
                    shifts.map(s => ({
                        project_id: newProject.id,
                        attendance_id: s.attendance_id,
                        date: s.date,
                        is_friday_shift: s.is_friday_shift,
                        applicable_days: s.applicable_days,
                        am_start: s.am_start,
                        am_end: s.am_end,
                        pm_start: s.pm_start,
                        pm_end: s.pm_end
                    }))
                );
            }

            if (exceptions.length > 0) {
                await base44.entities.Exception.bulkCreate(
                    exceptions.map(e => ({
                        project_id: newProject.id,
                        attendance_id: e.attendance_id,
                        date_from: e.date_from,
                        date_to: e.date_to,
                        type: e.type,
                        new_am_start: e.new_am_start,
                        new_am_end: e.new_am_end,
                        new_pm_start: e.new_pm_start,
                        new_pm_end: e.new_pm_end,
                        details: e.details
                    }))
                );
            }

            return newProject;
        },
        onSuccess: (newProject) => {
            queryClient.invalidateQueries(['projects']);
            toast.success('Project duplicated successfully');
            navigate(createPageUrl(`ProjectDetail?id=${newProject.id}`));
        },
        onError: () => {
            toast.error('Failed to duplicate project');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (projectId) => {
            // Delete all ReportRuns first
            const reportRuns = await base44.entities.ReportRun.filter({ project_id: projectId });
            await Promise.all(reportRuns.map(item => base44.entities.ReportRun.delete(item.id)));
            
            // Delete all related data
            const punchItems = await base44.entities.Punch.filter({ project_id: projectId });
            await Promise.all(punchItems.map(item => base44.entities.Punch.delete(item.id)));
            
            const exceptionItems = await base44.entities.Exception.filter({ project_id: projectId });
            await Promise.all(exceptionItems.map(item => base44.entities.Exception.delete(item.id)));
            
            const resultItems = await base44.entities.AnalysisResult.filter({ project_id: projectId });
            await Promise.all(resultItems.map(item => base44.entities.AnalysisResult.delete(item.id)));
            
            const shiftItems = await base44.entities.ShiftTiming.filter({ project_id: projectId });
            await Promise.all(shiftItems.map(item => base44.entities.ShiftTiming.delete(item.id)));
            
            // Finally delete the project
            await base44.entities.Project.delete(projectId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['projects']);
            toast.success('Project deleted successfully');
        },
        onError: (error) => {
            toast.error('Failed to delete project: ' + error.message);
        }
    });

    const filteredProjects = projects.filter(project =>
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.department?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!currentUser) {
        return <div className="text-center py-12 text-slate-500">Loading...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Projects</h1>
                    <p className="text-slate-600 mt-2">Manage attendance analysis projects</p>
                </div>
                <Button 
                    onClick={() => setShowCreateDialog(true)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    New Project
                </Button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Projects Grid */}
            {isLoading ? (
                <div className="text-center py-12 text-slate-500">Loading projects...</div>
            ) : filteredProjects.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="p-12 text-center">
                        <p className="text-slate-500">No projects found. Create your first project to get started.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map((project) => (
                        <Card key={project.id} className="border-0 shadow-sm hover:shadow-md transition-shadow h-full">
                            <CardContent className="p-6">
                                <Link to={createPageUrl(`ProjectDetail?id=${project.id}`)}>
                                    <div className="flex items-start justify-between mb-4">
                                        <h3 className="font-semibold text-slate-900 text-lg">{project.name}</h3>
                                        <span className={`
                                            px-2.5 py-1 rounded-full text-xs font-medium
                                            ${project.status === 'draft' ? 'bg-amber-100 text-amber-700' : ''}
                                            ${project.status === 'analyzed' ? 'bg-green-100 text-green-700' : ''}
                                            ${project.status === 'locked' ? 'bg-slate-100 text-slate-700' : ''}
                                        `}>
                                            {project.status}
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Date Range:</span>
                                            <span className="font-medium text-slate-900">
                                                {new Date(project.date_from).toLocaleDateString()} - {new Date(project.date_to).toLocaleDateString()}
                                            </span>
                                        </div>
                                        {project.department && (
                                            <div className="flex justify-between">
                                                <span className="text-slate-600">Department:</span>
                                                <span className="font-medium text-slate-900">{project.department}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Created:</span>
                                            <span className="font-medium text-slate-900">
                                                {new Date(project.created_date).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                                
                                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            duplicateMutation.mutate(project.id);
                                        }}
                                        disabled={duplicateMutation.isPending}
                                    >
                                        <Copy className="w-4 h-4 mr-2" />
                                        Duplicate
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (window.confirm('Delete this project? This action cannot be undone.')) {
                                                deleteMutation.mutate(project.id);
                                            }
                                        }}
                                        disabled={deleteMutation.isPending}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <CreateProjectDialog 
                open={showCreateDialog}
                onClose={() => setShowCreateDialog(false)}
            />
        </div>
    );
}