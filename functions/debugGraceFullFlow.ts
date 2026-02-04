import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const { project_id } = await req.json();

        // 1. Get history records
        const history = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
            source_project_id: project_id
        }, null, 5000);

        // 2. Get employees
        const allEmployees = await base44.asServiceRole.entities.Employee.filter({}, null, 5000);

        // 3. Get project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 10);
        const project = projects[0];

        // Debug first 5 history records
        const debug = [];
        for (const h of history.slice(0, 5)) {
            const empById = allEmployees.find(e => e.id === h.employee_id);
            const empByHrmsId = allEmployees.find(e => String(e.hrms_id) === String(h.employee_id));

            debug.push({
                history_employee_id: h.employee_id,
                history_hrms_id: h.hrms_id,
                unused_grace: h.unused_grace_minutes,
                found_by_db_id: empById ? empById.name : 'NOT FOUND',
                found_by_hrms_id: empByHrmsId ? empByHrmsId.name : 'NOT FOUND',
                emp_by_hrms_carried: empByHrmsId?.carried_grace_minutes || 0,
                emp_by_db_id_carried: empById?.carried_grace_minutes || 0
            });
        }

        return Response.json({
            total_history_records: history.length,
            total_employees_in_db: allEmployees.length,
            project_name: project.name,
            project_company: project.company,
            debug_samples: debug
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});