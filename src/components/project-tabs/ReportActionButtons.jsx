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
        <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">Safe actions</p>
                <div className="flex flex-wrap gap-2">
                    {isAstra && !isDepartmentHead && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onZeroEarlyMinutes}
                            disabled={isZeroingEarlyMin || resultsLoading}
                            className="text-xs h-10 rounded-2xl border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold"
                            title={selectedRowIds.length > 0 ? `Zero early minutes for ${selectedRowIds.length} selected` : 'Zero early minutes for all employees'}
                        >
                            {isZeroingEarlyMin
                                ? (<><Loader2 className="w-3 h-3 animate-spin mr-1" />Zeroing...</>)
                                : (<>{selectedRowIds.length > 0 ? `Zero Early (${selectedRowIds.length})` : 'Zero Early Min'}</>)}
                        </Button>
                    )}
                    <Button onClick={onExport} variant="outline" className="h-10 rounded-2xl bg-white text-slate-900 border-white hover:bg-slate-100 font-bold shadow-sm">
                        <Download className="w-4 h-4 mr-2" />
                        Export
                    </Button>
                    {project.status !== 'closed' && !reportRun.is_final && (
                        <>
                            <div className="basis-full h-px bg-white/10 my-1" />
                            <Button
                                onClick={onSaveReport}
                                disabled={isSaving}
                                className="h-10 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-black shadow-lg shadow-blue-950/30"
                                title="Save in-report edits as exceptions (no reanalysis)"
                            >
                                {isSaving
                                    ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>)
                                    : (<><Save className="w-4 h-4 mr-2" />Save Report</>)}
                            </Button>
                            <Button
                                onClick={onReanalyze}
                                disabled={isReanalyzing}
                                className="h-10 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white font-black shadow-lg shadow-indigo-950/30"
                                title="Re-runs analysis with latest exceptions and shifts"
                            >
                                {isReanalyzing
                                    ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Reanalyzing...</>)
                                    : (<><Zap className="w-4 h-4 mr-2" />Reanalyze Report</>)}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {project.status !== 'closed' && (
                <div className="rounded-3xl border border-purple-300/30 bg-purple-500/15 p-4">
                    <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-purple-100">Finalization controls</p>
                    <div className="flex flex-wrap gap-2">
                        {!reportRun.is_final && (
                            <Button
                                onClick={onFinalize}
                                disabled={isFinalizing}
                                className="h-11 rounded-2xl bg-purple-500 hover:bg-purple-400 text-white font-black shadow-xl shadow-purple-950/40"
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
                                className="h-11 rounded-2xl border-red-300 bg-red-50 text-red-700 hover:bg-red-100 font-black shadow-sm"
                            >
                                {isUnfinalizing
                                    ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Un-finalizing...</>)
                                    : (<>Un-finalize Report</>)}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}