import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || (user.role !== 'admin' && user.extended_role !== 'admin')) {
            return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
        }

        // CRITICAL: Import all pages from PAGES_CONFIG to ensure accuracy
        // This list MUST match your actual pages in components/config/pagesConfig.js
        const allPages = [
            // Main Navigation
            { name: 'Home', description: 'Smart dashboard router', defaultRoles: 'admin,supervisor,user,ceo,department_head,hr_manager' },
            { name: 'Dashboard', description: 'Main dashboard with project overview', defaultRoles: 'admin,supervisor,user,ceo' },
            
            // Leadership Dashboards
            { name: 'DepartmentHeadDashboard', description: 'Department head approvals and reports', defaultRoles: 'department_head,ceo' },
            { name: 'HRManagerDashboard', description: 'HR Manager dashboard', defaultRoles: 'hr_manager' },
            
            // Projects
            { name: 'Projects', description: 'Project management and listing', defaultRoles: 'admin,supervisor,user,ceo,department_head,hr_manager' },
            { name: 'ProjectDetail', description: 'Individual project details and management', defaultRoles: 'admin,supervisor,user,ceo,department_head,hr_manager' },
            { name: 'Reports', description: 'Reports and analytics', defaultRoles: 'admin,supervisor,ceo' },
            { name: 'ReportDetail', description: 'Detailed attendance report view', defaultRoles: 'admin,supervisor,user,ceo,department_head,hr_manager' },
            
            // HR Management
            { name: 'Employees', description: 'Employee master data management', defaultRoles: 'admin,supervisor,user,ceo,department_head,hr_manager' },
            { name: 'Salaries', description: 'Employee salary management', defaultRoles: 'admin,supervisor,ceo' },
            { name: 'SalaryIncrements', description: 'Salary increment management', defaultRoles: 'admin,supervisor' },
            { name: 'QuarterlyMinutesManagement', description: 'Quarterly minutes management', defaultRoles: 'admin,ceo' },
            { name: 'GraceMinutesManagement', description: 'Grace minutes management', defaultRoles: 'admin,ceo' },
            { name: 'AnnualLeaveManagement', description: 'Annual leave calendar management', defaultRoles: 'admin,supervisor,ceo,hr_manager' },
            { name: 'RamadanSchedules', description: 'Ramadan shift schedule management', defaultRoles: 'admin,ceo' },
            
            // Admin
            { name: 'CompanyManagement', description: 'Company settings and management', defaultRoles: 'admin,ceo' },
            { name: 'Users', description: 'User management and permissions', defaultRoles: 'admin,ceo' },
            { name: 'DepartmentHeadSettings', description: 'Department head configuration', defaultRoles: 'admin,ceo' },
            { name: 'RulesSettings', description: 'Attendance rules configuration', defaultRoles: 'admin,ceo' },
            { name: 'MaintenanceSettings', description: 'System maintenance mode settings', defaultRoles: 'admin,ceo' },
            { name: 'SecurityAudit', description: 'Security and audit logs', defaultRoles: 'admin' },
            { name: 'SystemHealth', description: 'System health monitoring', defaultRoles: 'admin' },
            { name: 'SalaryDataIntegrityRepair', description: 'Salary data repair tools', defaultRoles: 'admin' },
            { name: 'MigrationTools', description: 'Data migration utilities', defaultRoles: 'admin' },
            { name: 'Documentation', description: 'System documentation', defaultRoles: 'admin,ceo' },
            { name: 'Training', description: 'Training guides and videos', defaultRoles: 'admin,ceo' },
            
            // Calendar Payroll
            { name: 'Calendar', description: 'Calendar payroll system', defaultRoles: 'admin' },
            
            // Hidden Pages (No navigation but need permissions)
            { name: 'EmployeeProfile', description: 'Employee profile details', defaultRoles: 'admin,supervisor,user,ceo,department_head,hr_manager' },
            { name: 'UserProfile', description: 'User profile settings', defaultRoles: 'admin,supervisor,user,ceo,department_head,hr_manager' },
            { name: 'Maintenance', description: 'System maintenance page', defaultRoles: 'admin,supervisor,user,ceo,department_head,hr_manager' }
        ];

        // Fetch existing permissions
        const existingPermissions = await base44.asServiceRole.entities.PagePermission.list();
        const existingMap = new Map(existingPermissions.map(p => [p.page_name, p]));
        const validPageNames = allPages.map(p => p.name);

        let created = 0;
        let updated = 0;
        let deleted = 0;
        const newPageNames = [];
        const deletedPageNames = [];
        const updatedPageNames = [];

        // Step 1: Create missing pages with default roles
        for (const page of allPages) {
            if (!existingMap.has(page.name)) {
                await base44.asServiceRole.entities.PagePermission.create({
                    page_name: page.name,
                    allowed_roles: page.defaultRoles || 'admin',
                    description: page.description
                });
                created++;
                newPageNames.push(page.name);
            }
        }

        // Step 2: Update descriptions ONLY (preserve allowed_roles)
        for (const page of allPages) {
            const existing = existingMap.get(page.name);
            if (existing && existing.description !== page.description) {
                await base44.asServiceRole.entities.PagePermission.update(existing.id, {
                    description: page.description
                    // CRITICAL: Do NOT update allowed_roles here - preserve user's custom permissions
                });
                updated++;
                updatedPageNames.push(page.name);
            }
        }

        // Step 3: Delete permissions for removed pages (ONLY if they don't exist in config)
        for (const existingPerm of existingPermissions) {
            if (!validPageNames.includes(existingPerm.page_name)) {
                await base44.asServiceRole.entities.PagePermission.delete(existingPerm.id);
                deleted++;
                deletedPageNames.push(existingPerm.page_name);
            }
        }

        return Response.json({
            success: true,
            message: `Sync completed: ${created} created, ${updated} updated, ${deleted} deleted`,
            created,
            updated,
            deleted,
            total: allPages.length,
            newPages: newPageNames,
            updatedPages: updatedPageNames,
            deletedPages: deletedPageNames
        });
    } catch (error) {
        console.error('[syncPagePermissions] Error:', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});