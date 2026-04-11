import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Store custom domain in SystemSettings
        const customDomain = Deno.env.get('CUSTOM_DOMAIN');
        
        if (customDomain) {
            const existing = await base44.asServiceRole.entities.SystemSettings.filter({ 
                setting_key: 'CUSTOM_DOMAIN' 
            });

            if (existing.length > 0) {
                await base44.asServiceRole.entities.SystemSettings.update(existing[0].id, {
                    setting_value: customDomain,
                    description: 'Custom domain for approval links and external access'
                });
            } else {
                await base44.asServiceRole.entities.SystemSettings.create({
                    setting_key: 'CUSTOM_DOMAIN',
                    setting_value: customDomain,
                    description: 'Custom domain for approval links and external access'
                });
            }

            return Response.json({
                success: true,
                message: 'Custom domain stored successfully',
                domain: customDomain
            });
        } else {
            return Response.json({
                success: false,
                message: 'No custom domain configured'
            });
        }

    } catch (error) {
        console.error('Store custom domain error:', error);
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});