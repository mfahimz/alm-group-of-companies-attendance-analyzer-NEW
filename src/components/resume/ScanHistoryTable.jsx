import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ExternalLink, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

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

export default function ScanHistoryTable({ refreshKey }) {
    const { data: scans, isLoading } = useQuery({
        queryKey: ['resumeScans', refreshKey],
        queryFn: () => base44.entities.ResumeScanResult.list('-created_date', 50),
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
        return (
            <div className="text-center py-10 text-[#9CA3AF] text-sm">
                No scans yet. Upload a resume to get started.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-[#E2E6EC] bg-[#F4F6F9]">
                        <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Applicant</th>
                        <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Position</th>
                        <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Department</th>
                        <th className="text-center px-4 py-3 font-semibold text-[#4B5563] text-xs">Score</th>
                        <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Recommendation</th>
                        <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Scanned By</th>
                        <th className="text-left px-4 py-3 font-semibold text-[#4B5563] text-xs">Date</th>
                        <th className="text-center px-4 py-3 font-semibold text-[#4B5563] text-xs">Resume</th>
                    </tr>
                </thead>
                <tbody>
                    {scans.map((scan, idx) => (
                        <tr key={scan.id} className={`border-b border-[#E2E6EC] hover:bg-[#F9FAFB] ${idx % 2 === 0 ? '' : 'bg-[#FAFBFD]'}`}>
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
                            <td className="px-4 py-3 text-center">
                                {scan.file_url ? (
                                    <a href={scan.file_url} target="_blank" rel="noreferrer"
                                        className="text-[#0F1E36] hover:text-blue-600 inline-flex items-center gap-1 text-xs">
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        View
                                    </a>
                                ) : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}