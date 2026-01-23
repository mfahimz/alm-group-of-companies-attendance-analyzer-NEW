import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Migration: Convert to Pure Calendar-Based Quarterly Minutes
 * 
 * This function:
 * 1. Deletes ALL existing project-based quarterly minutes records
 * 2. Creates fresh calendar-based records for current quarter (Q1 2026)
 * 3. Ensures one record per employee per company per quarter
 * 
 * CRITICAL: This is a one-time migration. Run once and verify results.
 * 
 * Admin only.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Admin only
        if (user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { confirm_delete_all } = await req.json();

        if (!confirm_delete_all) {
            return Response.json({
                error: 'Migration requires confirmation. Pass confirm_delete_all: true to proceed.',
                warning: 'This will DELETE ALL existing quarterly minutes records and create fresh calendar-based records for Q1 2026.'
            }, { status: 400 });
        }

        // STEP 1: Delete ALL existing quarterly minutes records
        const existingRecords = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.list();
        
        console.log(`Found ${existingRecords.length} existing records to delete`);

        const deleteBatchSize = 20;
        for (let i = 0; i < existingRecords.length; i += deleteBatchSize) {
            const batch = existingRecords.slice(i, i + deleteBatchSize);
            await Promise.all(batch.map(r => 
                base44.asServiceRole.entities.EmployeeQuarterlyMinutes.delete(r.id)
            ));
            console.log(`Deleted batch ${i / deleteBatchSize + 1} (${batch.length} records)`);
        }

        // STEP 2: Get all active employees from all companies
        const allEmployees = await base44.asServiceRole.entities.Employee.filter({ active: true });
        
        console.log(`Found ${allEmployees.length} active employees`);

        // STEP 3: Create Q1 2026 records for ALL employees
        const currentYear = 2026;
        const currentQuarter = 1; // Q1 2026 (Jan-Mar)

        const recordsToCreate = allEmployees.map(emp => ({
            employee_id: String(emp.hrms_id),
            company: emp.company,
            year: currentYear,
            quarter: currentQuarter,
            total_minutes: emp.approved_other_minutes_limit || 120,
            used_minutes: 0,
            remaining_minutes: emp.approved_other_minutes_limit || 120
        }));

        // Create in batches
        const createBatchSize = 50;
        let totalCreated = 0;

        for (let i = 0; i < recordsToCreate.length; i += createBatchSize) {
            const batch = recordsToCreate.slice(i, i + createBatchSize);
            const created = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.bulkCreate(batch);
            totalCreated += created.length;
            console.log(`Created batch ${i / createBatchSize + 1} (${created.length} records)`);
        }

        // STEP 4: Verify no duplicates exist
        const verification = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.list();
        const uniqueKeys = new Set();
        const duplicates = [];

        for (const record of verification) {
            const key = `${record.employee_id}-${record.company}-${record.year}-${record.quarter}`;
            if (uniqueKeys.has(key)) {
                duplicates.push(record);
            } else {
                uniqueKeys.add(key);
            }
        }

        return Response.json({
            success: true,
            migration_summary: {
                deleted_old_records: existingRecords.length,
                active_employees: allEmployees.length,
                created_new_records: totalCreated,
                quarter_initialized: `Q${currentQuarter} ${currentYear}`,
                quarter_period: 'Jan 1 - Mar 31, 2026',
                duplicates_found: duplicates.length,
                verification_total: verification.length
            },
            message: `Migration complete. Deleted ${existingRecords.length} old records, created ${totalCreated} new calendar-based records for Q1 2026.`
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});