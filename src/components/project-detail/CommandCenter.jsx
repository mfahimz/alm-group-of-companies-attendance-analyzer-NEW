import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    Users, 
    FileText, 
    AlertCircle, 
    Calendar, 
    History
} from 'lucide-react';
import DashboardHealthCard from './DashboardHealthCard';
import NextActionPanel from './NextActionPanel';
import { formatInUAE } from '@/components/ui/timezone';

export default function CommandCenter({ 
    project, 
    stats, 
    salaryDivisor,
    prevMonthDays,
    onNavigate,
    onShowOverrides
}) {
    const {
        punchCount = 0,
        shiftCount = 0,
        exceptionCount = 0,
        unmatchedCount = 0,
        hasReport = false,
        lastAnalysisDate = null,
        workingDays = 0
    } = stats;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Health Overview - full width grid (project identity already shown in page header) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DashboardHealthCard 
                    title="Punches"
                    value={punchCount}
                    subtitle="Total Records"
                    icon={FileText}
                    status={punchCount > 0 ? 'success' : 'warning'}
                    onClick={() => onNavigate('punches')}
                />
                <DashboardHealthCard 
                    title="Schedules"
                    value={shiftCount}
                    subtitle="Active Shifts"
                    icon={Calendar}
                    status={shiftCount > 0 ? 'success' : 'warning'}
                    onClick={() => onNavigate('shifts')}
                />
                <DashboardHealthCard 
                    title="Exceptions"
                    value={exceptionCount}
                    subtitle="Manual Edits"
                    icon={AlertCircle}
                    status={exceptionCount > 0 ? 'neutral' : 'neutral'}
                    onClick={() => onNavigate('exceptions')}
                />
                <DashboardHealthCard 
                    title="Data Quality"
                    value={unmatchedCount}
                    subtitle="Unmatched IDs"
                    icon={Users}
                    status={unmatchedCount > 0 ? 'error' : 'success'}
                    onClick={unmatchedCount > 0 ? onShowOverrides : null}
                />
            </div>

            {/* Middle Row: Next Action */}
            <NextActionPanel 
                project={project} 
                stats={stats} 
                onNavigate={onNavigate} 
            />

            {/* Bottom Row: Lifecycle & Financial Metrics
                Note: Readiness checklist removed - WorkflowStepper in page header already conveys progress.
                Settings entry removed - Settings2 dropdown in page header already provides access. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Project Metadata & Activity */}
                <Card className="border-0 shadow-md bg-white">
                    <CardHeader className="border-b border-slate-50 px-6 py-4">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <History className="w-4 h-4 text-slate-400" />
                            Project Lifecycle
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-500 font-medium">Created By</span>
                                <span className="text-slate-900 font-bold">{project.created_by || 'System'}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-500 font-medium">Creation Date</span>
                                <span className="text-slate-900 font-bold">
                                    {formatInUAE(project.created_date?.endsWith('Z') ? project.created_date : project.created_date + 'Z', 'dd/MM/yyyy')}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-500 font-medium">Last Analysis</span>
                                <span className="text-slate-900 font-bold">
                                    {lastAnalysisDate 
                                        ? formatInUAE(lastAnalysisDate.endsWith('Z') ? lastAnalysisDate : lastAnalysisDate + 'Z', 'dd/MM/yyyy hh:mm a') 
                                        : 'Never'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-500 font-medium">Working Days</span>
                                <span className="text-slate-900 font-bold">{workingDays} Days</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Financial Metrics - Only shown if divisors provided (Al Maraghi logic) */}
                {salaryDivisor && (
                    <Card className="border-0 shadow-md bg-white">
                        <CardHeader className="border-b border-slate-50 px-6 py-4">
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Users className="w-4 h-4 text-blue-600" />
                                Payroll Configuration (Auto-Calculated)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Salary / Deduction Divisor</p>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-2xl font-black text-slate-900">{salaryDivisor}</p>
                                        <p className="text-xs font-bold text-slate-400">Days</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                        Used for Leave Pay, Salary Leave, and Deductible Hours pay calculations for this period.
                                    </p>
                                </div>
                                {prevMonthDays && (
                                    <div className="space-y-1 border-t md:border-t-0 md:border-l md:pl-8 pt-4 md:pt-0 border-slate-100">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Previous Month Base</p>
                                        <div className="flex items-baseline gap-2">
                                            <p className="text-2xl font-black text-slate-900">{prevMonthDays}</p>
                                            <p className="text-xs font-bold text-slate-400">Days</p>
                                        </div>
                                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                            Identified overflow from previous month. Used for LOP pay adjustments.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}