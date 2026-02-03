import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RECALCULATE ALL SALARY SNAPSHOTS
 * 
 * Recalculates all salary snapshots for a given report run.
 * Useful when salary logic changes and existing snapshots need updating.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { project_id, report_run_id } = await req.json();

        if (!project_id || !report_run_id) {
            return Response.json({ 
                error: 'project_id and report_run_id are required' 
            }, { status: 400 });
        }

        // Fetch all snapshots for this report
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        if (snapshots.length === 0) {
            return Response.json({ 
                error: 'No snapshots found for this report' 
            }, { status: 404 });
        }

        console.log(`[recalculateAllSnapshots] Recalculating ${snapshots.length} snapshots`);

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        // Recalculate each snapshot
        for (const snapshot of snapshots) {
            try {
                const response = await base44.functions.invoke('recalculateSalarySnapshot', {
                    project_id: project_id,
                    report_run_id: report_run_id,
                    attendance_id: snapshot.attendance_id,
                    mode: 'APPLY'
                });

                if (response.data.success) {
                    successCount++;
                    results.push({
                        attendance_id: snapshot.attendance_id,
                        name: snapshot.name,
                        status: 'success'
                    });
                } else {
                    errorCount++;
                    results.push({
                        attendance_id: snapshot.attendance_id,
                        name: snapshot.name,
                        status: 'error',
                        error: response.data.error
                    });
                }
            } catch (error) {
                errorCount++;
                results.push({
                    attendance_id: snapshot.attendance_id,
                    name: snapshot.name,
                    status: 'error',
                    error: error.message
                });
            }
        }

        return Response.json({
            success: true,
            total: snapshots.length,
            success_count: successCount,
            error_count: errorCount,
            results: results,
            message: `Recalculated ${successCount} of ${snapshots.length} snapshots successfully`
        });

    } catch (error) {
        console.error('Recalculate all snapshots error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});