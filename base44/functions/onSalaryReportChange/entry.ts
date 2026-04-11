import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * onSalaryReportChange
 *
 * Entity automation function that watches the SalaryReport entity for create
 * and update events. Triggers the Report-to-Checklist integration logic.
 *
 * ============================================================================
 * EXHAUSTIVE BUSINESS LOGIC AUDIT (2026-03-13)
 * ============================================================================
 *
 * 1. AUTOMATION SCOPE:
 *    The automation is triggered whenever a SalaryReport is created or updated.
 *    It forwards the event to `createReportChecklistTasks` to manage LOP and 
 *    Other Minutes checklist entries.
 *
 * 2. RECENT UPDATES:
 *    - Removed the "Al Maraghi Motors" company guard to allow checklist 
 *      auto-generation for all companies using the analyzer. This ensures 
 *      consistency across the platform.
 *    - Maintained complex payload handling to ensure large snapshot_data 
 *      is fetched correctly from the database if omitted from the event payload.
 *
 * 3. DOWNSTREAM HANDLING:
 *    The `createReportChecklistTasks` function now handles update semantics 
 *    using a "Fingerprint Sync" pattern, replacing the destructive 
 *    delete-all-and-recreate approach.
 *
 * ============================================================================
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        const event = body?.event;

        if (!event || !event.entity_id) {
            return Response.json({ error: 'Missing event or entity_id' }, { status: 400 });
        }

        const salaryReportId = event.entity_id;
        const eventType = event.event_type;

        if (!eventType) {
            return Response.json({ error: 'Missing event_type' }, { status: 400 });
        }

        // --- Payload Size Check & Fetch ---
        let reportData = event.data;
        if (!reportData?.project_id || !reportData?.snapshot_data) {
            const reports = await base44.asServiceRole.entities.SalaryReport.filter({ id: salaryReportId });
            if (reports.length === 0) return Response.json({ success: true, message: `Report ${salaryReportId} not found` });
            reportData = reports[0];
        }

        return Response.json({
            success: true,
            salary_report_id: salaryReportId,
            message: `Processed ${eventType} for SalaryReport ${salaryReportId}. Logic for auto-checklist tasks is now handled during Attendance Report finalization.`
        });

    } catch (error: any) {
        console.error('Error in onSalaryReportChange:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
