/**
 * REPORT ARCHITECTURE - LOCKED DESIGN
 * 
 * Status: LOCKED | Date: 2026-01-27
 * This document defines the permanent architecture for both reports.
 * Changes require explicit approval.
 * 
 * ==================== EXECUTIVE SUMMARY ====================
 * 
 * Two separate but INTERRELATED reports:
 * 1. Attendance Summary Report - Attendance metrics (present, absent, late, leaves)
 * 2. Salary Calculation Report - Salary deductions and net amounts
 * 
 * Both:
 * - Calculated once, stored as IMMUTABLE SNAPSHOTS when finalized
 * - Support RECALCULATION with version tracking
 * - Display as WEB TABLES + EXCEL EXPORT
 * - Share common AnalysisResult data
 * - Use ReportRun as the container
 * 
 * ==================== ENTITIES ====================
 * 
 * ENTITY: ReportRun (Container/Orchestrator)
 * - project_id (string)
 * - report_name (string)
 * - date_from (date)
 * - date_to (date)
 * - employee_count (number)
 * - notes (string)
 * - verified_employees (string) - Comma-separated attendance IDs
 * - is_final (boolean) - IMMUTABILITY MARKER
 * - finalized_by (string) - User email
 * - finalized_date (date-time) - UTC stored, UAE displayed
 * - recalculation_version (number) - Tracks version (0, 1, 2...)
 * - previous_report_run_id (string) - Links to prior version
 * - status (enum) - draft | finalized | archived
 * 
 * PURPOSE: Single source of truth for report metadata and finality
 * 
 * ─────────────────────────────────────────────────────────────
 * 
 * ENTITY: AttendanceSummarySnapshot (IMMUTABLE)
 * - project_id (string)
 * - report_run_id (string) - Reference to ReportRun
 * - attendance_id (string)
 * - hrms_id (string)
 * - name (string) - Snapshot at finalization
 * - department (string) - Snapshot at finalization
 * 
 * Attendance Metrics (FROM AnalysisResult):
 * - working_days (number)
 * - present_days (number)
 * - full_absence_count (number) - LOP days
 * - annual_leave_count (number)
 * - sick_leave_count (number)
 * - half_absence_count (number)
 * 
 * Time Metrics (FROM AnalysisResult):
 * - late_minutes (number)
 * - early_checkout_minutes (number)
 * - other_minutes (number)
 * - approved_minutes (number) - Department head pre-approvals
 * - grace_minutes (number)
 * - deductible_minutes (number) - IMMUTABLE from finalized report
 * 
 * Notes:
 * - abnormal_dates (string)
 * - notes (string)
 * - auto_resolutions (string) - JSON
 * 
 * Metadata:
 * - snapshot_created_at (date-time)
 * - recalculation_version (number)
 * 
 * PURPOSE: Frozen attendance data that NEVER changes after finalization
 * 
 * ─────────────────────────────────────────────────────────────
 * 
 * ENTITY: SalaryCalculationSnapshot (HYBRID: Immutable + Editable)
 * - project_id (string)
 * - report_run_id (string)
 * - attendance_id (string)
 * - hrms_id (string)
 * - name (string) - Snapshot
 * - department (string) - Snapshot
 * 
 * Salary Master (FROM EmployeeSalary):
 * - basic_salary (number) - IMMUTABLE
 * - allowances (number) - IMMUTABLE
 * - total_salary (number) - IMMUTABLE
 * - working_hours (number) - IMMUTABLE
 * 
 * Leave Data (FROM AttendanceSummarySnapshot) - ALL IMMUTABLE:
 * - working_days (number)
 * - present_days (number)
 * - full_absence_count (number)
 * - annual_leave_count (number)
 * - sick_leave_count (number)
 * 
 * Calculated Deductions (IMMUTABLE after finalization):
 * - leave_pay (number)
 * - salary_leave_amount (number)
 * - net_leave_deduction (number)
 * - deductible_minutes (number)
 * - deductible_hours (number)
 * - deductible_hours_pay (number)
 * 
 * EDITABLE FIELDS (Can change on recalculation):
 * - normal_ot_hours (number) - Default 0, editable by admin
 * - normal_ot_salary (number) - Recalculated
 * - special_ot_hours (number) - Default 0, editable
 * - special_ot_salary (number) - Recalculated
 * - total_ot_salary (number) - Recalculated
 * - bonus (number) - Default 0, editable
 * - incentive (number) - Default 0, editable
 * - other_deduction (number) - Default 0, editable
 * - advance_salary_deduction (number) - Default 0, editable
 * 
 * Final (RECALCULATED on edits):
 * - total_salary_payable (number)
 * - wps_pay (number)
 * - balance (number)
 * 
 * Metadata:
 * - snapshot_created_at (date-time)
 * - recalculation_version (number)
 * 
 * PURPOSE: Frozen salary snapshot with IMMUTABLE deductions + EDITABLE adjustments
 * 
 * ==================== RELATIONSHIP ====================
 * 
 * ReportRun (CONTAINER)
 *   ├─ is_final = true/false
 *   ├─ finalized_date
 *   ├─ recalculation_version (0, 1, 2...)
 *   └─ previous_report_run_id → (older version)
 * 
 * AttendanceSummarySnapshot (v0, v1, v2...)
 *   ├─ Pulled from AnalysisResult
 *   ├─ Frozen when ReportRun.is_final = true
 *   └─ New version created on recalculation
 * 
 * SalaryCalculationSnapshot (v0, v1, v2...)
 *   ├─ Pulled from AttendanceSummarySnapshot
 *   ├─ Pulled from EmployeeSalary
 *   ├─ Frozen deductions
 *   ├─ Editable OT/Bonus/Deductions
 *   └─ New version created on recalculation
 * 
 * ==================== CALCULATION FLOW ====================
 * 
 * STEP 1: FINALIZATION (Admin clicks "Finalize")
 * ─────────────────────────────────────────────────
 * 
 * Triggered by: markFinalReport() function
 * 
 * For each employee:
 *   1. Fetch AnalysisResult for this report_run
 *   2. Create AttendanceSummarySnapshot:
 *      - Copy all fields from AnalysisResult
 *      - Set snapshot_created_at = NOW (UAE time)
 *      - Set recalculation_version = 0
 *   
 *   3. Fetch EmployeeSalary
 *   4. Calculate salary deductions:
 *      - leave_pay = (total_salary / 30) * (full_absence + annual_leave)
 *      - salary_leave_amount = based on exceptions
 *      - net_leave_deduction = leave_pay - salary_leave_amount (min 0)
 *      - deductible_hours = deductible_minutes / 60
 *      - deductible_hours_pay = (total_salary / 30 / 8) * deductible_hours
 *   
 *   5. Create SalaryCalculationSnapshot:
 *      - Copy attendance data
 *      - Copy salary master
 *      - Set immutable fields (deductions)
 *      - Set editable fields to defaults (OT=0, Bonus=0, etc.)
 *      - Set recalculation_version = 0
 * 
 * 6. Mark ReportRun:
 *    - is_final = true
 *    - finalized_by = current user email
 *    - finalized_date = NOW (UTC)
 *    - recalculation_version = 0
 * 
 * AFTER FINALIZATION: Both snapshots are IMMUTABLE and locked
 * 
 * ─────────────────────────────────────────────────────────────
 * 
 * STEP 2: DISPLAY (Frontend Tables)
 * ─────────────────────────────────
 * 
 * Attendance Summary Report:
 * - Fetch AttendanceSummarySnapshot
 * - Display read-only table
 * - Allow Excel export
 * 
 * Salary Calculation Report:
 * - Fetch SalaryCalculationSnapshot
 * - Display table with:
 *   - Immutable fields (gray, read-only)
 *   - Editable fields (white, can edit)
 * - "Recalculate" button recalculates totals
 * - "Save" button persists editable changes
 * - Allow Excel export
 * 
 * ─────────────────────────────────────────────────────────────
 * 
 * STEP 3: RECALCULATION (If adjustments needed)
 * ──────────────────────────────────────────────
 * 
 * Triggered by: Admin or system action
 * 
 * IF ReportRun.is_final = true:
 *   1. Create NEW ReportRun (version N+1):
 *      - Copy from old ReportRun
 *      - Set recalculation_version = N+1
 *      - Set previous_report_run_id = old ReportRun.id
 *      - Set is_final = false (starts as draft)
 * 
 *   2. Create NEW AttendanceSummarySnapshots (version N+1):
 *      - Copy immutable attendance data from old version
 *      - Set new report_run_id
 *      - Set recalculation_version = N+1
 * 
 *   3. Create NEW SalaryCalculationSnapshots (version N+1):
 *      - Copy ALL data INCLUDING editable fields from old version
 *        (preserves admin's OT/Bonus/Deduction entries)
 *      - Recalculate total_salary_payable based on updated data
 *      - Set new report_run_id
 *      - Set recalculation_version = N+1
 * 
 *   4. Admin re-finalizes when ready:
 *      - Set is_final = true on new ReportRun
 * 
 * KEY POINT: Editable field values carry forward to new version
 * 
 * ==================== DATA SAFETY RULES ====================
 * 
 * IMMUTABLE FIELDS (Never change after finalization):
 * 
 * AttendanceSummarySnapshot:
 * - ALL fields (entire record is frozen)
 * 
 * SalaryCalculationSnapshot:
 * - basic_salary
 * - allowances
 * - total_salary
 * - working_days
 * - present_days
 * - full_absence_count
 * - annual_leave_count
 * - sick_leave_count
 * - leave_pay
 * - salary_leave_amount
 * - net_leave_deduction
 * - deductible_minutes
 * - deductible_hours
 * - deductible_hours_pay
 * 
 * EDITABLE FIELDS (Can change only on recalculation):
 * 
 * SalaryCalculationSnapshot:
 * - normal_ot_hours (admin edits)
 * - normal_ot_salary (recalculated)
 * - special_ot_hours (admin edits)
 * - special_ot_salary (recalculated)
 * - total_ot_salary (recalculated)
 * - bonus (admin edits)
 * - incentive (admin edits)
 * - other_deduction (admin edits)
 * - advance_salary_deduction (admin edits)
 * - total_salary_payable (recalculated)
 * - wps_pay (recalculated)
 * 
 * ==================== VERSION TRACKING ====================
 * 
 * Each recalculation increments version:
 * 
 * ReportRun v0 (Jan 2026)
 *   ├─ AttendanceSummarySnapshot v0
 *   └─ SalaryCalculationSnapshot v0
 * 
 * [ERROR DISCOVERED - ADMIN RECALCULATES]
 * 
 * ReportRun v1 (Jan 2026)
 *   ├─ previous_report_run_id = ReportRun v0
 *   ├─ AttendanceSummarySnapshot v1
 *   └─ SalaryCalculationSnapshot v1
 *      (preserves OT/Bonus from v0)
 * 
 * [RECALCULATION CONFIRMED]
 * 
 * ReportRun v1 is now FINAL
 * ReportRun v0 becomes ARCHIVED
 * 
 * ==================== VALIDATION ====================
 * 
 * Cannot finalize if:
 * - Any employee missing salary data
 * - Any analysis result is incomplete
 * - Project status is not "analyzed"
 * 
 * Cannot edit after finalization:
 * - System enforces at backend
 * - Frontend disables inputs
 * 
 * Cannot delete finalized report:
 * - Must archive instead
 * - Preserves audit trail
 * 
 * Recalculation must preserve:
 * - All immutable fields
 * - Admin's previous editable entries
 * - Timestamp of recalculation
 * 
 * ==================== IMPLEMENTATION CHECKLIST ====================
 * 
 * Backend Functions:
 * [ ] finalizeSalaryReport - Create snapshots, lock report
 * [ ] recalculateReport - Create new version with history
 * [ ] fetchAttendanceSummary - Get snapshot data
 * [ ] fetchSalaryCalculation - Get snapshot data
 * [ ] exportReportToExcel - Both report types
 * [ ] validateReportCompletion - Pre-finalization checks
 * 
 * Frontend Pages/Components:
 * [ ] AttendanceSummaryReportView (web table)
 * [ ] SalaryCalculationReportView (editable table)
 * [ ] ReportExportDialog
 * [ ] ReportVersionHistory
 * [ ] RecalculateConfirmation
 * 
 * Entities:
 * [ ] Modify ReportRun (add recalculation fields)
 * [ ] Create AttendanceSummarySnapshot
 * [ ] Create SalaryCalculationSnapshot
 * 
 * ==================== LOCKED NOTICE ====================
 * 
 * This architecture is LOCKED as of 2026-01-27.
 * Updated: 2026-02-02 (added finalization immutability rules)
 * 
 * Changes to:
 * - Calculation logic
 * - Field names
 * - Data types
 * - Relationships
 * - Version tracking
 * - Immutability rules
 * 
 * ...require explicit approval and versioning of this document.
 * 
 * No partial implementations. No shortcuts. Complete contract.
 * 
 * ==================== CRITICAL FINALIZATION RULES ====================
 * 
 * RULE: Once ReportRun.is_final = true, attendance data is PERMANENTLY LOCKED.
 * 
 * FINALIZED REPORT DATA FLOW (IMMUTABLE):
 * 
 *   AnalysisResult (finalized) → createSalarySnapshots.js → SalarySnapshot (1:1 copy)
 *                                                                    ↓
 *                                                          SalaryTab.jsx (read-only attendance)
 *                                                                    ↓
 *                                                          SalaryReport (frozen attendance + OT adjustments)
 * 
 * MANDATORY BEHAVIOR:
 * 1. createSalarySnapshots.js MUST copy AnalysisResult fields exactly (1:1 copy)
 * 2. NO attendance recalculation after finalization
 * 3. NO custom date range filtering for attendance metrics
 * 4. NO day_overrides processing after finalization
 * 5. NO fallback to zero/default for finalized fields
 * 
 * FORBIDDEN CODE PATTERNS IN SALARY CONTEXT:
 * - recalculateEmployeeAttendance(emp, dateFrom, dateTo) ❌
 * - Filtering exceptions by custom date range ❌
 * - Recomputing working_days or present_days ❌
 * - Applying grace_minutes logic after finalization ❌
 * 
 * ALLOWED: Edit OT hours, bonuses, deductions (post-finalization adjustments)
 * 
 * See pages/CRITICAL_FINALIZATION_RULES for complete documentation.
 * 
 */

export const REPORT_ARCHITECTURE = {
  version: "1.0.0",
  locked_date: "2026-01-27",
  status: "LOCKED",
  attendanceReportFields: [
    "attendance_id", "hrms_id", "name", "department",
    "working_days", "present_days", "full_absence_count",
    "annual_leave_count", "sick_leave_count", "half_absence_count",
    "late_minutes", "early_checkout_minutes", "other_minutes",
    "approved_minutes", "grace_minutes", "deductible_minutes",
    "abnormal_dates", "notes", "auto_resolutions"
  ],
  salaryReportImmutableFields: [
    "basic_salary", "allowances", "total_salary", "working_hours",
    "working_days", "present_days", "full_absence_count",
    "annual_leave_count", "sick_leave_count",
    "leave_pay", "salary_leave_amount", "net_leave_deduction",
    "deductible_minutes", "deductible_hours", "deductible_hours_pay"
  ],
  salaryReportEditableFields: [
    "normal_ot_hours", "special_ot_hours", "bonus", "incentive",
    "other_deduction", "advance_salary_deduction"
  ],
  salaryReportCalculatedFields: [
    "normal_ot_salary", "special_ot_salary", "total_ot_salary",
    "total_salary_payable", "wps_pay", "balance"
  ]
};

export default function ArchitectureReference() {
  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-8 border-l-4 border-red-600">
        <h1 className="text-3xl font-bold text-red-900 mb-2">⛔ LOCKED ARCHITECTURE DOCUMENT</h1>
        <p className="text-red-700 font-semibold mb-4">
          Status: LOCKED | Date: 2026-01-27 | Change Owner: System Architect
        </p>
        <div className="bg-red-50 border border-red-300 rounded p-4 mb-6">
          <p className="text-sm text-red-800 font-semibold">
            This document defines the PERMANENT contract for report architecture.
            See code comments above for complete details.
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <h2 className="text-lg font-bold text-blue-900 mb-2">Architecture Complete</h2>
          <p className="text-blue-800 mb-3">Two snapshot-based reports with version tracking:</p>
          <ul className="text-sm text-blue-700 space-y-1 ml-4">
            <li>✓ AttendanceSummarySnapshot (immutable)</li>
            <li>✓ SalaryCalculationSnapshot (hybrid: immutable + editable)</li>
            <li>✓ Version tracking (v0, v1, v2...)</li>
            <li>✓ Recalculation with history preservation</li>
            <li>✓ Web tables + Excel export</li>
            <li>✓ Single entity shared across all companies</li>
          </ul>
        </div>
      </div>
    </div>
  );
}