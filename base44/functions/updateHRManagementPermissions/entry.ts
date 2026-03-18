import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin only' }, { status: 403 });
        }

        const results = [];

        // Update or create Employees permission
        const employeesPermission = await base44.asServiceRole.entities.PagePermission.filter({
            page_name: 'Employees'
        });
        
        if (employeesPermission.length > 0) {
            await base44.asServiceRole.entities.PagePermission.update(employeesPermission[0].id, {
                allowed_roles: 'admin,supervisor,user,ceo,department_head,hr_manager',
                description: 'Employee management - view and manage employee records'
            });
            results.push({ page: 'Employees', action: 'updated' });
        } else {
            await base44.asServiceRole.entities.PagePermission.create({
                page_name: 'Employees',
                allowed_roles: 'admin,supervisor,user,ceo,department_head,hr_manager',
                description: 'Employee management - view and manage employee records'
            });
            results.push({ page: 'Employees', action: 'created' });
        }

        // Update or create Salaries permission
        const salariesPermission = await base44.asServiceRole.entities.PagePermission.filter({
            page_name: 'Salaries'
        });
        
        if (salariesPermission.length > 0) {
            await base44.asServiceRole.entities.PagePermission.update(salariesPermission[0].id, {
                allowed_roles: 'admin,supervisor,ceo',
                description: 'Salary management - configure and view employee salaries'
            });
            results.push({ page: 'Salaries', action: 'updated' });
        } else {
            await base44.asServiceRole.entities.PagePermission.create({
                page_name: 'Salaries',
                allowed_roles: 'admin,supervisor,ceo',
                description: 'Salary management - configure and view employee salaries'
            });
            results.push({ page: 'Salaries', action: 'created' });
        }

        // Update or create QuarterlyMinutesManagement permission
        const quarterlyPermission = await base44.asServiceRole.entities.PagePermission.filter({
            page_name: 'QuarterlyMinutesManagement'
        });
        
        if (quarterlyPermission.length > 0) {
            await base44.asServiceRole.entities.PagePermission.update(quarterlyPermission[0].id, {
                allowed_roles: 'admin,ceo',
                description: 'Quarterly minutes management - manage employee quarterly minute allowances'
            });
            results.push({ page: 'QuarterlyMinutesManagement', action: 'updated' });
        } else {
            await base44.asServiceRole.entities.PagePermission.create({
                page_name: 'QuarterlyMinutesManagement',
                allowed_roles: 'admin,ceo',
                description: 'Quarterly minutes management - manage employee quarterly minute allowances'
            });
            results.push({ page: 'QuarterlyMinutesManagement', action: 'created' });
        }

        return Response.json({ 
            success: true,
            message: 'HR Management permissions updated successfully',
            results
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});