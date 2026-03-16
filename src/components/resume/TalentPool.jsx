import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
    Search, 
    Filter, 
    RefreshCcw, 
    Download, 
    Briefcase, 
    MapPin, 
    User, 
    Clock, 
    CheckCircle2, 
    XCircle,
    MoreHorizontal,
    FileText,
    Loader2,
    Building2,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    ArrowLeft
} from 'lucide-react';
import ResumeScanResultView from './ResumeScanResult';
import { toast } from 'sonner';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';

export default function TalentPool() {
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [expandedRoles, setExpandedRoles] = useState(new Set());
    const [reMatchingJob, setReMatchingJob] = useState(null);
    const [showReMatchList, setShowReMatchList] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        nationality: 'All',
        gender: 'All',
        location: '',
        minExp: ''
    });

    // Data fetching
    const { data: candidates = [], isLoading } = useQuery({
        queryKey: ['talentPool'],
        queryFn: () => base44.entities.ResumeScanResult.list('-created_date', 1000)
    });

    const { data: jobTemplates = [] } = useQuery({
        queryKey: ['jobTemplates'],
        queryFn: () => base44.entities.JobTemplate.list('-created_date', 100)
    });

    // Mutations
    const statusMutation = useMutation({
        mutationFn: ({ ids, status }) => Promise.all(ids.map(id => base44.entities.ResumeScanResult.update(id, { evaluation_status: status }))),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['talentPool'] });
            setSelectedIds([]);
            toast.success('Status updated for selected candidates');
        }
    });

    const reMatchMutation = useMutation({
        mutationFn: async ({ candidate, template }) => {
            const response = await fetch('/api/scanResume', {
                method: 'POST',
                body: JSON.stringify({
                    mode: 'evaluation_only',
                    existingData: JSON.parse(candidate.extracted_data),
                    existingFileUrl: candidate.file_url,
                    fileName: candidate.file_name,
                    criteria: template
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Matching failed');
            }
            return response.json();
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['talentPool'] });
            toast.success('Candidate re-evaluated successfully');
        },
        onError: (e) => toast.error('Re-match failed: ' + e.message)
    });

    // Filtering logic
    const filteredCandidates = useMemo(() => {
        return candidates.filter(c => {
            const matchesSearch = !search || 
                c.applicant_name?.toLowerCase().includes(search.toLowerCase()) ||
                c.position_applied?.toLowerCase().includes(search.toLowerCase()) ||
                c.applicant_email?.toLowerCase().includes(search.toLowerCase()) ||
                c.ai_summary?.toLowerCase().includes(search.toLowerCase());
            
            const matchesNat = filters.nationality === 'All' || c.nationality === filters.nationality;
            const matchesGen = filters.gender === 'All' || c.gender === filters.gender;
            const matchesLoc = !filters.location || c.location?.toLowerCase().includes(filters.location.toLowerCase());
            const matchesExp = !filters.minExp || (c.years_experience >= parseFloat(filters.minExp));

            return matchesSearch && matchesNat && matchesGen && matchesLoc && matchesExp;
        });
    }, [candidates, search, filters]);

    const handleSelectAll = (checked) => {
        if (checked) setSelectedIds(filteredCandidates.map(c => c.id));
        else setSelectedIds([]);
    };

    const handleSelectOne = (id, checked) => {
        if (checked) setSelectedIds(prev => [...prev, id]);
        else setSelectedIds(prev => prev.filter(i => i !== id));
    };

    const handleBulkStatus = (status) => {
        if (selectedIds.length === 0) return;
        statusMutation.mutate({ ids: selectedIds, status });
    };

    const handleExportShortlist = () => {
        if (selectedIds.length === 0) {
            toast.error('Select candidates to export');
            return;
        }
        const selectedData = filteredCandidates.filter(c => selectedIds.includes(c.id));
        
        // Simulating export logic (in a real app, this would generate PDF/Excel)
        const csvContent = "data:text/csv;charset=utf-8," 
            + "Name,Email,Nationality,Score,Experience,Recommendation\n"
            + selectedData.map(c => `"${c.applicant_name}","${c.applicant_email}","${c.nationality}",${c.ai_score},${c.years_experience},"${c.ai_recommendation}"`).join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "shortlist_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success(`Exported ${selectedData.length} candidates`);
    };

    const nationalities = useMemo(() => ['All', ...new Set(candidates.map(c => c.nationality).filter(Boolean))], [candidates]);

    // Grouping Logic
    const groupedData = useMemo(() => {
        const companies = {
            'Al Maraghi Motors': { keyword: 'Motors', roles: [] },
            'Naser Mohsin Auto Parts': { keyword: 'Parts', roles: [] }
        };

        const rolesList = jobTemplates.map(t => ({
            name: t.position_name,
            company: t.position_name?.includes('Motors') ? 'Al Maraghi Motors' : t.position_name?.includes('Parts') ? 'Naser Mohsin Auto Parts' : null
        })).filter(r => r.company);

        Object.keys(companies).forEach(companyName => {
            const companyKeyword = companies[companyName].keyword;
            const companyRoles = rolesList.filter(r => r.company === companyName);
            
            companies[companyName].roles = companyRoles.map(role => ({
                name: role.name,
                candidates: filteredCandidates.filter(c => 
                    c.matched_template_name === role.name && 
                    c.matched_template_name.includes(companyKeyword)
                )
            }));
        });

        return companies;
    }, [filteredCandidates, jobTemplates]);

    const toggleRole = (roleName) => {
        setExpandedRoles(prev => {
            const next = new Set(prev);
            if (next.has(roleName)) next.delete(roleName);
            else next.add(roleName);
            return next;
        });
    };

    if (selectedCandidate) {
        // Prepare result object for View component
        const result = {
            ...selectedCandidate,
            score: selectedCandidate.ai_score || 0,
            recommendation: selectedCandidate.ai_recommendation,
            summary: selectedCandidate.ai_summary,
            ai_strengths: selectedCandidate.ai_strengths,
            ai_concerns: selectedCandidate.ai_concerns,
            matched_skills: selectedCandidate.matched_skills,
            missing_skills: selectedCandidate.missing_skills,
            experience_years: selectedCandidate.years_experience || 0,
        };

        return (
            <div className="space-y-4">
                <Button 
                    variant="ghost" 
                    onClick={() => setSelectedCandidate(null)}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Talent Pool
                </Button>
                <ResumeScanResultView result={result} onNewScan={() => setSelectedCandidate(null)} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-[#1F2937] flex items-center gap-2">
                        <User className="w-5 h-5 text-indigo-600" />
                        Global Talent Pool
                    </h2>
                    <p className="text-sm text-[#6B7280]">Browse and re-evaluate candidates across all scans.</p>
                </div>
                
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleExportShortlist}
                        disabled={selectedIds.length === 0}
                        className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                    >
                        <Download className="w-3.5 h-3.5 mr-1.5" />
                        Export Shortlist
                    </Button>
                    <div className="h-6 w-px bg-slate-200 mx-1" />
                    <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleBulkStatus('Selected')}
                        disabled={selectedIds.length === 0}
                        className="text-indigo-600 border-indigo-200 bg-indigo-50"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Bulk Select
                    </Button>
                    <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleBulkStatus('Rejected')}
                        disabled={selectedIds.length === 0}
                        className="text-red-600 border-red-200 bg-red-50"
                    >
                        <XCircle className="w-3.5 h-3.5 mr-1.5" />
                        Bulk Reject
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border border-[#E2E6EC] rounded-xl p-4 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="relative flex-1 min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input 
                            placeholder="Search by name, position, skill or AI summary..." 
                            className="pl-9 h-10 ring-offset-0 focus-visible:ring-indigo-500"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Filters:</span>
                    </div>

                    <div className="w-40">
                        <Select value={filters.nationality} onValueChange={v => setFilters(f => ({ ...f, nationality: v }))}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Nationality" />
                            </SelectTrigger>
                            <SelectContent>
                                {nationalities.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-32">
                        <Select value={filters.gender} onValueChange={v => setFilters(f => ({ ...f, gender: v }))}>
                            <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Gender" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="All">All Gender</SelectItem>
                                <SelectItem value="Male">Male</SelectItem>
                                <SelectItem value="Female">Female</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="w-40 relative">
                        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <Input 
                            placeholder="Location..." 
                            className="h-8 text-xs pl-8" 
                            value={filters.location}
                            onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}
                        />
                    </div>

                    <div className="w-32 relative">
                        <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <Input 
                            type="number"
                            placeholder="Min Exp..." 
                            className="h-8 text-xs pl-8" 
                            value={filters.minExp}
                            onChange={e => setFilters(f => ({ ...f, minExp: e.target.value }))}
                        />
                    </div>

                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 text-xs text-slate-500 hover:text-indigo-600"
                        onClick={() => {
                            setFilters({ nationality: 'All', gender: 'All', location: '', minExp: '' });
                            setSearch('');
                        }}
                    >
                        Reset
                    </Button>

                    <div className="ml-auto text-xs text-slate-500">
                        Showing <span className="font-bold text-slate-900">{filteredCandidates.length}</span> candidates
                    </div>
                </div>
            </div>

            {/* Candidates Grouped View */}
            <div className="space-y-8">
                {isLoading ? (
                    <div className="py-20 text-center bg-white border border-[#E2E6EC] rounded-xl">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
                        <p className="text-sm text-slate-500">Loading talent pool...</p>
                    </div>
                ) : Object.keys(groupedData).map(companyName => (
                    <div key={companyName} className="space-y-4">
                        <div className="flex items-center gap-3 pb-2 border-b border-[#E2E6EC]">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                <Building2 className="w-4 h-4 text-slate-600" />
                            </div>
                            <h3 className="text-lg font-bold text-[#1F2937]">{companyName}</h3>
                            <span className="text-xs font-medium text-slate-400">
                                {groupedData[companyName].roles.reduce((acc, r) => acc + r.candidates.length, 0)} total candidates
                            </span>
                        </div>

                        <div className="space-y-2">
                            {groupedData[companyName].roles.map(role => {
                                const isExpanded = expandedRoles.has(`${companyName}-${role.name}`);
                                return (
                                    <div key={role.name} className="border border-[#E2E6EC] rounded-xl overflow-hidden bg-white shadow-sm">
                                        {/* Role Header */}
                                        <div 
                                            onClick={() => toggleRole(`${companyName}-${role.name}`)}
                                            className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                                <div className="flex items-center gap-2">
                                                    <Briefcase className="w-4 h-4 text-indigo-500" />
                                                    <span className="font-semibold text-slate-900">{role.name}</span>
                                                </div>
                                                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold">
                                                    {role.candidates.length}
                                                </span>
                                            </div>
                                            
                                            {/* Bulk selection for role if needed could go here, but kept it simple helper */}
                                            {role.candidates.length > 0 && (
                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                    <Checkbox 
                                                        checked={role.candidates.every(c => selectedIds.includes(c.id))}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedIds(prev => [...new Set([...prev, ...role.candidates.map(c => c.id)])]);
                                                            } else {
                                                                const idsToRemove = new Set(role.candidates.map(c => c.id));
                                                                setSelectedIds(prev => prev.filter(id => !idsToRemove.has(id)));
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-[10px] text-slate-400 font-medium">Select All</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Role Candidates List */}
                                        {isExpanded && (
                                            <div className="px-5 pb-4 space-y-3">
                                                {role.candidates.length === 0 ? (
                                                    <div className="py-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                                        <p className="text-xs text-slate-500 italic">no candidates yet for this role</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {role.candidates.map(c => {
                                                            const isSelected = selectedIds.includes(c.id);
                                                            return (
                                                                <div 
                                                                    key={c.id} 
                                                                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${isSelected ? 'border-indigo-500 bg-indigo-50/30' : 'border-[#E2E6EC] bg-white hover:border-slate-300'}`}
                                                                >
                                                                    <Checkbox 
                                                                        checked={isSelected}
                                                                        onCheckedChange={(checked) => handleSelectOne(c.id, checked)}
                                                                    />
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                                            <h4 className="font-bold text-slate-900 truncate">{c.applicant_name}</h4>
                                                                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                                c.ai_score >= 70 ? 'bg-green-100 text-green-700' : 
                                                                                c.ai_score >= 40 ? 'bg-yellow-100 text-yellow-700' : 
                                                                                'bg-red-100 text-red-700'
                                                                            }`}>
                                                                                {c.ai_score}%
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                                                                <MapPin className="w-3 h-3" />
                                                                                {c.location || 'Unknown'}
                                                                            </div>
                                                                            <div className={`text-[10px] font-bold uppercase tracking-tight ${
                                                                                c.ai_recommendation === 'Highly Recommended' ? 'text-green-600' :
                                                                                c.ai_recommendation === 'Recommended' ? 'text-blue-600' :
                                                                                c.ai_recommendation === 'Consider' ? 'text-amber-600' : 'text-red-500'
                                                                            }`}>
                                                                                {c.ai_recommendation}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="sm" 
                                                                        onClick={() => setSelectedCandidate(c)}
                                                                        className="h-8 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 shrink-0"
                                                                    >
                                                                        <ExternalLink className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
