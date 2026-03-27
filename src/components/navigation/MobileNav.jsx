import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Menu, X } from 'lucide-react';
import AEDIcon from '../ui/AEDIcon';
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
                className="p-2 text-[#4B5563] hover:bg-[#F1F4F8] rounded-lg transition-colors"
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
                <div className="flex items-center justify-between p-4 border-b border-[#E2E6EC]">
                    <Link to={createPageUrl('Dashboard')} onClick={closeDrawer} className="flex items-center gap-3">
                        <AEDIcon className="w-6 h-6" />
                        <span className="font-bold text-lg text-[#0F1E36]">ALM Attendance</span>
                    </Link>
                    <button
                        onClick={closeDrawer}
                        className="p-1.5 text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F1F4F8] rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation Items */}
                <div className="overflow-y-auto h-[calc(100vh-180px)] p-4">
                    {/* Dashboards Section */}
                    {(canAccessPage('Dashboard') || canAccessPage('DepartmentHeadDashboard')) && (
                        <div className="mb-6">
                            <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#6B7280] uppercase">
                                Dashboards
                            </div>
                            {canAccessPage('Dashboard') && (
                                <Link
                                    to={createPageUrl('Dashboard')}
                                    onClick={closeDrawer}
                                    className={cn(
                                        'flex items-center gap-3 px-4 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors',
                                        currentPageName === 'Dashboard' && 'bg-[#EEF2FF] text-[#0F1E36]',
                                        currentPageName !== 'Dashboard' && 'text-[#4B5563] hover:bg-[#F7F9FC]'
                                    )}
                                >
                                    <AEDIcon className="w-5 h-5" />
                                    Dashboard
                                </Link>
                            )}
                            {canAccessPage('DepartmentHeadDashboard') && (
                                <Link
                                    to={createPageUrl('DepartmentHeadDashboard')}
                                    onClick={closeDrawer}
                                    className={cn(
                                        'flex items-center gap-3 px-4 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors',
                                        currentPageName === 'DepartmentHeadDashboard' && 'bg-[#EEF2FF] text-[#0F1E36]',
                                        currentPageName !== 'DepartmentHeadDashboard' && 'text-[#4B5563] hover:bg-[#F7F9FC]'
                                    )}
                                >
                                    <AEDIcon className="w-5 h-5" />
                                    Department Head Dashboard
                                </Link>
                            )}
                        </div>
                    )}

                    {/* Direct Links (Main - excluding Home) */}
                    {navStructure.main?.map((item) => {
                        if (!canAccessPage(item.name)) return null;
                        if (item.name === 'Home') return null; // Skip Home as dashboards are handled above

                        const isActive = currentPageName === item.name;

                        return (
                            <Link
                                key={item.name}
                                to={createPageUrl(item.name)}
                                onClick={closeDrawer}
                                className={cn(
                                    'flex items-center gap-3 px-4 py-2.5 mb-1 rounded-lg text-sm font-medium transition-colors',
                                    isActive && 'bg-[#EEF2FF] text-[#0F1E36]',
                                    !isActive && 'text-[#4B5563] hover:bg-[#F7F9FC]'
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
                                <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#6B7280] uppercase">
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
                        );
                    })}
                </div>

                {/* User Section */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#E2E6EC] bg-white">
                    {user?.company && (
                        <div className="mb-2 px-2 py-1 bg-[#EEF2FF] text-[#0F1E36] text-xs font-medium rounded border border-[#E2E6EC]">
                            {user.company}
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#1F2937] truncate">
                                {user?.display_name || user?.full_name}
                            </p>
                            <p className="text-xs text-[#6B7280] truncate">{user?.email}</p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onLogout}
                            className="text-[#6B7280] hover:text-[#1F2937]"
                        >
                            Logout
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}