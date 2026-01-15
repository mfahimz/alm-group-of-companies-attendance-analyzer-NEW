import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Define all pages in the application
        const allPages = [
            { name: 'Dashboard', description: 'Main dashboard with project overview' },
            { name: 'Projects', description: 'Project management and listing' },
            { name: 'ProjectDetail', description: 'Individual project details and management' },
            { name: 'Employees', description: 'Employee master data management' },
            { name: 'Salaries', description: 'Employee salary management' },
            { name: 'Users', description: 'User management and permissions' },
            { name: 'RulesSettings', description: 'Attendance rules configuration' },
            { name: 'RamadanSchedules', description: 'Ramadan shift schedule management' },
            { name: 'Documentation', description: 'User guides and documentation' },
            { name: 'Training', description: 'Training guides and videos' },
            { name: 'UserProfile', description: 'User profile settings' },
            { name: 'EmployeeProfile', description: 'Employee profile details' },
            { name: 'ReportDetail', description: 'Detailed attendance report view' },
            { name: 'Reports', description: 'Reports and analytics' },
            { name: 'DepartmentHeadSettings', description: 'Department head configuration' }
        ];

        // Fetch existing permissions
        const existingPermissions = await base44.asServiceRole.entities.PagePermission.list();
        const existingPageNames = existingPermissions.map(p => p.page_name);
        const validPageNames = allPages.map(p => p.name);

        // Delete permissions for pages that no longer exist
        const deleted = [];
        for (const existingPerm of existingPermissions) {
            if (!validPageNames.includes(existingPerm.page_name)) {
                await base44.asServiceRole.entities.PagePermission.delete(existingPerm.id);
                deleted.push(existingPerm.page_name);
            }
        }

        // Find pages that don't have permissions yet
        const newPages = allPages.filter(page => !existingPageNames.includes(page.name));

        // Create permissions for new pages with default access (admin only)
        const created = [];
        for (const page of newPages) {
            const permission = await base44.asServiceRole.entities.PagePermission.create({
                page_name: page.name,
                allowed_roles: 'admin',
                description: page.description
            });
            created.push(permission);
        }

        // Update descriptions for existing pages
        const updated = [];
        for (const existingPerm of existingPermissions) {
            if (!validPageNames.includes(existingPerm.page_name)) continue; // Skip deleted pages
            const pageInfo = allPages.find(p => p.name === existingPerm.page_name);
            if (pageInfo && existingPerm.description !== pageInfo.description) {
                const updatedPerm = await base44.asServiceRole.entities.PagePermission.update(existingPerm.id, {
                    description: pageInfo.description
                });
                updated.push(updatedPerm);
            }
        }

        return Response.json({
            success: true,
            created: created.length,
            updated: updated.length,
            deleted: deleted.length,
            total: allPages.length,
            newPages: created.map(p => p.page_name),
            deletedPages: deleted
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});