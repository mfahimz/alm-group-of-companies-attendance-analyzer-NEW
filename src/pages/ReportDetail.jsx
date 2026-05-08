import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import ReportDetailView from '../components/project-tabs/ReportDetailView';
import { formatInUAE } from '@/components/ui/timezone';
import { useEffect, useRef, useState } from 'react';

export default function ReportDetailPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const reportRunId = urlParams.get('id');
    const projectId = urlParams.get('project_id');
    const fromTab = urlParams.get('from_tab') || 'overview';

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isDepartmentHead = userRole === 'department_head';

    // Department head verification
    const { data: deptHeadVerification } = useQuery({
        queryKey: ['deptHeadVerification', isDepartmentHead, currentUser?.email],
        queryFn: async () => {
            if (!isDepartmentHead) return null;
            const { data } = await base44.functions.invoke('verifyDepartmentHead', {});
            return data;
        },
        enabled: !!currentUser && isDepartmentHead,
        retry: false
    });

    const { data: reportRun, isLoading: reportLoading, error: reportError } = useQuery({
        queryKey: ['reportRun', reportRunId],
        queryFn: async () => {
            const runs = await base44.entities.ReportRun.filter({ id: reportRunId });
            return runs[0];
        },
        enabled: !!reportRunId,
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
    });

    const { data: project, isLoading: projectLoading, error: projectError } = useQuery({
        queryKey: ['project', projectId],
        queryFn: async () => {
            const projects = await base44.entities.Project.filter({ id: projectId });
            return projects[0];
        },
        enabled: !!projectId,
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
    });

    // --- Silent report view timer ---
    const timerRef = useRef(null);
    const secondsRef = useRef(0);
    const startTimeRef = useRef(null);
    const [displayTime, setDisplayTime] = useState('0:00');
    const reportReadyRef = useRef(false);

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const startTicking = () => {
        if (timerRef.current) return;
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
            const total = secondsRef.current + elapsed;
            setDisplayTime(formatTime(total));
        }, 1000);
    };

    const pauseTicking = () => {
        if (!timerRef.current) return;
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        secondsRef.current += elapsed;
        clearInterval(timerRef.current);
        timerRef.current = null;
    };

    useEffect(() => {
        if (!reportRun || !project) return;
        // Always attempt to restart the timer if it was paused by a background data refresh.
        // startTicking has its own guard (timerRef.current check) so calling it again is safe.
        startTicking();
        if (reportReadyRef.current) return;
        // First run only: mark ready and register the visibilitychange listener
        reportReadyRef.current = true;

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                pauseTicking();
            } else {
                startTicking();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            pauseTicking();
            const total = secondsRef.current;
            if (total < 3 || !currentUser) return;
            // Fire-and-forget — silent, never blocks UI
            base44.entities.ActivityLog.create({
                user_email: currentUser.email,
                user_name: currentUser.full_name || currentUser.email,
                user_role: currentUser.role || 'user',
                ip_address: '',
                user_agent: `REPORT_VIEW | report_id:${reportRun.id} | report_name:${reportRun.report_name || reportRunId} | seconds:${total}`
            }).catch(() => {});
        };
    }, [reportRun, project]);
    // --- End silent report view timer ---

    if (reportLoading || projectLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-500">Loading report...</div>
            </div>
        );
    }

    if (reportError || projectError) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-red-600">Error loading report: {(reportError || projectError)?.message}</div>
            </div>
        );
    }

    if (!reportRun || !project) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-slate-600">Report not found</div>
            </div>
        );
    }

    return (
        <div className="space-y-7 max-w-[1900px] mx-auto">
            {/* Header */}
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-800/20 bg-slate-950 shadow-2xl shadow-slate-300/60">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.35),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.18),transparent_34%)]" />
                <div className="relative px-5 sm:px-7 py-6 sm:py-8 text-white">
                    <div className="flex flex-col xl:flex-row xl:items-stretch xl:justify-between gap-6">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-5 min-w-0">
                            {/* preserve context: from_tab query parameter tells us which tab we came from (default: overview) */}
                            <Link to={createPageUrl('ProjectDetail') + `?id=${projectId}&tab=${fromTab}`}>
                                <Button variant="ghost" size="sm" className="bg-white text-slate-900 hover:bg-indigo-50 hover:text-slate-950 border border-white/40 rounded-2xl shrink-0 shadow-lg shadow-slate-950/20">
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back to Project
                                </Button>
                            </Link>
                            <div className="min-w-0 space-y-4">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.28em] text-indigo-200 font-black mb-3">Attendance Verifier Command Center</p>
                                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight truncate">
                                        {reportRun.report_name || `Report: ${formatInUAE(reportRun.date_from, 'MM/dd/yyyy')} - ${formatInUAE(reportRun.date_to, 'MM/dd/yyyy')}`}
                                    </h1>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                    <span className="rounded-2xl bg-white/12 border border-white/15 px-4 py-3 shadow-inner">
                                        <span className="block text-[11px] uppercase tracking-wide text-slate-300 font-bold">Generated</span>
                                        <span className="font-bold text-white">{formatInUAE(reportRun.created_date?.endsWith('Z') ? reportRun.created_date : (reportRun.created_date + 'Z'), 'MM/dd/yyyy hh:mm a')}</span>
                                    </span>
                                    <span className="rounded-2xl bg-white/12 border border-white/15 px-4 py-3 shadow-inner">
                                        <span className="block text-[11px] uppercase tracking-wide text-slate-300 font-bold">Report Period</span>
                                        <span className="font-bold text-white">{formatInUAE(reportRun.date_from, 'MM/dd/yyyy')} - {formatInUAE(reportRun.date_to, 'MM/dd/yyyy')}</span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-3 xl:w-72 shrink-0">
                            <div className="rounded-3xl bg-indigo-500/20 border border-indigo-300/30 px-5 py-4 shadow-xl shadow-slate-950/10">
                                <span className="block text-xs uppercase tracking-wide text-indigo-100 font-black">Review Timer</span>
                                <div className="mt-2 flex items-center gap-3 text-2xl font-black tabular-nums">
                                    <Timer className="w-6 h-6 text-indigo-200" />
                                    {displayTime}
                                </div>
                            </div>
                            <div className="rounded-3xl bg-emerald-500/20 border border-emerald-300/30 px-5 py-4 shadow-xl shadow-slate-950/10">
                                <span className="block text-xs uppercase tracking-wide text-emerald-100 font-black">Verifier Goal</span>
                                <span className="mt-2 block text-lg font-black text-white">Review → Verify → Save</span>
                            </div>
                            <div className="rounded-3xl bg-white/10 border border-white/15 px-5 py-4 shadow-xl shadow-slate-950/10">
                                <span className="block text-xs uppercase tracking-wide text-slate-300 font-black">Workflow State</span>
                                <span className="mt-2 block text-lg font-black text-white">Attendance Review</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Report Detail View */}
            <ReportDetailView 
                reportRun={reportRun} 
                project={project} 
                isDepartmentHead={isDepartmentHead}
                deptHeadVerification={deptHeadVerification}
            />
        </div>
    );
}