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

        // Fetch project, employees, salaries, and analysis results
        const projects = await base44.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        const isAlMaraghi = project.company === 'Al Maraghi Auto Repairs';

        // Fetch all related data
        const [employees, salaries, analysisResults] = await Promise.all([
            base44.entities.Employee.filter({ company: project.company, active: true }),
            base44.entities.EmployeeSalary.filter({ company: project.company, active: true }),
            base44.entities.AnalysisResult.filter({ 
                project_id: project_id,
                report_run_id: report_run_id
            })
        ]);

        // Fetch all annual leave exceptions to get salary_leave_days overrides
        const annualLeaveExceptions = await base44.entities.Exception.filter({
            project_id: project_id,
            type: 'ANNUAL_LEAVE'
        });

        // Calculate salary for each employee
        const salaryCalculations = employees.map(emp => {
            const salary = salaries.find(s => 
                String(s.employee_id) === String(emp.hrms_id) || 
                String(s.attendance_id) === String(emp.attendance_id)
            );
            const result = analysisResults.find(r => 
                String(r.attendance_id) === String(emp.attendance_id)
            );

            const totalSalaryAmount = salary?.total_salary || 0;
            const workingHours = salary?.working_hours || 9;

            // Use manual overrides if present, otherwise use calculated values
            const presentDays = result?.manual_present_days ?? result?.present_days ?? 0;
            const annualLeaveDays = result?.manual_annual_leave_count ?? result?.annual_leave_count ?? 0;
            const sickLeaveDays = result?.manual_sick_leave_count ?? result?.sick_leave_count ?? 0;
            const lopDays = result?.manual_full_absence_count ?? result?.full_absence_count ?? 0;
            const deductibleMinutes = result?.manual_deductible_minutes ?? result?.deductible_minutes ?? 0;

            // Leave Days = Annual Leave Days + LOP Days (NOT sick leave)
            const leaveDays = annualLeaveDays + lopDays;
            
            // Leave Pay = (Total Salary / 30) × Leave Days
            const leavePay = leaveDays > 0 ? (totalSalaryAmount / 30) * leaveDays : 0;

            // Salary Leave Days = Get override from annual leave exceptions if present
            let salaryLeaveDays = annualLeaveDays;
            
            // Check if any exception has salary_leave_days override for this employee
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
            
            // Salary Leave Amount = (Basic Salary + Allowances) / 30 × Salary Leave Days
            // Parse allowances (excludes allowances_with_bonus) - handle both formats
            let allowancesObj = { housing: 0, transport: 0, food: 0, others: 0, total: 0 };
            try {
                allowancesObj = JSON.parse(salary?.allowances || '{}');
            } catch (e) {
                // Keep defaults if parsing fails
            }
            // Handle both formats: {"total": X} OR {"housing": X, "transport": Y, ...}
            const allowancesSum = allowancesObj.total || 
                                 ((allowancesObj.housing || 0) + (allowancesObj.transport || 0) + 
                                  (allowancesObj.food || 0) + (allowancesObj.others || 0));
            const basicSalary = salary?.basic_salary || 0;
            const salaryForLeave = basicSalary + allowancesSum;
            
            const salaryLeaveAmount = salaryLeaveDays > 0 ? (salaryForLeave / 30) * salaryLeaveDays : 0;

            // Net Deduction = Leave Pay - Salary Leave Amount
            const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);

            // Deductible Hours = deductible_minutes ÷ 60
            const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;

            // Deductible Hours Pay = (Total Salary ÷ 30 ÷ Working Hours) × Deductible Hours
            const hourlyRate = totalSalaryAmount / 30 / workingHours;
            const deductibleHoursPay = hourlyRate * deductibleHours;

            // OT Salary Calculation - Split into Normal and Special
            // Normal OT: (Total Salary ÷ 30 ÷ Working Hours) × 1.25 × Normal OT Hours
            // Special OT: (Total Salary ÷ 30 ÷ Working Hours) × 1.5 × Special OT Hours
            const normalOtHours = 0; // Will be manually entered in UI
            const specialOtHours = 0; // Will be manually entered in UI
            
            const normalOtRate = hourlyRate * 1.25;
            const specialOtRate = hourlyRate * 1.5;
            
            const normalOtSalary = normalOtRate * normalOtHours;
            const specialOtSalary = specialOtRate * specialOtHours;
            const totalOtSalary = normalOtSalary + specialOtSalary;

            // Final Total = Total Salary + Total OT Salary - Net Deduction - Deductible Hours Pay
            const finalTotal = totalSalaryAmount + totalOtSalary - netDeduction - deductibleHoursPay;

            return {
                attendance_id: emp.attendance_id,
                hrms_id: emp.hrms_id,
                name: emp.name,
                department: emp.department,
                employee_id: salary?.employee_id || emp.hrms_id,
                basic_salary: salary?.basic_salary || 0,
                allowances: salary?.allowances || '{}',
                total_salary: totalSalaryAmount,
                working_hours: workingHours,
                deduction_per_minute: salary?.deduction_per_minute || 0,
                // Analysis data (use manual overrides if present)
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
                deductible_minutes: result?.deductible_minutes || 0,
                // Calculated salary fields
                leaveDays,
                leavePay: Math.round(leavePay * 100) / 100,
                salaryLeaveDays,
                salaryLeaveAmount: Math.round(salaryLeaveAmount * 100) / 100,
                normalOtHours: 0,
                normalOtSalary: Math.round(normalOtSalary * 100) / 100,
                specialOtHours: 0,
                specialOtSalary: Math.round(specialOtSalary * 100) / 100,
                totalOtSalary: Math.round(totalOtSalary * 100) / 100,
                deductibleHours,
                deductibleHoursPay: Math.round(deductibleHoursPay * 100) / 100,
                otherDeduction: 0,
                bonus: 0,
                incentive: 0,
                advanceSalaryDeduction: 0,
                lopDeduction: 0,
                deductibleMinutesAmount: 0,
                netDeduction: Math.round(netDeduction * 100) / 100,
                // Total calculation
                total: Math.round(finalTotal * 100) / 100,
                wpsPay: Math.round(finalTotal * 100) / 100,
                balance: 0
            };
        });

        return Response.json({
            success: true,
            data: salaryCalculations,
            project_company: project.company,
            report_run_id,
            calculated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Calculate salaries error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});