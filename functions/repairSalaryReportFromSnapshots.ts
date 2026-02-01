import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * REPAIR SALARY REPORT FROM SNAPSHOTS
 * 
 * Repairs corrupted salary data by enforcing the correct pipeline:
 * AnalysisResult (finalized) → SalarySnapshot → SalaryReport.snapshot_data
 * 
 * Strategy:
 * 1. If SalarySnapshot.deductible_minutes != AnalysisResult.deductible_minutes:
 *    → Delete SalarySnapshot, recreate from AnalysisResult (invoke createSalarySnapshots)
 * 2. If SalaryReport.snapshot_data deductibleHours != SalarySnapshot.deductibleHours:
 *    → Regenerate SalaryReport.snapshot_data from live SalarySnapshot rows
 * 
 * CRITICAL: All operations use the SAME report_run_id - no alternative data sources allowed
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || (user.role !== 'admin' && user.extended_role !== 'admin')) {
            return Response.json({ error: 'Unauthorized - admin only' }, { status: 401 });
        }

        const { report_run_id } = await req.json();

        if (!report_run_id) {
            return Response.json({ 
                error: 'report_run_id is required' 
            }, { status: 400 });
        }

        console.log(`[repairSalaryReportFromSnapshots] Starting repair for report_run_id: ${report_run_id}`);

        // Fetch all related data
        const [reportRuns, analysisResults, salarySnapshots, salaryReports] = await Promise.all([
            base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id }),
            base44.asServiceRole.entities.AnalysisResult.filter({ report_run_id }),
            base44.asServiceRole.entities.SalarySnapshot.filter({ report_run_id }),
            base44.asServiceRole.entities.SalaryReport.filter({ report_run_id })
        ]);

        if (reportRuns.length === 0) {
            return Response.json({ 
                error: 'ReportRun not found' 
            }, { status: 404 });
        }

        const reportRun = reportRuns[0];
        const project_id = reportRun.project_id;

        let snapshotsRecreated = 0;
        let reportsRegenerated = 0;
        const errors = [];

        // ============================================================
        // STEP 1: Check and repair SalarySnapshot vs AnalysisResult
        // ============================================================
        const snapshotMismatches = [];
        
        for (const snapshot of salarySnapshots) {
            const attendance_id_str = String(snapshot.attendance_id);
            const analysisRow = analysisResults.find(ar => String(ar.attendance_id) === attendance_id_str);
            
            if (!analysisRow) {
                snapshotMismatches.push({
                    attendance_id: snapshot.attendance_id,
                    reason: 'MISSING_ANALYSIS_RESULT',
                    snapshot_id: snapshot.id
                });
                continue;
            }
            
            // Check all attendance fields for mismatch
            const fields = [
                'working_days', 'present_days', 'full_absence_count', 'annual_leave_count',
                'sick_leave_count', 'late_minutes', 'early_checkout_minutes', 'other_minutes',
                'approved_minutes', 'grace_minutes', 'deductible_minutes'
            ];
            
            const mismatches = fields.filter(field => {
                const analysisVal = analysisRow[field] || 0;
                const snapshotVal = snapshot[field] || 0;
                return Math.abs(analysisVal - snapshotVal) > 0.01;
            });
            
            if (mismatches.length > 0) {
                snapshotMismatches.push({
                    attendance_id: snapshot.attendance_id,
                    reason: 'FIELD_MISMATCH',
                    mismatched_fields: mismatches,
                    snapshot_id: snapshot.id
                });
            }
        }

        // If mismatches found, delete all snapshots and recreate via createSalarySnapshots
        if (snapshotMismatches.length > 0) {
            console.log(`[repairSalaryReportFromSnapshots] Found ${snapshotMismatches.length} snapshot mismatches, recreating all snapshots`);
            
            // Delete all existing snapshots for this report_run_id
            for (const snapshot of salarySnapshots) {
                await base44.asServiceRole.entities.SalarySnapshot.delete(snapshot.id);
            }
            
            // Recreate snapshots from AnalysisResult using service role
            const createResponse = await fetch(`${Deno.env.get('BASE44_API_URL')}/apps/${Deno.env.get('BASE44_APP_ID')}/functions/createSalarySnapshots/invoke`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${req.headers.get('Authorization')?.replace('Bearer ', '')}`
                },
                body: JSON.stringify({ project_id, report_run_id })
            });
            
            const createResponseData = await createResponse.json();
            
            if (createResponseData?.success) {
                snapshotsRecreated = createResponseData.snapshots_created || 0;
                console.log(`[repairSalaryReportFromSnapshots] Recreated ${snapshotsRecreated} snapshots`);
            } else {
                errors.push(`Failed to recreate snapshots: ${createResponseData?.error || 'Unknown error'}`);
            }
            
            // Re-fetch snapshots after recreation
            const newSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({ report_run_id });
            salarySnapshots.length = 0;
            salarySnapshots.push(...newSnapshots);
        }

        // ============================================================
        // STEP 2: Regenerate SalaryReport.snapshot_data from SalarySnapshot
        // ============================================================
        for (const salaryReport of salaryReports) {
            let needsRegeneration = false;
            
            // Check if snapshot_data matches live SalarySnapshot rows
            try {
                const reportData = JSON.parse(salaryReport.snapshot_data || '[]');
                
                for (const reportRow of reportData) {
                    const attendance_id_str = String(reportRow.attendance_id);
                    const snapshot = salarySnapshots.find(s => String(s.attendance_id) === attendance_id_str);
                    
                    if (!snapshot) {
                        needsRegeneration = true;
                        break;
                    }
                    
                    // Check critical fields
                    if (Math.abs((snapshot.deductibleHours || 0) - (reportRow.deductibleHours || 0)) > 0.01 ||
                        Math.abs((snapshot.working_days || 0) - (reportRow.working_days || 0)) > 0.01 ||
                        Math.abs((snapshot.present_days || 0) - (reportRow.present_days || 0)) > 0.01 ||
                        Math.abs((snapshot.deductible_minutes || 0) - (reportRow.deductible_minutes || 0)) > 0.01) {
                        needsRegeneration = true;
                        break;
                    }
                }
            } catch {
                needsRegeneration = true;
            }
            
            if (needsRegeneration) {
                console.log(`[repairSalaryReportFromSnapshots] Regenerating SalaryReport ${salaryReport.report_name}`);
                
                // Build fresh snapshot_data from live SalarySnapshot entities
                const freshSnapshotData = salarySnapshots.map(snap => ({
                    attendance_id: snap.attendance_id,
                    hrms_id: snap.hrms_id,
                    name: snap.name,
                    department: snap.department,
                    basic_salary: snap.basic_salary,
                    allowances: snap.allowances,
                    total_salary: snap.total_salary,
                    working_hours: snap.working_hours,
                    salary_divisor: snap.salary_divisor,
                    ot_divisor: snap.ot_divisor,
                    prev_month_divisor: snap.prev_month_divisor || 0,
                    working_days: snap.working_days,
                    present_days: snap.present_days,
                    full_absence_count: snap.full_absence_count,
                    annual_leave_count: snap.annual_leave_count,
                    sick_leave_count: snap.sick_leave_count,
                    late_minutes: snap.late_minutes,
                    early_checkout_minutes: snap.early_checkout_minutes,
                    other_minutes: snap.other_minutes,
                    approved_minutes: snap.approved_minutes,
                    grace_minutes: snap.grace_minutes,
                    deductible_minutes: snap.deductible_minutes,
                    salary_leave_days: snap.salary_leave_days,
                    leaveDays: snap.leaveDays,
                    leavePay: snap.leavePay,
                    salaryLeaveAmount: snap.salaryLeaveAmount,
                    deductibleHours: snap.deductibleHours,
                    deductibleHoursPay: snap.deductibleHoursPay,
                    netDeduction: snap.netDeduction,
                    salary_month_start: snap.salary_month_start,
                    salary_month_end: snap.salary_month_end,
                    extra_prev_month_deductible_minutes: snap.extra_prev_month_deductible_minutes || 0,
                    extra_prev_month_lop_days: snap.extra_prev_month_lop_days || 0,
                    extra_prev_month_lop_pay: snap.extra_prev_month_lop_pay || 0,
                    extra_prev_month_deductible_hours_pay: snap.extra_prev_month_deductible_hours_pay || 0,
                    normalOtHours: snap.normalOtHours || 0,
                    normalOtSalary: snap.normalOtSalary || 0,
                    specialOtHours: snap.specialOtHours || 0,
                    specialOtSalary: snap.specialOtSalary || 0,
                    totalOtSalary: (snap.normalOtSalary || 0) + (snap.specialOtSalary || 0),
                    otherDeduction: snap.otherDeduction || 0,
                    bonus: snap.bonus || 0,
                    incentive: snap.incentive || 0,
                    advanceSalaryDeduction: snap.advanceSalaryDeduction || 0,
                    total: snap.total,
                    wpsPay: snap.wpsPay,
                    balance: snap.balance || 0,
                    wps_cap_enabled: snap.wps_cap_enabled || false,
                    wps_cap_amount: snap.wps_cap_amount || 4900,
                    wps_cap_applied: snap.wps_cap_applied || false,
                    snapshot_created_at: snap.snapshot_created_at,
                    attendance_source: snap.attendance_source || 'ANALYZED'
                }));
                
                // Recalculate totals
                let totalSalaryAmount = 0;
                let totalDeductions = 0;
                let totalOtSalary = 0;
                
                freshSnapshotData.forEach(row => {
                    totalSalaryAmount += row.total || 0;
                    totalDeductions += (row.netDeduction || 0) + (row.deductibleHoursPay || 0) + (row.otherDeduction || 0) + (row.advanceSalaryDeduction || 0);
                    totalOtSalary += row.totalOtSalary || 0;
                });
                
                // Update the SalaryReport
                await base44.asServiceRole.entities.SalaryReport.update(salaryReport.id, {
                    snapshot_data: JSON.stringify(freshSnapshotData),
                    employee_count: freshSnapshotData.length,
                    total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
                    total_deductions: Math.round(totalDeductions * 100) / 100,
                    total_ot_salary: Math.round(totalOtSalary * 100) / 100
                });
                
                reportsRegenerated++;
                console.log(`[repairSalaryReportFromSnapshots] Regenerated SalaryReport ${salaryReport.report_name}`);
            }
        }

        // ============================================================
        // FINAL VERIFICATION: Run audit again
        // ============================================================
        const verifyResponse = await fetch(`${Deno.env.get('BASE44_API_URL')}/apps/${Deno.env.get('BASE44_APP_ID')}/functions/auditReportRunIntegrity/invoke`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${req.headers.get('Authorization')?.replace('Bearer ', '')}`
            },
            body: JSON.stringify({ report_run_id })
        });
        
        const verifyResponseData = await verifyResponse.json();

        const finalIssuesCount = verifyResponseData?.summary?.total_issues || 0;

        return Response.json({
            success: true,
            report_run_id,
            report_name: reportRun.report_name,
            actions_taken: {
                snapshots_recreated: snapshotsRecreated,
                reports_regenerated: reportsRegenerated
            },
            errors: errors.length > 0 ? errors : null,
            final_verification: {
                total_issues: finalIssuesCount,
                status: finalIssuesCount === 0 ? 'CLEAN' : 'STILL_HAS_ISSUES',
                message: finalIssuesCount === 0 
                    ? '✅ REPAIR SUCCESSFUL - 0 mismatches after repair'
                    : `⚠️ REPAIR INCOMPLETE - ${finalIssuesCount} mismatches remain`
            },
            message: `Repair complete: ${snapshotsRecreated} snapshots recreated, ${reportsRegenerated} reports regenerated. Final status: ${finalIssuesCount === 0 ? 'CLEAN' : `${finalIssuesCount} issues remain`}`
        });

    } catch (error) {
        console.error('Repair salary report error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});