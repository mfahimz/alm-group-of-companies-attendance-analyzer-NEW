import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Star, ChevronRight, User, Mail, Briefcase, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const RECOMMENDATION_CONFIG = {
    'Highly Recommended': { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2, iconColor: 'text-green-600', scoreColor: 'text-green-600' },
    'Recommended': { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle2, iconColor: 'text-blue-600', scoreColor: 'text-blue-600' },
    'Consider': { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600', scoreColor: 'text-amber-600' },
    'Not Recommended': { color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle, iconColor: 'text-red-600', scoreColor: 'text-red-600' },
};

function ScoreGauge({ score }) {
    const color = score >= 75 ? '#166534' : score >= 50 ? '#B45309' : '#991B1B';
    const circumference = 2 * Math.PI * 40;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-28 h-28">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                    <circle
                        cx="50" cy="50" r="40" fill="none"
                        stroke={color} strokeWidth="10"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold" style={{ color }}>{score}</span>
                </div>
            </div>
            <p className="text-xs text-[#6B7280] mt-1">out of 100</p>
        </div>
    );
}

export default function ResumeScanResultView({ result, onNewScan }) {
    if (!result) return null;

    const config = RECOMMENDATION_CONFIG[result.recommendation] || RECOMMENDATION_CONFIG['Consider'];
    const RecommendIcon = config.icon;

    return (
        <div className="space-y-5">
            {/* Header: Score + Recommendation */}
            <div className="bg-white rounded-xl border border-[#E2E6EC] p-5 flex flex-col sm:flex-row items-center gap-5">
                <ScoreGauge score={result.score} />
                <div className="flex-1 text-center sm:text-left">
                    {result.applicant_name && result.applicant_name !== 'Unknown' && (
                        <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
                            <User className="w-4 h-4 text-[#6B7280]" />
                            <span className="font-semibold text-[#1F2937]">{result.applicant_name}</span>
                            {result.applicant_email && (
                                <span className="text-sm text-[#6B7280]">• {result.applicant_email}</span>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                        <RecommendIcon className={`w-5 h-5 ${config.iconColor}`} />
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${config.color}`}>
                            {result.recommendation}
                        </span>
                    </div>
                    {result.experience_years > 0 && (
                        <div className="flex items-center gap-1 text-sm text-[#6B7280] justify-center sm:justify-start">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{result.experience_years} years of experience</span>
                        </div>
                    )}
                    <p className="text-sm text-[#4B5563] mt-2 leading-relaxed">{result.summary}</p>
                </div>
            </div>

            {/* Strengths & Concerns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {result.strengths?.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-1">
                            <Star className="w-4 h-4" /> Strengths
                        </h4>
                        <ul className="space-y-1">
                            {result.strengths.map((s, i) => (
                                <li key={i} className="text-sm text-green-700 flex items-start gap-1.5">
                                    <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                    {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {result.concerns?.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" /> Concerns
                        </h4>
                        <ul className="space-y-1">
                            {result.concerns.map((c, i) => (
                                <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                                    <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                    {c}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Matched vs Missing Skills */}
            <div className="bg-white rounded-xl border border-[#E2E6EC] p-4">
                <h4 className="text-sm font-semibold text-[#1F2937] mb-3">Criteria Match Analysis</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs font-medium text-green-700 mb-2">✓ Matched</p>
                        <div className="flex flex-wrap gap-1.5">
                            {result.matched_skills?.length > 0
                                ? result.matched_skills.map((s, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full border border-green-200">{s}</span>
                                ))
                                : <span className="text-xs text-[#9CA3AF]">None identified</span>
                            }
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-red-600 mb-2">✗ Missing</p>
                        <div className="flex flex-wrap gap-1.5">
                            {result.missing_skills?.length > 0
                                ? result.missing_skills.map((s, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full border border-red-200">{s}</span>
                                ))
                                : <span className="text-xs text-[#9CA3AF]">No gaps identified</span>
                            }
                        </div>
                    </div>
                </div>
            </div>

            {/* New Scan Button */}
            <button
                onClick={onNewScan}
                className="w-full py-2.5 border border-[#CBD5E1] rounded-lg text-sm text-[#4B5563] hover:bg-[#F1F5F9] transition-colors"
            >
                Scan Another Resume
            </button>
        </div>
    );
}