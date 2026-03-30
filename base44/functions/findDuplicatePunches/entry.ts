import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { project_id } = await req.json();
        if (!project_id) {
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }

        // Fetch all punches in batches
        const allPunches = [];
        let skip = 0;
        const batchSize = 50;
        while (true) {
            const batch = await base44.asServiceRole.entities.Punch.filter(
                { project_id },
                '-created_date',
                batchSize,
                skip
            );
            if (!batch || batch.length === 0) break;
            allPunches.push(...batch);
            skip += batchSize;
            if (batch.length < batchSize) break;
            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`Total punches fetched: ${allPunches.length}`);

        // Group by timestamp_raw + attendance_id (exact duplicates)
        const seen = {};
        const duplicates = {};
        
        for (const punch of allPunches) {
            const key = `${punch.attendance_id}||${punch.timestamp_raw}`;
            if (!seen[key]) {
                seen[key] = [punch];
            } else {
                seen[key].push(punch);
                duplicates[key] = seen[key];
            }
        }

        // Build summary
        const duplicateGroups = Object.entries(duplicates).map(([key, punches]) => ({
            key,
            attendance_id: punches[0].attendance_id,
            timestamp_raw: punches[0].timestamp_raw,
            count: punches.length,
            ids: punches.map(p => p.id)
        }));

        // Count IDs to delete (keep first, delete rest)
        const idsToDelete = [];
        for (const group of duplicateGroups) {
            // Keep the first one, mark rest for deletion
            idsToDelete.push(...group.ids.slice(1));
        }

        // Also count unique attendance_ids
        const attendanceIds = [...new Set(allPunches.map(p => p.attendance_id))].sort();

        return Response.json({
            total_punches: allPunches.length,
            unique_attendance_ids: attendanceIds,
            attendance_id_count: attendanceIds.length,
            duplicate_groups: duplicateGroups.length,
            total_duplicates_to_delete: idsToDelete.length,
            unique_after_cleanup: allPunches.length - idsToDelete.length,
            sample_duplicates: duplicateGroups.slice(0, 20),
            ids_to_delete: idsToDelete
        });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});