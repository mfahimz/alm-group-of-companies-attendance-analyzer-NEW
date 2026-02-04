import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PHASE 4: RUN CALENDAR ATTENDANCE AGGREGATION
 * 
 * Aggregates daily attendance into monthly summary for calendar-based payroll.
 * 
 * CRITICAL ISOLATION RULES:
 * - Does NOT call runAnalysis
 * - Does NOT read/write AnalysisResult
 * - Does NOT touch Project or ReportRun
 * - Reads: Punch, ShiftTiming, Exception (legacy), Employee, AttendanceRules
 * - Writes: AttendanceSummary ONLY
 * - Al Maraghi Motors ONLY
 * 
 * Status Flow:
 * CalendarMonth.status: OPEN → ATTENDANCE_LOCKED
 * Once locked, AttendanceSummary becomes immutable
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { calendar_month_id } = await req.json();

        if (!calendar_month_id) {
            return Response.json({ error: 'calendar_month_id is required' }, { status: 400 });
        }

        // ============================================================
        // FETCH CALENDAR MONTH
        // ============================================================
        const calendarMonths = await base44.asServiceRole.entities.CalendarMonth.filter({ 
            id: calendar_month_id 
        }, null, 1);

        if (calendarMonths.length === 0) {
            return Response.json({ error: 'CalendarMonth not found' }, { status: 404 });
        }

        const calendarMonth = calendarMonths[0];
        const company = calendarMonth.company;

        console.log('[runCalendarAttendanceAggregation] Processing:', {
            calendar_month_id,
            company,
            year: calendarMonth.year,
            month: calendarMonth.month,
            status: calendarMonth.status
        });

        // ============================================================
        // GUARD: Calendar dual-run enabled check
        // ============================================================
        const guardCheck = await base44.asServiceRole.functions.invoke('assertCalendarDualRunAllowed', {
            company: company
        });
        
        if (!guardCheck.allowed) {
            return Response.json({ 
                error: guardCheck.error
            }, { status: guardCheck.status || 403 });
        }

        // ============================================================
        // STATUS CHECK: Must be OPEN to run aggregation
        // ============================================================
        if (calendarMonth.status === 'ATTENDANCE_LOCKED' || calendarMonth.status === 'PAYROLL_FINALIZED') {
            return Response.json({ 
                error: `CalendarMonth is already ${calendarMonth.status.toLowerCase()}. Cannot re-run aggregation.`
            }, { status: 400 });
        }

        if (calendarMonth.status === 'MIRRORED') {
            return Response.json({ 
                error: 'CalendarMonth is MIRRORED from legacy data. Cannot run aggregation on mirrored records.'
            }, { status: 400 });
        }

        // ============================================================
        // FETCH REQUIRED DATA (NO PROJECT/REPORTRUN DEPENDENCY)
        // ============================================================
        const dateFrom = calendarMonth.start_date;
        const dateTo = calendarMonth.end_date;

        console.log('[runCalendarAttendanceAggregation] Date range:', dateFrom, 'to', dateTo);

        // CRITICAL: For calendar system, we need to find punch data that falls within this month
        // We use the legacy Punch entity but filter by date only (NO project_id filter)
        // This allows calendar system to work independently
        const [allPunches, allShifts, allExceptions, allEmployees, rulesData] = await Promise.all([
            base44.asServiceRole.entities.Punch.filter({}, null, 20000), // Get all punches, filter by date in code
            base44.asServiceRole.entities.ShiftTiming.filter({}, null, 20000), // Get all shifts
            base44.asServiceRole.entities.Exception.filter({}, null, 20000), // Get all exceptions
            base44.asServiceRole.entities.Employee.filter({ company: company, active: true }, null, 5000),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: company }, null, 1)
        ]);

        // Filter punches to date range
        const punches = allPunches.filter(p => 
            p.punch_date >= dateFrom && p.punch_date <= dateTo
        );

        // Filter shifts to this company's employees
        const employeeAttIds = allEmployees.map(e => String(e.attendance_id));
        const shifts = allShifts.filter(s => employeeAttIds.includes(String(s.attendance_id)));

        // Filter exceptions to date range
        const exceptions = allExceptions.filter(ex => {
            try {
                return ex.date_to >= dateFrom && ex.date_from <= dateTo &&
                       ex.use_in_analysis !== false &&
                       ex.is_custom_type !== true;
            } catch {
                return false;
            }
        });

        console.log('[runCalendarAttendanceAggregation] Data loaded:', {
            punches: punches.length,
            shifts: shifts.length,
            exceptions: exceptions.length,
            employees: allEmployees.length
        });

        // Parse rules
        let rules = null;
        if (rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                return Response.json({ error: 'Invalid rules configuration' }, { status: 400 });
            }
        }

        if (!rules) {
            return Response.json({ error: 'No attendance rules configured for this company' }, { status: 400 });
        }

        // ============================================================
        // ANALYSIS LOGIC (REUSED FROM runAnalysis.js - ISOLATED)
        // ============================================================
        const parseTime = (timeStr, includeSeconds = false) => {
            try {
                if (!timeStr || timeStr === '—' || timeStr === '-') return null;
                
                if (includeSeconds) {
                    let timeMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
                    if (timeMatch) {
                        let hours = parseInt(timeMatch[1]);
                        const minutes = parseInt(timeMatch[2]);
                        const seconds = parseInt(timeMatch[3]);
                        const period = timeMatch[4].toUpperCase();
                        if (period === 'PM' && hours !== 12) hours += 12;
                        if (period === 'AM' && hours === 12) hours = 0;
                        const date = new Date();
                        date.setHours(hours, minutes, seconds, 0);
                        return date;
                    }
                }
                
                let timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                if (timeMatch) {
                    let hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const period = timeMatch[3].toUpperCase();
                    if (period === 'PM' && hours !== 12) hours += 12;
                    if (period === 'AM' && hours === 12) hours = 0;
                    const date = new Date();
                    date.setHours(hours, minutes, 0, 0);
                    return date;
                }
                
                timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
                if (timeMatch) {
                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                    const date = new Date();
                    date.setHours(hours, minutes, seconds, 0);
                    return date;
                }
                
                return null;
            } catch {
                return null;
            }
        };

        const matchPunchesToShiftPoints = (dayPunches, shift, includeSeconds = false) => {
            if (!shift || dayPunches.length === 0) return [];
            
            const punchesWithTime = dayPunches.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw, includeSeconds)
            })).filter(p => p.time).sort((a, b) => a.time - b.time);
            
            if (punchesWithTime.length === 0) return [];
            
            const shiftPoints = [
                { type: 'AM_START', time: parseTime(shift.am_start) },
                { type: 'AM_END', time: parseTime(shift.am_end) },
                { type: 'PM_START', time: parseTime(shift.pm_start) },
                { type: 'PM_END', time: parseTime(shift.pm_end) }
            ].filter(sp => sp.time);
            
            const matches = [];
            const usedShiftPoints = new Set();
            
            for (const punch of punchesWithTime) {
                let closestMatch = null;
                let minDistance = Infinity;
                
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                    if (distance <= 60 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                    }
                }
                
                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;
                        const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                        if (distance <= 120 && distance < minDistance) {
                            minDistance = distance;
                            closestMatch = shiftPoint;
                        }
                    }
                }
                
                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;
                        const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                        if (distance <= 180 && distance < minDistance) {
                            minDistance = distance;
                            closestMatch = shiftPoint;
                        }
                    }
                }
                
                if (closestMatch) {
                    matches.push({ punch, matchedTo: closestMatch.type, shiftTime: closestMatch.time });
                    usedShiftPoints.add(closestMatch.type);
                }
            }
            
            return matches;
        };

        const filterMultiplePunches = (punchList, includeSeconds = false) => {
            if (punchList.length <= 1) return punchList;
            const punchesWithTime = punchList.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw, includeSeconds)
            })).filter(p => p.time);
            if (punchesWithTime.length === 0) return punchList;

            const deduped = [];
            for (const current of punchesWithTime) {
                const isDuplicate = deduped.some(p => Math.abs(current.time - p.time) / (1000 * 60) < 10);
                if (!isDuplicate) deduped.push(current);
            }
            return deduped.sort((a, b) => a.time - b.time);
        };

        // ============================================================
        // ANALYZE EACH EMPLOYEE (CALENDAR-BASED, NO PROJECT DEPENDENCY)
        // ============================================================
        const analyzeEmployee = (emp) => {
            const attendanceIdStr = String(emp.attendance_id);
            const employeePunches = punches.filter(p => String(p.attendance_id) === attendanceIdStr);
            const employeeShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
            const employeeExceptions = exceptions.filter(e => 
                (String(e.attendance_id) === 'ALL' || String(e.attendance_id) === attendanceIdStr)
            );

            const includeSeconds = company === 'Al Maraghi Automotive';
            const dayNameToNumber = {
                'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                'Thursday': 4, 'Friday': 5, 'Saturday': 6
            };

            let workingDays = 0;
            let presentDays = 0;
            let fullAbsenceCount = 0;
            let halfAbsenceCount = 0;
            let sickLeaveCount = 0;
            let lateMinutes = 0;
            let earlyCheckoutMinutes = 0;
            let otherMinutes = 0;
            let totalApprovedMinutes = 0;

            const startDate = new Date(dateFrom);
            const endDate = new Date(dateTo);

            // Calculate annual leave as CALENDAR DAYS
            const annualLeaveExceptions = employeeExceptions.filter(ex => ex.type === 'ANNUAL_LEAVE');
            const annualLeaveDatesProcessed = new Set();
            
            for (const alEx of annualLeaveExceptions) {
                try {
                    const exFrom = new Date(alEx.date_from);
                    const exTo = new Date(alEx.date_to);
                    const rangeStart = exFrom < startDate ? startDate : exFrom;
                    const rangeEnd = exTo > endDate ? endDate : exTo;
                    
                    if (rangeStart <= rangeEnd) {
                        for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
                            const dateStr = d.toISOString().split('T')[0];
                            annualLeaveDatesProcessed.add(dateStr);
                        }
                    }
                } catch {}
            }
            const annualLeaveCount = annualLeaveDatesProcessed.size;

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getUTCDay();

                // Check weekly off
                const weeklyOffDay = emp.weekly_off ? dayNameToNumber[emp.weekly_off] : 0;
                if (dayOfWeek === weeklyOffDay) continue;

                // Check exceptions
                const matchingExceptions = employeeExceptions.filter(ex => {
                    try {
                        return dateStr >= ex.date_from && dateStr <= ex.date_to;
                    } catch { return false; }
                });

                const hasPublicHoliday = matchingExceptions.some(ex => ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF');
                const hasManualAbsent = matchingExceptions.some(ex => ex.type === 'MANUAL_ABSENT');
                
                if (hasPublicHoliday) {
                    if (hasManualAbsent) fullAbsenceCount++;
                    continue;
                }

                workingDays++;

                const dateException = matchingExceptions.length > 0
                    ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                    : null;

                if (dateException) {
                    if (dateException.type === 'MANUAL_PRESENT') {
                        presentDays++;
                        continue;
                    } else if (dateException.type === 'MANUAL_ABSENT') {
                        fullAbsenceCount++;
                        continue;
                    } else if (dateException.type === 'MANUAL_HALF') {
                        presentDays++;
                        halfAbsenceCount++;
                        continue;
                    } else if (dateException.type === 'SICK_LEAVE') {
                        sickLeaveCount++;
                        continue;
                    }
                }

                const annualLeaveException = employeeExceptions.find(ex => {
                    try {
                        return ex.type === 'ANNUAL_LEAVE' && dateStr >= ex.date_from && dateStr <= ex.date_to;
                    } catch { return false; }
                });

                const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr);

                if (annualLeaveException && rawDayPunches.length === 0) {
                    workingDays--;
                    continue;
                }

                // Get shift
                const isShiftEffective = (s) => {
                    if (!s.effective_from || !s.effective_to) return true;
                    const from = new Date(s.effective_from);
                    const to = new Date(s.effective_to);
                    return currentDate >= from && currentDate <= to;
                };

                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const currentDayName = dayNames[dayOfWeek];

                let shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
                if (!shift) {
                    const applicableShifts = employeeShifts.filter(s => !s.date && isShiftEffective(s));
                    for (const s of applicableShifts) {
                        if (s.applicable_days) {
                            try {
                                const applicableDaysArray = JSON.parse(s.applicable_days);
                                if (Array.isArray(applicableDaysArray) && applicableDaysArray.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) {
                                    shift = s;
                                    break;
                                }
                            } catch {}
                        }
                    }
                    if (!shift) {
                        if (dayOfWeek === 5) {
                            shift = employeeShifts.find(s => s.is_friday_shift && !s.date && isShiftEffective(s)) ||
                                    employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                        } else {
                            shift = employeeShifts.find(s => !s.is_friday_shift && !s.date && isShiftEffective(s));
                        }
                    }
                }

                if (dateException && dateException.type === 'SHIFT_OVERRIDE') {
                    const isFriday = dayOfWeek === 5;
                    if (dateException.include_friday || !isFriday) {
                        shift = {
                            am_start: dateException.new_am_start,
                            am_end: dateException.new_am_end,
                            pm_start: dateException.new_pm_start,
                            pm_end: dateException.new_pm_end
                        };
                    }
                }

                const dayPunches = filterMultiplePunches(rawDayPunches, includeSeconds);

                // Track allowed minutes
                let approvedMinutesForDay = 0;
                if (dateException && dateException.type === 'ALLOWED_MINUTES' && 
                    dateException.approval_status === 'approved_dept_head') {
                    approvedMinutesForDay = dateException.allowed_minutes || 0;
                    totalApprovedMinutes += approvedMinutesForDay;
                }

                const hasManualTimeException = dateException && (
                    dateException.type === 'MANUAL_LATE' || 
                    dateException.type === 'MANUAL_EARLY_CHECKOUT' ||
                    (dateException.late_minutes > 0) ||
                    (dateException.early_checkout_minutes > 0) ||
                    (dateException.other_minutes > 0)
                );

                const shouldSkipTimeCalc = dateException && [
                    'SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'
                ].includes(dateException.type);

                // Count attendance
                if (dayPunches.length > 0) {
                    presentDays++;
                } else if (!dateException || !['MANUAL_LATE', 'MANUAL_EARLY_CHECKOUT'].includes(dateException.type)) {
                    fullAbsenceCount++;
                } else {
                    presentDays++;
                }

                // Calculate time issues
                if (hasManualTimeException && !shouldSkipTimeCalc) {
                    if (dateException.late_minutes > 0) lateMinutes += dateException.late_minutes;
                    if (dateException.early_checkout_minutes > 0) earlyCheckoutMinutes += dateException.early_checkout_minutes;
                    if (dateException.other_minutes > 0) otherMinutes += dateException.other_minutes;
                } else if (shift && dayPunches.length > 0 && !shouldSkipTimeCalc) {
                    const punchMatches = matchPunchesToShiftPoints(dayPunches, shift, includeSeconds);
                    
                    let dayLateMinutes = 0;
                    let dayEarlyMinutes = 0;
                    
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        const punchTime = match.punch.time;
                        const shiftTime = match.shiftTime;
                        
                        if ((match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') && punchTime > shiftTime) {
                            dayLateMinutes += Math.round((punchTime - shiftTime) / (1000 * 60));
                        }
                        if ((match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') && punchTime < shiftTime) {
                            dayEarlyMinutes += Math.round((shiftTime - punchTime) / (1000 * 60));
                        }
                    }
                    
                    // Apply approved minutes offset
                    if (approvedMinutesForDay > 0) {
                        const totalDayMinutes = dayLateMinutes + dayEarlyMinutes;
                        const excessMinutes = Math.max(0, totalDayMinutes - approvedMinutesForDay);
                        if (totalDayMinutes > 0 && excessMinutes > 0) {
                            const lateRatio = dayLateMinutes / totalDayMinutes;
                            const earlyRatio = dayEarlyMinutes / totalDayMinutes;
                            dayLateMinutes = Math.round(excessMinutes * lateRatio);
                            dayEarlyMinutes = Math.round(excessMinutes * earlyRatio);
                        } else {
                            dayLateMinutes = 0;
                            dayEarlyMinutes = 0;
                        }
                    }
                    
                    lateMinutes += dayLateMinutes;
                    earlyCheckoutMinutes += dayEarlyMinutes;
                }
            }

            // Get grace minutes
            const dept = emp.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
            const graceMinutes = baseGrace;

            // Calculate deductible minutes (SAME FORMULA AS LEGACY)
            const baseMinutes = lateMinutes + earlyCheckoutMinutes;
            const baseAfterGrace = baseMinutes > 0 ? Math.max(0, baseMinutes - graceMinutes) : 0;
            const deductibleMinutes = baseAfterGrace + otherMinutes - totalApprovedMinutes;

            return {
                attendance_id: attendanceIdStr,
                hrms_id: emp.hrms_id,
                name: emp.name,
                department: emp.department,
                working_days: workingDays,
                present_days: presentDays,
                full_absence_count: fullAbsenceCount,
                half_absence_count: halfAbsenceCount,
                sick_leave_count: sickLeaveCount,
                annual_leave_count: annualLeaveCount,
                late_minutes: lateMinutes,
                early_minutes: earlyCheckoutMinutes,
                other_minutes: otherMinutes,
                approved_minutes: totalApprovedMinutes,
                grace_minutes: graceMinutes,
                deductible_minutes: Math.max(0, deductibleMinutes)
            };
        };

        // ============================================================
        // PROCESS ALL EMPLOYEES
        // ============================================================
        console.log('[runCalendarAttendanceAggregation] Processing', allEmployees.length, 'employees...');
        const attendanceSummaryRecords = [];

        for (const emp of allEmployees) {
            const result = analyzeEmployee(emp);
            attendanceSummaryRecords.push({
                calendar_month_id: calendarMonth.id,
                company: company,
                legacy_analysis_result_id: null, // Not from legacy
                ...result,
                summary_created_at: new Date().toISOString(),
                is_locked: false // Will be locked when CalendarMonth.status → ATTENDANCE_LOCKED
            });
        }

        // ============================================================
        // INVARIANT CHECK: Employee count must match
        // ============================================================
        if (attendanceSummaryRecords.length !== allEmployees.length) {
            throw new Error(`INVARIANT VIOLATION: Expected ${allEmployees.length} attendance summaries, got ${attendanceSummaryRecords.length}`);
        }

        console.log('[runCalendarAttendanceAggregation] ✅ Invariant check passed:', attendanceSummaryRecords.length, 'records');

        // ============================================================
        // DELETE EXISTING SUMMARIES (IDEMPOTENT)
        // ============================================================
        const existingSummaries = await base44.asServiceRole.entities.AttendanceSummary.filter({ 
            calendar_month_id: calendarMonth.id 
        }, null, 5000);

        if (existingSummaries.length > 0) {
            console.log('[runCalendarAttendanceAggregation] Deleting', existingSummaries.length, 'existing summaries');
            await Promise.all(existingSummaries.map(s => base44.asServiceRole.entities.AttendanceSummary.delete(s.id)));
        }

        // ============================================================
        // SAVE ATTENDANCE SUMMARIES
        // ============================================================
        await base44.asServiceRole.entities.AttendanceSummary.bulkCreate(attendanceSummaryRecords);
        console.log('[runCalendarAttendanceAggregation] ✅ Created', attendanceSummaryRecords.length, 'AttendanceSummary records');

        // ============================================================
        // UPDATE CALENDAR MONTH STATUS
        // ============================================================
        await base44.asServiceRole.entities.CalendarMonth.update(calendarMonth.id, {
            status: 'attendance_locked',
            attendance_locked_at: new Date().toISOString(),
            attendance_locked_by: user.email
        });

        console.log('[runCalendarAttendanceAggregation] ✅ CalendarMonth locked');

        // ============================================================
        // AUDIT LOG
        // ============================================================
        await base44.asServiceRole.entities.AuditLog.create({
            action: 'CALENDAR_ATTENDANCE_AGGREGATION',
            entity_type: 'CalendarMonth',
            entity_id: calendarMonth.id,
            user_email: user.email,
            company: company,
            details: `Aggregated attendance for ${attendanceSummaryRecords.length} employees. Month: ${calendarMonth.year}-${String(calendarMonth.month).padStart(2, '0')}`
        });

        return Response.json({
            success: true,
            message: 'Calendar attendance aggregation complete',
            calendar_month_id: calendarMonth.id,
            attendance_summaries_created: attendanceSummaryRecords.length,
            status: 'attendance_locked'
        });

    } catch (error) {
        console.error('[runCalendarAttendanceAggregation] Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});