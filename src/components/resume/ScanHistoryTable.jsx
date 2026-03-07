import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ExternalLink, Loader2, X } from 'lucide-react';
import ResumeScanResultView from './ResumeScanResult';

const RECOMMENDATION_COLORS = {
    'Highly Recommended': 'bg-green-100 text-green-800',
    'Recommended': 'bg-blue-100 text-blue-800',
    'Consider': 'bg-amber-100 text-amber-800',
    'Not Recommended': 'bg-red-100 text-red-700',
};

const SCORE_COLOR = (score) => {
    if (score >= 75) return 'text-green-700 font-bold';
    if (score >= 50) return 'text-amber-700 font-bold';
    return 'text-red-700 font-bold';
};

function ScanDetailDialog({ scan, onClose }) {
    if (!scan) return null;

    // Build result object matching ResumeScanResultView's expected shape
    const extractedData = (() => {
        try { return scan.extracted_data ? JSON.parse(scan.extracted_data) : null; }
        catch { return null; }
    })();

    const codeComparison = (() => {
        try { return scan.code_comparison ? JSON.parse(scan.code_comparison) : null; }
        catch { return null; }
    })();

    const result = {
        score: scan.ai_score || 0,
        recommendation: scan.ai_recommendation,
        summary: scan.ai_summary,
        matched_skills: scan.matched_skills ? scan.matched_skills.split(', ').filter(Boolean) : [],
        missing_skills: scan.missing_skills ? scan.missing_skills.split(', ').filter(Boolean) : [],
        strengths: (() => { try { return scan.strengths ? JSON.parse(scan.strengths) : []; } catch { return []; } })(),
        concerns: (() => { try { return scan.concerns ? JSON.parse(scan.concerns) : []; } catch { return []; } })(),
        experience_years: scan.years_experience || 0,
        applicant_name: scan.applicant_name,
        applicant_email: scan.applicant_email,
        file_url: scan.file_url,
        file_name: scan.file_name,
        extracted_data: scan.extracted_data,
        code_comparison: codeComparison
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl relative">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E6EC]">
                    <div>
                        <h2 className="text-base font-semibold text-[#1F2937]">Scan Report — {scan.applicant_name || 'Unknown'}</h2>
                        <p className="text-xs text-[#6B7280]">
                            {scan.position_applied}{scan.department ? ` · ${scan.department}` : ''}
                            {scan.created_date ? ` · ${new Date(scan.created_date).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F4F6F9] rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6">
                    <ResumeScanResultView result={result} onNewScan={onClose} />
                </div>
            </div>
        </div>
    );
}

export default function ScanHistoryTable({ refreshKey }) {
    const [selectedScan, setSelectedScan] = useState(null);

    const { data: scans, isLoading } = useQuery({
        queryKey: ['resumeScans', refreshKey],
        queryFn: () => base44.entities.ResumeScanResult.list('-created_date', 100),
        staleTime: 0
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-[#6B7280]" />
                <span className="ml-2 text-sm text-[#6B7280]">Loading scan history...</span>
            </div>
        );
    }

    if (!scans || scans.length === 0) {
        return <div className="text-center py-10 text-[#9CA3AF] text-sm">No scans yet. Upload a resume to get started.</div>;
    }

    return (
        <>
            {selectedScan && <ScanDetailDialog scan={selectedScan} onClose={() => setSelectedScan(null)} />}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-[#E2E6EC] bg-[#F4F6F9]">
                            <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Applicant</th>
                            <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Position</th>
                            <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Dept</th>
                            <th className="text-center px-4 py-3 font-semibold text-[#4B5563] text-xs">Score</th>
                            <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Recommendation</th>
                            <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Scanned By</th>
                            <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scans.map((scan, idx) => (
                            <tr
                                key={scan.id}
                                onClick={() => setSelectedScan(scan)}
                                className={`border-b border-[#E2E6EC] cursor-pointer hover:bg-[#EEF2FF] transition-colors ${idx % 2 === 0 ? '' : 'bg-[#FAFBFD]'}`}
                            >
                                <td className="px-4 py-3">
                                    <p className="font-medium text-[#1F2937]">{scan.applicant_name || '—'}</p>
                                    {scan.applicant_email && <p className="text-xs text-[#9CA3AF]">{scan.applicant_email}</p>}
                                </td>
                                <td className="px-4 py-3 text-[#4B5563]">{scan.position_applied || '—'}</td>
                                <td className="px-4 py-3 text-[#4B5563]">{scan.department || '—'}</td>
                                <td className="px-4 py-3 text-center">
                                    <span className={SCORE_COLOR(scan.ai_score)}>{scan.ai_score ?? '—'}</span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RECOMMENDATION_COLORS[scan.ai_recommendation] || 'bg-gray-100 text-gray-700'}`}>
                                        {scan.ai_recommendation || '—'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-xs text-[#6B7280]">{scan.scanned_by?.split('@')[0] || '—'}</td>
                                <td className="px-4 py-3 text-xs text-[#6B7280]">
                                    {scan.created_date ? new Date(scan.created_date).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}