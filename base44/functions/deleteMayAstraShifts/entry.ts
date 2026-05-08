import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TARGET_PROJECT_ID = '69fdbfacbecb53e5cccdfdfb';
const TARGET_PROJECT_NAME = 'May 2026 - Astra Auto Parts';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getStatus = (error) => error?.status || error?.response?.status || error?.originalError?.response?.status || 0;

const withRetry = async (operation, maxAttempts = 5) => {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const status = getStatus(error);
            const message = String(error?.message || '').toLowerCase();
            if ((status === 429 || status >= 500 || message.includes('rate limit')) && attempt < maxAttempts - 1) {
                await sleep(Math.min(4000, 600 * Math.pow(2, attempt)));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json().catch(() => ({}));
        const batchLimit = Math.min(Math.max(Number(payload.batchLimit || 25), 1), 50);

        const projects = await withRetry(() => base44.asServiceRole.entities.Project.filter({ id: TARGET_PROJECT_ID }, null, 1));
        const project = projects[0];

        if (!project || project.name !== TARGET_PROJECT_NAME || project.company !== 'Astra Auto Parts') {
            return Response.json({ error: 'Target project validation failed. No shifts deleted.' }, { status: 400 });
        }

        const shifts = await withRetry(() => base44.asServiceRole.entities.ShiftTiming.filter({ project_id: TARGET_PROJECT_ID }, null, batchLimit));
        let deleted = 0;
        let failed = 0;

        for (const shift of shifts) {
            try {
                await withRetry(() => base44.asServiceRole.entities.ShiftTiming.delete(shift.id));
                deleted++;
                await sleep(120);
            } catch (error) {
                failed++;
                console.warn(`[MayAstraCleanup] Failed to delete shift ${shift.id}: ${error.message}`);
            }
        }

        const remainingSample = await withRetry(() => base44.asServiceRole.entities.ShiftTiming.filter({ project_id: TARGET_PROJECT_ID }, null, 1));

        return Response.json({
            success: true,
            project_id: TARGET_PROJECT_ID,
            project_name: TARGET_PROJECT_NAME,
            deleted_this_run: deleted,
            failed_this_run: failed,
            has_more: remainingSample.length > 0,
            message: remainingSample.length > 0
                ? `Deleted ${deleted}. More shifts remain; run again.`
                : `Deleted ${deleted}. No shifts remain.`
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});