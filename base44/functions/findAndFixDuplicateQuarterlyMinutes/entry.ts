import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Find and fix duplicate half-yearly minutes records.
 * Deduplicates by employee_id + company + year + half.
 * Keeps the record with the highest used_minutes (oldest as tiebreaker).
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const allMinutes = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.list();

        console.log(`Total records: ${allMinutes.length}`);

        const grouped = {};

        for (const record of allMinutes) {
            // Group by employee + company + year + half
            const key = `${record.employee_id}|${record.company}|${record.year}|${record.half}`;

            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(record);
        }

        const duplicates = [];
        const toDelete = [];

        for (const [key, records] of Object.entries(grouped)) {
            if (records.length > 1) {
                records.sort((a, b) => {
                    if (a.used_minutes !== b.used_minutes) {
                        return b.used_minutes - a.used_minutes;
                    }
                    return new Date(a.created_date) - new Date(b.created_date);
                });

                const keeper = records[0];
                const extras = records.slice(1);

                duplicates.push({
                    key,
                    keeper: {
                        id: keeper.id,
                        employee_id: keeper.employee_id,
                        company: keeper.company,
                        year: keeper.year,
                        half: keeper.half,
                        total_minutes: keeper.total_minutes,
                        used_minutes: keeper.used_minutes,
                        created_date: keeper.created_date
                    },
                    extras: extras.map(e => ({
                        id: e.id,
                        total_minutes: e.total_minutes,
                        used_minutes: e.used_minutes,
                        created_date: e.created_date
                    })),
                    action: 'WILL_DELETE_EXTRAS'
                });

                toDelete.push(...extras.map(e => e.id));
            }
        }

        console.log(`Found ${duplicates.length} duplicate groups`);
        console.log(`Will delete ${toDelete.length} duplicate records`);

        if (toDelete.length > 0) {
            const batchSize = 5;
            let deleted = 0;

            for (let i = 0; i < toDelete.length; i += batchSize) {
                const batch = toDelete.slice(i, i + batchSize);
                await Promise.all(batch.map(id =>
                    base44.asServiceRole.entities.EmployeeQuarterlyMinutes.delete(id)
                ));
                deleted += batch.length;

                if (i + batchSize < toDelete.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            console.log(`Successfully deleted ${deleted} duplicate records`);
        }

        return Response.json({
            success: true,
            summary: {
                total_records: allMinutes.length,
                duplicate_groups: duplicates.length,
                records_deleted: toDelete.length,
                records_remaining: allMinutes.length - toDelete.length
            },
            duplicates: duplicates
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});