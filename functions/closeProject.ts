import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // SECURITY: Only admin can close projects
        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin') {
            return Response.json({ error: 'Access denied: Admin role required' }, { status: 403 });
        }

        const { project_id, carry_forward_grace_minutes } = await req.json();

        if (!project_id) {
            return Response.json({ error: 'Missing project_id' }, { status: 400 });
        }

        // Get project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 10);
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];

        // Get the last saved report
        if (!project.last_saved_report_id) {
            return Response.json({ error: 'No report to finalize' }, { status: 400 });
        }

        // Get all analysis results for this report
        const results = await base44.asServiceRole.entities.AnalysisResult.filter({
            report_run_id: project.last_saved_report_id
        }, null, 5000);

        // Get all employees
        const employees = await base44.asServiceRole.entities.Employee.filter({
            company: project.company
        }, null, 5000);

        // CRITICAL FIX: Convert all employee IDs to strings immediately
        employees.forEach(emp => {
            if (typeof emp.hrms_id !== 'string') {
                emp.hrms_id = String(emp.hrms_id);
            }
            if (typeof emp.attendance_id !== 'string') {
                emp.attendance_id = String(emp.attendance_id);
            }
        });

        // FOUNDATION: Currently only applies to Al Maraghi Auto Repairs
        const enableAllowedMinutesDeduction = project.company === 'Al Maraghi Auto Repairs';

        // Deduct allowed minutes exceptions from quarterly allowances
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

            // IDEMPOTENCY: Check if already carried for this project
            if (project.grace_carried_forward === true) {
                console.log('[closeProject] Grace carry-forward already completed for this project, skipping');
                graceCarryForwardResults.already_exists = 1;
            } else {
                // Get report run and rules
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

                // Process each employee
                for (const result of results) {
                    const employee = employees.find(e => String(e.attendance_id) === String(result.attendance_id));

                    if (!employee || !employee.hrms_id || !employee.attendance_id) {
                        console.warn(`[closeProject] Skip invalid employee: ${result.attendance_id}`);
                        graceCarryForwardResults.skipped++;
                        continue;
                    }

                    // Calculate unused grace
                    const dept = employee.department || 'Admin';
                    const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) ? rules.grace_minutes[dept] : 15;
                    const carriedGrace = project.use_carried_grace_minutes ? (employee.carried_grace_minutes || 0) : 0;
                    const graceMinutesAvailable = baseGrace + carriedGrace;

                    const lateMinutes = result.late_minutes || 0;
                    const earlyCheckoutMinutes = result.early_checkout_minutes || 0;
                    const timeIssues = lateMinutes + earlyCheckoutMinutes;
                    const unusedGraceMinutes = Math.max(0, graceMinutesAvailable - timeIssues);

                    // SKIP if no grace to carry
                    if (unusedGraceMinutes <= 0) {
                        console.log(`[closeProject] No grace to carry for ${employee.name}`);
                        continue;
                    }

                    // IDEMPOTENCY CHECK: Ensure not already carried for this employee in this project
                    const existingRecord = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
                        employee_id: String(employee.hrms_id),
                        source_project_id: String(project_id)
                    }, null, 10);

                    if (existingRecord.length > 0) {
                        console.log(`[closeProject] Grace already carried for ${employee.name} in project ${project.name}, skipping`);
                        graceCarryForwardResults.already_exists++;
                        continue;
                    }

                    try {
                        // ===== WRITE 1: Create EmployeeGraceHistory (audit log) =====
                        const historyRecord = {
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
                        };

                        await base44.asServiceRole.entities.EmployeeGraceHistory.create(historyRecord);
                        console.log(`[closeProject] Created history: ${employee.name} (${unusedGraceMinutes}m)`);

                        // ===== WRITE 2: Update GraceMinutesBalance (operational record) =====
                        const balanceRecords = await base44.asServiceRole.entities.GraceMinutesBalance.filter({
                            employee_id: String(employee.hrms_id),
                            company: String(project.company)
                        }, null, 10);

                        if (balanceRecords.length > 0) {
                            // Update existing record
                            const balanceRecord = balanceRecords[0];
                            const newTotal = (balanceRecord.total_carried_minutes || 0) + unusedGraceMinutes;
                            await base44.asServiceRole.entities.GraceMinutesBalance.update(balanceRecord.id, {
                                total_carried_minutes: newTotal,
                                last_project_id: String(project_id),
                                last_carried_at: String(nowUAE)
                            });
                            console.log(`[closeProject] Updated balance: ${employee.name} → ${newTotal}m`);
                        } else {
                            // Create new balance record
                            await base44.asServiceRole.entities.GraceMinutesBalance.create({
                                employee_id: String(employee.hrms_id).trim(),
                                company: String(project.company).trim(),
                                total_carried_minutes: Math.max(0, Number(unusedGraceMinutes)),
                                last_project_id: String(project_id).trim(),
                                last_carried_at: String(nowUAE).trim()
                            });
                            console.log(`[closeProject] Created balance: ${employee.name} → ${unusedGraceMinutes}m`);
                        }

                        // ===== WRITE 3: Update Employee.carried_grace_minutes (cache) =====
                        const currentCarried = employee.carried_grace_minutes || 0;
                        const newCarried = currentCarried + unusedGraceMinutes;
                        await base44.asServiceRole.entities.Employee.update(employee.id, {
                            carried_grace_minutes: newCarried
                        });
                        console.log(`[closeProject] Synced Employee: ${employee.name} → ${newCarried}m`);

                        graceCarryForwardResults.processed++;

                    } catch (err) {
                        console.error(`[closeProject] Failed for ${employee.name}:`, err.message);
                        graceCarryForwardResults.skipped++;
                    }
                }

                // Set project flag ONLY after ALL employees processed successfully
                if (graceCarryForwardResults.processed > 0) {
                    await base44.asServiceRole.entities.Project.update(project_id, {
                        grace_carried_forward: true
                    });
                    console.log(`[closeProject] Set grace_carried_forward flag`);
                }
            }
        }

        // Close the project
        await base44.asServiceRole.entities.Project.update(project_id, {
            status: 'closed'
        });

        // Log audit for project close
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'CLOSE_PROJECT',
            entity_type: 'Project',
            entity_id: project_id,
            entity_name: project.name,
            company: project.company,
            details: `Project closed. Quarterly minutes updated: ${updates.length}. Grace carry-forward: ${carry_forward_grace_minutes ? 'Yes' : 'No'}. Processed: ${graceCarryForwardResults.processed}`
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