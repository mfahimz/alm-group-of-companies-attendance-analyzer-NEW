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
        // Al Maraghi Automotive uses S1/S2 format: active_shifts=['day'] or ['night'] 
        // but BOTH store times in day_start/day_end (night_start/night_end are empty)
        let isAlMaraghiAutomotive = false;
        try {
            const companies = await base44.asServiceRole.entities.Company.filter({ name: project.company });
            if (companies.length > 0 && companies[0].company_id === 3) {
                isAlMaraghiAutomotive = true;
            }
        } catch (e) {
            console.log('Could not determine company_id, proceeding with standard logic');
        }

        // Calculate date overlap: Ramadan shifts apply ONLY to overlap dates
        const projectStart = new Date(project.date_from);
        const projectEnd = new Date(project.date_to);
        const ramadanStart = new Date(schedule.ramadan_start_date);
        const ramadanEnd = new Date(schedule.ramadan_end_date);

        // Overlap dates
        const overlapStart = new Date(Math.max(projectStart, ramadanStart));
        const overlapEnd = new Date(Math.min(projectEnd, ramadanEnd));

        // If no overlap, nothing to do
        if (overlapStart > overlapEnd) {
            return Response.json({
                success: true,
                shiftsCreated: 0,
                message: 'No overlap between project and Ramadan dates'
            });
        }

        // Use provided ramadanFrom/ramadanTo if given, otherwise use calculated overlap
        const startDate = ramadanFrom ? new Date(ramadanFrom) : overlapStart;
        const endDate = ramadanTo ? new Date(ramadanTo) : overlapEnd;

        // Parse week shifts and Friday shifts
        const week1Shifts = JSON.parse(schedule.week1_shifts || '{}');
        const week2Shifts = JSON.parse(schedule.week2_shifts || '{}');
        const fridayShifts = JSON.parse(schedule.friday_shifts || '{}');

        // Get all employees for this project (respect custom employee selection)
        let employees;
        if (project.custom_employee_ids) {
            const employeeIds = project.custom_employee_ids
                .split(',')
                .map(id => String(id).trim())
                .filter(Boolean);

            employees = await base44.asServiceRole.entities.Employee.filter({
                company: project.company,
                active: true
            });
            // hrms_id can be stored as number (1568.0) or string - normalize both sides for comparison
            employees = employees.filter(e => {
                const hrmsStr = String(e.hrms_id).replace('.0', '').trim();
                return employeeIds.includes(hrmsStr);
            });
            console.log(`Custom employee filter: ${employeeIds.length} IDs requested, ${employees.length} matched`);
        } else {
            employees = await base44.asServiceRole.entities.Employee.filter({ 
                company: project.company,
                active: true 
            });
        }

        // Idempotency check: fetch existing Ramadan shifts for this project
        const existingShifts = await base44.asServiceRole.entities.ShiftTiming.filter({ 
            project_id: projectId 
        });
        // For idempotency, track attendance_id|date|shiftType to allow both day+night on same date
        const existingShiftMap = new Set();
        existingShifts.forEach(shift => {
            if (shift.applicable_days?.includes('Ramadan')) {
                existingShiftMap.add(`${shift.attendance_id}|${shift.date}|${shift.applicable_days}`);
            }
        });

        // Generate shift timings for Ramadan period
        const shiftsToCreate = [];
        const skippedDuplicates = [];
        const debugLog = [];

        for (const employee of employees) {
            const attendanceId = String(employee.attendance_id);
            const week1 = week1Shifts[attendanceId];
            const week2 = week2Shifts[attendanceId];

            if (!week1 && !week2) continue; // Skip if no Ramadan shifts configured

            let currentWeekIndex = 0; // Start with Week 1 (index 0)

            for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
                const dateStr = currentDate.toISOString().split('T')[0];
                
                const dayOfWeek = currentDate.getDay();
                const isSunday = dayOfWeek === 0;
                const isFriday = dayOfWeek === 5;
                
                // Sunday is weekly holiday - skip shift generation but toggle week pattern
                if (isSunday) {
                    currentWeekIndex = (currentWeekIndex + 1) % 2; // Toggle week after Sunday
                    continue;
                }

                // Check if Friday has specific shifts configured - prioritize Friday shifts
                const fridayShift = fridayShifts[attendanceId];
                const weekShifts = isFriday && fridayShift ? fridayShift : (currentWeekIndex === 0 ? week1 : week2);
                
                if (!weekShifts) continue;

                // Determine active shifts
                const activeShifts = weekShifts.active_shifts || [];

                if (isAlMaraghiAutomotive && !isFriday) {
                    // AL MARAGHI AUTOMOTIVE SPECIAL HANDLING (non-Friday)
                    // S1 (active_shifts=['day']) and S2 (active_shifts=['night']) both store times in day_start/day_end
                    // night_start/night_end are always empty for weekly shifts
                    if ((activeShifts.includes('day') || activeShifts.includes('night')) && weekShifts.day_start && weekShifts.day_end) {
                        const shiftLabel = activeShifts.includes('day') ? 'Ramadan S1 Shift' : 'Ramadan S2 Shift';
                        const shiftKey = `${attendanceId}|${dateStr}|${shiftLabel}`;
                        
                        if (existingShiftMap.has(shiftKey)) {
                            skippedDuplicates.push(shiftKey);
                            continue;
                        }

                        shiftsToCreate.push({
                            project_id: projectId,
                            attendance_id: attendanceId,
                            date: dateStr,
                            effective_from: dateStr,
                            effective_to: dateStr,
                            is_friday_shift: false,
                            is_single_shift: true,
                            applicable_days: shiftLabel,
                            am_start: weekShifts.day_start,
                            am_end: '—',
                            pm_start: '—',
                            pm_end: weekShifts.day_end
                        });
                    }
                } else {
                    // STANDARD LOGIC (all other companies, and Al Maraghi Friday shifts)
                    
                    // Create day shift if active
                    if (activeShifts.includes('day') && weekShifts.day_start && weekShifts.day_end) {
                        const label = isFriday ? 'Ramadan Friday Day Shift' : 'Ramadan Day Shift';
                        const shiftKey = `${attendanceId}|${dateStr}|${label}`;
                        
                        if (existingShiftMap.has(shiftKey)) {
                            skippedDuplicates.push(shiftKey);
                        } else {
                            shiftsToCreate.push({
                                project_id: projectId,
                                attendance_id: attendanceId,
                                date: dateStr,
                                effective_from: dateStr,
                                effective_to: dateStr,
                                is_friday_shift: isFriday,
                                is_single_shift: true,
                                applicable_days: label,
                                am_start: weekShifts.day_start,
                                am_end: '—',
                                pm_start: '—',
                                pm_end: weekShifts.day_end
                            });
                        }
                    }

                    // Create night shift if active
                    if (activeShifts.includes('night') && weekShifts.night_start && weekShifts.night_end) {
                        const label = isFriday ? 'Ramadan Friday Night Shift' : 'Ramadan Night Shift';
                        const shiftKey = `${attendanceId}|${dateStr}|${label}`;
                        
                        if (existingShiftMap.has(shiftKey)) {
                            skippedDuplicates.push(shiftKey);
                        } else {
                            shiftsToCreate.push({
                                project_id: projectId,
                                attendance_id: attendanceId,
                                date: dateStr,
                                effective_from: dateStr,
                                effective_to: dateStr,
                                is_friday_shift: isFriday,
                                is_single_shift: true,
                                applicable_days: label,
                                am_start: weekShifts.night_start,
                                am_end: '—',
                                pm_start: '—',
                                pm_end: weekShifts.night_end
                            });
                        }
                    }
                }
            }
        }

        // Bulk create shifts
        let createdCount = 0;
        if (shiftsToCreate.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < shiftsToCreate.length; i += batchSize) {
                const batch = shiftsToCreate.slice(i, i + batchSize);
                await base44.asServiceRole.entities.ShiftTiming.bulkCreate(batch);
                createdCount += batch.length;
            }
        }

        return Response.json({
            success: true,
            isAlMaraghiAutomotive,
            shiftsCreated: createdCount,
            skippedDuplicates: skippedDuplicates.length,
            employeesProcessed: employees.length,
            dateRange: {
                from: startDate.toISOString().split('T')[0],
                to: endDate.toISOString().split('T')[0]
            },
            message: `Applied Ramadan shifts for ${employees.length} employees (${createdCount} shifts created, ${skippedDuplicates.length} duplicates skipped)`
        });

    } catch (error) {
        console.error('Error applying Ramadan shifts:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});