import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * syncSalaryModificationsChecklist
 *
 * Automatically syncs 'Salary Increment' and 'Salary Decrement' checklist tasks
 * based on SalaryIncrement records active for the project's target month.
 */

const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executes a function with a retry mechanism specifically for 429 Rate Limit errors.
 */
const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> => {
    const delays = [1000, 2000, 4000];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e: any) {
            const status = e?.status || e?.response?.status || 0;
            if (status === 429 && attempt < maxRetries) {
                console.warn(`[syncSalaryModifications] Rate limited, retry ${attempt + 1}/${maxRetries} after ${delays[attempt]}ms`);
                await sleep(delays[attempt]);
                continue;
            }
            throw e;
        }
    }
    throw new Error('Unreachable');
};

/**
 * Paginates through all records safely to avoid response size limits.
 */
const fetchAllRecords = async (entity: any, query: any) => {
    const allRecords: any[] = [];
    let skip = 0;
    const limit = 500;
    while (true) {
        const page = await withRetry(() => entity.filter(query, null, limit, skip));
        if (!Array.isArray(page) || page.length === 0) break;
        allRecords.push(...page);
        if (page.length < limit) break;
        skip += limit;
    }
    return allRecords;
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // --- STEP 1: Auth check ---
        // Ensure the request is coming from an authenticated user.
        try {
            await base44.auth.me();
        } catch (authError) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, company, project_date_to } = await req.json();

        if (!project_id || !company || !project_date_to) {
            return Response.json({ error: 'Missing required parameters: project_id, company, or project_date_to' }, { status: 400 });
        }

        // --- STEP 2: Derive target month ---
        // Converts "YYYY-MM-DD" to "YYYY-MM-01" to match SalaryIncrement's effective_month format.
        const targetMonth = project_date_to.substring(0, 7) + '-01';

        // --- STEP 3: Fetch SalaryIncrement records ---
        // Fetch all active salary modification records for the company and filter by the target month.
        const allIncrements = await fetchAllRecords(base44.asServiceRole.entities.SalaryIncrement, {
            company,
            active: true
        });

        // Keep only records where effective_month is equal to or later than the targetMonth.
        const relevantRecords = allIncrements.filter((r: any) => r.effective_month >= targetMonth);

        // --- STEP 4: Separate increments from decrements ---
        // Categorize records based on the change in total salary.
        const incrementRecords = relevantRecords.filter((r: any) => Number(r.new_total_salary || 0) > Number(r.previous_total_salary || 0));
        const decrementRecords = relevantRecords.filter((r: any) => Number(r.new_total_salary || 0) < Number(r.previous_total_salary || 0));

        // --- STEP 5: Build task description for each group ---
        // Helper function to format employee-specific salary modification details.
        const formatLine = (r: any) => {
            const name = r.name || r.employee_id || 'Unknown';
            const prevTotal = Math.round(Number(r.previous_total_salary || 0));
            const newTotal = Math.round(Number(r.new_total_salary || 0));
            const prevBasic = Math.round(Number(r.previous_basic_salary || 0));
            const newBasic = Math.round(Number(r.new_basic_salary || 0));
            const prevAllow = Math.round(Number(r.previous_allowances || 0));
            const newAllow = Math.round(Number(r.new_allowances || 0));
            const prevAllowB = Math.round(Number(r.previous_allowances_with_bonus || 0));
            const newAllowB = Math.round(Number(r.new_allowances_with_bonus || 0));

            return `${name} | Prev: ${prevTotal} | New: ${newTotal} | Basic: ${prevBasic}→${newBasic} | Allow: ${prevAllow}→${newAllow} | Allow+B: ${prevAllowB}→${newAllowB}`;
        };

        const incrementDesc = incrementRecords.map(formatLine).join('\n');
        const decrementDesc = decrementRecords.map(formatLine).join('\n');

        // --- STEP 6: Build fingerprints ---
        // Fingerprints ensure tasks are uniquely identifiable and idempotent across sync runs.
        const expectedTasks: Array<{ fingerprint: string, type: string, description: string }> = [];

        if (incrementRecords.length > 0) {
            expectedTasks.push({
                fingerprint: `SalaryIncrement_${project_id}_${targetMonth}_${incrementRecords.length}`,
                type: 'Salary Increment',
                description: incrementDesc
            });
        }

        if (decrementRecords.length > 0) {
            expectedTasks.push({
                fingerprint: `SalaryDecrement_${project_id}_${targetMonth}_${decrementRecords.length}`,
                type: 'Salary Decrement',
                description: decrementDesc
            });
        }

        // --- STEP 7: Upsert checklist tasks ---
        // Fetch existing auto-created checklist items for these specific task types.
        const existingTasks = await fetchAllRecords(base44.asServiceRole.entities.ChecklistItem, {
            project_id,
            is_auto_created: true
        });

        const relevantExisting = existingTasks.filter((t: any) => t.task_type === 'Salary Increment' || t.task_type === 'Salary Decrement');
        const expectedFingerprints = new Set(expectedTasks.map(t => t.fingerprint));
        
        // Delete tasks that are no longer valid or whose contents (fingerprint) have changed.
        let deleted = 0;
        const tasksToDelete = relevantExisting.filter((t: any) => !expectedFingerprints.has(t.fingerprint));
        for (let i = 0; i < tasksToDelete.length; i += BATCH_SIZE) {
            const batch = tasksToDelete.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map((task: any) => withRetry(() => base44.asServiceRole.entities.ChecklistItem.delete(task.id))));
            deleted += batch.length;
            if (i + BATCH_SIZE < tasksToDelete.length) await sleep(BATCH_DELAY_MS);
        }

        // Create new tasks for fingerprints that don't already exist in the database.
        let created = 0;
        const currentFingerprints = new Set(relevantExisting.map((t: any) => t.fingerprint));
        const tasksToCreate = expectedTasks.filter(t => !currentFingerprints.has(t.fingerprint));
        for (let i = 0; i < tasksToCreate.length; i += BATCH_SIZE) {
            const batch = tasksToCreate.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(task => withRetry(() => base44.asServiceRole.entities.ChecklistItem.create({
                project_id,
                task_type: task.type,
                task_description: task.description,
                status: 'pending',
                is_auto_created: true,
                is_predefined: false,
                fingerprint: task.fingerprint
            }))));
            created += batch.length;
            if (i + BATCH_SIZE < tasksToCreate.length) await sleep(BATCH_DELAY_MS);
        }

        // --- STEP 8: Return response ---
        return Response.json({
            success: true,
            increments_found: incrementRecords.length,
            decrements_found: decrementRecords.length,
            created,
            deleted
        });

    } catch (error: any) {
        console.error('Error in syncSalaryModificationsChecklist:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
