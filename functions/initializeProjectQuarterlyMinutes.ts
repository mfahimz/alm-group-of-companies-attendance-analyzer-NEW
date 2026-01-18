import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Helper to calculate quarters spanned by a project
function calculateQuartersInProject(dateFrom, dateTo) {
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    
    const startQuarter = Math.floor(start.getMonth() / 3) + 1;
    const endQuarter = Math.floor(end.getMonth() / 3) + 1;
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    
    // Calculate total quarters spanned
    let totalQuarters = 0;
    if (startYear === endYear) {
        totalQuarters = endQuarter - startQuarter + 1;
    } else {
        totalQuarters = (4 - startQuarter + 1) + ((endYear - startYear - 1) * 4) + endQuarter;
    }
    
    return totalQuarters;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Parse request body
        const { project_id } = await req.json();
        
        if (!project_id) {
            return Response.json({ error: 'project_id is required' }, { status: 400 });
        }
        
        // Get project details
        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
        if (projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        
        const project = projects[0];
        
        // Only initialize for Al Maraghi Auto Repairs
        if (project.company !== "Al Maraghi Auto Repairs") {
            return Response.json({ 
                success: true, 
                message: 'Project-based quarterly minutes only enabled for Al Maraghi Auto Repairs',
                initialized: 0
            });
        }
        
        console.log(`Initializing project quarterly minutes for project: ${project.name}`);
        
        // Calculate total minutes based on project duration
        const quartersSpanned = calculateQuartersInProject(project.date_from, project.date_to);
        const totalMinutesForProject = 120; // Always 120 min per employee per project period
        
        console.log(`Project spans ${quartersSpanned} quarter(s), allocating 120 minutes per employee`);
        
        // Get all employees for this project
        let employees = [];
        if (project.custom_employee_ids) {
            // Custom employee selection
            const hrmsIds = project.custom_employee_ids.split(',').map(id => id.trim());
            for (const hrmsId of hrmsIds) {
                const emp = await base44.asServiceRole.entities.Employee.filter({ 
                    hrms_id: hrmsId,
                    company: project.company 
                });
                if (emp.length > 0) employees.push(emp[0]);
            }
        } else if (project.department) {
            // Department-based selection
            employees = await base44.asServiceRole.entities.Employee.filter({
                company: project.company,
                department: project.department,
                active: true
            });
        } else {
            // All employees in company
            employees = await base44.asServiceRole.entities.Employee.filter({
                company: project.company,
                active: true
            });
        }
        
        console.log(`Found ${employees.length} employees for project`);
        
        let initialized = 0;
        let alreadyExists = 0;
        
        for (const employee of employees) {
            // Check if already initialized
            const existing = await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.filter({
                employee_id: employee.hrms_id,
                project_id: project_id,
                company: project.company,
                allocation_type: 'project_period'
            });
            
            if (existing.length === 0) {
                // Store as number for consistency
                const employeeIdNum = Number(employee.hrms_id);
                
                await base44.asServiceRole.entities.EmployeeQuarterlyMinutes.create({
                    employee_id: employeeIdNum,
                    project_id: project_id,
                    company: project.company,
                    allocation_type: 'project_period',
                    total_minutes: 120,
                    used_minutes: 0,
                    remaining_minutes: 120
                });
                initialized++;
            } else {
                alreadyExists++;
            }
        }
        
        // Log the initialization
        await base44.asServiceRole.functions.invoke('logAudit', {
            action: 'INITIALIZE_PROJECT_MINUTES',
            entity_type: 'EmployeeQuarterlyMinutes',
            entity_id: project_id,
            entity_name: project.name,
            details: `Initialized project-based quarterly minutes for ${initialized} employees. Total allocation: ${totalMinutesForProject} minutes (${quartersSpanned} quarters)`,
            user_email: 'system@automation',
            user_name: 'System Automation',
            user_role: 'system',
            company: project.company,
            success: true
        });
        
        return Response.json({
            success: true,
            message: `Initialized quarterly minutes for project: ${project.name}`,
            stats: {
                project_id: project_id,
                project_name: project.name,
                company: project.company,
                quarters_spanned: quartersSpanned,
                total_minutes_per_employee: totalMinutesForProject,
                employees_processed: employees.length,
                initialized: initialized,
                already_exists: alreadyExists
            }
        });
        
    } catch (error) {
        console.error('Initialize project quarterly minutes error:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
});