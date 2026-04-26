import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * REGENERATE SALARY REPORT
 * 
 * Regenerates a SalaryReport's snapshot_data from current SalarySnapshot entities.
 * Use this after fixing SalarySnapshot data to update the report.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRole = user?.extended_role || user?.role || 'user';
        // Allow admin, supervisor, hr_manager, and senior_accountant to regenerate salary reports
        const allowedRoles = ['admin', 'supervisor', 'hr_manager', 'senior_accountant'];
        if (!allowedRoles.includes(userRole)) {
            return Response.json({ error: 'Access denied: Insufficient role' }, { status: 403 });
        }

        const { salary_report_id } = await req.json();

        if (!salary_report_id) {
            return Response.json({ error: 'salary_report_id is required' }, { status: 400 });
        }

        // Fetch the salary report
        const reports = await base44.asServiceRole.entities.SalaryReport.filter({ id: salary_report_id });
        if (reports.length === 0) {
            return Response.json({ error: 'Salary report not found' }, { status: 404 });
        }
        const report = reports[0];

        // Fetch current salary snapshots
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: report.project_id,
            report_run_id: report.report_run_id
        });

        if (snapshots.length === 0) {
            return Response.json({ error: 'No salary snapshots found for this report' }, { status: 404 });
        }

        // Build updated snapshot data
        const updatedData = snapshots.map(s => ({
            attendance_id: s.attendance_id,
            hrms_id: s.hrms_id,
            name: s.name,
            department: s.department,
            attendance_source: s.attendance_source,
            basic_salary: s.basic_salary,
            allowances: s.allowances,
            total_salary: s.total_salary,
            working_hours: s.working_hours,
            working_days: s.working_days,
            salary_divisor: s.salary_divisor,
            ot_divisor: s.ot_divisor,
            prev_month_divisor: s.prev_month_divisor,
            present_days: s.present_days,
            full_absence_count: s.full_absence_count,
            annual_leave_count: s.annual_leave_count,
            sick_leave_count: s.sick_leave_count,
            late_minutes: s.late_minutes,
            early_checkout_minutes: s.early_checkout_minutes,
            other_minutes: s.other_minutes,
            approved_minutes: s.approved_minutes,
            grace_minutes: s.grace_minutes,
            deductible_minutes: s.deductible_minutes,
            salary_leave_days: s.salary_leave_days,
            leaveDays: s.leaveDays,
            leavePay: s.leavePay,
            salaryLeaveAmount: s.salaryLeaveAmount,
            deductibleHours: s.deductibleHours,
            deductibleHoursPay: s.deductibleHoursPay,
            netDeduction: s.netDeduction,
            extra_prev_month_deductible_minutes: s.extra_prev_month_deductible_minutes,
            extra_prev_month_lop_days: s.extra_prev_month_lop_days,
            extra_prev_month_lop_pay: s.extra_prev_month_lop_pay,
            extra_prev_month_deductible_hours_pay: s.extra_prev_month_deductible_hours_pay,
            salary_month_start: s.salary_month_start,
            salary_month_end: s.salary_month_end,
            normalOtHours: s.normalOtHours,
            normalOtSalary: s.normalOtSalary,
            specialOtHours: s.specialOtHours,
            specialOtSalary: s.specialOtSalary,
            totalOtSalary: s.totalOtSalary,
            otherDeduction: s.otherDeduction,
            bonus: s.bonus,
            incentive: s.incentive,
            open_leave_salary: s.open_leave_salary || 0,
            variable_salary: s.variable_salary || 0,
            advanceSalaryDeduction: s.advanceSalaryDeduction,
            total: s.total,
            wpsPay: s.wpsPay,
            balance: s.balance,
            wps_cap_enabled: s.wps_cap_enabled,
            wps_cap_amount: s.wps_cap_amount,
            wps_cap_applied: s.wps_cap_applied
        }));

        // Recalculate totals
        let totalSalaryAmount = 0;
        let totalDeductions = 0;
        let totalOtSalary = 0;

        updatedData.forEach(row => {
            totalSalaryAmount += row.total || 0;
            totalDeductions += (row.netDeduction || 0) + (row.deductibleHoursPay || 0) + (row.otherDeduction || 0) + (row.advanceSalaryDeduction || 0);
            totalOtSalary += (row.normalOtSalary || 0) + (row.specialOtSalary || 0);
        });

        // Update the report
        await base44.asServiceRole.entities.SalaryReport.update(salary_report_id, {
            snapshot_data: JSON.stringify(updatedData),
            total_salary_amount: Math.round(totalSalaryAmount),
            total_deductions: Math.round(totalDeductions),
            total_ot_salary: Math.round(totalOtSalary)
        });

        // Log audit
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'REGENERATE_SALARY_REPORT',
            entity_type: 'SalaryReport',
            entity_id: salary_report_id,
            details: `Regenerated salary report from ${snapshots.length} current snapshots`
        });

        return Response.json({
            success: true,
            message: 'Salary report regenerated successfully',
            employees_count: updatedData.length,
            total_salary_amount: Math.round(totalSalaryAmount),
            total_deductions: Math.round(totalDeductions)
        });

    } catch (error) {
        console.error('Regenerate salary report error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});