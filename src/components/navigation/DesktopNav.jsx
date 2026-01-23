import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ChevronDown, BarChart3 } from 'lucide-react';
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
    return (
        <nav className="hidden lg:flex items-center gap-1 flex-1">
            {/* Logo */}
            <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3 mr-6">
                <BarChart3 className="w-8 h-8 text-indigo-600 flex-shrink-0" />
                <span className="font-bold text-lg text-slate-900">ALM Attendance</span>
            </Link>

            {/* Direct Links (Main category) */}
            {navStructure.main?.map((item) => {
                if (!canAccessPage(item.name)) return null;

                // Smart routing for Home based on user role
                let targetPage = item.name;
                if (item.smartRoute && item.name === 'Home') {
                    if (userRole === 'department_head') {
                        targetPage = 'DepartmentHeadDashboard';
                    } else if (userRole === 'hr_manager') {
                        targetPage = 'HRManagerDashboard';
                    } else {
                        targetPage = 'Dashboard';
                    }
                }

                const isActive = currentPageName === item.name || 
                                (item.name === 'Home' && (currentPageName === 'Dashboard' || currentPageName === 'DepartmentHeadDashboard'));
                const isHome = item.name === 'Home';

                return (
                    <Link
                        key={item.name}
                        to={createPageUrl(targetPage)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            isActive && 'bg-slate-800 text-white',
                            !isActive && isHome && 'font-semibold text-slate-900 hover:bg-slate-100',
                            !isActive && !isHome && 'text-slate-600 hover:bg-slate-100'
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
                                hasActivePage && 'bg-slate-800 text-white',
                                !hasActivePage && 'text-slate-600 hover:bg-slate-100'
                            )}
                        >
                            <dropdown.icon className="w-4 h-4" />
                            {dropdown.label}
                            <ChevronDown className="w-3 h-3" />
                        </button>

                        {/* Dropdown Content */}
                        <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                            <div className="py-2">
                                {accessibleItems.map((item) => {
                                    const isActive = currentPageName === item.name;

                                    return (
                                        <Link
                                            key={item.name}
                                            to={createPageUrl(item.name)}
                                            className={cn(
                                                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                                                isActive && 'bg-indigo-50 text-indigo-600 font-medium',
                                                !isActive && 'text-slate-700 hover:bg-slate-50'
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