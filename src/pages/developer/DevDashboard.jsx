import React, { useState, useEffect } from 'react';
import { usePermissions } from '@/components/hooks/usePermissions';
import { usePageTitle } from '@/components/ui/PageTitle';
import { cn } from '@/lib/utils';
import { 
    Code, 
    Database, 
    Play, 
    UserSearch, 
    HeartPulse, 
    ScrollText, 
    History, 
    GitCompareArrows, 
    ShieldAlert,
    Terminal,
    FileText,
    GitPullRequest,
    Lightbulb,
    LayoutDashboard,
    ExternalLink,
    BookOpen,
    Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Import Developer components
import EntityExplorer from '@/components/developer/EntityExplorer';
import FunctionRunner from '@/components/developer/FunctionRunner';
import EmployeeInspector from '@/components/developer/EmployeeInspector';
import SystemHealth from '@/components/developer/SystemHealth';
import LiveLogs from '@/components/developer/LiveLogs';
import ChangeHistory from '@/components/developer/ChangeHistory';
import ChangeManagement from '@/components/developer/ChangeManagement';

// We'll import original pages as components where possible, or recreate their simplified logic
import TestDataViewer from '../TestDataViewer';
import DevelopmentLog from '../DevelopmentLog';
import FeatureRequests from '../FeatureRequests';
import AuditLogs from '../AuditLogs';

export default function DevDashboard() {
    usePageTitle('Developer Portal');
    const { userRole, isLoading } = usePermissions();
    const [activeTab, setActiveTab] = useState('overview');

    // Admin-only gate
    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-[#0F1E36] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium">Initializing Developer Portal...</p>
                </div>
            </div>
        );
    }

    if (userRole !== 'admin') {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-2">
                    <ShieldAlert className="w-10 h-10 text-red-500" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800">Developer Access Only</h1>
                <p className="text-slate-600 max-w-md">
                    This portal contains sensitive system tools and production data access restricted to authorized developers and administrators.
                </p>
                <Button onClick={() => window.location.href = '/'} variant="outline" className="mt-2">
                    Return to Dashboard
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 bg-[#0F1E36] rounded-lg">
                            <Terminal className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900">Developer Portal</h1>
                    </div>
                    <p className="text-slate-500 font-medium">System administration, developer tools, and technical documentation</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 py-1 px-3 flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Production Environment
                    </Badge>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm sticky top-[73px] z-20">
                    <TabsList className="bg-transparent border-0 flex flex-wrap h-auto gap-1">
                        <TabsTrigger 
                            value="overview" 
                            className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
                        >
                            <LayoutDashboard className="w-4 h-4 mr-2" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger 
                            value="system" 
                            className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
                        >
                            <Database className="w-4 h-4 mr-2" />
                            System Module
                        </TabsTrigger>
                        <TabsTrigger 
                            value="logs" 
                            className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
                        >
                            <ScrollText className="w-4 h-4 mr-2" />
                            Audit & Live Logs
                        </TabsTrigger>
                        <TabsTrigger 
                            value="development" 
                            className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
                        >
                            <GitPullRequest className="w-4 h-4 mr-2" />
                            Dev Log
                        </TabsTrigger>
                        <TabsTrigger 
                            value="test-data" 
                            className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Test Data
                        </TabsTrigger>
                        <TabsTrigger 
                            value="features" 
                            className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
                        >
                            <Lightbulb className="w-4 h-4 mr-2" />
                            Requests
                        </TabsTrigger>
                        <TabsTrigger 
                            value="docs" 
                            className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
                        >
                            <BookOpen className="w-4 h-4 mr-2" />
                            Documentation
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="col-span-1 border-0 shadow-sm ring-1 ring-slate-950/5 hover:ring-slate-950/10 transition-all cursor-pointer" onClick={() => setActiveTab('system')}>
                            <CardHeader className="pb-3">
                                <Database className="w-8 h-8 text-blue-600 mb-2" />
                                <CardTitle>Entity Explorer</CardTitle>
                                <CardDescription>Inspect and modify raw database records</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Capabilities</div>
                                <ul className="text-sm text-slate-600 space-y-1">
                                    <li className="flex items-center gap-2">• CRUD operations on all entities</li>
                                    <li className="flex items-center gap-2">• Filter and search by record IDs</li>
                                    <li className="flex items-center gap-2">• Export raw production datasets</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card className="col-span-1 border-0 shadow-sm ring-1 ring-slate-950/5 hover:ring-slate-950/10 transition-all cursor-pointer" onClick={() => setActiveTab('system')}>
                            <CardHeader className="pb-3">
                                <Play className="w-8 h-8 text-emerald-600 mb-2" />
                                <CardTitle>Function Runner</CardTitle>
                                <CardDescription>Execute serverless maintenance tasks</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Capabilities</div>
                                <ul className="text-sm text-slate-600 space-y-1">
                                    <li className="flex items-center gap-2">• Trigger data repair functions</li>
                                    <li className="flex items-center gap-2">• Recalculate salary snapshots</li>
                                    <li className="flex items-center gap-2">• Audit system integrity</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card className="col-span-1 border-0 shadow-sm ring-1 ring-slate-950/5 hover:ring-slate-950/10 transition-all cursor-pointer" onClick={() => setActiveTab('system')}>
                            <CardHeader className="pb-3">
                                <HeartPulse className="w-8 h-8 text-rose-600 mb-2" />
                                <CardTitle>System Health</CardTitle>
                                <CardDescription>Monitor platform status and logs</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">Capabilities</div>
                                <ul className="text-sm text-slate-600 space-y-1">
                                    <li className="flex items-center gap-2">• Live platform health checks</li>
                                    <li className="flex items-center gap-2">• Real-time server audit logs</li>
                                    <li className="flex items-center gap-2">• Function deployment history</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="border-0 shadow-sm ring-1 ring-slate-950/5">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">Technical Documentation</CardTitle>
                                    <BookOpen className="w-5 h-5 text-slate-400" />
                                </div>
                                <CardDescription>Developer references and architecture guides</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Button variant="outline" className="justify-start h-auto py-3 px-4" asChild>
                                    <a href="/TechnicalDocumentation">
                                        <div className="text-left">
                                            <div className="font-bold text-slate-900">Tech Docs</div>
                                            <div className="text-xs text-slate-500">Infrastructure & Backend</div>
                                        </div>
                                    </a>
                                </Button>
                                <Button variant="outline" className="justify-start h-auto py-3 px-4" asChild>
                                    <a href="/SoftwareDoc">
                                        <div className="text-left">
                                            <div className="font-bold text-slate-900">Software Architecture</div>
                                            <div className="text-xs text-slate-500">Entity Relationships</div>
                                        </div>
                                    </a>
                                </Button>
                                <Button variant="outline" className="justify-start h-auto py-3 px-4" asChild>
                                    <a href="/REPORT_ARCHITECTURE">
                                        <div className="text-left">
                                            <div className="font-bold text-slate-900">Report Engine</div>
                                            <div className="text-xs text-slate-500">Analysis Workflows</div>
                                        </div>
                                    </a>
                                </Button>
                                <Button variant="outline" className="justify-start h-auto py-3 px-4" asChild>
                                    <a href="/AppDocumentation">
                                        <div className="text-left">
                                            <div className="font-bold text-slate-900">User Guides</div>
                                            <div className="text-xs text-slate-500">Feature Manuals</div>
                                        </div>
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="border-0 shadow-sm ring-1 ring-slate-950/5">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">Developer Resources</CardTitle>
                                    <Code className="w-5 h-5 text-slate-400" />
                                </div>
                                <CardDescription>Commonly used developer links and tools</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div>
                                        <div className="font-semibold text-sm text-slate-900">Base44 Console</div>
                                        <div className="text-xs text-slate-500">Project management and entities</div>
                                    </div>
                                    <Button variant="ghost" size="sm" asChild>
                                        <a href="https://console.base44.io" target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    </Button>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div>
                                        <div className="font-semibold text-sm text-slate-900">Audit Dashboard</div>
                                        <div className="text-xs text-slate-500">Detailed user activity tracking</div>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('logs')}>
                                        <ExternalLink className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* System Module Tab (Consolidated from DeveloperModule.jsx) */}
                <TabsContent value="system" className="outline-none">
                    <Card className="border-0 shadow-sm ring-1 ring-slate-950/5">
                        <CardHeader className="bg-slate-900 text-white rounded-t-xl py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Database className="w-5 h-5" />
                                    <CardTitle className="text-xl">System Management Module</CardTitle>
                                </div>
                                <Badge className="bg-red-500/20 text-red-200 border-red-500/30">Admin Required</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="bg-red-600 text-white px-6 py-2 flex items-center gap-3 select-none text-xs">
                                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                                <span className="font-medium">
                                    All changes made here directly affect live production data.
                                </span>
                            </div>
                            
                            {/* Internal Navigation for System Module */}
                            <div className="p-6">
                                <Tabs defaultValue="entity-explorer" className="space-y-6">
                                    <TabsList className="bg-slate-100 p-1">
                                        <TabsTrigger value="entity-explorer" className="text-xs"><Database className="w-3.5 h-3.5 mr-1" /> Entities</TabsTrigger>
                                        <TabsTrigger value="function-runner" className="text-xs"><Play className="w-3.5 h-3.5 mr-1" /> Functions</TabsTrigger>
                                        <TabsTrigger value="employee-inspector" className="text-xs"><UserSearch className="w-3.5 h-3.5 mr-1" /> Inspector</TabsTrigger>
                                        <TabsTrigger value="system-health" className="text-xs"><HeartPulse className="w-3.5 h-3.5 mr-1" /> Health</TabsTrigger>
                                        <TabsTrigger value="change-management" className="text-xs"><GitCompareArrows className="w-3.5 h-3.5 mr-1" /> Management</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="entity-explorer" className="mt-4"><EntityExplorer /></TabsContent>
                                    <TabsContent value="function-runner" className="mt-4"><FunctionRunner /></TabsContent>
                                    <TabsContent value="employee-inspector" className="mt-4"><EmployeeInspector /></TabsContent>
                                    <TabsContent value="system-health" className="mt-4"><SystemHealth /></TabsContent>
                                    <TabsContent value="change-management" className="mt-4"><ChangeManagement /></TabsContent>
                                </Tabs>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Audit & Logs Tab */}
                <TabsContent value="logs" className="space-y-6 outline-none">
                    <Tabs defaultValue="audit" className="space-y-6">
                        <TabsList className="bg-white border rounded-lg p-1">
                            <TabsTrigger value="audit">System Audit Logs</TabsTrigger>
                            <TabsTrigger value="live">Live Server Logs</TabsTrigger>
                            <TabsTrigger value="history">Change History</TabsTrigger>
                        </TabsList>
                        <TabsContent value="audit"><AuditLogs /></TabsContent>
                        <TabsContent value="live"><LiveLogs /></TabsContent>
                        <TabsContent value="history"><ChangeHistory /></TabsContent>
                    </Tabs>
                </TabsContent>

                {/* Development Log Tab */}
                <TabsContent value="development" className="outline-none">
                    <DevelopmentLog />
                </TabsContent>

                {/* Test Data Tab */}
                <TabsContent value="test-data" className="outline-none">
                    <TestDataViewer />
                </TabsContent>

                {/* Feature Requests Tab */}
                <TabsContent value="features" className="outline-none">
                    <FeatureRequests />
                </TabsContent>

                {/* Documentation Tab */}
                <TabsContent value="docs" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <DocCard 
                            title="Technical Architecture" 
                            description="Deep dive into system infrastructure, auth, and backend logic."
                            link="/TechnicalDocumentation"
                            icon={Code}
                        />
                        <DocCard 
                            title="Software Schema" 
                            description="Entity relationships and domain model definitions."
                            link="/SoftwareDoc"
                            icon={Database}
                        />
                        <DocCard 
                            title="Report Engine" 
                            description="Detailed documentation of the attendance analysis logic."
                            link="/REPORT_ARCHITECTURE"
                            icon={ScrollText}
                        />
                        <DocCard 
                            title="Finalization Rules" 
                            description="Critical logic for report sealing and salary generation."
                            link="/CRITICAL_FINALIZATION_RULES"
                            icon={ShieldAlert}
                        />
                        <DocCard 
                            title="App Manual" 
                            description="General user documentation and feature guides."
                            link="/AppDocumentation"
                            icon={BookOpen}
                        />
                        <DocCard 
                            title="Agent Docs" 
                            description="Guidelines for LLM agents working on this codebase."
                            link="/AgentsDocumentation"
                            icon={Terminal}
                        />
                        <DocCard 
                            title="Business Logic" 
                            description="Company-specific rules and business requirements."
                            link="/BusinessDocumentation"
                            icon={FileText}
                        />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function DocCard({ title, description, link, icon: Icon }) {
    return (
        <Card className="border-0 shadow-sm ring-1 ring-slate-950/5 hover:ring-slate-950/20 transition-all group overflow-hidden">
            <CardHeader className="pb-3">
                <div className="bg-slate-50 w-12 h-12 rounded-lg flex items-center justify-center mb-2 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                    <Icon className="w-6 h-6" />
                </div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription className="line-clamp-2">{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <Button variant="ghost" className="w-full justify-between text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-0 h-auto font-semibold" asChild>
                    <a href={link}>
                        Open Documentation
                        <ExternalLink className="w-4 h-4 ml-2" />
                    </a>
                </Button>
            </CardContent>
        </Card>
    );
}
