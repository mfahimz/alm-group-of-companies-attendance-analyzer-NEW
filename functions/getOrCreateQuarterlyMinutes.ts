import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to get quarter from date
function getQuarter(date) {
    const month = date.getMonth() + 1; // 1-12
    if (month <= 3) return 1;
    if (month <= 6) return 2;
    if (month <= 9) return 3;
    return 4;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { employee_id, company, date } = await req.json();

        if (!employee_id || !company) {
            return Response.json({ error: 'employee_id and company are required' }, { status: 400 });
        }

        const targetDate = date ? new Date(date) : new Date();
        const year = targetDate.getFullYear();
        const quarter = getQuarter(targetDate);

        // Check if record exists
        const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
            employee_id: employee_id,
            company: company,
            year: year,
            quarter: quarter
        });

        if (existing.length > 0) {
            return Response.json({ 
                success: true,
                data: existing[0]
            });
        }

        // Create new record with default 120 minutes
        const newRecord = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
            employee_id: employee_id,
            company: company,
            year: year,
            quarter: quarter,
            total_minutes: 120,
            used_minutes: 0,
            remaining_minutes: 120
        });

        return Response.json({ 
            success: true,
            data: newRecord
        });

    } catch (error) {
        console.error('Get/Create quarterly minutes error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});