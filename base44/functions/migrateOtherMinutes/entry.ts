import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check user authorization
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Find the specific project
        const projects = await base44.asServiceRole.entities.Project.filter({ 
            name: 'December - Al Maraghi Abu Dhabi',
            company: 'Al Maraghi Auto Repairs'
        });
        
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        
        const projectId = projects[0].id;

        // Fetch exceptions only for this project
        const exceptions = await base44.asServiceRole.entities.Exception.filter({ 
            project_id: projectId 
        });
        
        let updatedCount = 0;
        const updates = [];
        const debugInfo = [];
        
        for (const exception of exceptions) {
            // Collect debug info
            debugInfo.push({
                id: exception.id,
                type: exception.type,
                details: exception.details,
                current_other_minutes: exception.other_minutes,
                attendance_id: exception.attendance_id
            });
            
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
            total_exceptions: exceptions.length,
            debug_info: debugInfo
        });
        
    } catch (error) {
        return Response.json({ 
            error: error.message,
            success: false 
        }, { status: 500 });
    }
});