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
        <Card className="border-0 shadow-sm">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Attendance Report</CardTitle>
                    {(resultsLoading || employeesLoading) && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading data...
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
                <div className="border rounded-lg relative overflow-x-auto overflow-y-auto max-h-[600px]">
                    <table className="w-full min-w-max caption-bottom text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                            <tr className="border-b">
                                {isAstra && (
                                    <th className="w-8 px-2 py-3 bg-slate-50">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                                            checked={filteredResults.length > 0 && selectedRowIds.length === filteredResults.length}
                                            onChange={toggleSelectAll}
                                            title="Select all visible rows"
                                        />
                                    </th>
                                )}
                                {!isDepartmentHead && <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground w-12 bg-slate-50 sticky left-0 z-20">Verified</th>}
                                <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort} className="bg-slate-50 sticky left-[48px] z-20">ID</SortableTableHead>
                                <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort} className="bg-slate-50 sticky left-[120px] z-20">Name</SortableTableHead>
                                <SortableTableHead sortKey="working_days" currentSort={sort} onSort={setSort} className="bg-slate-50">Working Days</SortableTableHead>
                                <SortableTableHead sortKey="present_days" currentSort={sort} onSort={setSort} className="bg-slate-50">Present Days</SortableTableHead>
                                <SortableTableHead sortKey="annual_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-50">Annual Leave</SortableTableHead>
                                <SortableTableHead sortKey="sick_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-50">Sick Leave</SortableTableHead>
                                <SortableTableHead sortKey="full_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-50">LOP Days</SortableTableHead>
                                {isAlMaraghiMotors && (
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50 text-rose-600 text-[11px]" title="Weekly off days adjacent to LOP, counted as additional LOP">+Weekly Off LOP</th>
                                )}
                                <SortableTableHead sortKey="half_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-50">Half Days</SortableTableHead>
                                <SortableTableHead sortKey="late_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">Late Minutes</SortableTableHead>
                                <SortableTableHead sortKey="early_checkout_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">Early Checkout</SortableTableHead>
                                {project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' && (
                                    <SortableTableHead sortKey="approved_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">Approved Minutes</SortableTableHead>
                                )}
                                <SortableTableHead sortKey="other_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">Other Minutes</SortableTableHead>
                                {!isDepartmentHead && <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Grace</th>}
                                {showGiftMinutesColumn && (
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Gift Minutes (min)</th>
                                )}
                                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Deductible</th>
                                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Notes</th>
                                <th className="h-10 px-2 text-right align-middle font-medium text-muted-foreground bg-slate-50">Actions</th>
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