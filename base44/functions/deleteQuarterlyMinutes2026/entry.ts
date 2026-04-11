import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Admin-only
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { employee_ids } = await req.json();

        if (!employee_ids || !Array.isArray(employee_ids)) {
            return Response.json({ error: 'employee_ids array required' }, { status: 400 });
        }

        // Fetch all 2026 records for these employees using service role
        const records = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            employee_id: { $in: employee_ids },
            year: 2026,
            allocation_type: 'calendar_quarter'
        });

        console.log(`Found ${records.length} records to delete`);

        // Delete each record using service role
        let deletedCount = 0;
        for (const record of records) {
            try {
                await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.delete(record.id);
                deletedCount++;
            } catch (err) {
                console.error(`Failed to delete ${record.id}:`, err);
            }
        }

        return Response.json({
            success: true,
            deleted_count: deletedCount,
            found_count: records.length,
            employee_ids
        });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});