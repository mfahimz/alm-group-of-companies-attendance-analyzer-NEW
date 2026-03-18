import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Fetch all analysis results
        const allResults = await base44.asServiceRole.entities.AnalysisResult.list();
        
        console.log(`Found ${allResults.length} analysis results to check`);

        const updates = [];
        const errors = [];

        for (const result of allResults) {
            // Check if attendance_id is not a string
            if (typeof result.attendance_id !== 'string') {
                try {
                    await base44.asServiceRole.entities.AnalysisResult.update(result.id, {
                        attendance_id: String(result.attendance_id),
                        project_id: result.project_id,
                        report_run_id: result.report_run_id
                    });
                    updates.push({
                        id: result.id,
                        old: result.attendance_id,
                        new: String(result.attendance_id)
                    });
                    console.log(`Fixed ${result.id}: ${result.attendance_id} -> "${String(result.attendance_id)}"`);
                } catch (error) {
                    errors.push({
                        id: result.id,
                        attendance_id: result.attendance_id,
                        error: error.message
                    });
                    console.error(`Failed to fix ${result.id}:`, error.message);
                }
            }
        }

        return Response.json({
            success: true,
            total_checked: allResults.length,
            fixed: updates.length,
            errors: errors.length,
            updates,
            errors
        });

    } catch (error) {
        console.error('Migration error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});