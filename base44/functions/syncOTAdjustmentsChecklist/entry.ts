import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * syncOTAdjustmentsChecklist
 *
 * Syncs OvertimeData records (OT hours + manual salary adjustments like bonus,
 * incentive, open_leave_salary, variable_salary, otherDeduction, advanceSalaryDeduction)
 * for a project into the project's checklist.
 *
 * Uses fingerprint-based upsert to prevent duplicates.
 * Fingerprints: OT_MANAGEMENT_{project_id}, ADJ_{col}_{project_id}
 */

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 1500;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const withRetry = async (fn, maxRetries = 3) => {
    const delays = [1000, 2000, 4000];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e) {
            const status = e?.status || e?.response?.status || 0;
            if (status === 429 && attempt < maxRetries) {
                await sleep(delays[attempt]);
                continue;
            }
            throw e;
        }
    }
};

const fetchAllRecords = async (entity, query) => {
    const all = [];
    let skip = 0;
    const limit = 500;
    while (true) {
        const page = await withRetry(() => entity.filter(query, null, limit, skip));
        if (!Array.isArray(page) || page.length === 0) break;
        all.push(...page);
        if (page.length < limit) break;
        skip += limit;
    }
    return all;
};

const flattenToSum = (val) => {
    if (!val) return 0;
    if (Array.isArray(val)) return val.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        } catch { /* fallthrough */ }
    }
    return parseFloat(val) || 0;
};

const parseEntries = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && (val.trim().startsWith('[') || val.trim().startsWith('{'))) {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed;
        } catch { /* fallthrough */ }
    }
    const num = parseFloat(val);
    return (isNaN(num) || num === 0) ? [] : [{ amount: num, desc: '' }];
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        try {
            await base44.auth.me();
        } catch {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, project_name } = await req.json();

        if (!project_id) {
            return Response.json({ error: 'Missing required parameter: project_id' }, { status: 400 });
        }

        // Fetch all OT records for this project
        const overtimeRecords = await fetchAllRecords(base44.asServiceRole.entities.OvertimeData, { project_id });

        // Fetch existing auto-created checklist tasks for this project
        const existingTasks = await fetchAllRecords(base44.asServiceRole.entities.ChecklistItem, {
            project_id,
            is_auto_created: true
        });

        const tasksToUpsert = [];

        // ============================================
        // 1. Overtime Task (employees with OT hours)
        // ============================================
        const otEmployees = overtimeRecords.filter(rec => {
            return flattenToSum(rec.normalOtHours) > 0 || flattenToSum(rec.specialOtHours) > 0;
        });

        if (otEmployees.length > 0) {
            const otDescription = otEmployees.map(e => e.name || e.attendance_id).join(', ');
            tasksToUpsert.push({
                fingerprint: `OT_MANAGEMENT_${project_id}`,
                task_type: `Overtime Management - ${project_name || project_id}`,
                task_description: otDescription,
                notes: `System-generated task for overtime monitoring.\nEmployees: ${otEmployees.length}`
            });
        }

        // ============================================
        // 2. Adjustment Tasks (categorized)
        // ============================================
        const columns = [
            { key: 'bonus', name: 'Bonus' },
            { key: 'incentive', name: 'Incentive' },
            { key: 'open_leave_salary', name: 'Open Leave Salary' },
            { key: 'variable_salary', name: 'Variable Salary' },
            { key: 'otherDeduction', name: 'Other Deduction' },
            { key: 'advanceSalaryDeduction', name: 'Advance Salary Deduction' }
        ];

        for (const col of columns) {
            const entries = [];
            for (const rec of overtimeRecords) {
                const empEntries = parseEntries(rec[col.key]);
                for (const entry of empEntries) {
                    if (parseFloat(entry.amount) > 0) {
                        entries.push({
                            name: rec.name || rec.attendance_id,
                            amount: entry.amount,
                            desc: entry.desc || 'No remarks'
                        });
                    }
                }
            }

            if (entries.length > 0) {
                const description = entries.map(e =>
                    `${e.name} | ${parseFloat(e.amount).toFixed(2)} AED | ${e.desc}`
                ).join('\n');

                tasksToUpsert.push({
                    fingerprint: `ADJ_${col.key}_${project_id}`,
                    task_type: col.name,
                    task_description: description,
                    notes: `System-generated adjustment tasks for ${col.name}.\nTotal Entries: ${entries.length}`
                });
            }
        }

        // ============================================
        // 3. Upsert tasks
        // ============================================
        let created = 0;
        let updated = 0;

        for (let i = 0; i < tasksToUpsert.length; i += BATCH_SIZE) {
            const batch = tasksToUpsert.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (task) => {
                const existing = existingTasks.find(t => t.fingerprint === task.fingerprint);
                const payload = {
                    project_id,
                    task_type: task.task_type,
                    task_description: task.task_description,
                    status: 'pending',
                    is_auto_created: true,
                    linked_entity_id: 'salary_adjustments',
                    fingerprint: task.fingerprint,
                    notes: task.notes
                };
                if (existing) {
                    await withRetry(() => base44.asServiceRole.entities.ChecklistItem.update(existing.id, payload));
                    updated++;
                } else {
                    await withRetry(() => base44.asServiceRole.entities.ChecklistItem.create(payload));
                    created++;
                }
            }));
            if (i + BATCH_SIZE < tasksToUpsert.length) await sleep(BATCH_DELAY_MS);
        }

        return Response.json({
            success: true,
            tasks_synced: tasksToUpsert.length,
            created,
            updated
        });

    } catch (error) {
        console.error('Error in syncOTAdjustmentsChecklist:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});