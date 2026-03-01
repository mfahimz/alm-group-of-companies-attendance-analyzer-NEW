import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 300;

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
        // GRACE MINUTES CARRY-FORWARD (Al Maraghi Motors only)
        // ============================================================================
        let graceCarryForwardResults = { processed: 0, skipped: 0 };

        let isAlMaraghiMotors = false;
        try {
            const companyRecords = await base44.asServiceRole.entities.Company.filter({ name: project.company }, null, 5);
            if (companyRecords.length > 0 && companyRecords[0].company_id === 2) {
                isAlMaraghiMotors = true;
            }
        } catch (e) {
            console.warn('[closeProject] Could not resolve company_id, skipping grace logic');
        }

        if (isAlMaraghiMotors) {
            console.log('[closeProject] Al Maraghi Motors detected (company_id=2), running grace carry-forward');

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
                // Build grace entries list — use result.grace_minutes as the authoritative effectiveGrace
                // (this is the value actually applied during analysis, not a live recompute)
                const graceEntries = [];
                for (const result of results) {
                    const employee = employees.find(e => String(e.attendance_id) === String(result.attendance_id));

                    if (!employee || !employee.hrms_id || !employee.attendance_id) {
                        console.warn(`[closeProject] No employee record for attendance_id=${result.attendance_id}, skipping`);
                        graceCarryForwardResults.skipped++;
                        continue;
                    }

                    // effectiveGrace = what was actually stored in AnalysisResult during analysis run
                    const effectiveGrace = result.grace_minutes || 0;

                    // unusedGrace = max(0, effectiveGrace - (late + early))
                    const lateMinutes = result.late_minutes || 0;
                    const earlyCheckoutMinutes = result.early_checkout_minutes || 0;
                    const unusedGrace = Math.max(0, effectiveGrace - (lateMinutes + earlyCheckoutMinutes));

                    graceEntries.push({ employee, result, effectiveGrace, lateMinutes, earlyCheckoutMinutes, unusedGrace });
                }

                // Resolve EmployeeGraceHistory entity reference
                const graceManagementEntity = base44.asServiceRole.entities.EmployeeGraceHistory;
                let graceWriteFailures = 0;

                // Process in batches
                for (let i = 0; i < graceEntries.length; i += BATCH_SIZE) {
                    const batch = graceEntries.slice(i, i + BATCH_SIZE);

                    await Promise.all(batch.map(async (entry) => {
                        const { employee, result, effectiveGrace, lateMinutes, earlyCheckoutMinutes, unusedGrace } = entry;

                        try {
                            // WRITE A: EmployeeGraceHistory upsert (replace, never add)
                            const existingMgmtRecords = await graceManagementEntity.filter({
                                employee_id: String(employee.hrms_id)
                            }, null, 5);

                            const existingMgmtRecord = existingMgmtRecords.length > 0 ? existingMgmtRecords[0] : null;
                            const managementPayload = {
                                employee_id: String(employee.hrms_id),
                                employee_name: String(employee.name || ''),
                                attendance_id: String(employee.attendance_id),
                                company: project.company,
                                unused_grace_minutes: unusedGrace,
                                grace_minutes_available: effectiveGrace,
                                late_minutes: lateMinutes,
                                early_checkout_minutes: earlyCheckoutMinutes,
                                time_issues: lateMinutes + earlyCheckoutMinutes,
                                source_project_id: String(project_id),
                                report_run_id: project.last_saved_report_id,
                                source_project_name: project.name,
                                period_from: project.date_from,
                                period_to: project.date_to,
                                carried_by: user.email,
                                carried_at: new Date().toISOString()
                            };

                            let mgmtRecordId = existingMgmtRecord?.id || null;
                            if (existingMgmtRecord) {
                                await graceManagementEntity.update(existingMgmtRecord.id, managementPayload);
                            } else {
                                const created = await graceManagementEntity.create(managementPayload);
                                mgmtRecordId = created?.id || null;
                            }

                            // WRITE B: Employee profile replace (never add)
                            const oldCarriedGrace = Number(employee.carried_grace_minutes || 0);
                            try {
                                await base44.asServiceRole.entities.Employee.update(employee.id, {
                                    hrms_id: String(employee.hrms_id).trim(),
                                    attendance_id: String(employee.attendance_id).trim(),
                                    carried_grace_minutes: unusedGrace
                                });
                            } catch (employeeWriteErr) {
                                // Rollback GraceMinutesManagement if Employee update fails
                                try {
                                    if (existingMgmtRecord && mgmtRecordId) {
                                        await graceManagementEntity.update(mgmtRecordId, {
                                            unused_grace_minutes: Number(existingMgmtRecord.unused_grace_minutes || 0)
                                        });
                                    } else if (!existingMgmtRecord && mgmtRecordId) {
                                        await graceManagementEntity.delete(mgmtRecordId);
                                    }
                                } catch (rollbackErr) {
                                    console.error(`[closeProject] Rollback failed attendance_id=${result.attendance_id}:`, rollbackErr?.message || rollbackErr);
                                }
                                throw employeeWriteErr;
                            }

                            console.log(`[closeProject] Grace synced attendance_id=${result.attendance_id}: effectiveGrace=${effectiveGrace}, late=${lateMinutes}, early=${earlyCheckoutMinutes}, unusedGrace=${unusedGrace}, oldEmployeeCarried=${oldCarriedGrace}`);
                            graceCarryForwardResults.processed++;
                        } catch (err) {
                            console.error(`[closeProject] Grace sync failed attendance_id=${result.attendance_id}:`, err?.message || err);
                            graceCarryForwardResults.skipped++;
                            graceWriteFailures++;
                        }
                    }));

                    if (i + BATCH_SIZE < graceEntries.length) {
                        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                    }
                }

                await base44.asServiceRole.functions.invoke('logAudit', {
                    action_type: 'GRACE_CARRY_FORWARD_BATCH_SYNC',
                    entity_name: 'GraceMinutesManagement,Employee',
                    entity_id: String(project_id),
                    project_id: project_id,
                    company: project.company,
                    context: `closeProject grace sync. Acting user: ${user.email}`,
                    changes: JSON.stringify({
                        total_employees_processed: graceEntries.length,
                        total_employees_updated_successfully: graceCarryForwardResults.processed,
                        total_employees_failed: graceWriteFailures,
                        acting_user: user.email
                    })
                });
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