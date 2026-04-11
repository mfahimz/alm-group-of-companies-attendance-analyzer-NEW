import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Helper to get current UAE half
// Half determination rule:
// Months 1–6  (Jan–Jun) → half 1 (H1)
// Months 7–12 (Jul–Dec) → half 2 (H2)
function getCurrentHalfUAE() {
    const now = new Date();
    const uaeDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
    const month = uaeDate.getMonth() + 1;
    const year = uaeDate.getFullYear();
    const half = month <= 6 ? 1 : 2;
    return { year, half };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { employee_id, event_type } = await req.json();
        
        if (!employee_id) {
            return Response.json({ error: 'employee_id required' }, { status: 400 });
        }
        
        // Get employee details
        const employees = await base44.asServiceRole.entities.Employee.filter({ id: employee_id });
        if (employees.length === 0) {
            return Response.json({ error: 'Employee not found' }, { status: 404 });
        }
        
        const employee = employees[0];
        
        // Only process for Al Maraghi Auto Repairs
        if (employee.company !== 'Al Maraghi Auto Repairs') {
            return Response.json({
                success: true,
                message: 'Half-yearly minutes sync only for Al Maraghi Auto Repairs'
            });
        }

        const { year, half } = getCurrentHalfUAE();
        const totalMinutes = employee.approved_other_minutes_limit || 120;

        if (event_type === 'create') {
            // Auto-create half-yearly minutes for new employee
            const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                employee_id: String(employee.hrms_id),
                company: employee.company,
                year: year,
                half: half
            });

            if (existing.length === 0) {
                await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                    employee_id: String(employee.hrms_id),
                    company: employee.company,
                    year: year,
                    half: half,
                    total_minutes: totalMinutes,
                    used_minutes: 0,
                    remaining_minutes: totalMinutes
                });

                return Response.json({
                    success: true,
                    message: 'Half-yearly minutes created for new employee'
                });
            }
        }

        if (event_type === 'update') {
            // Sync total_minutes to current half record
            const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                employee_id: String(employee.hrms_id),
                company: employee.company,
                year: year,
                half: half
            });

            if (existing.length > 0) {
                const record = existing[0];
                const newRemaining = Math.max(0, totalMinutes - record.used_minutes);

                await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.update(record.id, {
                    total_minutes: totalMinutes,
                    remaining_minutes: newRemaining
                });

                return Response.json({
                    success: true,
                    message: 'Half-yearly minutes synced from employee profile'
                });
            } else {
                // Create if not exists
                await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                    employee_id: String(employee.hrms_id),
                    company: employee.company,
                    year: year,
                    half: half,
                    total_minutes: totalMinutes,
                    used_minutes: 0,
                    remaining_minutes: totalMinutes
                });

                return Response.json({
                    success: true,
                    message: 'Half-yearly minutes created on employee update'
                });
            }
        }
        
        return Response.json({ success: true });
        
    } catch (error) {
        console.error('Sync employee to half-yearly minutes error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});