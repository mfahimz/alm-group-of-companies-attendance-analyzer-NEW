import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * MARK FINAL REPORT
 * 
 * SIMPLE: Just marks the report as final. NO attendance recalculation.
 * The frontend writes the exact UI values to AnalysisResult BEFORE calling this.
 * createSalarySnapshots reads from AnalysisResult AS-IS.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { report_run_id, project_id } = await req.json();

        if (!report_run_id || !project_id) {
            return Response.json({ error: 'report_run_id and project_id are required' }, { status: 400 });
        }

        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Fetch all report runs for this project once to use in validation and loop
        const allReports = await base44.asServiceRole.entities.ReportRun.filter({
            project_id: project_id
        }, null, 5000);

        // BUSINESS LOGIC: Date-Range Protection & Conflict Prevention
        const targetReport = allReports.find(r => r.id === report_run_id);
        if (targetReport) {
            const newFrom = new Date(targetReport.date_from);
            const newTo = new Date(targetReport.date_to);
            const projectFrom = new Date(projects[0].date_from);
            const projectTo = new Date(projects[0].date_to);

            // Exception: If the report covers the entire project range, bypass the blocking rule
            const isFullProjectRange = 
                newFrom.toISOString().split('T')[0] === projectFrom.toISOString().split('T')[0] && 
                newTo.toISOString().split('T')[0] === projectTo.toISOString().split('T')[0];

            if (!isFullProjectRange) {
                const overlappingReport = allReports.find(run => {
                    if (!run.is_saved || run.id === report_run_id) return false;
                    const savedFrom = new Date(run.date_from);
                    const savedTo = new Date(run.date_to);
                    return (newFrom <= savedTo) && (newTo >= savedFrom);
                });

                if (overlappingReport) {
                    const rangeText = `${new Date(overlappingReport.date_from).toLocaleDateString()} - ${new Date(overlappingReport.date_to).toLocaleDateString()}`;
                    return Response.json({ 
                        success: false, 
                        error: `Validation Failed: This report overlaps with an already saved report (${rangeText}). Conflict prevention blocks this operation.`
                    }, { status: 400 });
                }
            }
        }

        // Unmark all existing final reports for this project
        for (const report of allReports) {
            if (report.is_final) {
                await base44.asServiceRole.entities.ReportRun.update(report.id, {
                    is_final: false
                });
            }
        }

        // Mark the selected report as final
        const nowUAE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })).toISOString();
        await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
            is_final: true,
            is_saved: true, // A finalized report is also a saved report
            finalized_by: user.email,
            finalized_date: nowUAE,
            recalculation_version: 0
        });

        await base44.asServiceRole.entities.Project.update(project_id, {
            last_saved_report_id: report_run_id
        });

        // Audit log
        try {
            await base44.asServiceRole.functions.invoke('logAudit', {
                action: 'MARK_FINAL_REPORT',
                entity_type: 'ReportRun',
                entity_id: report_run_id,
                details: `Marked report as final for project ${project_id}. UI values already synced to AnalysisResult by frontend.`
            });
        } catch (auditError) {
            console.warn('[markFinalReport] Audit log failed:', auditError.message);
        }

        return Response.json({ 
            success: true,
            ready_for_snapshots: true,
            message: 'Report marked as final. Ready for snapshot creation.'
        });

    } catch (error) {
        console.error('Mark final report error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});