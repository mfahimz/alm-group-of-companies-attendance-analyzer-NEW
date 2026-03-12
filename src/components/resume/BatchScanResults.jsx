import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ChevronRight, ArrowLeft, Globe } from 'lucide-react';
import ResumeScanResultView from './ResumeScanResult';
import { Button } from '@/components/ui/button';

const REC_CONFIG = {
    'Highly Recommended': { color: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' },
    'Recommended':        { color: 'bg-blue-100 text-blue-800 border-blue-200',  dot: 'bg-blue-500' },
    'Consider':           { color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
    'Not Recommended':    { color: 'bg-red-100 text-red-800 border-red-200',    dot: 'bg-red-500' },
};

function ScoreBar({ score }) {
    const color = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 h-1.5 bg-[#E2E6EC] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
            </div>
            <span className="text-xs font-bold text-[#1F2937] w-8 text-right">{score}</span>
        </div>
    );
}

export default function BatchScanResults({ results, onNewScan }) {
    const [selectedIndex, setSelectedIndex] = useState(null);
    // Tracks which card indices have their per-template score breakdown open.
    const [expandedScores, setExpandedScores] = useState(new Set());

    if (selectedIndex !== null) {
        return (
            <div>
                <button
                    onClick={() => setSelectedIndex(null)}
                    className="flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#1F2937] mb-4 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Batch Summary
                </button>
                <ResumeScanResultView result={results[selectedIndex]} onNewScan={onNewScan} />
            </div>
        );
    }

    const sorted = [...results].sort((a, b) => (b.score || 0) - (a.score || 0));

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-[#1F2937]">Batch Scan Complete — {results.length} Resume{results.length > 1 ? 's' : ''}</h3>
                    <p className="text-xs text-[#6B7280] mt-0.5">Click any candidate to view the full AI report</p>
                </div>
                <div className="flex gap-2 text-xs text-[#6B7280]">
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                        {results.filter(r => r.recommendation === 'Highly Recommended' || r.recommendation === 'Recommended').length} Recommended
                    </span>
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                        {results.filter(r => r.recommendation === 'Not Recommended').length} Not Recommended
                    </span>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="space-y-2">
                {sorted.map((result, idx) => {
                    const rec = REC_CONFIG[result.recommendation] || REC_CONFIG['Consider'];
                    const originalIndex = results.indexOf(result);
                    return (
                        // Card is a div+role=button so nested interactive elements
                        // (the template-scores toggle) are valid HTML.
                        <div
                            key={idx}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedIndex(originalIndex)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedIndex(originalIndex)}
                            className="w-full text-left bg-white border border-[#E2E6EC] rounded-xl px-4 py-3 hover:border-[#0F1E36] hover:shadow-sm transition-all group cursor-pointer"
                        >
                            <div className="flex items-center gap-3">
                                {/* Rank */}
                                <div className="w-6 h-6 rounded-full bg-[#F4F6F9] text-[#6B7280] text-xs font-bold flex items-center justify-center flex-shrink-0">
                                    {idx + 1}
                                </div>

                                {/* Name & Position */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[#1F2937] truncate">
                                        {result.applicant_name && result.applicant_name !== 'Unknown'
                                            ? result.applicant_name
                                            : result.file_name || 'Unknown Candidate'}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {result.applicant_email && (
                                            <p className="text-xs text-[#9CA3AF] truncate">{result.applicant_email}</p>
                                        )}
                                        {/* Display candidate nationality prominently as required by business logic */}
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded text-[10px] font-semibold">
                                            <Globe className="w-3 h-3 text-amber-700" />
                                            Nat: {result.nationality || JSON.parse(result.extracted_data || '{}')?.nationality || 'Not Specified'}
                                        </span>
                                    </div>
                                </div>

                                {/* Score Bar */}
                                <div className="w-28 hidden sm:flex items-center">
                                    <ScoreBar score={result.score || 0} />
                                </div>

                                {/* Recommendation Badge */}
                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border hidden md:inline ${rec.color}`}>
                                    {result.recommendation}
                                </span>

                                {/* Mobile score */}
                                <span className="text-sm font-bold text-[#1F2937] sm:hidden">{result.score}</span>

                                <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#0F1E36] flex-shrink-0 transition-colors" />
                            </div>

                            {/* Mobile recommendation */}
                            <div className="mt-2 sm:hidden">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${rec.color}`}>
                                    {result.recommendation}
                                </span>
                            </div>

                            {/* matched_template_name badge — only present on multi-template scan
                                results. It shows the highest-scoring template after all per-template
                                evaluations were compared on the frontend. Not rendered for
                                single-template scans where this field is absent. */}
                            {result.matched_template_name && (
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#EEF2FF] border border-[#C7D2FE] rounded-full text-xs font-medium text-[#4338CA]">
                                        Best match: {result.matched_template_name}
                                    </span>

                                    {/* Toggle button for the per-template score breakdown.
                                        stopPropagation prevents the card's onClick from firing. */}
                                    {result.template_scores?.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedScores(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(idx)) next.delete(idx);
                                                    else next.add(idx);
                                                    return next;
                                                });
                                            }}
                                            className="text-xs text-[#6B7280] hover:text-[#1F2937] transition-colors"
                                        >
                                            {expandedScores.has(idx)
                                                ? 'Hide scores ▲'
                                                : `All ${result.template_scores.length} templates ▼`}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Per-template score breakdown — expanded on demand.
                                Each row shows a template name and the score this resume
                                received when scanned against that template's criteria.
                                The winning template (matched_template_name) is highlighted. */}
                            {result.matched_template_name && expandedScores.has(idx) && result.template_scores?.length > 0 && (
                                <div className="mt-2 ml-1 pl-3 border-l-2 border-[#E2E6EC] space-y-1">
                                    {result.template_scores.map((ts, ti) => {
                                        const isWinner = ts.template_name === result.matched_template_name;
                                        const scoreColor = ts.score >= 75 ? 'text-green-600' : ts.score >= 50 ? 'text-amber-600' : 'text-red-600';
                                        return (
                                            <div key={ti} className="flex items-center justify-between text-xs">
                                                <span className={isWinner ? 'font-semibold text-[#1F2937]' : 'text-[#6B7280]'}>
                                                    {ts.template_name}{isWinner ? ' ★' : ''}
                                                </span>
                                                <span className={`font-bold ${scoreColor}`}>{ts.score}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <Button variant="outline" onClick={onNewScan} className="w-full">
                Scan New Resumes
            </Button>
        </div>
    );
}