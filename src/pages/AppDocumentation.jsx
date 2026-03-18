import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

/**
 * SECTIONS - List of documentation sections
 */
const SECTIONS = [
    "System Overview",
    "User Roles and Permissions",
    "Employee Management",
    "Project and Attendance Management",
    "Attendance Analysis Engine",
    "Exceptions System",
    "Payroll and Salary",
    "Ramadan Module",
    "HR Features",
    "Resume Scanner",
    "Developer and Admin Tools",
    "Business Rules Reference"
];

/**
 * AppDocumentation Component
 * 
 * Provides a structured documentation interface with a fixed left sidebar 
 * and a scrollable main content area.
 */
export default function AppDocumentation() {
    const [activeSection, setActiveSection] = useState(SECTIONS[0]);

    return (
        <div className="flex flex-col h-screen bg-[#F4F6F9]">
            {/* Page Header - Fixed at the top */}
            <div className="bg-white border-b border-[#E2E6EC] px-6 py-4 flex-shrink-0 z-10">
                <div className="max-w-[1600px] mx-auto flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#EEF2FF] rounded-lg flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-[#0F1E36]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-[#1F2937]">Software Application Documentation</h1>
                        <p className="text-xs text-[#6B7280]">Comprehensive guide to the system modules and architecture</p>
                    </div>
                </div>
            </div>

            {/* Main Layout Body - Flex container for sidebar and content */}
            <div className="flex flex-1 overflow-hidden w-full mx-auto">
                {/* Sidebar Navigation - Fixed width, independently scrollable */}
                <aside className="w-72 bg-white border-r border-[#E2E6EC] flex-shrink-0 overflow-y-auto">
                    <nav className="p-4 space-y-1">
                        {SECTIONS.map((section) => (
                            <button
                                key={section}
                                id={`nav-doc-${section.toLowerCase().replace(/\s+/g, '-')}`}
                                onClick={() => setActiveSection(section)}
                                className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 border ${
                                    activeSection === section
                                        ? 'bg-[#0F1E36] text-white border-[#0F1E36] shadow-md shadow-slate-200'
                                        : 'text-[#6B7280] border-transparent hover:bg-[#F9FAFB] hover:text-[#1F2937] hover:border-[#E2E6EC]'
                                }`}
                            >
                                {section}
                            </button>
                        ))}
                    </nav>
                </aside>

                {/* Main Content Area - Scrollable independently */}
                <main className="flex-1 overflow-y-auto bg-[#F4F6F9] p-8">
                    <div className="bg-white rounded-xl border border-[#E2E6EC] shadow-sm p-8 min-h-full">
                        <header className="mb-8 pb-4 border-b border-[#F1F5F9]">
                            <h2 className="text-2xl font-bold text-[#1F2937]">
                                {activeSection}
                            </h2>
                            <p className="text-sm text-[#6B7280] mt-1 italic">
                                Last updated: March 2026
                            </p>
                        </header>
                        
                        {/* Content Placeholder */}
                        <div className="flex flex-col items-center justify-center py-24 text-center">
                            <div className="w-20 h-20 bg-[#F8FAFC] rounded-2xl flex items-center justify-center mb-6 border border-[#F1F5F9]">
                                <BookOpen className="w-10 h-10 text-[#CBD5E1]" />
                            </div>
                            <h3 className="text-xl font-bold text-[#1F2937] mb-3">
                                Documentation coming soon for this section
                            </h3>
                            <p className="text-[#6B7280] max-w-md leading-relaxed">
                                Detailed technical and functional documentation for the <span className="font-semibold text-[#0F1E36] italic">"{activeSection}"</span> module is currently under development. Please check back later for high-resolution diagrams and feature walkthroughs.
                            </p>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
