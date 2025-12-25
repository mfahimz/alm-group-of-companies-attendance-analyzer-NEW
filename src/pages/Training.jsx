import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Users, FolderKanban, Clock, AlertCircle, BarChart3, Building2, CheckCircle } from 'lucide-react';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function Training() {
    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Training Guide' }]} />
            
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-indigo-100 p-3 rounded-xl">
                    <BookOpen className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Training Guide</h1>
                    <p className="text-slate-600 mt-1">Complete guide to the ALM Attendance Management System</p>
                </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-6">
                <TabsList className="grid w-full grid-cols-7">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="roles">Roles</TabsTrigger>
                    <TabsTrigger value="projects">Projects</TabsTrigger>
                    <TabsTrigger value="workflow">Workflow</TabsTrigger>
                    <TabsTrigger value="features">Features</TabsTrigger>
                    <TabsTrigger value="companies">Companies</TabsTrigger>
                    <TabsTrigger value="faq">FAQ</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <h3 className="font-semibold text-lg mb-2">What is ALM Attendance?</h3>
                                <p className="text-slate-600">
                                    ALM Attendance is a comprehensive attendance management system designed to track, analyze, and report on employee attendance across multiple companies. The system processes punch data, applies shift rules, manages exceptions, and generates detailed attendance reports.
                                </p>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg mb-2">Key Features</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                                        <FolderKanban className="w-5 h-5 text-indigo-600 mt-0.5" />
                                        <div>
                                            <h4 className="font-medium">Project Management</h4>
                                            <p className="text-sm text-slate-600">Create projects for specific date ranges to analyze attendance</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                                        <Users className="w-5 h-5 text-indigo-600 mt-0.5" />
                                        <div>
                                            <h4 className="font-medium">Employee Database</h4>
                                            <p className="text-sm text-slate-600">Centralized employee records with HRMS and Attendance IDs</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                                        <Clock className="w-5 h-5 text-indigo-600 mt-0.5" />
                                        <div>
                                            <h4 className="font-medium">Shift Management</h4>
                                            <p className="text-sm text-slate-600">Define and manage employee shift timings with multiple blocks</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                                        <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5" />
                                        <div>
                                            <h4 className="font-medium">Exception Handling</h4>
                                            <p className="text-sm text-slate-600">Manage leaves, holidays, and special cases</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                                        <BarChart3 className="w-5 h-5 text-indigo-600 mt-0.5" />
                                        <div>
                                            <h4 className="font-medium">Advanced Analytics</h4>
                                            <p className="text-sm text-slate-600">Automated analysis with detailed reports and insights</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                                        <CheckCircle className="w-5 h-5 text-indigo-600 mt-0.5" />
                                        <div>
                                            <h4 className="font-medium">Approval Workflow</h4>
                                            <p className="text-sm text-slate-600">Exception approvals by admins and supervisors</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg mb-2">Supported Companies</h3>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <Badge className="bg-indigo-100 text-indigo-700">Al Maraghi Auto Repairs</Badge>
                                    <Badge className="bg-purple-100 text-purple-700">Al Maraghi Automotive</Badge>
                                    <Badge className="bg-blue-100 text-blue-700">Naser Mohsin Auto Parts</Badge>
                                    <Badge className="bg-green-100 text-green-700">Astra Auto Parts</Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Roles Tab */}
                <TabsContent value="roles" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>User Roles & Permissions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge className="bg-purple-600">Admin</Badge>
                                    <h3 className="font-semibold text-lg">Administrator</h3>
                                </div>
                                <p className="text-slate-600 mb-3">Full system access with all privileges</p>
                                <h4 className="font-medium mb-2">Permissions:</h4>
                                <ul className="list-disc list-inside space-y-1 text-slate-600">
                                    <li>Manage all projects across all companies</li>
                                    <li>Create, edit, and delete employees</li>
                                    <li>Upload and manage punches, shifts, and exceptions</li>
                                    <li>Run analysis and generate reports</li>
                                    <li>Lock, close, and finalize projects</li>
                                    <li>Approve or reject user exception requests</li>
                                    <li>Access system settings and configurations</li>
                                    <li>Manage users and permissions</li>
                                    <li>View audit trails and activity logs</li>
                                </ul>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge className="bg-blue-600">Supervisor</Badge>
                                    <h3 className="font-semibold text-lg">Supervisor</h3>
                                </div>
                                <p className="text-slate-600 mb-3">Access to all companies but no system settings</p>
                                <h4 className="font-medium mb-2">Permissions:</h4>
                                <ul className="list-disc list-inside space-y-1 text-slate-600">
                                    <li>View and manage all projects across all companies</li>
                                    <li>Upload and manage punches, shifts, and exceptions</li>
                                    <li>Run analysis and generate reports</li>
                                    <li>Approve or reject user exception requests</li>
                                    <li>Access Reports & Analytics dashboard</li>
                                    <li><strong>Cannot:</strong> Access system settings, manage users, or close projects</li>
                                </ul>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge className="bg-slate-600">User</Badge>
                                    <h3 className="font-semibold text-lg">Regular User</h3>
                                </div>
                                <p className="text-slate-600 mb-3">Company-specific read-only access with exception creation</p>
                                <h4 className="font-medium mb-2">Permissions:</h4>
                                <ul className="list-disc list-inside space-y-1 text-slate-600">
                                    <li>View projects from assigned company only</li>
                                    <li>View employee list (read-only)</li>
                                    <li>View punches and shifts (read-only)</li>
                                    <li>Create exception requests (requires approval)</li>
                                    <li>View existing exceptions</li>
                                    <li>View reports (read-only, cannot modify)</li>
                                    <li><strong>Cannot:</strong> Edit data, upload files, run analysis, or access other companies</li>
                                </ul>
                                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded">
                                    <p className="text-sm text-amber-800">
                                        <strong>Note:</strong> Exception requests created by users are marked as "Pending" and require approval from Admin or Supervisor before being used in analysis.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Projects Tab */}
                <TabsContent value="projects" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Project Management Guide</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h3 className="font-semibold text-lg mb-2">What is a Project?</h3>
                                <p className="text-slate-600">
                                    A project represents a specific time period for analyzing employee attendance. Each project is tied to a company and date range, containing all punches, shifts, exceptions, and analysis results for that period.
                                </p>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg mb-3">Project Lifecycle</h3>
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <Badge className="bg-amber-100 text-amber-700 mt-1">Draft</Badge>
                                        <div className="flex-1">
                                            <p className="text-slate-600">Initial state. You can add punches, shifts, and exceptions. No analysis has been run yet.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Badge className="bg-green-100 text-green-700 mt-1">Analyzed</Badge>
                                        <div className="flex-1">
                                            <p className="text-slate-600">Analysis has been completed. Reports are available. Data can still be modified and re-analyzed.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Badge className="bg-slate-100 text-slate-700 mt-1">Locked</Badge>
                                        <div className="flex-1">
                                            <p className="text-slate-600">Project is locked for editing. No changes to punches, shifts, or exceptions allowed. Can be unlocked by admin.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Badge className="bg-slate-100 text-slate-700 mt-1">Closed</Badge>
                                        <div className="flex-1">
                                            <p className="text-slate-600">Final state. Project is permanently closed. Only the last saved report is visible. Cannot be reopened.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg mb-2">Creating a Project</h3>
                                <ol className="list-decimal list-inside space-y-2 text-slate-600">
                                    <li>Go to <strong>Projects</strong> page</li>
                                    <li>Click <strong>+ Create Project</strong></li>
                                    <li>Fill in project details:
                                        <ul className="list-disc list-inside ml-6 mt-1">
                                            <li>Project Name (e.g., "November 2024 Attendance")</li>
                                            <li>Company</li>
                                            <li>Date Range (From - To)</li>
                                            <li>Optional: Filter by department or select specific employees</li>
                                        </ul>
                                    </li>
                                    <li>Configure shift blocks (1-5 blocks supported)</li>
                                    <li>Click <strong>Create Project</strong></li>
                                </ol>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg mb-2">Shift Blocks</h3>
                                <p className="text-slate-600 mb-2">
                                    Projects support multiple shift blocks to handle employees with changing shift timings during the project period. For example, Block 1 might cover November 1-15 with one shift, and Block 2 covers November 16-30 with a different shift.
                                </p>
                                <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                                    <p className="text-sm text-blue-800">
                                        <strong>Tip:</strong> Most projects only need 1 shift block. Use multiple blocks only when shift timings change during the project period.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Workflow Tab */}
                <TabsContent value="workflow" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Complete Workflow Guide</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h3 className="font-semibold text-lg mb-3">Step-by-Step Process</h3>
                                
                                <div className="space-y-4">
                                    <div className="border-l-4 border-indigo-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-indigo-600 text-white text-sm font-bold px-2 py-0.5 rounded">1</span>
                                            <h4 className="font-semibold">Create or Import Employees</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            Go to <strong>Employees</strong> page and add employees manually or import via Excel. Ensure each employee has a unique HRMS ID and Attendance ID.
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-indigo-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-indigo-600 text-white text-sm font-bold px-2 py-0.5 rounded">2</span>
                                            <h4 className="font-semibold">Create a Project</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            Navigate to <strong>Projects</strong> and create a new project with company, date range, and employee selection.
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-indigo-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-indigo-600 text-white text-sm font-bold px-2 py-0.5 rounded">3</span>
                                            <h4 className="font-semibold">Upload Punch Data</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            In the project detail page, go to <strong>Punches</strong> tab and upload CSV/Excel file with punch timestamps.
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-indigo-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-indigo-600 text-white text-sm font-bold px-2 py-0.5 rounded">4</span>
                                            <h4 className="font-semibold">Configure Shift Timings</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            Go to <strong>Shifts</strong> tab and upload or manually add shift timings for employees. Specify AM/PM shifts or single shift patterns.
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-indigo-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-indigo-600 text-white text-sm font-bold px-2 py-0.5 rounded">5</span>
                                            <h4 className="font-semibold">Add Exceptions</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            In <strong>Exceptions</strong> tab, add leaves, holidays, sick leaves, or other special cases. You can add manually or import via Excel.
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-green-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-green-600 text-white text-sm font-bold px-2 py-0.5 rounded">6</span>
                                            <h4 className="font-semibold">Run Analysis</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            Go to <strong>Analysis</strong> tab, give your report a name, optionally adjust date range, and click <strong>Run Analysis</strong>. The system will process all data and generate attendance reports.
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-green-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-green-600 text-white text-sm font-bold px-2 py-0.5 rounded">7</span>
                                            <h4 className="font-semibold">Review Report</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            View the generated report in <strong>Reports</strong> tab. Review daily breakdowns, make adjustments if needed, and mark employees as verified.
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-purple-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-purple-600 text-white text-sm font-bold px-2 py-0.5 rounded">8</span>
                                            <h4 className="font-semibold">Save & Finalize</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            Once satisfied with the report, click <strong>Save Report</strong>. This saves all modifications and can be used to close the project later.
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-slate-500 pl-4 py-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-slate-600 text-white text-sm font-bold px-2 py-0.5 rounded">9</span>
                                            <h4 className="font-semibold">Close Project (Optional)</h4>
                                        </div>
                                        <p className="text-slate-600 text-sm">
                                            When completely done, admin can close the project in <strong>Overview</strong> tab. This finalizes everything and prevents further changes.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Features Tab */}
                <TabsContent value="features" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Feature Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h3 className="font-semibold text-lg mb-2">Exception Types</h3>
                                <div className="space-y-2">
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Off / Leave:</strong> <span className="text-slate-600">Employee is on leave (annual, casual, etc.)</span>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Public Holiday:</strong> <span className="text-slate-600">Company-wide holiday (applies to ALL employees)</span>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Sick Leave:</strong> <span className="text-slate-600">Medical leave with certificate</span>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Manual Present:</strong> <span className="text-slate-600">Mark employee as present even if no punch data</span>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Manual Absent:</strong> <span className="text-slate-600">Mark employee as absent</span>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Manual Half Day:</strong> <span className="text-slate-600">Mark as half day attendance</span>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Shift Override:</strong> <span className="text-slate-600">Temporary change to shift timings for specific dates</span>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Early Checkout:</strong> <span className="text-slate-600">Add extra early checkout minutes (e.g., left 30 mins early with permission)</span>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded">
                                        <strong>Allowed Minutes:</strong> <span className="text-slate-600">Excuse late/early minutes due to natural calamity or personal reasons</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg mb-2">Analysis Process</h3>
                                <p className="text-slate-600 mb-3">
                                    The system automatically analyzes attendance by:
                                </p>
                                <ul className="list-disc list-inside space-y-1 text-slate-600">
                                    <li>Matching punch timestamps to employee shift timings</li>
                                    <li>Calculating late arrivals and early checkouts</li>
                                    <li>Detecting missing punches and partial days</li>
                                    <li>Applying exceptions and grace minutes</li>
                                    <li>Computing working days, present days, absences</li>
                                    <li>Identifying abnormal attendance patterns</li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg mb-2">Grace Minutes</h3>
                                <p className="text-slate-600">
                                    Each employee has a default grace period (typically 15 minutes) that is automatically deducted from their total late/early minutes. This can be adjusted per employee in the analysis report.
                                </p>
                            </div>

                            <div>
                                <h3 className="font-semibold text-lg mb-2">Ramadan Schedule Support</h3>
                                <p className="text-slate-600">
                                    The system supports special Ramadan shift schedules with multiple shift rotations (shift 1, shift 2, night shift). Admin can configure Ramadan schedules and apply them when creating projects.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Companies Tab */}
                <TabsContent value="companies" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Building2 className="w-6 h-6" />
                                Company-Specific Configurations
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Al Maraghi Auto Repairs */}
                            <div className="border-l-4 border-indigo-500 pl-4">
                                <h3 className="font-semibold text-xl mb-3 text-indigo-900">Al Maraghi Auto Repairs</h3>
                                
                                <div className="space-y-3">
                                    <div>
                                        <h4 className="font-medium mb-1">Timestamp Format</h4>
                                        <p className="text-slate-600 text-sm">Standard format: <code className="bg-slate-100 px-2 py-0.5 rounded">DD/MM/YYYY HH:mm AM/PM</code></p>
                                        <p className="text-slate-600 text-sm">Example: 15/11/2024 08:30 AM</p>
                                    </div>
                                    
                                    <div>
                                        <h4 className="font-medium mb-1">Standard Shift Pattern</h4>
                                        <div className="text-slate-600 text-sm space-y-1">
                                            <p><strong>AM Shift:</strong> 08:00 AM - 12:00 PM</p>
                                            <p><strong>PM Shift:</strong> 01:00 PM - 05:00 PM</p>
                                            <p><strong>Friday:</strong> 08:00 AM - 12:00 PM (Half day)</p>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Weekly Off</h4>
                                        <p className="text-slate-600 text-sm">Sunday (Default for most employees)</p>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Grace Minutes</h4>
                                        <p className="text-slate-600 text-sm">15 minutes standard grace period</p>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Special Notes</h4>
                                        <ul className="list-disc list-inside text-slate-600 text-sm space-y-1">
                                            <li>Friday is always half day (AM shift only)</li>
                                            <li>Some senior staff may have single shift patterns</li>
                                            <li>Ramadan schedules apply during Ramadan month</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Al Maraghi Automotive */}
                            <div className="border-l-4 border-purple-500 pl-4">
                                <h3 className="font-semibold text-xl mb-3 text-purple-900">Al Maraghi Automotive</h3>
                                
                                <div className="space-y-3">
                                    <div>
                                        <h4 className="font-medium mb-1">Timestamp Format</h4>
                                        <p className="text-slate-600 text-sm">Standard format: <code className="bg-slate-100 px-2 py-0.5 rounded">DD/MM/YYYY HH:mm AM/PM</code></p>
                                    </div>
                                    
                                    <div>
                                        <h4 className="font-medium mb-1">Standard Shift Pattern</h4>
                                        <div className="text-slate-600 text-sm space-y-1">
                                            <p><strong>AM Shift:</strong> 08:00 AM - 12:00 PM</p>
                                            <p><strong>PM Shift:</strong> 01:00 PM - 05:00 PM</p>
                                            <p><strong>Friday:</strong> 08:00 AM - 12:00 PM</p>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Weekly Off</h4>
                                        <p className="text-slate-600 text-sm">Sunday</p>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Special Notes</h4>
                                        <ul className="list-disc list-inside text-slate-600 text-sm space-y-1">
                                            <li>Similar configuration to Al Maraghi Auto Repairs</li>
                                            <li>Standard grace minutes: 15 minutes</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Naser Mohsin Auto Parts */}
                            <div className="border-l-4 border-blue-500 pl-4">
                                <h3 className="font-semibold text-xl mb-3 text-blue-900">Naser Mohsin Auto Parts</h3>
                                
                                <div className="space-y-3">
                                    <div>
                                        <h4 className="font-medium mb-1">Timestamp Format</h4>
                                        <p className="text-slate-600 text-sm">Standard format: <code className="bg-slate-100 px-2 py-0.5 rounded">DD/MM/YYYY HH:mm AM/PM</code></p>
                                    </div>
                                    
                                    <div>
                                        <h4 className="font-medium mb-1">Standard Shift Pattern</h4>
                                        <div className="text-slate-600 text-sm space-y-1">
                                            <p><strong>AM Shift:</strong> 08:00 AM - 12:00 PM</p>
                                            <p><strong>PM Shift:</strong> 01:00 PM - 05:00 PM</p>
                                            <p><strong>Friday:</strong> 08:00 AM - 12:00 PM</p>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Weekly Off</h4>
                                        <p className="text-slate-600 text-sm">Sunday</p>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Special Notes</h4>
                                        <ul className="list-disc list-inside text-slate-600 text-sm space-y-1">
                                            <li>Standard configuration across the board</li>
                                            <li>Grace minutes: 15 minutes</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Astra Auto Parts */}
                            <div className="border-l-4 border-green-500 pl-4">
                                <h3 className="font-semibold text-xl mb-3 text-green-900">Astra Auto Parts</h3>
                                
                                <div className="space-y-3">
                                    <div>
                                        <h4 className="font-medium mb-1">Timestamp Format</h4>
                                        <p className="text-slate-600 text-sm">Astra system format: <code className="bg-slate-100 px-2 py-0.5 rounded">YYYY-MM-DD HH:mm:ss</code></p>
                                        <p className="text-slate-600 text-sm">Example: 2024-11-15 08:30:00</p>
                                    </div>
                                    
                                    <div>
                                        <h4 className="font-medium mb-1">Import Method</h4>
                                        <p className="text-slate-600 text-sm">Uses special <strong>Astra Import</strong> page for attendance data import (Admin only)</p>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Standard Shift Pattern</h4>
                                        <div className="text-slate-600 text-sm space-y-1">
                                            <p><strong>AM Shift:</strong> 08:00 AM - 12:00 PM</p>
                                            <p><strong>PM Shift:</strong> 01:00 PM - 05:00 PM</p>
                                            <p><strong>Friday:</strong> 08:00 AM - 12:00 PM</p>
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Weekly Off</h4>
                                        <p className="text-slate-600 text-sm">Sunday</p>
                                    </div>

                                    <div>
                                        <h4 className="font-medium mb-1">Special Notes</h4>
                                        <ul className="list-disc list-inside text-slate-600 text-sm space-y-1">
                                            <li>Uses Astra attendance system export format</li>
                                            <li>Dedicated import page with automatic processing</li>
                                            <li>Grace minutes: 15 minutes</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                                <h4 className="font-semibold text-blue-900 mb-2">Common Across All Companies</h4>
                                <ul className="list-disc list-inside text-slate-700 text-sm space-y-1">
                                    <li>Default grace period: 15 minutes (can be customized per employee)</li>
                                    <li>Friday is generally half day (AM shift only)</li>
                                    <li>Sunday is the standard weekly off</li>
                                    <li>Ramadan schedules supported for all companies</li>
                                    <li>Exception approval workflow applies to all</li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* FAQ Tab */}
                <TabsContent value="faq" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Frequently Asked Questions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <h4 className="font-semibold mb-1">Q: Can I delete a project after it's been analyzed?</h4>
                                <p className="text-slate-600 text-sm">A: Yes, admins can delete projects at any time. However, this will permanently remove all punches, shifts, exceptions, and reports associated with that project.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: What happens if I upload punches with the wrong attendance ID?</h4>
                                <p className="text-slate-600 text-sm">A: The system will show warnings for unrecognized attendance IDs. You can delete the incorrect punches and re-upload, or add the missing employee to the system.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: Can I edit a report after saving it?</h4>
                                <p className="text-slate-600 text-sm">A: Yes, saved reports can be reopened and modified. You can adjust daily breakdowns, grace minutes, and other parameters, then save again.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: How do I handle employees who changed shifts mid-project?</h4>
                                <p className="text-slate-600 text-sm">A: Use multiple shift blocks when creating the project, or add a "Shift Override" exception for the dates when the shift changed.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: What's the difference between "Locked" and "Closed" status?</h4>
                                <p className="text-slate-600 text-sm">A: "Locked" prevents editing but can be unlocked by admin. "Closed" is permanent and cannot be reopened - it finalizes the project completely.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: Can users create exceptions?</h4>
                                <p className="text-slate-600 text-sm">A: Yes, regular users can create exception requests, but they are marked as "Pending" and require approval from Admin or Supervisor before being used in analysis.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: How are grace minutes applied?</h4>
                                <p className="text-slate-600 text-sm">A: Grace minutes are automatically deducted from the total late/early minutes. If an employee is 20 minutes late and has 15 grace minutes, only 5 minutes are counted as late.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: What file formats are supported for import?</h4>
                                <p className="text-slate-600 text-sm">A: CSV, Excel (.xlsx, .xls) files are supported for employees, punches, shifts, and exceptions. Download the template files for the correct format.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: Can supervisors close projects?</h4>
                                <p className="text-slate-600 text-sm">A: No, only admins can close projects. Supervisors can view, edit, and manage projects but cannot perform final closure.</p>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-1">Q: What happens if an employee has no shift timing defined?</h4>
                                <p className="text-slate-600 text-sm">A: The analysis will flag this as an issue. You must define shift timings for all employees before running analysis, or the system cannot calculate late/early minutes.</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}