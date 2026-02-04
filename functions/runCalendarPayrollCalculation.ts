import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 4: RUN CALENDAR PAYROLL CALCULATION
 * 
 * Calculates payroll from locked AttendanceSummary records.
 * 
 * CRITICAL ISOLATION RULES:
 * - Does NOT read SalarySnapshot (legacy)
 * - Does NOT write SalarySnapshot (legacy)
 * - Reads: AttendanceSummary, EmployeeSalary, CompanySettings
 * - Writes: PayrollSnapshot ONLY
 * - Uses SAME formulas as legacy payroll (for validation)
 * - Al Maraghi Motors ONLY
 * - is_payable = false (PREVIEW ONLY, NOT FOR PAYMENT)
 * 
 * Status Flow:
 * CalendarMonth.status: ATTENDANCE_LOCKED → PAYROLL_FINALIZED
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { calendar_month_id } = await req.json();

        if (!calendar_month_id) {
            return Response.json({ error: 'calendar_month_id is required' }, { status: 400 });
        }

        // ============================================================
        // FETCH CALENDAR MONTH
        // ============================================================
        const calendarMonths = await base44.asServiceRole.entities.CalendarMonth.filter({ 
            id: calendar_month_id 
        }, null, 1);

        if (calendarMonths.length === 0) {
            return Response.json({ error: 'CalendarMonth not found' }, { status: 404 });
        }

        const calendarMonth = calendarMonths[0];
        const company = calendarMonth.company;

        console.log('[runCalendarPayrollCalculation] Processing:', {
            calendar_month_id,
            company,
            year: calendarMonth.year,
            month: calendarMonth.month,
            status: calendarMonth.status
        });

        // ============================================================
        // GUARD: Calendar dual-run enabled check
        // ============================================================
        const guardCheck = await base44.asServiceRole.functions.invoke('assertCalendarDualRunAllowed', {
            company: company
        });
        
        if (!guardCheck.allowed) {
            return Response.json({ 
                error: guardCheck.error
            }, { status: guardCheck.status || 403 });
        }

        // ============================================================
        // STATUS CHECK: Must be ATTENDANCE_LOCKED to run payroll
        // ============================================================
        if (calendarMonth.status !== 'attendance_locked') {
            return Response.json({ 
                error: `CalendarMonth status is "${calendarMonth.status}". Must be "attendance_locked" to run payroll calculation. Run attendance aggregation first.`
            }, { status: 400 });
        }

        // ============================================================
        // FETCH REQUIRED DATA (NO LEGACY SNAPSHOT DEPENDENCY)
        // ============================================================
        const [attendanceSummaries, employeeSalaries, companySettings] = await Promise.all([
            base44.asServiceRole.entities.AttendanceSummary.filter({ 
                calendar_month_id: calendarMonth.id 
            }, null, 5000),
            base44.asServiceRole.entities.EmployeeSalary.filter({ 
                company: company, 
                active: true 
            }, null, 5000),
            base44.asServiceRole.entities.CompanySettings.filter({ company: company }, null, 1)
        ]);

        console.log('[runCalendarPayrollCalculation] Data loaded:', {
            attendance_summaries: attendanceSummaries.length,
            employee_salaries: employeeSalaries.length
        });

        // ============================================================
        // ABORT CHECKS (MANDATORY)
        // ============================================================
        if (attendanceSummaries.length === 0) {
            throw new Error('ABORT: No AttendanceSummary records found. Run attendance aggregation first.');
        }

        if (employeeSalaries.length === 0) {
            throw new Error('ABORT: No EmployeeSalary records found for this company.');
        }

        // Get salary calculation divisor
        const divisor = 30; // Default, can be configured per company later

        // ============================================================
        // CALCULATE PAYROLL FOR EACH EMPLOYEE (SAME FORMULAS AS LEGACY)
        // ============================================================
        console.log('[runCalendarPayrollCalculation] Calculating payroll for', attendanceSummaries.length, 'employees...');
        const payrollSnapshots = [];

        for (const summary of attendanceSummaries) {
            const salary = employeeSalaries.find(s => 
                String(s.attendance_id) === String(summary.attendance_id) ||
                String(s.employee_id) === String(summary.hrms_id)
            );

            if (!salary) {
                console.warn('[runCalendarPayrollCalculation] No salary found for', summary.attendance_id, '- skipping');
                continue;
            }

            // SALARY COMPONENTS (SAME AS LEGACY)
            const basicSalary = salary.basic_salary || 0;
            const allowances = Number(salary.allowances) || 0;
            const totalSalary = salary.total_salary || 0;
            const workingHours = salary.working_hours || 9;

            // ATTENDANCE VALUES (from locked AttendanceSummary)
            const workingDays = summary.working_days || 0;
            const presentDays = summary.present_days || 0;
            const fullAbsenceCount = summary.full_absence_count || 0;
            const annualLeaveCount = summary.annual_leave_count || 0;
            const sickLeaveCount = summary.sick_leave_count || 0;
            const deductibleMinutes = summary.deductible_minutes || 0;

            // SALARY LEAVE DAYS = Annual Leave Count (no overrides in Phase 4)
            const salaryLeaveDays = annualLeaveCount;

            // DERIVED SALARY FIELDS (SAME FORMULAS AS LEGACY)
            const leaveDays = annualLeaveCount + fullAbsenceCount;
            const leavePay = Math.round((leaveDays > 0 ? (totalSalary / divisor) * leaveDays : 0) * 100) / 100;
            
            // Salary leave amount: (Basic + Allowances) / divisor * salary_leave_days
            const salaryBaseForLeave = basicSalary + allowances;
            const salaryLeaveAmount = Math.round((salaryLeaveDays > 0 ? (salaryBaseForLeave / divisor) * salaryLeaveDays : 0) * 100) / 100;
            
            const netDeduction = Math.round(Math.max(0, leavePay - salaryLeaveAmount) * 100) / 100;

            const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;
            const hourlyRate = Math.round((totalSalary / divisor / workingHours) * 100) / 100;
            const deductibleHoursPay = Math.round((hourlyRate * deductibleHours) * 100) / 100;

            // NO OT/ADJUSTMENTS IN PHASE 4 PREVIEW (Initialize to 0)
            const normalOtHours = 0;
            const specialOtHours = 0;
            const normalOtSalary = 0;
            const specialOtSalary = 0;
            const totalOtSalary = 0;
            const bonus = 0;
            const incentive = 0;
            const otherDeduction = 0;
            const advanceSalaryDeduction = 0;

            // Final total calculation
            let finalTotal = Math.round((totalSalary - netDeduction - deductibleHoursPay) * 100) / 100;

            // WPS SPLIT (Al Maraghi Motors only)
            let wpsAmount = finalTotal;
            let balanceAmount = 0;
            let wpsCapApplied = false;
            const wpsCapEnabled = salary?.wps_cap_enabled || false;
            const wpsCapAmount = salary?.wps_cap_amount ?? 4900;

            if (wpsCapEnabled) {
                if (finalTotal <= 0) {
                    wpsAmount = 0;
                    balanceAmount = 0;
                } else {
                    const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                    const rawExcess = Math.max(0, finalTotal - cap);
                    balanceAmount = Math.round((Math.floor(rawExcess / 100) * 100) * 100) / 100;
                    wpsAmount = Math.round((finalTotal - balanceAmount) * 100) / 100;
                    wpsCapApplied = rawExcess > 0;
                }
            } else if (finalTotal <= 0) {
                wpsAmount = 0;
                balanceAmount = 0;
            }

            payrollSnapshots.push({
                attendance_id: String(summary.attendance_id),
                calendar_month_id: calendarMonth.id,
                company: company,
                hrms_id: summary.hrms_id,
                name: summary.name,
                department: summary.department,
                legacy_salary_snapshot_id: null, // Not from legacy
                is_payable: false, // PHASE 4: PREVIEW ONLY - NEVER USED FOR PAYMENT
                frozen_attendance_snapshot: JSON.stringify({
                    working_days: workingDays,
                    present_days: presentDays,
                    full_absence_count: fullAbsenceCount,
                    annual_leave_count: annualLeaveCount,
                    sick_leave_count: sickLeaveCount,
                    deductible_minutes: deductibleMinutes
                }),
                frozen_salary_snapshot: JSON.stringify({
                    basic_salary: basicSalary,
                    allowances: allowances,
                    total_salary: totalSalary,
                    working_hours: workingHours
                }),
                basic_salary: basicSalary,
                allowances: allowances,
                total_salary: totalSalary,
                working_hours: workingHours,
                working_days: workingDays,
                present_days: presentDays,
                full_absence_count: fullAbsenceCount,
                annual_leave_count: annualLeaveCount,
                sick_leave_count: sickLeaveCount,
                deductible_minutes: deductibleMinutes,
                salary_divisor: divisor,
                leaveDays: leaveDays,
                leavePay: leavePay,
                salaryLeaveAmount: salaryLeaveAmount,
                netDeduction: netDeduction,
                deductibleHours: deductibleHours,
                deductibleHoursPay: deductibleHoursPay,
                normalOtHours: normalOtHours,
                normalOtSalary: normalOtSalary,
                specialOtHours: specialOtHours,
                specialOtSalary: specialOtSalary,
                totalOtSalary: totalOtSalary,
                bonus: bonus,
                incentive: incentive,
                otherDeduction: otherDeduction,
                advanceSalaryDeduction: advanceSalaryDeduction,
                total: finalTotal,
                wpsPay: wpsAmount,
                balance: balanceAmount,
                wps_cap_enabled: wpsCapEnabled,
                wps_cap_amount: wpsCapAmount,
                wps_cap_applied: wpsCapApplied,
                snapshot_created_at: new Date().toISOString(),
                recalculation_version: 0
            });
        }

        // ============================================================
        // INVARIANT CHECK: PayrollSnapshot count must match AttendanceSummary count
        // ============================================================
        if (payrollSnapshots.length !== attendanceSummaries.length) {
            throw new Error(`INVARIANT VIOLATION: Expected ${attendanceSummaries.length} payroll snapshots, got ${payrollSnapshots.length}`);
        }

        console.log('[runCalendarPayrollCalculation] ✅ Invariant check passed:', payrollSnapshots.length, 'records');

        // ============================================================
        // DELETE EXISTING SNAPSHOTS (IDEMPOTENT)
        // ============================================================
        const existingSnapshots = await base44.asServiceRole.entities.PayrollSnapshot.filter({ 
            calendar_month_id: calendarMonth.id 
        }, null, 5000);

        if (existingSnapshots.length > 0) {
            console.log('[runCalendarPayrollCalculation] Deleting', existingSnapshots.length, 'existing snapshots');
            await Promise.all(existingSnapshots.map(s => base44.asServiceRole.entities.PayrollSnapshot.delete(s.id)));
        }

        // ============================================================
        // SAVE PAYROLL SNAPSHOTS
        // ============================================================
        await base44.asServiceRole.entities.PayrollSnapshot.bulkCreate(payrollSnapshots);
        console.log('[runCalendarPayrollCalculation] ✅ Created', payrollSnapshots.length, 'PayrollSnapshot records');

        // ============================================================
        // UPDATE CALENDAR MONTH STATUS
        // ============================================================
        await base44.asServiceRole.entities.CalendarMonth.update(calendarMonth.id, {
            status: 'payroll_finalized',
            payroll_finalized_at: new Date().toISOString(),
            payroll_finalized_by: user.email
        });

        console.log('[runCalendarPayrollCalculation] ✅ CalendarMonth payroll finalized');

        // ============================================================
        // AUDIT LOG
        // ============================================================
        await base44.asServiceRole.entities.AuditLog.create({
            action: 'CALENDAR_PAYROLL_CALCULATION',
            entity_type: 'CalendarMonth',
            entity_id: calendarMonth.id,
            user_email: user.email,
            company: company,
            details: `Calculated payroll (PREVIEW ONLY) for ${payrollSnapshots.length} employees. Month: ${calendarMonth.year}-${String(calendarMonth.month).padStart(2, '0')}`
        });

        return Response.json({
            success: true,
            message: 'Calendar payroll calculation complete (PREVIEW ONLY - NOT FOR PAYMENT)',
            calendar_month_id: calendarMonth.id,
            payroll_snapshots_created: payrollSnapshots.length,
            status: 'payroll_finalized',
            is_payable: false,
            warning: 'Calendar payroll is PREVIEW ONLY. Payments still use legacy project-based payroll.'
        });

    } catch (error) {
        console.error('[runCalendarPayrollCalculation] Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});