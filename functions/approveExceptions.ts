import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { token, exception_ids, approve_all } = await req.json();

        if (!token) {
            return Response.json({ error: 'Token is required' }, { status: 400 });
        }

        // SECURITY: Verify authenticated user (for non-public approval links)
        let authenticatedUser = null;
        try {
            authenticatedUser = await base44.auth.me();
        } catch (e) {
            // Public link - no authentication required if admin_override_public is true
        }

        // Verify link is still valid
        const links = await base44.asServiceRole.entities.ApprovalLink.filter({ link_token: token });
        
        if (links.length === 0) {
            return Response.json({ error: 'Invalid link' }, { status: 404 });
        }

        const link = links[0];

        // Check if expired
        const expiresAt = new Date(link.expires_at);
        if (new Date() > expiresAt) {
            return Response.json({ error: 'Link expired' }, { status: 400 });
        }

        // Check if already used
        if (link.used && !approve_all) {
            return Response.json({ error: 'Link already used' }, { status: 400 });
        }

        // SECURITY: For non-public links, verify user is the assigned department head
        if (!link.admin_override_public && authenticatedUser) {
            if (!authenticatedUser.hrms_id || authenticatedUser.hrms_id !== link.department_head_id) {
                return Response.json({ 
                    error: 'Access denied: You are not the assigned department head for this approval' 
                }, { status: 403 });
            }
        }

        // Approve exceptions
        const idsToApprove = approve_all ? exception_ids : [exception_ids];
        
        for (const exceptionId of idsToApprove) {
            await base44.asServiceRole.entities.Exception.update(exceptionId, {
                approval_status: 'approved_dept_head',
                approved_by_dept_head: link.department_head_id,
                dept_head_approval_date: new Date().toISOString()
            });
        }

        // If approve all, mark link as used
        if (approve_all) {
            await base44.asServiceRole.entities.ApprovalLink.update(link.id, {
                used: true,
                used_at: new Date().toISOString(),
                approved: true
            });
        }

        return Response.json({
            success: true,
            message: approve_all ? 'All exceptions approved' : 'Exception approved'
        });

    } catch (error) {
        console.error('Approve exceptions error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});