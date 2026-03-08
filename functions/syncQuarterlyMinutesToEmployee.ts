import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // MIGRATION NOTE: System migrated from quarterly to half-yearly.
        // `employee_hrms_id` is now passed directly from the page to avoid
        // an unreliable filter({ id }) lookup on the EmployeeQuarterlyMinutes entity.
        const { quarterly_minutes_id, employee_hrms_id, total_minutes } = await req.json();
        
        if (total_minutes === undefined) {
            return Response.json({ error: 'total_minutes required' }, { status: 400 });
        }

        let hrmsId = employee_hrms_id;

        // Fallback: if employee_hrms_id not provided, resolve via quarterly record
        if (!hrmsId) {
            if (!quarterly_minutes_id) {
                return Response.json({ error: 'employee_hrms_id or quarterly_minutes_id required' }, { status: 400 });
            }
            const allRecords = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.list();
            const record = allRecords.find(r => r.id === quarterly_minutes_id);
            if (!record) {
                return Response.json({ error: 'Half-yearly minutes record not found' }, { status: 404 });
            }
            hrmsId = record.employee_id;
        }
        
        // Find employee by hrms_id — try both string and integer match
        const employees = await base44.asServiceRole.entities.Employee.filter({
            hrms_id: String(hrmsId)
        });
        const employees2 = employees.length === 0
            ? await base44.asServiceRole.entities.Employee.filter({ hrms_id: parseInt(hrmsId) })
            : [];
        
        const employee = employees[0] || employees2[0];
        if (!employee) {
            return Response.json({ error: `Employee not found for hrms_id: ${hrmsId}` }, { status: 404 });
        }
        
        // Sync total_minutes back to employee profile
        await base44.asServiceRole.entities.Employee.update(employee.id, {
            approved_other_minutes_limit: total_minutes
        });
        
        return Response.json({ 
            success: true, 
            message: 'Employee profile synced from half-yearly minutes' 
        });
        
    } catch (error) {
        console.error('Sync half-yearly minutes to employee error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});