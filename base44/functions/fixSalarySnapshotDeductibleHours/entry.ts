import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * FIX SALARY SNAPSHOT DEDUCTIBLE HOURS
 * 
 * Fixes deductible hours in existing SalarySnapshot records by recalculating from AnalysisResult.
 * The bug: createSalarySnapshots was double-subtracting grace minutes, resulting in 11 min instead of 13 min.
 * This function reads the correct deductible_minutes from AnalysisResult and updates SalarySnapshot.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin' && userRole !== 'supervisor') {
            return Response.json({ error: 'Access denied: Admin or Supervisor role required' }, { status: 403 });
        }

        const { project_id, report_run_id } = await req.json();

        if (!project_id || !report_run_id) {
            return Response.json({ error: 'project_id and report_run_id are required' }, { status: 400 });
        }

        console.log(`[fixSalarySnapshotDeductibleHours] Fixing snapshots for project ${project_id}, report ${report_run_id}`);

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // Fetch all analysis results for this report
        const analysisResults = await base44.asServiceRole.entities.AnalysisResult.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        // Fetch all salary snapshots for this report
        const salarySnapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        console.log(`[fixSalarySnapshotDeductibleHours] Found ${analysisResults.length} analysis results, ${salarySnapshots.length} salary snapshots`);

        let fixedCount = 0;
        const fixes = [];

        for (const snapshot of salarySnapshots) {
            // Find matching analysis result
            const analysis = analysisResults.find(a => String(a.attendance_id) === String(snapshot.attendance_id));
            
            if (!analysis) {
                console.log(`[fixSalarySnapshotDeductibleHours] No analysis result for ${snapshot.attendance_id} - skipping`);
                continue;
            }

            // Calculate correct deductible hours from AnalysisResult
            const correctDeductibleMinutes = analysis.deductible_minutes || 0;
            const correctDeductibleHours = Math.round((correctDeductibleMinutes / 60) * 100) / 100;

            // Check if fix is needed
            const currentDeductibleHours = snapshot.deductibleHours || 0;
            
            if (Math.abs(currentDeductibleHours - correctDeductibleHours) > 0.001) {
                // Recalculate deductibleHoursPay
                const divisor = snapshot.salary_divisor || project.salary_calculation_days || 30;
                const totalSalary = snapshot.total_salary || 0;
                const workingHours = snapshot.working_hours || 9;
                const hourlyRate = totalSalary / divisor / workingHours;
                const correctDeductibleHoursPay = Math.round(hourlyRate * correctDeductibleHours);

                // Also need to recalculate total
                const netDeduction = snapshot.netDeduction || 0;
                const extraPrevMonthLopPay = snapshot.extra_prev_month_lop_pay || 0;
                const extraPrevMonthDeductibleHoursPay = snapshot.extra_prev_month_deductible_hours_pay || 0;
                const normalOtSalary = snapshot.normalOtSalary || 0;
                const specialOtSalary = snapshot.specialOtSalary || 0;
                const bonus = snapshot.bonus || 0;
                const incentive = snapshot.incentive || 0;
                const otherDeduction = snapshot.otherDeduction || 0;
                const advanceSalaryDeduction = snapshot.advanceSalaryDeduction || 0;

                const newTotal = totalSalary + normalOtSalary + specialOtSalary + bonus + incentive
                    - netDeduction - correctDeductibleHoursPay - extraPrevMonthLopPay - extraPrevMonthDeductibleHoursPay
                    - otherDeduction - advanceSalaryDeduction;

                // Recalculate WPS split
                let newWpsPay = newTotal;
                let newBalance = 0;
                let newWpsCapApplied = false;
                const wpsCapEnabled = snapshot.wps_cap_enabled || false;
                const wpsCapAmount = snapshot.wps_cap_amount ?? 4900;

                if (project.company === 'Al Maraghi Motors' && wpsCapEnabled && newTotal > 0) {
                    const cap = wpsCapAmount != null ? wpsCapAmount : 4900;
                    const rawExcess = Math.max(0, newTotal - cap);
                    newBalance = Math.floor(rawExcess / 100) * 100;
                    newWpsPay = newTotal - newBalance;
                    newWpsCapApplied = rawExcess > 0;
                } else if (newTotal <= 0) {
                    newWpsPay = 0;
                    newBalance = 0;
                }

                // Update the snapshot
                await base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, {
                    deductible_minutes: correctDeductibleMinutes,
                    deductibleHours: correctDeductibleHours,
                    deductibleHoursPay: correctDeductibleHoursPay,
                    total: Math.round(newTotal),
                    wpsPay: Math.round(newWpsPay),
                    balance: Math.round(newBalance),
                    wps_cap_applied: newWpsCapApplied
                });

                fixes.push({
                    attendance_id: snapshot.attendance_id,
                    name: snapshot.name,
                    old_deductible_hours: currentDeductibleHours,
                    new_deductible_hours: correctDeductibleHours,
                    old_total: snapshot.total,
                    new_total: Math.round(newTotal)
                });

                fixedCount++;
                console.log(`[fixSalarySnapshotDeductibleHours] Fixed ${snapshot.name}: ${currentDeductibleHours} hrs → ${correctDeductibleHours} hrs`);
            }
        }

        // Log audit
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'FIX_SALARY_DEDUCTIBLE_HOURS',
            entity_type: 'SalarySnapshot',
            entity_id: report_run_id,
            details: `Fixed ${fixedCount} salary snapshots for project ${project_id}, report ${report_run_id}`
        });

        return Response.json({
            success: true,
            message: `Fixed ${fixedCount} of ${salarySnapshots.length} salary snapshots`,
            fixed_count: fixedCount,
            total_count: salarySnapshots.length,
            fixes: fixes.slice(0, 10) // Show first 10 for reference
        });

    } catch (error) {
        console.error('Fix salary snapshot deductible hours error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});