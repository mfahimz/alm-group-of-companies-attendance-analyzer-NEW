import React, { useState, useEffect } from 'react';
import { ScanLine, History, Plus, Settings } from 'lucide-react';
import ResumeScanForm from '../components/resume/ResumeScanForm';
import BatchScanResults from '../components/resume/BatchScanResults';
import ScanHistoryTable from '../components/resume/ScanHistoryTable';
import JobTemplateManager from '../components/resume/JobTemplateManager';
import { base44 } from '@/api/base44Client';

export default function ResumeScanner() {
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        base44.auth.me().then(u => setIsAdmin(u?.role === 'admin')).catch(() => {});
    }, []);
    const [activeTab, setActiveTab] = useState('scan');
    const [scanResults, setScanResults] = useState(null); // array of results
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

    // onScanComplete now receives an array of result objects
    const handleScanComplete = (results) => {
        setScanResults(results);
        setHistoryRefreshKey(k => k + 1);
    };

    const handleNewScan = () => {
        setScanResults(null);
        setActiveTab('scan');
    };

    const tabs = [
        { key: 'scan', label: 'New Scan', icon: Plus },
        { key: 'history', label: 'Scan History', icon: History },
        { key: 'templates', label: 'Position Templates', icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-[#F4F6F9]">
            {/* Page Header */}
            <div className="bg-white border-b border-[#E2E6EC] px-6 py-4">
                <div className="max-w-5xl mx-auto flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#EEF2FF] rounded-lg flex items-center justify-center">
                        <ScanLine className="w-5 h-5 text-[#0F1E36]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-[#1F2937]">AI Resume Scanner</h1>
                        <p className="text-xs text-[#6B7280]">Upload a resume and get an AI-powered candidate evaluation instantly</p>
                    </div>
                </div>
            </div>

            {/* Mini Nav Tabs */}
            <div className="bg-white border-b border-[#E2E6EC] px-6">
                <div className="max-w-5xl mx-auto flex gap-0">
                    {tabs.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => { setActiveTab(key); if (key === 'scan') setScanResult(null); }}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === key
                                    ? 'border-[#0F1E36] text-[#0F1E36]'
                                    : 'border-transparent text-[#6B7280] hover:text-[#1F2937] hover:border-[#CBD5E1]'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="max-w-5xl mx-auto px-6 py-6">
                {activeTab === 'scan' && (
                    <div className="bg-white rounded-xl border border-[#E2E6EC] shadow-sm p-6">
                        {scanResults ? (
                            <BatchScanResults results={scanResults} onNewScan={handleNewScan} />
                        ) : (
                            <ResumeScanForm onScanComplete={handleScanComplete} />
                        )}
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="bg-white rounded-xl border border-[#E2E6EC] shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#E2E6EC]">
                            <h2 className="text-sm font-semibold text-[#1F2937]">Past Resume Scans</h2>
                            <p className="text-xs text-[#6B7280] mt-0.5">Click any row to view the full scan report</p>
                        </div>
                        <ScanHistoryTable refreshKey={historyRefreshKey} />
                    </div>
                )}

                {activeTab === 'templates' && (
                    <div className="bg-white rounded-xl border border-[#E2E6EC] shadow-sm p-6">
                        <JobTemplateManager />
                    </div>
                )}
            </div>
        </div>
    );
}