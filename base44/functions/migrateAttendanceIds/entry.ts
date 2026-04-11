import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const stats = {
            employees_updated: 0,
            punches_updated: 0,
            shifts_updated: 0,
            exceptions_updated: 0,
            errors: []
        };

        // Helper function to add delay
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Migrate Employees in batches
        const employees = await base44.asServiceRole.entities.Employee.list();
        for (let i = 0; i < employees.length; i++) {
            const emp = employees[i];
            if (typeof emp.attendance_id === 'string') {
                try {
                    await base44.asServiceRole.entities.Employee.update(emp.id, {
                        attendance_id: Number(emp.attendance_id)
                    });
                    stats.employees_updated++;
                    if (i % 10 === 0) await delay(100); // Delay every 10 updates
                } catch (error) {
                    stats.errors.push(`Employee ${emp.id}: ${error.message}`);
                }
            }
        }

        // Migrate Punches in batches
        const punches = await base44.asServiceRole.entities.Punch.list();
        for (let i = 0; i < punches.length; i++) {
            const punch = punches[i];
            if (typeof punch.attendance_id === 'string') {
                try {
                    await base44.asServiceRole.entities.Punch.update(punch.id, {
                        attendance_id: Number(punch.attendance_id)
                    });
                    stats.punches_updated++;
                    if (i % 10 === 0) await delay(100); // Delay every 10 updates
                } catch (error) {
                    stats.errors.push(`Punch ${punch.id}: ${error.message}`);
                }
            }
        }

        // Migrate ShiftTimings in batches
        const shifts = await base44.asServiceRole.entities.ShiftTiming.list();
        for (let i = 0; i < shifts.length; i++) {
            const shift = shifts[i];
            if (typeof shift.attendance_id === 'string') {
                try {
                    await base44.asServiceRole.entities.ShiftTiming.update(shift.id, {
                        attendance_id: Number(shift.attendance_id)
                    });
                    stats.shifts_updated++;
                    if (i % 10 === 0) await delay(100); // Delay every 10 updates
                } catch (error) {
                    stats.errors.push(`Shift ${shift.id}: ${error.message}`);
                }
            }
        }

        // Migrate Exceptions in batches (skip 'ALL')
        const exceptions = await base44.asServiceRole.entities.Exception.list();
        for (let i = 0; i < exceptions.length; i++) {
            const exc = exceptions[i];
            if (typeof exc.attendance_id === 'string' && exc.attendance_id !== 'ALL') {
                try {
                    await base44.asServiceRole.entities.Exception.update(exc.id, {
                        attendance_id: Number(exc.attendance_id)
                    });
                    stats.exceptions_updated++;
                    if (i % 10 === 0) await delay(100); // Delay every 10 updates
                } catch (error) {
                    stats.errors.push(`Exception ${exc.id}: ${error.message}`);
                }
            }
        }

        // Migrate AnalysisResults in batches
        const results = await base44.asServiceRole.entities.AnalysisResult.list();
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (typeof result.attendance_id === 'string') {
                try {
                    await base44.asServiceRole.entities.AnalysisResult.update(result.id, {
                        attendance_id: Number(result.attendance_id)
                    });
                    stats.analysis_results_updated = (stats.analysis_results_updated || 0) + 1;
                    if (i % 10 === 0) await delay(100); // Delay every 10 updates
                } catch (error) {
                    stats.errors.push(`AnalysisResult ${result.id}: ${error.message}`);
                }
            }
        }

        return Response.json({
            success: true,
            message: 'Migration completed',
            stats
        });

    } catch (error) {
        console.error('Migration error:', error);
        return Response.json({ 
            success: false,
            error: error.message 
        }, { status: 500 });
    }
});