# AI Agents Documentation
*Intelligent automation and decision support systems*

## ⚠️ CRITICAL: Development Guidelines - READ FIRST

### Before Making ANY Code Changes:
1. Read `AI_RULES.md`
2. Read all files in `.cursor/` directory
3. Read `ARCHITECTURE.md`
4. Read `CODEBASE_REVIEW.md`
5. Read `CODE_SCAN_REPORT.md`
6. Read `DEVELOPER_REFERENCE.md`

### Architectural Safety Rules:
- Architecture files are **PROTECTED** - do not modify unless explicitly asked
- Do NOT duplicate architecture patterns, flows, or modules
- REUSE existing structures and integration patterns
- If a change conflicts with architecture rules → **STOP and explain before editing**

### Base44-Specific Rules:
- This is a **Base44-backed application**
- Do NOT run or validate backend functions locally unless explicitly requested
- Treat `functions/` as Base44-managed backend code
- Frontend/backend integration MUST follow existing `base44.functions.invoke(...)` patterns

### Workflow Rules:
1. **Inspect** existing code first
2. **Plan** changes with minimal impact
3. **Implement** production-safe code only
4. Prefer reusing existing pages, hooks, components, utilities, and entity flows
5. Before finalizing: summarize changed files and potential architecture impact

> [!IMPORTANT]
> **⚡ Golden Rule:** Keep changes **minimal** and **production-safe**. When in doubt, ask before modifying core architecture.

---

## Agent Architecture Overview
The attendance management system leverages multiple AI agents for automated data processing, anomaly detection, and intelligent decision support. Each agent operates independently but coordinates through shared data entities.

> [!NOTE]
> **Base44 Integration Pattern:** All agents are implemented as Base44 backend functions in `functions/` directory. Frontend communicates via `base44.functions.invoke(functionName, payload)`. Never attempt to execute backend logic in the frontend.

---

## 1. Attendance Analysis Agent
*Core Engine*
Automated attendance record analysis with pattern recognition and validation.

### Capabilities:
- Pattern recognition in punch data
- Shift timing validation
- Exception rule application
- Grace minute calculations
- Ramadan schedule processing

### Integration Points:
- `functions/runAnalysis`
- `functions/runAnalysisChunked`

> [!TIP]
> **Performance Optimization:** Processes employees in 50-record chunks to avoid timeout on large datasets (200+ employees). Real-time progress tracking with user-friendly status updates.

---

## 2. Payroll Insights Agent
*AI-Powered Analytics*
Advanced salary analysis with anomaly detection and optimization recommendations.

### Features:
- Salary trend analysis
- Deduction anomaly detection
- Department comparative analysis
- Budget forecasting
- Optimization recommendations

### Access Location:
- `pages/AIPayrollInsights`
- `functions/analyzePayrollWithAI`

---

## 3. Data Quality Agent
*Pre-Analysis Validation*
Comprehensive validation before analysis execution to ensure data integrity.

### Validation Rules:
- Punch data completeness
- Shift timing configuration
- Exception validity
- Date range consistency
- Employee mapping integrity

### Validation Severity Levels:
- **ERROR:** Blocks analysis
- **WARNING:** Requires confirm
- **INFO:** Informational

---

## 4. Ramadan Schedule Intelligence Agent
*Automated Rotation*
Intelligent management of two-week Ramadan shift rotations with company-specific rules.

### Functions:
- `applyRamadanShifts` - Bulk shift generation
- `swapRamadanWeeks` - Week rotation swap
- `undoRamadanShifts` - Cleanup rollback

### Business Logic:
Supports two-week rotation patterns, Friday-specific overrides, and date overlap detection. Special handling for Al Maraghi Automotive company rules.

---

## 5. Integrity Validation Agent
*Post-Finalization*
Automated consistency verification and repair across all data entities.

### Validation Checkpoints:
1. AnalysisResult count = Expected employee count
2. SalarySnapshot count = AnalysisResult count
3. Deductible minutes consistency
4. Grace minute carryover accuracy

### Key Functions:
- `auditReportRunIntegrity`
- `repairSalaryReportFromSnapshots`
- `backfillReportMissingEmployees`

---

## 6. Grace Minute Management Agent
*Intelligent Tracking*
Automated grace minute tracking with carryover calculations and approval workflows.

### Business Rules:
- Default: 15 minutes grace per day
- Unused grace carries forward to next project
- Half-yearly allowance: 120 minutes per employee
- Department head approval workflow

---

## Agent Security & Permissions
- **Admin:** Full agent access + override capabilities
- **Supervisor / HR Manager:** Analysis and reporting agents
- **Department Head:** Team-scoped analysis only
- **CEO:** Full read access, no delete

---

## Future Agent Enhancements
- **Predictive Absence Agent:** ML-based absence forecasting
- **Smart Shift Optimizer:** AI-recommended shift assignments
- **Compliance Audit Agent:** Automated labor law compliance checks
- **Natural Language Query Agent:** Chat interface for report generation

---

## Base44 Backend Architecture

### Function Invocation Pattern (Frontend):
```javascript
// Frontend agent call
import { base44 } from '@/api/base44Client';

const result = await base44.functions.invoke('runAnalysis', {
    project_id: projectId,
    date_from: '2026-01-01',
    date_to: '2026-01-31'
});
```

### Backend Function Structure:
```javascript
// functions/agentName.js
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // User-scoped operations
    const data = await base44.entities.Employee.list();
    
    // Admin-scoped operations
    const adminData = await base44.asServiceRole.entities.Project.update(id, data);
    
    return Response.json({ success: true, data });
});
```

> [!CAUTION]
> **Important:**
> - Backend functions run on Deno Deploy (serverless)
> - Do NOT attempt to run backend functions locally
> - All npm imports must use `npm:package@version` prefix
> - Maximum execution time: ~10 seconds (use chunking for longer operations)

---

## Agent Development Workflow
1. **Inspect Existing Code:** Review existing agents in `functions/` for patterns
2. **Plan Minimal Changes:** Identify reusable components, hooks, and utilities
3. **Implement Production-Safe:** Follow Base44 patterns, add error handling, validate inputs
4. **Document & Summarize:** List changed files and architecture impact

### Best Practices:
- Reuse existing entity flows (Employee, Project, AnalysisResult)
- Follow existing permission patterns (admin, supervisor, department_head)
- Use React Query for all data fetching with proper cache keys
- Implement progress indicators for long-running operations
- Add audit logging for all state-changing operations

---

## Agent Testing & Validation
- **✓** Empty/null input handling
- **✓** Edge cases (first/last records, date boundaries)
- **✓** Permission validation for all roles
- **✓** Timeout handling (chunk large operations)
- **✓** Database constraint violations
- **✓** Network failure retry logic

> [!NOTE]
> **Testing in Base44:** Use the Base44 dashboard function testing tool to validate backend functions before deploying to production. Test with real data from staging environment when possible.

---

**System Owner:** Al Maraghi Auto Repairs - HR Department  
**Location:** Abu Dhabi, UAE  
**Timezone:** Asia/Dubai (UTC+4)  
**Platform:** Base44 (base44.app)

*For architecture questions or guidance, consult the primary documentation files.*
