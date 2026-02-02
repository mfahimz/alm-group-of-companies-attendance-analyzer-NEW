import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RECALCULATE ALL SALARY SNAPSHOTS
 * 
 * Recalculates salary totals for ALL employees in a report using STORED attendance values.
 * Applies the correct formulas including the fixed salary leave amount calculation.
 * 
 * CRITICAL RULES:
 * - Processes ALL employees in the specified report_run_id
 * - Uses stored attendance values from SalarySnapshot
 * - Applies correct formulas: Salary Leave Amount = (Basic + Allowances) / Divisor * Salary Leave Days
 * - Only updates DERIVED salary fields, never modifies attendance data
 * - Scoped to Al Maraghi Motors ONLY
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // PERMISSION CHECK: Only Admin, Supervisor, HR Manager
        const userRole = user?.extended_role || user?.role || 'user';
        const allowedRoles = ['admin', 'supervisor', 'hr_manager'];
        if (!allowedRoles.includes(userRole)) {
            return Response.json({ 
                error: 'Access denied: Only Admin, Supervisor, or HR Manager can recalculate salaries' 
            }, { status: 403 });
        }

        const { 
            report_run_id,     // Required: ReportRun.id
            project_id         // Required: Project.id
        } = await req.json();

        // Validate required fields
        if (!report_run_id) {
            return Response.json({ error: 'report_run_id is required' }, { status: 400 });
        }
        if (!project_id) {
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }

        // ============================================================
        // FETCH PROJECT
        // ============================================================
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // COMPANY SCOPE CHECK: Al Maraghi Motors ONLY
        if (project.company !== 'Al Maraghi Motors') {
            return Response.json({ 
                error: 'Salary recalculation is only enabled for Al Maraghi Motors.' 
            }, { status: 403 });
        }

        // PROJECT STATUS CHECK
        if (project.status === 'closed') {
            return Response.json({ 
                error: 'Project closed. Salary is read-only.' 
            }, { status: 403 });
        }

        // ============================================================
        // FETCH ALL SALARY SNAPSHOTS FOR THIS REPORT
        // ============================================================
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({ 
            project_id: project_id,
            report_run_id: report_run_id
        });
        
        if (snapshots.length === 0) {
            return Response.json({ 
                error: 'No salary snapshots found for this report.' 
            }, { status: 404 });
        }

        console.log(`[recalculateAllSalarySnapshots] Processing ${snapshots.length} employees...`);

        // ============================================================
        // FETCH ALL EMPLOYEE SALARIES (for efficiency)
        // ============================================================
        const allSalaries = await base44.asServiceRole.entities.EmployeeSalary.filter({
            company: project.company,
            active: true
        });

        // Create lookup maps
        const salaryByHrmsId = {};
        const salaryByAttendanceId = {};
        allSalaries.forEach(sal => {
            if (sal.employee_id) salaryByHrmsId[sal.employee_id] = sal;
            if (sal.attendance_id) salaryByAttendanceId[String(sal.attendance_id)] = sal;
        });

        // ============================================================
        // GET DIVISORS
        // ============================================================
        const divisor = project.salary_calculation_days || 30;
        const otDivisor = project.ot_calculation_days || divisor;

        if (divisor <= 0 || otDivisor <= 0) {
            return Response.json({ error: 'Invalid divisor configuration' }, { status: 400 });
        }

        // ============================================================
        // PROCESS EACH EMPLOYEE
        // ============================================================
        const results = [];
        const errors = [];
        let successCount = 0;

        for (const snapshot of snapshots) {
            try {
                // Find salary record
                let salaryRecord = null;
                if (snapshot.hrms_id && salaryByHrmsId[snapshot.hrms_id]) {
                    salaryRecord = salaryByHrmsId[snapshot.hrms_id];
                } else if (salaryByAttendanceId[String(snapshot.attendance_id)]) {
                    salaryRecord = salaryByAttendanceId[String(snapshot.attendance_id)];
                }

                if (!salaryRecord) {
                    errors.push({
                        employee: snapshot.name,
                        attendance_id: snapshot.attendance_id,
                        error: 'Salary record not found'
                    });
                    continue;
                }

                const workingHours = snapshot.working_hours || salaryRecord.working_hours || 9;
                if (workingHours <= 0) {
                    errors.push({
                        employee: snapshot.name,
                        attendance_id: snapshot.attendance_id,
                        error: 'Invalid working hours'
                    });
                    continue;
                }

                // ============================================================
                // BASE SALARY VALUES
                // ============================================================
                const basicSalary = snapshot.basic_salary || salaryRecord.basic_salary || 0;
                const allowances = snapshot.allowances || Number(salaryRecord.allowances) || 0;
                const totalSalary = snapshot.total_salary || salaryRecord.total_salary || 0;

                // ============================================================
                // ATTENDANCE VALUES (READ-ONLY)
                // ============================================================
                const annualLeaveCount = snapshot.annual_leave_count || 0;
                const fullAbsenceCount = snapshot.full_absence_count || 0;
                const salaryLeaveDays = snapshot.salary_leave_days || annualLeaveCount;
                const deductibleMinutes = snapshot.deductible_minutes || 0;

                // ============================================================
                // ADJUSTMENT VALUES (PRESERVE)
                // ============================================================
                const normalOtHours = snapshot.normalOtHours || 0;
                const specialOtHours = snapshot.specialOtHours || 0;
                const bonus = snapshot.bonus || 0;
                const incentive = snapshot.incentive || 0;
                const otherDeduction = snapshot.otherDeduction || 0;
                const advanceSalaryDeduction = snapshot.advanceSalaryDeduction || 0;

                // ============================================================
                // RECALCULATE DERIVED FIELDS
                // ============================================================

                // Leave Days = Annual Leave + LOP
                const leaveDays = annualLeaveCount + fullAbsenceCount;

                // Leave Pay = (Total Salary / Divisor) * Leave Days
                const leavePay = leaveDays > 0 ? (totalSalary / divisor) * leaveDays : 0;
                
                // Salary Leave Amount = (Basic + Allowances) / Divisor * Salary Leave Days
                const salaryLeaveAmount = salaryLeaveDays > 0 
                    ? ((basicSalary + allowances) / divisor) * salaryLeaveDays 
                    : 0;
                
                // Net Deduction = max(0, Leave Pay - Salary Leave Amount)
                const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);

                // Deductible Hours = Deductible Minutes / 60
                const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;
                
                // Deductible Hours Pay (current month, uses salary divisor)
                const hourlyRateDeduction = totalSalary / divisor / workingHours;
                const deductibleHoursPay = hourlyRateDeduction * deductibleHours;

                // OT Hourly Rate (uses OT Divisor)
                const otHourlyRate = totalSalary / otDivisor / workingHours;
                
                // OT Salaries
                const normalOtSalary = otHourlyRate * 1.25 * normalOtHours;
                const specialOtSalary = otHourlyRate * 1.5 * specialOtHours;
                const totalOtSalary = normalOtSalary + specialOtSalary;

                // Final Total
                let finalTotal = totalSalary 
                    + totalOtSalary 
                    + bonus 
                    + incentive
                    - netDeduction 
                    - deductibleHoursPay
                    - otherDeduction 
                    - advanceSalaryDeduction;

                // Conditional rounding
                const bonusHasDecimals = (bonus || 0) % 1 !== 0;
                if (!bonusHasDecimals) {
                    finalTotal = Math.round(finalTotal);
                }

                // WPS Split Logic
                let wpsPay = finalTotal;
                let balance = 0;
                let wpsCapApplied = false;
                const wpsCapEnabled = salaryRecord?.wps_cap_enabled || false;
                const wpsCapAmount = salaryRecord?.wps_cap_amount ?? 4900;

                if (wpsCapEnabled) {
                    if (finalTotal <= 0) {
                        wpsPay = 0;
                        balance = 0;
                        wpsCapApplied = false;
                    } else {
                        const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                        const rawExcess = Math.max(0, finalTotal - cap);
                        if (!bonusHasDecimals) {
                            balance = Math.floor(rawExcess / 100) * 100;
                        } else {
                            balance = rawExcess;
                        }
                        wpsPay = finalTotal - balance;
                        wpsCapApplied = rawExcess > 0;
                    }
                } else if (finalTotal <= 0) {
                    wpsPay = 0;
                    balance = 0;
                }

                // ============================================================
                // UPDATE SNAPSHOT
                // ============================================================
                const updatePayload = {
                    leaveDays: leaveDays,
                    leavePay: leavePay,
                    salaryLeaveAmount: salaryLeaveAmount,
                    netDeduction: netDeduction,
                    deductibleHours: deductibleHours,
                    deductibleHoursPay: deductibleHoursPay,
                    extra_prev_month_lop_pay: 0,
                    extra_prev_month_deductible_hours_pay: 0,
                    normalOtSalary: normalOtSalary,
                    specialOtSalary: specialOtSalary,
                    totalOtSalary: totalOtSalary,
                    total: finalTotal,
                    wpsPay: wpsPay,
                    balance: balance,
                    wps_cap_enabled: wpsCapEnabled,
                    wps_cap_amount: wpsCapAmount,
                    wps_cap_applied: wpsCapApplied
                };

                await base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, updatePayload);

                successCount++;
                results.push({
                    employee: snapshot.name,
                    attendance_id: snapshot.attendance_id,
                    old_total: snapshot.total,
                    new_total: finalTotal,
                    change: Math.round((finalTotal - (snapshot.total || 0)) * 100) / 100
                });

            } catch (err) {
                errors.push({
                    employee: snapshot.name,
                    attendance_id: snapshot.attendance_id,
                    error: err.message
                });
            }
        }

        // ============================================================
        // AUDIT LOG
        // ============================================================
        try {
            await base44.asServiceRole.entities.AuditLog.create({
                action: 'RECALCULATE_ALL_SALARY_SNAPSHOTS',
                entity_type: 'SalarySnapshot',
                entity_id: report_run_id,
                user_email: user.email,
                company: project.company,
                details: JSON.stringify({
                    project_id: project_id,
                    report_run_id: report_run_id,
                    total_employees: snapshots.length,
                    success_count: successCount,
                    error_count: errors.length
                })
            });
        } catch (auditError) {
            console.warn('[recalculateAllSalarySnapshots] Audit log failed:', auditError.message);
        }

        return Response.json({
            success: true,
            total_employees: snapshots.length,
            success_count: successCount,
            error_count: errors.length,
            results: results,
            errors: errors.length > 0 ? errors : undefined,
            message: `Recalculated ${successCount} of ${snapshots.length} employees successfully.`
        });

    } catch (error) {
        console.error('Recalculate all salary snapshots error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});