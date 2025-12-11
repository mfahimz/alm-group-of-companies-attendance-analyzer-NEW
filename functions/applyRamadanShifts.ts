import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId, ramadanScheduleId, ramadanFrom, ramadanTo } = await req.json();

        if (!projectId || !ramadanScheduleId || !ramadanFrom || !ramadanTo) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch project and schedule
        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        const [schedule] = await base44.asServiceRole.entities.RamadanSchedule.filter({ id: ramadanScheduleId });

        if (!project || !schedule) {
            return Response.json({ error: 'Project or schedule not found' }, { status: 404 });
        }

        // Parse week shifts
        const week1Shifts = JSON.parse(schedule.week1_shifts || '{}');
        const week2Shifts = JSON.parse(schedule.week2_shifts || '{}');

        // Get all employees for this project
        const employees = await base44.asServiceRole.entities.Employee.filter({ 
            company: project.company,
            active: true 
        });

        // Generate shift timings for Ramadan period
        const shiftsToCreate = [];
        const startDate = new Date(ramadanFrom);
        const endDate = new Date(ramadanTo);
        const ramadanStartDate = new Date(schedule.ramadan_start_date);

        for (const employee of employees) {
            const attendanceId = employee.attendance_id;
            const week1 = week1Shifts[attendanceId];
            const week2 = week2Shifts[attendanceId];

            if (!week1 && !week2) continue; // Skip if no Ramadan shifts configured

            for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
                const dateStr = currentDate.toISOString().split('T')[0];
                
                // Calculate week number from Ramadan start
                const daysSinceRamadanStart = Math.floor((currentDate - ramadanStartDate) / (1000 * 60 * 60 * 24));
                const weekNum = Math.floor(daysSinceRamadanStart / 7) % 2; // Alternates 0, 1, 0, 1...
                
                const weekShifts = weekNum === 0 ? week1 : week2;
                
                if (weekShifts) {
                    // Create shift timing for this date
                    shiftsToCreate.push({
                        project_id: projectId,
                        attendance_id: attendanceId,
                        date: dateStr,
                        effective_from: dateStr,
                        effective_to: dateStr,
                        is_friday_shift: false,
                        applicable_days: 'Ramadan Schedule',
                        am_start: weekShifts.shift1_start || '—',
                        am_end: weekShifts.shift1_end || '—',
                        pm_start: weekShifts.shift2_start || '—',
                        pm_end: weekShifts.shift2_end || '—'
                    });

                    // Add night shift as separate timing if exists
                    if (weekShifts.night_start && weekShifts.night_end) {
                        shiftsToCreate.push({
                            project_id: projectId,
                            attendance_id: attendanceId,
                            date: dateStr,
                            effective_from: dateStr,
                            effective_to: dateStr,
                            is_friday_shift: false,
                            applicable_days: 'Ramadan Night Shift',
                            am_start: weekShifts.night_start || '—',
                            am_end: weekShifts.night_end || '—',
                            pm_start: '—',
                            pm_end: '—'
                        });
                    }
                }
            }
        }

        // Bulk create shifts
        if (shiftsToCreate.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < shiftsToCreate.length; i += batchSize) {
                const batch = shiftsToCreate.slice(i, i + batchSize);
                await base44.asServiceRole.entities.ShiftTiming.bulkCreate(batch);
            }
        }

        return Response.json({
            success: true,
            shiftsCreated: shiftsToCreate.length,
            message: `Applied Ramadan shifts for ${employees.length} employees`
        });

    } catch (error) {
        console.error('Error applying Ramadan shifts:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});