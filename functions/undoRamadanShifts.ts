import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId, dateFrom, dateTo } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'Missing projectId' }, { status: 400 });
        }

        // Fetch all shifts for this project
        const allShifts = await base44.asServiceRole.entities.ShiftTiming.filter({ project_id: projectId });

        // Filter to only Ramadan shifts in the date range
        const ramadanShifts = allShifts.filter(s => {
            if (!s.applicable_days?.includes('Ramadan')) return false;
            if (dateFrom && s.date < dateFrom) return false;
            if (dateTo && s.date > dateTo) return false;
            return true;
        });

        if (ramadanShifts.length === 0) {
            return Response.json({ success: true, deletedCount: 0, message: 'No Ramadan shifts found to remove' });
        }

        console.log(`[undoRamadanShifts] Removing ${ramadanShifts.length} Ramadan shifts from project ${projectId}`);

        // Delete in small batches with delays to avoid rate limiting
        let deletedCount = 0;
        const batchSize = 5;
        
        for (let i = 0; i < ramadanShifts.length; i += batchSize) {
            const batch = ramadanShifts.slice(i, i + batchSize);
            
            let retries = 3;
            while (retries > 0) {
                try {
                    // Delete sequentially within batch to minimize rate limit risk
                    for (const shift of batch) {
                        await base44.asServiceRole.entities.ShiftTiming.delete(shift.id);
                        deletedCount++;
                    }
                    break;
                } catch (err) {
                    retries--;
                    if (retries === 0) {
                        console.error(`[undoRamadanShifts] Failed after retries at batch ${Math.floor(i / batchSize) + 1}: ${err.message}`);
                        // Return partial success
                        return Response.json({
                            success: true,
                            partial: true,
                            deletedCount,
                            totalToDelete: ramadanShifts.length,
                            message: `Partially removed ${deletedCount}/${ramadanShifts.length} shifts. Run again to continue.`
                        });
                    }
                    const delay = retries === 2 ? 3000 : 6000;
                    console.warn(`[undoRamadanShifts] Rate limited, waiting ${delay/1000}s... (${retries} retries left)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            
            console.log(`[undoRamadanShifts] Deleted ${deletedCount}/${ramadanShifts.length}`);
            
            // Delay between batches
            if (i + batchSize < ramadanShifts.length) {
                await new Promise(resolve => setTimeout(resolve, 400));
            }
        }

        return Response.json({
            success: true,
            deletedCount,
            message: `Removed all ${deletedCount} Ramadan shifts from project`
        });

    } catch (error) {
        console.error('Error undoing Ramadan shifts:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});