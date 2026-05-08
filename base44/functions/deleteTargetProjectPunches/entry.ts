import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

const TARGET_PROJECT_ID = '69f2c7be8836d224c1d1c2ea';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getStatus = (error) => error?.status || error?.response?.status || error?.originalError?.response?.status || 0;

const withRetry = async (operation, maxAttempts = 6) => {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const status = getStatus(error);
            if ((status === 429 || status >= 500) && attempt < maxAttempts - 1) {
                await sleep(Math.min(30000, 1500 * Math.pow(2, attempt + 1)));
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

        let deleted = 0;
        let scanned = 0;
        const pageSize = 100;

        while (true) {
            const punches = await withRetry(() => base44.asServiceRole.entities.Punch.filter({ project_id: TARGET_PROJECT_ID }, null, pageSize, 0));
            if (!Array.isArray(punches) || punches.length === 0) break;

            scanned += punches.length;

            for (const punch of punches) {
                await withRetry(() => base44.asServiceRole.entities.Punch.delete(punch.id));
                deleted++;
                await sleep(250);
            }

            await sleep(1500);
        }

        return Response.json({
            success: true,
            project_id: TARGET_PROJECT_ID,
            scanned,
            deleted,
            message: `Deleted ${deleted} punch records for project ${TARGET_PROJECT_ID}`
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});