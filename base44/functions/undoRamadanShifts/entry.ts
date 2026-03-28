import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Undo/Delete Ramadan shifts with throttled batch processing
 * Handles up to 1000+ shifts safely without rate limiting
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId, ramadanFrom, ramadanTo } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'Missing project ID' }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        const project = projects[0];
        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        // Security check
        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'ceo' && userRole !== 'hr_manager') {
            if (project.company !== user.company) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Fetch all shifts for this project in pages
        let allShifts = [];
        let skip = 0;
        const PAGE_SIZE = 50;
        while (true) {
            const page = await base44.asServiceRole.entities.ShiftTiming.filter(
                { project_id: projectId }, null, PAGE_SIZE, skip
            );
            if (!Array.isArray(page) || page.length === 0) break;
            allShifts.push(...page);
            skip += page.length;
            if (page.length < PAGE_SIZE) break;
            // Small delay between pages
            await new Promise(r => setTimeout(r, 200));
        }

        // Filter only Ramadan shifts
        let ramadanShifts = allShifts.filter(s => 
            s.applicable_days && s.applicable_days.includes('Ramadan')
        );

        // Further filter by date range if provided
        if (ramadanFrom && ramadanTo) {
            ramadanShifts = ramadanShifts.filter(s => {
                if (!s.date) return true; // Non-date-specific Ramadan shifts always included
                return s.date >= ramadanFrom && s.date <= ramadanTo;
            });
        }

        if (ramadanShifts.length === 0) {
            return Response.json({ 
                success: true, 
                deletedCount: 0, 
                totalFound: 0,
                message: 'No Ramadan shifts found to delete' 
            });
        }

        console.log(`[undoRamadanShifts] Found ${ramadanShifts.length} Ramadan shifts to delete`);

        // Delete in small batches with delays to avoid rate limiting
        const BATCH_SIZE = 5;
        let deletedCount = 0;
        const shiftIds = ramadanShifts.map(s => s.id);

        for (let i = 0; i < shiftIds.length; i += BATCH_SIZE) {
            const batch = shiftIds.slice(i, i + BATCH_SIZE);
            
            // Delete batch in parallel (small batch = safe)
            const results = await Promise.allSettled(
                batch.map(id => base44.asServiceRole.entities.ShiftTiming.delete(id))
            );

            deletedCount += results.filter(r => r.status === 'fulfilled').length;

            // Log progress every 50
            if (deletedCount % 50 === 0 || i + BATCH_SIZE >= shiftIds.length) {
                console.log(`[undoRamadanShifts] Deleted ${deletedCount}/${shiftIds.length} shifts`);
            }

            // Delay between batches to respect rate limits
            if (i + BATCH_SIZE < shiftIds.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        return Response.json({
            success: true,
            deletedCount,
            totalFound: ramadanShifts.length,
            message: `Successfully deleted ${deletedCount} Ramadan shifts`
        });

    } catch (error) {
        console.error('[undoRamadanShifts] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});