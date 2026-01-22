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

        // Calculate salary for each employee
        const salaryCalculations = employees.map(emp => {
            const salary = salaries.find(s => 
                s.employee_id === emp.hrms_id || 
                Number(s.attendance_id) === Number(emp.attendance_id)
            );
            const result = analysisResults.find(r => 
                Number(r.attendance_id) === Number(emp.attendance_id)
            );

            const totalSalaryAmount = salary?.total_salary || 0;
            const workingHours = salary?.working_hours || 9;

            // Leave Pay = LOP Days × (Total Salary ÷ 30)
            const leaveDays = result?.full_absence_count || 0;
            const leavePay = leaveDays > 0 ? (totalSalaryAmount / 30) * leaveDays : 0;

            // Deductible Hours = deductible_minutes ÷ 60
            const deductibleMinutes = result?.deductible_minutes || 0;
            const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;

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
                // Analysis data
                working_days: 30,
                present_days: result?.present_days || 0,
                full_absence_count: result?.full_absence_count || 0,
                annual_leave_count: result?.annual_leave_count || 0,
                sick_leave_count: result?.sick_leave_count || 0,
                late_minutes: result?.late_minutes || 0,
                early_checkout_minutes: result?.early_checkout_minutes || 0,
                other_minutes: result?.other_minutes || 0,
                approved_minutes: result?.approved_minutes || 0,
                grace_minutes: result?.grace_minutes || 0,
                deductible_minutes: result?.deductible_minutes || 0,
                // Calculated salary fields
                leaveDays,
                leavePay: Math.round(leavePay * 100) / 100,
                salaryLeaveDays: 0,
                salaryLeaveAmount: 0,
                otHours: 0,
                otSalary: 0,
                deductibleHours,
                deductibleHoursPay: 0,
                otherDeduction: 0,
                bonus: 0,
                incentive: 0,
                advanceSalaryDeduction: 0,
                lopDeduction: 0,
                lopDays: leaveDays,
                deductibleMinutesAmount: 0,
                // Total calculation
                total: totalSalaryAmount - leavePay,
                wpsPay: totalSalaryAmount - leavePay,
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