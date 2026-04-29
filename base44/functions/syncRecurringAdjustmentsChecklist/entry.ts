import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * syncRecurringAdjustmentsChecklist
 *
 * Syncs RecurringAdjustment records (bonus, incentive, allowance, deductions, etc.)
 * that are active and overlap with the project period into the project's checklist.
 *
 * One checklist task per category (e.g., "Bonus", "Incentive", "Allowance"), listing
 * all affected employees. Uses fingerprint-based upsert to prevent duplicates.
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
                console.warn(`[syncRecurringAdjustments] Rate limited, retry ${attempt + 1}/${maxRetries} after ${delays[attempt]}ms`);
                await sleep(delays[attempt]);
                continue;
            }
            throw e;
        }
    }
    throw new Error('Unreachable');
};

const fetchAllRecords = async (entity, query) => {
    const allRecords = [];
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

// Map RecurringAdjustment category to a checklist task_type label
const CATEGORY_TO_TASK_TYPE = {
    bonus: 'Bonus',
    incentive: 'Incentive',
    allowance: 'Allowance / Additions',
    open_leave_salary: 'Allowance / Additions',
    variable_salary: 'Variable Salary',
    otherDeduction: 'Deductions',
    advanceSalaryDeduction: 'Deductions'
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        try {
            await base44.auth.me();
        } catch {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, company, project_date_from, project_date_to } = await req.json();

        if (!project_id || !company || !project_date_from || !project_date_to) {
            return Response.json({ error: 'Missing required parameters: project_id, company, project_date_from, project_date_to' }, { status: 400 });
        }

        // --- Fetch all active adjustments for the company ---
        const allAdjustments = await fetchAllRecords(base44.asServiceRole.entities.RecurringAdjustment, {
            company,
            is_active: true
        });

        // Filter: only those that overlap with the project period
        // Overlap: start_date <= project_date_to AND (end_date >= project_date_from OR end_date is empty)
        const relevantAdjustments = allAdjustments.filter(adj => {
            if (!adj.start_date) return false;
            if (adj.start_date > project_date_to) return false;
            if (adj.end_date && adj.end_date < project_date_from) return false;
            return true;
        });

        // Fetch employees for name lookup (by hrms_id)
        const allEmployees = await fetchAllRecords(base44.asServiceRole.entities.Employee, { company });
        const hrmsToName = {};
        for (const emp of allEmployees) {
            if (emp.hrms_id) hrmsToName[emp.hrms_id] = emp.name || emp.hrms_id;
        }

        // Group by task_type
        const groupedByType = {};
        for (const adj of relevantAdjustments) {
            const taskType = CATEGORY_TO_TASK_TYPE[adj.category] || 'Allowance / Additions';
            if (!groupedByType[taskType]) groupedByType[taskType] = [];
            groupedByType[taskType].push(adj);
        }

        // Build expected tasks
        const expectedTasks = [];
        for (const [taskType, adjs] of Object.entries(groupedByType)) {
            const lines = adjs.map(adj => {
                const empName = hrmsToName[adj.employee_id] || adj.employee_id || 'Unknown';
                const amount = Number(adj.amount || 0).toLocaleString();
                const label = adj.label || adj.description || adj.category;
                return `${empName} | ${label} | AED ${amount}`;
            });
            const description = lines.join('\n');

            // Fingerprint includes employee count + total amount to detect changes
            const totalAmount = adjs.reduce((sum, a) => sum + Number(a.amount || 0), 0);
            const fingerprint = `RecurringAdj_${project_id}_${taskType.replace(/\s+/g, '')}_${adjs.length}_${Math.round(totalAmount)}`;

            expectedTasks.push({ fingerprint, type: taskType, description });
        }

        // Fetch existing auto-created checklist tasks for this project
        const existingTasks = await fetchAllRecords(base44.asServiceRole.entities.ChecklistItem, {
            project_id,
            is_auto_created: true
        });

        // Only manage tasks whose fingerprint starts with our prefix
        const relevantExisting = existingTasks.filter(t => t.fingerprint && t.fingerprint.startsWith(`RecurringAdj_${project_id}_`));
        const expectedFingerprints = new Set(expectedTasks.map(t => t.fingerprint));

        // Delete stale tasks
        let deleted = 0;
        const tasksToDelete = relevantExisting.filter(t => !expectedFingerprints.has(t.fingerprint));
        for (let i = 0; i < tasksToDelete.length; i += BATCH_SIZE) {
            const batch = tasksToDelete.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(task => withRetry(() => base44.asServiceRole.entities.ChecklistItem.delete(task.id))));
            deleted += batch.length;
            if (i + BATCH_SIZE < tasksToDelete.length) await sleep(BATCH_DELAY_MS);
        }

        // Create new tasks
        let created = 0;
        const currentFingerprints = new Set(relevantExisting.map(t => t.fingerprint));
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

        return Response.json({
            success: true,
            adjustments_found: relevantAdjustments.length,
            task_types: Object.keys(groupedByType),
            created,
            deleted
        });

    } catch (error) {
        console.error('Error in syncRecurringAdjustmentsChecklist:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});