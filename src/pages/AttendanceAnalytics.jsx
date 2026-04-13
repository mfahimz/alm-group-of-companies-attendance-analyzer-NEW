import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Search, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight, Users, AlertTriangle, Clock, CalendarOff } from 'lucide-react';
import { useCompanyFilter } from '../components/context/CompanyContext';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// ─── Helper: safe number ───────────────────────────────────────
const n = (v) => Number(v) || 0;

// ─── Helper: delta display ─────────────────────────────────────
function Delta({ current, previous, invert = false }) {
    if (previous === null || previous === undefined) return <span className="text-xs text-slate-400">—</span>;
    const diff = current - previous;
    if (diff === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-slate-400"><Minus className="w-3 h-3" />0</span>;
    // invert: higher = bad (like LOP, late min), lower = good
    const isGood = invert ? diff < 0 : diff > 0;
    const color = isGood ? 'text-emerald-600' : 'text-red-600';
    const Icon = diff > 0 ? TrendingUp : TrendingDown;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
            <Icon className="w-3 h-3" />
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
        </span>
    );
}

// ─── Main Component ────────────────────────────────────────────
export default function AttendanceAnalytics() {
    const { selectedCompany: companyFilter } = useCompanyFilter();

    const [selectedReportRunId, setSelectedReportRunId] = useState(null);
    const [expandedEmployeeId, setExpandedEmployeeId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // ── 1. Projects for selected company ───────────────────────
    const { data: projects = [] } = useQuery({
        queryKey: ['analyticsProjects', companyFilter],
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
        queryKey: ['analyticsFinalizedReports', projectIds],
        queryFn: async () => {
            if (projectIds.length === 0) return [];
            const batches = await Promise.all(
                projectIds.map(pid =>
                    base44.entities.ReportRun.filter({ project_id: pid, is_final: true })
                )
            );
            const flat = batches.flat();
            // Sort by date_to descending
            flat.sort((a, b) => {
                const da = a.date_to || '';
                const db = b.date_to || '';
                return db.localeCompare(da);
            });
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

    // Reset selection when company changes
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

    // ── 3. Current AnalysisResult ───────────────────────────────
    const { data: currentResults = [], isLoading: loadingCurrent } = useQuery({
        queryKey: ['analyticsCurrentResults', selectedReportRunId],
        queryFn: () => base44.entities.AnalysisResult.filter({ report_run_id: selectedReportRunId }, null, 500),
        enabled: !!selectedReportRunId,
        staleTime: 5 * 60 * 1000
    });

    // ── 4. Previous AnalysisResult ──────────────────────────────
    const { data: previousResults = [] } = useQuery({
        queryKey: ['analyticsPreviousResults', previousReportRunId],
        queryFn: () => base44.entities.AnalysisResult.filter({ report_run_id: previousReportRunId }, null, 500),
        enabled: !!previousReportRunId,
        staleTime: 5 * 60 * 1000
    });

    // Build previous lookup
    const prevMap = useMemo(() => {
        const map = {};
        previousResults.forEach(r => { map[String(r.attendance_id)] = r; });
        return map;
    }, [previousResults]);

    // ── 5. Employees ────────────────────────────────────────────
    const { data: employees = [] } = useQuery({
        queryKey: ['analyticsEmployees', companyFilter],
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
            map[String(e.attendance_id)] = e.name || `Employee ${e.attendance_id}`;
        });
        return map;
    }, [employees]);

    // ── 6. Trend data (up to 4 previous reports for expanded row) ──
    const trendReportIds = useMemo(() => {
        if (!selectedReportRunId) return [];
        const idx = allFinalizedReports.findIndex(r => r.id === selectedReportRunId);
        if (idx < 0) return [];
        // Grab up to 4 PREVIOUS reports (indices idx+1 .. idx+4)
        return allFinalizedReports
            .slice(idx, idx + 5)
            .map(r => r.id);
    }, [allFinalizedReports, selectedReportRunId]);

    const { data: trendData = [] } = useQuery({
        queryKey: ['analyticsTrend', expandedEmployeeId, trendReportIds],
        queryFn: async () => {
            if (!expandedEmployeeId || trendReportIds.length === 0) return [];
            // Fetch AnalysisResult for each report
            const batches = await Promise.all(
                trendReportIds.map(async (rId) => {
                    const results = await base44.entities.AnalysisResult.filter({ report_run_id: rId }, null, 500);
                    const match = results.find(r => String(r.attendance_id) === String(expandedEmployeeId));
                    const report = allFinalizedReports.find(rep => rep.id === rId);
                    return match ? { ...match, _reportLabel: report?.date_from ? formatInUAE(parseDateInUAE(report.date_from), 'MMM yyyy') : rId } : null;
                })
            );
            return batches.filter(Boolean).reverse(); // Chronological order
        },
        enabled: !!expandedEmployeeId && trendReportIds.length > 0,
        staleTime: 5 * 60 * 1000
    });

    // ── KPI Calculations ────────────────────────────────────────
    const kpis = useMemo(() => {
        const count = currentResults.length || 1;
        const avgPresent = currentResults.reduce((s, r) => s + n(r.present_days), 0) / count;
        const totalLOP = currentResults.reduce((s, r) => s + n(r.full_absence_count), 0);
        const totalSick = currentResults.reduce((s, r) => s + n(r.sick_leave_count), 0);
        const totalLate = currentResults.reduce((s, r) => s + n(r.late_minutes), 0);

        const prevCount = previousResults.length || 1;
        const prevAvgPresent = previousResults.length > 0
            ? previousResults.reduce((s, r) => s + n(r.present_days), 0) / prevCount : null;
        const prevTotalLOP = previousResults.length > 0
            ? previousResults.reduce((s, r) => s + n(r.full_absence_count), 0) : null;
        const prevTotalSick = previousResults.length > 0
            ? previousResults.reduce((s, r) => s + n(r.sick_leave_count), 0) : null;
        const prevTotalLate = previousResults.length > 0
            ? previousResults.reduce((s, r) => s + n(r.late_minutes), 0) : null;

        return [
            { title: 'Avg Present Days', value: avgPresent.toFixed(1), prev: prevAvgPresent, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', invert: false },
            { title: 'Total LOP Days', value: totalLOP, prev: prevTotalLOP, icon: CalendarOff, color: 'text-red-600', bg: 'bg-red-50', invert: true },
            { title: 'Total Sick Leave', value: totalSick, prev: prevTotalSick, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', invert: true },
            { title: 'Total Late Minutes', value: totalLate, prev: prevTotalLate, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', invert: true },
        ];
    }, [currentResults, previousResults]);

    // ── ML risk helpers ─────────────────────────────────────────
    const avgLateAll = useMemo(() => {
        if (currentResults.length === 0) return 0;
        return currentResults.reduce((s, r) => s + n(r.late_minutes), 0) / currentResults.length;
    }, [currentResults]);

    // ── Filtered & sorted rows ──────────────────────────────────
    const filteredResults = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return currentResults.filter(r => {
            if (!q) return true;
            const name = (employeeMap[String(r.attendance_id)] || '').toLowerCase();
            const id = String(r.attendance_id).toLowerCase();
            return name.includes(q) || id.includes(q);
        }).sort((a, b) => {
            const nameA = (employeeMap[String(a.attendance_id)] || '').toLowerCase();
            const nameB = (employeeMap[String(b.attendance_id)] || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [currentResults, searchQuery, employeeMap]);

    // ── Render ──────────────────────────────────────────────────
    const isLoading = loadingReports || loadingCurrent;

    return (
        <div className="space-y-6">
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-100 rounded-xl">
                        <BarChart3 className="w-6 h-6 text-indigo-700" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Attendance Analytics</h1>
                        <p className="text-sm text-slate-500">
                            {companyFilter || 'All Companies'} — Finalized report analysis
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
                    <div className="text-slate-500 text-sm animate-pulse">Loading analytics...</div>
                </div>
            )}

            {!isLoading && !selectedReportRunId && allFinalizedReports.length === 0 && (
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center">
                        <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
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
                                            <p className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</p>
                                            <div className="mt-1.5">
                                                <Delta
                                                    current={typeof kpi.value === 'string' ? parseFloat(kpi.value) : kpi.value}
                                                    previous={kpi.prev}
                                                    invert={kpi.invert}
                                                />
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
                                    <Users className="w-4 h-4 text-indigo-600" />
                                    Employee Breakdown ({filteredResults.length})
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
                                            <TableHead className="text-right">Present</TableHead>
                                            <TableHead className="text-right">LOP</TableHead>
                                            <TableHead className="text-right">Sick</TableHead>
                                            <TableHead className="text-right">Annual</TableHead>
                                            <TableHead className="text-right">Late Min</TableHead>
                                            <TableHead className="text-right">Early Min</TableHead>
                                            <TableHead className="text-right">Other Min</TableHead>
                                            <TableHead className="text-right">Deductible</TableHead>
                                            <TableHead className="text-right">Approved</TableHead>
                                            <TableHead>ML Risk</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredResults.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={13} className="text-center py-10 text-slate-500">
                                                    {searchQuery ? 'No employees match your search.' : 'No analysis results for this report.'}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredResults.map((result) => {
                                                const attId = String(result.attendance_id);
                                                const isExpanded = expandedEmployeeId === attId;
                                                const prev = prevMap[attId];
                                                const name = employeeMap[attId] || `Employee ${attId}`;

                                                // ML badges
                                                const badges = [];
                                                if (n(result.late_minutes) > avgLateAll * 2) {
                                                    badges.push({ label: 'High Late', color: 'bg-red-100 text-red-700 border-red-200' });
                                                }
                                                if (prev && n(result.full_absence_count) > n(prev.full_absence_count) + 2) {
                                                    badges.push({ label: 'LOP ↑', color: 'bg-amber-100 text-amber-700 border-amber-200' });
                                                }
                                                if (n(result.sick_leave_count) >= 2) {
                                                    badges.push({ label: `Sick ×${n(result.sick_leave_count)}`, color: 'bg-blue-100 text-blue-700 border-blue-200' });
                                                }

                                                return (
                                                    <React.Fragment key={result.id}>
                                                        <TableRow
                                                            className={`cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}
                                                            onClick={() => setExpandedEmployeeId(isExpanded ? null : attId)}
                                                        >
                                                            <TableCell className="w-8 px-2">
                                                                {isExpanded
                                                                    ? <ChevronDown className="w-4 h-4 text-indigo-500" />
                                                                    : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                                            </TableCell>
                                                            <TableCell className="font-medium text-slate-900">{name}</TableCell>
                                                            <TableCell className="text-slate-600 font-mono text-sm">{attId}</TableCell>
                                                            <TableCell className="text-right">{n(result.present_days)}</TableCell>
                                                            <TableCell className="text-right">
                                                                <span className={n(result.full_absence_count) > 0 ? 'text-red-600 font-medium' : ''}>
                                                                    {n(result.full_absence_count)}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right">{n(result.sick_leave_count)}</TableCell>
                                                            <TableCell className="text-right">{n(result.annual_leave_count)}</TableCell>
                                                            <TableCell className="text-right">
                                                                <span className={n(result.late_minutes) > 0 ? 'text-orange-600 font-medium' : ''}>
                                                                    {n(result.late_minutes)}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <span className={n(result.early_checkout_minutes) > 0 ? 'text-blue-600 font-medium' : ''}>
                                                                    {n(result.early_checkout_minutes)}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right">{n(result.other_minutes)}</TableCell>
                                                            <TableCell className="text-right">
                                                                <span className={`font-bold ${n(result.deductible_minutes) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                    {n(result.deductible_minutes)}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right">{n(result.approved_minutes)}</TableCell>
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

                                                        {/* ── Expanded Detail Panel ────────── */}
                                                        {isExpanded && (
                                                            <TableRow className="bg-indigo-50/40">
                                                                <TableCell colSpan={13} className="p-0">
                                                                    <div className="px-6 py-5 space-y-5 border-l-4 border-indigo-300">
                                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                                                            {/* Comparison Table */}
                                                                            <div>
                                                                                <h4 className="text-sm font-semibold text-slate-700 mb-3">
                                                                                    Period Comparison
                                                                                </h4>
                                                                                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                                                                    <table className="w-full text-sm">
                                                                                        <thead>
                                                                                            <tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                                                                                                <th className="text-left px-3 py-2 font-medium">Metric</th>
                                                                                                <th className="text-right px-3 py-2 font-medium">Current</th>
                                                                                                <th className="text-right px-3 py-2 font-medium">Previous</th>
                                                                                                <th className="text-right px-3 py-2 font-medium">Change</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {[
                                                                                                { label: 'Present Days', key: 'present_days', inv: false },
                                                                                                { label: 'LOP Days', key: 'full_absence_count', inv: true },
                                                                                                { label: 'Sick Leave', key: 'sick_leave_count', inv: true },
                                                                                                { label: 'Annual Leave', key: 'annual_leave_count', inv: false },
                                                                                                { label: 'Late Minutes', key: 'late_minutes', inv: true },
                                                                                                { label: 'Early Checkout', key: 'early_checkout_minutes', inv: true },
                                                                                                { label: 'Other Minutes', key: 'other_minutes', inv: true },
                                                                                                { label: 'Deductible Min', key: 'deductible_minutes', inv: true },
                                                                                                { label: 'Approved Min', key: 'approved_minutes', inv: false },
                                                                                                { label: 'Grace Min', key: 'grace_minutes', inv: false },
                                                                                            ].map((m, mi) => (
                                                                                                <tr key={m.key} className={mi % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                                                                    <td className="px-3 py-1.5 text-slate-700">{m.label}</td>
                                                                                                    <td className="px-3 py-1.5 text-right font-medium">{n(result[m.key])}</td>
                                                                                                    <td className="px-3 py-1.5 text-right text-slate-500">
                                                                                                        {prev ? n(prev[m.key]) : '—'}
                                                                                                    </td>
                                                                                                    <td className="px-3 py-1.5 text-right">
                                                                                                        <Delta
                                                                                                            current={n(result[m.key])}
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

                                                                            {/* Late Minutes Trend Chart */}
                                                                            <div>
                                                                                <h4 className="text-sm font-semibold text-slate-700 mb-3">
                                                                                    Late Minutes Trend
                                                                                </h4>
                                                                                <div className="bg-white rounded-lg border border-slate-200 p-4">
                                                                                    {trendData.length >= 2 ? (
                                                                                        <ResponsiveContainer width="100%" height={120}>
                                                                                            <LineChart data={trendData}>
                                                                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                                                                <XAxis
                                                                                                    dataKey="_reportLabel"
                                                                                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                                                                    axisLine={{ stroke: '#e2e8f0' }}
                                                                                                />
                                                                                                <YAxis
                                                                                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                                                                    axisLine={{ stroke: '#e2e8f0' }}
                                                                                                    width={35}
                                                                                                />
                                                                                                <Tooltip
                                                                                                    contentStyle={{
                                                                                                        fontSize: 12,
                                                                                                        borderRadius: 8,
                                                                                                        border: '1px solid #e2e8f0',
                                                                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                                                                                    }}
                                                                                                />
                                                                                                <Line
                                                                                                    type="monotone"
                                                                                                    dataKey="late_minutes"
                                                                                                    stroke="#f97316"
                                                                                                    strokeWidth={2}
                                                                                                    dot={{ r: 3, fill: '#f97316' }}
                                                                                                    activeDot={{ r: 5 }}
                                                                                                    name="Late Min"
                                                                                                />
                                                                                            </LineChart>
                                                                                        </ResponsiveContainer>
                                                                                    ) : trendData.length === 1 ? (
                                                                                        <div className="flex items-center justify-center h-[120px] text-sm text-slate-400">
                                                                                            Only 1 data point — need at least 2 for trend
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="flex items-center justify-center h-[120px] text-sm text-slate-400 animate-pulse">
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
