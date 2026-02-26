import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId, ramadanScheduleId, ramadanFrom, ramadanTo, forceResync } = await req.json();

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

        // ================================================================
        // SMART SYNC STRATEGY:
        // Instead of delete-all + create-all (1300+ API calls),
        // we build a desired state, compare with existing, and only
        // create/update/delete what changed. Typical resync = ~50 calls.
        // ================================================================

        // Step 1: Build the DESIRED shifts map (key -> shift data)
        const desiredShifts = new Map(); // key: "attendanceId|date|label" -> shift data

        for (const employee of employees) {
            const attendanceId = String(employee.attendance_id);
            const week1 = week1Shifts[attendanceId];
            const week2 = week2Shifts[attendanceId];
            if (!week1 && !week2) continue;

            let currentWeekIndex = 0;
            for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getDay();
                const isSunday = dayOfWeek === 0;
                const isFriday = dayOfWeek === 5;

                if (isSunday) {
                    currentWeekIndex = (currentWeekIndex + 1) % 2;
                    continue;
                }

                const fridayShift = fridayShifts[attendanceId];
                const weekShifts = isFriday && fridayShift ? fridayShift : (currentWeekIndex === 0 ? week1 : week2);
                if (!weekShifts) continue;

                const activeShifts = weekShifts.active_shifts || [];

                if (isAlMaraghiAutomotive && !isFriday) {
                    if ((activeShifts.includes('day') || activeShifts.includes('night')) && weekShifts.day_start && weekShifts.day_end) {
                        const shiftLabel = activeShifts.includes('day') ? 'Ramadan S1 Shift' : 'Ramadan S2 Shift';
                        desiredShifts.set(`${attendanceId}|${dateStr}|${shiftLabel}`, {
                            project_id: projectId, attendance_id: attendanceId, date: dateStr,
                            effective_from: dateStr, effective_to: dateStr, is_friday_shift: false,
                            is_single_shift: true, applicable_days: shiftLabel,
                            am_start: weekShifts.day_start, am_end: '—', pm_start: '—', pm_end: weekShifts.day_end
                        });
                    }
                } else {
                    const hasDayShift = activeShifts.includes('day') && weekShifts.day_start && weekShifts.day_end;
                    const hasNightShift = activeShifts.includes('night') && weekShifts.night_start && weekShifts.night_end;
                    const hasBothShifts = hasDayShift && hasNightShift;

                    if (hasBothShifts) {
                        const label = isFriday ? 'Ramadan Friday Combined Shift' : 'Ramadan Combined Shift';
                        desiredShifts.set(`${attendanceId}|${dateStr}|${label}`, {
                            project_id: projectId, attendance_id: attendanceId, date: dateStr,
                            effective_from: dateStr, effective_to: dateStr, is_friday_shift: isFriday,
                            is_single_shift: false, applicable_days: label,
                            am_start: weekShifts.day_start, am_end: weekShifts.day_end,
                            pm_start: weekShifts.night_start, pm_end: weekShifts.night_end
                        });
                    } else {
                        if (hasDayShift) {
                            const label = isFriday ? 'Ramadan Friday Day Shift' : 'Ramadan Day Shift';
                            desiredShifts.set(`${attendanceId}|${dateStr}|${label}`, {
                                project_id: projectId, attendance_id: attendanceId, date: dateStr,
                                effective_from: dateStr, effective_to: dateStr, is_friday_shift: isFriday,
                                is_single_shift: true, applicable_days: label,
                                am_start: weekShifts.day_start, am_end: '—', pm_start: '—', pm_end: weekShifts.day_end
                            });
                        }
                        if (hasNightShift) {
                            const label = isFriday ? 'Ramadan Friday Night Shift' : 'Ramadan Night Shift';
                            desiredShifts.set(`${attendanceId}|${dateStr}|${label}`, {
                                project_id: projectId, attendance_id: attendanceId, date: dateStr,
                                effective_from: dateStr, effective_to: dateStr, is_friday_shift: isFriday,
                                is_single_shift: true, applicable_days: label,
                                am_start: weekShifts.night_start, am_end: '—', pm_start: '—', pm_end: weekShifts.night_end
                            });
                        }
                    }
                }
            }
        }

        console.log(`[applyRamadanShifts] Desired shifts: ${desiredShifts.size}`);

        // Step 2: Fetch existing Ramadan shifts for this project
        const existingShifts = await base44.asServiceRole.entities.ShiftTiming.filter({ project_id: projectId });
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const existingRamadanShifts = existingShifts.filter(s =>
            s.applicable_days?.includes('Ramadan') &&
            s.date >= startDateStr && s.date <= endDateStr
        );

        // Build existing map: key -> existing record
        const existingMap = new Map();
        for (const s of existingRamadanShifts) {
            const key = `${s.attendance_id}|${s.date}|${s.applicable_days}`;
            existingMap.set(key, s);
        }

        console.log(`[applyRamadanShifts] Existing Ramadan shifts: ${existingMap.size}`);

        // Step 3: Diff - determine creates, updates, deletes
        const toCreate = [];
        const toUpdate = []; // { id, data }
        const toDelete = [];

        // Check desired vs existing
        for (const [key, desired] of desiredShifts) {
            const existing = existingMap.get(key);
            if (!existing) {
                // New shift - needs creation
                toCreate.push(desired);
            } else {
                // Exists - check if times changed
                const changed = existing.am_start !== desired.am_start ||
                    existing.am_end !== desired.am_end ||
                    existing.pm_start !== desired.pm_start ||
                    existing.pm_end !== desired.pm_end ||
                    existing.is_single_shift !== desired.is_single_shift ||
                    existing.is_friday_shift !== desired.is_friday_shift;
                
                if (changed) {
                    toUpdate.push({
                        id: existing.id,
                        data: {
                            am_start: desired.am_start,
                            am_end: desired.am_end,
                            pm_start: desired.pm_start,
                            pm_end: desired.pm_end,
                            is_single_shift: desired.is_single_shift,
                            is_friday_shift: desired.is_friday_shift
                        }
                    });
                }
                // Remove from existing map so we know what's left over
                existingMap.delete(key);
            }
        }

        // Anything left in existingMap was not in desired = needs deletion
        // But ONLY if forceResync (otherwise we just skip them as potentially manually added)
        if (forceResync) {
            for (const [key, existing] of existingMap) {
                toDelete.push(existing.id);
            }
        }

        console.log(`[applyRamadanShifts] DIFF: ${toCreate.length} to create, ${toUpdate.length} to update, ${toDelete.length} to delete`);

        // Step 4: Execute changes with rate limit protection
        let createdCount = 0;
        let updatedCount = 0;
        let deletedCount = 0;

        // Helper for rate-limited batch operations
        const rateLimitedBatch = async (items, batchSize, operation) => {
            let count = 0;
            for (let i = 0; i < items.length; i += batchSize) {
                const batch = items.slice(i, i + batchSize);
                let retries = 3;
                while (retries > 0) {
                    try {
                        await operation(batch);
                        count += batch.length;
                        break;
                    } catch (err) {
                        retries--;
                        if (retries === 0) throw err;
                        const delay = retries === 2 ? 2000 : 4000;
                        console.warn(`[applyRamadanShifts] Batch failed (${err.message}), retrying in ${delay/1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
                if (i + batchSize < items.length) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
            return count;
        };

        // Creates (bulk)
        if (toCreate.length > 0) {
            createdCount = await rateLimitedBatch(toCreate, 25, async (batch) => {
                await base44.asServiceRole.entities.ShiftTiming.bulkCreate(batch);
            });
            console.log(`[applyRamadanShifts] Created ${createdCount} shifts`);
        }

        // Updates (individual, batched with Promise.all)
        if (toUpdate.length > 0) {
            updatedCount = await rateLimitedBatch(toUpdate, 10, async (batch) => {
                await Promise.all(batch.map(item =>
                    base44.asServiceRole.entities.ShiftTiming.update(item.id, item.data)
                ));
            });
            console.log(`[applyRamadanShifts] Updated ${updatedCount} shifts`);
        }

        // Deletes (only orphaned shifts during forceResync)
        if (toDelete.length > 0) {
            deletedCount = await rateLimitedBatch(toDelete, 10, async (batch) => {
                await Promise.all(batch.map(id =>
                    base44.asServiceRole.entities.ShiftTiming.delete(id)
                ));
            });
            console.log(`[applyRamadanShifts] Deleted ${deletedCount} orphaned shifts`);
        }

        return Response.json({
            success: true,
            isAlMaraghiAutomotive,
            shiftsCreated: createdCount,
            shiftsUpdated: updatedCount,
            shiftsDeleted: deletedCount,
            shiftsUnchanged: desiredShifts.size - createdCount - updatedCount,
            employeesProcessed: employees.length,
            dateRange: {
                from: startDateStr,
                to: endDateStr
            },
            message: `Synced Ramadan shifts: ${createdCount} created, ${updatedCount} updated, ${deletedCount} removed, ${desiredShifts.size - createdCount - updatedCount} unchanged`
        });

    } catch (error) {
        console.error('Error applying Ramadan shifts:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});