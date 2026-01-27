import React, { useEffect } from 'react';
import { Toaster } from 'sonner';
import NotificationCenter from './components/ui/NotificationCenter';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatInUAE } from '@/components/ui/timezone';
import { useDeviceDetection } from './components/ui/useDeviceDetection';
import DesktopOnlyScreen from './components/ui/DesktopOnlyScreen';
import { usePermissions } from './components/hooks/usePermissions';
import DesktopNav from './components/navigation/DesktopNav';
import MobileNav from './components/navigation/MobileNav';
import { getPagesByCategory, NAV_CATEGORIES } from './components/config/pagesConfig';
import { LogOut } from 'lucide-react';


export default function Layout({ children, currentPageName }) {
    const { isDesktop, isChecking } = useDeviceDetection();
    const publicPages = ['Maintenance'];
    const isPublicPage = publicPages.includes(currentPageName);

    // Use permissions hook
    const { user: currentUser, isLoading, error, userRole, canAccessPage } = usePermissions();

    const isDepartmentHead = userRole === 'department_head';
    const isHRManager = userRole === 'hr_manager';

    // Redirect department heads and HR managers away from Dashboard
    if (currentUser && isDepartmentHead && currentPageName === 'Dashboard') {
        window.location.replace('/DepartmentHeadDashboard');
        return null;
    }
    if (currentUser && isHRManager && currentPageName === 'Dashboard') {
        window.location.replace('/HRManagerDashboard');
        return null;
    }

    // Fetch maintenance mode
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

    // Build navigation structure from config
    const navStructure = React.useMemo(() => {
        if (!currentUser) return { main: [], dropdowns: {} };

        const structure = {
            main: [],
            dropdowns: {}
        };

        // Get categories in order
        const sortedCategories = Object.entries(NAV_CATEGORIES)
            .sort(([, a], [, b]) => a.order - b.order);

        sortedCategories.forEach(([categoryKey, categoryMeta]) => {
            const pages = getPagesByCategory(categoryKey)
                .filter(page => page.showInNav)
                .filter(page => canAccessPage(page.name));

            if (pages.length === 0) return;

            if (categoryMeta.renderAs === 'direct') {
                // Add to main array (direct links)
                structure.main.push(...pages);
            } else {
                // Add to dropdowns
                structure.dropdowns[categoryKey] = {
                    label: categoryMeta.label,
                    icon: categoryMeta.icon,
                    items: pages
                };
            }
        });

        return structure;
    }, [currentUser, canAccessPage]);

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

    // Allow admins on any device, but restrict other users to desktop only
    const isAdminUser = userRole === 'admin';
    if (!isDesktop && !isAdminUser) {
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

    // Validation checks
    if (!currentUser.company && (userRole === 'user' || userRole === 'department_head' || userRole === 'hr_manager')) {
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

    const handleLogout = () => {
        base44.auth.logout();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50/40 via-slate-50 to-purple-50/40">
            {/* Top Navigation Bar */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="flex items-center justify-between px-6 py-3">
                    {/* Desktop Navigation */}
                    <DesktopNav 
                        navStructure={navStructure}
                        currentPageName={currentPageName}
                        canAccessPage={canAccessPage}
                        userRole={userRole}
                    />

                    {/* Mobile Navigation */}
                    <MobileNav
                        navStructure={navStructure}
                        currentPageName={currentPageName}
                        canAccessPage={canAccessPage}
                        user={currentUser}
                        onLogout={handleLogout}
                        userRole={userRole}
                    />

                    {/* Right Section */}
                    <div className="flex items-center gap-4">
                        <NotificationCenter />
                        
                        {/* Desktop User Menu */}
                        <div className="hidden lg:flex items-center gap-3">
                            {currentUser?.company && (
                                <div className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-md">
                                    {currentUser.company}
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="text-sm font-medium text-slate-900">
                                        {currentUser?.display_name || currentUser?.full_name}
                                    </p>
                                    <p className="text-xs text-slate-500">{currentUser?.email}</p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="Logout"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto p-6">
                {children}
            </main>

            <Toaster position="top-right" richColors />
        </div>
    );
}