import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { parseDateInUAE } from '@/components/ui/timezone';
import { Progress } from '@/components/ui/progress';

export default function AnalysisProgressWidget({ dateRange, company, userRole }) {
    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects', company],
        queryFn: async () => {
            const allProjects = await base44.entities.Project.list();
            return company ? allProjects.filter(p => p.company === company) : allProjects;
        }
    });

    const { data: analysisResults = [], isLoading: resultsLoading } = useQuery({
        queryKey: ['analysisResults'],
        queryFn: () => base44.entities.AnalysisResult.list()
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
    const totalProjects = filteredProjects.length;
    const analyzedProjects = filteredProjects.filter(p => 
        ['analyzed', 'locked', 'closed'].includes(p.status)
    ).length;
    const pendingProjects = filteredProjects.filter(p => p.status === 'draft').length;
    
    const progressPercentage = totalProjects > 0 ? (analyzedProjects / totalProjects) * 100 : 0;

    if (projectsLoading || resultsLoading) {
        return (
            <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Overall Progress</span>
                    <span className="font-semibold text-slate-900">{Math.round(progressPercentage)}%</span>
                </div>
                <Progress value={progressPercentage} className="h-2" />
            </div>

            <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-green-900">Completed</p>
                        <p className="text-xs text-green-700">{analyzedProjects} projects analyzed</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900">Pending</p>
                        <p className="text-xs text-amber-700">{pendingProjects} projects waiting</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-slate-600" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">Total Analysis Records</p>
                        <p className="text-xs text-slate-700">{analysisResults.length} records</p>
                    </div>
                </div>
            </div>
        </div>
    );
}