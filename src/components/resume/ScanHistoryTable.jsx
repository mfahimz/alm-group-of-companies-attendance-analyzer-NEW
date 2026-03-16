import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, X, Trash2, CheckSquare, Square, Filter, UserCheck, UserX, Globe, MapPin, Briefcase, Users } from 'lucide-react';
import ResumeScanResultView from './ResumeScanResult';
import { Button } from '@/components/ui/button';

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

    const extractedData = (() => {
        try { return scan.extracted_data ? JSON.parse(scan.extracted_data) : null; }
        catch { return null; }
    })();

    const codeComparison = (() => {
        try { return scan.code_comparison ? JSON.parse(scan.code_comparison) : null; }
        catch { return null; }
    })();

    const result = {
        ...scan,
        score: scan.ai_score || 0,
        recommendation: scan.ai_recommendation,
        summary: scan.ai_summary,
        // The View component now handles parsing for these
        ai_strengths: scan.ai_strengths,
        ai_concerns: scan.ai_concerns,
        matched_skills: scan.matched_skills,
        missing_skills: scan.missing_skills,
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

export default function ScanHistoryTable({ refreshKey, isAdmin }) {
    const [selectedScan, setSelectedScan] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [confirmDelete, setConfirmDelete] = useState(null); // 'single' | 'bulk'
    const [deletingId, setDeletingId] = useState(null);
    const [filters, setFilters] = useState({
        nationality: '',
        location: '',
        minExperience: '',
        gender: ''
    });
    const queryClient = useQueryClient();

    const { data: scans, isLoading } = useQuery({
        queryKey: ['resumeScans', refreshKey],
        queryFn: () => base44.entities.ResumeScanResult.list('-created_date', 100),
        staleTime: 0
    });

    const updateStatusMutation = useMutation({
        /**
         * Persists the manual evaluation status (Selected/Rejected) to the database.
         * This ensures the choice remains persistent across sessions.
         */
        mutationFn: async ({ id, status }) => {
            await base44.entities.ResumeScanResult.update(id, { evaluation_status: status });
        },
        onSuccess: () => {
            // Re-fetch scan history to sync the UI with the latest database state
            queryClient.invalidateQueries({ queryKey: ['resumeScans'] });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (ids) => {
            for (const id of ids) {
                await base44.entities.ResumeScanResult.delete(id);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['resumeScans'] });
            setSelectedIds(new Set());
            setConfirmDelete(null);
            setDeletingId(null);
        }
    });

    const toggleSelect = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === scans.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(scans.map(s => s.id)));
        }
    };

    const handleDeleteSingle = (e, id) => {
        e.stopPropagation();
        setDeletingId(id);
        setConfirmDelete('single');
    };

    const confirmAndDelete = () => {
        if (confirmDelete === 'single') {
            deleteMutation.mutate([deletingId]);
        } else {
            deleteMutation.mutate([...selectedIds]);
        }
    };

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

    const deletingCount = confirmDelete === 'bulk' ? selectedIds.size : 1;
    const deletingName = confirmDelete === 'single'
        ? scans.find(s => s.id === deletingId)?.applicant_name || 'this record'
        : `${selectedIds.size} selected records`;

    // Advanced filtering logic
    const filteredScans = (scans || []).filter(scan => {
        const nationality = (scan.nationality || '').toLowerCase();
        const location = (scan.location || '').toLowerCase();
        const gender = (scan.gender || '').toLowerCase();
        const experience = scan.years_experience || 0;

        // Nationality filter
        if (filters.nationality && !nationality.includes(filters.nationality.toLowerCase())) return false;
        
        // Location filter
        if (filters.location && !location.includes(filters.location.toLowerCase())) return false;
        
        // Gender filter
        if (filters.gender && filters.gender !== 'All' && gender !== filters.gender.toLowerCase()) return false;
        
        // Years of Experience filter (minimum)
        if (filters.minExperience && experience < parseInt(filters.minExperience)) return false;

        return true;
    });

    /**
     * Unique values for dropdowns are derived from the current dataset
     * to ensure the filter options are always relevant.
     */
    const uniqueNationalities = Array.from(new Set(scans.map(s => s.nationality).filter(Boolean))).sort();

    return (
        <div className="flex flex-col h-full">
            {selectedScan && <ScanDetailDialog scan={selectedScan} onClose={() => setSelectedScan(null)} />}

            {/* Filter Bar */}
            <div className="bg-[#F9FAFB] border-b border-[#E2E6EC] px-6 py-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-[#4B5563]">
                    <Filter className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Filters</span>
                </div>

                <div className="flex flex-wrap gap-4 flex-1">
                    {/* Nationality Filter */}
                    <div className="relative min-w-[160px]">
                        <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <select
                            value={filters.nationality}
                            onChange={(e) => setFilters(f => ({ ...f, nationality: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E6EC] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F1E36] appearance-none"
                        >
                            <option value="">Nationality (All)</option>
                            {uniqueNationalities.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>

                    {/* Location Filter */}
                    <div className="relative min-w-[160px]">
                        <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                            type="text"
                            placeholder="Current Location..."
                            value={filters.location}
                            onChange={(e) => setFilters(f => ({ ...f, location: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E6EC] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F1E36]"
                        />
                    </div>

                    {/* Experience Filter */}
                    <div className="relative min-w-[140px]">
                        <Briefcase className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                            type="number"
                            placeholder="Min Exp Yrs"
                            value={filters.minExperience}
                            onChange={(e) => setFilters(f => ({ ...f, minExperience: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E6EC] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F1E36]"
                        />
                    </div>

                    {/* Gender Filter */}
                    <div className="relative min-w-[130px]">
                        <Users className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                        <select
                            value={filters.gender}
                            onChange={(e) => setFilters(f => ({ ...f, gender: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E6EC] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0F1E36] appearance-none"
                        >
                            <option value="All">Gender (All)</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setFilters({ nationality: '', location: '', minExperience: '', gender: 'All' })}
                        className="text-xs text-[#6B7280] hover:text-[#1F2937] px-2 transition-colors"
                    >
                        Reset
                    </button>
                </div>

                <div className="text-[10px] text-[#9CA3AF] font-medium">
                    Showing {filteredScans.length} of {scans.length} candidates
                </div>
            </div>

            {/* Confirm Delete Dialog */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
                        <h3 className="text-base font-semibold text-[#1F2937] mb-2">Delete Scan{deletingCount > 1 ? 's' : ''}?</h3>
                        <p className="text-sm text-[#6B7280] mb-5">
                            Are you sure you want to delete <span className="font-medium text-[#1F2937]">{deletingName}</span>? This cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => { setConfirmDelete(null); setDeletingId(null); }}
                                className="px-4 py-2 text-sm rounded-lg border border-[#E2E6EC] text-[#4B5563] hover:bg-[#F4F6F9]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmAndDelete}
                                disabled={deleteMutation.isPending}
                                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk action bar */}
            {isAdmin && selectedIds.size > 0 && (
                <div className="flex items-center gap-3 mb-3 px-2 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <span className="text-sm text-red-700 font-medium">{selectedIds.size} selected</span>
                    <button
                        onClick={() => setConfirmDelete('bulk')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Selected
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-xs text-red-500 hover:text-red-700">
                        Clear selection
                    </button>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-[#E2E6EC] bg-[#F4F6F9]">
                            {isAdmin && (
                                <th className="px-3 py-3 w-8">
                                    <button onClick={toggleSelectAll} className="text-[#6B7280] hover:text-[#1F2937]">
                                        {selectedIds.size === scans.length
                                            ? <CheckSquare className="w-4 h-4 text-[#0F1E36]" />
                                            : <Square className="w-4 h-4" />}
                                    </button>
                                </th>
                            )}
                            <th className="text-left px-6 py-4 font-semibold text-[#4B5563] text-xs">Applicant</th>
                            <th className="text-left px-6 py-4 font-semibold text-[#4B5563] text-xs">Nationality</th>
                            <th className="text-left px-6 py-4 font-semibold text-[#4B5563] text-xs">Location</th>
                            <th className="text-left px-6 py-4 font-semibold text-[#4B5563] text-xs">Position</th>
                            <th className="text-center px-6 py-4 font-semibold text-[#4B5563] text-xs">Score</th>
                            <th className="text-center px-6 py-4 font-semibold text-[#4B5563] text-xs">Exp</th>
                            <th className="text-left px-6 py-4 font-semibold text-[#4B5563] text-xs">Recommendation</th>
                            <th className="text-left px-6 py-4 font-semibold text-[#4B5563] text-xs whitespace-nowrap">Manual Evaluation</th>
                            <th className="text-left px-6 py-4 font-semibold text-[#4B5563] text-xs">Date</th>
                            {isAdmin && <th className="px-3 py-4 w-10"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredScans.map((scan, idx) => (
                            <tr
                                key={scan.id}
                                onClick={() => setSelectedScan(scan)}
                                className={`border-b border-[#E2E6EC] cursor-pointer hover:bg-[#EEF2FF] transition-colors ${idx % 2 === 0 ? '' : 'bg-[#FAFBFD]'} ${selectedIds.has(scan.id) ? 'bg-blue-50' : ''}`}
                            >
                                {isAdmin && (
                                    <td className="px-3 py-3" onClick={(e) => toggleSelect(e, scan.id)}>
                                        {selectedIds.has(scan.id)
                                            ? <CheckSquare className="w-4 h-4 text-[#0F1E36]" />
                                            : <Square className="w-4 h-4 text-[#9CA3AF]" />}
                                    </td>
                                )}
                                <td className="px-6 py-4">
                                    <p className="font-semibold text-[#1F2937]">{scan.applicant_name || '—'}</p>
                                    {scan.applicant_email && <p className="text-xs text-[#9CA3AF]">{scan.applicant_email}</p>}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 w-fit">
                                        <Globe className="w-3 h-3 text-amber-700" />
                                        {scan.nationality || 'Not specified'}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1.5 text-[11px] text-[#4B5563] font-medium bg-gray-50 px-2 py-1 rounded border border-gray-100 w-fit">
                                        <MapPin className="w-3 h-3 text-[#9CA3AF]" />
                                        {scan.location || 'Unknown'}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-[#4B5563] font-semibold">{scan.position_applied || '—'}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`text-sm ${SCORE_COLOR(scan.ai_score)}`}>{scan.ai_score ?? '—'}</span>
                                </td>
                                <td className="px-6 py-4 text-center text-[#4B5563] font-medium">
                                    {scan.years_experience ?? '—'}y
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-tight uppercase w-fit ${RECOMMENDATION_COLORS[scan.ai_recommendation] || 'bg-gray-100 text-gray-700'}`}>
                                            {scan.ai_recommendation || '—'}
                                        </span>
                                        {scan.evaluation_status === 'Rejected' && (
                                            <span className="text-[9px] font-bold text-red-600 uppercase tracking-tighter animate-pulse ml-1">
                                                Knock-out Failure
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => updateStatusMutation.mutate({ id: scan.id, status: 'Selected' })}
                                            className={`px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider border ${
                                                scan.evaluation_status === 'Selected'
                                                    ? 'bg-green-600 border-green-600 text-white shadow-md'
                                                    : 'bg-white border-[#E2E6EC] text-[#6B7280] hover:border-green-500 hover:text-green-600 hover:bg-green-50'
                                            }`}
                                        >
                                            <UserCheck className="w-4 h-4" />
                                            {scan.evaluation_status === 'Selected' ? 'Selected' : 'Select'}
                                        </button>
                                        <button
                                            onClick={() => updateStatusMutation.mutate({ id: scan.id, status: 'Rejected' })}
                                            className={`px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-wider border ${
                                                scan.evaluation_status === 'Rejected'
                                                    ? 'bg-red-600 border-red-600 text-white shadow-md'
                                                    : 'bg-white border-[#E2E6EC] text-[#6B7280] hover:border-red-500 hover:text-red-600 hover:bg-red-50'
                                            }`}
                                        >
                                            <UserX className="w-4 h-4" />
                                            {scan.evaluation_status === 'Rejected' ? 'Rejected' : 'Reject'}
                                        </button>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-xs font-medium text-[#6B7280]">{scan.scanned_by?.split('@')[0] || '—'}</td>
                                <td className="px-6 py-4 text-xs font-medium text-[#6B7280] whitespace-nowrap">
                                    {scan.created_date ? new Date(scan.created_date).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                </td>
                                {isAdmin && (
                                    <td className="px-3 py-3" onClick={(e) => handleDeleteSingle(e, scan.id)}>
                                        <button className="p-1.5 text-[#9CA3AF] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}