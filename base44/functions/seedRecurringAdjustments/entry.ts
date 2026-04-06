import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * seedRecurringAdjustments
 * 
 * This function fetches active RecurringAdjustment records for a project's company
 * during the project period and writes them into the OvertimeData records.
 * 
 * Logic:
 * 1. Fetch project to get company, dates, and employee scope.
 * 2. Fetch all active RecurringAdjustment for that company.
 * 3. Fetch eligible employees.
 * 4. Fetch existing OvertimeData for the project.
 * 5. For each employee:
 *    - Resolve active recurring adjustments for that period.
 *    - Update/Create OvertimeData with these adjustments as JSON entries.
 *    - ENSURE IDEMPOTENCY: Filter out existing recurring entries (by source field or legacy desc suffix) before re-adding.
 *    - SEED-ONCE: If a user deleted a seeded entry, do not re-add it on subsequent seed runs.
 *    - Each seeded entry carries { source: "recurring", recurring_id: ra.id } for traceability.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { projectId } = await req.json();

        if (!projectId) {
            return Response.json({ error: 'projectId is required' }, { status: 400 });
        }

        // 1. Fetch Project
        const project = await base44.asServiceRole.entities.Project.get(projectId);
        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const companyName = project.company;
        const projectStart = project.date_from;
        const projectEnd = project.date_to;

        // 2. Fetch Active Recurring Adjustments for this company
        // We filter by company and is_active=true. Date filtering happens in-memory for precision.
        const recurringAdjustments = await base44.asServiceRole.entities.RecurringAdjustment.filter({
            company: companyName,
            is_active: true
        });

        // 3. Fetch Eligible Employees
        let employees = await base44.asServiceRole.entities.Employee.filter({
            company: companyName,
            active: true
        });

        if (project.custom_employee_ids) {
            const customIds = project.custom_employee_ids.split(',').map((id: string) => id.trim()).filter((id: string) => id);
            employees = employees.filter((emp: any) => 
                customIds.includes(String(emp.hrms_id)) || customIds.includes(String(emp.attendance_id))
            );
        }

        // 4. Fetch Existing OvertimeData
        const existingOT = await base44.asServiceRole.entities.OvertimeData.filter({
            project_id: projectId
        });

        // Mapping: Category -> OvertimeData Field
        const categoryToField: Record<string, string> = {
            'bonus': 'bonus',
            'incentive': 'incentive',
            'allowance': 'incentive',
            'advance_salary': 'advanceSalaryDeduction',
            'advanceSalaryDeduction': 'advanceSalaryDeduction',
            'other_deduction': 'otherDeduction',
            'otherDeduction': 'otherDeduction',
            'open_leave_salary': 'open_leave_salary',
            'variable_salary': 'variable_salary'
        };

        const targetFields = ['bonus', 'incentive', 'otherDeduction', 'advanceSalaryDeduction', 'open_leave_salary', 'variable_salary'];

        // Helper to resolve adjustments for an employee
        const getAdjustmentsForEmployee = (empHrmsId: string, empAttendanceId: string) => {
            return recurringAdjustments.filter((ra: any) => {
                const isEmployee = String(ra.employee_id) === String(empHrmsId) || String(ra.employee_id) === String(empAttendanceId);
                if (!isEmployee) return false;

                // Period check: Starts before project ends AND (never ends OR ends after project starts)
                const isActiveInPeriod = ra.start_date <= projectEnd && (!ra.end_date || ra.end_date >= projectStart);
                return isActiveInPeriod;
            });
        };

        const processedCount = {
            updated: 0,
            created: 0,
            skipped: 0
        };

        // 5. Upsert OvertimeData
        // We'll prepare a list of promises to execute in parallel
        const upsertPromises = employees.map(async (emp: any) => {
            const empAdjustments = getAdjustmentsForEmployee(emp.hrms_id, emp.attendance_id);
            if (empAdjustments.length === 0 && !existingOT.find((ot: any) => String(ot.attendance_id) === String(emp.attendance_id))) {
                processedCount.skipped++;
                return;
            }

            const otRecord = existingOT.find((ot: any) => 
                (emp.attendance_id && String(ot.attendance_id) === String(emp.attendance_id)) || 
                String(ot.hrms_id) === String(emp.hrms_id)
            );

            const payload: any = {
                project_id: projectId,
                attendance_id: emp.attendance_id ? String(emp.attendance_id) : null,
                hrms_id: String(emp.hrms_id),
                name: emp.name,
                department: emp.department
            };

            // Map recurring adjustments to fields
            // isNewRecord: true when no existing OvertimeData row exists for this employee/project.
            const isNewRecord = !otRecord;

            targetFields.forEach(field => {
                // Get existing entries from record
                let entries: any[] = [];
                const dbValue = otRecord?.[field];

                if (dbValue) {
                    if (Array.isArray(dbValue)) {
                        entries = dbValue;
                    } else if (typeof dbValue === 'string' && (dbValue.trim().startsWith('[') || dbValue.trim().startsWith('{'))) {
                        try {
                            const parsed = JSON.parse(dbValue);
                            entries = Array.isArray(parsed) ? parsed : [{ amount: parseFloat(dbValue) || 0, desc: '' }];
                        } catch {
                            entries = [{ amount: parseFloat(dbValue) || 0, desc: '' }];
                        }
                    } else {
                        const num = parseFloat(dbValue);
                        if (!isNaN(num) && num !== 0) entries = [{ amount: num, desc: '' }];
                    }
                }

                // SEED-ONCE LOGIC:
                // Before stripping, collect recurring_ids that are currently present.
                // If the record already existed and a recurring_id is NOT in this set,
                // it means the user previously deleted that seeded entry — do not re-add it.
                const previousRecurringIds = new Set(
                    entries
                        .filter((e: any) => e.source === 'recurring' && e.recurring_id)
                        .map((e: any) => e.recurring_id)
                );

                // IDEMPOTENCY: Strip existing recurring entries (by source field or legacy desc suffix).
                // This removes all current seeded entries so they can be re-added with fresh master data.
                entries = entries.filter((e: any) =>
                    e.source !== 'recurring' && !(e.desc && e.desc.includes('(Recurring)'))
                );

                // Add new recurring entries for this field
                const recurringForField = empAdjustments.filter((ra: any) => categoryToField[ra.category] === field);

                recurringForField.forEach((ra: any) => {
                    // SEED-ONCE: For existing records, only re-add entries that were previously present.
                    // If the record existed and this recurring_id was NOT in the previous set,
                    // the user deleted it — respect that deletion and skip.
                    // For brand-new OvertimeData records, always seed all applicable rules.
                    if (!isNewRecord && !previousRecurringIds.has(ra.id)) {
                        return; // User deleted this entry; respect the deletion
                    }

                    entries.push({
                        amount: ra.amount,
                        desc: `${ra.label || ra.description || ra.category} (Recurring)`,
                        source: 'recurring',
                        recurring_id: ra.id
                    });
                });

                // Finalize field value: Only store as JSON if there's more than one entry or a description is present
                // This maintains compatibility with OvertimeTab expectations.
                if (entries.length > 0) {
                    payload[field] = JSON.stringify(entries);
                } else {
                    payload[field] = "0";
                }
            });

            if (otRecord) {
                await base44.asServiceRole.entities.OvertimeData.update(otRecord.id, payload);
                processedCount.updated++;
            } else {
                await base44.asServiceRole.entities.OvertimeData.create(payload);
                processedCount.created++;
            }
        });

        await Promise.all(upsertPromises);

        return Response.json({ 
            success: true, 
            projectId,
            summary: processedCount
        });

    } catch (error) {
        console.error('[seedRecurringAdjustments] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});