# 📊 Report Architecture - LOCKED DESIGN
*Status: LOCKED | Date: 2026-01-27 | Owner: System Architect*

This document defines the permanent architecture for both the Attendance Summary and Salary Calculation reports. Changes require explicit approval.

---

## Executive Summary
The system manages two separate but interrelated reports:
1. **Attendance Summary Report:** Attendance metrics (present, absent, late, leaves).
2. **Salary Calculation Report:** Salary deductions and net amounts.

### Core Principles:
- Calculated once and stored as **IMMUTABLE SNAPSHOTS** when finalized.
- Support **RECALCULATION** with version tracking.
- Displayed as **WEB TABLES** and **EXCEL EXPORTS**.
- Shared common `AnalysisResult` data via the `ReportRun` container.

---

## 🏗️ Entities

### 1. `ReportRun` (Container/Orchestrator)
Single source of truth for report metadata and finality.
- **Fields:** `project_id`, `report_name`, `date_from`, `date_to`, `employee_count`, `notes`, `verified_employees`, `is_final` (Immutability Marker), `finalized_by`, `finalized_date`, `recalculation_version`, `previous_report_run_id`, `status` (draft/finalized/archived).

### 2. `AttendanceSummarySnapshot` (IMMUTABLE)
Frozen attendance data that NEVER changes after finalization.
- **Attendance Metrics:** `working_days`, `present_days`, `full_absence_count` (LOP), `annual_leave_count`, `sick_leave_count`, `half_absence_count`.
- **Time Metrics:** `late_minutes`, `early_checkout_minutes`, `other_minutes`, `approved_minutes` (Dept head pre-approvals), `grace_minutes`, `deductible_minutes` (Locked).
- **Metadata:** `snapshot_created_at`, `recalculation_version`.

### 3. `SalaryCalculationSnapshot` (HYBRID: Immutable + Editable)
Frozen salary deductions with editable post-finalization adjustments.
- **Salary Master (Immutable):** `basic_salary`, `allowances`, `total_salary`, `working_hours`.
- **Deductions (Immutable):** `leave_pay`, `salary_leave_amount`, `net_leave_deduction`, `deductible_minutes`, `deductible_hours`, `deductible_hours_pay`.
- **Editable Adjustments:** `normal_ot_hours`, `special_ot_hours`, `bonus`, `incentive`, `other_deduction`, `advance_salary_deduction`.
- **Calculated (Recalculated on edits):** `total_salary_payable`, `wps_pay`, `balance`.

---

## ⚙️ Calculation Flow

### STEP 1: FINALIZATION (One-Time Lock)
When an admin finalizes a report:
1. Fetch `AnalysisResult` and create `AttendanceSummarySnapshot` (1:1 copy).
2. Fetch `EmployeeSalary` and calculate frozen deductions.
3. Create `SalaryCalculationSnapshot` with immutable deductions and default adjustments (OT=0, etc.).
4. Mark `ReportRun.is_final = true`.

### STEP 2: DISPLAY & EDITING
- **Attendance Summary:** Read-only table.
- **Salary Calculation:** Table with locked deduction fields (gray) and editable adjustment fields (white). Admin can save edits to OT/Bonus etc.

### STEP 3: RECALCULATION (Version N+1)
If adjustments to attendance logic are needed:
1. Create a NEW `ReportRun` with incremented version.
2. Link to `previous_report_run_id`.
3. Copy snapshots to the new version, preserving previous admin edits.
4. Old report becomes ARCHIVED.

---

## 🔒 Data Safety & Immutability

> [!CAUTION]
> **CRITICAL FINALIZATION RULE:** Once `is_final = true`, attendance data is PERMANENTLY LOCKED.

### Forbidden Code Patterns in Salary Context:
- ❌ `recalculateEmployeeAttendance(emp, dateFrom, dateTo)`
- ❌ Filtering exceptions by custom date range
- ❌ Recomputing working_days or present_days
- ❌ Applying grace_minutes logic after finalization

### Allowed:
- ✅ Edit OT hours, bonuses, deductions (post-finalization adjustments).

---

## 📋 Validation Checklist
- Cannot finalize if employees are missing salary data or analysis is incomplete.
- Cannot edit after finalization (enforced at backend).
- Cannot delete finalized reports (archive only for audit trails).
- Recalculation must preserve admin's previous editable entries.

---

## 🛠️ Implementation Specs

### Field Groups:
- **Attendance Fields:** `attendance_id`, `hrms_id`, `name`, `department`, `working_days`, `present_days`, `full_absence_count`, etc.
- **Immutable Salary Fields:** `basic_salary`, `allowances`, `total_salary`, `leave_pay`, `net_leave_deduction`, `deductible_hours_pay`, etc.
- **Editable Salary Fields:** `normal_ot_hours`, `special_ot_hours`, `bonus`, `incentive`, `other_deduction`, `advance_salary_deduction`.

---
**LOCKED NOTICE**
*This architecture is LOCKED as of 2026-01-27. No partial implementations or shortcuts permitted.*
