import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getPageConfig } from '../config/pagesConfig';

/**
 * usePermissions Hook
 * 
 * Manages user authentication, role, and page-level permissions
 * 
 * Returns:
 * - user: Current user object
 * - isLoading: Loading state
 * - error: Error state
 * - hasPermission: Check if user has specific permission
 * - canAccessPage: Check if user can access a page
 * - isRestrictedToOwnDepartment: If user is restricted to their department
 */
export const usePermissions = () => {
    // Fetch current user
    const { data: user, isLoading: userLoading, error: userError } = useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => {
            try {
                const user = await base44.auth.me();
                
                // Log activity only once per session
                const sessionKey = `activity_logged_${user.email}`;
                const alreadyLogged = sessionStorage.getItem(sessionKey);
                
                if (!alreadyLogged) {
                    try {
                        let ipAddress = 'Unknown';
                        try {
                            const ipResponse = await fetch('https://api.ipify.org?format=json');
                            const ipData = await ipResponse.json();
                            ipAddress = ipData.ip;
                        } catch {}

                        await base44.entities.ActivityLog.create({
                            user_email: user.email,
                            user_name: user.full_name,
                            user_role: user.role,
                            ip_address: ipAddress,
                            user_agent: navigator.userAgent,
                            location: 'UAE'
                        });
                        
                        sessionStorage.setItem(sessionKey, 'true');
                    } catch (e) {
                        console.error('Activity log error:', e);
                    }
                }
                
                return user;
            } catch (err) {
                console.error('Auth error:', err);
                throw err;
            }
        },
        retry: false,
        staleTime: 15 * 60 * 1000,
        gcTime: 20 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // Fetch page permissions
    const { data: pagePermissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: async () => {
            try {
                return await base44.entities.PagePermission.list();
            } catch (err) {
                console.error('Permissions fetch error:', err);
                return [];
            }
        },
        enabled: !!user,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 1
    });

    // Get user role (extended or standard)
    const userRole = user?.extended_role || user?.role || 'user';

    // Check if user can access a specific page
    const canAccessPage = (pageName) => {
        if (!user) return false;

        // Get page config
        const pageConfig = getPageConfig(pageName);
        if (!pageConfig) return false;

        // ONLY show pages that exist in PagePermission entity
        const permission = pagePermissions.find(p => p.page_name === pageName);
        if (!permission) return false; // No PagePermission record = hide from nav

        // Check if user's role is in allowed_roles
        const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
        return allowedRoles.includes(userRole);
    };

    // Check if user has specific permission (can be extended)
    const hasPermission = (action) => {
        if (!user) return false;
        
        // System admins and CEOs have all permissions
        if (userRole === 'admin' || userRole === 'ceo') return true;
        
        // Add more permission checks as needed
        return false;
    };

    // Check if user is restricted to their own department
    // HR Manager has access to all companies - only department_head is restricted
    const isRestrictedToOwnDepartment = () => {
        return userRole === 'department_head';
    };

    return {
        user,
        isLoading: userLoading,
        error: userError,
        userRole,
        hasPermission,
        canAccessPage,
        isRestrictedToOwnDepartment: isRestrictedToOwnDepartment(),
        pagePermissions
    };
};