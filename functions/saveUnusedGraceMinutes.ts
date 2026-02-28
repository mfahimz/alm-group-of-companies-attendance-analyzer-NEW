import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const { project_id } = await req.json();
        if (!project_id) {
            return Response.json({ error: 'Missing project_id' }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 10);
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        if (!project.last_saved_report_id) {
            return Response.json({ error: 'No finalized report found' }, { status: 400 });
        }

        // Fetch analysis results
        const results = await base44.asServiceRole.entities.AnalysisResult.filter({
            report_run_id: project.last_saved_report_id
        }, null, 5000);

        // Fetch employees
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: project.company
        }, null, 5000);

        // Normalize IDs
        employees.forEach(emp => {
            if (typeof emp.hrms_id !== 'string') emp.hrms_id = String(emp.hrms_id);
            if (typeof emp.attendance_id !== 'string') emp.attendance_id = String(emp.attendance_id);
        });

        // Fetch rules and report
        const rulesData = await base44.asServiceRole.entities.AttendanceRules.filter({
            company: project.company
        }, null, 10);
        let rules = null;
        if (rulesData.length > 0) {
            try {
                rules = JSON.parse(rulesData[0].rules_json);
            } catch (e) {
                console.warn('Failed to parse rules');
            }
        }

        const reportRuns = await base44.asServiceRole.entities.ReportRun.filter({
            id: project.last_saved_report_id
        }, null, 10);
        const reportRun = reportRuns.length > 0 ? reportRuns[0] : null;

        const nowUAE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })).toISOString();
        const periodFrom = reportRun?.date_from || project?.date_from || '2025-01-01';
        const periodTo = reportRun?.date_to || project?.date_to || '2025-01-31';

        let saved = 0;
        let skipped = 0;

        for (const result of results) {
            const employee = employees.find(e => String(e.attendance_id) === String(result.attendance_id));

            if (!employee || !employee.hrms_id || !employee.attendance_id) {
                skipped++;
                continue;
            }

            // Calculate grace
            const dept = employee.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
            const carriedGrace = project.use_carried_grace_minutes ? (employee.carried_grace_minutes || 0) : 0;
            const graceMinutesAvailable = baseGrace + carriedGrace;

            const lateMinutes = result.late_minutes || 0;
            const earlyCheckoutMinutes = result.early_checkout_minutes || 0;
            const ramadanGiftMinutes = result.ramadan_gift_minutes || 0;
            const timeIssues = Math.max(0, lateMinutes + earlyCheckoutMinutes - ramadanGiftMinutes);
            const unusedGraceMinutes = Math.max(0, graceMinutesAvailable - timeIssues);

            if (unusedGraceMinutes <= 0) {
                skipped++;
                continue;
            }

            // Check for duplicates
            const existing = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
                employee_id: String(employee.hrms_id),
                source_project_id: String(project_id)
            }, null, 10);

            if (existing.length > 0) {
                skipped++;
                continue;
            }

            try {
                // Save to history (audit-only)
                await base44.asServiceRole.entities.EmployeeGraceHistory.create({
                    employee_id: String(employee.hrms_id).trim(),
                    attendance_id: String(employee.attendance_id).trim(),
                    employee_name: String(employee.name || 'Unknown').trim(),
                    company: String(project.company).trim(),
                    source_project_id: String(project_id).trim(),
                    source_project_name: String(project.name || '').trim(),
                    report_run_id: String(project.last_saved_report_id).trim(),
                    period_from: String(periodFrom).trim(),
                    period_to: String(periodTo).trim(),
                    grace_minutes_available: Math.max(0, Number(graceMinutesAvailable)),
                    late_minutes: Math.max(0, Number(lateMinutes)),
                    early_checkout_minutes: Math.max(0, Number(earlyCheckoutMinutes)),
                    time_issues: Math.max(0, Number(timeIssues)),
                    unused_grace_minutes: Math.max(0, Number(unusedGraceMinutes)),
                    carried_at: String(nowUAE).trim(),
                    carried_by: 'system@saveUnusedGraceMinutes'
                });

                // Update employee balance
                const newCarried = (employee.carried_grace_minutes || 0) + unusedGraceMinutes;
                await base44.asServiceRole.entities.Employee.update(employee.id, {
                    carried_grace_minutes: newCarried
                });

                saved++;

            } catch (err) {
                console.error(`Failed for ${employee.name}:`, err.message);
                skipped++;
            }
        }

        return Response.json({
            success: true,
            saved,
            skipped,
            total_employees: results.length
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});