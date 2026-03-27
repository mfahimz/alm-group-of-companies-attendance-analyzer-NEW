import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'projectId is required' }, { status: 400 });
        }

        // TODO: Add logic here
        return Response.json({ success: true, projectId });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});