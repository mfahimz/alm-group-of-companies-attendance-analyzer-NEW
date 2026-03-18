import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        const { name, cutoff_start_date, cutoff_end_date, notes } = await req.json();

        if (!cutoff_start_date || !cutoff_end_date) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Extract payroll_month_label from cutoff_end_date (format: YYYY-MM)
        const endDate = new Date(cutoff_end_date);
        const payroll_month_label = format(endDate, 'yyyy-MM');

        // Create the cycle
        const cycle = await base44.asServiceRole.entities.CalendarCycle.create({
            name: name || `Payroll ${payroll_month_label}`,
            cutoff_start_date,
            cutoff_end_date,
            payroll_month_label,
            status: 'draft',
            notes: notes || ''
        });

        return Response.json({
            success: true,
            cycle
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});