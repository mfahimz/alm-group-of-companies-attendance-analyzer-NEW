import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * AUDIT REPORT RUN INTEGRITY
 * 
 * Validates data consistency across the entire report pipeline for a finalized report_run_id.
 * 
 * Checks:
 * 1. AnalysisResult.deductible_minutes vs SalarySnapshot.deductible_minutes (must match exactly)
 * 2. SalarySnapshot.deductibleHours vs SalaryReport.snapshot_data deductibleHours (must match exactly)
 * 3. Duplicate AnalysisResult rows for same (report_run_id, attendance_id)
 * 4. SalarySnapshot rows where report_run_id doesn't match the SalaryReport that references them
 * 5. Missing AnalysisResult for employees in SalarySnapshot
 * 
 * Acceptance Criteria: 0 mismatches
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

        console.log(`[auditReportRunIntegrity] Starting audit for report_run_id: ${report_run_id}`);

        // Fetch all related data for this report_run_id
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

        // Build audit results
        const issues = [];
        const details = [];

        // ============================================================
        // CHECK 1: Duplicate AnalysisResult rows
        // ============================================================
        const analysisGrouped = {};
        analysisResults.forEach(ar => {
            const key = String(ar.attendance_id);
            if (!analysisGrouped[key]) {
                analysisGrouped[key] = [];
            }
            analysisGrouped[key].push(ar);
        });

        const duplicateAnalysisResults = Object.entries(analysisGrouped)
            .filter(([, rows]) => rows.length > 1)
            .map(([attendance_id, rows]) => ({
                attendance_id,
                count: rows.length,
                ids: rows.map(r => r.id)
            }));

        if (duplicateAnalysisResults.length > 0) {
            issues.push({
                type: 'DUPLICATE_ANALYSIS_RESULTS',
                severity: 'CRITICAL',
                count: duplicateAnalysisResults.length,
                message: `${duplicateAnalysisResults.length} employees have duplicate AnalysisResult rows for this report_run_id`,
                details: duplicateAnalysisResults
            });
        }

        // ============================================================
        // CHECK 2: AnalysisResult.deductible_minutes vs SalarySnapshot.deductible_minutes
        // ============================================================
        const deductibleMismatches = [];
        
        for (const snapshot of salarySnapshots) {
            const attendance_id_str = String(snapshot.attendance_id);
            const analysisRow = analysisResults.find(ar => String(ar.attendance_id) === attendance_id_str);
            
            if (!analysisRow) {
                deductibleMismatches.push({
                    attendance_id: snapshot.attendance_id,
                    hrms_id: snapshot.hrms_id,
                    name: snapshot.name,
                    issue: 'MISSING_ANALYSIS_RESULT',
                    analysis_deductible_minutes: null,
                    snapshot_deductible_minutes: snapshot.deductible_minutes,
                    delta: null
                });
                continue;
            }
            
            const analysisDeductible = analysisRow.deductible_minutes || 0;
            const snapshotDeductible = snapshot.deductible_minutes || 0;
            
            if (Math.abs(analysisDeductible - snapshotDeductible) > 0.01) {
                deductibleMismatches.push({
                    attendance_id: snapshot.attendance_id,
                    hrms_id: snapshot.hrms_id,
                    name: snapshot.name,
                    issue: 'DEDUCTIBLE_MINUTES_MISMATCH',
                    analysis_deductible_minutes: analysisDeductible,
                    snapshot_deductible_minutes: snapshotDeductible,
                    delta: snapshotDeductible - analysisDeductible,
                    analysis_id: analysisRow.id,
                    snapshot_id: snapshot.id
                });
            }
        }

        if (deductibleMismatches.length > 0) {
            issues.push({
                type: 'DEDUCTIBLE_MINUTES_MISMATCH',
                severity: 'CRITICAL',
                count: deductibleMismatches.length,
                message: `${deductibleMismatches.length} employees have mismatched deductible_minutes between AnalysisResult and SalarySnapshot`,
                details: deductibleMismatches
            });
        }

        // ============================================================
        // CHECK 3: SalarySnapshot.deductibleHours vs SalaryReport.snapshot_data
        // ============================================================
        const reportMismatches = [];
        
        for (const salaryReport of salaryReports) {
            let reportData = [];
            try {
                reportData = JSON.parse(salaryReport.snapshot_data || '[]');
            } catch {
                issues.push({
                    type: 'INVALID_SNAPSHOT_DATA',
                    severity: 'CRITICAL',
                    count: 1,
                    message: 'SalaryReport.snapshot_data is not valid JSON',
                    salary_report_id: salaryReport.id,
                    salary_report_name: salaryReport.report_name
                });
                continue;
            }
            
            for (const reportRow of reportData) {
                const attendance_id_str = String(reportRow.attendance_id);
                const snapshot = salarySnapshots.find(s => String(s.attendance_id) === attendance_id_str);
                
                if (!snapshot) {
                    reportMismatches.push({
                        attendance_id: reportRow.attendance_id,
                        hrms_id: reportRow.hrms_id,
                        name: reportRow.name,
                        issue: 'MISSING_SALARY_SNAPSHOT',
                        snapshot_deductibleHours: null,
                        report_deductibleHours: reportRow.deductibleHours,
                        delta: null,
                        salary_report_id: salaryReport.id,
                        salary_report_name: salaryReport.report_name
                    });
                    continue;
                }
                
                const snapshotHours = snapshot.deductibleHours || 0;
                const reportHours = reportRow.deductibleHours || 0;
                
                if (Math.abs(snapshotHours - reportHours) > 0.01) {
                    reportMismatches.push({
                        attendance_id: reportRow.attendance_id,
                        hrms_id: reportRow.hrms_id,
                        name: reportRow.name,
                        issue: 'DEDUCTIBLE_HOURS_MISMATCH',
                        snapshot_deductibleHours: snapshotHours,
                        report_deductibleHours: reportHours,
                        delta: reportHours - snapshotHours,
                        snapshot_id: snapshot.id,
                        salary_report_id: salaryReport.id,
                        salary_report_name: salaryReport.report_name
                    });
                }
            }
        }

        if (reportMismatches.length > 0) {
            issues.push({
                type: 'SALARY_REPORT_MISMATCH',
                severity: 'CRITICAL',
                count: reportMismatches.length,
                message: `${reportMismatches.length} employees have mismatched deductibleHours between SalarySnapshot and SalaryReport.snapshot_data`,
                details: reportMismatches
            });
        }

        // ============================================================
        // CHECK 4: SalarySnapshot.report_run_id matches SalaryReport.report_run_id
        // ============================================================
        const orphanedSnapshots = [];
        
        for (const snapshot of salarySnapshots) {
            const isReferencedByReport = salaryReports.some(sr => sr.report_run_id === report_run_id);
            if (!isReferencedByReport) {
                orphanedSnapshots.push({
                    attendance_id: snapshot.attendance_id,
                    hrms_id: snapshot.hrms_id,
                    name: snapshot.name,
                    snapshot_report_run_id: snapshot.report_run_id,
                    snapshot_id: snapshot.id
                });
            }
        }

        if (orphanedSnapshots.length > 0) {
            issues.push({
                type: 'ORPHANED_SNAPSHOTS',
                severity: 'WARNING',
                count: orphanedSnapshots.length,
                message: `${orphanedSnapshots.length} SalarySnapshots exist for report_run_id ${report_run_id} but no SalaryReport references them`,
                details: orphanedSnapshots
            });
        }

        // ============================================================
        // CHECK 5: Full pipeline trace for a sample employee (if requested)
        // ============================================================
        const sampleEmployeeId = '107'; // Can be made dynamic
        const sampleAnalysis = analysisResults.find(ar => String(ar.attendance_id) === sampleEmployeeId);
        const sampleSnapshot = salarySnapshots.find(s => String(s.attendance_id) === sampleEmployeeId);
        
        let sampleReportRow = null;
        if (salaryReports.length > 0) {
            try {
                const reportData = JSON.parse(salaryReports[0].snapshot_data || '[]');
                sampleReportRow = reportData.find(r => String(r.attendance_id) === sampleEmployeeId);
            } catch {}
        }
        
        const sampleTrace = {
            attendance_id: sampleEmployeeId,
            analysis_result: sampleAnalysis ? {
                id: sampleAnalysis.id,
                working_days: sampleAnalysis.working_days,
                present_days: sampleAnalysis.present_days,
                late_minutes: sampleAnalysis.late_minutes,
                early_checkout_minutes: sampleAnalysis.early_checkout_minutes,
                other_minutes: sampleAnalysis.other_minutes,
                approved_minutes: sampleAnalysis.approved_minutes,
                grace_minutes: sampleAnalysis.grace_minutes,
                deductible_minutes: sampleAnalysis.deductible_minutes,
                manual_deductible_minutes: sampleAnalysis.manual_deductible_minutes
            } : null,
            salary_snapshot: sampleSnapshot ? {
                id: sampleSnapshot.id,
                working_days: sampleSnapshot.working_days,
                present_days: sampleSnapshot.present_days,
                late_minutes: sampleSnapshot.late_minutes,
                early_checkout_minutes: sampleSnapshot.early_checkout_minutes,
                other_minutes: sampleSnapshot.other_minutes,
                approved_minutes: sampleSnapshot.approved_minutes,
                grace_minutes: sampleSnapshot.grace_minutes,
                deductible_minutes: sampleSnapshot.deductible_minutes,
                deductibleHours: sampleSnapshot.deductibleHours
            } : null,
            salary_report_row: sampleReportRow ? {
                working_days: sampleReportRow.working_days,
                present_days: sampleReportRow.present_days,
                late_minutes: sampleReportRow.late_minutes,
                early_checkout_minutes: sampleReportRow.early_checkout_minutes,
                deductibleHours: sampleReportRow.deductibleHours
            } : null
        };

        // ============================================================
        // SUMMARY
        // ============================================================
        const totalIssuesCount = issues.reduce((sum, issue) => sum + issue.count, 0);

        const summary = {
            report_run_id,
            report_name: reportRun.report_name,
            is_final: reportRun.is_final,
            total_analysis_results: analysisResults.length,
            total_salary_snapshots: salarySnapshots.length,
            total_salary_reports: salaryReports.length,
            total_issues: totalIssuesCount,
            issues_breakdown: {
                duplicate_analysis_results: duplicateAnalysisResults.length,
                deductible_minutes_mismatches: deductibleMismatches.length,
                salary_report_mismatches: reportMismatches.length,
                orphaned_snapshots: orphanedSnapshots.length
            }
        };

        console.log(`[auditReportRunIntegrity] Audit complete: ${totalIssuesCount} issues found`);

        return Response.json({
            success: true,
            summary,
            issues,
            sample_trace: sampleTrace,
            message: totalIssuesCount === 0 
                ? '✅ INTEGRITY CHECK PASSED - No mismatches found'
                : `❌ INTEGRITY CHECK FAILED - ${totalIssuesCount} issues found`
        });

    } catch (error) {
        console.error('Audit report run integrity error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});