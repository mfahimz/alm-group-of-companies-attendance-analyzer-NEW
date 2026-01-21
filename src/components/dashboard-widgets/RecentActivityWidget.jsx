import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FileText, Users, Calendar, Loader2 } from 'lucide-react';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';
import { formatDistanceToNow } from 'date-fns';

export default function RecentActivityWidget({ dateRange, company, userRole }) {
    const { data: projects = [], isLoading: projectsLoading } = useQuery({
        queryKey: ['projects', company],
        queryFn: async () => {
            const allProjects = await base44.entities.Project.list('-updated_date', 10);
            return company ? allProjects.filter(p => p.company === company) : allProjects;
        }
    });

    const { data: reportRuns = [], isLoading: reportsLoading } = useQuery({
        queryKey: ['recentReportRuns'],
        queryFn: async () => {
            const runs = await base44.entities.ReportRun.list('-created_date', 10);
            if (!company) return runs;
            
            const projectIds = projects.map(p => p.id);
            return runs.filter(r => projectIds.includes(r.project_id));
        },
        enabled: projects.length > 0
    });

    const { data: exceptions = [], isLoading: exceptionsLoading } = useQuery({
        queryKey: ['recentExceptions'],
        queryFn: async () => {
            const allExceptions = await base44.entities.Exception.list('-created_date', 10);
            if (!company) return allExceptions;
            
            const projectIds = projects.map(p => p.id);
            return allExceptions.filter(e => projectIds.includes(e.project_id));
        },
        enabled: projects.length > 0
    });

    const filterByDateRange = (items, dateField = 'created_date') => {
        if (!dateRange.from || !dateRange.to) return items;
        
        return items.filter(item => {
            const itemDate = parseDateInUAE(item[dateField]);
            return itemDate >= dateRange.from && itemDate <= dateRange.to;
        });
    };

    const recentProjects = filterByDateRange(projects, 'updated_date').slice(0, 5);
    const recentReports = filterByDateRange(reportRuns).slice(0, 3);
    const recentExceptions = filterByDateRange(exceptions).slice(0, 3);

    if (projectsLoading || reportsLoading || exceptionsLoading) {
        return (
            <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-4 max-h-96 overflow-y-auto">
            {/* Recent Projects */}
            {recentProjects.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
                        <FileText className="w-3 h-3" />
                        Recent Projects
                    </h4>
                    <div className="space-y-2">
                        {recentProjects.map(project => (
                            <div key={project.id} className="p-2 bg-slate-50 rounded-lg">
                                <p className="text-sm font-medium text-slate-900">{project.name}</p>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-xs text-slate-500">{project.company}</span>
                                    <span className="text-xs text-slate-400">
                                        {formatDistanceToNow(parseDateInUAE(project.updated_date), { addSuffix: true })}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Report Runs */}
            {recentReports.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        Recent Reports
                    </h4>
                    <div className="space-y-2">
                        {recentReports.map(report => (
                            <div key={report.id} className="p-2 bg-blue-50 rounded-lg">
                                <p className="text-sm font-medium text-blue-900">
                                    {report.report_name || 'Report Run'}
                                </p>
                                <p className="text-xs text-blue-700 mt-1">
                                    {report.employee_count} employees • {formatInUAE(parseDateInUAE(report.date_from), 'MMM dd')} - {formatInUAE(parseDateInUAE(report.date_to), 'MMM dd')}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Exceptions */}
            {recentExceptions.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-2">
                        <Users className="w-3 h-3" />
                        Recent Exceptions
                    </h4>
                    <div className="space-y-2">
                        {recentExceptions.map(exception => (
                            <div key={exception.id} className="p-2 bg-amber-50 rounded-lg">
                                <p className="text-sm font-medium text-amber-900">
                                    {exception.type.replace(/_/g, ' ')}
                                </p>
                                <p className="text-xs text-amber-700 mt-1">
                                    {formatInUAE(parseDateInUAE(exception.date_from), 'MMM dd, yyyy')}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {recentProjects.length === 0 && recentReports.length === 0 && recentExceptions.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">No recent activity in selected date range</p>
            )}
        </div>
    );
}