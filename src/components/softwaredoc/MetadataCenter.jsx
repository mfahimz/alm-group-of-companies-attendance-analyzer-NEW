import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Target, AlertTriangle, Github, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * MetadataCenter - Technical status, Changelog, and Roadmap.
 * Reflects live data and identified code issues.
 */
export default function MetadataCenter() {
    const commits = [
        { hash: '5ebc337', msg: 'latest feature for resume scanner', time: '1 hour ago' },
        { hash: '5b4ea18', msg: 'filter fixed', time: '5 hours ago' },
        { hash: 'fc46121', msg: 'resume scanner changes', time: '6 hours ago' },
        { hash: '7f00838', msg: 'checklist update', time: '8 hours ago' },
        { hash: '4eaaeb3', msg: 'late minutes new fix for all companies', time: '10 hours ago' }
    ];

    const roadmap = [
        { title: 'Talent Pool Integration', status: 'Planned', priority: 'High' },
        { title: 'Advanced ATS Rules Extension', status: 'In Progress', priority: 'Medium' },
        { title: 'Mobile Attendance Geofencing', status: 'New', priority: 'Low' }
    ];

    return (
        <div className="space-y-8">
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-slate-100 rounded-lg">
                        <History className="w-5 h-5 text-slate-700" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Change Log</h2>
                </div>
                <div className="space-y-3">
                    {commits.map((commit, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3">
                                <code className="text-xs font-mono px-2 py-1 bg-slate-100 text-slate-600 rounded">
                                    {commit.hash}
                                </code>
                                <span className="text-sm text-slate-700">{commit.msg}</span>
                            </div>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {commit.time}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                        <Target className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Feature Roadmap</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {roadmap.map((item, i) => (
                        <Card key={i} className="border-slate-200">
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tight">
                                        {item.status}
                                    </Badge>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                        item.priority === 'High' ? 'bg-red-50 text-red-600' : 
                                        item.priority === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                                    }`}>
                                        {item.priority}
                                    </span>
                                </div>
                                <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </section>

            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-100 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Technical Debt & TODOs</h2>
                </div>
                <Card className="border-red-100 bg-red-50/30">
                    <CardContent className="p-6">
                        <ul className="space-y-4">
                            <li className="flex gap-3">
                                <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-900">Analysis Complexity in <code>runAnalysis.ts</code></p>
                                    <p className="text-xs text-slate-600">
                                        The shift point matching logic exceeds 400 lines and requires refactoring into 
                                        smaller, testable pure functions to improve maintainability.
                                    </p>
                                </div>
                            </li>
                            <li className="flex gap-3">
                                <div className="mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-500" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-900">TODO: Talent Pool Rules Logic</p>
                                    <p className="text-xs text-slate-600">
                                        Missing implementation for automated talent pool categorization based on 
                                        scanned resume performance. Placeholder found in <code>scanResume.ts</code>.
                                    </p>
                                </div>
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
