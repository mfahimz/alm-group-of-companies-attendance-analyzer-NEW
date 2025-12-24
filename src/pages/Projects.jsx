import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, Copy, Trash2, Edit } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import CreateProjectDialog from '../components/projects/CreateProjectDialog';
import DuplicateProjectDialog from '../components/projects/DuplicateProjectDialog';
import BulkEditProjectDialog from '../components/projects/BulkEditProjectDialog';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import { Checkbox } from '@/components/ui/checkbox';

export default function Projects() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [duplicateProject, setDuplicateProject] = useState(null);
    const [selectedProjects, setSelectedProjects] = useState([]);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const isAdmin = currentUser?.role === 'admin';

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

    const { data: allProjects = [], isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list('-created_date')
    });

    // Filter projects based on user access
    const projects = React.useMemo(() => {
        if (!currentUser) return [];
        const canAccessAll = isAdmin || currentUser.can_access_all_companies;
        if (canAccessAll) return allProjects;
        return allProjects.filter(p => p.company === currentUser.company);
    }, [allProjects, currentUser, isAdmin]);

    const checkOverlap = (start, end, excludeId = null) => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        return projects.some(p => {
            if (p.id === excludeId) return false;
            const pStart = new Date(p.date_from);
            const pEnd = new Date(p.date_to);
            return (startDate <= pEnd && endDate >= pStart);
        });
    };

    const handleDuplicateClick = (project) => {
        if (checkOverlap(project.date_from, project.date_to, project.id)) {
            setDuplicateProject(project);
        } else {
            // No overlap (should rarely happen if duplicating same dates, but logic is here)
            setDuplicateProject(project); 
        }
    };

    const deleteMutation = useMutation({
        mutationFn: async (projectId) => {
            // Use bulk delete by query filter instead of fetching and deleting one-by-one
            await base44.entities.ReportRun.deleteMany({ project_id: projectId });
            await base44.entities.AnalysisResult.deleteMany({ project_id: projectId });
            await base44.entities.Punch.deleteMany({ project_id: projectId });
            await base44.entities.Exception.deleteMany({ project_id: projectId });
            await base44.entities.ShiftTiming.deleteMany({ project_id: projectId });
            
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
            <Breadcrumb items={[{ label: 'Projects' }]} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Projects</h1>
                    <p className="text-slate-600 mt-1 sm:mt-2 text-sm sm:text-base">Manage attendance analysis projects</p>
                </div>
                <div className="flex gap-2">
                    {selectedProjects.length > 0 && isAdmin && (
                        <Button
                            onClick={() => setShowBulkEdit(true)}
                            variant="outline"
                            className="w-full sm:w-auto"
                        >
                            <Edit className="w-4 h-4 mr-2" />
                            Bulk Edit ({selectedProjects.length})
                        </Button>
                    )}
                    <Button 
                        onClick={() => setShowCreateDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        New Project
                    </Button>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                    placeholder="Search projects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                />
            </div>

            {/* Projects Grid */}
            {isLoading ? (
                <div className="text-center py-12 text-slate-500">Loading projects...</div>
            ) : filteredProjects.length === 0 ? (
                <Card className="border-2 border-dashed border-slate-200 bg-white/50 shadow-sm rounded-2xl">
                    <CardContent className="p-12 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FolderKanban className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">No projects yet</h3>
                        <p className="text-slate-500">Create your first project to get started.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map((project) => (
                        <Card key={project.id} className="border-0 bg-white/80 backdrop-blur-sm shadow-lg shadow-slate-200/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 h-full group rounded-2xl overflow-hidden ring-1 ring-slate-900/5">
                            <div className={`h-2 w-full ${
                                project.status === 'draft' ? 'bg-amber-400' :
                                project.status === 'analyzed' ? 'bg-green-500' :
                                'bg-slate-300'
                            }`} />
                            <CardContent className="p-6 relative">
                                {isAdmin && (
                                    <div className="absolute top-4 right-4 z-10">
                                        <Checkbox
                                            checked={selectedProjects.some(p => p.id === project.id)}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    setSelectedProjects([...selectedProjects, project]);
                                                } else {
                                                    setSelectedProjects(selectedProjects.filter(p => p.id !== project.id));
                                                }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                )}
                                <Link to={createPageUrl(`ProjectDetail?id=${project.id}`)}>
                                    <div className="flex items-start justify-between mb-4">
                                        <h3 className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors leading-tight">{project.name}</h3>
                                        <span className={`
                                            px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                                            ${project.status === 'draft' ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-100' : ''}
                                            ${project.status === 'analyzed' ? 'bg-green-50 text-green-600 ring-1 ring-green-100' : ''}
                                            ${project.status === 'locked' ? 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' : ''}
                                        `}>
                                            {project.status}
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50">
                                            <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">Period</span>
                                            <span className="font-semibold text-slate-700">
                                                {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 rounded-lg bg-slate-50">
                                                <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">Dept</p>
                                                <p className="font-semibold text-slate-700 truncate">{project.department || 'All'}</p>
                                            </div>
                                            <div className="p-2 rounded-lg bg-slate-50">
                                                <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">Created</p>
                                                <p className="font-semibold text-slate-700 truncate">
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
                                        </div>
                                    </div>
                                </Link>
                                
                                {isAdmin && (
                                    <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="flex-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleDuplicateClick(project);
                                            }}
                                        >
                                            <Copy className="w-4 h-4 mr-2" />
                                            Duplicate
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 px-2"
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
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <CreateProjectDialog 
                open={showCreateDialog}
                onClose={() => setShowCreateDialog(false)}
            />

            <DuplicateProjectDialog 
                open={!!duplicateProject}
                onClose={() => setDuplicateProject(null)}
                sourceProject={duplicateProject}
                projects={projects}
            />

            <BulkEditProjectDialog
                open={showBulkEdit}
                onClose={() => {
                    setShowBulkEdit(false);
                    setSelectedProjects([]);
                }}
                selectedProjects={selectedProjects}
            />
        </div>
    );
}