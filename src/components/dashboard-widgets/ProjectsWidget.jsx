import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FolderKanban, FolderOpen, FolderCheck, Loader2 } from 'lucide-react';
import { parseDateInUAE } from '@/components/ui/timezone';

export default function ProjectsWidget({ dateRange, company, userRole }) {
    const { data: projects = [], isLoading } = useQuery({
        queryKey: ['projects', company],
        queryFn: async () => {
            const allProjects = await base44.entities.Project.list();
            return company ? allProjects.filter(p => p.company === company) : allProjects;
        }
    });

    const filterByDateRange = (projects) => {
        if (!dateRange.from || !dateRange.to) return projects;
        
        return projects.filter(project => {
            const projectStart = parseDateInUAE(project.date_from);
            const projectEnd = parseDateInUAE(project.date_to);
            return projectStart <= dateRange.to && projectEnd >= dateRange.from;
        });
    };

    const filteredProjects = filterByDateRange(projects);
    
    const activeProjects = filteredProjects.filter(p => p.status === 'analyzed' || p.status === 'locked').length;
    const draftProjects = filteredProjects.filter(p => p.status === 'draft').length;
    const closedProjects = filteredProjects.filter(p => p.status === 'closed').length;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-medium text-blue-900">Active</span>
                    </div>
                    <span className="text-2xl font-bold text-blue-600">{activeProjects}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <FolderKanban className="w-5 h-5 text-amber-600" />
                        <span className="text-sm font-medium text-amber-900">Draft</span>
                    </div>
                    <span className="text-2xl font-bold text-amber-600">{draftProjects}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <FolderCheck className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-medium text-green-900">Closed</span>
                    </div>
                    <span className="text-2xl font-bold text-green-600">{closedProjects}</span>
                </div>
            </div>
            
            <div className="pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-500">Total: {filteredProjects.length} projects</p>
            </div>
        </div>
    );
}