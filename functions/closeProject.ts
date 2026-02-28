import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin') {
            return Response.json({ error: 'Access denied: Admin role required' }, { status: 403 });
        }

        const { project_id, carry_forward_grace_minutes } = await req.json();

        if (!project_id) {
            return Response.json({ error: 'Missing project_id' }, { status: 400 });
        }

        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 10);
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        if (!project.last_saved_report_id) {
            return Response.json({ error: 'No report to finalize' }, { status: 400 });
        }

        const results = await base44.asServiceRole.entities.AnalysisResult.filter({
            report_run_id: project.last_saved_report_id
        }, null, 5000);

        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: project.company
        }, null, 5000);

        employees.forEach(emp => {
            if (typeof emp.hrms_id !== 'string') emp.hrms_id = String(emp.hrms_id);
            if (typeof emp.attendance_id !== 'string') emp.attendance_id = String(emp.attendance_id);
        });

        const enableAllowedMinutesDeduction = project.company === 'Al Maraghi Auto Repairs';
        const updates = [];
        
        if (enableAllowedMinutesDeduction) {
            const allowedMinutesExceptions = await base44.asServiceRole.entities.Exception.filter({
                project_id: project_id,
                type: 'ALLOWED_MINUTES'
            }, null, 5000);

            const exceptionsByEmployee = {};
            for (const exc of allowedMinutesExceptions) {
                if (!exceptionsByEmployee[exc.attendance_id]) {
                    exceptionsByEmployee[exc.attendance_id] = [];
                }
                exceptionsByEmployee[exc.attendance_id].push(exc);
            }

            for (const attendanceId in exceptionsByEmployee) {
                const employee = employees.find(e => String(e.attendance_id) === String(attendanceId));
                if (!employee) continue;

                const employeeExceptions = exceptionsByEmployee[attendanceId];
                let totalMinutesToDeduct = 0;

                for (const exc of employeeExceptions) {
                    const empResult = results.find(r => String(r.attendance_id) === String(attendanceId));
                    if (!empResult) continue;

                    let exceptionOffsets = {};
                    if (empResult.exception_offsets) {
                        try {
                            exceptionOffsets = JSON.parse(empResult.exception_offsets);
                        } catch (e) {
                            exceptionOffsets = {};
                        }
                    }

                    const dateKey = exc.date_from;
                    const dayOffset = exceptionOffsets[dateKey] || {};
                    const actualUsed = (dayOffset.offset_late || 0) + (dayOffset.offset_early || 0);
                    totalMinutesToDeduct += actualUsed;
                }

                if (totalMinutesToDeduct > 0) {
                    const quarterlyRecords = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                        employee_id: String(employee.hrms_id),
                        project_id: project_id,
                        allocation_type: 'project_period'
                    }, null, 10);

                    if (quarterlyRecords.length > 0) {
                        const record = quarterlyRecords[0];
                        const newUsedMinutes = (record.used_minutes || 0) + totalMinutesToDeduct;
                        const newRemainingMinutes = Math.max(0, (record.total_minutes || 0) - newUsedMinutes);

                        updates.push(
                            base44.asServiceRole.entities.EmployeeQuarterlyMinutes.update(record.id, {
                                used_minutes: newUsedMinutes,
                                remaining_minutes: newRemainingMinutes
                            })
                        );
                    }
                }
            }
        }

        await Promise.all(updates);

        // ============================================================================
        // GRACE MINUTES CARRY-FORWARD (Al Maraghi Auto Repairs only)
        // ============================================================================
        let graceCarryForwardResults = { processed: 0, skipped: 0, already_exists: 0 };

        if (carry_forward_grace_minutes === true && (project.company === 'Al Maraghi Auto Repairs' || project.company === 'Al Maraghi Motors')) {
            console.log('[closeProject] Grace carry-forward requested');

            if (project.grace_carried_forward === true) {
                console.log('[closeProject] Grace carry-forward already completed, skipping');
                graceCarryForwardResults.already_exists = 1;
            } else {
                const reportRuns = await base44.asServiceRole.entities.ReportRun.filter({
                    id: project.last_saved_report_id
                }, null, 10);
                const reportRun = reportRuns.length > 0 ? reportRuns[0] : null;

                const rulesData = await base44.asServiceRole.entities.AttendanceRules.filter({
                    company: project.company
                }, null, 10);
                let rules = null;
                if (rulesData.length > 0) {
                    try {
                        rules = JSON.parse(rulesData[0].rules_json);
                    } catch (e) {
                        console.warn('[closeProject] Failed to parse rules');
                    }
                }

                const nowUAE = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })).toISOString();
                const periodFrom = reportRun?.date_from || project?.date_from || '2025-01-01';
                const periodTo = reportRun?.date_to || project?.date_to || '2025-01-31';

                for (const result of results) {
                    const employee = employees.find(e => String(e.attendance_id) === String(result.attendance_id));

                    if (!employee || !employee.hrms_id || !employee.attendance_id) {
                        console.warn(`[closeProject] Skip invalid employee: ${result.attendance_id}`);
                        graceCarryForwardResults.skipped++;
                        continue;
                    }

                    const dept = employee.department || 'Admin';
                    const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
                    const carriedGrace = project.use_carried_grace_minutes ? (employee.carried_grace_minutes || 0) : 0;
                    const graceMinutesAvailable = baseGrace + carriedGrace;

                    const lateMinutes = result.late_minutes || 0;
                    const earlyCheckoutMinutes = result.early_checkout_minutes || 0;
                    const ramadanGiftMinutes = result.ramadan_gift_minutes || 0;
                    const timeIssues = Math.max(0, lateMinutes + earlyCheckoutMinutes - ramadanGiftMinutes);
                    const unusedGraceMinutes = Math.max(0, graceMinutesAvailable - timeIssues);

                    // SKIP if no grace to carry
                    if (unusedGraceMinutes <= 0) {
                        console.log(`[closeProject] No grace to carry for ${employee.name}`);
                        continue;
                    }

                    // IDEMPOTENCY: Check if already carried
                    const existingRecord = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
                        employee_id: String(employee.hrms_id),
                        source_project_id: String(project_id)
                    }, null, 10);

                    if (existingRecord.length > 0) {
                        console.log(`[closeProject] Already carried for ${employee.name}, skipping`);
                        graceCarryForwardResults.already_exists++;
                        continue;
                    }

                    try {
                        // WRITE 1: Create EmployeeGraceHistory (audit-only)
                        await base44.asServiceRole.entities.EmployeeGraceHistory.create({
                            employee_id: String(employee.hrms_id).trim(),
                            attendance_id: String(employee.attendance_id).trim(),
                            employee_name: String(employee.name || 'Unknown').trim(),
                            company: String(project.company).trim(),
                            source_project_id: String(project_id).trim(),
                            source_project_name: String(project.name || '').trim(),
                            report_run_id: String(project.last_saved_report_id).trim(),
                            period_from: String(periodFrom).trim(),
                            period_to: String(periodTo).trim(),
                            grace_minutes_available: Math.max(0, Number(graceMinutesAvailable)),
                            late_minutes: Math.max(0, Number(lateMinutes)),
                            early_checkout_minutes: Math.max(0, Number(earlyCheckoutMinutes)),
                            time_issues: Math.max(0, Number(timeIssues)),
                            unused_grace_minutes: Math.max(0, Number(unusedGraceMinutes)),
                            carried_at: String(nowUAE).trim(),
                            carried_by: 'system@closeProject'
                        });

                        // WRITE 2: Update Employee.carried_grace_minutes (operational field)
                        const currentCarried = employee.carried_grace_minutes || 0;
                        const newCarried = currentCarried + unusedGraceMinutes;
                        await base44.asServiceRole.entities.Employee.update(employee.id, {
                            hrms_id: String(employee.hrms_id).trim(),
                            attendance_id: String(employee.attendance_id).trim(),
                            carried_grace_minutes: newCarried
                        });

                        console.log(`[closeProject] Synced: ${employee.name} → ${newCarried}m`);
                        graceCarryForwardResults.processed++;

                    } catch (err) {
                        console.error(`[closeProject] Failed for ${employee.name}:`, err.message);
                        graceCarryForwardResults.skipped++;
                    }
                }

                // Set flag only after all processed
                if (graceCarryForwardResults.processed > 0) {
                    await base44.asServiceRole.entities.Project.update(project_id, {
                        grace_carried_forward: true
                    });
                }
            }
        }

        // Close the project
        await base44.asServiceRole.entities.Project.update(project_id, {
            status: 'closed'
        });

        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'CLOSE_PROJECT',
            entity_type: 'Project',
            entity_id: project_id,
            entity_name: project.name,
            company: project.company,
            details: `Project closed. Quarterly minutes: ${updates.length}. Grace carry-forward: ${carry_forward_grace_minutes ? 'Yes' : 'No'}. Processed: ${graceCarryForwardResults.processed}`
        });

        return Response.json({
            success: true,
            message: `Project closed successfully. ${updates.length} quarterly minutes records updated.${graceCarryForwardResults.processed > 0 ? ` ${graceCarryForwardResults.processed} grace carry-forward records created.` : ''}`,
            updated_records: updates.length,
            grace_carry_forward: graceCarryForwardResults
        });

    } catch (error) {
        console.error('Close project error:', error);
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});