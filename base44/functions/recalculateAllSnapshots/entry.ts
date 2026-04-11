import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * RECALCULATE ALL SALARY SNAPSHOTS (Orchestrator)
 * 
 * Fetches all salary snapshots for a report run and recalculates them sequentially in batches.
 * This prevents browser-driven rate limiting by moving the orchestration to the backend.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // PERMISSION CHECK: Admin, Supervisor, HR Manager
        const userRole = user?.extended_role || user?.role || 'user';
        const allowedRoles = ['admin', 'supervisor', 'hr_manager'];
        if (!allowedRoles.includes(userRole)) {
            return Response.json({ error: 'Access denied: Insufficient permissions' }, { status: 403 });
        }

        const payload = await req.json();
        const { project_id, report_run_id } = payload;

        if (!project_id || !report_run_id) {
            return Response.json({ 
                error: 'project_id and report_run_id are required' 
            }, { status: 400 });
        }

        // ============================================================
        // 1. FETCH ALL SNAPSHOTS (PAGINATED)
        // ============================================================
        const allSnapshots = [];
        let skip = 0;
        const LIMIT = 200;
        let hasMore = true;

        while (hasMore) {
            const page = await base44.asServiceRole.entities.SalarySnapshot.filter(
                { project_id, report_run_id },
                null,
                LIMIT,
                skip
            );
            allSnapshots.push(...page);
            if (page.length < LIMIT) {
                hasMore = false;
            } else {
                skip += LIMIT;
            }
        }

        if (allSnapshots.length === 0) {
            return Response.json({
                success: true,
                total: 0,
                processed: 0,
                failed: 0,
                failures: [],
                message: 'No snapshots found for this report.'
            });
        }

        console.log(`[recalculateAllSnapshots] Found ${allSnapshots.length} snapshots. Starting orchestration...`);

        // ============================================================
        // 2. BATCH RECALCULATION
        // ============================================================
        const BATCH_SIZE = 5;
        const INTER_BATCH_DELAY_MS = 2000;
        
        let processedCount = 0;
        let failedCount = 0;
        const failures = [];

        // Helper: Invoke with retry on rate limit
        const invokeWithRetry = async (attendanceId: string) => {
            const retryDelays = [1000, 2000, 4000];
            let lastError = null;

            for (let i = 0; i <= retryDelays.length; i++) {
                try {
                    const response = await base44.functions.invoke('recalculateSalarySnapshot', {
                        project_id,
                        report_run_id,
                        attendance_id: attendanceId,
                        mode: 'APPLY'
                    });

                    // Check for rate limit error in status or body
                    const isRateLimited = response.status === 429 || 
                                          (response.status === 500 && response.data?.error === 'Rate limit exceeded');

                    if (isRateLimited) {
                        if (i < retryDelays.length) {
                            console.warn(`[recalculateAllSnapshots] Rate limit for ${attendanceId}. Retrying in ${retryDelays[i]}ms...`);
                            await new Promise(r => setTimeout(r, retryDelays[i]));
                            continue;
                        } else {
                            throw new Error('Rate limit exceeded after maximum retries');
                        }
                    }

                    if (!response.data?.success) {
                        throw new Error(response.data?.error || 'Unknown worker error');
                    }

                    return { success: true };

                } catch (error: any) {
                    lastError = error.message;
                }
            }

            return { success: false, error: lastError };
        };

        // Split snapshots into batches
        for (let i = 0; i < allSnapshots.length; i += BATCH_SIZE) {
            const batch = allSnapshots.slice(i, i + BATCH_SIZE);
            const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(allSnapshots.length / BATCH_SIZE);
            
            console.log(`[recalculateAllSnapshots] Processing batch ${batchIndex}/${totalBatches} (size: ${batch.length})`);

            const batchResults = await Promise.all(
                batch.map(s => invokeWithRetry(String(s.attendance_id)))
            );

            batchResults.forEach((res, idx) => {
                const snapshot = batch[idx];
                if (res.success) {
                    processedCount++;
                } else {
                    failedCount++;
                    failures.push({
                        attendance_id: snapshot.attendance_id,
                        error: res.error
                    });
                    console.error(`[recalculateAllSnapshots] Failed for ${snapshot.attendance_id}: ${res.error}`);
                }
            });

            // Wait before next batch (except after the last one)
            if (i + BATCH_SIZE < allSnapshots.length) {
                await new Promise(r => setTimeout(r, INTER_BATCH_DELAY_MS));
            }
        }

        return Response.json({
            success: true,
            total: allSnapshots.length,
            processed: processedCount,
            failed: failedCount,
            failures: failures,
            message: `Orchestration complete. Successfully processed ${processedCount} of ${allSnapshots.length} snapshots.`
        });

    } catch (error: any) {
        console.error('Recalculate all snapshots orchestrator error:', error);
        return Response.json({ 
            error: error.message || 'Internal orchestrator error' 
        }, { status: 500 });
    }
});