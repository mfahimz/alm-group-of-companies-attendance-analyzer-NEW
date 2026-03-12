import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId, ramadanScheduleId, ramadanFrom, ramadanTo } = await req.json();

        if (!projectId || !ramadanScheduleId) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch project and schedule
        const [project] = await base44.asServiceRole.entities.Project.filter({ id: projectId });
        const [schedule] = await base44.asServiceRole.entities.RamadanSchedule.filter({ id: ramadanScheduleId });

        if (!project || !schedule) {
            return Response.json({ error: 'Project or schedule not found' }, { status: 404 });
        }

        // Detect if this is Al Maraghi Automotive (company_id=3)
        let isAlMaraghiAutomotive = false;
        try {
            const companies = await base44.asServiceRole.entities.Company.filter({ name: project.company });
            if (companies.length > 0 && companies[0].company_id === 3) {
                isAlMaraghiAutomotive = true;
            }
        } catch (e) {
            console.log('Could not determine company_id, proceeding with standard logic');
        }

        // Calculate date overlap
        const projectStart = new Date(project.date_from);
        const projectEnd = new Date(project.date_to);
        const ramadanStart = new Date(schedule.ramadan_start_date);
        const ramadanEnd = new Date(schedule.ramadan_end_date);
        const overlapStart = new Date(Math.max(projectStart, ramadanStart));
        const overlapEnd = new Date(Math.min(projectEnd, ramadanEnd));

        if (overlapStart > overlapEnd) {
            return Response.json({ success: true, shiftsCreated: 0, message: 'No overlap between project and Ramadan dates' });
        }

        const startDate = ramadanFrom ? new Date(ramadanFrom) : overlapStart;
        const endDate = ramadanTo ? new Date(ramadanTo) : overlapEnd;
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Parse week shifts and Friday shifts
        const week1Shifts = JSON.parse(schedule.week1_shifts || '{}');
        const week2Shifts = JSON.parse(schedule.week2_shifts || '{}');
        const fridayShifts = JSON.parse(schedule.friday_shifts || '{}');

        // Get employees
        let employees;
        if (project.custom_employee_ids) {
            const employeeIds = project.custom_employee_ids.split(',').map(id => String(id).trim()).filter(Boolean);
            employees = await base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true });
            employees = employees.filter(e => {
                const hrmsStr = String(e.hrms_id).replace('.0', '').trim();
                return employeeIds.includes(hrmsStr);
            });
        } else {
            employees = await base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true });
        }

        // OVERWRITE RULE: If an admin has already manually adjusted an employee's 
        // shift in the calendar, this action should overwrite those changes.
        // We delete ANY existing ShiftTiming records for the target employees 
        // within the date range, regardless of whether they are Ramadan or regular.
        const attendanceIds = employees.map(e => String(e.attendance_id));
        const existingShifts = await base44.asServiceRole.entities.ShiftTiming.filter({ project_id: projectId });
        const shiftsToDelete = existingShifts.filter(s =>
            attendanceIds.includes(String(s.attendance_id)) &&
            s.date >= startDateStr && s.date <= endDateStr
        );
        
        if (shiftsToDelete.length > 0) {
            console.log(`[applyRamadanShifts] Overwriting ${shiftsToDelete.length} existing shifts...`);
            // Delete them so we can cleanly recreate the new Ramadan pattern
            for (let i = 0; i < shiftsToDelete.length; i += 10) {
                const batchIds = shiftsToDelete.slice(i, i + 10).map(s => s.id);
                try {
                    await Promise.all(batchIds.map(id => base44.asServiceRole.entities.ShiftTiming.delete(id)));
                    await new Promise(res => setTimeout(res, 300));
                } catch (err) {
                    console.warn('[applyRamadanShifts] Failed to delete some existing shifts:', err);
                }
            }
        }
        
        // CONFLICT RESOLUTION: If an employee has a Day Swap exception on a Ramadan day,
        // prioritize the Swapped timing over the Ramadan timing (do not create a Ramadan shift)
        const allExceptions = await base44.asServiceRole.entities.Exception.filter({ project_id: projectId });
        const daySwapExceptions = allExceptions.filter(e => 
            e.type === 'DAY_SWAP' && 
            e.approval_status === 'approved' &&
            e.use_in_analysis !== false
        );

        // ================================================================
        // Helper: Check if a time value is actually filled (non-empty, non-dash)
        // ================================================================
        const isTimeFilled = (val) => {
            if (!val) return false;
            const trimmed = String(val).trim();
            return trimmed !== '' && trimmed !== '—' && trimmed !== '-' && trimmed !== 'null' && trimmed !== 'undefined';
        };

        // Generate all shift records
        const shiftsToCreate = [];

        for (const employee of employees) {
            const attendanceId = String(employee.attendance_id);
            const week1 = week1Shifts[attendanceId];
            const week2 = week2Shifts[attendanceId];
            if (!week1 && !week2) continue;

            // CRITICAL: Week rotates after each Saturday (before Sunday)
            // Track current week for this employee
            let currentWeekIndex = 0; // 0 = week1, 1 = week2
            
            for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getDay();
                const isSunday = dayOfWeek === 0;
                const isFriday = dayOfWeek === 5;
                const isSaturday = dayOfWeek === 6;

                // Check for Day Swap exception override
                const hasDaySwap = daySwapExceptions.some(ex => {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    // Match employee ID and explicitly check date applicability
                    const matchesEmployee = String(ex.attendance_id) === 'ALL' || String(ex.attendance_id) === attendanceId;
                    return matchesEmployee && currentDate >= exFrom && currentDate <= exTo;
                });

                if (hasDaySwap) {
                    // CONFLICT RESOLUTION: Priority goes to Swapped timing. 
                    // By skipping, we allow the main attendance analysis to apply the Day Swap's exception details
                    // instead of falling back to the standard Ramadan pattern.
                    console.log(`[applyRamadanShifts] Skipping ${dateStr} for ${attendanceId} due to DAY_SWAP priority.`);
                    continue;
                }

                if (isSunday) {
                    continue; // Skip Sunday (weekly off)
                }

                const fridayShift = fridayShifts[attendanceId];
                const weekShifts = isFriday && fridayShift ? fridayShift : (currentWeekIndex === 0 ? week1 : week2);
                if (!weekShifts) {
                    // Rotate week after Saturday (before Sunday)
                    if (isSaturday) {
                        currentWeekIndex = (currentWeekIndex + 1) % 2;
                    }
                    continue;
                }

                // ================================================================
                // SIMPLE LOGIC: Determine single vs combined based on TIME FIELDS ONLY
                //
                // The designer has 4 time fields: day_start, day_end, night_start, night_end
                //
                // RULE: Count how many time fields are actually filled:
                //   - If only day_start + day_end have values (2 times) → SINGLE SHIFT
                //   - If only night_start + night_end have values (2 times) → SINGLE SHIFT  
                //   - If all 4 fields have values → COMBINED SHIFT (two shifts)
                //   - The UI 'active_shifts' is ignored; TIME FIELDS are the sole source of truth
                //
                // For Al Maraghi Automotive (non-Friday):
                //   S1/S2 are stored in day_start/day_end only. Night fields are always empty.
                //   So it's ALWAYS a single shift for non-Friday.
                // ================================================================
                
                const hasDayTimes = isTimeFilled(weekShifts.day_start) && isTimeFilled(weekShifts.day_end);
                const hasNightTimes = isTimeFilled(weekShifts.night_start) && isTimeFilled(weekShifts.night_end);
                
                // Primary: TIME FIELDS are the absolute source of truth, ignoring active_shifts entirely
                const hasBothShifts = hasDayTimes && hasNightTimes;
                const hasDayShift = hasDayTimes && !hasBothShifts;
                const hasNightShift = hasNightTimes && !hasBothShifts;

                console.log(`[applyRamadanShifts] Employee ${attendanceId}, Date ${dateStr}: dayTimes=${hasDayTimes}(${weekShifts.day_start}|${weekShifts.day_end}), nightTimes=${hasNightTimes}(${weekShifts.night_start}|${weekShifts.night_end}), hasBoth=${hasBothShifts}`);

                if (hasBothShifts) {
                    // FOUR time fields filled → Combined shift (is_single_shift=false)
                    // am_start=day_start, am_end=day_end, pm_start=night_start, pm_end=night_end
                    const label = isFriday ? 'Ramadan Friday Combined Shift' : 'Ramadan Combined Shift';
                    shiftsToCreate.push({
                        project_id: projectId, attendance_id: attendanceId, date: dateStr,
                        effective_from: dateStr, effective_to: dateStr, is_friday_shift: isFriday,
                        is_single_shift: false, applicable_days: label,
                        am_start: weekShifts.day_start, am_end: weekShifts.day_end,
                        pm_start: weekShifts.night_start, pm_end: weekShifts.night_end
                    });
                } else if (hasDayShift) {
                    // Only DAY times filled (2 times) → Single shift
                    const label = isFriday ? 'Ramadan Friday Day Shift' : 'Ramadan Day Shift';
                    shiftsToCreate.push({
                        project_id: projectId, attendance_id: attendanceId, date: dateStr,
                        effective_from: dateStr, effective_to: dateStr, is_friday_shift: isFriday,
                        is_single_shift: true, applicable_days: label,
                        am_start: weekShifts.day_start, am_end: '—', pm_start: '—', pm_end: weekShifts.day_end
                    });
                } else if (hasNightShift) {
                    // Only NIGHT times filled (2 times) → Single shift
                    const label = isFriday ? 'Ramadan Friday Night Shift' : 'Ramadan Night Shift';
                    shiftsToCreate.push({
                        project_id: projectId, attendance_id: attendanceId, date: dateStr,
                        effective_from: dateStr, effective_to: dateStr, is_friday_shift: isFriday,
                        is_single_shift: true, applicable_days: label,
                        am_start: weekShifts.night_start, am_end: '—', pm_start: '—', pm_end: weekShifts.night_end
                    });
                }
                // If no times are filled at all, skip this day for this employee
                
                // Rotate week AFTER Saturday (before Sunday)
                if (isSaturday) {
                    currentWeekIndex = (currentWeekIndex + 1) % 2;
                }
            }
        }

        // Bulk create with rate limit protection
        // SAFETY RULE: Batch size 10 with 300ms delay to maintain system stability
        let createdCount = 0;
        const batchSize = 10;
        for (let i = 0; i < shiftsToCreate.length; i += batchSize) {
            const batch = shiftsToCreate.slice(i, i + batchSize);
            let retries = 3;
            while (retries > 0) {
                try {
                    await base44.asServiceRole.entities.ShiftTiming.bulkCreate(batch);
                    createdCount += batch.length;
                    break;
                } catch (err) {
                    retries--;
                    if (retries === 0) throw err;
                    const delay = retries === 2 ? 2000 : 4000;
                    console.warn(`[applyRamadanShifts] Batch failed, retrying in ${delay/1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            console.log(`[applyRamadanShifts] Created ${createdCount}/${shiftsToCreate.length}`);
            if (i + batchSize < shiftsToCreate.length) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        return Response.json({
            success: true,
            isAlMaraghiAutomotive,
            shiftsCreated: createdCount,
            employeesProcessed: employees.length,
            dateRange: { from: startDateStr, to: endDateStr },
            message: `Applied ${createdCount} Ramadan shifts for ${employees.length} employees`
        });

    } catch (error) {
        console.error('Error applying Ramadan shifts:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});