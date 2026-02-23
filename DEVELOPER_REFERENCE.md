# Attendance Analyzer — Developer Reference

## 1) What this application does

This application is a full attendance-to-payroll workflow system for multi-company operations. It supports:

- Project-based attendance analysis (per date range).
- Punch/shift/exception processing into normalized analysis results.
- Controlled report finalization.
- Salary snapshot creation from finalized attendance.
- Salary report generation, verification, export, and post-finalization adjustments.
- Department-head approval workflows and policy controls.

Core high-level docs already in repo:

- `ARCHITECTURE.md`
- `REPORT_ARCHITECTURE` page (`src/pages/REPORT_ARCHITECTURE.jsx`)
- `CRITICAL_FINALIZATION_RULES` page (`src/pages/CRITICAL_FINALIZATION_RULES.jsx`)

---

## 2) Runtime architecture

### Frontend

- React + Vite SPA.
- Main routing via generated `src/pages.config.js`.
- App entry through `src/App.jsx` and `src/Layout.jsx`.
- Data access primarily through `base44` entities/functions (`src/api/base44Client.js`).

### Backend functions

Server logic lives in `functions/*.ts` and is invoked by frontend or other functions.
Important pipelines include:

- `runAnalysis.ts` — attendance analysis generation.
- `markFinalReport.ts` — mark a report final.
- `createSalarySnapshots.ts` — build salary snapshots for finalized report.
- `unfinalizeReport.ts` — rollback finalization and cleanup snapshots.
- `regenerateSalaryReport.ts`, `backfill*`, `repair*` functions for maintenance/recovery.

---

## 3) Main domain objects (conceptual)

- `Project`: analysis period + company + configuration (divisors, employee scope, etc.).
- `Employee`: master employee identity (attendance id/hrms id/department/etc.).
- `Punch`: raw attendance events.
- `ShiftTiming`: expected shift schedule per employee.
- `Exception`: manual/business overrides (annual leave, sick leave, manual present/absent, etc.).
- `AnalysisResult`: calculated attendance metrics for a report run.
- `ReportRun`: attendance report instance and finalization status.
- `SalarySnapshot`: immutable salary-calculation baseline created from finalized report.
- `SalaryReport`: report view/cache built from snapshots.

---

## 4) End-to-end flow

1. Create/open project and configure range/people/rules.
2. Run attendance analysis (`runAnalysis`).
3. Review report details, apply daily edits (stored in day overrides and converted to exceptions at save/finalize boundaries).
4. Finalize report (`markFinalReport`).
5. Create salary snapshots (`createSalarySnapshots`) from finalized data.
6. Generate/view salary report (`SalaryTab` / `SalaryReportDetail`).
7. Verify/export salary report.

---

## 5) Attendance analysis logic (how it works)

`runAnalysis.ts` does the heavy lifting:

- Loads punches, shifts, exceptions, employees, rules, project employee overrides, and Ramadan schedules.
- Applies employee scoping from project rules/custom employee IDs.
- Resolves day-by-day status using:
  - weekly offs,
  - explicit exceptions,
  - shift matches,
  - punch presence,
  - manual time exceptions.
- Produces summarized counters and minute fields (present/absent/leave/late/early/other/etc.).
- Persists `AnalysisResult` rows in batches.

### Exception precedence (practical)

Per-day exception resolution picks a single “latest by created date” candidate when multiple apply on same day, which drives day behavior.

### Daily overrides

`EditDayRecordDialog` writes per-day override data into `AnalysisResult.day_overrides` and recalculates aggregate minute fields (`late_minutes`, `early_checkout_minutes`, `other_minutes`, `deductible_minutes`) for that result.

---

## 6) Salary snapshot logic

`createSalarySnapshots.ts`:

- Accepts project/report IDs.
- Uses finalized analysis values as source for attendance-driven salary fields.
- Applies annual leave salary override logic via exception `salary_leave_days` (with overlap-aware computation).
- Applies salary formulas (leave pay, salary leave amount, net deductions, time deductions, OT and adjustments).
- Applies WPS split rules.
- Persists snapshots in chunks.
- Includes idempotency/self-heal logic for resilience.

---

## 7) Current salary leave policy in code

Salary context intentionally treats annual-leave values as salary override driven:

- `salary_leave_days` is the salary leave source.
- Salary annual leave is aligned to that value.
- Leave days in salary context are computed as:
  - `leaveDays = salary_leave_days + full_absence_count (LOP)`.

This alignment is enforced in backend snapshot generation and UI/report layers.

---

## 8) Role model (high-level)

Roles in code include: `admin`, `supervisor`, `ceo`, `user` (and dept-head capabilities through specific pages/actions).

- Finalization operations are privileged (admin/supervisor/ceo).
- Some day override operations are admin-only.
- Department-head workflows are implemented through dedicated dashboard/settings and approval records.

---

## 9) Known technical risks discovered in attendance-analysis audit

The following are findings from static code review (no behavior edits made in this audit pass):

1. **Potential truncation risk in `runAnalysis` fetches**
   - Multiple `.filter()` calls in `runAnalysis.ts` do not pass explicit high limits.
   - If SDK default limit is small, large projects may analyze partial datasets (punches/shifts/exceptions/employees).

2. **Exception conflict behavior is “latest created wins”**
   - On days with multiple applicable exceptions, resolution is based on descending `created_date` sort and selecting first.
   - This is deterministic but can surprise operators unless documented and controlled.

3. **Frontend daily override recomputation scope**
   - `EditDayRecordDialog` recalculates aggregate minute fields from override + prior totals for current `AnalysisResult` row.
   - Works for intended row-level edits, but correctness depends on consistency between parsed historical values and override metadata.

4. **Finalization pipeline depends on function deployment consistency**
   - Frontend finalize path invokes `markFinalReport` then `createSalarySnapshots`.
   - Runtime errors can persist if deployed function bundle lags behind repo changes.

---

## 10) Daily breakdown edit path (developer notes)

- Dialog reads punches/shifts/exceptions for context.
- Saves override payload into `AnalysisResult.day_overrides` keyed by date.
- Recomputes aggregate minute fields and updates the same `AnalysisResult` row.
- For admin sick-leave override, creates/ensures matching `Exception` record.

This means “daily breakdown edits” and “exceptions” are intentionally bridged.

---

## 11) Finalization and immutability principles

- Finalize marks report run final.
- Salary snapshots are generated from finalized state.
- Snapshot fields keep deductible and other minutes separate for audit fidelity.
- Unfinalize can remove snapshots and reopen editing path.

---

## 12) Export/reporting behavior

Salary report pages support:

- Live recompute on edits.
- Verification flags.
- Excel export.
- WPS/balance presentation and cap indicators.

---

## 13) Maintenance/recovery functions (important)

There are multiple maintenance functions to reconcile historical/report inconsistencies:

- `repairSalaryReportFromSnapshots.ts`
- `backfillSalaryReportFromSnapshots.ts`
- `recalculateAllSalarySnapshots.ts`
- `backfillReportMissingEmployees.ts`
- `auditReportRunIntegrity.ts`

Use these carefully; many are operational scripts for data correction.

---

## 14) How to onboard a new developer quickly

1. Read `ARCHITECTURE.md` and this file.
2. Trace user flow in UI:
   - `ProjectDetail.jsx` tabs (`RunAnalysisTab`, `ReportDetailView`, `SalaryTab`).
3. Read backend in this order:
   - `runAnalysis.ts`
   - `markFinalReport.ts`
   - `createSalarySnapshots.ts`
   - `SalaryReportDetail.jsx` / `SalaryTab.jsx` calculations.
4. Review maintenance functions before running any repair in production.

---

## 15) Suggested future hardening (documentation recommendation)

- Enforce explicit fetch limits in all critical `.filter()` calls.
- Add integration tests for:
  - mixed annual leave + LOP,
  - cross-month leave overlaps,
  - finalization idempotency,
  - large-employee project analysis.
- Centralize shared formulas in one backend utility to avoid divergence between UI and function scripts.

