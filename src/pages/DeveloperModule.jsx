/**
 * DeveloperModule.jsx — Admin-Only Developer Tools Page
 *
 * PURPOSE:
 * This module provides developer/admin tools for inspecting and managing
 * production data, entities, functions, employees, system health, logs,
 * and change history. It is strictly restricted to admin-role users.
 *
 * ACCESS CONTROL:
 * - This page must NEVER appear in any navigation bar, sidebar, dropdown,
 *   or menu — not even for admin users. It is intentionally hidden from
 *   all navigation surfaces.
 * - It is accessed ONLY by typing the route directly in the browser URL bar.
 * - The page performs its own role check via usePermissions. If the current
 *   user is not an admin, they are shown an access-denied message.
 *
 * INTERNAL NAVIGATION:
 * - This page contains its own scoped internal navigation bar that exists
 *   exclusively within this page. It does NOT interact with or modify the
 *   app-wide DesktopNav, MobileNav, or Layout navigation in any way.
 * - The internal nav bar has exactly seven sections:
 *   Entity Explorer, Function Runner, Employee Inspector, System Health,
 *   Live Logs, Change History, and Change Management.
 */

import { useState } from 'react';
import { usePermissions } from '@/components/hooks/usePermissions';
import { usePageTitle } from '@/components/ui/PageTitle';
import { cn } from '@/lib/utils';
import {
    Database,
    Play,
    UserSearch,
    HeartPulse,
    ScrollText,
    History,
    GitCompareArrows,
    ShieldAlert
} from 'lucide-react';

/**
 * Internal navigation sections for the Developer Module.
 * This nav bar is scoped exclusively to this page and must never be
 * added to any app-wide navigation array, sidebar, or menu component.
 */
const SECTIONS = [
    { key: 'entity-explorer', label: 'Entity Explorer', icon: Database },
    { key: 'function-runner', label: 'Function Runner', icon: Play },
    { key: 'employee-inspector', label: 'Employee Inspector', icon: UserSearch },
    { key: 'system-health', label: 'System Health', icon: HeartPulse },
    { key: 'live-logs', label: 'Live Logs', icon: ScrollText },
    { key: 'change-history', label: 'Change History', icon: History },
    { key: 'change-management', label: 'Change Management', icon: GitCompareArrows },
];

/** Placeholder content for each section — will be replaced in future prompts. */
function SectionPlaceholder({ section }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-slate-300 rounded-xl bg-white">
            <section.icon className="w-12 h-12 text-slate-400 mb-4" />
            <h2 className="text-xl font-semibold text-slate-700 mb-2">
                {section.label}
            </h2>
            <p className="text-sm text-slate-500">
                Placeholder — implementation coming soon.
            </p>
        </div>
    );
}

export default function DeveloperModule() {
    usePageTitle('Developer Module');

    const { userRole, isLoading } = usePermissions();
    const [activeSection, setActiveSection] = useState('entity-explorer');

    const currentSection = SECTIONS.find(s => s.key === activeSection) || SECTIONS[0];

    // Admin-only gate
    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <p className="text-slate-500">Loading...</p>
            </div>
        );
    }

    if (userRole !== 'admin') {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
                <ShieldAlert className="w-16 h-16 text-red-500" />
                <h1 className="text-2xl font-bold text-slate-800">Access Denied</h1>
                <p className="text-slate-600">
                    This page is restricted to admin users only.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-0">
            {/*
              WARNING BANNER — Non-dismissable, always visible.
              This banner has no close button by design. It serves as a
              permanent reminder that actions in this module affect live
              production data.
            */}
            <div className="bg-red-600 text-white px-6 py-3 rounded-t-lg flex items-center gap-3 select-none">
                <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                <span className="font-semibold text-sm">
                    Developer Mode &mdash; All changes made here directly affect live production data.
                </span>
            </div>

            {/*
              INTERNAL NAVIGATION BAR
              This nav bar is scoped exclusively to the DeveloperModule page.
              It must NEVER be extracted into DesktopNav, MobileNav, or any
              shared navigation component. It controls which section is
              displayed within this page only.
            */}
            <nav className="bg-white border border-t-0 border-slate-200 px-4 py-2 flex flex-wrap gap-1 overflow-x-auto">
                {SECTIONS.map((section) => {
                    const isActive = activeSection === section.key;
                    return (
                        <button
                            key={section.key}
                            onClick={() => setActiveSection(section.key)}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                                isActive
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-600 hover:bg-slate-100'
                            )}
                        >
                            <section.icon className="w-4 h-4" />
                            {section.label}
                        </button>
                    );
                })}
            </nav>

            {/* SECTION CONTENT AREA */}
            <div className="mt-6">
                <SectionPlaceholder section={currentSection} />
            </div>
        </div>
    );
}
