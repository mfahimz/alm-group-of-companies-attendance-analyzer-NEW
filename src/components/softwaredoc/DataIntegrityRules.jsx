import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, UserCheck, ShieldCheck, AlertCircle } from 'lucide-react';

/**
 * DataIntegrityRules - Documentation for ID uniqueness and other data constraints.
 */
export default function DataIntegrityRules() {
    return (
        <div className="space-y-8">
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                        <Database className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">ID Uniqueness Validation</h2>
                </div>
                
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mb-8">
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Core Requirement</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                        To maintain data integrity across multi-company operations, <strong>Attendance ID</strong> and 
                        <strong> HRMS ID</strong> must be unique within a single company. Global uniqueness is not enforced, 
                        meaning IDs can be reused across different companies, but <strong>never</strong> within the same one.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="border-l-4 border-l-indigo-600 shadow-sm transition-hover hover:shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-md flex items-center gap-2">
                                <UserCheck className="w-4 h-4 text-indigo-600" />
                                Interactive Validation (UI)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                Implemented in <code>EmployeeDialog.jsx</code>. The system performs a Real-Time scan before 
                                saving any employee (Create or Update).
                            </p>
                            <ul className="space-y-2">
                                <li className="flex items-start gap-2 text-xs text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                                    <span>Blocks save if <code>attendance_id</code> exists in same company.</span>
                                </li>
                                <li className="flex items-start gap-2 text-xs text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                                    <span>Blocks save if <code>hrms_id</code> exists in same company.</span>
                                </li>
                                <li className="flex items-start gap-2 text-xs text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                                    <span>Generates distinct warnings for each ID type.</span>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500 shadow-sm transition-hover hover:shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-md flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-amber-500" />
                                Audit Proxy (Backend)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                The <code>auditReportRunIntegrity.ts</code> function includes a "Double-Check" scan during 
                                the Analysis phase to flag historical duplicates.
                            </p>
                            <ul className="space-y-2">
                                <li className="flex items-start gap-2 text-xs text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                                    <span>Scans entire Company employee list.</span>
                                </li>
                                <li className="flex items-start gap-2 text-xs text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                                    <span>Flags <code>DUPLICATE_COMPANY_HRMS_IDS</code> as Critical errors.</span>
                                </li>
                                <li className="flex items-start gap-2 text-xs text-slate-600">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                                    <span>Flags <code>DUPLICATE_COMPANY_ATTENDANCE_IDS</code> as Critical errors.</span>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section className="bg-red-50 border border-red-100 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <h3 className="text-lg font-bold text-red-900">Failure Modes</h3>
                </div>
                <div className="space-y-3">
                    <p className="text-sm text-red-800 leading-relaxed">
                        If duplicate <code>attendance_id</code>s exist within a company, the Attendance Engine may 
                        erroneously group punches or produce multiple AnalysisResult rows for what should be a 
                        single individual.
                    </p>
                    <p className="text-sm text-red-800 leading-relaxed">
                        If <code>hrms_id</code> duplicates exist, payroll generation (SalarySnapshots) will fail to 
                        accurately map attendance data to compensation packages.
                    </p>
                </div>
            </section>
        </div>
    );
}
