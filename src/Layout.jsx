import React, { useEffect, useMemo, useCallback } from 'react';
import { Toaster } from 'sonner';
import NotificationCenter from './components/ui/NotificationCenter';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatInUAE } from '@/components/ui/timezone';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from './components/hooks/usePermissions';
import DesktopNav from './components/navigation/DesktopNav';
import MobileNav from './components/navigation/MobileNav';
import { getPagesByCategory, NAV_CATEGORIES } from './components/config/pagesConfig';
import { LogOut } from 'lucide-react';
import { CompanyFilterProvider } from './components/context/CompanyContext';

// Layout v5 - rebuild trigger
export default function Layout({ children, currentPageName }) {
    const navigate = useNavigate();
    const publicPages = ['Maintenance'];
    const isPublicPage = publicPages.includes(currentPageName);

    // Use permissions hook
    const { user: currentUser, isLoading, error, userRole, canAccessPage } = usePermissions();

    const isDepartmentHead = userRole === 'department_head';
    const isHRManager = userRole === 'hr_manager';
    const isCEO = userRole === 'ceo';

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

    // Fetch company branding settings
    const { data: companyBranding } = useQuery({
        queryKey: ['companyBranding', currentUser?.company],
        queryFn: async () => {
            if (!currentUser?.company) return null;
            try {
                const settings = await base44.entities.CompanySettings.filter({
                    company: currentUser.company
                });
                if (settings.length > 0) {
                    return settings[0];
                }
                return null;
            } catch {
                return null;
            }
        },
        enabled: !!currentUser?.company,
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
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

        console.log('Navigation Structure:', JSON.stringify(structure, null, 2));
        console.log('Current User Role:', userRole);
        return structure;
    }, [currentUser, canAccessPage]);

    useEffect(() => {
        console.log('App Timezone: UAE (Asia/Dubai)');
        console.log('Current UAE Time:', formatInUAE(new Date(), 'yyyy-MM-dd HH:mm:ss'));
    }, []);

    // Redirect to appropriate default dashboard on first load
    useEffect(() => {
        if (currentUser && currentPageName === 'Dashboard') {
            if (isDepartmentHead) {
                navigate('/DepartmentHeadDashboard', { replace: true });
            } else if (isHRManager) {
                navigate('/HRManagerDashboard', { replace: true });
            }
            // CEO stays on Dashboard (admin-like access)
        }
    }, [currentUser, isDepartmentHead, isHRManager, currentPageName, navigate]);

    // If auth failed (not logged in), redirect to login
    if (error && !isLoading) {
        base44.auth.redirectToLogin();
        return (
            <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
                <div className="text-[#6B7280]">Redirecting to login...</div>
            </div>
        );
    }

    if (isLoading || !currentUser) {
        return (
            <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
                    <div className="text-[#6B7280]">Loading...</div>
                </div>
        );
    }

    if (maintenanceMode && userRole !== 'admin' && currentPageName !== 'Maintenance') {
        navigate('/Maintenance', { replace: true });
        return null;
    }

    // Validation checks
    if (!currentUser.company && (userRole === 'user' || userRole === 'department_head' || userRole === 'hr_manager' || userRole === 'ceo')) {
        return (
            <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
                      <div className="text-[#4B5563] text-center">
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
                <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
                              <div className="text-[#4B5563] text-center">
                                  No department is assigned. Wait for the administrator to assign a department.
                              </div>
                          </div>
            );
        }

        if (!currentUser.hrms_id) {
            return (
                <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
                              <div className="text-[#4B5563] text-center">
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
        <CompanyFilterProvider>
        <div className="min-h-screen bg-[#F4F6F9]">
            {/* Dynamic Company Branding Styles */}
            {companyBranding && (
                <style>{`
                    :root {
                        ${companyBranding.primary_color ? `--primary: ${companyBranding.primary_color};` : ''}
                        ${companyBranding.secondary_color ? `--secondary: ${companyBranding.secondary_color};` : ''}
                        ${companyBranding.font_family ? `--font-family: ${companyBranding.font_family};` : ''}
                    }
                    ${companyBranding.font_family ? `body { font-family: ${companyBranding.font_family}; }` : ''}
                `}</style>
            )}
            
            {/* Top Navigation Bar */}
            <header className="bg-white border-b border-[#E2E6EC] sticky top-0 z-30" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center justify-between px-6 py-3">
                    {/* Desktop Navigation */}
                    <DesktopNav 
                        navStructure={navStructure}
                        currentPageName={currentPageName}
                        canAccessPage={canAccessPage}
                        userRole={userRole}
                        companyLogo={companyBranding?.logo_url}
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
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                      <p className="text-sm font-medium text-[#1F2937]">
                                          {currentUser?.display_name || currentUser?.full_name}
                                      </p>
                                  </div>
                                <button
                                      onClick={handleLogout}
                                      className="p-2 text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F1F4F8] rounded-lg transition-colors"
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

            {/* Switch Company Button - Bottom Right for privileged roles */}
            {(userRole === 'admin' || userRole === 'ceo' || userRole === 'supervisor' || userRole === 'hr_manager') && (
                <button
                    onClick={() => navigate('/CompanySelection')}
                    className="fixed bottom-4 right-4 z-20 w-10 h-10 bg-white border border-slate-300 text-slate-600 rounded-full shadow-md hover:shadow-lg hover:bg-slate-50 transition-all duration-200 flex items-center justify-center group"
                    title="Switch Company"
                >
                    <svg 
                        className="w-4 h-4 group-hover:scale-110 transition-transform" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                </button>
            )}

            <Toaster position="top-right" richColors />
        </div>
        </CompanyFilterProvider>
    );
}