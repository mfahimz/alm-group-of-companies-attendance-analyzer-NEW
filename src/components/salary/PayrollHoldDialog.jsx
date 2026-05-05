import React from 'react';

/**
 * PayrollHoldDialog
 * Modal for placing/modifying payroll holds on an employee.
 * Supports leave-salary-based hold and custom amount hold with mandatory reason.
 */
export default function PayrollHoldDialog({
    open,
    row,
    leaveSalaryChecked,
    setLeaveSalaryChecked,
    customAmount,
    setCustomAmount,
    reason,
    setReason,
    submitting,
    onClose,
    onConfirm
}) {
    if (!open || !row) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900">Payroll Hold — {row.name}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
                </div>

                {(row.salaryLeaveAmount || 0) > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <input
                            type="checkbox"
                            id="holdLeaveSalary"
                            checked={leaveSalaryChecked}
                            onChange={e => setLeaveSalaryChecked(e.target.checked)}
                            className="h-4 w-4 accent-amber-500"
                        />
                        <label htmlFor="holdLeaveSalary" className="text-sm text-amber-800 font-medium cursor-pointer">
                            Hold Leave Salary — AED {Number(row.salaryLeaveAmount).toFixed(2)}
                        </label>
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Custom Hold Amount (AED)</label>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={customAmount}
                        onChange={e => setCustomAmount(e.target.value)}
                        placeholder="Enter amount to hold"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <p className="text-xs text-slate-400">Max: AED {Number(row.total_salary || 0).toFixed(2)}</p>
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Reason <span className="text-red-500">*</span></label>
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Enter reason for hold (required)"
                        rows={3}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={submitting}
                        className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {submitting ? 'Saving...' : 'Confirm Hold'}
                    </button>
                </div>
            </div>
        </div>
    );
}