import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import SortableTableHead from '../ui/SortableTableHead';
import ReportTableRow from './ReportTableRow';

/**
 * The main attendance results table for the Report Detail page.
 * Extracted from ReportDetailView to keep that file under the line limit.
 */
export default function ReportResultsTable({
    filteredResults,
    sort,
    setSort,
    isAstra,
    isDepartmentHead,
    isAdmin,
    isSupervisor,
    canEditGiftMinutes,
    project,
    reportRun,
    showGiftMinutesColumn,
    isAlMaraghiMotors,
    selectedRowIds,
    toggleSelectAll,
    toggleRowSelection,
    onToggleVerification,
    onEditGrace,
    onShowBreakdown,
    onUpdateManualOverride,
    onSaveGiftMinutes,
    onSkipEarlyCheckout,
    isSkipped,
    resultsLoading,
    employeesLoading,
}) {
    return (
        <Card className="border-0 shadow-2xl shadow-slate-200/80 rounded-[2rem] bg-white overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white border-b border-slate-800 px-6 py-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-200 mb-2">Verifier table workspace</p>
                        <CardTitle className="text-2xl sm:text-3xl font-black tracking-tight">Attendance Report</CardTitle>
                        <p className="text-sm text-slate-300 mt-2">Sticky employee identity columns stay visible while scanning attendance, leave, minutes, and deduction metrics.</p>
                    </div>
                    {(resultsLoading || employeesLoading) && (
                        <div className="flex items-center gap-2 text-sm text-indigo-100 bg-white/10 border border-white/10 rounded-2xl px-4 py-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading data...
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 bg-gradient-to-br from-slate-50 to-white">
                <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-black">Visible employees</p>
                        <p className="text-2xl font-black text-slate-950">{filteredResults.length}</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-black">Selected rows</p>
                        <p className="text-2xl font-black text-emerald-900">{selectedRowIds.length}</p>
                    </div>
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
                        <p className="text-[11px] uppercase tracking-wide text-indigo-700 font-black">Review mode</p>
                        <p className="text-lg font-black text-indigo-950">Scan left to right</p>
                    </div>
                </div>
                <div className="border-2 border-slate-200 rounded-[1.75rem] relative overflow-x-auto overflow-y-auto max-h-[680px] bg-white shadow-xl shadow-slate-200/70 ring-1 ring-white">
                    <table className="w-full min-w-max caption-bottom text-sm border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10 bg-slate-950 text-white shadow-xl">
                            <tr className="border-b border-slate-700">
                                {isAstra && (
                                    <th className="w-8 px-2 py-4 bg-slate-900 border-r border-slate-700">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                                            checked={filteredResults.length > 0 && selectedRowIds.length === filteredResults.length}
                                            onChange={toggleSelectAll}
                                            title="Select all visible rows"
                                        />
                                    </th>
                                )}
                                {!isDepartmentHead && <th className="h-12 px-3 text-left align-middle font-black text-white w-12 bg-slate-900 sticky left-0 z-20 border-r border-slate-700">Verified</th>}
                                <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort} className="bg-slate-900 text-white sticky left-[48px] z-20 border-r border-slate-700">ID</SortableTableHead>
                                <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort} className="bg-slate-900 text-white sticky left-[120px] z-20 border-r-2 border-indigo-400">Name</SortableTableHead>
                                <SortableTableHead sortKey="working_days" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Working Days</SortableTableHead>
                                <SortableTableHead sortKey="present_days" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Present Days</SortableTableHead>
                                <SortableTableHead sortKey="annual_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Annual Leave</SortableTableHead>
                                <SortableTableHead sortKey="sick_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Sick Leave</SortableTableHead>
                                <SortableTableHead sortKey="full_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">LOP Days</SortableTableHead>
                                {isAlMaraghiMotors && (
                                    <th className="h-12 px-3 text-left align-middle font-black bg-slate-950 text-rose-300 text-[11px] border-l border-slate-800" title="Weekly off days adjacent to LOP, counted as additional LOP">+Weekly Off LOP</th>
                                )}
                                <SortableTableHead sortKey="half_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Half Days</SortableTableHead>
                                <SortableTableHead sortKey="late_minutes" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Late Minutes</SortableTableHead>
                                <SortableTableHead sortKey="early_checkout_minutes" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Early Checkout</SortableTableHead>
                                {project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' && (
                                    <SortableTableHead sortKey="approved_minutes" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Approved Minutes</SortableTableHead>
                                )}
                                <SortableTableHead sortKey="other_minutes" currentSort={sort} onSort={setSort} className="bg-slate-950 text-white border-l border-slate-800">Other Minutes</SortableTableHead>
                                {!isDepartmentHead && <th className="h-12 px-3 text-left align-middle font-black bg-slate-950 text-white border-l border-slate-800">Grace</th>}
                                {showGiftMinutesColumn && (
                                    <th className="h-12 px-3 text-left align-middle font-black bg-slate-950 text-indigo-200 border-l border-slate-800">Gift Minutes (min)</th>
                                )}
                                <th className="h-12 px-3 text-left align-middle font-black bg-slate-950 text-amber-200 border-l-2 border-amber-400">Deductible</th>
                                <th className="h-12 px-3 text-left align-middle font-black bg-slate-950 text-white border-l border-slate-800">Notes</th>
                                <th className="h-12 px-3 text-right align-middle font-black bg-slate-950 text-white border-l border-slate-800">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="[&_tr:last-child]:border-0">
                            {filteredResults.map((result) => (
                                <ReportTableRow
                                    key={result.id}
                                    result={result}
                                    isAdmin={isAdmin}
                                    isSupervisor={isSupervisor}
                                    isDepartmentHead={isDepartmentHead}
                                    canEditGiftMinutes={canEditGiftMinutes}
                                    project={project}
                                    reportRun={reportRun}
                                    showGiftMinutesColumn={showGiftMinutesColumn}
                                    onToggleVerification={onToggleVerification}
                                    onEditGrace={onEditGrace}
                                    onShowBreakdown={onShowBreakdown}
                                    onUpdateManualOverride={onUpdateManualOverride}
                                    onSaveGiftMinutes={onSaveGiftMinutes}
                                    isAstra={isAstra}
                                    isSelected={selectedRowIds.includes(result.id)}
                                    onToggleSelect={() => toggleRowSelection(result.id)}
                                    skipEarlyCheckout={isSkipped(result)}
                                    onSkipEarlyCheckout={isAstra ? (skip) => onSkipEarlyCheckout({ result, skip }) : null}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}