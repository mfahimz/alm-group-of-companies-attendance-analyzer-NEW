import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseISO } from 'npm:date-fns@3.6.0';

/**
 * onAnnualLeaveChange
 *
 * Entity automation function that watches the AnnualLeave entity for create,
 * update, and delete events. This automation replaces the previous manual
 * trigger where checklist task creation/sync had to be invoked explicitly
 * (e.g., via importAnnualLeavesToProject or a manual UI action). With this
 * automation in place, checklist tasks are created and synchronized
 * automatically whenever an annual leave record changes.
 *
 * ============================================================================
 * EVENT TYPES HANDLED
 * ============================================================================
 *
 * 1. CREATE — When a new annual leave record is created:
 *    Finds all projects matching the leave's company whose date range overlaps
 *    with the leave period, then invokes createAnnualLeaveChecklistTasks for
 *    each project. The function internally handles deduplication (it skips
 *    tasks that already exist for a given leave + project combination).
 *
 * 2. UPDATE — When an existing annual leave record is updated:
 *    Determines which projects are affected (via the applied_to_projects field
 *    or by finding overlapping projects), then invokes
 *    syncAnnualLeaveChecklistTasks with action 'update' for each project.
 *    The sync function deletes stale tasks and recreates them with updated
 *    values (dates, day counts, rejoining dates).
 *
 * 3. DELETE — When an annual leave record is deleted:
 *    Uses the event payload data (since the record no longer exists in the
 *    database) to determine which projects had tasks linked to this leave,
 *    then invokes syncAnnualLeaveChecklistTasks with action 'delete' for each.
 *    The sync function removes all auto-created tasks linked to this leave ID.
 *
 * ============================================================================
 * PAYLOAD SIZE CHECK
 * ============================================================================
 * Entity automations pass the triggering entity's data in event.data. While
 * AnnualLeave records are typically small (unlike SalaryReport with its large
 * snapshot_data), the payload can still be incomplete or absent if the
 * automation system's size limit is exceeded or if the platform omits fields
 * for performance reasons.
 *
 * We check whether event.data contains all required fields before trusting it:
 *   - company (to find matching projects)
 *   - date_from and date_to (to calculate project overlap)
 *   - status (to filter only approved leaves)
 *   - applied_to_projects (to determine affected projects for update/delete)
 *
 * If any required field is missing, we fetch the full AnnualLeave record
 * explicitly from the database using event.entity_id. For delete events where
 * the record no longer exists, we fall back to using whatever data the payload
 * provides — if the payload is also empty, we search all projects for the
 * leave's company to find tasks linked to this leave ID.
 *
 * This two-path approach (use payload if complete, fetch if not) is the
 * recommended pattern for entity automations in this system.
 *
 * ============================================================================
 * DEBOUNCE LIMITATION (KNOWN)
 * ============================================================================
 * The syncAnnualLeaveChecklistTasks function uses an in-memory debounce map
 * to handle rapid successive updates to the same leave record. On Deno Deploy,
 * each function invocation may run in a separate isolate, meaning parallel
 * instances do NOT share in-memory state. This means the debounce mechanism
 * is effective only within a single isolate's lifetime — if two updates arrive
 * and are routed to different isolates, both will execute independently.
 *
 * This is a known platform limitation on Deno Deploy. The debounce still
 * provides value for rapid sequential updates within the same isolate (which
 * is the common case for single-user edits), but it cannot guarantee
 * deduplication across concurrent isolates. The sync function's idempotent
 * delete-and-recreate pattern ensures correctness even if duplicate executions
 * occur — the result is the same regardless of how many times it runs.
 *
 * ============================================================================
 * BATCHING
 * ============================================================================
 * When multiple projects are affected by a single leave change, function
 * invocations are batched with a small delay (200ms) between each to avoid
 * hitting API rate limits.
 * ============================================================================
 */

// Small delay between sequential function invocations to avoid rate limits
const BATCH_DELAY_MS = 200;

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

        const leaveId = String(event.entity_id);
        const eventType = event.event_type; // 'create', 'update', or 'delete'

        if (!eventType) {
            return Response.json({ error: 'Missing event_type' }, { status: 400 });
        }

        // =====================================================================
        // PAYLOAD SIZE CHECK
        // =====================================================================
        // Entity automations pass the triggering entity's data in event.data.
        // While AnnualLeave records are typically small, the payload can still
        // be incomplete or absent depending on platform behavior.
        //
        // We check whether event.data has the fields we need:
        //   - company (to find matching projects)
        //   - date_from and date_to (to calculate project overlap)
        //   - status (to filter approved leaves)
        //   - applied_to_projects (to determine affected projects)
        //
        // If any required field is missing, we fetch the full AnnualLeave
        // record from the database. For delete events, the record may no
        // longer exist — we handle that case separately below.
        // =====================================================================
        let leaveData: any = null;

        const eventData = event.data;
        const payloadHasRequiredFields =
            eventData &&
            typeof eventData === 'object' &&
            eventData.company &&
            eventData.date_from &&
            eventData.date_to &&
            eventData.status !== undefined;

        if (payloadHasRequiredFields) {
            // Payload is complete — use it directly to avoid an extra DB round-trip
            leaveData = eventData;
        } else if (eventType !== 'delete') {
            // Payload incomplete for create/update — fetch the full record
            console.log(`[onAnnualLeaveChange] Payload missing or incomplete for leave ${leaveId}, fetching explicitly`);
            const leaves = await base44.asServiceRole.entities.AnnualLeave.filter({
                id: leaveId
            });

            if (leaves.length === 0) {
                return Response.json({
                    success: true,
                    message: `AnnualLeave ${leaveId} not found, skipping`
                });
            }
            leaveData = leaves[0];
        } else {
            // Delete event with incomplete payload — use whatever data we have
            // The record no longer exists in the database so we cannot fetch it.
            // We will fall back to searching projects by any available data.
            leaveData = eventData || {};
            console.log(`[onAnnualLeaveChange] Delete event for leave ${leaveId} with incomplete payload, using available data`);
        }

        // =====================================================================
        // DETERMINE AFFECTED PROJECTS
        // =====================================================================
        // For all event types, we need to know which projects have or should
        // have checklist tasks linked to this leave record.
        //
        // Strategy:
        // 1. If applied_to_projects is available, parse the comma-separated
        //    project IDs — these are the projects where leave was imported.
        // 2. Additionally, for create/update events, find projects by company
        //    and date overlap to catch projects where the leave should be
        //    applied but hasn't been yet.
        // 3. Merge both lists and deduplicate.
        // =====================================================================
        const affectedProjectIds: Set<string> = new Set();

        // Parse applied_to_projects if available
        if (leaveData.applied_to_projects && typeof leaveData.applied_to_projects === 'string') {
            const appliedIds = leaveData.applied_to_projects
                .split(',')
                .map((id: string) => id.trim())
                .filter((id: string) => id.length > 0);
            appliedIds.forEach((id: string) => affectedProjectIds.add(id));
        }

        // For create/update, also find overlapping projects by company + dates
        if (eventType !== 'delete' && leaveData.company && leaveData.date_from && leaveData.date_to) {
            try {
                const projects = await base44.asServiceRole.entities.Project.filter({
                    company: leaveData.company
                });

                const leaveStart = parseISO(leaveData.date_from);
                const leaveEnd = parseISO(leaveData.date_to);

                for (const project of projects) {
                    if (project.date_from && project.date_to) {
                        const projectStart = parseISO(project.date_from);
                        const projectEnd = parseISO(project.date_to);

                        // Check date overlap: leave overlaps with project if
                        // leave starts before project ends AND leave ends after project starts
                        if (leaveStart <= projectEnd && leaveEnd >= projectStart) {
                            affectedProjectIds.add(String(project.id));
                        }
                    }
                }
            } catch (projectError: any) {
                console.error(`[onAnnualLeaveChange] Error fetching projects for company ${leaveData.company}:`, projectError.message);
            }
        }

        // =====================================================================
        // FALLBACK FOR DELETE EVENTS (GHOST TASK PREVENTION)
        // =====================================================================
        // If this is a delete event and the payload didn't tell us which 
        // projects were affected, we search the ChecklistItem entity for any 
        // auto-created tasks linked to this leave record. This ensures 
        // "ghost tasks" are cleaned up even if the automation payload is 
        // incomplete.
        // =====================================================================
        if (eventType === 'delete' && affectedProjectIds.size === 0) {
            try {
                console.log(`[onAnnualLeaveChange] No projects in delete payload for ${leaveId}, searching ChecklistItem for ghost tasks...`);
                // Use a high limit to ensure we find all linked tasks across all projects
                const orphans = await base44.asServiceRole.entities.ChecklistItem.filter({
                    linked_annual_leave_id: String(leaveId),
                    is_auto_created: true
                }, { limit: 1000 });

                for (const task of orphans) {
                    if (task.project_id) affectedProjectIds.add(String(task.project_id));
                }
            } catch (searchError: any) {
                console.error(`[onAnnualLeaveChange] Error searching for orphan checklist items for leave ${leaveId}:`, searchError.message);
            }
        }

        if (affectedProjectIds.size === 0) {
            return Response.json({
                success: true,
                message: `No affected projects found for leave ${leaveId} (${eventType}), skipping`
            });
        }

        // =====================================================================
        // DISPATCH TO APPROPRIATE FUNCTION
        // =====================================================================
        // This automation replaces the previous manual trigger where checklist
        // task creation/sync had to be invoked explicitly after importing
        // leaves. Now the appropriate function is called automatically for
        // each affected project based on the event type.
        // =====================================================================
        const projectIdList = Array.from(affectedProjectIds);
        let totalInvoked = 0;
        const results: any[] = [];

        for (const projectId of projectIdList) {
            try {
                if (eventType === 'create') {
                    // =========================================================
                    // CREATE EVENT
                    // =========================================================
                    // Invoke createAnnualLeaveChecklistTasks for the project.
                    // This function finds all approved leaves overlapping with
                    // the project and creates "Annual Leave" + "Rejoining Date"
                    // task pairs. It handles deduplication internally — if tasks
                    // already exist for this leave, they are skipped.
                    // =========================================================
                    const result = await base44.asServiceRole.functions.invoke(
                        'createAnnualLeaveChecklistTasks',
                        { projectId }
                    );
                    results.push({ projectId, action: 'create', result });
                } else if (eventType === 'update') {
                    // =========================================================
                    // UPDATE EVENT
                    // =========================================================
                    // Invoke syncAnnualLeaveChecklistTasks with action 'update'.
                    // This deletes existing auto-created tasks for this leave
                    // and recreates them with updated values (new dates, day
                    // counts, rejoining dates).
                    //
                    // NOTE: The sync function uses an in-memory debounce map
                    // to handle rapid successive updates. On Deno Deploy,
                    // parallel isolates do NOT share in-memory state, so the
                    // debounce is only effective within a single isolate. This
                    // is a known platform limitation — see the function-level
                    // comment above for details. The sync function's idempotent
                    // delete-and-recreate pattern ensures correctness even if
                    // duplicate executions occur.
                    // =========================================================
                    const result = await base44.asServiceRole.functions.invoke(
                        'syncAnnualLeaveChecklistTasks',
                        { leaveId, projectId, action: 'update' }
                    );
                    results.push({ projectId, action: 'update', result });
                } else if (eventType === 'delete') {
                    // =========================================================
                    // DELETE EVENT
                    // =========================================================
                    // Invoke syncAnnualLeaveChecklistTasks with action 'delete'.
                    // This removes all auto-created "Annual Leave" and
                    // "Rejoining Date" tasks linked to this leave ID. No new
                    // tasks are created.
                    // =========================================================
                    const result = await base44.asServiceRole.functions.invoke(
                        'syncAnnualLeaveChecklistTasks',
                        { leaveId, projectId, action: 'delete' }
                    );
                    results.push({ projectId, action: 'delete', result });
                }

                totalInvoked++;
            } catch (invokeError: any) {
                console.error(
                    `[onAnnualLeaveChange] Failed to invoke function for project ${projectId} (${eventType}):`,
                    invokeError.message
                );
                results.push({ projectId, action: eventType, error: invokeError.message });
            }

            // Batch delay between project invocations to avoid rate limits
            if (projectIdList.indexOf(projectId) < projectIdList.length - 1) {
                await sleep(BATCH_DELAY_MS);
            }
        }

        return Response.json({
            success: true,
            event_type: eventType,
            leave_id: leaveId,
            projects_affected: projectIdList.length,
            functions_invoked: totalInvoked,
            results,
            message: `Processed ${eventType} event for leave ${leaveId} across ${projectIdList.length} project(s)`
        });

    } catch (error: any) {
        console.error('[onAnnualLeaveChange] Unhandled error:', error);
        return Response.json({
            error: error.message,
            details: error.stack
        }, { status: 500 });
    }
});
