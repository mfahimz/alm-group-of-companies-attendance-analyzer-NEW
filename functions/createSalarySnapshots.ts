import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, report_run_id } = await req.json();

        if (!project_id || !report_run_id) {
            return Response.json({ 
                error: 'project_id and report_run_id are required' 
            }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        const divisor = project.salary_calculation_days || 30;

        // Verify report exists and is being marked final
        const reports = await base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id, project_id: project_id });
        if (reports.length === 0) {
            return Response.json({ error: 'Report not found for this project' }, { status: 404 });
        }

        // Fetch all related data
        const [employees, salaries, analysisResults, annualLeaveExceptions] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true }),
            base44.asServiceRole.entities.AnalysisResult.filter({ 
                project_id: project_id,
                report_run_id: report_run_id
            }),
            base44.asServiceRole.entities.Exception.filter({
                project_id: project_id,
                type: 'ANNUAL_LEAVE'
            })
        ]);

        // Delete existing snapshots for this report (if re-finalizing)
        const existingSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        if (existingSnapshots.length > 0) {
            await Promise.all(existingSnapshots.map(s => base44.asServiceRole.entities.SalarySnapshot.delete(s.id)));
        }

        // Create salary snapshots for each employee
        const snapshots = employees.map(emp => {
            const salary = salaries.find(s => 
                String(s.employee_id) === String(emp.hrms_id) || 
                String(s.attendance_id) === String(emp.attendance_id)
            );
            const result = analysisResults.find(r => 
                String(r.attendance_id) === String(emp.attendance_id) &&
                String(r.report_run_id) === String(report_run_id)
            );

            if (!result) {
                // No analysis result for this employee, skip
                return null;
            }

            const totalSalaryAmount = salary?.total_salary || 0;
            const workingHours = salary?.working_hours || 9;

            // Get exact values from finalized report (use manual overrides if present)
            const presentDays = result?.manual_present_days ?? result?.present_days ?? 0;
            const annualLeaveDays = result?.manual_annual_leave_count ?? result?.annual_leave_count ?? 0;
            const sickLeaveDays = result?.manual_sick_leave_count ?? result?.sick_leave_count ?? 0;
            const lopDays = result?.manual_full_absence_count ?? result?.full_absence_count ?? 0;
            const salaryDeductibleMinutes = result?.manual_deductible_minutes ?? result?.deductible_minutes ?? 0;

            // Calculate derived values
            const leaveDays = annualLeaveDays + lopDays;
            const leavePay = leaveDays > 0 ? (totalSalaryAmount / divisor) * leaveDays : 0;

            // Get salary leave days from exceptions
            let salaryLeaveDays = annualLeaveDays;
            const empAnnualLeaveExceptions = annualLeaveExceptions.filter(exc => 
                String(exc.attendance_id) === String(emp.attendance_id)
            );
            
            if (empAnnualLeaveExceptions.length > 0) {
                const totalSalaryLeaveDaysOverride = empAnnualLeaveExceptions.reduce((sum, exc) => {
                    return sum + (exc.salary_leave_days ?? 0);
                }, 0);
                
                if (totalSalaryLeaveDaysOverride > 0) {
                    salaryLeaveDays = totalSalaryLeaveDaysOverride;
                }
            }

            // Salary Leave Amount = (Basic Salary + Allowances) / divisor × Salary Leave Days
            const basicSalary = salary?.basic_salary || 0;
            const allowancesAmount = Number(salary?.allowances) || 0;
            const salaryForLeave = basicSalary + allowancesAmount;
            const salaryLeaveAmount = salaryLeaveDays > 0 ? (salaryForLeave / divisor) * salaryLeaveDays : 0;

            // Net Deduction = Leave Pay - Salary Leave Amount
            const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);

            // Deductible Hours = deductible_minutes ÷ 60
            const deductibleHours = Math.round((salaryDeductibleMinutes / 60) * 100) / 100;

            // Deductible Hours Pay = (Total Salary ÷ divisor ÷ Working Hours) × Deductible Hours
            const hourlyRate = totalSalaryAmount / divisor / workingHours;
            const deductibleHoursPay = hourlyRate * deductibleHours;

            // Final Total = Total Salary - Net Deduction - Deductible Hours Pay
            const finalTotal = totalSalaryAmount - netDeduction - deductibleHoursPay;

            return {
                project_id: project_id,
                report_run_id: report_run_id,
                attendance_id: emp.attendance_id,
                hrms_id: emp.hrms_id,
                name: emp.name,
                department: emp.department,
                basic_salary: basicSalary,
                allowances: allowancesAmount,
                total_salary: totalSalaryAmount,
                working_hours: workingHours,
                working_days: 30,
                present_days: presentDays,
                full_absence_count: lopDays,
                annual_leave_count: annualLeaveDays,
                sick_leave_count: sickLeaveDays,
                late_minutes: result?.late_minutes || 0,
                early_checkout_minutes: result?.early_checkout_minutes || 0,
                other_minutes: result?.other_minutes || 0,
                approved_minutes: result?.approved_minutes || 0,
                grace_minutes: result?.grace_minutes || 0,
                deductible_minutes: salaryDeductibleMinutes,
                salary_leave_days: salaryLeaveDays,
                leaveDays: leaveDays,
                leavePay: Math.round(leavePay * 100) / 100,
                salaryLeaveAmount: Math.round(salaryLeaveAmount * 100) / 100,
                deductibleHours: deductibleHours,
                deductibleHoursPay: Math.round(deductibleHoursPay * 100) / 100,
                netDeduction: Math.round(netDeduction * 100) / 100,
                normalOtHours: 0,
                normalOtSalary: 0,
                specialOtHours: 0,
                specialOtSalary: 0,
                totalOtSalary: 0,
                otherDeduction: 0,
                bonus: 0,
                incentive: 0,
                advanceSalaryDeduction: 0,
                total: Math.round(finalTotal * 100) / 100,
                wpsPay: Math.round(finalTotal * 100) / 100,
                balance: 0,
                snapshot_created_at: new Date().toISOString()
            };
        }).filter(Boolean); // Remove nulls (employees without analysis results)

        // Bulk create snapshots
        if (snapshots.length > 0) {
            await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(snapshots);
        }

        return Response.json({
            success: true,
            snapshots_created: snapshots.length,
            message: `Created ${snapshots.length} salary snapshots for report ${report_run_id}`
        });

    } catch (error) {
        console.error('Create salary snapshots error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});