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
        if (!reportRun || !project || reportReadyRef.current) return;
        reportReadyRef.current = true;
        startTicking();

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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* preserve context: from_tab query parameter tells us which tab we came from (default: overview) */}
                    <Link to={createPageUrl('ProjectDetail') + `?id=${projectId}&tab=${fromTab}`}>
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Project
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {reportRun.report_name || `Report: ${formatInUAE(reportRun.date_from, 'MM/dd/yyyy')} - ${formatInUAE(reportRun.date_to, 'MM/dd/yyyy')}`}
                        </h1>
                        <p className="text-sm text-slate-600 mt-1">
                            Generated on {formatInUAE(reportRun.created_date?.endsWith('Z') ? reportRun.created_date : (reportRun.created_date + 'Z'), 'MM/dd/yyyy hh:mm a')}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-full select-none shadow-sm">
                    <Timer className="w-3.5 h-3.5" />
                    <span>{displayTime}</span>
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