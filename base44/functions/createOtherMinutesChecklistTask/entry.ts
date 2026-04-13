import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse the incoming payload
        const { event } = await req.json();
        
        if (!event || !event.entity_id) {
            return Response.json({ error: 'Missing exception ID' }, { status: 400 });
        }

        const exceptionId = event.entity_id;

        // Fetch the exception details
        const exceptions = await base44.asServiceRole.entities.Exception.filter({ id: exceptionId });
        
        if (exceptions.length === 0) {
            return Response.json({ error: 'Exception not found' }, { status: 404 });
        }

        const exception = exceptions[0];

        // Only process MANUAL_OTHER_MINUTES exceptions
        if (exception.type !== 'MANUAL_OTHER_MINUTES') {
            return Response.json({ message: 'Not an other minutes exception, skipping' }, { status: 200 });
        }

        // Fetch employee details using attendance_id
        const employees = await base44.asServiceRole.entities.Employee.filter({ 
            attendance_id: exception.attendance_id 
        });

        let employeeName = exception.attendance_id;
        if (employees.length > 0) {
            employeeName = employees[0].name;
        }

        const allEmployeeOtherMinutesExceptions = await base44.asServiceRole.entities.Exception.filter({
            project_id: exception.project_id,
            attendance_id: exception.attendance_id,
            type: 'MANUAL_OTHER_MINUTES'
        });

        const sortedExceptions = allEmployeeOtherMinutesExceptions
            .sort((a, b) => a.date_from.localeCompare(b.date_from));
        
        const dateBreakdown = sortedExceptions
            .map(ex => `${ex.date_from} (${ex.other_minutes || 0} min)`)
            .join(', ');
        
        const taskDescription = `${employeeName} - ${dateBreakdown}`;

        // Find department head for the employee (if available)
        let assignedTo = null;
        if (employees.length > 0 && employees[0].department) {
            const deptHeads = await base44.asServiceRole.entities.DepartmentHead.filter({
                department: employees[0].department,
                company: employees[0].company
            });
            
            if (deptHeads.length > 0) {
                assignedTo = deptHeads[0].email;
            }
        }

        const existingTasks = await base44.asServiceRole.entities.ChecklistItem.filter({
            project_id: exception.project_id,
            task_type: 'Other Minutes'
        });
        
        const existingTask = existingTasks.find(t =>
            t.task_description && t.task_description.startsWith(employeeName + ' -')
        );

        if (existingTask) {
            await base44.asServiceRole.entities.ChecklistItem.update(existingTask.id, {
                task_description: taskDescription,
                notes: `Last updated: ${new Date().toISOString()}`
            });
        } else {
            await base44.asServiceRole.entities.ChecklistItem.create({
                project_id: exception.project_id,
                task_type: 'Other Minutes',
                task_description: taskDescription,
                status: 'pending',
                is_predefined: false,
                linked_exception_id: exceptionId,
                assigned_to: assignedTo,
                notes: `Last updated: ${new Date().toISOString()}`
            });
        }

        return Response.json({ 
            success: true, 
            message: 'Checklist task processed successfully',
            task_description: taskDescription
        });

    } catch (error) {
        console.error('Error creating checklist task:', error);
        return Response.json({ 
            error: error.message,
            details: error.stack
        }, { status: 500 });
    }
});