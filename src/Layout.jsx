import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { BarChart3, FolderKanban, Users, Settings, LayoutDashboard, Shield, User as UserIcon, LogOut, Menu, X, ChevronDown, Book } from 'lucide-react';
import { Toaster } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatUAEDateTime } from './components/utils/timezone';

export default function Layout({ children, currentPageName }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [expandedGroup, setExpandedGroup] = useState('dashboard');

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
        if (!currentUser) return false;
        const permission = permissions.find(p => p.page_name === pageName);
        if (!permission) return true; // If no permission configured, allow by default
        const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
        return allowedRoles.includes(currentUser.role);
    };

    const menuGroups = [
        {
            id: 'dashboard',
            name: 'Dashboard',
            icon: LayoutDashboard,
            items: [
                { name: 'Dashboard', path: 'Dashboard', icon: LayoutDashboard }
            ]
        },
        {
            id: 'projects',
            name: 'Project Management',
            icon: FolderKanban,
            items: [
                { name: 'Projects', path: 'Projects', icon: FolderKanban },
                { name: 'Employees', path: 'Employees', icon: Users }
            ]
        },
        {
            id: 'settings',
            name: 'System Settings',
            icon: Settings,
            items: [
                { name: 'Users & Permissions', path: 'Users', icon: Shield },
                { name: 'Rules Settings', path: 'RulesSettings', icon: Settings },
                { name: 'Documentation', path: 'Documentation', icon: Book }
            ]
        },
        {
            id: 'profile',
            name: 'User',
            icon: UserIcon,
            items: [
                { name: 'My Profile', path: 'UserProfile', icon: UserIcon }
            ]
        }
    ];

    // Filter menu items based on user permissions
    const filteredMenuGroups = React.useMemo(() => {
        if (!currentUser) return [];
        
        return menuGroups.map(group => ({
            ...group,
            items: group.items.filter(item => hasPageAccess(item.path))
        })).filter(group => group.items.length > 0);
    }, [currentUser, permissions]);

    const toggleGroup = (groupId) => {
        setExpandedGroup(expandedGroup === groupId ? null : groupId);
    };

    // Don't render sidebar until user is loaded
    if (!currentUser) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Mobile Sidebar Backdrop */}
            {sidebarOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={cn(
                "fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="flex flex-col px-6 py-3 border-b border-slate-200">
                        <div className="flex items-center space-x-3 mb-1">
                            <BarChart3 className="w-7 h-7 text-indigo-600" />
                            <span className="text-xl font-semibold text-slate-900">Attendance</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-10">
                            🕐 UAE Time: {formatUAEDateTime(new Date(), { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    <div className="lg:hidden px-6 h-16 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <BarChart3 className="w-7 h-7 text-indigo-600" />
                            <span className="text-xl font-semibold text-slate-900">Attendance</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
                        {filteredMenuGroups.map((group) => {
                            const GroupIcon = group.icon;
                            const isExpanded = expandedGroup === group.id;
                            
                            return (
                                <div key={group.id}>
                                    {group.items.length === 1 ? (
                                        // Single item - render directly
                                        <Link
                                            to={createPageUrl(group.items[0].path)}
                                            className={cn(
                                                "flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                                                currentPageName === group.items[0].path
                                                    ? "bg-indigo-50 text-indigo-700"
                                                    : "text-slate-700 hover:bg-slate-50"
                                            )}
                                            onClick={() => setSidebarOpen(false)}
                                        >
                                            <GroupIcon className="w-5 h-5" />
                                            <span>{group.items[0].name}</span>
                                        </Link>
                                    ) : (
                                        // Multiple items - render as group
                                        <div>
                                            <button
                                                onClick={() => toggleGroup(group.id)}
                                                className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <GroupIcon className="w-5 h-5" />
                                                    <span>{group.name}</span>
                                                </div>
                                                <ChevronDown className={cn(
                                                    "w-4 h-4 transition-transform",
                                                    isExpanded && "rotate-180"
                                                )} />
                                            </button>
                                            {isExpanded && (
                                                <div className="mt-1 ml-4 space-y-1">
                                                    {group.items.map((item) => {
                                                        const Icon = item.icon;
                                                        return (
                                                            <Link
                                                                key={item.path}
                                                                to={createPageUrl(item.path)}
                                                                className={cn(
                                                                    "flex items-center space-x-3 px-4 py-2 rounded-lg text-sm transition-all",
                                                                    currentPageName === item.path
                                                                        ? "bg-indigo-50 text-indigo-700 font-medium"
                                                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                                                )}
                                                                onClick={() => setSidebarOpen(false)}
                                                            >
                                                                <Icon className="w-4 h-4" />
                                                                <span>{item.name}</span>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </nav>

                    {/* User Info & Logout */}
                    <div className="border-t border-slate-200 p-4">
                        {currentUser && (
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                                        <UserIcon className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 truncate">
                                            {currentUser.full_name}
                                        </p>
                                        <span className={cn(
                                            "inline-block px-2 py-0.5 rounded text-xs font-medium",
                                            isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                                        )}>
                                            {isAdmin ? 'Admin' : 'User'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => base44.auth.logout()}
                            className="w-full justify-center"
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            Logout
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 h-16 flex items-center">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="w-6 h-6" />
                    </Button>
                    <span className="ml-4 text-lg font-semibold text-slate-900">Attendance</span>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6 lg:p-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
            
            {/* Toast Notifications */}
            <Toaster position="top-right" richColors />
        </div>
    );
}