import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const allResults = await base44.asServiceRole.entities.AnalysisResult.list();
        
        let fixed = 0;
        let skipped = 0;
        const errors = [];

        for (const result of allResults) {
            if (typeof result.attendance_id !== 'string') {
                try {
                    // Delete and recreate with correct type
                    const correctData = {
                        ...result,
                        attendance_id: String(result.attendance_id)
                    };
                    delete correctData.id;
                    delete correctData.created_date;
                    delete correctData.updated_date;
                    delete correctData.created_by;
                    
                    await base44.asServiceRole.entities.AnalysisResult.delete(result.id);
                    await base44.asServiceRole.entities.AnalysisResult.create(correctData);
                    
                    fixed++;
                } catch (error) {
                    errors.push({ id: result.id, error: error.message });
                }
            } else {
                skipped++;
            }
        }

        return Response.json({
            success: true,
            total: allResults.length,
            fixed,
            skipped,
            errors
        });

    } catch (error) {
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});