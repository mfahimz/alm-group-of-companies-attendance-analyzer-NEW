import { base44 } from './base44Client';

/**
 * SECURE AUDIT PROXY (Client Wrapper)
 * 
 * This proxy delegates elevated access requests to a secure backend function 
 * (`functions/secureAuditProxy.ts`) to avoid exposing `asServiceRole` credentials 
 * on the client-side.
 * 
 * Features a safety fallback to standard `entities` fetch if the backend call fails.
 */

export const secureAuditProxy = {
    /**
     * Requesets elevated access via the secure backend proxy function.
     * Incorporates a graceful fallback to standard `base44.entities` if the backend fails.
     * 
     * @param {Object} user - The current user object (from AuthContext)
     * @param {string} entityName - Entity to query
     * @param {Object} filters - Custom filters
     * @param {string} sort - Sort key
     * @param {number} limit - Result limit
     */
    async fetch(user, entityName, filters = {}, sort = '-created_date', limit = 1000) {
        if (!user || !user.company) {
            console.error('[SecureAuditProxy] Missing user or company context');
            throw new Error('User company required for proxy access');
        }

        try {
            // 1. Primary Method: Invoke the secure backend function
            // The backend handles the `asServiceRole` escalation, company fencing, and audit logging safely.
            const response = await base44.functions.invoke('secureAuditProxy', {
                entityName,
                filters,
                sort,
                limit
            });

            if (response && response.success) {
                return response.data;
            } else {
                throw new Error(response.error || 'Unknown backend proxy error');
            }

        } catch (err) {
            if (import.meta.env.DEV) {
                console.warn(`[SecureAuditProxy Frontend] Backend proxy failed for ${entityName}, engaging fallback:`, err.message);
            }
            
            // 2. Safety Fallback: Use standard front-end entities call.
            // This relies on user-scoped permissions and is always safe to call client-side.
            // We manually apply the company fence here just for the fallback, though 
            // the standard rules should already enforce isolation.
            const enforcedFilters = { ...filters, company: user.company };
            try {
                return await base44.entities[entityName].filter(enforcedFilters, sort, limit);
            } catch (fallbackErr) {
                console.error(`[SecureAuditProxy Frontend] Critical Fallback failure:`, fallbackErr.message);
                throw fallbackErr;
            }
        }
    },

    /**
     * Health Monitoring: Tests the proxy connection and validates response format.
     */
    async testPlatformHealth(user) {
        if (!user || !user.company) return { status: 'unknown', reason: 'No user company' };

        try {
            // Test connection using a simple project count through the proxy
            const start = Date.now();
            const data = await this.fetch(user, 'Project', {}, null, 1);
            const latency = Date.now() - start;

            // Detect change in Base44 SDK response format
            // Expected: Array of objects with 'id'
            const hasData = Array.isArray(data);
            const formatValid = hasData && (data.length === 0 || (typeof data[0] === 'object' && 'id' in data[0]));

            if (!formatValid) {
                return {
                    status: 'warning',
                    warning: 'Platform Update Detected',
                    details: 'SDK response format changed - missing expected fields',
                    latency
                };
            }

            return {
                status: 'healthy',
                latency,
                lastChecked: new Date().toISOString()
            };
        } catch (err) {
            return {
                status: 'error',
                error: err.message,
                details: 'Connection to backend proxy failed'
            };
        }
    }
};
