import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * secureAuditProxy - Backend Function
 * 
 * Secure backend function to safely handle elevated data access for the frontend.
 * This completely encapsulates the `asServiceRole` credentials on the server.
 * 
 * Required Payload:
 * {
 *   entityName: string;
 *   filters: object;
 *   sort: string;
 *   limit: number;
 * }
 */
Deno.serve(async (req: Request) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Authentication required' }, { status: 401 });
        }

        const { entityName, filters = {}, sort = '-created_date', limit = 1000 } = await req.json();

        if (!entityName) {
            return Response.json({ error: 'entityName is required' }, { status: 400 });
        }

        // 2. Enforce Company Fence securely on the backend
        if (!user.company) {
             return Response.json({ error: 'User must be assigned to a company' }, { status: 403 });
        }
        
        // Hard-coded security barrier - impossible to bypass from client
        const enforcedFilters = { ...filters, company: user.company };

        try {
            // 3. Perform Elevated Fetch safely on the backend
            const data = await base44.asServiceRole.entities[entityName].filter(enforcedFilters, sort, limit);
            
            // 4. Secure Audit Logging using service role
            await base44.asServiceRole.entities.AuditLog.create({
                user_email: user.email,
                user_role: user.role || user.extended_role || 'user',
                action_type: 'proxy_access',
                entity_name: entityName,
                company: user.company,
                changes: JSON.stringify({
                    action: 'filter',
                    status: 'success',
                    filters: enforcedFilters,
                    count: data.length
                }),
                context: `SecureAuditProxy Backend: Verified access`
            });

            return Response.json({ success: true, data });

        } catch (fetchErr: any) {
            console.error(`[SecureAuditProxy Server] Fetch failed for ${entityName}:`, fetchErr);

            // Secure Audit Logging for failures
            await base44.asServiceRole.entities.AuditLog.create({
                user_email: user.email,
                user_role: user.role || user.extended_role || 'user',
                action_type: 'proxy_access',
                entity_name: entityName,
                company: user.company,
                changes: JSON.stringify({
                    action: 'filter_error',
                    status: 'error',
                    filters: enforcedFilters,
                    error_message: fetchErr.message
                }),
                context: `SecureAuditProxy Backend: Platform or permission error`
            });

            // Return 500 so frontend knows to trigger the fallback
            return Response.json({ error: fetchErr.message, details: 'Proxy fetch failed' }, { status: 500 });
        }

    } catch (error: any) {
        console.error('[SecureAuditProxy Server] Fatal error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
