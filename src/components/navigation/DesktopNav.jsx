import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronDown, BarChart3, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * DesktopNav Component
 * 
 * Renders horizontal navigation bar for desktop
 * - Direct links for Main category
 * - Hover dropdowns for other categories
 * - Active page highlighting
 */
export default function DesktopNav({ navStructure, currentPageName, canAccessPage, userRole }) {
    const [homeDropdownOpen, setHomeDropdownOpen] = useState(false);

    // Dashboards available to the user
    const dashboards = [];
    if (canAccessPage('Dashboard')) {
        dashboards.push({ name: 'Dashboard', title: 'Dashboard', icon: Home });
    }
    if (canAccessPage('DepartmentHeadDashboard')) {
        dashboards.push({ name: 'DepartmentHeadDashboard', title: 'Department Head Dashboard', icon: Home });
    }

    const isDashboardActive = currentPageName === 'Dashboard' || currentPageName === 'DepartmentHeadDashboard';

    return (
        <nav className="hidden lg:flex items-center gap-1 flex-1">
            {/* Logo */}
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3 mr-6">
                <BarChart3 className="w-8 h-8 text-[#0F1E36] flex-shrink-0" />
                <span className="font-bold text-lg text-[#0F1E36]">ALM Attendance</span>
            </Link>

            {/* Home/Dashboard Dropdown */}
            {dashboards.length > 1 ? (
                <div className="relative group" onMouseEnter={() => setHomeDropdownOpen(true)} onMouseLeave={() => setHomeDropdownOpen(false)}>
                    <button
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            isDashboardActive && 'bg-[#0F1E36] text-white',
                            !isDashboardActive && 'font-semibold text-[#1F2937] hover:bg-[#F1F4F8]'
                        )}
                    >
                        <Home className="w-4 h-4" />
                        Home
                        <ChevronDown className="w-3 h-3" />
                    </button>

                    <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg border border-[#E2E6EC] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                        <div className="py-2">
                            {dashboards.map((dashboard) => {
                                const isActive = currentPageName === dashboard.name;
                                return (
                                    <Link
                                        key={dashboard.name}
                                        to={createPageUrl(dashboard.name)}
                                        className={cn(
                                            'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                                            isActive && 'bg-[#EEF2FF] text-[#0F1E36] font-medium',
                                            !isActive && 'text-[#4B5563] hover:bg-[#F7F9FC]'
                                        )}
                                    >
                                        <dashboard.icon className="w-4 h-4" />
                                        {dashboard.title}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : dashboards.length === 1 ? (
                <Link
                    to={createPageUrl(dashboards[0].name)}
                    className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                        isDashboardActive && 'bg-[#0F1E36] text-white',
                        !isDashboardActive && 'font-semibold text-[#1F2937] hover:bg-[#F1F4F8]'
                    )}
                >
                    <Home className="w-4 h-4" />
                    Home
                </Link>
            ) : null}

            {/* Direct Links (Main category - excluding Home) */}
            {navStructure.main?.map((item) => {
                if (!canAccessPage(item.name)) return null;
                if (item.name === 'Home') return null; // Skip Home as it's handled above

                const isActive = currentPageName === item.name;

                return (
                    <Link
                        key={item.name}
                        to={createPageUrl(item.name)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            isActive && 'bg-[#0F1E36] text-white',
                            !isActive && 'text-[#4B5563] hover:bg-[#F1F4F8]'
                        )}
                    >
                        <item.icon className="w-4 h-4" />
                        {item.title}
                    </Link>
                );
            })}

            {/* Dropdown Menus */}
            {Object.entries(navStructure.dropdowns || {}).map(([key, dropdown]) => {
                const accessibleItems = dropdown.items.filter(item => canAccessPage(item.name));
                if (accessibleItems.length === 0) return null;

                const hasActivePage = accessibleItems.some(item => item.name === currentPageName);

                return (
                    <div key={key} className="relative group">
                        <button
                            className={cn(
                                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                hasActivePage && 'bg-[#0F1E36] text-white',
                                !hasActivePage && 'text-[#4B5563] hover:bg-[#F1F4F8]'
                            )}
                        >
                            <dropdown.icon className="w-4 h-4" />
                            {dropdown.label}
                            <ChevronDown className="w-3 h-3" />
                        </button>

                        {/* Dropdown Content */}
                        <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg border border-[#E2E6EC] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                            <div className="py-2">
                                {accessibleItems.map((item) => {
                                    const isActive = currentPageName === item.name;

                                    return (
                                        <Link
                                            key={item.name}
                                            to={createPageUrl(item.name)}
                                            className={cn(
                                                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                                                isActive && 'bg-[#EEF2FF] text-[#0F1E36] font-medium',
                                                !isActive && 'text-[#4B5563] hover:bg-[#F7F9FC]'
                                            )}
                                        >
                                            <item.icon className="w-4 h-4" />
                                            {item.title}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </nav>
    );
}