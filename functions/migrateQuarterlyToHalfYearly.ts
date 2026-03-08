import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * ONE-TIME MIGRATION: Quarterly → Half-Yearly EmployeeQuarterlyMinutes
 * 
 * OLD STRUCTURE (quarterly):
 *   4 records per employee per year, one per quarter:
 *   - Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
 *   - Fields: employee_id, company, year, quarter, total_minutes, used_minutes, remaining_minutes
 *
 * NEW STRUCTURE (half-yearly):
 *   2 records per employee per year:
 *   - H1 (half=1): covers Jan-Jun (Q1 + Q2 combined)
 *   - H2 (half=2): covers Jul-Dec (Q3 + Q4 combined)
 *   - Fields: employee_id, company, year, half, allocation_type, total_minutes, used_minutes, remaining_minutes
 *   - quarter field is no longer used
 *
 * HOW USED MINUTES ARE COMBINED:
 *   H1 used_minutes = Q1.used_minutes + Q2.used_minutes  (missing quarter = 0)
 *   H2 used_minutes = Q3.used_minutes + Q4.used_minutes  (missing quarter = 0)
 *   total_minutes = 120 (fixed per half)
 *   remaining_minutes = max(0, total_minutes - used_minutes)
 *
 * IMPORTANT: Run this function ONCE only. After a successful migration, disable or
 * remove it to prevent accidental re-runs that would corrupt the data.
 *
 * Admin only.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Authenticate — admin only
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Require explicit confirmation to prevent accidental runs
        const body = await req.json();
        if (!body.confirm_migration) {
            return Response.json({
                error: 'Migration requires confirmation. Pass confirm_migration: true to proceed.',
                warning: 'This will DELETE all 2026 quarterly records and replace them with half-yearly records. Run only once.'
            }, { status: 400 });
        }

        const MIGRATION_YEAR = 2026;
        const BATCH_SIZE = 10;
        const BATCH_DELAY_MS = 300;

        // Step 1: Fetch all 2026 quarterly records
        console.log(`Fetching all EmployeeQuarterlyMinutes records for year ${MIGRATION_YEAR}...`);
        const allRecords = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            year: MIGRATION_YEAR
        }, null, 5000);

        console.log(`Found ${allRecords.length} existing 2026 records.`);

        if (allRecords.length === 0) {
            return Response.json({
                success: false,
                message: `No EmployeeQuarterlyMinutes records found for year ${MIGRATION_YEAR}. Nothing to migrate.`
            });
        }

        // Step 2: Group records by employee_id + company key
        const grouped = {};
        for (const record of allRecords) {
            const key = `${record.employee_id}__${record.company}`;
            if (!grouped[key]) {
                grouped[key] = {
                    employee_id: record.employee_id,
                    company: record.company,
                    year: MIGRATION_YEAR,
                    records: []
                };
            }
            grouped[key].records.push(record);
        }

        const employeeKeys = Object.keys(grouped);
        console.log(`Found ${employeeKeys.length} unique employee+company combinations.`);

        // Step 3: Process in batches
        let totalEmployeesProcessed = 0;
        let totalOldDeleted = 0;
        let totalNewCreated = 0;
        const errors = [];

        for (let batchStart = 0; batchStart < employeeKeys.length; batchStart += BATCH_SIZE) {
            const batchKeys = employeeKeys.slice(batchStart, batchStart + BATCH_SIZE);

            await Promise.all(batchKeys.map(async (key) => {
                const { employee_id, company, year, records } = grouped[key];

                try {
                    // Build a map of quarter -> used_minutes for this employee
                    const quarterMap = {};
                    for (const r of records) {
                        const q = Number(r.quarter);
                        if (q >= 1 && q <= 4) {
                            quarterMap[q] = Number(r.used_minutes) || 0;
                        }
                    }

                    // Combine used minutes:
                    // H1 = Q1 + Q2 (missing = 0)
                    const h1Used = (quarterMap[1] || 0) + (quarterMap[2] || 0);
                    // H2 = Q3 + Q4 (missing = 0)
                    const h2Used = (quarterMap[3] || 0) + (quarterMap[4] || 0);

                    const TOTAL = 120;

                    // quarter=0 is used as sentinel value for half-yearly records (schema requires a number)
                    const h1Record = {
                        employee_id: String(employee_id),
                        company: company,
                        year: year,
                        half: 1,
                        quarter: 0,
                        total_minutes: TOTAL,
                        used_minutes: h1Used,
                        remaining_minutes: Math.max(0, TOTAL - h1Used)
                    };

                    const h2Record = {
                        employee_id: String(employee_id),
                        company: company,
                        year: year,
                        half: 2,
                        quarter: 0,
                        total_minutes: TOTAL,
                        used_minutes: h2Used,
                        remaining_minutes: Math.max(0, TOTAL - h2Used)
                    };

                    // Delete all existing 2026 quarterly records for this employee first
                    await Promise.all(records.map(r =>
                        base44.asServiceRole.entities.EmployeeQuarterlyMinutes.delete(r.id)
                    ));
                    totalOldDeleted += records.length;

                    // Create the two new half-yearly records
                    await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create(h1Record);
                    await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create(h2Record);
                    totalNewCreated += 2;

                    totalEmployeesProcessed++;

                    console.log(`Migrated employee_id=${employee_id} company=${company}: H1 used=${h1Used} rem=${h1Record.remaining_minutes} | H2 used=${h2Used} rem=${h2Record.remaining_minutes}`);

                } catch (err) {
                    console.error(`ERROR migrating employee_id=${employee_id} company=${company}: ${err.message}`);
                    errors.push({
                        employee_id: String(employee_id),
                        company: company,
                        error: err.message
                    });
                }
            }));

            // Delay between batches (skip delay after last batch)
            if (batchStart + BATCH_SIZE < employeeKeys.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }

        console.log(`Migration complete. Processed: ${totalEmployeesProcessed}, Deleted: ${totalOldDeleted}, Created: ${totalNewCreated}, Errors: ${errors.length}`);

        return Response.json({
            success: true,
            message: `Migration complete. ${totalEmployeesProcessed} employees migrated from quarterly to half-yearly records.`,
            summary: {
                year: MIGRATION_YEAR,
                total_employees_processed: totalEmployeesProcessed,
                total_old_records_deleted: totalOldDeleted,
                total_new_records_created: totalNewCreated,
                employees_with_errors: errors.length,
                migration_type: 'quarterly (Q1/Q2/Q3/Q4) → half-yearly (H1/H2)'
            },
            errors: errors.length > 0 ? errors : []
        });

    } catch (error) {
        console.error('Migration failed with unexpected error:', error.message);
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});