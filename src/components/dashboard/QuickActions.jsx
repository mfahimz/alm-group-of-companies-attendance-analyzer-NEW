import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Upload, FileText, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function QuickActions({ userRole }) {
    const isAdminOrSupervisor = userRole === 'admin' || userRole === 'supervisor';
    
    const actions = [
        {
            label: 'New Project',
            icon: Plus,
            href: 'Projects',
            color: 'bg-indigo-500 hover:bg-indigo-600',
            description: 'Create attendance project',
            show: isAdminOrSupervisor
        },
        {
            label: 'Add Employee',
            icon: Plus,
            href: 'Employees',
            color: 'bg-blue-500 hover:bg-blue-600',
            description: 'Register new employee',
            show: isAdminOrSupervisor
        },
        {
            label: 'Import Data',
            icon: Upload,
            href: 'AstraImport',
            color: 'bg-purple-500 hover:bg-purple-600',
            description: 'Upload attendance files',
            show: userRole === 'admin'
        },
        {
            label: 'View Reports',
            icon: FileText,
            href: 'Reports',
            color: 'bg-green-500 hover:bg-green-600',
            description: 'Analysis reports',
            show: isAdminOrSupervisor
        }
    ].filter(action => action.show);

    if (actions.length === 0) return null;

    return (
        <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
                {actions.map((action) => {
                    const Icon = action.icon;
                    return (
                        <Link
                            key={action.label}
                            to={createPageUrl(action.href)}
                            className="group"
                        >
                            <div className={`${action.color} text-white rounded-xl p-4 transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg`}>
                                <Icon className="w-5 h-5 mb-2" />
                                <p className="font-semibold text-sm">{action.label}</p>
                                <p className="text-xs opacity-90 mt-0.5">{action.description}</p>
                            </div>
                        </Link>
                    );
                })}
            </CardContent>
        </Card>
    );
}