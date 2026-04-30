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
        <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
                <div className="flex gap-3 items-center">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search by ID or name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Select value={riskFilter} onValueChange={setRiskFilter}>
                        <SelectTrigger className="w-48">
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
                    {isAstra && (
                        <div className="flex items-center gap-2 border-l pl-3 ml-1">
                            <span className="text-xs text-slate-500 font-medium">Early Checkout:</span>
                            {selectedRowIds.length > 0 && (
                                <>
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => onBulkSkipEarlyCheckout(true, selectedResults)}>
                                        Skip Selected ({selectedRowIds.length})
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => onBulkSkipEarlyCheckout(false, selectedResults)}>
                                        Restore Selected ({selectedRowIds.length})
                                    </Button>
                                </>
                            )}
                            <Button variant="outline" size="sm" className="h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => onBulkSkipEarlyCheckout(true)}>
                                Skip All
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => onBulkSkipEarlyCheckout(false)}>
                                Restore All
                            </Button>
                        </div>
                    )}
                    <Button onClick={onVerifyAllClean} variant="outline" size="sm">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Verify All Clean
                    </Button>
                    <Button onClick={onVerifyAll} variant="outline" size="sm" className="border-purple-300 text-purple-700 hover:bg-purple-50">
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
                            className={`border-indigo-200 text-indigo-600 font-bold ${giftMinutesGate.isDisabled ? 'opacity-50' : 'hover:bg-indigo-50'}`}
                        >
                            <Zap className="w-4 h-4 mr-2" />
                            Calculate Gift Minutes
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}