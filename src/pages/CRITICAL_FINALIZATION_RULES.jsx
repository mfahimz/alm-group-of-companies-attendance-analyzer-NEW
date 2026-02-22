/**
 * =====================================================
 * CRITICAL FINALIZATION RULES - PERMANENT LOCK
 * =====================================================
 * 
 * Status: PRODUCTION-LOCKED
 * Date: 2026-02-02
 * Owner: System Architect
 * 
 * These rules are ABSOLUTE and MUST NEVER be violated by any code change.
 * Any deviation from these rules will cause production failures and payroll errors.
 * 
 * =====================================================
 * RULE #1: PERMANENT LOCK - FINALIZED REPORTS
 * =====================================================
 * 
 * Once a ReportRun is marked as finalized (is_final = true):
 * 
 * ✅ ALLOWED:
 * - Read AnalysisResult data
 * - Create SalarySnapshot from AnalysisResult (1:1 copy)
 * - Generate SalaryReport from SalarySnapshot
 * - Edit OT/Bonus/Deductions in SalarySnapshot (post-finalization adjustments)
 * - Recalculate salary totals using fixed attendance + editable adjustments
 * 
 * ❌ FORBIDDEN:
 * - Recalculate attendance data (present days, LOP, late minutes, etc.)
 * - Modify AnalysisResult records after finalization
 * - Apply day_overrides or exceptions to finalized data
 * - Recompute deductible_minutes from raw punches
 * - Use UI-side attendance recalculation logic
 * - Apply custom date range filtering to attendance metrics
 * - Fallback to zero or default values for finalized fields
 * 
 * CONSEQUENCE OF VIOLATION: Salary snapshots will contain incorrect attendance 
 * values, leading to wrong salary calculations and payroll errors.
 * 
 * =====================================================
 * RULE #2: DATA PIPELINE - IMMUTABLE FLOW
 * =====================================================
 * 
 * The data pipeline is ONE-WAY and IMMUTABLE after finalization:
 * 
 * Step 1: ANALYSIS (Pre-Finalization)
 * ────────────────────────────────────
 * Punches + Shifts + Exceptions → [ANALYSIS ENGINE] → AnalysisResult
 * 
 * ANALYSIS CAN BE RE-RUN BEFORE FINALIZATION
 * ANALYSIS CANNOT BE RE-RUN AFTER FINALIZATION
 * 
 * Step 2: FINALIZATION (One-Time Lock)
 * ─────────────────────────────────────
 * AnalysisResult → [SNAPSHOT CREATION] → SalarySnapshot
 * ReportRun.is_final = true
 * 
 * THIS IS A ONE-WAY OPERATION
 * ONCE FINALIZED, ATTENDANCE DATA IS LOCKED FOREVER
 * 
 * Step 3: SALARY GENERATION (Uses Locked Data)
 * ─────────────────────────────────────────────
 * SalarySnapshot → [OT + ADJUSTMENTS] → SalaryReport
 * 
 * ONLY OT/BONUS/DEDUCTIONS CAN CHANGE
 * ATTENDANCE VALUES REMAIN FROZEN
 * 
 * Step 4: SALARY EDITING (Post-Finalization)
 * ───────────────────────────────────────────
 * SalarySnapshot → [ADMIN EDITS] → Updated SalarySnapshot
 * 
 * EDITABLE: normalOtHours, specialOtHours, bonus, incentive, 
 *           otherDeduction, advanceSalaryDeduction
 * IMMUTABLE: present_days, full_absence_count, deductible_minutes,
 *            leavePay, salaryLeaveAmount, netDeduction, deductibleHoursPay
 * 
 * =====================================================
 * RULE #3: SNAPSHOT CREATION - 1:1 COPY ONLY
 * =====================================================
 * 
 * Function: createSalarySnapshots.js
 * 
 * When creating SalarySnapshot from AnalysisResult:
 * 
 * MANDATORY BEHAVIOR:
 * 1. Find AnalysisResult for the finalized report_run_id
 * 2. Copy ALL attendance fields EXACTLY as stored (1:1 copy)
 * 3. NO recalculation, NO day_overrides processing
 * 4. NO custom date range filtering
 * 5. NO fallback logic for missing fields
 * 
 * CODE PATTERN (REQUIRED):
 * ```javascript
 * const analysisResult = analysisResults.find(r => 
 *     String(r.attendance_id) === String(emp.attendance_id)
 * );
 * 
 * if (hasAnalysisResult) {
 *     calculated = {
 *         workingDays: analysisResult.working_days || 0,
 *         presentDays: analysisResult.present_days || 0,
 *         fullAbsenceCount: analysisResult.full_absence_count || 0,
 *         // ... 1:1 copy of ALL fields
 *         deductibleMinutes: analysisResult.deductible_minutes || 0,
 *         graceMinutes: analysisResult.grace_minutes ?? 15
 *     };
 *     attendanceSource = 'ANALYZED';
 * }
 * ```
 * 
 * FORBIDDEN PATTERNS:
 * - recalculateEmployeeAttendance(emp, dateFrom, dateTo) ❌
 * - Filtering punches by custom date range ❌
 * - Applying day_overrides or exceptions ❌
 * - Computing working_days from scratch ❌
 * 
 * =====================================================
 * RULE #4: NO ATTENDANCE RECALCULATION IN SALARY
 * =====================================================
 * 
 * Files: SalaryTab.jsx, SalaryReportDetail.jsx, createSalarySnapshots.js
 * 
 * MANDATORY:
 * - Use SalarySnapshot.present_days (from finalized AnalysisResult)
 * - Use SalarySnapshot.full_absence_count (from finalized AnalysisResult)
 * - Use SalarySnapshot.deductible_minutes (from finalized AnalysisResult)
 * - Use SalarySnapshot.leavePay (calculated at finalization)
 * - Use SalarySnapshot.deductibleHoursPay (calculated at finalization)
 * 
 * FORBIDDEN:
 * - Calling recalculateEmployeeAttendance() in salary context
 * - Filtering exceptions by custom date range
 * - Recomputing working_days or present_days
 * - Applying grace_minutes logic after finalization
 * - Custom date range attendance recalculation
 * 
 * EXCEPTION: OT hours and adjustments CAN be recalculated because they 
 * are not attendance data, they are post-finalization salary adjustments.
 * 
 * =====================================================
 * RULE #5: CUSTOM DATE RANGE - DISPLAY ONLY
 * =====================================================
 * 
 * When generating SalaryReport with custom date_from/date_to:
 * 
 * THESE DATES ARE METADATA ONLY:
 * - Report header display
 * - Excel filename
 * - Report organization
 * - User reference
 * 
 * THESE DATES MUST NOT:
 * - Filter attendance data
 * - Trigger attendance recalculation
 * - Change working_days or present_days
 * - Filter exceptions by date
 * - Modify deductible_minutes
 * 
 * The salary report ALWAYS uses the FULL finalized attendance period data,
 * regardless of the custom date range selected for report display.
 * 
 * =====================================================
 * RULE #6: AL MARAGHI MOTORS - ASSUMED PRESENT DAYS
 * =====================================================
 * 
 * Company: Al Maraghi Motors
 * Rule: Last 2 days of salary month are "assumed present" for salary calculation
 * 
 * WHEN THIS RULE APPLIES:
 * - During snapshot creation (createSalarySnapshots.js)
 * - ONLY if company === 'Al Maraghi Motors'
 * - ONLY for the last 2 days of the month containing project.date_to
 * 
 * WHAT IT DOES:
 * - For those 2 days: NO LOP, NO late minutes, NO early checkout minutes
 * - Days are counted as fully present for salary calculation
 * 
 * EXCEPTION TO THE RULE:
 * - If employee has ANNUAL_LEAVE on those days, honor the leave
 * - Do NOT apply "assumed present" logic if annual leave exists
 * 
 * IMPLEMENTATION LOCATION:
 * - createSalarySnapshots.js lines 78-98 (assumedPresentDays calculation)
 * - createSalarySnapshots.js lines 361-381 (application during attendance recalc)
 * 
 * THIS RULE MUST NEVER BE APPLIED IN:
 * - runAnalysis.js (regular attendance analysis)
 * - SalaryTab.jsx (salary report generation)
 * - Any frontend recalculation logic
 * 
 * =====================================================
 * RULE #7: ERROR PREVENTION - VALIDATION GATES
 * =====================================================
 * 
 * BEFORE FINALIZATION (markFinalReport.js):
 * 1. Verify ReportRun exists and belongs to project
 * 2. Verify AnalysisResult count matches expected employee count
 * 3. Verify no other report is marked as final for this project
 * 4. Verify project is in correct state (not closed)
 * 
 * AFTER FINALIZATION (createSalarySnapshots.js):
 * 1. Verify all active employees with salary records have snapshots
 * 2. Verify snapshot count matches eligible employee count
 * 3. Log any employees with NO_ATTENDANCE_DATA source
 * 
 * BEFORE SALARY GENERATION (SalaryTab.jsx):
 * 1. Verify finalReport exists and is_final === true
 * 2. Verify salarySnapshots are loaded and non-empty
 * 3. Verify salarySnapshots.length matches finalReport.employee_count
 * 4. Show blocking error if validation fails
 * 
 * CONSEQUENCE OF SKIPPING VALIDATION: Silent data corruption, 
 * incorrect salary calculations, missing employee records.
 * 
 * =====================================================
 * RULE #8: ROUNDING - 2 DECIMAL PLACES EVERYWHERE
 * =====================================================
 * 
 * ALL monetary values MUST be rounded to 2 decimal places:
 * 
 * FORMULA: Math.round(value * 100) / 100
 * 
 * APPLY ROUNDING TO:
 * - leavePay
 * - salaryLeaveAmount
 * - netDeduction
 * - deductibleHoursPay
 * - normalOtSalary
 * - specialOtSalary
 * - total (final salary)
 * - wpsPay
 * - balance
 * 
 * DO NOT ROUND:
 * - User-entered adjustments (bonus, incentive, otherDeduction, advanceSalaryDeduction)
 * - These are stored exactly as entered by user
 * 
 * ROUNDING LOCATION:
 * - createSalarySnapshots.js (initial snapshot creation)
 * - SalaryTab.jsx (report generation)
 * - SalaryReportDetail.jsx (individual edits)
 * - recalculateSalarySnapshot.js (recalculation)
 * 
 * =====================================================
 * RULE #9: WPS CAP - AL MARAGHI MOTORS ONLY
 * =====================================================
 * 
 * WPS (Wages Protection System) cap is company-specific:
 * 
 * Company: Al Maraghi Motors
 * Default Cap: 4900 AED
 * 
 * LOGIC:
 * 1. Check if EmployeeSalary.wps_cap_enabled === true
 * 2. If total > wps_cap_amount:
 *    - Calculate excess = total - cap
 *    - Round balance DOWN to nearest 100: Math.floor(excess / 100) * 100
 *    - WPS pay = total - balance
 *    - Set wps_cap_applied = true
 * 3. If total <= wps_cap_amount:
 *    - WPS pay = total
 *    - Balance = 0
 *    - Set wps_cap_applied = false
 * 
 * IMPLEMENTATION LOCATIONS:
 * - createSalarySnapshots.js (initial snapshot)
 * - SalaryReportDetail.jsx (individual edits)
 * - recalculateSalarySnapshot.js (recalculation)
 * 
 * =====================================================
 * RULE #10: BATCH PROCESSING - PROGRESS TRACKING
 * =====================================================
 * 
 * When finalizing reports with many employees (50+):
 * 
 * MANDATORY BEHAVIOR:
 * 1. Process snapshots in batches (5-10 employees per batch)
 * 2. Show progress dialog with:
 *    - Progress bar (X of Y employees)
 *    - Current employee names being processed
 *    - Status message
 * 3. Add delays between batches (500ms) to avoid rate limiting
 * 4. Block UI during finalization (prevent navigation)
 * 5. Show completion message when done
 * 
 * IMPLEMENTATION:
 * - createSalarySnapshots.js accepts batch_mode, batch_start, batch_size
 * - ReportTab.jsx handles batch loop with progress updates
 * - Progress dialog prevents user from closing or navigating away
 * 
 * FAILURE MODES:
 * - If batch fails: Stop processing, show error, do NOT continue
 * - If user closes window: Backend batch may complete, but UI state lost
 * - If rate limited: Increase delay between batches (not implemented yet)
 * 
 * =====================================================
 * CRITICAL TESTING CHECKLIST (Before Production Deploy)
 * =====================================================
 * 
 * □ 1. Create new project with 50+ employees
 * □ 2. Upload punch data
 * □ 3. Configure shifts and exceptions
 * □ 4. Run analysis
 * □ 5. Verify AnalysisResult records created (count = employee count)
 * □ 6. Save report
 * □ 7. Mark report as final
 * □ 8. Verify progress dialog shows during finalization
 * □ 9. Verify SalarySnapshot count matches employee count
 * □ 10. Verify SalarySnapshot.deductible_minutes matches AnalysisResult.deductible_minutes
 * □ 11. Generate salary report
 * □ 12. Verify salary totals calculate correctly
 * □ 13. Edit OT hours and bonus
 * □ 14. Verify salary recalculates correctly
 * □ 15. Export to Excel
 * □ 16. Verify Excel contains correct data
 * □ 17. Attempt to re-finalize (should be blocked)
 * □ 18. Attempt to edit attendance (should be blocked)
 * 
 * =====================================================
 * RECOVERY PROCEDURES (When Things Break)
 * =====================================================
 * 
 * Symptom: "No salary snapshots found after finalization"
 * Solution:
 * 1. Check ReportRun.is_final === true
 * 2. Check SalarySnapshot count for report_run_id
 * 3. If missing: Run repairSalaryReportFromSnapshots function
 * 4. If still missing: Delete snapshots and re-run createSalarySnapshots
 * 
 * Symptom: "Deductible minutes mismatch between AnalysisResult and SalarySnapshot"
 * Solution:
 * 1. DO NOT recalculate attendance
 * 2. Run fixSalarySnapshotDeductibleHours function
 * 3. This copies AnalysisResult.deductible_minutes → SalarySnapshot.deductible_minutes
 * 4. Preserves 1:1 copy rule
 * 
 * Symptom: "Salary totals are wrong after finalization"
 * Solution:
 * 1. Verify SalarySnapshot has correct attendance data
 * 2. Verify rounding is applied (2 decimal places)
 * 3. Verify WPS cap logic for Al Maraghi Motors
 * 4. Check console logs for calculation errors
 * 5. Run recalculateSalarySnapshot for individual employee
 * 
 * Symptom: "Report shows 'No finalized report found' but is_final = true"
 * Solution:
 * 1. Check ReportRun.finalized_by and finalized_date are set
 * 2. If missing: Update manually via database
 * 3. Clear React Query cache: queryClient.invalidateQueries()
 * 4. Refresh page
 * 
 * =====================================================
 * FORBIDDEN CODE PATTERNS
 * =====================================================
 * 
 * ❌ NEVER DO THIS IN SALARY CONTEXT:
 * 
 * // BAD: Recalculating attendance after finalization
 * const recalculated = recalculateEmployeeAttendance(emp, dateFrom, dateTo);
 * 
 * // BAD: Filtering exceptions for custom date range in salary
 * const filteredExceptions = exceptions.filter(e => 
 *     e.date_from >= customDateFrom && e.date_to <= customDateTo
 * );
 * 
 * // BAD: Recomputing deductible minutes from punches
 * const deductibleMinutes = (lateMinutes + earlyMinutes - grace - approved);
 * 
 * // BAD: Using project dates for attendance filtering after finalization
 * const workingDays = calculateWorkingDays(project.date_from, project.date_to);
 * 
 * ✅ ALWAYS DO THIS IN SALARY CONTEXT:
 * 
 * // GOOD: Use finalized snapshot data directly
 * const deductibleMinutes = snapshot.deductible_minutes;
 * const presentDays = snapshot.present_days;
 * const netDeduction = snapshot.netDeduction;
 * 
 * // GOOD: Only recalculate totals using fixed attendance + editable adjustments
 * const finalTotal = snapshot.total_salary 
 *     + snapshot.totalOtSalary 
 *     + snapshot.bonus 
 *     + snapshot.incentive
 *     - snapshot.netDeduction 
 *     - snapshot.deductibleHoursPay
 *     - snapshot.otherDeduction 
 *     - snapshot.advanceSalaryDeduction;
 * 
 * =====================================================
 * VERSION HISTORY
 * =====================================================
 * 
 * v1.0 - 2026-02-02 - Initial lock document created
 *                     Production-blocking regression fixed
 *                     Batch processing with progress tracking added
 * 
 * =====================================================
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Lock, CheckCircle, XCircle } from 'lucide-react';

export default function CriticalFinalizationRules() {
    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-red-100 rounded-2xl mb-4">
                    <Lock className="w-10 h-10 text-red-600" />
                </div>
                <h1 className="text-4xl font-bold text-red-900">CRITICAL FINALIZATION RULES</h1>
                <p className="text-lg text-red-700 mt-2">Production-Locked Architecture</p>
                <p className="text-sm text-slate-600 mt-3">
                    Status: LOCKED | Date: 2026-02-02 | Owner: System Architect
                </p>
            </div>

            {/* Rule #1: Permanent Lock */}
            <Card className="border-l-4 border-red-600 shadow-lg">
                <CardHeader className="bg-red-50">
                    <CardTitle className="flex items-center gap-2 text-red-900">
                        <Lock className="w-6 h-6" />
                        RULE #1: PERMANENT LOCK - FINALIZED REPORTS
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="border-2 border-green-300 rounded-lg p-4 bg-green-50">
                            <h3 className="font-bold text-green-900 flex items-center gap-2 mb-3">
                                <CheckCircle className="w-5 h-5" />
                                ALLOWED
                            </h3>
                            <ul className="text-sm text-green-800 space-y-1">
                                <li>✓ Read AnalysisResult data</li>
                                <li>✓ Create SalarySnapshot from AnalysisResult (1:1 copy)</li>
                                <li>✓ Generate SalaryReport from SalarySnapshot</li>
                                <li>✓ Edit OT/Bonus/Deductions in SalarySnapshot</li>
                                <li>✓ Recalculate salary totals using fixed attendance</li>
                            </ul>
                        </div>
                        <div className="border-2 border-red-300 rounded-lg p-4 bg-red-50">
                            <h3 className="font-bold text-red-900 flex items-center gap-2 mb-3">
                                <XCircle className="w-5 h-5" />
                                FORBIDDEN
                            </h3>
                            <ul className="text-sm text-red-800 space-y-1">
                                <li>✗ Recalculate attendance data</li>
                                <li>✗ Modify AnalysisResult after finalization</li>
                                <li>✗ Apply day_overrides to finalized data</li>
                                <li>✗ Recompute deductible_minutes from punches</li>
                                <li>✗ Use UI-side attendance recalculation</li>
                                <li>✗ Apply custom date range to attendance</li>
                                <li>✗ Fallback to zero/default for finalized fields</li>
                            </ul>
                        </div>
                    </div>
                    <div className="bg-red-100 border border-red-300 rounded-lg p-4 mt-4">
                        <p className="text-sm text-red-900 font-semibold">
                            ⚠️ CONSEQUENCE OF VIOLATION: Salary snapshots will contain incorrect attendance 
                            values, leading to wrong salary calculations and payroll errors.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Rule #2: Data Pipeline */}
            <Card className="border-l-4 border-indigo-600 shadow-lg">
                <CardHeader className="bg-indigo-50">
                    <CardTitle className="flex items-center gap-2 text-indigo-900">
                        RULE #2: DATA PIPELINE - IMMUTABLE FLOW
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4">
                        <div className="border border-indigo-300 rounded-lg p-4 bg-indigo-50">
                            <h4 className="font-semibold text-indigo-900 mb-2">Step 1: ANALYSIS (Pre-Finalization)</h4>
                            <p className="text-sm text-indigo-800 font-mono">
                                Punches + Shifts + Exceptions → [ANALYSIS ENGINE] → AnalysisResult
                            </p>
                            <p className="text-xs text-indigo-700 mt-2">
                                ANALYSIS CAN BE RE-RUN BEFORE FINALIZATION
                            </p>
                        </div>

                        <div className="border border-purple-300 rounded-lg p-4 bg-purple-50">
                            <h4 className="font-semibold text-purple-900 mb-2">Step 2: FINALIZATION (One-Time Lock)</h4>
                            <p className="text-sm text-purple-800 font-mono">
                                AnalysisResult → [SNAPSHOT CREATION] → SalarySnapshot
                            </p>
                            <p className="text-xs text-purple-700 mt-2">
                                THIS IS A ONE-WAY OPERATION - ONCE FINALIZED, ATTENDANCE DATA IS LOCKED FOREVER
                            </p>
                        </div>

                        <div className="border border-green-300 rounded-lg p-4 bg-green-50">
                            <h4 className="font-semibold text-green-900 mb-2">Step 3: SALARY GENERATION (Uses Locked Data)</h4>
                            <p className="text-sm text-green-800 font-mono">
                                SalarySnapshot → [OT + ADJUSTMENTS] → SalaryReport
                            </p>
                            <p className="text-xs text-green-700 mt-2">
                                ONLY OT/BONUS/DEDUCTIONS CAN CHANGE - ATTENDANCE VALUES REMAIN FROZEN
                            </p>
                        </div>

                        <div className="border border-amber-300 rounded-lg p-4 bg-amber-50">
                            <h4 className="font-semibold text-amber-900 mb-2">Step 4: SALARY EDITING (Post-Finalization)</h4>
                            <p className="text-sm text-amber-800">
                                <strong>EDITABLE:</strong> normalOtHours, specialOtHours, bonus, incentive, 
                                otherDeduction, advanceSalaryDeduction
                            </p>
                            <p className="text-sm text-amber-800 mt-2">
                                <strong>IMMUTABLE:</strong> present_days, full_absence_count, deductible_minutes,
                                leavePay, salaryLeaveAmount, netDeduction, deductibleHoursPay
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Rule #3: Snapshot Creation */}
            <Card className="border-l-4 border-purple-600 shadow-lg">
                <CardHeader className="bg-purple-50">
                    <CardTitle className="flex items-center gap-2 text-purple-900">
                        RULE #3: SNAPSHOT CREATION - 1:1 COPY ONLY
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <p className="text-sm text-slate-700 mb-4">
                        <strong>Function:</strong> <code className="bg-slate-200 px-2 py-1 rounded">createSalarySnapshots.js</code>
                    </p>
                    
                    <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
                        <h4 className="font-semibold text-green-900 mb-2">✓ CORRECT PATTERN (REQUIRED)</h4>
                        <pre className="bg-slate-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
{`const analysisResult = analysisResults.find(r => 
    String(r.attendance_id) === String(emp.attendance_id)
);

if (hasAnalysisResult) {
    calculated = {
        workingDays: analysisResult.working_days || 0,
        presentDays: analysisResult.present_days || 0,
        fullAbsenceCount: analysisResult.full_absence_count || 0,
        deductibleMinutes: analysisResult.deductible_minutes || 0,
        graceMinutes: analysisResult.grace_minutes ?? 15
        // ... 1:1 copy of ALL fields
    };
    attendanceSource = 'ANALYZED';
}`}
                        </pre>
                    </div>

                    <div className="bg-red-50 border border-red-300 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900 mb-2">✗ FORBIDDEN PATTERNS</h4>
                        <pre className="bg-slate-900 text-red-400 p-3 rounded text-xs overflow-x-auto">
{`// ❌ NEVER recalculate attendance after finalization
const recalculated = recalculateEmployeeAttendance(emp, dateFrom, dateTo);

// ❌ NEVER filter punches by custom date range
const punches = allPunches.filter(p => p.date >= customFrom && p.date <= customTo);

// ❌ NEVER apply day_overrides after finalization
if (analysisResult.day_overrides) { /* process overrides */ }

// ❌ NEVER compute working_days from scratch
const workingDays = calculateWorkingDays(project.date_from, project.date_to);`}
                        </pre>
                    </div>
                </CardContent>
            </Card>

            {/* Rule #4: No Attendance Recalc */}
            <Card className="border-l-4 border-orange-600 shadow-lg">
                <CardHeader className="bg-orange-50">
                    <CardTitle className="flex items-center gap-2 text-orange-900">
                        <AlertTriangle className="w-6 h-6" />
                        RULE #4: NO ATTENDANCE RECALCULATION IN SALARY
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <p className="text-sm text-slate-700 mb-4">
                        <strong>Files:</strong> SalaryTab.jsx, SalaryReportDetail.jsx, createSalarySnapshots.js
                    </p>

                    <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
                        <h4 className="font-semibold text-green-900 mb-2">✓ MANDATORY - USE SNAPSHOT DATA</h4>
                        <ul className="text-sm text-green-800 space-y-1">
                            <li>✓ Use SalarySnapshot.present_days (from finalized AnalysisResult)</li>
                            <li>✓ Use SalarySnapshot.full_absence_count (from finalized AnalysisResult)</li>
                            <li>✓ Use SalarySnapshot.deductible_minutes (from finalized AnalysisResult)</li>
                            <li>✓ Use SalarySnapshot.leavePay (calculated at finalization)</li>
                            <li>✓ Use SalarySnapshot.deductibleHoursPay (calculated at finalization)</li>
                        </ul>
                    </div>

                    <div className="bg-red-50 border border-red-300 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900 mb-2">✗ FORBIDDEN - RECALCULATION</h4>
                        <ul className="text-sm text-red-800 space-y-1">
                            <li>✗ Calling recalculateEmployeeAttendance() in salary context</li>
                            <li>✗ Filtering exceptions by custom date range</li>
                            <li>✗ Recomputing working_days or present_days</li>
                            <li>✗ Applying grace_minutes logic after finalization</li>
                            <li>✗ Custom date range attendance recalculation</li>
                        </ul>
                    </div>

                    <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mt-4">
                        <p className="text-sm text-blue-900">
                            <strong>EXCEPTION:</strong> OT hours and adjustments CAN be recalculated because they 
                            are not attendance data - they are post-finalization salary adjustments.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Rule #5: Custom Date Range */}
            <Card className="border-l-4 border-blue-600 shadow-lg">
                <CardHeader className="bg-blue-50">
                    <CardTitle className="flex items-center gap-2 text-blue-900">
                        RULE #5: CUSTOM DATE RANGE - DISPLAY ONLY
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="bg-blue-100 border border-blue-300 rounded-lg p-4 mb-4">
                        <h4 className="font-semibold text-blue-900 mb-2">Custom dates are METADATA ONLY</h4>
                        <ul className="text-sm text-blue-800 space-y-1">
                            <li>✓ Report header display</li>
                            <li>✓ Excel filename</li>
                            <li>✓ Report organization</li>
                            <li>✓ User reference</li>
                        </ul>
                    </div>

                    <div className="bg-red-100 border border-red-300 rounded-lg p-4">
                        <h4 className="font-semibold text-red-900 mb-2">Custom dates MUST NOT</h4>
                        <ul className="text-sm text-red-800 space-y-1">
                            <li>✗ Filter attendance data</li>
                            <li>✗ Trigger attendance recalculation</li>
                            <li>✗ Change working_days or present_days</li>
                            <li>✗ Filter exceptions by date</li>
                            <li>✗ Modify deductible_minutes</li>
                        </ul>
                    </div>

                    <p className="text-sm text-slate-700 mt-4 font-semibold">
                        The salary report ALWAYS uses the FULL finalized attendance period data,
                        regardless of the custom date range selected for report display.
                    </p>
                </CardContent>
            </Card>

            {/* Testing Checklist */}
            <Card className="border-l-4 border-green-600 shadow-lg">
                <CardHeader className="bg-green-50">
                    <CardTitle className="flex items-center gap-2 text-green-900">
                        CRITICAL TESTING CHECKLIST
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <p className="text-sm text-slate-700 mb-4">
                        Before deploying to production, ALL steps must pass:
                    </p>
                    <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div className="space-y-2">
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Create project with 50+ employees</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Upload punch data</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Configure shifts and exceptions</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Run analysis</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Verify AnalysisResult count = employee count</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Save report</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Mark report as final</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Verify progress dialog shows</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Verify SalarySnapshot count matches</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Verify deductible_minutes match</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Generate salary report</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Verify salary totals calculate correctly</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Edit OT hours and bonus</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Verify salary recalculates correctly</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Export to Excel</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Verify Excel contains correct data</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Attempt to re-finalize (should be blocked)</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <input type="checkbox" className="mt-1" disabled />
                                <span>Attempt to edit attendance (should be blocked)</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Recovery Procedures */}
            <Card className="border-l-4 border-amber-600 shadow-lg">
                <CardHeader className="bg-amber-50">
                    <CardTitle className="flex items-center gap-2 text-amber-900">
                        RECOVERY PROCEDURES
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="space-y-4 text-sm">
                        <div className="bg-slate-100 border border-slate-300 rounded p-3">
                            <h4 className="font-semibold text-slate-900 mb-2">Symptom: "No salary snapshots found after finalization"</h4>
                            <p className="text-slate-700">Solution:</p>
                            <ol className="text-slate-700 ml-4 mt-1">
                                <li>1. Check ReportRun.is_final === true</li>
                                <li>2. Check SalarySnapshot count for report_run_id</li>
                                <li>3. If missing: Run repairSalaryReportFromSnapshots function</li>
                                <li>4. If still missing: Delete snapshots and re-run createSalarySnapshots</li>
                            </ol>
                        </div>

                        <div className="bg-slate-100 border border-slate-300 rounded p-3">
                            <h4 className="font-semibold text-slate-900 mb-2">Symptom: "Deductible minutes mismatch"</h4>
                            <p className="text-slate-700">Solution:</p>
                            <ol className="text-slate-700 ml-4 mt-1">
                                <li>1. DO NOT recalculate attendance</li>
                                <li>2. Run fixSalarySnapshotDeductibleHours function</li>
                                <li>3. This copies AnalysisResult → SalarySnapshot</li>
                                <li>4. Preserves 1:1 copy rule</li>
                            </ol>
                        </div>

                        <div className="bg-slate-100 border border-slate-300 rounded p-3">
                            <h4 className="font-semibold text-slate-900 mb-2">Symptom: "Report shows 'No finalized report found' but is_final = true"</h4>
                            <p className="text-slate-700">Solution:</p>
                            <ol className="text-slate-700 ml-4 mt-1">
                                <li>1. Check ReportRun.finalized_by and finalized_date are set</li>
                                <li>2. If missing: Update manually via database</li>
                                <li>3. Clear React Query cache</li>
                                <li>4. Refresh page</li>
                            </ol>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Footer Warning */}
            <div className="bg-red-100 border-2 border-red-600 rounded-lg p-6 text-center">
                <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-red-900 mb-2">
                    PRODUCTION-LOCKED ARCHITECTURE
                </h2>
                <p className="text-red-800">
                    Any violation of these rules will cause payroll calculation errors.
                </p>
                <p className="text-red-800 mt-2 font-semibold">
                    Changes require explicit approval and full regression testing.
                </p>
            </div>
        </div>
    );
}