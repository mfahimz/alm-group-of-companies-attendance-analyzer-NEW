import React, { useState } from 'react';
import { ScanLine, History, Plus } from 'lucide-react';
import ResumeScanForm from '../components/resume/ResumeScanForm';
import ResumeScanResultView from '../components/resume/ResumeScanResult';
import ScanHistoryTable from '../components/resume/ScanHistoryTable';

export default function ResumeScanner() {
    const [activeTab, setActiveTab] = useState('scan');
    const [scanResult, setScanResult] = useState(null);
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

    const handleScanComplete = (data) => {
        setScanResult(data.result);
        setHistoryRefreshKey(k => k + 1);
    };

    const handleNewScan = () => {
        setScanResult(null);
    };

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 bg-[#EEF2FF] rounded-lg flex items-center justify-center">
                        <ScanLine className="w-5 h-5 text-[#0F1E36]" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-[#1F2937]">AI Resume Scanner</h1>
                        <p className="text-sm text-[#6B7280]">Upload a resume and get an AI-powered candidate evaluation instantly</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-[#F4F6F9] p-1 rounded-lg mb-6 w-fit">
                <button
                    onClick={() => setActiveTab('scan')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'scan'
                            ? 'bg-white text-[#1F2937] shadow-sm'
                            : 'text-[#6B7280] hover:text-[#1F2937]'
                    }`}
                >
                    <Plus className="w-4 h-4" />
                    New Scan
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        activeTab === 'history'
                            ? 'bg-white text-[#1F2937] shadow-sm'
                            : 'text-[#6B7280] hover:text-[#1F2937]'
                    }`}
                >
                    <History className="w-4 h-4" />
                    Scan History
                </button>
            </div>

            {/* Content */}
            {activeTab === 'scan' && (
                <div className="bg-white rounded-xl border border-[#E2E6EC] shadow-sm p-6">
                    {scanResult ? (
                        <ResumeScanResultView result={scanResult} onNewScan={handleNewScan} />
                    ) : (
                        <ResumeScanForm onScanComplete={handleScanComplete} />
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="bg-white rounded-xl border border-[#E2E6EC] shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#E2E6EC]">
                        <h2 className="text-sm font-semibold text-[#1F2937]">Past Resume Scans</h2>
                    </div>
                    <ScanHistoryTable refreshKey={historyRefreshKey} />
                </div>
            )}
        </div>
    );
}