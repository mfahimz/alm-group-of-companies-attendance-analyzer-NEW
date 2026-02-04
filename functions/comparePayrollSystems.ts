import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 4: COMPARE PAYROLL SYSTEMS (ADMIN ONLY)
 * 
 * Compares legacy project-based payroll vs calendar-based payroll for validation.
 * 
 * Inputs:
 * - calendar_month_id (calendar system)
 * - project_id (legacy system with finalized report)
 * 
 * Output:
 * - Side-by-side comparison table
 * - Employee-level differences
 * - Summary statistics
 * 
 * Read-only validation tool, no editing allowed.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ADMIN ONLY
        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin') {
            return Response.json({ 
                error: 'Access denied: Admin role required for payroll comparison' 
            }, { status: 403 });
        }

        const { calendar_month_id, project_id } = await req.json();

        if (!calendar_month_id || !project_id) {
            return Response.json({ 
                error: 'calendar_month_id and project_id are required' 
            }, { status: 400 });
        }

        console.log('[comparePayrollSystems] Comparing:', { calendar_month_id, project_id });

        // ============================================================
        // FETCH CALENDAR DATA
        // ============================================================
        const [calendarMonth, attendanceSummaries, payrollSnapshots] = await Promise.all([
            base44.asServiceRole.entities.CalendarMonth.filter({ id: calendar_month_id }, null, 1).then(r => r[0]),
            base44.asServiceRole.entities.AttendanceSummary.filter({ calendar_month_id }, null, 5000),
            base44.asServiceRole.entities.PayrollSnapshot.filter({ calendar_month_id }, null, 5000)
        ]);

        if (!calendarMonth) {
            return Response.json({ error: 'CalendarMonth not found' }, { status: 404 });
        }

        // ============================================================
        // FETCH LEGACY DATA
        // ============================================================
        const [project, reportRuns] = await Promise.all([
            base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 1).then(r => r[0]),
            base44.asServiceRole.entities.ReportRun.filter({ project_id, is_final: true }, null, 1)
        ]);

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        if (reportRuns.length === 0) {
            return Response.json({ error: 'No finalized report found for this project' }, { status: 404 });
        }

        const finalReport = reportRuns[0];

        const [analysisResults, salarySnapshots] = await Promise.all([
            base44.asServiceRole.entities.AnalysisResult.filter({ 
                project_id, 
                report_run_id: finalReport.id 
            }, null, 5000),
            base44.asServiceRole.entities.SalarySnapshot.filter({ 
                project_id, 
                report_run_id: finalReport.id 
            }, null, 5000)
        ]);

        console.log('[comparePayrollSystems] Data counts:', {
            calendar_attendance: attendanceSummaries.length,
            calendar_payroll: payrollSnapshots.length,
            legacy_analysis: analysisResults.length,
            legacy_salary: salarySnapshots.length
        });

        // ============================================================
        // BUILD COMPARISON TABLE
        // ============================================================
        const comparisons = [];
        const differences = [];

        for (const calendarPayroll of payrollSnapshots) {
            const attId = String(calendarPayroll.attendance_id);
            
            const legacySalary = salarySnapshots.find(s => String(s.attendance_id) === attId);
            const calendarAttendance = attendanceSummaries.find(a => String(a.attendance_id) === attId);
            const legacyAnalysis = analysisResults.find(a => String(a.attendance_id) === attId);

            if (!legacySalary) {
                console.warn('[comparePayrollSystems] No legacy salary for', attId);
                continue;
            }

            const comparison = {
                attendance_id: attId,
                name: calendarPayroll.name,
                department: calendarPayroll.department,
                legacy: {
                    working_days: legacyAnalysis?.working_days || 0,
                    present_days: legacyAnalysis?.present_days || 0,
                    annual_leave_count: legacyAnalysis?.annual_leave_count || 0,
                    deductible_minutes: legacyAnalysis?.deductible_minutes || 0,
                    total_salary: legacySalary.total_salary || 0,
                    netDeduction: legacySalary.netDeduction || 0,
                    deductibleHoursPay: legacySalary.deductibleHoursPay || 0,
                    total: legacySalary.total || 0,
                    wpsPay: legacySalary.wpsPay || 0
                },
                calendar: {
                    working_days: calendarAttendance?.working_days || 0,
                    present_days: calendarAttendance?.present_days || 0,
                    annual_leave_count: calendarAttendance?.annual_leave_count || 0,
                    deductible_minutes: calendarAttendance?.deductible_minutes || 0,
                    total_salary: calendarPayroll.total_salary || 0,
                    netDeduction: calendarPayroll.netDeduction || 0,
                    deductibleHoursPay: calendarPayroll.deductibleHoursPay || 0,
                    total: calendarPayroll.total || 0,
                    wpsPay: calendarPayroll.wpsPay || 0
                },
                diff: {}
            };

            // Calculate differences
            for (const key of Object.keys(comparison.legacy)) {
                const legacyVal = comparison.legacy[key] || 0;
                const calendarVal = comparison.calendar[key] || 0;
                const diff = Math.round((calendarVal - legacyVal) * 100) / 100;
                
                if (Math.abs(diff) > 0.01) {
                    comparison.diff[key] = diff;
                    differences.push({
                        attendance_id: attId,
                        name: comparison.name,
                        field: key,
                        legacy: legacyVal,
                        calendar: calendarVal,
                        diff: diff
                    });
                }
            }

            comparisons.push(comparison);
        }

        // ============================================================
        // SUMMARY STATISTICS
        // ============================================================
        const summary = {
            employees_compared: comparisons.length,
            employees_with_differences: differences.length > 0 ? new Set(differences.map(d => d.attendance_id)).size : 0,
            total_differences: differences.length,
            legacy_total_payroll: salarySnapshots.reduce((sum, s) => sum + (s.total || 0), 0),
            calendar_total_payroll: payrollSnapshots.reduce((sum, s) => sum + (s.total || 0), 0)
        };

        summary.payroll_difference = Math.round((summary.calendar_total_payroll - summary.legacy_total_payroll) * 100) / 100;

        console.log('[comparePayrollSystems] Summary:', summary);

        return Response.json({
            success: true,
            calendar_month: {
                id: calendarMonth.id,
                year: calendarMonth.year,
                month: calendarMonth.month,
                status: calendarMonth.status
            },
            legacy_project: {
                id: project.id,
                name: project.name,
                date_from: project.date_from,
                date_to: project.date_to
            },
            summary: summary,
            comparisons: comparisons,
            differences: differences,
            warning: 'Calendar payroll is PREVIEW ONLY. Payments still use legacy project-based payroll.'
        });

    } catch (error) {
        console.error('[comparePayrollSystems] Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});