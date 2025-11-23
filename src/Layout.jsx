import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { BarChart3, FolderKanban, Users, Settings, LayoutDashboard } from 'lucide-react';

export default function Layout({ children, currentPageName }) {
    const navigation = [
        { name: 'Dashboard', path: 'Dashboard', icon: LayoutDashboard },
        { name: 'Projects', path: 'Projects', icon: FolderKanban },
        { name: 'Employees', path: 'Employees', icon: Users },
        { name: 'Rules Settings', path: 'RulesSettings', icon: Settings }
    ];

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Top Navigation */}
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-8">
                            <div className="flex items-center space-x-3">
                                <BarChart3 className="w-7 h-7 text-indigo-600" />
                                <span className="text-xl font-semibold text-slate-900">Attendance Analysis</span>
                            </div>
                            <div className="flex space-x-1">
                                {navigation.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = currentPageName === item.path;
                                    return (
                                        <Link
                                            key={item.name}
                                            to={createPageUrl(item.path)}
                                            className={`
                                                flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                                                ${isActive 
                                                    ? 'bg-indigo-50 text-indigo-700' 
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                                            `}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span>{item.name}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {children}
            </main>
        </div>
    );
}