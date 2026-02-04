import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const { project_id } = await req.json();

        // Fetch history records for this project
        const history = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
            source_project_id: project_id
        }, null, 5000);

        if (history.length === 0) {
            return Response.json({ error: 'No grace history found for this project' }, { status: 400 });
        }

        // Group by employee_id to sum unused grace if multiple records
        const graceByEmployee = {};
        for (const record of history) {
            const empId = String(record.employee_id).trim();
            const unused = Number(record.unused_grace_minutes) || 0;
            
            if (!graceByEmployee[empId]) {
                graceByEmployee[empId] = { unused: 0, record };
            }
            graceByEmployee[empId].unused += unused;
        }

        let synced = 0;
        let failed = 0;

        // Update each employee
        for (const [empId, data] of Object.entries(graceByEmployee)) {
            try {
                // Fetch employee
                const emps = await base44.asServiceRole.entities.Employee.filter({
                    hrms_id: empId
                }, null, 10);

                if (emps.length === 0) {
                    failed++;
                    continue;
                }

                const emp = emps[0];
                const currentCarried = emp.carried_grace_minutes || 0;
                const newCarried = currentCarried + data.unused;

                // Update
                await base44.asServiceRole.entities.Employee.update(emp.id, {
                    carried_grace_minutes: newCarried
                });

                synced++;

            } catch (err) {
                console.error(`Failed to sync ${empId}:`, err.message);
                failed++;
            }
        }

        return Response.json({
            success: true,
            synced,
            failed,
            unique_employees_in_history: Object.keys(graceByEmployee).length
        });

    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});