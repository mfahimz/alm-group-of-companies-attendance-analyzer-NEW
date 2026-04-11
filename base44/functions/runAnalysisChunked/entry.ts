import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * CHUNKED ANALYSIS - Process employees in smaller batches to avoid timeout
 * This function processes a subset of employees and can be called multiple times
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { 
            project_id, 
            date_from, 
            date_to, 
            report_name, 
            chunk_offset = 0,
            chunk_size = 50,
            _existing_report_run_id 
        } = await req.json();

        if (!project_id || !date_from || !date_to) {
            return Response.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        // Fetch project
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];

        // Get or create report run
        let reportRun;
        if (_existing_report_run_id) {
            const existingRuns = await base44.asServiceRole.entities.ReportRun.filter({ id: _existing_report_run_id });
            if (existingRuns.length > 0) {
                reportRun = existingRuns[0];
            }
        }

        if (!reportRun) {
            // First chunk - create report run
            const allEmployees = await base44.asServiceRole.entities.Employee.filter({ 
                company: project.company, 
                active: true 
            });
            
            let filteredEmployees = allEmployees;
            if (project.custom_employee_ids && project.custom_employee_ids.trim() !== '') {
                const customHrmsIds = project.custom_employee_ids
                    .split(',')
                    .map(id => id.trim())
                    .filter(id => id && id !== 'NULL');
                
                filteredEmployees = allEmployees.filter(e => 
                    customHrmsIds.includes(String(e.hrms_id))
                );
            }
            
            const activeEmployeeAttendanceIds = filteredEmployees
                .filter(e => e.attendance_id && String(e.attendance_id).trim() !== '')
                .map(e => String(e.attendance_id));
            
            const projectEmployees = await base44.asServiceRole.entities.ProjectEmployee.filter({ project_id });
            const projectEmployeeIds = projectEmployees
                .filter(pe => pe.attendance_id && String(pe.attendance_id).trim() !== '')
                .map(pe => String(pe.attendance_id));
            
            const uniqueEmployeeIds = [...new Set([...activeEmployeeAttendanceIds, ...projectEmployeeIds])];
            
            reportRun = await base44.asServiceRole.entities.ReportRun.create({
                project_id,
                report_name: report_name || `Report - ${new Date().toLocaleDateString()}`,
                date_from,
                date_to,
                employee_count: uniqueEmployeeIds.length
            });
        }

        // Call the main runAnalysis function with chunk parameters
        const analysisResponse = await base44.functions.invoke('runAnalysis', {
            project_id,
            date_from,
            date_to,
            report_name,
            _existing_report_run_id: reportRun.id,
            _chunk_offset: chunk_offset,
            _chunk_size: chunk_size
        });

        return Response.json({
            success: true,
            report_run_id: reportRun.id,
            chunk_offset,
            chunk_size,
            ...analysisResponse.data
        });

    } catch (error) {
        console.error('[runAnalysisChunked] Error:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});