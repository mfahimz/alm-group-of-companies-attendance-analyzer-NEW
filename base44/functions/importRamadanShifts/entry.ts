import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { project_id, shifts, department } = await req.json();

        if (!project_id || !shifts || !Array.isArray(shifts)) {
            return Response.json({ 
                error: 'Missing required fields: project_id and shifts array' 
            }, { status: 400 });
        }

        const created = [];
        const errors = [];
        const skipped = [];

        for (const shift of shifts) {
            try {
                // Skip if no actual shift times defined
                if (!shift.am_start && !shift.pm_start) {
                    skipped.push({
                        attendance_id: shift.attendance_id,
                        date: shift.date,
                        reason: 'No shift times defined'
                    });
                    continue;
                }

                // Create ShiftTiming record
                const record = await base44.asServiceRole.entities.ShiftTiming.create({
                    project_id: project_id,
                    attendance_id: shift.attendance_id,
                    date: shift.date,
                    applicable_days: `Ramadan ${department || ''}`.trim(),
                    am_start: shift.am_start || null,
                    am_end: shift.am_end || null,
                    pm_start: shift.pm_start || null,
                    pm_end: shift.pm_end || null,
                    is_single_shift: shift.is_single_shift || false,
                    is_friday_shift: shift.is_friday_shift || false
                });

                created.push({
                    id: record.id,
                    attendance_id: shift.attendance_id,
                    date: shift.date
                });

            } catch (error) {
                errors.push({
                    attendance_id: shift.attendance_id,
                    date: shift.date,
                    error: error.message
                });
            }
        }

        return Response.json({
            success: true,
            summary: {
                total_shifts: shifts.length,
                imported: created.length,
                skipped: skipped.length,
                errors: errors.length
            },
            created: created,
            skipped: skipped,
            errors: errors
        });

    } catch (error) {
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});