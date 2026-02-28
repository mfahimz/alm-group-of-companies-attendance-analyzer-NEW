import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // SECURITY: Only admin or CEO can save salary edits
        const userRole = user?.extended_role || user?.role || 'user';
        if (userRole !== 'admin' && userRole !== 'ceo') {
            return Response.json({ error: 'Access denied: Admin or CEO role required' }, { status: 403 });
        }

        const { project_id, report_run_id, edits } = await req.json();

        if (!project_id || !report_run_id || !edits || typeof edits !== 'object') {
            return Response.json({ 
                error: 'project_id, report_run_id, and edits object are required' 
            }, { status: 400 });
        }

        // Fetch project to check payroll mode
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, null, 1);
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        const project = projects[0];



        // Fetch current snapshots
        const snapshots = await base44.asServiceRole.entities.SalarySnapshot.filter({
            project_id: project_id,
            report_run_id: report_run_id
        });

        if (snapshots.length === 0) {
            return Response.json({ error: 'No salary snapshots found for this report' }, { status: 404 });
        }

        // Update each snapshot with editable fields
        const updatePromises = snapshots.map(snapshot => {
            const hrmsId = snapshot.hrms_id;
            const employeeEdits = edits[hrmsId];

            if (!employeeEdits) {
                return Promise.resolve(null);
            }

            // Only allow specific editable fields
            const updateData = {};
            
            if ('normalOtHours' in employeeEdits) {
                updateData.normalOtHours = employeeEdits.normalOtHours;
            }
            if ('specialOtHours' in employeeEdits) {
                updateData.specialOtHours = employeeEdits.specialOtHours;
            }
            if ('bonus' in employeeEdits) {
                updateData.bonus = employeeEdits.bonus;
            }
            if ('incentive' in employeeEdits) {
                updateData.incentive = employeeEdits.incentive;
            }
            if ('open_leave_salary' in employeeEdits) {
                updateData.open_leave_salary = Math.max(0, Number(employeeEdits.open_leave_salary) || 0);
            }
            if ('variable_salary' in employeeEdits) {
                updateData.variable_salary = Math.max(0, Number(employeeEdits.variable_salary) || 0);
            }
            if ('otherDeduction' in employeeEdits) {
                updateData.otherDeduction = employeeEdits.otherDeduction;
            }
            if ('advanceSalaryDeduction' in employeeEdits) {
                updateData.advanceSalaryDeduction = employeeEdits.advanceSalaryDeduction;
            }

            if (Object.keys(updateData).length === 0) {
                return Promise.resolve(null);
            }

            // Recalculate OT salaries if OT hours changed
            const divisor = 30; // Default divisor, could be fetched from project
            if ('normalOtHours' in updateData || 'specialOtHours' in updateData) {
                const totalSalary = snapshot.total_salary;
                const workingHours = snapshot.working_hours;
                const hourlyRate = totalSalary / divisor / workingHours;

                if ('normalOtHours' in updateData) {
                    const normalOtRate = hourlyRate * 1.25;
                    updateData.normalOtSalary = Math.round(normalOtRate * updateData.normalOtHours * 100) / 100;
                }
                if ('specialOtHours' in updateData) {
                    const specialOtRate = hourlyRate * 1.5;
                    updateData.specialOtSalary = Math.round(specialOtRate * updateData.specialOtHours * 100) / 100;
                }

                // Recalculate total OT salary
                const normalOtSalary = updateData.normalOtSalary ?? snapshot.normalOtSalary ?? 0;
                const specialOtSalary = updateData.specialOtSalary ?? snapshot.specialOtSalary ?? 0;
                updateData.totalOtSalary = Math.round((normalOtSalary + specialOtSalary) * 100) / 100;

                // Recalculate total salary payable
                const finalTotal = snapshot.total_salary + updateData.totalOtSalary
                                   + (updateData.bonus ?? snapshot.bonus ?? 0)
                                   + (updateData.incentive ?? snapshot.incentive ?? 0)
                                   + (updateData.open_leave_salary ?? snapshot.open_leave_salary ?? 0)
                                   + (updateData.variable_salary ?? snapshot.variable_salary ?? 0)
                                   - snapshot.netDeduction
                                   - snapshot.deductibleHoursPay
                                   - (updateData.otherDeduction ?? snapshot.otherDeduction ?? 0)
                                   - (updateData.advanceSalaryDeduction ?? snapshot.advanceSalaryDeduction ?? 0);
                
                updateData.total = Math.round(finalTotal * 100) / 100;
                updateData.wpsPay = Math.round(finalTotal * 100) / 100;
            } else {
                // Recalculate total without OT changes
                const totalOtSalary = snapshot.totalOtSalary ?? 0;
                const finalTotal = snapshot.total_salary + totalOtSalary
                                   + (updateData.bonus ?? snapshot.bonus ?? 0)
                                   + (updateData.incentive ?? snapshot.incentive ?? 0)
                                   + (updateData.open_leave_salary ?? snapshot.open_leave_salary ?? 0)
                                   + (updateData.variable_salary ?? snapshot.variable_salary ?? 0)
                                   - snapshot.netDeduction
                                   - snapshot.deductibleHoursPay
                                   - (updateData.otherDeduction ?? snapshot.otherDeduction ?? 0)
                                   - (updateData.advanceSalaryDeduction ?? snapshot.advanceSalaryDeduction ?? 0);
                
                updateData.total = Math.round(finalTotal * 100) / 100;
                updateData.wpsPay = Math.round(finalTotal * 100) / 100;
            }

            return base44.asServiceRole.entities.SalarySnapshot.update(snapshot.id, updateData);
        });

        const results = await Promise.all(updatePromises);
        const updatedCount = results.filter(r => r !== null).length;

        // Log audit
        await base44.functions.invoke('logAudit', {
            action: 'SAVE_SALARY_EDITS',
            entity_type: 'SalarySnapshot',
            entity_id: report_run_id,
            details: `Saved editable salary values for ${updatedCount} employees in report ${report_run_id}`
        });

        return Response.json({
            success: true,
            updated_count: updatedCount,
            message: `Saved editable values for ${updatedCount} employees`
        });

    } catch (error) {
        console.error('Save salary edits error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});