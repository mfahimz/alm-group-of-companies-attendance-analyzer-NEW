import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        const { calendar_cycle_id } = await req.json();

        if (!calendar_cycle_id) {
            return Response.json({ error: 'Missing calendar_cycle_id' }, { status: 400 });
        }

        // Fetch cycle
        const cycles = await base44.asServiceRole.entities.CalendarCycle.filter({ id: calendar_cycle_id });
        if (cycles.length === 0) {
            return Response.json({ error: 'Cycle not found' }, { status: 404 });
        }

        const cycle = cycles[0];

        if (cycle.status !== 'locked') {
            return Response.json({ error: `Cannot close cycle in ${cycle.status} status. Must be locked first.` }, { status: 400 });
        }

        // Update to closed
        await base44.asServiceRole.entities.CalendarCycle.update(calendar_cycle_id, {
            status: 'closed'
        });

        // Mark all snapshots as final
        const snapshots = await base44.asServiceRole.entities.CalendarPayrollSnapshot.filter({
            calendar_cycle_id
        });

        for (const snapshot of snapshots) {
            await base44.asServiceRole.entities.CalendarPayrollSnapshot.update(snapshot.id, {
                status: 'final'
            });
        }

        return Response.json({
            success: true,
            message: 'Cycle closed and snapshots finalized',
            snapshots_finalized: snapshots.length
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});