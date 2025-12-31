import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Clock, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function RecentActivity() {
    const { data: recentProjects = [] } = useQuery({
        queryKey: ['recentProjects'],
        queryFn: async () => {
            const projects = await base44.entities.Project.list('-updated_date', 5);
            return projects;
        }
    });

    const getStatusIcon = (status) => {
        switch (status) {
            case 'analyzed': return <CheckCircle className="w-4 h-4 text-green-600" />;
            case 'draft': return <AlertCircle className="w-4 h-4 text-amber-600" />;
            default: return <FileText className="w-4 h-4 text-slate-600" />;
        }
    };

    const formatRelativeTime = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    };

    return (
        <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-slate-600" />
                    <CardTitle className="text-lg">Recent Activity</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-1">
                {recentProjects.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No recent activity</p>
                ) : (
                    recentProjects.map((project) => (
                        <Link
                            key={project.id}
                            to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                            className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                        >
                            <div className="mt-0.5">
                                {getStatusIcon(project.status)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 group-hover:text-indigo-600 truncate">
                                    {project.name}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {project.company}
                                </p>
                            </div>
                            <span className="text-xs text-slate-400 whitespace-nowrap">
                                {formatRelativeTime(project.updated_date)}
                            </span>
                        </Link>
                    ))
                )}
            </CardContent>
        </Card>
    );
}