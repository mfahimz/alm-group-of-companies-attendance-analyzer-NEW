import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Security Audit Report Generator
 * 
 * Generates comprehensive security audit report including:
 * - All user access patterns
 * - Cross-company access attempts
 * - Failed authorization attempts
 * - Suspicious activity patterns
 * 
 * Admin only function.
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate user
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Admin only
        if (user.role !== 'admin') {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { date_from, date_to, user_email } = await req.json();

        // Build audit report
        const report = {
            generated_at: new Date().toISOString(),
            generated_by: user.email,
            period: { date_from, date_to }
        };

        // 1. User Activity Summary
        const activityLogs = await base44.asServiceRole.entities.ActivityLog.list('-created_date', 1000);
        
        let filteredLogs = activityLogs;
        if (date_from && date_to) {
            filteredLogs = activityLogs.filter(log => {
                const logDate = new Date(log.created_date);
                return logDate >= new Date(date_from) && logDate <= new Date(date_to);
            });
        }
        
        if (user_email) {
            filteredLogs = filteredLogs.filter(log => log.user_email === user_email);
        }

        report.activity_summary = {
            total_logins: filteredLogs.length,
            unique_users: [...new Set(filteredLogs.map(l => l.user_email))].length,
            by_role: {}
        };

        // Group by role
        filteredLogs.forEach(log => {
            const role = log.user_role || 'unknown';
            if (!report.activity_summary.by_role[role]) {
                report.activity_summary.by_role[role] = 0;
            }
            report.activity_summary.by_role[role]++;
        });

        // 2. Audit Log Analysis
        const auditLogs = await base44.asServiceRole.entities.AuditLog.list('-created_date', 1000);
        
        let filteredAudit = auditLogs;
        if (date_from && date_to) {
            filteredAudit = auditLogs.filter(log => {
                const logDate = new Date(log.created_date);
                return logDate >= new Date(date_from) && logDate <= new Date(date_to);
            });
        }

        report.audit_summary = {
            total_operations: filteredAudit.length,
            by_action: {},
            by_entity: {},
            failed_attempts: filteredAudit.filter(l => !l.allowed).length
        };

        // Group by action and entity
        filteredAudit.forEach(log => {
            const action = log.action || 'unknown';
            const entity = log.entity_name || 'unknown';
            
            if (!report.audit_summary.by_action[action]) {
                report.audit_summary.by_action[action] = 0;
            }
            report.audit_summary.by_action[action]++;
            
            if (!report.audit_summary.by_entity[entity]) {
                report.audit_summary.by_entity[entity] = 0;
            }
            report.audit_summary.by_entity[entity]++;
        });

        // 3. Security Concerns
        report.security_concerns = [];

        // Check for users without company assignment
        const allUsers = await base44.asServiceRole.entities.User.list();
        const usersWithoutCompany = allUsers.filter(u => 
            (u.role === 'user' || u.extended_role === 'department_head' || u.extended_role === 'hr_manager') && 
            !u.company
        );
        
        if (usersWithoutCompany.length > 0) {
            report.security_concerns.push({
                type: 'missing_company_assignment',
                severity: 'high',
                count: usersWithoutCompany.length,
                message: 'Users without company assignment can potentially access all company data',
                users: usersWithoutCompany.map(u => u.email)
            });
        }

        // Check for department heads without department
        const deptHeadsWithoutDept = allUsers.filter(u => 
            u.extended_role === 'department_head' && !u.department
        );
        
        if (deptHeadsWithoutDept.length > 0) {
            report.security_concerns.push({
                type: 'missing_department_assignment',
                severity: 'high',
                count: deptHeadsWithoutDept.length,
                message: 'Department heads without department assignment',
                users: deptHeadsWithoutDept.map(u => u.email)
            });
        }

        // Check for failed authorization attempts
        const failedAttempts = filteredAudit.filter(l => !l.allowed);
        if (failedAttempts.length > 0) {
            report.security_concerns.push({
                type: 'failed_authorization',
                severity: 'medium',
                count: failedAttempts.length,
                message: 'Failed authorization attempts detected',
                details: failedAttempts.slice(0, 10).map(a => ({
                    user: a.user_email,
                    entity: a.entity_name,
                    action: a.action,
                    timestamp: a.created_date
                }))
            });
        }

        // 4. Recommendations
        report.recommendations = [];

        if (usersWithoutCompany.length > 0) {
            report.recommendations.push({
                priority: 'high',
                action: 'Assign company to all users with role user/department_head/hr_manager',
                impact: 'Prevents potential cross-company data access'
            });
        }

        if (failedAttempts.length > 10) {
            report.recommendations.push({
                priority: 'medium',
                action: 'Review user permissions and role assignments',
                impact: 'Reduces unauthorized access attempts'
            });
        }

        report.recommendations.push({
            priority: 'low',
            action: 'Regular security audits (weekly/monthly)',
            impact: 'Proactive security monitoring'
        });

        return Response.json({
            success: true,
            report
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});