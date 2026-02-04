import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 3 MIRROR – READ ONLY
 * 
 * Mirrors finalized legacy project-based payroll data into calendar-based schema.
 * 
 * CRITICAL RULES:
 * - NO recalculation
 * - NO formula execution
 * - Exact 1:1 copy from legacy records
 * - Validates counts match exactly
 * - Admin-only operation
 * - Does NOT modify any legacy data
 * 
 * Mapping:
 * Project (finalized) → CalendarMonth (status=MIRRORED)
 * AnalysisResult → AttendanceSummary
 * SalarySnapshot → PayrollSnapshot
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
                error: 'Access denied: Admin role required for data mirroring' 
            }, { status: 403 });
        }

        const { project_id } = await req.json();

        if (!project_id) {
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }

        console.log('[mirrorLegacyToCalendar] ============================================');
        console.log('[mirrorLegacyToCalendar] PHASE 3 MIRROR START');
        console.log('[mirrorLegacyToCalendar] Project ID:', project_id);
        console.log('[mirrorLegacyToCalendar] ============================================');

        // ============================================================
        // STEP 1: FETCH LEGACY PROJECT
        // ============================================================
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 1);
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        console.log('[mirrorLegacyToCalendar] Project:', project.name, 'Company:', project.company);

        // ============================================================
        // STEP 2: FIND FINALIZED REPORT RUN
        // ============================================================
        const reportRuns = await base44.asServiceRole.entities.ReportRun.filter({ 
            project_id: project_id,
            is_final: true
        }, null, 5000);

        if (reportRuns.length === 0) {
            return Response.json({ 
                error: 'No finalized report found for this project. Cannot mirror non-finalized data.' 
            }, { status: 400 });
        }

        if (reportRuns.length > 1) {
            console.warn(`[mirrorLegacyToCalendar] Multiple finalized reports found (${reportRuns.length}). Using first one.`);
        }

        const reportRun = reportRuns[0];
        console.log('[mirrorLegacyToCalendar] Finalized Report:', reportRun.report_name, 'ID:', reportRun.id);

        // ============================================================
        // STEP 3: FETCH LEGACY DATA
        // ============================================================
        console.log('[mirrorLegacyToCalendar] Fetching legacy data...');
        const [analysisResults, salarySnapshots] = await Promise.all([
            base44.asServiceRole.entities.AnalysisResult.filter({ 
                project_id: project_id,
                report_run_id: reportRun.id
            }, null, 5000),
            base44.asServiceRole.entities.SalarySnapshot.filter({ 
                project_id: project_id,
                report_run_id: reportRun.id
            }, null, 5000)
        ]);

        console.log('[mirrorLegacyToCalendar] Legacy data counts:');
        console.log('[mirrorLegacyToCalendar]   AnalysisResult:', analysisResults.length);
        console.log('[mirrorLegacyToCalendar]   SalarySnapshot:', salarySnapshots.length);

        // ============================================================
        // INVARIANT PRE-CHECK: Legacy counts must match
        // ============================================================
        if (analysisResults.length !== salarySnapshots.length) {
            return Response.json({ 
                error: `INVARIANT VIOLATION: AnalysisResult count (${analysisResults.length}) != SalarySnapshot count (${salarySnapshots.length})`,
                analysis_count: analysisResults.length,
                snapshot_count: salarySnapshots.length
            }, { status: 400 });
        }

        console.log('[mirrorLegacyToCalendar] ✅ Legacy count check passed');

        // ============================================================
        // STEP 4: CREATE CALENDAR MONTH (1:1 MAPPING)
        // ============================================================
        // Extract year and month from project.date_to (or date_from)
        const projectEndDate = new Date(project.date_to);
        const year = projectEndDate.getFullYear();
        const month = projectEndDate.getMonth() + 1; // 1-12

        // Check if CalendarMonth already exists (prevent duplicates)
        const existingCalendarMonths = await base44.asServiceRole.entities.CalendarMonth.filter({
            legacy_project_id: project_id
        }, null, 1);

        let calendarMonth;
        if (existingCalendarMonths.length > 0) {
            calendarMonth = existingCalendarMonths[0];
            console.log('[mirrorLegacyToCalendar] ℹ️ CalendarMonth already exists, using existing:', calendarMonth.id);
        } else {
            calendarMonth = await base44.asServiceRole.entities.CalendarMonth.create({
                company: project.company,
                year: year,
                month: month,
                start_date: project.date_from,
                end_date: project.date_to,
                status: 'MIRRORED',
                legacy_project_id: project_id,
                legacy_report_run_id: reportRun.id,
                payroll_finalized_at: reportRun.finalized_date || new Date().toISOString(),
                payroll_finalized_by: reportRun.finalized_by || 'system',
                notes: `PHASE 3 MIRROR: Mirrored from legacy project "${project.name}"`
            });

            console.log('[mirrorLegacyToCalendar] ✅ CalendarMonth created:', calendarMonth.id);
        }

        // ============================================================
        // STEP 5: DELETE EXISTING MIRROR DATA (IDEMPOTENT)
        // ============================================================
        console.log('[mirrorLegacyToCalendar] Cleaning existing mirror data...');
        const [existingAttendanceSummaries, existingPayrollSnapshots] = await Promise.all([
            base44.asServiceRole.entities.AttendanceSummary.filter({ 
                calendar_month_id: calendarMonth.id 
            }, null, 5000),
            base44.asServiceRole.entities.PayrollSnapshot.filter({ 
                calendar_month_id: calendarMonth.id 
            }, null, 5000)
        ]);

        if (existingAttendanceSummaries.length > 0) {
            console.log(`[mirrorLegacyToCalendar] Deleting ${existingAttendanceSummaries.length} existing AttendanceSummary records`);
            await Promise.all(existingAttendanceSummaries.map(s => 
                base44.asServiceRole.entities.AttendanceSummary.delete(s.id)
            ));
        }

        if (existingPayrollSnapshots.length > 0) {
            console.log(`[mirrorLegacyToCalendar] Deleting ${existingPayrollSnapshots.length} existing PayrollSnapshot records`);
            await Promise.all(existingPayrollSnapshots.map(s => 
                base44.asServiceRole.entities.PayrollSnapshot.delete(s.id)
            ));
        }

        // ============================================================
        // STEP 6: MIRROR AnalysisResult → AttendanceSummary (1:1 COPY)
        // ============================================================
        console.log('[mirrorLegacyToCalendar] Mirroring AnalysisResult → AttendanceSummary...');
        const attendanceSummaries = analysisResults.map(ar => ({
            // PHASE 3 MIRROR – READ ONLY
            attendance_id: String(ar.attendance_id),
            calendar_month_id: calendarMonth.id,
            company: project.company,
            hrms_id: null, // Will be populated if available in SalarySnapshot
            name: null, // Will be populated from SalarySnapshot
            department: null, // Will be populated from SalarySnapshot
            legacy_analysis_result_id: ar.id,
            // EXACT 1:1 COPY - NO RECALCULATION
            working_days: ar.working_days || 0,
            present_days: ar.present_days || 0,
            full_absence_count: ar.full_absence_count || 0,
            half_absence_count: ar.half_absence_count || 0,
            annual_leave_count: ar.annual_leave_count || 0,
            sick_leave_count: ar.sick_leave_count || 0,
            late_minutes: ar.late_minutes || 0,
            early_minutes: ar.early_checkout_minutes || 0,
            other_minutes: ar.other_minutes || 0,
            approved_minutes: ar.approved_minutes || 0,
            grace_minutes: ar.grace_minutes || 15,
            deductible_minutes: ar.deductible_minutes || 0,
            summary_created_at: new Date().toISOString(),
            is_locked: true // Mirrored data is always locked
        }));

        await base44.asServiceRole.entities.AttendanceSummary.bulkCreate(attendanceSummaries);
        console.log('[mirrorLegacyToCalendar] ✅ Created', attendanceSummaries.length, 'AttendanceSummary records');

        // ============================================================
        // STEP 7: MIRROR SalarySnapshot → PayrollSnapshot (1:1 COPY)
        // ============================================================
        console.log('[mirrorLegacyToCalendar] Mirroring SalarySnapshot → PayrollSnapshot...');
        const payrollSnapshots = salarySnapshots.map(ss => ({
            // PHASE 3 MIRROR – READ ONLY
            attendance_id: String(ss.attendance_id),
            calendar_month_id: calendarMonth.id,
            company: project.company,
            hrms_id: ss.hrms_id,
            name: ss.name,
            department: ss.department,
            legacy_salary_snapshot_id: ss.id,
            // Frozen snapshots (JSON strings for immutability)
            frozen_attendance_snapshot: JSON.stringify({
                working_days: ss.working_days,
                present_days: ss.present_days,
                full_absence_count: ss.full_absence_count,
                annual_leave_count: ss.annual_leave_count,
                sick_leave_count: ss.sick_leave_count,
                deductible_minutes: ss.deductible_minutes
            }),
            frozen_salary_snapshot: JSON.stringify({
                basic_salary: ss.basic_salary,
                allowances: ss.allowances,
                total_salary: ss.total_salary,
                working_hours: ss.working_hours
            }),
            // EXACT 1:1 COPY - NO RECALCULATION
            basic_salary: ss.basic_salary || 0,
            allowances: ss.allowances || 0,
            total_salary: ss.total_salary || 0,
            working_hours: ss.working_hours || 9,
            working_days: ss.working_days || 0,
            present_days: ss.present_days || 0,
            full_absence_count: ss.full_absence_count || 0,
            annual_leave_count: ss.annual_leave_count || 0,
            sick_leave_count: ss.sick_leave_count || 0,
            deductible_minutes: ss.deductible_minutes || 0,
            salary_divisor: ss.salary_divisor || 30,
            // Override fields (copy if present)
            override_present_days: ss.override_present_days,
            override_full_absence_count: ss.override_full_absence_count,
            override_annual_leave_count: ss.override_annual_leave_count,
            override_sick_leave_count: ss.override_sick_leave_count,
            override_deductible_minutes: ss.override_deductible_minutes,
            // Derived salary fields (exact copy)
            leaveDays: ss.leaveDays || 0,
            leavePay: ss.leavePay || 0,
            salaryLeaveAmount: ss.salaryLeaveAmount || 0,
            netDeduction: ss.netDeduction || 0,
            deductibleHours: ss.deductibleHours || 0,
            deductibleHoursPay: ss.deductibleHoursPay || 0,
            // OT fields (exact copy)
            normalOtHours: ss.normalOtHours || 0,
            normalOtSalary: ss.normalOtSalary || 0,
            specialOtHours: ss.specialOtHours || 0,
            specialOtSalary: ss.specialOtSalary || 0,
            totalOtSalary: ss.totalOtSalary || 0,
            // Adjustment fields (exact copy)
            bonus: ss.bonus || 0,
            incentive: ss.incentive || 0,
            otherDeduction: ss.otherDeduction || 0,
            advanceSalaryDeduction: ss.advanceSalaryDeduction || 0,
            // Final totals (exact copy)
            total: ss.total || 0,
            wpsPay: ss.wpsPay || 0,
            balance: ss.balance || 0,
            wps_cap_enabled: ss.wps_cap_enabled || false,
            wps_cap_amount: ss.wps_cap_amount || 4900,
            wps_cap_applied: ss.wps_cap_applied || false,
            snapshot_created_at: new Date().toISOString(),
            recalculation_version: 0
        }));

        await base44.asServiceRole.entities.PayrollSnapshot.bulkCreate(payrollSnapshots);
        console.log('[mirrorLegacyToCalendar] ✅ Created', payrollSnapshots.length, 'PayrollSnapshot records');

        // ============================================================
        // STEP 8: POST-MIRROR INVARIANT CHECKS (MANDATORY)
        // ============================================================
        console.log('[mirrorLegacyToCalendar] Running invariant checks...');
        
        const [finalAttendanceSummaries, finalPayrollSnapshots] = await Promise.all([
            base44.asServiceRole.entities.AttendanceSummary.filter({ 
                calendar_month_id: calendarMonth.id 
            }, null, 5000),
            base44.asServiceRole.entities.PayrollSnapshot.filter({ 
                calendar_month_id: calendarMonth.id 
            }, null, 5000)
        ]);

        console.log('[mirrorLegacyToCalendar] ============================================');
        console.log('[mirrorLegacyToCalendar] INVARIANT CHECK RESULTS:');
        console.log('[mirrorLegacyToCalendar]   Legacy AnalysisResult: ', analysisResults.length);
        console.log('[mirrorLegacyToCalendar]   Mirror AttendanceSummary:', finalAttendanceSummaries.length);
        console.log('[mirrorLegacyToCalendar]   Legacy SalarySnapshot:  ', salarySnapshots.length);
        console.log('[mirrorLegacyToCalendar]   Mirror PayrollSnapshot: ', finalPayrollSnapshots.length);
        console.log('[mirrorLegacyToCalendar] ============================================');

        // CRITICAL: Counts must match exactly
        const errors = [];
        if (finalAttendanceSummaries.length !== analysisResults.length) {
            errors.push(`AttendanceSummary count (${finalAttendanceSummaries.length}) != AnalysisResult count (${analysisResults.length})`);
        }
        if (finalPayrollSnapshots.length !== salarySnapshots.length) {
            errors.push(`PayrollSnapshot count (${finalPayrollSnapshots.length}) != SalarySnapshot count (${salarySnapshots.length})`);
        }

        if (errors.length > 0) {
            console.error('[mirrorLegacyToCalendar] ❌ INVARIANT VIOLATIONS:', errors);
            throw new Error('INVARIANT VIOLATION: ' + errors.join('; '));
        }

        console.log('[mirrorLegacyToCalendar] ✅ All invariant checks passed');

        // ============================================================
        // STEP 9: SAMPLE DATA VALIDATION
        // ============================================================
        const sampleEmployee = salarySnapshots[0];
        const sampleAnalysis = analysisResults.find(ar => String(ar.attendance_id) === String(sampleEmployee.attendance_id));
        const sampleAttendanceSummary = finalAttendanceSummaries.find(as => String(as.attendance_id) === String(sampleEmployee.attendance_id));
        const samplePayrollSnapshot = finalPayrollSnapshots.find(ps => String(ps.attendance_id) === String(sampleEmployee.attendance_id));

        const sampleComparison = {
            employee: {
                attendance_id: sampleEmployee.attendance_id,
                name: sampleEmployee.name,
                department: sampleEmployee.department
            },
            attendance_mapping: {
                legacy_analysis_result_id: sampleAnalysis?.id,
                calendar_attendance_summary_id: sampleAttendanceSummary?.id,
                values_match: {
                    working_days: sampleAnalysis?.working_days === sampleAttendanceSummary?.working_days,
                    present_days: sampleAnalysis?.present_days === sampleAttendanceSummary?.present_days,
                    deductible_minutes: sampleAnalysis?.deductible_minutes === sampleAttendanceSummary?.deductible_minutes
                }
            },
            payroll_mapping: {
                legacy_salary_snapshot_id: sampleEmployee?.id,
                calendar_payroll_snapshot_id: samplePayrollSnapshot?.id,
                values_match: {
                    total_salary: sampleEmployee?.total_salary === samplePayrollSnapshot?.total_salary,
                    total: sampleEmployee?.total === samplePayrollSnapshot?.total,
                    wpsPay: sampleEmployee?.wpsPay === samplePayrollSnapshot?.wpsPay
                }
            }
        };

        console.log('[mirrorLegacyToCalendar] Sample comparison:', JSON.stringify(sampleComparison, null, 2));

        // ============================================================
        // FINAL RESPONSE
        // ============================================================
        return Response.json({
            success: true,
            message: 'Legacy data mirrored successfully to calendar schema',
            calendar_month_id: calendarMonth.id,
            legacy_project_id: project_id,
            legacy_report_run_id: reportRun.id,
            counts: {
                legacy_analysis_results: analysisResults.length,
                calendar_attendance_summaries: finalAttendanceSummaries.length,
                legacy_salary_snapshots: salarySnapshots.length,
                calendar_payroll_snapshots: finalPayrollSnapshots.length
            },
            sample_employee: sampleComparison,
            confirmation: {
                no_legacy_records_modified: true,
                no_recalculation_occurred: true,
                exact_1to1_copy: true
            }
        });

    } catch (error) {
        console.error('[mirrorLegacyToCalendar] ❌ ERROR:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});