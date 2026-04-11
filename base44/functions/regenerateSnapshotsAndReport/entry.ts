import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * REGENERATE SALARY SNAPSHOTS AND REPORT
 * 
 * COMPLETE FIX:
 * 1. Delete old SalarySnapshot records
 * 2. Regenerate fresh snapshots from correct AnalysisResult data
 * 3. Update salary report with new snapshot_data
 * 
 * This fixes the 0.18 vs 0.22 hours discrepancy for ALL employees.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Auth check - use extended_role with fallback to role
        const user = await base44.auth.me();
        const userRole = user?.extended_role || user?.role || 'user';
        if (!user || !['admin', 'supervisor', 'ceo'].includes(userRole)) {
            return Response.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { salary_report_id } = await req.json();

        if (!salary_report_id) {
            return Response.json({ error: 'salary_report_id required' }, { status: 400 });
        }

        console.log('[regenerateSnapshotsAndReport] Starting regeneration for report:', salary_report_id);

        // 1. Get salary report
        const salaryReports = await base44.asServiceRole.entities.SalaryReport.filter({ id: salary_report_id });
        if (salaryReports.length === 0) {
            return Response.json({ error: 'Salary report not found' }, { status: 404 });
        }
        const salaryReport = salaryReports[0];

        console.log('[regenerateSnapshotsAndReport] Found report:', salaryReport.report_name);

        // 2. Delete old snapshots
        const oldSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            report_run_id: salaryReport.report_run_id
        });

        console.log(`[regenerateSnapshotsAndReport] Deleting ${oldSnapshots.length} old snapshots`);
        await Promise.all(oldSnapshots.map(s => base44.asServiceRole.entities.SalarySnapshot.delete(s.id)));

        // 3. Regenerate snapshots using createSalarySnapshots
        console.log('[regenerateSnapshotsAndReport] Calling createSalarySnapshots...');
        const createResult = await base44.asServiceRole.functions.invoke('createSalarySnapshots', {
            project_id: salaryReport.project_id,
            report_run_id: salaryReport.report_run_id
        });

        if (!createResult.data.success) {
            throw new Error('Failed to create snapshots: ' + createResult.data.message);
        }

        console.log('[regenerateSnapshotsAndReport] Created', createResult.data.snapshots_created, 'snapshots');

        // 4. Get fresh snapshots
        const freshSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            report_run_id: salaryReport.report_run_id
        });

        console.log(`[regenerateSnapshotsAndReport] Retrieved ${freshSnapshots.length} fresh snapshots`);

        // 5. Update salary report with new snapshot data
        const snapshotData = JSON.stringify(freshSnapshots);
        
        // Recalculate totals
        let totalSalaryAmount = 0;
        let totalDeductions = 0;
        let totalOtSalary = 0;

        for (const snap of freshSnapshots) {
            totalSalaryAmount += snap.total || 0;
            totalDeductions += (snap.netDeduction || 0) + (snap.deductibleHoursPay || 0) + 
                               (snap.otherDeduction || 0) + (snap.advanceSalaryDeduction || 0);
            totalOtSalary += (snap.normalOtSalary || 0) + (snap.specialOtSalary || 0);
        }

        await base44.asServiceRole.entities.SalaryReport.update(salaryReport.id, {
            snapshot_data: snapshotData,
            total_salary_amount: Math.round(totalSalaryAmount),
            total_deductions: Math.round(totalDeductions),
            total_ot_salary: Math.round(totalOtSalary),
            employee_count: freshSnapshots.length
        });

        console.log('[regenerateSnapshotsAndReport] Updated salary report with fresh data');

        return Response.json({
            success: true,
            snapshots_regenerated: freshSnapshots.length,
            report_updated: true,
            message: `Successfully regenerated ${freshSnapshots.length} snapshots with correct deductible hours. Refresh the salary report page.`
        });

    } catch (error) {
        console.error('[regenerateSnapshotsAndReport] Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});