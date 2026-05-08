import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, CheckCircle, Zap } from 'lucide-react';

/**
 * Search / risk filter / verify-all / gift minutes toolbar for the Report Detail page.
 * Extracted from ReportDetailView to keep that file under the line limit.
 */
export default function ReportFilterToolbar({
    searchTerm,
    setSearchTerm,
    riskFilter,
    setRiskFilter,
    isAstra,
    selectedRowIds,
    selectedResults,
    onBulkSkipEarlyCheckout,
    onVerifyAllClean,
    onVerifyAll,
    isDepartmentHead,
    project,
    reportRun,
    onCalculateAllGiftMinutes,
}) {
    const giftMinutesGate = (() => {
        if (isDepartmentHead || !project?.use_gift_minutes) return null;
        const hasGiftDates = project.gift_minutes_date_from && project.gift_minutes_date_to;
        const overlaps = hasGiftDates &&
            reportRun.date_from <= project.gift_minutes_date_to &&
            reportRun.date_to >= project.gift_minutes_date_from;
        const isLocked = reportRun.is_final || project.status === 'closed';
        const isDisabled = !overlaps || isLocked;
        const tooltipTitle = !hasGiftDates
            ? 'Set gift minutes date range in project settings first'
            : !overlaps
                ? 'Report period does not overlap with gift minutes date range'
                : isLocked
                    ? 'Cannot calculate for finalized reports'
                    : 'Apply gift minutes rule to all employees (Calculation logic: < 30 mins = full, >= 30 mins = 15 mins capped)';
        return { isDisabled, tooltipTitle };
    })();

    return (
        <Card className="border border-slate-200 shadow-sm rounded-xl bg-white">
            <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center flex-1">
                        <div className="relative flex-1 max-w-xl">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by ID or name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={riskFilter} onValueChange={setRiskFilter}>
                            <SelectTrigger className="w-full sm:w-64">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Employees</SelectItem>
                                <SelectItem value="high-risk">High Risk ({`>`}2 LOP or {`>`}120 min)</SelectItem>
                                <SelectItem value="clean">Clean Records (0 issues)</SelectItem>
                                <SelectItem value="unverified">Unverified Only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-start xl:justify-end">
                    {isAstra && (
                        <div className="flex items-center gap-2 border-l border-slate-200 pl-3 ml-1">
                            <span className="text-xs text-slate-500">Early Checkout:</span>
                            {selectedRowIds.length > 0 && (
                                <>
                                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onBulkSkipEarlyCheckout(true, selectedResults)}>
                                        Skip Selected ({selectedRowIds.length})
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onBulkSkipEarlyCheckout(false, selectedResults)}>
                                        Restore Selected ({selectedRowIds.length})
                                    </Button>
                                </>
                            )}
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onBulkSkipEarlyCheckout(true)}>
                                Skip All
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onBulkSkipEarlyCheckout(false)}>
                                Restore All
                            </Button>
                        </div>
                    )}
                    <Button onClick={onVerifyAllClean} variant="outline" size="sm">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Verify All Clean
                    </Button>
                    <Button onClick={onVerifyAll} variant="outline" size="sm">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Verify All
                    </Button>
                    {giftMinutesGate && (
                        <Button
                            onClick={onCalculateAllGiftMinutes}
                            variant="outline"
                            size="sm"
                            disabled={giftMinutesGate.isDisabled}
                            title={giftMinutesGate.tooltipTitle}
                            className={giftMinutesGate.isDisabled ? 'opacity-50' : ''}
                        >
                            <Zap className="w-4 h-4 mr-2" />
                            Calculate Gift Minutes
                        </Button>
                    )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}