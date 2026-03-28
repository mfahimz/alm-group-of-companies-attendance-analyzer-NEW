# 🔒 CRITICAL FINALIZATION RULES - PERMANENT LOCK
*Status: PRODUCTION-LOCKED | Date: 2026-02-02 | Owner: System Architect*

> [!CAUTION]
> **ABSOLUTE RULES:** These rules are ABSOLUTE and MUST NEVER be violated by any code change. Any deviation will cause production failures and payroll errors.

---

## RULE #1: PERMANENT LOCK - FINALIZED REPORTS
Once a ReportRun is marked as finalized (`is_final = true`):

### ✅ ALLOWED:
- Read AnalysisResult data
- Create SalarySnapshot from AnalysisResult (1:1 copy)
- Generate SalaryReport from SalarySnapshot
- Edit OT/Bonus/Deductions in SalarySnapshot (post-finalization adjustments)
- Recalculate salary totals using fixed attendance + editable adjustments

### ❌ FORBIDDEN:
- Recalculate attendance data (present days, LOP, late minutes, etc.)
- Modify AnalysisResult records after finalization
- Apply day_overrides or exceptions to finalized data
- Recompute deductible_minutes from raw punches
- Use UI-side attendance recalculation logic
- Apply custom date range filtering to attendance metrics
- Fallback to zero or default values for finalized fields

> [!IMPORTANT]
> **CONSEQUENCE OF VIOLATION:** Salary snapshots will contain incorrect attendance values, leading to wrong salary calculations and payroll errors.

---

## RULE #2: DATA PIPELINE - IMMUTABLE FLOW

### Step 1: ANALYSIS (Pre-Finalization)
`Punches + Shifts + Exceptions → [ANALYSIS ENGINE] → AnalysisResult`
- ANALYSIS CAN BE RE-RUN BEFORE FINALIZATION
- ANALYSIS CANNOT BE RE-RUN AFTER FINALIZATION

### Step 2: FINALIZATION (One-Time Lock)
`AnalysisResult → [SNAPSHOT CREATION] → SalarySnapshot`
- **THIS IS A ONE-WAY OPERATION.** Once finalized, attendance data is locked forever.

### Step 3: SALARY GENERATION (Uses Locked Data)
`SalarySnapshot → [OT + ADJUSTMENTS] → SalaryReport`
- ONLY OT/BONUS/DEDUCTIONS CAN CHANGE. Attendance values remain frozen.

### Step 4: SALARY EDITING (Post-Finalization)
- **EDITABLE:** `normalOtHours`, `specialOtHours`, `bonus`, `incentive`, `otherDeduction`, `advanceSalaryDeduction`.
- **IMMUTABLE:** `present_days`, `full_absence_count`, `deductible_minutes`, `leavePay`, `salaryLeaveAmount`, `netDeduction`, `deductibleHoursPay`.

---

## RULE #3: SNAPSHOT CREATION - 1:1 COPY ONLY
When creating `SalarySnapshot` from `AnalysisResult`:

### MANDATORY BEHAVIOR:
1. Find AnalysisResult for the finalized `report_run_id`.
2. Copy ALL attendance fields EXACTLY as stored (1:1 copy).
3. **NO** recalculation, **NO** day_overrides processing.
4. **NO** custom date range filtering.
5. **NO** fallback logic for missing fields.

### ✅ CORRECT CODE PATTERN:
```javascript
const analysisResult = analysisResults.find(r => 
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
}
```

---

## RULE #4: NO ATTENDANCE RECALCULATION IN SALARY
Files: `SalaryTab.jsx`, `SalaryReportDetail.jsx`, `createSalarySnapshots.js`

- **MANDATORY:** Use Snapshot data directly (present_days, deductible_minutes, leavePay, etc.).
- **FORBIDDEN:** Recomputing anything from raw punches or exceptions in the salary context.

---

## RULE #5: CUSTOM DATE RANGE - DISPLAY ONLY
When generating SalaryReport with custom dates:
- These dates are **METADATA ONLY** (headers, filenames).
- They **MUST NOT** trigger recalculation or filtering of attendance data.

---

## RULE #6: AL MARAGHI MOTORS - ASSUMED PRESENT DAYS
Last 2 days of salary month are "assumed present" for salary calculation.
- **CONDITION:** Only for 'Al Maraghi Motors' and the last 2 days of the month.
- **EXCEPTION:** Honor existing `ANNUAL_LEAVE` on those days.
- **RESTRICTION:** Never apply this in `runAnalysis.js` or the UI.

---

## RULE #7: ERROR PREVENTION - VALIDATION GATES

### BEFORE FINALIZATION:
- Verify AnalysisResult count matches employee count.
- Verify no other report is finalized for this project.

### AFTER FINALIZATION:
- Verify all active employees have snapshots.

### BEFORE SALARY GENERATION:
- Verify `is_final === true` and snapshots are loaded.

---

## RULE #8: ROUNDING - 2 DECIMAL PLACES EVERYWHERE
All monetary values (leavePay, total, etc.) must be rounded: `Math.round(value * 100) / 100`.
- **Note:** Do NOT round user-entered adjustments.

---

## RULE #9: WPS CAP - AL MARAGHI MOTORS ONLY
- If total > `wps_cap_amount` (default 4900 AED), round balance DOWN to nearest 100.

---

## RULE #10: BATCH PROCESSING - PROGRESS TRACKING
Finalize report in batches (5-10 employees) with a progress bar and UI block.

---

## CRITICAL TESTING CHECKLIST
Pass all 18 checks before production deploy:
1. Create project (50+ employees)
2. Upload punches
3. Configure shifts/exceptions
4. Run analysis
5. Verify AnalysisResult count
6. Save report
7. Mark as final
8. Verify progress dialog
9. Verify Snapshot count
10. Verify 1:1 data copy
11. Generate salary report
12. Verify totals
13. Edit adjustments
14. Verify recalculation
15. Export to Excel
16. Verify Excel data
17. Block re-finalization
18. Block attendance edits

---

## RECOVERY PROCEDURES
- **Missing Snapshots:** Run `repairSalaryReportFromSnapshots`.
- **Deductible Mismatch:** Run `fixSalarySnapshotDeductibleHours` (AnalysisResult → Snapshot).
- **Wrong Totals:** Verify 2-decimal rounding and WPS cap.

---

## ❌ FORBIDDEN CODE PATTERNS
```javascript
// ❌ BAD: Recalculating attendance after finalization
const recalculated = recalculateEmployeeAttendance(emp, dateFrom, dateTo);

// ❌ BAD: Filtering exceptions for custom date range in salary
const filteredExceptions = exceptions.filter(e => e.date_from >= cFrom && e.date_to <= cTo);

// ❌ BAD: Recomputing deductible minutes from punches
const deductibleMinutes = (lateMinutes + earlyMinutes - grace - approved);
```

---

## VERSION HISTORY
- **v1.0 (2026-02-02):** Initial lock document created.

---
**PRODUCTION-LOCKED ARCHITECTURE**
*Any violation of these rules will cause payroll calculation errors.*
