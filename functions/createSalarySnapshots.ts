import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * DATA ACCESS LAYER - EXPLICIT LIMITS ENFORCED
 * 
 * CRITICAL RULE: All .filter() calls MUST include explicit limit parameter.
 * Base44 SDK default limit causes silent data truncation.
 * 
 * Pattern: entitySDK.filter(filterObj, sortKey, EXPLICIT_LIMIT)
 * Example: Employee.filter({ active: true }, null, 5000)
 */

/**
 * CREATE SALARY SNAPSHOTS
 * 
 * CORE RULE: Every active employee MUST have a SalarySnapshot when a report is finalized.
 * Attendance quality does NOT decide salary inclusion.
 * 
 * Active Employee Definition:
 * - employee.company === project.company
 * - employee.active === true
 * - A valid EmployeeSalary record exists
 * 
 * SALARY-ONLY EMPLOYEES (has_attendance_tracking=false):
 * - Employees without attendance_id CAN be included if has_attendance_tracking=false
 * - They receive salary WITHOUT attendance deductions
 * - Their snapshots will have attendance_source = "NO_ATTENDANCE_DATA"
 * 
 * Algorithm:
 * 1. Fetch ALL active employees for the project company with valid salary records
 * 2. For EACH employee:
 *    - Try to find AnalysisResult for the finalized report_run_id
 *    - If found → use attendance values, set attendance_source = "ANALYZED"
 *    - If NOT found → create ZERO-ATTENDANCE snapshot, set attendance_source = "NO_ATTENDANCE_DATA"
 */

Deno.serve(async (req) => {
    try {
        console.log('[createSalarySnapshots] Function invoked');
        const base44 = createClientFromRequest(req);
        
        // Allow service role calls (from markFinalReport)
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (authError) {
            console.log('[createSalarySnapshots] No user auth, likely service role call');
        }

        const { project_id, report_run_id, batch_mode = false, batch_start = 0, batch_size = 10 } = await req.json();
        console.log('[createSalarySnapshots] Params:', { project_id, report_run_id });

        if (!project_id || !report_run_id) {
            return Response.json({ 
                error: 'project_id and report_run_id are required' 
            }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        // DIVISOR_LEAVE_DEDUCTION: Used for current month Leave Pay, Salary Leave Amount, Deductible Hours Pay
        const divisor = project.salary_calculation_days || 30;
        // DIVISOR_OT: Used for OT Hourly Rate, Previous Month LOP Days, Previous Month Deductible Minutes
        const otDivisor = project.ot_calculation_days || divisor;
        const isAlMaraghi = project.company === 'Al Maraghi Motors';

        // ============================================================
        // CRITICAL FIX: Delete existing snapshots ONLY on first batch
        // This prevents each batch from destroying previous batches' work
        // ============================================================
        if (batch_mode && batch_start === 0) {
            const existingSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
                project_id: project_id,
                report_run_id: report_run_id
            }, null, 5000);

            if (existingSnapshots.length > 0) {
                console.log(`[createSalarySnapshots] 🗑️ BATCH 1: Deleting ${existingSnapshots.length} existing snapshots`);
                await Promise.all(existingSnapshots.map(s => base44.asServiceRole.entities.SalarySnapshot.delete(s.id)));
            } else {
                console.log(`[createSalarySnapshots] ✅ BATCH 1: No existing snapshots to delete`);
            }
        } else if (batch_mode) {
            console.log(`[createSalarySnapshots] ⏭️ BATCH ${Math.floor(batch_start / batch_size) + 1}: Skipping deletion (not first batch)`);
        }

        // ============================================================
        // AL MARAGHI MOTORS: Calculate salary month ranges
        // ============================================================
        let salaryMonthStartStr = null;
        let salaryMonthEndStr = null;
        let extraPrevMonthFrom = null;
        let extraPrevMonthTo = null;
        let hasExtraPrevMonthRange = false;

        // ============================================================
        // AL MARAGHI MOTORS: ASSUMED PRESENT DAYS (Last 2 days of month)
        // Per payroll rules, the last 2 days of the salary month are treated
        // as FULLY PRESENT for salary calculation only:
        // - No LOP days
        // - No late minutes  
        // - No early checkout minutes
        // - No other minutes
        // - No deductible minutes
        // This does NOT affect attendance data (runAnalysis.js).
        // Exception: If employee has ANNUAL_LEAVE on those days, honor the leave.
        // ============================================================
        let assumedPresentDays = [];
        
        if (isAlMaraghi) {
            const projectDateTo = new Date(project.date_to);
            const salaryMonthStart = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth(), 1);
            const salaryMonthEnd = new Date(projectDateTo.getFullYear(), projectDateTo.getMonth() + 1, 0);
            
            salaryMonthStartStr = salaryMonthStart.toISOString().split('T')[0];
            salaryMonthEndStr = salaryMonthEnd.toISOString().split('T')[0];

            // Calculate assumed present days: last 2 days of salary month
            // Day before end of month (e.g., Jan 30)
            const assumedDay1 = new Date(projectDateTo);
            assumedDay1.setDate(assumedDay1.getDate() - 1);
            // Last day of month (e.g., Jan 31)
            const assumedDay2 = new Date(projectDateTo);
            
            assumedPresentDays = [
                assumedDay1.toISOString().split('T')[0],
                assumedDay2.toISOString().split('T')[0]
            ];

            // Extra previous month range
            const projectDateFrom = new Date(project.date_from);
            const dayBeforeSalaryMonth = new Date(salaryMonthStart);
            dayBeforeSalaryMonth.setDate(dayBeforeSalaryMonth.getDate() - 1);

            if (projectDateFrom < salaryMonthStart) {
                extraPrevMonthFrom = project.date_from;
                extraPrevMonthTo = dayBeforeSalaryMonth.toISOString().split('T')[0];
                hasExtraPrevMonthRange = true;
            }

            console.log('[createSalarySnapshots] Al Maraghi salary month ranges:', {
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                extra_prev_month_from: extraPrevMonthFrom,
                extra_prev_month_to: extraPrevMonthTo,
                has_extra_range: hasExtraPrevMonthRange,
                assumed_present_days: assumedPresentDays
            });
        }



        // Verify report exists
        const reports = await base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id, project_id: project_id });
        if (reports.length === 0) {
            return Response.json({ error: 'Report not found for this project' }, { status: 404 });
        }
        const reportRun = reports[0];

        // Fetch core data
        // CRITICAL: .filter() has DEFAULT LIMIT of 50 - must specify higher limit or use list()
        const [employees, salaries, analysisResults, allExceptions, salaryIncrements, rulesData, punches, shifts] = await Promise.all([
            base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }, null, 5000),
            base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true }, null, 5000),
            base44.asServiceRole.entities.AnalysisResult.filter({ 
                project_id: project_id,
                report_run_id: report_run_id
            }, null, 5000),
            base44.asServiceRole.entities.Exception.filter({ project_id: project_id }, null, 5000),
            isAlMaraghi 
                ? base44.asServiceRole.entities.SalaryIncrement.filter({ company: 'Al Maraghi Motors', active: true }, null, 5000)
                : Promise.resolve([]),
            base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company }, null, 5000),
            base44.asServiceRole.entities.Punch.filter({ project_id }),
            base44.asServiceRole.entities.ShiftTiming.filter({ project_id })
        ]);

        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] EXECUTION TRACE START`);
        console.log(`[createSalarySnapshots] BATCH_MODE=${batch_mode}, BATCH_START=${batch_start}, BATCH_SIZE=${batch_size}`);
        console.log(`[createSalarySnapshots] RAW DATA FETCHED: ${employees.length} employees, ${salaries.length} salaries, ${analysisResults.length} analysis results`);
        console.log(`[createSalarySnapshots] ============================================`);

        // Parse rules
        let rules = null;
        if (rulesData && rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                console.warn('[createSalarySnapshots] Failed to parse rules, using defaults');
            }
        }

        // ============================================================
        // NEW LOGIC: Create salary snapshots for ALL active employees
        // ============================================================
        const snapshots = [];
        let analyzedCount = 0;
        let noAttendanceCount = 0;
        
        // Filter employees to project's custom_employee_ids if specified
        let eligibleEmployees = employees;
        if (project.custom_employee_ids && project.custom_employee_ids.trim()) {
            const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id);
            eligibleEmployees = employees.filter(emp => {
                const isMatched = customIds.includes(String(emp.hrms_id)) || customIds.includes(String(emp.attendance_id));
                
                // CRITICAL: Salary-only employees (no attendance_id) can be included
                // IF has_attendance_tracking is false, they are salary-only and should be included
                // IF has_attendance_tracking is true but no attendance_id, it's a data error - skip and warn
                if (isMatched && !(emp.attendance_id && String(emp.attendance_id).trim() !== '')) {
                    if (emp.has_attendance_tracking !== true) {
                        console.log(`[createSalarySnapshots] INFO: Including salary-only employee ${emp.name} (HRMS ID: ${emp.hrms_id}) without attendance_id per user request.`);
                        return true; // Include this employee as salary-only
                    } else {
                        console.warn(`[createSalarySnapshots] WARNING: Skipping employee ${emp.name} (HRMS ID: ${emp.hrms_id}) because they are marked for attendance tracking but have no attendance_id. This is a data inconsistency and needs to be resolved.`);
                        return false; // Skip as it's an inconsistency
                    }
                }
                return isMatched;
            });
            console.log(`[createSalarySnapshots] Filtered to ${eligibleEmployees.length} employees from custom_employee_ids`);
        }
        
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] ✅ TOTAL ELIGIBLE EMPLOYEES: ${eligibleEmployees.length}`);
        console.log(`[createSalarySnapshots] ELIGIBLE EMPLOYEE IDs: [${eligibleEmployees.map(e => e.attendance_id || e.hrms_id).slice(0, 20).join(', ')}${eligibleEmployees.length > 20 ? '...' : ''}]`);
        console.log(`[createSalarySnapshots] ============================================`);
        
        // BATCH MODE: Process only a subset of employees
        const employeesToProcess = batch_mode 
            ? eligibleEmployees.slice(batch_start, batch_start + batch_size)
            : eligibleEmployees;
        
        console.log(`[createSalarySnapshots] 📦 THIS BATCH: ${employeesToProcess.length} employees (indices ${batch_start} to ${batch_start + employeesToProcess.length - 1})`);
        console.log(`[createSalarySnapshots] THIS BATCH IDs: [${employeesToProcess.map(e => e.attendance_id || e.hrms_id).join(', ')}]`);
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] 🔄 ENTERING FOR LOOP - Processing ${employeesToProcess.length} employees`);
        console.log(`[createSalarySnapshots] ============================================`);
        
        let loopIterationCount = 0;
        for (const emp of employeesToProcess) {
            loopIterationCount++;
            console.log(`[createSalarySnapshots] >>> LOOP ITERATION ${loopIterationCount}/${employeesToProcess.length}: Processing ${emp.name} (attendance_id: ${emp.attendance_id || 'NONE'}, hrms_id: ${emp.hrms_id})`);
            // Find matching salary record (REQUIRED for salary snapshot)
            const baseSalary = salaries.find(s => 
                String(s.employee_id) === String(emp.hrms_id) || 
                (emp.attendance_id && String(s.attendance_id) === String(emp.attendance_id))
            );
            
            // Skip if no salary record - employee is not eligible for salary
            if (!baseSalary) {
                console.log(`[createSalarySnapshots] ⚠️ SKIP: ${emp.name} (${emp.attendance_id || emp.hrms_id}) - no salary record found`);
                console.log(`[createSalarySnapshots] >>> LOOP ITERATION ${loopIterationCount} COMPLETE (skipped - no salary)`);
                continue;
            }
            
            console.log(`[createSalarySnapshots] ✅ Salary record found for ${emp.name}`);
            console.log(`[createSalarySnapshots] 💰 Salary Data: basic_salary=${baseSalary.basic_salary}, allowances=${baseSalary.allowances}, allowances_with_bonus=${baseSalary.allowances_with_bonus}, total_salary=${baseSalary.total_salary}`);
            
            // ============================================================
            // AL MARAGHI MOTORS: SALARY INCREMENT RESOLUTION
            // For current month salary: use increment effective for salary month
            // For previous month calculations: use increment effective for that month
            // ============================================================
            let currentMonthSalary = { ...baseSalary };
            let prevMonthSalary = { ...baseSalary };
            
            if (isAlMaraghi && salaryIncrements.length > 0) {
                // Get increments for this employee
                const empIncrements = salaryIncrements.filter(inc => 
                    String(inc.employee_id) === String(emp.hrms_id) ||
                    (emp.attendance_id && String(inc.attendance_id) === String(emp.attendance_id))
                );
                
                if (empIncrements.length > 0) {
                    // Current month salary (use salary month start for resolution)
                    const currentMonthStr = salaryMonthStartStr; // e.g., "2026-01-01"
                    const applicableCurrentIncrements = empIncrements
                        .filter(inc => {
                            try {
                                return new Date(inc.effective_month) <= new Date(currentMonthStr);
                            } catch (e) {
                                console.warn(`[createSalarySnapshots] Invalid date format in salary increment effective_month for ${emp.name} (${inc.id}): ${e.message}`);
                                return false;
                            }
                        })
                        .sort((a, b) => new Date(b.effective_month) - new Date(a.effective_month));
                    
                    if (applicableCurrentIncrements.length > 0) {
                        const currentInc = applicableCurrentIncrements[0];
                        currentMonthSalary = {
                            ...baseSalary,
                            basic_salary: currentInc.new_basic_salary || baseSalary.basic_salary,
                            allowances: currentInc.new_allowances || baseSalary.allowances,
                            allowances_with_bonus: currentInc.new_allowances_with_bonus || baseSalary.allowances_with_bonus,
                            total_salary: currentInc.new_total_salary || baseSalary.total_salary
                        };
                        console.log(`[createSalarySnapshots] ${emp.name}: Using increment effective ${currentInc.effective_month} for current month salary`);
                    }
                    
                    // Previous month salary (for OT and prev month deductions)
                    // Previous month is the month BEFORE the salary month
                    if (hasExtraPrevMonthRange && extraPrevMonthFrom) {
                        const prevMonthDate = new Date(extraPrevMonthFrom);
                        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
                        
                        const applicablePrevIncrements = empIncrements
                            .filter(inc => {
                                try {
                                    return new Date(inc.effective_month) <= new Date(prevMonthStr);
                                } catch (e) {
                                    console.warn(`[createSalarySnapshots] Invalid date format in salary increment effective_month for ${emp.name} (prev month, ${inc.id}): ${e.message}`);
                                    return false;
                                }
                            })
                            .sort((a, b) => new Date(b.effective_month) - new Date(a.effective_month));
                        
                        if (applicablePrevIncrements.length > 0) {
                            const prevInc = applicablePrevIncrements[0];
                            prevMonthSalary = {
                                ...baseSalary,
                                basic_salary: prevInc.new_basic_salary || baseSalary.basic_salary,
                                allowances: prevInc.new_allowances || baseSalary.allowances,
                                allowances_with_bonus: prevInc.new_allowances_with_bonus || baseSalary.allowances_with_bonus,
                                total_salary: prevInc.new_total_salary || baseSalary.total_salary
                            };
                            console.log(`[createSalarySnapshots] ${emp.name}: Using increment effective ${prevInc.effective_month} for previous month salary`);
                        }
                    }
                }
            }
            
            // Use resolved salaries (currentMonthSalary for current month, prevMonthSalary for previous month)
            const salary = currentMonthSalary;

            // Check if employee has analysis result (only if they have attendance_id)
            const analysisResult = emp.attendance_id 
                ? analysisResults.find(r => String(r.attendance_id) === String(emp.attendance_id))
                : null;
            const hasAnalysisResult = !!analysisResult;
            
            let calculated;
            let attendanceSource;
            
            // PERMANENT LOCK: For finalized reports, use AnalysisResult values AS-IS (1:1 copy)
            // CRITICAL: Check manual override fields FIRST, fallback to regular fields
            // Manual overrides are set when user edits report before finalization
            // deductible_minutes formula in runAnalysis: ((late + early) - grace) - approved (other is separate)
            if (hasAnalysisResult) {
                calculated = {
                    workingDays: analysisResult.working_days || 0,
                    presentDays: analysisResult.manual_present_days ?? analysisResult.present_days ?? 0,
                    fullAbsenceCount: analysisResult.manual_full_absence_count ?? analysisResult.full_absence_count ?? 0,
                    halfAbsenceCount: analysisResult.half_absence_count || 0,
                    sickLeaveCount: analysisResult.manual_sick_leave_count ?? analysisResult.sick_leave_count ?? 0,
                    annualLeaveCount: analysisResult.manual_annual_leave_count ?? analysisResult.annual_leave_count ?? 0,
                    lateMinutes: analysisResult.late_minutes || 0,
                    earlyCheckoutMinutes: analysisResult.early_checkout_minutes || 0,
                    otherMinutes: analysisResult.other_minutes || 0,
                    approvedMinutes: analysisResult.approved_minutes || 0,
                    deductibleMinutes: analysisResult.manual_deductible_minutes ?? analysisResult.deductible_minutes ?? 0,
                    graceMinutes: analysisResult.grace_minutes ?? 15
                };
                attendanceSource = 'ANALYZED';
                analyzedCount++;
                console.log(`[createSalarySnapshots] 1:1 copy from AnalysisResult for ${emp.name} (${emp.attendance_id}): deductible=${calculated.deductibleMinutes}, fullAbsence=${calculated.fullAbsenceCount} (manual override: ${analysisResult.manual_full_absence_count !== null ? 'YES' : 'NO'})`);
            } else {
                // NO_ATTENDANCE_DATA: Employee missing from analysis (salary-only or data issue)
                // Use zero attendance for salary safety
                calculated = {
                    workingDays: 0,
                    presentDays: 0,
                    fullAbsenceCount: 0,
                    halfAbsenceCount: 0,
                    sickLeaveCount: 0,
                    annualLeaveCount: 0,
                    lateMinutes: 0,
                    earlyCheckoutMinutes: 0,
                    otherMinutes: 0,
                    approvedMinutes: 0,
                    deductibleMinutes: 0,
                    graceMinutes: 0
                };
                attendanceSource = 'NO_ATTENDANCE_DATA';
                noAttendanceCount++;
                console.log(`[createSalarySnapshots] No AnalysisResult for ${emp.name} (${emp.attendance_id || emp.hrms_id}) - using zero attendance (salary-only)`);
            }

            // ============================================================
            // SALARY COMPONENTS (3 separate entities)
            // ============================================================
            // COMPONENT 1: Basic Salary (base pay)
            const basicSalary = salary?.basic_salary || 0;
            
            // COMPONENT 2: Allowances WITHOUT bonus (used for salary leave amount)
            // CRITICAL: This is "allowances" field, NOT "allowances_with_bonus"
            const allowancesAmount = Number(salary?.allowances) || 0;
            
            // COMPONENT 3: Allowances WITH bonus (stored but not used in calculations here)
            // const allowancesWithBonus = Number(salary?.allowances_with_bonus) || 0;
            
            // Total Salary = Component 1 + Component 2 + Component 3
            const totalSalaryAmount = salary?.total_salary || 0;
            const workingHours = salary?.working_hours || baseSalary?.working_hours || 9;
            
            // Previous month salary values (for OT and prev month deductions)
            const prevMonthTotalSalary = prevMonthSalary?.total_salary || totalSalaryAmount;
            
            // DISABLED: Previous month deduction calculation (no longer used)
            const extraPrevMonthData = {
                extraDeductibleMinutes: 0,
                extraLopDays: 0,
                extraLopPay: 0,
                extraDeductibleHoursPay: 0,
                prevMonthDivisor: otDivisor
            };

            // Salary leave days always equals finalized annual leave count
            // No exception overrides - use the value from finalized AnalysisResult
            let salaryLeaveDays = calculated.annualLeaveCount;

            // Calculate derived salary values - ALL rounded to 2 decimal places
            const leaveDays = calculated.annualLeaveCount + calculated.fullAbsenceCount;
            const leavePay = Math.round((leaveDays > 0 ? (totalSalaryAmount / divisor) * leaveDays : 0) * 100) / 100;
            
            // ============================================================
            // SALARY LEAVE AMOUNT FORMULA (NON-NEGOTIABLE)
            // Base = Basic Salary + Allowances ONLY (NO BONUS, NO allowances_with_bonus)
            // Formula: (Basic + Allowances) / salary_divisor × salary_leave_days
            // ============================================================
            const salaryBaseForLeave = basicSalary + allowancesAmount;
            const salaryLeaveAmount = Math.round((salaryLeaveDays > 0 ? (salaryBaseForLeave / divisor) * salaryLeaveDays : 0) * 100) / 100;
            
            console.log(`[createSalarySnapshots] 💡 SALARY LEAVE CALCULATION for ${emp.name}:`);
            console.log(`[createSalarySnapshots]    basicSalary = ${basicSalary}`);
            console.log(`[createSalarySnapshots]    allowancesAmount = ${allowancesAmount}`);
            console.log(`[createSalarySnapshots]    salaryBaseForLeave = ${salaryBaseForLeave}`);
            console.log(`[createSalarySnapshots]    divisor = ${divisor}`);
            console.log(`[createSalarySnapshots]    salaryLeaveDays = ${salaryLeaveDays}`);
            console.log(`[createSalarySnapshots]    salaryLeaveAmount = ${salaryLeaveAmount}`);
            
            const netDeduction = Math.round(Math.max(0, leavePay - salaryLeaveAmount) * 100) / 100;

            // Use finalized deductible_minutes from AnalysisResult
            const deductibleMinutes = calculated.deductibleMinutes;
            const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;
            
            // Current month hourly rate uses salary divisor (2 decimals)
            const hourlyRate = Math.round((totalSalaryAmount / divisor / workingHours) * 100) / 100;
            
            // Current month deductible hours pay (2 decimals)
            const currentMonthDeductibleHoursPay = Math.round((hourlyRate * deductibleHours) * 100) / 100;
            
            // ============================================================
            // DISABLED: Previous month deduction logic
            // Previous month deductions have been removed from Al Maraghi Motors
            // to eliminate hidden deductions from salary totals.
            // All deductions are now visible in the current month report.
            // ============================================================
            const extraPrevMonthDeductibleMinutes = 0;
            const extraPrevMonthLopDays = 0;
            const extraPrevMonthLopPay = 0;
            const extraPrevMonthDeductibleHoursPay = 0;
            
            // Total deductible hours pay = current month only (no prev month)
            const totalDeductibleHoursPay = currentMonthDeductibleHoursPay;
            
            // Final total calculation (NO previous month deductions)
            // Current month: netDeduction (leave) + currentMonthDeductibleHoursPay (time)
            // ALWAYS round to 2 decimals, then apply whole number rounding for balance
            let finalTotal = Math.round((totalSalaryAmount - netDeduction - currentMonthDeductibleHoursPay) * 100) / 100;

            // ============================================================
            // WPS SPLIT LOGIC (Al Maraghi Motors only)
            // ============================================================
            // WPS split is applied AFTER final total is computed
            // Uses wps_cap_enabled and wps_cap_amount from EmployeeSalary
            // Balance must always be a multiple of 100 (round down)
            // ============================================================
            let wpsAmount = finalTotal;
            let balanceAmount = 0;
            let wpsCapApplied = false;
            const wpsCapEnabled = salary?.wps_cap_enabled || false;
            const wpsCapAmount = salary?.wps_cap_amount ?? 4900;

            if (project.company === 'Al Maraghi Motors' && wpsCapEnabled) {
                if (finalTotal <= 0) {
                    wpsAmount = 0;
                    balanceAmount = 0;
                    wpsCapApplied = false;
                } else {
                    const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                    // Calculate raw excess over cap
                    const rawExcess = Math.max(0, finalTotal - cap);
                    // Round balance DOWN to nearest 100, then round to 2 decimals
                    balanceAmount = Math.round((Math.floor(rawExcess / 100) * 100) * 100) / 100;
                    // WPS gets the rest (total - balance), rounded to 2 decimals
                    wpsAmount = Math.round((finalTotal - balanceAmount) * 100) / 100;
                    wpsCapApplied = rawExcess > 0;
                }
            } else if (finalTotal <= 0) {
                wpsAmount = 0;
                balanceAmount = 0;
            }

            console.log(`[createSalarySnapshots] 💾 Creating snapshot for ${emp.name} - Total: ${finalTotal}, WPS: ${wpsAmount}, Balance: ${balanceAmount}`);
            
            snapshots.push({
                project_id: String(project_id),
                report_run_id: String(report_run_id),
                attendance_id: emp.attendance_id ? String(emp.attendance_id) : null, // Allow null for salary-only
                hrms_id: String(emp.hrms_id),
                name: emp.name,
                department: emp.department,
                basic_salary: basicSalary,
                allowances: allowancesAmount,
                total_salary: totalSalaryAmount,
                working_hours: workingHours,
                working_days: calculated.workingDays,
                salary_divisor: divisor,
                ot_divisor: otDivisor,
                prev_month_divisor: extraPrevMonthData.prevMonthDivisor || 0,
                present_days: calculated.presentDays,
                full_absence_count: calculated.fullAbsenceCount,
                annual_leave_count: calculated.annualLeaveCount,
                sick_leave_count: calculated.sickLeaveCount,
                late_minutes: calculated.lateMinutes,
                early_checkout_minutes: calculated.earlyCheckoutMinutes,
                other_minutes: calculated.otherMinutes,
                approved_minutes: calculated.approvedMinutes,
                grace_minutes: calculated.graceMinutes,
                deductible_minutes: deductibleMinutes,
                extra_prev_month_deductible_minutes: 0,  // DISABLED - no longer used
                extra_prev_month_lop_days: 0,  // DISABLED - no longer used
                extra_prev_month_lop_pay: 0,  // DISABLED - no longer used
                extra_prev_month_deductible_hours_pay: 0,  // DISABLED - no longer used
                salary_month_start: salaryMonthStartStr,
                salary_month_end: salaryMonthEndStr,
                salary_leave_days: salaryLeaveDays,
                 leaveDays: leaveDays,
                 leavePay: leavePay,
                 salaryLeaveAmount: salaryLeaveAmount,
                 deductibleHours: deductibleHours,
                 deductibleHoursPay: totalDeductibleHoursPay,
                 netDeduction: netDeduction,
                // OT & Adjustment Fields (editable, initialized to 0, will be rounded on recalculation)
                normalOtHours: 0,
                normalOtSalary: 0,
                specialOtHours: 0,
                specialOtSalary: 0,
                totalOtSalary: 0,
                // Adjustment Fields (NOT rounded - user-entered values)
                otherDeduction: 0,
                bonus: 0,
                incentive: 0,
                advanceSalaryDeduction: 0,
                total: finalTotal,
                wpsPay: wpsAmount,
                balance: balanceAmount,
                wps_cap_enabled: wpsCapEnabled,
                wps_cap_amount: wpsCapAmount,
                wps_cap_applied: wpsCapApplied,
                snapshot_created_at: new Date().toISOString(),
                attendance_source: attendanceSource
            });
            
            console.log(`[createSalarySnapshots] ✅ Snapshot added to array (${snapshots.length} total so far)`);
            console.log(`[createSalarySnapshots] >>> LOOP ITERATION ${loopIterationCount} COMPLETE`);
        }
        
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] 🏁 FOR LOOP EXITED`);
        console.log(`[createSalarySnapshots]    Total iterations completed: ${loopIterationCount}`);
        console.log(`[createSalarySnapshots]    Snapshots in array: ${snapshots.length}`);
        console.log(`[createSalarySnapshots] ============================================`);

        // BATCH MODE: Process in chunks for progress tracking
        if (batch_mode) {
            console.log(`[createSalarySnapshots] ============================================`);
            console.log(`[createSalarySnapshots] 🚨 BATCH MODE DETECTED - RETURN PATH #1`);
            console.log(`[createSalarySnapshots] 💾 BATCH MODE RESPONSE PREPARATION`);
            console.log(`[createSalarySnapshots] Snapshots created in this batch: ${snapshots.length}`);
            console.log(`[createSalarySnapshots] Batch start index: ${batch_start}`);
            console.log(`[createSalarySnapshots] Total eligible employees: ${eligibleEmployees.length}`);
            
            if (snapshots.length > 0) {
                console.log(`[createSalarySnapshots] 💾 Calling bulkCreate for ${snapshots.length} snapshots...`);
                await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(snapshots);
                console.log(`[createSalarySnapshots] ✅ bulkCreate completed successfully`);
            } else {
                console.log(`[createSalarySnapshots] ⚠️ WARNING: No snapshots to create in this batch`);
            }
            
            const currentPosition = batch_start + snapshots.length;
            const hasMore = currentPosition < eligibleEmployees.length;
            
            console.log(`[createSalarySnapshots] ============================================`);
            console.log(`[createSalarySnapshots] 📊 BATCH COMPLETE SUMMARY:`);
            console.log(`[createSalarySnapshots]    Current position: ${currentPosition}`);
            console.log(`[createSalarySnapshots]    Total employees: ${eligibleEmployees.length}`);
            console.log(`[createSalarySnapshots]    HAS_MORE: ${hasMore}`);
            console.log(`[createSalarySnapshots]    Remaining: ${eligibleEmployees.length - currentPosition} employees`);
            console.log(`[createSalarySnapshots] ============================================`);
            console.log(`[createSalarySnapshots] 📤 RETURNING BATCH RESPONSE`);
            
            return Response.json({
                success: true,
                batch_mode: true,
                batch_completed: snapshots.length,
                total_employees: eligibleEmployees.length,
                current_position: currentPosition,
                has_more: hasMore,
                current_batch: snapshots.map(s => ({ attendance_id: s.attendance_id, name: s.name }))
            });
        }
        
        // STANDARD MODE: Bulk create all snapshots at once
        console.log(`[createSalarySnapshots] ============================================`);
        console.log(`[createSalarySnapshots] 🚨 STANDARD MODE - RETURN PATH #2`);
        console.log(`[createSalarySnapshots] ============================================`);
        
        if (snapshots.length > 0) {
            console.log(`[createSalarySnapshots] 💾 STANDARD MODE: Creating ${snapshots.length} salary snapshots (${analyzedCount} analyzed, ${noAttendanceCount} no attendance data)`);
            await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(snapshots);
            console.log(`[createSalarySnapshots] ✅ Successfully created ${snapshots.length} snapshots`);
        } else {
            console.warn(`[createSalarySnapshots] ⚠️ WARNING: No snapshots created - no eligible employees found`);
        }

        console.log(`[createSalarySnapshots] 🎯 FINAL COUNT CHECK: ${snapshots.length} snapshots created for ${eligibleEmployees.length} eligible employees`);

        // ============================================================
        // INVARIANT CHECK: Verify ALL snapshots were created in STANDARD mode
        // This prevents silent partial completion
        // ============================================================
        if (!batch_mode && snapshots.length !== eligibleEmployees.length) {
            const missingCount = eligibleEmployees.length - snapshots.length;
            const errorMsg = `INVARIANT VIOLATION: Expected ${eligibleEmployees.length} snapshots, but only ${snapshots.length} were created (${missingCount} missing)`;
            console.error(`[createSalarySnapshots] ❌ ${errorMsg}`);
            throw new Error(errorMsg);
        }

        console.log(`[createSalarySnapshots] 📤 RETURNING STANDARD MODE SUCCESS RESPONSE`);
        
        return Response.json({
            success: true,
            snapshots_created: snapshots.length,
            analyzed_count: analyzedCount,
            no_attendance_count: noAttendanceCount,
            employees_count: eligibleEmployees.length,
            message: `Created ${snapshots.length} salary snapshots (${analyzedCount} analyzed, ${noAttendanceCount} no attendance data)`
        });

    } catch (error) {
        console.error('[createSalarySnapshots] ❌ ERROR CAUGHT:', error);
        console.error('[createSalarySnapshots] 🚨 ERROR RETURN PATH #3');
        console.error('[createSalarySnapshots] Error message:', error.message);
        console.error('[createSalarySnapshots] Error stack:', error.stack);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});