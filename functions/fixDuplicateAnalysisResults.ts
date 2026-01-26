import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const analysisResults = await base44.asServiceRole.entities.AnalysisResult.list();
        
        // Find duplicates (same project + attendance_id + report_run_id)
        const resultKeys = {};
        analysisResults.forEach(r => {
            const key = `${r.project_id}_${r.attendance_id}_${r.report_run_id || 'null'}`;
            if (!resultKeys[key]) {
                resultKeys[key] = [];
            }
            resultKeys[key].push(r.id);
        });

        const duplicates = Object.entries(resultKeys).filter(([_, ids]) => ids.length > 1);
        let deletedCount = 0;
        const errors = [];

        for (const [key, duplicateIds] of duplicates) {
            // Keep the first one, delete the rest
            const toDelete = duplicateIds.slice(1);
            
            for (const id of toDelete) {
                try {
                    await base44.asServiceRole.entities.AnalysisResult.delete(id);
                    deletedCount++;
                } catch (err) {
                    errors.push(`Failed to delete ${id}: ${err.message}`);
                }
            }
        }

        return Response.json({
            success: true,
            duplicateSetsFound: duplicates.length,
            recordsDeleted: deletedCount,
            errors: errors.length > 0 ? errors : null
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});