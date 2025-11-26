import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Book, Users, FolderKanban, Settings, BarChart3, Clock, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function Documentation() {
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
                { label: 'Documentation' }
            ]} />
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-4">
                    <Book className="w-8 h-8 text-indigo-600" />
                </div>
                <h1 className="text-4xl font-bold text-slate-900">Attendance System Documentation</h1>
                <p className="text-lg text-slate-600 mt-3">Complete guide to the attendance tracking and analysis system</p>
            </div>

            <div className="space-y-4">
                <Section id="overview" title="System Overview" icon={BarChart3}>
                    <h3 className="text-xl font-semibold mt-0">What This Software Does</h3>
                    <p>
                        The Attendance Tracking System is a comprehensive solution designed to analyze employee attendance 
                        data based on punch records (clock in/out times). The system processes raw attendance data, compares 
                        it against defined shift timings and rules, and generates detailed reports highlighting:
                    </p>
                    <ul>
                        <li>Present and absent days</li>
                        <li>Late arrivals and early departures</li>
                        <li>Half-day absences</li>
                        <li>Abnormal attendance patterns</li>
                        <li>Comprehensive attendance statistics</li>
                    </ul>
                    
                    <h4 className="text-lg font-semibold mt-6">Key Features</h4>
                    <ul>
                        <li><strong>Project-Based Analysis:</strong> Organize attendance tracking by projects with specific date ranges</li>
                        <li><strong>Flexible Shift Management:</strong> Define different shift timings for different employees and days</li>
                        <li><strong>Exception Handling:</strong> Mark holidays, leave days, and shift overrides</li>
                        <li><strong>Automated Analysis:</strong> Rule-based engine calculates attendance metrics automatically</li>
                        <li><strong>Detailed Reporting:</strong> Export reports with day-by-day breakdowns</li>
                        <li><strong>Role-Based Access:</strong> Admin and user roles with configurable page permissions</li>
                    </ul>
                </Section>

                <Section id="roles" title="User Roles & Permissions" icon={Users}>
                    <h3 className="text-xl font-semibold mt-0">User Roles</h3>
                    
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                        <h4 className="text-lg font-semibold text-purple-900 mb-2">Admin Role</h4>
                        <p className="text-purple-800">Full system access including:</p>
                        <ul className="text-purple-800">
                            <li>Create, edit, and delete projects</li>
                            <li>Manage employees and attendance data</li>
                            <li>Configure system rules and settings</li>
                            <li>Manage users and their roles</li>
                            <li>Configure page-level permissions</li>
                            <li>Run analysis and generate reports</li>
                        </ul>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="text-lg font-semibold text-blue-900 mb-2">User Role</h4>
                        <p className="text-blue-800">Limited access based on page permissions:</p>
                        <ul className="text-blue-800">
                            <li>View projects and reports (if permitted)</li>
                            <li>Access assigned pages only</li>
                            <li>Cannot modify system settings or manage users</li>
                            <li>Permissions are configurable by admins</li>
                        </ul>
                    </div>

                    <h4 className="text-lg font-semibold mt-6">Page Permissions</h4>
                    <p>
                        Admins can control which pages each role can access from the Users & Permissions page. 
                        Default permissions are pre-configured but can be customized per page.
                    </p>
                </Section>

                <Section id="workflow" title="Complete Workflow" icon={FolderKanban}>
                    <h3 className="text-xl font-semibold mt-0">Step-by-Step Process</h3>
                    
                    <div className="space-y-6">
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                            <div>
                                <h4 className="text-lg font-semibold">Create Employees</h4>
                                <p>Go to the <strong>Employees</strong> page and add all employees with their attendance IDs. 
                                Each employee needs a unique attendance ID that matches the ID in punch and shift data.</p>
                                <p className="text-sm text-slate-600 mt-2">
                                    Tip: Use bulk import via Excel/CSV for large employee lists.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                            <div>
                                <h4 className="text-lg font-semibold">Create a Project</h4>
                                <p>Go to <strong>Projects</strong> and click "New Project". Define:</p>
                                <ul className="text-sm">
                                    <li>Project name (e.g., "January 2025 Attendance")</li>
                                    <li>Date range (from - to)</li>
                                    <li>Department (optional)</li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                            <div>
                                <h4 className="text-lg font-semibold">Upload Punch Data</h4>
                                <p>In the project detail page, go to the <strong>Punch Upload</strong> tab:</p>
                                <ul className="text-sm">
                                    <li>Upload CSV file with punch records (attendance ID, timestamp)</li>
                                    <li>System will parse and validate the data</li>
                                    <li>Review warnings for any unrecognized employees</li>
                                    <li>Confirm upload to store punch records</li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
                            <div>
                                <h4 className="text-lg font-semibold">Define Shift Timings</h4>
                                <p>Go to the <strong>Shift Timings</strong> tab:</p>
                                <ul className="text-sm">
                                    <li>Upload CSV with shift timings for each employee</li>
                                    <li>Or manually add shifts using the form</li>
                                    <li>Define AM shift (start & end) and PM shift (start & end)</li>
                                    <li>Specify applicable days (Monday-Thursday & Saturday, Friday, or Monday-Saturday)</li>
                                    <li>Friday shifts are automatically detected and flagged</li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">5</div>
                            <div>
                                <h4 className="text-lg font-semibold">Add Exceptions (Optional)</h4>
                                <p>Go to the <strong>Exceptions</strong> tab to define:</p>
                                <ul className="text-sm">
                                    <li><strong>OFF Days:</strong> Employee leave or days off</li>
                                    <li><strong>Public Holidays:</strong> Apply to all employees (use attendance_id: "ALL")</li>
                                    <li><strong>Shift Overrides:</strong> Custom shift timing for specific dates</li>
                                    <li><strong>Manual Attendance:</strong> Force present/absent/half day</li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">6</div>
                            <div>
                                <h4 className="text-lg font-semibold">Run Analysis</h4>
                                <p>Go to the <strong>Run Analysis</strong> tab:</p>
                                <ul className="text-sm">
                                    <li>Review pre-check status (employees, punches, shifts, rules)</li>
                                    <li>Click "Run Analysis" to start processing</li>
                                    <li>System analyzes each employee's attendance based on rules</li>
                                    <li>Progress bar shows real-time analysis status</li>
                                    <li>Project status changes to "Analyzed" when complete</li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">7</div>
                            <div>
                                <h4 className="text-lg font-semibold">View & Export Reports</h4>
                                <p>Go to the <strong>Report</strong> tab:</p>
                                <ul className="text-sm">
                                    <li>View complete attendance results for all employees</li>
                                    <li>Search and filter results</li>
                                    <li>Export to CSV for external use</li>
                                    <li>Click on any employee to see day-by-day breakdown</li>
                                    <li>View punch times and calculated status for each day</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </Section>

                <Section id="rules" title="Analysis Rules Summary" icon={Settings}>
                    <h3 className="text-xl font-semibold mt-0">How Attendance is Calculated</h3>
                    <p>
                        The system uses a rule-based engine to analyze attendance. Admins can configure these rules 
                        from the <strong>Rules Settings</strong> page. Here's how the analysis works:
                    </p>

                    <div className="space-y-6 mt-6">
                        <div>
                            <h4 className="text-lg font-semibold flex items-center gap-2">
                                <Clock className="w-5 h-5 text-indigo-600" />
                                Date & Time Processing
                            </h4>
                            <ul className="text-sm">
                                <li><strong>Friday Threshold:</strong> Configurable time to determine if a punch belongs to Friday or next day</li>
                                <li><strong>Timestamp Formats:</strong> System auto-detects multiple date/time formats</li>
                                <li><strong>Timezone Handling:</strong> All times processed in local timezone</li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-lg font-semibold flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                                Shift Rules
                            </h4>
                            <ul className="text-sm">
                                <li><strong>Split Shifts:</strong> System supports AM shift and PM shift separately</li>
                                <li><strong>Grace Period:</strong> Configurable minutes (default: 15 min) before marking as late</li>
                                <li><strong>Early Checkout Grace:</strong> Configurable minutes (default: 15 min) for early departure</li>
                                <li><strong>Minimum Hours:</strong> Configurable minimum hours to count as present (default: 4 hours)</li>
                                <li><strong>Friday Shifts:</strong> Can have different rules than regular days</li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-lg font-semibold flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-blue-600" />
                                Attendance Calculation
                            </h4>
                            <ul className="text-sm">
                                <li><strong>Present:</strong> Employee has valid punch records within shift times (± grace period)</li>
                                <li><strong>Absent:</strong> No punch records or punches outside acceptable range</li>
                                <li><strong>Half Day:</strong> Present for only AM or PM shift, not both</li>
                                <li><strong>Late:</strong> First punch after shift start time + grace period</li>
                                <li><strong>Early Checkout:</strong> Last punch before shift end time - grace period</li>
                                <li><strong>Working Days:</strong> Total days in range minus OFF days and public holidays</li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="text-lg font-semibold flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                                Abnormality Detection
                            </h4>
                            <p className="text-sm mb-2">System flags dates with unusual patterns:</p>
                            <ul className="text-sm">
                                <li><strong>Very Early Punch:</strong> Punch before configured time (e.g., before 5:00 AM)</li>
                                <li><strong>Very Late Punch:</strong> Punch after configured time (e.g., after 10:00 PM)</li>
                                <li><strong>Too Many Punches:</strong> More than 10 punches in a single day</li>
                                <li><strong>Specific Abnormal Dates:</strong> Admins can mark specific dates as abnormal</li>
                            </ul>
                            <p className="text-sm text-slate-600 mt-2">
                                Abnormal dates are listed in the "Notes" column of the report for manual review.
                            </p>
                        </div>

                        <div>
                            <h4 className="text-lg font-semibold">Exception Priority</h4>
                            <p className="text-sm">Exceptions override normal calculations in this priority order:</p>
                            <ol className="text-sm">
                                <li>Manual Present/Absent/Half - highest priority</li>
                                <li>OFF days and Public Holidays</li>
                                <li>Shift Overrides</li>
                                <li>Regular shift timings - lowest priority</li>
                            </ol>
                        </div>
                    </div>
                </Section>

                <Section id="data" title="Data Structure" icon={Book}>
                    <h3 className="text-xl font-semibold mt-0">Main Entities</h3>
                    
                    <div className="space-y-4">
                        <div className="border border-slate-200 rounded-lg p-4">
                            <h4 className="font-semibold text-indigo-900">Employee</h4>
                            <p className="text-sm text-slate-600">Master list of all employees in the organization</p>
                            <ul className="text-sm mt-2">
                                <li><strong>attendance_id:</strong> Unique identifier (must match punch/shift data)</li>
                                <li><strong>name:</strong> Employee full name</li>
                                <li><strong>company:</strong> Company employee belongs to</li>
                                <li><strong>active:</strong> Whether employee is currently active</li>
                            </ul>
                        </div>

                        <div className="border border-slate-200 rounded-lg p-4">
                            <h4 className="font-semibold text-indigo-900">Project</h4>
                            <p className="text-sm text-slate-600">Analysis period container for attendance data</p>
                            <ul className="text-sm mt-2">
                                <li><strong>name:</strong> Project name</li>
                                <li><strong>date_from, date_to:</strong> Analysis date range</li>
                                <li><strong>department:</strong> Optional department filter</li>
                                <li><strong>status:</strong> draft / analyzed / locked</li>
                            </ul>
                        </div>

                        <div className="border border-slate-200 rounded-lg p-4">
                            <h4 className="font-semibold text-indigo-900">Punch</h4>
                            <p className="text-sm text-slate-600">Clock in/out records for employees</p>
                            <ul className="text-sm mt-2">
                                <li><strong>project_id:</strong> Links to project</li>
                                <li><strong>attendance_id:</strong> Employee identifier</li>
                                <li><strong>timestamp_raw:</strong> Original timestamp (never modified)</li>
                                <li><strong>punch_date:</strong> Extracted date for filtering</li>
                            </ul>
                        </div>

                        <div className="border border-slate-200 rounded-lg p-4">
                            <h4 className="font-semibold text-indigo-900">ShiftTiming</h4>
                            <p className="text-sm text-slate-600">Expected work hours for employees</p>
                            <ul className="text-sm mt-2">
                                <li><strong>project_id:</strong> Links to project</li>
                                <li><strong>attendance_id:</strong> Employee identifier</li>
                                <li><strong>applicable_days:</strong> Days this shift applies to</li>
                                <li><strong>am_start, am_end:</strong> Morning shift times</li>
                                <li><strong>pm_start, pm_end:</strong> Afternoon shift times</li>
                                <li><strong>is_friday_shift:</strong> Auto-flagged for Friday shifts</li>
                            </ul>
                        </div>

                        <div className="border border-slate-200 rounded-lg p-4">
                            <h4 className="font-semibold text-indigo-900">Exception</h4>
                            <p className="text-sm text-slate-600">Special cases overriding normal rules</p>
                            <ul className="text-sm mt-2">
                                <li><strong>project_id:</strong> Links to project</li>
                                <li><strong>attendance_id:</strong> Employee (or "ALL" for public holidays)</li>
                                <li><strong>date_from, date_to:</strong> Exception date range</li>
                                <li><strong>type:</strong> OFF / PUBLIC_HOLIDAY / SHIFT_OVERRIDE / MANUAL_PRESENT / MANUAL_ABSENT / MANUAL_HALF</li>
                                <li><strong>new_*:</strong> Override shift times (for SHIFT_OVERRIDE type)</li>
                                <li><strong>details:</strong> Notes about the exception</li>
                            </ul>
                        </div>

                        <div className="border border-slate-200 rounded-lg p-4">
                            <h4 className="font-semibold text-indigo-900">AnalysisResult</h4>
                            <p className="text-sm text-slate-600">Computed attendance metrics per employee</p>
                            <ul className="text-sm mt-2">
                                <li><strong>project_id:</strong> Links to project</li>
                                <li><strong>attendance_id:</strong> Employee identifier</li>
                                <li><strong>working_days:</strong> Total working days in period</li>
                                <li><strong>present_days:</strong> Days marked as present</li>
                                <li><strong>full_absence_count:</strong> Full day absences</li>
                                <li><strong>half_absence_count:</strong> Half day absences</li>
                                <li><strong>late_minutes:</strong> Total late minutes</li>
                                <li><strong>early_checkout_minutes:</strong> Total early checkout minutes</li>
                                <li><strong>abnormal_dates:</strong> Dates with unusual patterns</li>
                                <li><strong>notes:</strong> Abnormal dates list</li>
                            </ul>
                        </div>
                    </div>
                </Section>

                <Section id="tips" title="Best Practices & Tips" icon={CheckCircle2}>
                    <h3 className="text-xl font-semibold mt-0">Tips for Best Results</h3>
                    
                    <div className="space-y-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h4 className="font-semibold text-green-900">Data Preparation</h4>
                            <ul className="text-sm text-green-800">
                                <li>Ensure attendance IDs are consistent across employees, punches, and shifts</li>
                                <li>Use consistent date/time formats in CSV files</li>
                                <li>Test with a small project first before processing large datasets</li>
                                <li>Keep backup copies of original punch data</li>
                            </ul>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900">Project Management</h4>
                            <ul className="text-sm text-blue-800">
                                <li>Use descriptive project names with month/year (e.g., "January 2025 - Engineering")</li>
                                <li>Keep projects for monthly or weekly periods for easier tracking</li>
                                <li>Use the duplicate feature to copy project settings for next period</li>
                                <li>Lock projects after final approval to prevent accidental changes</li>
                            </ul>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <h4 className="font-semibold text-amber-900">Analysis Accuracy</h4>
                            <ul className="text-sm text-amber-800">
                                <li>Configure rules before running first analysis</li>
                                <li>Review abnormal dates in reports and add exceptions if needed</li>
                                <li>Use manual attendance overrides for known special cases</li>
                                <li>Re-run analysis after adding exceptions to update results</li>
                                <li>Check day-by-day breakdown for suspicious results</li>
                            </ul>
                        </div>

                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                            <h4 className="font-semibold text-purple-900">System Configuration</h4>
                            <ul className="text-sm text-purple-800">
                                <li>Set up page permissions based on your organization's access needs</li>
                                <li>Configure grace periods that match your company policy</li>
                                <li>Define public holidays at the start of the year</li>
                                <li>Document any custom rules or processes for your team</li>
                            </ul>
                        </div>
                    </div>
                </Section>

                <Section id="troubleshooting" title="Common Issues & Solutions" icon={AlertTriangle}>
                    <h3 className="text-xl font-semibold mt-0">Troubleshooting Guide</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <h4 className="font-semibold text-slate-900">Issue: Employees showing as absent despite punch records</h4>
                            <p className="text-sm text-slate-600">
                                <strong>Solution:</strong> Check if shift timings are defined for those employees. 
                                Also verify that punch times fall within shift times + grace period.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-slate-900">Issue: CSV upload fails or shows warnings</h4>
                            <p className="text-sm text-slate-600">
                                <strong>Solution:</strong> Ensure attendance IDs in CSV match exactly with employee records. 
                                Check for special characters or extra spaces in the data.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-slate-900">Issue: Friday attendance calculated incorrectly</h4>
                            <p className="text-sm text-slate-600">
                                <strong>Solution:</strong> Make sure Friday shift timings are defined separately with "Friday" in applicable_days. 
                                Check the Friday threshold setting in Rules Settings.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-slate-900">Issue: Too many abnormal dates flagged</h4>
                            <p className="text-sm text-slate-600">
                                <strong>Solution:</strong> Adjust the abnormality detection thresholds in Rules Settings. 
                                You can set wider time ranges or increase the minimum punch count threshold.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-slate-900">Issue: Analysis taking too long</h4>
                            <p className="text-sm text-slate-600">
                                <strong>Solution:</strong> This is normal for large datasets (100+ employees with 25+ days). 
                                The system processes client-side for accuracy. Let it complete without closing the browser.
                            </p>
                        </div>

                        <div>
                            <h4 className="font-semibold text-slate-900">Issue: Cannot delete project</h4>
                            <p className="text-sm text-slate-600">
                                <strong>Solution:</strong> Projects with large amounts of data may take time to delete. 
                                The system removes all associated records (punches, shifts, exceptions) before deleting the project.
                            </p>
                        </div>
                    </div>
                </Section>
            </div>

            <Card className="bg-indigo-50 border-indigo-200">
                <CardContent className="p-6 text-center">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-2">Need More Help?</h3>
                    <p className="text-indigo-800">
                        For additional support or feature requests, contact your system administrator or 
                        refer to the Rules Settings page for detailed configuration options.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}