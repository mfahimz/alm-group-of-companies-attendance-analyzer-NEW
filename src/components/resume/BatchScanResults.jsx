import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ChevronRight, ArrowLeft, Globe, UserCheck, UserX, MapPin, Filter, Users, Briefcase } from 'lucide-react';
import ResumeScanResultView from './ResumeScanResult';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

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
    const [filters, setFilters] = useState({
        nationality: '',
        location: '',
        minExperience: '',
        gender: ''
    });
    const [localStatuses, setLocalStatuses] = useState({}); // { scanId: 'Selected' | 'Rejected' }
    const queryClient = useQueryClient();

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }) => {
            await base44.entities.ResumeScanResult.update(id, { evaluation_status: status });
            return { id, status };
        },
        onSuccess: (data) => {
            setLocalStatuses(prev => ({ ...prev, [data.id]: data.status }));
            queryClient.invalidateQueries({ queryKey: ['resumeScans'] });
        }
    });

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

    const filteredResults = [...results].filter(r => {
        const nationality = (r.nationality || '').toLowerCase();
        const location = (r.location || '').toLowerCase();
        const gender = (r.gender || '').toLowerCase();
        const experience = r.years_experience || 0;

        if (filters.nationality && !nationality.includes(filters.nationality.toLowerCase())) return false;
        if (filters.location && !location.includes(filters.location.toLowerCase())) return false;
        if (filters.gender && filters.gender !== 'All' && gender !== filters.gender.toLowerCase()) return false;
        if (filters.minExperience && experience < parseInt(filters.minExperience)) return false;

        return true;
    });

    // Unified field: ai_score is the field name used when saving to the database
    const sorted = filteredResults.sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
    
    // Unique nationalities for dropdown
    const uniqueNationalities = Array.from(new Set(results.map(r => r.nationality).filter(Boolean))).sort();

    return (
        <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-[#F9FAFB] border border-[#E2E6EC] rounded-xl px-4 py-3 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-[#4B5563]">
                    <Filter className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Filters</span>
                </div>

                <div className="flex flex-wrap gap-2 flex-1">
                    <div className="relative min-w-[120px]">
                        <Globe className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <select
                            value={filters.nationality}
                            onChange={(e) => setFilters(f => ({ ...f, nationality: e.target.value }))}
                            className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-white border border-[#E2E6EC] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F1E36] appearance-none"
                        >
                            <option value="">Nationality (All)</option>
                            {uniqueNationalities.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>

                    <div className="relative min-w-[120px]">
                        <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                            type="text"
                            placeholder="Location..."
                            value={filters.location}
                            onChange={(e) => setFilters(f => ({ ...f, location: e.target.value }))}
                            className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-white border border-[#E2E6EC] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F1E36]"
                        />
                    </div>

                    <div className="relative min-w-[100px]">
                        <Briefcase className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                            type="number"
                            placeholder="Min Exp"
                            value={filters.minExperience}
                            onChange={(e) => setFilters(f => ({ ...f, minExperience: e.target.value }))}
                            className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-white border border-[#E2E6EC] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F1E36]"
                        />
                    </div>

                    <div className="relative min-w-[100px]">
                        <Users className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <select
                            value={filters.gender}
                            onChange={(e) => setFilters(f => ({ ...f, gender: e.target.value }))}
                            className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-white border border-[#E2E6EC] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F1E36] appearance-none"
                        >
                            <option value="All">Gender (All)</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setFilters({ nationality: '', location: '', minExperience: '', gender: 'All' })}
                        className="text-[11px] text-[#6B7280] hover:text-[#1F2937] px-1 transition-colors"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-[#1F2937]">Batch Scan Summary — {sorted.length} shown</h3>
                    <p className="text-xs text-[#6B7280] mt-0.5">Evaluation status updates are saved instantly</p>
                </div>
                <div className="flex gap-2 text-xs text-[#6B7280]">
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                        {/* Unified field: ai_recommendation matches the backend entity field name */}
                        {sorted.filter(r => r.ai_recommendation === 'Highly Recommended' || r.ai_recommendation === 'Recommended').length} Recommended
                    </span>
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                        {/* Unified field: ai_recommendation matches the backend entity field name */}
                        {sorted.filter(r => r.ai_recommendation === 'Not Recommended').length} Not Recommended
                    </span>
                    {sorted.some(r => r.evaluation_status === 'Rejected') && (
                        <span className="px-2 py-1 bg-red-600 text-white rounded-full font-bold animate-pulse">
                            {sorted.filter(r => r.evaluation_status === 'Rejected').length} Knock-outs
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => sorted.forEach(r => r.id && updateStatusMutation.mutate({ id: r.id, status: 'Selected' }))}
                        className="text-xs text-indigo-600 hover:bg-indigo-50"
                    >
                        Bulk Select All
                    </Button>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => sorted.forEach(r => r.id && updateStatusMutation.mutate({ id: r.id, status: 'Rejected' }))}
                        className="text-xs text-red-600 hover:bg-red-50"
                    >
                        Bulk Reject All
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="space-y-2">
                {sorted.map((result, idx) => {
                    // Unified field: ai_recommendation matches the backend entity field name
                    const rec = REC_CONFIG[result.ai_recommendation] || REC_CONFIG['Consider'];
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
                                            Nat: {result.nationality || 'Not Specified'}
                                        </span>
                                    </div>
                                </div>
                                {/* Score Bar uses unified field: ai_score */}
                                <div className="w-28 hidden sm:flex items-center">
                                    <ScoreBar score={result.ai_score || 0} />
                                </div>
                                
                                {/* Recommendation Badge uses unified field: ai_recommendation */}
                                <div className="flex flex-col items-end gap-1">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border hidden md:inline ${rec.color}`}>
                                        {result.ai_recommendation}
                                    </span>
                                    {result.evaluation_status === 'Rejected' && (
                                        <span className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-bold uppercase tracking-tight hidden md:inline animate-pulse">
                                            Knock-out Failed
                                        </span>
                                    )}
                                </div>
                                
                                {/* Mobile score uses unified field: ai_score */}
                                <span className="text-sm font-bold text-[#1F2937] sm:hidden">{result.ai_score}</span>
                                
                                <ChevronRight className="w-4 h-4 text-[#CBD5E1] group-hover:text-[#0F1E36] flex-shrink-0 transition-colors" />
                            </div>

                            {/* Manual Evaluation Controls */}
                            <div className="mt-3 flex items-center justify-between pt-3 border-t border-[#F4F6F9]">
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (result.id) updateStatusMutation.mutate({ id: result.id, status: 'Selected' });
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight flex items-center gap-1.5 transition-all border ${
                                            (localStatuses[result.id] || result.evaluation_status) === 'Selected'
                                                ? 'bg-green-600 border-green-600 text-white shadow-sm'
                                                : 'bg-white border-[#E2E6EC] text-[#6B7280] hover:border-green-500 hover:text-green-600'
                                        }`}
                                    >
                                        <UserCheck className="w-3.5 h-3.5" />
                                        {(localStatuses[result.id] || result.evaluation_status) === 'Selected' ? 'Selected' : 'Select'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (result.id) updateStatusMutation.mutate({ id: result.id, status: 'Rejected' });
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tight flex items-center gap-1.5 transition-all border ${
                                            (localStatuses[result.id] || result.evaluation_status) === 'Rejected'
                                                ? 'bg-red-600 border-red-600 text-white shadow-sm'
                                                : 'bg-white border-[#E2E6EC] text-[#6B7280] hover:border-red-500 hover:text-red-600'
                                        }`}
                                    >
                                        <UserX className="w-3.5 h-3.5" />
                                        {(localStatuses[result.id] || result.evaluation_status) === 'Rejected' ? 'Rejected' : 'Reject'}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-[#9CA3AF] font-medium italic">
                                        Exp: {result.years_experience ?? 0}y
                                    </span>
                                    <span className="text-[10px] text-[#9CA3AF] font-medium italic truncate max-w-[120px]">
                                        Loc: {result.location || 'Not Specified'}
                                    </span>
                                </div>
                            </div>

                            {/* Mobile recommendation uses unified field: ai_recommendation */}
                            <div className="mt-2 sm:hidden">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${rec.color}`}>
                                    {result.ai_recommendation}
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