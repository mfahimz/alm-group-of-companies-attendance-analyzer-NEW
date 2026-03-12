import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * AUDIT DEDUCTIBLE MISMATCH SCANNER
 *
 * This serverless function audits deductible minute data consistency across three data sources:
 *   1. **AnalysisResult** – the finalized attendance records.
 *   2. **SalarySnapshot** – the persisted snapshot of salary‑related data.
 *   3. **SalaryReport.snapshot_data** – a frozen JSON snapshot captured when the salary report was generated.
 *
 * It identifies mismatches where the deductible minutes (or derived hours) diverge between these sources,
 * providing a detailed report for downstream investigation.
 */

// Entry point: HTTP handler invoked by Deno Deploy or local dev server.
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { report_run_id } = await req.json();

        if (!report_run_id) {
            return Response.json({ error: 'report_run_id is required' }, { status: 400 });
        }

        // Fetch all three data sources
        // Fetch the three relevant data sets in parallel for the given report_run_id.
        //   - analysisResults: attendance analysis records.
        //   - salarySnapshots: stored salary snapshot entities.
        //   - salaryReports: salary report entities containing a JSON snapshot of data.
        const [analysisResults, salarySnapshots, salaryReports] = await Promise.all([
            base44.asServiceRole.entities.AnalysisResult.filter({ report_run_id }),
            base44.asServiceRole.entities.SalarySnapshot.filter({ report_run_id }),
            base44.asServiceRole.entities.SalaryReport.filter({ report_run_id })
        ]);

        if (analysisResults.length === 0) {
            return Response.json({ 
                error: 'No AnalysisResults found for this report_run_id' 
            }, { status: 404 });
        }

        // Parse the JSON snapshot data from the first SalaryReport (if present).
        // This data mirrors the state of deductible minutes at report generation time.
        let reportSnapshotData = [];
        if (salaryReports.length > 0 && salaryReports[0].snapshot_data) {
            try {
                reportSnapshotData = JSON.parse(salaryReports[0].snapshot_data);
            } catch (e) {
                console.warn('Failed to parse snapshot_data:', e);
            }
        }

        // Build comparison table
        const comparisons = [];
        const mismatches = [];

        for (const analysis of analysisResults) {
            const attendanceId = String(analysis.attendance_id);
            
            // Find corresponding snapshot
            const snapshot = salarySnapshots.find(s => String(s.attendance_id) === attendanceId);
            
            // Find corresponding report row
            const reportRow = reportSnapshotData.find(r => String(r.attendance_id) === attendanceId);

            // Extract values
            const analysisDeductibleMin = analysis.deductible_minutes || 0;
            const snapshotDeductibleMin = snapshot?.deductible_minutes || null;
            const snapshotDeductibleHrs = snapshot?.deductibleHours || null;
            const reportDeductibleHrs = reportRow?.deductibleHours || null;

            // Calculate expected hours from analysis
            const expectedHours = Math.round((analysisDeductibleMin / 60) * 100) / 100;

            // Detect mismatches
            let hasMismatch = false;
            let deltaStage = null;

            // Stage A: AnalysisResult -> SalarySnapshot
            if (snapshot && snapshotDeductibleMin !== analysisDeductibleMin) {
                hasMismatch = true;
                deltaStage = 'A: AnalysisResult → SalarySnapshot';
            }

            // Stage B: SalarySnapshot -> SalaryReport.snapshot_data
            if (snapshot && reportRow && Math.abs(snapshotDeductibleHrs - reportDeductibleHrs) > 0.001) {
                hasMismatch = true;
                deltaStage = deltaStage ? deltaStage + ' + B: SalarySnapshot → SalaryReport' : 'B: SalarySnapshot → SalaryReport';
            }

            // Check if deductibleHours matches expected conversion
            if (snapshot && Math.abs(snapshotDeductibleHrs - expectedHours) > 0.01) {
                hasMismatch = true;
                deltaStage = deltaStage ? deltaStage + ' + CONVERSION_ERROR' : 'CONVERSION_ERROR';
            }

            // Assemble a record summarising the comparison for this employee.
            const record = {
                attendance_id: attendanceId,
                name: analysis.name || snapshot?.name || reportRow?.name || 'Unknown',
                analysis_deductible_minutes: analysisDeductibleMin,
                snapshot_deductible_minutes: snapshotDeductibleMin,
                snapshot_deductibleHours: snapshotDeductibleHrs,
                report_deductibleHours: reportDeductibleHrs,
                expected_hours: expectedHours,
                has_mismatch: hasMismatch,
                delta_stage: deltaStage,
                snapshot_exists: !!snapshot,
                report_row_exists: !!reportRow
            };

            comparisons.push(record);
            
            if (hasMismatch) {
                mismatches.push(record);
            }
        }

        // Build a high‑level summary of the audit operation.
        const summary = {
            total_employees: analysisResults.length,
            total_mismatches: mismatches.length,
            snapshots_found: salarySnapshots.length,
            report_rows_found: reportSnapshotData.length,
            has_salary_report: salaryReports.length > 0
        };

        return Response.json({
            success: true,
            summary,
            mismatches: mismatches.length > 0 ? mismatches : 'No mismatches found',
            all_comparisons: comparisons,
            message: mismatches.length > 0 
                ? `Found ${mismatches.length} mismatch(es) out of ${analysisResults.length} employees`
                : `All ${analysisResults.length} employees have consistent deductible minutes`
        });

    } catch (error) {
        // Log unexpected errors and return a generic 500 response.
        console.error('Audit deductible mismatch error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});