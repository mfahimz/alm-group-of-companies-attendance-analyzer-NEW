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

        // ================================================================
        // 1. DATA PREPARATION (Bulk Fetching)
        // Consolidate all primary data fetching into bulk queries at the start.
        // This minimizes external API calls and ensures all context is available
        // in memory before entering the heavy processing and parallel write phases.
        // Logic Guard: Operations are strictly scoped to the Project's associated Company.
        // ================================================================
        
        // Initial wave: Fetch the project configuration and existing data linked to it
        const [project, schedule, allExceptions, existingShifts] = await Promise.all([
            base44.asServiceRole.entities.Project.filter({ id: projectId }).then(res => res[0]),
            base44.asServiceRole.entities.RamadanSchedule.filter({ id: ramadanScheduleId }).then(res => res[0]),
            base44.asServiceRole.entities.Exception.filter({ project_id: projectId }),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id: projectId })
        ]);

        // Logic Guard: Ensure the project has a valid company association to maintain scoping
        if (!project || !project.company) {
            return Response.json({ error: 'Project or associated company not found' }, { status: 404 });
        }

        // Secondary wave: Fetch context-dependent entities (Companies and Employees)
        // Strictly scoped to the project's company to prevent cross-tenant leaked data
        const [allCompanies, rawEmployees] = await Promise.all([
            base44.asServiceRole.entities.Company.filter({ name: project.company }),
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true })
        ]);

        // Audit check for Al Maraghi Automotive identity
        const isAlMaraghiAutomotive = allCompanies.some(c => c.company_id === 3);

        // Calculate date overlap
        const projectStart = new Date(project.date_from);
        const projectEnd = new Date(project.date_to);
        const ramadanStart = new Date(schedule.ramadan_start_date);
        const ramadanEnd = new Date(schedule.ramadan_end_date);
        const overlapStart = new Date(Math.max(projectStart.getTime(), ramadanStart.getTime()));
        const overlapEnd = new Date(Math.min(projectEnd.getTime(), ramadanEnd.getTime()));

        if (overlapStart > overlapEnd) {
            return Response.json({ success: true, shiftsCreated: 0, message: 'No overlap between project and Ramadan dates' });
        }

        const startDate = ramadanFrom ? new Date(ramadanFrom) : overlapStart;
        const endDate = ramadanTo ? new Date(ramadanTo) : overlapEnd;
        // Helper to get YYYY-MM-DD in local time (avoiding timezone shifts from toISOString)
        const toDateStr = (d) => {
            const date = new Date(d);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };

        const startDateStr = toDateStr(startDate);
        const endDateStr = toDateStr(endDate);

        // Parse week shifts and Friday shifts
        const week1Shifts = JSON.parse(schedule.week1_shifts || '{}');
        const week2Shifts = JSON.parse(schedule.week2_shifts || '{}');
        const fridayShifts = JSON.parse(schedule.friday_shifts || '{}');

        // Process employee selection logic in memory using fetched records
        let employees = rawEmployees;
        if (project.custom_employee_ids) {
            const employeeIds = project.custom_employee_ids.split(',').map(id => String(id).trim()).filter(Boolean);
            employees = rawEmployees.filter(e => {
                const hrmsStr = String(e.hrms_id).replace('.0', '').trim();
                return employeeIds.includes(hrmsStr);
            });
        }

        // ================================================================
        // 2. DELTA PROCESSING (Sync/Merge Logic)
        // Instead of wiping existing data, we identify existing Ramadan shift
        // records for the target employees and range. The "Sync" behavior 
        // ensures we only fill in missing records, maintaining merge integrity.
        // ================================================================
        const attendanceIds = employees.map(e => String(e.attendance_id));
        const existingRamadanShiftMap = new Set(
            existingShifts
                .filter(s => 
                    attendanceIds.includes(String(s.attendance_id)) &&
                    s.date >= startDateStr && s.date <= endDateStr &&
                    String(s.applicable_days || '').includes('Ramadan')
                )
                .map(s => `${s.attendance_id}_${s.date}`)
        );
        
        if (existingRamadanShiftMap.size > 0) {
            console.log(`[applyRamadanShifts] Found ${existingRamadanShiftMap.size} existing Ramadan shifts. Operation will proceed in Sync/Merge mode.`);
        }
        
        // Pre-process exceptions in memory to minimize calculations inside the 1,000-shift loop
        const daySwapExceptions = allExceptions.filter(e => 
            e.type === 'DAY_SWAP' && 
            e.approval_status === 'approved' &&
            e.use_in_analysis !== false
        ).map(ex => ({
            fromTime: new Date(ex.date_from).getTime(),
            toTime: new Date(ex.date_to).getTime(),
            attendanceId: String(ex.attendance_id)
        }));

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
            
            for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
                const dateStr = toDateStr(currentDate);
                const dayOfWeek = currentDate.getDay();
                const isSunday = dayOfWeek === 0;
                const isFriday = dayOfWeek === 5;

                // Sync the week rotation logic EXACTLY as it appears in the Ramadan Calendar
                const dDate = new Date(currentDate);
                const rStart = new Date(ramadanStart);
                const daysSinceStart = Math.floor((dDate.getTime() - rStart.getTime()) / (1000 * 60 * 60 * 24));
                const saturdaysPassed = Math.floor((daysSinceStart + (7 - rStart.getDay() + 6) % 7) / 7);
                const currentWeekIndex = saturdaysPassed % 2; // 0 = week1, 1 = week2

                // Delta Check: Ensure we don't duplicate existing records (Requirement 1 & 3)
                // If a record already exists for this day, skip it to act as a missing-record filler.
                const shiftKey = `${attendanceId}_${dateStr}`;
                if (existingRamadanShiftMap.has(shiftKey)) {
                    // console.log(`[applyRamadanShifts] Skipping existing record for ${attendanceId} on ${dateStr}`);
                    continue;
                }

                // Check for Day Swap exception using pre-processed memory lookup
                const currentMillis = currentDate.getTime();
                const hasDaySwap = daySwapExceptions.some(ex => {
                    const matchesEmployee = ex.attendanceId === 'ALL' || ex.attendanceId === attendanceId;
                    return matchesEmployee && currentMillis >= ex.fromTime && currentMillis <= ex.toTime;
                });

                if (hasDaySwap) {
                    // CONFLICT RESOLUTION: Priority goes to Swapped timing even during merge (Requirement 3). 
                    // By skipping, we allow the main attendance analysis to apply the Day Swap's exception details.
                    console.log(`[applyRamadanShifts] Skipping ${dateStr} for ${attendanceId} due to DAY_SWAP priority.`);
                    continue;
                }

                if (isSunday) {
                    continue; // Skip Sunday (weekly off)
                }

                const fridayShift = fridayShifts[attendanceId];
                const weekShifts = isFriday && fridayShift ? fridayShift : (currentWeekIndex === 0 ? week1 : week2);
                if (!weekShifts) {
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
                // ================================================================
                
                const hasDayTimes = isTimeFilled(weekShifts.day_start) && isTimeFilled(weekShifts.day_end);
                const hasNightTimes = isTimeFilled(weekShifts.night_start) && isTimeFilled(weekShifts.night_end);
                
                // Primary: TIME FIELDS are the absolute source of truth, ignoring active_shifts entirely
                const hasBothShifts = hasDayTimes && hasNightTimes;
                const hasDayShift = hasDayTimes && !hasBothShifts;
                const hasNightShift = hasNightTimes && !hasBothShifts;

                if (hasBothShifts) {
                    // FOUR time fields filled → Combined shift (is_single_shift=false)
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
            }
        }

        // ================================================================
        // 3. PARALLEL EXECUTION LOGIC (Write Phase)
        // Group the workload into batches of 10. Execute 5 of these batches
        // (50 records total) simultaneously using parallel promises.
        // This high-performance strategy ensures up to 1,000 shifts are 
        // processed efficiently while maintaining API rate limit safety.
        // ================================================================
        let createdCount = 0;
        const BATCH_SIZE = 10;
        const WAVE_SIZE = 50; // 5 batches of 10

        for (let i = 0; i < shiftsToCreate.length; i += WAVE_SIZE) {
            const wave = shiftsToCreate.slice(i, i + WAVE_SIZE);
            const waveBatches = [];
            for (let j = 0; j < wave.length; j += BATCH_SIZE) {
                waveBatches.push(wave.slice(j, j + BATCH_SIZE));
            }

            // Execute 5 batches (50 records total) simultaneously using parallel promises
            await Promise.all(waveBatches.map(async (batch) => {
                let retries = 3;
                while (retries > 0) {
                    try {
                        await base44.asServiceRole.entities.ShiftTiming.bulkCreate(batch);
                        createdCount += batch.length;
                        break;
                    } catch (err) {
                        retries--;
                        if (retries === 0) {
                            console.error(`[applyRamadanShifts] Final batch failure after retries:`, err);
                            throw err;
                        }
                        // Exponential backoff: 1s, 2s, 4s
                        const delay = 1000 * Math.pow(2, 3 - retries);
                        await new Promise(res => setTimeout(res, delay));
                    }
                }
            }));

            console.log(`[applyRamadanShifts] Created ${createdCount}/${shiftsToCreate.length} shifts...`);

            // Throttling: Mandatory 600ms delay after each 50-record wave (Requirement 2)
            // This delay respects platform write limits for high-throughput parallel operations.
            if (i + WAVE_SIZE < shiftsToCreate.length) {
                await new Promise(resolve => setTimeout(resolve, 600));
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