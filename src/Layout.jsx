import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import NotificationCenter from './components/ui/NotificationCenter';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { formatInUAE } from '@/components/ui/timezone';
import { CompanyBadge } from '@/components/ui/CompanyBadge';
import { useDeviceDetection } from './components/ui/useDeviceDetection';
import DesktopOnlyScreen from './components/ui/DesktopOnlyScreen';
import {
            BarChart3,
            FolderKanban,
            Users,
            Settings,
            LayoutDashboard,
            Shield,
            Book,
            Calendar,
            FileSpreadsheet,
            Briefcase,
            Clock,
            ChevronDown,
            LogOut
        } from 'lucide-react';


export default function Layout({ children, currentPageName }) {
    const { isDesktop, isChecking } = useDeviceDetection();
    const [expandedMenus, setExpandedMenus] = useState({});
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebarCollapsed');
        return saved === 'true';
    });
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarWidth');
        return saved ? parseInt(saved) : 256;
    });
    const [isResizing, setIsResizing] = useState(false);

    const publicPages = [];
    const isPublicPage = publicPages.includes(currentPageName);

    const { data: currentUser, isLoading, error } = useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => {
            try {
                const user = await base44.auth.me();
                try {
                    let ipAddress = 'Unknown';
                    try {
                        const ipResponse = await fetch('https://api.ipify.org?format=json');
                        const ipData = await ipResponse.json();
                        ipAddress = ipData.ip;
                    } catch {}

                    await base44.entities.ActivityLog.create({
                        user_email: user.email,
                        user_name: user.full_name,
                        user_role: user.role,
                        ip_address: ipAddress,
                        user_agent: navigator.userAgent,
                        location: 'UAE'
                    });
                } catch (e) {}
                return user;
            } catch (err) {
                console.error('Auth error:', err);
                throw err;
            }
        },
        enabled: !isPublicPage,
        retry: false,
        staleTime: 15 * 60 * 1000,
        gcTime: 20 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isDepartmentHead = userRole === 'department_head';

    React.useEffect(() => {
        if (currentUser && isDepartmentHead && currentPageName === 'Dashboard') {
            window.location.replace('/DepartmentHeadDashboard');
        }
    }, [currentUser, isDepartmentHead, currentPageName]);

    const { data: permissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: async () => {
            try {
                return await base44.entities.PagePermission.list();
            } catch (err) {
                console.error('Permissions fetch error:', err);
                return [];
            }
        },
        enabled: !!currentUser && !isPublicPage,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 1
    });

    const { data: maintenanceMode } = useQuery({
        queryKey: ['maintenanceMode'],
        queryFn: async () => {
            try {
                const settings = await base44.entities.SystemSettings.filter({ 
                    setting_key: 'MAINTENANCE_MODE' 
                });
                if (settings.length > 0) {
                    return settings[0].setting_value === 'true';
                }
                return false;
            } catch {
                return false;
            }
        },
        enabled: !!currentUser && !isPublicPage,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 1
    });

    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isCEO = userRole === 'ceo';

    const hasPageAccess = React.useCallback((pageName) => {
      if (!currentUser) return false;
      const permission = permissions.find((p) => p.page_name === pageName);
      if (!permission) return true;
      const allowedRoles = permission.allowed_roles.split(',').map((r) => r.trim());
      return allowedRoles.includes(userRole);
    }, [currentUser, permissions, userRole]);

    const sidebarMenu = React.useMemo(() => {
        if (!currentUser) return [];

        const menu = [
            { title: 'Dashboard', url: isDepartmentHead ? 'DepartmentHeadDashboard' : 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
            {
                title: 'Projects',
                icon: <FolderKanban className="w-5 h-5" />,
                items: [
                    { title: 'Projects', url: 'Projects', icon: <FolderKanban className="w-5 h-5" /> },
                    { title: 'Employees', url: 'Employees', icon: <Users className="w-5 h-5" /> },
                    { title: 'Salaries', url: 'Salaries', icon: <LayoutDashboard className="w-5 h-5" /> },
                    { title: 'Quarterly Minutes', url: 'QuarterlyMinutesManagement', icon: <Clock className="w-5 h-5" /> },
                    ...(isAdmin || isSupervisor || isCEO ? [{ title: 'Reports & Analytics', url: 'Reports', icon: <BarChart3 className="w-5 h-5" /> }] : [])
                ]
            }
        ];

        if (isAdmin) {
            menu.push({
                title: 'Recruitment',
                icon: <Briefcase className="w-5 h-5" />,
                items: [
                    { title: 'Recruitment Hub', url: 'Recruitment', icon: <Users className="w-5 h-5" /> },
                    { title: 'Job Positions', url: 'JobPositions', icon: <Briefcase className="w-5 h-5" /> },
                    { title: 'Candidate Screening', url: 'CandidateScreening', icon: <FileSpreadsheet className="w-5 h-5" /> }
                ]
            });
        }

        if (isAdmin || isCEO) {
            menu.push({
                title: 'Settings',
                icon: <Settings className="w-5 h-5" />,
                items: [
                    { title: 'Users & Permissions', url: 'Users', icon: <Shield className="w-5 h-5" /> },
                    { title: 'Department Heads', url: 'DepartmentHeadSettings', icon: <Users className="w-5 h-5" /> },
                    { title: 'Rules Settings', url: 'RulesSettings', icon: <Settings className="w-5 h-5" /> },
                    { title: 'Ramadan Schedules', url: 'RamadanSchedules', icon: <Calendar className="w-5 h-5" /> },
                    { title: 'Maintenance Mode', url: 'MaintenanceSettings', icon: <Settings className="w-5 h-5" /> },
                    { title: 'Documentation', url: 'Documentation', icon: <Book className="w-5 h-5" /> },
                    { title: 'Training Guide', url: 'Training', icon: <Book className="w-5 h-5" /> }
                ]
            });
        }

        return menu
            .map(item => {
                if (item.items) {
                    const filteredSubItems = item.items.filter(subItem => hasPageAccess(subItem.url));
                    return filteredSubItems.length > 0 ? { ...item, items: filteredSubItems } : null;
                }
                return hasPageAccess(item.url) ? item : null;
            })
            .filter(item => item !== null);
    }, [currentUser, permissions, isAdmin, isSupervisor, isCEO, isDepartmentHead, userRole, hasPageAccess]);

    useEffect(() => {
        console.log('App Timezone: UAE (Asia/Dubai)');
        console.log('Current UAE Time:', formatInUAE(new Date(), 'yyyy-MM-dd HH:mm:ss'));
    }, []);

    if (isChecking) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    if (!isDesktop) {
        return <DesktopOnlyScreen />;
    }

    if (isLoading || !currentUser) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    if (maintenanceMode && userRole !== 'admin' && currentPageName !== 'Maintenance') {
        window.location.href = '/Maintenance';
        return null;
    }

    if (!currentUser.company && (userRole === 'user' || userRole === 'department_head')) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-600 text-center">
                    No company is assigned. Wait for the administrator to assign a company.
                </div>
            </div>
        );
    }

    if (isDepartmentHead) {
        if (!currentUser.company) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                    <div className="text-slate-600 text-center">
                        No company is assigned. Wait for the administrator to assign a company.
                    </div>
                </div>
            );
        }
        
        if (!currentUser.department) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                    <div className="text-slate-600 text-center">
                        No department is assigned. Wait for the administrator to assign a department.
                    </div>
                </div>
            );
        }

        if (!currentUser.hrms_id) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                    <div className="text-slate-600 text-center">
                        Not linked to employee record. Wait for the administrator to link you to an employee.
                    </div>
                </div>
            );
        }
    }

    const toggleMenu = (title) => {
        setExpandedMenus(prev => ({
            ...prev,
            [title]: !prev[title]
        }));
    };

    const toggleSidebar = () => {
        const newState = !sidebarCollapsed;
        setSidebarCollapsed(newState);
        localStorage.setItem('sidebarCollapsed', newState.toString());
    };

    const handleMouseDown = (e) => {
        setIsResizing(true);
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newWidth = e.clientX;
            if (newWidth >= 200 && newWidth <= 400) {
                setSidebarWidth(newWidth);
                localStorage.setItem('sidebarWidth', newWidth.toString());
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-indigo-50/40 via-slate-50 to-purple-50/40">
            {/* Left Sidebar */}
            <aside 
                className="bg-white border-r border-slate-200 flex flex-col relative transition-all duration-300"
                style={{ width: sidebarCollapsed ? '64px' : `${sidebarWidth}px` }}
            >
                {/* Logo */}
                <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                    <Link to={createPageUrl('Dashboard')} className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center w-full' : ''}`}>
                        <BarChart3 className="w-8 h-8 text-indigo-600 flex-shrink-0" />
                        {!sidebarCollapsed && <span className="font-bold text-lg text-slate-900">ALM Attendance</span>}
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 overflow-y-auto">
                    {sidebarMenu.map((item, index) => (
                        <div key={index} className="mb-1">
                            {item.items ? (
                                <div>
                                    <button
                                        onClick={() => toggleMenu(item.title)}
                                        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors`}
                                        title={sidebarCollapsed ? item.title : ''}
                                    >
                                        <div className={`flex items-center ${sidebarCollapsed ? '' : 'gap-3'}`}>
                                            {item.icon}
                                            {!sidebarCollapsed && <span>{item.title}</span>}
                                        </div>
                                        {!sidebarCollapsed && <ChevronDown className={`w-4 h-4 transition-transform ${expandedMenus[item.title] ? 'rotate-180' : ''}`} />}
                                    </button>
                                    {!sidebarCollapsed && expandedMenus[item.title] && (
                                        <div className="ml-4 mt-1 space-y-1">
                                            {item.items.map((subItem, subIndex) => (
                                                <Link
                                                    key={subIndex}
                                                    to={createPageUrl(subItem.url)}
                                                    className={`flex items-center gap-3 px-4 py-2 text-sm rounded-lg transition-colors ${
                                                        currentPageName === subItem.url
                                                            ? 'bg-indigo-50 text-indigo-600 font-medium'
                                                            : 'text-slate-600 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    {subItem.icon}
                                                    <span>{subItem.title}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <Link
                                    to={createPageUrl(item.url)}
                                    className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                                        currentPageName === item.url
                                            ? 'bg-indigo-50 text-indigo-600'
                                            : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                    title={sidebarCollapsed ? item.title : ''}
                                >
                                    {item.icon}
                                    {!sidebarCollapsed && <span>{item.title}</span>}
                                </Link>
                            )}
                        </div>
                    ))}
                </nav>

                {/* User Section */}
                <div className="p-4 border-t border-slate-200">
                    {!sidebarCollapsed && currentUser?.company && (
                        <div className="mb-3">
                            <CompanyBadge company={currentUser.company} className="text-xs" />
                        </div>
                    )}
                    <div className={`flex items-center ${sidebarCollapsed ? 'flex-col gap-2' : 'justify-between'}`}>
                        {!sidebarCollapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">
                                    {currentUser.display_name || currentUser.full_name}
                                </p>
                                <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                            </div>
                        )}
                        <button
                            onClick={() => base44.auth.logout()}
                            className={`${sidebarCollapsed ? '' : 'ml-2'} p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors`}
                            title="Logout"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Resize Handle */}
                {!sidebarCollapsed && (
                    <div
                        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-400 transition-colors group"
                        onMouseDown={handleMouseDown}
                    >
                        <div className="absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 w-3 h-12 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-full h-full bg-indigo-500 rounded-full" />
                        </div>
                    </div>
                )}

                {/* Toggle Button */}
                <button
                    onClick={toggleSidebar}
                    className="absolute -right-3 top-20 bg-white border border-slate-200 rounded-full p-1.5 shadow-md hover:bg-slate-50 transition-colors z-10"
                    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform ${sidebarCollapsed ? '-rotate-90' : 'rotate-90'}`} />
                </button>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top Bar */}
                <header className="bg-white border-b border-slate-200 px-6 py-4">
                    <div className="flex justify-end">
                        <NotificationCenter />
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-auto p-6">
                    {children}
                </main>
            </div>

            <Toaster position="top-right" richColors />
        </div>
    );
}