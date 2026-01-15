import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only admin/supervisor can update
        if (user.role !== 'admin' && user.extended_role !== 'supervisor') {
            return Response.json({ error: 'Admin or Supervisor access required' }, { status: 403 });
        }

        const { quarterly_minutes_id, used_minutes } = await req.json();

        if (!quarterly_minutes_id || used_minutes === undefined) {
            return Response.json({ error: 'quarterly_minutes_id and used_minutes are required' }, { status: 400 });
        }

        // Get current record
        const record = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.get(quarterly_minutes_id);
        
        if (!record) {
            return Response.json({ error: 'Quarterly minutes record not found' }, { status: 404 });
        }

        const newUsed = Math.max(0, used_minutes);
        const newRemaining = Math.max(0, record.total_minutes - newUsed);

        // Update record
        await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.update(quarterly_minutes_id, {
            used_minutes: newUsed,
            remaining_minutes: newRemaining
        });

        // Log audit
        await base44.functions.invoke('logAudit', {
            action: 'UPDATE',
            entity_type: 'EmployeeQuarterlyMinutes',
            entity_id: quarterly_minutes_id,
            old_data: JSON.stringify({ used_minutes: record.used_minutes }),
            new_data: JSON.stringify({ used_minutes: newUsed }),
            details: `Updated quarterly minutes usage for employee ${record.employee_id}`
        });

        return Response.json({ 
            success: true,
            message: 'Quarterly minutes updated successfully',
            data: {
                used_minutes: newUsed,
                remaining_minutes: newRemaining
            }
        });

    } catch (error) {
        console.error('Update quarterly minutes error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});