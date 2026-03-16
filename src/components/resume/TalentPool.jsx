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
    Loader2
} from 'lucide-react';
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

            {/* Candidates Table */}
            <div className="bg-white border border-[#E2E6EC] rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F8FAFC]/80 backdrop-blur-sm border-b border-[#E2E6EC]">
                        <tr>
                            <th className="px-5 py-4 w-10">
                                <Checkbox 
                                    checked={selectedIds.length > 0 && selectedIds.length === filteredCandidates.length}
                                    onCheckedChange={handleSelectAll}
                                />
                            </th>
                            <th className="px-5 py-4 text-xs font-bold text-[#4B5563] uppercase tracking-wider">Applicant</th>
                            <th className="px-5 py-4 text-xs font-bold text-[#4B5563] uppercase tracking-wider">Attributes</th>
                            <th className="px-5 py-4 text-xs font-bold text-[#4B5563] uppercase tracking-wider">Evaluation History</th>
                            <th className="px-5 py-4 text-xs font-bold text-[#4B5563] uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E6EC]">
                        {isLoading ? (
                            <tr>
                                <td colSpan="5" className="py-20 text-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
                                    <p className="text-sm text-slate-500">Loading talent pool...</p>
                                </td>
                            </tr>
                        ) : filteredCandidates.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="py-20 text-center">
                                    <div className="bg-slate-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                        <Search className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="text-sm text-slate-500">No candidates found matching your search</p>
                                </td>
                            </tr>
                        ) : (
                            filteredCandidates.map(c => {
                                const isSelected = selectedIds.includes(c.id);
                                return (
                                    <tr key={c.id} className={`hover:bg-[#F9FAFB] transition-colors ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                                        <td className="px-5 py-4">
                                            <Checkbox 
                                                checked={isSelected}
                                                onCheckedChange={(checked) => handleSelectOne(c.id, checked)}
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <div>
                                                <p className="font-semibold text-slate-900">{c.applicant_name}</p>
                                                <p className="text-xs text-slate-500">{c.applicant_email}</p>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <span className="text-[10px] b-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                                                        {c.position_applied}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2 text-xs">
                                                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                                    <span className="text-slate-600">{c.location}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                    <span className="text-slate-600 font-medium">{c.years_experience}y Exp</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${c.gender === 'Female' ? 'bg-pink-50 text-pink-600' : 'bg-blue-50 text-blue-600'}`}>
                                                        {c.gender} • {c.nationality}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                                        c.ai_score >= 70 ? 'bg-green-100 text-green-700' : 
                                                        c.ai_score >= 40 ? 'bg-yellow-100 text-yellow-700' : 
                                                        'bg-red-100 text-red-700'
                                                    }`}>
                                                        {c.ai_score}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-semibold text-slate-800">{c.ai_recommendation}</span>
                                                        <span className="text-[10px] text-slate-400">Last scanned for {new Date(c.created_date).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                {c.evaluation_status && (
                                                    <div className={`text-[10px] w-fit px-2 py-0.5 rounded-full font-bold uppercase ${
                                                        c.evaluation_status === 'Selected' ? 'bg-indigo-600 text-white' :
                                                        c.evaluation_status === 'Rejected' ? 'bg-red-500 text-white' :
                                                        'bg-slate-100 text-slate-500'
                                                    }`}>
                                                        {c.evaluation_status}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="outline" size="sm" className="h-8 gap-1.5">
                                                            <RefreshCcw className="w-3.5 h-3.5" />
                                                            Re-Match
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56 max-h-[300px] overflow-y-auto">
                                                        <div className="px-2 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider border-b mb-1">
                                                            Select Target Template
                                                        </div>
                                                        {jobTemplates.map(jt => (
                                                            <DropdownMenuItem 
                                                                key={jt.id} 
                                                                onClick={() => reMatchMutation.mutate({ candidate: c, template: jt })}
                                                                className="text-xs py-2"
                                                            >
                                                                {jt.position_name}
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => window.open(c.file_url)}>
                                                            <FileText className="w-3.5 h-3.5 mr-2" />
                                                            View Original Resume
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleSelectOne(c.id, true)} className="text-indigo-600">
                                                            <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                                                            Shortlist
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => statusMutation.mutate({ ids: [c.id], status: 'Rejected' })} className="text-red-600">
                                                            <XCircle className="w-3.5 h-3.5 mr-2" />
                                                            Reject
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
