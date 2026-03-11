import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Undo/Delete Ramadan shifts with optimized batch processing
 * Handles up to 1000+ shifts with progress reporting
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId, ramadanFrom, ramadanTo } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'Missing project ID' }, { status: 400 });
        }

        // Fetch project
        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Security check
        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'ceo' && userRole !== 'hr_manager') {
            if (project.company !== user.company) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Build date filter if provided
        let dateFilter = {};
        if (ramadanFrom && ramadanTo) {
            dateFilter = {
                date: { $gte: ramadanFrom, $lte: ramadanTo }
            };
        }

        // Fetch all Ramadan shifts for this project
        const allShifts = await base44.asServiceRole.entities.ShiftTiming.filter({ 
            project_id: projectId,
            ...dateFilter
        }, null, 10000); // Fetch up to 10000 to ensure we get all

        // Filter only Ramadan shifts (applicable_days contains 'Ramadan')
        const ramadanShifts = allShifts.filter(s => 
            s.applicable_days && s.applicable_days.includes('Ramadan')
        );

        if (ramadanShifts.length === 0) {
            return Response.json({ 
                success: true, 
                deletedCount: 0, 
                message: 'No Ramadan shifts found to delete' 
            });
        }

        console.log(`[undoRamadanShifts] Found ${ramadanShifts.length} Ramadan shifts to delete`);

        // OPTIMIZED DELETION: Process in parallel batches of 100
        const BATCH_SIZE = 100;
        const PARALLEL_BATCHES = 5; // Process 5 batches simultaneously = 500 shifts at once
        let deletedCount = 0;
        const shiftIds = ramadanShifts.map(s => s.id);
        
        // Split into batches
        const batches = [];
        for (let i = 0; i < shiftIds.length; i += BATCH_SIZE) {
            batches.push(shiftIds.slice(i, i + BATCH_SIZE));
        }

        console.log(`[undoRamadanShifts] Processing ${batches.length} batches (${BATCH_SIZE} shifts each)`);

        // Process batches in parallel groups
        for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);
            
            // Delete all parallel batches simultaneously
            const deletePromises = parallelBatches.map(async (batchIds) => {
                try {
                    // Use deleteMany for bulk deletion
                    await base44.asServiceRole.entities.ShiftTiming.deleteMany({
                        id: { $in: batchIds }
                    });
                    return batchIds.length;
                } catch (err) {
                    console.error('[undoRamadanShifts] Batch delete failed:', err.message);
                    // Fallback: delete one by one
                    let count = 0;
                    for (const id of batchIds) {
                        try {
                            await base44.asServiceRole.entities.ShiftTiming.delete(id);
                            count++;
                        } catch (e) {
                            console.error(`[undoRamadanShifts] Failed to delete shift ${id}:`, e.message);
                        }
                    }
                    return count;
                }
            });

            const results = await Promise.all(deletePromises);
            const batchDeleted = results.reduce((sum, count) => sum + count, 0);
            deletedCount += batchDeleted;

            console.log(`[undoRamadanShifts] Deleted ${deletedCount}/${shiftIds.length} shifts`);
        }

        return Response.json({
            success: true,
            deletedCount,
            totalFound: ramadanShifts.length,
            message: `Successfully deleted ${deletedCount} Ramadan shifts`
        });

    } catch (error) {
        console.error('[undoRamadanShifts] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});