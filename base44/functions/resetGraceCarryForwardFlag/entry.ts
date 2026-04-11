import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const { project_id } = await req.json();
        if (!project_id) {
            return Response.json({ error: 'Missing project_id' }, { status: 400 });
        }

        await base44.asServiceRole.entities.Project.update(project_id, {
            grace_carried_forward: false
        });

        return Response.json({
            success: true,
            message: 'Grace carry-forward flag reset. Ready to retry close.'
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});