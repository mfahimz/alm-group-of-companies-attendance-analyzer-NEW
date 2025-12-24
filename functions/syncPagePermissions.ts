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
            { name: 'Users', description: 'User management and permissions' },
            { name: 'ActivityLogs', description: 'User activity and login logs' },
            { name: 'RulesSettings', description: 'Attendance rules configuration' },
            { name: 'RamadanSchedules', description: 'Ramadan shift schedule management' },
            { name: 'Diagnostics', description: 'System diagnostics and troubleshooting' },
            { name: 'Documentation', description: 'User guides and documentation' },
            { name: 'UserProfile', description: 'User profile settings' },
            { name: 'ReportDetail', description: 'Detailed attendance report view' },
            { name: 'AstraImport', description: 'Astra Auto Parts data import' },
            { name: 'Home', description: 'Application home page' }
        ];

        // Fetch existing permissions
        const existingPermissions = await base44.asServiceRole.entities.PagePermission.list();
        const existingPageNames = existingPermissions.map(p => p.page_name);

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
            const pageInfo = allPages.find(p => p.page_name === existingPerm.page_name);
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
            total: existingPermissions.length + created.length,
            newPages: created.map(p => p.page_name)
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});