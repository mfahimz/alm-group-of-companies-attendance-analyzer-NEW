import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { format } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        // Fetch all finalized report runs
        const allReportRuns = await base44.asServiceRole.entities.ReportRun.list();
        const finalReportRuns = allReportRuns.filter(r => r.is_final);

        if (finalReportRuns.length === 0) {
            return Response.json({
                success: true,
                message: 'No finalized reports found to migrate',
                migrated_count: 0
            });
        }

        let migratedCount = 0;
        const migrationLog = [];

        for (const report of finalReportRuns) {
            try {
                // Get project to determine payroll month
                const projects = await base44.asServiceRole.entities.Project.filter({ id: report.project_id });
                if (projects.length === 0) continue;
                
                const project = projects[0];
                const endDate = new Date(project.date_to);
                const payroll_month_label = format(endDate, 'yyyy-MM');

                // Fetch salary snapshots for this report
                const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
                    report_run_id: report.id
                });

                for (const snapshot of snapshots) {
                    // Check if already migrated
                    const existing = await base44.asServiceRole.entities.CalendarEmployeeMonthlySummary.filter({
                        payroll_month_label,
                        employee_id: snapshot.hrms_id,
                        legacy_project_id: project.id
                    });

                    if (existing.length > 0) {
                        continue; // Skip duplicates
                    }

                    // Create monthly summary
                    await base44.asServiceRole.entities.CalendarEmployeeMonthlySummary.create({
                        payroll_month_label,
                        employee_id: snapshot.hrms_id,
                        name: snapshot.name,
                        present_days: snapshot.present_days || 0,
                        lop_days: snapshot.full_absence_count || 0,
                        annual_leave_days: snapshot.annual_leave_count || 0,
                        other_leave_days: snapshot.sick_leave_count || 0,
                        late_minutes_total: snapshot.late_minutes || 0,
                        early_minutes_total: snapshot.early_checkout_minutes || 0,
                        ot_minutes_total: 0, // Not stored in snapshot
                        legacy_project_id: project.id,
                        legacy_final_report_id: report.id
                    });

                    migratedCount++;
                }

                migrationLog.push({
                    project_id: project.id,
                    project_name: project.name,
                    payroll_month_label,
                    employees_migrated: snapshots.length
                });

            } catch (error) {
                migrationLog.push({
                    project_id: report.project_id,
                    error: error.message
                });
            }
        }

        return Response.json({
            success: true,
            message: `Migration complete. ${migratedCount} employee monthly summaries created.`,
            migrated_count: migratedCount,
            reports_processed: finalReportRuns.length,
            migration_log: migrationLog
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});