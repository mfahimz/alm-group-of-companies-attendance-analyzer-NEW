import React, { useState } from 'react';
import { BookOpen, Users, DollarSign, Clock, ShieldCheck, Briefcase, Zap, AlertCircle, Edit, Moon, Settings, RotateCcw, Calendar, Play, Info, ListChecks, Milestone, UserCheck, History, Hash, ScanLine, LayoutDashboard, UserPlus, FolderSearch, Table, FileJson, Workflow, Shield, Paintbrush, CheckSquare, Code, Key, FileText, Terminal, Scale, Coins, Activity, HandCoins } from 'lucide-react';

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
                        
                        {/* Conditional rendering based on which section is active */}
                        {activeSection === "System Overview" ? (
                            /* 
                               SYSTEM OVERVIEW SECTION
                               Information about the application's purpose, the companies it serves, 
                               the core workflow, technology stack, and deployment environment.
                            */
                            <div className="space-y-10 animate-in fade-in duration-500">
                                {/* Section 1: Introduction and Business Case */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Overview
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        The Attendance Analyzer is a comprehensive workforce management solution built specifically for <strong>Al Maraghi Auto Group</strong> in Abu Dhabi, UAE. This sophisticated platform is designed to solve the critical business problem of manual, error-prone attendance tracking and payroll calculation across the group's diverse portfolio of companies. By centralizing data and automating complex analysis, it ensures high precision in labor management and financial reporting.
                                    </p>
                                </section>

                                {/* Section 2: Key Companies */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Core Entities
                                    </h3>
                                    <p className="text-[#4A5568] mb-4">
                                        The system currently provides specialized services for the two major companies within the group:
                                    </p>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="p-5 rounded-xl border border-slate-100 bg-slate-50">
                                            <h4 className="font-bold text-indigo-700 mb-2">Al Maraghi Motors</h4>
                                            <p className="text-sm text-[#64748B]">
                                                The group's premium automotive sales and service entity. This company utilizes the system's most advanced payroll features, including custom salary calculation divisors and detailed overtime analytics.
                                            </p>
                                        </div>
                                        <div className="p-5 rounded-xl border border-slate-100 bg-slate-50">
                                            <h4 className="font-bold text-indigo-700 mb-2">Al Maraghi Auto Repairs</h4>
                                            <p className="text-sm text-[#64748B]">
                                                The specialized maintenance and technical repair division of the group. It leverages the platform for streamlined attendance-to-payroll workflows and department-level attendance auditing.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 3: Core Application Workflow */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Platform Workflow
                                    </h3>
                                    <div className="relative border-l-2 border-indigo-100 ml-3 pl-8 space-y-8">
                                        <div className="relative">
                                            <div className="absolute -left-11 top-0 w-6 h-6 bg-indigo-600 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-[10px] text-white">1</div>
                                            <h4 className="font-bold text-slate-800">Company Setup</h4>
                                            <p className="text-sm text-[#64748B]">Establish corporate identity, department hierarchies, and core branding settings.</p>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute -left-11 top-0 w-6 h-6 bg-indigo-500 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-[10px] text-white">2</div>
                                            <h4 className="font-bold text-slate-800">Project Creation</h4>
                                            <p className="text-sm text-[#64748B]">Initiate time-bound attendance cycles (e.g., monthly) for specific companies or departments.</p>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute -left-11 top-0 w-6 h-6 bg-indigo-400 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-[10px] text-white">3</div>
                                            <h4 className="font-bold text-slate-800">Attendance Tracking</h4>
                                            <p className="text-sm text-[#64748B]">Upload raw punch data (CSV/Excel) and define employee shift patterns for the period.</p>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute -left-11 top-0 w-6 h-6 bg-indigo-300 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-[10px] text-white">4</div>
                                            <h4 className="font-bold text-slate-800">Analysis Engine</h4>
                                            <p className="text-sm text-[#64748B]">Execute automated matching between employee punches and assigned shifts to determine status.</p>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute -left-11 top-0 w-6 h-6 bg-indigo-200 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-[10px] text-white">5</div>
                                            <h4 className="font-bold text-slate-800">Reporting & Review</h4>
                                            <p className="text-sm text-[#64748B]">Review analyzed reports, manage exceptions, and finalize the attendance results for the month.</p>
                                        </div>
                                        <div className="relative">
                                            <div className="absolute -left-11 top-0 w-6 h-6 bg-indigo-100 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-[10px] text-white text-indigo-700">6</div>
                                            <h4 className="font-bold text-slate-800">Payroll Generation</h4>
                                            <p className="text-sm text-[#64748B]">Automatically calculate final salaries, including overtime and leave deductions based on verified data.</p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 4: Technology Stack */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Tech Stack
                                    </h3>
                                    <div className="flex flex-wrap gap-3">
                                        <span className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-sm font-semibold">React Frontend</span>
                                        <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg text-sm font-semibold">Deno Runtime</span>
                                        <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-sm font-semibold">Base44 Platform</span>
                                        <span className="px-3 py-1.5 bg-slate-50 text-slate-700 border border-slate-100 rounded-lg text-sm font-semibold">TailwindCSS Styling</span>
                                    </div>
                                </section>

                                {/* Section 5: Deployment Environment */}
                                <section className="p-6 rounded-2xl bg-indigo-900 text-white space-y-3">
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        Deployment Environment
                                    </h3>
                                    <p className="text-indigo-100 text-sm leading-relaxed">
                                        The application is securely hosted on the <strong>Base44 production environment</strong>. Deployment is managed via a modern CI/CD pipeline where updates are staged and validated before going live. All changes follow a strict version control process ensuring that the core group operations remain uninterrupted and stable during production releases.
                                    </p>
                                </section>
                            </div>
                        ) : activeSection === "User Roles and Permissions" ? (
                            /* 
                                USER ROLES AND PERMISSIONS SECTION
                                Documentation of the system's RBAC (Role-Based Access Control) system,
                                role definitions, hierarchical differences, and custom page permissions.
                            */
                            <div className="space-y-10 animate-in fade-in duration-500">
                                {/* Section 1: System Roles */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        User Roles Overview
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        The system utilizes a granular Role-Based Access Control (RBAC) model to ensure data security and operational integrity. Each user is assigned a primary role that determines their default visibility and action capabilities.
                                    </p>
                                    <div className="grid gap-4">
                                        <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-4">
                                            <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-[10px] font-bold uppercase mt-1">Admin</div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 text-sm">System Administrator</h4>
                                                <p className="text-xs text-[#64748B] mt-1 line-clamp-2">Complete system access including user management, audit logs, developer tools, and global settings configuration.</p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-4">
                                            <div className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold uppercase mt-1">CEO</div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 text-sm">Chief Executive Officer</h4>
                                                <p className="text-xs text-[#64748B] mt-1 line-clamp-2">Full visibility into group-wide attendance and leadership dashboards. Can manage direct executive subordinates and view high-level analytics.</p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-4">
                                            <div className="px-2 py-1 bg-teal-100 text-teal-700 rounded text-[10px] font-bold uppercase mt-1">HR Manager</div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 text-sm">Human Resources Manager</h4>
                                                <p className="text-xs text-[#64748B] mt-1 line-clamp-2">Manages employee master data, salaries, leave calendars, and Ramadan schedules across all companies in the group.</p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-4">
                                            <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase mt-1">Supervisor</div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 text-sm">Operations Supervisor</h4>
                                                <p className="text-xs text-[#64748B] mt-1 line-clamp-2">Responsible for project-level attendance tracking and analysis. Manages punches and shifts for assigned companies.</p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-4">
                                            <div className="px-2 py-1 bg-green-100 text-green-700 rounded text-[10px] font-bold uppercase mt-1">Dept Head</div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 text-sm">Department Head</h4>
                                                <p className="text-xs text-[#64748B] mt-1 line-clamp-2">Restricted to their specific department. Manages subordinate attendance pre-approvals and verifies team reports.</p>
                                            </div>
                                        </div>
                                        <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-start gap-4">
                                            <div className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-[10px] font-bold uppercase mt-1">User</div>
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 text-sm">Standard User</h4>
                                                <p className="text-xs text-[#64748B] mt-1 line-clamp-2">Basic read-only or limited-entry access to attendance projects and employee records as permitted by the administrator.</p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 2: Core Role Comparisons */}
                                <section className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-[#0F1E36]">Admin vs. CEO</h3>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            While both roles hold high authority, <strong>Admin</strong> is the technical "root" role, possessing exclusive access to system-wide <strong>Audit Logs</strong> and the <strong>Developer Portal</strong>. The <strong>CEO</strong> role is focused on business leadership, having all functional permissions like Admin but with a default page configuration that hides technical maintenance tools to prioritize management dashboards.
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-[#0F1E36]">HR Manager vs. Supervisor</h3>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            The <strong>HR Manager</strong> has global visibility across all companies for employee data and financial metrics (Salaries/Increments). Conversely, a <strong>Supervisor</strong> is typically restricted to the specific company they are assigned to, focusing on the operational logistics of attendance projects and AI-driven payroll insights rather than broad HR policy management.
                                        </p>
                                    </div>
                                </section>

                                {/* Section 3: Department Head Architecture */}
                                <section className="p-6 rounded-2xl bg-[#0F1E36] text-white space-y-4">
                                    <h3 className="text-xl font-bold flex items-center gap-2">
                                        The Department Head Ecosystem
                                    </h3>
                                    <p className="text-slate-300 text-sm leading-relaxed">
                                        The <strong>Department Head</strong> role is uniquely linked to the physical workforce. A user is designated as a head by being linked to an <strong>Employee Profile</strong> (for regular heads) or a <strong>User Email</strong> (for the Executive/CEO head role).
                                    </p>
                                    <div className="grid sm:grid-cols-2 gap-6 mt-4">
                                        <div className="space-y-2">
                                            <h4 className="text-indigo-300 font-bold text-sm">Subordinate Management</h4>
                                            <p className="text-xs text-slate-400">Heads manage a dynamically defined list of <strong>Managed Employees</strong>, now including all subordinates in their recursive reporting chain with an organized department-wise selection view. Access is strictly enforced: a head can only see and approve data for their subordinates and cannot self-approve their own records (excluding AGMs).</p>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-indigo-300 font-bold text-sm">Assistant General Manager (AGM)</h4>
                                            <p className="text-xs text-slate-400">The <strong>Assistant General Manager</strong> (extended_role: <code>assistant_gm</code>) is a specialized role limited to one per company. AGMs are uniquely permitted to self-approve minutes without balance caps, which are saved as unified pre-approval records.</p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 4: Advanced Permission Customization */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Dynamic Page Permissions
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        Access control is not hard-coded. The system utilizes a <strong>Page Permission Engine</strong> that allows administrators to modify access on a per-page, per-role basis.
                                    </p>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                                        <h4 className="font-bold text-slate-800 text-sm">Customizability</h4>
                                        <p className="text-xs text-[#64748B]">
                                            Within the <strong>Users & Permissions</strong> module, Admins can toggle access for any page in the system. While pages have "Default Roles" (defined in code), these are overridden by records in the <code>PagePermission</code> entity, allowing the system to adapt as company hierarchy evolves.
                                        </p>
                                        <hr className="border-slate-200" />
                                        <h4 className="font-bold text-slate-800 text-sm">CEO & HR Manager Additive Access</h4>
                                        <p className="text-xs text-[#64748B]">
                                            CEO and HR Manager roles can optionally be linked to a <strong>Department Head</strong> record. This provides <strong>additive access</strong>: they retain their high-level management tools while gaining the specialized <strong>Department Head Dashboard</strong> for managing their own direct reports and approval requests.
                                        </p>
                                    </div>
                                </section>
                            </div>
                        ) : activeSection === "Employee Management" ? (
                            /* 
                                EMPLOYEE MANAGEMENT SECTION
                                Documentation for employee profiles, salary structures, grace minutes,
                                half-yearly allowances, and the employee lifecycle processes.
                            */
                            <div className="space-y-10 animate-in fade-in duration-500">
                                {/* Section 1: Employee Profiles */}
                                <section className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-100 rounded-lg">
                                            <Users className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <h3 className="text-xl font-bold text-[#0F1E36]">Employee Master Database</h3>
                                    </div>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        The system maintains a centralized pool of employee records. Data is strictly scoped by company, ensuring that HR users only see staff belonging to their specific business entity (e.g., Al Maraghi Motors vs. Auto Repairs).
                                    </p>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                            <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                Identification Fields
                                            </h4>
                                            <ul className="space-y-2 text-xs text-[#64748B]">
                                                <li><span className="font-bold text-slate-700">HRMS ID:</span> Auto-generated unique identifier for internal tracking.</li>
                                                <li><span className="font-bold text-slate-700">Attendance ID:</span> Critical ID used to link biometric machine logs to the employee.</li>
                                                <li><span className="font-bold text-slate-700">Company Scoping:</span> Employees are bound to one company to prevent data mixing.</li>
                                                <li><span className="font-bold text-slate-700">Hierarchical Depts:</span> Supports nested structures (e.g., "Operations - Warehouse").</li>
                                            </ul>
                                        </div>
                                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                                            <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                Operational Toggles
                                            </h4>
                                            <ul className="space-y-2 text-xs text-[#64748B]">
                                                <li><span className="font-bold text-slate-700">Weekly Off:</span> Configurable rest day (defaults to Sunday).</li>
                                                <li><span className="font-bold text-slate-700">Tracking Toggle:</span> Controls if biometric data is processed for this individual.</li>
                                                <li><span className="font-bold text-slate-700">Assumed Present:</span> Used for roles not requiring punches (e.g., field staff).</li>
                                                <li><span className="font-bold text-slate-700">Salary-Only Mode:</span> Excludes employee from attendance-based deductions.</li>
                                            </ul>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 2: Salary & Increments */}
                                <section className="space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-100 rounded-lg">
                                            <DollarSign className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <h3 className="text-xl font-bold text-[#0F1E36]">Compensation & Permanent Increments</h3>
                                    </div>
                                    <div className="grid md:grid-cols-3 gap-6">
                                        <div className="col-span-2 space-y-4">
                                            <p className="text-sm text-[#4A5568] leading-relaxed">
                                                The system tracks full salary breakdowns including <strong>Basic</strong>, <strong>Allowances</strong>, and <strong>Bonus</strong>. A specialized calculation determines the <em>Deduction per Minute</em> by dividing total salary by 54,000 minutes (30 days × 9 hours).
                                            </p>
                                            <div className="p-4 bg-slate-900 rounded-xl text-indigo-300 font-mono text-xs">
                                                Rate = (Basic + Allowances + Bonus) / 54,000
                                            </div>
                                        </div>
                                        <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                                            <h4 className="font-bold text-emerald-800 text-sm mb-2">WPS Capitalization</h4>
                                            <p className="text-[11px] text-emerald-700 leading-relaxed">
                                                For AMM compliance, the system supports a <strong>WPS Cap</strong> (e.g., 4,800 AED) which overrides internal totals for official regulatory reporting while maintaining actual numbers for inner accounting.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                                        <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                            <ShieldCheck className="w-4 h-4 text-indigo-500" />
                                            Salary Increment History
                                        </h4>
                                        <p className="text-xs text-[#64748B]">
                                            Permanent changes to salary are logged with an <strong>Effective Month</strong>. This ensures historical accuracy: if an employee gets a raise in March, a re-calculation of February's overtime will still correctly use the lower February salary. Increment records are <strong>Locked</strong> once they have been utilized in a finalized payroll report.
                                        </p>
                                    </div>
                                </section>

                                {/* Section 3: Specialized Minute Pools */}
                                <section className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-100 rounded-lg">
                                                <Zap className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <h3 className="text-lg font-bold text-[#0F1E36]">Carried Grace Minutes</h3>
                                        </div>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            Unused grace minutes from closed attendance projects can be "carried forward" to future periods. The <strong>Grace Minutes Management</strong> module provides a bidirectional sync—manually adjusting a balance there updates the employee profile instantly.
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-amber-100 rounded-lg">
                                                <Clock className="w-5 h-5 text-amber-600" />
                                            </div>
                                            <h3 className="text-lg font-bold text-[#0F1E36]">Half-Yearly Approvals</h3>
                                        </div>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            Employees receive a calendar-based allowance of <strong>120 minutes</strong> per half-year (H1: Jan-Jun, H2: Jul-Dec). This pool is shared across all projects within that window, allowing Dept Heads to approve late-ins without project-specific constraints.
                                        </p>
                                    </div>
                                </section>

                                {/* Section 4: Employee Lifecycle */}
                                <section className="p-8 rounded-3xl bg-[#F8FAFC] border border-slate-200">
                                    <h3 className="text-xl font-bold text-[#0F1E36] mb-6">Management Lifecycle</h3>
                                    <div className="grid sm:grid-cols-3 gap-8 relative">
                                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 hidden md:block"></div>
                                        <div className="relative bg-[#F8FAFC] pr-4">
                                            <div className="w-10 h-10 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center text-indigo-600 font-bold mb-4 relative z-10 shadow-sm">1</div>
                                            <h4 className="font-bold text-slate-800 text-sm">Onboarding</h4>
                                            <p className="text-[11px] text-[#64748B] mt-2 italic">Add via Employee Dialog. System validates against duplicate Attendance IDs within the company.</p>
                                        </div>
                                        <div className="relative bg-[#F8FAFC] px-4">
                                            <div className="w-10 h-10 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center text-indigo-500 font-bold mb-4 relative z-10 shadow-sm">2</div>
                                            <h4 className="font-bold text-slate-800 text-sm">Audited Changes</h4>
                                            <p className="text-[11px] text-[#64748B] mt-2 italic">A full Audit Trail logs modifications to Company, Dept, Status, and Name for accountability.</p>
                                        </div>
                                        <div className="relative bg-[#F8FAFC] pl-4">
                                            <div className="w-10 h-10 rounded-full bg-white border-2 border-red-500 flex items-center justify-center text-red-500 font-bold mb-4 relative z-10 shadow-sm">3</div>
                                            <h4 className="font-bold text-slate-800 text-sm">Deactivation</h4>
                                            <p className="text-[11px] text-[#64748B] mt-2 italic">Set status to Inactive. Historical data is preserved, but the individual is excluded from new project rosters.</p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : activeSection === "Project and Attendance Management" ? (
                            /* 
                                PROJECT AND ATTENDANCE MANAGEMENT SECTION
                                Documentation for project lifecycle, punch ingestion, shifts, 
                                attendance analysis, auditing, and manual overrides.
                            */
                            <div className="space-y-10 animate-in fade-in duration-500">
                                {/* Section 1: Project Definition & Lifecycle */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Project Lifecycle
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        A <strong>Project</strong> represents a specific time-bound attendance cycle (typically a calendar month) for a business entity. Projects progress through four distinct states that govern data mutability:
                                    </p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="p-3 rounded-xl border border-blue-100 bg-blue-50 text-center">
                                            <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">Draft</div>
                                            <p className="text-[11px] text-blue-800">Setup phase; defining dates and companies.</p>
                                        </div>
                                        <div className="p-3 rounded-xl border border-amber-100 bg-amber-50 text-center">
                                            <div className="text-[10px] font-bold text-amber-600 uppercase mb-1">Analyzed</div>
                                            <p className="text-[11px] text-amber-800">Raw data has been processed into results.</p>
                                        </div>
                                        <div className="p-3 rounded-xl border border-indigo-100 bg-indigo-50 text-center">
                                            <div className="text-[10px] font-bold text-indigo-600 uppercase mb-1">Locked</div>
                                            <p className="text-[11px] text-indigo-800">Analysis finalized; no further data changes permitted.</p>
                                        </div>
                                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-100 text-center text-slate-400">
                                            <div className="text-[10px] font-bold uppercase mb-1">Closed</div>
                                            <p className="text-[11px]">Historical record; read-only for all users.</p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 2: Punch Data Ingestion */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Data Ingestion & Shifts
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                <div className="p-1.5 bg-blue-50 rounded text-blue-600"><Briefcase className="w-4 h-4" /></div>
                                                Punch Management
                                            </h4>
                                            <p className="text-sm text-[#64748B] leading-relaxed">
                                                Attendance data is ingested via CSV or Excel uploads (.csv, .xlsx, .xls). Excel files are automatically converted to CSV format before parsing to ensure consistent processing. The system matches raw punch logs to employees using the <strong>Attendance ID</strong>. To handle hardware noise, a <strong>10-minute duplicate filter</strong> is applied—any subsequent punch within 10 minutes of a recorded entry is discarded as a "ghost punch."
                                            </p>
                                        </div>
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                <div className="p-1.5 bg-indigo-50 rounded text-indigo-600"><Clock className="w-4 h-4" /></div>
                                                Shift Configurations
                                            </h4>
                                            <p className="text-sm text-[#64748B] leading-relaxed">
                                                Shifts define the expected work hours. Shifting timing data can be uploaded via CSV or Excel, with Excel files automatically converted to CSV for consistent parsing. The system supports <strong>Single Shifts</strong> (Start/End) and <strong>Split Shifts</strong> (AM Start/End + PM Start/End). Special <strong>Friday Shift</strong> overrides are supported globally per employee to accommodate regional work week variations.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 3: The Analysis Engine */}
                                <section className="p-8 rounded-3xl bg-slate-900 text-white space-y-6">
                                    <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
                                        <Zap className="w-8 h-8 text-yellow-400 shrink-0" />
                                        <div>
                                            <h3 className="text-xl font-bold">The Analysis Process</h3>
                                            <p className="text-slate-400 text-sm italic">From raw logs to payroll-ready minutes</p>
                                        </div>
                                    </div>
                                    <div className="grid sm:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider">1. Boundaries</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">Punches are matched to the closest shift boundary. A 2-hour buffer handles <strong>Midnight Crossovers</strong> (Ramadan shifts) where evening-shift punches extend into the following calendar date.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider">2. Completeness</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">The system enforces <strong>Punch Completeness</strong>. If an employee fails to meet the minimum required punches (e.g., 4 for split shift), the day is automatically marked as "Half Day Partial" regardless of minutes worked.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-indigo-300 font-bold text-sm uppercase tracking-wider">3. Integration</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">Calculations are merged with <strong>Exceptions</strong> (Public Holidays, Sick Leaves) and <strong>Manual Pre-approvals</strong> to determine the final <em>Deductible Minutes</em> used for payroll.</p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 4: Auditing & Overrides */}
                                <section className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xl font-bold text-[#0F1E36]">Review & Auditing Tools</h3>
                                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-tight">Transparency Layer</span>
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-8">
                                        <div className="space-y-4 border-l-4 border-indigo-500 pl-6">
                                            <h4 className="font-bold text-[#0F1E36] flex items-center gap-2">
                                                Audit & Abnormalities
                                                <AlertCircle className="w-4 h-4 text-indigo-500" />
                                            </h4>
                                            <p className="text-sm text-[#4A5568] leading-relaxed">
                                                The <strong>Audit Panel</strong> detects and flags "Problem Days." These include days with mismatching punch counts, extreme lateness, or where the analysis system had to "guess" a punch's boundary (Extended Matches). <em>Note: The audit panel now includes a "Top Offenders" summary bar, detailed shift-point proximity labels for unbound punches, and a dedicated "Export Mismatch" feature. This allows supervisors to generate a comprehensive Excel report of all flagged discrepancies for offline review or payroll adjustment.</em> <em>Note: The audit panel also handles shifts ending up to 01:59 AM as midnight crossovers and includes a fallback to exclude early morning buffer punches for employees with missing Saturday or previous day shift configurations. This ensures high accuracy in mismatch detection even for irregular project schedules.</em> This ensures supervisors focus on high-risk discrepancies rather than reviewing thousands of perfect records.
                                            </p>
                                        </div>
                                        <div className="space-y-4 border-l-4 border-emerald-500 pl-6">
                                            <h4 className="font-bold text-[#0F1E36] flex items-center gap-2">
                                                Manual Edits & Re-runs
                                                <Edit className="w-4 h-4 text-emerald-500" />
                                            </h4>
                                            <p className="text-sm text-[#4A5568] leading-relaxed">
                                                The <strong>Daily Breakdown</strong> dialog provides full visibility into every calculation. If the AI mismatches a punch, authorized users can invoke the <strong>Edit Day Record</strong> dialog to manually override status, late minutes, or even the shift timings for that specific date. Changes are persisted in <code>day_overrides</code> and tracked in the audit trail.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : activeSection === "Attendance Analysis Engine" ? (
                            /* 
                                ATTENDANCE ANALYSIS ENGINE SECTION
                                Detailed technical and functional documentation for the core logic
                                that processes raw punches into finalized attendance statuses.
                            */
                            <div className="space-y-10 animate-in fade-in duration-500">
                                {/* Section 1: Engine Overview */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Engine Overview
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        The <code>runAnalysis</code> backend function is the heart of the system. Triggered when a supervisor clicks <strong>"Run Analysis"</strong>, it executes a server-side Deno process that pulls raw punch logs, employee metadata, project shifts, and exception records. The engine iterates through every employee and every day in the project range to determine precise attendance metrics.
                                    </p>
                                </section>

                                {/* Section 2: Mandatory Punch Completeness */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Punch Completeness Rule
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        To maintain data integrity, the system enforces a strict <strong>Punch Completeness Rule</strong>. This rule dictates the default status of a day based on the total count of valid punches recorded, regardless of late or early minutes.
                                    </p>
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                                            <h4 className="font-bold text-slate-800 text-sm mb-3">Single Shift (2 expected)</h4>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs border-b border-slate-200 pb-1">
                                                    <span className="font-semibold">0 Punches</span>
                                                    <span className="text-red-600 font-bold italic">Absent (LOP)</span>
                                                </div>
                                                <div className="flex justify-between text-xs border-b border-slate-200 pb-1">
                                                    <span className="font-semibold">1 Punch</span>
                                                    <span className="text-amber-600 font-bold italic">Half Day Partial</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="font-semibold">2+ Punches</span>
                                                    <span className="text-green-600 font-bold italic">Present</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                                            <h4 className="font-bold text-slate-800 text-sm mb-3">Split Shift (4 expected)</h4>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs border-b border-slate-200 pb-1">
                                                    <span className="font-semibold">0 Punches</span>
                                                    <span className="text-red-600 font-bold italic">Absent (LOP)</span>
                                                </div>
                                                <div className="flex justify-between text-xs border-b border-slate-200 pb-1">
                                                    <span className="font-semibold">1 or 2 Punches</span>
                                                    <span className="text-amber-600 font-bold italic">Half Day Partial</span>
                                                </div>
                                                <div className="flex justify-between text-xs border-b border-slate-200 pb-1">
                                                    <span className="font-semibold">3 Punches</span>
                                                    <span className="text-green-600 font-bold italic">Present (Fallback)</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="font-semibold">4+ Punches</span>
                                                    <span className="text-green-600 font-bold italic">Present Normal</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700 italic">
                                        <strong>Note:</strong> This rule can only be bypassed using <code>SKIP_PUNCH</code> or <code>FULL_SKIP</code> exceptions, which are used for company-wide events or specialized half-days.
                                    </p>
                                </section>

                                {/* Section 3: Midnight Crossover & Shift Detection */}
                                <section className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                            Midnight Carry-Forward
                                        </h3>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            The engine automatically handles late-night shifts that bleed into the next calendar day. Any punch recorded within <strong>120 minutes (2 hours)</strong> after midnight is treated as part of the previous day's shift. This "midnight crossover" logic runs <em>before</em> the punch count is evaluated, ensuring night shifts are analyzed as a single cohesive unit.
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                            Shift Detection Rules
                                        </h3>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            The system uses <strong>strict boolean equality</strong> for the <code>isSingleShift</code> flag. If this is not explicitly enabled, the system automatically checks for the presence of "middle times" (AM end and PM start). This strictness prevents incorrect analysis caused by legacy data or loosely typed values in shift configurations.
                                        </p>
                                    </div>
                                </section>

                                {/* Section 4: Time Calculation & Windows */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Lateness & Early Checkout Logic
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        Punches are matched to shift points using hierarchical matching windows. The engine first attempts to find a match within <strong>60 minutes</strong>. If no match is found, it progressively expands to <strong>120 minutes</strong> and then <strong>180 minutes</strong>.
                                    </p>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
                                            <h4 className="font-bold text-slate-800 text-sm mb-2">Scope & Fallbacks</h4>
                                            <p className="text-xs text-[#64748B] leading-relaxed">
                                                Matches beyond 180 minutes are flagged as <strong>"NO MATCH"</strong> and trigger a critical abnormality. Additionally, the system employs a <strong>4-hour (240-minute) scoped fallback</strong> for "Extreme Lateness" detection, surfacing these days in the Audit Panel for manual review.
                                            </p>
                                        </div>
                                        <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-sm">
                                            <h4 className="font-bold text-slate-800 text-sm mb-2">Approved Minutes Impact</h4>
                                            <p className="text-xs text-[#64748B] leading-relaxed">
                                                When a supervisor authorizes <strong>Approved Minutes</strong>, they directly reduce the <em>Deductible Minutes</em> for that day. Crucially, the system <strong>preserves the raw late and early checkout fields</strong>; approved minutes only act as a dynamic deduction offset to maintain a clear audit trail of biometric reality versus administrative correction.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 5: Grace Minutes & LOP Adjacency */}
                                <section className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                            Grace Minutes Calculation
                                        </h3>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            Deductible minutes are computed by subtracting <strong>Total Grace</strong> from the sum of late and early checkout minutes. Total Grace is the sum of the employee's <strong>Base Grace</strong> (assigned by department) and any <strong>Carried Grace</strong> from previous months.
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                            The LOP-Adjacent Rule
                                        </h3>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            A Weekly Off or Public Holiday is converted to <strong>LOP</strong> if it is "sandwiched" between or adjacent to LOP days (Manual or Punch-based). However, if the date falls within a verified <strong>Annual Leave</strong> or <strong>Sick Leave</strong> range, it is considered <em>protected</em> and exempt from this deduction.
                                        </p>
                                    </div>
                                </section>

                                {/* Section 6: Status Hierarchy */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Day Status Priority Order
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed mb-4">
                                        In cases where multiple statuses could apply to a single day, the engine follows a strict hierarchy to resolve the final result:
                                    </p>
                                    <div className="flex flex-col gap-2 relative">
                                        <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-indigo-100 hidden sm:block"></div>
                                        {[
                                            { label: "Public Holiday", desc: "Highest priority; overrides all others." },
                                            { label: "Weekly Off", desc: "Applied if the day is not a scheduled holiday." },
                                            { label: "Manual Override / Sick Leave", desc: "Explicit administrative exceptions." },
                                            { label: "Annual Leave", desc: "Calendar-based leave protection." },
                                            { label: "Normal Analysis", desc: "The standard biometric punch matching logic." }
                                        ].map((item, idx) => (
                                            <div key={idx} className="flex gap-4 items-start relative z-10">
                                                <div className="w-10 h-10 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0 shadow-sm">
                                                    {idx + 1}
                                                </div>
                                                <div className="pt-1.5">
                                                    <h4 className="text-sm font-bold text-slate-800">{item.label}</h4>
                                                    <p className="text-xs text-[#64748B]">{item.desc}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Section 7: NO MATCH Handling */}
                                <section className="p-6 rounded-2xl bg-red-50 border border-red-100 space-y-3">
                                    <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5" />
                                        NO MATCH Status
                                    </h3>
                                    <p className="text-red-700 text-sm leading-relaxed">
                                        A <strong>NO MATCH</strong> occurs when a recorded punch cannot be associated with any shift boundary within the maximum 180-minute window. In such cases, the engine marks the day as <strong>Critical Abnormal</strong> and excludes the punch from late/early calculations to prevent data corruption. Supervisors must manually resolve these days using the Daily Breakdown dialog.
                                    </p>
                                </section>
                            </div>
                        ) : activeSection === "Exceptions System" ? (
                            /* 
                                EXCEPTIONS SYSTEM SECTION
                                Documentation for the manual overrides and administrative adjustments
                                that modify the core attendance analysis.
                            */
                            <div className="space-y-10 animate-in fade-in duration-500">
                                {/* Section 1: Overview and Purpose */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        System Purpose
                                    </h3>
                                    <p className="text-[#4A5568] leading-relaxed">
                                        The Exceptions System exists to provide administrative control over biometric data. While the analysis engine is automated, real-world scenarios—such as medical emergencies, site visits, or forgotten punches—require manual intervention. Exceptions allow supervisors to override or modify how a specific day is treated for an employee, ensuring that the final payroll is accurate and fair.
                                    </p>
                                </section>

                                {/* Section 2: Exception Types Reference */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Available Exception Types
                                    </h3>
                                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {[
                                            { type: "PUBLIC_HOLIDAY / OFF", desc: "Marks days as non-working. Affects all or specific employees, preventing LOP deductions." },
                                            { type: "MANUAL_PRESENT", desc: "Forces a 'Present' status. Used when an employee worked but has zero biometric records." },
                                            { type: "MANUAL_ABSENT", desc: "Forces an 'LOP' status. Overrides existing punches to mark the day as unpaid leave." },
                                            { type: "SICK_LEAVE", desc: "Records paid medical leave. Protects adjacent weekly offs from LOP conversion." },
                                            { type: "ANNUAL_LEAVE", desc: "Records paid vacation. Counted as calendar days and exempts the day from analysis." },
                                            { type: "DAY_SWAP", desc: "Swaps a weekly off with a working day. Essential for flexible scheduling." },
                                            { type: "SHIFT_OVERRIDE", desc: "Applies new AM/PM start and end times for a specific date range." },
                                            { type: "ALLOWED_MINUTES", desc: "Excuses late arrivals or early departures gracefully without erasing biometric history." },
                                            { type: "SKIP_PUNCH", desc: "The 'LOP Saver'. Instructs the engine to ignore missing in/out records for specific shift points." },
                                            { type: "MANUAL_LATE / EARLY", desc: "Allows administrative overrides of raw biometric late or early checkout minutes." },
                                            { type: "MANUAL_OTHER_MINUTES", desc: "Miscellaneous time adjustments for training, site visits, or technical issues." }
                                        ].map((item, idx) => (
                                            <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all">
                                                <h4 className="text-[10px] font-bold text-indigo-600 mb-1 tracking-wider uppercase">{item.type}</h4>
                                                <p className="text-xs text-[#64748B] leading-relaxed">{item.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Section 3: Date Ranges & Global Exceptions */}
                                <section className="grid md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                            Date Ranges
                                        </h3>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            Exceptions are highly flexible; they can apply to a <strong>single day</strong> (where <code>date_from</code> equals <code>date_to</code>) or cover a <strong>multi-day range</strong> (such as a 2-week vacation). The engine automatically iterates through every day in the range and applies the rule to all matching employee records.
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                            <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                            Global (ALL) Exceptions
                                        </h3>
                                        <p className="text-sm text-[#4A5568] leading-relaxed">
                                            By setting the Attendance ID to <code>ALL</code>, an exception is applied to the entire project workforce. This is most commonly used for <strong>Public Holidays</strong> or company-wide events using <strong>SKIP_PUNCH</strong>, eliminating the need to add records for hundreds of employees individually.
                                        </p>
                                    </div>
                                </section>

                                {/* Section 4: Advanced Logic & Approvals */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Advanced Exception Logic
                                    </h3>
                                    <div className="space-y-6">
                                        <div className="p-6 rounded-2xl bg-indigo-50 border border-indigo-100 flex gap-6">
                                            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                                                <ShieldCheck className="w-6 h-6 text-indigo-600" />
                                            </div>
                                            <div className="space-y-2">
                                                <h4 className="font-bold text-indigo-900">Department Head Approval Flow</h4>
                                                <p className="text-sm text-indigo-700/80 leading-relaxed">
                                                    For <strong>ALLOWED_MINUTES</strong>, the system implements a verify-then-apply flow. The exception tracks approval via the <code>approval_status</code> field. Only when set to <code>approved_dept_head</code> will the analysis engine recognize these minutes as a valid offset to biometric lateness.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div className="p-5 rounded-xl border border-slate-100 bg-white shadow-sm space-y-3">
                                                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                    <Zap className="w-4 h-4 text-amber-500" />
                                                    SKIP_PUNCH Sub-types
                                                </h4>
                                                <ul className="text-xs text-[#64748B] space-y-2 list-disc pl-4">
                                                    <li><strong>AM_PUNCH_IN</strong>: Excuses missing morning start punches and zeros late minutes.</li>
                                                    <li><strong>PM_PUNCH_OUT</strong>: Excuses missing evening end punches and zeros early checkouts.</li>
                                                    <li><strong>FULL_SKIP</strong>: Forces 'Present' status even with 0 punches (useful for company-wide events).</li>
                                                </ul>
                                            </div>
                                            <div className="p-5 rounded-xl border border-slate-100 bg-white shadow-sm space-y-3">
                                                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                    <Clock className="w-4 h-4 text-indigo-500" />
                                                    Exception Priority
                                                </h4>
                                                <p className="text-xs text-[#64748B]">
                                                    When multiple exceptions overlap on the same day, the engine prioritizes the <strong>most recently created</strong> record. However, status-modifying exceptions (like Public Holidays) inherently take priority over time-modifying ones (like Allowed Minutes).
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 5: Management Workflow */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Managing Exceptions
                                    </h3>
                                    <div className="grid md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-bold text-slate-800">1. Adding & AI Parsing</h4>
                                            <p className="text-xs text-[#64748B]">Use the 'Add Exception' form with manual entry or leverage the AI NLP parser to convert natural language requests into structured rules automatically.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-bold text-slate-800">2. Individual Editing</h4>
                                            <p className="text-xs text-[#64748B]">Click the 'Edit' icon on any existing exception in the table to modify details, date ranges, or specific time overrides within a dedicated dialog.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-bold text-slate-800">3. Bulk Management</h4>
                                            <p className="text-xs text-[#64748B]">Select multiple employees in the Exceptions table to apply mass changes or delete multiple stale records at once using global toolbars.</p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : activeSection === "Payroll and Salary" ? (
                            /* 
                                PAYROLL AND SALARY SECTION
                                Documentation for salary calculation, overtime, bonuses, 
                                Al Maraghi Motors specific rules, and snapshot mechanics.
                            */
                            <div className="space-y-10 animate-in fade-in duration-500">
                                {/* Section 1: Salary Calculation Core */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-emerald-600 rounded-full"></span>
                                        Salary Calculation Logic
                                    </h3>
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 space-y-4">
                                        <p className="text-sm text-emerald-900 leading-relaxed">
                                            The system calculates net salary by starting with the <strong>Total Salary</strong> (Base + Fixed Allowances) and subtracting deductions derived from attendance.
                                        </p>
                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100">
                                                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Minute Deduction Rate</h4>
                                                <code className="text-[10px] bg-slate-100 p-2 rounded block mb-2">
                                                    Rate = Total Salary / (Divisor × Working Hours × 60)
                                                </code>
                                                <p className="text-[11px] text-[#64748B]">
                                                    Every minute of biometric lateness or early departure is converted into a monetary deduction using this rate. The <strong>Divisor</strong> (typically 30) and <strong>Working Hours</strong> (typically 9) are defined in the Salary Master.
                                                </p>
                                            </div>
                                            <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100">
                                                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Deductible Minutes Translation</h4>
                                                <p className="text-[11px] text-[#64748B]">
                                                    Finalized <em>Deductible Minutes</em> (after grace and approved offsets) + <em>Other Minutes</em> are multiplied by the minute rate. The result is deducted from the gross pay as <strong>Deductible Hours Pay</strong>.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 2: Overtime & Incentives */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Overtime & Performance Pay
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-indigo-600" />
                                                Overtime (OT) Tiers
                                            </h4>
                                            <p className="text-sm text-[#4A5568] leading-relaxed">
                                                Overtime is manually entered in the <strong>Overtime Tab</strong>. The system supports two tiers calculated using the <em>Previous Month's</em> hourly rate to ensure fiscal accuracy relative to when the work was performed:
                                            </p>
                                            <ul className="text-xs text-[#64748B] space-y-2 list-disc pl-4">
                                                <li><strong>Normal OT (1.25x)</strong>: Applied to standard extra working hours.</li>
                                                <li><strong>Special OT (1.5x)</strong>: Applied to holidays or emergency duty hours.</li>
                                            </ul>
                                        </div>
                                        <div className="space-y-4">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                <Zap className="w-4 h-4 text-amber-500" />
                                                Operations Department Rule
                                            </h4>
                                            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                                                <p className="text-xs text-amber-900 leading-relaxed font-medium">
                                                    Special Policy: For employees in the <strong>Operations department</strong>, the system applies an "either-or" logic. Only the <strong>higher</strong> of the calculated Overtime or the manual Incentive is paid out, not both.
                                                </p>
                                                <p className="text-[10px] text-amber-700 mt-2 italic">
                                                    *All other departments receive both Overtime and Incentives cumulatively.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 3: Additive Fields & Al Maraghi Motors Logic */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                                        Company-Specific Pay Elements
                                    </h3>
                                    <p className="text-sm text-[#4A5568]">
                                        Al Maraghi Motors utilizes several unique pay fields to accommodate complex labor contracts and cultural gifts:
                                    </p>
                                    <div className="grid md:grid-cols-3 gap-4">
                                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                                            <h4 className="text-[10px] font-bold text-blue-600 mb-1 uppercase">Open Leave Salary</h4>
                                            <p className="text-[11px] text-[#64748B]">Manual addition to net pay for employees returning from extended leave or special duty cycles.</p>
                                        </div>
                                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                                            <h4 className="text-[10px] font-bold text-blue-600 mb-1 uppercase">Variable Salary</h4>
                                            <p className="text-[11px] text-[#64748B]">A flexible pay component used for sales commissions or ad-hoc performance milestones.</p>
                                        </div>
                                        <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
                                            <h4 className="text-[10px] font-bold text-blue-600 mb-1 uppercase">Ramadan Gift</h4>
                                            <p className="text-[11px] text-[#64748B] mb-2 text-[#64748B]">Special minutes credited to employees during Ramadan which directly reduce their <em>Deductible Minutes</em>.</p>
                                            <div className="bg-blue-50 border border-blue-100 rounded p-2 mt-2">
                                                <p className="text-[10px] text-blue-700 leading-relaxed italic">
                                                    <strong>Update:</strong> Gift Minutes are now calculated with a manual trigger button gated by date range overlap. Saved gift minutes also synchronize a GIFT_MINUTES exception record for accurate attendance accounting.
                                                    <br /><br />
                                                    <strong>Project Settings:</strong> Gift Minutes now require a mandatory date range configuration within the project timeline. This range becomes read-only after the initial save to ensure consistency in attendance analysis.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 4: Snapshots & Persistence */}
                                <section className="space-y-6 p-8 rounded-3xl bg-slate-900 text-white">
                                    <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
                                        <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
                                        <div>
                                            <h3 className="text-xl font-bold">Salary Data Persistence</h3>
                                            <p className="text-slate-400 text-sm italic">Ensuring audit fidelity and record protection</p>
                                        </div>
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <h4 className="text-emerald-300 font-bold text-sm uppercase">Salary Snapshots</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">
                                                When a report is finalized, the system creates a <strong>Snapshot</strong>. This captures the exact state of an employee's salary settings, attendance metrics, and OT calculations. Snapshots protect historical payroll data from being altered by future changes to the employee's master salary record.
                                            </p>
                                        </div>
                                        <div className="space-y-4">
                                            <h4 className="text-emerald-300 font-bold text-sm uppercase">Adjustment Descriptions</h4>
                                            <p className="text-xs text-slate-400 leading-relaxed">
                                                A persistence fix ensures that descriptions for bonuses and other adjustments are stored 1:1. Explanations are saved into the <code>OvertimeData</code> entity as a JSON string, while the numeric totals are aggregated for fast reporting in the <code>SalarySnapshot</code>.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 5: Finalization & Compliance */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-slate-800 rounded-full"></span>
                                        Finalization & WPS
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-8">
                                        <div className="p-6 rounded-2xl border border-slate-200 bg-white space-y-3">
                                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                                                <Briefcase className="w-5 h-5" />
                                                WPS Split Functionality
                                            </div>
                                            <p className="text-xs text-[#64748B] leading-relaxed">
                                                For UAE labor compliance, the system calculates the <strong>WPS (Wage Protection System)</strong> pay. If a "WPS Cap" is enabled for an employee (typically set at AED 4,900), the system splits the net total into <code>wpsPay</code> (up to the cap) and <code>balance</code> (the remainder), ensuring smooth file generation for banking portals.
                                            </p>
                                        </div>
                                        <div className="p-6 rounded-2xl border border-slate-200 bg-white space-y-3">
                                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                                                <AlertCircle className="w-5 h-5 text-red-500" />
                                                LOP Pay Divisor Rule
                                            </div>
                                            <p className="text-xs text-[#64748B] leading-relaxed">
                                                <strong>LOP (Loss of Pay)</strong> calculations for full absences consistently utilize the original salary month divisor defined in the project settings (e.g., 30 days). This ensures that the per-day deduction for a missing shift matches the contractually defined daily rate without monthly variance.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : activeSection === "Ramadan Module" ? (
                            /* 
                                RAMADAN MODULE SECTION
                                Documentation for shift designer, calendar verification, 
                                application logic, and the priority hierarchy.
                            */
                            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                {/* Section 1: Overview & Purpose */}
                                <section className="space-y-4">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200">
                                            <Moon className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-[#0F1E36]">Ramadan Shift Management</h3>
                                            <p className="text-sm text-slate-500">Handling reduced hours and alternating patterns for the holy month</p>
                                        </div>
                                    </div>
                                    <div className="bg-purple-50 border border-purple-100 rounded-2xl p-6">
                                        <p className="text-sm text-purple-900 leading-relaxed mb-4">
                                            The Ramadan Module is a specialized override system designed to handle the unique labor requirements of the holy month. In the UAE, daily working hours are typically reduced (e.g., from 9 to 6 hours), and employees often rotate through night or early morning shifts to accommodate fasting and religious observances.
                                        </p>
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="flex gap-3 text-xs text-purple-800">
                                                <div className="w-5 h-5 rounded-full bg-purple-200 flex-shrink-0 flex items-center justify-center font-bold">1</div>
                                                <span><strong>Reduced Load:</strong> Automatically adjusts the expected shift duration for audit purposes.</span>
                                            </div>
                                            <div className="flex gap-3 text-xs text-purple-800">
                                                <div className="w-5 h-5 rounded-full bg-purple-200 flex-shrink-0 flex items-center justify-center font-bold">2</div>
                                                <span><strong>Operational Support:</strong> Supports alternating weekly rotations (Day/Night or S1/S2).</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 2: Shift Designer & Rotation */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-purple-600 rounded-full"></span>
                                        Designer & Week Rotation
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-8">
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                                                <Settings className="w-5 h-5" />
                                                The Ramadan Designer
                                            </div>
                                            <p className="text-xs text-[#64748B] leading-relaxed">
                                                The <strong>Design Ramadan Shifts</strong> dialog allows HR to configure shift patterns per employee using their <code>attendance_id</code>. It supports three distinct configuration tabs:
                                            </p>
                                            <ul className="space-y-2">
                                                <li className="text-[11px] text-[#64748B] flex items-start gap-2">
                                                    <span className="text-purple-600 font-bold mt-0.5">•</span>
                                                    <span><strong>Week 1 & 2 Patterns:</strong> Define two alternating presets for employees who rotate between shifts.</span>
                                                </li>
                                                <li className="text-[11px] text-[#64748B] flex items-start gap-2">
                                                    <span className="text-purple-600 font-bold mt-0.5">•</span>
                                                    <span><strong>Friday Shifts:</strong> Configured as a separate standalone rule, as Fridays often have reduced split-shift timings (e.g., 8AM-12PM & 2PM-5PM).</span>
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-slate-900 font-bold">
                                                <RotateCcw className="w-5 h-5" />
                                                The Saturday Rotation Rule
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                                <p className="text-xs text-slate-700 leading-relaxed font-semibold mb-2">How weeks alternate:</p>
                                                <p className="text-[11px] text-[#64748B] leading-relaxed">
                                                    The system calculates the week rotation based on the number of <strong>Saturdays passed</strong> since the Ramadan start date. Sunday is universally treated as a weekly off-day and is automatically skipped during shift generation. This ensures a consistent rotation cadence across the entire organization.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 3: Verification & Application */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-purple-600 rounded-full"></span>
                                        Verification & Application
                                    </h3>
                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        <div className="grid md:grid-cols-3 divide-x divide-slate-100">
                                            <div className="p-6 space-y-3">
                                                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                                                    <Calendar className="w-4 h-4 text-purple-600" />
                                                    Calendar Audit
                                                </div>
                                                <p className="text-[11px] text-[#64748B] leading-relaxed">
                                                    The <strong>Ramadan Calendar View</strong> allows HR to verify the shift design before committing. It visualizes the entire month for every employee, showing which pattern (W1, W2, or Friday) applies to each specific date.
                                                </p>
                                            </div>
                                            <div className="p-6 space-y-3">
                                                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                                                    <Play className="w-4 h-4 text-green-600" />
                                                    Apply Shifts Process
                                                </div>
                                                <p className="text-[11px] text-[#64748B] leading-relaxed">
                                                    When clicking <strong>Apply Ramadan Shifts</strong>, the system invokes a backend function that creates explicit <code>ShiftTiming</code> records for every day of the overlap. This lock-in ensures analysis remains consistent even if master-data changes later.
                                                </p>
                                            </div>
                                            <div className="p-6 space-y-3">
                                                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                                                    <RotateCcw className="w-4 h-4 text-red-600" />
                                                    Undo & Sync
                                                </div>
                                                <p className="text-[11px] text-[#64748B] leading-relaxed">
                                                    The <strong>Undo</strong> feature removes all Ramadan overrides for the overlap period. The <strong>Sync</strong> button can be used after designer updates to fill in missing days without overwriting manual project level tweaks.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 4: Engine Priority & Rules */}
                                <section className="space-y-4">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-purple-600 rounded-full"></span>
                                        Analysis Priority Hierarchy
                                    </h3>
                                    <div className="bg-slate-900 rounded-2xl p-6 text-slate-300">
                                        <p className="text-xs mb-6 text-slate-400">The Attendance Analysis Engine resolves shift conflicts using the following priority order (descending):</p>
                                        <div className="space-y-4">
                                            {[
                                                { level: "1", title: "Project-Specific ShiftTiming", desc: "Explicitly defined records for a specific date (Created via 'Apply Ramadan Shifts')." },
                                                { level: "2", title: "Dynamic RamadanSchedule Lookup", desc: "Real-time calculation from the Designer JSON if no date-specific record exists." },
                                                { level: "3", title: "Standard ShiftTiming", desc: "The employee's regular weekday-based contract shifts." },
                                                { level: "4", title: "Company Defaults", desc: "The global fallback shift for the entire organization (e.g., 8AM-5PM)." }
                                            ].map((item, i) => (
                                                <div key={i} className="flex gap-4 items-start pb-4 border-b border-slate-800 last:border-0 last:pb-0">
                                                    <div className="w-6 h-6 rounded bg-purple-900/50 flex flex-shrink-0 items-center justify-center text-purple-400 font-mono text-xs">
                                                        {item.level}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-bold text-white mb-1">{item.title}</h4>
                                                        <p className="text-[10px] text-slate-400 leading-relaxed">{item.desc}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>

                                {/* Section 5: HR Critical Gotchas */}
                                <section className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
                                    <h4 className="flex items-center gap-2 text-amber-900 font-bold mb-3">
                                        <Info className="w-5 h-5" />
                                        Important Rules for HR
                                    </h4>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <p className="text-[11px] text-amber-800 font-bold">Al Maraghi Automotive Rule:</p>
                                            <p className="text-[11px] text-amber-700 leading-relaxed">
                                                For this entity, <strong>S1</strong> (8:00–3:00) and <strong>S2</strong> (10:00–5:00) act as mutually exclusive radio buttons. Selecting one automatically clears the other to prevent configuration conflicts.
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[11px] text-amber-800 font-bold">Exception Priority:</p>
                                            <p className="text-[11px] text-amber-700 leading-relaxed">
                                                If a <strong>Day Swap</strong> exception exists for a date, the analysis engine prioritizes the swapped timing over the Ramadan schedule to ensure specific staff swaps are honored.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : activeSection === 'HR Features' ? (
                            <div className="space-y-12 animate-in fade-in duration-700">
                                {/* Header */}
                                <header className="space-y-4">
                                    <div className="flex items-center gap-3 text-indigo-600 font-bold tracking-wider text-xs uppercase">
                                        <Briefcase className="w-4 h-4" />
                                        Advanced HR Modules
                                    </div>
                                    <h2 className="text-4xl font-extrabold text-[#0F1E36] tracking-tight">
                                        HR Features & Automation
                                    </h2>
                                    <p className="text-slate-500 text-lg leading-relaxed max-w-3xl">
                                        This section covers the specialized human resource management workflows integrated into the platform, including automated leave tracking, rejoining logic, and balance management.
                                    </p>
                                </header>

                                {/* Section 1: Annual Leave & Rejoining */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Annual Leave & Rejoining Date
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                                <Calendar className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <h4 className="font-bold text-slate-900">Leave Management</h4>
                                            <p className="text-xs text-slate-600 leading-relaxed">
                                                Annual leaves are recorded with explicit date ranges. The system automatically counts calendar days for analysis. For overlapping projects, a <strong>Month Split rule</strong> applies where leave days are only counted for the "current" calendar month (the month with the most days in the project range).
                                            </p>
                                            <div className="bg-indigo-50 border border-indigo-100 rounded p-2 mt-2">
                                                <p className="text-[10px] text-indigo-700">
                                                    <strong>Update:</strong> HR can now bulk import Annual Leaves via Excel/CSV with automatic exact and fuzzy employee name matching scoped by company. The import tool includes overlapping date detection to prevent duplicate leave entries.
                                                </p>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded p-2 mt-2">
                                                <p className="text-[10px] text-slate-600">
                                                    <strong>Update:</strong> A new AI-powered Quick Entry feature allows parsing natural language leave descriptions into structured form data. Fields remain fully editable after parsing to ensure final accuracy.
                                                </p>
                                            </div>
                                            <div className="bg-indigo-50 border border-indigo-100 rounded p-2 mt-2">
                                                <p className="text-[10px] text-indigo-700">
                                                    <strong>Update:</strong> The import preview now supports manual employee searching for unmatched rows, and the main leave table includes a project-based date range filter.
                                                </p>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded p-2 mt-2">
                                                <p className="text-[10px] text-slate-600">
                                                    <strong>Update:</strong> The annual leave table now features a manual From and To date filter for precise record selection. This allows filtering by actual leave dates independently of the project filter.
                                                </p>
                                            </div>
                                            <div className="bg-slate-50 rounded-lg p-3 text-[10px] text-slate-500 italic">
                                                <strong>Al Maraghi Motors Exception:</strong> Leaves starting in the project but ending after it are fully included to ensure seamless payroll salary enrollment.
                                            </div>
                                        </div>
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                                                <Milestone className="w-5 h-5 text-emerald-600" />
                                            </div>
                                            <h4 className="font-bold text-slate-900">Rejoining Date Logic</h4>
                                            <p className="text-xs text-slate-600 leading-relaxed">
                                                The system predictive rejoining feature determines exactly when an employee must report back. It starts with the day after leave ends and <strong>rolls forward</strong> automatically if that day is a Weekly Off or Public Holiday.
                                            </p>
                                            <ul className="text-[10px] text-slate-500 space-y-1 list-disc pl-4">
                                                <li>Ensures HR can verify attendance immediately upon return.</li>
                                                <li>Auto-created as a high-priority checklist item.</li>
                                            </ul>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 2: Automated Checklist System */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Checklist Auto-Creation System
                                    </h3>
                                    <div className="bg-slate-900 rounded-2xl p-8 text-white relative overflow-hidden">
                                        <div className="relative z-10 space-y-6">
                                            <p className="text-sm text-slate-400">The system minimizes manual data entry by automatically populating the project checklist with four distinct task types:</p>
                                            <div className="grid md:grid-cols-4 gap-4">
                                                {[
                                                    { type: "Annual Leave", desc: "Created from approved leave records with auto-calculated day counts." },
                                                    { type: "Rejoining Date", desc: "Ensures staff return to duty is verified by supervisors." },
                                                    { type: "LOP Days", desc: "Implicitly created when a report is finalized with full absences." },
                                                    { type: "Other Minutes", desc: "Flagged whenever manual adjustments exceed system thresholds." }
                                                ].map((t, i) => (
                                                    <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                                                        <div className="text-indigo-400 font-bold text-xs mb-2 flex items-center gap-2">
                                                            <ListChecks className="w-3 h-3" />
                                                            {t.type}
                                                        </div>
                                                        <p className="text-[10px] text-slate-400 leading-relaxed">{t.desc}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap gap-6 pt-4 border-t border-slate-800">
                                                <div className="flex items-center gap-2">
                                                    <Hash className="w-4 h-4 text-slate-500" />
                                                    <span className="text-[11px]"><strong className="text-white">Unique Fingerprints:</strong> Prevents duplicate tasks on report re-saves.</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <UserCheck className="w-4 h-4 text-slate-500" />
                                                    <span className="text-[11px]"><strong className="text-white">is_auto_created:</strong> Distinguishes system tasks from manual ones.</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[120px] rounded-full -mr-32 -mt-32"></div>
                                    </div>
                                </section>

                                {/* Section 3: Minutes & Grace Management */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Minutes & Grace Carry-Forward
                                    </h3>
                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        <div className="grid md:grid-cols-2 divide-x divide-slate-100">
                                            <div className="p-8 space-y-4">
                                                <div className="flex items-center gap-2 text-slate-900 font-bold text-md">
                                                    <Clock className="w-5 h-5 text-indigo-600" />
                                                    Half-Yearly Approved Minutes
                                                </div>
                                                <p className="text-xs text-slate-600 leading-relaxed">
                                                    Specifically for <strong>Al Maraghi Auto Repairs</strong>, employees receive 120 minutes of "Approved Absence" every six months. Department heads can consume this balance to offset late arrivals or early departures via approved exceptions.
                                                </p>
                                            </div>
                                            <div className="p-8 space-y-4">
                                                <div className="flex items-center gap-2 text-slate-900 font-bold text-md">
                                                    <History className="w-5 h-5 text-indigo-600" />
                                                    Grace Minutes Roll-Forward
                                                </div>
                                                <p className="text-xs text-slate-600 leading-relaxed">
                                                    Unused grace minutes from one project are automatically written to the employee's <em>Carried Grace Balance</em> upon project closure. This balance is added to their standard grace for the next project.
                                                </p>
                                                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex gap-3">
                                                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                                    <p className="text-[10px] text-amber-800">
                                                        <strong>Disqualification Rule:</strong> Employees with more than 2 annual leave days in the period are disqualified from grace carry-forward.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 4: Technical Notes */}
                                <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                                    <h4 className="flex items-center gap-2 text-slate-900 font-bold mb-3">
                                        <Settings className="w-5 h-5" />
                                        Platform Synchronization & Debounce
                                    </h4>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                        The <strong>Sync Annual Leave</strong> function uses a 1500ms debounce to prevent race conditions during rapid UI edits.
                                    </p>
                                    <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3">
                                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-1" />
                                        <div className="space-y-1">
                                            <p className="text-[11px] text-red-900 font-bold">Synchronicity Limitation:</p>
                                            <p className="text-[11px] text-red-800 leading-relaxed italic">
                                                Since the debounce map is stored in-memory, it is not shared across parallel cloud instances. Rapid, near-simultaneous changes to the same record across different browser tabs might occasionally result in redundant checklist task updates.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : activeSection === 'Resume Scanner' ? (
                            <div className="space-y-12 animate-in fade-in duration-700">
                                {/* Header */}
                                <header className="space-y-4">
                                    <div className="flex items-center gap-3 text-indigo-600 font-bold tracking-wider text-xs uppercase">
                                        <ScanLine className="w-4 h-4" />
                                        Advanced ATS Module
                                    </div>
                                    <h2 className="text-4xl font-extrabold text-[#0F1E36] tracking-tight">
                                        AI Resume Scanner
                                    </h2>
                                    <p className="text-slate-500 text-lg leading-relaxed max-w-3xl">
                                        The Resume Scanner is an AI-powered Applicant Tracking System (ATS) designed to automate the screening and ranking of candidates. It is exclusively accessible to <span className="text-indigo-600 font-bold">Admin</span> and <span className="text-indigo-600 font-bold">Supervisor</span> roles.
                                    </p>
                                </header>
+
                                {/* Section 1: Hiring Dashboards */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Real-time Hiring Dashboards
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                                <LayoutDashboard className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <h4 className="font-bold text-slate-900">Global Overview</h4>
                                            <p className="text-xs text-slate-600 leading-relaxed">
                                                The top of the dashboard provides aggregated stats across the entire organization, including total <strong>Open Positions</strong>, <strong>Talent Pool</strong> size, and cumulative <strong>Resumes Scanned</strong>.
                                            </p>
                                        </div>
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                                                <Users className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <h4 className="font-bold text-slate-900">Dynamic Company Sub-Dashboards</h4>
                                            <p className="text-xs text-slate-600 leading-relaxed">
                                                Beneath the global stats, each active company receives its own dedicated sub-dashboard. These are generated live from the <strong>Company</strong> entity and display per-entity hiring volume and top position trends.
                                            </p>
                                        </div>
                                    </div>
                                </section>
+
                                {/* Section 2: Scanning Workflow */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Scanning & Workflow Automation
                                    </h3>
                                    <div className="bg-slate-900 rounded-2xl p-8 text-white relative overflow-hidden">
                                        <div className="relative z-10 space-y-6">
                                            <div className="grid md:grid-cols-2 gap-8">
                                                <div className="space-y-3">
                                                    <h4 className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                                        <Workflow className="w-4 h-4" />
                                                        Multi-Template Processing
                                                    </h4>
                                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                                        Users can select multiple <strong>Position Templates</strong> (visualized as colored pill badges) to scan a single batch of resumes against different roles simultaneously. The system independently evaluates every resume against every selected role and assigns the "Best Fit" template to the result.
                                                    </p>
                                                </div>
                                                <div className="space-y-3">
                                                    <h4 className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                                                        <Clock className="w-4 h-4" />
                                                        Rate-Limit Protection
                                                    </h4>
                                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                                        To ensure high-quality AI analysis and avoid API limits, the system enforces a <strong>7-file upload limit</strong> per batch and processes scans sequentially with a mandatory <strong>3-second delay</strong> between each file.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[120px] rounded-full -mr-32 -mt-32"></div>
                                    </div>
                                </section>

                                {/* Section 3: AI Scoring System */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        ATS-Inspired Scoring System
                                    </h3>
                                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                        <div className="grid md:grid-cols-3 divide-x divide-slate-100">
                                            <div className="p-4 space-y-3">
                                                <h5 className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">AI Comparison</h5>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    <strong>Overall Score (0-100):</strong> A weighted average of skill matching, education alignment, and professional narrative.
                                                </p>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    <strong>Title Match:</strong> Deterministic scoring comparing the candidate's last title to the position (Exact = 100, Partial = 60).
                                                </p>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <h5 className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Recency & Flags</h5>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    <strong>Exp. Recency:</strong> Categorized as High/Medium/Low based on how recently the candidate held a relevant technical role.
                                                </p>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    <strong>Red Flags:</strong> Automated detection of employment gaps (&gt; 6 months), job-hopping, or industry mismatch.
                                                </p>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <h5 className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Deciding Factors</h5>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    The scan results page features a special <strong>Deciding Factors</strong> section that highlights top strengths and critical concerns extracted from the resume metadata.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 4: Talent Management */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Talent Pool & History Table
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-3">
                                            <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                <FolderSearch className="w-4 h-4 text-indigo-600" />
                                                Global Talent Pool
                                            </div>
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                Candidates are organized into a nested structure: <strong>Company Folder</strong> → <strong>Role Subfolder</strong>. Candidates appear under the template they matched most closely. The UI handles empty roles gracefully to maintain a clean workspace.
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-3">
                                            <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                <Table className="w-4 h-4 text-indigo-600" />
                                                Interactive History
                                            </div>
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                The history table includes advanced filters for <strong>Nationality</strong>, <strong>Location</strong>, and <strong>Gender</strong>. Every record features <strong>Select</strong> and <strong>Reject</strong> buttons for manual human-in-the-loop evaluation.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 5: Dynamic Configuration */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Position & Role Configuration
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                    <FileJson className="w-4 h-4 text-indigo-600" />
                                                    Position Templates
                                                </div>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    Templates store specific requirements for screening. They include a mandatory <strong>Company</strong> field and an <strong>AI Quick Entry</strong> feature that can parse a natural language job description to fill out the form automatically.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                    <Briefcase className="w-4 h-4 text-indigo-600" />
                                                    Company Roles Master
                                                </div>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    The <strong>Admin Tab</strong> manages the master roles list. It features an inline <strong>Add Role</strong> form and an <strong>Import from Excel</strong> utility that automatically maps roles to the correct company based on name matching.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4">
                                        <Shield className="w-6 h-6 text-amber-600 flex-shrink-0" />
                                        <div className="space-y-1">
                                            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Dynamic Company Engine</h4>
                                            <p className="text-[11px] text-amber-800 leading-relaxed">
                                                All company-specific logic is <strong className="text-amber-950 underline decoration-amber-300">zero-hardcoded</strong>. The system fetches live data from the <strong>Company</strong> entity to populate filters, dashboards, and role assignments ensuring the platform scales as new companies are added.
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : activeSection === 'Developer and Admin Tools' ? (
                            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">
                                {/* Header Section */}
                                <header className="space-y-3">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100">
                                        <Terminal className="w-3 h-3" />
                                        System Administration
                                    </div>
                                    <h2 className="text-4xl font-black text-[#0F1E36] tracking-tight">Developer & Admin Tools</h2>
                                    <p className="text-slate-500 text-lg leading-relaxed max-w-3xl">
                                        The control center for system-wide configurations, security audits, and development tracking. These tools are restricted to high-level administrators and developers.
                                    </p>
                                </header>

                                {/* Section 1: Security & Auditing */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Security & Audit Trail
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                    <History className="w-4 h-4 text-indigo-600" />
                                                    Audit Logs
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Admin Only</span>
                                            </div>
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                The <strong>Audit Logs</strong> page provides a searchable chronological record of all critical system events. It tracks <strong>Who</strong> (user email), <strong>What</strong> (action taken), <strong>When</strong> (UAE timestamp), and <strong>Details</strong> (exact field changes). It is the primary tool for investigating data discrepancies or unauthorized changes.
                                            </p>
                                        </div>
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                                    Maintenance Settings
                                                </div>
                                                <span className="text-[10px] font-bold text-red-400 uppercase tracking-tighter">Emergency</span>
                                            </div>
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                Administrators can activate <strong>Maintenance Mode</strong> to block all non-admin users during system upgrades. Additionally, this page manages the <strong>Salary PIN</strong>, a second layer of security required to view or modify sensitive payroll data even after logging in.
                                            </p>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 2: Core Configurations */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Business Rules & Branding
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                                            <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                <Settings className="w-4 h-4 text-indigo-600" />
                                                Attendance Rules
                                            </div>
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                The <strong>Rules Settings</strong> page is the logic engine of the system. It defines how the analyzer interprets data, including:
                                            </p>
                                            <ul className="text-[10px] text-slate-500 space-y-2 list-disc list-inside bg-white p-4 rounded-xl border border-slate-100">
                                                <li><strong>Grace Minutes:</strong> Customizable per department (e.g., 15m for Ops, 0m for Admin).</li>
                                                <li><strong>Multi-Punch Filtering:</strong> Time windows to ignore accidental double-punches.</li>
                                                <li><strong>Abnormal Dates:</strong> Marking specific dates as non-working or special days.</li>
                                            </ul>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                                            <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                <Paintbrush className="w-4 h-4 text-indigo-600" />
                                                Company Branding
                                            </div>
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                This page manages the visual identity of each subsidiary. Admins can upload <strong>Company Logos</strong>, define <strong>Primary/Secondary HSL Colors</strong>, and set <strong>Font Families</strong>. It also serves as the master list for active <strong>Departments</strong> within each company.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-6 space-y-4">
                                        <div className="flex items-center gap-2 font-bold text-sm text-indigo-900">
                                            <Calendar className="w-4 h-4 text-indigo-600" />
                                            Working Days Calendar & Calendar Periods
                                        </div>
                                        <p className="text-[11px] text-indigo-800 leading-relaxed">
                                            This centralized tool manages public holidays and authoritative period cutoff dates for the new calendar-based payroll system. The newly added Calendar Periods list and detail pages utilize these dates, backed by two new scalable backend functions (<code>runCalendarAnalysis</code> and <code>createCalendarSalarySnapshots</code>), operating entirely independently from the legacy project system. The CalendarPeriodDetail page renders four dedicated tab components (<code>PeriodRunAnalysisTab</code>, <code>PeriodReportDetailView</code>, <code>PeriodExceptionsTab</code>, <code>PeriodOvertimeTab</code>) under <code>src/components/period-tabs/</code>, each adapted from their project-tabs counterparts with all project references replaced by calendar-period equivalents.
                                        </p>
                                    </div>
                                </section>

                                {/* Section 3: Development & Permissions */}
                                <section className="space-y-6">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                        Developer Portal & Permissions
                                    </h3>
                                    <div className="bg-[#0F172A] border border-slate-800 rounded-3xl p-8 relative overflow-hidden group">
                                        <div className="relative z-10 grid md:grid-cols-3 gap-8">
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm text-white">
                                                    <Terminal className="w-4 h-4" />
                                                    Change Tracker
                                                </div>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    Internal <strong>Kanban Board</strong> for tracking development progress. It divides tasks into <strong>Changes</strong>, <strong>User Requests</strong>, and <strong>CEO Approvals</strong>. Every dev task includes a priority level and real-time status updates.
                                                </p>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm text-white">
                                                    <Key className="w-4 h-4" />
                                                    Fine-Grained Permissions
                                                </div>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    While default roles (Admin, CEO, etc.) provide base access, the <strong>Page Permissions</strong> utility (within Users & Permissions) allows admins to whitelist or blacklist specific pages for individual roles on the fly.
                                                </p>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm text-white">
                                                    <Code className="w-4 h-4" />
                                                    Internal Documentation
                                                </div>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    The system includes two sets of manuals: <strong>Technical Documentation</strong> for architects (covering entity schemas, UAE timezone standards, and API logic) and <strong>Software Documentation</strong> (this page) for operational users.
                                                 </p>
                                             </div>
                                         </div>
                                         <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[120px] rounded-full -mr-32 -mt-32"></div>
                                     </div>
                                 </section>

                                 {/* Section 4: Restricted Admin Actions */}
                                 <section className="space-y-6 text-left">
                                     <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                         <span className="w-1.5 h-6 bg-indigo-600 rounded-full"></span>
                                         Admin-Only Restricted Utilities
                                     </h3>
                                     <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex gap-4">
                                         <Shield className="w-6 h-6 text-red-600 flex-shrink-0" />
                                         <div className="space-y-1">
                                             <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider">Critical Guardrails</h4>
                                             <p className="text-[11px] text-red-800 leading-relaxed">
                                                 Operations such as <strong>Role Elevation</strong>, <strong>Project Re-opening</strong> (unlocking closed payroll months), <strong>Global Sync</strong> for permissions, and <strong>Email Domain Restrictions</strong> are strictly limited to the 'Admin' role. These restrictions prevent accidental data corruption and ensure compliance with company security policies.
                                             </p>
                                         </div>
                                     </div>

                                     {/* Update Note */}
                                     <div className="mt-8 p-4 bg-white/50 border border-slate-200 rounded-2xl flex gap-3 text-[11px] text-slate-500 italic">
                                         <Info className="w-4 h-4 flex-shrink-0 text-indigo-600" />
                                         <p className="leading-relaxed">
                                             <strong>Title Update:</strong> Several page titles across the Admin and HR modules were standardized (e.g., adding 'Management' and 'Settings' suffixes) to improve navigation clarity. This change ensures consistent terminology throughout the platform's configuration and user interface.
                                         </p>
                                     </div>
                                 </section>
                             </div>
                        ) : activeSection === "Business Rules Reference" ? (
                            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24 text-left">
                                 {/* Header Section */}
                                <header className="space-y-3">
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-100">
                                        <Scale className="w-3 h-3" />
                                        Compliance & Logic Reference
                                    </div>
                                    <h2 className="text-4xl font-black text-[#0F1E36] tracking-tight">Business Rules Reference</h2>
                                    <p className="text-slate-500 text-lg leading-relaxed max-w-3xl">
                                        A centralized registry of all critical logic gates, calculation rules, and company-specific constraints enforced by the attendance and payroll engine.
                                    </p>
                                </header>

                                {/* Section 1: Company Scoping */}
                                <section className="space-y-6 text-left">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                                        Company Scoping Rules
                                    </h3>
                                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-6 py-4">Constraint</th>
                                                    <th className="px-6 py-4">Enforcement Logic</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 italic">
                                                <tr className="text-[11px] text-slate-600">
                                                    <td className="px-6 py-4 font-bold text-slate-900 not-italic">Entity Isolation</td>
                                                    <td className="px-6 py-4 leading-relaxed">
                                                        Al Maraghi Motors features must filter by company name and never apply to other group companies.
                                                    </td>
                                                </tr>
                                                <tr className="text-[11px] text-slate-600">
                                                    <td className="px-6 py-4 font-bold text-slate-900 not-italic">Motors-Only Benefits</td>
                                                    <td className="px-6 py-4 leading-relaxed">
                                                        Open leave salary, variable salary, Ramadan gift minutes, and grace carry-forward are <strong className="text-slate-950">Al Maraghi Motors only</strong>.
                                                    </td>
                                                </tr>
                                                <tr className="text-[11px] text-slate-600">
                                                    <td className="px-6 py-4 font-bold text-slate-900 not-italic">Operations OT Rule</td>
                                                    <td className="px-6 py-4 leading-relaxed">
                                                        Applies to all companies — only the higher of incentive or overtime is applied for employees in a department named exactly <strong className="text-slate-950">Operations</strong>.
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </section>

                                {/* Section 2: Punch Completeness */}
                                <section className="space-y-6 text-left">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                                        Attendance Punch Completeness Rule
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6 text-left">
                                        <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4">
                                            <h4 className="flex items-center gap-2 text-amber-400 font-bold text-sm uppercase tracking-wider">Single Shift Logic</h4>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center text-[11px] border-b border-white/10 pb-2">
                                                    <span>0 Punches</span>
                                                    <span className="font-bold text-red-400">Absent LOP</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px] border-b border-white/10 pb-2">
                                                    <span>1 Punch</span>
                                                    <span className="font-bold text-amber-400">Half Day (from existing punch only)</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px] pb-2">
                                                    <span>2 Punches</span>
                                                    <span className="font-bold text-emerald-400">Present (Normal calculation)</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4 text-left">
                                            <h4 className="flex items-center gap-2 text-amber-400 font-bold text-sm uppercase tracking-wider">Split Shift Logic</h4>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center text-[11px] border-b border-white/10 pb-2">
                                                    <span>0 Punches</span>
                                                    <span className="font-bold text-red-400">Absent LOP</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px] border-b border-white/10 pb-2">
                                                    <span>1 or 2 Punches</span>
                                                    <span className="font-bold text-amber-400">Half Day (from existing punches only)</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[11px] pb-2">
                                                    <span>3 or 4 Punches</span>
                                                    <span className="font-bold text-emerald-400">Present (Normal calculation)</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-[11px] text-amber-900">
                                        <Info className="w-4 h-4 flex-shrink-0" />
                                        <p className="leading-relaxed">
                                            <strong>Guardrails:</strong> Midnight carry-forward <strong>always runs before</strong> punch count is evaluated. Only <code className="bg-amber-100 px-1 rounded text-amber-950 font-bold">SKIP_PUNCH</code> and <code className="bg-amber-100 px-1 rounded text-amber-950 font-bold">FULL_SKIP</code> exceptions can bypass this rule.
                                        </p>
                                    </div>
                                </section>

                                {/* Section 3: Half Yearly Minutes */}
                                <section className="space-y-6 text-left">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                                        Half Yearly Minutes Rules
                                    </h3>
                                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                                        <div className="grid md:grid-cols-2 gap-8">
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                    <Coins className="w-4 h-4 text-amber-600" />
                                                    Quota & Persistence
                                                </div>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    Each employee receives <strong>120 minutes</strong> per half-year block (H1: Jan–Jun, H2: Jul–Dec). The <code>half</code> field must store values 1 or 2; the quarter field must <strong>never</strong> be used in new code.
                                                </p>
                                            </div>
                                            <div className="space-y-4 text-left">
                                                <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                                                    <HandCoins className="w-4 h-4 text-amber-600" />
                                                    Approvals & Overages
                                                </div>
                                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                                    Dept heads consume minutes via the pre-approval dialog; Admin and CEO have <strong>no limit</strong>. AGM self-approvals now support the full project period without the standard 5-day restriction, and the "Both" option has been removed from pre-approvals to prioritize specific record targeting.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 4: Grace & Raw Fields */}
                                <section className="space-y-6 text-left">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                                        Grace Minutes & Raw Fields
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6 text-left">
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                                            <h4 className="font-bold text-slate-900 text-sm">Grace Minutes Persistence</h4>
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                <code>GraceMinutesManagement</code> and <code>Employee.carried_grace_minutes</code> must <strong>always</strong> be written together—never one without the other. Unused grace is computed as: <br />
                                                <code className="text-amber-700 font-bold block mt-2 text-[10px]">max(0, effective_grace - raw_late + raw_early_checkout)</code>
                                            </p>
                                            <div className="flex items-center gap-2 text-[10px] text-red-600 font-bold uppercase">
                                                <AlertCircle className="w-3 h-3" />
                                                Zero-Grace Rule: &gt; 2 annual leave days in project
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4 text-left">
                                            <h4 className="font-bold text-slate-900 text-sm">Raw Attendance Field Integrity</h4>
                                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                                Raw <code>late_minutes</code> and <code>early_checkout_minutes</code> in <code>AnalysisResult</code> must <strong>never</strong> be modified by approved minutes. Approved minutes only affect <code>deductible_minutes</code>.
                                            </p>
                                            <div className="p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-mono text-slate-500">
                                                // Strict isSingleShift detection <br />
                                                shift.is_single_shift === true (strict boolean equality)
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Section 5: LOP & Holidays */}
                                <section className="space-y-6 text-left">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                                        LOP Adjacent Rules
                                    </h3>
                                    <div className="bg-slate-900 rounded-3xl p-8 relative overflow-hidden text-left">
                                        <div className="relative z-10 grid md:grid-cols-2 gap-8 text-white">
                                            <div className="space-y-4">
                                                <h4 className="font-bold text-slate-200 text-sm">Annual Leave Exemptions</h4>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    Weekly off or public holiday days within an employee <strong>annual leave</strong> date range are <strong>exempt</strong> from LOP adjacent salary deduction.
                                                </p>
                                            </div>
                                            <div className="space-y-4 text-left">
                                                <h4 className="font-bold text-slate-200 text-sm">Non-Covered Adjacency</h4>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                    Weekly off and public holiday days not covered by annual leave are subject to <strong>full LOP adjacent deduction</strong> if surrounding days are LOP. If LOP surrounds a public holiday, the <strong>entire connected block</strong> becomes full LOP.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[120px] rounded-full -mr-32 -mt-32"></div>
                                    </div>
                                </section>

                                {/* Section 6: System Processing */}
                                <section className="space-y-6 text-left pb-12">
                                    <h3 className="text-xl font-bold text-[#0F1E36] flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                                        System Processing Rules
                                    </h3>
                                    <div className="grid md:grid-cols-2 gap-6 text-left">
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start gap-4">
                                            <Activity className="w-6 h-6 text-indigo-600 flex-shrink-0" />
                                            <div className="space-y-1">
                                                <h5 className="font-bold text-slate-900 text-sm">Batching Guardrails</h5>
                                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                                    Any function processing multiple employee records must batch in <strong>groups of 10</strong> with <strong>300 millisecond delays</strong> to preserve backend stability.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-start gap-4 text-left">
                                            <UserCheck className="w-6 h-6 text-indigo-600 flex-shrink-0" />
                                            <div className="space-y-1">
                                                <h5 className="font-bold text-slate-900 text-sm">Persistence & Identity</h5>
                                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                                    Employee name is always <strong>Abaidullah</strong> never Obaidullah. The debounce for rapid leave changes uses an <strong>in-memory Map</strong> not shared across parallel instances.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : (
                            /*
                                SECTION PLACEHOLDER
                                Default view for sections that have not yet been implemented.
                            */
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
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
