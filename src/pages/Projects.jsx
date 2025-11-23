import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import CreateProjectDialog from '../components/projects/CreateProjectDialog';

export default function Projects() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const queryClient = useQueryClient();

    const { data: projects = [], isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list('-created_date')
    });

    const filteredProjects = projects.filter(project =>
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.department?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                        <Link
                            key={project.id}
                            to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                        >
                            <Card className="border-0 shadow-sm hover:shadow-md transition-shadow h-full">
                                <CardContent className="p-6">
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
                                </CardContent>
                            </Card>
                        </Link>
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