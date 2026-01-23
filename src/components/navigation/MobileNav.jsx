import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Menu, X, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * MobileNav Component
 * 
 * Renders hamburger menu and drawer for mobile/tablet
 * - Overlay drawer from left
 * - Flat list with category headers
 * - Active page highlighting
 */
export default function MobileNav({ navStructure, currentPageName, canAccessPage, user, onLogout, userRole }) {
    const [isOpen, setIsOpen] = useState(false);

    const closeDrawer = () => setIsOpen(false);

    return (
        <div className="lg:hidden">
            {/* Hamburger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
                <Menu className="w-6 h-6" />
            </button>

            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40"
                    onClick={closeDrawer}
                />
            )}

            {/* Drawer */}
            <div
                className={cn(
                    'fixed top-0 left-0 h-full w-72 bg-white shadow-xl z-50 transform transition-transform duration-300',
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <Link to={createPageUrl('Dashboard')} onClick={closeDrawer} className="flex items-center gap-3">
                        <BarChart3 className="w-6 h-6 text-indigo-600" />
                        <span className="font-bold text-lg text-slate-900">ALM Attendance</span>
                    </Link>
                    <button
                        onClick={closeDrawer}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation Items */}
                <div className="overflow-y-auto h-[calc(100vh-180px)] p-4">
                    {/* Direct Links (Main) */}
                    {navStructure.main?.map((item) => {
                        if (!canAccessPage(item.name)) return null;

                        const isActive = currentPageName === item.name;

                        return (
                            <Link
                                key={item.name}
                                to={createPageUrl(item.name)}
                                onClick={closeDrawer}
                                className={cn(
                                    'flex items-center gap-3 px-4 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors',
                                    isActive && 'bg-indigo-50 text-indigo-600',
                                    !isActive && 'text-slate-700 hover:bg-slate-50'
                                )}
                            >
                                <item.icon className="w-5 h-5" />
                                {item.title}
                            </Link>
                        );
                    })}

                    {/* Dropdown Categories */}
                    {Object.entries(navStructure.dropdowns || {}).map(([key, dropdown]) => {
                        const accessibleItems = dropdown.items.filter(item => canAccessPage(item.name));
                        if (accessibleItems.length === 0) return null;

                        return (
                            <div key={key} className="mt-6">
                                {/* Category Header */}
                                <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-500 uppercase">
                                    <dropdown.icon className="w-4 h-4" />
                                    {dropdown.label}
                                </div>

                                {/* Category Items */}
                                {accessibleItems.map((item) => {
                                    const isActive = currentPageName === item.name;

                                    return (
                                        <Link
                                            key={item.name}
                                            to={createPageUrl(item.name)}
                                            onClick={closeDrawer}
                                            className={cn(
                                                'flex items-center gap-3 px-4 py-2.5 mb-1 rounded-lg text-sm transition-colors',
                                                isActive && 'bg-indigo-50 text-indigo-600 font-medium',
                                                !isActive && 'text-slate-600 hover:bg-slate-50'
                                            )}
                                        >
                                            <item.icon className="w-4 h-4" />
                                            {item.title}
                                        </Link>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

                {/* User Section */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 bg-white">
                    {user?.company && (
                        <div className="mb-2 px-2 py-1 bg-indigo-50 text-indigo-600 text-xs font-medium rounded">
                            {user.company}
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">
                                {user?.display_name || user?.full_name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onLogout}
                            className="text-slate-500 hover:text-slate-700"
                        >
                            Logout
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}