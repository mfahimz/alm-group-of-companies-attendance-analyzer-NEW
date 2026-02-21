import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, Calendar, CheckCircle, AlertTriangle, Workflow } from 'lucide-react';
import Breadcrumb from '../components/ui/Breadcrumb';

export default function QuarterlyMinutesDocumentation() {
    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <Breadcrumb items={[
                { label: 'Documentation', href: 'Documentation' },
                { label: 'Quarterly Minutes System' }
            ]} />

            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-2xl mb-4">
                    <Clock className="w-8 h-8 text-indigo-600" />
                </div>
                <h1 className="text-4xl font-bold text-slate-900">Quarterly Minutes System</h1>
                <p className="text-lg text-slate-600 mt-3">Calendar-based pre-approval allowances explained</p>
            </div>

            {/* Overview */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-indigo-600" />
                        What Are Quarterly Minutes?
                    </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-slate max-w-none">
                    <p>
                        Quarterly Minutes is a pre-approval allowance system that allows department heads to approve 
                        late arrivals or early checkouts for legitimate reasons (hospital visits, emergencies, etc.) 
                        without deducting from employee salary.
                    </p>
                    <p className="font-semibold mt-4">How It Works:</p>
                    <ul>
                        <li>Each employee gets <strong>120 minutes per calendar quarter</strong></li>
                        <li>Department heads can approve these minutes for valid reasons</li>
                        <li>Approved minutes are <strong>deducted from calculated late/early minutes</strong></li>
                        <li>Once exhausted, no more approvals until next quarter</li>
                        <li>Unused minutes do NOT carry forward to next quarter</li>
                    </ul>
                </CardContent>
            </Card>

            {/* Calendar-Based System */}
            <Card className="border-0 shadow-lg bg-blue-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-900">
                        <Calendar className="w-6 h-6 text-blue-600" />
                        Pure Calendar-Based System
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="bg-white border border-blue-200 rounded-lg p-4">
                            <h3 className="font-semibold text-blue-900 mb-3">Quarters Are Fixed Calendar Periods</h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                                    <p className="font-bold text-blue-900">Q1 (January - March)</p>
                                    <p className="text-blue-700">Jan 1 - Mar 31</p>
                                </div>
                                <div className="bg-green-50 border border-green-200 rounded p-3">
                                    <p className="font-bold text-green-900">Q2 (April - June)</p>
                                    <p className="text-green-700">Apr 1 - Jun 30</p>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                                    <p className="font-bold text-amber-900">Q3 (July - September)</p>
                                    <p className="text-amber-700">Jul 1 - Sep 30</p>
                                </div>
                                <div className="bg-purple-50 border border-purple-200 rounded p-3">
                                    <p className="font-bold text-purple-900">Q4 (October - December)</p>
                                    <p className="text-purple-700">Oct 1 - Dec 31</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-blue-200 rounded-lg p-4">
                            <h3 className="font-semibold text-blue-900 mb-2">Independent of Projects</h3>
                            <p className="text-sm text-blue-800">
                                Quarterly minutes are <strong>NOT tied to projects</strong>. They are purely calendar-based. 
                                This means:
                            </p>
                            <ul className="text-sm text-blue-700 mt-2 space-y-1">
                                <li>✓ One record per employee per quarter (e.g., "Ali - Q1 2026")</li>
                                <li>✓ The 120 minutes are shared across ALL projects in that quarter</li>
                                <li>✓ Approving 40 minutes on Jan 15 leaves 80 for the rest of Q1</li>
                                <li>✓ Works regardless of how many projects run in the quarter</li>
                                <li>✓ Re-running old projects uses the same quarter record</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Workflow Example */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Workflow className="w-6 h-6 text-green-600" />
                        Example Workflow
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <h4 className="font-semibold text-slate-900 mb-3">Scenario: Employee "Ahmad" in Q1 2026</h4>
                            <div className="space-y-3 text-sm">
                                <div className="flex items-start gap-3">
                                    <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 font-bold">1</div>
                                    <div>
                                        <p className="font-medium">January 1, 2026 - Quarter Starts</p>
                                        <p className="text-slate-600">Ahmad gets 120 minutes for Q1 2026 (Jan-Mar)</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 font-bold">2</div>
                                    <div>
                                        <p className="font-medium">January 15 - Hospital Visit</p>
                                        <p className="text-slate-600">Ahmad arrives 60 minutes late. Department head approves 60 minutes.</p>
                                        <p className="text-green-600 font-medium mt-1">✓ Q1 balance: 120 - 60 = 60 minutes remaining</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 font-bold">3</div>
                                    <div>
                                        <p className="font-medium">February 10 - Personal Emergency</p>
                                        <p className="text-slate-600">Ahmad arrives 45 minutes late. Department head approves 45 minutes.</p>
                                        <p className="text-green-600 font-medium mt-1">✓ Q1 balance: 60 - 45 = 15 minutes remaining</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 font-bold">4</div>
                                    <div>
                                        <p className="font-medium">March 5 - Another Late Arrival</p>
                                        <p className="text-slate-600">Ahmad arrives 30 minutes late. Only 15 minutes remain.</p>
                                        <p className="text-red-600 font-medium mt-1">✗ Cannot approve 30 minutes - insufficient balance</p>
                                        <p className="text-amber-600 text-xs mt-1">Department head can only approve 15 minutes max</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 font-bold">5</div>
                                    <div>
                                        <p className="font-medium">April 1, 2026 - New Quarter Starts</p>
                                        <p className="text-slate-600">Q2 begins. Ahmad gets fresh 120 minutes for Apr-Jun.</p>
                                        <p className="text-blue-600 font-medium mt-1">✓ Q2 balance: 120 minutes (Q1 unused minutes don't carry over)</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* How It Works With Projects */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle>How It Works With Monthly Projects</CardTitle>
                </CardHeader>
                <CardContent className="prose prose-slate max-w-none">
                    <p className="font-semibold">Projects Are Monthly, Quarters Are 3-Month Periods:</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 not-prose my-4">
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="font-semibold text-slate-900">January 2026 Project</p>
                                <p className="text-slate-600">→ Uses Q1 2026 quarterly minutes (shared across Jan, Feb, Mar)</p>
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">February 2026 Project</p>
                                <p className="text-slate-600">→ Uses same Q1 2026 record (balance already reduced by Jan approvals)</p>
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">March 2026 Project</p>
                                <p className="text-slate-600">→ Uses same Q1 2026 record (balance reflects Jan + Feb approvals)</p>
                            </div>
                            <div>
                                <p className="font-semibold text-slate-900">April 2026 Project</p>
                                <p className="text-slate-600">→ Uses NEW Q2 2026 record (fresh 120 minutes)</p>
                            </div>
                        </div>
                    </div>

                    <p className="font-semibold mt-6">Key Points:</p>
                    <ul>
                        <li>Projects don't "own" quarterly minutes</li>
                        <li>Quarters are independent of project schedules</li>
                        <li>Multiple projects in same quarter share the same allowance</li>
                        <li>System auto-determines quarter from approval date</li>
                    </ul>
                </CardContent>
            </Card>

            {/* Technical Implementation */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        Technical Implementation
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <h4 className="font-semibold text-slate-900 mb-2">Database Structure</h4>
                            <p className="text-sm text-slate-700 mb-2">Entity: <code className="bg-slate-200 px-1 rounded">EmployeeQuarterlyMinutes</code></p>
                            <p className="text-sm text-slate-700 mb-2">Unique Key: (employee_id, company, year, quarter)</p>
                            <div className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded mt-2">
{`{
  employee_id: "12345",
  company: "Al Maraghi Auto Repairs",
  year: 2026,
  quarter: 1,
  total_minutes: 120,
  used_minutes: 40,
  remaining_minutes: 80
}`}
                            </div>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h4 className="font-semibold text-green-900 mb-2">When Department Head Approves</h4>
                            <ol className="text-sm text-green-800 space-y-1">
                                <li>1. User selects date (e.g., Feb 15, 2026)</li>
                                <li>2. System calls <code className="bg-green-100 px-1 rounded">getOrCreateQuarterlyMinutes</code> with that date</li>
                                <li>3. Function determines quarter from date: Feb = Q1</li>
                                <li>4. Fetches or creates record for (employee, company, 2026, Q1)</li>
                                <li>5. Validates sufficient remaining_minutes</li>
                                <li>6. Calls <code className="bg-green-100 px-1 rounded">updateQuarterlyMinutes</code> to deduct</li>
                                <li>7. Creates ALLOWED_MINUTES exception in project</li>
                            </ol>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 mb-2">During Project Analysis</h4>
                            <p className="text-sm text-blue-800 mb-2">
                                When running analysis for any project:
                            </p>
                            <ol className="text-sm text-blue-700 space-y-1">
                                <li>1. Analysis fetches all ALLOWED_MINUTES exceptions for the project</li>
                                <li>2. For each employee day, applies approved minutes</li>
                                <li>3. Deductible minutes = (Late + Early) - Grace - Approved</li>
                                <li>4. Final result saved to AnalysisResult entity</li>
                            </ol>
                            <p className="text-xs text-blue-600 mt-3 bg-blue-100 rounded p-2">
                                <strong>Important:</strong> The quarterly minutes record is NOT checked during analysis. 
                                It's only checked when creating the approval. This prevents race conditions.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Why Calendar-Based */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle>Why Calendar-Based (Not Project-Based)?</CardTitle>
                </CardHeader>
                <CardContent className="prose prose-slate max-w-none">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 not-prose">
                        <h4 className="font-semibold text-amber-900 mb-3">Problems with Project-Based Tracking:</h4>
                        <ul className="text-sm text-amber-800 space-y-2">
                            <li>
                                <strong>Confusion:</strong> If January and February are separate projects, do they share minutes or have separate allowances?
                            </li>
                            <li>
                                <strong>Double Allocation:</strong> Risk of giving 120 minutes per month instead of per quarter
                            </li>
                            <li>
                                <strong>Inconsistency:</strong> What if a project spans 6 weeks? How many minutes does it get?
                            </li>
                            <li>
                                <strong>Re-Analysis Issues:</strong> Re-running an old project might create new quarterly records incorrectly
                            </li>
                        </ul>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 not-prose mt-4">
                        <h4 className="font-semibold text-green-900 mb-3">Benefits of Calendar-Based:</h4>
                        <ul className="text-sm text-green-800 space-y-2">
                            <li>
                                <strong>✓ Crystal Clear:</strong> Everyone knows quarters = 3 calendar months
                            </li>
                            <li>
                                <strong>✓ No Confusion:</strong> 120 minutes per quarter, period
                            </li>
                            <li>
                                <strong>✓ Project Agnostic:</strong> Works with any project schedule
                            </li>
                            <li>
                                <strong>✓ Audit Friendly:</strong> Easy to track and report per quarter
                            </li>
                            <li>
                                <strong>✓ Simple:</strong> Date determines quarter automatically
                            </li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Admin Tasks */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-amber-600" />
                        Admin Maintenance Tasks
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 mb-2">At Start of Each Quarter</h4>
                            <p className="text-sm text-blue-800 mb-2">
                                Run initialization function to create quarterly records for all employees:
                            </p>
                            <div className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded">
{`// From admin dashboard or migration tools
await base44.functions.invoke('initializeQuarterForCompany', {
  company: 'Al Maraghi Auto Repairs',
  year: 2026,
  quarter: 2  // For Q2 (Apr-Jun)
});`}
                            </div>
                            <p className="text-xs text-blue-700 mt-2">
                                This creates records for employees that don't have them yet. Safe to run multiple times.
                            </p>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <h4 className="font-semibold text-amber-900 mb-2">Regular Cleanup</h4>
                            <p className="text-sm text-amber-800 mb-2">
                                Periodically run cleanup to remove:
                            </p>
                            <ul className="text-sm text-amber-700 space-y-1">
                                <li>• Records for non-existent employees</li>
                                <li>• Records with company mismatches</li>
                                <li>• Duplicate records</li>
                            </ul>
                            <div className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded mt-2">
{`await base44.functions.invoke('cleanupQuarterlyMinutes', {});`}
                            </div>
                        </div>

                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h4 className="font-semibold text-green-900 mb-2">View & Edit Allowances</h4>
                            <p className="text-sm text-green-800">
                                Go to <strong>Quarterly Minutes Management</strong> page to:
                            </p>
                            <ul className="text-sm text-green-700 space-y-1 mt-2">
                                <li>• View all quarterly records</li>
                                <li>• Edit total_minutes or used_minutes</li>
                                <li>• Filter by company, department, year, quarter</li>
                                <li>• Monitor usage across employees</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Common Questions */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle>Common Questions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="border-l-4 border-indigo-500 bg-indigo-50 p-4">
                            <p className="font-semibold text-indigo-900">Q: What happens to unused minutes at quarter end?</p>
                            <p className="text-sm text-indigo-800 mt-1">
                                A: They expire. Each quarter starts fresh with 120 minutes. This prevents hoarding.
                            </p>
                        </div>

                        <div className="border-l-4 border-green-500 bg-green-50 p-4">
                            <p className="font-semibold text-green-900">Q: Can we change the 120 minute limit?</p>
                            <p className="text-sm text-green-800 mt-1">
                                A: Yes. Edit the employee's <code className="bg-green-100 px-1 rounded">approved_other_minutes_limit</code> field. 
                                This will be used when creating new quarter records.
                            </p>
                        </div>

                        <div className="border-l-4 border-amber-500 bg-amber-50 p-4">
                            <p className="font-semibold text-amber-900">Q: What if we re-run an old project's analysis?</p>
                            <p className="text-sm text-amber-800 mt-1">
                                A: It will use the ALLOWED_MINUTES exceptions that were created during that period. 
                                The quarterly minutes record is not rechecked. This ensures historical accuracy.
                            </p>
                        </div>

                        <div className="border-l-4 border-purple-500 bg-purple-50 p-4">
                            <p className="font-semibold text-purple-900">Q: Can department heads approve for past quarters?</p>
                            <p className="text-sm text-purple-800 mt-1">
                                A: No. There's a cutoff date (project end date). After that, no new approvals allowed. 
                                This prevents retroactive manipulation.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Footer */}
            <Card className="bg-indigo-50 border-indigo-200">
                <CardContent className="p-6 text-center">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-2">Need Help?</h3>
                    <p className="text-sm text-indigo-800">
                        This system is designed to be simple and transparent. If you have questions, 
                        contact your system administrator.
                    </p>
                    <p className="text-xs text-indigo-600 mt-3">
                        Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </CardContent>
            </Card>

            {/* Migration Notice */}
            {migrationResult && (
                <Card className="border-2 border-green-300 bg-green-50">
                    <CardContent className="p-6">
                        <h3 className="font-semibold text-green-900 mb-2">✓ Migration Complete</h3>
                        <p className="text-sm text-green-800">
                            System has been migrated to calendar-based quarterly minutes. All old project-based 
                            records have been removed and fresh Q1 2026 records created.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}