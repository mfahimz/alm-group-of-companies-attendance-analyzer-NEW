import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Recalculates working_days for all historical AnalysisResults
 * where sick_leave_count > 0 (adds back the days that were incorrectly subtracted)
 * 
 * BUSINESS LOGIC CHANGE:
 * - OLD: Sick leave days were NOT counted as working days (working_days--)
 * - NEW: Sick leave days ARE counted as working days (tracked separately, no LOP)
 * 
 * This function corrects historical data by:
 * working_days_new = working_days_old + sick_leave_count
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // SECURITY: Admin only
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const { dry_run = true } = await req.json();

        console.log(`[recalculateSickLeaveWorkingDays] Starting ${dry_run ? 'DRY RUN' : 'LIVE UPDATE'}`);

        // Get all analysis results with sick leave
        const allResults = await base44.asServiceRole.entities.AnalysisResult.list('-created_date', 10000);
        
        const resultsWithSickLeave = allResults.filter(r => 
            r.sick_leave_count && r.sick_leave_count > 0
        );

        console.log(`[recalculateSickLeaveWorkingDays] Found ${resultsWithSickLeave.length} results with sick leave`);

        const updates = [];
        const updateDetails = [];

        for (const result of resultsWithSickLeave) {
            const oldWorkingDays = result.working_days || 0;
            const sickLeaveDays = result.sick_leave_count || 0;
            const newWorkingDays = oldWorkingDays + sickLeaveDays;

            updateDetails.push({
                id: result.id,
                attendance_id: result.attendance_id,
                report_run_id: result.report_run_id,
                project_id: result.project_id,
                sick_leave_count: sickLeaveDays,
                old_working_days: oldWorkingDays,
                new_working_days: newWorkingDays,
                change: `+${sickLeaveDays}`
            });

            if (!dry_run) {
                updates.push(
                    base44.asServiceRole.entities.AnalysisResult.update(result.id, {
                        working_days: newWorkingDays
                    })
                );
            }
        }

        // Execute updates in batches
        if (!dry_run && updates.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < updates.length; i += batchSize) {
                const batch = updates.slice(i, i + batchSize);
                await Promise.all(batch);
                
                // Delay between batches
                if (i + batchSize < updates.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            // Log audit
            await base44.asServiceRole.functions.invoke('logAudit', {
                action: 'RECALCULATE_SICK_LEAVE_WORKING_DAYS',
                entity_type: 'AnalysisResult',
                details: `Updated ${updates.length} analysis results. Sick leave days now count as working days.`
            });
        }

        // Also update SalarySnapshots
        const allSnapshots = await base44.asServiceRole.entities.SalarySnapshot.list('-created_date', 10000);
        
        const snapshotsWithSickLeave = allSnapshots.filter(s => 
            s.sick_leave_count && s.sick_leave_count > 0
        );

        console.log(`[recalculateSickLeaveWorkingDays] Found ${snapshotsWithSickLeave.length} salary snapshots with sick leave`);

        const snapshotUpdates = [];
        const snapshotUpdateDetails = [];

        for (const snapshot of snapshotsWithSickLeave) {
            const oldWorkingDays = snapshot.working_days || 0;
            const sickLeaveDays = snapshot.sick_leave_count || 0;
            const newWorkingDays = oldWorkingDays + sickLeaveDays;

            snapshotUpdateDetails.push({
                id: snapshot.id,
                attendance_id: snapshot.attendance_id,
                report_run_id: snapshot.report_run_id,
                project_id: snapshot.project_id,
                sick_leave_count: sickLeaveDays,
                old_working_days: oldWorkingDays,
                new_working_days: newWorkingDays,
                change: `+${sickLeaveDays}`
            });

            if (!dry_run) {
                snapshotUpdates.push(
                    base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, {
                        working_days: newWorkingDays
                    })
                );
            }
        }

        // Execute snapshot updates in batches
        if (!dry_run && snapshotUpdates.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < snapshotUpdates.length; i += batchSize) {
                const batch = snapshotUpdates.slice(i, i + batchSize);
                await Promise.all(batch);
                
                if (i + batchSize < snapshotUpdates.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        }

        return Response.json({
            success: true,
            dry_run: dry_run,
            message: dry_run 
                ? `DRY RUN: Would update ${updateDetails.length} analysis results and ${snapshotUpdateDetails.length} salary snapshots`
                : `Updated ${updates.length} analysis results and ${snapshotUpdates.length} salary snapshots`,
            analysis_results: {
                total_found: resultsWithSickLeave.length,
                updates: dry_run ? updateDetails : updateDetails.length
            },
            salary_snapshots: {
                total_found: snapshotsWithSickLeave.length,
                updates: dry_run ? snapshotUpdateDetails : snapshotUpdateDetails.length
            }
        });

    } catch (error) {
        console.error('Recalculation error:', error);
        return Response.json({ 
            success: false,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});