import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * One-time migration: Enable approved_minutes_enabled for Al Maraghi Auto Repairs
 * This ensures the feature works correctly after the code changes
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Get Al Maraghi Auto Repairs rules
        const rulesData = await base44.asServiceRole.entities.AttendanceRules.filter({ 
            company: 'Al Maraghi Auto Repairs' 
        });

        if (rulesData.length === 0) {
            return Response.json({ 
                error: 'No rules found for Al Maraghi Auto Repairs' 
            }, { status: 404 });
        }

        const rule = rulesData[0];
        let rules = JSON.parse(rule.rules_json);

        // Enable approved_minutes_enabled
        rules.approved_minutes_enabled = true;

        // Update the rule
        await base44.asServiceRole.entities.AttendanceRules.update(rule.id, {
            rules_json: JSON.stringify(rules, null, 2),
            updated_by: user.email
        });

        return Response.json({
            success: true,
            message: 'Approved minutes enabled for Al Maraghi Auto Repairs',
            company: 'Al Maraghi Auto Repairs',
            approved_minutes_enabled: true
        });

    } catch (error) {
        console.error('Migration error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});