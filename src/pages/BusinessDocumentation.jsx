import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, Users, Shield, DollarSign, FileText, Settings, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function BusinessDocumentation() {
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
                    <CardContent className="prose prose-slate max-w-none">
                        {children}
                    </CardContent>
                )}
            </Card>
        );
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <Breadcrumb items={[
                { label: 'Settings', href: 'RulesSettings' },
                { label: 'Business Documentation' }
            ]} />
            
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-4">
                    <Briefcase className="w-8 h-8 text-indigo-600" />
                </div>
                <h1 className="text-4xl font-bold text-slate-900">Attendance System</h1>
                <h2 className="text-2xl font-semibold text-slate-700 mt-2">Business Documentation</h2>
                <p className="text-lg text-slate-600 mt-3">Complete guide for HR managers, operations teams, and decision makers</p>
            </div>

            <div className="space-y-4">
                {/* What This System Does */}
                <Section id="overview" title="1. What This System Does" icon={Briefcase}>
                    <h3 className="text-xl font-semibold mt-0">Purpose</h3>
                    <p>
                        The Attendance System automatically processes employee clock-in and clock-out records to calculate 
                        accurate attendance metrics for payroll processing. Instead of manually reviewing timesheets and 
                        calculating late minutes, absences, and deductions, the system does this automatically based on 
                        your company's rules.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Who Uses It</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900">HR Managers</h4>
                            <p className="text-sm text-blue-800">Upload attendance data, review reports, manage exceptions, and prepare payroll information</p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h4 className="font-semibold text-green-900">Operations Managers</h4>
                            <p className="text-sm text-green-800">Monitor employee attendance, identify patterns, and ensure policy compliance</p>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                            <h4 className="font-semibold text-purple-900">Department Heads</h4>
                            <p className="text-sm text-purple-800">Pre-approve minutes for legitimate reasons, view team attendance reports</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <h4 className="font-semibold text-amber-900">Finance Teams</h4>
                            <p className="text-sm text-amber-800">Review salary calculations, verify deductions, and export payroll data</p>
                        </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Business Problems Solved</h3>
                    <ul>
                        <li><strong>Manual Processing Time:</strong> Eliminates hours of manual timesheet review and calculation</li>
                        <li><strong>Human Error:</strong> Removes calculation mistakes and ensures consistent rule application</li>
                        <li><strong>Disputes:</strong> Provides detailed daily records that can be reviewed to resolve disagreements</li>
                        <li><strong>Policy Enforcement:</strong> Ensures attendance policies are applied fairly to all employees</li>
                        <li><strong>Audit Compliance:</strong> Creates permanent records that can be audited years later</li>
                        <li><strong>Multi-Company Management:</strong> Handles different policies for different companies in one system</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Supported Devices</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-900 mb-2">Multi-Device Access</h4>
                        <p className="text-sm text-blue-800 mb-2">
                            This system can be accessed from any device: desktop computers, laptops, tablets, and mobile phones. 
                            The interface is fully responsive and optimized for all screen sizes.
                        </p>
                        <p className="text-sm text-blue-800 mb-2"><strong>Recommended Approach:</strong></p>
                        <ul className="text-sm text-blue-700">
                            <li>For bulk file uploads and complex data entry: Desktop or laptop (larger screen for file management)</li>
                            <li>For reports and data review: Any device (responsive tables adapt to screen size)</li>
                            <li>For approvals and quick checks: Mobile devices (streamlined interface)</li>
                            <li>For salary calculations and exports: Desktop or laptop (Excel integration works best)</li>
                        </ul>
                        <p className="text-sm text-blue-800 mt-3">
                            <strong>Browser Support:</strong> Chrome, Firefox, Safari, or Edge (latest versions recommended) on all devices.
                        </p>
                        <p className="text-sm text-blue-800 mt-2">
                            <strong>Mobile Experience:</strong> All core features are accessible on mobile and tablet devices. 
                            The interface automatically adapts to fit smaller screens while maintaining full functionality.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Timezone Standard</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-900 mb-2">All Times are UAE Time</h4>
                        <p className="text-sm text-blue-800 mb-2">
                            <strong>Important:</strong> This system uses UAE time (Asia/Dubai, UTC+4) for all dates and times. 
                            Your device's local timezone is ignored.
                        </p>
                        <p className="text-sm text-blue-800 mb-2"><strong>What This Means:</strong></p>
                        <ul className="text-sm text-blue-700">
                            <li>All punch times are recorded and displayed in UAE time</li>
                            <li>Shift schedules use UAE time (e.g., 8:00 AM means 8:00 AM UAE)</li>
                            <li>Reports show attendance data in UAE time</li>
                            <li>Approval timestamps are in UAE time</li>
                            <li>Salary calculations use UAE date boundaries</li>
                        </ul>
                        <p className="text-sm text-blue-800 mt-3">
                            <strong>Example:</strong> If you access the system from outside UAE, all times shown are still UAE time. 
                            A punch at "8:30 AM" means 8:30 AM in Dubai, regardless of where you are.
                        </p>
                        <p className="text-sm text-blue-800 mt-2">
                            <strong>For Payroll:</strong> All exported attendance data and salary reports use UAE dates and times 
                            for consistency and compliance with UAE labor law.
                        </p>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Maintenance Mode</h3>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <h4 className="font-semibold text-amber-900 mb-2">System Maintenance Access</h4>
                        <p className="text-sm text-amber-800 mb-2">
                            During critical system updates or maintenance, administrators can enable maintenance mode 
                            to restrict access to the system.
                        </p>
                        <p className="text-sm text-amber-800 mb-2"><strong>Who Can Access During Maintenance:</strong></p>
                        <ul className="text-sm text-amber-700">
                            <li><strong>Admin:</strong> Full system access to perform maintenance tasks</li>
                            <li><strong>All Other Users (CEO, Supervisor, Department Head, Regular User):</strong> Blocked with maintenance message</li>
                        </ul>
                        <p className="text-sm text-amber-800 mt-3">
                            <strong>When Maintenance Mode is Active:</strong> All non-admin users will see a maintenance screen 
                            explaining that the system is temporarily unavailable. They cannot access any pages or data until 
                            an administrator disables maintenance mode.
                        </p>
                        <p className="text-sm text-amber-800 mt-2">
                            <strong>Purpose:</strong> This ensures data integrity during system updates, prevents users from 
                            accessing incomplete features, and allows administrators to perform critical maintenance without 
                            user interference.
                        </p>
                    </div>
                </Section>

                {/* Key Business Capabilities */}
                <Section id="capabilities" title="2. Key Business Capabilities" icon={CheckCircle2}>
                    <h3 className="text-xl font-semibold mt-0">Attendance Tracking</h3>
                    <p>
                        The system imports biometric punch records (clock-in/clock-out times) and compares them against 
                        defined work schedules. For each employee, it calculates:
                    </p>
                    <ul>
                        <li>Total working days in the period</li>
                        <li>Days present vs days absent</li>
                        <li>Number of late arrivals (and how many minutes late)</li>
                        <li>Early departures (and how many minutes early)</li>
                        <li>Half days (present for only morning or afternoon)</li>
                        <li>Unusual patterns that need manager review</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Leave and Exception Handling</h3>
                    <p>
                        Not every absence is unauthorized. The system allows you to mark special circumstances:
                    </p>
                    <ul>
                        <li><strong>Sick Leave:</strong> Employee is ill and has provided documentation</li>
                        <li><strong>Annual Leave:</strong> Pre-approved vacation days</li>
                        <li><strong>Public Holidays:</strong> Company-wide non-working days</li>
                        <li><strong>Shift Changes:</strong> Temporary schedule adjustments for specific dates</li>
                        <li><strong>Manual Corrections:</strong> When the biometric system malfunctions or employee forgets to punch</li>
                        <li><strong>Pre-Approved Minutes:</strong> Department heads can approve late arrivals for valid reasons (hospital visits, emergencies)</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Salary Calculation</h3>
                    <p>
                        Based on attendance results, the system calculates salary deductions:
                    </p>
                    <ul>
                        <li><strong>Leave Days:</strong> Days without punches (Annual Leave + LOP days, NOT sick leave)</li>
                        <li><strong>Leave Pay:</strong> (Total Salary ÷ 30) × Leave Days</li>
                        <li><strong>Salary Leave Amount:</strong> Paid leave (Annual Leave) calculated based on working hours:
                            <ul>
                                <li>For 8-hour employees: (Total Salary ÷ 30) × Annual Leave Days</li>
                                <li>For 9-hour employees: ((Total Salary × 0.8767) ÷ 30) × Annual Leave Days</li>
                            </ul>
                        </li>
                        <li><strong>Net Leave Deduction:</strong> Leave Pay - Salary Leave Amount (minimum 0)</li>
                        <li><strong>Final Salary:</strong> Total Salary - Net Leave Deduction + Other Adjustments</li>
                        <li><strong>Grace Minutes:</strong> First 15 minutes late are forgiven (configurable)</li>
                        <li><strong>Approved Minutes:</strong> Department head approvals reduce deductible minutes</li>
                    </ul>
                    <p className="text-sm bg-amber-50 border border-amber-200 rounded p-3 mt-2">
                        <strong>Important:</strong> Salary calculations are always available for HR review before finalization. 
                        Nothing is automatically sent to payroll without manager approval.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Approval Workflows</h3>
                    <p>
                        The system supports department-level pre-approvals for Al Maraghi Auto Repairs:
                    </p>
                    <ul>
                        <li>Department heads can pre-approve minutes before reports are generated</li>
                        <li>Pre-approvals require reasons (e.g., "Doctor appointment", "Family emergency")</li>
                        <li>Pre-approvals are limited by date cutoffs (cannot approve after project ends)</li>
                        <li>All pre-approvals are recorded with date, time, and reason for audit purposes</li>
                        <li>HR managers can review all pre-approvals in final reports</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Reporting and Exports</h3>
                    <p>
                        Multiple report formats are available:
                    </p>
                    <ul>
                        <li><strong>Summary Reports:</strong> One row per employee showing totals (present days, late minutes, deductions)</li>
                        <li><strong>Daily Breakdown:</strong> Day-by-day detail for each employee showing punch times and status</li>
                        <li><strong>Excel Export:</strong> All reports can be exported to Excel for external use</li>
                        <li><strong>Salary Reports:</strong> Final payroll information with calculated net salaries</li>
                        <li><strong>Audit Reports:</strong> Complete history of changes, approvals, and corrections</li>
                    </ul>
                </Section>

                {/* Attendance Rules */}
                <Section id="rules" title="3. Attendance Rules (Business View)" icon={Settings}>
                    <h3 className="text-xl font-semibold mt-0">Working Days vs Off Days</h3>
                    <p>
                        Each employee has a designated weekly off day (typically Sunday). Additionally, the company 
                        defines public holidays that apply to everyone. On these days:
                    </p>
                    <ul>
                        <li>No attendance is required</li>
                        <li>Days are not counted as working days</li>
                        <li>No deductions occur even if employee doesn't punch</li>
                    </ul>
                    <p className="text-sm bg-blue-50 border border-blue-200 rounded p-3">
                        <strong>Example:</strong> If your monthly period has 30 days, but 5 Sundays and 2 public holidays, 
                        your working days are only 23 days. Employees are only evaluated on those 23 days.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Late Arrivals and Early Checkouts</h3>
                    <p>
                        Your company defines shift start and end times (e.g., 8:00 AM to 5:00 PM with lunch break). 
                        The system includes a grace period (typically 15 minutes) before marking someone as late:
                    </p>
                    <ul>
                        <li><strong>On Time:</strong> Punch within 15 minutes after shift start (no penalty)</li>
                        <li><strong>Late:</strong> Punch more than 15 minutes after shift start (minutes counted)</li>
                        <li><strong>Early Checkout:</strong> Leave more than 15 minutes before shift end (minutes counted)</li>
                    </ul>
                    <p className="text-sm bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                        <strong>Example:</strong> Shift starts at 8:00 AM with 15-minute grace. Employee who punches at 
                        8:10 AM is considered on time. Employee who punches at 8:25 AM is 10 minutes late (25 - 15 grace).
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Half Days</h3>
                    <p>
                        A half day occurs when an employee is present for only morning OR afternoon, not both:
                    </p>
                    <ul>
                        <li>Employee punches in morning but leaves before afternoon shift</li>
                        <li>Employee arrives only for afternoon shift</li>
                        <li>Half days count as 0.5 working days</li>
                        <li>Half day deduction is half of full day deduction (1/60th of monthly salary)</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Absences (LOP - Loss of Pay)</h3>
                    <p>
                        A full absence (LOP) occurs when:
                    </p>
                    <ul>
                        <li>Employee has no punch records for the day</li>
                        <li>Punch records are outside acceptable time windows</li>
                        <li>No valid leave exception exists</li>
                    </ul>
                    <p>
                        Full absences deduct 1/30th of monthly salary per day. This is the standard industry practice.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Public Holidays</h3>
                    <p>
                        HR managers define public holidays at the start of each year. When a day is marked as public holiday:
                    </p>
                    <ul>
                        <li>It applies to ALL employees automatically</li>
                        <li>No attendance tracking occurs</li>
                        <li>Day is excluded from working day count</li>
                        <li>Employees receive full pay regardless of punch status</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Ramadan Schedules</h3>
                    <p>
                        During Ramadan, many companies reduce working hours. The system supports special Ramadan schedules:
                    </p>
                    <ul>
                        <li>Separate shift timings for Ramadan period</li>
                        <li>Typically shorter hours (e.g., 6 hours instead of 8)</li>
                        <li>Different schedules can be defined for different weeks of Ramadan</li>
                        <li>Night shift schedules for employees working overnight</li>
                    </ul>
                    <p className="text-sm text-slate-600">
                        Ramadan schedules are configured once per year and automatically apply during Ramadan dates.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Overnight Shifts (Simple Explanation)</h3>
                    <p>
                        Some employees work shifts that cross midnight (e.g., 11:00 PM to 7:00 AM). The system handles this by:
                    </p>
                    <ul>
                        <li>Counting the shift as part of the day it starts</li>
                        <li>Late night punches are assigned to the next calendar day</li>
                        <li>This ensures proper day-by-day tracking</li>
                    </ul>
                    <p className="text-sm bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                        <strong>Example:</strong> Night shift 11:00 PM Monday to 7:00 AM Tuesday is counted as Monday's shift. 
                        The 7:00 AM Tuesday punch closes Monday's work period.
                    </p>
                </Section>

                {/* Leave & Exception Rules */}
                <Section id="exceptions" title="4. Leave & Exception Rules" icon={FileText}>
                    <h3 className="text-xl font-semibold mt-0">Sick Leave</h3>
                    <p>
                        When an employee is sick and provides medical documentation:
                    </p>
                    <ul>
                        <li>HR marks the dates as "Sick Leave" in the system</li>
                        <li>Days are counted separately (not as absences)</li>
                        <li>No salary deduction occurs</li>
                        <li>Sick leave days are tracked for reporting purposes</li>
                    </ul>
                    <p className="text-sm bg-green-50 border border-green-200 rounded p-3">
                        <strong>Important:</strong> Sick leave still requires manager approval before being entered in the system. 
                        The system doesn't grant leave automatically.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Annual Leave</h3>
                    <p>
                        Pre-approved vacation days follow calendar-based counting:
                    </p>
                    <ul>
                        <li>HR marks dates as "Annual Leave"</li>
                        <li>No deduction occurs</li>
                        <li>Days are tracked against employee's annual leave balance</li>
                        <li>These days don't count as working days</li>
                        <li><strong>Calendar Day Counting:</strong> All calendar days within the annual leave date range are counted, including weekly holidays and public holidays</li>
                    </ul>
                    <p className="text-sm bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                        <strong>Example:</strong> Employee takes annual leave from January 25 to January 30 (6 calendar days). 
                        If Sunday (January 26) is their weekly off day, the annual leave count is still 6 days. If a public holiday falls 
                        on Wednesday (January 29), the annual leave count remains 6 days. The attendance report shows the full calendar duration of the leave.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Manual Corrections</h3>
                    <p>
                        Sometimes the biometric system has issues or employees forget to punch. In these cases:
                    </p>
                    <ul>
                        <li><strong>Manual Present:</strong> HR can mark a day as present even without punch records</li>
                        <li><strong>Manual Absent:</strong> Force a day to be absent regardless of punch data</li>
                        <li><strong>Manual Half Day:</strong> Mark as half day when punch data is unclear</li>
                        <li><strong>Manual Minutes:</strong> Add or adjust late/early minutes for special circumstances</li>
                    </ul>
                    <p className="text-sm bg-red-50 border border-red-200 rounded p-3 mt-2">
                        <strong>Control:</strong> All manual corrections are recorded with date, time, and the manager who made them. 
                        This creates an audit trail for compliance reviews.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">How Conflicts Are Handled</h3>
                    <p>
                        When multiple exceptions apply to the same day, the system follows a priority order:
                    </p>
                    <ol>
                        <li><strong>Manual Overrides (Highest Priority):</strong> Manual present/absent/half day instructions always take precedence</li>
                        <li><strong>Public Holidays:</strong> Company-wide holidays override everything else</li>
                        <li><strong>Leave Days:</strong> Sick leave and annual leave override normal attendance rules</li>
                        <li><strong>Shift Changes:</strong> Temporary schedule adjustments for specific dates</li>
                        <li><strong>Pre-Approved Minutes:</strong> Department head approvals reduce calculated late minutes</li>
                        <li><strong>Normal Rules (Lowest Priority):</strong> Standard attendance calculation</li>
                    </ol>

                    <h3 className="text-xl font-semibold mt-6">Why Only One Exception Type Applies Per Day</h3>
                    <p>
                        To avoid confusion and ensure clear accountability:
                    </p>
                    <ul>
                        <li>A day cannot be both "present" and "absent"</li>
                        <li>A day cannot be both "public holiday" and "sick leave"</li>
                        <li>The highest priority exception determines the day's status</li>
                        <li>This prevents contradictory instructions and calculation errors</li>
                    </ul>
                </Section>

                {/* Salary & Deduction Logic */}
                <Section id="salary" title="5. Salary & Deduction Logic" icon={DollarSign}>
                    <h3 className="text-xl font-semibold mt-0">How Salary is Calculated</h3>
                    <p>
                        The system starts with each employee's basic monthly salary and calculates deductions based on attendance:
                    </p>
                    <div className="bg-slate-50 border border-slate-300 rounded-lg p-4 my-4">
                        <h4 className="font-semibold text-slate-900 mb-2">Calculation Formula:</h4>
                        <ol className="text-sm">
                            <li><strong>Start with:</strong> Basic Monthly Salary</li>
                            <li><strong>Subtract:</strong> Full day absence deductions (absent days × salary/30)</li>
                            <li><strong>Subtract:</strong> Half day deductions (half days × salary/60)</li>
                            <li><strong>Subtract:</strong> Minute-based deductions (see below)</li>
                            <li><strong>Result:</strong> Net Salary for the month</li>
                        </ol>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">How Late/Early Minutes Affect Salary</h3>
                    <p>
                        Minutes are converted to salary deductions using this calculation:
                    </p>
                    <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                        <p className="text-sm mb-2"><strong>Step 1:</strong> Calculate total deductible minutes:</p>
                        <p className="text-sm ml-4">Total Minutes = Late Minutes + Early Checkout Minutes + Other Minutes - Approved Minutes</p>
                        
                        <p className="text-sm mt-3 mb-2"><strong>Step 2:</strong> Convert minutes to hours:</p>
                        <p className="text-sm ml-4">Hours = Total Minutes ÷ 60</p>
                        
                        <p className="text-sm mt-3 mb-2"><strong>Step 3:</strong> Calculate deduction:</p>
                        <p className="text-sm ml-4">Per Hour Rate = Monthly Salary ÷ (30 days × 8 hours)</p>
                        <p className="text-sm ml-4">Minute Deduction = Hours × Per Hour Rate</p>
                    </div>

                    <p className="text-sm bg-amber-50 border border-amber-200 rounded p-3 mt-4">
                        <strong>Example:</strong> Employee with 20,000 AED monthly salary who is 120 minutes late in the month:
                        <br/>• Per hour rate = 20,000 ÷ (30 × 8) = 83.33 AED/hour
                        <br/>• 120 minutes = 2 hours
                        <br/>• Deduction = 2 × 83.33 = 166.66 AED
                        <br/>• Net salary = 20,000 - 166.66 = 19,833.34 AED
                    </p>

                    <h3 className="text-xl font-semibold mt-6">How Rounding Works</h3>
                    <p>
                        To ensure fair and consistent calculations:
                    </p>
                    <ul>
                        <li>All intermediate calculations use full precision (no rounding)</li>
                        <li>Only the final net salary is rounded to 2 decimal places</li>
                        <li>Rounding is standard mathematical rounding (0.5 and above rounds up)</li>
                        <li>This prevents cumulative rounding errors that could affect employees unfairly</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">What Happens When Salary Data is Missing</h3>
                    <p>
                        If an employee's basic salary is not entered in the system:
                    </p>
                    <ul>
                        <li>Attendance analysis still completes normally</li>
                        <li>Late minutes, absences, and other metrics are calculated</li>
                        <li>Salary tab shows "No salary information" for that employee</li>
                        <li>HR must add salary data before finalizing payroll</li>
                        <li>System prevents finalization if any employee is missing salary data</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">How Deductions are Controlled and Reviewed</h3>
                    <p>
                        Multiple safeguards exist to prevent incorrect deductions:
                    </p>
                    <ul>
                        <li><strong>Before Finalization:</strong> HR reviews all salary calculations on screen</li>
                        <li><strong>Day-by-Day Review:</strong> Managers can drill down to see each day's status</li>
                        <li><strong>Exception Review:</strong> All manual corrections and approvals are visible</li>
                        <li><strong>Export Before Save:</strong> Export to Excel for external review before finalizing</li>
                        <li><strong>Reopen Capability:</strong> Admins can reopen closed projects to correct errors</li>
                        <li><strong>Audit Trail:</strong> All changes are logged with user name and timestamp</li>
                    </ul>
                </Section>

                {/* Approval Process */}
                <Section id="approvals" title="6. Approval Process" icon={CheckCircle2}>
                    <h3 className="text-xl font-semibold mt-0">Who Approves</h3>
                    <p>
                        The approval process involves two levels currently implemented for Al Maraghi Auto Repairs:
                    </p>
                    <div className="space-y-3">
                        <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                            <h4 className="font-semibold text-green-900">Department Heads (First Level)</h4>
                            <ul className="text-sm text-green-800 mt-2">
                                <li>Can pre-approve minutes BEFORE report is generated</li>
                                <li>Must provide a reason for each approval</li>
                                <li>Can only approve for employees in their department</li>
                                <li>Cannot approve after project end date</li>
                                <li>All approvals are recorded and visible to HR</li>
                            </ul>
                        </div>

                        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900">HR Managers (Final Level)</h4>
                            <ul className="text-sm text-blue-800 mt-2">
                                <li>Review all pre-approvals made by department heads</li>
                                <li>Can add manual exceptions if needed</li>
                                <li>Generate final reports with all approvals applied</li>
                                <li>Finalize salary calculations for payroll</li>
                                <li>Have authority to override or adjust as needed</li>
                            </ul>
                        </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">What Approved Minutes Mean</h3>
                    <p>
                        When a department head approves minutes for an employee:
                    </p>
                    <ul>
                        <li>Those minutes are <strong>deducted from calculated late/early minutes</strong></li>
                        <li>The employee is not penalized for those specific minutes</li>
                        <li>The reason is recorded (e.g., "Hospital appointment", "Family emergency")</li>
                        <li>This creates a documented exception for audit purposes</li>
                    </ul>
                    <p className="text-sm bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                        <strong>Example:</strong> Employee is calculated as 90 minutes late in total for the month. 
                        Department head approves 60 minutes for a documented hospital visit on one day. 
                        Final deductible late minutes = 90 - 60 = 30 minutes.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">How Quarterly Grace Works</h3>
                    <p>
                        Some companies allocate a quarterly allowance of "other minutes" that department heads can approve:
                    </p>
                    <ul>
                        <li>Each employee gets a fixed allowance per quarter (e.g., 120 minutes)</li>
                        <li>Department heads can approve from this allowance for valid reasons</li>
                        <li>Once exhausted, no more approvals can be made until next quarter</li>
                        <li>Unused minutes may or may not carry forward (company policy)</li>
                        <li>System tracks usage and shows remaining balance</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">What Cannot Be Overridden</h3>
                    <p>
                        To maintain policy integrity, certain things cannot be approved or overridden:
                    </p>
                    <ul>
                        <li><strong>Full Day Absences:</strong> Cannot be converted to present via approval minutes</li>
                        <li><strong>Past Cutoff Date:</strong> Cannot approve minutes after project ends</li>
                        <li><strong>Public Holidays:</strong> Cannot be changed by department heads</li>
                        <li><strong>Other Employees' Data:</strong> Department heads only see their own department</li>
                        <li><strong>Finalized Reports:</strong> Once salary is saved, project is closed to changes</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">How Misuse is Prevented</h3>
                    <div className="bg-red-50 border border-red-300 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900 mb-2">System Safeguards:</h4>
                        <ul className="text-sm text-red-800">
                            <li><strong>Complete Audit Trail:</strong> Every approval shows who approved, when, and why</li>
                            <li><strong>Date Limits:</strong> Cannot approve for past months after cutoff</li>
                            <li><strong>Reason Required:</strong> All approvals must include explanation</li>
                            <li><strong>HR Visibility:</strong> HR managers see all approvals before finalizing payroll</li>
                            <li><strong>Usage Tracking:</strong> Quarterly allowance usage is tracked and limited</li>
                            <li><strong>Read-Only Archives:</strong> After finalization, records become permanent</li>
                            <li><strong>Activity Logging:</strong> All user actions are logged for security review</li>
                        </ul>
                    </div>
                </Section>

                {/* Roles & Responsibilities */}
                <Section id="roles" title="7. Roles & Responsibilities" icon={Users}>
                    <div className="space-y-4">
                        <div className="border-2 border-purple-300 rounded-lg p-4 bg-purple-50">
                            <h4 className="text-lg font-bold text-purple-900 mb-2">Admin</h4>
                            <div className="text-sm text-purple-800">
                                <p className="font-semibold mb-2">Responsibilities:</p>
                                <ul>
                                    <li>Full system configuration and setup</li>
                                    <li>Create and manage user accounts</li>
                                    <li>Set up attendance rules and policies</li>
                                    <li>Configure page-level permissions</li>
                                    <li>Manage all projects across all companies</li>
                                    <li>Upload and process attendance data</li>
                                    <li>Generate and finalize reports</li>
                                    <li>Handle salary calculations and exports</li>
                                    <li>Reopen closed projects when needed</li>
                                </ul>
                                <p className="font-semibold mt-3 mb-2">Limitations:</p>
                                <p>No limitations - full system access for maintenance and troubleshooting</p>
                            </div>
                        </div>

                        <div className="border-2 border-blue-300 rounded-lg p-4 bg-blue-50">
                            <h4 className="text-lg font-bold text-blue-900 mb-2">Supervisor & User Roles</h4>
                            <div className="text-sm text-blue-800">
                                <p className="font-semibold mb-2">Responsibilities (Full Project Access):</p>
                                <ul>
                                    <li>Create and manage projects</li>
                                    <li>Upload attendance and shift data</li>
                                    <li>Add and manage exceptions</li>
                                    <li>Run attendance analysis</li>
                                    <li>Generate, review, and edit reports</li>
                                    <li>View salary calculations (Admin/CEO only for Salary tab)</li>
                                    <li>Export data for payroll processing</li>
                                    <li>Edit daily breakdowns and apply manual corrections</li>
                                    <li>Finalize reports and create exceptions</li>
                                </ul>
                                <p className="font-semibold mt-3 mb-2">Limitations:</p>
                                <ul>
                                    <li>Cannot create or manage user accounts</li>
                                    <li>Cannot change system-wide settings or rules</li>
                                    <li>Cannot configure page permissions</li>
                                    <li>Cannot access Salary tab (restricted to Admin/CEO)</li>
                                    <li>Cannot reopen closed projects (Admin only)</li>
                                </ul>
                                <p className="text-xs bg-blue-100 rounded p-2 mt-2">
                                    <strong>Project Permissions:</strong> User and Supervisor roles have full access within project operations - 
                                    same permissions as Admin for creating, editing, analyzing, and reporting within projects.
                                </p>
                            </div>
                        </div>

                        <div className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
                            <h4 className="text-lg font-bold text-green-900 mb-2">CEO</h4>
                            <div className="text-sm text-green-800">
                                <p className="font-semibold mb-2">Responsibilities:</p>
                                <ul>
                                    <li>View all reports and analytics across all companies</li>
                                    <li>Review attendance trends and patterns</li>
                                    <li>Access salary information for oversight</li>
                                    <li>Manage user accounts and permissions</li>
                                    <li>Review audit logs and system usage</li>
                                </ul>
                                <p className="font-semibold mt-3 mb-2">Limitations:</p>
                                <ul>
                                    <li>Cannot create or modify projects</li>
                                    <li>Cannot upload attendance data</li>
                                    <li>Cannot run analysis or change employee data</li>
                                    <li>Read-only access to operational data</li>
                                </ul>
                                <p className="text-xs bg-green-100 rounded p-2 mt-2">
                                    <strong>Purpose:</strong> CEO role is designed for oversight and strategic decision-making, 
                                    not day-to-day operations.
                                </p>
                            </div>
                        </div>

                        <div className="border-2 border-amber-300 rounded-lg p-4 bg-amber-50">
                            <h4 className="text-lg font-bold text-amber-900 mb-2">Department Head</h4>
                            <div className="text-sm text-amber-800">
                                <p className="font-semibold mb-2">Responsibilities (Al Maraghi Auto Repairs only):</p>
                                <ul>
                                    <li>Pre-approve late/early minutes for valid reasons</li>
                                    <li>Provide reasons for each approval</li>
                                    <li>View current month's project for their department</li>
                                    <li>View previous month's finalized reports</li>
                                    <li>Monitor team attendance patterns</li>
                                </ul>
                                <p className="font-semibold mt-3 mb-2">Limitations:</p>
                                <ul>
                                    <li>Can only see their assigned department</li>
                                    <li>Cannot create or modify projects</li>
                                    <li>Cannot run analysis or generate reports</li>
                                    <li>Cannot access any other pages or settings</li>
                                    <li>Cannot approve after project end date</li>
                                    <li>Single-page access only (no navigation menu)</li>
                                </ul>
                                <p className="text-xs bg-amber-100 rounded p-2 mt-2">
                                    <strong>Purpose:</strong> Department heads provide first-level approval for their team's 
                                    legitimate attendance exceptions before HR finalizes payroll.
                                </p>
                            </div>
                        </div>


                    </div>
                </Section>

                {/* Controls & Safeguards */}
                <Section id="controls" title="8. Controls & Safeguards" icon={Shield}>
                    <h3 className="text-xl font-semibold mt-0">Audit Trails</h3>
                    <p>
                        The system maintains comprehensive records of all activities:
                    </p>
                    <ul>
                        <li><strong>User Login Activity:</strong> Who logged in, when, from what IP address</li>
                        <li><strong>Data Changes:</strong> Every create, update, delete operation is logged with user and timestamp</li>
                        <li><strong>Manual Corrections:</strong> All manual attendance adjustments show who made them and why</li>
                        <li><strong>Approvals:</strong> Complete history of department head approvals with reasons</li>
                        <li><strong>Report Generation:</strong> When reports were generated and by whom</li>
                        <li><strong>Salary Finalization:</strong> When payroll was finalized and by which manager</li>
                    </ul>
                    <p className="text-sm bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                        <strong>Compliance Value:</strong> These audit trails are essential for labor law compliance, 
                        internal audits, and dispute resolution. Records are permanent and cannot be deleted.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Data Separation Between Companies</h3>
                    <p>
                        If you manage multiple companies in the system:
                    </p>
                    <ul>
                        <li>Each company's data is completely isolated</li>
                        <li>Regular users can only see their assigned company</li>
                        <li>Projects cannot span multiple companies</li>
                        <li>Reports are company-specific</li>
                        <li>Only admins, supervisors, and CEOs can access multiple companies</li>
                        <li>Employee IDs can overlap between companies without conflict</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Prevention of Duplicate Employees</h3>
                    <p>
                        To avoid payroll errors from duplicate employee records:
                    </p>
                    <ul>
                        <li>Each employee has a unique HRMS ID across all companies</li>
                        <li>System prevents creating employees with duplicate HRMS IDs</li>
                        <li>Attendance IDs are unique within each company</li>
                        <li>When uploading punch data, system flags unrecognized employee IDs</li>
                        <li>Bulk import tools validate data before creating records</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Protection Against Accidental Deletion</h3>
                    <p>
                        Multiple safeguards prevent accidental data loss:
                    </p>
                    <ul>
                        <li><strong>Confirmation Dialogs:</strong> All delete operations require explicit confirmation</li>
                        <li><strong>Cascade Protection:</strong> System warns if deleting a project will delete related data</li>
                        <li><strong>Closed Project Protection:</strong> Finalized projects cannot be deleted easily</li>
                        <li><strong>Role-Based Restrictions:</strong> Only admins can delete most data</li>
                        <li><strong>Activity Logging:</strong> All deletions are logged with user information</li>
                    </ul>
                    <p className="text-sm bg-red-50 border border-red-200 rounded p-3 mt-2">
                        <strong>Best Practice:</strong> Never delete old projects. Instead, close them. Closed projects are 
                        read-only and preserved for historical reference and audits.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Security Measures</h3>
                    <div className="bg-slate-100 border border-slate-300 rounded-lg p-4">
                        <ul className="text-sm">
                            <li><strong>Authentication Required:</strong> All users must log in with email and password</li>
                            <li><strong>Session Management:</strong> Sessions expire after inactivity</li>
                            <li><strong>Role Enforcement:</strong> Backend validates permissions on every operation</li>
                            <li><strong>Page-Level Access Control:</strong> Users only see pages they're permitted to access</li>
                            <li><strong>Data Scoping:</strong> Regular users automatically filtered to their company only</li>
                            <li><strong>IP Logging:</strong> All login attempts recorded with IP address for security review</li>
                        </ul>
                    </div>
                </Section>

                {/* Reports & Accountability */}
                <Section id="reports" title="9. Reports & Accountability" icon={FileText}>
                    <h3 className="text-xl font-semibold mt-0">What Reports Exist</h3>
                    <div className="space-y-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <h4 className="font-semibold text-blue-900">Summary Attendance Report</h4>
                            <p className="text-sm text-blue-800">
                                One row per employee showing: working days, present days, absences, half days, 
                                late minutes, early checkout minutes, sick leave days, annual leave days, and any notes.
                            </p>
                            <p className="text-xs text-blue-700 mt-2">
                                <strong>Purpose:</strong> Quick overview for HR to spot issues and prepare for payroll
                            </p>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <h4 className="font-semibold text-green-900">Daily Breakdown Report</h4>
                            <p className="text-sm text-green-800">
                                Day-by-day detail for each employee showing: punch times, shift times, status (present/absent/half), 
                                late minutes per day, early checkout minutes per day, and applied exceptions.
                            </p>
                            <p className="text-xs text-green-700 mt-2">
                                <strong>Purpose:</strong> Detailed investigation of disputes and verification of calculations
                            </p>
                        </div>

                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <h4 className="font-semibold text-purple-900">Salary Calculation Report</h4>
                            <p className="text-sm text-purple-800">
                                Shows for each employee: basic salary, full day deductions, half day deductions, 
                                minute-based deductions, total deductions, and final net salary.
                            </p>
                            <p className="text-xs text-purple-700 mt-2">
                                <strong>Purpose:</strong> Final payroll information ready for bank transfer or processing
                            </p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <h4 className="font-semibold text-amber-900">Exception Report</h4>
                            <p className="text-sm text-amber-800">
                                Lists all exceptions applied during the period: public holidays, leave days, 
                                manual corrections, pre-approvals, with dates and reasons.
                            </p>
                            <p className="text-xs text-amber-700 mt-2">
                                <strong>Purpose:</strong> Audit trail of all special cases and manual interventions
                            </p>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <h4 className="font-semibold text-red-900">Abnormal Dates Report</h4>
                            <p className="text-sm text-red-800">
                                Highlights dates with unusual patterns: excessive punches, very early/late punches, 
                                or dates manually flagged as abnormal.
                            </p>
                            <p className="text-xs text-red-700 mt-2">
                                <strong>Purpose:</strong> Identify potential biometric system issues or data quality problems
                            </p>
                        </div>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">How They Should Be Interpreted</h3>
                    <div className="bg-slate-100 border border-slate-300 rounded-lg p-4">
                        <h4 className="font-semibold text-slate-900 mb-2">Report Reading Guidelines:</h4>
                        <ul className="text-sm">
                            <li><strong>Check Working Days First:</strong> Verify working days count excludes weekends and holidays</li>
                            <li><strong>Review Exceptions:</strong> Understand which exceptions affected the calculations</li>
                            <li><strong>Investigate Abnormals:</strong> Check abnormal dates list for data quality issues</li>
                            <li><strong>Verify High Deductions:</strong> Employees with high deductions should be reviewed manually</li>
                            <li><strong>Compare Month-to-Month:</strong> Sudden changes in patterns may indicate issues</li>
                            <li><strong>Cross-Check Approvals:</strong> Ensure all department head approvals are legitimate</li>
                        </ul>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">What Reports Are Legally or Operationally Important</h3>
                    <ul>
                        <li><strong>Salary Calculation Report:</strong> Must be preserved for labor law compliance (typically 5+ years)</li>
                        <li><strong>Daily Breakdown:</strong> Essential for dispute resolution with employees</li>
                        <li><strong>Exception Report:</strong> Required for internal audit and compliance reviews</li>
                        <li><strong>Final Monthly Report:</strong> Must be signed off by HR manager before payroll processing</li>
                    </ul>
                    <p className="text-sm bg-red-50 border border-red-200 rounded p-3 mt-2">
                        <strong>Legal Requirement:</strong> Labor laws typically require attendance records to be kept for 
                        5-7 years. This system maintains permanent records that satisfy this requirement.
                    </p>
                </Section>

                {/* Change Management */}
                <Section id="changes" title="10. Change Management" icon={AlertCircle}>
                    <h3 className="text-xl font-semibold mt-0">What Happens When Rules Change</h3>
                    <p>
                        When your company changes attendance policies (e.g., new grace period, different shift times):
                    </p>
                    <ul>
                        <li><strong>Old Projects Unaffected:</strong> Historical projects use the rules that were in effect at that time</li>
                        <li><strong>New Projects Use New Rules:</strong> Future projects automatically use updated rules</li>
                        <li><strong>Re-Analysis Option:</strong> Old projects can be re-analyzed with new rules if needed</li>
                        <li><strong>Documentation Required:</strong> Rule changes should be documented with effective date</li>
                    </ul>
                    <p className="text-sm bg-amber-50 border border-amber-200 rounded p-3 mt-2">
                        <strong>Example:</strong> Company changes grace period from 15 to 30 minutes effective March 1. 
                        January and February projects remain calculated with 15 minutes. March onwards use 30 minutes.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Why Re-Analysis is Controlled</h3>
                    <p>
                        Re-running analysis on a project recalculates all attendance metrics. This is controlled because:
                    </p>
                    <ul>
                        <li>It can change previously finalized salary calculations</li>
                        <li>Employees may have already been paid based on original calculations</li>
                        <li>Re-analysis should only occur when errors are discovered</li>
                        <li>All re-analysis operations are logged for audit purposes</li>
                    </ul>
                    <p className="text-sm bg-red-50 border border-red-200 rounded p-3 mt-2">
                        <strong>Control Measure:</strong> Once a project status is "closed" (salary finalized), it becomes 
                        read-only. Only admins can reopen for corrections, and this action is logged.
                    </p>

                    <h3 className="text-xl font-semibold mt-6">Why Documentation Must Stay Updated</h3>
                    <p>
                        The system includes both business and technical documentation that must be maintained:
                    </p>
                    <ul>
                        <li><strong>New Features:</strong> When new capabilities are added, documentation must explain them</li>
                        <li><strong>Rule Changes:</strong> Policy updates should be documented for future reference</li>
                        <li><strong>Process Changes:</strong> Updated workflows need to be reflected in user guides</li>
                        <li><strong>Compliance:</strong> Auditors may review documentation to verify policy compliance</li>
                        <li><strong>Training:</strong> New users rely on documentation to learn the system</li>
                    </ul>

                    <h3 className="text-xl font-semibold mt-6">Best Practices for Managing Changes</h3>
                    <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                        <ol className="text-sm">
                            <li><strong>Announce Changes:</strong> Notify all users before implementing policy changes</li>
                            <li><strong>Test First:</strong> Create a test project to verify new rules work correctly</li>
                            <li><strong>Document Everything:</strong> Update both business and technical documentation</li>
                            <li><strong>Grandfather Old Projects:</strong> Don't retroactively apply new rules unless necessary</li>
                            <li><strong>Train Users:</strong> Ensure HR staff understand new features or rule changes</li>
                            <li><strong>Review Impact:</strong> Check how changes affect current month's processing</li>
                            <li><strong>Maintain Audit Trail:</strong> Keep records of when and why changes were made</li>
                        </ol>
                    </div>

                    <h3 className="text-xl font-semibold mt-6">Who Can Make What Changes</h3>
                    <table className="w-full text-sm border-collapse mt-3">
                        <thead>
                            <tr className="bg-slate-100">
                                <th className="border border-slate-300 p-2 text-left">Change Type</th>
                                <th className="border border-slate-300 p-2 text-left">Who Can Make It</th>
                                <th className="border border-slate-300 p-2 text-left">Approval Required</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border border-slate-300 p-2">Attendance rules (grace period, shift times)</td>
                                <td className="border border-slate-300 p-2">Admin only</td>
                                <td className="border border-slate-300 p-2">Management approval recommended</td>
                            </tr>
                            <tr>
                                <td className="border border-slate-300 p-2">User roles and permissions</td>
                                <td className="border border-slate-300 p-2">Admin or CEO</td>
                                <td className="border border-slate-300 p-2">HR manager approval</td>
                            </tr>
                            <tr>
                                <td className="border border-slate-300 p-2">Adding manual exceptions</td>
                                <td className="border border-slate-300 p-2">Admin or Supervisor</td>
                                <td className="border border-slate-300 p-2">No (but logged)</td>
                            </tr>
                            <tr>
                                <td className="border border-slate-300 p-2">Finalizing salary</td>
                                <td className="border border-slate-300 p-2">Admin only</td>
                                <td className="border border-slate-300 p-2">HR manager review required</td>
                            </tr>
                            <tr>
                                <td className="border border-slate-300 p-2">Reopening closed projects</td>
                                <td className="border border-slate-300 p-2">Admin only</td>
                                <td className="border border-slate-300 p-2">Management approval required</td>
                            </tr>
                        </tbody>
                    </table>
                </Section>
            </div>

            {/* Footer */}
            <Card className="bg-indigo-50 border-indigo-200 mt-8">
                <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-3 text-center">Questions or Concerns?</h3>
                    <p className="text-sm text-indigo-800 text-center mb-4">
                        This business documentation is maintained for HR managers, operations teams, and decision makers. 
                        For questions about policies, processes, or system usage, contact your HR administrator or system owner.
                    </p>
                    <div className="grid md:grid-cols-3 gap-4 text-center text-sm">
                        <div>
                            <p className="font-semibold text-indigo-900">Technical Issues</p>
                            <p className="text-indigo-700">Contact system administrator</p>
                        </div>
                        <div>
                            <p className="font-semibold text-indigo-900">Policy Questions</p>
                            <p className="text-indigo-700">Contact HR manager</p>
                        </div>
                        <div>
                            <p className="font-semibold text-indigo-900">Attendance Disputes</p>
                            <p className="text-indigo-700">Submit to department head</p>
                        </div>
                    </div>
                    <p className="text-xs text-indigo-600 mt-4 text-center">
                        Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}