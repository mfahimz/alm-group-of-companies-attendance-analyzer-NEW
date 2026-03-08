import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ONE-TIME DATA MIGRATION: Quarterly -> Half-Yearly (2026 only)
 *
 * Old structure (quarterly):
 * - One EmployeeQuarterlyMinutes record per quarter (Q1, Q2, Q3, Q4)
 * - 120 total minutes per quarter
 * - Key dimensions included employee_id, company, year, quarter
 *
 * New structure (half-yearly):
 * - Two EmployeeQuarterlyMinutes records per year
 *   - half: 1 (January-June, combines Q1 + Q2)
 *   - half: 2 (July-December, combines Q3 + Q4)
 * - 120 total minutes per half-year record
 *
 * Combination logic:
 * - used_minutes for half 1 = used(Q1) + used(Q2)
 * - used_minutes for half 2 = used(Q3) + used(Q4)
 * - remaining_minutes = max(0, 120 - combined_used_minutes)
 *
 * Operational safety:
 * - Employees are processed in batches of 10
 * - 300ms delay is added between batches to reduce API pressure/rate-limit risk
 *
 * IMPORTANT:
 * - This function is intended to be run exactly once for 2026 migration.
 * - After successful migration validation, disable or remove this function.
 */

const TARGET_YEAR = 2026;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
        }

        const oldRecords = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            year: TARGET_YEAR,
            allocation_type: 'calendar_quarter'
        });

        if (oldRecords.length === 0) {
            console.log(`[migrateQuarterlyToHalfYearly] No quarterly records found for ${TARGET_YEAR}; nothing to migrate.`);
            return Response.json({
                success: true,
                message: `No quarterly records found for ${TARGET_YEAR}`,
                summary: {
                    total_employees_processed: 0,
                    total_old_quarterly_records_deleted: 0,
                    total_new_half_yearly_records_created: 0,
                    employees_with_errors: []
                }
            });
        }

        // Group by employee + company to safely preserve company-specific records.
        const employeeGroups = new Map<string, any[]>();
        for (const record of oldRecords) {
            const key = `${String(record.employee_id)}::${String(record.company)}`;
            if (!employeeGroups.has(key)) {
                employeeGroups.set(key, []);
            }
            employeeGroups.get(key)?.push(record);
        }

        const groupedEntries = Array.from(employeeGroups.entries());

        let totalEmployeesProcessed = 0;
        let totalOldQuarterlyRecordsDeleted = 0;
        let totalNewHalfYearlyRecordsCreated = 0;
        const employeesWithErrors: Array<{ employee_id: string; company: string; error: string }> = [];

        for (let i = 0; i < groupedEntries.length; i += BATCH_SIZE) {
            const batch = groupedEntries.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async ([, records]) => {
                if (!records || records.length === 0) {
                    // Silent skip for empty groups.
                    return;
                }

                const employeeId = String(records[0].employee_id);
                const company = String(records[0].company);
                const year = Number(records[0].year) || TARGET_YEAR;

                try {
                    // Combine used minutes per half from whichever quarter records exist.
                    // Missing quarters implicitly contribute 0.
                    const half1Used = records
                        .filter((r) => r.quarter === 1 || r.quarter === 2)
                        .reduce((sum, r) => sum + (Number(r.used_minutes) || 0), 0);

                    const half2Used = records
                        .filter((r) => r.quarter === 3 || r.quarter === 4)
                        .reduce((sum, r) => sum + (Number(r.used_minutes) || 0), 0);

                    const newHalfYearlyRecords = [
                        {
                            employee_id: employeeId,
                            company,
                            year,
                            half: 1,
                            allocation_type: 'calendar_half_year',
                            total_minutes: 120,
                            used_minutes: half1Used,
                            remaining_minutes: Math.max(0, 120 - half1Used)
                        },
                        {
                            employee_id: employeeId,
                            company,
                            year,
                            half: 2,
                            allocation_type: 'calendar_half_year',
                            total_minutes: 120,
                            used_minutes: half2Used,
                            remaining_minutes: Math.max(0, 120 - half2Used)
                        }
                    ];

                    // Delete old quarterly records for this employee/company/year before creating half-yearly records.
                    await Promise.all(records.map((r) => base44.asServiceRole.entities.EmployeeQuarterlyMinutes.delete(r.id)));
                    totalOldQuarterlyRecordsDeleted += records.length;

                    await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.bulkCreate(newHalfYearlyRecords);
                    totalNewHalfYearlyRecordsCreated += newHalfYearlyRecords.length;

                    totalEmployeesProcessed += 1;
                } catch (error) {
                    employeesWithErrors.push({
                        employee_id: employeeId,
                        company,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }));

            const hasMoreBatches = i + BATCH_SIZE < groupedEntries.length;
            if (hasMoreBatches) {
                await delay(BATCH_DELAY_MS);
            }
        }

        const summary = {
            total_employees_processed: totalEmployeesProcessed,
            total_old_quarterly_records_deleted: totalOldQuarterlyRecordsDeleted,
            total_new_half_yearly_records_created: totalNewHalfYearlyRecordsCreated,
            employees_with_errors: employeesWithErrors
        };

        console.log('[migrateQuarterlyToHalfYearly] Migration summary:', summary);

        return Response.json({
            success: true,
            message: `Quarterly to half-yearly migration completed for ${TARGET_YEAR}`,
            summary
        });
    } catch (error) {
        console.error('[migrateQuarterlyToHalfYearly] Fatal migration error:', error);
        return Response.json({
            success: false,
            error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
});
