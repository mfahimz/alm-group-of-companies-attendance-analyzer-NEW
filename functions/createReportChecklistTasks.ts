import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * createReportChecklistTasks
 *
 * Entity automation function triggered on SalaryReport create and update events.
 * For Al Maraghi Motors projects ONLY, this function auto-creates two distinct
 * types of checklist tasks — "LOP Days" and "Other Minutes" — for each employee
 * in the report whose values exceed zero.
 *
 * ============================================================================
 * SCOPE: AL MARAGHI MOTORS ONLY
 * ============================================================================
 * This entire function is gated behind a company check. If the project
 * associated with the saved report belongs to any company other than
 * "Al Maraghi Motors", the function exits immediately without creating,
 * modifying, or deleting any checklist tasks. All other company reports
 * are unaffected.
 *
 * ============================================================================
 * USE CASE: Report saved for the first time with LOP days and other minutes
 * ============================================================================
 * When a SalaryReport is created for an Al Maraghi Motors project, this
 * function fires via entity automation. It reads the snapshot_data (a JSON
 * array containing one record per employee). For each employee:
 * - If full_absence_count > 0, a "LOP Days" task is created with the
 *   employee's name, the LOP day count, and report context (period, project).
 * - If other_minutes > 0, a separate "Other Minutes" task is created with
 *   the employee's name, the minute count, and the same report context.
 * These are always two separate tasks — they are never combined into one.
 *
 * ============================================================================
 * USE CASE: Same report saved again with identical values
 * ============================================================================
 * When a SalaryReport is updated (via regenerateSalaryReport or any other
 * save path), this function fires again. It first deletes all previously
 * auto-created "LOP Days" and "Other Minutes" tasks for the project, then
 * recreates them fresh from the current snapshot_data. Even if the values
 * have not changed, the old tasks are always deleted and recreated to ensure
 * the tasks are always in sync with the latest report state.
 *
 * ============================================================================
 * USE CASE: Same report saved again with changed values
 * ============================================================================
 * If an employee's LOP days or other minutes change between saves (e.g., due
 * to corrections in attendance data), the old task is deleted and a new one
 * is created with the updated value. The user will see the new task with the
 * correct current value.
 *
 * ============================================================================
 * USE CASE: Values dropping to zero on re-save
 * ============================================================================
 * If an employee's full_absence_count drops to zero or below on a subsequent
 * save, their existing "LOP Days" task is deleted and no new task is created.
 * The same applies to other_minutes. Employees with zero values do not get a
 * checklist task.
 *
 * ============================================================================
 * USE CASE: Multiple employees in the same report with different values
 * ============================================================================
 * The function iterates through every row in the report's snapshot_data.
 * Each employee is evaluated independently. Some employees may get a
 * "LOP Days" task only, some an "Other Minutes" task only, some both, and
 * some neither — depending on their individual values. Up to two tasks are
 * created per employee (one per task type), never combined.
 *
 * ============================================================================
 * USE CASE: Report belonging to a non-Al Maraghi Motors company
 * ============================================================================
 * If the project's company field is anything other than "Al Maraghi Motors",
 * the function returns immediately with a skip message. No tasks are created,
 * deleted, or modified. This is a strict guard that applies regardless of
 * report content.
 *
 * ============================================================================
 * USE CASE: Payload too large during entity automation
 * ============================================================================
 * Entity automations in this system may pass the triggering entity's data
 * as part of the event payload. However, SalaryReport.snapshot_data is a
 * large JSON string that can grow very large (one row per employee × all
 * salary fields). When the payload exceeds the automation system's size
 * limit, the event.data object may be absent, incomplete, or missing key
 * fields like snapshot_data.
 *
 * To handle this, we always check whether event.data contains the required
 * fields before trusting it. If snapshot_data is missing or project_id is
 * absent, we fetch the full SalaryReport entity explicitly from the database
 * using the event.entity_id. This guarantees we always have complete data
 * regardless of payload size constraints.
 *
 * This two-path approach (use payload if complete, fetch if not) is the
 * recommended pattern for entity automations in this system when the entity
 * being observed may carry large JSON payloads.
 *
 * ============================================================================
 * BATCHING
 * ============================================================================
 * Delete and create operations are batched with a small delay (150ms) between
 * each to avoid hitting API rate limits, especially when multiple employees
 * have both LOP days and other minutes.
 * ============================================================================
 */

// Small delay between sequential API operations to avoid rate limits
const BATCH_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const body = await req.json();
        const event = body?.event;

        if (!event || !event.entity_id) {
            return Response.json({ error: 'Missing event or entity_id' }, { status: 400 });
        }

        const salaryReportId = event.entity_id;

        // =====================================================================
        // PAYLOAD SIZE CHECK
        // =====================================================================
        // Entity automations pass the triggering entity's data in event.data.
        // SalaryReport.snapshot_data is a large JSON string that can exceed the
        // automation system's payload size limit. When it does, event.data is
        // absent or incomplete.
        //
        // We check whether event.data has the two fields we need:
        //   - project_id (to look up the project and check company)
        //   - snapshot_data (the employee salary data array)
        //
        // If either is missing, we fetch the full SalaryReport explicitly from
        // the database. This is necessary because:
        // 1. Large payloads can be silently truncated or omitted by the platform
        // 2. snapshot_data is often 10-50 KB+ for larger companies
        // 3. Relying on an incomplete payload would cause incorrect task creation
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
            // USE CASE: Payload too large — fetch the full report from the database
            console.log(`[createReportChecklistTasks] Payload missing or incomplete for report ${salaryReportId}, fetching explicitly`);
            const reports = await base44.asServiceRole.entities.SalaryReport.filter({
                id: salaryReportId
            });

            if (reports.length === 0) {
                return Response.json({ message: 'SalaryReport not found', skipped: true });
            }
            reportData = reports[0];
        }

        const projectId = reportData.project_id;
        if (!projectId) {
            return Response.json({ message: 'Report has no project_id, skipping' });
        }

        // =====================================================================
        // AL MARAGHI MOTORS GUARD
        // =====================================================================
        // USE CASE: Report belonging to a non-Al Maraghi Motors company
        // Fetch the project to confirm the company. If it is not Al Maraghi
        // Motors, exit immediately — no tasks are created, deleted, or touched.
        // =====================================================================
        const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (projects.length === 0) {
            return Response.json({ message: 'Project not found, skipping' });
        }
        const project = projects[0];

        if (project.company !== 'Al Maraghi Motors') {
            // Non-Al Maraghi Motors project — this function does nothing
            return Response.json({
                success: true,
                skipped: true,
                message: `Company "${project.company}" is not Al Maraghi Motors, no tasks created`
            });
        }

        // =====================================================================
        // PARSE SNAPSHOT DATA
        // =====================================================================
        // snapshot_data is a JSON string containing one object per employee.
        // Each object includes attendance and salary fields from SalarySnapshot.
        // Key fields used here:
        //   - name: employee display name
        //   - attendance_id: unique identifier
        //   - full_absence_count: number of full absence (LOP) days
        //   - other_minutes: unexplained/other attendance minutes
        // =====================================================================
        let snapshotRows: any[] = [];
        try {
            snapshotRows = JSON.parse(reportData.snapshot_data || '[]');
        } catch (parseError) {
            console.error('[createReportChecklistTasks] Failed to parse snapshot_data:', parseError);
            return Response.json({ error: 'Invalid snapshot_data JSON' }, { status: 500 });
        }

        if (!Array.isArray(snapshotRows) || snapshotRows.length === 0) {
            return Response.json({
                success: true,
                message: 'No employee rows in snapshot_data, nothing to create'
            });
        }

        // =====================================================================
        // DELETE EXISTING AUTO-CREATED TASKS FOR THIS PROJECT
        // =====================================================================
        // On every save (first or subsequent), we delete all previously
        // auto-created "LOP Days" and "Other Minutes" tasks for this project,
        // then recreate fresh from the current snapshot_data.
        //
        // WHY DELETE ALL FOR THE PROJECT (not just for this specific report):
        // Multiple SalaryReport versions may exist for the same project, but
        // the checklist should always reflect the most recently saved state.
        // Keying by project_id + task_type + is_auto_created is the safest
        // filter that avoids touching manually-created tasks of the same type
        // (which will have is_auto_created = false or undefined).
        //
        // USE CASE: Same report saved again with identical values
        // Old tasks are deleted and recreated even if values haven't changed.
        //
        // USE CASE: Values dropping to zero on re-save
        // The old task is deleted below. No new task will be created in the
        // next step because the zero-check will fail.
        // =====================================================================
        const allProjectTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
            project_id: projectId
        });

        const tasksToDelete = allProjectTasks.filter((t: any) =>
            t.is_auto_created === true &&
            (t.task_type === 'LOP Days' || t.task_type === 'Other Minutes')
        );

        let deletedCount = 0;
        for (const task of tasksToDelete) {
            try {
                await base44.asServiceRole.entities.ChecklistItem.delete(task.id);
                deletedCount++;
            } catch (deleteError: any) {
                // Task may have already been deleted — skip silently
                console.warn(`[createReportChecklistTasks] Task ${task.id} not found or already deleted, skipping:`, deleteError.message);
            }

            if (tasksToDelete.indexOf(task) < tasksToDelete.length - 1) {
                await sleep(BATCH_DELAY_MS);
            }
        }

        // Small delay between delete phase and create phase
        if (deletedCount > 0) {
            await sleep(BATCH_DELAY_MS);
        }

        // =====================================================================
        // CREATE NEW TASKS FROM CURRENT SNAPSHOT
        // =====================================================================
        // Iterate through each employee row in the snapshot_data.
        // For each employee, independently evaluate LOP days and other minutes.
        // Create at most two tasks per employee — one per task type.
        // Tasks are NEVER combined. An employee can receive both, one, or neither.
        //
        // Report context included in every task description:
        //   - Report name (identifies which salary run this belongs to)
        //   - Report period (date_from to date_to)
        //   - Project information (for cross-referencing)
        //   - Relevant metric value (LOP days or other minutes)
        //
        // USE CASE: Multiple employees in the same report with different values
        // Each row is evaluated independently. The loop handles all combinations.
        // =====================================================================
        const reportName = reportData.report_name || 'Salary Report';
        const reportPeriod = (reportData.date_from && reportData.date_to)
            ? `${reportData.date_from} to ${reportData.date_to}`
            : 'Period not specified';
        const projectName = project.name || projectId;

        let lopCreated = 0;
        let otherMinutesCreated = 0;

        for (const employee of snapshotRows) {
            const employeeName = employee.name || employee.attendance_id || 'Unknown';
            const attendanceId = employee.attendance_id || '';

            const lopDays = Number(employee.full_absence_count) || 0;
            const otherMinutes = Number(employee.other_minutes) || 0;

            // ---------------------------------------------------------------
            // LOP DAYS TASK
            // ---------------------------------------------------------------
            // USE CASE: Employee has full_absence_count > 0
            // A "LOP Days" task is created with full context for action.
            //
            // USE CASE: full_absence_count is zero or below on re-save
            // This block is skipped — no task created, old one already deleted.
            // ---------------------------------------------------------------
            if (lopDays > 0) {
                const lopDescription = [
                    `${employeeName}`,
                    `LOP Days: ${lopDays}`,
                    `Report: ${reportName}`,
                    `Period: ${reportPeriod}`
                ].join(' | ');

                const lopNotes = [
                    `Employee: ${employeeName}`,
                    `Attendance ID: ${attendanceId}`,
                    `Loss of Pay Days: ${lopDays}`,
                    `Report Name: ${reportName}`,
                    `Report Period: ${reportPeriod}`,
                    `Project: ${projectName}`,
                    `Company: ${project.company}`,
                    `Department: ${employee.department || 'N/A'}`,
                    `Present Days: ${employee.present_days || 0} / ${employee.working_days || 0} working days`,
                    '',
                    'Action Required: Review the loss of pay days for this employee.',
                    'Verify attendance records and confirm whether LOP deduction should be applied.',
                    '',
                    '[Auto-created] This task was automatically generated when the salary report was saved.',
                    'It will be deleted and recreated on the next report save.'
                ].join('\n');

                try {
                    await base44.asServiceRole.entities.ChecklistItem.create({
                        project_id: projectId,
                        task_type: 'LOP Days',
                        task_description: lopDescription,
                        status: 'pending',
                        is_predefined: false,
                        is_auto_created: true,
                        notes: lopNotes
                    });
                    lopCreated++;
                } catch (createError: any) {
                    // Log internally — do not surface to user
                    console.error(`[createReportChecklistTasks] Failed to create LOP Days task for ${employeeName}:`, createError.message);
                }

                await sleep(BATCH_DELAY_MS);
            }

            // ---------------------------------------------------------------
            // OTHER MINUTES TASK
            // ---------------------------------------------------------------
            // USE CASE: Employee has other_minutes > 0
            // A separate "Other Minutes" task is created. This is never
            // combined with the LOP Days task — always a distinct task.
            //
            // USE CASE: other_minutes is zero or below on re-save
            // This block is skipped — no task created, old one already deleted.
            // ---------------------------------------------------------------
            if (otherMinutes > 0) {
                const otherMinutesDescription = [
                    `${employeeName}`,
                    `Other Minutes: ${otherMinutes} min`,
                    `Report: ${reportName}`,
                    `Period: ${reportPeriod}`
                ].join(' | ');

                const otherMinutesHours = Math.floor(otherMinutes / 60);
                const otherMinutesRemainder = otherMinutes % 60;
                const otherMinutesFormatted = otherMinutesHours > 0
                    ? `${otherMinutesHours}h ${otherMinutesRemainder}min`
                    : `${otherMinutes}min`;

                const otherMinutesNotes = [
                    `Employee: ${employeeName}`,
                    `Attendance ID: ${attendanceId}`,
                    `Other Minutes: ${otherMinutes} min (${otherMinutesFormatted})`,
                    `Report Name: ${reportName}`,
                    `Report Period: ${reportPeriod}`,
                    `Project: ${projectName}`,
                    `Company: ${project.company}`,
                    `Department: ${employee.department || 'N/A'}`,
                    '',
                    'Action Required: Review the other minutes for this employee.',
                    'Other minutes represent attendance time that falls outside standard categorisation.',
                    'Confirm whether these minutes should be approved, deducted, or reclassified.',
                    '',
                    '[Auto-created] This task was automatically generated when the salary report was saved.',
                    'It will be deleted and recreated on the next report save.'
                ].join('\n');

                try {
                    await base44.asServiceRole.entities.ChecklistItem.create({
                        project_id: projectId,
                        task_type: 'Other Minutes',
                        task_description: otherMinutesDescription,
                        status: 'pending',
                        is_predefined: false,
                        is_auto_created: true,
                        notes: otherMinutesNotes
                    });
                    otherMinutesCreated++;
                } catch (createError: any) {
                    // Log internally — do not surface to user
                    console.error(`[createReportChecklistTasks] Failed to create Other Minutes task for ${employeeName}:`, createError.message);
                }

                await sleep(BATCH_DELAY_MS);
            }
        }

        return Response.json({
            success: true,
            deleted: deletedCount,
            lop_tasks_created: lopCreated,
            other_minutes_tasks_created: otherMinutesCreated,
            total_created: lopCreated + otherMinutesCreated,
            employees_processed: snapshotRows.length,
            message: `Deleted ${deletedCount} stale tasks. Created ${lopCreated} LOP Days + ${otherMinutesCreated} Other Minutes tasks for ${snapshotRows.length} employees`
        });

    } catch (error: any) {
        console.error('[createReportChecklistTasks] Unhandled error:', error);
        return Response.json({
            error: error.message,
            details: error.stack
        }, { status: 500 });
    }
});
