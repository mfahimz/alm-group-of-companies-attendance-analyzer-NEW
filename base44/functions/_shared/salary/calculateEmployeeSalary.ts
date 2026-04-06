
/**
 * PURE CALCULATION HELPER
 * 
 * This file contains the canonical salary calculation logic for Al Maraghi Motors.
 * It must remain pure business logic: no Base44 entity I/O, no Deno.serve, no HTTP handling.
 */

export interface SalaryCalculationInput {
    employee: {
        department?: string;
    };
    salary: {
        basic_salary: number;
        allowances: number;
        allowances_with_bonus: number;
        total_salary: number;
        working_hours: number;
    };
    prevMonthSalary: {
        total_salary: number;
    };
    attendance: {
        workingDays: number;
        presentDays: number;
        fullAbsenceCount: number;
        halfAbsenceCount: number;
        sickLeaveCount: number;
        annualLeaveCount: number;
        lateMinutes: number;
        earlyCheckoutMinutes: number;
        otherMinutes: number;
        approvedMinutes: number;
        deductibleMinutes: number;
        ramadanGiftMinutes: number;
        graceMinutes: number;
        salaryLeaveDays: number;
    };
    adjustments: {
        normalOtHours: number;
        specialOtHours: number;
        bonus: number;
        incentive: number;
        open_leave_salary: number;
        variable_salary: number;
        otherDeduction: number;
        advanceSalaryDeduction: number;
    };
    settings: {
        isAlMaraghi: boolean;
        divisor: number;
        otDivisor: number;
        prevMonthDivisor: number;
        otNormalRate: number;
        otSpecialRate: number;
        wpsCapEnabled: boolean;
        wpsCapAmount: number;
        balanceRoundingRule: string; // 'EXACT' | 'NEAREST_100'
        leavePayFormula: string; // 'TOTAL_SALARY' | 'BASIC_PLUS_ALLOWANCES'
        salaryLeaveFormula: string; // 'TOTAL_SALARY' | 'BASIC_PLUS_ALLOWANCES'
    };
}

export interface ComputedSalaryOutput {
    // Basic fields
    basic_salary: number;
    allowances: number;
    allowances_with_bonus: number;
    total_salary: number;
    working_hours: number;
    working_days: number;
    salary_divisor: number;
    ot_divisor: number;
    prev_month_divisor: number;

    // Attendance fields (copied from input for snapshot convenience)
    present_days: number;
    full_absence_count: number;
    annual_leave_count: number;
    sick_leave_count: number;
    late_minutes: number;
    early_checkout_minutes: number;
    other_minutes: number;
    approved_minutes: number;
    grace_minutes: number;
    deductible_minutes: number;
    ramadan_gift_minutes: number;
    salary_leave_days: number;

    // Computed monetary fields
    leaveDays: number;
    leavePay: number;
    salaryLeaveAmount: number;
    netDeduction: number;
    deductibleHours: number;
    deductibleHoursPay: number;

    // OT fields
    normalOtHours: number;
    normalOtSalary: number;
    specialOtHours: number;
    specialOtSalary: number;
    totalOtSalary: number;

    // Adjustment fields
    bonus: number;
    incentive: number;
    open_leave_salary: number;
    variable_salary: number;
    otherDeduction: number;
    advanceSalaryDeduction: number;

    // Final totals
    total: number;
    wpsPay: number;
    balance: number;
    wps_cap_enabled: boolean;
    wps_cap_amount: number;
    wps_cap_applied: boolean;
}

/**
 * Parses adjustment values from OvertimeData (handles JSON arrays or legacy numbers)
 */
export const parseAdjustmentValue = (value: any): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Math.max(0, value);
    
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    const total = parsed.reduce((sum: number, item: any) => {
                        const amount = Number(item?.amount);
                        return sum + (isNaN(amount) ? 0 : amount);
                    }, 0);
                    return Math.max(0, total);
                }
            } catch (e) {
                // Parsing failed, fall through to numeric parse
            }
        }
        const num = parseFloat(trimmed);
        return isNaN(num) ? 0 : Math.max(0, num);
    }
    return 0;
};

/**
 * Calculates salary leave days override based on ANNUAL_LEAVE exceptions
 */
export const calculateSalaryLeaveDaysOverride = (
    empAttendanceId: string | number,
    allExceptions: any[],
    dateFrom: string,
    dateTo: string
): number => {
    const attendanceIdStr = String(empAttendanceId);
    const startDate = new Date(dateFrom);
    const endDate = new Date(dateTo);

    const annualLeaveExceptions = allExceptions.filter(e =>
        e.type === 'ANNUAL_LEAVE' &&
        (String(e.attendance_id) === 'ALL' || String(e.attendance_id) === attendanceIdStr) &&
        e.use_in_analysis !== false &&
        e.is_custom_type !== true
    );

    const calculateInclusiveDays = (fromDate: Date, toDate: Date) => {
        const msPerDay = 24 * 60 * 60 * 1000;
        return Math.floor((toDate.getTime() - fromDate.getTime()) / msPerDay) + 1;
    };

    let totalSalaryLeaveDays = 0;

    for (const ex of annualLeaveExceptions) {
        try {
            const exFrom = new Date(ex.date_from);
            const exTo = new Date(ex.date_to);

            if (Number.isNaN(exFrom.getTime()) || Number.isNaN(exTo.getTime()) || exFrom > exTo) {
                continue;
            }

            const overlapStart = exFrom < startDate ? startDate : exFrom;
            const overlapEnd = exTo > endDate ? endDate : exTo;
            if (overlapStart > overlapEnd) {
                continue;
            }

            const exceptionTotalDays = calculateInclusiveDays(exFrom, exTo);
            const overlapDays = calculateInclusiveDays(overlapStart, overlapEnd);
            if (exceptionTotalDays <= 0 || overlapDays <= 0) {
                continue;
            }

            const configuredSalaryLeaveDays = Number(ex.salary_leave_days);
            const baseSalaryLeaveDays = Number.isFinite(configuredSalaryLeaveDays)
                ? configuredSalaryLeaveDays
                : exceptionTotalDays;

            totalSalaryLeaveDays += (baseSalaryLeaveDays / exceptionTotalDays) * overlapDays;
        } catch {
            // Ignore invalid exception rows
        }
    }

    return Math.round(totalSalaryLeaveDays * 100) / 100;
};

/**
 * THE CANONICAL SALARY CALCULATION FUNCTION
 */
export function calculateEmployeeSalary(input: SalaryCalculationInput): ComputedSalaryOutput {
    const {
        employee,
        salary,
        prevMonthSalary,
        attendance,
        adjustments,
        settings
    } = input;

    const {
        isAlMaraghi,
        divisor,
        otDivisor,
        otNormalRate,
        otSpecialRate,
        wpsCapEnabled,
        wpsCapAmount,
        balanceRoundingRule,
        leavePayFormula,
        salaryLeaveFormula
    } = settings;

    // Component mapping for clarity
    const basicSalary = salary.basic_salary || 0;
    const allowancesAmount = salary.allowances || 0;
    const allowancesWithBonus = salary.allowances_with_bonus || 0;
    const totalSalaryAmount = salary.total_salary || 0;
    const workingHours = salary.working_hours || 9;

    const prevMonthTotalSalary = prevMonthSalary.total_salary || totalSalaryAmount;

    // Leave values
    const leaveDays = (attendance.annualLeaveCount || 0) + (attendance.fullAbsenceCount || 0);
    const salaryLeaveDays = attendance.salaryLeaveDays || 0;

    // Leave Pay Formula
    const leavePayBase = leavePayFormula === 'BASIC_PLUS_ALLOWANCES'
        ? (basicSalary + allowancesAmount)
        : totalSalaryAmount;
    const rawLeavePay = leaveDays > 0 ? (leavePayBase / divisor) * leaveDays : 0;
    const leavePay = Math.round(rawLeavePay);

    // Salary Leave Amount Formula
    const salaryLeaveBase = salaryLeaveFormula === 'BASIC_PLUS_ALLOWANCES'
        ? (basicSalary + allowancesAmount)
        : totalSalaryAmount;
    const rawSalaryLeaveAmount = salaryLeaveDays > 0 ? (salaryLeaveBase / divisor) * salaryLeaveDays : 0;
    
    // For 9-working-hour employees: round up to nearest multiple of 5
    const is9HourEmployee = workingHours === 9;
    const salaryLeaveAmount = is9HourEmployee
        ? Math.ceil(rawSalaryLeaveAmount / 5) * 5
        : Math.round(rawSalaryLeaveAmount);

    const netDeduction = Math.round(Math.max(0, leavePay - salaryLeaveAmount) * 100) / 100;

    // Deductible counts
    const finalizedDeductibleMinutes = Math.max(0, (attendance.deductibleMinutes || 0) - (attendance.ramadanGiftMinutes || 0));
    const finalizedOtherMinutes = Math.max(0, attendance.otherMinutes || 0);
    const payrollDeductibleMinutes = finalizedDeductibleMinutes + finalizedOtherMinutes;
    const deductibleHours = Math.round((payrollDeductibleMinutes / 60) * 100) / 100;

    // Current month hourly rate
    const hourlyRate = Math.round((totalSalaryAmount / divisor / workingHours) * 100) / 100;
    const currentMonthDeductibleHoursPay = Math.round(hourlyRate * deductibleHours);

    // OT Hourly Rate (uses previous month salary for historical accuracy)
    const otHourlyRate = prevMonthTotalSalary / otDivisor / workingHours;

    const normalOtSalary = Math.round(otHourlyRate * otNormalRate * adjustments.normalOtHours);
    const specialOtSalary = Math.round(otHourlyRate * otSpecialRate * adjustments.specialOtHours);
    const totalOtSalary = normalOtSalary + specialOtSalary;

    // INCENTIVE vs OVERTIME RULE (Operations Dept)
    const isOperationsDept = employee.department === 'Operations';
    const effectiveOtOrIncentive = isOperationsDept
        ? Math.max(
            Math.round(totalOtSalary * 100) / 100,
            Math.round(adjustments.incentive * 100) / 100
        )
        : Math.round(totalOtSalary * 100) / 100 + Math.round(adjustments.incentive * 100) / 100;

    // Final Total grouping
    const netAdditions = adjustments.bonus + effectiveOtOrIncentive + adjustments.open_leave_salary + adjustments.variable_salary;
    const netDeductions = Math.round((
        netDeduction +
        currentMonthDeductibleHoursPay +
        adjustments.otherDeduction +
        adjustments.advanceSalaryDeduction
    ) * 100) / 100;

    const totalWithAdjustments = Math.round((totalSalaryAmount + netAdditions - netDeductions) * 100) / 100;

    // WPS SPLIT logic
    let finalWpsAmount = totalWithAdjustments;
    let finalBalanceAmount = 0;
    let finalWpsCapApplied = false;

    if (wpsCapEnabled) {
        if (totalWithAdjustments <= 0) {
            finalWpsAmount = 0;
            finalBalanceAmount = 0;
            finalWpsCapApplied = false;
        } else {
            const rawExcess = Math.max(0, totalWithAdjustments - wpsCapAmount);

            if (balanceRoundingRule === 'NEAREST_100') {
                finalBalanceAmount = Math.round((Math.floor(rawExcess / 100) * 100) * 100) / 100;
            } else if (balanceRoundingRule === 'UP_TO_100') {
                finalBalanceAmount = rawExcess > 0 ? Math.ceil(rawExcess / 100) * 100 : 0;
            } else {
                // Default handling based on Al Maraghi logic
                // In createSalarySnapshots, it was Math.ceil(rawExcess / 100) * 100
                // In recalculateSalarySnapshot, it was Math.floor(rawExcess / 100) * 100
                // We MUST maintain the Al Maraghi creation logic as canonical
                finalBalanceAmount = rawExcess > 0 ? Math.ceil(rawExcess / 100) * 100 : 0;
            }

            finalWpsAmount = Math.round((totalWithAdjustments - finalBalanceAmount) * 100) / 100;
            finalWpsCapApplied = rawExcess > 0;
        }
    } else if (totalWithAdjustments <= 0) {
        finalWpsAmount = 0;
        finalBalanceAmount = 0;
    }

    // Return the complete output
    return {
        basic_salary: basicSalary,
        allowances: allowancesAmount,
        allowances_with_bonus: allowancesWithBonus,
        total_salary: totalSalaryAmount,
        working_hours: workingHours,
        working_days: attendance.workingDays,
        salary_divisor: divisor,
        ot_divisor: otDivisor,
        prev_month_divisor: settings.prevMonthDivisor,

        present_days: attendance.presentDays,
        full_absence_count: attendance.fullAbsenceCount,
        annual_leave_count: attendance.annualLeaveCount,
        sick_leave_count: attendance.sickLeaveCount,
        late_minutes: attendance.lateMinutes,
        early_checkout_minutes: attendance.earlyCheckoutMinutes,
        other_minutes: finalizedOtherMinutes,
        approved_minutes: attendance.approvedMinutes,
        grace_minutes: attendance.graceMinutes,
        deductible_minutes: finalizedDeductibleMinutes,
        ramadan_gift_minutes: attendance.ramadanGiftMinutes,
        salary_leave_days: salaryLeaveDays,

        leaveDays,
        leavePay,
        salaryLeaveAmount,
        netDeduction,
        deductibleHours,
        deductibleHoursPay: currentMonthDeductibleHoursPay,

        normalOtHours: adjustments.normalOtHours,
        normalOtSalary,
        specialOtHours: adjustments.specialOtHours,
        specialOtSalary,
        totalOtSalary,

        bonus: adjustments.bonus,
        incentive: adjustments.incentive,
        open_leave_salary: adjustments.open_leave_salary,
        variable_salary: adjustments.variable_salary,
        otherDeduction: adjustments.otherDeduction,
        advanceSalaryDeduction: adjustments.advanceSalaryDeduction,

        total: totalWithAdjustments,
        wpsPay: finalWpsAmount,
        balance: finalBalanceAmount,
        wps_cap_enabled: wpsCapEnabled,
        wps_cap_amount: wpsCapAmount,
        wps_cap_applied: finalWpsCapApplied
    };
}
