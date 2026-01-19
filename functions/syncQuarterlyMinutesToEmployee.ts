import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const { quarterly_minutes_id, total_minutes } = await req.json();
        
        if (!quarterly_minutes_id || total_minutes === undefined) {
            return Response.json({ error: 'quarterly_minutes_id and total_minutes required' }, { status: 400 });
        }
        
        // Get quarterly minutes record
        const records = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({ 
            id: quarterly_minutes_id 
        });
        
        if (records.length === 0) {
            return Response.json({ error: 'Quarterly minutes record not found' }, { status: 404 });
        }
        
        const record = records[0];
        
        // Get employee by hrms_id
        const employees = await base44.asServiceRole.entities.Employee.filter({
            hrms_id: parseInt(record.employee_id)
        });
        
        if (employees.length === 0) {
            return Response.json({ error: 'Employee not found' }, { status: 404 });
        }
        
        const employee = employees[0];
        
        // Sync total_minutes back to employee profile
        await base44.asServiceRole.entities.Employee.update(employee.id, {
            approved_other_minutes_limit: total_minutes
        });
        
        return Response.json({ 
            success: true, 
            message: 'Employee profile synced from quarterly minutes' 
        });
        
    } catch (error) {
        console.error('Sync quarterly minutes to employee error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});