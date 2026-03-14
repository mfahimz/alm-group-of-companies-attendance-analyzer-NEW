import React, { useState } from 'react';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    LayoutDashboard, 
    BookOpen, 
    ShieldCheck, 
    Zap, 
    History, 
    Settings,
    FileText,
    Github,
    Code
} from 'lucide-react';
import SystemStatus from '../components/softwaredoc/SystemStatus';
import ModuleDives from '../components/softwaredoc/ModuleDives';
import CompanyRules from '../components/softwaredoc/CompanyRules';
import SpecializedTweaks from '../components/softwaredoc/SpecializedTweaks';
import MetadataCenter from '../components/softwaredoc/MetadataCenter';
import DataIntegrityRules from '../components/softwaredoc/DataIntegrityRules';

const sections = [
    { id: 'system', title: 'System Status', icon: LayoutDashboard, component: SystemStatus },
    { id: 'modules', title: 'Module Deep-Dives', icon: BookOpen, component: ModuleDives },
    { id: 'rules', title: 'Company Rules', icon: ShieldCheck, component: CompanyRules },
    { id: 'tweaks', title: 'Specialized Tweaks', icon: Zap, component: SpecializedTweaks },
    { id: 'integrity', title: 'Data Integrity Rules', icon: ShieldCheck, component: DataIntegrityRules },
    { id: 'metadata', title: 'Metadata & Roadmap', icon: History, component: MetadataCenter }
];

/**
 * SoftwareDoc - Comprehensive application documentation hub.
 * 
 * This page bridges architecture documentation, business logic, and live technical status.
 * It is additive and does not modify core files, ensuring safety and scannability.
 */
export default function SoftwareDoc() {
    usePageTitle('Software Documentation');
    const [activeSection, setActiveSection] = useState('system');

    const ActiveComponent = sections.find(s => s.id === activeSection)?.component || SystemStatus;

    return (
        <div className="flex h-[calc(100vh-120px)] gap-6 overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="w-64 flex flex-col gap-2 shrink-0">
                <div className="px-3 py-2 mb-2">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Code className="w-6 h-6 text-indigo-600" />
                        SoftwareDoc
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Self-documenting application hub</p>
                </div>
                
                <nav className="flex-1 space-y-1">
                    {sections.map(section => {
                        const Icon = section.icon;
                        const isActive = activeSection === section.id;
                        return (
                            <button
                                key={section.id}
                                onClick={() => setActiveSection(section.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    isActive 
                                        ? 'bg-indigo-50 text-indigo-700' 
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                                {section.title}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 mt-auto">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        <Github className="w-3 h-3" />
                        Live Status
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>Environment</span>
                            <span className="font-mono text-emerald-600 font-bold">Production</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>Version</span>
                            <span className="font-mono">v1.2.4-stable</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <h1 className="text-lg font-bold text-slate-900">
                        {sections.find(s => s.id === activeSection)?.title}
                    </h1>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <FileText className="w-4 h-4" />
                        Last scanned: {new Date().toLocaleTimeString()}
                    </div>
                </header>
                
                <ScrollArea className="flex-1">
                    <div className="p-8 max-w-5xl mx-auto">
                        <ActiveComponent />
                    </div>
                </ScrollArea>
            </main>
        </div>
    );
}
