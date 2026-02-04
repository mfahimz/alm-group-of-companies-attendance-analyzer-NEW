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

        // CRITICAL FIX: Employee records have numeric IDs in database - convert immediately
        employees.forEach(emp => {
            if (typeof emp.hrms_id !== 'string') {
                emp.hrms_id = String(emp.hrms_id);
            }
            if (typeof emp.attendance_id !== 'string') {
                emp.attendance_id = String(emp.attendance_id);
            }
        });

        // FOUNDATION: Currently only applies to Al Maraghi Auto Repairs
        // Design allows for per-company toggle via system settings in future
        const enableAllowedMinutesDeduction = project.company === 'Al Maraghi Auto Repairs';

        // Deduct allowed minutes exceptions from quarterly allowances (single-day per-day matching)
        // Only applies to Al Maraghi Auto Repairs for now
        const updates = [];
        
        if (enableAllowedMinutesDeduction) {
            // Get all ALLOWED_MINUTES exceptions for this project
            const allowedMinutesExceptions = await base44.asServiceRole.entities.Exception.filter({
                project_id: project_id,
                type: 'ALLOWED_MINUTES'
            }, null, 5000);

            // Group exceptions by attendance_id
            const exceptionsByEmployee = {};
            for (const exc of allowedMinutesExceptions) {
                if (!exceptionsByEmployee[exc.attendance_id]) {
                    exceptionsByEmployee[exc.attendance_id] = [];
                }
                exceptionsByEmployee[exc.attendance_id].push(exc);
            }

            // Process each employee's exceptions
            for (const attendanceId in exceptionsByEmployee) {
                const employee = employees.find(e => String(e.attendance_id) === String(attendanceId));
                if (!employee) continue;

                const employeeExceptions = exceptionsByEmployee[attendanceId];
                let totalMinutesToDeduct = 0;

                // For each exception, calculate actual minutes used on that day
                for (const exc of employeeExceptions) {
                    // Find analysis result for this employee
                    const empResult = results.find(r => String(r.attendance_id) === String(attendanceId));
                    if (!empResult) continue;

                    // Parse exception_offsets to find what was actually used on this date
                    let exceptionOffsets = {};
                    if (empResult.exception_offsets) {
                        try {
                            exceptionOffsets = JSON.parse(empResult.exception_offsets);
                        } catch (e) {
                            exceptionOffsets = {};
                        }
                    }

                    const dateKey = exc.date_from; // ALLOWED_MINUTES are single-day (date_from === date_to)
                    const dayOffset = exceptionOffsets[dateKey] || {};

                    // Deduct only the actual minutes used (not the full approval)
                    // dayOffset will have offset_late + offset_early that were actually matched
                    const actualUsed = (dayOffset.offset_late || 0) + (dayOffset.offset_early || 0);
                    totalMinutesToDeduct += actualUsed;
                }

                if (totalMinutesToDeduct > 0) {
                    // Get quarterly minutes record
                    // FIXED: Use hrms_id (string) and project_id for project-based, or year/quarter for calendar-based
                    // Al Maraghi Auto Repairs uses calendar quarters
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

        // Execute all updates
        await Promise.all(updates);

        // ============================================================================
        // GRACE MINUTES CARRY-FORWARD (Al Maraghi Auto Repairs only)
        // ============================================================================
        // Triggered ONLY when:
        // 1. carry_forward_grace_minutes === true (checkbox checked)
        // 2. company === 'Al Maraghi Auto Repairs'
        // 3. Project has a last_saved_report_id
        // ============================================================================
        let graceCarryForwardResults = { processed: 0, skipped: 0, already_exists: false };
        
        if (carry_forward_grace_minutes === true && (project.company === 'Al Maraghi Auto Repairs' || project.company === 'Al Maraghi Motors')) {
            console.log('[closeProject] Grace carry-forward requested for Al Maraghi Auto Repairs');
            
            // IDEMPOTENCY CHECK: Verify carry-forward hasn't already been done for this project
            const existingCarryForward = await base44.asServiceRole.entities.EmployeeGraceHistory.filter({
                source_project_id: project_id
            }, null, 10);
            
            if (existingCarryForward.length > 0) {
                console.log('[closeProject] Grace carry-forward already exists for this project, skipping');
                graceCarryForwardResults.already_exists = true;
            } else {
                // Get the report run for date range
                const reportRuns = await base44.asServiceRole.entities.ReportRun.filter({
                    id: project.last_saved_report_id
                }, null, 10);
                const reportRun = reportRuns.length > 0 ? reportRuns[0] : null;
                
                // Get attendance rules for grace minutes configuration
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
                const graceHistoryRecords = [];
                
                for (const result of results) {
                    const employee = employees.find(e => 
                        String(e.attendance_id) === String(result.attendance_id)
                    );
                    
                    if (!employee) {
                        console.warn(`[closeProject] No employee found for attendance_id: ${result.attendance_id}`);
                        graceCarryForwardResults.skipped++;
                        continue;
                    }
                    
                    // CRITICAL: Validate employee has valid IDs before processing
                    if (!employee.hrms_id || !employee.attendance_id) {
                        console.warn(`[closeProject] Employee ${employee.name} missing required IDs - skipping`);
                        graceCarryForwardResults.skipped++;
                        continue;
                    }
                    
                    // Get department-specific base grace
                    const dept = employee.department || 'Admin';
                    const baseGrace = (rules?.grace_minutes && rules.grace_minutes[dept]) 
                        ? rules.grace_minutes[dept] 
                        : 15;
                    const carriedGrace = project.use_carried_grace_minutes 
                        ? (employee.carried_grace_minutes || 0) 
                        : 0;
                    const graceMinutesAvailable = baseGrace + carriedGrace;
                    
                    // UNUSED GRACE CALCULATION: time_issues = late + early (ONLY)
                    // NO other_minutes, NO approved_minutes
                    // This is leftover grace pool, not deductible minutes
                    const lateMinutes = result.late_minutes || 0;
                    const earlyCheckoutMinutes = result.early_checkout_minutes || 0;
                    
                    const timeIssues = lateMinutes + earlyCheckoutMinutes;
                    const graceMinutesCarried = Math.max(0, graceMinutesAvailable - timeIssues);
                    
                    // Create history record - CONVERT ALL IDs TO STRINGS IMMEDIATELY
                    graceHistoryRecords.push({
                        employee_id: String(employee.hrms_id),
                        attendance_id: String(employee.attendance_id),
                        employee_name: String(employee.name || ''),
                        company: String(project.company),
                        source_project_id: String(project_id),
                        source_project_name: String(project.name || ''),
                        report_run_id: String(project.last_saved_report_id),
                        period_from: String(reportRun?.date_from || project.date_from),
                        period_to: String(reportRun?.date_to || project.date_to),
                        grace_minutes_available: Number(graceMinutesAvailable),
                        late_minutes: Number(lateMinutes),
                        early_checkout_minutes: Number(earlyCheckoutMinutes),
                        time_issues: Number(timeIssues),
                        unused_grace_minutes: Number(graceMinutesCarried),
                        carried_at: String(nowUAE),
                        carried_by: String(user.email)
                    });
                    
                    // Also update Employee.carried_grace_minutes as derived current value
                    await base44.asServiceRole.entities.Employee.update(employee.id, {
                        carried_grace_minutes: graceMinutesCarried
                    });
                    
                    graceCarryForwardResults.processed++;
                }
                
                // Bulk create history records - create one at a time to avoid bulk type issues
                if (graceHistoryRecords.length > 0) {
                    console.log(`[closeProject] Creating ${graceHistoryRecords.length} grace history records one-by-one`);

                    for (const rec of graceHistoryRecords) {
                        // Records already have strings from above, just pass directly
                        await base44.asServiceRole.entities.EmployeeGraceHistory.create(rec);
                    }

                    console.log(`[closeProject] Successfully created ${graceHistoryRecords.length} grace history records`);
                }
            }
            
            // Log audit for grace carry-forward decision
            await base44.asServiceRole.functions.invoke('logAudit', {
                action: 'GRACE_CARRY_FORWARD',
                entity_type: 'Project',
                entity_id: project_id,
                entity_name: project.name,
                company: project.company,
                details: graceCarryForwardResults.already_exists 
                    ? `Grace carry-forward skipped (already exists). Project: ${project.name}`
                    : `Grace carry-forward executed. Processed: ${graceCarryForwardResults.processed}, Skipped: ${graceCarryForwardResults.skipped}. Project: ${project.name}`,
                new_data: JSON.stringify(graceCarryForwardResults)
            });
        } else if (carry_forward_grace_minutes === true && project.company !== 'Al Maraghi Auto Repairs' && project.company !== 'Al Maraghi Motors') {
            console.log('[closeProject] Grace carry-forward requested but not enabled for this company');
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
            details: `Project closed. Quarterly minutes updated: ${updates.length}. Grace carry-forward: ${carry_forward_grace_minutes ? 'Yes' : 'No'}`
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