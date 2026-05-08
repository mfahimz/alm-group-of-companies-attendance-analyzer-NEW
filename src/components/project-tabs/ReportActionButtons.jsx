import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Save, Zap, CheckCircle, Loader2 } from 'lucide-react';

/**
 * Toolbar action buttons for the Report Detail header.
 * Extracted from ReportDetailView to keep that file under the line limit.
 */
export default function ReportActionButtons({
    isAstra,
    isDepartmentHead,
    isZeroingEarlyMin,
    resultsLoading,
    selectedRowIds,
    onZeroEarlyMinutes,
    onExport,
    project,
    reportRun,
    isSaving,
    isReanalyzing,
    onSaveReport,
    onReanalyze,
    onFinalize,
    onUnfinalize,
    isFinalizing,
    isUnfinalizing,
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
                {isAstra && !isDepartmentHead && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={onZeroEarlyMinutes}
                        disabled={isZeroingEarlyMin || resultsLoading}
                        title={selectedRowIds.length > 0 ? `Zero early minutes for ${selectedRowIds.length} selected` : 'Zero early minutes for all employees'}
                    >
                        {isZeroingEarlyMin
                            ? (<><Loader2 className="w-3 h-3 animate-spin mr-1" />Zeroing...</>)
                            : (<>{selectedRowIds.length > 0 ? `Zero Early (${selectedRowIds.length})` : 'Zero Early Min'}</>)}
                    </Button>
                )}
                <Button onClick={onExport} variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                </Button>
                {project.status !== 'closed' && !reportRun.is_final && (
                    <>
                        <Button
                            onClick={onSaveReport}
                            disabled={isSaving}
                            size="sm"
                            title="Save in-report edits as exceptions (no reanalysis)"
                        >
                            {isSaving
                                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>)
                                : (<><Save className="w-4 h-4 mr-2" />Save Report</>)}
                        </Button>
                        <Button
                            onClick={onReanalyze}
                            disabled={isReanalyzing}
                            variant="outline"
                            size="sm"
                            title="Re-runs analysis with latest exceptions and shifts"
                        >
                            {isReanalyzing
                                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reanalyzing...</>)
                                : (<><Zap className="w-4 h-4 mr-2" />Reanalyze</>)}
                        </Button>
                    </>
                )}
            </div>

            {project.status !== 'closed' && (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                    {!reportRun.is_final && (
                        <Button
                            onClick={onFinalize}
                            disabled={isFinalizing}
                            variant="outline"
                            size="sm"
                            title="Finalize report for salary calculation"
                        >
                            {isFinalizing
                                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Finalizing...</>)
                                : (<><CheckCircle className="w-4 h-4 mr-2" />Finalize Report</>)}
                        </Button>
                    )}
                    {reportRun.is_final && (
                        <Button
                            onClick={onUnfinalize}
                            disabled={isUnfinalizing}
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-700 hover:bg-red-50"
                        >
                            {isUnfinalizing
                                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Un-finalizing...</>)
                                : (<>Un-finalize Report</>)}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}