import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Layers, Cpu, Database, Server } from 'lucide-react';

/**
 * SystemStatus - Displays high-level architecture and technology stack.
 * Bridges data from ARCHITECTURE.md.
 */
export default function SystemStatus() {
    return (
        <div className="space-y-8">
            <section>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Layers className="w-6 h-6 text-indigo-600" />
                    Architecture Overview
                </h2>
                <p className="text-slate-600 leading-relaxed mb-6">
                    The Attendance Analyzer is a Base44-backed, React single-page application designed for 
                    multi-company attendance and payroll operations. It utilizes a serverless backend 
                    logic layer powered by Deno.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-slate-50 border-none shadow-none">
                        <CardHeader className="pb-2">
                            <Cpu className="w-5 h-5 text-indigo-500 mb-2" />
                            <CardTitle className="text-sm font-semibold">Frontend</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="text-xs space-y-2 text-slate-600">
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> React 18 + Vite</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> TanStack Query</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Tailwind CSS</li>
                            </ul>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-50 border-none shadow-none">
                        <CardHeader className="pb-2">
                            <Server className="w-5 h-5 text-indigo-500 mb-2" />
                            <CardTitle className="text-sm font-semibold">Backend</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="text-xs space-y-2 text-slate-600">
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Deno Edge Functions</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Base44 SDK v0.8.6</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Service Role Access</li>
                            </ul>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-50 border-none shadow-none">
                        <CardHeader className="pb-2">
                            <Database className="w-5 h-5 text-indigo-500 mb-2" />
                            <CardTitle className="text-sm font-semibold">Data Layer</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="text-xs space-y-2 text-slate-600">
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Base44 Entities</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Analysis Results</li>
                                <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Salary Snapshots</li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                <h3 className="text-lg font-bold text-indigo-900 mb-2">Integration Strategy</h3>
                <p className="text-sm text-indigo-800 leading-relaxed">
                    The system implements a layered access control model where page discoverability is 
                    managed by <code>PagePermission</code> entities, and data security is enforced at 
                    the function level via <code>validateSecureAccess.ts</code>.
                </p>
            </section>
        </div>
    );
}
