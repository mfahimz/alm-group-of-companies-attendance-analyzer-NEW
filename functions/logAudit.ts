import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const {
            action,
            entity_type,
            entity_id,
            entity_name,
            old_data,
            new_data,
            details,
            company,
            success = true,
            error_message
        } = body;

        if (!action || !entity_type) {
            return Response.json({ error: 'action and entity_type are required' }, { status: 400 });
        }

        // Get IP address
        let ipAddress = 'Unknown';
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            ipAddress = ipData.ip;
        } catch {}

        // Get extended role if available
        const userRole = user.extended_role || user.role;
        
        // Create audit log entry
        await base44.asServiceRole.entities.AuditLog.create({
            action,
            entity_type,
            entity_id: entity_id || null,
            entity_name: entity_name || null,
            old_data: old_data ? JSON.stringify(old_data) : null,
            new_data: new_data ? JSON.stringify(new_data) : null,
            user_email: user.email,
            user_name: user.full_name,
            user_role: userRole,
            ip_address: ipAddress,
            details: details || null,
            company: company || null,
            success,
            error_message: error_message || null
        });

        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});