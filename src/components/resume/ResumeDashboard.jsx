import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { 
    Briefcase, 
    Users, 
    ScanLine, 
    CheckCircle2, 
    Plus, 
    TrendingUp, 
    Building2,
    Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const COMPANY_NAMES = {
    MOTORS: 'Al Maraghi Motors',
    PARTS: 'Naser Mohsin Auto Parts'
};

const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-white border border-[#E2E6EC] rounded-xl p-5 shadow-sm flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
            <p className="text-2xl font-bold text-[#1F2937] leading-tight">{value}</p>
            <p className="text-sm text-[#6B7280] font-medium">{label}</p>
        </div>
    </div>
);

const CompanySubDashboard = ({ name, stats }) => (
    <div className="bg-[#FAFBFD] border border-[#E2E6EC] rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-[#E2E6EC]">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-[#1F2937]">{name}</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
                <p className="text-lg font-bold text-[#1F2937]">{stats.openPositions}</p>
                <p className="text-[10px] text-[#6B7280] uppercase font-bold tracking-wider">Open Positions</p>
            </div>
            <div className="space-y-1">
                <p className="text-lg font-bold text-[#1F2937]">{stats.talentPool}</p>
                <p className="text-[10px] text-[#6B7280] uppercase font-bold tracking-wider">Talent Pool</p>
            </div>
            <div className="space-y-1">
                <p className="text-lg font-bold text-[#1F2937]">{stats.totalScans}</p>
                <p className="text-[10px] text-[#6B7280] uppercase font-bold tracking-wider">Resumes Scanned</p>
            </div>
        </div>

        <div className="space-y-3">
            <p className="text-xs font-bold text-[#4B5563] uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" />
                Top Positions by Volume
            </p>
            <div className="space-y-2">
                {stats.topPositions.length > 0 ? stats.topPositions.map((pos, i) => (
                    <div key={i} className="flex items-center justify-between text-sm bg-white p-2.5 rounded-lg border border-[#E2E6EC]">
                        <span className="text-[#1F2937] font-medium truncate flex-1 mr-2">{pos.name}</span>
                        <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded text-xs">{pos.count}</span>
                    </div>
                )) : (
                    <p className="text-xs text-[#9CA3AF] italic">No scan data yet</p>
                )}
            </div>
        </div>
    </div>
);

export default function ResumeDashboard({ onNewScan }) {
    const { data: templates = [], isLoading: loadingTemplates } = useQuery({
        queryKey: ['jobTemplates'],
        queryFn: () => base44.entities.JobTemplate.list('-created_date', 1000)
    });

    const { data: scans = [], isLoading: loadingScans } = useQuery({
        queryKey: ['resumeScans'],
        queryFn: () => base44.entities.ResumeScanResult.list('-created_date', 5000)
    });

    if (loadingTemplates || loadingScans) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <p className="text-sm text-[#6B7280] font-medium">Crunching hiring data...</p>
            </div>
        );
    }

    // Processing logic
    const getStats = (companyKeyword) => {
        const filteredTemplates = templates.filter(t => 
            !companyKeyword || t.position_name?.toLowerCase().includes(companyKeyword.toLowerCase())
        );
        const filteredScans = scans.filter(s => 
            !companyKeyword || s.position_applied?.toLowerCase().includes(companyKeyword.toLowerCase())
        );
        const selectedScans = filteredScans.filter(s => s.evaluation_status === 'Selected');

        // Top positions calculation
        const positionCounts = filteredScans.reduce((acc, s) => {
            const pos = s.position_applied || 'Unknown';
            acc[pos] = (acc[pos] || 0) + 1;
            return acc;
        }, {});

        const topPositions = Object.entries(positionCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([name, count]) => ({ name, count }));

        return {
            openPositions: filteredTemplates.length,
            talentPool: selectedScans.length,
            totalScans: filteredScans.length,
            topPositions
        };
    };

    const globalStats = {
        openPositions: templates.length,
        talentPool: scans.filter(s => s.evaluation_status === 'Selected').length,
        totalScans: scans.length,
        totalSelected: scans.filter(s => s.evaluation_status === 'Selected').length
    };

    const motorsStats = getStats('Motors');
    const partsStats = getStats('Parts');

    return (
        <div className="space-y-8">
            {/* Header Actions */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-[#1F2937]">Hiring Dashboard</h2>
                    <p className="text-sm text-[#6B7280]">Recruitment overview across all companies</p>
                </div>
                <Button onClick={onNewScan} className="bg-indigo-600 hover:bg-indigo-700 h-10 px-6 gap-2">
                    <Plus className="w-4 h-4" />
                    New Resume Scan
                </Button>
            </div>

            {/* SECTION 1: GLOBAL SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    icon={Briefcase} 
                    label="Open Positions" 
                    value={globalStats.openPositions} 
                    color="bg-blue-600" 
                />
                <StatCard 
                    icon={Users} 
                    label="Talent Pool" 
                    value={globalStats.talentPool} 
                    color="bg-indigo-600" 
                />
                <StatCard 
                    icon={ScanLine} 
                    label="Resumes Scanned" 
                    value={globalStats.totalScans} 
                    color="bg-purple-600" 
                />
                <StatCard 
                    icon={CheckCircle2} 
                    label="Candidates Selected" 
                    value={globalStats.totalSelected} 
                    color="bg-green-600" 
                />
            </div>

            {/* SECTION 2: SUB-DASHBOARDS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CompanySubDashboard 
                    name={COMPANY_NAMES.MOTORS} 
                    stats={motorsStats} 
                />
                <CompanySubDashboard 
                    name={COMPANY_NAMES.PARTS} 
                    stats={partsStats} 
                />
            </div>
        </div>
    );
}
