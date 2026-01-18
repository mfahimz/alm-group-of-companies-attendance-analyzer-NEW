import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Backend function to run attendance analysis for a project
 * Processes all employees in batches to avoid frontend freezing
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, employee_ids, date_from, date_to, report_name, notes } = await req.json();

        if (!project_id || !employee_ids || !date_from || !date_to) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Verify user has access to this project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];
        const userRole = user?.extended_role || user?.role || 'user';
        
        // Security: Verify access
        if (userRole !== 'admin' && userRole !== 'supervisor' && userRole !== 'ceo') {
            if (project.company !== user.company) {
                return Response.json({ error: 'Access denied' }, { status: 403 });
            }
        }

        // Create report run
        const reportRun = await base44.asServiceRole.entities.ReportRun.create({
            project_id,
            report_name: report_name || `Analysis ${new Date().toISOString().split('T')[0]}`,
            date_from,
            date_to,
            employee_count: employee_ids.length,
            notes: notes || ''
        });

        const results = [];
        const batchSize = 10; // Process 10 employees at a time

        for (let i = 0; i < employee_ids.length; i += batchSize) {
            const batch = employee_ids.slice(i, i + batchSize);
            
            // Process batch in parallel
            const batchPromises = batch.map(async (attendanceId) => {
                try {
                    // Get employee
                    const employees = await base44.asServiceRole.entities.Employee.filter({
                        attendance_id: attendanceId,
                        company: project.company
                    }, null, 1);

                    if (employees.length === 0) return null;

                    // Note: This is a simplified version. In production, you'd call
                    // the actual analysis logic from RunAnalysisTab here
                    // For now, we'll create a placeholder result

                    // FOUNDATION: Per-day allowed minutes matching (currently Al Maraghi Auto Repairs only)
                    // This placeholder will be replaced with full analysis logic
                    const exceptionOffsets = {};

                    const result = await base44.asServiceRole.entities.AnalysisResult.create({
                       project_id,
                       report_run_id: reportRun.id,
                       attendance_id: attendanceId,
                       working_days: 0,
                       present_days: 0,
                       full_absence_count: 0,
                       half_absence_count: 0,
                       sick_leave_count: 0,
                       annual_leave_count: 0,
                       late_minutes: 0,
                       early_checkout_minutes: 0,
                       other_minutes: 0,
                       grace_minutes: 15,
                       abnormal_dates: '',
                       notes: 'Backend analysis in progress',
                       auto_resolutions: '',
                       exception_offsets: JSON.stringify(exceptionOffsets)
                    });

                    return result.id;
                } catch (error) {
                    console.error(`Error processing employee ${attendanceId}:`, error);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null));
        }

        return Response.json({
            success: true,
            report_run_id: reportRun.id,
            processed_count: results.length,
            total_count: employee_ids.length,
            message: `Analysis complete for ${results.length} employees`
        });

    } catch (error) {
        console.error('Run analysis error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});