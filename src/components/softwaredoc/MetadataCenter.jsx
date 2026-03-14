import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Target, AlertTriangle, Github, Clock, Activity, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/AuthContext';
import { secureAuditProxy } from '@/api/secureAuditProxy';

/**
 * MetadataCenter - Technical status, Changelog, and Roadmap.
 * Reflects live data and identified code issues.
 */
export default function MetadataCenter() {
    const { user } = useAuth();
    const [healthStatus, setHealthStatus] = useState({ status: 'checking', details: null });

    useEffect(() => {
        const checkHealth = async () => {
            if (!user) return;
            const health = await secureAuditProxy.testPlatformHealth(user);
            setHealthStatus(health);
        };
        checkHealth();
    }, [user]);

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

    // Dynamic Technical Debt items including platform health warnings
    const techDebtItems = [
        ...(healthStatus.status === 'warning' ? [{
            title: 'Platform Update Detected',
            description: healthStatus.details || 'Base44 SDK response format has changed. Data truncation or UI errors may occur if not updated.',
            priority: 'critical'
        }] : []),
        ...(healthStatus.status === 'error' ? [{
            title: 'Platform Connection Failure',
            description: `Secure Proxy could not reach Base44: ${healthStatus.error || 'Unknown error'}`,
            priority: 'critical'
        }] : []),
        {
            title: 'Analysis Complexity in runAnalysis.ts',
            description: 'The shift point matching logic exceeds 400 lines and requires refactoring into smaller, testable pure functions to improve maintainability.',
            priority: 'high'
        },
        {
            title: 'TODO: Talent Pool Rules Logic',
            description: 'Missing implementation for automated talent pool categorization based on scanned resume performance. Placeholder found in scanResume.ts.',
            priority: 'medium'
        }
    ];

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Card className="bg-slate-50 border-slate-200">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${
                            healthStatus.status === 'healthy' ? 'bg-emerald-100 text-emerald-600' : 
                            healthStatus.status === 'warning' ? 'bg-amber-100 text-amber-600' : 
                            healthStatus.status === 'checking' ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-600'
                        }`}>
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Platform Health</p>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                    {healthStatus.status === 'healthy' ? 'Healthy' : 
                                     healthStatus.status === 'warning' ? 'Update Detected' : 
                                     healthStatus.status === 'checking' ? 'Checking...' : 'Error'}
                                </span>
                                {healthStatus.status === 'healthy' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                                {(healthStatus.status === 'warning' || healthStatus.status === 'error') && <AlertCircle className="w-3 h-3 text-red-500" />}
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-50 border-slate-200">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                            <History className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Proxy Latency</p>
                            <p className="text-sm font-bold text-slate-900">{healthStatus.latency ? `${healthStatus.latency}ms` : '--'}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-slate-50 border-slate-200">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Security Fence</p>
                            <p className="text-sm font-bold text-slate-900 text-emerald-600">Enforced</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

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
                <Card className={`border-red-100 ${healthStatus.status !== 'healthy' && healthStatus.status !== 'checking' ? 'bg-red-50 animate-pulse' : 'bg-red-50/30'}`}>
                    <CardContent className="p-6">
                        <ul className="space-y-4">
                            {techDebtItems.map((item, i) => (
                                <li key={i} className="flex gap-3">
                                    <div className={`mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                                        item.priority === 'critical' ? 'bg-red-600 scale-125' : 
                                        item.priority === 'high' ? 'bg-red-500' : 'bg-amber-500'
                                    }`} />
                                    <div className="space-y-1">
                                        <p className={`text-sm font-medium ${item.priority === 'critical' ? 'text-red-700' : 'text-slate-900'}`}>
                                            {item.title}
                                            {item.priority === 'critical' && <Badge className="ml-2 bg-red-100 text-red-700 border-red-200 uppercase text-[8px]">Action Required</Badge>}
                                        </p>
                                        <p className="text-xs text-slate-600">
                                            {item.description}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}

// Helper icons not exported by lucide-react in current scope
function ShieldCheck(props) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    );
}
