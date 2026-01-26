import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const shifts = await base44.asServiceRole.entities.ShiftTiming.list();
        const projects = await base44.asServiceRole.entities.Project.list();
        const projectIds = new Set(projects.map(p => p.id));

        const orphanedShifts = shifts.filter(s => !projectIds.has(s.project_id));

        let deletedCount = 0;
        const errors = [];

        for (const shift of orphanedShifts) {
            try {
                await base44.asServiceRole.entities.ShiftTiming.delete(shift.id);
                deletedCount++;
            } catch (err) {
                errors.push(`Failed to delete shift ${shift.id}: ${err.message}`);
            }
        }

        return Response.json({
            success: true,
            recordsFound: orphanedShifts.length,
            recordsDeleted: deletedCount,
            errors: errors.length > 0 ? errors : null
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});