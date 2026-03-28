# ALM Attendance System - Technical Software Documentation
*Complete architectural reference for developers, auditors, and maintainers*

---

## 1. System Overview

### Purpose
The ALM Attendance Tracking System is an enterprise-grade attendance analysis platform designed to process raw biometric punch data and produce auditable payroll-ready reports. It automates the complex rule-based analysis of employee clock-in/clock-out records against configured shift schedules.

### Core Problems Solved
- **Manual Calculation Overhead:** Eliminates hours of manual timesheet processing.
- **Inconsistent Rule Application:** Ensures uniform application of policies.
- **Audit Trail Gaps:** Provides immutable historical records with full traceability.
- **Exception Management:** Handles holidays, leaves, and shift changes systemically.
- **Multi-Company Segregation:** Isolates data across multiple companies.

### System Boundaries
- **In-Scope:** Punch import (CSV), shift management, rule application, metric calculation, report generation, approval workflows.
- **Out-of-Scope:** Direct hardware integration, payroll disbursement, employee onboarding, time tracking for billing.

### Technical Policies
- **Desktop-Only:** Intentional restriction to screens ≥ 1024px with mouse/trackpad pointer.
- **Maintenance Mode:** Admin-controlled access restriction for updates.
- **Timezone Standard:** **UAE Time (Asia/Dubai, UTC+4)** exclusively for all logic and display.

---

## 2. Architecture Overview

### Technology Stack
- **Frontend:** React 18, TanStack React Query v5, React Router v6, Shadcn/ui, Tailwind CSS, Vite.
- **Backend (Base44 BaaS):** PostgreSQL, Deno serverless functions, File storage, Role-based auth.

### Security Model (RBAC)
- **Admin:** Full system access.
- **Supervisor:** Project/employee management and analysis execution (no system settings).
- **CEO:** Read-only access to all data (except settings modification).
- **Department Head:** Scoped to pre-approval dashboard only.
- **User:** Role-based page access via `PagePermission` entity.

---

## 3. Core Domain Concepts

- **Company:** Top-level organizational unit for data segregation.
- **Department:** Sub-division for filtering; managed via `CompanySettings`.
- **Employee:** Unique via HRMS ID; scoped via Attendance ID (biometric ID).
- **Project:** Time-bound analysis period (e.g., one month) with lifecycle states (draft, analyzed, closed).
- **Shift:** Defines expected AM/PM work hours; handles "single shift" and Friday-specific rules.
- **Punch:** Raw biometric event; `timestamp_raw` is **IMMUTABLE** for audit integrity.
- **Exception:** Overrides normal rules (Public Holiday, Manual Present, Overrides, etc.).
- **Salary:** Calculates deductions based on attendance results (Basic - LOP - Minutes).

### Grace vs. Approved Minutes
- **Grace Minutes:** System-wide buffer (default 15 mins) configured in `AttendanceRules`.
- **Approved Minutes:** Pre-approved by department heads; stored as `ALLOWED_MINUTES` exceptions.

---

## 4. Entity Reference

### Employee
Master registry. Key fields: `hrms_id` (Global Unique), `attendance_id` (Company-scoped), `company`, `department`, `weekly_off`.

### Project
Container for time-bound analysis. Fields: `date_from`, `date_to`, `status`, `shift_blocks_count`.

### Punch
Raw events. Fields: `project_id`, `attendance_id`, `timestamp_raw` (Immutable String), `punch_date`.

### Exception
Overrides. Fields: `attendance_id` (ID or "ALL"), `type`, `date_from`, `date_to`, `allowed_minutes`.

---

## 5. Critical Business Logic

### Attendance Calculation Flow
1. Fetch all project data (Punches, Shifts, Exceptions).
2. For each day:
    - Check holidays/weekly off.
    - Match punches to shift windows (AM/PM).
    - Calculate Late/Early minutes.
    - Subtract `ALLOWED_MINUTES`.
    - Determine status (Present/Absent/Half).
3. Aggregate results and save to `AnalysisResult`.

### Exception Precedence
1. `MANUAL_PRESENT/ABSENT` (Highest)
2. `PUBLIC_HOLIDAY`
3. `SICK/ANNUAL_LEAVE`
4. `SHIFT_OVERRIDE`
5. `ALLOWED_MINUTES`
6. `MANUAL_LATE/EARLY` (Lowest)

### Salary Deduction Formula
- `Leave Pay = (Basic Salary / 30) * (Annual Leave + LOP Days)`
- `Net Leave Deduction = max(0, Leave Pay - Salary Leave Amount)`
- `Final Salary = round(Total Salary - Net Leave Deduction, 2)`
- *Note: Special 12.33% adjustment for 9-hour employees on annual leave.*

---

## 6. Base44 Platform Rules

### 🚫 DO NOT MODIFY (Platform Managed)
- `index.html`, `index.css`, `tailwind.config.js`
- `lib/` folder internals
- `@/api/base44Client` instance
- `App.jsx` (Auto-routing)

### ✅ SAFE TO EDIT
- `pages/*.js` (Flat folder structure)
- `components/**/*.js` (Can have subfolders)
- `functions/*.js` (Isolated Deno handlers)
- `entities/*.json` (Full schema only)
- `agents/*.json`
- `globals.css`
- `Layout.js`

---

## 7. Known Constraints

- **Attendance ID:** Number type for device compatibility; must filter by company to avoid cross-tenant duplicates.
- **Project-Based Analysis:** Snapshots data to ensure historical immutability.
- **Aggressive Caching:** 15-30 minute `staleTime` in React Query; requires manual invalidation after mutations.

---

## 8. Common Developer Pitfalls
- **Type Mismatch:** Comparing `attendance_id` (Number) with string inputs.
- **Cache Invalidation:** Forgetting to call `queryClient.invalidateQueries` after updates.
- **Partial Deletes:** Leaving orphaned punches/exceptions when deleting a project.
- **Rounding:** Rounding intermediate steps instead of just the final result.

---
**Last Updated:** March 28, 2026
