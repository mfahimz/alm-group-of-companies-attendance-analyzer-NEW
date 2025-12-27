import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check user authorization
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Fetch all exceptions
        const exceptions = await base44.asServiceRole.entities.Exception.list();
        
        let updatedCount = 0;
        const updates = [];
        
        for (const exception of exceptions) {
            // Skip if already has other_minutes set
            if (exception.other_minutes && exception.other_minutes > 0) {
                continue;
            }
            
            // Check if details contains "other min" pattern
            if (exception.details) {
                // Match patterns like "+174 other min", "174 other min", etc.
                const match = exception.details.match(/\+?(\d+)\s*other\s*min/i);
                
                if (match) {
                    const otherMinutes = parseInt(match[1]);
                    updates.push({
                        id: exception.id,
                        other_minutes: otherMinutes
                    });
                }
            }
        }
        
        // Update exceptions in batches
        for (const update of updates) {
            await base44.asServiceRole.entities.Exception.update(update.id, {
                other_minutes: update.other_minutes
            });
            updatedCount++;
        }
        
        return Response.json({ 
            success: true,
            message: `Migration complete: ${updatedCount} exceptions updated`,
            updated_count: updatedCount,
            total_exceptions: exceptions.length
        });
        
    } catch (error) {
        return Response.json({ 
            error: error.message,
            success: false 
        }, { status: 500 });
    }
});