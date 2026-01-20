import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, Copy, Trash2, Edit, Calendar, FolderKanban, TrendingUp, Clock, Filter, ArrowUpDown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import CreateProjectDialog from '../components/projects/CreateProjectDialog';
import DuplicateProjectDialog from '../components/projects/DuplicateProjectDialog';
import BulkEditProjectDialog from '../components/projects/BulkEditProjectDialog';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Projects() {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [duplicateProject, setDuplicateProject] = useState(null);
    const [selectedProjects, setSelectedProjects] = useState([]);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('status-closed-last');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1); // Reset to first page on search
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isDepartmentHead = userRole === 'department_head';
    const isAdminOrSupervisor = isAdmin || isSupervisor;

    const { data: permissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list(),
        enabled: !!currentUser
    });

    useEffect(() => {
        console.log('🔍 PROJECTS PAGE ACCESS CHECK:', {
            userRole,
            hasCurrentUser: !!currentUser,
            permissionsCount: permissions.length,
            permissions: permissions.map(p => ({ page: p.page_name, roles: p.allowed_roles }))
        });

        if (currentUser && permissions.length > 0) {
            const permission = permissions.find(p => p.page_name === 'Projects');
            console.log('🔐 Projects Permission Check:', {
                permissionFound: !!permission,
                allowedRoles: permission?.allowed_roles,
                userRole,
                willRedirect: permission ? !permission.allowed_roles.split(',').map(r => r.trim()).includes(userRole) : false
            });

            if (permission) {
                const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
                if (!allowedRoles.includes(userRole)) {
                    console.log('❌ ACCESS DENIED - Redirecting to Dashboard');
                    toast.error('Access denied.');
                    navigate(createPageUrl('Dashboard'));
                }
            }
        }
    }, [currentUser, permissions, navigate, userRole]);

    // Server-side filtered projects with pagination
    const { data: projectsData = { items: [], total: 0 }, isLoading, error: projectsError } = useQuery({
        queryKey: ['projects', currentUser?.company, userRole, page, pageSize],
        queryFn: async () => {
            const role = currentUser?.extended_role || currentUser?.role || 'user';
            const isAdminRole = role === 'admin' || role === 'supervisor' || role === 'ceo';
            const isDeptHead = role === 'department_head';

            console.log('[Projects] Fetching projects for user:', {
                company: currentUser?.company,
                role,
                isDeptHead,
                page,
                pageSize
            });

            if (!currentUser) {
                console.log('[Projects] No current user, returning empty');
                return { items: [], total: 0 };
            }
            
            const skip = (page - 1) * pageSize;
            
            try {
                // Admin, Supervisor, CEO can see all projects
                if (isAdminRole) {
                    console.log('[Projects] Fetching all projects (admin/supervisor/ceo)');
                    const items = await base44.entities.Project.list('-created_date', pageSize, skip);
                    console.log('[Projects] Fetched', items.length, 'projects');
                    return { items, total: items.length === pageSize ? (page + 1) * pageSize : skip + items.length };
                }
                
                // Department heads see only CLOSED projects from their company
                if (isDeptHead) {
                    console.log('[Projects] Fetching CLOSED projects for department head, company:', currentUser.company);
                    const items = await base44.entities.Project.filter({
                        company: currentUser.company,
                        status: 'closed'
                    }, '-created_date', pageSize);
                    console.log('[Projects] Fetched', items.length, 'closed projects for department head');
                    return { items, total: items.length === pageSize ? (page + 1) * pageSize : items.length };
                }
                
                // Regular users see all projects from their company
                console.log('[Projects] Fetching projects for regular user, company:', currentUser.company);
                const items = await base44.entities.Project.filter({
                    company: currentUser.company
                }, '-created_date', pageSize);
                console.log('[Projects] Fetched', items.length, 'projects for user');
                return { items, total: items.length === pageSize ? (page + 1) * pageSize : items.length };
            } catch (error) {
                console.error('[Projects] Error fetching projects:', error);
                throw error;
            }
        },
        enabled: !!currentUser,
        keepPreviousData: true
    });

    // Log any query errors
    React.useEffect(() => {
        if (projectsError) {
            console.error('[Projects] Query error:', projectsError);
        }
    }, [projectsError]);

    const projects = projectsData.items;

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
            // SECURITY: Verify user has access to this project
            const projectToDelete = projects.find(p => p.id === projectId);
            if (!projectToDelete) {
                throw new Error('Project not found or access denied');
            }

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

    const filteredProjects = React.useMemo(() => {
        let filtered = projects.filter(project =>
            project.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            project.department?.toLowerCase().includes(debouncedSearch.toLowerCase())
        );

        // Apply status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(p => p.status === statusFilter);
        }

        // Apply sorting
        filtered.sort((a, b) => {
            if (sortBy === 'status-closed-last') {
                // Closed projects at bottom, then by created date
                if (a.status === 'closed' && b.status !== 'closed') return 1;
                if (a.status !== 'closed' && b.status === 'closed') return -1;
                return new Date(b.created_date) - new Date(a.created_date);
            } else if (sortBy === 'name-asc') {
                return a.name.localeCompare(b.name);
            } else if (sortBy === 'name-desc') {
                return b.name.localeCompare(a.name);
            } else if (sortBy === 'date-newest') {
                return new Date(b.created_date) - new Date(a.created_date);
            } else if (sortBy === 'date-oldest') {
                return new Date(a.created_date) - new Date(b.created_date);
            }
            return 0;
        });

        return filtered;
    }, [projects, debouncedSearch, statusFilter, sortBy]);

    // Group projects by company
    const projectsByCompany = React.useMemo(() => {
        const grouped = {};
        filteredProjects.forEach(project => {
            if (!grouped[project.company]) {
                grouped[project.company] = [];
            }
            grouped[project.company].push(project);
        });
        return grouped;
    }, [filteredProjects]);

    if (!currentUser) {
        return <div className="text-center py-12 text-slate-500">Loading...</div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <Breadcrumb items={[{ label: 'Projects' }]} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="animate-in slide-in-from-left-4 duration-700">
                    <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                        Projects
                    </h1>
                    <p className="text-slate-600 mt-2 text-sm sm:text-base">Manage attendance analysis projects</p>
                </div>
                <div className="flex gap-2">
                    {selectedProjects.length > 0 && isAdminOrSupervisor && (
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

            {/* Search and Filters */}
            <div className="space-y-4 animate-in slide-in-from-top-4 duration-700 delay-100">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                        placeholder="Search projects by name or department..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-12 h-12 bg-white/80 backdrop-blur-sm border-0 shadow-lg ring-1 ring-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-500 transition-all"
                    />
                </div>
                
                <div className="flex gap-3">
                    <div className="flex-1">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-11 bg-white/80 backdrop-blur-sm border-0 shadow-md ring-1 ring-slate-200">
                                <Filter className="w-4 h-4 mr-2 text-slate-400" />
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="analyzed">Analyzed</SelectItem>
                                <SelectItem value="locked">Locked</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="flex-1">
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="h-11 bg-white/80 backdrop-blur-sm border-0 shadow-md ring-1 ring-slate-200">
                                <ArrowUpDown className="w-4 h-4 mr-2 text-slate-400" />
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="status-closed-last">Closed Last (Default)</SelectItem>
                                <SelectItem value="date-newest">Newest First</SelectItem>
                                <SelectItem value="date-oldest">Oldest First</SelectItem>
                                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Projects Grid */}
            {isLoading ? (
                <div className="text-center py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-slate-500 mt-4">Loading projects...</p>
                </div>
            ) : filteredProjects.length === 0 ? (
                <Card className="border-0 shadow-xl bg-gradient-to-br from-white to-slate-50 rounded-3xl overflow-hidden">
                    <CardContent className="p-16 text-center">
                        <div className="relative mb-6">
                            <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-3xl flex items-center justify-center mx-auto animate-pulse">
                                <FolderKanban className="w-12 h-12 text-indigo-600" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-6 h-6 bg-amber-400 rounded-full animate-bounce"></div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-2">
                            {isDepartmentHead ? 'No Closed Projects' : 'No projects yet'}
                        </h3>
                        <p className="text-slate-600 mb-6">
                            {isDepartmentHead 
                                ? 'No projects have been closed yet. Check back later for completed project reports.'
                                : 'Create your first project to start tracking attendance'
                            }
                        </p>
                        {!isDepartmentHead && (
                            <Button 
                                onClick={() => setShowCreateDialog(true)}
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Create First Project
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-8">
                    {Object.entries(projectsByCompany).map(([company, companyProjects]) => (
                        <div key={company} className="space-y-4">
                            <div className="flex items-center gap-3 sticky top-0 z-10 bg-gradient-to-r from-slate-50 to-transparent py-3 px-4 rounded-xl">
                                <FolderKanban className="w-5 h-5 text-indigo-600" />
                                <h2 className="text-xl font-bold text-slate-900">{company}</h2>
                                <span className="ml-auto text-sm text-slate-500 font-medium">
                                    {companyProjects.length} project{companyProjects.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {companyProjects.map((project, idx) => (
                        <Card 
                            key={project.id} 
                            className="border-0 bg-white shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 h-full group rounded-3xl overflow-hidden ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95"
                            style={{ animationDelay: `${idx * 75}ms` }}
                        >
                            <div className={`h-1.5 w-full bg-gradient-to-r ${
                                project.status === 'draft' ? 'from-amber-400 to-amber-500' :
                                project.status === 'analyzed' ? 'from-green-400 to-green-600' :
                                project.status === 'locked' ? 'from-slate-400 to-slate-500' :
                                'from-red-400 to-red-500'
                            }`} />
                            <CardContent className="p-6 relative">
                                {isAdminOrSupervisor && (
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
                                <Link to={createPageUrl(`ProjectDetail?id=${project.id}`)} className="block">
                                    <div className="flex items-start justify-between mb-5">
                                        <div className="flex-1 min-w-0 pr-3">
                                            <h3 className="font-bold text-slate-900 text-xl group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-indigo-600 group-hover:to-purple-600 group-hover:bg-clip-text transition-all duration-300 leading-tight mb-1">
                                                {project.name}
                                            </h3>
                                            <p className="text-sm text-slate-500 font-medium">{project.company}</p>
                                        </div>
                                        <div className="relative">
                                            <span className={`
                                                px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider shadow-sm
                                                ${project.status === 'draft' ? 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-700 ring-1 ring-amber-200' : ''}
                                                ${project.status === 'analyzed' ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-700 ring-1 ring-green-200' : ''}
                                                ${project.status === 'locked' ? 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-600 ring-1 ring-slate-300' : ''}
                                                ${project.status === 'closed' ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 ring-1 ring-red-200' : ''}
                                            `}>
                                                {project.status}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-3 text-sm">
                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100">
                                            <Calendar className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-slate-600 font-medium mb-0.5">Period</p>
                                                <p className="font-bold text-slate-900 text-xs">
                                                    {new Date(project.date_from).toLocaleDateString('en-GB')} → {new Date(project.date_to).toLocaleDateString('en-GB')}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-white transition-colors">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <FolderKanban className="w-3 h-3 text-slate-400" />
                                                    <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Department</p>
                                                </div>
                                                <p className="font-bold text-slate-900 text-sm truncate">{project.department || 'All'}</p>
                                            </div>
                                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-white transition-colors">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Clock className="w-3 h-3 text-slate-400" />
                                                    <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Created</p>
                                                </div>
                                                <p className="font-bold text-slate-900 text-[11px]">
                                                    {new Date(project.created_date).toLocaleDateString('en-GB')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                                
                                {isAdminOrSupervisor && (
                                    <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="flex-1 text-slate-600 hover:text-indigo-600 hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 rounded-xl font-semibold transition-all"
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
                                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 px-3 rounded-xl transition-all"
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
                        </div>
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