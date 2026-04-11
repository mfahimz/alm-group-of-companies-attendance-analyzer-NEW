import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { format, addMonths } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { calendar_cycle_id } = await req.json();

        if (!calendar_cycle_id) {
            return Response.json({ error: 'Missing calendar_cycle_id' }, { status: 400 });
        }

        // Fetch cycle
        const cycles = await base44.asServiceRole.entities.CalendarCycle.filter({ id: calendar_cycle_id });
        if (cycles.length === 0) {
            return Response.json({ error: 'Cycle not found' }, { status: 404 });
        }
        const cycle = cycles[0];

        // Fetch settings
        const settingsList = await base44.asServiceRole.entities.CalendarSettings.list();
        const settings = settingsList[0] || {
            month_end_assumed_days_count: 2,
            defer_impacts_on_assumed_days: true
        };

        // Compute assumed dates
        const assumedDatesResponse = await base44.functions.invoke('computeMonthEndAssumedDates', {
            payroll_month_label: cycle.payroll_month_label,
            assumed_days_count: settings.month_end_assumed_days_count
        });
        const assumedDates = assumedDatesResponse.data?.assumed_dates || [];

        // Fetch monthly summaries for this payroll month
        const summaries = await base44.asServiceRole.entities.CalendarEmployeeMonthlySummary.filter({
            payroll_month_label: cycle.payroll_month_label
        });

        // Fetch pending carryovers TO this month
        const carryovers = await base44.asServiceRole.entities.CalendarCarryoverBucket.filter({
            to_payroll_month_label: cycle.payroll_month_label,
            status: 'pending'
        });

        // Group carryovers by employee
        const carryoverMap = {};
        for (const c of carryovers) {
            carryoverMap[c.employee_id] = c;
        }

        // Fetch all employees
        const employees = await base44.asServiceRole.entities.Employee.list();
        const employeeMap = {};
        for (const emp of employees) {
            employeeMap[emp.hrms_id] = emp;
        }

        // Fetch salary data
        const salaries = await base44.asServiceRole.entities.EmployeeSalary.list();
        const salaryMap = {};
        for (const sal of salaries) {
            salaryMap[sal.employee_id] = sal;
        }

        // Process each employee
        const snapshots = [];
        
        for (const summary of summaries) {
            const emp = employeeMap[summary.employee_id];
            const salary = salaryMap[summary.employee_id];
            const carryover = carryoverMap[summary.employee_id];

            if (!emp || !salary) continue;

            // Base totals from summary
            let presentDays = summary.present_days || 0;
            let lopDays = summary.lop_days || 0;
            let annualLeaveDays = summary.annual_leave_days || 0;
            let lateMinutes = summary.late_minutes_total || 0;
            let earlyMinutes = summary.early_minutes_total || 0;

            // Apply carryover
            let carryoverAppliedMinutes = 0;
            let carryoverAppliedLopDays = 0;

            if (carryover) {
                lateMinutes += carryover.carry_late_minutes || 0;
                earlyMinutes += carryover.carry_early_minutes || 0;
                lopDays += carryover.carry_lop_days || 0;
                annualLeaveDays += carryover.carry_annual_leave_days || 0;

                carryoverAppliedMinutes = (carryover.carry_late_minutes || 0) + (carryover.carry_early_minutes || 0);
                carryoverAppliedLopDays = (carryover.carry_lop_days || 0) + (carryover.carry_annual_leave_days || 0);

                // Mark as applied
                await base44.asServiceRole.entities.CalendarCarryoverBucket.update(carryover.id, {
                    status: 'applied'
                });
            }

            // Calculate working days
            const startDate = new Date(cycle.cutoff_start_date);
            const endDate = new Date(cycle.cutoff_end_date);
            let workingDays = 0;
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                const weeklyOff = emp.weekly_off || 'Sunday';
                const isWeeklyOff = weeklyOff === ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
                
                // Check public holiday
                const dateStr = format(d, 'yyyy-MM-dd');
                const holidays = await base44.asServiceRole.entities.CalendarDay.filter({ date: dateStr, is_public_holiday: true });
                
                if (!isWeeklyOff && holidays.length === 0) {
                    workingDays++;
                }
            }

            // Calculate salary (simplified - uses basic formula)
            const totalSalary = salary.total_salary || 0;
            const deductionPerDay = totalSalary / 30; // Simplified
            const deductions = lopDays * deductionPerDay;
            const grossPay = totalSalary;
            const netPay = grossPay - deductions;

            // Check for deferred impacts (on assumed days) - for now set to 0
            // This would need manual adjustment via Calendar Adjustments tab
            const deferredMinutes = 0;
            const deferredLopDays = 0;

            // Create/update snapshot
            const existingSnapshots = await base44.asServiceRole.entities.CalendarPayrollSnapshot.filter({
                calendar_cycle_id,
                employee_id: summary.employee_id
            });

            const snapshotData = {
                calendar_cycle_id,
                payroll_month_label: cycle.payroll_month_label,
                employee_id: summary.employee_id,
                name: summary.name,
                working_days_in_cycle: workingDays,
                present_days_in_cycle: presentDays,
                lop_days_in_cycle: lopDays,
                annual_leave_days_in_cycle: annualLeaveDays,
                other_leave_days_in_cycle: summary.other_leave_days || 0,
                assumed_present_days_count: assumedDates.length,
                deferred_minutes_total: deferredMinutes,
                deferred_lop_days_total: deferredLopDays,
                carryover_applied_minutes_total: carryoverAppliedMinutes,
                carryover_applied_lop_days_total: carryoverAppliedLopDays,
                gross_pay: grossPay,
                deductions_applied: deductions,
                net_pay: netPay,
                status: 'preview'
            };

            if (existingSnapshots.length > 0) {
                await base44.asServiceRole.entities.CalendarPayrollSnapshot.update(existingSnapshots[0].id, snapshotData);
                snapshots.push({ ...existingSnapshots[0], ...snapshotData });
            } else {
                const newSnapshot = await base44.asServiceRole.entities.CalendarPayrollSnapshot.create(snapshotData);
                snapshots.push(newSnapshot);
            }
        }

        return Response.json({
            success: true,
            message: `Payroll preview generated for ${snapshots.length} employees`,
            cycle: cycle.name,
            payroll_month_label: cycle.payroll_month_label,
            snapshots_created: snapshots.length,
            assumed_dates: assumedDates
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});