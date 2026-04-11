import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

        // Fetch employees with their carried grace minutes
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: project.company
        }, null, 5000);

        // Fetch history records to compare
        const history = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
            source_project_id: project_id
        }, null, 5000);

        const sample = [];

        for (const h of history.slice(0, 10)) {
            const emp = employees.find(e => String(e.hrms_id) === String(h.employee_id));
            
            sample.push({
                employee_name: h.employee_name,
                hrms_id: h.employee_id,
                unused_grace_saved_to_history: h.unused_grace_minutes,
                employee_carried_grace_minutes: emp?.carried_grace_minutes || 0,
                match: (emp?.carried_grace_minutes || 0) >= h.unused_grace_minutes
            });
        }

        return Response.json({
            total_history_records: history.length,
            total_employees: employees.length,
            sample_with_carried_grace: sample
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});