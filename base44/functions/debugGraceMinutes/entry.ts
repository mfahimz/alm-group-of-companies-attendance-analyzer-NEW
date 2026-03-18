import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const { project_id } = await req.json();

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 10);
        const project = projects[0];

        // Fetch analysis results
        const results = await base44.asServiceRole.entities.AnalysisResult.filter({
            report_run_id: project.last_saved_report_id
        }, null, 5000);

        // Fetch employees
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: project.company
        }, null, 5000);

        // Fetch rules
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

        // Check history table
        const historyCount = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
            source_project_id: project_id
        }, null, 5000);

        const debug = [];
        
        for (const result of results.slice(0, 5)) {
            const employee = employees.find(e => String(e.attendance_id) === String(result.attendance_id));

            if (!employee) continue;

            const dept = employee.department || 'Admin';
            const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
            const carriedGrace = employee.carried_grace_minutes || 0;
            const graceMinutesAvailable = baseGrace + carriedGrace;

            const lateMinutes = result.late_minutes || 0;
            const earlyCheckoutMinutes = result.early_checkout_minutes || 0;
            const timeIssues = lateMinutes + earlyCheckoutMinutes;
            const unusedGraceMinutes = Math.max(0, graceMinutesAvailable - timeIssues);

            // Check existing
            const existing = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
                employee_id: String(employee.hrms_id),
                source_project_id: String(project_id)
            }, null, 10);

            debug.push({
                employee_name: employee.name,
                attendance_id: result.attendance_id,
                base_grace: baseGrace,
                carried_grace: carriedGrace,
                grace_available: graceMinutesAvailable,
                late_minutes: lateMinutes,
                early_minutes: earlyCheckoutMinutes,
                time_issues: timeIssues,
                unused_grace: unusedGraceMinutes,
                already_exists: existing.length > 0
            });
        }

        return Response.json({
            project_name: project.name,
            total_analysis_results: results.length,
            history_records_for_project: historyCount.length,
            sample_debug: debug
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});