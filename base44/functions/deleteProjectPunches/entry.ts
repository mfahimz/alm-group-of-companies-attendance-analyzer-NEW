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
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }

        // Delete punches with rate limit handling
        const punches = await base44.asServiceRole.entities.Punch.filter({ project_id });
        
        const batchSize = 10; // Smaller batch to avoid rate limits
        let deletedCount = 0;
        
        // Process in small sequential batches with delay
        for (let i = 0; i < punches.length; i += batchSize) {
            const batch = punches.slice(i, i + batchSize);
            
            // Delete batch items sequentially
            for (const punch of batch) {
                try {
                    await base44.asServiceRole.entities.Punch.delete(punch.id);
                    deletedCount++;
                } catch (error) {
                    console.error('Failed to delete punch:', punch.id, error);
                }
            }
            
            // Small delay between batches
            if (i + batchSize < punches.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
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