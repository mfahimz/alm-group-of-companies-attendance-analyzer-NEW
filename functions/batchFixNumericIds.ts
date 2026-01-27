import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const BATCH_SIZE = 50;
        const DELAY_MS = 1000; // 1 second delay between batches

        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Fix Employees (both hrms_id and attendance_id)
        const employees = await base44.asServiceRole.entities.Employee.list();
        const numericEmployees = employees.filter(emp => 
            typeof emp.attendance_id === 'number' || typeof emp.hrms_id === 'number'
        );

        let employeesFixed = 0;
        const employeeErrors = [];

        for (let i = 0; i < numericEmployees.length; i += BATCH_SIZE) {
            const batch = numericEmployees.slice(i, i + BATCH_SIZE);
            
            for (const emp of batch) {
                try {
                    const updates = {};
                    if (typeof emp.attendance_id === 'number') {
                        updates.attendance_id = String(emp.attendance_id);
                    }
                    if (typeof emp.hrms_id === 'number') {
                        updates.hrms_id = String(emp.hrms_id);
                    }

                    await base44.asServiceRole.entities.Employee.update(emp.id, updates);
                    employeesFixed++;
                } catch (error) {
                    employeeErrors.push(`Employee ${emp.id}: ${error.message}`);
                }
            }

            // Delay between batches
            if (i + BATCH_SIZE < numericEmployees.length) {
                await sleep(DELAY_MS);
            }
        }

        // Fix Punches (attendance_id only)
        const punches = await base44.asServiceRole.entities.Punch.list();
        const numericPunches = punches.filter(punch => typeof punch.attendance_id === 'number');

        let punchesFixed = 0;
        const punchErrors = [];

        for (let i = 0; i < numericPunches.length; i += BATCH_SIZE) {
            const batch = numericPunches.slice(i, i + BATCH_SIZE);
            
            for (const punch of batch) {
                try {
                    await base44.asServiceRole.entities.Punch.update(punch.id, {
                        attendance_id: String(punch.attendance_id)
                    });
                    punchesFixed++;
                } catch (error) {
                    punchErrors.push(`Punch ${punch.id}: ${error.message}`);
                }
            }

            // Delay between batches
            if (i + BATCH_SIZE < numericPunches.length) {
                await sleep(DELAY_MS);
            }
        }

        return Response.json({
            success: true,
            employees: {
                found: numericEmployees.length,
                fixed: employeesFixed,
                errors: employeeErrors.slice(0, 10) // First 10 errors only
            },
            punches: {
                found: numericPunches.length,
                fixed: punchesFixed,
                errors: punchErrors.slice(0, 10)
            }
        });

    } catch (error) {
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});