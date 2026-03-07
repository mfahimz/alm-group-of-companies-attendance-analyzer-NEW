import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * onSalaryReportChange
 *
 * Entity automation function that watches the SalaryReport entity for create
 * and update events. This automation replaces the previous manual trigger
 * where createReportChecklistTasks had to be invoked explicitly (e.g., via a
 * UI action or as a side-effect of another function call). With this
 * automation in place, checklist tasks for LOP Days and Other Minutes are
 * created and refreshed automatically whenever a salary report is saved.
 *
 * ============================================================================
 * EVENT TYPES HANDLED
 * ============================================================================
 *
 * 1. CREATE — When a new salary report is saved for the first time:
 *    The automation resolves the report data (from payload or DB), checks the
 *    company, and if the report belongs to Al Maraghi Motors, forwards the
 *    event to createReportChecklistTasks which creates "LOP Days" and
 *    "Other Minutes" checklist tasks for qualifying employees.
 *
 * 2. UPDATE — When an existing salary report is re-saved or regenerated:
 *    Same flow as create. The createReportChecklistTasks function handles
 *    update semantics internally — it deletes all previously auto-created
 *    "LOP Days" and "Other Minutes" tasks for the project and recreates
 *    them fresh from the current snapshot_data.
 *
 * ============================================================================
 * AL MARAGHI MOTORS EARLY EXIT (AUTOMATION LEVEL)
 * ============================================================================
 * The createReportChecklistTasks function already contains an internal
 * Al Maraghi Motors company check that exits early for non-matching
 * companies. However, this automation adds an ADDITIONAL company check at
 * the automation level, BEFORE the function is even invoked. This serves
 * as an extra safety layer:
 *
 * 1. It avoids an unnecessary function invocation for every non-Al Maraghi
 *    Motors salary report save, reducing API call volume and latency.
 * 2. It provides defense-in-depth — even if the inner function's guard were
 *    accidentally removed or bypassed, the automation-level check would
 *    still prevent unintended task creation for other companies.
 * 3. The company check requires fetching the Project entity (since
 *    SalaryReport stores project_id, not company directly). This fetch
 *    happens once here; the inner function would do the same fetch again.
 *    By checking early, we avoid the redundant fetch for non-matching
 *    companies entirely.
 *
 * ============================================================================
 * PAYLOAD SIZE CHECK
 * ============================================================================
 * Entity automations pass the triggering entity's data in event.data.
 * SalaryReport.snapshot_data is a large JSON string (one row per employee ×
 * all salary fields) that can grow to 10-50 KB+ for larger companies. When
 * the payload exceeds the automation system's size limit, event.data may be
 * absent, incomplete, or missing key fields like snapshot_data.
 *
 * This automation checks whether event.data contains the required fields:
 *   - project_id (to look up the project and verify company)
 *   - snapshot_data (the employee salary data, needed by the downstream
 *     function — though the function also has its own fallback fetch)
 *
 * If either field is missing, the automation fetches the full SalaryReport
 * entity from the database using event.entity_id before proceeding. This
 * guarantees we always have complete data for the company check, and that
 * we can pass a complete event to the downstream function.
 *
 * This two-path approach (use payload if complete, fetch if not) is the
 * recommended pattern for entity automations in this system when the entity
 * being observed may carry large JSON payloads.
 *
 * ============================================================================
 * FUNCTION INVOCATION
 * ============================================================================
 * After the company check passes, this automation invokes
 * createReportChecklistTasks by forwarding the entity event in the same
 * format the function expects (body.event with entity_id and data).
 * If the payload was fetched from the database (due to size limits), the
 * fetched data is passed as event.data so the downstream function does not
 * need to re-fetch it.
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
        const eventType = event.event_type; // 'create' or 'update'

        if (!eventType) {
            return Response.json({ error: 'Missing event_type' }, { status: 400 });
        }

        // =====================================================================
        // PAYLOAD SIZE CHECK
        // =====================================================================
        // Entity automations pass the triggering entity's data in event.data.
        // SalaryReport.snapshot_data is a large JSON string that can exceed the
        // automation system's payload size limit. When it does, event.data is
        // absent or incomplete.
        //
        // We check whether event.data has the two fields we need for the
        // automation-level company check and for forwarding to the function:
        //   - project_id (to look up the project and check company)
        //   - snapshot_data (the employee salary data array)
        //
        // If either is missing, we fetch the full SalaryReport explicitly from
        // the database. This is necessary because:
        // 1. Large payloads can be silently truncated or omitted by the platform
        // 2. snapshot_data is often 10-50 KB+ for larger companies
        // 3. Without project_id we cannot perform the company check
        // =====================================================================
        let reportData: any;

        const eventData = event.data;
        const payloadHasRequiredFields =
            eventData &&
            typeof eventData === 'object' &&
            eventData.project_id &&
            eventData.snapshot_data &&
            typeof eventData.snapshot_data === 'string' &&
            eventData.snapshot_data.length > 2;

        if (payloadHasRequiredFields) {
            // Payload is complete — use it directly to avoid an extra DB round-trip
            reportData = eventData;
        } else {
            // Payload incomplete or too large — fetch the full report from the database
            console.log(`[onSalaryReportChange] Payload missing or incomplete for report ${salaryReportId}, fetching explicitly`);
            const reports = await base44.asServiceRole.entities.SalaryReport.filter({
                id: salaryReportId
            });

            if (reports.length === 0) {
                return Response.json({
                    success: true,
                    message: `SalaryReport ${salaryReportId} not found, skipping`
                });
            }
            reportData = reports[0];
        }

        const projectId = reportData.project_id;
        if (!projectId) {
            return Response.json({
                success: true,
                message: `Report ${salaryReportId} has no project_id, skipping`
            });
        }

        // =====================================================================
        // AL MARAGHI MOTORS EARLY EXIT (AUTOMATION LEVEL)
        // =====================================================================
        // This company check happens at the automation level BEFORE the
        // createReportChecklistTasks function is invoked. This is an additional
        // safety layer on top of the existing company check inside the function
        // itself. It serves three purposes:
        //
        // 1. Avoids an unnecessary function invocation for every non-Al Maraghi
        //    Motors salary report save, reducing API call volume and latency.
        // 2. Provides defense-in-depth — even if the inner function's guard
        //    were accidentally removed, this check would still prevent
        //    unintended task creation for other companies.
        // 3. Eliminates a redundant Project fetch inside the function for
        //    non-matching companies. The function would do the same lookup
        //    only to exit immediately.
        //
        // If the company is not Al Maraghi Motors, we return immediately.
        // No function is invoked, no tasks are created, deleted, or modified.
        // =====================================================================
        const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (projects.length === 0) {
            return Response.json({
                success: true,
                message: `Project ${projectId} not found for report ${salaryReportId}, skipping`
            });
        }
        const project = projects[0];

        if (project.company !== 'Al Maraghi Motors') {
            return Response.json({
                success: true,
                skipped: true,
                message: `Company "${project.company}" is not Al Maraghi Motors — automation exiting without invoking function`
            });
        }

        // =====================================================================
        // INVOKE createReportChecklistTasks
        // =====================================================================
        // This automation replaces the previous manual trigger. The event is
        // forwarded to createReportChecklistTasks in the same format it expects
        // (body.event with entity_id and data). If we fetched the report data
        // from the database (because the original payload was too large or
        // incomplete), we pass the fetched data as event.data so the downstream
        // function does not need to re-fetch it.
        // =====================================================================
        const forwardedEvent = {
            entity_id: salaryReportId,
            event_type: eventType,
            data: reportData
        };

        const result = await base44.asServiceRole.functions.invoke(
            'createReportChecklistTasks',
            { event: forwardedEvent }
        );

        return Response.json({
            success: true,
            event_type: eventType,
            salary_report_id: salaryReportId,
            project_id: projectId,
            company: project.company,
            function_result: result,
            message: `Processed ${eventType} event for SalaryReport ${salaryReportId} (Al Maraghi Motors) — forwarded to createReportChecklistTasks`
        });

    } catch (error: any) {
        console.error('[onSalaryReportChange] Unhandled error:', error);
        return Response.json({
            error: error.message,
            details: error.stack
        }, { status: 500 });
    }
});
