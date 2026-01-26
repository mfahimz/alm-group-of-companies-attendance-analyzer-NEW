import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const punches = await base44.asServiceRole.entities.Punch.list();
        const numericPunches = punches.filter(p => typeof p.attendance_id === 'number');

        let fixedCount = 0;
        const errors = [];

        for (const punch of numericPunches) {
            try {
                await base44.asServiceRole.entities.Punch.update(punch.id, {
                    attendance_id: String(punch.attendance_id)
                });
                fixedCount++;
            } catch (err) {
                errors.push(`Failed to fix punch ${punch.id}: ${err.message}`);
            }
        }

        return Response.json({
            success: true,
            recordsFound: numericPunches.length,
            recordsFixed: fixedCount,
            errors: errors.length > 0 ? errors : null
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});