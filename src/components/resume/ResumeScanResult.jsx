import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Star, ChevronRight, User, Mail, Phone, Clock, Briefcase, GraduationCap, Award, Globe, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const RECOMMENDATION_CONFIG = {
    'Highly Recommended': { color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle2, iconColor: 'text-green-600' },
    'Recommended': { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle2, iconColor: 'text-blue-600' },
    'Consider': { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600' },
    'Not Recommended': { color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle, iconColor: 'text-red-600' },
};

function ScoreGauge({ score }) {
    const color = score >= 75 ? '#166534' : score >= 50 ? '#B45309' : '#991B1B';
    const circumference = 2 * Math.PI * 40;
    const offset = circumference - (score / 100) * circumference;
    return (
        <div className="flex flex-col items-center">
            <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E7EB" strokeWidth="10" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-in-out' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold" style={{ color }}>{score}</span>
                </div>
            </div>
            <p className="text-xs text-[#6B7280] mt-1">out of 100</p>
        </div>
    );
}

function Section({ title, defaultOpen = false, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-[#E2E6EC] rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#F4F6F9] hover:bg-[#EEF2FF] transition-colors text-left"
            >
                <span className="text-sm font-semibold text-[#1F2937]">{title}</span>
                {open ? <ChevronUp className="w-4 h-4 text-[#6B7280]" /> : <ChevronDown className="w-4 h-4 text-[#6B7280]" />}
            </button>
            {open && <div className="p-4 bg-white">{children}</div>}
        </div>
    );
}

function ExtractedDataSection({ data, fileUrl, fileName }) {
    if (!data) return <p className="text-xs text-[#9CA3AF]">No structured data could be extracted from this file.</p>;

    return (
        <div className="space-y-4 text-sm">
            {/* Contact Info */}
            <div className="flex flex-wrap gap-4">
                {data.full_name && <div className="flex items-center gap-1.5 text-[#1F2937]"><User className="w-3.5 h-3.5 text-[#6B7280]" /><span className="font-medium">{data.full_name}</span></div>}
                {data.email && <div className="flex items-center gap-1.5 text-[#4B5563]"><Mail className="w-3.5 h-3.5 text-[#6B7280]" />{data.email}</div>}
                {data.phone && <div className="flex items-center gap-1.5 text-[#4B5563]"><Phone className="w-3.5 h-3.5 text-[#6B7280]" />{data.phone}</div>}
                {data.total_years_experience != null && <div className="flex items-center gap-1.5 text-[#4B5563]"><Clock className="w-3.5 h-3.5 text-[#6B7280]" />{data.total_years_experience} years experience</div>}
            </div>

            {/* Current Position */}
            {data.current_or_last_position && (
                <div className="flex items-start gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-[#6B7280] mt-0.5 flex-shrink-0" />
                    <span className="text-[#4B5563]">{data.current_or_last_position}{data.current_or_last_company ? ` at ${data.current_or_last_company}` : ''}</span>
                </div>
            )}

            {/* Skills */}
            {data.skills?.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-[#6B7280] mb-1.5">Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                        {data.skills.map((s, i) => <span key={i} className="px-2 py-0.5 bg-[#EEF2FF] text-[#0F1E36] text-xs rounded-full">{s}</span>)}
                    </div>
                </div>
            )}

            {/* Education */}
            {data.education?.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-[#6B7280] mb-1.5 flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" />Education</p>
                    <div className="space-y-1">
                        {data.education.map((e, i) => (
                            <div key={i} className="text-[#4B5563]">{e.degree}{e.institution ? ` — ${e.institution}` : ''}{e.year ? ` (${e.year})` : ''}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* Experience */}
            {data.experience?.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-[#6B7280] mb-1.5 flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />Work Experience</p>
                    <div className="space-y-2">
                        {data.experience.map((e, i) => (
                            <div key={i} className="border-l-2 border-[#E2E6EC] pl-3">
                                <p className="font-medium text-[#1F2937] text-xs">{e.role}{e.company ? ` — ${e.company}` : ''}</p>
                                {e.duration && <p className="text-xs text-[#9CA3AF]">{e.duration}</p>}
                                {e.responsibilities && <p className="text-xs text-[#6B7280] mt-0.5">{e.responsibilities}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Certifications & Languages */}
            <div className="flex flex-wrap gap-6">
                {data.certifications?.length > 0 && (
                    <div>
                        <p className="text-xs font-medium text-[#6B7280] mb-1.5 flex items-center gap-1"><Award className="w-3.5 h-3.5" />Certifications</p>
                        <div className="space-y-0.5">{data.certifications.map((c, i) => <p key={i} className="text-xs text-[#4B5563]">• {c}</p>)}</div>
                    </div>
                )}
                {data.languages?.length > 0 && (
                    <div>
                        <p className="text-xs font-medium text-[#6B7280] mb-1.5 flex items-center gap-1"><Globe className="w-3.5 h-3.5" />Languages</p>
                        <div className="space-y-0.5">{data.languages.map((l, i) => <p key={i} className="text-xs text-[#4B5563]">• {l}</p>)}</div>
                    </div>
                )}
            </div>

            {fileUrl && (
                <a
                    href={fileUrl.replace(/^https?:\/\/[^/]+/, window.location.origin)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[#0F1E36] hover:underline border border-[#CBD5E1] px-3 py-1.5 rounded-lg"
                >
                    <ExternalLink className="w-3.5 h-3.5" />View Original File{fileName ? ` — ${fileName}` : ''}
                </a>
            )}
        </div>
    );
}

function CodeComparisonSection({ comparison }) {
    if (!comparison) return <p className="text-xs text-[#9CA3AF]">No comparison data available.</p>;

    const rows = [
        { label: 'Experience', required: comparison.required_experience, candidate: comparison.candidate_experience, met: comparison.experience_met },
        { label: 'Education', required: comparison.required_education, candidate: comparison.candidate_education, met: comparison.education_met },
        { label: 'Required Skills', required: comparison.required_skills_list?.join(', '), candidate: comparison.candidate_skills_matched?.join(', '), met: comparison.required_skills_met },
        { label: 'Preferred Skills', required: comparison.preferred_skills_list?.join(', '), candidate: comparison.candidate_preferred_matched?.join(', '), met: null },
        { label: 'Certifications', required: comparison.required_certifications, candidate: comparison.candidate_certifications?.join(', '), met: comparison.certifications_met },
        { label: 'Languages', required: comparison.required_languages, candidate: comparison.candidate_languages?.join(', '), met: comparison.languages_met },
        { label: 'Industry Experience', required: comparison.required_industry, candidate: comparison.candidate_industry, met: comparison.industry_met },
    ].filter(r => r.required || r.candidate);

    const metCount = rows.filter(r => r.met === true).length;
    const totalChecked = rows.filter(r => r.met !== null).length;

    return (
        <div className="space-y-3">
            {totalChecked > 0 && (
                <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-[#1F2937]">Requirements Met:</span>
                    <span className={`font-bold ${metCount === totalChecked ? 'text-green-700' : metCount >= totalChecked * 0.6 ? 'text-amber-700' : 'text-red-700'}`}>
                        {metCount}/{totalChecked}
                    </span>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-[#E2E6EC] bg-[#F4F6F9]">
                            <th className="text-left px-3 py-2 font-semibold text-[#6B7280] w-24">Criterion</th>
                            <th className="text-left px-3 py-2 font-semibold text-[#6B7280]">Required</th>
                            <th className="text-left px-3 py-2 font-semibold text-[#6B7280]">Candidate Has</th>
                            <th className="text-center px-3 py-2 font-semibold text-[#6B7280] w-16">Match</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i} className="border-b border-[#F4F6F9]">
                                <td className="px-3 py-2 font-medium text-[#4B5563]">{row.label}</td>
                                <td className="px-3 py-2 text-[#4B5563]">{row.required || '—'}</td>
                                <td className="px-3 py-2 text-[#4B5563]">{row.candidate || '—'}</td>
                                <td className="px-3 py-2 text-center">
                                    {row.met === true && <span className="text-green-600">✓</span>}
                                    {row.met === false && <span className="text-red-600">✗</span>}
                                    {row.met === null && <span className="text-[#9CA3AF]">–</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function ResumeScanResultView({ result, onNewScan }) {
    if (!result) return null;

    const config = RECOMMENDATION_CONFIG[result.recommendation] || RECOMMENDATION_CONFIG['Consider'];
    const RecommendIcon = config.icon;

    const extractedData = (() => {
        try { return result.extracted_data ? JSON.parse(result.extracted_data) : result.extractedData || null; }
        catch { return null; }
    })();

    const comparison = result.code_comparison || null;

    return (
        <div className="space-y-4">
            {/* Summary Header */}
            <div className="bg-white border border-[#E2E6EC] rounded-xl p-5 flex flex-col sm:flex-row items-center gap-5">
                <ScoreGauge score={result.score} />
                <div className="flex-1 text-center sm:text-left">
                    {result.applicant_name && result.applicant_name !== 'Unknown' && (
                        <p className="font-semibold text-[#1F2937] text-base mb-1">{result.applicant_name}</p>
                    )}
                    {/* Display candidate nationality prominently as requested by business logic */}
                    <div className="mb-2">
                        <span className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded text-sm font-semibold">
                            <Globe className="w-4 h-4 text-amber-700" />
                            Nationality: {result.nationality || extractedData?.nationality || 'Not Specified'}
                        </span>
                    </div>
                    {result.applicant_email && <p className="text-xs text-[#6B7280] mb-2">{result.applicant_email}</p>}
                    <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
                        <RecommendIcon className={`w-4 h-4 ${config.iconColor}`} />
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${config.color}`}>{result.recommendation}</span>
                        {result.experience_years > 0 && (
                            <span className="text-xs text-[#6B7280]">{result.experience_years} yrs experience</span>
                        )}
                    </div>
                    <p className="text-sm text-[#4B5563] leading-relaxed">{result.summary}</p>
                </div>
            </div>

            {/* Multi-template evaluation result — only present when the resume was scanned
                against multiple job position templates. matched_template_name is the template
                that produced the highest score across all per-template evaluations; the score
                gauge, recommendation, and detailed report shown above all reflect that winning
                template. This block is not rendered for single-template scans. */}
            {result.matched_template_name && (
                <div className="bg-white border border-[#E2E6EC] rounded-xl p-5 space-y-3">
                    {/* Prominent label: the position this resume matched best */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Matched Position</span>
                        <span className="px-3 py-1 bg-[#EEF2FF] border border-[#C7D2FE] rounded-full text-sm font-semibold text-[#4338CA]">
                            {result.matched_template_name}
                        </span>
                    </div>

                    {/* Per-template score comparison table. Each row is one evaluated position
                        template and the score this resume received against its criteria. The
                        row with the highest score is highlighted — that is the template selected
                        as matched_template_name (i.e. the best-fit position for this candidate). */}
                    {result.template_scores?.length > 0 && (() => {
                        const maxScore = Math.max(...result.template_scores.map(ts => ts.score));
                        return (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-[#E2E6EC] bg-[#F4F6F9]">
                                            <th className="text-left px-3 py-2 font-semibold text-[#6B7280]">Position</th>
                                            <th className="text-right px-3 py-2 font-semibold text-[#6B7280] w-20">Score</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.template_scores.map((ts, i) => {
                                            const isTop = ts.score === maxScore;
                                            const scoreColor = ts.score >= 75 ? 'text-green-600' : ts.score >= 50 ? 'text-amber-600' : 'text-red-600';
                                            return (
                                                <tr key={i} className={`border-b border-[#F4F6F9] ${isTop ? 'bg-[#EEF2FF]' : ''}`}>
                                                    <td className={`px-3 py-2 ${isTop ? 'font-semibold text-[#1F2937]' : 'text-[#4B5563]'}`}>
                                                        {ts.template_name}{isTop ? ' ★' : ''}
                                                    </td>
                                                    <td className={`px-3 py-2 text-right font-bold ${scoreColor}`}>{ts.score}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Section 1: Extracted Resume Data */}
            <Section title="📄 Extracted Resume Data" defaultOpen={true}>
                <ExtractedDataSection data={extractedData} fileUrl={result.file_url} fileName={result.file_name} />
            </Section>

            {/* Section 2: Requirements Comparison (Code-based) */}
            <Section title="📋 Requirements Comparison" defaultOpen={true}>
                <CodeComparisonSection comparison={comparison} />
            </Section>

            {/* Section 3: AI / ATS Report */}
            <Section title="🤖 AI Evaluation Report" defaultOpen={true}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {result.strengths?.length > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                <h4 className="text-xs font-semibold text-green-800 mb-2 flex items-center gap-1"><Star className="w-3.5 h-3.5" />Strengths</h4>
                                <ul className="space-y-1">
                                    {result.strengths.map((s, i) => (
                                        <li key={i} className="text-xs text-green-700 flex items-start gap-1"><ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />{s}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {result.concerns?.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <h4 className="text-xs font-semibold text-red-800 mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Concerns</h4>
                                <ul className="space-y-1">
                                    {result.concerns.map((c, i) => (
                                        <li key={i} className="text-xs text-red-700 flex items-start gap-1"><ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />{c}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs font-medium text-green-700 mb-2">✓ Matched Criteria</p>
                            <div className="flex flex-wrap gap-1.5">
                                {result.matched_skills?.length > 0
                                    ? result.matched_skills.map((s, i) => <span key={i} className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full border border-green-200">{s}</span>)
                                    : <span className="text-xs text-[#9CA3AF]">None identified</span>}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-medium text-red-600 mb-2">✗ Missing Criteria</p>
                            <div className="flex flex-wrap gap-1.5">
                                {result.missing_skills?.length > 0
                                    ? result.missing_skills.map((s, i) => <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full border border-red-200">{s}</span>)
                                    : <span className="text-xs text-[#9CA3AF]">No gaps identified</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </Section>

            <button onClick={onNewScan} className="w-full py-2.5 border border-[#CBD5E1] rounded-lg text-sm text-[#4B5563] hover:bg-[#F1F5F9] transition-colors">
                Scan Another Resume
            </button>
        </div>
    );
}