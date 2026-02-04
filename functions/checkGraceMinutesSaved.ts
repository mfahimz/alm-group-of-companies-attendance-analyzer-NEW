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

        // Check EmployeeGraceHistory records
        const graceRecords = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
            source_project_id: project_id
        }, null, 5000);

        // Check employees with carried grace
        const employees = await base44.asServiceRole.entities.Employee.filter({}, null, 5000);
        const employeesWithCarriedGrace = employees.filter(e => (e.carried_grace_minutes || 0) > 0);

        return Response.json({
            grace_history_records: graceRecords.length,
            history_details: graceRecords.slice(0, 5).map(r => ({
                employee: r.employee_name,
                unused_grace: r.unused_grace_minutes
            })),
            employees_with_carried_grace: employeesWithCarriedGrace.length,
            sample_employees: employeesWithCarriedGrace.slice(0, 5).map(e => ({
                name: e.name,
                carried_grace_minutes: e.carried_grace_minutes
            }))
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});