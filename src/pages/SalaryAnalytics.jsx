import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Search, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight, Users, AlertTriangle, Banknote, ShieldAlert } from 'lucide-react';
import { useCompanyFilter } from '../components/context/CompanyContext';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ─── Helpers ───────────────────────────────────────────────────
const n = (v) => Number(v) || 0;

const formatAED = (val) => {
    const num = Number(val) || 0;
    return num.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─── Delta display (currency) ──────────────────────────────────
function Delta({ current, previous, invert = false, isCurrency = true }) {
    if (previous === null || previous === undefined) return <span className="text-xs text-slate-400">—</span>;
    const diff = current - previous;
    if (Math.abs(diff) < 0.01) return <span className="inline-flex items-center gap-0.5 text-xs text-slate-400"><Minus className="w-3 h-3" />0</span>;
    const isGood = invert ? diff < 0 : diff > 0;
    const color = isGood ? 'text-emerald-600' : 'text-red-600';
    const Icon = diff > 0 ? TrendingUp : TrendingDown;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
            <Icon className="w-3 h-3" />
            {diff > 0 ? '+' : ''}{isCurrency ? formatAED(diff) : diff.toFixed(1)}
        </span>
    );
}

// ─── Main Component ────────────────────────────────────────────
export default function SalaryAnalytics() {
    const { selectedCompany: companyFilter } = useCompanyFilter();

    const [selectedReportRunId, setSelectedReportRunId] = useState(null);
    const [expandedEmployeeId, setExpandedEmployeeId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // ── 1. Projects for selected company ───────────────────────
    const { data: projects = [] } = useQuery({
        queryKey: ['salAnalyticsProjects', companyFilter],
        queryFn: async () => {
            if (companyFilter) {
                return base44.entities.Project.filter({ company: companyFilter });
            }
            return base44.entities.Project.list();
        },
        staleTime: 5 * 60 * 1000
    });

    const projectIds = useMemo(() => projects.map(p => p.id), [projects]);

    // ── 2. All finalized reports across those projects ──────────
    const { data: allFinalizedReports = [], isLoading: loadingReports } = useQuery({
        queryKey: ['salAnalyticsFinalizedReports', projectIds],
        queryFn: async () => {
            if (projectIds.length === 0) return [];
            const batches = await Promise.all(
                projectIds.map(pid =>
                    base44.entities.ReportRun.filter({ project_id: pid, is_final: true })
                )
            );
            const flat = batches.flat();
            flat.sort((a, b) => (b.date_to || '').localeCompare(a.date_to || ''));
            return flat;
        },
        enabled: projectIds.length > 0,
        staleTime: 5 * 60 * 1000
    });

    // Auto-select latest report
    React.useEffect(() => {
        if (allFinalizedReports.length > 0 && !selectedReportRunId) {
            setSelectedReportRunId(allFinalizedReports[0].id);
        }
    }, [allFinalizedReports, selectedReportRunId]);

    // Reset on company change
    React.useEffect(() => {
        setSelectedReportRunId(null);
        setExpandedEmployeeId(null);
        setSearchQuery('');
    }, [companyFilter]);

    // ── Derive selected & previous report ───────────────────────
    const selectedReport = useMemo(
        () => allFinalizedReports.find(r => r.id === selectedReportRunId) || null,
        [allFinalizedReports, selectedReportRunId]
    );

    const previousReportRunId = useMemo(() => {
        if (!selectedReportRunId || allFinalizedReports.length < 2) return null;
        const idx = allFinalizedReports.findIndex(r => r.id === selectedReportRunId);
        if (idx < 0 || idx >= allFinalizedReports.length - 1) return null;
        return allFinalizedReports[idx + 1].id;
    }, [allFinalizedReports, selectedReportRunId]);

    const previousReport = useMemo(
        () => allFinalizedReports.find(r => r.id === previousReportRunId) || null,
        [allFinalizedReports, previousReportRunId]
    );

    // ── 3. Current SalarySnapshot ──────────────────────────────
    const { data: currentSnapshots = [], isLoading: loadingCurrent } = useQuery({
        queryKey: ['salAnalyticsCurrentSnaps', selectedReportRunId],
        queryFn: () => base44.entities.SalarySnapshot.filter({ report_run_id: selectedReportRunId }),
        enabled: !!selectedReportRunId,
        staleTime: 5 * 60 * 1000
    });

    // ── 4. Previous SalarySnapshot ─────────────────────────────
    const { data: previousSnapshots = [] } = useQuery({
        queryKey: ['salAnalyticsPrevSnaps', previousReportRunId],
        queryFn: () => base44.entities.SalarySnapshot.filter({ report_run_id: previousReportRunId }),
        enabled: !!previousReportRunId,
        staleTime: 5 * 60 * 1000
    });

    // Build previous lookup (by attendance_id, fallback hrms_id)
    const prevMap = useMemo(() => {
        const map = {};
        previousSnapshots.forEach(s => {
            if (s.attendance_id) map['att_' + String(s.attendance_id)] = s;
            if (s.hrms_id) map['hrms_' + String(s.hrms_id)] = s;
        });
        return map;
    }, [previousSnapshots]);

    const getPrev = (snap) => {
        return prevMap['att_' + String(snap.attendance_id)] || prevMap['hrms_' + String(snap.hrms_id)] || null;
    };

    // ── 5. Employees ────────────────────────────────────────────
    const { data: employees = [] } = useQuery({
        queryKey: ['salAnalyticsEmployees', companyFilter],
        queryFn: async () => {
            if (companyFilter) {
                return base44.entities.Employee.filter({ company: companyFilter, active: true });
            }
            return base44.entities.Employee.filter({ active: true });
        },
        staleTime: 5 * 60 * 1000
    });

    const employeeMap = useMemo(() => {
        const map = {};
        employees.forEach(e => {
            if (e.attendance_id) map['att_' + String(e.attendance_id)] = e.name || `Employee ${e.attendance_id}`;
            if (e.hrms_id) map['hrms_' + String(e.hrms_id)] = e.name || `Employee ${e.hrms_id}`;
        });
        return map;
    }, [employees]);

    const getName = (snap) => {
        return snap.name || employeeMap['att_' + String(snap.attendance_id)] || employeeMap['hrms_' + String(snap.hrms_id)] || `Employee ${snap.attendance_id || snap.hrms_id}`;
    };

    // ── 6. Trend data (up to 6 previous reports for expanded row) ──
    const trendReportIds = useMemo(() => {
        if (!selectedReportRunId) return [];
        const idx = allFinalizedReports.findIndex(r => r.id === selectedReportRunId);
        if (idx < 0) return [];
        return allFinalizedReports.slice(idx, idx + 7).map(r => r.id);
    }, [allFinalizedReports, selectedReportRunId]);

    const { data: trendData = [] } = useQuery({
        queryKey: ['salAnalyticsTrend', expandedEmployeeId, trendReportIds],
        queryFn: async () => {
            if (!expandedEmployeeId || trendReportIds.length === 0) return [];
            const batches = await Promise.all(
                trendReportIds.map(async (rId) => {
                    const snaps = await base44.entities.SalarySnapshot.filter({ report_run_id: rId });
                    const match = snaps.find(s =>
                        String(s.attendance_id) === String(expandedEmployeeId) ||
                        String(s.hrms_id) === String(expandedEmployeeId)
                    );
                    const report = allFinalizedReports.find(rep => rep.id === rId);
                    if (!match) return null;
                    return {
                        ...match,
                        _label: report?.date_from ? formatInUAE(parseDateInUAE(report.date_from), 'MMM yyyy') : rId
                    };
                })
            );
            return batches.filter(Boolean).reverse(); // Chronological
        },
        enabled: !!expandedEmployeeId && trendReportIds.length > 0,
        staleTime: 5 * 60 * 1000
    });

    // ── KPI Calculations ────────────────────────────────────────
    const kpis = useMemo(() => {
        const count = currentSnapshots.length || 1;
        const avgNetPay = currentSnapshots.reduce((s, r) => s + n(r.wps_pay) + n(r.balance), 0) / count;
        const totalOT = currentSnapshots.reduce((s, r) => s + n(r.total_ot_salary), 0);
        const totalDed = currentSnapshots.reduce((s, r) => s + n(r.net_deduction), 0);
        const totalWPS = currentSnapshots.reduce((s, r) => s + n(r.wps_pay), 0);

        const prevCount = previousSnapshots.length || 1;
        const prevAvgNetPay = previousSnapshots.length > 0
            ? previousSnapshots.reduce((s, r) => s + n(r.wps_pay) + n(r.balance), 0) / prevCount : null;
        const prevTotalOT = previousSnapshots.length > 0
            ? previousSnapshots.reduce((s, r) => s + n(r.total_ot_salary), 0) : null;
        const prevTotalDed = previousSnapshots.length > 0
            ? previousSnapshots.reduce((s, r) => s + n(r.net_deduction), 0) : null;
        const prevTotalWPS = previousSnapshots.length > 0
            ? previousSnapshots.reduce((s, r) => s + n(r.wps_pay), 0) : null;

        return [
            { title: 'Avg Net Pay', value: avgNetPay, prev: prevAvgNetPay, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', invert: false },
            { title: 'Total OT Cost', value: totalOT, prev: prevTotalOT, icon: Banknote, color: 'text-blue-600', bg: 'bg-blue-50', invert: false },
            { title: 'Total Deductions', value: totalDed, prev: prevTotalDed, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', invert: true },
            { title: 'Total WPS Pay', value: totalWPS, prev: prevTotalWPS, icon: ShieldAlert, color: 'text-indigo-600', bg: 'bg-indigo-50', invert: false },
        ];
    }, [currentSnapshots, previousSnapshots]);

    // ── Filtered & sorted ───────────────────────────────────────
    const filteredSnapshots = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return currentSnapshots.filter(s => {
            if (!q) return true;
            const name = getName(s).toLowerCase();
            const attId = String(s.attendance_id || '').toLowerCase();
            const hrmsId = String(s.hrms_id || '').toLowerCase();
            return name.includes(q) || attId.includes(q) || hrmsId.includes(q);
        }).sort((a, b) => {
            const nameA = getName(a).toLowerCase();
            const nameB = getName(b).toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [currentSnapshots, searchQuery, employeeMap]);

    // ── Render ──────────────────────────────────────────────────
    const isLoading = loadingReports || loadingCurrent;

    return (
        <div className="space-y-6">
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-100 rounded-xl">
                        <DollarSign className="w-6 h-6 text-emerald-700" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Salary Analytics</h1>
                        <p className="text-sm text-slate-500">
                            {companyFilter || 'All Companies'} — Finalized salary analysis
                        </p>
                    </div>
                </div>

                {/* Report Selector */}
                <div className="w-full md:w-96">
                    <Select
                        value={selectedReportRunId || ''}
                        onValueChange={(val) => {
                            setSelectedReportRunId(val);
                            setExpandedEmployeeId(null);
                        }}
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a finalized report..." />
                        </SelectTrigger>
                        <SelectContent>
                            {allFinalizedReports.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                    {r.report_name || 'Report'} ({r.date_from} → {r.date_to})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Previous report indicator */}
            {previousReport && (
                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                    <TrendingDown className="w-3 h-3" />
                    Comparing against: <span className="font-medium text-slate-700">{previousReport.report_name || 'Previous Report'}</span>
                    <span className="text-slate-400">({previousReport.date_from} → {previousReport.date_to})</span>
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <div className="text-slate-500 text-sm animate-pulse">Loading salary analytics...</div>
                </div>
            )}

            {!isLoading && !selectedReportRunId && allFinalizedReports.length === 0 && (
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center">
                        <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-lg font-semibold text-slate-700 mb-2">No Finalized Reports</h2>
                        <p className="text-slate-500">No finalized reports found for {companyFilter || 'the selected company'}.</p>
                    </CardContent>
                </Card>
            )}

            {!isLoading && selectedReportRunId && (
                <>
                    {/* ── KPI Cards ──────────────────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {kpis.map((kpi, i) => (
                            <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{kpi.title}</p>
                                            <p className="text-2xl font-bold text-slate-900 mt-1">{formatAED(kpi.value)}</p>
                                            <div className="mt-1.5">
                                                <Delta current={kpi.value} previous={kpi.prev} invert={kpi.invert} />
                                            </div>
                                        </div>
                                        <div className={`p-2.5 rounded-xl ${kpi.bg}`}>
                                            <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* ── Employee Table ──────────────────────────── */}
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-3">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Users className="w-4 h-4 text-emerald-600" />
                                    Employee Salary Breakdown ({filteredSnapshots.length})
                                </CardTitle>
                                <div className="relative w-full md:w-72">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        placeholder="Search by name or ID..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="px-0 pb-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-white z-10">
                                        <TableRow>
                                            <TableHead className="w-8"></TableHead>
                                            <TableHead>Employee Name</TableHead>
                                            <TableHead>Att ID</TableHead>
                                            <TableHead className="text-right">Basic (AED)</TableHead>
                                            <TableHead className="text-right">Total Sal (AED)</TableHead>
                                            <TableHead className="text-right">Leave Pay (AED)</TableHead>
                                            <TableHead className="text-right">Net Ded (AED)</TableHead>
                                            <TableHead className="text-right">OT (AED)</TableHead>
                                            <TableHead className="text-right">Bonus (AED)</TableHead>
                                            <TableHead className="text-right">WPS Pay (AED)</TableHead>
                                            <TableHead className="text-right">Balance (AED)</TableHead>
                                            <TableHead>ML Risk</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredSnapshots.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={12} className="text-center py-10 text-slate-500">
                                                    {searchQuery ? 'No employees match your search.' : 'No salary snapshots for this report.'}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredSnapshots.map((snap) => {
                                                const attId = String(snap.attendance_id || snap.hrms_id || '');
                                                const isExpanded = expandedEmployeeId === attId;
                                                const prev = getPrev(snap);
                                                const name = getName(snap);

                                                // Net pay for ML
                                                const currentNetPay = n(snap.wps_pay) + n(snap.balance);
                                                const prevNetPay = prev ? n(prev.wps_pay) + n(prev.balance) : null;

                                                // ML Badges
                                                const badges = [];
                                                // Badge 1: Salary Discrepancy
                                                if (prev && prevNetPay > 0 && Math.abs(currentNetPay - prevNetPay) / prevNetPay > 0.20) {
                                                    badges.push({ label: 'Pay ±20%', color: 'bg-red-100 text-red-700 border-red-200' });
                                                }
                                                // Badge 2: High Deduction
                                                if (n(snap.total_salary) > 0 && n(snap.net_deduction) > n(snap.total_salary) * 0.30) {
                                                    badges.push({ label: 'High Ded', color: 'bg-amber-100 text-amber-700 border-amber-200' });
                                                }
                                                // Badge 3: OT Spike
                                                if (prev && n(snap.total_ot_salary) > 0 && n(snap.total_ot_salary) > n(prev.total_ot_salary) * 2) {
                                                    badges.push({ label: 'OT ↑↑', color: 'bg-blue-100 text-blue-700 border-blue-200' });
                                                }

                                                return (
                                                    <React.Fragment key={snap.id || attId}>
                                                        <TableRow
                                                            className={`cursor-pointer transition-colors ${isExpanded ? 'bg-emerald-50/60' : 'hover:bg-slate-50'}`}
                                                            onClick={() => setExpandedEmployeeId(isExpanded ? null : attId)}
                                                        >
                                                            <TableCell className="w-8 px-2">
                                                                {isExpanded
                                                                    ? <ChevronDown className="w-4 h-4 text-emerald-500" />
                                                                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                                            </TableCell>
                                                            <TableCell className="font-medium text-slate-900">{name}</TableCell>
                                                            <TableCell className="text-slate-600 font-mono text-sm">{attId}</TableCell>
                                                            <TableCell className="text-right">{formatAED(snap.basic_salary)}</TableCell>
                                                            <TableCell className="text-right font-medium">{formatAED(snap.total_salary)}</TableCell>
                                                            <TableCell className="text-right">{formatAED(snap.leave_pay)}</TableCell>
                                                            <TableCell className="text-right">
                                                                <span className={n(snap.net_deduction) > 0 ? 'text-red-600 font-medium' : ''}>
                                                                    {formatAED(snap.net_deduction)}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <span className={n(snap.total_ot_salary) > 0 ? 'text-blue-600 font-medium' : ''}>
                                                                    {formatAED(snap.total_ot_salary)}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right">{formatAED(snap.bonus)}</TableCell>
                                                            <TableCell className="text-right font-bold text-emerald-700">{formatAED(snap.wps_pay)}</TableCell>
                                                            <TableCell className="text-right">
                                                                <span className={n(snap.balance) > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}>
                                                                    {formatAED(snap.balance)}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex gap-1 flex-wrap">
                                                                    {badges.map((b, idx) => (
                                                                        <span key={idx} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${b.color}`}>
                                                                            {b.label}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>

                                                        {/* ── Expanded Detail Panel ──────── */}
                                                        {isExpanded && (
                                                            <TableRow className="bg-emerald-50/40">
                                                                <TableCell colSpan={12} className="p-0">
                                                                    <div className="px-6 py-5 space-y-5 border-l-4 border-emerald-300">
                                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                                                            {/* Comparison Table */}
                                                                            <div>
                                                                                <h4 className="text-sm font-semibold text-slate-700 mb-3">
                                                                                    Salary Comparison
                                                                                </h4>
                                                                                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                                                                    <table className="w-full text-sm">
                                                                                        <thead>
                                                                                            <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                                                                                                <th className="text-left px-3 py-2 font-medium">Field</th>
                                                                                                <th className="text-right px-3 py-2 font-medium">Current (AED)</th>
                                                                                                <th className="text-right px-3 py-2 font-medium">Previous (AED)</th>
                                                                                                <th className="text-right px-3 py-2 font-medium">Change</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {[
                                                                                                { label: 'Basic Salary', key: 'basic_salary', inv: false },
                                                                                                { label: 'Allowances', key: 'allowances', inv: false },
                                                                                                { label: 'Total Salary', key: 'total_salary', inv: false },
                                                                                                { label: 'Leave Pay', key: 'leave_pay', inv: true },
                                                                                                { label: 'Salary Leave Amt', key: 'salary_leave_amount', inv: false },
                                                                                                { label: 'Net Deduction', key: 'net_deduction', inv: true },
                                                                                                { label: 'Ded Hours Pay', key: 'deductible_hours_pay', inv: true },
                                                                                                { label: 'Normal OT', key: 'normal_ot_salary', inv: false },
                                                                                                { label: 'Special OT', key: 'special_ot_salary', inv: false },
                                                                                                { label: 'Total OT', key: 'total_ot_salary', inv: false },
                                                                                                { label: 'Bonus', key: 'bonus', inv: false },
                                                                                                { label: 'Incentive', key: 'incentive', inv: false },
                                                                                                { label: 'WPS Pay', key: 'wps_pay', inv: false },
                                                                                                { label: 'Balance', key: 'balance', inv: false },
                                                                                            ].map((m, mi) => (
                                                                                                <tr key={m.key} className={mi % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                                                                    <td className="px-3 py-1.5 text-slate-700">{m.label}</td>
                                                                                                    <td className="px-3 py-1.5 text-right font-medium">{formatAED(snap[m.key])}</td>
                                                                                                    <td className="px-3 py-1.5 text-right text-slate-500">
                                                                                                        {prev ? formatAED(prev[m.key]) : '—'}
                                                                                                    </td>
                                                                                                    <td className="px-3 py-1.5 text-right">
                                                                                                        <Delta
                                                                                                            current={n(snap[m.key])}
                                                                                                            previous={prev ? n(prev[m.key]) : null}
                                                                                                            invert={m.inv}
                                                                                                        />
                                                                                                    </td>
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            </div>

                                                                            {/* Trend Chart */}
                                                                            <div>
                                                                                <h4 className="text-sm font-semibold text-slate-700 mb-3">
                                                                                    6-Month Salary Trend
                                                                                </h4>
                                                                                <div className="bg-white rounded-lg border border-slate-200 p-4">
                                                                                    {trendData.length >= 2 ? (
                                                                                        <ResponsiveContainer width="100%" height={200}>
                                                                                            <LineChart data={trendData}>
                                                                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                                                                <XAxis
                                                                                                    dataKey="_label"
                                                                                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                                                                    axisLine={{ stroke: '#e2e8f0' }}
                                                                                                />
                                                                                                <YAxis
                                                                                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                                                                    axisLine={{ stroke: '#e2e8f0' }}
                                                                                                    width={50}
                                                                                                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                                                                                                />
                                                                                                <Tooltip
                                                                                                    formatter={(value) => [formatAED(value), undefined]}
                                                                                                    contentStyle={{
                                                                                                        fontSize: 12,
                                                                                                        borderRadius: 8,
                                                                                                        border: '1px solid #e2e8f0',
                                                                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                                                                                    }}
                                                                                                />
                                                                                                <Legend
                                                                                                    wrapperStyle={{ fontSize: 11 }}
                                                                                                    iconSize={10}
                                                                                                />
                                                                                                <Line
                                                                                                    type="monotone"
                                                                                                    dataKey="total_salary"
                                                                                                    stroke="#3b82f6"
                                                                                                    strokeWidth={2}
                                                                                                    dot={{ r: 3, fill: '#3b82f6' }}
                                                                                                    activeDot={{ r: 5 }}
                                                                                                    name="Total Salary"
                                                                                                />
                                                                                                <Line
                                                                                                    type="monotone"
                                                                                                    dataKey="net_deduction"
                                                                                                    stroke="#ef4444"
                                                                                                    strokeWidth={2}
                                                                                                    dot={{ r: 3, fill: '#ef4444' }}
                                                                                                    activeDot={{ r: 5 }}
                                                                                                    name="Net Deduction"
                                                                                                />
                                                                                                <Line
                                                                                                    type="monotone"
                                                                                                    dataKey="wps_pay"
                                                                                                    stroke="#10b981"
                                                                                                    strokeWidth={2}
                                                                                                    dot={{ r: 3, fill: '#10b981' }}
                                                                                                    activeDot={{ r: 5 }}
                                                                                                    name="WPS Pay"
                                                                                                />
                                                                                            </LineChart>
                                                                                        </ResponsiveContainer>
                                                                                    ) : trendData.length === 1 ? (
                                                                                        <div className="flex items-center justify-center h-[200px] text-sm text-slate-400">
                                                                                            Only 1 data point — need at least 2 for trend
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="flex items-center justify-center h-[200px] text-sm text-slate-400 animate-pulse">
                                                                                            Loading trend data...
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
