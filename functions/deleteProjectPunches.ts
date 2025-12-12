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

        // Delete punches in batches using service role
        const punches = await base44.asServiceRole.entities.Punch.filter({ project_id });
        
        const batchSize = 50;
        let deletedCount = 0;
        
        for (let i = 0; i < punches.length; i += batchSize) {
            const batch = punches.slice(i, i + batchSize);
            
            for (const punch of batch) {
                try {
                    await base44.asServiceRole.entities.Punch.delete(punch.id);
                    deletedCount++;
                } catch (error) {
                    console.error('Failed to delete punch:', punch.id, error);
                }
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