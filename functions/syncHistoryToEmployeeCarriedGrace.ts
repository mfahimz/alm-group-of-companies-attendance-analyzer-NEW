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

        // Fetch all employees for quick lookup
        const allEmployees = await base44.asServiceRole.entities.Employee.filter({}, null, 5000);

        // Group by employee_id to sum unused grace if multiple records
        const graceByEmployee = {};
        for (const record of history) {
            const empHrmsId = String(record.employee_id).trim();
            const unused = Number(record.unused_grace_minutes) || 0;
            
            if (!graceByEmployee[empHrmsId]) {
                graceByEmployee[empHrmsId] = { unused: 0, record };
            }
            graceByEmployee[empHrmsId].unused += unused;
        }

        let synced = 0;
        let failed = 0;

        // Update each employee
        for (const [empHrmsId, data] of Object.entries(graceByEmployee)) {
            try {
                // Find employee by hrms_id in the fetched list
                const emp = allEmployees.find(e => String(e.hrms_id) === String(empHrmsId));

                if (!emp || !emp.id) {
                    console.warn(`Employee not found for hrms_id: ${empHrmsId}`);
                    failed++;
                    continue;
                }

                const currentCarried = emp.carried_grace_minutes || 0;
                const newCarried = currentCarried + data.unused;

                // Update with correct employee DB ID (preserve existing string fields)
                await base44.asServiceRole.entities.Employee.update(emp.id, {
                    hrms_id: String(emp.hrms_id).trim(),
                    attendance_id: String(emp.attendance_id).trim(),
                    carried_grace_minutes: newCarried
                });

                synced++;

            } catch (err) {
                console.error(`Failed to sync ${empHrmsId}:`, err.message);
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