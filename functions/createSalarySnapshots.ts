import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * DATA ACCESS LAYER - EXPLICIT LIMITS ENFORCED
 * 
 * CRITICAL RULE: All .filter() calls MUST include explicit limit parameter.
 * Base44 SDK default limit causes silent data truncation.
 * 
 * Pattern: entitySDK.filter(filterObj, sortKey, EXPLICIT_LIMIT)
 * Example: Employee.filter({ active: true }, null, 5000)
 */

/**
 * CREATE SALARY SNAPSHOTS
 * 
 * CORE RULE: Every active employee MUST have a SalarySnapshot when a report is finalized.
 * Attendance quality does NOT decide salary inclusion.
 * 
 * Active Employee Definition:
 * - employee.company === project.company
 * - employee.active === true
 * - A valid EmployeeSalary record exists
 * 
 * Algorithm:
 * 1. Fetch ALL active employees for the project company with valid salary records
 * 2. For EACH employee:
 *    - Try to find AnalysisResult for the finalized report_run_id
 *    - If found → use attendance values, set attendance_source = "ANALYZED"
 *    - If NOT found → create ZERO-ATTENDANCE snapshot, set attendance_source = "NO_ATTENDANCE_DATA"
 * 
 * SALARY-ONLY EMPLOYEES:
 * - Employees without attendance_id (has_attendance_tracking=false) are supported
 * - They will have NO_ATTENDANCE_DATA status (no deductions from attendance)
 * - Only their base salary + allowances + manual adjustments are paid
 */

Deno.serve(async (req) => {
    try {
        console.log('[createSalarySnapshots] Function invoked');
        const base44 = createClientFromRequest(req);
        
        // Allow service role calls (from markFinalReport)
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (authError) {
            console.log('[createSalarySnapshots] No user auth, likely service role call');
        }

        const { project_id, report_run_id, batch_mode = false, batch_start = 0, batch_size = 10 } = await req.json();
        console.log('[createSalarySnapshots] Params:', { project_id, report_run_id });

        if (!project_id || !report_run_id) {
            return Response.json({ 
                error: 'project_id and report_run_id are required' 
            }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        
        // ============================================================
        // USE PROJECT-LEVEL DEFAULTS (Settings entity removed)
        // ============================================================
        const settings = null;
        
        // DIVISOR_LEAVE_DEDUCTION: Used for current month Leave Pay, Salary Leave Amount, Deductible Hours Pay
        let divisor = settings?.salary_divisor || project.salary_calculation_days || 30;
        if (!divisor || divisor <= 0) {
            console.warn('[createSalarySnapshots] Invalid salary_divisor from settings, using default 30');
            divisor = 30;
        }
        
        // DIVISOR_OT: Used for OT Hourly Rate, Previous Month LOP Days, Previous Month Deductible Minutes
        let otDivisor = settings?.ot_divisor || project.ot_calculation_days || divisor;
        if (!otDivisor || otDivisor <= 0) {
            console.warn('[createSalarySnapshots] Invalid ot_divisor from settings, using default divisor');
            otDivisor = divisor;
        }
        const isAlMaraghi = project.company === 'Al Maraghi Motors';
        
        // OT Rates from settings
        let otNormalRate = settings?.ot_normal_rate || 1.25;
        let otSpecialRate = settings?.ot_special_rate || 1.5;
        if (!otNormalRate || otNormalRate <= 0) {
            console.warn('[createSalarySnapshots] Invalid ot_normal_rate, using default 1.25');
            otNormalRate = 1.25;
        }
        if (!otSpecialRate || otSpecialRate <= 0) {
            console.warn('[createSalarySnapshots] Invalid ot_special_rate, using default 1.5');
            otSpecialRate = 1.5;
        }
        
        // WPS Cap settings
        const wpsCapEnabledGlobal = settings?.wps_cap_enabled ?? (isAlMaraghi ? true : false);
        const wpsCapAmountGlobal = settings?.wps_cap_amount ?? 4900;
        const balanceRoundingRule = settings?.balance_rounding_rule || 'EXACT';
        
        // Formula settings
        const leavePay Formula = settings?.leave_pay_formula || 'TOTAL_SALARY';
        const salaryLeaveFormula = settings?.salary_leave_formula || 'BASIC_PLUS_ALLOWANCES';
        const assumedPresentLastDays = settings?.assumed_present_last_days ?? (isAlMaraghi ? 2 : 0);
        
        console.log('[createSalarySnapshots] ============================================');
        console.log('[createSalarySnapshots] CALCULATION SETTINGS (from Project):');
        console.log('[createSalarySnapshots]   Salary Divisor:', divisor);
        console.log('[createSalarySnapshots]   OT Divisor:', otDivisor);
        console.log('[createSalarySnapshots]   WPS Cap Enabled:', wpsCapEnabledGlobal);
        console.log('[createSalarySnapshots]   Assumed Present Days:', assumedPresentLastDays);
        console.log('[createSalarySnapshots] ============================================');

        // ============================================================
        // UNIVERSAL IDEMPOTENCY CHECK (BATCH & NON-BATCH)
        // CRITICAL: Must run FIRST before ANY processing to prevent duplicates
        // Handles: double-clicks, network retries, concurrent requests, simultaneous batch starts
        // ============================================================
        const existingSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        }, null, 5000);

        if (existingSnapshots.length > 0) {
            console.log(`[createSalarySnapshots] 🛑 IDEMPOTENCY GATE: ${existingSnapshots.length} snapshots already exist for report_run_id ${report_run_id}`);
            console.log(`[createSalarySnapshots] ⚠️ Request type: ${batch_mode ? 'BATCH' : 'STANDARD'}, batch_start: ${batch_start}`);
            console.log(`[createSalarySnapshots] ✅ Returning existing count - NO duplicates created`);
            
            // Return appropriate response based on mode
            if (batch_mode) {
                // Batch mode: Return batch-style response indicating completion
                return Response.json({
                    success: true,
                    batch_mode: true,
                    batch_completed: 0,
                    total_employees: existingSnapshots.length,
                    current_position: existingSnapshots.length,
                    has_more: false,
                    message: `Snapshots already exist (${existingSnapshots.length} found). Idempotency gate prevented duplicates.`,
                    current_batch: []
                });
            } else {
                // Standard mode: Return standard response
                return Response.json({
                    success: true,
                    snapshots_created: 0,
                    existing_snapshots: existingSnapshots.length,
                    message: `Snapshots already exist for this report (${existingSnapshots.length} found). No duplicates created.`
                });
            }
        }
        
        console.log(`[createSalarySnapshots] ✅ IDEMPOTENCY GATE PASSED: No existing snapshots found - proceeding with creation`);
        console.log(`[createSalarySnapshots] Request mode: ${batch_mode ? 'BATCH' : 'STANDARD'}, batch_start: ${batch_start}, batch_size: ${batch_size}`);

        // ============================================================
        // AL MARAGHI MOTORS: Calculate salary month ranges
        // ============================================================
        let salaryMonthStartStr = null;
        let salaryMonthEndStr = null;
        let extraPrevMonthFrom = null;
        let extraPrevMonthTo = null;
        let hasExtraPrevMonthRange = false;

        // ============================================================
        // AL MARAGHI MOTORS: ASSUMED PRESENT DAYS (Last 2 days of month)
        // Per payroll rules, the last 2 days of the salary month are treated
        // as FULLY PRESENT for salary calculation only:
        // - No LOP days
        // - No late minutes  
        // - No early checkout minutes
        // - No other minutes
        // - No deductible minutes
        // This does NOT affect attendance data (runAnalysis.js).
        // Exception: If employee has ANNUAL_LEAVE on those days, honor the leave.
        // ============================================================
        let assumedPresentDays = [];
        
        if (isAlMaraghi) {
            const projectDateTo = new Date(project.date_to);
            const salaryMonthStart = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth(), 1);
            const salaryMonthEnd = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth() + 1, 0);
            
            salaryMonthStartStr = salaryMonthStart.toISOString().split('T')[0];
            salaryMonthEndStr = salaryMonthEnd.toISOString().split('T')[0];

            // Calculate assumed present days based on settings
            // assumedPresentLastDays = 2 means last 2 days, = 0 means none
            if (assumedPresentLastDays > 0) {
                for (let i = 0; i < assumedPresentLastDays; i++) {
                    const assumedDay = new Date(projectDateTo);
                    assumedDay.setDate(assumedDay.getDate() - i);
                    assumedPresentDays.push(assumedDay.toISOString().split('T')[0]);
                }
            }

            // Extra previous month range
            const projectDateFrom = new Date(project.date_from);
            const dayBeforeSalaryMonth = new Date(salaryMonthStart);
            dayBeforeSalaryMonth.setDate(dayBeforeSalaryMonth.getDate() - 1);

            if (projectDateFrom < salaryMonthStart) {
                extraPrevMonthFrom = project.date_from;
                extraPrevMonthTo = dayBeforeSalaryMonth.toISOString().split('T')[0];
                hasExtraPrevMonthRange = true;
            }

            console.log('[createSalarySnapshots] Al Maraghi salary month ranges:', {
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                extra_prev_month_from: extraPrevMonthFrom,
                extra_prev_month_to: extraPrevMonthTo,
                has_extra_range: hasExtraPrevMonthRange,
                assumed_present_days: assumedPresentDays
            });
        }



        // Verify report exists
        const reports = await base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id, project_id: project_id });
        if (reports.length === 0) {
            return Response.json({ error: 'Report not found for this project' }, { status: 404 });
        }
        const reportRun = reports[0];

        // Fetch core data
        // CRITICAL: .filter() has DEFAULT LIMIT of 50 - must specify higher limit or use list()
        const [employees, salaries, analysisResults, allExceptions, salaryIncrements, rulesData, punches, shifts, allOvertimeData] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }, null, 5000),
            base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true }, null, 5000),
            base44.asServiceRole.entities.AnalysisResult.filter({ 
                project_id: project_id,
                report_run_id: report_run_id
            }, null, 5000),
            base44.asServiceRole.entities.Exception.filter({ project_id: project_id }, null, 5000),
            isAlMaraghi 
                ? base44.asServiceRole.entities.SalaryIncrement.filter({ company: 'Al Maraghi Motors', active: true }, null, 5000)
                : Promise.resolve([]),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company }, null, 5000),
            base44.asServiceRole.entities.Punch.filter({ project_id: project_id }, null, 5000),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id: project_id }, null, 5000),
            base44.asServiceRole.entities.OvertimeData.filter({ project_id: project_id }, null, 5000)
        ]);

        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] EXECUTION TRACE START`);
        console.log(`[createSalarySnapshots] BATCH_MODE=${batch_mode}, BATCH_START=${batch_start}, BATCH_SIZE=${batch_size}`);
        console.log(`[createSalarySnapshots] RAW DATA FETCHED: ${employees.length} employees, ${salaries.length} salaries, ${analysisResults.length} analysis results, ${allOvertimeData.length} overtime records`);
        console.log(`[createSalarySnapshots] ============================================`);

        // Parse rules
        let rules = null;
        if (rulesData && rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                console.warn('[createSalarySnapshots] Failed to parse rules, using defaults');
            }
        }

        // Helper: Parse time string to Date object
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

        // Helper: Filter duplicate punches within 10 minutes
        const filterMultiplePunches = (punchList, includeSeconds) => {
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

        // Helper: Match punches to shift points
        const matchPunchesToShiftPoints = (dayPunches, shift, includeSeconds) => {
            if (!shift || dayPunches.length === 0) return [];
            
            const punchesWithTime = dayPunches.map(p => ({
                ...p,
                time: p.time || parseTime(p.timestamp_raw, includeSeconds)
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
                
                // Phase 1: Normal match (±60 min)
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                    if (distance <= 60 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                    }
                }
                
                // Phase 2: Extended match (±120 min)
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
                
                // Phase 3: Far extended match (±180 min)
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

        // RECALCULATE attendance for each employee (same logic as UI)
        // For Al Maraghi Motors: assumedPresentDays are treated as fully present for salary
        const recalculateEmployeeAttendance = (emp, dateFrom, dateTo, assumedDays = []) => {
            const attendanceIdStr = String(emp.attendance_id);
            const includeSeconds = project.company === 'Al Maraghi Automotive';
            
            const employeePunches = punches.filter(p => 
                String(p.attendance_id) === attendanceIdStr &&
                p.punch_date >= dateFrom && 
                p.punch_date <= dateTo
            );
            const employeeShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
            const employeeExceptions = allExceptions.filter(e => 
                (String(e.attendance_id) === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
                e.use_in_analysis !== false &&
                e.is_custom_type !== true
            );

            const dayNameToNumber = {
                'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                'Thursday': 4, 'Friday': 5, 'Saturday': 6
            };

            let workingDays = 0;
            let presentDays = 0;
            let fullAbsenceCount = 0;
            let halfAbsenceCount = 0;
            let sickLeaveCount = 0;
            let annualLeaveCount = 0;
            let lateMinutes = 0;
            let earlyCheckoutMinutes = 0;
            let otherMinutes = 0;
            let approvedMinutes = 0;

            const startDate = new Date(dateFrom);
            const endDate = new Date(dateTo);

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                // CRITICAL BUG FIX #6: Use getUTCDay() consistently for weekly off detection
                const dayOfWeek = currentDate.getUTCDay();

                // Check weekly off
                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (emp.weekly_off) {
                    weeklyOffDay = dayNameToNumber[emp.weekly_off];
                }
                
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue;
                }

                // ============================================================
                // AL MARAGHI MOTORS: ASSUMED PRESENT DAYS LOGIC
                // If this day is in assumedDays array, treat as fully present
                // UNLESS employee has ANNUAL_LEAVE on this day
                // CRITICAL FIX: Check if assumed day is employee's weekly off - if so, don't mark present
                // ============================================================
                const isAssumedPresentDay = assumedDays.includes(dateStr);
                
                if (isAssumedPresentDay) {
                    // Check if this assumed day is the employee's weekly off
                    // Each employee has their own weekly_off field
                    const assumedDayOfWeek = currentDate.getUTCDay();
                    const employeeWeeklyOff = emp.weekly_off ? dayNameToNumber[emp.weekly_off] : null;
                    
                    // If assumed day is employee's weekly off, skip it (don't mark as present)
                    if (employeeWeeklyOff !== null && assumedDayOfWeek === employeeWeeklyOff) {
                        console.log(`[createSalarySnapshots] ${emp.name}: Skipping assumed present day ${dateStr} - it's their weekly off (${emp.weekly_off})`);
                        continue; // Don't mark as present, it's their weekly off
                    }
                    
                    // Check if employee has annual leave on this assumed day
                    const hasAnnualLeaveOnAssumedDay = employeeExceptions.some(ex => {
                        if (ex.type !== 'ANNUAL_LEAVE') return false;
                        try {
                            return dateStr >= ex.date_from && dateStr <= ex.date_to;
                        } catch (e) {
                            console.warn(`[createSalarySnapshots] Invalid date format in ANNUAL_LEAVE exception for ${emp.name} (${ex.id}): ${e.message}`);
                            return false;
                        }
                    });
                    
                    if (!hasAnnualLeaveOnAssumedDay) {
                        // Assumed present: count as working day, present day, NO deductions
                        workingDays++;
                        presentDays++;
                        console.log(`[createSalarySnapshots] ${emp.name}: Assumed present on ${dateStr} (last 2 days of month)`);
                        // Skip all other processing for this day - no late/early/absence tracking
                        continue;
                    }
                    // If annual leave exists, fall through to normal processing
                }

                // Get ALL matching exceptions for this date BEFORE incrementing workingDays
                // This allows PUBLIC_HOLIDAY to completely skip the day
                // FIX Issue 3: Use date string comparison to avoid timezone issues
                const matchingExceptions = employeeExceptions.filter(ex => {
                    try {
                        return dateStr >= ex.date_from && dateStr <= ex.date_to;
                    } catch { return false; }
                });

                // Check for PUBLIC_HOLIDAY - day is NOT a working day
                const hasPublicHoliday = matchingExceptions.some(ex => 
                    ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF'
                );
                
                // Check for MANUAL_ABSENT on the same date (even if it's a public holiday)
                const hasManualAbsent = matchingExceptions.some(ex => ex.type === 'MANUAL_ABSENT');
                
                if (hasPublicHoliday) {
                    // PUBLIC_HOLIDAY: Day is NOT a working day
                    // BUT if there's also a MANUAL_ABSENT, count LOP without adding to working days
                    // This handles the case where employee was marked absent on a holiday
                    if (hasManualAbsent) {
                        fullAbsenceCount++;
                    }
                    // Skip rest of day processing - not a working day
                    continue;
                }

                // Now it's safe to count as a working day
                workingDays++;

                // Get the most recent exception (PUBLIC_HOLIDAY already handled above)
                const dateException = matchingExceptions.length > 0
                    ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                    : null;

                // Handle special exception types
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

                // Check for annual leave
                // FIX Issue 3: Use date string comparison to avoid timezone issues
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

                // Get shift for this day
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

                // Apply shift override from exception
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
                let allowedMinutesForDay = 0;
                if (dateException && dateException.type === 'ALLOWED_MINUTES' && 
                    dateException.approval_status === 'approved_dept_head') {
                    allowedMinutesForDay = dateException.allowed_minutes || 0;
                    approvedMinutes += allowedMinutesForDay;
                }

                // Check for manual time exception
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
                    
                    // BUG FIX #2: Use Math.abs on RESULT of time difference, not individual components
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        const punchTime = match.punch.time;
                        const shiftTime = match.shiftTime;
                        
                        if ((match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') && punchTime > shiftTime) {
                            dayLateMinutes += Math.round(Math.abs((punchTime - shiftTime) / (1000 * 60)));
                        }
                        if ((match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') && punchTime < shiftTime) {
                            dayEarlyMinutes += Math.round(Math.abs((shiftTime - punchTime) / (1000 * 60)));
                        }
                    }
                    
                    // Apply allowed minutes offset
                    if (allowedMinutesForDay > 0) {
                        const totalDayMinutes = dayLateMinutes + dayEarlyMinutes;
                        const excessMinutes = Math.max(0, totalDayMinutes - allowedMinutesForDay);
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
            const carriedGrace = project.use_carried_grace_minutes ? (emp.carried_grace_minutes || 0) : 0;
            const graceMinutes = baseGrace + carriedGrace;

            // Calculate annual leave as CALENDAR DAYS (not working days)
            const annualLeaveExceptions = employeeExceptions.filter(ex => ex.type === 'ANNUAL_LEAVE');
            const annualLeaveDatesProcessed = new Set();
            
            for (const alEx of annualLeaveExceptions) {
                try {
                    const exFrom = new Date(alEx.date_from);
                    const exTo = new Date(alEx.date_to);
                    
                    const rangeStart = exFrom < startDate ? new Date(startDate) : new Date(exFrom);
                    const rangeEnd = exTo > endDate ? new Date(endDate) : new Date(exTo);
                    
                    if (rangeStart <= rangeEnd) {
                        for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
                            const dateStr = d.toISOString().split('T')[0];
                            annualLeaveDatesProcessed.add(dateStr);
                        }
                    }
                } catch {
                    // Skip invalid date ranges
                }
            }
            const totalAnnualLeaveCalendarDays = annualLeaveDatesProcessed.size;

            return {
                workingDays,
                presentDays,
                fullAbsenceCount,
                halfAbsenceCount,
                sickLeaveCount,
                annualLeaveCount: totalAnnualLeaveCalendarDays,
                lateMinutes,
                earlyCheckoutMinutes,
                otherMinutes,
                approvedMinutes,
                graceMinutes
            };
        };

        // ============================================================
        // AL MARAGHI MOTORS: Calculate extra prev month deductible minutes
        // - Extra Deduct Min (PM): Sum of (late + early + other) for all days in prev month range
        // - Grace is applied ONCE for the whole range (not per day)
        // - Extra LOP Days (PM): Only check the LAST DAY of prev month (e.g., 31/12)
        // - Divisor: Uses OT Divisor (project.ot_calculation_days)
        // - IMPORTANT: Uses prevMonthSalaryAmount for calculations (historical salary)
        // 
        // PROJECT-SPECIFIC OVERRIDE: "January – Al Maraghi Motors"
        // For this project ONLY:
        //   - Previous month hours/deductible: 29/12/2025 → 31/12/2025
        //   - Previous month LOP days: ONLY 31/12/2025 counts
        //   - This is a one-time exception, NOT a global rule change
        // ============================================================
        const calculateExtraPrevMonthData = (emp, graceMinutes, prevMonthSalaryAmount, workingHours) => {
            if (!isAlMaraghi || !hasExtraPrevMonthRange) {
                return { extraDeductibleMinutes: 0, extraLopDays: 0, extraLopPay: 0, extraDeductibleHoursPay: 0, prevMonthDivisor: otDivisor };
            }

            const attendanceIdStr = String(emp.attendance_id);
            const includeSeconds = false; // Al Maraghi doesn't use seconds
            
            // ============================================================
            // PROJECT-SPECIFIC OVERRIDE: "January – Al Maraghi Motors"
            // Override previous month date range for this specific project
            // ============================================================
            // Check for both regular hyphen and en-dash variants of the project name
            const isJanuaryAlMaraghiProject = project.name === 'January - Al Maraghi Motors' || 
                                               project.name === 'January – Al Maraghi Motors';
            
            let effectivePrevMonthFrom = extraPrevMonthFrom;
            let effectivePrevMonthTo = extraPrevMonthTo;
            let effectiveLopOnlyDate = extraPrevMonthTo; // Default: last day of prev month range
            
            if (isJanuaryAlMaraghiProject) {
                // For "January – Al Maraghi Motors" ONLY:
                // - Previous month hours: 29/12/2025 → 31/12/2025
                // - Previous month LOP days: ONLY 31/12/2025
                effectivePrevMonthFrom = '2025-12-29';
                effectivePrevMonthTo = '2025-12-31';
                effectiveLopOnlyDate = '2025-12-31';
                
                console.log(`[createSalarySnapshots] PROJECT OVERRIDE: "January – Al Maraghi Motors" - Using prev month range 29-31 Dec, LOP only on 31 Dec`);
            }
            
            const employeePunches = punches.filter(p => 
                String(p.attendance_id) === attendanceIdStr &&
                p.punch_date >= effectivePrevMonthFrom && 
                p.punch_date <= effectivePrevMonthTo
            );
            const employeeShifts = shifts.filter(s => String(s.attendance_id) === attendanceIdStr);
            const employeeExceptions = allExceptions.filter(e => 
                (String(e.attendance_id) === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
                e.use_in_analysis !== false &&
                e.is_custom_type !== true
            );

            const dayNameToNumber = {
                'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
                'Thursday': 4, 'Friday': 5, 'Saturday': 6
            };

            // Accumulate raw time issues for the entire prev month range
            let totalLateMinutes = 0;
            let totalEarlyMinutes = 0;
            let totalOtherMinutes = 0;
            let totalApprovedMinutes = 0;
            
            // LOP: Only check the specific LOP day (last day of prev month range)
            let extraLopDays = 0;
            const lastDayOfPrevMonth = effectiveLopOnlyDate; // e.g., "2025-12-31"

            const startDate = new Date(effectivePrevMonthFrom);
            const endDate = new Date(effectivePrevMonthTo);

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getUTCDay();
                const isLastDayOfPrevMonth = (dateStr === lastDayOfPrevMonth);

                // Check weekly off
                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (emp.weekly_off) {
                    weeklyOffDay = dayNameToNumber[emp.weekly_off];
                }
                
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue;
                }

                // Check exceptions
                // FIX Issue 3: Use date string comparison to avoid timezone issues
                const matchingExceptions = employeeExceptions.filter(ex => {
                    try {
                        return dateStr >= ex.date_from && dateStr <= ex.date_to;
                    } catch { return false; }
                });

                const hasPublicHoliday = matchingExceptions.some(ex => 
                    ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF'
                );
                if (hasPublicHoliday) continue;

                const dateException = matchingExceptions.length > 0
                    ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                    : null;

                // Handle MANUAL_ABSENT - only count as LOP if it's the last day of prev month
                if (dateException && dateException.type === 'MANUAL_ABSENT') {
                    if (isLastDayOfPrevMonth) {
                        extraLopDays = 1;
                    }
                    continue;
                }

                if (dateException && [
                    'MANUAL_PRESENT', 'MANUAL_HALF', 'SICK_LEAVE', 'ANNUAL_LEAVE'
                ].includes(dateException.type)) {
                    continue;
                }

                // Get punches for this day
                const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr);
                
                // NO PUNCHES: Only count as LOP if it's the last day of prev month
                if (rawDayPunches.length === 0) {
                    if (isLastDayOfPrevMonth) {
                        extraLopDays = 1;
                    }
                    continue;
                }

                // Get shift for this day
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

                if (!shift) continue;

                const dayPunches = filterMultiplePunches(rawDayPunches, includeSeconds);

                // Track allowed/approved minutes for this day
                let allowedMinutesForDay = 0;
                if (dateException && dateException.type === 'ALLOWED_MINUTES' && 
                    dateException.approval_status === 'approved_dept_head') {
                    allowedMinutesForDay = dateException.allowed_minutes || 0;
                    totalApprovedMinutes += allowedMinutesForDay;
                }

                const hasManualTimeException = dateException && (
                    dateException.type === 'MANUAL_LATE' || 
                    dateException.type === 'MANUAL_EARLY_CHECKOUT' ||
                    (dateException.late_minutes > 0) ||
                    (dateException.early_checkout_minutes > 0) ||
                    (dateException.other_minutes > 0)
                );

                let dayLateMinutes = 0;
                let dayEarlyMinutes = 0;
                let dayOtherMinutes = 0;

                if (hasManualTimeException) {
                    if (dateException.late_minutes > 0) dayLateMinutes = dateException.late_minutes;
                    if (dateException.early_checkout_minutes > 0) dayEarlyMinutes = dateException.early_checkout_minutes;
                    if (dateException.other_minutes > 0) dayOtherMinutes = dateException.other_minutes;
                } else if (dayPunches.length > 0) {
                    const punchMatches = matchPunchesToShiftPoints(dayPunches, shift, includeSeconds);
                    
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        const punchTime = match.punch.time;
                        const shiftTime = match.shiftTime;
                        
                        if ((match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') && punchTime > shiftTime) {
                            dayLateMinutes += Math.round(Math.abs((punchTime - shiftTime) / (1000 * 60)));
                        }
                        if ((match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') && punchTime < shiftTime) {
                            dayEarlyMinutes += Math.round(Math.abs((shiftTime - punchTime) / (1000 * 60)));
                        }
                    }
                }

                // Accumulate raw time issues (no grace applied per day)
                totalLateMinutes += dayLateMinutes;
                totalEarlyMinutes += dayEarlyMinutes;
                totalOtherMinutes += dayOtherMinutes;
            }

            // Calculate deductible minutes for the ENTIRE prev month range
            // Grace is applied ONCE for the whole range (not per day)
            // Formula: max(0, totalLate + totalEarly + totalOther - grace - approved)
            const totalExtraDeductibleMinutes = Math.max(0, 
                totalLateMinutes + totalEarlyMinutes + totalOtherMinutes - graceMinutes - totalApprovedMinutes
            );

            // Calculate previous month monetary values using OT Divisor
            // Divisor = project.ot_calculation_days (NOT calendar days)
            // IMPORTANT: Uses prevMonthSalaryAmount (historical salary for that month)
            const prevMonthDivisor = otDivisor;

            // Previous month LOP Pay = (Prev Month Total Salary / OT Divisor) * Extra LOP Days
            const extraLopPay = extraLopDays > 0 ? (prevMonthSalaryAmount / prevMonthDivisor) * extraLopDays : 0;

            // Previous month Deductible Hours Pay = (Prev Month Total Salary / OT Divisor / Working Hours) * (Extra Deductible Minutes / 60)
            const extraDeductibleHours = totalExtraDeductibleMinutes / 60;
            const prevMonthHourlyRate = prevMonthSalaryAmount / prevMonthDivisor / workingHours;
            const extraDeductibleHoursPay = prevMonthHourlyRate * extraDeductibleHours;

            return {
                extraDeductibleMinutes: totalExtraDeductibleMinutes,
                extraLopDays: extraLopDays,
                extraLopPay: Math.round(extraLopPay),
                extraDeductibleHoursPay: Math.round(extraDeductibleHoursPay),
                prevMonthDivisor: prevMonthDivisor
            };
        };

        // ============================================================
        // NEW LOGIC: Create salary snapshots for ALL active employees
        // ============================================================
        const snapshots = [];
        let analyzedCount = 0;
        let noAttendanceCount = 0;
        
        // ============================================================
        // COMPANY-SPECIFIC CONFIGURATION: Include All Employees in Salary
        // ============================================================
        // Fetch company settings to determine salary inclusion rules
        const companySettings = await base44.asServiceRole.entities.CompanySettings.filter({
            company: project.company
        }, null, 1);
        
        const includeAllEmployeesInSalary = companySettings.length > 0 
            ? (companySettings[0].include_all_employees_in_salary || false)
            : false;
        
        // Al Maraghi Motors & Naser Mohsin: Hardcoded to include all employees (until migrated to settings)
        const isAlMaraghiOrNaser = project.company === 'Al Maraghi Motors' || 
                                    project.company === 'Naser Mohsin Auto Parts';
        
        const shouldIncludeAllEmployees = isAlMaraghiOrNaser || includeAllEmployeesInSalary;
        
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] COMPANY SALARY MODE: ${project.company}`);
        console.log(`[createSalarySnapshots]   Include All Employees in Salary: ${shouldIncludeAllEmployees ? 'YES (including non-attendance)' : 'NO (attendance_id required)'}`);
        console.log(`[createSalarySnapshots]   Config Source: ${isAlMaraghiOrNaser ? 'HARDCODED' : companySettings.length > 0 ? 'CompanySettings' : 'DEFAULT (false)'}`);
        console.log(`[createSalarySnapshots] ============================================`);
        
        // Filter employees to project's custom_employee_ids if specified
        let eligibleEmployees;
        
        if (project.custom_employee_ids && project.custom_employee_ids.trim()) {
            const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id);
            
            if (shouldIncludeAllEmployees) {
                // Al Maraghi / Include All Mode: ALL employees in custom list, regardless of attendance_id
                eligibleEmployees = employees.filter(emp => {
                    return customIds.includes(String(emp.hrms_id)) || 
                           (emp.attendance_id && customIds.includes(String(emp.attendance_id)));
                });
                console.log(`[createSalarySnapshots] [INCLUDE ALL MODE] Filtered to ${eligibleEmployees.length} employees from custom_employee_ids (including non-attendance)`);
            } else {
                // Standard Mode: ONLY employees with valid attendance_id
                eligibleEmployees = employees.filter(emp => {
                    const hasValidAttendanceId = emp.attendance_id && 
                                                  emp.attendance_id !== null && 
                                                  emp.attendance_id !== undefined &&
                                                  String(emp.attendance_id).trim() !== '';
                    
                    if (!hasValidAttendanceId) {
                        return false;
                    }
                    
                    return customIds.includes(String(emp.hrms_id)) || 
                           customIds.includes(String(emp.attendance_id));
                });
                console.log(`[createSalarySnapshots] [STANDARD MODE] Filtered to ${eligibleEmployees.length} employees with attendance_id from custom_employee_ids`);
            }
        } else {
            // No custom_employee_ids - use ALL active employees
            if (shouldIncludeAllEmployees) {
                eligibleEmployees = employees;  // All active employees
                console.log(`[createSalarySnapshots] [INCLUDE ALL MODE] Including ALL ${eligibleEmployees.length} active employees`);
            } else {
                eligibleEmployees = employees.filter(emp => {
                    const hasValidAttendanceId = emp.attendance_id && 
                                                  emp.attendance_id !== null && 
                                                  emp.attendance_id !== undefined &&
                                                  String(emp.attendance_id).trim() !== '';
                    return hasValidAttendanceId;
                });
                console.log(`[createSalarySnapshots] [STANDARD MODE] Filtered to ${eligibleEmployees.length} employees with attendance_id`);
            }
        }
        
        // Calculate statistics for logging transparency
        const withAttendanceId = eligibleEmployees.filter(e => e.attendance_id && String(e.attendance_id).trim() !== '').length;
        const withoutAttendanceId = eligibleEmployees.length - withAttendanceId;
        
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] ✅ TOTAL ELIGIBLE EMPLOYEES: ${eligibleEmployees.length}`);
        console.log(`[createSalarySnapshots]    - With attendance_id: ${withAttendanceId}`);
        console.log(`[createSalarySnapshots]    - Without attendance_id: ${withoutAttendanceId}`);
        console.log(`[createSalarySnapshots] ELIGIBLE EMPLOYEE IDs: [${eligibleEmployees.map(e => e.attendance_id || e.hrms_id).slice(0, 20).join(', ')}${eligibleEmployees.length > 20 ? '...' : ''}]`);
        console.log(`[createSalarySnapshots] ============================================`);
        
        // BATCH MODE: Process only a subset of employees
        const employeesToProcess = batch_mode 
            ? eligibleEmployees.slice(batch_start, batch_start + batch_size)
            : eligibleEmployees;
        
        console.log(`[createSalarySnapshots] 📦 THIS BATCH: ${employeesToProcess.length} employees (indices ${batch_start} to ${batch_start + employeesToProcess.length - 1})`);
        console.log(`[createSalarySnapshots] THIS BATCH IDs: [${employeesToProcess.map(e => e.attendance_id || e.hrms_id).join(', ')}]`);
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] 🔄 ENTERING FOR LOOP - Processing ${employeesToProcess.length} employees`);
        console.log(`[createSalarySnapshots] ============================================`);
        
        let loopIterationCount = 0;
        for (const emp of employeesToProcess) {
            loopIterationCount++;
            console.log(`[createSalarySnapshots] >>> LOOP ITERATION ${loopIterationCount}/${employeesToProcess.length}: Processing ${emp.name} (attendance_id: ${emp.attendance_id || 'NULL'}, hrms_id: ${emp.hrms_id})`);
            // Find matching salary record (REQUIRED for salary snapshot)
            const baseSalary = salaries.find(s => 
                String(s.employee_id) === String(emp.hrms_id) || 
                String(s.attendance_id) === String(emp.attendance_id)
            );
            
            // Skip if no salary record - employee is not eligible for salary
            if (!baseSalary) {
                console.log(`[createSalarySnapshots] ⚠️ SKIP: ${emp.name} (${emp.attendance_id || emp.hrms_id}) - no salary record found`);
                console.log(`[createSalarySnapshots] >>> LOOP ITERATION ${loopIterationCount} COMPLETE (skipped - no salary)`);
                continue;
            }
            
            console.log(`[createSalarySnapshots] ✅ Salary record found for ${emp.name}`);
            console.log(`[createSalarySnapshots] 💰 Salary Data: basic_salary=${baseSalary.basic_salary}, allowances=${baseSalary.allowances}, allowances_with_bonus=${baseSalary.allowances_with_bonus}, total_salary=${baseSalary.total_salary}`);
            
            // ============================================================
            // AL MARAGHI MOTORS: SALARY INCREMENT RESOLUTION
            // For current month salary: use increment effective for salary month
            // For previous month calculations: use increment effective for that month
            // ============================================================
            let currentMonthSalary = { ...baseSalary };
            let prevMonthSalary = { ...baseSalary };
            
            if (isAlMaraghi && salaryIncrements.length > 0) {
                // Get increments for this employee
                const empIncrements = salaryIncrements.filter(inc => 
                    String(inc.employee_id) === String(emp.hrms_id) ||
                    String(inc.attendance_id) === String(emp.attendance_id)
                );
                
                if (empIncrements.length > 0) {
                    // Current month salary (use salary month start for resolution)
                    const currentMonthStr = salaryMonthStartStr; // e.g., "2026-01-01"
                    // BUG FIX #8: Proper date parsing with error handling
                    const applicableCurrentIncrements = empIncrements
                        .filter(inc => {
                            try {
                                return new Date(inc.effective_month) <= new Date(currentMonthStr);
                            } catch (e) {
                                console.warn(`[createSalarySnapshots] Invalid date format in salary increment effective_month for ${emp.name} (${inc.id}): ${e.message}`);
                                return false;
                            }
                        })
                        .sort((a, b) => new Date(b.effective_month) - new Date(a.effective_month));
                    
                    if (applicableCurrentIncrements.length > 0) {
                        const currentInc = applicableCurrentIncrements[0];
                        currentMonthSalary = {
                            ...baseSalary,
                            basic_salary: currentInc.new_basic_salary || baseSalary.basic_salary,
                            allowances: currentInc.new_allowances || baseSalary.allowances,
                            allowances_with_bonus: currentInc.new_allowances_with_bonus || baseSalary.allowances_with_bonus,
                            total_salary: currentInc.new_total_salary || baseSalary.total_salary
                        };
                        console.log(`[createSalarySnapshots] ${emp.name}: Using increment effective ${currentInc.effective_month} for current month salary`);
                    }
                    
                    // Previous month salary (for OT and prev month deductions)
                    // Previous month is the month BEFORE the salary month
                    if (hasExtraPrevMonthRange && extraPrevMonthFrom) {
                        const prevMonthDate = new Date(extraPrevMonthFrom);
                        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
                        
                        // BUG FIX #8: Proper date parsing with error handling
                        const applicablePrevIncrements = empIncrements
                            .filter(inc => {
                                try {
                                    return new Date(inc.effective_month) <= new Date(prevMonthStr);
                                } catch (e) {
                                    console.warn(`[createSalarySnapshots] Invalid date format in salary increment effective_month for ${emp.name} (prev month, ${inc.id}): ${e.message}`);
                                    return false;
                                }
                            })
                            .sort((a, b) => new Date(b.effective_month) - new Date(a.effective_month));
                        
                        if (applicablePrevIncrements.length > 0) {
                            const prevInc = applicablePrevIncrements[0];
                            prevMonthSalary = {
                                ...baseSalary,
                                basic_salary: prevInc.new_basic_salary || baseSalary.basic_salary,
                                allowances: prevInc.new_allowances || baseSalary.allowances,
                                allowances_with_bonus: prevInc.new_allowances_with_bonus || baseSalary.allowances_with_bonus,
                                total_salary: prevInc.new_total_salary || baseSalary.total_salary
                            };
                            console.log(`[createSalarySnapshots] ${emp.name}: Using increment effective ${prevInc.effective_month} for previous month salary`);
                        }
                    }
                }
            }
            
            // Use resolved salaries (currentMonthSalary for current month, prevMonthSalary for previous month)
            const salary = currentMonthSalary;

            // Check if employee has analysis result
            // SALARY-ONLY FIX: For employees without attendance_id, they won't have AnalysisResult
            const analysisResult = emp.attendance_id 
                ? analysisResults.find(r => String(r.attendance_id) === String(emp.attendance_id))
                : null;
            const hasAnalysisResult = !!analysisResult;
            
            let calculated;
            let attendanceSource;
            
            // PERMANENT LOCK: For finalized reports, use AnalysisResult values AS-IS (1:1 copy)
            // CRITICAL: Check manual override fields FIRST, fallback to regular fields
            // Manual overrides are set when user edits report before finalization
            // deductible_minutes formula in runAnalysis: ((late + early) - grace) + other - approved
            if (hasAnalysisResult) {
                calculated = {
                    workingDays: analysisResult.working_days || 0,
                    presentDays: analysisResult.manual_present_days ?? analysisResult.present_days ?? 0,
                    fullAbsenceCount: analysisResult.manual_full_absence_count ?? analysisResult.full_absence_count ?? 0,
                    halfAbsenceCount: analysisResult.half_absence_count || 0,
                    sickLeaveCount: analysisResult.manual_sick_leave_count ?? analysisResult.sick_leave_count ?? 0,
                    annualLeaveCount: analysisResult.manual_annual_leave_count ?? analysisResult.annual_leave_count ?? 0,
                    lateMinutes: analysisResult.late_minutes || 0,
                    earlyCheckoutMinutes: analysisResult.early_checkout_minutes || 0,
                    otherMinutes: analysisResult.other_minutes || 0,
                    approvedMinutes: analysisResult.approved_minutes || 0,
                    deductibleMinutes: analysisResult.manual_deductible_minutes ?? analysisResult.deductible_minutes ?? 0,
                    graceMinutes: analysisResult.grace_minutes ?? 15
                };
                attendanceSource = 'ANALYZED';
                analyzedCount++;
                console.log(`[createSalarySnapshots] 1:1 copy from AnalysisResult for ${emp.name} (${emp.attendance_id}): deductible=${calculated.deductibleMinutes}, fullAbsence=${calculated.fullAbsenceCount} (manual override: ${analysisResult.manual_full_absence_count !== null ? 'YES' : 'NO'})`);
            } else {
                // NO_ATTENDANCE_DATA: Employee missing from analysis OR salary-only employee
                // Use zero attendance for salary safety
                calculated = {
                    workingDays: 0,
                    presentDays: 0,
                    fullAbsenceCount: 0,
                    halfAbsenceCount: 0,
                    sickLeaveCount: 0,
                    annualLeaveCount: 0,
                    lateMinutes: 0,
                    earlyCheckoutMinutes: 0,
                    otherMinutes: 0,
                    approvedMinutes: 0,
                    deductibleMinutes: 0,
                    graceMinutes: 0
                };
                attendanceSource = 'NO_ATTENDANCE_DATA';
                noAttendanceCount++;
                console.log(`[createSalarySnapshots] No AnalysisResult for ${emp.name} (${emp.attendance_id || emp.hrms_id}) - using zero attendance (salary-only)`);
            }

            // ============================================================
            // SALARY COMPONENTS (3 separate entities)
            // ============================================================
            // COMPONENT 1: Basic Salary (base pay)
            const basicSalary = salary?.basic_salary || 0;
            
            // COMPONENT 2: Allowances WITHOUT bonus (used for salary leave amount)
            // CRITICAL: This is "allowances" field, NOT "allowances_with_bonus"
            const allowancesAmount = Number(salary?.allowances) || 0;
            
            // COMPONENT 3: Allowances WITH bonus (stored but not used in calculations here)
            // const allowancesWithBonus = Number(salary?.allowances_with_bonus) || 0;
            
            // Total Salary = Component 1 + Component 2 + Component 3
            const totalSalaryAmount = salary?.total_salary || 0;
            const workingHours = salary?.working_hours || baseSalary?.working_hours || 9;
            
            // Previous month salary values (for OT and prev month deductions)
            const prevMonthTotalSalary = prevMonthSalary?.total_salary || totalSalaryAmount;
            
            // BUG FIX #9: Only calculate extraPrevMonthData if Al Maraghi AND extra range exists
            let extraPrevMonthData = {
                extraDeductibleMinutes: 0,
                extraLopDays: 0,
                extraLopPay: 0,
                extraDeductibleHoursPay: 0,
                prevMonthDivisor: otDivisor
            };
            if (isAlMaraghi && hasExtraPrevMonthRange && emp.attendance_id) {
                extraPrevMonthData = calculateExtraPrevMonthData(emp, calculated.graceMinutes, prevMonthTotalSalary, workingHours);
            }

            // Salary leave days always equals finalized annual leave count
            // No exception overrides - use the value from finalized AnalysisResult
            let salaryLeaveDays = calculated.annualLeaveCount;

            // Calculate derived salary values - ALL rounded to 2 decimal places
            const leaveDays = calculated.annualLeaveCount + calculated.fullAbsenceCount;
            
            // Leave Pay Formula (configurable)
            const leavePayBase = leavePayFormula === 'BASIC_PLUS_ALLOWANCES' 
                ? (basicSalary + allowancesAmount)
                : totalSalaryAmount;
            const leavePay = Math.round((leaveDays > 0 ? (leavePayBase / divisor) * leaveDays : 0) * 100) / 100;
            
            // Salary Leave Amount Formula (configurable)
            const salaryLeaveBase = salaryLeaveFormula === 'BASIC_PLUS_ALLOWANCES' 
                ? (basicSalary + allowancesAmount)
                : totalSalaryAmount;
            const salaryLeaveAmount = Math.round((salaryLeaveDays > 0 ? (salaryLeaveBase / divisor) * salaryLeaveDays : 0) * 100) / 100;
            
            console.log(`[createSalarySnapshots] 💡 SALARY LEAVE CALCULATION for ${emp.name}:`);
            console.log(`[createSalarySnapshots]    Formula: ${salaryLeaveFormula}`);
            console.log(`[createSalarySnapshots]    basicSalary = ${basicSalary}`);
            console.log(`[createSalarySnapshots]    allowancesAmount = ${allowancesAmount}`);
            console.log(`[createSalarySnapshots]    salaryLeaveBase = ${salaryLeaveBase}`);
            console.log(`[createSalarySnapshots]    divisor = ${divisor}`);
            console.log(`[createSalarySnapshots]    salaryLeaveDays = ${salaryLeaveDays}`);
            console.log(`[createSalarySnapshots]    salaryLeaveAmount = ${salaryLeaveAmount}`);
            
            const netDeduction = Math.round(Math.max(0, leavePay - salaryLeaveAmount) * 100) / 100;

            // Use finalized deductible_minutes from AnalysisResult
            const deductibleMinutes = calculated.deductibleMinutes;
            const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;
            
            // Current month hourly rate uses salary divisor (2 decimals)
            const hourlyRate = Math.round((totalSalaryAmount / divisor / workingHours) * 100) / 100;
            
            // Current month deductible hours pay (2 decimals)
            const currentMonthDeductibleHoursPay = Math.round((hourlyRate * deductibleHours) * 100) / 100;
            
            // ============================================================
            // DISABLED: Previous month deduction logic
            // Previous month deductions have been removed from Al Maraghi Motors
            // to eliminate hidden deductions from salary totals.
            // All deductions are now visible in the current month report.
            // ============================================================
            const extraPrevMonthDeductibleMinutes = 0;
            const extraPrevMonthLopDays = 0;
            const extraPrevMonthLopPay = 0;
            const extraPrevMonthDeductibleHoursPay = 0;
            
            // Total deductible hours pay = current month only (no prev month)
            const totalDeductibleHoursPay = currentMonthDeductibleHoursPay;
            
            // Final total calculation (NO previous month deductions)
            // Current month: netDeduction (leave) + currentMonthDeductibleHoursPay (time)
            // ALWAYS round to 2 decimals, then apply whole number rounding for balance
            let finalTotal = Math.round((totalSalaryAmount - netDeduction - currentMonthDeductibleHoursPay) * 100) / 100;

            // ============================================================
            // WPS SPLIT LOGIC (Al Maraghi Motors only)
            // ============================================================
            // WPS split is applied AFTER final total is computed
            // Uses wps_cap_enabled and wps_cap_amount from EmployeeSalary
            // Balance must always be a multiple of 100 (round down)
            // ============================================================
            let wpsAmount = finalTotal;
            let balanceAmount = 0;
            let wpsCapApplied = false;
            const wpsCapEnabled = salary?.wps_cap_enabled || false;
            const wpsCapAmount = salary?.wps_cap_amount ?? 4900;

            if (project.company === 'Al Maraghi Motors' && wpsCapEnabled) {
                if (finalTotal <= 0) {
                    wpsAmount = 0;
                    balanceAmount = 0;
                    wpsCapApplied = false;
                } else {
                    const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                    // Calculate raw excess over cap
                    const rawExcess = Math.max(0, finalTotal - cap);
                    // Round balance DOWN to nearest 100, then round to 2 decimals
                    balanceAmount = Math.round((Math.floor(rawExcess / 100) * 100) * 100) / 100;
                    // WPS gets the rest (total - balance), rounded to 2 decimals
                    wpsAmount = Math.round((finalTotal - balanceAmount) * 100) / 100;
                    wpsCapApplied = rawExcess > 0;
                }
            } else if (finalTotal <= 0) {
                wpsAmount = 0;
                balanceAmount = 0;
            }

            // CRITICAL: Fetch OvertimeData to populate OT and adjustment fields
            // OvertimeData is entered BEFORE finalization in the Overtime tab
            const otRecord = allOvertimeData.find(ot => 
                (emp.attendance_id && String(ot.attendance_id) === String(emp.attendance_id)) ||
                String(ot.hrms_id) === String(emp.hrms_id)
            );
            
            // OT calculations using previous month salary (for historical accuracy)
            const prevMonthTotalSalary = prevMonthSalary?.total_salary || totalSalaryAmount;
            const otHourlyRate = prevMonthTotalSalary / otDivisor / workingHours;
            
            const normalOtHours = otRecord?.normalOtHours || 0;
            const specialOtHours = otRecord?.specialOtHours || 0;
            const normalOtSalary = Math.round(otHourlyRate * otNormalRate * normalOtHours * 100) / 100;
            const specialOtSalary = Math.round(otHourlyRate * otSpecialRate * specialOtHours * 100) / 100;
            const totalOtSalary = normalOtSalary + specialOtSalary;
            
            // Get adjustment values from OvertimeData
            const bonus = otRecord?.bonus || 0;
            const incentive = otRecord?.incentive || 0;
            const otherDeduction = otRecord?.otherDeduction || 0;
            const advanceSalaryDeduction = otRecord?.advanceSalaryDeduction || 0;
            
            // Recalculate final total with OT and adjustments
            const totalWithAdjustments = totalSalaryAmount + totalOtSalary + bonus + incentive
                - netDeduction - totalDeductibleHoursPay - otherDeduction - advanceSalaryDeduction;
            
            // Recalculate WPS split with adjusted total
            let finalWpsAmount = totalWithAdjustments;
            let finalBalanceAmount = 0;
            let finalWpsCapApplied = false;
            
            // Use global WPS settings (from SalaryCalculationSettings or employee-specific override)
            const effectiveWpsCapEnabled = wpsCapEnabled !== undefined ? wpsCapEnabled : wpsCapEnabledGlobal;
            const effectiveWpsCapAmount = wpsCapAmount !== undefined ? wpsCapAmount : wpsCapAmountGlobal;
            
            if (effectiveWpsCapEnabled) {
                if (totalWithAdjustments <= 0) {
                    finalWpsAmount = 0;
                    finalBalanceAmount = 0;
                    finalWpsCapApplied = false;
                } else {
                    const cap = effectiveWpsCapAmount;
                    const rawExcess = Math.max(0, totalWithAdjustments - cap);
                    
                    if (balanceRoundingRule === 'NEAREST_100') {
                        finalBalanceAmount = Math.round((Math.floor(rawExcess / 100) * 100) * 100) / 100;
                    } else {
                        finalBalanceAmount = Math.round(rawExcess * 100) / 100;
                    }
                    
                    finalWpsAmount = Math.round((totalWithAdjustments - finalBalanceAmount) * 100) / 100;
                    finalWpsCapApplied = rawExcess > 0;
                }
            } else if (totalWithAdjustments <= 0) {
                finalWpsAmount = 0;
                finalBalanceAmount = 0;
            }
            
            console.log(`[createSalarySnapshots] 💾 Creating snapshot for ${emp.name} - Total: ${totalWithAdjustments}, WPS: ${finalWpsAmount}, Balance: ${finalBalanceAmount}, OT: ${totalOtSalary}`);
            
            // SALARY-ONLY FIX: Store attendance_id as null if employee doesn't have one
            snapshots.push({
                project_id: String(project_id),
                report_run_id: String(report_run_id),
                attendance_id: emp.attendance_id ? String(emp.attendance_id) : null,
                hrms_id: String(emp.hrms_id),
                name: emp.name,
                department: emp.department,
                basic_salary: basicSalary,
                allowances: allowancesAmount,
                total_salary: totalSalaryAmount,
                working_hours: workingHours,
                working_days: calculated.workingDays,
                salary_divisor: divisor,
                ot_divisor: otDivisor,
                prev_month_divisor: extraPrevMonthData.prevMonthDivisor || 0,
                present_days: calculated.presentDays,
                full_absence_count: calculated.fullAbsenceCount,
                annual_leave_count: calculated.annualLeaveCount,
                sick_leave_count: calculated.sickLeaveCount,
                late_minutes: calculated.lateMinutes,
                early_checkout_minutes: calculated.earlyCheckoutMinutes,
                other_minutes: calculated.otherMinutes,
                approved_minutes: calculated.approvedMinutes,
                grace_minutes: calculated.graceMinutes,
                deductible_minutes: deductibleMinutes,
                extra_prev_month_deductible_minutes: 0,  // DISABLED - no longer used
                extra_prev_month_lop_days: 0,  // DISABLED - no longer used
                extra_prev_month_lop_pay: 0,  // DISABLED - no longer used
                extra_prev_month_deductible_hours_pay: 0,  // DISABLED - no longer used
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                salary_leave_days: salaryLeaveDays,
                 leaveDays: leaveDays,
                 leavePay: leavePay,
                 salaryLeaveAmount: salaryLeaveAmount,
                 deductibleHours: deductibleHours,
                 deductibleHoursPay: totalDeductibleHoursPay,
                 netDeduction: netDeduction,
                // OT & Adjustment Fields (populated from OvertimeData)
                normalOtHours: normalOtHours,
                normalOtSalary: normalOtSalary,
                specialOtHours: specialOtHours,
                specialOtSalary: specialOtSalary,
                totalOtSalary: totalOtSalary,
                // Adjustment Fields (populated from OvertimeData)
                otherDeduction: otherDeduction,
                bonus: bonus,
                incentive: incentive,
                advanceSalaryDeduction: advanceSalaryDeduction,
                total: totalWithAdjustments,
                wpsPay: finalWpsAmount,
                balance: finalBalanceAmount,
                wps_cap_enabled: wpsCapEnabled,
                wps_cap_amount: wpsCapAmount,
                wps_cap_applied: finalWpsCapApplied,
                snapshot_created_at: new Date().toISOString(),
                attendance_source: attendanceSource
            });
            
            console.log(`[createSalarySnapshots] ✅ Snapshot added to array (${snapshots.length} total so far)`);
            console.log(`[createSalarySnapshots] >>> LOOP ITERATION ${loopIterationCount} COMPLETE`);
        }
        
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] 🏁 FOR LOOP EXITED`);
        console.log(`[createSalarySnapshots]    Total iterations completed: ${loopIterationCount}`);
        console.log(`[createSalarySnapshots]    Snapshots in array: ${snapshots.length}`);
        console.log(`[createSalarySnapshots] ============================================`);

        // BATCH MODE: Process in chunks for progress tracking
        if (batch_mode) {
            console.log(`[createSalarySnapshots] ============================================`);
            console.log(`[createSalarySnapshots] 🚨 BATCH MODE DETECTED - RETURN PATH #1`);
            console.log(`[createSalarySnapshots] 💾 BATCH MODE RESPONSE PREPARATION`);
            console.log(`[createSalarySnapshots] Snapshots created in this batch: ${snapshots.length}`);
            console.log(`[createSalarySnapshots] Batch start index: ${batch_start}`);
            console.log(`[createSalarySnapshots] Total eligible employees: ${eligibleEmployees.length}`);
            
            if (snapshots.length > 0) {
                console.log(`[createSalarySnapshots] 💾 Calling bulkCreate for ${snapshots.length} snapshots...`);
                await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(snapshots);
                console.log(`[createSalarySnapshots] ✅ bulkCreate completed successfully`);
            } else {
                console.log(`[createSalarySnapshots] ⚠️ WARNING: No snapshots to create in this batch`);
            }
            
            const currentPosition = batch_start + snapshots.length;
            const hasMore = currentPosition < eligibleEmployees.length;
            
            console.log(`[createSalarySnapshots] ============================================`);
            console.log(`[createSalarySnapshots] 📊 BATCH COMPLETE SUMMARY:`);
            console.log(`[createSalarySnapshots]    Current position: ${currentPosition}`);
            console.log(`[createSalarySnapshots]    Total employees: ${eligibleEmployees.length}`);
            console.log(`[createSalarySnapshots]    HAS_MORE: ${hasMore}`);
            console.log(`[createSalarySnapshots]    Remaining: ${eligibleEmployees.length - currentPosition} employees`);
            console.log(`[createSalarySnapshots] ============================================`);
            console.log(`[createSalarySnapshots] 📤 RETURNING BATCH RESPONSE`);
            
            return Response.json({
                success: true,
                batch_mode: true,
                batch_completed: snapshots.length,
                total_employees: eligibleEmployees.length,
                current_position: currentPosition,
                has_more: hasMore,
                current_batch: snapshots.map(s => ({ attendance_id: s.attendance_id, name: s.name }))
            });
        }
        
        // STANDARD MODE: Bulk create all snapshots at once
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] 🚨 STANDARD MODE - RETURN PATH #2`);
        console.log(`[createSalarySnapshots] ============================================`);
        
        if (snapshots.length > 0) {
            console.log(`[createSalarySnapshots] 💾 STANDARD MODE: Creating ${snapshots.length} salary snapshots (${analyzedCount} analyzed, ${noAttendanceCount} no attendance data)`);
            await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(snapshots);
            console.log(`[createSalarySnapshots] ✅ Successfully created ${snapshots.length} snapshots`);
        } else {
            console.warn(`[createSalarySnapshots] ⚠️ WARNING: No snapshots created - no eligible employees found`);
        }

        console.log(`[createSalarySnapshots] 🎯 FINAL COUNT CHECK: ${snapshots.length} snapshots created for ${eligibleEmployees.length} eligible employees`);

        // ============================================================
        // INVARIANT CHECK: Verify ALL snapshots were created in STANDARD mode
        // This prevents silent partial completion
        // ============================================================
        if (!batch_mode && snapshots.length !== eligibleEmployees.length) {
            const missingCount = eligibleEmployees.length - snapshots.length;
            const errorMsg = `INVARIANT VIOLATION: Expected ${eligibleEmployees.length} snapshots, but only ${snapshots.length} were created (${missingCount} missing)`;
            console.error(`[createSalarySnapshots] ❌ ${errorMsg}`);
            throw new Error(errorMsg);
        }

        console.log(`[createSalarySnapshots] 📤 RETURNING STANDARD MODE SUCCESS RESPONSE`);
        
        return Response.json({
            success: true,
            snapshots_created: snapshots.length,
            analyzed_count: analyzedCount,
            no_attendance_count: noAttendanceCount,
            employees_count: eligibleEmployees.length,
            message: `Created ${snapshots.length} salary snapshots (${analyzedCount} analyzed, ${noAttendanceCount} no attendance data)`
        });

    } catch (error) {
        console.error('[createSalarySnapshots] ❌ ERROR CAUGHT:', error);
        console.error('[createSalarySnapshots] 🚨 ERROR RETURN PATH #3');
        console.error('[createSalarySnapshots] Error message:', error.message);
        console.error('[createSalarySnapshots] Error stack:', error.stack);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});