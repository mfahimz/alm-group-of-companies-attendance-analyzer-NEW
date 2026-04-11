import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * BUG FIX #1: Recalculate deductible minutes for a report
 * 
 * When shifts or exceptions change after report generation, this function
 * recalculates late/early/other minutes and deductible minutes for all employees
 * in the report, preserving all other analysis data.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { report_run_id } = await req.json();

        if (!report_run_id) {
            return Response.json({ error: 'report_run_id is required' }, { status: 400 });
        }

        // Fetch report run
        const reportRuns = await base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id });
        if (reportRuns.length === 0) {
            return Response.json({ error: 'Report not found' }, { status: 404 });
        }
        const reportRun = reportRuns[0];

        // Trigger a full re-analysis by calling runAnalysis again
        // This will overwrite the existing AnalysisResult records with updated values
        const { data: analysisResult } = await base44.asServiceRole.functions.invoke('runAnalysis', {
            project_id: reportRun.project_id,
            date_from: reportRun.date_from,
            date_to: reportRun.date_to,
            report_name: reportRun.report_name,
            _existing_report_run_id: report_run_id // Special flag to update existing report
        });

        if (!analysisResult.success) {
            return Response.json({ 
                error: 'Recalculation failed', 
                details: analysisResult.error 
            }, { status: 500 });
        }

        // Log audit
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'RECALCULATE_REPORT_DEDUCTIBLES',
            entity_type: 'ReportRun',
            entity_id: report_run_id,
            details: `Recalculated deductible minutes after shift/exception changes`
        });

        return Response.json({
            success: true,
            message: 'Report recalculated successfully',
            report_run_id: report_run_id
        });

    } catch (error) {
        console.error('[recalculateReportDeductibles] Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});