import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, ArrowLeft, RefreshCw, Layers, Building2, CalendarDays, Clock, Hash } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/* Calendar-based period tab components — independent from legacy project tabs */
import PeriodRunAnalysisTab from '../components/period-tabs/PeriodRunAnalysisTab';
import PeriodExceptionsTab from '../components/period-tabs/PeriodExceptionsTab';
import PeriodOvertimeTab from '../components/period-tabs/PeriodOvertimeTab';
import PeriodReportDetailView from '../components/period-tabs/PeriodReportDetailView';
import PeriodPunchesTab from '../components/period-tabs/PeriodPunchesTab';

/*
 * Calendar Period Detail Page
 * 
 * Part of the new calendar based payroll system.
 * Completely independent from the existing project system.
 * CalendarPeriod receives initial configuration parameters from WorkingDaysCalendar.
 * Renders PeriodRunAnalysisTab, PeriodExceptionsTab, PeriodOvertimeTab,
 * PeriodPunchesTab, and PeriodReportDetailView as tab components,
 * passing calendarPeriod as a prop.
 */
export default function CalendarPeriodDetail() {
    const urlParams = new URLSearchParams(window.location.search);
    const periodId = urlParams.get('id');
    const tabFromUrl = urlParams.get('tab');
    const [activeTab, setActiveTab] = useState(tabFromUrl || 'overview');
    /* State for selecting a specific report run to display in the Report tab */
    const [selectedReportRunId, setSelectedReportRunId] = useState(null);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const allowedRoles = ['admin', 'ceo'];

    React.useEffect(() => {
        if (currentUser && !allowedRoles.includes(userRole)) {
            toast.error('Access denied. Calendar Periods are restricted to Admin and CEO.');
            navigate(createPageUrl('Dashboard'));
        }
    }, [currentUser, userRole, navigate]);

    // Update URL when tab changes
    const handleTabChange = (newTab) => {
        setActiveTab(newTab);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('tab', newTab);
        window.history.replaceState({}, '', newUrl.toString());
    };

    // Fetch Calendar Period Record
    const { data: period, isLoading } = useQuery({
        queryKey: ['calendarPeriod', periodId],
        queryFn: async () => {
            const res = await base44.entities.CalendarPeriod.filter({ id: periodId });
            return res.length > 0 ? res[0] : null;
        },
        enabled: !!periodId,
    });

    /* Fetch all report runs for this calendar period (needed by Report tab) */
    const { data: reportRuns = [] } = useQuery({
        queryKey: ['reportRuns', periodId],
        queryFn: () => base44.entities.ReportRun.filter({ calendar_period_id: periodId }),
        enabled: !!periodId,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000
    });

    /* Derive the selected report run object for the Report tab */
    const selectedReportRun = React.useMemo(() => {
        if (reportRuns.length === 0) return null;
        if (selectedReportRunId) {
            return reportRuns.find(r => r.id === selectedReportRunId) || reportRuns[reportRuns.length - 1];
        }
        // Default: most recent report run (last in array)
        return reportRuns[reportRuns.length - 1];
    }, [reportRuns, selectedReportRunId]);

    // Update Status Mutation
    const updateStatusMutation = useMutation({
        mutationFn: async (newStatus) => {
            await base44.entities.CalendarPeriod.update(period.id, { status: newStatus });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['calendarPeriod', periodId]);
            toast.success('Period status updated successfully');
        },
        onError: (err) => {
            toast.error('Failed to update period status: ' + err.message);
        }
    });

    const handleStatusCycle = () => {
        if (!period) return;
        const current = period.status || 'draft';
        let nextStatus = 'draft';
        if (current === 'draft') nextStatus = 'analyzed';
        else if (current === 'analyzed') nextStatus = 'locked';
        else if (current === 'locked') nextStatus = 'closed';
        else if (current === 'closed') nextStatus = 'draft';

        if (window.confirm(`Change status from ${current.toUpperCase()} to ${nextStatus.toUpperCase()}?`)) {
            updateStatusMutation.mutate(nextStatus);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24 animate-pulse">
                <div className="text-indigo-500 flex flex-col items-center gap-4">
                    <Layers className="w-10 h-10 animate-spin" />
                    <p className="font-semibold tracking-wider">Loading Period...</p>
                </div>
            </div>
        );
    }

    if (!period) {
        return (
            <div className="text-center py-24 bg-white m-6 rounded-3xl shadow-sm border border-slate-100">
                <Layers className="w-16 h-16 mx-auto text-slate-300 mb-6" />
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Period Not Found</h2>
                <p className="text-slate-500 mb-8 max-w-sm mx-auto">The requested payroll period could not be located or has been deleted.</p>
                <Link to={createPageUrl('CalendarPeriods')} className="inline-flex items-center justify-center h-12 px-8 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Calendar Periods
                </Link>
            </div>
        );
    }

    const { name, company, date_from, date_to, status } = period;

    return (
        <div className="space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-12">
            <Breadcrumb items={[
                { label: 'Calendar Periods', href: 'CalendarPeriods' },
                { label: name }
            ]} />

            {/* Header Section */}
            <div className="bg-gradient-to-br from-white to-slate-50/80 rounded-3xl shadow-xl shadow-slate-200/50 p-6 sm:p-8 border border-white relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex-1 space-y-4">
                        <Link to={createPageUrl('CalendarPeriods')} className="inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors mb-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                            <ArrowLeft className="w-4 h-4 mr-1.5" />
                            Return to List
                        </Link>
                        
                        <div className="flex items-center gap-4">
                            <div className={`w-2.5 h-16 rounded-full bg-gradient-to-b ${
                                status === 'draft' ? 'from-amber-400 to-amber-600' :
                                status === 'analyzed' ? 'from-blue-400 to-blue-600' :
                                status === 'locked' ? 'from-indigo-400 to-indigo-600' :
                                'from-emerald-400 to-emerald-600'
                            }`} />
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 tracking-tight">
                                    {name}
                                </h1>
                                <div className="flex items-center gap-3 mt-2">
                                    <Badge variant="outline" className="text-slate-700 bg-white border-slate-300 font-bold px-3 py-1 shadow-sm">
                                        {company}
                                    </Badge>
                                    <div className="flex items-center gap-1.5 text-slate-500 text-sm font-medium bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                                        <Calendar className="w-4 h-4 text-indigo-500" />
                                        {new Date(date_from).toLocaleDateString('en-GB')} → {new Date(date_to).toLocaleDateString('en-GB')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-3 min-w-[200px]">
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2">Current Status</span>
                            <Badge className={`px-4 py-2 text-sm font-bold shadow-md w-full justify-center ${
                                status === 'draft' ? 'bg-gradient-to-r from-amber-100 to-amber-200 text-amber-900 border border-amber-300' :
                                status === 'analyzed' ? 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-900 border border-blue-300' :
                                status === 'locked' ? 'bg-gradient-to-r from-indigo-100 to-indigo-200 text-indigo-900 border border-indigo-300' :
                                'bg-gradient-to-r from-emerald-100 to-emerald-200 text-emerald-900 border border-emerald-300'
                            }`}>
                                {(status || 'draft').toUpperCase()}
                            </Badge>
                        </div>
                        
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleStatusCycle}
                            disabled={updateStatusMutation.isPending}
                            className="bg-white hover:bg-slate-50 border-slate-200 text-slate-700 font-semibold shadow-sm w-full"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${updateStatusMutation.isPending ? 'animate-spin' : ''}`} />
                            Advance Status
                        </Button>
                    </div>
                </div>

                {/* Decorative background blob */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-50/50 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none z-0"></div>
            </div>

            {/* Main Tabs Navigation */}
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                <div className="sticky top-0 z-20 bg-[#F8FAFC]/90 backdrop-blur-xl -mx-4 px-4 py-4 sm:-mx-6 sm:px-6 border-b border-slate-200/50">
                    <TabsList className="bg-white shadow-xl shadow-slate-200/40 rounded-2xl p-1.5 flex flex-wrap h-auto gap-1 border border-slate-100 w-full md:w-fit mx-auto md:mx-0">
                        {['overview', 'punches', 'run-analysis', 'exceptions', 'adjustments', 'report'].map((tabValue) => (
                            <TabsTrigger 
                                key={tabValue}
                                value={tabValue} 
                                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-600 data-[state=active]:to-indigo-700 data-[state=active]:text-white data-[state=active]:shadow-md font-bold text-[13px] px-6 py-2.5 rounded-xl transition-all capitalize"
                            >
                                {tabValue.replace('-', ' ')}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {/* ================================================================
                    OVERVIEW TAB — Shows key period details as a summary card
                ================================================================ */}
                <TabsContent value="overview" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="border-0 shadow-md bg-white ring-1 ring-slate-950/5">
                        <CardContent className="p-8">
                            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Layers className="w-5 h-5 text-indigo-600" />
                                Period Overview
                            </h3>
                            {/* Key detail cards in a responsive grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {/* Period Name */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period Name</span>
                                    <p className="text-lg font-bold text-slate-900">{name}</p>
                                </div>
                                {/* Company */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Building2 className="w-3 h-3" /> Company</span>
                                    <p className="text-lg font-bold text-slate-900">{company}</p>
                                </div>
                                {/* Status */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</span>
                                    <Badge className={`text-sm font-bold ${
                                        status === 'draft' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                        status === 'analyzed' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                        status === 'locked' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
                                        'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    }`}>{(status || 'draft').toUpperCase()}</Badge>
                                </div>
                                {/* Date Range */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Date Range</span>
                                    <p className="text-lg font-bold text-slate-900">
                                        {new Date(date_from).toLocaleDateString('en-GB')} → {new Date(date_to).toLocaleDateString('en-GB')}
                                    </p>
                                </div>
                                {/* Salary Calculation Days */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Hash className="w-3 h-3" /> Salary Calc Days</span>
                                    <p className="text-lg font-bold text-slate-900">{period.salary_calculation_days ?? '—'}</p>
                                </div>
                                {/* OT Calculation Days */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> OT Calc Days</span>
                                    <p className="text-lg font-bold text-slate-900">{period.ot_calculation_days ?? '—'}</p>
                                </div>
                                {/* Period Month & Year */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period Month / Year</span>
                                    <p className="text-lg font-bold text-slate-900">{period.period_month ?? '—'} / {period.period_year ?? '—'}</p>
                                </div>
                                {/* Weekly Off Override */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Weekly Off Override</span>
                                    <p className="text-lg font-bold text-slate-900">{period.weekly_off_override || 'None'}</p>
                                </div>
                                {/* Report Runs Count */}
                                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Report Runs</span>
                                    <p className="text-lg font-bold text-slate-900">{reportRuns.length}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ================================================================
                    PUNCHES TAB — Manages punch data linked via calendar_period_id.
                    Matches punch data identical to project system but scoped.
                ================================================================ */}
                <TabsContent value="punches" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <PeriodPunchesTab calendarPeriod={period} />
                </TabsContent>

                {/* ================================================================
                    RUN ANALYSIS TAB — Invokes runCalendarAnalysis backend function
                ================================================================ */}
                <TabsContent value="run-analysis" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <PeriodRunAnalysisTab calendarPeriod={period} />
                </TabsContent>

                {/* ================================================================
                    EXCEPTIONS TAB — Manages exceptions for calendar period
                ================================================================ */}
                <TabsContent value="exceptions" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <PeriodExceptionsTab calendarPeriod={period} />
                </TabsContent>

                {/* ================================================================
                    ADJUSTMENTS TAB — Overtime, bonus, incentive, salary adjustments
                ================================================================ */}
                <TabsContent value="adjustments" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <PeriodOvertimeTab calendarPeriod={period} />
                </TabsContent>

                {/* ================================================================
                    REPORT TAB — Displays analysis results and salary snapshots
                ================================================================ */}
                <TabsContent value="report" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {reportRuns.length === 0 ? (
                        /* No reports yet — show informational placeholder */
                        <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-slate-100">
                            <Layers className="w-16 h-16 mx-auto text-indigo-200 mb-6" />
                            <h3 className="text-2xl font-bold text-slate-700 mb-2">No Reports Yet</h3>
                            <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
                                Run an analysis from the "Run Analysis" tab first to generate a report for this period.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Report run selector — allows switching between multiple runs */}
                            {reportRuns.length > 1 && (
                                <Card className="border-0 shadow-sm">
                                    <CardContent className="py-4 flex items-center gap-3">
                                        <span className="text-sm font-semibold text-slate-600">Report Run:</span>
                                        <Select
                                            value={selectedReportRun?.id || ''}
                                            onValueChange={(val) => setSelectedReportRunId(val)}
                                        >
                                            <SelectTrigger className="w-[320px]">
                                                <SelectValue placeholder="Select a report run" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {reportRuns.map(run => (
                                                    <SelectItem key={run.id} value={run.id}>
                                                        {run.report_name || run.id.substring(0, 8)} {run.is_final ? '(Final)' : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </CardContent>
                                </Card>
                            )}
                            {/* Render the report detail view with the selected report run */}
                            {selectedReportRun && (
                                <PeriodReportDetailView reportRun={selectedReportRun} calendarPeriod={period} />
                            )}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}