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
        <div className="flex gap-2">
            {isAstra && !isDepartmentHead && (
                <Button
                    size="sm"
                    variant="outline"
                    onClick={onZeroEarlyMinutes}
                    disabled={isZeroingEarlyMin || resultsLoading}
                    className="text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
                    title={selectedRowIds.length > 0 ? `Zero early minutes for ${selectedRowIds.length} selected` : 'Zero early minutes for all employees'}
                >
                    {isZeroingEarlyMin
                        ? (<><Loader2 className="w-3 h-3 animate-spin mr-1" />Zeroing...</>)
                        : (<>{selectedRowIds.length > 0 ? `Zero Early (${selectedRowIds.length})` : 'Zero Early Min'}</>)}
                </Button>
            )}
            <Button onClick={onExport} variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
            </Button>
            {project.status !== 'closed' && (
                <>
                    {!reportRun.is_final && (
                        <Button
                            onClick={onSaveReport}
                            disabled={isSaving}
                            className="bg-blue-600 hover:bg-blue-700"
                            title="Save in-report edits as exceptions (no reanalysis)"
                        >
                            {isSaving
                                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>)
                                : (<><Save className="w-4 h-4 mr-2" />Save Report</>)}
                        </Button>
                    )}
                    {!reportRun.is_final && (
                        <Button
                            onClick={onReanalyze}
                            disabled={isReanalyzing}
                            className="bg-indigo-600 hover:bg-indigo-700"
                            title="Re-runs analysis with latest exceptions and shifts"
                        >
                            {isReanalyzing
                                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reanalyzing...</>)
                                : (<><Zap className="w-4 h-4 mr-2" />Reanalyze Report</>)}
                        </Button>
                    )}
                    {!reportRun.is_final && (
                        <Button
                            onClick={onFinalize}
                            disabled={isFinalizing}
                            className="bg-purple-600 hover:bg-purple-700"
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
                            className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                            {isUnfinalizing
                                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Un-finalizing...</>)
                                : (<>Un-finalize Report</>)}
                        </Button>
                    )}
                </>
            )}
        </div>
    );
}