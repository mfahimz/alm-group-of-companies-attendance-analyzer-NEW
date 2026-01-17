import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, FolderKanban, Users, FileText, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { cn } from '@/lib/utils';

export default function GlobalSearch({ open, onOpenChange }) {
    const [query, setQuery] = useState('');
    const navigate = useNavigate();

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list(),
        enabled: open
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list(),
        enabled: open
    });

    const filteredProjects = projects.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.company.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);

    const filteredEmployees = employees.filter(e =>
        e.name?.toLowerCase().includes(query.toLowerCase()) ||
        String(e.hrms_id || '').includes(query) ||
        String(e.attendance_id || '').includes(query)
    ).slice(0, 5);

    const pages = [
        { name: 'Dashboard', icon: Calendar, path: 'Dashboard' },
        { name: 'Projects', icon: FolderKanban, path: 'Projects' },
        { name: 'Employees', icon: Users, path: 'Employees' },
        { name: 'Reports', icon: FileText, path: 'Reports' }
    ].filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

    const handleSelect = (path) => {
        navigate(createPageUrl(path));
        onOpenChange(false);
        setQuery('');
    };

    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b">
                    <Search className="w-5 h-5 text-slate-400" />
                    <Input
                        placeholder="Search projects, employees, pages..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="border-0 focus-visible:ring-0 text-base"
                        autoFocus
                    />
                    <kbd className="px-2 py-1 text-xs bg-slate-100 rounded">ESC</kbd>
                </div>

                <div className="max-h-96 overflow-y-auto p-2">
                    {query === '' ? (
                        <div className="p-8 text-center text-slate-500">
                            <Search className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                            <p>Type to search projects, employees, or pages</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pages.length > 0 && (
                                <div>
                                    <p className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase">Pages</p>
                                    {pages.map((page) => {
                                        const Icon = page.icon;
                                        return (
                                            <button
                                                key={page.path}
                                                onClick={() => handleSelect(page.path)}
                                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                                            >
                                                <Icon className="w-4 h-4 text-slate-400" />
                                                <span className="text-sm font-medium">{page.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {filteredProjects.length > 0 && (
                                <div>
                                    <p className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase">Projects</p>
                                    {filteredProjects.map((project) => (
                                        <button
                                            key={project.id}
                                            onClick={() => handleSelect(`ProjectDetail?id=${project.id}`)}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-3">
                                                <FolderKanban className="w-4 h-4 text-indigo-500" />
                                                <div>
                                                    <p className="text-sm font-medium">{project.name}</p>
                                                    <p className="text-xs text-slate-500">{project.company}</p>
                                                </div>
                                            </div>
                                            <span className="text-xs bg-slate-100 px-2 py-1 rounded">{project.status}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {filteredEmployees.length > 0 && (
                                <div>
                                    <p className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase">Employees</p>
                                    {filteredEmployees.map((employee) => (
                                        <button
                                            key={employee.id}
                                            onClick={() => handleSelect('Employees')}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors text-left"
                                        >
                                            <Users className="w-4 h-4 text-blue-500" />
                                            <div>
                                                <p className="text-sm font-medium">{employee.name}</p>
                                                <p className="text-xs text-slate-500">HRMS: {employee.hrms_id} • {employee.company}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {pages.length === 0 && filteredProjects.length === 0 && filteredEmployees.length === 0 && (
                                <div className="p-8 text-center text-slate-500">
                                    <p>No results found for "{query}"</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}