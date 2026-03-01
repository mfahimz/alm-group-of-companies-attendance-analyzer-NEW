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
        // GRACE MINUTES CARRY-FORWARD (Al Maraghi Motors only — identified by stable company_id)
        // ============================================================================
        const AL_MARAGHI_MOTORS_COMPANY_ID = 2;
        let graceCarryForwardResults = { processed: 0, skipped: 0 };

        // Step 1: Check if this project belongs to Al Maraghi Motors by company_id
        let isAlMaraghiMotors = false;
        try {
            const companyRecords = await base44.asServiceRole.entities.Company.filter({ name: project.company }, null, 5);
            if (companyRecords.length > 0 && companyRecords[0].company_id === AL_MARAGHI_MOTORS_COMPANY_ID) {
                isAlMaraghiMotors = true;
            }
        } catch (e) {
            console.warn('[closeProject] Could not resolve company_id, skipping grace logic');
        }

        if (isAlMaraghiMotors) {
            console.log('[closeProject] Al Maraghi Motors detected (company_id=2), running grace carry-forward');

            // Step 2: Fetch the single finalized ReportRun for this project
            let reportRun = null;
            try {
                const reportRuns = await base44.asServiceRole.entities.ReportRun.filter({
                    id: project.last_saved_report_id
                }, null, 10);
                reportRun = reportRuns.length > 0 ? reportRuns[0] : null;
            } catch (e) {
                console.warn('[closeProject] Failed to fetch ReportRun:', e.message);
            }

            if (!reportRun || !reportRun.is_final) {
                console.warn(`[closeProject] No finalized report found for project_id=${project_id}, skipping grace update`);
            } else {
                // Fetch AttendanceRules for the company
                const rulesData = await base44.asServiceRole.entities.AttendanceRules.filter({
                    company: project.company
                }, null, 10);
                let rules = null;
                if (rulesData.length > 0) {
                    try {
                        rules = JSON.parse(rulesData[0].rules_json);
                    } catch (e) {
                        console.warn('[closeProject] Failed to parse AttendanceRules');
                    }
                }

                // Steps 3–6: Process each employee in the finalized report
                for (const result of results) {
                    const employee = employees.find(e => String(e.attendance_id) === String(result.attendance_id));

                    // Step 6: If employee has no matching record, skip silently and log
                    if (!employee || !employee.hrms_id || !employee.attendance_id) {
                        console.warn(`[closeProject] No employee record for attendance_id=${result.attendance_id}, skipping`);
                        graceCarryForwardResults.skipped++;
                        continue;
                    }

                    // Step 3: effectiveGrace source of truth = finalized AnalysisResult.grace_minutes.
                    // We still log base+carried components for diagnostics.
                    const dept = employee.department || 'Admin';
                    const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
                    const carriedGrace = employee.carried_grace_minutes || 0;
                    const effectiveGraceFromRuleAndCarry = baseGrace + carriedGrace;
                    const effectiveGrace = (typeof result.grace_minutes === 'number')
                        ? Math.max(0, result.grace_minutes)
                        : Math.max(0, baseGrace);

                    console.log(`[closeProject] Grace inputs attendance_id=${result.attendance_id}: baseGrace=${baseGrace}, carriedGrace=${carriedGrace}, basePlusCarry=${effectiveGraceFromRuleAndCarry}, analysisResult.grace_minutes=${result.grace_minutes ?? 'null'}, effectiveGraceUsed=${effectiveGrace}`);

                    // Step 4: unusedGrace = max(0, effectiveGrace - (late + early))
                    const lateMinutes = result.late_minutes || 0;
                    const earlyCheckoutMinutes = result.early_checkout_minutes || 0;
                    const unusedGrace = Math.max(0, effectiveGrace - (lateMinutes + earlyCheckoutMinutes));

                    // Step 5: Replace carried_grace_minutes entirely (write 0 explicitly if unusedGrace is 0)
                    const oldCarriedGrace = employee.carried_grace_minutes || 0;

                    try {
                        await base44.asServiceRole.entities.Employee.update(employee.id, {
                            hrms_id: String(employee.hrms_id).trim(),
                            attendance_id: String(employee.attendance_id).trim(),
                            carried_grace_minutes: unusedGrace
                        });

                        // Step 7: logAudit for each employee updated
                        await base44.asServiceRole.functions.invoke('logAudit', {
                            action_type: 'GRACE_CARRY_FORWARD',
                            entity_name: 'Employee',
                            entity_id: String(employee.hrms_id),
                            changes: JSON.stringify({
                                carried_grace_minutes: { old: oldCarriedGrace, new: unusedGrace }
                            }),
                            project_id: project_id,
                            company: project.company,
                            context: `closeProject grace carry-forward. Acting user: ${user.email}`
                        });

                        console.log(`[closeProject] Grace updated: ${employee.name} — old=${oldCarriedGrace}, new=${unusedGrace}`);
                        graceCarryForwardResults.processed++;
                    } catch (err) {
                        console.error(`[closeProject] Failed to update grace for ${employee.name}:`, err.message);
                        graceCarryForwardResults.skipped++;
                    }
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
