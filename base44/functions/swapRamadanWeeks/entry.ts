import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Backend function to safely swap Week 1 and Week 2 shifts in a Ramadan schedule.
 * This swaps the JSON data stored on the RamadanSchedule entity.
 * After swapping, the user must re-apply Ramadan shifts to affected projects.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { schedule_id } = await req.json();

        if (!schedule_id) {
            return Response.json({ error: 'Missing schedule_id' }, { status: 400 });
        }

        // Fetch the schedule
        const schedules = await base44.asServiceRole.entities.RamadanSchedule.filter({ id: schedule_id });
        if (schedules.length === 0) {
            return Response.json({ error: 'Ramadan schedule not found' }, { status: 404 });
        }

        const schedule = schedules[0];

        // Parse current week data
        let week1Data = {};
        let week2Data = {};
        
        try {
            week1Data = schedule.week1_shifts ? JSON.parse(schedule.week1_shifts) : {};
        } catch (e) {
            console.warn('[swapRamadanWeeks] Failed to parse week1_shifts:', e.message);
            week1Data = {};
        }
        
        try {
            week2Data = schedule.week2_shifts ? JSON.parse(schedule.week2_shifts) : {};
        } catch (e) {
            console.warn('[swapRamadanWeeks] Failed to parse week2_shifts:', e.message);
            week2Data = {};
        }

        const week1EmployeeCount = Object.keys(week1Data).length;
        const week2EmployeeCount = Object.keys(week2Data).length;

        console.log(`[swapRamadanWeeks] Schedule ${schedule_id} (${schedule.company} ${schedule.year})`);
        console.log(`[swapRamadanWeeks] Before swap: Week 1 has ${week1EmployeeCount} employees, Week 2 has ${week2EmployeeCount} employees`);

        // Perform the swap
        await base44.asServiceRole.entities.RamadanSchedule.update(schedule_id, {
            week1_shifts: JSON.stringify(week2Data),
            week2_shifts: JSON.stringify(week1Data)
        });

        console.log(`[swapRamadanWeeks] After swap: Week 1 now has ${week2EmployeeCount} employees (was Week 2), Week 2 now has ${week1EmployeeCount} employees (was Week 1)`);

        return Response.json({
            success: true,
            message: `Week 1 and Week 2 shifts swapped successfully for ${schedule.company} ${schedule.year}`,
            details: {
                new_week1_employees: week2EmployeeCount,
                new_week2_employees: week1EmployeeCount
            }
        });

    } catch (error) {
        console.error('[swapRamadanWeeks] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});