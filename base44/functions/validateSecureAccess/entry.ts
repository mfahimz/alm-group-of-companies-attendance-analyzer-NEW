import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Security Validation Middleware for Database Access
 * 
 * This function validates that users can only access data they're authorized to see.
 * Enforces company-level data isolation and role-based access control.
 * 
 * Usage:
 * const access = await validateSecureAccess(req, 'Employee', 'read', { company: 'Al Maraghi' });
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { entity_name, operation, filters = {} } = await req.json();

        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({
                allowed: false,
                error: 'Authentication required'
            }, { status: 401 });
        }

        const userRole = user.extended_role || user.role || 'user';
        
        // Define security rules per entity
        const securityRules = {
            // Employee data - company scoped
            'Employee': {
                create: ['admin', 'supervisor'],
                read: ['admin', 'supervisor', 'ceo', 'user', 'department_head', 'hr_manager'],
                update: ['admin', 'supervisor'],
                delete: ['admin'],
                companyScoped: true,
                departmentScoped: ['department_head']
            },
            
            // Salary data - highly restricted
            'EmployeeSalary': {
                create: ['admin'],
                read: ['admin', 'ceo'],
                update: ['admin'],
                delete: ['admin'],
                companyScoped: true,
                departmentScoped: false
            },
            
            // Project data - company scoped
            'Project': {
                create: ['admin', 'supervisor'],
                read: ['admin', 'supervisor', 'ceo', 'user', 'hr_manager'],
                update: ['admin', 'supervisor'],
                delete: ['admin'],
                companyScoped: true,
                departmentScoped: false
            },

            // Punch data - company scoped (via project)
            'Punch': {
                create: ['admin', 'supervisor'],
                read: ['admin', 'supervisor', 'ceo', 'user', 'hr_manager'],
                update: ['admin', 'supervisor'],
                delete: ['admin', 'supervisor'],
                companyScoped: false, // Scoped via project_id
                departmentScoped: false
            },
            
            // Analysis results - company scoped
            'AnalysisResult': {
                create: ['admin', 'supervisor'],
                read: ['admin', 'supervisor', 'ceo', 'user', 'department_head', 'hr_manager'],
                update: ['admin', 'supervisor'],
                delete: ['admin', 'supervisor'],
                companyScoped: false, // Scoped via project_id
                departmentScoped: false
            },
            
            // Exception data - company scoped
            'Exception': {
                create: ['admin', 'supervisor', 'department_head'],
                read: ['admin', 'supervisor', 'ceo', 'user', 'department_head', 'hr_manager'],
                update: ['admin', 'supervisor'],
                delete: ['admin', 'supervisor'],
                companyScoped: false, // Scoped via project_id
                departmentScoped: false
            },
            
            // System settings - admin only
            'SystemSettings': {
                create: ['admin'],
                read: ['admin'],
                update: ['admin'],
                delete: ['admin'],
                companyScoped: false,
                departmentScoped: false
            },
            
            // Page permissions - admin/ceo only
            'PagePermission': {
                create: ['admin', 'ceo'],
                read: ['admin', 'ceo'],
                update: ['admin', 'ceo'],
                delete: ['admin', 'ceo'],
                companyScoped: false,
                departmentScoped: false
            },
            
            // Department heads - restricted
            'DepartmentHead': {
                create: ['admin', 'ceo'],
                read: ['admin', 'ceo', 'supervisor', 'hr_manager'],
                update: ['admin', 'ceo'],
                delete: ['admin', 'ceo'],
                companyScoped: true,
                departmentScoped: false
            },
            
            // Quarterly minutes - company scoped
            'EmployeeQuarterlyMinutes': {
                create: ['admin', 'supervisor'],
                read: ['admin', 'supervisor', 'ceo', 'department_head', 'hr_manager'],
                update: ['admin', 'supervisor', 'department_head'],
                delete: ['admin'],
                companyScoped: true,
                departmentScoped: false
            },
            
            // Ramadan Schedules
            'RamadanSchedule': {
                create: ['admin', 'ceo', 'hr_manager'],
                read: ['admin', 'supervisor', 'ceo', 'user', 'hr_manager'],
                update: ['admin', 'ceo', 'hr_manager'],
                delete: ['admin'],
                companyScoped: true,
                departmentScoped: false
            },

            // Annual Leaves
            'AnnualLeave': {
                create: ['admin', 'supervisor', 'ceo', 'hr_manager'],
                read: ['admin', 'supervisor', 'ceo', 'user', 'department_head', 'hr_manager'],
                update: ['admin', 'supervisor', 'ceo', 'hr_manager'],
                delete: ['admin'],
                companyScoped: true,
                departmentScoped: false
            },

            // User entity - special rules
            'User': {
                create: ['admin', 'ceo'],
                read: ['admin', 'ceo'],
                update: ['admin', 'ceo'],
                delete: ['admin', 'ceo'],
                companyScoped: false, // Users managed globally
                departmentScoped: false
            }
        };

        // Get rules for entity
        const rules = securityRules[entity_name];
        if (!rules) {
            return Response.json({
                allowed: true, // No restrictions defined, allow by default
                warning: `No security rules defined for entity: ${entity_name}`
            });
        }

        // Check operation permission
        const allowedRoles = rules[operation];
        if (!allowedRoles || !allowedRoles.includes(userRole)) {
            return Response.json({
                allowed: false,
                error: `Role '${userRole}' not authorized for ${operation} on ${entity_name}`,
                required_roles: allowedRoles
            }, { status: 403 });
        }

        // Check company scoping
        if (rules.companyScoped && (userRole === 'user' || userRole === 'department_head' || userRole === 'hr_manager')) {
            if (!user.company) {
                return Response.json({
                    allowed: false,
                    error: 'User must be assigned to a company'
                }, { status: 403 });
            }

            // Enforce company filter
            if (!filters.company || filters.company !== user.company) {
                return Response.json({
                    allowed: false,
                    error: 'Company filter required and must match user company',
                    enforced_filter: { company: user.company }
                }, { status: 403 });
            }
        }

        // Check department scoping (for department heads)
        if (rules.departmentScoped && rules.departmentScoped.includes(userRole)) {
            if (!user.department) {
                return Response.json({
                    allowed: false,
                    error: 'Department head must be assigned to a department'
                }, { status: 403 });
            }

            // Enforce department filter
            if (!filters.department || filters.department !== user.department) {
                return Response.json({
                    allowed: false,
                    error: 'Department filter required and must match user department',
                    enforced_filter: { department: user.department }
                }, { status: 403 });
            }
        }

        // Log access for audit trail
        try {
            await base44.asServiceRole.entities.AuditLog.create({
                user_email: user.email,
                user_role: userRole,
                action: operation,
                entity_name: entity_name,
                filters: JSON.stringify(filters),
                allowed: true,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('Failed to create audit log:', error);
        }

        return Response.json({
            allowed: true,
            user_role: userRole,
            company_filter: rules.companyScoped ? user.company : null,
            department_filter: rules.departmentScoped?.includes(userRole) ? user.department : null
        });

    } catch (error) {
        return Response.json({
            allowed: false,
            error: error.message
        }, { status: 500 });
    }
});