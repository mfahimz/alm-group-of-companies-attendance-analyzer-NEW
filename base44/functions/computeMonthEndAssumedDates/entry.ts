import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { endOfMonth, subDays, format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { payroll_month_label, assumed_days_count } = await req.json();

        if (!payroll_month_label || assumed_days_count === undefined) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Parse payroll_month_label (format: YYYY-MM)
        const [year, month] = payroll_month_label.split('-').map(Number);
        const monthDate = new Date(year, month - 1, 1);
        
        // Get last day of month
        const lastDayOfMonth = endOfMonth(monthDate);
        
        // Calculate assumed dates (last N days)
        const assumedDates = [];
        for (let i = 0; i < assumed_days_count; i++) {
            const date = subDays(lastDayOfMonth, i);
            assumedDates.unshift(format(date, 'yyyy-MM-dd'));
        }

        return Response.json({
            success: true,
            payroll_month_label,
            assumed_days_count,
            assumed_dates: assumedDates
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});