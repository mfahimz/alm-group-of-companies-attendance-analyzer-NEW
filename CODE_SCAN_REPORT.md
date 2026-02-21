# Code Scan Report
## Scope
- Static scan across frontend (`src/`) and backend functions (`functions/`).
- Commands used: `npm run -s lint`, `npm run -s typecheck`, plus scripted inventory scans.
## 1) Issue Findings (Complete Scan)
- ESLint: **205 errors**, **85 warnings** across **98 files with errors**.
- Most frequent rule violations:
  - `unused-imports/no-unused-imports`: 201
  - `unused-imports/no-unused-vars`: 85
  - `parse`: 2
  - `react-hooks/rules-of-hooks`: 2
- Typecheck failed with JSX parsing token issues in two files (five TS1382 diagnostics total).

### Highest-impact issues to fix first
1. **React Hooks correctness violation** (`react-hooks/rules-of-hooks`) in `src/pages/Employees.jsx` (conditional `useMutation`).
2. **JSX parse errors** due to raw `>` tokens in rendered text: `src/components/project-tabs/ReportDetailView.jsx`, `src/pages/TechnicalDocumentation.jsx`.
3. **Unused imports/vars debt**: 201 unused-import errors + 85 unused-vars warnings degrading maintainability and blocking clean CI.

### Top files by issue count (snapshot)
- `src/components/ui/NotificationCenter.jsx`: 17 errors, 0 warnings
- `src/pages/Dashboard.jsx`: 14 errors, 4 warnings
- `src/pages/Employees.jsx`: 13 errors, 2 warnings
- `src/pages/Users.jsx`: 8 errors, 1 warnings
- `src/pages/DepartmentHeadDashboard.jsx`: 7 errors, 1 warnings
- `src/pages/ReportDetail.jsx`: 6 errors, 2 warnings
- `src/pages/SalaryReportDetail.jsx`: 6 errors, 2 warnings
- `src/components/project-tabs/ExceptionsTab.jsx`: 4 errors, 9 warnings
- `src/components/project-tabs/SalaryTab.jsx`: 4 errors, 4 warnings
- `src/pages/ProjectDetail.jsx`: 4 errors, 2 warnings
- `src/pages/AnnualLeaveManagement.jsx`: 4 errors, 1 warnings
- `src/components/dashboard/PendingApprovals.jsx`: 4 errors, 0 warnings
- `src/components/ui/Navbar1.jsx`: 4 errors, 0 warnings
- `src/pages/DevelopmentLog.jsx`: 3 errors, 1 warnings
- `src/components/dashboard/QuickActions.jsx`: 3 errors, 0 warnings

### Typecheck diagnostics
- `src/components/project-tabs/ReportDetailView.jsx(2175,74): error TS1382: Unexpected token. Did you mean `{'>'}` or `&gt;`?`
- `src/components/project-tabs/ReportDetailView.jsx(2175,84): error TS1382: Unexpected token. Did you mean `{'>'}` or `&gt;`?`
- `src/pages/TechnicalDocumentation.jsx(729,79): error TS1382: Unexpected token. Did you mean `{'>'}` or `&gt;`?`
- `src/pages/TechnicalDocumentation.jsx(729,96): error TS1382: Unexpected token. Did you mean `{'>'}` or `&gt;`?`
- `src/pages/TechnicalDocumentation.jsx(729,113): error TS1382: Unexpected token. Did you mean `{'>'}` or `&gt;`?`

## 2) Backend Functions tied to Base44
- Total backend function files scanned: **84**
- Functions tied to Base44 SDK (`createClientFromRequest` and/or `base44.*`): **84 / 84**
- Conclusion: **All backend functions in `functions/` are tied to Base44**.

### Function inventory by prefix
- `sync*`: 8
- `recalculate*`: 7
- `create*`: 5
- `fix*`: 5
- `migrate*`: 4
- `backfill*`: 3
- `delete*`: 3
- `import*`: 3
- `run*`: 3
- `save*`: 3
- `audit*`: 2
- `close*`: 2
- `debug*`: 2
- `generate*`: 2
- `regenerate*`: 2
- `reset*`: 2
- `update*`: 2
- `add*`: 1
- `admin*`: 1
- `analyze*`: 1
- `apply*`: 1
- `check*`: 1
- `cleanup*`: 1
- `compute*`: 1
- `enable*`: 1
- `export*`: 1
- `find*`: 1
- `force*`: 1
- `get*`: 1
- `initialize*`: 1
- `lock*`: 1
- `log*`: 1
- `mark*`: 1
- `populate*`: 1
- `preview*`: 1
- `repair*`: 1
- `resolve*`: 1
- `security*`: 1
- `send*`: 1
- `store*`: 1
- `unfinalize*`: 1
- `validate*`: 1
- `verify*`: 1

### Base44 entities referenced by backend functions
- Total unique entities referenced: **35**
- `ActivityLog` (used by 1 functions)
- `AnalysisResult` (used by 21 functions)
- `AnnualLeave` (used by 1 functions)
- `AttendanceRules` (used by 11 functions)
- `AuditLog` (used by 6 functions)
- `CalendarCarryoverBucket` (used by 1 functions)
- `CalendarCycle` (used by 4 functions)
- `CalendarDay` (used by 1 functions)
- `CalendarEmployeeMonthlySummary` (used by 2 functions)
- `CalendarPayrollSnapshot` (used by 2 functions)
- `CalendarSettings` (used by 1 functions)
- `ChecklistItem` (used by 1 functions)
- `Company` (used by 1 functions)
- `CompanySettings` (used by 2 functions)
- `DepartmentHead` (used by 2 functions)
- `Employee` (used by 35 functions)
- `EmployeeGraceHistory` (used by 6 functions)
- `EmployeeQuarterlyMinutes` (used by 13 functions)
- `EmployeeSalary` (used by 15 functions)
- `Exception` (used by 13 functions)
- `OvertimeData` (used by 1 functions)
- `PagePermission` (used by 3 functions)
- `PrivateFile` (used by 1 functions)
- `Project` (used by 28 functions)
- `ProjectEmployee` (used by 1 functions)
- `Punch` (used by 9 functions)
- `RamadanPlanSchedule` (used by 1 functions)
- `RamadanSchedule` (used by 2 functions)
- `ReportRun` (used by 17 functions)
- `SalaryIncrement` (used by 5 functions)
- `SalaryReport` (used by 6 functions)
- `SalarySnapshot` (used by 20 functions)
- `ShiftTiming` (used by 9 functions)
- `SystemSettings` (used by 1 functions)
- `User` (used by 1 functions)

### Per-function Base44 tie map
| Function | Uses auth | Uses service-role | Entities referenced | Calls other Base44 functions |
|---|---:|---:|---|---|
| `addHomePagePermission.ts` | Yes | Yes | PagePermission | — |
| `adminFinalizeReport.ts` | Yes | Yes | Project, ReportRun | invoke |
| `analyzePayrollWithAI.ts` | Yes | Yes | AnalysisResult, Employee, Exception, Project, SalarySnapshot | — |
| `applyRamadanShifts.ts` | Yes | Yes | Employee, Project, RamadanSchedule, ShiftTiming | — |
| `auditDeductibleMismatch.ts` | Yes | Yes | AnalysisResult, SalaryReport, SalarySnapshot | — |
| `auditReportRunIntegrity.ts` | Yes | Yes | AnalysisResult, ReportRun, SalaryReport, SalarySnapshot | — |
| `backfillReportMissingEmployees.ts` | Yes | Yes | AnalysisResult, AttendanceRules, Employee, EmployeeSalary, Exception, Project, Punch, ReportRun, SalarySnapshot, ShiftTiming | — |
| `backfillSalaryExtraPrevMonthDeductibleMinutes.ts` | Yes | Yes | AttendanceRules, Employee, Exception, Project, Punch, ReportRun, SalarySnapshot, ShiftTiming | — |
| `backfillSalaryReportFromSnapshots.ts` | Yes | Yes | SalaryReport, SalarySnapshot | — |
| `checkEmployeeCarriedGrace.ts` | Yes | Yes | Employee, EmployeeGraceHistory, Project | — |
| `cleanupQuarterlyMinutes.ts` | Yes | Yes | Employee, EmployeeQuarterlyMinutes | — |
| `closeCycle.ts` | Yes | Yes | CalendarCycle, CalendarPayrollSnapshot | — |
| `closeProject.ts` | Yes | Yes | AnalysisResult, AttendanceRules, Employee, EmployeeGraceHistory, EmployeeQuarterlyMinutes, Exception, Project, ReportRun | — |
| `computeMonthEndAssumedDates.ts` | Yes | No | — | — |
| `create2026QuarterlyMinutes.ts` | Yes | Yes | Employee, EmployeeQuarterlyMinutes | — |
| `createCalendarCycle.ts` | Yes | Yes | CalendarCycle | — |
| `createOtherMinutesChecklistTask.ts` | No | Yes | ChecklistItem, DepartmentHead, Employee, Exception | — |
| `createSalarySnapshots.ts` | Yes | Yes | AnalysisResult, AttendanceRules, CompanySettings, Employee, EmployeeSalary, Exception, OvertimeData, Project, Punch, ReportRun, SalaryIncrement, SalarySnapshot, ShiftTiming | — |
| `createSalarySnapshotsForDateRange.ts` | Yes | Yes | AnalysisResult, AttendanceRules, Employee, EmployeeSalary, Exception, Project, Punch, ReportRun, SalaryIncrement, ShiftTiming | — |
| `debugGraceFullFlow.ts` | Yes | Yes | Employee, EmployeeGraceHistory, Project | — |
| `debugGraceMinutes.ts` | Yes | Yes | AnalysisResult, AttendanceRules, Employee, EmployeeGraceHistory, Project | — |
| `deleteNovemberReports.ts` | Yes | Yes | AnalysisResult, Exception, Project, ReportRun | — |
| `deleteProjectPunches.ts` | Yes | Yes | Punch | — |
| `deleteQuarterlyMinutes2026.ts` | Yes | Yes | EmployeeQuarterlyMinutes | — |
| `enableApprovedMinutesForAlMaraghi.ts` | Yes | Yes | AttendanceRules | — |
| `exportToPrivateFile.ts` | Yes | No | PrivateFile | — |
| `findAndFixDuplicateQuarterlyMinutes.ts` | Yes | Yes | EmployeeQuarterlyMinutes | — |
| `fixAllDeductibleMinutes.ts` | Yes | Yes | AnalysisResult | — |
| `fixAnalysisResultAttendanceIds.ts` | Yes | Yes | AnalysisResult | — |
| `fixAttendanceIdTypes.ts` | Yes | Yes | AnalysisResult | — |
| `fixSalaryRecordByAttendanceId.ts` | Yes | Yes | Employee, EmployeeSalary | — |
| `fixSalarySnapshotDeductibleHours.ts` | Yes | Yes | AnalysisResult, Project, SalarySnapshot | — |
| `forcePunchDelete.ts` | Yes | Yes | Punch | — |
| `generateHrmsId.ts` | Yes | Yes | Employee | — |
| `generateMissingHrmsIds.ts` | Yes | Yes | Employee | — |
| `getOrCreateQuarterlyMinutes.ts` | Yes | Yes | EmployeeQuarterlyMinutes | — |
| `importAnnualLeavesToProject.ts` | Yes | Yes | AnnualLeave, Exception, Project | — |
| `importRamadanScheduleFromExcel.ts` | Yes | Yes | Employee, RamadanPlanSchedule | — |
| `importRamadanShifts.ts` | Yes | Yes | ShiftTiming | — |
| `initializeQuarterForCompany.ts` | Yes | Yes | Employee, EmployeeQuarterlyMinutes | — |
| `lockCycle.ts` | Yes | Yes | CalendarCycle | — |
| `logAudit.ts` | Yes | Yes | AuditLog | invoke |
| `markFinalReport.ts` | Yes | Yes | AnalysisResult, Employee, EmployeeSalary, Project, ReportRun | — |
| `migrateAllowancesToNumber.ts` | Yes | Yes | EmployeeSalary | — |
| `migrateAttendanceIds.ts` | Yes | Yes | AnalysisResult, Employee, Exception, Punch, ShiftTiming | — |
| `migrateOtherMinutes.ts` | Yes | Yes | Exception, Project | — |
| `migrateToCalendarQuarters.ts` | Yes | Yes | Employee, EmployeeQuarterlyMinutes | — |
| `populateSpecificEmployeesQuarterlyMinutes.ts` | Yes | Yes | Employee, EmployeeQuarterlyMinutes | — |
| `previewGraceCarryForward.ts` | Yes | Yes | AnalysisResult, AttendanceRules, Employee, Project, ReportRun | — |
| `recalculateAllSalarySnapshots.ts` | Yes | Yes | AuditLog, EmployeeSalary, Project, SalarySnapshot | — |
| `recalculateAllSnapshots.ts` | Yes | Yes | SalarySnapshot | invoke |
| `recalculateGraceMinutes.ts` | Yes | Yes | AnalysisResult, Employee, Project | — |
| `recalculateIndividualSalary.ts` | Yes | Yes | EmployeeSalary, Project, ReportRun, SalarySnapshot | — |
| `recalculateReportDeductibles.ts` | Yes | Yes | ReportRun | — |
| `recalculateSalarySnapshot.ts` | Yes | Yes | AuditLog, EmployeeSalary, Project, SalaryIncrement, SalarySnapshot | — |
| `recalculateSickLeaveWorkingDays.ts` | Yes | Yes | AnalysisResult, SalarySnapshot | — |
| `regenerateSalaryReport.ts` | Yes | Yes | SalaryReport, SalarySnapshot | — |
| `regenerateSnapshotsAndReport.ts` | Yes | Yes | SalaryReport, SalarySnapshot | — |
| `repairSalaryReportFromSnapshots.ts` | Yes | Yes | AnalysisResult, AttendanceRules, Employee, EmployeeSalary, Exception, Project, Punch, ReportRun, SalaryReport, SalarySnapshot, ShiftTiming | — |
| `resetGraceCarryForwardFlag.ts` | Yes | Yes | Project | — |
| `resetQuarterlyMinutes.ts` | No | Yes | Employee, EmployeeQuarterlyMinutes | — |
| `resolveSalaryForMonth.ts` | No | Yes | EmployeeSalary, SalaryIncrement | — |
| `runAnalysis.ts` | Yes | Yes | AnalysisResult, AttendanceRules, Employee, Exception, Project, ProjectEmployee, Punch, RamadanSchedule, ReportRun, ShiftTiming | — |
| `runCalendarMigrationMonthlySummariesFromProjects.ts` | Yes | Yes | CalendarEmployeeMonthlySummary, Project, ReportRun, SalarySnapshot | — |
| `runCalendarPayrollPreview.ts` | Yes | Yes | CalendarCarryoverBucket, CalendarCycle, CalendarDay, CalendarEmployeeMonthlySummary, CalendarPayrollSnapshot, CalendarSettings, Employee, EmployeeSalary | invoke |
| `saveDayOverride.ts` | Yes | Yes | AuditLog, Project, SalarySnapshot | — |
| `saveSalaryEdits.ts` | Yes | Yes | Project, SalarySnapshot | invoke |
| `saveUnusedGraceMinutes.ts` | Yes | Yes | AnalysisResult, AttendanceRules, Employee, EmployeeGraceHistory, Project, ReportRun | — |
| `securityAudit.ts` | Yes | Yes | ActivityLog, AuditLog, User | — |
| `sendTestEmail.ts` | Yes | No | — | — |
| `storeCustomDomain.ts` | Yes | Yes | SystemSettings | — |
| `syncEmployeeNamesFromSalary.ts` | Yes | Yes | Employee, EmployeeSalary | — |
| `syncEmployeeToQuarterlyMinutes.ts` | No | Yes | Employee, EmployeeQuarterlyMinutes | — |
| `syncEmployeeToSalary.ts` | Yes | Yes | EmployeeSalary | — |
| `syncExistingCompanies.ts` | Yes | Yes | Company, CompanySettings, Employee | — |
| `syncHistoryToEmployeeCarriedGrace.ts` | Yes | Yes | Employee, EmployeeGraceHistory | — |
| `syncPagePermissions.ts` | Yes | Yes | PagePermission | — |
| `syncQuarterlyMinutesToEmployee.ts` | No | Yes | Employee, EmployeeQuarterlyMinutes | — |
| `syncSalaryIncrements.ts` | Yes | Yes | EmployeeSalary, SalaryIncrement | — |
| `unfinalizeReport.ts` | Yes | Yes | ReportRun, SalarySnapshot | — |
| `updateHRManagementPermissions.ts` | Yes | Yes | PagePermission | — |
| `updateQuarterlyMinutes.ts` | Yes | Yes | EmployeeQuarterlyMinutes | — |
| `validateSecureAccess.ts` | Yes | Yes | AuditLog | — |
| `verifyDepartmentHead.ts` | Yes | Yes | DepartmentHead, Employee | — |
