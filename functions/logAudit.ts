import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Centralized Audit Logging Function
 * 
 * Usage from backend functions:
 * await base44.functions.invoke('logAudit', {
 *   action_type: 'update',
 *   entity_name: 'Project',
 *   entity_id: projectId,
 *   changes: JSON.stringify({status: {old: 'draft', new: 'analyzed'}}),
 *   project_id: projectId,
 *   company: 'Al Maraghi Motors'
 * });
 * 
 * Or call directly from frontend via base44.functions.invoke
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await req.json();
        const {
            action_type,
            entity_name,
            entity_id,
            changes,
            context,
            project_id,
            company
        } = payload;

        // Create audit log entry
        await base44.asServiceRole.entities.AuditLog.create({
            action_type,
            entity_name: entity_name || null,
            entity_id: entity_id || null,
            user_email: user.email,
            user_role: user.role,
            changes: changes || null,
            context: context || null,
            project_id: project_id || null,
            company: company || user.company || null
        });

        return Response.json({ success: true });
    } catch (error) {
        console.error('Audit log error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});