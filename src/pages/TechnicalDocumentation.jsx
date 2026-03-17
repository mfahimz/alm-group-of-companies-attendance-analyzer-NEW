import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Code, Database, Workflow, Lock, AlertTriangle, Book, ChevronDown, ChevronRight } from 'lucide-react';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function TechnicalDocumentation() {
    const [expandedSection, setExpandedSection] = useState('overview');

    const toggleSection = (section) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    const Section = ({ id, title, icon: Icon, children }) => {
        const isExpanded = expandedSection === id;
        return (
            <Card className="border-0 shadow-sm">
                <CardHeader 
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleSection(id)}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <Icon className="w-5 h-5 text-indigo-600" />
                            </div>
                            <CardTitle className="text-lg">{title}</CardTitle>
                        </div>
                        {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                        ) : (
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                        )}
                    </div>
                </CardHeader>
                {isExpanded && (
                    <CardContent className="prose prose-slate max-w-none text-sm">
                        {children}
                    </CardContent>
                )}
            </Card>
        );
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <Breadcrumb items={[
                { label: 'Settings', href: 'RulesSettings' },
                { label: 'Technical Documentation' }
            ]} />
            
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-4">
                    <Code className="w-8 h-8 text-indigo-600" />
                </div>
                <h1 className="text-4xl font-bold text-slate-900">ALM Attendance System</h1>
                <h2 className="text-2xl font-semibold text-slate-700 mt-2">Technical Software Documentation</h2>
                <p className="text-sm text-slate-600 mt-3">Complete architectural reference for developers, auditors, and maintainers</p>
            </div>

            <div className="space-y-4">
                {/* System Overview */}
                <Section id="overview" title="1. System Overview" icon={Book}>
                    <h3 className="text-xl font-semibold mt-0">Purpose</h3>
                    <p>
                        The ALM Attendance Tracking System is an enterprise-grade attendance analysis platform designed to 
                        process raw biometric punch data and produce auditable payroll-ready reports. The system solves the 
                        problem of manual attendance calculation by automating the complex rule-based analysis of employee 
                        clock-in/clock-out records against configured shift schedules.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Core Problems Solved</h3>
                    <ul>
                        <li><strong>Manual Calculation Overhead:</strong> Eliminates hours of manual timesheet processing</li>
                        <li><strong>Inconsistent Rule Application:</strong> Ensures uniform application of attendance policies across all employees</li>
                        <li><strong>Audit Trail Gaps:</strong> Provides immutable historical records with full traceability</li>
                        <li><strong>Exception Management:</strong> Systematically handles holidays, leaves, shift changes, and special cases</li>
                        <li><strong>Multi-Company Segregation:</strong> Isolates attendance data across multiple companies within a single tenant</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">System Boundaries</h3>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <p className="font-semibold mb-2">What This System Does:</p>
                        <ul>
                            <li>Imports and stores punch records from biometric devices (CSV format)</li>
                            <li>Defines and manages shift schedules per employee</li>
                            <li>Applies configurable attendance rules and exceptions</li>
                            <li>Calculates attendance metrics (late, early, absent, half-day)</li>
                            <li>Generates exportable reports for payroll integration</li>
                            <li>Manages multi-level approval workflows (department heads, HR)</li>
                        </ul>

                        <p className="font-semibold mb-2 mt-4">What This System Does NOT Do:</p>
                        <ul>
                            <li>Direct integration with biometric hardware (requires CSV export)</li>
                            <li>Payroll calculation or disbursement</li>
                            <li>Employee onboarding or HRMS functions</li>
                            <li>Time tracking for project billing</li>
                        </ul>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Scale Assumptions</h3>
                    <p>System is designed and tested for:</p>
                    <ul>
                        <li><strong>Companies:</strong> Up to 50 companies per tenant</li>
                        <li><strong>Employees:</strong> Up to 5,000 employees per company</li>
                        <li><strong>Projects:</strong> Up to 100 concurrent active projects</li>
                        <li><strong>Punches:</strong> Up to 10 million punch records per project (30-day period × 5,000 employees × 8 punches/day)</li>
                        <li><strong>Analysis Performance:</strong> Client-side analysis for up to 500 employees/project; batch processing for larger datasets</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Platform Restrictions</h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900 mb-2">Desktop-Only Policy</h4>
                        <p className="text-sm text-red-800 mb-2">
                            This application is intentionally restricted to desktop devices only. Mobile phones and tablets are blocked.
                        </p>
                        <p className="text-sm text-red-800 mb-2"><strong>Reason:</strong></p>
                        <ul className="text-sm text-red-700">
                            <li>Complex data tables require large screens for usability</li>
                            <li>Excel export workflows are optimized for desktop browsers</li>
                            <li>Multi-step attendance analysis requires desktop tools</li>
                            <li>File upload and CSV parsing need desktop file system access</li>
                        </ul>
                        <p className="text-sm text-red-800 mt-3"><strong>Device Detection Logic:</strong></p>
                        <ul className="text-sm text-red-700">
                            <li>Screen width must be ≥ 1024px</li>
                            <li>User agent must NOT indicate mobile/tablet</li>
                            <li>Primary pointer type must be "fine" (mouse/trackpad, not touch)</li>
                        </ul>
                        <p className="text-sm text-red-800 mt-3">
                            <strong>Implementation:</strong> Device check runs globally before authentication and route loading. 
                            Resize events dynamically block access if window is resized below threshold.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Maintenance Mode</h3>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <h4 className="font-semibold text-amber-900 mb-2">System Maintenance Access Control</h4>
                        <p className="text-sm text-amber-800 mb-2">
                            System administrators can enable maintenance mode to restrict access during system updates or critical maintenance.
                        </p>
                        <p className="text-sm text-amber-800 mb-2"><strong>Behavior:</strong></p>
                        <ul className="text-sm text-amber-700">
                            <li><strong>Admin:</strong> Full access - can navigate all pages and perform all operations</li>
                            <li><strong>All Other Roles (CEO, Supervisor, Department Head, User):</strong> Redirected to Maintenance page with blocking message</li>
                        </ul>
                        <p className="text-sm text-amber-800 mt-3"><strong>Storage:</strong></p>
                        <ul className="text-sm text-amber-700">
                            <li>Setting stored in SystemSettings entity with setting_key = 'MAINTENANCE_MODE'</li>
                            <li>setting_value = 'true' activates maintenance mode</li>
                            <li>Cached for 5 minutes to reduce database load</li>
                        </ul>
                        <p className="text-sm text-amber-800 mt-3">
                            <strong>Implementation:</strong> Check runs in Layout.js after authentication. Only users with role='admin' bypass the restriction.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Timezone Standard</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-900 mb-2">UAE Time (Asia/Dubai, UTC+4)</h4>
                        <p className="text-sm text-blue-800 mb-2">
                            All dates, times, and timestamps use UAE timezone exclusively. System behavior never depends on user's local device time.
                        </p>
                        <p className="text-sm text-blue-800 mb-2"><strong>What Uses UAE Time:</strong></p>
                        <ul className="text-sm text-blue-700">
                            <li>Punch timestamps and attendance calculations</li>
                            <li>Shift start/end time comparisons</li>
                            <li>Day boundaries (00:00–23:59 UAE time)</li>
                            <li>Approval timestamps and audit logs</li>
                            <li>Reports and Excel exports</li>
                        </ul>
                        <p className="text-sm text-blue-800 mt-3"><strong>Storage Strategy:</strong></p>
                        <ul className="text-sm text-blue-700">
                            <li>Database stores timestamps in UTC format</li>
                            <li>Frontend converts all timestamps to UAE time before display</li>
                            <li>All calculations performed in UAE timezone context</li>
                        </ul>
                        <p className="text-sm text-blue-800 mt-3"><strong>Utility Functions:</strong></p>
                        <ul className="text-sm text-blue-700 font-mono text-xs">
                            <li>formatInUAE() - Format dates in UAE timezone</li>
                            <li>nowInUAE() - Get current UAE time</li>
                            <li>uaeToUTC() - Convert UAE to UTC for storage</li>
                            <li>utcToUAE() - Convert UTC to UAE for display</li>
                            <li>startOfDayUAE() - Get 00:00 UAE time for date</li>
                            <li>endOfDayUAE() - Get 23:59 UAE time for date</li>
                        </ul>
                        <p className="text-sm text-blue-800 mt-3">
                            <strong>Critical Rule:</strong> Never use raw `new Date()` or browser local time for attendance logic. 
                            Always use centralized timezone utilities from `components/ui/timezone.jsx`.
                        </p>
                    </div>
                </Section>

                {/* Architecture Overview */}
                <Section id="architecture" title="2. Architecture Overview" icon={Code}>
                    <h3 className="text-xl font-semibold mt-0">Technology Stack</h3>
                    
                    <div className="grid md:grid-cols-2 gap-4 mb-6">
                        <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50">
                            <h4 className="font-semibold text-indigo-900">Frontend</h4>
                            <ul className="text-sm mt-2">
                                <li><strong>Framework:</strong> React 18 (function components + hooks)</li>
                                <li><strong>State Management:</strong> TanStack React Query v5</li>
                                <li><strong>Routing:</strong> React Router v6</li>
                                <li><strong>UI Library:</strong> Shadcn/ui (Radix UI primitives)</li>
                                <li><strong>Styling:</strong> Tailwind CSS</li>
                                <li><strong>Build Tool:</strong> Vite</li>
                            </ul>
                        </div>

                        <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                            <h4 className="font-semibold text-purple-900">Backend (Base44 BaaS)</h4>
                            <ul className="text-sm mt-2">
                                <li><strong>Platform:</strong> Base44 Backend-as-a-Service</li>
                                <li><strong>Database:</strong> PostgreSQL (managed)</li>
                                <li><strong>Authentication:</strong> Email/password (Base44 Auth)</li>
                                <li><strong>Storage:</strong> File storage for CSV uploads and exports</li>
                                <li><strong>Functions:</strong> Deno serverless functions</li>
                            </ul>
                        </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Frontend Responsibilities</h3>
                    <ul>
                        <li><strong>UI Rendering:</strong> All pages and components rendered client-side</li>
                        <li><strong>Business Logic:</strong> Attendance analysis engine runs entirely in browser (see RunAnalysisTab.jsx)</li>
                        <li><strong>Data Validation:</strong> CSV parsing and validation before server upload</li>
                        <li><strong>State Caching:</strong> React Query manages server state with aggressive caching (15-30 minute staleTime)</li>
                        <li><strong>Optimistic Updates:</strong> UI updates before server confirmation for better UX</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Backend Responsibilities</h3>
                    <ul>
                        <li><strong>Data Persistence:</strong> CRUD operations for all entities</li>
                        <li><strong>Authentication:</strong> User login, session management, role enforcement</li>
                        <li><strong>Authorization:</strong> Page-level and entity-level access control</li>
                        <li><strong>File Storage:</strong> CSV uploads, Excel exports, private file management</li>
                        <li><strong>Audit Logging:</strong> User activity tracking (login, critical operations)</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Security Model</h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900">Role-Based Access Control (RBAC)</h4>
                        <p>The system implements a hierarchical role model with page-level permissions:</p>
                        <ul className="text-sm mt-2">
                            <li><strong>Admin:</strong> Full system access (CRUD on all entities, system configuration)</li>
                            <li><strong>Supervisor:</strong> Project and employee management, analysis execution, no settings access</li>
                            <li><strong>CEO:</strong> Read-only access to all data, no modification rights except settings</li>
                            <li><strong>Department Head:</strong> Pre-approval dashboard only, scoped to assigned department</li>
                            <li><strong>User:</strong> Configurable page-level access via PagePermission entity</li>
                        </ul>
                        <p className="mt-3 text-sm">
                            <strong>Implementation:</strong> Role checks performed in Layout.jsx for page access, individual components 
                            enforce action-level permissions. Backend validates role on mutation operations.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Data Flow Summary</h3>
                    <ol className="text-sm">
                        <li><strong>Upload:</strong> CSV file → Frontend parsing → Base44 SDK creates Punch/ShiftTiming entities</li>
                        <li><strong>Configuration:</strong> User defines exceptions, rules → Stored in Exception/AttendanceRules entities</li>
                        <li><strong>Analysis:</strong> Frontend fetches all entities → Runs analysis algorithm → Saves AnalysisResult entities</li>
                        <li><strong>Reporting:</strong> Frontend fetches AnalysisResult → Renders report → Export to Excel</li>
                        <li><strong>Salary:</strong> AnalysisResult + EmployeeSalary → Calculated deductions → Saved to EmployeeSalary entity</li>
                    </ol>
                </Section>

                {/* Core Domain Concepts */}
                <Section id="domain" title="3. Core Domain Concepts" icon={Database}>
                    <h3 className="text-xl font-semibold mt-0">Company</h3>
                    <p>
                        A <strong>Company</strong> is the top-level organizational unit for data segregation. All employees, projects, 
                        and attendance data are scoped to a single company. Users with role "admin", "supervisor", or "ceo" can access 
                        all companies; regular users are assigned to one company via the User.company field.
                    </p>
                    <p className="text-xs text-slate-600 mt-2">
                        <strong>Key Constraint:</strong> Company names are free-text and not enforced as entities. Consistency is maintained 
                        through UI dropdowns populated from Employee.company values.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Department</h3>
                    <p>
                        A <strong>Department</strong> is a sub-division within a company (e.g., "HR", "Engineering"). Departments are used 
                        for filtering employees and projects. Departments are managed via CompanySettings entity which stores a comma-separated 
                        list per company.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Employee</h3>
                    <p>
                        An <strong>Employee</strong> represents a worker whose attendance is tracked. Each employee has:
                    </p>
                    <ul>
                        <li><strong>HRMS ID:</strong> Globally unique identifier across all companies</li>
                        <li><strong>Attendance ID:</strong> Unique within a company, used to match punch and shift records</li>
                        <li><strong>Company & Department:</strong> Organizational affiliation</li>
                        <li><strong>Weekly Off:</strong> Default off day (Sunday, Monday, etc.)</li>
                    </ul>
                    <p className="text-xs text-slate-600 mt-2">
                        <strong>Critical Detail:</strong> Attendance ID is stored as NUMBER but must be unique only within a company. 
                        HRMS ID is the true unique identifier across the system.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Project</h3>
                    <p>
                        A <strong>Project</strong> is a time-bound analysis period (typically one month). All punch records, shift timings, 
                        and exceptions are scoped to a project. Projects have lifecycle states:
                    </p>
                    <ul>
                        <li><strong>draft:</strong> Initial state, data can be uploaded and edited freely</li>
                        <li><strong>analyzed:</strong> Analysis has been run, report generated, still editable</li>
                        <li><strong>locked:</strong> No longer editable (deprecated, replaced by "closed")</li>
                        <li><strong>closed:</strong> Final state after salary save, completely read-only</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Shift</h3>
                    <p>
                        A <strong>Shift</strong> (ShiftTiming entity) defines expected work hours for an employee on specific days. Shifts 
                        are split into AM and PM segments:
                    </p>
                    <ul>
                        <li><strong>AM Shift:</strong> am_start to am_end (e.g., 08:00 to 12:00)</li>
                        <li><strong>PM Shift:</strong> pm_start to pm_end (e.g., 13:00 to 17:00)</li>
                        <li><strong>Applicable Days:</strong> Days this shift applies (e.g., "Monday-Thursday & Saturday")</li>
                        <li><strong>Single Shift Mode:</strong> Some employees have no break (is_single_shift = true, only am_start and pm_end used)</li>
                    </ul>
                    <p className="text-xs text-slate-600 mt-2">
                        <strong>Friday Shifts:</strong> Friday is treated specially (different rules, shorter hours). Friday shifts are 
                        auto-detected and flagged with is_friday_shift = true.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Punch</h3>
                    <p>
                        A <strong>Punch</strong> is a clock-in or clock-out event captured by a biometric device. Key properties:
                    </p>
                    <ul>
                        <li><strong>timestamp_raw:</strong> Original timestamp string (e.g., "02/10/2025 08:54 AM") - NEVER modified after upload</li>
                        <li><strong>punch_date:</strong> Extracted date for filtering (e.g., "2025-02-10")</li>
                        <li><strong>attendance_id:</strong> Links punch to employee</li>
                    </ul>
                    <p className="text-xs text-red-600 mt-2">
                        <strong>Critical Rule:</strong> timestamp_raw is immutable. All date/time parsing happens client-side during analysis. 
                        This ensures audit trail integrity.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Exception</h3>
                    <p>
                        An <strong>Exception</strong> overrides normal attendance calculation rules for specific dates/employees. Exception types:
                    </p>
                    <ul>
                        <li><strong>PUBLIC_HOLIDAY:</strong> attendance_id = "ALL", marks day as non-working for all employees</li>
                        <li><strong>SHIFT_OVERRIDE:</strong> Temporarily changes shift times for specific dates</li>
                        <li><strong>MANUAL_PRESENT/ABSENT:</strong> Forces attendance status regardless of punch data</li>
                        <li><strong>MANUAL_LATE/EARLY_CHECKOUT/OTHER_MINUTES:</strong> Manually adds or adjusts late/early minutes</li>
                        <li><strong>SICK_LEAVE/ANNUAL_LEAVE:</strong> Marks leave days (counted separately from absences)</li>
                        <li><strong>WEEKLY_OFF_OVERRIDE:</strong> Changes an employee's weekly off day for a date range</li>
                        <li><strong>ALLOWED_MINUTES:</strong> Pre-approved minutes (from dept head) deducted from late/early calculations</li>
                        <li><strong>CUSTOM:</strong> User-defined exception type (is_custom_type = true, never used in analysis)</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Analysis Run</h3>
                    <p>
                        An <strong>Analysis Run</strong> (ReportRun entity) represents a single execution of the attendance analysis algorithm. 
                        Multiple runs can exist per project (e.g., initial run, re-run after adding exceptions). Each run stores:
                    </p>
                    <ul>
                        <li><strong>date_from, date_to:</strong> Analysis period (can be subset of project date range)</li>
                        <li><strong>employee_count:</strong> Number of employees analyzed</li>
                        <li><strong>is_final:</strong> Whether this is the final report for salary calculation</li>
                        <li><strong>verified_employees:</strong> Comma-separated list of employee IDs marked as verified</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Salary</h3>
                    <p>
                        The <strong>EmployeeSalary</strong> entity stores per-employee salary information and calculated deductions:
                    </p>
                    <ul>
                        <li><strong>basic_salary:</strong> Base monthly salary</li>
                        <li><strong>total_deductions:</strong> Sum of all attendance-related deductions</li>
                        <li><strong>final_salary:</strong> basic_salary - total_deductions</li>
                        <li><strong>days_to_deduct:</strong> Full day absences + (half day absences / 2)</li>
                        <li><strong>minutes_to_deduct:</strong> (late_minutes + early_checkout_minutes + other_minutes - approved_minutes) / 60 / 8</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Grace Minutes vs Approved Minutes</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
                            <h4 className="font-semibold text-blue-900">Grace Minutes</h4>
                            <p className="text-sm text-blue-800">
                                <strong>Purpose:</strong> System-wide buffer before marking employee as late (typically 15 minutes). 
                                Applied automatically during analysis.
                            </p>
                            <p className="text-sm text-blue-800 mt-2">
                                <strong>Source:</strong> Configured in AttendanceRules.grace_period_minutes (default: 15).
                            </p>
                        </div>

                        <div className="border border-green-200 rounded-lg p-3 bg-green-50">
                            <h4 className="font-semibold text-green-900">Approved Minutes</h4>
                            <p className="text-sm text-green-800">
                                <strong>Purpose:</strong> Department head pre-approved minutes for specific reasons (e.g., hospital visit). 
                                Deducted from calculated late/early minutes.
                            </p>
                            <p className="text-sm text-green-800 mt-2">
                                <strong>Source:</strong> Created by department heads via DepartmentHeadDashboard, stored as ALLOWED_MINUTES exceptions.
                            </p>
                        </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Grace Minutes Carry-Forward (Al Maraghi Auto Repairs)</h3>
                    <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                        <h4 className="font-semibold text-amber-900 mb-2">EmployeeGraceHistory Entity</h4>
                        <p className="text-sm text-amber-800 mb-3">
                            <strong>Purpose:</strong> Audit trail for grace minutes carry-forward at project close. 
                            This is the authoritative source of truth for historical grace calculations.
                        </p>
                        <table className="text-xs w-full border-collapse mb-3">
                            <thead>
                                <tr className="bg-amber-100">
                                    <th className="border border-amber-300 p-2 text-left">Field</th>
                                    <th className="border border-amber-300 p-2 text-left">Type</th>
                                    <th className="border border-amber-300 p-2 text-left">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-amber-300 p-2 font-mono">employee_id</td>
                                    <td className="border border-amber-300 p-2">string</td>
                                    <td className="border border-amber-300 p-2">Employee HRMS ID</td>
                                </tr>
                                <tr>
                                    <td className="border border-amber-300 p-2 font-mono">source_project_id</td>
                                    <td className="border border-amber-300 p-2">string</td>
                                    <td className="border border-amber-300 p-2">Project that generated this carry-forward</td>
                                </tr>
                                <tr>
                                    <td className="border border-amber-300 p-2 font-mono">grace_minutes_available</td>
                                    <td className="border border-amber-300 p-2">number</td>
                                    <td className="border border-amber-300 p-2">Base + carried grace at start</td>
                                </tr>
                                <tr>
                                    <td className="border border-amber-300 p-2 font-mono">grace_minutes_used</td>
                                    <td className="border border-amber-300 p-2">number</td>
                                    <td className="border border-amber-300 p-2">late + early + other - approved</td>
                                </tr>
                                <tr>
                                    <td className="border border-amber-300 p-2 font-mono">grace_minutes_carried</td>
                                    <td className="border border-amber-300 p-2">number</td>
                                    <td className="border border-amber-300 p-2">max(0, available - used)</td>
                                </tr>
                                <tr>
                                    <td className="border border-amber-300 p-2 font-mono">carried_at</td>
                                    <td className="border border-amber-300 p-2">datetime</td>
                                    <td className="border border-amber-300 p-2">UAE timestamp of execution</td>
                                </tr>
                                <tr>
                                    <td className="border border-amber-300 p-2 font-mono">carried_by</td>
                                    <td className="border border-amber-300 p-2">string</td>
                                    <td className="border border-amber-300 p-2">Admin email who executed</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-sm text-amber-800 mb-2"><strong>Trigger Conditions:</strong></p>
                        <ul className="text-sm text-amber-700">
                            <li>Only runs on project close (via closeProject backend function)</li>
                            <li>Only if checkbox "Carry forward unused grace minutes" is checked (default: unchecked)</li>
                            <li>Only for company "Al Maraghi Auto Repairs"</li>
                            <li><strong>Daily Accrual Rule:</strong> Grace is 15 minutes per working day. Annual Leave days with zero punches accrue 0 minutes.</li>
                            <li>Idempotent: Checks for existing records before creating new ones</li>
                        </ul>
                        <p className="text-sm text-amber-800 mt-3"><strong>Data Flow:</strong></p>
                        <ol className="text-sm text-amber-700">
                            <li>Admin checks carry-forward checkbox in CloseProjectDialog</li>
                            <li>closeProject.js validates company and idempotency</li>
                            <li>For each employee in AnalysisResult, calculates grace_minutes_carried</li>
                            <li>Creates EmployeeGraceHistory record (audit)</li>
                            <li>Updates Employee.carried_grace_minutes (derived current value)</li>
                            <li>Logs GRACE_CARRY_FORWARD action in AuditLog</li>
                        </ol>
                        <p className="text-xs text-amber-600 mt-3">
                            <strong>Design Note:</strong> Employee.carried_grace_minutes is a derived value for read convenience. 
                            EmployeeGraceHistory is the authoritative audit trail. Future projects use carried_grace_minutes 
                            when use_carried_grace_minutes is enabled.
                        </p>
                    </div>
                </Section>

                {/* Entity Reference */}
                <Section id="entities" title="4. Entity Reference" icon={Database}>
                    <p className="text-sm text-slate-600 mb-4">
                        This section documents all database entities, their fields, relationships, and constraints. 
                        All entities have built-in fields: id (UUID), created_date, updated_date, created_by (email).
                    </p>

                    {/* Employee Entity */}
                    <div className="border-2 border-indigo-300 rounded-lg p-4 mb-6 bg-indigo-50">
                        <h4 className="text-lg font-bold text-indigo-900 mb-3">Employee</h4>
                        <p className="text-sm mb-3"><strong>Purpose:</strong> Master employee registry with organizational affiliations</p>
                        
                        <table className="text-xs w-full border-collapse">
                            <thead>
                                <tr className="bg-indigo-100">
                                    <th className="border border-indigo-300 p-2 text-left">Field</th>
                                    <th className="border border-indigo-300 p-2 text-left">Type</th>
                                    <th className="border border-indigo-300 p-2 text-left">Constraints</th>
                                    <th className="border border-indigo-300 p-2 text-left">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-indigo-300 p-2 font-mono">hrms_id</td>
                                    <td className="border border-indigo-300 p-2">number</td>
                                    <td className="border border-indigo-300 p-2">required, unique</td>
                                    <td className="border border-indigo-300 p-2">Globally unique identifier across all companies</td>
                                </tr>
                                <tr>
                                    <td className="border border-indigo-300 p-2 font-mono">attendance_id</td>
                                    <td className="border border-indigo-300 p-2">number</td>
                                    <td className="border border-indigo-300 p-2">required</td>
                                    <td className="border border-indigo-300 p-2">Unique within company, matches biometric device ID</td>
                                </tr>
                                <tr>
                                    <td className="border border-indigo-300 p-2 font-mono">name</td>
                                    <td className="border border-indigo-300 p-2">string</td>
                                    <td className="border border-indigo-300 p-2">required</td>
                                    <td className="border border-indigo-300 p-2">Employee full name</td>
                                </tr>
                                <tr>
                                    <td className="border border-indigo-300 p-2 font-mono">company</td>
                                    <td className="border border-indigo-300 p-2">string</td>
                                    <td className="border border-indigo-300 p-2">required</td>
                                    <td className="border border-indigo-300 p-2">Company name (free-text, not FK)</td>
                                </tr>
                                <tr>
                                    <td className="border border-indigo-300 p-2 font-mono">department</td>
                                    <td className="border border-indigo-300 p-2">string</td>
                                    <td className="border border-indigo-300 p-2">optional</td>
                                    <td className="border border-indigo-300 p-2">Department name</td>
                                </tr>
                                <tr>
                                    <td className="border border-indigo-300 p-2 font-mono">weekly_off</td>
                                    <td className="border border-indigo-300 p-2">enum</td>
                                    <td className="border border-indigo-300 p-2">default: Sunday</td>
                                    <td className="border border-indigo-300 p-2">Default weekly off day</td>
                                </tr>
                                <tr>
                                    <td className="border border-indigo-300 p-2 font-mono">active</td>
                                    <td className="border border-indigo-300 p-2">boolean</td>
                                    <td className="border border-indigo-300 p-2">default: true</td>
                                    <td className="border border-indigo-300 p-2">Whether employee is currently active</td>
                                </tr>
                            </tbody>
                        </table>

                        <p className="text-xs text-red-700 mt-3 bg-red-50 border border-red-200 rounded p-2">
                            <strong>Common Failure:</strong> Duplicate attendance_id across companies will cause analysis errors. 
                            Always filter by company when querying employees for analysis.
                        </p>
                    </div>

                    {/* Project Entity */}
                    <div className="border-2 border-purple-300 rounded-lg p-4 mb-6 bg-purple-50">
                        <h4 className="text-lg font-bold text-purple-900 mb-3">Project</h4>
                        <p className="text-sm mb-3"><strong>Purpose:</strong> Analysis period container and data scope boundary</p>
                        
                        <table className="text-xs w-full border-collapse">
                            <thead>
                                <tr className="bg-purple-100">
                                    <th className="border border-purple-300 p-2 text-left">Field</th>
                                    <th className="border border-purple-300 p-2 text-left">Type</th>
                                    <th className="border border-purple-300 p-2 text-left">Constraints</th>
                                    <th className="border border-purple-300 p-2 text-left">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-purple-300 p-2 font-mono">name</td>
                                    <td className="border border-purple-300 p-2">string</td>
                                    <td className="border border-purple-300 p-2">required</td>
                                    <td className="border border-purple-300 p-2">Project display name</td>
                                </tr>
                                <tr>
                                    <td className="border border-purple-300 p-2 font-mono">company</td>
                                    <td className="border border-purple-300 p-2">string</td>
                                    <td className="border border-purple-300 p-2">required</td>
                                    <td className="border border-purple-300 p-2">Company this project belongs to</td>
                                </tr>
                                <tr>
                                    <td className="border border-purple-300 p-2 font-mono">date_from</td>
                                    <td className="border border-purple-300 p-2">date</td>
                                    <td className="border border-purple-300 p-2">required</td>
                                    <td className="border border-purple-300 p-2">Analysis period start</td>
                                </tr>
                                <tr>
                                    <td className="border border-purple-300 p-2 font-mono">date_to</td>
                                    <td className="border border-purple-300 p-2">date</td>
                                    <td className="border border-purple-300 p-2">required</td>
                                    <td className="border border-purple-300 p-2">Analysis period end</td>
                                </tr>
                                <tr>
                                    <td className="border border-purple-300 p-2 font-mono">status</td>
                                    <td className="border border-purple-300 p-2">enum</td>
                                    <td className="border border-purple-300 p-2">default: draft</td>
                                    <td className="border border-purple-300 p-2">draft | analyzed | locked | closed</td>
                                </tr>
                                <tr>
                                    <td className="border border-purple-300 p-2 font-mono">shift_blocks_count</td>
                                    <td className="border border-purple-300 p-2">number</td>
                                    <td className="border border-purple-300 p-2">default: 2, range: 1-5</td>
                                    <td className="border border-purple-300 p-2">Number of shift blocks for multi-phase projects</td>
                                </tr>
                            </tbody>
                        </table>

                        <p className="text-xs text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded p-2">
                            <strong>Business Constraint:</strong> Once status = 'closed', project becomes fully read-only. 
                            Only admins can reopen via closeProject backend function.
                        </p>
                    </div>

                    {/* Punch Entity */}
                    <div className="border-2 border-green-300 rounded-lg p-4 mb-6 bg-green-50">
                        <h4 className="text-lg font-bold text-green-900 mb-3">Punch</h4>
                        <p className="text-sm mb-3"><strong>Purpose:</strong> Raw clock-in/clock-out events from biometric devices</p>
                        
                        <table className="text-xs w-full border-collapse">
                            <thead>
                                <tr className="bg-green-100">
                                    <th className="border border-green-300 p-2 text-left">Field</th>
                                    <th className="border border-green-300 p-2 text-left">Type</th>
                                    <th className="border border-green-300 p-2 text-left">Constraints</th>
                                    <th className="border border-green-300 p-2 text-left">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-green-300 p-2 font-mono">project_id</td>
                                    <td className="border border-green-300 p-2">string (UUID)</td>
                                    <td className="border border-green-300 p-2">required, FK to Project</td>
                                    <td className="border border-green-300 p-2">Scope to project</td>
                                </tr>
                                <tr>
                                    <td className="border border-green-300 p-2 font-mono">attendance_id</td>
                                    <td className="border border-green-300 p-2">number</td>
                                    <td className="border border-green-300 p-2">required</td>
                                    <td className="border border-green-300 p-2">Employee attendance ID (not FK, joined via attendance_id + company)</td>
                                </tr>
                                <tr>
                                    <td className="border border-green-300 p-2 font-mono">timestamp_raw</td>
                                    <td className="border border-green-300 p-2">string</td>
                                    <td className="border border-green-300 p-2">required, immutable</td>
                                    <td className="border border-green-300 p-2">Original timestamp (e.g., "02/10/2025 08:54 AM")</td>
                                </tr>
                                <tr>
                                    <td className="border border-green-300 p-2 font-mono">punch_date</td>
                                    <td className="border border-green-300 p-2">date</td>
                                    <td className="border border-green-300 p-2">required</td>
                                    <td className="border border-green-300 p-2">Extracted date for filtering (e.g., "2025-02-10")</td>
                                </tr>
                            </tbody>
                        </table>

                        <p className="text-xs text-red-700 mt-3 bg-red-50 border border-red-200 rounded p-2">
                            <strong>CRITICAL:</strong> timestamp_raw is NEVER modified after creation. All parsing happens at analysis time. 
                            This ensures audit trail integrity and allows re-analysis with different rules.
                        </p>
                    </div>

                    {/* Exception Entity */}
                    <div className="border-2 border-orange-300 rounded-lg p-4 mb-6 bg-orange-50">
                        <h4 className="text-lg font-bold text-orange-900 mb-3">Exception</h4>
                        <p className="text-sm mb-3"><strong>Purpose:</strong> Override normal attendance rules for specific dates/employees</p>
                        
                        <table className="text-xs w-full border-collapse">
                            <thead>
                                <tr className="bg-orange-100">
                                    <th className="border border-orange-300 p-2 text-left">Field</th>
                                    <th className="border border-orange-300 p-2 text-left">Type</th>
                                    <th className="border border-orange-300 p-2 text-left">Constraints</th>
                                    <th className="border border-orange-300 p-2 text-left">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-orange-300 p-2 font-mono">project_id</td>
                                    <td className="border border-orange-300 p-2">string</td>
                                    <td className="border border-orange-300 p-2">required</td>
                                    <td className="border border-orange-300 p-2">Scope to project</td>
                                </tr>
                                <tr>
                                    <td className="border border-orange-300 p-2 font-mono">attendance_id</td>
                                    <td className="border border-orange-300 p-2">string</td>
                                    <td className="border border-orange-300 p-2">required</td>
                                    <td className="border border-orange-300 p-2">Employee ID or "ALL" for company-wide</td>
                                </tr>
                                <tr>
                                    <td className="border border-orange-300 p-2 font-mono">type</td>
                                    <td className="border border-orange-300 p-2">enum</td>
                                    <td className="border border-orange-300 p-2">required</td>
                                    <td className="border border-orange-300 p-2">Exception type (see domain concepts)</td>
                                </tr>
                                <tr>
                                    <td className="border border-orange-300 p-2 font-mono">date_from</td>
                                    <td className="border border-orange-300 p-2">date</td>
                                    <td className="border border-orange-300 p-2">required</td>
                                    <td className="border border-orange-300 p-2">Exception start date</td>
                                </tr>
                                <tr>
                                    <td className="border border-orange-300 p-2 font-mono">date_to</td>
                                    <td className="border border-orange-300 p-2">date</td>
                                    <td className="border border-orange-300 p-2">required</td>
                                    <td className="border border-orange-300 p-2">Exception end date</td>
                                </tr>
                                <tr>
                                    <td className="border border-orange-300 p-2 font-mono">use_in_analysis</td>
                                    <td className="border border-orange-300 p-2">boolean</td>
                                    <td className="border border-orange-300 p-2">default: true</td>
                                    <td className="border border-orange-300 p-2">Whether to apply this exception during analysis</td>
                                </tr>
                                <tr>
                                    <td className="border border-orange-300 p-2 font-mono">allowed_minutes</td>
                                    <td className="border border-orange-300 p-2">number</td>
                                    <td className="border border-orange-300 p-2">optional</td>
                                    <td className="border border-orange-300 p-2">Pre-approved minutes (ALLOWED_MINUTES type)</td>
                                </tr>
                            </tbody>
                        </table>

                        <p className="text-xs text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded p-2">
                            <strong>Overlap Handling:</strong> Multiple exceptions for same employee + date are allowed. 
                            Analysis applies them in priority order: MANUAL_* {`>`} PUBLIC_HOLIDAY {`>`} SHIFT_OVERRIDE {`>`} ALLOWED_MINUTES.
                        </p>
                    </div>

                    <p className="text-sm text-slate-600 mt-6">
                        For complete entity schemas including all fields, see entities/ directory in codebase. 
                        Additional entities: ShiftTiming, ReportRun, AnalysisResult, EmployeeSalary, AttendanceRules, PagePermission, 
                        CompanySettings, DepartmentHead, EmployeeQuarterlyMinutes, and more.
                    </p>
                </Section>

                {/* Critical Business Logic */}
                <Section id="logic" title="5. Critical Business Logic" icon={Workflow}>
                    <h3 className="text-xl font-semibold mt-0">Attendance Calculation Flow</h3>
                    <p>
                        The attendance analysis algorithm is implemented in <code>components/project-tabs/RunAnalysisTab.jsx</code> 
                        in the <code>analyzeEmployee</code> function. The flow is:
                    </p>
                    <ol className="text-sm">
                        <li><strong>Fetch All Data:</strong> Load punches, shifts, exceptions, rules for project</li>
                        <li><strong>Iterate Days:</strong> For each day in project date range:</li>
                        <ul>
                            <li>Check if day is weekly off or public holiday → skip or mark as OFF</li>
                            <li>Check for manual attendance exceptions → apply and continue</li>
                            <li>Fetch applicable shift timing for the day</li>
                            <li>Filter punches for the day</li>
                            <li>Match punches to AM and PM shift windows</li>
                            <li>Calculate late minutes (punch - shift_start - grace)</li>
                            <li>Calculate early checkout minutes (shift_end - punch - grace)</li>
                            <li>Apply ALLOWED_MINUTES exceptions (deduct from late/early)</li>
                            <li>Determine status: PRESENT, ABSENT, HALF</li>
                        </ul>
                        <li><strong>Aggregate Results:</strong> Sum up totals across all days</li>
                        <li><strong>Save to Database:</strong> Create/update AnalysisResult entity</li>
                    </ol>

                    <h3 className="text-xl font-semibold mt-6">Exception Precedence Rules</h3>
                    <div className="bg-slate-100 border border-slate-300 rounded p-3 text-sm">
                        <p className="font-semibold mb-2">Exceptions are applied in this priority order (highest to lowest):</p>
                        <ol>
                            <li><strong>MANUAL_PRESENT / MANUAL_ABSENT:</strong> Overrides everything, sets status directly</li>
                            <li><strong>PUBLIC_HOLIDAY:</strong> Marks day as OFF, no further processing</li>
                            <li><strong>SICK_LEAVE / ANNUAL_LEAVE:</strong> Marks day as leave, counted separately</li>
                            <li><strong>SHIFT_OVERRIDE:</strong> Replaces shift timings for the day</li>
                            <li><strong>ALLOWED_MINUTES:</strong> Deducted from calculated late/early minutes</li>
                            <li><strong>MANUAL_LATE / MANUAL_EARLY_CHECKOUT / MANUAL_OTHER_MINUTES:</strong> Adds to calculated minutes</li>
                        </ol>
                        <p className="mt-2 text-xs text-slate-600">
                            <strong>Implementation Note:</strong> Exceptions with same priority and overlapping dates will all be applied. 
                            Developer must ensure no conflicting exceptions exist (e.g., MANUAL_PRESENT + MANUAL_ABSENT on same date).
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Late / Early Minute Calculations</h3>
                    <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">
{`// Late calculation for AM shift
const shiftStart = parseTime(shift.am_start);
const firstPunch = parseTime(punches[0].timestamp_raw);
const lateMinutes = Math.max(0, firstPunch - shiftStart - gracePeriod);

// Early checkout calculation for PM shift
const shiftEnd = parseTime(shift.pm_end);
const lastPunch = parseTime(punches[punches.length - 1].timestamp_raw);
const earlyMinutes = Math.max(0, shiftEnd - lastPunch - gracePeriod);

// Apply ALLOWED_MINUTES exceptions
const allowedMinutesExceptions = exceptions.filter(e => 
  e.type === 'ALLOWED_MINUTES' && 
  dateInRange(currentDate, e.date_from, e.date_to)
);
const totalAllowed = allowedMinutesExceptions.reduce((sum, e) => sum + e.allowed_minutes, 0);

const finalLateMinutes = Math.max(0, lateMinutes - totalAllowed);
const finalEarlyMinutes = Math.max(0, earlyMinutes - totalAllowed);`}
                    </pre>

                    <h3 className="text-xl font-semibold mt-6">Half Day and LOP Logic</h3>
                    <ul className="text-sm">
                        <li><strong>HALF:</strong> Employee present for only one shift (AM or PM), not both</li>
                        <li><strong>LOP (Loss of Pay):</strong> Full day absence, counted as full_absence_count</li>
                        <li><strong>Calculation:</strong> If only AM punches found and PM shift exists → HALF. Same for PM only.</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Salary Deduction Formula</h3>
                    <div className="bg-blue-50 border border-blue-300 rounded p-3">
                        <pre className="text-xs">
{`// Implemented in components/project-tabs/SalaryTab.jsx

// Leave Days = Annual Leave Days + LOP Days (NOT sick leave)
const leaveDays = annual_leave_count + full_absence_count;
const leavePay = (total_salary / 30) * leaveDays;

// Salary Leave Amount (paid annual leave only)
let salaryLeaveAmount = 0;
if (annual_leave_count > 0) {
    if (working_hours === 8) {
        // 8-hour employees: no special calculation
        salaryLeaveAmount = (total_salary / 30) * annual_leave_count;
    } else if (working_hours === 9) {
        // 9-hour employees: deduct 12.33% first
        const adjustedSalary = total_salary * 0.8767; // 1 - 0.1233
        salaryLeaveAmount = (adjustedSalary / 30) * annual_leave_count;
    }
}

// Net Leave Deduction = Leave Pay - Salary Leave Amount
const netLeaveDeduction = Math.max(0, leavePay - salaryLeaveAmount);

// Final Salary = Total Salary - Net Leave Deduction
const finalSalary = Math.round((total_salary - netLeaveDeduction) * 100) / 100;`}
                        </pre>
                        <p className="text-xs text-blue-800 mt-2">
                            <strong>Critical:</strong> All salary calculations use 30-day month assumption. Rounding is applied only at 
                            the final salary level, not intermediate calculations. Leave Pay includes both LOP and Annual Leave days, 
                            but Salary Leave Amount only applies to Annual Leave for 9-hour employees with 12.33% adjustment.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">⚠️ CRITICAL: Finalized Report Immutability</h3>
                    <div className="bg-red-50 border-2 border-red-600 rounded p-4">
                        <h4 className="font-semibold text-red-900 mb-3">PERMANENT LOCK RULE</h4>
                        <p className="text-sm text-red-800 mb-3">
                            <strong>Once a ReportRun is marked as finalized (is_final = true), attendance data becomes PERMANENTLY IMMUTABLE.</strong>
                        </p>
                        
                        <div className="bg-white border border-red-300 rounded p-3 mb-3">
                            <p className="text-sm font-semibold text-red-900 mb-2">Data Pipeline (One-Way Flow):</p>
                            <ol className="text-xs text-red-800 space-y-1">
                                <li><strong>1. Analysis:</strong> Punches + Shifts + Exceptions → AnalysisResult (can re-run before finalization)</li>
                                <li><strong>2. Finalization:</strong> AnalysisResult → SalarySnapshot (1:1 copy, ONE-TIME operation)</li>
                                <li><strong>3. Salary Generation:</strong> SalarySnapshot → SalaryReport (uses frozen attendance + OT adjustments)</li>
                            </ol>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3">
                            <div className="bg-green-50 border border-green-400 rounded p-3">
                                <p className="text-xs font-semibold text-green-900 mb-2">✓ ALLOWED AFTER FINALIZATION:</p>
                                <ul className="text-xs text-green-800 space-y-1">
                                    <li>• Read finalized AnalysisResult</li>
                                    <li>• Create SalarySnapshot (1:1 copy only)</li>
                                    <li>• Generate SalaryReport</li>
                                    <li>• Edit OT/Bonus/Deductions</li>
                                    <li>• Recalculate salary totals</li>
                                </ul>
                            </div>
                            <div className="bg-red-50 border border-red-400 rounded p-3">
                                <p className="text-xs font-semibold text-red-900 mb-2">✗ FORBIDDEN AFTER FINALIZATION:</p>
                                <ul className="text-xs text-red-800 space-y-1">
                                    <li>• Recalculate attendance metrics</li>
                                    <li>• Modify AnalysisResult</li>
                                    <li>• Apply day_overrides</li>
                                    <li>• Recompute deductible_minutes</li>
                                    <li>• Filter by custom date range</li>
                                    <li>• Use fallback/default values</li>
                                </ul>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-400 rounded p-3 mt-3">
                            <p className="text-xs font-semibold text-amber-900 mb-2">📋 SNAPSHOT CREATION RULE (createSalarySnapshots.js):</p>
                            <p className="text-xs text-amber-800">
                                When creating SalarySnapshot: Find AnalysisResult by report_run_id, copy ALL fields exactly as stored.
                                NO recalculation, NO date filtering, NO custom logic. Pure 1:1 copy only.
                            </p>
                        </div>

                        <div className="bg-blue-50 border border-blue-400 rounded p-3 mt-3">
                            <p className="text-xs font-semibold text-blue-900 mb-2">📊 CUSTOM DATE RANGE RULE (SalaryTab.jsx):</p>
                            <p className="text-xs text-blue-800">
                                Custom date_from/date_to in SalaryReport are DISPLAY METADATA ONLY. They do NOT filter attendance data.
                                Salary ALWAYS uses the FULL finalized attendance period, regardless of custom dates.
                            </p>
                        </div>

                        <p className="text-sm text-red-900 font-bold mt-4 text-center">
                            See pages/CRITICAL_FINALIZATION_RULES for complete details.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Ramadan Schedule Handling</h3>
                    <p className="text-sm">
                        Ramadan schedules (defined in RamadanSchedule entity) override normal shift timings during Ramadan dates. 
                        Implementation in RunAnalysisTab:
                    </p>
                    <ul className="text-sm">
                        <li>If current date falls within ramadan_start_date and ramadan_end_date</li>
                        <li>Determine which week of Ramadan (week1 or week2)</li>
                        <li>Fetch shift from week1_shifts or week2_shifts JSON (stored as attendance_id mapping to shift object)</li>
                        <li>Apply Ramadan shift instead of regular shift timing</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Overnight Shift Handling</h3>
                    <p className="text-sm">
                        For shifts that cross midnight (e.g., 11:00 PM to 7:00 AM):
                    </p>
                    <ul className="text-sm">
                        <li>System uses "Friday threshold" concept from AttendanceRules</li>
                        <li>Punches after threshold time (e.g., 10:00 PM) are assigned to next day</li>
                        <li>Shift matching logic compares punch to both current day and previous day shifts</li>
                        <li>Developer must ensure shift timings account for this behavior</li>
                    </ul>
                </Section>

                {/* RBAC */}
                <Section id="rbac" title="6. Role-Based Access Control" icon={Lock}>
                    <h3 className="text-xl font-semibold mt-0">Access Control Implementation</h3>
                    <p className="text-sm">
                        The system implements two-level access control: page-level and action-level.
                    </p>

                    <h4 className="text-lg font-semibold mt-4">Page-Level Access Control</h4>
                    <p className="text-sm">
                        Implemented in <code>Layout.js</code> using PagePermission entity. Each page has allowed_roles 
                        (comma-separated string). Layout component checks:
                    </p>
                    <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto mt-2">
{`const userRole = currentUser?.extended_role || currentUser?.role || 'user';

const hasPageAccess = (pageName) => {
  const permission = permissions.find(p => p.page_name === pageName);
  if (!permission) return true; // No restriction if not configured
  const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
  return allowedRoles.includes(userRole);
};

// In navbar menu building:
const menu = baseMenu.filter(item => hasPageAccess(item.url));`}
                    </pre>

                    <h4 className="text-lg font-semibold mt-4">Role Definitions</h4>
                    <div className="space-y-3">
                        <div className="border border-purple-300 rounded p-3 bg-purple-50">
                            <h5 className="font-semibold text-purple-900">Admin</h5>
                            <p className="text-xs text-purple-800"><strong>Can see:</strong> All pages, all companies, all projects</p>
                            <p className="text-xs text-purple-800"><strong>Can modify:</strong> Everything including system settings, user management, rules configuration</p>
                            <p className="text-xs text-purple-800"><strong>Forbidden:</strong> Nothing</p>
                        </div>

                        <div className="border border-blue-300 rounded p-3 bg-blue-50">
                            <h5 className="font-semibold text-blue-900">Supervisor & User (Within Projects)</h5>
                            <p className="text-xs text-blue-800"><strong>Can see:</strong> Projects, Employees, Reports (all companies)</p>
                            <p className="text-xs text-blue-800"><strong>Can modify:</strong> Full project access - create/edit projects, upload data, run analysis, generate reports, edit daily breakdowns, manage exceptions, finalize reports</p>
                            <p className="text-xs text-blue-800"><strong>Forbidden:</strong> User management, system settings, page permissions, Salary tab (Admin/CEO only), reopening closed projects (Admin only)</p>
                            <p className="text-xs bg-blue-100 rounded p-2 mt-2">
                                <strong>Note:</strong> Supervisor and User roles have identical project-level permissions. Both can perform all project operations except salary access and system administration.
                            </p>
                        </div>

                        <div className="border border-green-300 rounded p-3 bg-green-50">
                            <h5 className="font-semibold text-green-900">CEO</h5>
                            <p className="text-xs text-green-800"><strong>Can see:</strong> All data (all companies), Reports & Analytics page</p>
                            <p className="text-xs text-green-800"><strong>Can modify:</strong> Settings (limited), user management</p>
                            <p className="text-xs text-green-800"><strong>Forbidden:</strong> Creating/editing projects, running analysis, modifying employee data</p>
                        </div>

                        <div className="border border-orange-300 rounded p-3 bg-orange-50">
                            <h5 className="font-semibold text-orange-900">Department Head</h5>
                            <p className="text-xs text-orange-800"><strong>Can see:</strong> Only DepartmentHeadDashboard page (single page access)</p>
                            <p className="text-xs text-orange-800"><strong>Can modify:</strong> Pre-approve minutes for employees in their department</p>
                            <p className="text-xs text-orange-800"><strong>Forbidden:</strong> All other pages, all other data</p>
                            <p className="text-xs text-orange-800 mt-2">
                                <strong>Implementation:</strong> Layout.js uses window.location.replace() to redirect department heads to 
                                DepartmentHeadDashboard if they attempt to access any other page. This prevents navigation loops and ensures 
                                single-page restriction enforcement. No menu items are shown in navbar.
                            </p>
                        </div>


                    </div>

                    <h4 className="text-lg font-semibold mt-4">Action-Level Access Control</h4>
                    <p className="text-sm">
                        Individual components check role before rendering action buttons or allowing mutations:
                    </p>
                    <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto mt-2">
{`// Example from ProjectDetail.jsx
const canEdit = isAdmin || isSupervisor;
const isReadOnly = project.status === 'closed' && !isAdmin;

// Conditional rendering:
{canEdit && !isReadOnly && (
  <Button onClick={handleEdit}>Edit Project</Button>
)}

// Example from SalaryTab.jsx
if (!isAdmin && !isCEO) {
  return <div>You do not have permission to view salary information.</div>;
}`}
                    </pre>

                    <h4 className="text-lg font-semibold mt-4">Company-Scoped Access</h4>
                    <p className="text-sm">
                        Users with role "user" or "department_head" are assigned to a single company via User.company field. 
                        All queries are filtered by this company. Admins, supervisors, and CEOs can access all companies.
                    </p>
                </Section>

                {/* Base44 Platform Rules */}
                <Section id="base44-rules" title="7. Base44 Platform Rules for Developers" icon={AlertTriangle}>
                    <div className="bg-red-50 border-2 border-red-600 rounded-lg p-4 mb-6">
                        <h3 className="text-xl font-bold text-red-900 mb-3">⚠️ CRITICAL: READ BEFORE MAKING ANY CHANGES</h3>
                        <p className="text-sm text-red-800">
                            This application runs on the <strong>Base44 Backend-as-a-Service platform</strong>. Certain files and patterns
                            are platform-managed and must NEVER be modified. Violating these rules will break the application.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-0">NEVER Touch These (Will Break the App)</h3>
                    <div className="space-y-3 mb-6">
                        <div className="border-l-4 border-red-600 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">1. index.html</h4>
                            <p className="text-sm text-red-800">Platform-managed entry point. Do not edit.</p>
                        </div>

                        <div className="border-l-4 border-red-600 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">2. index.css</h4>
                            <p className="text-sm text-red-800">
                                Base shadcn/ui theme configuration. Editing can break all UI components across the entire app.
                            </p>
                        </div>

                        <div className="border-l-4 border-red-600 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">3. tailwind.config.js</h4>
                            <p className="text-sm text-red-800">
                                Platform-configured. Changes may not take effect or can break global styling.
                            </p>
                        </div>

                        <div className="border-l-4 border-red-600 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">4. lib/ folder</h4>
                            <p className="text-sm text-red-800">
                                Contains platform internals (PageNotFound.jsx, utils, etc.). Only edit PageNotFound.jsx if customizing 404 page.
                            </p>
                        </div>

                        <div className="border-l-4 border-red-600 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">5. @/api/base44Client</h4>
                            <p className="text-sm text-red-800">
                                Pre-initialized SDK client. Never recreate or modify this client instance.
                            </p>
                        </div>

                        <div className="border-l-4 border-red-600 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">6. @/components/ui/ (shadcn components)</h4>
                            <p className="text-sm text-red-800">
                                These are pre-installed UI primitives. Editing them can break the entire UI system. Only customize if
                                you fully understand ripple effects.
                            </p>
                        </div>

                        <div className="border-l-4 border-red-600 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">7. Authentication/Login pages</h4>
                            <p className="text-sm text-red-800">
                                Auth is handled by the platform. NEVER create custom login/signup pages.
                            </p>
                        </div>

                        <div className="border-l-4 border-red-600 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">8. App.jsx / routing</h4>
                            <p className="text-sm text-red-800">
                                Platform-managed. Routes are auto-generated from pages/ folder. Do not manually configure routes.
                            </p>
                        </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">File Structure Rules</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <table className="text-sm w-full">
                            <thead>
                                <tr className="border-b border-blue-300">
                                    <th className="text-left py-2 font-semibold text-blue-900">Rule</th>
                                    <th className="text-left py-2 font-semibold text-blue-900">Example</th>
                                </tr>
                            </thead>
                            <tbody className="text-blue-800">
                                <tr className="border-b border-blue-200">
                                    <td className="py-2">Pages must be flat (no subfolders)</td>
                                    <td className="py-2">
                                        <code className="bg-green-100 text-green-800 px-1 rounded">pages/MyPage.js ✅</code><br/>
                                        <code className="bg-red-100 text-red-800 px-1 rounded">pages/admin/MyPage.js ❌</code>
                                    </td>
                                </tr>
                                <tr className="border-b border-blue-200">
                                    <td className="py-2">Components CAN have subfolders</td>
                                    <td className="py-2">
                                        <code className="bg-green-100 text-green-800 px-1 rounded">components/dashboard/Chart.js ✅</code>
                                    </td>
                                </tr>
                                <tr className="border-b border-blue-200">
                                    <td className="py-2">Entity files are JSON schemas</td>
                                    <td className="py-2">
                                        <code className="bg-blue-100 text-blue-800 px-1 rounded">entities/MyEntity.json</code><br/>
                                        <span className="text-xs text-red-600">Always provide FULL schema, no partial updates</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-blue-200">
                                    <td className="py-2">Functions are Deno handlers</td>
                                    <td className="py-2">
                                        <code className="bg-blue-100 text-blue-800 px-1 rounded">functions/myFunc.js</code><br/>
                                        <span className="text-xs text-red-600">Each is independently deployed (NO local imports between functions)</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2">Function names must be camelCase</td>
                                    <td className="py-2">
                                        <code className="bg-green-100 text-green-800 px-1 rounded">runAnalysis ✅</code><br/>
                                        <code className="bg-red-100 text-red-800 px-1 rounded">run-analysis ❌</code>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Common Pitfalls</h3>
                    <div className="overflow-x-auto mb-6">
                        <table className="text-xs w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-200">
                                    <th className="border border-slate-300 p-3 text-left font-semibold">Issue</th>
                                    <th className="border border-slate-300 p-3 text-left font-semibold">Cause</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-slate-300 p-3">"Invalid hook call" / white screen</td>
                                    <td className="border border-slate-300 p-3">
                                        Duplicate React imports, or importing React directly instead of using the bundled version
                                    </td>
                                </tr>
                                <tr className="bg-slate-50">
                                    <td className="border border-slate-300 p-3">Infinite loops</td>
                                    <td className="border border-slate-300 p-3">
                                        useEffect with unstable dependencies (objects/arrays created inline), or missing deps with React Query
                                    </td>
                                </tr>
                                <tr>
                                    <td className="border border-slate-300 p-3">Broken navigation</td>
                                    <td className="border border-slate-300 p-3">
                                        Editing Layout to import pages directly instead of using children prop
                                    </td>
                                </tr>
                                <tr className="bg-slate-50">
                                    <td className="border border-slate-300 p-3">Entity data loss</td>
                                    <td className="border border-slate-300 p-3">
                                        Using write_file with partial entity schemas — always include ALL fields
                                    </td>
                                </tr>
                                <tr>
                                    <td className="border border-slate-300 p-3">Functions failing</td>
                                    <td className="border border-slate-300 p-3">
                                        Using import between function files (each is isolated), or missing npm: prefix on packages
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">SDK Usage Rules</h3>
                    <div className="space-y-3 mb-6">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <h4 className="font-semibold text-green-900 mb-2">Frontend SDK Import</h4>
                            <pre className="bg-slate-900 text-slate-100 p-2 rounded text-xs overflow-x-auto">
{`import { base44 } from '@/api/base44Client';

// Always use this instance, never create your own`}
                            </pre>
                        </div>

                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <h4 className="font-semibold text-purple-900 mb-2">Backend Function SDK Import</h4>
                            <pre className="bg-slate-900 text-slate-100 p-2 rounded text-xs overflow-x-auto">
{`import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  // Use base44.entities, base44.auth, etc.
});

// Always use this exact version`}
                            </pre>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <h4 className="font-semibold text-red-900 mb-2">Security Rules</h4>
                            <ul className="text-sm text-red-800 space-y-1">
                                <li>❌ Never expose API keys/tokens in frontend code</li>
                                <li>❌ Never use <code className="bg-red-100 px-1 rounded">base44.asServiceRole</code> in frontend — backend only</li>
                            </ul>
                        </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Layout Rules</h3>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                        <ul className="text-sm text-amber-800 space-y-2">
                            <li>
                                <strong>Layout receives props:</strong> <code className="bg-amber-100 px-1 rounded">children</code> and
                                <code className="bg-amber-100 px-1 rounded ml-1">currentPageName</code>
                            </li>
                            <li>
                                <strong>NEVER import Layout inside page components</strong> — it's auto-wrapped by the platform
                            </li>
                            <li>
                                <strong>Navigation:</strong> Use <code className="bg-amber-100 px-1 rounded">createPageUrl('PageName')</code> for
                                links, not hardcoded paths
                            </li>
                        </ul>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">What's Safe to Edit</h3>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                        <p className="text-sm text-green-900 font-semibold mb-3">You CAN freely edit these:</p>
                        <ul className="text-sm text-green-800 space-y-1">
                            <li>✅ <code className="bg-green-100 px-1 rounded">pages/*.js</code> — Your app pages</li>
                            <li>✅ <code className="bg-green-100 px-1 rounded">components/**/*.js</code> — Your custom components</li>
                            <li>✅ <code className="bg-green-100 px-1 rounded">functions/*.js</code> — Your backend functions</li>
                            <li>✅ <code className="bg-green-100 px-1 rounded">entities/*.json</code> — Your data schemas (full schema only)</li>
                            <li>✅ <code className="bg-green-100 px-1 rounded">agents/*.json</code> — AI agent configs</li>
                            <li>✅ <code className="bg-green-100 px-1 rounded">globals.css</code> — Your custom global styles</li>
                            <li>✅ <code className="bg-green-100 px-1 rounded">Layout.js</code> — App layout wrapper</li>
                        </ul>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Package Rules</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-800 mb-3">
                            <strong>Only use pre-installed packages.</strong> Do NOT add arbitrary npm packages without verification.
                        </p>
                        <p className="text-sm text-blue-800 mb-2 font-semibold">Pre-installed packages include:</p>
                        <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                            <div>
                                <ul className="space-y-1">
                                    <li>• React, React DOM</li>
                                    <li>• Tailwind CSS</li>
                                    <li>• shadcn/ui components</li>
                                    <li>• lucide-react (icons)</li>
                                    <li>• recharts</li>
                                </ul>
                            </div>
                            <div>
                                <ul className="space-y-1">
                                    <li>• date-fns</li>
                                    <li>• lodash</li>
                                    <li>• framer-motion</li>
                                    <li>• @tanstack/react-query</li>
                                    <li>• @hello-pangea/dnd</li>
                                </ul>
                            </div>
                        </div>
                        <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded p-2">
                            <strong>Icon Warning:</strong> Only use lucide-react icons you've verified exist. Wrong icon names crash the app.
                        </p>
                    </div>
                </Section>

                {/* Known Constraints */}
                <Section id="constraints" title="8. Known Constraints & Design Decisions" icon={AlertTriangle}>
                    <h3 className="text-xl font-semibold mt-0">Why Attendance ID is Number (Not String)</h3>
                    <p className="text-sm">
                        attendance_id is stored as NUMBER type for backward compatibility with existing biometric device exports. 
                        However, uniqueness is only enforced within a company, not globally. This causes potential issues when 
                        querying across companies. Mitigation: Always filter by company when querying employees or punches.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Why Analysis is Project-Based (Not Global)</h3>
                    <p className="text-sm">
                        Each project creates a fresh snapshot of punch data, shift timings, and exceptions. This allows:
                    </p>
                    <ul className="text-sm">
                        <li>Historical immutability: Changing global shift timing doesn't affect past projects</li>
                        <li>Isolated testing: Admins can create test projects without affecting production data</li>
                        <li>Concurrent analysis: Multiple projects can run simultaneously for different periods</li>
                    </ul>
                    <p className="text-sm mt-2">
                        <strong>Trade-off:</strong> Data duplication across projects, but ensures audit trail integrity.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Why React Query Cache is Aggressive</h3>
                    <p className="text-sm">
                        React Query configuration uses long staleTime (15-30 minutes) for most entities. This is because:
                    </p>
                    <ul className="text-sm">
                        <li>Attendance data changes infrequently during analysis phase</li>
                        <li>Reduces server load for large datasets (thousands of punches)</li>
                        <li>Improves UI responsiveness by serving from cache</li>
                    </ul>
                    <p className="text-sm mt-2">
                        <strong>Caveat:</strong> After mutations, queryClient.invalidateQueries must be called to refresh cache. 
                        Developers must ensure proper invalidation after create/update/delete operations.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Why Department Head Workflow is Company-Specific</h3>
                    <p className="text-sm">
                        The department head pre-approval workflow (DepartmentHeadDashboard) is currently implemented only for 
                        "Al Maraghi Auto Repairs" (one of the companies in the system: Al Maraghi Auto Repairs, Al Maraghi Automotive, Naser Mohsin Auto Parts). This is a deliberate design decision to:
                    </p>
                    <ul className="text-sm">
                        <li>Pilot the feature with a single company before rollout</li>
                        <li>Validate business logic and user workflows</li>
                        <li>Collect feedback before system-wide deployment</li>
                    </ul>
                    <p className="text-sm mt-2">
                        <strong>Future Expansion:</strong> The foundation is in place for multi-company support. To enable for other companies, 
                        remove the company check in DepartmentHeadDashboard.jsx and ensure DepartmentHead entities are configured per company.
                    </p>
                </Section>

                {/* Common Pitfalls */}
                <Section id="pitfalls" title="9. Common Developer Pitfalls" icon={AlertTriangle}>
                    <div className="space-y-4">
                        <div className="border-l-4 border-red-500 bg-red-50 p-3">
                            <h4 className="font-semibold text-red-900">Type Mismatch: attendance_id as String vs Number</h4>
                            <p className="text-sm text-red-800">
                                <strong>Problem:</strong> attendance_id is NUMBER in database but often compared as string in JavaScript.
                            </p>
                            <p className="text-sm text-red-800 mt-1">
                                <strong>Solution:</strong> Always use <code>Number(attendance_id)</code> or <code>parseInt(attendance_id)</code> 
                                when comparing. Filter functions should use <code>e.attendance_id === Number(attendanceId)</code>.
                            </p>
                        </div>

                        <div className="border-l-4 border-amber-500 bg-amber-50 p-3">
                            <h4 className="font-semibold text-amber-900">Cache Invalidation Mistakes</h4>
                            <p className="text-sm text-amber-800">
                                <strong>Problem:</strong> After creating/updating entities, UI doesn't reflect changes because React Query cache is stale.
                            </p>
                            <p className="text-sm text-amber-800 mt-1">
                                <strong>Solution:</strong> Always call <code>queryClient.invalidateQueries(['entityName'])</code> after mutations. 
                                Example: After creating punch, invalidate ['punches', projectId].
                            </p>
                        </div>

                        <div className="border-l-4 border-orange-500 bg-orange-50 p-3">
                            <h4 className="font-semibold text-orange-900">Exception Overlap Bugs</h4>
                            <p className="text-sm text-orange-800">
                                <strong>Problem:</strong> Multiple exceptions with same date range cause unpredictable behavior.
                            </p>
                            <p className="text-sm text-orange-800 mt-1">
                                <strong>Solution:</strong> Before creating exception, check for existing exceptions with overlapping dates. 
                                Display warning to user or automatically merge exceptions.
                            </p>
                        </div>

                        <div className="border-l-4 border-blue-500 bg-blue-50 p-3">
                            <h4 className="font-semibold text-blue-900">Partial Delete Cascade Issues</h4>
                            <p className="text-sm text-blue-800">
                                <strong>Problem:</strong> Deleting project leaves orphaned punches, shifts, exceptions in database.
                            </p>
                            <p className="text-sm text-blue-800 mt-1">
                                <strong>Solution:</strong> Always delete related entities before parent. Project deletion must cascade: 
                                delete punches, shifts, exceptions, analysis results, then project.
                            </p>
                        </div>

                        <div className="border-l-4 border-purple-500 bg-purple-50 p-3">
                            <h4 className="font-semibold text-purple-900">Salary Rounding Errors</h4>
                            <p className="text-sm text-purple-800">
                                <strong>Problem:</strong> Rounding at each calculation step causes cumulative errors.
                            </p>
                            <p className="text-sm text-purple-800 mt-1">
                                <strong>Solution:</strong> Perform all calculations in full precision, round only final salary: 
                                <code>Math.round(finalSalary * 100) / 100</code>
                            </p>
                        </div>
                    </div>
                </Section>

                {/* Change Guidelines */}
                <Section id="changes" title="10. Change Guidelines" icon={Code}>
                    <h3 className="text-xl font-semibold mt-0">What MUST Be Updated When...</h3>

                    <div className="space-y-4">
                        <div className="bg-slate-100 border border-slate-300 rounded p-4">
                            <h4 className="font-semibold text-slate-900">Adding a New Exception Type</h4>
                            <ol className="text-sm mt-2">
                                <li>Update Exception entity schema (entities/Exception.json) - add new type to enum</li>
                                <li>Update RunAnalysisTab.jsx - add case in exception handling switch statement</li>
                                <li>Update ExceptionsTab.jsx - add new type to dropdown and form validation</li>
                                <li>Update ReportDetailView.jsx - handle new type in day-by-day breakdown</li>
                                <li>Update Documentation.jsx - document new exception type and behavior</li>
                                <li>Test end-to-end: Create exception → Run analysis → Verify report</li>
                            </ol>
                        </div>

                        <div className="bg-slate-100 border border-slate-300 rounded p-4">
                            <h4 className="font-semibold text-slate-900">Modifying Salary Calculation Logic</h4>
                            <ol className="text-sm mt-2">
                                <li>Update SalaryTab.jsx - modify calculation functions</li>
                                <li>Update EmployeeSalary entity if new fields needed</li>
                                <li>Update exportToPrivateFile backend function (Excel export)</li>
                                <li>Update TechnicalDocumentation.jsx - document formula changes</li>
                                <li>Create migration script if existing salary records need recalculation</li>
                                <li>Notify users of change via system announcement or email</li>
                            </ol>
                        </div>

                        <div className="bg-slate-100 border border-slate-300 rounded p-4">
                            <h4 className="font-semibold text-slate-900">Adding a New Role</h4>
                            <ol className="text-sm mt-2">
                                <li>Update User entity schema - add new role to extended_role enum</li>
                                <li>Update Layout.js - add role checks in navbarMenu building</li>
                                <li>Update Users.jsx - add role to dropdown and toggle buttons</li>
                                <li>Update PagePermission configuration - assign default pages for new role</li>
                                <li>Update all components with role checks (search for "isAdmin", "isSupervisor" patterns)</li>
                                <li>Update Documentation.jsx - document new role capabilities</li>
                            </ol>
                        </div>

                        <div className="bg-slate-100 border border-slate-300 rounded p-4">
                            <h4 className="font-semibold text-slate-900">Changing Shift Logic</h4>
                            <ol className="text-sm mt-2">
                                <li>Update RunAnalysisTab.jsx - modify shift matching and late/early calculations</li>
                                <li>Update ShiftTimingsTab.jsx if UI changes needed</li>
                                <li>Update AttendanceRules entity if new configurable parameters needed</li>
                                <li>Re-run analysis on test project to verify correctness</li>
                                <li>Update TechnicalDocumentation.jsx - document logic changes</li>
                                <li>Consider backward compatibility: Can old projects be re-analyzed with new logic?</li>
                            </ol>
                        </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Code Review Checklist</h3>
                    <ul className="text-sm">
                        <li>✓ All mutations followed by queryClient.invalidateQueries?</li>
                        <li>✓ Role-based access checks for new pages/actions?</li>
                        <li>✓ Company filtering applied to cross-company queries?</li>
                        <li>✓ timestamp_raw never modified after creation?</li>
                        <li>✓ Error handling and user feedback for all async operations?</li>
                        <li>✓ Documentation updated to reflect changes?</li>
                        <li>✓ Test coverage for new business logic?</li>
                    </ul>
                </Section>
            </div>

            {/* Footer */}
            <Card className="bg-indigo-50 border-indigo-200 mt-8">
                <CardContent className="p-6 text-center">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-2">Need Support?</h3>
                    <p className="text-sm text-indigo-800">
                        This technical documentation is maintained by the development team. For questions or clarifications, 
                        contact the project maintainer or open a technical discussion in the team's communication channel.
                    </p>
                    <p className="text-xs text-indigo-600 mt-3">
                        Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
