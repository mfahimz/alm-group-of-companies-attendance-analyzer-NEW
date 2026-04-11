import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only admin and supervisor can sync
        const userRole = user.extended_role || user.role || 'user';
        if (userRole !== 'admin' && userRole !== 'supervisor') {
            return Response.json({ error: 'Forbidden: Admin or Supervisor access required' }, { status: 403 });
        }

        // Get all active salary increments
        const increments = await base44.asServiceRole.entities.SalaryIncrement.filter({ active: true });
        
        if (increments.length === 0) {
            return Response.json({ 
                message: 'No active salary increments found to sync',
                synced: 0 
            });
        }

        // Get all current salary records
        const currentSalaries = await base44.asServiceRole.entities.EmployeeSalary.list();

        const results = {
            synced: 0,
            skipped: 0,
            errors: [],
            details: []
        };

        for (const increment of increments) {
            try {
                // Find the current active salary record for this employee
                const currentSalary = currentSalaries.find(s => 
                    String(s.employee_id) === String(increment.employee_id) && 
                    s.active === true
                );

                if (!currentSalary) {
                    results.skipped++;
                    results.details.push({
                        employee_id: increment.employee_id,
                        name: increment.name,
                        status: 'skipped',
                        reason: 'No active salary record found'
                    });
                    continue;
                }

                // Check if the increment is already applied (compare total salaries)
                if (currentSalary.total_salary === increment.new_total_salary) {
                    results.skipped++;
                    results.details.push({
                        employee_id: increment.employee_id,
                        name: increment.name,
                        status: 'skipped',
                        reason: 'Increment already applied'
                    });
                    continue;
                }

                // Deactivate the old salary record (preserve history)
                await base44.asServiceRole.entities.EmployeeSalary.update(currentSalary.id, {
                    active: false
                });

                // Create new salary record with incremented values
                const newTotal = Number((increment.new_basic_salary + 
                                       (Number(increment.new_allowances) || 0) + 
                                       (Number(increment.new_allowances_with_bonus) || 0)).toFixed(2));

                await base44.asServiceRole.entities.EmployeeSalary.create({
                    employee_id: increment.employee_id,
                    attendance_id: increment.attendance_id,
                    name: increment.name,
                    company: increment.company,
                    working_hours: currentSalary.working_hours || 9,
                    basic_salary: increment.new_basic_salary,
                    allowances: Number(increment.new_allowances) || 0,
                    allowances_with_bonus: Number(increment.new_allowances_with_bonus) || 0,
                    total_salary: newTotal,
                    deduction_per_minute: newTotal / (30 * (currentSalary.working_hours || 9) * 60),
                    wps_cap_enabled: currentSalary.wps_cap_enabled ?? true,
                    wps_cap_amount: currentSalary.wps_cap_amount ?? 4900,
                    active: true
                });

                results.synced++;
                results.details.push({
                    employee_id: increment.employee_id,
                    name: increment.name,
                    status: 'synced',
                    previous_total: currentSalary.total_salary,
                    new_total: newTotal,
                    effective_month: increment.effective_month
                });

            } catch (error) {
                results.errors.push({
                    employee_id: increment.employee_id,
                    name: increment.name,
                    error: error.message
                });
            }
        }

        return Response.json({
            success: true,
            message: `Sync completed: ${results.synced} synced, ${results.skipped} skipped, ${results.errors.length} errors`,
            ...results
        });

    } catch (error) {
        console.error('Sync error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});