import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * RECALCULATE INDIVIDUAL SALARY
 * 
 * Recalculates salary totals for a single employee using STORED attendance values.
 * 
 * CRITICAL RULES:
 * - ONLY reads from SalarySnapshot, Project, EmployeeSalary
 * - NEVER queries Punch, ShiftTiming, Exception, AnalysisResult
 * - NEVER modifies attendance data (deductible_minutes, annual_leave_count, etc.)
 * - ONLY recalculates DERIVED salary fields
 * - Scoped to Al Maraghi Motors ONLY
 * - Requires Admin, Supervisor, or HR Manager role
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

        const { salary_snapshot_id } = await req.json();

        if (!salary_snapshot_id) {
            return Response.json({ error: 'salary_snapshot_id is required' }, { status: 400 });
        }

        // Fetch the salary snapshot
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({ id: salary_snapshot_id });
        if (snapshots.length === 0) {
            return Response.json({ error: 'SalarySnapshot not found' }, { status: 404 });
        }
        const snapshot = snapshots[0];

        // Fetch the project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: snapshot.project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // COMPANY SCOPE CHECK: Al Maraghi Motors ONLY
        if (project.company !== 'Al Maraghi Motors') {
            return Response.json({ 
                error: 'This feature is only available for Al Maraghi Motors' 
            }, { status: 403 });
        }

        // PROJECT STATUS CHECK: Cannot recalculate on closed projects
        if (project.status === 'closed') {
            return Response.json({ 
                error: 'Cannot recalculate salary on a closed project' 
            }, { status: 400 });
        }

        // Verify report is final
        const reports = await base44.asServiceRole.entities.ReportRun.filter({ 
            id: snapshot.report_run_id, 
            project_id: snapshot.project_id 
        });
        if (reports.length === 0 || !reports[0].is_final) {
            return Response.json({ 
                error: 'Can only recalculate salary on finalized reports' 
            }, { status: 400 });
        }

        // Fetch employee salary master data for additional validation
        const salaries = await base44.asServiceRole.entities.EmployeeSalary.filter({
            attendance_id: snapshot.attendance_id,
            company: project.company,
            active: true
        });

        // VALIDATION: working_hours and salary_divisor must be positive
        const workingHours = snapshot.working_hours || salaries[0]?.working_hours || 9;
        const divisor = snapshot.salary_divisor || project.salary_calculation_days || 30;
        const otDivisor = project.ot_calculation_days || divisor;

        if (workingHours <= 0) {
            return Response.json({ error: 'Invalid working_hours: must be greater than 0' }, { status: 400 });
        }
        if (divisor <= 0) {
            return Response.json({ error: 'Invalid salary_divisor: must be greater than 0' }, { status: 400 });
        }

        // ============================================================
        // READ-ONLY ATTENDANCE VALUES (NEVER MODIFY THESE)
        // ============================================================
        const attendanceValues = {
            deductible_minutes: snapshot.deductible_minutes || 0,
            annual_leave_count: snapshot.annual_leave_count || 0,
            sick_leave_count: snapshot.sick_leave_count || 0,
            full_absence_count: snapshot.full_absence_count || 0,
            salary_leave_days: snapshot.salary_leave_days || 0,
            late_minutes: snapshot.late_minutes || 0,
            early_checkout_minutes: snapshot.early_checkout_minutes || 0,
            other_minutes: snapshot.other_minutes || 0,
            approved_minutes: snapshot.approved_minutes || 0,
            grace_minutes: snapshot.grace_minutes || 15,
            working_days: snapshot.working_days || 0,
            present_days: snapshot.present_days || 0
        };

        // ============================================================
        // EDITABLE VALUES (used in calculation, can be modified via UI)
        // ============================================================
        const editableValues = {
            normalOtHours: snapshot.normalOtHours || 0,
            specialOtHours: snapshot.specialOtHours || 0,
            bonus: snapshot.bonus || 0,
            incentive: snapshot.incentive || 0,
            otherDeduction: snapshot.otherDeduction || 0,
            advanceSalaryDeduction: snapshot.advanceSalaryDeduction || 0
        };

        // ============================================================
        // BASE SALARY VALUES
        // ============================================================
        const basicSalary = snapshot.basic_salary || 0;
        const allowances = snapshot.allowances || 0;
        const totalSalary = snapshot.total_salary || 0;

        // ============================================================
        // RECALCULATE DERIVED FIELDS ONLY
        // (Same formulas as createSalarySnapshots.js)
        // ============================================================

        // Leave Days = Annual Leave + LOP
        const leaveDays = attendanceValues.annual_leave_count + attendanceValues.full_absence_count;
        
        // Leave Pay = (Total Salary / Divisor) * Leave Days
        const leavePay = leaveDays > 0 ? (totalSalary / divisor) * leaveDays : 0;
        
        // Salary Leave Amount = (Basic + Allowances) / Divisor * Salary Leave Days
        const salaryForLeave = basicSalary + allowances;
        const salaryLeaveAmount = attendanceValues.salary_leave_days > 0 
            ? (salaryForLeave / divisor) * attendanceValues.salary_leave_days 
            : 0;
        
        // Net Deduction = max(0, Leave Pay - Salary Leave Amount)
        const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);

        // Deductible Hours = Deductible Minutes / 60 (stored value, attendance is READ-ONLY)
        const deductibleHours = Math.round((attendanceValues.deductible_minutes / 60) * 100) / 100;
        
        // Hourly Rate (for deductions) = Total Salary / Divisor / Working Hours
        const hourlyRateDeduction = totalSalary / divisor / workingHours;
        
        // Deductible Hours Pay = Hourly Rate * Deductible Hours
        const deductibleHoursPay = hourlyRateDeduction * deductibleHours;

        // OT Hourly Rate (uses OT Divisor)
        const otHourlyRate = totalSalary / otDivisor / workingHours;
        
        // Normal OT Salary = OT Hourly Rate * 1.25 * Normal OT Hours
        const normalOtSalary = Math.round(otHourlyRate * 1.25 * editableValues.normalOtHours * 100) / 100;
        
        // Special OT Salary = OT Hourly Rate * 1.5 * Special OT Hours
        const specialOtSalary = Math.round(otHourlyRate * 1.5 * editableValues.specialOtHours * 100) / 100;
        
        // Total OT Salary
        const totalOtSalary = normalOtSalary + specialOtSalary;

        // Final Total = Total Salary + OT + Bonus + Incentive - Net Deduction - Deductible Hours Pay - Other Deduction - Advance
        const finalTotal = totalSalary 
            + totalOtSalary 
            + editableValues.bonus 
            + editableValues.incentive
            - netDeduction 
            - deductibleHoursPay 
            - editableValues.otherDeduction 
            - editableValues.advanceSalaryDeduction;

        // WPS Pay = Final Total (for now, same as total)
        const wpsPay = finalTotal;
        
        // Balance = Total - WPS Pay (currently 0)
        const balance = finalTotal - wpsPay;

        // ============================================================
        // UPDATE SNAPSHOT (DERIVED FIELDS ONLY)
        // ============================================================
        const updatePayload = {
            // Derived leave calculations
            leaveDays: Math.round(leaveDays * 100) / 100,
            leavePay: Math.round(leavePay * 100) / 100,
            salaryLeaveAmount: Math.round(salaryLeaveAmount * 100) / 100,
            netDeduction: Math.round(netDeduction * 100) / 100,
            
            // Derived deduction calculations
            deductibleHours: deductibleHours,
            deductibleHoursPay: Math.round(deductibleHoursPay * 100) / 100,
            
            // OT calculations
            normalOtSalary: normalOtSalary,
            specialOtSalary: specialOtSalary,
            totalOtSalary: totalOtSalary,
            
            // Final totals
            total: Math.round(finalTotal * 100) / 100,
            wpsPay: Math.round(wpsPay * 100) / 100,
            balance: Math.round(balance * 100) / 100
        };

        await base44.asServiceRole.entities.SalarySnapshot.update(salary_snapshot_id, updatePayload);

        // ============================================================
        // AUDIT LOG
        // ============================================================
        try {
            await base44.asServiceRole.functions.invoke('logAudit', {
                action: 'RECALCULATE_SALARY',
                entity_type: 'SalarySnapshot',
                entity_id: salary_snapshot_id,
                details: `Salary totals recalculated for ${snapshot.name} (${snapshot.attendance_id}). New total: ${Math.round(finalTotal * 100) / 100}`
            });
        } catch (auditError) {
            console.warn('[recalculateIndividualSalary] Audit log failed:', auditError.message);
        }

        return Response.json({
            success: true,
            employee_name: snapshot.name,
            attendance_id: snapshot.attendance_id,
            previous_total: snapshot.total,
            new_total: Math.round(finalTotal * 100) / 100,
            calculations: {
                leaveDays,
                leavePay: Math.round(leavePay * 100) / 100,
                salaryLeaveAmount: Math.round(salaryLeaveAmount * 100) / 100,
                netDeduction: Math.round(netDeduction * 100) / 100,
                deductibleHours,
                deductibleHoursPay: Math.round(deductibleHoursPay * 100) / 100,
                normalOtSalary,
                specialOtSalary,
                totalOtSalary,
                total: Math.round(finalTotal * 100) / 100
            },
            message: `Salary recalculated successfully for ${snapshot.name}`
        });

    } catch (error) {
        console.error('Recalculate individual salary error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});