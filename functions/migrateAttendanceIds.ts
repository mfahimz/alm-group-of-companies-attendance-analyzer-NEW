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

        // Migrate Employees
        const employees = await base44.asServiceRole.entities.Employee.list();
        for (const emp of employees) {
            if (typeof emp.attendance_id === 'string') {
                try {
                    await base44.asServiceRole.entities.Employee.update(emp.id, {
                        attendance_id: Number(emp.attendance_id)
                    });
                    stats.employees_updated++;
                } catch (error) {
                    stats.errors.push(`Employee ${emp.id}: ${error.message}`);
                }
            }
        }

        // Migrate Punches
        const punches = await base44.asServiceRole.entities.Punch.list();
        for (const punch of punches) {
            if (typeof punch.attendance_id === 'string') {
                try {
                    await base44.asServiceRole.entities.Punch.update(punch.id, {
                        attendance_id: Number(punch.attendance_id)
                    });
                    stats.punches_updated++;
                } catch (error) {
                    stats.errors.push(`Punch ${punch.id}: ${error.message}`);
                }
            }
        }

        // Migrate ShiftTimings
        const shifts = await base44.asServiceRole.entities.ShiftTiming.list();
        for (const shift of shifts) {
            if (typeof shift.attendance_id === 'string') {
                try {
                    await base44.asServiceRole.entities.ShiftTiming.update(shift.id, {
                        attendance_id: Number(shift.attendance_id)
                    });
                    stats.shifts_updated++;
                } catch (error) {
                    stats.errors.push(`Shift ${shift.id}: ${error.message}`);
                }
            }
        }

        // Migrate Exceptions (skip 'ALL')
        const exceptions = await base44.asServiceRole.entities.Exception.list();
        for (const exc of exceptions) {
            if (typeof exc.attendance_id === 'string' && exc.attendance_id !== 'ALL') {
                try {
                    await base44.asServiceRole.entities.Exception.update(exc.id, {
                        attendance_id: Number(exc.attendance_id)
                    });
                    stats.exceptions_updated++;
                } catch (error) {
                    stats.errors.push(`Exception ${exc.id}: ${error.message}`);
                }
            }
        }

        // Migrate AnalysisResults
        const results = await base44.asServiceRole.entities.AnalysisResult.list();
        for (const result of results) {
            if (typeof result.attendance_id === 'string') {
                try {
                    await base44.asServiceRole.entities.AnalysisResult.update(result.id, {
                        attendance_id: Number(result.attendance_id)
                    });
                    stats.analysis_results_updated = (stats.analysis_results_updated || 0) + 1;
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