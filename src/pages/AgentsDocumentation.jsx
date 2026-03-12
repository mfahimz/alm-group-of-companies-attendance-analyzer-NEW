import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Zap, Shield, TrendingUp, CheckCircle, Clock, FileText, BarChart } from 'lucide-react';

export default function AgentsDocumentation() {
    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">AI Agents Documentation</h1>
                <p className="text-slate-600">Intelligent automation and decision support systems</p>
            </div>

            {/* CRITICAL: Development Guidelines */}
            <Card className="border-2 border-red-500 bg-red-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-900">
                        <Shield className="w-5 h-5" />
                        ⚠️ CRITICAL: Development Guidelines - READ FIRST
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-white rounded-lg p-4 space-y-3">
                        <div>
                            <p className="font-bold text-red-900 mb-2">Before Making ANY Code Changes:</p>
                            <ol className="list-decimal list-inside space-y-1 text-sm text-slate-800">
                                <li>Read <code className="bg-slate-100 px-1 rounded">AI_RULES.md</code></li>
                                <li>Read all files in <code className="bg-slate-100 px-1 rounded">.cursor/</code> directory</li>
                                <li>Read <code className="bg-slate-100 px-1 rounded">ARCHITECTURE.md</code></li>
                                <li>Read <code className="bg-slate-100 px-1 rounded">CODEBASE_REVIEW.md</code></li>
                                <li>Read <code className="bg-slate-100 px-1 rounded">CODE_SCAN_REPORT.md</code></li>
                                <li>Read <code className="bg-slate-100 px-1 rounded">DEVELOPER_REFERENCE.md</code></li>
                            </ol>
                        </div>

                        <div className="border-t pt-3">
                            <p className="font-bold text-red-900 mb-2">Architectural Safety Rules:</p>
                            <ul className="list-disc list-inside space-y-1 text-sm text-slate-800">
                                <li>Architecture files are <strong>PROTECTED</strong> - do not modify unless explicitly asked</li>
                                <li>Do NOT duplicate architecture patterns, flows, or modules</li>
                                <li>REUSE existing structures and integration patterns</li>
                                <li>If a change conflicts with architecture rules → <strong>STOP and explain before editing</strong></li>
                            </ul>
                        </div>

                        <div className="border-t pt-3">
                            <p className="font-bold text-red-900 mb-2">Base44-Specific Rules:</p>
                            <ul className="list-disc list-inside space-y-1 text-sm text-slate-800">
                                <li>This is a <strong>Base44-backed application</strong></li>
                                <li>Do NOT run or validate backend functions locally unless explicitly requested</li>
                                <li>Treat <code className="bg-slate-100 px-1 rounded">functions/</code> as Base44-managed backend code</li>
                                <li>Frontend/backend integration MUST follow existing <code className="bg-slate-100 px-1 rounded">base44.functions.invoke(...)</code> patterns</li>
                            </ul>
                        </div>

                        <div className="border-t pt-3">
                            <p className="font-bold text-red-900 mb-2">Workflow Rules:</p>
                            <ol className="list-decimal list-inside space-y-1 text-sm text-slate-800">
                                <li><strong>Inspect</strong> existing code first</li>
                                <li><strong>Plan</strong> changes with minimal impact</li>
                                <li><strong>Implement</strong> production-safe code only</li>
                                <li>Prefer reusing existing pages, hooks, components, utilities, and entity flows</li>
                                <li>Before finalizing: summarize changed files and potential architecture impact</li>
                            </ol>
                        </div>

                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mt-3">
                            <p className="text-sm font-semibold text-amber-900">⚡ Golden Rule:</p>
                            <p className="text-sm text-amber-800 mt-1">
                                Keep changes <strong>minimal</strong> and <strong>production-safe</strong>. 
                                When in doubt, ask before modifying core architecture.
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Overview */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-indigo-600" />
                        Agent Architecture Overview
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-slate-700">
                        The attendance management system leverages multiple AI agents for automated data processing, 
                        anomaly detection, and intelligent decision support. Each agent operates independently but 
                        coordinates through shared data entities.
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-blue-900">Base44 Integration Pattern:</p>
                        <p className="text-blue-800 mt-1">
                            All agents are implemented as Base44 backend functions in <code>functions/</code> directory.
                            Frontend communicates via <code>base44.functions.invoke(functionName, payload)</code>.
                            Never attempt to execute backend logic in the frontend.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Agent 1: Attendance Analysis */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        1. Attendance Analysis Agent
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Badge className="mb-3">Core Engine</Badge>
                        <p className="text-slate-700 mb-3">
                            Automated attendance record analysis with pattern recognition and validation.
                        </p>
                    </div>
                    
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-slate-900">Capabilities:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                            <li>Pattern recognition in punch data</li>
                            <li>Shift timing validation</li>
                            <li>Exception rule application</li>
                            <li>Grace minute calculations</li>
                            <li>Ramadan schedule processing</li>
                        </ul>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-4">
                        <p className="font-semibold text-blue-900 mb-2">Integration Points:</p>
                        <code className="text-xs text-blue-800 block">functions/runAnalysis</code>
                        <code className="text-xs text-blue-800 block">functions/runAnalysisChunked</code>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-amber-900">Performance Optimization:</p>
                        <p className="text-amber-800 mt-1">
                            Processes employees in 50-record chunks to avoid timeout on large datasets (200+ employees).
                            Real-time progress tracking with user-friendly status updates.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Agent 2: Payroll Insights */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-600" />
                        2. Payroll Insights Agent
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Badge className="mb-3 bg-purple-100 text-purple-800">AI-Powered Analytics</Badge>
                        <p className="text-slate-700 mb-3">
                            Advanced salary analysis with anomaly detection and optimization recommendations.
                        </p>
                    </div>
                    
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-slate-900">Features:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                            <li>Salary trend analysis</li>
                            <li>Deduction anomaly detection</li>
                            <li>Department comparative analysis</li>
                            <li>Budget forecasting</li>
                            <li>Optimization recommendations</li>
                        </ul>
                    </div>

                    <div className="bg-purple-50 rounded-lg p-4">
                        <p className="font-semibold text-purple-900 mb-2">Access Location:</p>
                        <code className="text-xs text-purple-800 block">pages/AIPayrollInsights</code>
                        <code className="text-xs text-purple-800 block mt-1">functions/analyzePayrollWithAI</code>
                    </div>
                </CardContent>
            </Card>

            {/* Agent 3: Data Quality */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-red-600" />
                        3. Data Quality Agent
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Badge className="mb-3 bg-red-100 text-red-800">Pre-Analysis Validation</Badge>
                        <p className="text-slate-700 mb-3">
                            Comprehensive validation before analysis execution to ensure data integrity.
                        </p>
                    </div>
                    
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-slate-900">Validation Rules:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
                            <li>Punch data completeness</li>
                            <li>Shift timing configuration</li>
                            <li>Exception validity</li>
                            <li>Date range consistency</li>
                            <li>Employee mapping integrity</li>
                        </ul>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                            <p className="font-semibold text-red-900">ERROR</p>
                            <p className="text-red-700">Blocks analysis</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded p-2">
                            <p className="font-semibold text-amber-900">WARNING</p>
                            <p className="text-amber-700">Requires confirm</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded p-2">
                            <p className="font-semibold text-blue-900">INFO</p>
                            <p className="text-blue-700">Informational</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Agent 4: Ramadan Intelligence */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-teal-600" />
                        4. Ramadan Schedule Intelligence Agent
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Badge className="mb-3 bg-teal-100 text-teal-800">Automated Rotation</Badge>
                        <p className="text-slate-700 mb-3">
                            Intelligent management of two-week Ramadan shift rotations with company-specific rules.
                        </p>
                    </div>
                    
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-slate-900">Functions:</p>
                        <code className="text-xs text-slate-700 block">applyRamadanShifts - Bulk shift generation</code>
                        <code className="text-xs text-slate-700 block">swapRamadanWeeks - Week rotation swap</code>
                        <code className="text-xs text-slate-700 block">undoRamadanShifts - Cleanup rollback</code>
                    </div>

                    <div className="bg-teal-50 rounded-lg p-4 text-sm">
                        <p className="font-semibold text-teal-900 mb-2">Business Logic:</p>
                        <p className="text-teal-800">
                            Supports two-week rotation patterns, Friday-specific overrides, and date overlap detection.
                            Special handling for Al Maraghi Automotive company rules.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Agent 5: Integrity Validation */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-600" />
                        5. Integrity Validation Agent
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Badge className="mb-3 bg-indigo-100 text-indigo-800">Post-Finalization</Badge>
                        <p className="text-slate-700 mb-3">
                            Automated consistency verification and repair across all data entities.
                        </p>
                    </div>
                    
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                        <p className="font-semibold text-slate-900">Validation Checkpoints:</p>
                        <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700">
                            <li>AnalysisResult count = Expected employee count</li>
                            <li>SalarySnapshot count = AnalysisResult count</li>
                            <li>Deductible minutes consistency</li>
                            <li>Grace minute carryover accuracy</li>
                        </ol>
                    </div>

                    <div className="bg-indigo-50 rounded-lg p-4">
                        <p className="font-semibold text-indigo-900 mb-2">Key Functions:</p>
                        <code className="text-xs text-indigo-800 block">auditReportRunIntegrity</code>
                        <code className="text-xs text-indigo-800 block">repairSalaryReportFromSnapshots</code>
                        <code className="text-xs text-indigo-800 block">backfillReportMissingEmployees</code>
                    </div>
                </CardContent>
            </Card>

            {/* Agent 6: Grace Minute Management */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BarChart className="w-5 h-5 text-green-600" />
                        6. Grace Minute Management Agent
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Badge className="mb-3 bg-green-100 text-green-800">Intelligent Tracking</Badge>
                        <p className="text-slate-700 mb-3">
                            Automated grace minute tracking with carryover calculations and approval workflows.
                        </p>
                    </div>
                    
                    <div className="bg-green-50 rounded-lg p-4 space-y-2 text-sm">
                        <p className="font-semibold text-green-900">Business Rules:</p>
                        <ul className="list-disc list-inside space-y-1 text-green-800">
                            <li>Default: 15 minutes grace per day</li>
                            <li>Unused grace carries forward to next project</li>
                            <li>Half-yearly allowance: 120 minutes per employee</li>
                            <li>Department head approval workflow</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Security & Permissions */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-red-600" />
                        Agent Security & Permissions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="font-semibold text-slate-900 mb-2">Admin</p>
                            <p className="text-sm text-slate-700">Full agent access + override capabilities</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="font-semibold text-slate-900 mb-2">Supervisor / HR Manager</p>
                            <p className="text-sm text-slate-700">Analysis and reporting agents</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="font-semibold text-slate-900 mb-2">Department Head</p>
                            <p className="text-sm text-slate-700">Team-scoped analysis only</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4">
                            <p className="font-semibold text-slate-900 mb-2">CEO</p>
                            <p className="text-sm text-slate-700">Full read access, no delete</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Future Enhancements */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-600" />
                        Future Agent Enhancements
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2"></div>
                            <div>
                                <p className="font-semibold text-slate-900">Predictive Absence Agent</p>
                                <p className="text-sm text-slate-600">ML-based absence forecasting</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2"></div>
                            <div>
                                <p className="font-semibold text-slate-900">Smart Shift Optimizer</p>
                                <p className="text-sm text-slate-600">AI-recommended shift assignments</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2"></div>
                            <div>
                                <p className="font-semibold text-slate-900">Compliance Audit Agent</p>
                                <p className="text-sm text-slate-600">Automated labor law compliance checks</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2"></div>
                            <div>
                                <p className="font-semibold text-slate-900">Natural Language Query Agent</p>
                                <p className="text-sm text-slate-600">Chat interface for report generation</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Base44 Backend Architecture */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-600" />
                        Base44 Backend Architecture
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-slate-50 rounded-lg p-4">
                        <p className="font-semibold text-slate-900 mb-2">Function Invocation Pattern:</p>
                        <pre className="bg-slate-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
{`// Frontend agent call
import { base44 } from '@/api/base44Client';

const result = await base44.functions.invoke('runAnalysis', {
    project_id: projectId,
    date_from: '2026-01-01',
    date_to: '2026-01-31'
});`}
                        </pre>
                    </div>

                    <div className="bg-slate-50 rounded-lg p-4">
                        <p className="font-semibold text-slate-900 mb-2">Backend Function Structure:</p>
                        <pre className="bg-slate-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
{`// functions/agentName.js
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // User-scoped operations
    const data = await base44.entities.Employee.list();
    
    // Admin-scoped operations
    const adminData = await base44.asServiceRole.entities.Project.update(id, data);
    
    return Response.json({ success: true, data });
});`}
                        </pre>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-amber-900">⚠️ Important:</p>
                        <ul className="list-disc list-inside text-amber-800 mt-1 space-y-1">
                            <li>Backend functions run on Deno Deploy (serverless)</li>
                            <li>Do NOT attempt to run backend functions locally</li>
                            <li>All npm imports must use <code>npm:package@version</code> prefix</li>
                            <li>Maximum execution time: ~10 seconds (use chunking for longer operations)</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Development Workflow */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-purple-600" />
                        Agent Development Workflow
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-3">
                        <div className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
                            <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
                            <div>
                                <p className="font-semibold text-slate-900">Inspect Existing Code</p>
                                <p className="text-sm text-slate-700">Review existing agents in <code>functions/</code> for patterns</p>
                            </div>
                        </div>
                        
                        <div className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
                            <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
                            <div>
                                <p className="font-semibold text-slate-900">Plan Minimal Changes</p>
                                <p className="text-sm text-slate-700">Identify reusable components, hooks, and utilities</p>
                            </div>
                        </div>
                        
                        <div className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
                            <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
                            <div>
                                <p className="font-semibold text-slate-900">Implement Production-Safe</p>
                                <p className="text-sm text-slate-700">Follow Base44 patterns, add error handling, validate inputs</p>
                            </div>
                        </div>
                        
                        <div className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
                            <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 text-sm font-bold">4</div>
                            <div>
                                <p className="font-semibold text-slate-900">Document & Summarize</p>
                                <p className="text-sm text-slate-700">List changed files and architecture impact</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-green-900">✅ Best Practices:</p>
                        <ul className="list-disc list-inside text-green-800 mt-1 space-y-1">
                            <li>Reuse existing entity flows (Employee, Project, AnalysisResult)</li>
                            <li>Follow existing permission patterns (admin, supervisor, department_head)</li>
                            <li>Use React Query for all data fetching with proper cache keys</li>
                            <li>Implement progress indicators for long-running operations</li>
                            <li>Add audit logging for all state-changing operations</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Testing & Validation */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        Agent Testing & Validation
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-slate-50 rounded-lg p-4">
                        <p className="font-semibold text-slate-900 mb-2">Testing Checklist:</p>
                        <ul className="space-y-2 text-sm text-slate-700">
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                <span>Empty/null input handling</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                <span>Edge cases (first/last records, date boundaries)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                <span>Permission validation for all roles</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                <span>Timeout handling (chunk large operations)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                <span>Database constraint violations</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-600">✓</span>
                                <span>Network failure retry logic</span>
                            </li>
                        </ul>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-blue-900">Testing in Base44:</p>
                        <p className="text-blue-800 mt-1">
                            Use the Base44 dashboard function testing tool to validate backend functions before deploying to production.
                            Test with real data from staging environment when possible.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Contact */}
            <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
                <CardContent className="pt-6">
                    <p className="text-sm text-slate-700">
                        <strong>System Owner:</strong> Al Maraghi Auto Repairs - HR Department<br />
                        <strong>Location:</strong> Abu Dhabi, UAE<br />
                        <strong>Timezone:</strong> Asia/Dubai (UTC+4)<br />
                        <strong>Platform:</strong> Base44 (base44.app)
                    </p>
                    <div className="mt-4 pt-4 border-t border-indigo-200">
                        <p className="text-xs text-slate-600">
                            For architecture questions or guidance, consult the primary documentation files listed at the top of this page.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}