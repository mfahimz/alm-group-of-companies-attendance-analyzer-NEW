import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle, Info, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function OnHoldTab({ report, project, allCompanyHolds = [], onSync, syncing, onHoldsChanged }) {
    const queryClient = useQueryClient();
    const [releasingId, setReleasingId] = useState(null);

    // Map employees in report for quick lookup of attendance_id and other details
    const employeeMap = React.useMemo(() => {
        if (!report?.snapshot_data) return new Map();
        try {
            const data = JSON.parse(report.snapshot_data);
            return new Map(data.map(emp => [String(emp.hrms_id), emp]));
        } catch (e) {
            return new Map();
        }
    }, [report?.snapshot_data]);

    // Split holds into those in the current report and those in other periods/reports
    const { holdsInReport, holdsOther } = React.useMemo(() => {
        const inReport = [];
        const other = [];
        
        (allCompanyHolds || []).forEach(hold => {
            if (employeeMap.has(String(hold.hrms_id))) {
                inReport.push(hold);
            } else {
                other.push(hold);
            }
        });
        
        return { holdsInReport: inReport, holdsOther: other };
    }, [allCompanyHolds, employeeMap]);

    // Release a hold and sync back to salary snapshot
    const handleDelete = async (hold) => {
        if (!window.confirm(`Release hold for ${hold.employee_name}? Amount: AED ${Number(hold.amount || 0).toFixed(2)}\n\nThis will automatically add the amount back to the employee's salary and recalculate their total.`)) return;
        
        setReleasingId(hold.id);
        try {
            // 1. Release the hold record
            await base44.entities.PayrollHold.update(hold.id, {
                status: 'RELEASED',
                updated_date: new Date().toISOString()
            });

            // 2. If employee is in this report, update their SalarySnapshot and recalculate
            const empRow = employeeMap.get(String(hold.hrms_id));
            if (empRow) {
                // Fetch live snapshot to get current values
                const snapshots = await base44.entities.SalarySnapshot.filter({
                    report_run_id: report.report_run_id,
                    attendance_id: String(empRow.attendance_id)
                }, null, 1);

                if (snapshots.length > 0) {
                    const snapshot = snapshots[0];
                    const currentAmount = Number(snapshot.open_leave_salary || 0);
                    const newAmount = currentAmount + Number(hold.amount || 0);

                    // Update snapshot open_leave_salary
                    await base44.entities.SalarySnapshot.update(snapshot.id, {
                        open_leave_salary: newAmount
                    });

                    // Call backend recalculate to update all derived totals (total, wpsPay, etc)
                    const recalcResponse = await base44.functions.invoke('recalculateSalarySnapshot', {
                        report_run_id: report.report_run_id,
                        project_id: project?.id,
                        attendance_id: String(empRow.attendance_id),
                        mode: 'APPLY'
                    });

                    if (!recalcResponse.data?.success) {
                        throw new Error(recalcResponse.data?.error || 'Failed to recalculate salary after release');
                    }
                }
            }

            toast.success(`Hold released and salary updated for ${hold.employee_name}`);
            
            // Invalidate all relevant queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['payrollHolds', project?.company] });
            queryClient.invalidateQueries({ queryKey: ['liveSalarySnapshots', report?.report_run_id] });
            queryClient.invalidateQueries({ queryKey: ['salaryReport', report?.id] });
            
            if (onHoldsChanged) onHoldsChanged();
        } catch (err) {
            console.error('[OnHoldTab] Failed to release hold:', err);
            
            // Rollback hold status on failure
            try {
                await base44.entities.PayrollHold.update(hold.id, {
                    status: 'ON_HOLD'
                });
            } catch (rollbackErr) {
                console.error('[OnHoldTab] Rollback failed:', rollbackErr);
            }
            
            toast.error(err.message || 'Failed to release hold. Please try again.');
        } finally {
            setReleasingId(null);
        }
    };

    if (allCompanyHolds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Info className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-slate-800 font-semibold mb-1">No active holds</h3>
                <p className="text-slate-500 text-sm max-w-sm">
                    There are no active payroll holds for this company.
                </p>
            </div>
        );
    }

    const HoldTable = ({ holds, allowRelease = false, title }) => (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-tight flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${allowRelease ? 'bg-indigo-500' : 'bg-slate-400'}`} />
                    {title} <span className="text-slate-400 font-normal">({holds.length})</span>
                </h3>
            </div>
            
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
                            {allowRelease && <th className="px-4 py-3 font-semibold text-center">Action</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {holds.length === 0 ? (
                            <tr>
                                <td colSpan={allowRelease ? 9 : 8} className="px-4 py-10 text-center text-slate-400 italic">
                                    No holds in this section
                                </td>
                            </tr>
                        ) : (
                            holds.map((hold, idx) => (
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
                                    {allowRelease && (
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleDelete(hold)}
                                                disabled={releasingId === hold.id}
                                                title="Release this hold and add to current salary"
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                                            >
                                                {releasingId === hold.id
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <RefreshCw className="w-3 h-3" />
                                                }
                                                {releasingId === hold.id ? 'Processing...' : 'Release'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Header / Summary bar */}
            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex flex-col">
                    <p className="text-sm font-semibold text-slate-900">Company Hold Management</p>
                    <p className="text-xs text-slate-500">
                        Total held across all periods: <span className="font-bold text-slate-700">AED {allCompanyHolds.reduce((sum, h) => sum + Number(h.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    {onSync && (
                        <button
                            onClick={onSync}
                            disabled={syncing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
                        >
                            {syncing
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RefreshCw className="w-3 h-3" />
                            }
                            {syncing ? 'Syncing...' : 'Refresh All'}
                        </button>
                    )}
                </div>
            </div>

            {/* Sections */}
            <HoldTable 
                holds={holdsInReport} 
                allowRelease={true} 
                title="Active Holds for This Report" 
            />
            
            <HoldTable 
                holds={holdsOther} 
                allowRelease={false} 
                title="Holds from Other Employees / Future Periods" 
            />
        </div>
    );
}
