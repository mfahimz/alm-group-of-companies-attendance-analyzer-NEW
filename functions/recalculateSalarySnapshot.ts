import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * RECALCULATE SALARY SNAPSHOT
 * 
 * Recalculates salary totals for a single employee using STORED attendance values.
 * 
 * CRITICAL RULES:
 * - ONLY reads from SalarySnapshot, Project, EmployeeSalary
 * - NEVER queries Punch, ShiftTiming, Exception, AnalysisResult
 * - NEVER modifies attendance data (deductible_minutes, annual_leave_count, etc.)
 * - ONLY recalculates DERIVED salary fields
 * - Scoped to Al Maraghi Motors ONLY
 * - Supports PREVIEW mode (no DB changes) and APPLY mode (updates DB)
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
            salary_report_id,  // Optional: SalaryReport.id if from SalaryReportDetail
            report_run_id,     // Required: ReportRun.id
            project_id,        // Required: Project.id
            attendance_id,     // Required: employee attendance_id (string or number)
            mode = 'APPLY'     // Optional: 'PREVIEW' or 'APPLY'
        } = await req.json();

        // Validate required fields
        if (!report_run_id) {
            return Response.json({ error: 'report_run_id is required' }, { status: 400 });
        }
        if (!project_id) {
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }
        if (!attendance_id) {
            return Response.json({ error: 'attendance_id is required' }, { status: 400 });
        }

        // Validate mode
        const validModes = ['PREVIEW', 'APPLY'];
        if (!validModes.includes(mode)) {
            return Response.json({ error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }, { status: 400 });
        }

        // ============================================================
        // FETCH PROJECT
        // ============================================================
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 1);
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



        // ============================================================
        // AL MARAGHI MOTORS: ASSUMED PRESENT DAYS NOTE
        // The last 2 days of the salary month are treated as fully present
        // for salary calculation. This is handled in createSalarySnapshots.js
        // and the stored attendance values already reflect this rule.
        // Recalculation uses stored values - no recomputation of assumed days.
        // ============================================================

        // PROJECT STATUS CHECK: Cannot recalculate on closed projects
        if (project.status === 'closed') {
            return Response.json({ 
                error: 'Project closed. Salary is read-only.' 
            }, { status: 403 });
        }

        // ============================================================
        // FETCH SALARY SNAPSHOT
        // ============================================================
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({ 
            project_id: project_id,
            report_run_id: report_run_id,
            attendance_id: String(attendance_id)
        }, null, 1);
        
        if (snapshots.length === 0) {
            return Response.json({ 
                error: 'SalarySnapshot not found for this employee in this report.' 
            }, { status: 404 });
        }
        const snapshot = snapshots[0];

        // ============================================================
        // FETCH EMPLOYEE SALARY MASTER DATA
        // ============================================================
        let salaryRecord = null;
        
        // Try by HRMS ID first if available
        if (snapshot.hrms_id) {
            const salariesByHrms = await base44.asServiceRole.entities.EmployeeSalary.filter({
                employee_id: snapshot.hrms_id,
                company: project.company,
                active: true
            }, null, 1);
            if (salariesByHrms.length > 0) {
                salaryRecord = salariesByHrms[0];
            }
        }
        
        // Fallback to attendance_id
        if (!salaryRecord) {
            const salariesByAttendance = await base44.asServiceRole.entities.EmployeeSalary.filter({
                attendance_id: String(attendance_id),
                company: project.company,
                active: true
            }, null, 1);
            if (salariesByAttendance.length > 0) {
                salaryRecord = salariesByAttendance[0];
            }
        }

        if (!salaryRecord) {
            return Response.json({ 
                error: `EmployeeSalary record not found for employee ${snapshot.name} (attendance_id: ${attendance_id}). Cannot recalculate salary.` 
            }, { status: 400 });
        }

        // ============================================================
        // AL MARAGHI MOTORS: SALARY INCREMENT RESOLUTION FOR OT
        // OT must use PREVIOUS month salary (the month before salary month)
        // ============================================================
        const isAlMaraghi = project.company === 'Al Maraghi Motors';
        let prevMonthSalaryForOT = salaryRecord.total_salary || 0;
        
        if (isAlMaraghi) {
            // Fetch salary increments
            const salaryIncrements = await base44.asServiceRole.entities.SalaryIncrement.filter({ 
                company: 'Al Maraghi Motors', 
                active: true 
            }, null, 5000);
            
            // Get increments for this employee
            const empIncrements = salaryIncrements.filter(inc => 
                String(inc.employee_id) === String(snapshot.hrms_id) ||
                String(inc.attendance_id) === String(attendance_id)
            );
            
            if (empIncrements.length > 0 && snapshot.salary_month_start) {
                // Previous month = month before salary month start
                const salaryMonthDate = new Date(snapshot.salary_month_start);
                const prevMonthDate = new Date(salaryMonthDate.getFullYear(), salaryMonthDate.getMonth() - 1, 1);
                const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
                
                // Find the increment effective for previous month (latest increment on or before prev month)
                const applicablePrevIncrements = empIncrements
                    .filter(inc => inc.effective_month <= prevMonthStr)
                    .sort((a, b) => new Date(b.effective_month) - new Date(a.effective_month));
                
                if (applicablePrevIncrements.length > 0) {
                    const prevInc = applicablePrevIncrements[0];
                    prevMonthSalaryForOT = prevInc.new_total_salary || salaryRecord.total_salary;
                }
            }
        }

        // ============================================================
        // VALIDATE WORKING HOURS
        // ============================================================
        const workingHours = snapshot.working_hours || salaryRecord.working_hours || 9;
        if (!workingHours || workingHours <= 0) {
            return Response.json({ 
                error: `Working hours not set for employee ${snapshot.name}. Please set working hours in the salary master.` 
            }, { status: 400 });
        }

        // ============================================================
        // GET DIVISORS
        // ============================================================
        // DIVISOR_LEAVE_DEDUCTION: Used for Leave Pay, Salary Leave Amount, Deductible Hours Pay (current month)
        const divisor = snapshot.salary_divisor || project.salary_calculation_days || 30;
        // DIVISOR_OT: Used for OT Hourly Rate AND Previous Month calculations
        const otDivisor = project.ot_calculation_days || divisor;
        // DIVISOR_PREV_MONTH: Same as OT Divisor (project.ot_calculation_days)
        const prevMonthDivisor = otDivisor;

        if (divisor <= 0) {
            return Response.json({ error: 'Invalid salary_divisor: must be greater than 0' }, { status: 400 });
        }
        if (otDivisor <= 0) {
            return Response.json({ error: 'Invalid ot_calculation_days: must be greater than 0' }, { status: 400 });
        }

        // ============================================================
        // READ-ONLY ATTENDANCE VALUES (NEVER MODIFY THESE)
        // ADMIN DAY OVERRIDES: If override field is set, use it; otherwise use finalized value
        // ============================================================
        const attendanceValues = {
            deductible_minutes: snapshot.deductible_minutes || 0,
            // Effective attendance values (with admin overrides if present)
            present_days: snapshot.override_present_days ?? snapshot.present_days ?? 0,
            annual_leave_count: snapshot.override_annual_leave_count ?? snapshot.annual_leave_count ?? 0,
            sick_leave_count: snapshot.override_sick_leave_count ?? snapshot.sick_leave_count ?? 0,
            full_absence_count: snapshot.override_full_absence_count ?? snapshot.full_absence_count ?? 0,
            salary_leave_days: snapshot.override_salary_leave_days ?? snapshot.salary_leave_days ?? 0,
            working_days: snapshot.override_working_days ?? snapshot.working_days ?? 0,
            // Time-based (never overridden)
            late_minutes: snapshot.late_minutes || 0,
            early_checkout_minutes: snapshot.early_checkout_minutes || 0,
            other_minutes: snapshot.other_minutes || 0,
            approved_minutes: snapshot.approved_minutes || 0,
            grace_minutes: snapshot.grace_minutes || 15,
            // Previous month data (Al Maraghi Motors only)
            extra_prev_month_deductible_minutes: snapshot.extra_prev_month_deductible_minutes || 0,
            extra_prev_month_lop_days: snapshot.extra_prev_month_lop_days || 0
        };

        // ============================================================
        // EDITABLE ADJUSTMENT VALUES (preserve these, do NOT override)
        // ============================================================
        const adjustmentValues = {
            normalOtHours: snapshot.normalOtHours || 0,
            specialOtHours: snapshot.specialOtHours || 0,
            bonus: snapshot.bonus || 0,
            incentive: snapshot.incentive || 0,
            open_leave_salary: Math.max(0, Number(snapshot.open_leave_salary || 0)),
            variable_salary: Math.max(0, Number(snapshot.variable_salary || 0)),
            otherDeduction: snapshot.otherDeduction || 0,
            advanceSalaryDeduction: snapshot.advanceSalaryDeduction || 0
        };

        // ============================================================
        // SALARY COMPONENTS (3 separate entities)
        // ============================================================
        // COMPONENT 1: Basic Salary (base pay)
        const basicSalary = snapshot.basic_salary || salaryRecord.basic_salary || 0;
        
        // COMPONENT 2: Allowances WITHOUT bonus (used for salary leave amount)
        // CRITICAL: This is "allowances" field, NOT "allowances_with_bonus"
        const allowances = snapshot.allowances || Number(salaryRecord.allowances) || 0;
        
        // COMPONENT 3: Allowances WITH bonus (stored in DB but not used here)
        // const allowancesWithBonus = snapshot.allowances_with_bonus || Number(salaryRecord.allowances_with_bonus) || 0;
        
        // Total Salary = Component 1 + Component 2 + Component 3
        const totalSalary = snapshot.total_salary || salaryRecord.total_salary || 0;

        // ============================================================
        // BEFORE VALUES (for comparison)
        // ============================================================
        const beforeValues = {
            leaveDays: snapshot.leaveDays,
            leavePay: snapshot.leavePay,
            salaryLeaveAmount: snapshot.salaryLeaveAmount,
            netDeduction: snapshot.netDeduction,
            deductibleHours: snapshot.deductibleHours,
            deductibleHoursPay: snapshot.deductibleHoursPay,
            extra_prev_month_lop_pay: snapshot.extra_prev_month_lop_pay,
            extra_prev_month_deductible_hours_pay: snapshot.extra_prev_month_deductible_hours_pay,
            normalOtSalary: snapshot.normalOtSalary,
            specialOtSalary: snapshot.specialOtSalary,
            totalOtSalary: snapshot.totalOtSalary,
            total: snapshot.total,
            wpsPay: snapshot.wpsPay,
            balance: snapshot.balance,
            wps_cap_enabled: snapshot.wps_cap_enabled,
            wps_cap_amount: snapshot.wps_cap_amount,
            wps_cap_applied: snapshot.wps_cap_applied
        };

        // ============================================================
        // RECALCULATE DERIVED FIELDS
        // ============================================================

        // Leave Days = Annual Leave + LOP (excludes sick leave per Al Maraghi rule)
        const leaveDays = attendanceValues.annual_leave_count + attendanceValues.full_absence_count;

        // Leave Pay = (Total Salary / Divisor) * Leave Days - conventional round
        const leavePay = leaveDays > 0 ? Math.round((totalSalary / divisor) * leaveDays) : 0;
        
        // ============================================================
        // SALARY LEAVE AMOUNT FORMULA (NON-NEGOTIABLE)
        // Base = Basic Salary + Allowances ONLY (NO BONUS, NO allowances_with_bonus)
        // Formula: (Basic + Allowances) / salary_divisor × salary_leave_days
        // For 9-working-hour employees: round up to nearest multiple of 5
        // ============================================================
        let salaryLeaveAmount = 0;
        const salaryLeaveDays = snapshot.override_salary_leave_days ?? snapshot.salary_leave_days ?? snapshot.annual_leave_count ?? 0;
        
        if (salaryLeaveDays > 0) {
            const salaryBaseForLeave = basicSalary + allowances;
            const rawSalaryLeaveAmount = (salaryBaseForLeave / divisor) * salaryLeaveDays;
            const is9HourEmployee = workingHours === 9;
            salaryLeaveAmount = is9HourEmployee
                ? Math.ceil(rawSalaryLeaveAmount / 5) * 5
                : Math.round(rawSalaryLeaveAmount);
        }
        
        // Net Deduction = max(0, Leave Pay - Salary Leave Amount)
        const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);

        // Deductible Hours = (Deductible Minutes + Other Minutes) / 60
        // CRITICAL: other_minutes must be included in deductible calculation (same as createSalarySnapshots)
        const payrollDeductibleMinutes = (attendanceValues.deductible_minutes || 0) + (attendanceValues.other_minutes || 0);
        const deductibleHours = Math.round((payrollDeductibleMinutes / 60) * 100) / 100;
        
        // Current month hourly rate (uses salary divisor)
        const hourlyRateDeduction = totalSalary / divisor / workingHours;
        
        // Current month Deductible Hours Pay - conventional rounding
        const currentMonthDeductibleHoursPay = Math.round(hourlyRateDeduction * deductibleHours);

        // OT Hourly Rate (uses OT Divisor and PREVIOUS MONTH SALARY for Al Maraghi)
        const otHourlyRate = prevMonthSalaryForOT / otDivisor / workingHours;
        
        // ============================================================
        // DISABLED: Previous month deduction logic
        // Previous month deductions have been removed from Al Maraghi Motors
        // to eliminate hidden deductions from salary totals.
        // ============================================================
        const extraPrevMonthLopPay = 0;
        const extraPrevMonthDeductibleHoursPay = 0;
        
        // Total deductible hours = current month only (no prev month)
        const totalDeductibleHours = deductibleHours;
        
        // Total deductible hours pay = current month only (no prev month)
        const deductibleHoursPay = currentMonthDeductibleHoursPay;
        
        // Normal OT Salary - conventional rounding
        const normalOtSalary = Math.round(otHourlyRate * 1.25 * adjustmentValues.normalOtHours);

        // Special OT Salary - conventional rounding
        const specialOtSalary = Math.round(otHourlyRate * 1.5 * adjustmentValues.specialOtHours);

        // Total OT Salary
        const totalOtSalary = normalOtSalary + specialOtSalary;

        // Final Total = Total Salary + Bonus + effectiveOtOrIncentive + OpenLeave + Variable
        //             - Net Deduction (current month leave)
        //             - Current Month Deductible Hours Pay
        //             - Other Deduction - Advance
        // effectiveOtOrIncentive = max(OT, Incentive) for Operations dept,
        //                          OT + Incentive for all other departments.
        // NO PREVIOUS MONTH DEDUCTIONS
        // ============================================================
        // INCENTIVE vs OVERTIME RULE (Al Maraghi Motors — Operations Department Only)
        // ============================================================
        // For employees in the "Operations" department (across all companies,
        // but noted specifically for Al Maraghi Motors): pay only the HIGHER
        // of overtime vs incentive — not both added together.
        // For all other employees outside the Operations department: both
        // incentive and overtime are added together in full with no comparison.
        // ============================================================
        const isOperationsDept = snapshot.department === 'Operations';
        const effectiveOtOrIncentive = isOperationsDept
            ? Math.max(
                Math.round(totalOtSalary * 100) / 100,
                Math.round(adjustmentValues.incentive * 100) / 100
            )
            : Math.round(totalOtSalary * 100) / 100 + Math.round(adjustmentValues.incentive * 100) / 100;
        let finalTotal = totalSalary 
            + effectiveOtOrIncentive 
            + adjustmentValues.bonus 
            + adjustmentValues.open_leave_salary
            + adjustmentValues.variable_salary
            - netDeduction 
            - currentMonthDeductibleHoursPay
            - adjustmentValues.otherDeduction 
            - adjustmentValues.advanceSalaryDeduction;

        // Conditional rounding: Only round final total if bonus has NO decimal values
        const bonusHasDecimals = (adjustmentValues.bonus || 0) % 1 !== 0;
        if (!bonusHasDecimals) {
            finalTotal = Math.round(finalTotal);
        }

        // ============================================================
        // WPS SPLIT LOGIC (Al Maraghi Motors only)
        // Balance must always be a multiple of 100 (round down)
        // ============================================================
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
                // Calculate raw excess over cap
                const rawExcess = Math.max(0, finalTotal - cap);
                // Round balance DOWN to nearest 100 (only if bonus has no decimals)
                if (!bonusHasDecimals) {
                    balance = Math.floor(rawExcess / 100) * 100;
                } else {
                    balance = rawExcess;
                }
                // WPS gets the rest (total - balance)
                wpsPay = finalTotal - balance;
                wpsCapApplied = rawExcess > 0;
            }
        } else if (finalTotal <= 0) {
            wpsPay = 0;
            balance = 0;
        }

        // ============================================================
        // AFTER VALUES (computed)
        // ============================================================
        const afterValues = {
            leaveDays: leaveDays,
            leavePay: leavePay,
            salaryLeaveAmount: salaryLeaveAmount,
            netDeduction: netDeduction,
            deductibleHours: totalDeductibleHours,
            deductibleHoursPay: deductibleHoursPay,
            extra_prev_month_lop_pay: extraPrevMonthLopPay,
            extra_prev_month_deductible_hours_pay: extraPrevMonthDeductibleHoursPay,
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

        // ============================================================
        // COMPUTE DIFF
        // ============================================================
        const diff = {};
        for (const key of Object.keys(afterValues)) {
            const before = beforeValues[key] || 0;
            const after = afterValues[key] || 0;
            if (Math.abs(before - after) > 0.001) {
                diff[key] = { before, after, change: Math.round((after - before) * 100) / 100 };
            }
        }

        // ============================================================
        // PREVIEW MODE: Return computed values without saving
        // ============================================================
        if (mode === 'PREVIEW') {
            return Response.json({
                success: true,
                mode: 'PREVIEW',
                employee_name: snapshot.name,
                attendance_id: snapshot.attendance_id,
                before: beforeValues,
                after: afterValues,
                diff: diff,
                message: 'Preview only - no changes applied'
            });
        }

        // ============================================================
        // APPLY MODE: Update snapshot with derived fields only
        // ============================================================
        const updatePayload = {
            // Derived leave calculations
            leaveDays: afterValues.leaveDays,
            leavePay: afterValues.leavePay,
            salaryLeaveAmount: afterValues.salaryLeaveAmount,
            netDeduction: afterValues.netDeduction,
            
            // Derived deduction calculations
            deductibleHours: afterValues.deductibleHours,
            deductibleHoursPay: afterValues.deductibleHoursPay,
            
            // Previous month calculations - DISABLED (forced to zero)
            extra_prev_month_lop_pay: 0,
            extra_prev_month_deductible_hours_pay: 0,
            
            // OT calculations (recalculated based on existing OT hours, using OT divisor)
            normalOtSalary: afterValues.normalOtSalary,
            specialOtSalary: afterValues.specialOtSalary,
            totalOtSalary: afterValues.totalOtSalary,
            
            // Final totals
            total: afterValues.total,
            wpsPay: afterValues.wpsPay,
            balance: afterValues.balance,
            
            // WPS Cap fields
            wps_cap_enabled: afterValues.wps_cap_enabled,
            wps_cap_amount: afterValues.wps_cap_amount,
            wps_cap_applied: afterValues.wps_cap_applied
        };

        await base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, updatePayload);

        // ============================================================
        // AUDIT LOG
        // ============================================================
        const changedFields = Object.keys(diff);
        try {
            await base44.asServiceRole.entities.AuditLog.create({
                action: 'RECALCULATE_SALARY_SNAPSHOT',
                entity_type: 'SalarySnapshot',
                entity_id: snapshot.id,
                user_email: user.email,
                company: project.company,
                details: JSON.stringify({
                    project_id: project_id,
                    report_run_id: report_run_id,
                    attendance_id: String(attendance_id),
                    employee_name: snapshot.name,
                    changed_fields: changedFields,
                    previous_total: beforeValues.total,
                    new_total: afterValues.total
                })
            });
        } catch (auditError) {
            console.warn('[recalculateSalarySnapshot] Audit log failed:', auditError.message);
            // Don't fail the operation if audit log fails
        }

        return Response.json({
            success: true,
            mode: 'APPLY',
            employee_name: snapshot.name,
            attendance_id: snapshot.attendance_id,
            before: beforeValues,
            after: afterValues,
            diff: diff,
            changed_fields: changedFields,
            message: `Salary recalculated successfully for ${snapshot.name}. ${changedFields.length} field(s) updated.`
        });

    } catch (error) {
        console.error('Recalculate salary snapshot error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});