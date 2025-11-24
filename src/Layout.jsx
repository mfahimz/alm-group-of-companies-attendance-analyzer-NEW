import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { BarChart3, FolderKanban, Users, Settings, LayoutDashboard, Shield, User as UserIcon, LogOut } from 'lucide-react';
import { Toaster } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

export default function Layout({ children, currentPageName }) {
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: permissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list(),
        enabled: !!currentUser
    });

    const isAdmin = currentUser?.role === 'admin';

    const hasPageAccess = (pageName) => {
        const permission = permissions.find(p => p.page_name === pageName);
        if (!permission) return true; // Default allow if not configured
        const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
        return allowedRoles.includes(currentUser?.role);
    };

    const allPages = [
        { name: 'Dashboard', path: 'Dashboard', icon: LayoutDashboard },
        { name: 'Projects', path: 'Projects', icon: FolderKanban },
        { name: 'Employees', path: 'Employees', icon: Users },
        { name: 'Users', path: 'Users', icon: Shield },
        { name: 'Rules Settings', path: 'RulesSettings', icon: Settings },
        { name: 'My Profile', path: 'UserProfile', icon: UserIcon }
    ];

    const navigation = allPages.filter(item => hasPageAccess(item.path));

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Top Navigation */}
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-8">
                            <div className="flex items-center space-x-3">
                                <BarChart3 className="w-7 h-7 text-indigo-600" />
                                <span className="text-xl font-semibold text-slate-900">Attendance</span>
                            </div>
                            <div className="flex space-x-1">
                                {navigation.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = currentPageName === item.path;
                                    return (
                                        <Link
                                            key={item.name}
                                            to={createPageUrl(item.path)}
                                            className={`
                                                flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                                                ${isActive 
                                                    ? 'bg-indigo-50 text-indigo-700' 
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                                            `}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span>{item.name}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            {currentUser && (
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="text-slate-600">{currentUser.full_name}</span>
                                    <span className={`
                                        px-2 py-1 rounded-full text-xs font-medium
                                        ${isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}
                                    `}>
                                        {isAdmin ? 'Admin' : 'User'}
                                    </span>
                                </div>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => base44.auth.logout()}
                                className="text-slate-600 hover:text-slate-900"
                            >
                                <LogOut className="w-4 h-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {children}
            </main>
            
            {/* Toast Notifications */}
            <Toaster position="top-left" richColors />
        </div>
    );
}