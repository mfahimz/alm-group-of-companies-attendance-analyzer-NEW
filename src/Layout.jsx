import React, { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import NotificationCenter from './components/ui/NotificationCenter';
import GlobalSearch from './components/ui/GlobalSearch';
import { useKeyboardShortcuts } from './components/ui/KeyboardShortcuts';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Navbar1 } from '@/components/ui/Navbar1';
import { formatInUAE } from '@/components/ui/timezone';
import { CompanyBadge } from '@/components/ui/CompanyBadge';
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
            Lock,
            Briefcase,
            Clock
        } from 'lucide-react';


export default function Layout({ children, currentPageName }) {
    // Public pages that don't require authentication
    const publicPages = ['DeptHeadApproval'];
    const isPublicPage = publicPages.includes(currentPageName);

    // ALL hooks must be called unconditionally at the top
    const [searchOpen, setSearchOpen] = useState(false);

    useKeyboardShortcuts({ onOpenSearch: () => setSearchOpen(true) });

    const { data: currentUser, isLoading, error } = useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => {
            try {
                const user = await base44.auth.me();
                // Log user activity
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
                } catch (e) {
                    // Silent fail for activity log
                }
                return user;
            } catch (err) {
                console.error('Auth error:', err);
                throw err;
            }
        },
        enabled: !isPublicPage,
        retry: false,
        staleTime: 15 * 60 * 1000, // Cache for 15 minutes
        gcTime: 20 * 60 * 1000, // Keep in cache for 20 minutes
        refetchOnWindowFocus: false, // Don't refetch on window focus
        refetchOnReconnect: false, // Don't refetch on reconnect
        refetchOnMount: false // Don't refetch on component mount
    });

    // Redirect to login if not authenticated on protected pages
    React.useEffect(() => {
        if (!isPublicPage && !isLoading && error) {
            console.log('Redirecting to login due to error:', error);
            base44.auth.redirectToLogin(window.location.pathname);
        }
    }, [isPublicPage, isLoading, error]);

    const { data: permissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: async () => {
            try {
                return await base44.entities.PagePermission.list();
            } catch (err) {
                console.error('Permissions fetch error:', err);
                return []; // Return empty array on error instead of failing
            }
        },
        enabled: !!currentUser && !isPublicPage,
        staleTime: 30 * 60 * 1000, // Cache for 30 minutes (permissions rarely change)
        gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 1 // Only retry once on failure
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
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 1
    });

    // Calculate user role BEFORE any conditional returns
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isCEO = userRole === 'ceo';
    const isDepartmentHead = userRole === 'department_head';
    const canAccessAllCompanies = isAdmin || isSupervisor || isCEO;

    const hasPageAccess = React.useCallback((pageName) => {
      if (!currentUser) return false;
      const permission = permissions.find((p) => p.page_name === pageName);
      if (!permission) return true;
      const allowedRoles = permission.allowed_roles.split(',').map((r) => r.trim());
      return allowedRoles.includes(userRole);
    }, [currentUser, permissions, userRole]);

    // Build navbar menu - MUST be before conditional returns
    const navbarMenu = React.useMemo(() => {
        if (!currentUser) return [];

        // Department Head gets only their dashboard
        if (isDepartmentHead) {
            return [
                { title: 'Dashboard', url: 'DepartmentHeadDashboard' }
            ];
        }

        const menu = [
            { title: 'Dashboard', url: 'Dashboard' },
            {
                title: 'Projects',
                url: 'Projects',
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
                url: 'Recruitment',
                items: [
                    { title: 'Recruitment Hub', url: 'Recruitment', icon: <Users className="w-5 h-5" /> },
                    { title: 'Job Positions', url: 'JobPositions', icon: <Briefcase className="w-5 h-5" /> },
                    { title: 'Candidate Screening', url: 'CandidateScreening', icon: <FileSpreadsheet className="w-5 h-5" /> }
                ]
            });
            }

            if (isAdmin) {
            menu.push({
                title: 'Data',
                url: '#',
                items: [
                    { title: 'Private Files', url: 'PrivateFiles', icon: <Lock className="w-5 h-5" /> }
                ]
            });
            }

        if (isAdmin || isCEO) {
            menu.push({
                title: 'Settings',
                url: '#',
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

        return menu.filter(item => {
            if (item.items) {
                return item.items.some(subItem => hasPageAccess(subItem.url));
            }
            return hasPageAccess(item.url);
        });
    }, [currentUser, permissions, isAdmin, isSupervisor, isCEO, isDepartmentHead, userRole, hasPageAccess]);

    // Set UAE timezone for the entire app
    useEffect(() => {
        // Log timezone info for debugging
        console.log('App Timezone: UAE (Asia/Dubai)');
        console.log('Current UAE Time:', formatInUAE(new Date(), 'yyyy-MM-dd HH:mm:ss'));
    }, []);

    // AFTER all hooks, handle conditional rendering
    // For public pages, render without layout
    if (isPublicPage) {
      return (
          <>
              {children}
              <Toaster position="top-right" richColors />
          </>
      );
    }

    // For protected pages, show loading while checking auth
    if (isLoading) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center">
              <div className="text-slate-500">Loading...</div>
          </div>
      );
    }

    // If not loading but no user (error state), show loading while redirect happens
    if (!currentUser) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center">
              <div className="text-slate-500">Redirecting to login...</div>
          </div>
      );
    }

    // Check maintenance mode (skip for admin users)
    if (maintenanceMode && userRole !== 'admin' && currentPageName !== 'Maintenance') {
        window.location.href = '/Maintenance';
        return null;
    }

    // Redirect department heads to their dashboard
    if (isDepartmentHead && currentPageName !== 'DepartmentHeadDashboard') {
        window.location.href = '/DepartmentHeadDashboard';
        return null;
    }

    // Check if user has a company assigned (not required for admin/supervisor/ceo)
    if (!currentUser.company && (userRole === 'user' || userRole === 'department_head')) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-600 text-center">
                    No company is assigned. Wait for the administrator to assign a company.
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50/40 via-slate-50 to-purple-50/40">
            {/* Top Navbar */}
            <Navbar1
                logo={{
                    url: 'Dashboard',
                    icon: BarChart3,
                    title: 'ALM Attendance'
                }}
                menu={navbarMenu}
                    auth={{
                        user: currentUser ? {
                            name: currentUser.display_name || currentUser.full_name,
                            email: currentUser.email
                        } : null,
                        logout: {
                            text: 'Logout',
                            onClick: () => base44.auth.logout()
                        }
                    }}
            />

            {/* Main Content */}
            <main className="container mx-auto px-4 py-6">
                <div className="flex justify-between items-center mb-4">
                    {currentUser?.company && (
                        <CompanyBadge company={currentUser.company} className="text-sm" />
                    )}
                    <div className="ml-auto">
                        <NotificationCenter />
                    </div>
                </div>
                {children}
            </main>

            {/* Toast Notifications */}
            <Toaster position="top-right" richColors />

            {/* Global Search */}
            <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

            {/* Keyboard Shortcut Hint */}
            <div className="fixed bottom-4 right-4 bg-slate-900 text-white px-3 py-2 rounded-lg shadow-lg text-xs opacity-0 hover:opacity-100 transition-opacity">
                Press <kbd className="px-1 py-0.5 bg-slate-700 rounded">⌘K</kbd> to search
            </div>
        </div>
    );

}