import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        // Fetch all salary records for Al Maraghi Auto Repairs
        const allSalaries = await base44.asServiceRole.entities.EmployeeSalary.filter({
            company: 'Al Maraghi Auto Repairs'
        });

        console.log(`Found ${allSalaries.length} salary records for Al Maraghi Auto Repairs`);

        let migratedCount = 0;
        let skippedCount = 0;
        const errors = [];

        for (const salary of allSalaries) {
            try {
                // Check if allowances is already a number
                if (typeof salary.allowances === 'number') {
                    console.log(`Skipped ${salary.attendance_id} - already a number`);
                    skippedCount++;
                    continue;
                }

                // Parse JSON allowances
                let allowancesObj = {};
                try {
                    allowancesObj = JSON.parse(salary.allowances || '{}');
                } catch (e) {
                    console.log(`Failed to parse JSON for ${salary.attendance_id}, setting to 0`);
                    allowancesObj = {};
                }

                // Calculate total from JSON - handle both formats
                let allowancesTotal = 0;
                if (allowancesObj.total !== undefined) {
                    // Format: {"total": X}
                    allowancesTotal = Number(allowancesObj.total) || 0;
                } else {
                    // Format: {"housing": X, "transport": Y, ...}
                    allowancesTotal = 
                        (Number(allowancesObj.housing) || 0) +
                        (Number(allowancesObj.transport) || 0) +
                        (Number(allowancesObj.food) || 0) +
                        (Number(allowancesObj.others) || 0);
                }

                // Update with number instead of JSON string
                await base44.asServiceRole.entities.EmployeeSalary.update(salary.id, {
                    allowances: allowancesTotal
                });

                console.log(`Migrated ${salary.attendance_id}: ${JSON.stringify(allowancesObj)} → ${allowancesTotal}`);
                migratedCount++;

            } catch (error) {
                console.error(`Error migrating ${salary.attendance_id}:`, error);
                errors.push({
                    attendance_id: salary.attendance_id,
                    error: error.message
                });
            }
        }

        return Response.json({
            success: true,
            message: 'Migration completed',
            migrated: migratedCount,
            skipped: skippedCount,
            errors: errors,
            total: allSalaries.length
        });

    } catch (error) {
        console.error('Migration error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});