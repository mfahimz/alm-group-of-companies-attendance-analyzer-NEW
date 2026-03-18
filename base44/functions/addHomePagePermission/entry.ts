import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin only' }, { status: 403 });
        }

        // Check if Home permission already exists
        const existing = await base44.asServiceRole.entities.PagePermission.filter({
            page_name: 'Home'
        });

        if (existing.length > 0) {
            return Response.json({ 
                message: 'Home permission already exists',
                record: existing[0]
            });
        }

        // Create Home page permission
        const homePermission = await base44.asServiceRole.entities.PagePermission.create({
            page_name: 'Home',
            allowed_roles: 'admin,supervisor,user,ceo,department_head,hr_manager',
            description: 'Main home/dashboard navigation - smart routes to appropriate dashboard based on user role'
        });

        return Response.json({ 
            success: true,
            message: 'Home page permission created successfully',
            record: homePermission
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});