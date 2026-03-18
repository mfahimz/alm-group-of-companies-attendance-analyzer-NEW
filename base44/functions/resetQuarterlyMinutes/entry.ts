import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Automated half-yearly reset/initialization for EmployeeQuarterlyMinutes.
 *
 * IMPORTANT MIGRATION NOTE:
 * - This function was migrated from quarterly to half-yearly cycle handling.
 * - Half mapping:
 *   - H1: January through June
 *   - H2: July through December
 *
 * Trigger dates (1st day only):
 * - January 1:
 *   1) create/reset H2 of previous year (if missing/create, if existing/reset usage)
 *   2) initialize H1 of current year
 * - July 1:
 *   1) initialize H2 of current year
 *
 * Custom total_minutes carry-forward is preserved:
 * - If the immediate previous half-year record exists and has custom total_minutes (not 120),
 *   that custom value is carried into newly-created half-year records.
 */

function getHalfFromMonth(month) {
    return month <= 6 ? 1 : 2;
}

function getHalfPeriodLabel(half, year) {
    const periods = {
        1: `H1 Jan-Jun ${year}`,
        2: `H2 Jul-Dec ${year}`
    };
    return periods[half] || `H${half} ${year}`;
}

function getPreviousHalf(half, year) {
    if (half === 1) {
        return { prevHalf: 2, prevYear: year - 1 };
    }
    return { prevHalf: 1, prevYear: year };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // This is a system automation, no user auth required
        const targetCompany = "Al Maraghi Auto Repairs";
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-12
        const currentDay = now.getDate();
        const currentHalf = getHalfFromMonth(currentMonth);

        // Reset now runs only at half-year boundaries (Jan 1 and Jul 1).
        const isHalfYearStart = currentDay === 1 && [1, 7].includes(currentMonth);

        if (!isHalfYearStart) {
            console.log(`Not a half-year start date. Current: ${now.toISOString()}`);
            return Response.json({
                success: true,
                message: 'Not a half-year start date, skipping reset',
                current_date: now.toISOString()
            });
        }

        // Define which periods to process based on trigger date.
        // Jan 1: process previous year's H2 and current year's H1.
        // Jul 1: process current year's H2.
        const periodsToProcess = currentMonth === 1
            ? [
                { year: currentYear - 1, half: 2 },
                { year: currentYear, half: 1 }
            ]
            : [{ year: currentYear, half: 2 }];

        console.log(`Starting half-year reset for ${targetCompany}. Periods: ${periodsToProcess.map(p => getHalfPeriodLabel(p.half, p.year)).join(', ')}`);

        // Get all active employees from Al Maraghi Auto Repairs
        const allEmployees = await base44.asServiceRole.entities.Employee.filter({
            company: targetCompany,
            active: true
        });

        console.log(`Found ${allEmployees.length} active employees`);

        let created = 0;
        let updated = 0;
        let errors = 0;

        for (const employee of allEmployees) {
            for (const period of periodsToProcess) {
                try {
                    const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                        employee_id: employee.hrms_id,
                        company: targetCompany,
                        year: period.year,
                        half: period.half
                    });

                    // Preserve custom total_minutes by carrying from immediate previous half if customized.
                    let customTotalMinutes = 120; // default
                    const { prevHalf, prevYear } = getPreviousHalf(period.half, period.year);

                    const prevRecord = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                        employee_id: employee.hrms_id,
                        company: targetCompany,
                        year: prevYear,
                        half: prevHalf
                    });

                    if (prevRecord.length > 0 && prevRecord[0].total_minutes !== 120) {
                        customTotalMinutes = prevRecord[0].total_minutes;
                    }

                    if (existing.length === 0) {
                        await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                            employee_id: employee.hrms_id,
                            company: targetCompany,
                            year: period.year,
                            half: period.half,
                            total_minutes: customTotalMinutes,
                            used_minutes: 0,
                            remaining_minutes: customTotalMinutes
                        });
                        created++;
                    } else {
                        // Reset existing record so the half-year period starts fresh.
                        await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.update(existing[0].id, {
                            used_minutes: 0,
                            remaining_minutes: existing[0].total_minutes
                        });
                        updated++;
                    }
                } catch (err) {
                    console.error(`Error processing employee ${employee.hrms_id} for ${getHalfPeriodLabel(period.half, period.year)}:`, err);
                    errors++;
                }
            }
        }

        // Log the reset operation with half-year labels instead of quarterly labels.
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'HALF_YEAR_RESET',
            entity_type: 'EmployeeQuarterlyMinutes',
            details: `Automated half-year reset for ${targetCompany} - ${periodsToProcess.map(p => getHalfPeriodLabel(p.half, p.year)).join(', ')}`,
            user_email: 'system@automation',
            user_name: 'System Automation',
            user_role: 'system',
            company: targetCompany,
            success: true
        });

        console.log(`Half-year reset complete: ${created} created, ${updated} updated, ${errors} errors`);

        return Response.json({
            success: true,
            message: `Half-year reset completed for ${targetCompany}`,
            stats: {
                company: targetCompany,
                year: currentYear,
                half: currentHalf,
                periods_processed: periodsToProcess.map(p => ({
                    year: p.year,
                    half: p.half,
                    label: getHalfPeriodLabel(p.half, p.year)
                })),
                employees_processed: allEmployees.length,
                records_created: created,
                records_updated: updated,
                errors: errors
            }
        });

    } catch (error) {
        console.error('Half-year reset error:', error);

        // Log the failure
        try {
            const base44 = createClientFromRequest(req);
            await base44.asServiceRole.functions.invoke('logAudit', {
                action: 'HALF_YEAR_RESET',
                entity_type: 'EmployeeQuarterlyMinutes',
                details: 'Automated half-year reset failed',
                user_email: 'system@automation',
                user_name: 'System Automation',
                user_role: 'system',
                success: false,
                error_message: error.message
            });
        } catch {}

        return Response.json({
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});
