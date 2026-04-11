import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Update Half-Yearly Minutes Usage (Calendar-Based)
 *
 * Updates the used_minutes and remaining_minutes for a half-yearly record.
 * Called when a department head approves minutes for an employee.
 *
 * Half determination rule:
 * - Months 1–6  (Jan–Jun) → half 1 (H1)
 * - Months 7–12 (Jul–Dec) → half 2 (H2)
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { employee_id, company, date, minutes_to_add } = await req.json();

        if (!employee_id || !company || !date || minutes_to_add === undefined) {
            return Response.json({
                error: 'Missing required fields: employee_id, company, date, minutes_to_add'
            }, { status: 400 });
        }

        if (company !== 'Al Maraghi Motors') {
            return Response.json({
                success: false,
                error: 'Half-yearly minutes feature is only available for Al Maraghi Motors'
            }, { status: 400 });
        }

        // Parse date and determine half
        const targetDate = new Date(date);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1; // 1–12

        // Months 1–6 → half 1 (H1), months 7–12 → half 2 (H2)
        const half = month <= 6 ? 1 : 2;

        // Get existing record
        const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            employee_id: employee_id,
            company: company,
            year: year,
            half: half
        });

        if (existing.length === 0) {
            return Response.json({
                success: false,
                error: `Half-yearly minutes record not found for H${half} ${year}. Please create it first.`
            }, { status: 404 });
        }

        const record = existing[0];

        if (record.remaining_minutes < minutes_to_add) {
            return Response.json({
                success: false,
                error: `Insufficient minutes. Only ${record.remaining_minutes} minutes remaining in H${half} ${year}.`,
                remaining_minutes: record.remaining_minutes
            }, { status: 400 });
        }

        const newUsedMinutes = record.used_minutes + minutes_to_add;
        const newRemainingMinutes = record.total_minutes - newUsedMinutes;

        const updated = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.update(record.id, {
            used_minutes: newUsedMinutes,
            remaining_minutes: newRemainingMinutes
        });

        return Response.json({
            success: true,
            message: `Added ${minutes_to_add} minutes to H${half} ${year}`,
            year: updated.year,
            half: updated.half,
            half_name: `H${updated.half} ${updated.year}`,
            half_period: half === 1 ? `H1 Jan-Jun ${year}` : `H2 Jul-Dec ${year}`,
            total_minutes: updated.total_minutes,
            used_minutes: updated.used_minutes,
            remaining_minutes: updated.remaining_minutes,
            minutes_added: minutes_to_add
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});