import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { BarChart3, FolderKanban, Users, Settings, LayoutDashboard, Shield, User as UserIcon, LogOut, Menu, X, ChevronDown, Book, Activity } from 'lucide-react';
import { Toaster } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Layout({ children, currentPageName }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
                { name: 'Diagnostics', path: 'Diagnostics', icon: Activity },
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
        <div className="min-h-screen bg-gradient-to-br from-indigo-50/40 via-slate-50 to-purple-50/40 flex text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
            {/* Mobile Sidebar Backdrop */}
            {sidebarOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={cn(
                "fixed inset-y-0 left-0 z-50 bg-white/80 backdrop-blur-xl border-r border-white/20 transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto shadow-2xl shadow-indigo-100/50",
                sidebarOpen ? "translate-x-0" : "-translate-x-full",
                sidebarCollapsed ? "w-20" : "w-72"
            )}>
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className={cn("flex items-center justify-between h-20 mb-2", sidebarCollapsed ? "px-4 justify-center" : "px-8")}>
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-tr from-indigo-600 to-purple-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
                                <BarChart3 className="w-6 h-6 text-white flex-shrink-0" />
                            </div>
                            {!sidebarCollapsed && (
                                <span className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                                    Attendance
                                </span>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Navigation */}
                    <nav className={cn("flex-1 overflow-y-auto py-6 space-y-2", sidebarCollapsed ? "px-2" : "px-4")}>
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
                                                "flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 mx-2",
                                                sidebarCollapsed ? "justify-center px-2" : "space-x-3",
                                                currentPageName === group.items[0].path
                                                    ? "bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                                                    : "text-slate-600 hover:bg-slate-50/80 hover:text-slate-900"
                                            )}
                                            onClick={() => setSidebarOpen(false)}
                                            title={sidebarCollapsed ? group.items[0].name : undefined}
                                        >
                                            <GroupIcon className={cn("w-5 h-5 flex-shrink-0 transition-colors", currentPageName === group.items[0].path ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                                            {!sidebarCollapsed && <span>{group.items[0].name}</span>}
                                        </Link>
                                    ) : (
                                        // Multiple items - render as group
                                        <div className="mx-2">
                                            <button
                                                onClick={() => toggleGroup(group.id)}
                                                className={cn(
                                                    "w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                                                    sidebarCollapsed ? "justify-center px-2" : "justify-between",
                                                    "text-slate-600 hover:bg-slate-50/80 hover:text-slate-900"
                                                )}
                                                title={sidebarCollapsed ? group.name : undefined}
                                            >
                                                <div className={cn("flex items-center", sidebarCollapsed ? "" : "space-x-3")}>
                                                    <GroupIcon className="w-5 h-5 flex-shrink-0 text-slate-400" />
                                                    {!sidebarCollapsed && <span>{group.name}</span>}
                                                </div>
                                                {!sidebarCollapsed && (
                                                    <ChevronDown className={cn(
                                                        "w-4 h-4 transition-transform text-slate-400",
                                                        isExpanded && "rotate-180"
                                                    )} />
                                                )}
                                            </button>
                                            {isExpanded && !sidebarCollapsed && (
                                                <div className="mt-1 ml-4 space-y-1 pl-2 border-l border-slate-100">
                                                    {group.items.map((item) => {
                                                        const Icon = item.icon;
                                                        return (
                                                            <Link
                                                                key={item.path}
                                                                to={createPageUrl(item.path)}
                                                                className={cn(
                                                                    "flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200",
                                                                    currentPageName === item.path
                                                                        ? "bg-indigo-50/50 text-indigo-700 font-medium"
                                                                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50/50"
                                                                )}
                                                                onClick={() => setSidebarOpen(false)}
                                                            >
                                                                <Icon className={cn("w-4 h-4", currentPageName === item.path ? "text-indigo-500" : "text-slate-400")} />
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

                    {/* Collapse Toggle (Desktop only) */}
                    <div className="hidden lg:block border-t border-slate-100 p-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            className="w-full justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                        >
                            <ChevronDown className={cn(
                                "w-4 h-4 transition-transform",
                                sidebarCollapsed ? "-rotate-90" : "rotate-90"
                            )} />
                        </Button>
                    </div>

                    {/* User Info & Logout */}
                    <div className={cn("border-t border-slate-100", sidebarCollapsed ? "p-2" : "p-4")}>
                        {currentUser && !sidebarCollapsed && (
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center border border-indigo-100">
                                        <UserIcon className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 truncate">
                                            {currentUser.full_name}
                                        </p>
                                        <span className={cn(
                                            "inline-block px-2 py-0.5 rounded text-[10px] font-medium tracking-wider uppercase",
                                            isAdmin ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-slate-50 text-slate-600 border border-slate-100'
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
                            className={cn("w-full border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900", sidebarCollapsed ? "p-2" : "justify-center")}
                            title={sidebarCollapsed ? "Logout" : undefined}
                        >
                            <LogOut className={cn("w-4 h-4", !sidebarCollapsed && "mr-2")} />
                            {!sidebarCollapsed && "Logout"}
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
                        className="text-slate-500"
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