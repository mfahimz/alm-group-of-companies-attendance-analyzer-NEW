import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle, Info, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function OnHoldTab({ report, project, onSync, syncing }) {
    const queryClient = useQueryClient();
    const [deletingId, setDeletingId] = useState(null);

    // Fetch all active holds for this company
    const { data: holds = [], isLoading, error } = useQuery({
        queryKey: ['payrollHolds', project?.company],
        queryFn: async () => {
            if (!project?.company) return [];
            return await base44.entities.PayrollHold.filter({
                company: project.company,
                status: 'ON_HOLD'
            }, null, 5000);
        },
        enabled: !!project?.company
    });

    // Scope to employees present in this specific salary report
    const employeesInReport = React.useMemo(() => {
        if (!report?.snapshot_data) return new Set();
        try {
            const data = JSON.parse(report.snapshot_data);
            return new Set(data.map(emp => String(emp.hrms_id)));
        } catch (e) {
            return new Set();
        }
    }, [report?.snapshot_data]);

    const filteredHolds = React.useMemo(() => {
        return holds.filter(hold => employeesInReport.has(String(hold.hrms_id)));
    }, [holds, employeesInReport]);

    // Release (delete) a hold by setting its status to RELEASED
    const handleDelete = async (hold) => {
        if (!window.confirm(`Release hold for ${hold.employee_name}? Amount: AED ${Number(hold.amount || 0).toFixed(2)}`)) return;
        setDeletingId(hold.id);
        try {
            await base44.entities.PayrollHold.update(hold.id, {
                status: 'RELEASED',
                updated_date: new Date().toISOString()
            });
            toast.success(`Hold released for ${hold.employee_name}`);
            queryClient.invalidateQueries({ queryKey: ['payrollHolds', project?.company] });
        } catch (err) {
            console.error('[OnHoldTab] Failed to release hold:', err);
            toast.error('Failed to release hold');
        } finally {
            setDeletingId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-slate-500 text-sm">Loading active holds...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-sm">Error loading payroll holds: {error.message}</p>
            </div>
        );
    }

    if (filteredHolds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Info className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-slate-800 font-semibold mb-1">No active holds</h3>
                <p className="text-slate-500 text-sm max-w-sm">
                    There are no active payroll holds for employees in this report.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                    <span className="font-semibold text-slate-800">{filteredHolds.length}</span> active hold(s) for employees in this report
                </p>
                <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-slate-700">
                        Total held: AED {filteredHolds.reduce((sum, h) => sum + Number(h.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    {onSync && (
                        <button
                            onClick={onSync}
                            disabled={syncing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                        >
                            {syncing
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RefreshCw className="w-3 h-3" />
                            }
                            {syncing ? 'Syncing...' : 'Sync'}
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm border-collapse bg-white">
                    <thead>
                        <tr className="bg-slate-800 text-white text-left text-xs uppercase tracking-wide">
                            <th className="px-4 py-3 font-semibold w-8">#</th>
                            <th className="px-4 py-3 font-semibold">Employee</th>
                            <th className="px-4 py-3 font-semibold">HRMS ID</th>
                            <th className="px-4 py-3 font-semibold">Hold Type</th>
                            <th className="px-4 py-3 font-semibold">Origin Period</th>
                            <th className="px-4 py-3 font-semibold text-right">Amount (AED)</th>
                            <th className="px-4 py-3 font-semibold">Source</th>
                            <th className="px-4 py-3 font-semibold">Reason / Notes</th>
                            <th className="px-4 py-3 font-semibold text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredHolds.map((hold, idx) => (
                            <tr
                                key={hold.id}
                                className={`border-b border-slate-100 transition-colors hover:bg-blue-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
                            >
                                <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                                <td className="px-4 py-3 font-semibold text-slate-900">{hold.employee_name || 'N/A'}</td>
                                <td className="px-4 py-3 text-slate-500">{hold.hrms_id}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                        hold.hold_type === 'LEAVE_DEFERRAL'
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-blue-100 text-blue-800'
                                    }`}>
                                        {hold.hold_type === 'LEAVE_DEFERRAL' ? 'Leave Deferral' : 'Manual Hold'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                    {hold.origin_period_start && hold.origin_period_end
                                        ? `${hold.origin_period_start} → ${hold.origin_period_end}`
                                        : '—'}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-slate-900">
                                    {Number(hold.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500 uppercase tracking-wide">
                                    {hold.source || 'MANUAL'}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500 max-w-[220px]">
                                    <span title={hold.notes || hold.reason_code || ''} className="block truncate">
                                        {hold.notes || hold.reason_code || '—'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => handleDelete(hold)}
                                        disabled={deletingId === hold.id}
                                        title="Release this hold"
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
                                    >
                                        {deletingId === hold.id
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : <Trash2 className="w-3 h-3" />
                                        }
                                        {deletingId === hold.id ? 'Releasing...' : 'Release'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
