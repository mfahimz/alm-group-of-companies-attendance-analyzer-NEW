import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * MARK FINAL REPORT
 * 
 * CRITICAL FIX: Before marking as final, consolidates day_overrides into
 * AnalysisResult stored fields. This ensures the finalized data matches
 * what the user sees in the UI after edits.
 * 
 * Flow:
 * 1. For each AnalysisResult with day_overrides, recalculate totals
 *    incorporating overrides (same logic as frontend calculateEmployeeTotals)
 * 2. Update AnalysisResult stored fields with recalculated values
 * 3. Mark report as final
 */

Deno.serve(async (req) => {
    try {
        console.log('[markFinalReport] ============================================');
        console.log('[markFinalReport] FUNCTION ENTRY');
        console.log('[markFinalReport] ============================================');
        
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'ceo') {
            return Response.json({ error: 'Access denied: Admin, Supervisor, or CEO role required' }, { status: 403 });
        }

        const { report_run_id, project_id } = await req.json();
        
        console.log('[markFinalReport] Parameters:', { project_id, report_run_id, user: user.email, role: userRole });

        if (!report_run_id || !project_id) {
            return Response.json({ error: 'report_run_id and project_id are required' }, { status: 400 });
        }

        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // Unmark all existing final reports for this project
        const allReports = await base44.asServiceRole.entities.ReportRun.filter({
            project_id: project_id
        }, null, 5000);

        for (const report of allReports) {
            if (report.is_final) {
                await base44.asServiceRole.entities.ReportRun.update(report.id, {
                    is_final: false
                });
            }
        }

        // ============================================================
        // CRITICAL: Consolidate day_overrides into AnalysisResult fields
        // Before finalization, recalculate totals for any AnalysisResult
        // that has day_overrides, so stored values match the edited report.
        // ============================================================
        console.log('[markFinalReport] Step 1: Consolidating day_overrides into AnalysisResult fields...');

        const [analysisResults, allPunches, allShifts, allExceptions, allEmployees, rulesData] = await Promise.all([
            base44.asServiceRole.entities.AnalysisResult.filter({
                project_id: project_id,
                report_run_id: report_run_id
            }, null, 5000),
            base44.asServiceRole.entities.Punch.filter({ project_id: project_id }, null, 10000),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id: project_id }, null, 5000),
            base44.asServiceRole.entities.Exception.filter({ project_id: project_id }, null, 5000),
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }, null, 5000),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company }, null, 5000)
        ]);

        let rules = null;
        if (rulesData && rulesData.length > 0) {
            try { rules = JSON.parse(rulesData[0].rules_json); } catch (e) { }
        }

        // Helper: Parse time string to Date
        const parseTime = (timeStr, includeSeconds = false) => {
            try {
                if (!timeStr || timeStr === '—' || timeStr === '-') return null;
                if (includeSeconds) {
                    let m = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
                    if (m) {
                        let h = parseInt(m[1]); const mi = parseInt(m[2]); const s = parseInt(m[3]); const p = m[4].toUpperCase();
                        if (p === 'PM' && h !== 12) h += 12; if (p === 'AM' && h === 12) h = 0;
                        const d = new Date(); d.setHours(h, mi, s, 0); return d;
                    }
                }
                let m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                if (m) {
                    let h = parseInt(m[1]); const mi = parseInt(m[2]); const p = m[3].toUpperCase();
                    if (p === 'PM' && h !== 12) h += 12; if (p === 'AM' && h === 12) h = 0;
                    const d = new Date(); d.setHours(h, mi, 0, 0); return d;
                }
                // Handle "1/16/2026 8:37" format
                const dtm = timeStr.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                if (dtm) {
                    const d = new Date(); d.setHours(parseInt(dtm[1]), parseInt(dtm[2]), dtm[3] ? parseInt(dtm[3]) : 0, 0); return d;
                }
                m = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
                if (m) {
                    const d = new Date(); d.setHours(parseInt(m[1]), parseInt(m[2]), m[3] ? parseInt(m[3]) : 0, 0); return d;
                }
                return null;
            } catch { return null; }
        };

        const filterMultiplePunches = (punchList, includeSeconds) => {
            if (punchList.length <= 1) return punchList;
            const withTime = punchList.map(p => ({ ...p, time: parseTime(p.timestamp_raw, includeSeconds) })).filter(p => p.time);
            if (withTime.length === 0) return punchList;
            const deduped = [];
            for (const c of withTime) {
                if (!deduped.some(p => Math.abs(c.time - p.time) / (1000 * 60) < 10)) deduped.push(c);
            }
            return deduped.sort((a, b) => a.time - b.time);
        };

        const matchPunchesToShiftPoints = (dayPunches, shift, includeSeconds) => {
            if (!shift || dayPunches.length === 0) return [];
            const withTime = dayPunches.map(p => ({ ...p, time: p.time || parseTime(p.timestamp_raw, includeSeconds) })).filter(p => p.time).sort((a, b) => a.time - b.time);
            if (withTime.length === 0) return [];
            const shiftPoints = [
                { type: 'AM_START', time: parseTime(shift.am_start) },
                { type: 'AM_END', time: parseTime(shift.am_end) },
                { type: 'PM_START', time: parseTime(shift.pm_start) },
                { type: 'PM_END', time: parseTime(shift.pm_end) }
            ].filter(sp => sp.time);
            const matches = [];
            const used = new Set();
            for (const punch of withTime) {
                let best = null; let minDist = Infinity;
                for (const sp of shiftPoints) {
                    if (used.has(sp.type)) continue;
                    const dist = Math.abs(punch.time - sp.time) / (1000 * 60);
                    if (dist <= 60 && dist < minDist) { minDist = dist; best = sp; }
                }
                if (!best) {
                    for (const sp of shiftPoints) {
                        if (used.has(sp.type)) continue;
                        const dist = Math.abs(punch.time - sp.time) / (1000 * 60);
                        if (dist <= 120 && dist < minDist) { minDist = dist; best = sp; }
                    }
                }
                if (!best) {
                    for (const sp of shiftPoints) {
                        if (used.has(sp.type)) continue;
                        const dist = Math.abs(punch.time - sp.time) / (1000 * 60);
                        if (dist <= 180 && dist < minDist) { minDist = dist; best = sp; }
                    }
                }
                if (best) { matches.push({ punch, matchedTo: best.type, shiftTime: best.time }); used.add(best.type); }
            }
            return matches;
        };

        const dayNameToNumber = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };

        // Recalculate totals for a single AnalysisResult incorporating day_overrides
        const recalculateTotals = (result, dateFrom, dateTo) => {
            const attendanceIdStr = String(result.attendance_id);
            const includeSeconds = project.company === 'Al Maraghi Automotive';
            
            const employeePunches = allPunches.filter(p =>
                String(p.attendance_id) === attendanceIdStr &&
                p.punch_date >= dateFrom && p.punch_date <= dateTo
            );
            const employeeShifts = allShifts.filter(s => String(s.attendance_id) === attendanceIdStr);
            const employeeExceptions = allExceptions.filter(e =>
                (String(e.attendance_id) === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
                e.use_in_analysis !== false && e.is_custom_type !== true
            );
            const employee = allEmployees.find(e => String(e.attendance_id) === attendanceIdStr);

            let dayOverrides = {};
            if (result.day_overrides) {
                try { dayOverrides = JSON.parse(result.day_overrides); } catch (e) { }
            }

            let totalLate = 0, totalEarly = 0, totalOther = 0;
            let workingDays = 0, presentDays = 0, fullAbsenceCount = 0, halfAbsenceCount = 0, sickLeaveCount = 0;

            // Annual leave as calendar days
            const annualLeaveExceptions = employeeExceptions.filter(ex => ex.type === 'ANNUAL_LEAVE');
            const alDates = new Set();
            const startDate = new Date(dateFrom);
            const endDate = new Date(dateTo);
            for (const alEx of annualLeaveExceptions) {
                try {
                    const exFrom = new Date(alEx.date_from); const exTo = new Date(alEx.date_to);
                    const rs = exFrom < startDate ? new Date(startDate) : new Date(exFrom);
                    const re = exTo > endDate ? new Date(endDate) : new Date(exTo);
                    if (rs <= re) { for (let d = new Date(rs); d <= re; d.setDate(d.getDate() + 1)) { alDates.add(d.toISOString().split('T')[0]); } }
                } catch { }
            }
            const annualLeaveCount = alDates.size;

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getUTCDay();

                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (employee?.weekly_off) {
                    weeklyOffDay = dayNameToNumber[employee.weekly_off];
                }
                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) continue;

                // Exceptions
                const matchingExceptions = employeeExceptions.filter(ex => {
                    try { return dateStr >= ex.date_from && dateStr <= ex.date_to; } catch { return false; }
                });
                const hasPublicHoliday = matchingExceptions.some(ex => ex.type === 'PUBLIC_HOLIDAY' || ex.type === 'OFF');
                if (hasPublicHoliday) {
                    const hasManualAbsent = matchingExceptions.some(ex => ex.type === 'MANUAL_ABSENT');
                    if (hasManualAbsent) fullAbsenceCount++;
                    continue;
                }

                workingDays++;

                const dateException = matchingExceptions.length > 0
                    ? matchingExceptions.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0]
                    : null;

                const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr);

                // Get shift
                const isShiftEffective = (s) => {
                    if (!s.effective_from || !s.effective_to) return true;
                    return dateStr >= s.effective_from && dateStr <= s.effective_to;
                };
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const currentDayName = dayNames[dayOfWeek];

                let shift = employeeShifts.find(s => s.date === dateStr && isShiftEffective(s));
                if (!shift) {
                    const applicable = employeeShifts.filter(s => !s.date && isShiftEffective(s));
                    for (const s of applicable) {
                        if (s.applicable_days) {
                            try {
                                const arr = JSON.parse(s.applicable_days);
                                if (Array.isArray(arr) && arr.some(day => day.toLowerCase().trim() === currentDayName.toLowerCase())) { shift = s; break; }
                            } catch { }
                            if (!shift) {
                                const lower = s.applicable_days.toLowerCase();
                                if (lower.includes(currentDayName.toLowerCase())) { shift = s; break; }
                            }
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
                        shift = { am_start: dateException.new_am_start, am_end: dateException.new_am_end, pm_start: dateException.new_pm_start, pm_end: dateException.new_pm_end };
                    }
                }

                const dayOverride = dayOverrides[dateStr];

                // Apply shift override from day_overrides
                if (dayOverride?.shiftOverride) {
                    shift = { am_start: dayOverride.shiftOverride.am_start, am_end: dayOverride.shiftOverride.am_end, pm_start: dayOverride.shiftOverride.pm_start, pm_end: dayOverride.shiftOverride.pm_end };
                }

                const dayPunches = filterMultiplePunches(rawDayPunches, includeSeconds);

                // Track allowed minutes
                let allowedMinutesForDay = 0;
                if (dateException && dateException.type === 'ALLOWED_MINUTES' && dateException.approval_status === 'approved_dept_head') {
                    allowedMinutesForDay = dateException.allowed_minutes || 0;
                }

                // Exception time values
                let exLate = 0, exEarly = 0, exOther = 0;
                if (dateException && !dayOverride) {
                    if (!['OFF', 'PUBLIC_HOLIDAY', 'MANUAL_ABSENT', 'SICK_LEAVE'].includes(dateException.type)) {
                        if (dateException.late_minutes > 0) exLate = dateException.late_minutes;
                        if (dateException.early_checkout_minutes > 0) exEarly = dateException.early_checkout_minutes;
                        if (dateException.other_minutes > 0) exOther = dateException.other_minutes;
                    }
                }

                // Handle day override status
                if (dayOverride) {
                    if (dayOverride.type === 'MANUAL_PRESENT') presentDays++;
                    else if (dayOverride.type === 'MANUAL_ABSENT') fullAbsenceCount++;
                    else if (dayOverride.type === 'MANUAL_HALF') { presentDays++; halfAbsenceCount++; }
                    else if (dayOverride.type === 'OFF') workingDays--;
                    else if (dayOverride.type === 'SICK_LEAVE') sickLeaveCount++;

                    if (!dayOverride.shiftOverride && dayOverride.lateMinutes !== undefined) {
                        if (dayOverride.type === 'SICK_LEAVE') continue;
                        totalLate += dayOverride.lateMinutes || 0;
                        totalEarly += dayOverride.earlyCheckoutMinutes || 0;
                        totalOther += dayOverride.otherMinutes || 0;
                        continue;
                    }
                    if (dayOverride.type === 'SICK_LEAVE') continue;
                }

                const shouldSkipTimeCalc = dateException && ['SICK_LEAVE', 'ANNUAL_LEAVE', 'MANUAL_PRESENT', 'MANUAL_ABSENT', 'MANUAL_HALF', 'OFF', 'PUBLIC_HOLIDAY'].includes(dateException.type);

                // Count attendance (if no dayOverride handled it)
                if (!dayOverride) {
                    if (dateException) {
                        if (dateException.type === 'OFF' || dateException.type === 'PUBLIC_HOLIDAY') workingDays--;
                        else if (dateException.type === 'MANUAL_PRESENT') presentDays++;
                        else if (dateException.type === 'MANUAL_ABSENT') fullAbsenceCount++;
                        else if (dateException.type === 'MANUAL_HALF') { presentDays++; halfAbsenceCount++; }
                        else if (dateException.type === 'SICK_LEAVE') sickLeaveCount++;
                        else if (dateException.type === 'ANNUAL_LEAVE') {
                            if (dayPunches.length === 0) workingDays--;
                            else presentDays++;
                        }
                        else if (dayPunches.length > 0) presentDays++;
                        else fullAbsenceCount++;
                    } else if (dayPunches.length > 0) {
                        presentDays++;
                    } else {
                        fullAbsenceCount++;
                    }
                }

                const hasManualExceptionMinutes = exLate > 0 || exEarly > 0 || exOther > 0;

                if (hasManualExceptionMinutes) {
                    if (!['OFF', 'PUBLIC_HOLIDAY', 'MANUAL_ABSENT', 'SICK_LEAVE'].includes(dateException.type)) {
                        if ((dateException.type === 'MANUAL_LATE' || dateException.type === 'MANUAL_EARLY_CHECKOUT') && dayPunches.length === 0 && !dayOverride) {
                            presentDays++;
                        }
                        totalLate += Math.abs(exLate);
                        totalEarly += Math.abs(exEarly);
                        totalOther += Math.abs(exOther);
                    }
                } else if (shift && dayPunches.length > 0 && !shouldSkipTimeCalc) {
                    const punchMatches = matchPunchesToShiftPoints(dayPunches, shift, includeSeconds);
                    let dayLate = 0, dayEarly = 0;
                    for (const match of punchMatches) {
                        if (!match.matchedTo) continue;
                        const pt = match.punch.time; const st = match.shiftTime;
                        if ((match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') && pt > st) {
                            dayLate += Math.round(Math.abs((pt - st) / (1000 * 60)));
                        }
                        if ((match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') && pt < st) {
                            dayEarly += Math.round(Math.abs((st - pt) / (1000 * 60)));
                        }
                    }
                    // Apply allowed minutes offset
                    if (allowedMinutesForDay > 0) {
                        const total = dayLate + dayEarly;
                        const excess = Math.max(0, total - allowedMinutesForDay);
                        if (total > 0 && excess > 0) {
                            dayLate = Math.round(excess * (dayLate / total));
                            dayEarly = Math.round(excess * (dayEarly / total));
                        } else { dayLate = 0; dayEarly = 0; }
                    }
                    totalLate += dayLate;
                    totalEarly += dayEarly;
                }

                // If dayOverride had shift override but also manual minutes
                if (dayOverride && dayOverride.lateMinutes !== undefined && dayOverride.shiftOverride) {
                    // Override the calculated values with the explicit ones
                    // Already handled above in the shift recalc, but override if explicit
                    // The shift recalculation above handles this case
                }
            }

            // Calculate deductible: (late + early) - grace - approved (other_minutes excluded)
            const dept = employee?.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
            const carriedGrace = project.use_carried_grace_minutes ? (employee?.carried_grace_minutes || 0) : 0;
            const graceMinutes = baseGrace + carriedGrace;
            const approvedMinutes = result.approved_minutes || 0;
            const baseMinutes = Math.max(0, totalLate) + Math.max(0, totalEarly);
            const deductibleMinutes = Math.max(0, Math.max(0, baseMinutes - graceMinutes) - approvedMinutes);

            return {
                working_days: Math.max(0, workingDays),
                present_days: Math.max(0, presentDays),
                full_absence_count: Math.max(0, fullAbsenceCount),
                half_absence_count: Math.max(0, halfAbsenceCount),
                sick_leave_count: Math.max(0, sickLeaveCount),
                annual_leave_count: Math.max(0, annualLeaveCount),
                late_minutes: Math.max(0, totalLate),
                early_checkout_minutes: Math.max(0, totalEarly),
                other_minutes: Math.max(0, totalOther),
                deductible_minutes: deductibleMinutes,
                grace_minutes: graceMinutes
            };
        };

        const reportRun = allReports.find(r => r.id === report_run_id);
        if (!reportRun) {
            return Response.json({ error: 'Report run not found' }, { status: 404 });
        }

        let consolidatedCount = 0;
        for (const result of analysisResults) {
            // Always recalculate from punches + overrides + exceptions to get accurate totals
            const recalc = recalculateTotals(result, reportRun.date_from, reportRun.date_to);

            // Check if any values differ (accounting for manual overrides)
            const updates = {};
            let hasChanges = false;

            // Only update fields that don't have manual overrides
            const fieldsToCheck = [
                { key: 'working_days', manual: null },
                { key: 'present_days', manual: 'manual_present_days' },
                { key: 'full_absence_count', manual: 'manual_full_absence_count' },
                { key: 'half_absence_count', manual: null },
                { key: 'sick_leave_count', manual: 'manual_sick_leave_count' },
                { key: 'annual_leave_count', manual: 'manual_annual_leave_count' },
                { key: 'late_minutes', manual: null },
                { key: 'early_checkout_minutes', manual: null },
                { key: 'other_minutes', manual: null },
                { key: 'deductible_minutes', manual: 'manual_deductible_minutes' },
                { key: 'grace_minutes', manual: null }
            ];

            for (const f of fieldsToCheck) {
                // Skip if there's a manual override for this field
                if (f.manual && result[f.manual] !== null && result[f.manual] !== undefined) {
                    continue;
                }
                const oldVal = result[f.key] || 0;
                const newVal = recalc[f.key] || 0;
                if (Math.abs(oldVal - newVal) > 0.01) {
                    updates[f.key] = newVal;
                    hasChanges = true;
                    console.log(`[markFinalReport] ${result.attendance_id}: ${f.key} changed ${oldVal} -> ${newVal}`);
                }
            }

            if (hasChanges) {
                await base44.asServiceRole.entities.AnalysisResult.update(result.id, updates);
                consolidatedCount++;
            }
        }

        console.log(`[markFinalReport] Consolidated ${consolidatedCount} AnalysisResult records with recalculated values`);

        // Mark the selected report as final
        const nowUAE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })).toISOString();
        await base44.asServiceRole.entities.ReportRun.update(report_run_id, {
            is_final: true,
            finalized_by: user.email,
            finalized_date: nowUAE,
            recalculation_version: 0
        });

        await base44.asServiceRole.entities.Project.update(project_id, {
            last_saved_report_id: report_run_id
        });

        // Audit log
        try {
            await base44.asServiceRole.functions.invoke('logAudit', {
                action: 'MARK_FINAL_REPORT',
                entity_type: 'ReportRun',
                entity_id: report_run_id,
                details: `Marked report as final. Consolidated ${consolidatedCount} AnalysisResults with day_overrides.`
            });
        } catch (auditError) {
            console.warn('[markFinalReport] Audit log failed:', auditError.message);
        }

        console.log(`[markFinalReport] ✅ Report marked as final. ${consolidatedCount} records consolidated.`);

        return Response.json({ 
            success: true,
            ready_for_snapshots: true,
            consolidated_count: consolidatedCount,
            message: `Report finalized. ${consolidatedCount} records updated with edited values.`
        });

    } catch (error) {
        console.error('Mark final report error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});