import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id } = await req.json();
        
        if (!project_id) {
            return Response.json({ error: 'project_id required' }, { status: 400 });
        }

        console.log(`[Delete] Starting punch deletion for project: ${project_id}`);
        
        // Fetch all punches for this project
        let allPunches = [];
        let skip = 0;
        const limit = 500;
        
        while (true) {
            const punches = await base44.asServiceRole.entities.Punch.filter(
                { project_id },
                '-created_date',
                limit,
                skip
            );
            
            if (punches.length === 0) break;
            allPunches = allPunches.concat(punches);
            skip += limit;
        }

        console.log(`[Delete] Found ${allPunches.length} punches to delete`);
        
        let deletedCount = 0;
        let failedCount = 0;
        const failedIds = [];

        // Delete sequentially with delays and retries
        for (let i = 0; i < allPunches.length; i++) {
            const punch = allPunches[i];
            let retries = 3;
            let deleted = false;

            while (retries > 0 && !deleted) {
                try {
                    await base44.asServiceRole.entities.Punch.delete(punch.id);
                    deletedCount++;
                    deleted = true;
                    
                    if ((i + 1) % 50 === 0) {
                        console.log(`[Delete] Progress: ${i + 1}/${allPunches.length} deleted`);
                    }
                    
                    // Delay between deletions to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    retries--;
                    if (retries > 0) {
                        console.log(`[Delete] Retry for punch ${punch.id}, attempts left: ${retries}`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        failedCount++;
                        failedIds.push(punch.id);
                        console.log(`[Delete] Failed to delete punch ${punch.id}: ${error.message}`);
                    }
                }
            }
        }

        console.log(`[Delete] Completed. Deleted: ${deletedCount}, Failed: ${failedCount}`);

        return Response.json({
            success: true,
            total_found: allPunches.length,
            deleted_count: deletedCount,
            failed_count: failedCount,
            failed_ids: failedIds
        });
    } catch (error) {
        console.error('[Delete] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});