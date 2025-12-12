import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id } = await req.json();
        
        if (!project_id) {
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }

        // Delete punches in parallel batches for much faster deletion
        const punches = await base44.asServiceRole.entities.Punch.filter({ project_id });
        
        const batchSize = 100;
        const parallelBatches = 5; // Process 5 batches simultaneously
        let deletedCount = 0;
        
        // Split into batches
        const batches = [];
        for (let i = 0; i < punches.length; i += batchSize) {
            batches.push(punches.slice(i, i + batchSize));
        }
        
        // Process batches in parallel groups
        for (let i = 0; i < batches.length; i += parallelBatches) {
            const parallelGroup = batches.slice(i, i + parallelBatches);
            
            await Promise.all(parallelGroup.map(async (batch) => {
                await Promise.all(batch.map(async (punch) => {
                    try {
                        await base44.asServiceRole.entities.Punch.delete(punch.id);
                        deletedCount++;
                    } catch (error) {
                        console.error('Failed to delete punch:', punch.id, error);
                    }
                }));
            }));
        }

        return Response.json({ 
            success: true, 
            deleted_count: deletedCount,
            total_count: punches.length 
        });
    } catch (error) {
        console.error('Delete punches error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});