import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * RESOLVE SALARY FOR MONTH
 * 
 * This function resolves the correct salary values for an employee at a specific month.
 * It considers salary increments with effective dates.
 * 
 * RULES:
 * 1. Salary increment is a permanent change effective from a specific month
 * 2. The most recent increment with effective_month <= target_month is used
 * 3. If no increment exists, use the base EmployeeSalary record
 * 4. This applies ONLY to Al Maraghi Motors
 * 
 * USAGE:
 * - For current month salary: use the latest increment or base salary
 * - For previous month calculations (OT, deductions): use salary valid for THAT month
 * - Recalculations must use historical salary, not current salary
 * 
 * INPUT:
 * - employee_id: HRMS ID
 * - attendance_id: Attendance ID (alternative lookup)
 * - target_month: YYYY-MM format (e.g., "2026-01" for January 2026)
 * - company: Company name (validation)
 * 
 * OUTPUT:
 * - basic_salary, allowances, allowances_with_bonus, total_salary
 * - source: "INCREMENT" or "BASE_SALARY"
 * - increment_effective_month: if from increment
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { employee_id, attendance_id, target_month, company } = await req.json();
        
        if (!target_month) {
            return Response.json({ error: 'target_month is required (YYYY-MM format)' }, { status: 400 });
        }
        
        if (!employee_id && !attendance_id) {
            return Response.json({ error: 'employee_id or attendance_id is required' }, { status: 400 });
        }
        
        // Only Al Maraghi Motors uses salary increments
        if (company && company !== 'Al Maraghi Motors') {
            // For other companies, just return base salary
            const salaryFilter = employee_id 
                ? { employee_id: String(employee_id), active: true }
                : { attendance_id: String(attendance_id), active: true };
            
            const salaries = await base44.asServiceRole.entities.EmployeeSalary.filter(salaryFilter);
            
            if (salaries.length === 0) {
                return Response.json({ error: 'No salary record found' }, { status: 404 });
            }
            
            const salary = salaries[0];
            return Response.json({
                basic_salary: salary.basic_salary || 0,
                allowances: Number(salary.allowances) || 0,
                allowances_with_bonus: salary.allowances_with_bonus || 0,
                total_salary: salary.total_salary || 0,
                working_hours: salary.working_hours || 9,
                source: 'BASE_SALARY',
                increment_effective_month: null
            });
        }
        
        // Build filter for increments
        const incrementFilter = employee_id 
            ? { employee_id: String(employee_id), company: 'Al Maraghi Motors', active: true }
            : { attendance_id: String(attendance_id), company: 'Al Maraghi Motors', active: true };
        
        // Fetch all increments for this employee
        const increments = await base44.asServiceRole.entities.SalaryIncrement.filter(incrementFilter);
        
        // Convert target_month to comparable format (YYYY-MM-01)
        const targetMonthStart = target_month.length === 7 ? `${target_month}-01` : target_month;
        
        // Find the most recent increment that is effective on or before target_month
        // Sort by effective_month descending
        const applicableIncrements = increments
            .filter(inc => inc.effective_month <= targetMonthStart)
            .sort((a, b) => new Date(b.effective_month) - new Date(a.effective_month));
        
        if (applicableIncrements.length > 0) {
            // Use the most recent applicable increment
            const increment = applicableIncrements[0];
            
            // Get working_hours from base salary record
            const salaryFilter = employee_id 
                ? { employee_id: String(employee_id), active: true }
                : { attendance_id: String(attendance_id), active: true };
            const salaries = await base44.asServiceRole.entities.EmployeeSalary.filter(salaryFilter);
            const workingHours = salaries.length > 0 ? (salaries[0].working_hours || 9) : 9;
            
            return Response.json({
                basic_salary: increment.new_basic_salary || 0,
                allowances: Number(increment.new_allowances) || 0,
                allowances_with_bonus: increment.new_allowances_with_bonus || 0,
                total_salary: increment.new_total_salary || 0,
                working_hours: workingHours,
                source: 'INCREMENT',
                increment_effective_month: increment.effective_month,
                increment_id: increment.id
            });
        }
        
        // No applicable increment found, use base salary
        const salaryFilter = employee_id 
            ? { employee_id: String(employee_id), active: true }
            : { attendance_id: String(attendance_id), active: true };
        
        const salaries = await base44.asServiceRole.entities.EmployeeSalary.filter(salaryFilter);
        
        if (salaries.length === 0) {
            return Response.json({ error: 'No salary record found' }, { status: 404 });
        }
        
        const salary = salaries[0];
        return Response.json({
            basic_salary: salary.basic_salary || 0,
            allowances: Number(salary.allowances) || 0,
            allowances_with_bonus: salary.allowances_with_bonus || 0,
            total_salary: salary.total_salary || 0,
            working_hours: salary.working_hours || 9,
            source: 'BASE_SALARY',
            increment_effective_month: null
        });
        
    } catch (error) {
        console.error('Resolve salary for month error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});