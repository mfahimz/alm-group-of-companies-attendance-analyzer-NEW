import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * BACKFILL SALARY REPORT FROM SNAPSHOTS
 * 
 * Regenerates SalaryReport.snapshot_data from live SalarySnapshot entities
 * WITHOUT touching the SalarySnapshot records themselves.
 * 
 * Use case: Fix corrupted SalaryReport.snapshot_data where SalarySnapshot is correct
 * but the report JSON diverged (e.g., from custom date range recalculation bug).
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || (user.role !== 'admin' && user.extended_role !== 'admin')) {
            return Response.json({ error: 'Unauthorized - admin only' }, { status: 401 });
        }

        const { salary_report_id } = await req.json();

        if (!salary_report_id) {
            return Response.json({ 
                error: 'salary_report_id is required' 
            }, { status: 400 });
        }

        // Fetch the salary report
        const reports = await base44.asServiceRole.entities.SalaryReport.filter({ 
            id: salary_report_id 
        });

        if (reports.length === 0) {
            return Response.json({ 
                error: 'SalaryReport not found' 
            }, { status: 404 });
        }

        const report = reports[0];

        // Fetch live SalarySnapshot records for this report_run_id
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            report_run_id: report.report_run_id
        });

        if (snapshots.length === 0) {
            return Response.json({ 
                error: 'No SalarySnapshot records found for this report' 
            }, { status: 404 });
        }

        console.log(`[backfillSalaryReportFromSnapshots] Regenerating snapshot_data for report ${report.report_name} from ${snapshots.length} live snapshots`);

        // Build fresh snapshot_data from live SalarySnapshot entities
        // This is the CORRECT source of truth - preserves finalized attendance values
        const freshSnapshotData = snapshots.map(snap => ({
            // Identity
            attendance_id: snap.attendance_id,
            hrms_id: snap.hrms_id,
            name: snap.name,
            department: snap.department,
            
            // Base salary
            basic_salary: snap.basic_salary,
            allowances: snap.allowances,
            total_salary: snap.total_salary,
            working_hours: snap.working_hours,
            
            // Divisors
            salary_divisor: snap.salary_divisor,
            ot_divisor: snap.ot_divisor,
            prev_month_divisor: snap.prev_month_divisor || 0,
            
            // CRITICAL: Finalized attendance values (immutable after finalization)
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
            
            // Derived salary values (immutable after finalization)
            salary_leave_days: snap.salary_leave_days,
            leaveDays: snap.leaveDays,
            leavePay: snap.leavePay,
            salaryLeaveAmount: snap.salaryLeaveAmount,
            deductibleHours: snap.deductibleHours,
            deductibleHoursPay: snap.deductibleHoursPay,
            netDeduction: snap.netDeduction,
            
            // Previous month fields (Al Maraghi Motors - DISABLED, should be 0)
            salary_month_start: snap.salary_month_start,
            salary_month_end: snap.salary_month_end,
            extra_prev_month_deductible_minutes: snap.extra_prev_month_deductible_minutes || 0,
            extra_prev_month_lop_days: snap.extra_prev_month_lop_days || 0,
            extra_prev_month_lop_pay: snap.extra_prev_month_lop_pay || 0,
            extra_prev_month_deductible_hours_pay: snap.extra_prev_month_deductible_hours_pay || 0,
            
            // OT & Adjustments (editable fields)
            normalOtHours: snap.normalOtHours || 0,
            normalOtSalary: snap.normalOtSalary || 0,
            specialOtHours: snap.specialOtHours || 0,
            specialOtSalary: snap.specialOtSalary || 0,
            totalOtSalary: (snap.normalOtSalary || 0) + (snap.specialOtSalary || 0),
            
            otherDeduction: snap.otherDeduction || 0,
            bonus: snap.bonus || 0,
            incentive: snap.incentive || 0,
            advanceSalaryDeduction: snap.advanceSalaryDeduction || 0,
            
            // Final totals
            total: snap.total,
            wpsPay: snap.wpsPay,
            balance: snap.balance || 0,
            
            // WPS cap metadata
            wps_cap_enabled: snap.wps_cap_enabled || false,
            wps_cap_amount: snap.wps_cap_amount || 4900,
            wps_cap_applied: snap.wps_cap_applied || false,
            
            // Metadata
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

        // Update the SalaryReport with fresh snapshot_data
        await base44.asServiceRole.entities.SalaryReport.update(report.id, {
            snapshot_data: JSON.stringify(freshSnapshotData),
            employee_count: freshSnapshotData.length,
            total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
            total_deductions: Math.round(totalDeductions * 100) / 100,
            total_ot_salary: Math.round(totalOtSalary * 100) / 100
        });

        console.log(`[backfillSalaryReportFromSnapshots] Successfully backfilled report ${report.report_name}`);

        return Response.json({
            success: true,
            report_id: report.id,
            report_name: report.report_name,
            employees_backfilled: freshSnapshotData.length,
            total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
            message: `Successfully regenerated snapshot_data from ${freshSnapshotData.length} live SalarySnapshot records`
        });

    } catch (error) {
        console.error('Backfill salary report error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});