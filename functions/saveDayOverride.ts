import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SAVE DAY OVERRIDE
 * 
 * Admin-only function to override day-related attendance values in SalarySnapshot.
 * This triggers automatic recalculation of leave-dependent salary fields.
 * 
 * CRITICAL RULES:
 * - ONLY updates override fields, never modifies original finalized attendance
 * - ONLY admin role allowed
 * - Automatically calls recalculateSalarySnapshot to recompute affected fields
 * - All changes are audited
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // PERMISSION CHECK: Admin, CEO, and HR Manager can override day values
        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin' && userRole !== 'ceo' && userRole !== 'hr_manager') {
            return Response.json({
                error: 'Access denied: Admin, CEO, or HR Manager role required to override day values'
            }, { status: 403 });
        }

        const { 
            salary_report_id,
            report_run_id,
            project_id,
            attendance_id,
            override_present_days,
            override_full_absence_count,
            override_annual_leave_count,
            override_sick_leave_count,
            override_salary_leave_days,
            override_working_days,
            clear_overrides = false // If true, clears all overrides
        } = await req.json();

        if (!report_run_id || !project_id || !attendance_id) {
            return Response.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // Scoped to Al Maraghi Motors ONLY
        if (project.company !== 'Al Maraghi Motors') {
            return Response.json({ 
                error: 'Day overrides are only available for Al Maraghi Motors' 
            }, { status: 403 });
        }

        // Fetch snapshot
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({ 
            project_id: project_id,
            report_run_id: report_run_id,
            attendance_id: String(attendance_id)
        });
        
        if (snapshots.length === 0) {
            return Response.json({ error: 'SalarySnapshot not found' }, { status: 404 });
        }
        const snapshot = snapshots[0];

        // Build update payload with override fields only
        const updatePayload = {};
        
        if (clear_overrides) {
            // Clear all overrides
            updatePayload.override_present_days = null;
            updatePayload.override_full_absence_count = null;
            updatePayload.override_annual_leave_count = null;
            updatePayload.override_sick_leave_count = null;
            updatePayload.override_salary_leave_days = null;
            updatePayload.override_working_days = null;
            updatePayload.has_admin_day_override = false;
            updatePayload.day_override_updated_at = new Date().toISOString();
            updatePayload.day_override_updated_by = user.email;
        } else {
            // Set overrides from request
            const hasAnyOverride = override_present_days !== undefined 
                || override_full_absence_count !== undefined
                || override_annual_leave_count !== undefined
                || override_sick_leave_count !== undefined
                || override_salary_leave_days !== undefined
                || override_working_days !== undefined;

            if (!hasAnyOverride) {
                return Response.json({ error: 'No override values provided' }, { status: 400 });
            }

            if (override_present_days !== undefined) updatePayload.override_present_days = override_present_days;
            if (override_full_absence_count !== undefined) updatePayload.override_full_absence_count = override_full_absence_count;
            if (override_annual_leave_count !== undefined) updatePayload.override_annual_leave_count = override_annual_leave_count;
            if (override_sick_leave_count !== undefined) updatePayload.override_sick_leave_count = override_sick_leave_count;
            if (override_salary_leave_days !== undefined) updatePayload.override_salary_leave_days = override_salary_leave_days;
            if (override_working_days !== undefined) updatePayload.override_working_days = override_working_days;
            
            updatePayload.has_admin_day_override = true;
            updatePayload.day_override_updated_at = new Date().toISOString();
            updatePayload.day_override_updated_by = user.email;
        }

        // Update snapshot with override fields
        await base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, updatePayload);

        // Trigger recalculation via existing recalculateSalarySnapshot function
        const recalcResponse = await base44.asServiceRole.functions.invoke('recalculateSalarySnapshot', {
            report_run_id: report_run_id,
            project_id: project_id,
            attendance_id: String(attendance_id),
            mode: 'APPLY'
        });

        if (!recalcResponse.data.success) {
            throw new Error('Recalculation failed: ' + recalcResponse.data.error);
        }

        // Audit log
        try {
            await base44.asServiceRole.entities.AuditLog.create({
                action: 'SAVE_DAY_OVERRIDE',
                entity_type: 'SalarySnapshot',
                entity_id: snapshot.id,
                user_email: user.email,
                company: project.company,
                details: JSON.stringify({
                    project_id: project_id,
                    report_run_id: report_run_id,
                    attendance_id: String(attendance_id),
                    employee_name: snapshot.name,
                    overrides: updatePayload,
                    recalc_diff: recalcResponse.data.diff
                })
            });
        } catch (auditError) {
            console.warn('[saveDayOverride] Audit log failed:', auditError.message);
        }

        return Response.json({
            success: true,
            employee_name: snapshot.name,
            attendance_id: snapshot.attendance_id,
            overrides_saved: updatePayload,
            recalculation: recalcResponse.data,
            message: `Day overrides saved and salary recalculated for ${snapshot.name}`
        });

    } catch (error) {
        console.error('Save day override error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});