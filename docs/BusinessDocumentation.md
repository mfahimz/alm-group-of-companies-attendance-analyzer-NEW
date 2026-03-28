# Attendance System Business Documentation
*Complete guide for HR managers, operations teams, and decision makers*

## 1. What This System Does

### Purpose
The Attendance System automatically processes employee clock-in and clock-out records to calculate accurate attendance metrics for payroll processing. Instead of manually reviewing timesheets and calculating late minutes, absences, and deductions, the system does this automatically based on your company's rules.

### Who Uses It
- **HR Managers:** Upload attendance data, review reports, manage exceptions, and prepare payroll information.
- **Operations Managers:** Monitor employee attendance, identify patterns, and ensure policy compliance.
- **Department Heads:** Pre-approve minutes for legitimate reasons, view team attendance reports.
- **Finance Teams:** Review salary calculations, verify deductions, and export payroll data.

### Business Problems Solved
- **Manual Processing Time:** Eliminates hours of manual timesheet review and calculation.
- **Human Error:** Removes calculation mistakes and ensures consistent rule application.
- **Disputes:** Provides detailed daily records for disagreement resolution.
- **Policy Enforcement:** Ensures attendance policies are applied fairly to all employees.
- **Audit Compliance:** Creates permanent record history.
- **Multi-Company Management:** Handles different policies for different companies in one system.

### Supported Devices
- **Multi-Device Access:** Access from any device: desktop, laptop, tablet, and mobile.
- **Desktop/Laptop:** Best for bulk file uploads and complex data entry.
- **Reports:** Responsive tables adapt to any screen size.
- **Mobile:** Optimized for approvals and quick checks.

### Timezone Standard
> [!IMPORTANT]
> **All Times are UAE Time:** This system uses UAE time (Asia/Dubai, UTC+4) for all dates and times. Your device's local timezone is ignored.

---

## 2. Key Business Capabilities

### Attendance Tracking
Calculates total working days, present vs absent, late arrivals, early departures, half days, and unusual patterns.

### Leave and Exception Handling
- **Sick Leave:** Marked as "Sick Leave", counted as working days.
- **Annual Leave:** Pre-approved vacation days.
- **Public Holidays:** Company-wide non-working days.
- **Shift Changes:** Temporary schedule adjustments.
- **Manual Corrections:** Corrections for biometric system malfunctions or missed punches.
- **Pre-Approved Minutes:** Department head approved late arrivals.

### Salary Calculation
Calculates deductions based on attendance results:
- **Net Leave Deduction:** Calculated based on leave types and salary divisor.
- **Net Additions:** Bonuses + max(OT Salary, Incentive).
- **Net Deductions:** Leave deductions + hourly rate deductions + other deductions.
- **Grace Minutes:** First 15 minutes late are forgiven (configurable).

---

## 3. Attendance Rules (Business View)

### Working Days vs Off Days
Each employee has a designated weekly off day (typically Sunday). No attendance is required on off days or public holidays.

### Late Arrivals and Early Checkouts
Company defines shift start/end times with a 15-minute grace period. Minutes are counted for punches outside this buffer.

### Half Days
Occurs when present for only morning or afternoon shift. Counts as 0.5 working days.

### Absences (LOP - Loss of Pay)
Full absence (LOP) occurs when there are no punch records without a valid exception. Deducts 1/30th of monthly salary.

### Public Holidays
Automatically applied to all employees. Employees receive full pay regardless of punch status.

### Ramadan Schedules
Special shorter shift timings configured annually and applied during Ramadan dates.

---

## 4. Leave & Exception Rules

### Sick Leave
Counted as **WORKING DAYS**. No salary deduction occurs.

### Annual Leave
Calendar-based counting. Includes weekly off and public holidays within the leave range.

### Manual Corrections
Audit-trailed overrides (Manual Present, Manual Absent, Manual Half Day).

### Conflicts & Precedence
1. Manual Overrides (Highest)
2. Public Holidays
3. Leave Days (Sick/Annual)
4. Shift Changes
5. Pre-Approved Minutes
6. Normal Rules (Lowest)

---

## 5. Salary & Deduction Logic

### Calculation Formula
1. Basic Monthly Salary
2. Subtract full/half day LOP deductions.
3. Subtract minute-based deductions.
4. Add bonuses/OT/incentives.
5. Result: Net Salary.

### Late/Early Minute Impact
Minute Deduction = (Total Deductible Minutes / 60) × (Monthly Salary / (30 × 8)).

### Assumed Present Days (Al Maraghi Motors Only)
Last 2 days of the salary month are automatically treated as fully present to facilitate payroll timing. Actual discrepancies are carried forward to the next month.

---

## 6. Approval Process

### Roles & Access
- **Department Heads:** First-level approval of minutes with reasons.
- **HR Managers:** Review and finalize all reports for payroll.

### Grace Minutes Carry-Forward (Al Maraghi Auto Repairs)
Unused grace minutes (Base + Previously carried - Used) can be carried forward to future projects upon project closure.

---

## 7. Roles & Responsibilities

- **Admin:** Full system configuration and project management across all companies.
- **Supervisor / User:** Project management, analysis, and report editing.
- **CEO:** Oversight role with read-only access to all data.
- **Department Head:** Team-scoped approval access only.

---

## 8. Controls & Safeguards

- **Audit Trails:** Comprehensive activity logging (Login, Data Changes, Approvals).
- **Data Isolation:** Company-specific data silos.
- **Deletion Protection:** Confirmation dialogs and role-based restrictions.
- **Security:** Session management, IP logging, and page-level RBAC.

---

## 9. Reports & Accountability

- **Summary Attendance Report:** Quick overview of totals.
- **Daily Breakdown Report:** Detailed day-by-day logs.
- **Salary Calculation Report:** Final payroll data.
- **Exception Report:** List of all manual interventions.
- **Abnormal Dates Report:** Highlights data quality issues.

---

## 10. Backfill Missing Employees (Admin Tool)
Used to add missing active employees to finalized reports (e.g., those on extended leave without punches).

- **Mode:** `DRY_RUN` (Preview) or `APPLY` (Actual execution).
- **Safety:** Idempotent tool that only adds missing rows.

---

## 11. Recalculate Individual Salary (Admin Tool)
Allows regenerating salary totals for a single employee in a finalized report if parameters (OT, adjustments, divisor) change.

---

## 12. Salary Increments (Al Maraghi Motors)
Permanent salary changes that take effect from a specific month.
- **Non-Retroactive:** Affects future periods and related OT calculations.
- **Audit:** History of all increments is preserved for deterministic auditing.

---

## 13. Change Management
Historical projects use the rules in effect at their specific time. Rule changes apply only to future projects or controlled re-analysis.

---

**Last Updated:** March 28, 2026
