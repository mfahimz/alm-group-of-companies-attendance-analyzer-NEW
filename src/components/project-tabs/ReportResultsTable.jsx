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
        <Card className="border border-slate-200 shadow-sm rounded-xl bg-white overflow-hidden">
            <CardHeader className="border-b border-slate-200 px-4 sm:px-5 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardTitle className="text-lg font-semibold text-slate-900">Attendance Report</CardTitle>
                    {(resultsLoading || employeesLoading) && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading data...
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="relative overflow-x-auto overflow-y-auto max-h-[680px] bg-white">
                    <table className="w-full min-w-max caption-bottom text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                            <tr className="border-b border-slate-200">
                                {isAstra && (
                                    <th className="w-8 px-2 py-3 bg-slate-50 border-r border-slate-200">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                                            checked={filteredResults.length > 0 && selectedRowIds.length === filteredResults.length}
                                            onChange={toggleSelectAll}
                                            title="Select all visible rows"
                                        />
                                    </th>
                                )}
                                {!isDepartmentHead && <th className="h-10 px-3 text-left align-middle font-medium text-slate-600 w-12 bg-slate-50 sticky left-0 z-20 border-r border-slate-200">Verified</th>}
                                <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600 sticky left-[48px] z-20 border-r border-slate-200">ID</SortableTableHead>
                                <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600 sticky left-[120px] z-20 border-r border-slate-200">Name</SortableTableHead>
                                <SortableTableHead sortKey="working_days" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Working Days</SortableTableHead>
                                <SortableTableHead sortKey="present_days" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Present Days</SortableTableHead>
                                <SortableTableHead sortKey="annual_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Annual Leave</SortableTableHead>
                                <SortableTableHead sortKey="sick_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Sick Leave</SortableTableHead>
                                <SortableTableHead sortKey="full_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">LOP Days</SortableTableHead>
                                {isAlMaraghiMotors && (
                                    <th className="h-10 px-3 text-left align-middle font-medium bg-slate-50 text-slate-600 text-[11px]" title="Weekly off days adjacent to LOP, counted as additional LOP">+Weekly Off LOP</th>
                                )}
                                <SortableTableHead sortKey="half_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Half Days</SortableTableHead>
                                <SortableTableHead sortKey="late_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Late Minutes</SortableTableHead>
                                <SortableTableHead sortKey="early_checkout_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Early Checkout</SortableTableHead>
                                {project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' && (
                                    <SortableTableHead sortKey="approved_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Approved Minutes</SortableTableHead>
                                )}
                                <SortableTableHead sortKey="other_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50 text-slate-600">Other Minutes</SortableTableHead>
                                {!isDepartmentHead && <th className="h-10 px-3 text-left align-middle font-medium bg-slate-50 text-slate-600">Grace</th>}
                                {showGiftMinutesColumn && (
                                    <th className="h-10 px-3 text-left align-middle font-medium bg-slate-50 text-slate-600">Gift Minutes (min)</th>
                                )}
                                <th className="h-10 px-3 text-left align-middle font-medium bg-slate-50 text-slate-600">Deductible</th>
                                <th className="h-10 px-3 text-left align-middle font-medium bg-slate-50 text-slate-600">Notes</th>
                                <th className="h-10 px-3 text-right align-middle font-medium bg-slate-50 text-slate-600">Actions</th>
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