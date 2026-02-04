import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Update Quarterly Minutes Usage (Calendar-Based)
 * 
 * Updates the used_minutes and remaining_minutes for a quarterly record.
 * This is called when a department head approves minutes for an employee.
 * 
 * The function:
 * 1. Validates the quarterly record exists
 * 2. Checks sufficient remaining minutes
 * 3. Updates used_minutes and remaining_minutes
 * 4. Returns updated record
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate user
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

        // Check if company supports quarterly minutes
        const supportedCompanies = ['Al Maraghi Automotive', 'Al Maraghi Motors'];
        if (!supportedCompanies.includes(company)) {
            return Response.json({
                success: false,
                error: `Quarterly minutes feature is only available for: ${supportedCompanies.join(', ')}`
            }, { status: 400 });
        }

        // Parse date and determine quarter
        const targetDate = new Date(date);
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;
        
        let quarter;
        if (month >= 1 && month <= 3) quarter = 1;
        else if (month >= 4 && month <= 6) quarter = 2;
        else if (month >= 7 && month <= 9) quarter = 3;
        else quarter = 4;

        // Get existing record
        const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            employee_id: employee_id,
            company: company,
            year: year,
            quarter: quarter
        });

        if (existing.length === 0) {
            return Response.json({
                success: false,
                error: 'Quarterly minutes record not found. Please create it first.'
            }, { status: 404 });
        }

        const record = existing[0];

        // Check if sufficient minutes remaining
        if (record.remaining_minutes < minutes_to_add) {
            return Response.json({
                success: false,
                error: `Insufficient minutes. Only ${record.remaining_minutes} minutes remaining in Q${quarter} ${year}.`,
                remaining_minutes: record.remaining_minutes
            }, { status: 400 });
        }

        // Update the record
        const newUsedMinutes = record.used_minutes + minutes_to_add;
        const newRemainingMinutes = record.total_minutes - newUsedMinutes;

        const updated = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.update(record.id, {
            used_minutes: newUsedMinutes,
            remaining_minutes: newRemainingMinutes
        });

        return Response.json({
            success: true,
            message: `Added ${minutes_to_add} minutes to Q${quarter} ${year}`,
            year: updated.year,
            quarter: updated.quarter,
            quarter_name: `Q${updated.quarter} ${updated.year}`,
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