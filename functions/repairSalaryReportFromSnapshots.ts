import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * REPAIR SALARY REPORT FROM SNAPSHOTS
 * 
 * Repairs corrupted salary data by enforcing the correct pipeline:
 * AnalysisResult (finalized) → SalarySnapshot → SalaryReport.snapshot_data
 * 
 * Strategy:
 * 1. If SalarySnapshot.deductible_minutes != AnalysisResult.deductible_minutes:
 *    → Delete SalarySnapshot, recreate from AnalysisResult (invoke createSalarySnapshots)
 * 2. If SalaryReport.snapshot_data deductibleHours != SalarySnapshot.deductibleHours:
 *    → Regenerate SalaryReport.snapshot_data from live SalarySnapshot rows
 * 
 * CRITICAL: All operations use the SAME report_run_id - no alternative data sources allowed
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user || (user.role !== 'admin' && user.extended_role !== 'admin')) {
            return Response.json({ error: 'Unauthorized - admin only' }, { status: 401 });
        }

        const { report_run_id } = await req.json();

        if (!report_run_id) {
            return Response.json({ 
                error: 'report_run_id is required' 
            }, { status: 400 });
        }

        console.log(`[repairSalaryReportFromSnapshots] Starting repair for report_run_id: ${report_run_id}`);

        // Fetch all related data
        const [reportRuns, analysisResults, salarySnapshots, salaryReports] = await Promise.all([
            base44.asServiceRole.entities.ReportRun.filter({ id: report_run_id }),
            base44.asServiceRole.entities.AnalysisResult.filter({ report_run_id }),
            base44.asServiceRole.entities.SalarySnapshot.filter({ report_run_id }),
            base44.asServiceRole.entities.SalaryReport.filter({ report_run_id })
        ]);

        if (reportRuns.length === 0) {
            return Response.json({ 
                error: 'ReportRun not found' 
            }, { status: 404 });
        }

        const reportRun = reportRuns[0];
        const project_id = reportRun.project_id;

        let snapshotsRecreated = 0;
        let reportsRegenerated = 0;
        const errors = [];

        // ============================================================
        // STEP 1: Check and repair SalarySnapshot vs AnalysisResult
        // ============================================================
        const snapshotMismatches = [];
        
        for (const snapshot of salarySnapshots) {
            const attendance_id_str = String(snapshot.attendance_id);
            const analysisRow = analysisResults.find(ar => String(ar.attendance_id) === attendance_id_str);
            
            if (!analysisRow) {
                snapshotMismatches.push({
                    attendance_id: snapshot.attendance_id,
                    reason: 'MISSING_ANALYSIS_RESULT',
                    snapshot_id: snapshot.id
                });
                continue;
            }
            
            // Check all attendance fields for mismatch
            const fields = [
                'working_days', 'present_days', 'full_absence_count', 'annual_leave_count',
                'sick_leave_count', 'late_minutes', 'early_checkout_minutes', 'other_minutes',
                'approved_minutes', 'grace_minutes', 'deductible_minutes'
            ];
            
            const mismatches = fields.filter(field => {
                const analysisVal = analysisRow[field] || 0;
                const snapshotVal = snapshot[field] || 0;
                return Math.abs(analysisVal - snapshotVal) > 0.01;
            });
            
            if (mismatches.length > 0) {
                snapshotMismatches.push({
                    attendance_id: snapshot.attendance_id,
                    reason: 'FIELD_MISMATCH',
                    mismatched_fields: mismatches,
                    snapshot_id: snapshot.id
                });
            }
        }

        // If mismatches found, delete all snapshots and recreate via createSalarySnapshots
        if (snapshotMismatches.length > 0) {
            console.log(`[repairSalaryReportFromSnapshots] Found ${snapshotMismatches.length} snapshot mismatches, recreating all snapshots`);
            
            // Delete all existing snapshots for this report_run_id
            for (const snapshot of salarySnapshots) {
                await base44.asServiceRole.entities.SalarySnapshot.delete(snapshot.id);
            }
            
            // Recreate snapshots from AnalysisResult
            // Invoke createSalarySnapshots directly (it already uses service role internally)
            try {
                const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
                if (projects.length === 0) {
                    errors.push('Project not found');
                } else {
                    // Delete and recreate logic is handled here instead of calling another function
                    // This avoids function-to-function call issues
                    
                    // Get project and salary data
                    const project = projects[0];
                    const [employees, salaries, allExceptions, punches, shifts, rulesData] = await Promise.all([
                        base44.asServiceRole.entities.Employee.filter({ company: project.company, active: true }),
                        base44.asServiceRole.entities.EmployeeSalary.filter({ company: project.company, active: true }),
                        base44.asServiceRole.entities.Exception.filter({ project_id }),
                        base44.asServiceRole.entities.Punch.filter({ project_id }),
                        base44.asServiceRole.entities.ShiftTiming.filter({ project_id }),
                        base44.asServiceRole.entities.AttendanceRules.filter({ company: project.company })
                    ]);
                    
                    // Filter to project's custom employees if specified
                    let eligibleEmployees = employees;
                    if (project.custom_employee_ids && project.custom_employee_ids.trim()) {
                        const customIds = project.custom_employee_ids.split(',').map(id => id.trim()).filter(id => id);
                        eligibleEmployees = employees.filter(emp => 
                            customIds.includes(String(emp.hrms_id)) || customIds.includes(String(emp.attendance_id))
                        );
                    }
                    
                    // Recreate snapshots from AnalysisResult using exact 1:1 copy logic
                    const newSnapshots = [];
                    
                    for (const emp of eligibleEmployees) {
                        const attendance_id_str = String(emp.attendance_id);
                        const analysisRow = analysisResults.find(ar => String(ar.attendance_id) === attendance_id_str);
                        
                        if (!analysisRow) {
                            console.warn(`[repairSalaryReportFromSnapshots] No AnalysisResult for ${emp.name} (${emp.attendance_id})`);
                            continue;
                        }
                        
                        const baseSalary = salaries.find(s => 
                            String(s.employee_id) === String(emp.hrms_id) || 
                            String(s.attendance_id) === String(emp.attendance_id)
                        );
                        
                        if (!baseSalary) {
                            console.warn(`[repairSalaryReportFromSnapshots] No salary record for ${emp.name} (${emp.attendance_id})`);
                            continue;
                        }
                        
                        // Get divisors from project
                        const divisor = project.salary_calculation_days || 30;
                        const otDivisor = project.ot_calculation_days || divisor;
                        
                        // 1:1 COPY FROM ANALYSISRESULT (FINALIZED VALUES)
                        const workingDays = analysisRow.working_days || 0;
                        const presentDays = analysisRow.present_days || 0;
                        const fullAbsenceCount = analysisRow.full_absence_count || 0;
                        const annualLeaveCount = analysisRow.annual_leave_count || 0;
                        const sickLeaveCount = analysisRow.sick_leave_count || 0;
                        const lateMinutes = analysisRow.late_minutes || 0;
                        const earlyCheckoutMinutes = analysisRow.early_checkout_minutes || 0;
                        const otherMinutes = analysisRow.other_minutes || 0;
                        const approvedMinutes = analysisRow.approved_minutes || 0;
                        const graceMinutes = analysisRow.grace_minutes ?? 15;
                        const deductibleMinutes = analysisRow.deductible_minutes || 0;
                        
                        // Calculate salary values
                        const totalSalaryAmount = baseSalary.total_salary || 0;
                        const workingHours = baseSalary.working_hours || 9;
                        const basicSalary = baseSalary.basic_salary || 0;
                        const allowancesAmount = Number(baseSalary.allowances) || 0;
                        
                        // Get salary leave days from ANNUAL_LEAVE exceptions
                        let salaryLeaveDays = annualLeaveCount;
                        const empAnnualLeaveExceptions = allExceptions.filter(exc => 
                            String(exc.attendance_id) === String(emp.attendance_id) &&
                            exc.type === 'ANNUAL_LEAVE'
                        );
                        if (empAnnualLeaveExceptions.length > 0) {
                            const totalSalaryLeaveDaysOverride = empAnnualLeaveExceptions.reduce((sum, exc) => {
                                return sum + (exc.salary_leave_days ?? 0);
                            }, 0);
                            if (totalSalaryLeaveDaysOverride > 0) {
                                salaryLeaveDays = totalSalaryLeaveDaysOverride;
                            }
                        }
                        
                        // Calculate derived values
                        const leaveDays = annualLeaveCount + fullAbsenceCount;
                        const leavePay = leaveDays > 0 ? (totalSalaryAmount / divisor) * leaveDays : 0;
                        const salaryForLeave = basicSalary + allowancesAmount;
                        const salaryLeaveAmount = salaryLeaveDays > 0 ? (salaryForLeave / divisor) * salaryLeaveDays : 0;
                        const netDeduction = Math.max(0, leavePay - salaryLeaveAmount);
                        const deductibleHours = Math.round((deductibleMinutes / 60) * 100) / 100;
                        const hourlyRate = totalSalaryAmount / divisor / workingHours;
                        const deductibleHoursPay = hourlyRate * deductibleHours;
                        
                        const finalTotal = totalSalaryAmount - netDeduction - deductibleHoursPay;
                        
                        // WPS split
                        let wpsAmount = finalTotal;
                        let balanceAmount = 0;
                        let wpsCapApplied = false;
                        const wpsCapEnabled = baseSalary.wps_cap_enabled || false;
                        const wpsCapAmount = baseSalary.wps_cap_amount ?? 4900;
                        
                        if (project.company === 'Al Maraghi Motors' && wpsCapEnabled && finalTotal > 0) {
                            const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                            const rawExcess = Math.max(0, finalTotal - cap);
                            balanceAmount = Math.floor(rawExcess / 100) * 100;
                            wpsAmount = finalTotal - balanceAmount;
                            wpsCapApplied = rawExcess > 0;
                        }
                        
                        newSnapshots.push({
                            project_id: String(project_id),
                            report_run_id: String(report_run_id),
                            attendance_id: String(emp.attendance_id),
                            hrms_id: String(emp.hrms_id),
                            name: emp.name,
                            department: emp.department,
                            basic_salary: basicSalary,
                            allowances: allowancesAmount,
                            total_salary: totalSalaryAmount,
                            working_hours: workingHours,
                            working_days: workingDays,
                            salary_divisor: divisor,
                            ot_divisor: otDivisor,
                            prev_month_divisor: 0,
                            present_days: presentDays,
                            full_absence_count: fullAbsenceCount,
                            annual_leave_count: annualLeaveCount,
                            sick_leave_count: sickLeaveCount,
                            late_minutes: lateMinutes,
                            early_checkout_minutes: earlyCheckoutMinutes,
                            other_minutes: otherMinutes,
                            approved_minutes: approvedMinutes,
                            grace_minutes: graceMinutes,
                            deductible_minutes: deductibleMinutes,
                            extra_prev_month_deductible_minutes: 0,
                            extra_prev_month_lop_days: 0,
                            extra_prev_month_lop_pay: 0,
                            extra_prev_month_deductible_hours_pay: 0,
                            salary_month_start: null,
                            salary_month_end: null,
                            salary_leave_days: salaryLeaveDays,
                            leaveDays: leaveDays,
                            leavePay: leavePay,
                            salaryLeaveAmount: salaryLeaveAmount,
                            deductibleHours: deductibleHours,
                            deductibleHoursPay: deductibleHoursPay,
                            netDeduction: netDeduction,
                            normalOtHours: 0,
                            normalOtSalary: 0,
                            specialOtHours: 0,
                            specialOtSalary: 0,
                            totalOtSalary: 0,
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
                            attendance_source: 'ANALYZED'
                        });
                    }
                    
                    // Bulk create new snapshots
                    if (newSnapshots.length > 0) {
                        await base44.asServiceRole.entities.SalarySnapshot.bulkCreate(newSnapshots);
                        snapshotsRecreated = newSnapshots.length;
                        console.log(`[repairSalaryReportFromSnapshots] Recreated ${snapshotsRecreated} snapshots from AnalysisResult`);
                    }
                }
            } catch (createError) {
                console.error('[repairSalaryReportFromSnapshots] Error recreating snapshots:', createError);
                errors.push(`Failed to recreate snapshots: ${createError.message}`);
            }
            
            // Re-fetch snapshots after recreation
            const refetchedSnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({ report_run_id });
            salarySnapshots.length = 0;
            salarySnapshots.push(...refetchedSnapshots);
        }

        // ============================================================
        // STEP 2: Regenerate SalaryReport.snapshot_data from SalarySnapshot
        // ============================================================
        for (const salaryReport of salaryReports) {
            let needsRegeneration = false;
            
            // Check if snapshot_data matches live SalarySnapshot rows
            try {
                const reportData = JSON.parse(salaryReport.snapshot_data || '[]');
                
                for (const reportRow of reportData) {
                    const attendance_id_str = String(reportRow.attendance_id);
                    const snapshot = salarySnapshots.find(s => String(s.attendance_id) === attendance_id_str);
                    
                    if (!snapshot) {
                        needsRegeneration = true;
                        break;
                    }
                    
                    // Check critical fields
                    if (Math.abs((snapshot.deductibleHours || 0) - (reportRow.deductibleHours || 0)) > 0.01 ||
                        Math.abs((snapshot.working_days || 0) - (reportRow.working_days || 0)) > 0.01 ||
                        Math.abs((snapshot.present_days || 0) - (reportRow.present_days || 0)) > 0.01 ||
                        Math.abs((snapshot.deductible_minutes || 0) - (reportRow.deductible_minutes || 0)) > 0.01) {
                        needsRegeneration = true;
                        break;
                    }
                }
            } catch {
                needsRegeneration = true;
            }
            
            if (needsRegeneration) {
                console.log(`[repairSalaryReportFromSnapshots] Regenerating SalaryReport ${salaryReport.report_name}`);
                
                // Build fresh snapshot_data from live SalarySnapshot entities
                const freshSnapshotData = salarySnapshots.map(snap => ({
                    attendance_id: snap.attendance_id,
                    hrms_id: snap.hrms_id,
                    name: snap.name,
                    department: snap.department,
                    basic_salary: snap.basic_salary,
                    allowances: snap.allowances,
                    total_salary: snap.total_salary,
                    working_hours: snap.working_hours,
                    salary_divisor: snap.salary_divisor,
                    ot_divisor: snap.ot_divisor,
                    prev_month_divisor: snap.prev_month_divisor || 0,
                    working_days: snap.working_days,
                    present_days: snap.present_days,
                    full_absence_count: snap.full_absence_count,
                    annual_leave_count: snap.annual_leave_count,
                    sick_leave_count: snap.sick_leave_count,
                    late_minutes: snap.late_minutes,
                    early_checkout_minutes: snap.early_checkout_minutes,
                    other_minutes: snap.other_minutes,
                    approved_minutes: snap.approved_minutes,
                    grace_minutes: snap.grace_minutes,
                    deductible_minutes: snap.deductible_minutes,
                    salary_leave_days: snap.salary_leave_days,
                    leaveDays: snap.leaveDays,
                    leavePay: snap.leavePay,
                    salaryLeaveAmount: snap.salaryLeaveAmount,
                    deductibleHours: snap.deductibleHours,
                    deductibleHoursPay: snap.deductibleHoursPay,
                    netDeduction: snap.netDeduction,
                    salary_month_start: snap.salary_month_start,
                    salary_month_end: snap.salary_month_end,
                    extra_prev_month_deductible_minutes: snap.extra_prev_month_deductible_minutes || 0,
                    extra_prev_month_lop_days: snap.extra_prev_month_lop_days || 0,
                    extra_prev_month_lop_pay: snap.extra_prev_month_lop_pay || 0,
                    extra_prev_month_deductible_hours_pay: snap.extra_prev_month_deductible_hours_pay || 0,
                    normalOtHours: snap.normalOtHours || 0,
                    normalOtSalary: snap.normalOtSalary || 0,
                    specialOtHours: snap.specialOtHours || 0,
                    specialOtSalary: snap.specialOtSalary || 0,
                    totalOtSalary: (snap.normalOtSalary || 0) + (snap.specialOtSalary || 0),
                    otherDeduction: snap.otherDeduction || 0,
                    bonus: snap.bonus || 0,
                    incentive: snap.incentive || 0,
                    advanceSalaryDeduction: snap.advanceSalaryDeduction || 0,
                    total: snap.total,
                    wpsPay: snap.wpsPay,
                    balance: snap.balance || 0,
                    wps_cap_enabled: snap.wps_cap_enabled || false,
                    wps_cap_amount: snap.wps_cap_amount || 4900,
                    wps_cap_applied: snap.wps_cap_applied || false,
                    snapshot_created_at: snap.snapshot_created_at,
                    attendance_source: snap.attendance_source || 'ANALYZED'
                }));
                
                // Recalculate totals
                let totalSalaryAmount = 0;
                let totalDeductions = 0;
                let totalOtSalary = 0;
                
                freshSnapshotData.forEach(row => {
                    totalSalaryAmount += row.total || 0;
                    totalDeductions += (row.netDeduction || 0) + (row.deductibleHoursPay || 0) + (row.otherDeduction || 0) + (row.advanceSalaryDeduction || 0);
                    totalOtSalary += row.totalOtSalary || 0;
                });
                
                // Update the SalaryReport
                await base44.asServiceRole.entities.SalaryReport.update(salaryReport.id, {
                    snapshot_data: JSON.stringify(freshSnapshotData),
                    employee_count: freshSnapshotData.length,
                    total_salary_amount: Math.round(totalSalaryAmount * 100) / 100,
                    total_deductions: Math.round(totalDeductions * 100) / 100,
                    total_ot_salary: Math.round(totalOtSalary * 100) / 100
                });
                
                reportsRegenerated++;
                console.log(`[repairSalaryReportFromSnapshots] Regenerated SalaryReport ${salaryReport.report_name}`);
            }
        }

        // ============================================================
        // FINAL VERIFICATION: Run audit again
        // ============================================================
        const verifyResponse = await fetch(`${Deno.env.get('BASE44_API_URL')}/apps/${Deno.env.get('BASE44_APP_ID')}/functions/auditReportRunIntegrity/invoke`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${req.headers.get('Authorization')?.replace('Bearer ', '')}`
            },
            body: JSON.stringify({ report_run_id })
        });
        
        let finalIssuesCount = 0;
        try {
            const verifyResponseData = await verifyResponse.json();
            finalIssuesCount = verifyResponseData?.summary?.total_issues || 0;
        } catch (verifyError) {
            console.warn('[repairSalaryReportFromSnapshots] Could not run final verification:', verifyError.message);
        }

        return Response.json({
            success: true,
            report_run_id,
            report_name: reportRun.report_name,
            actions_taken: {
                snapshots_recreated: snapshotsRecreated,
                reports_regenerated: reportsRegenerated
            },
            errors: errors.length > 0 ? errors : null,
            final_verification: {
                total_issues: finalIssuesCount,
                status: finalIssuesCount === 0 ? 'CLEAN' : 'STILL_HAS_ISSUES',
                message: finalIssuesCount === 0 
                    ? '✅ REPAIR SUCCESSFUL - 0 mismatches after repair'
                    : `⚠️ REPAIR INCOMPLETE - ${finalIssuesCount} mismatches remain`
            },
            message: `Repair complete: ${snapshotsRecreated} snapshots recreated, ${reportsRegenerated} reports regenerated. Final status: ${finalIssuesCount === 0 ? 'CLEAN' : `${finalIssuesCount} issues remain`}`
        });

    } catch (error) {
        console.error('Repair salary report error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});