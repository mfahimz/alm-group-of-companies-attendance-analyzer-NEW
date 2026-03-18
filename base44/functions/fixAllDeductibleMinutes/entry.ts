import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * FIX ALL DEDUCTIBLE MINUTES - SYSTEM-WIDE
 * 
 * PROBLEM: AnalysisResult.deductible_minutes has incorrect values (grace applied twice)
 * SOLUTION: Recalculate for ALL records using correct formula
 * 
 * Formula: deductible_minutes = max(0, late + early + other - grace - approved)
 * 
 * This fixes the root cause affecting ALL employees in ALL reports.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Auth check - admin or supervisor only
        const user = await base44.auth.me();
        if (!user || !['admin', 'supervisor'].includes(user.role)) {
            return Response.json({ error: 'Unauthorized - Admin or Supervisor only' }, { status: 403 });
        }

        const { project_id, report_run_id } = await req.json();

        if (!project_id || !report_run_id) {
            return Response.json({ 
                error: 'project_id and report_run_id required' 
            }, { status: 400 });
        }

        console.log('[fixAllDeductibleMinutes] Starting fix for project:', project_id, 'report:', report_run_id);

        // Fetch ALL AnalysisResult records for this report
        const analysisResults = await base44.asServiceRole.entities.AnalysisResult.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        if (analysisResults.length === 0) {
            return Response.json({ 
                success: false,
                message: 'No AnalysisResult records found for this report'
            });
        }

        console.log(`[fixAllDeductibleMinutes] Found ${analysisResults.length} records to fix`);

        let fixedCount = 0;
        let unchangedCount = 0;
        const changes = [];

        // Recalculate deductible_minutes for each record
        for (const result of analysisResults) {
            const lateMinutes = result.late_minutes || 0;
            const earlyMinutes = result.early_checkout_minutes || 0;
            const otherMinutes = result.other_minutes || 0;
            const graceMinutes = result.grace_minutes || 0;
            const approvedMinutes = result.approved_minutes || 0;

            // CORRECT FORMULA: Grace is applied ONCE, not twice
            const correctDeductibleMinutes = Math.max(0, 
                lateMinutes + earlyMinutes + otherMinutes - graceMinutes - approvedMinutes
            );

            const oldDeductibleMinutes = result.deductible_minutes || 0;

            // Only update if value changed
            if (oldDeductibleMinutes !== correctDeductibleMinutes) {
                await base44.asServiceRole.entities.AnalysisResult.update(result.id, {
                    deductible_minutes: correctDeductibleMinutes
                });

                fixedCount++;
                changes.push({
                    attendance_id: result.attendance_id,
                    old_value: oldDeductibleMinutes,
                    new_value: correctDeductibleMinutes,
                    difference: correctDeductibleMinutes - oldDeductibleMinutes
                });

                console.log(`[fixAllDeductibleMinutes] Fixed ${result.attendance_id}: ${oldDeductibleMinutes} → ${correctDeductibleMinutes}`);
            } else {
                unchangedCount++;
            }
        }

        console.log(`[fixAllDeductibleMinutes] Complete: ${fixedCount} fixed, ${unchangedCount} unchanged`);

        return Response.json({
            success: true,
            total_records: analysisResults.length,
            fixed_count: fixedCount,
            unchanged_count: unchangedCount,
            changes: changes.slice(0, 10), // Show first 10 changes
            message: `Fixed ${fixedCount} records. NOW RE-FINALIZE THE REPORT to regenerate salary snapshots.`
        });

    } catch (error) {
        console.error('[fixAllDeductibleMinutes] Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});