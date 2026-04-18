// createSalarySnapshotsV2.js
// Safe parallel version of createSalarySnapshots.
// Identical to original except:
//   - LOP days derived from AnalysisResult.lop_dates (no re-analysis)
//   - LOP adjacent derived from AnalysisResult.lop_adjacent_weekly_off_dates
//   - Other minutes split using calculateExtraPrevMonthData for overflow days
//   - extra_prev_month_* snapshot fields are now populated (not zeroed)
// Original createSalarySnapshots/entry.ts is completely untouched.
// To revert: change finalize call back to createSalarySnapshots.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ============================================================
// INLINED HELPERS (no local imports allowed in Deno functions)
// ============================================================

/**
 * parseAdjustmentValue
 * Handles OvertimeData fields that may be stored as JSON arrays
 * (e.g. [{amount: 100, desc: "bonus"}]) or plain numbers.
 */
const parseAdjustmentValue = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '' || trimmed === 'null') return 0;
        if (trimmed.startsWith('[')) {
            try {
                const arr = JSON.parse(trimmed);
                if (Array.isArray(arr)) {
                    return arr.reduce((sum, item) => {
                        const amt = typeof item === 'object' && item !== null
                            ? Number(item.amount || 0)
                            : Number(item || 0);
                        return sum + (isNaN(amt) ? 0 : amt);
                    }, 0);
                }
            } catch { return 0; }
        }
        const n = Number(trimmed);
        return isNaN(n) ? 0 : n;
    }
    if (Array.isArray(value)) {
        return value.reduce((sum, item) => {
            const amt = typeof item === 'object' && item !== null
                ? Number(item.amount || 0)
                : Number(item || 0);
            return sum + (isNaN(amt) ? 0 : amt);
        }, 0);
    }
    return 0;
};

/**
 * calculateSalaryLeaveDaysOverride
 * Returns the ANNUAL_LEAVE salary_leave_days override for an employee for a given period.
 * Returns 0 if no override is set.
 */
const calculateSalaryLeaveDaysOverride = (attendanceId, allExceptions, dateFrom, dateTo) => {
    if (!attendanceId) return 0;
    const leaveExceptions = allExceptions.filter(ex =>
        ex.type === 'ANNUAL_LEAVE' &&
        String(ex.attendance_id) === String(attendanceId) &&
        ex.salary_leave_days != null &&
        ex.date_from <= dateTo &&
        ex.date_to >= dateFrom
    );
    if (leaveExceptions.length === 0) return 0;
    return leaveExceptions.reduce((sum, ex) => sum + (Number(ex.salary_leave_days) || 0), 0);
};

/**
 * calculateEmployeeSalary
 * Canonical salary calculation helper.
 * Input: { employee, salary, prevMonthSalary, attendance, adjustments, settings }
 * Output: computed snapshot fields
 */
const calculateEmployeeSalary = (input) => {
    const { salary, prevMonthSalary, attendance, adjustments, settings } = input;

    const {
        isAlMaraghi = false,
        divisor = 30,
        otDivisor = 30,
        prevMonthDivisor = 30,
        otNormalRate = 1.25,
        otSpecialRate = 1.5,
        wpsCapEnabled = false,
        wpsCapAmount = 4900,
        balanceRoundingRule = 'EXACT',
        leavePayFormula = 'TOTAL_SALARY',
        salaryLeaveFormula = 'BASIC_PLUS_ALLOWANCES'
    } = settings || {};

    const basicSalary = salary.basic_salary || 0;
    const allowances = salary.allowances || 0;
    const allowancesWithBonus = salary.allowances_with_bonus || 0;
    const totalSalary = salary.total_salary || 0;
    const workingHours = salary.working_hours || 9;
    const prevMonthTotalSalary = prevMonthSalary?.total_salary || totalSalary;

    const {
        fullAbsenceCount = 0,
        annualLeaveCount = 0,
        deductibleMinutes = 0,
        otherMinutes = 0,
        ramadanGiftMinutes = 0,
        graceMinutes = 15,
        salaryLeaveDays: rawSalaryLeaveDays = 0,
    } = attendance || {};

    const salaryLeaveDays = rawSalaryLeaveDays || annualLeaveCount;

    // Leave Days = Annual Leave (for leave pay) + LOP
    const leaveDays = annualLeaveCount + fullAbsenceCount;

    // Leave Pay
    const leavePayBase = leavePayFormula === 'TOTAL_SALARY' ? totalSalary : basicSalary;
    const leavePay = leaveDays > 0 ? Math.round((leavePayBase / divisor) * leaveDays) : 0;

    // Salary Leave Amount
    const salaryLeaveBase = salaryLeaveFormula === 'BASIC_PLUS_ALLOWANCES'
        ? basicSalary + allowances
        : totalSalary;
    const rawSalaryLeaveAmount = salaryLeaveDays > 0
        ? (salaryLeaveBase / divisor) * salaryLeaveDays
        : 0;
    const salaryLeaveAmount = Math.round(rawSalaryLeaveAmount * 100) / 100;

    // Net Deduction
    const netDeduction = Math.max(0, Math.round((leavePay - salaryLeaveAmount) * 100) / 100);

    // Deductible Hours
    // V2 FIX: Include both deductible_minutes AND other_minutes in hours
    // Matches the canonical calculateEmployeeSalary.ts shared helper logic
    // other_minutes = manual other minutes (Excel Col J - LOP Hours)
    // deductible_minutes = attendance late/early minutes (Excel Col K - LOP Hrs Att.)
    const finalizedDeductibleMinutes = Math.max(0, (deductibleMinutes || 0) - (ramadanGiftMinutes || 0));
    const finalizedOtherMinutes = Math.max(0, otherMinutes || 0);
    const payrollDeductibleMinutes = finalizedDeductibleMinutes + finalizedOtherMinutes;
    const deductibleHours = Math.round((payrollDeductibleMinutes / 60) * 100) / 100;
    const hourlyRateDeduction = totalSalary / divisor / workingHours;
    const deductibleHoursPay = Math.round(hourlyRateDeduction * deductibleHours * 100) / 100;

    // OT - uses prevMonthTotalSalary with otDivisor
    const otHourlyRate = prevMonthTotalSalary / otDivisor / workingHours;
    const normalOtHours = adjustments?.normalOtHours || 0;
    const specialOtHours = adjustments?.specialOtHours || 0;
    const normalOtSalary = Math.round(otHourlyRate * otNormalRate * normalOtHours * 100) / 100;
    const specialOtSalary = Math.round(otHourlyRate * otSpecialRate * specialOtHours * 100) / 100;
    const totalOtSalary = Math.round((normalOtSalary + specialOtSalary) * 100) / 100;

    // Adjustments
    const bonus = adjustments?.bonus || 0;
    const incentive = adjustments?.incentive || 0;
    const openLeaveSalary = adjustments?.open_leave_salary || 0;
    const variableSalary = adjustments?.variable_salary || 0;
    const otherDeduction = adjustments?.otherDeduction || 0;
    const advanceSalaryDeduction = adjustments?.advanceSalaryDeduction || 0;

    // Operations dept rule: pay higher of OT vs incentive (not both)
    const isOperationsDept = (input.employee?.department || '').toLowerCase() === 'operations';
    const effectiveOtOrIncentive = isOperationsDept
        ? Math.max(totalOtSalary, incentive)
        : totalOtSalary + incentive;

    // Final Total
    const rawTotal = totalSalary
        + bonus
        + effectiveOtOrIncentive
        + openLeaveSalary
        + variableSalary
        - netDeduction
        - deductibleHoursPay
        - otherDeduction
        - advanceSalaryDeduction;

    const bonusHasDecimals = (bonus || 0) % 1 !== 0;
    const total = bonusHasDecimals
        ? Math.round(rawTotal * 100) / 100
        : Math.round(rawTotal);

    // WPS Split
    let wpsPay = total;
    let balance = 0;
    let wpsCapApplied = false;

    if (wpsCapEnabled) {
        if (total <= 0) {
            wpsPay = 0;
            balance = 0;
        } else {
            const rawExcess = Math.max(0, total - wpsCapAmount);
            if (balanceRoundingRule === 'UP_TO_100') {
                balance = rawExcess > 0 ? Math.ceil(rawExcess / 100) * 100 : 0;
            } else {
                balance = rawExcess > 0 ? Math.floor(rawExcess / 100) * 100 : 0;
            }
            wpsPay = Math.round((total - balance) * 100) / 100;
            wpsCapApplied = rawExcess > 0;
        }
    } else if (total <= 0) {
        wpsPay = 0;
        balance = 0;
    }

    return {
        basic_salary: basicSalary,
        allowances: allowances,
        allowances_with_bonus: allowancesWithBonus,
        total_salary: totalSalary,
        working_hours: workingHours,
        working_days: attendance?.workingDays || 0,
        present_days: attendance?.presentDays || 0,
        full_absence_count: fullAbsenceCount,
        annual_leave_count: annualLeaveCount,
        sick_leave_count: attendance?.sickLeaveCount || 0,
        late_minutes: attendance?.lateMinutes || 0,
        early_checkout_minutes: attendance?.earlyCheckoutMinutes || 0,
        other_minutes: attendance?.otherMinutes || 0,
        approved_minutes: attendance?.approvedMinutes || 0,
        grace_minutes: graceMinutes,
        deductible_minutes: finalizedDeductibleMinutes,
        ramadan_gift_minutes: ramadanGiftMinutes || 0,
        salary_divisor: divisor,
        ot_divisor: otDivisor,
        prev_month_divisor: prevMonthDivisor,
        salary_leave_days: salaryLeaveDays,
        leaveDays: leaveDays,
        leavePay: leavePay,
        salaryLeaveAmount: salaryLeaveAmount,
        netDeduction: netDeduction,
        deductibleHours: deductibleHours,
        deductibleHoursPay: deductibleHoursPay,
        normalOtHours: normalOtHours,
        normalOtSalary: normalOtSalary,
        specialOtHours: specialOtHours,
        specialOtSalary: specialOtSalary,
        totalOtSalary: totalOtSalary,
        bonus: bonus,
        incentive: incentive,
        open_leave_salary: openLeaveSalary,
        variable_salary: variableSalary,
        otherDeduction: otherDeduction,
        advanceSalaryDeduction: advanceSalaryDeduction,
        total: total,
        wpsPay: wpsPay,
        balance: balance,
        wps_cap_enabled: wpsCapEnabled,
        wps_cap_amount: wpsCapAmount,
        wps_cap_applied: wpsCapApplied
    };
};

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

        // Paginated fetch helper to avoid SDK truncation on large datasets
        const fetchAllPages = async (fetcher) => {
            const all = [];
            let skip = 0;
            const limit = 1000;
            while (true) {
                const results = await fetcher(skip, limit);
                if (!results || results.length === 0) break;
                all.push(...results);
                if (results.length < limit) break;
                skip += limit;
            }
            return all;
        };

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
        let divisor = project.salary_calculation_days || 30;
        if (!divisor || divisor <= 0) {
            console.warn('[createSalarySnapshots] Invalid salary_divisor from settings, using default 30');
            divisor = 30;
        }

        // DIVISOR_OT: Used for OT Hourly Rate, Previous Month LOP Days, Previous Month Deductible Minutes
        let otDivisor = project.ot_calculation_days || divisor;
        if (!otDivisor || otDivisor <= 0) {
            console.warn('[createSalarySnapshots] Invalid ot_divisor from settings, using default divisor');
            otDivisor = divisor;
        }
        const isAlMaraghi = project.company === 'Al Maraghi Motors';

        // OT Rates from settings
        let otNormalRate = 1.25;
        let otSpecialRate = 1.5;

        // WPS Cap settings
        const wpsCapEnabledGlobal = isAlMaraghi ? true : false;
        const wpsCapAmountGlobal = 4900;
        const balanceRoundingRule = 'EXACT';

        // Formula settings
        const leavePayFormula = 'TOTAL_SALARY';
        const salaryLeaveFormula = 'BASIC_PLUS_ALLOWANCES';
        const assumedPresentLastDays = isAlMaraghi ? 2 : 0;

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

        const existingSnapshotKeys = new Set(
            existingSnapshots.map(s => String(s.attendance_id || s.hrms_id)).filter(Boolean)
        );

        if (existingSnapshots.length > 0) {
            console.log(`[createSalarySnapshots] IDEMPOTENCY GATE: ${existingSnapshots.length} snapshots already exist for report_run_id ${report_run_id}`);
            console.log(`[createSalarySnapshots] Request type: ${batch_mode ? 'BATCH' : 'STANDARD'}, batch_start: ${batch_start}`);

            // SELF-HEAL: Ensure existing snapshots preserve finalized attendance fields AS-IS.
            const analysisResultsForRepair = await base44.asServiceRole.entities.AnalysisResult.filter({
                project_id: project_id,
                report_run_id: report_run_id
            }, null, 5000);
            const overtimeDataForRepair = await base44.asServiceRole.entities.OvertimeData.filter({
                project_id: project_id
            }, null, 5000);

            let repairedSnapshots = 0;
            for (const snapshot of existingSnapshots) {
                if (!snapshot.attendance_id) continue;

                const analysisResult = analysisResultsForRepair.find(r =>
                    String(r.attendance_id) === String(snapshot.attendance_id)
                );
                if (!analysisResult) continue;

                const rawDeductibleMinutes = Math.max(0, analysisResult.manual_deductible_minutes ?? analysisResult.deductible_minutes ?? 0);
                const ramadanGiftMinutes = Math.max(0, analysisResult.ramadan_gift_minutes || 0);
                const finalizedDeductibleMinutes = Math.max(0, rawDeductibleMinutes - ramadanGiftMinutes);
                const finalizedOtherMinutes = Math.max(0, analysisResult.other_minutes || 0);

                const otRecord = overtimeDataForRepair.find(ot =>
                    String(ot.attendance_id || '') === String(snapshot.attendance_id || '') ||
                    String(ot.hrms_id || '') === String(snapshot.hrms_id || '')
                );
                const openLeaveSalary = Math.max(0, Number(otRecord?.open_leave_salary ?? snapshot.open_leave_salary ?? 0));
                const variableSalary = Math.max(0, Number(otRecord?.variable_salary ?? snapshot.variable_salary ?? 0));

                if (
                    Number(snapshot.deductible_minutes || 0) !== Number(finalizedDeductibleMinutes) ||
                    Number(snapshot.other_minutes || 0) !== Number(finalizedOtherMinutes) ||
                    Number(snapshot.open_leave_salary || 0) !== Number(openLeaveSalary) ||
                    Number(snapshot.variable_salary || 0) !== Number(variableSalary)
                ) {
                    const previousOpenLeaveSalary = Math.max(0, Number(snapshot.open_leave_salary || 0));
                    const previousVariableSalary = Math.max(0, Number(snapshot.variable_salary || 0));
                    const repairedTotal = Math.round(((Number(snapshot.total || 0) - previousOpenLeaveSalary - previousVariableSalary + openLeaveSalary + variableSalary) * 100)) / 100;

                    const wpsCapEnabled = snapshot.wps_cap_enabled || false;
                    const wpsCapAmount = snapshot.wps_cap_amount ?? 4900;
                    let repairedWpsPay = repairedTotal;
                    let repairedBalance = 0;
                    let repairedWpsCapApplied = false;

                    if (wpsCapEnabled) {
                        if (repairedTotal <= 0) {
                            repairedWpsPay = 0;
                            repairedBalance = 0;
                        } else {
                            const rawExcess = Math.max(0, repairedTotal - wpsCapAmount);
                            repairedBalance = rawExcess > 0 ? Math.ceil(rawExcess / 100) * 100 : 0;
                            repairedWpsPay = Math.round((repairedTotal - repairedBalance) * 100) / 100;
                            repairedWpsCapApplied = rawExcess > 0;
                        }
                    } else if (repairedTotal <= 0) {
                        repairedWpsPay = 0;
                        repairedBalance = 0;
                    }

                    await base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, {
                        deductible_minutes: finalizedDeductibleMinutes,
                        ramadan_gift_minutes: ramadanGiftMinutes,
                        other_minutes: finalizedOtherMinutes,
                        open_leave_salary: openLeaveSalary,
                        variable_salary: variableSalary,
                        total: repairedTotal,
                        wpsPay: repairedWpsPay,
                        balance: repairedBalance,
                        wps_cap_applied: repairedWpsCapApplied
                    });
                    repairedSnapshots++;
                }
            }

            console.log(`[createSalarySnapshots] SELF-HEAL COMPLETE: repaired ${repairedSnapshots} existing snapshots`);

            // NON-BATCH MODE: Return early — all employees already processed
            if (!batch_mode) {
                return Response.json({
                    success: true,
                    snapshots_created: 0,
                    existing_snapshots: existingSnapshots.length,
                    repaired_snapshots: repairedSnapshots,
                    message: `Snapshots already exist for this report (${existingSnapshots.length} found). Repaired ${repairedSnapshots} snapshots and prevented duplicates.`
                });
            }

            console.log(`[createSalarySnapshots] BATCH CONTINUE MODE: ${existingSnapshots.length} existing snapshots tracked; continuing to process remaining employees`);
        }

        console.log(`[createSalarySnapshots] IDEMPOTENCY GATE PASSED: proceeding with snapshot creation flow`);
        console.log(`[createSalarySnapshots] Request mode: ${batch_mode ? 'BATCH' : 'STANDARD'}, batch_start: ${batch_start}, batch_size: ${batch_size}`);

        // ============================================================
        // AL MARAGHI MOTORS: Calculate salary month ranges
        // ============================================================
        let salaryMonthStartStr = null;
        let salaryMonthEndStr = null;
        let extraPrevMonthFrom = null;
        let extraPrevMonthTo = null;
        let hasExtraPrevMonthRange = false;
        let assumedPresentDays = [];

        if (isAlMaraghi) {
            const projectDateTo = new Date(project.date_to);
            const salaryMonthStart = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth(), 1);
            const salaryMonthEnd = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth() + 1, 0);

            salaryMonthStartStr = salaryMonthStart.toISOString().split('T')[0];
            salaryMonthEndStr = salaryMonthEnd.toISOString().split('T')[0];

            if (assumedPresentLastDays > 0) {
                for (let i = 0; i < assumedPresentLastDays; i++) {
                    const assumedDay = new Date(projectDateTo);
                    assumedDay.setDate(assumedDay.getDate() - i);
                    assumedPresentDays.push(assumedDay.toISOString().split('T')[0]);
                }
            }

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
        const [employees, salaries, _legacyAnalysisResults, allExceptions, salaryIncrements, rulesData, punches, shifts, allOvertimeData, allHolds] = await Promise.all([
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
            base44.asServiceRole.entities.OvertimeData.filter({ project_id: project_id }, null, 5000),
            base44.asServiceRole.entities.PayrollHold.filter({ company: project.company }, null, 5000)
        ]);

        // V2 ADDITION: Fetch AnalysisResult records for this report run
        // Used to read lop_dates and lop_adjacent_weekly_off_dates
        const analysisResults = await fetchAllPages(
            (skip, limit) =>
                base44.asServiceRole.entities.AnalysisResult.filter(
                    { report_run_id: String(report_run_id) },
                    null,
                    limit,
                    skip
                )
        );

        // Build lookup map: attendance_id string -> AnalysisResult record
        const analysisResultMap = {};
        analysisResults.forEach((ar) => {
            analysisResultMap[String(ar.attendance_id)] = ar;
        });

        console.log(`[createSalarySnapshotsV2] Loaded ${analysisResults.length} AnalysisResult records for report ${report_run_id}`);

        console.log(`[createSalarySnapshots] BATCH_MODE=${batch_mode}, BATCH_START=${batch_start}, BATCH_SIZE=${batch_size}`);
        console.log(`[createSalarySnapshots] RAW DATA FETCHED: ${employees.length} employees, ${salaries.length} salaries, ${analysisResults.length} analysis results, ${allOvertimeData.length} overtime records`);

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
        const parseTime = (timeStr) => {
            try {
                if (!timeStr || timeStr === '—' || timeStr === '-') return null;

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

                timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
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
        const filterMultiplePunches = (punchList) => {
            if (punchList.length <= 1) return punchList;
            const punchesWithTime = punchList.map(p => ({
                ...p,
                time: parseTime(p.timestamp_raw)
            })).filter(p => p.time);
            if (punchesWithTime.length === 0) return punchList;

            const deduped = [];
            for (const current of punchesWithTime) {
                const isDuplicate = deduped.some(p => Math.abs(current.time.getTime() - p.time.getTime()) / (1000 * 60) < 10);
                if (!isDuplicate) deduped.push(current);
            }
            return deduped.sort((a, b) => a.time.getTime() - b.time.getTime());
        };

        // Helper: Match punches to shift points
        const matchPunchesToShiftPoints = (dayPunches, shift) => {
            if (!shift || dayPunches.length === 0) return [];

            const punchesWithTime = dayPunches.map(p => ({
                ...p,
                time: p.time || parseTime(p.timestamp_raw)
            })).filter(p => p.time).sort((a, b) => a.time.getTime() - b.time.getTime());

            if (punchesWithTime.length === 0) return [];

            const pmEndTime = parseTime(shift.pm_end);
            let adjustedPmEnd = pmEndTime;
            if (pmEndTime && pmEndTime.getHours() === 0 && pmEndTime.getMinutes() === 0) {
                adjustedPmEnd = new Date(pmEndTime.getTime() + 24 * 60 * 60 * 1000);
            }

            const shiftPoints = [
                { type: 'AM_START', time: parseTime(shift.am_start) },
                { type: 'AM_END', time: parseTime(shift.am_end) },
                { type: 'PM_START', time: parseTime(shift.pm_start) },
                { type: 'PM_END', time: adjustedPmEnd }
            ].filter(sp => sp.time);

            const matches = [];
            const usedShiftPoints = new Set();

            for (const punch of punchesWithTime) {
                let closestMatch = null;
                let minDistance = Infinity;

                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);
                    if (distance <= 60 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                    }
                }

                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;
                        const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);
                        if (distance <= 120 && distance < minDistance) {
                            minDistance = distance;
                            closestMatch = shiftPoint;
                        }
                    }
                }

                if (!closestMatch) {
                    for (const shiftPoint of shiftPoints) {
                        if (usedShiftPoints.has(shiftPoint.type)) continue;
                        const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);
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

        // ============================================================
        // AL MARAGHI MOTORS: Calculate extra prev month deductible minutes
        // ============================================================
        const calculateExtraPrevMonthData = (emp, graceMinutes, prevMonthSalaryAmount, workingHours, arOtherMinutes) => {
            if (!isAlMaraghi || !hasExtraPrevMonthRange) {
                return { extraDeductibleMinutes: 0, extraLopDays: 0, extraLopPay: 0, extraDeductibleHoursPay: 0, prevMonthDivisor: otDivisor };
            }

            const attendanceIdStr = String(emp.attendance_id);

            const isJanuaryAlMaraghiProject = project.name === 'January - Al Maraghi Motors' ||
                project.name === 'January – Al Maraghi Motors';

            let effectivePrevMonthFrom = extraPrevMonthFrom;
            let effectivePrevMonthTo = extraPrevMonthTo;
            let effectiveLopOnlyDate = extraPrevMonthTo;

            if (isJanuaryAlMaraghiProject) {
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

            let totalLateMinutes = 0;
            let totalEarlyMinutes = 0;
            let totalOtherMinutes = 0;
            let totalApprovedMinutes = 0;

            let extraLopDays = 0;
            const lastDayOfPrevMonth = effectiveLopOnlyDate;

            const startDate = new Date(effectivePrevMonthFrom);
            const endDate = new Date(effectivePrevMonthTo);

            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getUTCDay();
                const isLastDayOfPrevMonth = (dateStr === lastDayOfPrevMonth);

                let weeklyOffDay = null;
                if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                    weeklyOffDay = dayNameToNumber[project.weekly_off_override];
                } else if (emp.weekly_off) {
                    weeklyOffDay = dayNameToNumber[emp.weekly_off];
                }

                if (weeklyOffDay !== null && dayOfWeek === weeklyOffDay) {
                    continue;
                }

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

                if (dateException && dateException.type === 'MANUAL_ABSENT') {
                    if (isLastDayOfPrevMonth) {
                        extraLopDays = 1;
                    }
                    continue;
                }

                if (dateException && [
                    'MANUAL_PRESENT', 'SICK_LEAVE', 'ANNUAL_LEAVE'
                ].includes(dateException.type)) {
                    continue;
                }

                const rawDayPunches = employeePunches.filter(p => p.punch_date === dateStr);

                if (rawDayPunches.length === 0) {
                    if (isLastDayOfPrevMonth) {
                        extraLopDays = 1;
                    }
                    continue;
                }

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
                            } catch { }
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

                const dayPunches = filterMultiplePunches(rawDayPunches);

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
                    const punchMatches = matchPunchesToShiftPoints(dayPunches, shift);

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

                totalLateMinutes += dayLateMinutes;
                totalEarlyMinutes += dayEarlyMinutes;
                totalOtherMinutes += dayOtherMinutes;
            }

            const totalExtraDeductibleMinutes = Math.max(0,
                totalLateMinutes + totalEarlyMinutes + (arOtherMinutes || 0) - graceMinutes - totalApprovedMinutes
            );

            // V2 FIX: Use prevMonthDivisorForCalc (e.g. 28 for Feb) not salary divisor
            // Matches Excel formula: H / prevMonthDays / workingHours * deductibleHours
            const prevMonthDivisorForCalc = new Date(effectiveLopOnlyDate).getDate();

            const extraLopPay = extraLopDays > 0 ? (prevMonthSalaryAmount / prevMonthDivisorForCalc) * extraLopDays : 0;

            const extraDeductibleHours = totalExtraDeductibleMinutes / 60;
            const prevMonthHourlyRate = prevMonthSalaryAmount / prevMonthDivisorForCalc / workingHours;
            const extraDeductibleHoursPay = prevMonthHourlyRate * extraDeductibleHours;

            return {
                extraDeductibleMinutes: totalExtraDeductibleMinutes,
                extraLopDays: extraLopDays,
                extraLopPay: Math.round(extraLopPay),
                extraDeductibleHoursPay: Math.round(extraDeductibleHoursPay),
                prevMonthDivisor: prevMonthDivisorForCalc,
                // V2: Return other_minutes separately so current month can be isolated
                extraOtherMinutes: arOtherMinutes || 0
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
        const companySettings = await base44.asServiceRole.entities.CompanySettings.filter({
            company: project.company
        }, null, 1);

        const includeAllEmployeesInSalary = companySettings.length > 0
            ? (companySettings[0].include_all_employees_in_salary || false)
            : false;

        const isAlMaraghiOrNaser = project.company === 'Al Maraghi Motors' ||
            project.company === 'Naser Mohsin Auto Parts';

        const shouldIncludeAllEmployees = isAlMaraghiOrNaser || includeAllEmployeesInSalary;

        console.log(`[createSalarySnapshots] COMPANY SALARY MODE: ${project.company}`);
        console.log(`[createSalarySnapshots]   Include All Employees in Salary: ${shouldIncludeAllEmployees ? 'YES' : 'NO'}`);

        // Filter employees to project's custom_employee_ids if specified
        let eligibleEmployees;

        if (project.custom_employee_ids && project.custom_employee_ids.trim()) {
            const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id);

            if (shouldIncludeAllEmployees) {
                eligibleEmployees = employees.filter(emp => {
                    return customIds.includes(String(emp.hrms_id)) ||
                        (emp.attendance_id && customIds.includes(String(emp.attendance_id)));
                });
            } else {
                eligibleEmployees = employees.filter(emp => {
                    const hasValidAttendanceId = emp.attendance_id &&
                        emp.attendance_id !== null &&
                        emp.attendance_id !== undefined &&
                        String(emp.attendance_id).trim() !== '';

                    if (!hasValidAttendanceId) return false;

                    return customIds.includes(String(emp.hrms_id)) ||
                        customIds.includes(String(emp.attendance_id));
                });
            }
        } else {
            if (shouldIncludeAllEmployees) {
                eligibleEmployees = employees;
            } else {
                eligibleEmployees = employees.filter(emp => {
                    const hasValidAttendanceId = emp.attendance_id &&
                        emp.attendance_id !== null &&
                        emp.attendance_id !== undefined &&
                        String(emp.attendance_id).trim() !== '';
                    return hasValidAttendanceId;
                });
            }
        }

        console.log(`[createSalarySnapshots] TOTAL ELIGIBLE EMPLOYEES: ${eligibleEmployees.length}`);

        // BATCH MODE: Process only a subset of employees
        const employeesToProcess = batch_mode
            ? eligibleEmployees.slice(batch_start, batch_start + batch_size)
            : eligibleEmployees;

        console.log(`[createSalarySnapshots] THIS BATCH: ${employeesToProcess.length} employees (indices ${batch_start} to ${batch_start + employeesToProcess.length - 1})`);

        let loopIterationCount = 0;
        let skippedCount = 0;
        const holdCreates = [];
        const holdUpdates = [];
        for (const emp of employeesToProcess) {
            loopIterationCount++;
            console.log(`[createSalarySnapshots] LOOP ${loopIterationCount}/${employeesToProcess.length}: Processing ${emp.name} (attendance_id: ${emp.attendance_id || 'NULL'}, hrms_id: ${emp.hrms_id})`);

            const employeeKey = String(emp.attendance_id || emp.hrms_id);
            if (existingSnapshotKeys.has(employeeKey)) {
                console.log(`[createSalarySnapshots] SKIP: Snapshot already exists for ${emp.name} (${employeeKey})`);
                continue;
            }

            const baseSalary = salaries.find(s =>
                String(s.employee_id) === String(emp.hrms_id) ||
                String(s.attendance_id) === String(emp.attendance_id)
            );

            if (!baseSalary) {
                console.log(`[createSalarySnapshots] SKIP: ${emp.name} (${emp.attendance_id || emp.hrms_id}) - no salary record found`);
                skippedCount++;
                continue;
            }

            // ============================================================
            // AL MARAGHI MOTORS: SALARY INCREMENT RESOLUTION
            // ============================================================
            let currentMonthSalary = { ...baseSalary };
            let prevMonthSalary = { ...baseSalary };

            if (isAlMaraghi && salaryIncrements.length > 0) {
                const empIncrements = salaryIncrements.filter(inc =>
                    String(inc.employee_id) === String(emp.hrms_id) ||
                    String(inc.attendance_id) === String(emp.attendance_id)
                );

                if (empIncrements.length > 0) {
                    const currentMonthStr = salaryMonthStartStr;
                    const applicableCurrentIncrements = empIncrements
                        .filter(inc => {
                            try {
                                return new Date(inc.effective_month) <= new Date(currentMonthStr);
                            } catch (e) {
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
                    }

                    if (hasExtraPrevMonthRange && extraPrevMonthFrom) {
                        const prevMonthDate = new Date(extraPrevMonthFrom);
                        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

                        const applicablePrevIncrements = empIncrements
                            .filter(inc => {
                                try {
                                    return new Date(inc.effective_month) <= new Date(prevMonthStr);
                                } catch (e) {
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
                        }
                    }
                }
            }

            const salary = currentMonthSalary;

            const analysisResult = emp.attendance_id
                ? analysisResults.find(r => String(r.attendance_id) === String(emp.attendance_id))
                : null;
            const hasAnalysisResult = !!analysisResult;

            let calculated;
            let attendanceSource;

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
                    ramadanGiftMinutes: Math.max(0, analysisResult.ramadan_gift_minutes || 0),
                    graceMinutes: analysisResult.grace_minutes ?? 15,
                    lopAdjacentWeeklyOffCount: analysisResult.lop_adjacent_weekly_off_count || 0
                };
                attendanceSource = 'ANALYZED';
                analyzedCount++;
            } else {
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
                    ramadanGiftMinutes: 0,
                    graceMinutes: 0,
                    lopAdjacentWeeklyOffCount: 0
                };
                attendanceSource = 'NO_ATTENDANCE_DATA';
                noAttendanceCount++;
            }

            const workingHours = salary?.working_hours || baseSalary?.working_hours || 9;
            const prevMonthTotalSalary = prevMonthSalary?.total_salary || currentMonthSalary.total_salary;

            let extraPrevMonthData = {
                extraDeductibleMinutes: 0,
                extraLopDays: 0,
                extraLopPay: 0,
                extraDeductibleHoursPay: 0,
                prevMonthDivisor: otDivisor
            };

            // V2: Count previous month LOP days from AnalysisResult
            let v2PrevMonthLopDays = 0;
            if (isAlMaraghi && hasExtraPrevMonthRange) {
                const ar = analysisResultMap[String(emp.attendance_id)];
                if (ar) {
                    if (ar.lop_dates) {
                        const lopList = String(ar.lop_dates)
                            .split(',')
                            .map(d => d.trim())
                            .filter(d => d.length >= 8);
                        v2PrevMonthLopDays += lopList.filter(d =>
                            d >= extraPrevMonthFrom && d <= extraPrevMonthTo
                        ).length;
                    }
                    if (ar.lop_adjacent_weekly_off_dates) {
                        const lopAdjList = String(ar.lop_adjacent_weekly_off_dates)
                            .split(',')
                            .map(d => d.trim())
                            .filter(d => d.length >= 8);
                        v2PrevMonthLopDays += lopAdjList.filter(d =>
                            d >= extraPrevMonthFrom && d <= extraPrevMonthTo
                        ).length;
                    }
                }
            }

            if (isAlMaraghi && hasExtraPrevMonthRange && emp.attendance_id) {
                extraPrevMonthData = calculateExtraPrevMonthData(emp, calculated.graceMinutes, prevMonthTotalSalary, workingHours, analysisResultMap[String(emp.attendance_id)]?.other_minutes || 0);
            }

            // V2: Override LOP days with AnalysisResult-derived count
            if (isAlMaraghi && hasExtraPrevMonthRange && v2PrevMonthLopDays > 0) {
                const prevDivisorForLop = extraPrevMonthData.prevMonthDivisor || otDivisor;
                const prevSalaryForCalc = prevMonthTotalSalary;
                extraPrevMonthData = {
                    ...extraPrevMonthData,
                    extraLopDays: v2PrevMonthLopDays,
                    extraLopPay: Math.round(
                        (prevSalaryForCalc / prevDivisorForLop) * v2PrevMonthLopDays
                    )
                };
                console.log(`[createSalarySnapshotsV2] Employee ${emp.attendance_id}: prev month LOP override — ${v2PrevMonthLopDays} days from AnalysisResult`);
            }

            // V2: Subtract prev month other_minutes from full range total
            // AnalysisResult.other_minutes covers the full project range (prev + current months)
            // We must isolate current month only so deductibleHours is not overstated
            // extraOtherMinutes comes from calculateExtraPrevMonthData scanning the overflow days
            if (isAlMaraghi && hasExtraPrevMonthRange) {
                const prevOther = extraPrevMonthData.extraOtherMinutes || 0;
                if (prevOther > 0) {
                    calculated.otherMinutes = Math.max(0,
                        (calculated.otherMinutes || 0) - prevOther
                    );
                    console.log(`[createSalarySnapshotsV2] Employee ${emp.attendance_id}: subtracted ${prevOther} prev month other_minutes from current month total`);
                }
            }

            const salaryLeaveDaysOverride = calculateSalaryLeaveDaysOverride(emp.attendance_id, allExceptions, project.date_from, project.date_to);

            const otRecord = allOvertimeData.find(ot =>
                (emp.attendance_id && String(ot.attendance_id) === String(emp.attendance_id)) ||
                String(ot.hrms_id) === String(emp.hrms_id)
            );

            const salaryInput = {
                employee: {
                    department: emp.department
                },
                salary: {
                    basic_salary: currentMonthSalary.basic_salary || 0,
                    allowances: currentMonthSalary.allowances || 0,
                    allowances_with_bonus: currentMonthSalary.allowances_with_bonus || 0,
                    total_salary: currentMonthSalary.total_salary || 0,
                    working_hours: workingHours
                },
                prevMonthSalary: {
                    total_salary: prevMonthTotalSalary
                },
                attendance: {
                    workingDays: calculated.workingDays,
                    presentDays: calculated.presentDays,
                    fullAbsenceCount: (calculated.fullAbsenceCount || 0) + (calculated.lopAdjacentWeeklyOffCount || 0),
                    halfAbsenceCount: calculated.halfAbsenceCount,
                    sickLeaveCount: calculated.sickLeaveCount,
                    annualLeaveCount: calculated.annualLeaveCount,
                    lateMinutes: calculated.lateMinutes,
                    earlyCheckoutMinutes: calculated.earlyCheckoutMinutes,
                    otherMinutes: (calculated.otherMinutes || 0),
                    approvedMinutes: calculated.approvedMinutes,
                    deductibleMinutes: (calculated.deductibleMinutes || 0),
                    ramadanGiftMinutes: (calculated.ramadanGiftMinutes || 0),
                    graceMinutes: (calculated.graceMinutes || 15),
                    salaryLeaveDays: (salaryLeaveDaysOverride > 0 ? salaryLeaveDaysOverride : calculated.annualLeaveCount),
                    lopLeaveDays: Math.max(0, (calculated.annualLeaveCount || 0) - (salaryLeaveDaysOverride > 0 ? salaryLeaveDaysOverride : calculated.annualLeaveCount))
                },
                adjustments: (() => {
                    const employeeHolds = allHolds.filter(h =>
                        String(h.hrms_id) === String(emp.hrms_id) ||
                        String(h.employee_id) === String(emp.id)
                    );

                    let releasedHoldAmount = 0;
                    const activeHolds = employeeHolds.filter(h => h.status === 'ON_HOLD');

                    const isEmployeePresent = (calculated.presentDays || 0) > 0;
                    if (isEmployeePresent && activeHolds.length > 0) {
                        for (const hold of activeHolds) {
                            const isHoldFromPreviousPeriod = hold.origin_period_end < project.date_from;
                            const hasPositiveAmount = (hold.amount || 0) > 0;

                            if (isHoldFromPreviousPeriod && hasPositiveAmount && hold.source === 'AUTO') {
                                releasedHoldAmount += (hold.amount || 0);
                                holdUpdates.push({
                                    id: hold.id,
                                    status: 'RELEASED',
                                    release_period_start: project.date_from,
                                    release_period_end: project.date_to,
                                    release_report_id: report_run_id,
                                    updated_date: new Date().toISOString()
                                });
                            }
                        }
                    }

                    let openLeaveSalary = isAlMaraghi ? parseAdjustmentValue(otRecord?.open_leave_salary) : 0;

                    const joiningDateStr = emp.joining_date;
                    const referenceDate = new Date(project.date_to);
                    const joiningDate = joiningDateStr ? new Date(joiningDateStr) : null;
                    let serviceYears = null;
                    if (joiningDate && !isNaN(joiningDate.getTime())) {
                        serviceYears = (referenceDate.getTime() - joiningDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                    }

                    const annualLeaveSpansFuture = allExceptions.some(ex =>
                        ex.type === 'ANNUAL_LEAVE' &&
                        String(ex.attendance_id) === String(emp.attendance_id) &&
                        ex.date_to > project.date_to
                    );

                    if (joiningDateStr && serviceYears !== null && serviceYears < 2.0 && annualLeaveSpansFuture && openLeaveSalary > 0) {
                        const holdAmount = openLeaveSalary;
                        const autoKey = `${emp.hrms_id}_LEAVE_DEFERRAL_UNDER_TWO_YEARS_${project.date_from}_${project.date_to}_AUTO`;
                        const existingAutoHold = activeHolds.find(h => h.auto_key === autoKey);

                        if (!existingAutoHold) {
                            holdCreates.push({
                                employee_id: emp.id,
                                hrms_id: String(emp.hrms_id || ''),
                                employee_name: emp.name,
                                company: project.company,
                                hold_type: 'LEAVE_DEFERRAL',
                                reason_code: 'UNDER_TWO_YEARS_REJOIN_PENDING',
                                amount: holdAmount,
                                source: 'AUTO',
                                status: 'ON_HOLD',
                                origin_period_start: project.date_from,
                                origin_period_end: project.date_to,
                                auto_key: autoKey,
                                created_date: new Date().toISOString()
                            });
                        } else if (Number(existingAutoHold.amount) !== Number(holdAmount)) {
                            holdUpdates.push({
                                id: existingAutoHold.id,
                                amount: holdAmount,
                                updated_date: new Date().toISOString()
                            });
                        }
                        openLeaveSalary = 0;
                    }

                    return {
                        normalOtHours: (otRecord?.normalOtHours || 0),
                        specialOtHours: (otRecord?.specialOtHours || 0),
                        bonus: parseAdjustmentValue(otRecord?.bonus),
                        incentive: parseAdjustmentValue(otRecord?.incentive),
                        open_leave_salary: openLeaveSalary + releasedHoldAmount,
                        variable_salary: isAlMaraghi ? parseAdjustmentValue(otRecord?.variable_salary) : 0,
                        otherDeduction: parseAdjustmentValue(otRecord?.otherDeduction),
                        advanceSalaryDeduction: parseAdjustmentValue(otRecord?.advanceSalaryDeduction)
                    };
                })(),
                settings: {
                    isAlMaraghi,
                    divisor,
                    otDivisor,
                    prevMonthDivisor: extraPrevMonthData.prevMonthDivisor || otDivisor,
                    otNormalRate,
                    otSpecialRate,
                    wpsCapEnabled: salary.wps_cap_enabled ?? wpsCapEnabledGlobal,
                    wpsCapAmount: salary.wps_cap_amount ?? wpsCapAmountGlobal,
                    balanceRoundingRule,
                    leavePayFormula,
                    salaryLeaveFormula
                }
            };

            const computed = calculateEmployeeSalary(salaryInput);

            console.log(`[createSalarySnapshots] Snapshot computed for ${emp.name} - Total: ${computed.total}, WPS: ${computed.wpsPay}, OT: ${computed.totalOtSalary}`);

            snapshots.push({
                project_id: String(project_id),
                report_run_id: String(report_run_id),
                attendance_id: emp.attendance_id ? String(emp.attendance_id) : null,
                hrms_id: String(emp.hrms_id),
                name: emp.name,
                department: emp.department,
                basic_salary: computed.basic_salary,
                allowances: computed.allowances,
                allowances_with_bonus: computed.allowances_with_bonus,
                total_salary: computed.total_salary,
                working_hours: computed.working_hours,
                working_days: computed.working_days,
                salary_divisor: computed.salary_divisor,
                ot_divisor: computed.ot_divisor,
                prev_month_divisor: computed.prev_month_divisor,
                present_days: computed.present_days,
                full_absence_count: computed.full_absence_count,
                annual_leave_count: computed.annual_leave_count,
                sick_leave_count: computed.sick_leave_count,
                late_minutes: computed.late_minutes,
                early_checkout_minutes: computed.early_checkout_minutes,
                other_minutes: computed.other_minutes,
                approved_minutes: computed.approved_minutes,
                grace_minutes: computed.grace_minutes,
                deductible_minutes: computed.deductible_minutes,
                ramadan_gift_minutes: computed.ramadan_gift_minutes,
                // V2: Previous month fields populated from AnalysisResult + overflow calculation
                extra_prev_month_deductible_minutes: (isAlMaraghi && hasExtraPrevMonthRange)
                    ? (extraPrevMonthData.extraDeductibleMinutes || 0) : 0,
                extra_prev_month_lop_days: (isAlMaraghi && hasExtraPrevMonthRange)
                    ? (extraPrevMonthData.extraLopDays || 0) : 0,
                extra_prev_month_lop_pay: (isAlMaraghi && hasExtraPrevMonthRange)
                    ? (extraPrevMonthData.extraLopPay || 0) : 0,
                extra_prev_month_deductible_hours_pay: (isAlMaraghi && hasExtraPrevMonthRange)
                    ? (extraPrevMonthData.extraDeductibleHoursPay || 0) : 0,
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                salary_leave_days: computed.salary_leave_days,
                leaveDays: computed.leaveDays,
                leavePay: computed.leavePay,
                salaryLeaveAmount: computed.salaryLeaveAmount,
                deductibleHours: computed.deductibleHours,
                deductibleHoursPay: computed.deductibleHoursPay,
                netDeduction: computed.netDeduction,
                normalOtHours: computed.normalOtHours,
                normalOtSalary: computed.normalOtSalary,
                specialOtHours: computed.specialOtHours,
                specialOtSalary: computed.specialOtSalary,
                totalOtSalary: computed.totalOtSalary,
                otherDeduction: computed.otherDeduction,
                bonus: computed.bonus,
                incentive: computed.incentive,
                open_leave_salary: computed.open_leave_salary,
                variable_salary: computed.variable_salary,
                advanceSalaryDeduction: computed.advanceSalaryDeduction,
                total: computed.total,
                wpsPay: computed.wpsPay,
                balance: computed.balance,
                wps_cap_enabled: computed.wps_cap_enabled,
                wps_cap_amount: computed.wps_cap_amount,
                wps_cap_applied: computed.wps_cap_applied,
                snapshot_created_at: new Date().toISOString(),
                attendance_source: attendanceSource
            });

            existingSnapshotKeys.add(employeeKey);
            console.log(`[createSalarySnapshots] Snapshot added (${snapshots.length} total so far)`);
        }

        console.log(`[createSalarySnapshots] FOR LOOP EXITED. Total iterations: ${loopIterationCount}, Snapshots: ${snapshots.length}`);

        // ============================================
        // PERSIST PAYROLL HOLDS
        // ============================================
        if (holdCreates.length > 0) {
            console.log(`[createSalarySnapshots] Persisting ${holdCreates.length} new auto holds...`);
            await base44.asServiceRole.entities.PayrollHold.bulkCreate(holdCreates);
        }
        if (holdUpdates.length > 0) {
            console.log(`[createSalarySnapshots] Updating ${holdUpdates.length} holds (releases)...`);
            for (const update of holdUpdates) {
                await base44.asServiceRole.entities.PayrollHold.update(update.id, update);
            }
        }

        // BATCH MODE: Process in chunks for progress tracking
        if (batch_mode) {
            if (snapshots.length > 0) {
                await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(snapshots);
                console.log(`[createSalarySnapshots] bulkCreate completed for ${snapshots.length} snapshots`);
            }

            const currentPosition = batch_start + employeesToProcess.length;
            const hasMore = currentPosition < eligibleEmployees.length;

            return Response.json({
                success: true,
                batch_mode: true,
                batch_completed: snapshots.length,
                batch_processed: employeesToProcess.length,
                total_employees: eligibleEmployees.length,
                current_position: currentPosition,
                has_more: hasMore,
                current_batch: snapshots.map(s => ({ attendance_id: s.attendance_id, name: s.name }))
            });
        }

        // STANDARD MODE: Bulk create all snapshots at once
        if (snapshots.length > 0) {
            const CHUNK_SIZE = 100;
            for (let i = 0; i < snapshots.length; i += CHUNK_SIZE) {
                const chunk = snapshots.slice(i, i + CHUNK_SIZE);
                await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(chunk);
            }
            console.log(`[createSalarySnapshots] Successfully created ${snapshots.length} snapshots`);
        } else {
            console.warn(`[createSalarySnapshots] WARNING: No snapshots created - no eligible employees found`);
        }

        const totalSnapshotKeysAfterRun = existingSnapshotKeys.size;

        if (!batch_mode && (snapshots.length + skippedCount) !== eligibleEmployees.length) {
            const missingCount = eligibleEmployees.length - snapshots.length - skippedCount;
            const errorMsg = `INVARIANT VIOLATION: Expected ${eligibleEmployees.length} employees processed, but only ${snapshots.length} snapshots created + ${skippedCount} skipped (${missingCount} unaccounted for)`;
            console.error(`[createSalarySnapshots] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        return Response.json({
            success: true,
            snapshots_created: snapshots.length,
            total_snapshots_after_run: totalSnapshotKeysAfterRun,
            analyzed_count: analyzedCount,
            no_attendance_count: noAttendanceCount,
            employees_count: eligibleEmployees.length,
            message: `Created ${snapshots.length} new salary snapshots (${analyzedCount} analyzed, ${noAttendanceCount} no attendance data)`
        });

    } catch (error) {
        console.error('[createSalarySnapshots] ERROR CAUGHT:', error);
        console.error('[createSalarySnapshots] Error message:', error.message);
        return Response.json({
            error: error.message
        }, { status: 500 });
    }
});