import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    Users, 
    FileText, 
    AlertCircle, 
    Calendar, 
    History, 
    CheckCircle2, 
    ArrowRight,
    Settings2,
    Briefcase
} from 'lucide-react';
import DashboardHealthCard from './DashboardHealthCard';
import NextActionPanel from './NextActionPanel';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';
import { cn } from '@/lib/utils';

function ChecklistItem({ label, completed, subtext, isWarning }) {
    return (
        <li className="flex items-start gap-3 group">
            <div className={cn(
                "mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all duration-300",
                completed ? "bg-green-100 border-green-200 text-green-600" : 
                isWarning ? "bg-amber-100 border-amber-200 text-amber-600" :
                "bg-slate-50 border-slate-200 text-slate-300"
            )}>
                <CheckCircle2 className={cn("w-3.5 h-3.5", !completed && "opacity-20")} />
            </div>
            <div>
                <p className={cn(
                    "text-sm font-bold transition-colors duration-300",
                    completed ? "text-slate-900" : "text-slate-500"
                )}>
                    {label}
                </p>
                <p className="text-[11px] text-slate-400 font-medium">{subtext}</p>
            </div>
        </li>
    );
}

export default function CommandCenter({ 
    project, 
    stats, 
    salaryDivisor,
    prevMonthDays,
    onNavigate
}) {
    const {
        punchCount = 0,
        shiftCount = 0,
        exceptionCount = 0,
        unmatchedCount = 0,
        employeeCount = 0,
        hasReport = false,
        isFinalized = false,
        lastAnalysisDate = null,
        workingDays = 0
    } = stats;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Top Row: Readiness & Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        onClick={unmatchedCount > 0 ? () => window.dispatchEvent(new CustomEvent('showOverrides')) : null}
                    />
                </div>

                {/* Readiness Checklist */}
                <Card className="border-0 shadow-md bg-white">
                    <CardHeader className="border-b border-slate-50 px-6 py-4">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            Readiness Checklist
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <ul className="space-y-4">
                            <ChecklistItem 
                                label="Punch data uploaded" 
                                completed={punchCount > 0} 
                                subtext={punchCount > 0 ? `${punchCount} records available` : "Awaiting punch log upload"}
                            />
                            <ChecklistItem 
                                label="Shift timings configured" 
                                completed={shiftCount > 0} 
                                subtext={shiftCount > 0 ? `${shiftCount} shifts defined` : "No schedules found for this period"}
                            />
                            <ChecklistItem 
                                label="Data quality verified" 
                                completed={unmatchedCount === 0} 
                                subtext={unmatchedCount === 0 ? "No orphan attendance IDs" : `${unmatchedCount} unmatched IDs require attention`}
                                isWarning={unmatchedCount > 0}
                            />
                            <ChecklistItem 
                                label="Analysis report generated" 
                                completed={hasReport} 
                                subtext={hasReport ? "Latest analysis results available" : "Analysis has not been run yet"}
                            />
                        </ul>
                    </CardContent>
                </Card>
            </div>

            {/* Middle Row: Next Action */}
            <NextActionPanel 
                project={project} 
                stats={stats} 
                onNavigate={onNavigate} 
            />

            {/* Bottom Row: Lifecycle & Financials */}
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
                            
                            <div className="pt-4 border-t border-slate-50">
                                <p className="text-[10px] text-slate-400 italic">Project settings managed via main context menu above.</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Financial Metrics - Only shown if divisors provided (Al Maraghi logic) */}
                {salaryDivisor && (
                    <Card className="border-0 shadow-md bg-white lg:col-span-2">
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