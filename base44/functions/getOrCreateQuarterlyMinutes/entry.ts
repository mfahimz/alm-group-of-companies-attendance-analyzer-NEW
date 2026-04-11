import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Get or Create Half-Yearly Minutes Record (Calendar-Based)
 *
 * This function retrieves or creates a half-yearly minutes record for an employee
 * based on a specific DATE (not project). The half is determined from the date.
 *
 * Half determination rule:
 * - Months 1–6  (Jan–Jun) → half 1 (H1)
 * - Months 7–12 (Jul–Dec) → half 2 (H2)
 *
 * Pure calendar-based tracking:
 * - H1: January 1 - June 30
 * - H2: July 1 - December 31
 *
 * Usage:
 * const record = await getOrCreateQuarterlyMinutes(employee_id, company, date_string);
 *
 * Returns: { year, half, half_name, half_period, total_minutes, used_minutes, remaining_minutes, record_id }
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { employee_id, company, date } = await req.json();

        if (!employee_id || !company || !date) {
            return Response.json({
                error: 'Missing required fields: employee_id, company, date'
            }, { status: 400 });
        }

        // Check if company supports half-yearly minutes
        if (company !== 'Al Maraghi Motors') {
            return Response.json({
                success: false,
                error: 'Half-yearly minutes feature is only available for Al Maraghi Motors'
            }, { status: 400 });
        }

        // Parse date and determine half
        const targetDate = new Date(date);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1; // 1-12

        // Determine half from month:
        // Months 1–6 (Jan–Jun) → half 1 (H1)
        // Months 7–12 (Jul–Dec) → half 2 (H2)
        const half = month <= 6 ? 1 : 2;

        // Check if record exists
        const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            employee_id: employee_id,
            company: company,
            year: year,
            half: half
        });

        let record;
        if (existing.length > 0) {
            // Return existing record
            record = existing[0];
        } else {
            // Create new record with default 120 minutes
            record = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                employee_id: employee_id,
                company: company,
                year: year,
                half: half,
                total_minutes: 120,
                used_minutes: 0,
                remaining_minutes: 120
            });
        }

        return Response.json({
            success: true,
            year: record.year,
            half: record.half,
            half_name: `H${record.half} ${record.year}`,
            half_period: getHalfPeriod(record.half, record.year),
            total_minutes: record.total_minutes,
            used_minutes: record.used_minutes,
            remaining_minutes: record.remaining_minutes,
            record_id: record.id
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});

// Helper function to get half-year period string
function getHalfPeriod(half, year) {
    const periods = {
        1: `H1 Jan-Jun ${year}`,
        2: `H2 Jul-Dec ${year}`
    };
    return periods[half];
}