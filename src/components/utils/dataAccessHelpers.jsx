/**
 * DATA ACCESS LAYER HELPERS
 * 
 * CRITICAL: Base44 SDK .filter() has a DEFAULT LIMIT that causes silent data truncation.
 * These helpers enforce explicit limits or implement pagination to fetch ALL records.
 * 
 * RULES:
 * 1. NEVER call .filter() without explicit limit
 * 2. Use fetchAllRecords() for queries that must return complete datasets
 * 3. Use fetchWithLimit() for bounded queries with explicit limit
 */

/**
 * Fetch ALL records for an entity with given filter, bypassing pagination limits.
 * Uses batch fetching with sort key to ensure complete dataset retrieval.
 * 
 * @param {Object} entitySDK - Base44 entity SDK (e.g., base44.entities.Employee)
 * @param {Object} filter - Filter object
 * @param {string} sortKey - Sort key (default: '-created_date')
 * @param {number} batchSize - Batch size for pagination (default: 1000)
 * @returns {Promise<Array>} All records matching the filter
 * 
 * @example
 * const allEmployees = await fetchAllRecords(
 *   base44.entities.Employee, 
 *   { company: 'Acme Corp', active: true }
 * );
 */
export async function fetchAllRecords(entitySDK, filter = {}, sortKey = '-created_date', batchSize = 1000) {
    const allRecords = [];
    let hasMore = true;
    let offset = 0;



    while (hasMore) {
        const batch = await entitySDK.list(sortKey, batchSize, offset);
        
        // Apply filter manually if using list() (Base44 SDK may not support filter + limit together)
        const filteredBatch = Object.keys(filter).length > 0
            ? batch.filter(record => {
                return Object.entries(filter).every(([key, value]) => record[key] === value);
            })
            : batch;

        allRecords.push(...filteredBatch);
        


        // If batch is smaller than batchSize, we've reached the end
        hasMore = batch.length === batchSize;
        offset += batchSize;

        // Safety limit to prevent infinite loops
        if (offset > 50000) {
            if (import.meta.env.DEV) {
                console.warn(`[fetchAllRecords] Safety limit reached at ${offset} records`);
            }
            break;
        }
    }


    return allRecords;
}

/**
 * Fetch records with EXPLICIT LIMIT - enforces limit parameter to prevent silent truncation.
 * 
 * @param {Object} entitySDK - Base44 entity SDK
 * @param {Object} filter - Filter object
 * @param {string} sortKey - Sort key (default: null)
 * @param {number} limit - REQUIRED explicit limit
 * @returns {Promise<Array>} Records matching the filter (up to limit)
 * 
 * @example
 * const employees = await fetchWithLimit(
 *   base44.entities.Employee,
 *   { company: 'Acme Corp' },
 *   'name',
 *   5000
 * );
 */
export async function fetchWithLimit(entitySDK, filter = {}, sortKey = null, limit) {
    if (limit === undefined || limit === null) {
        throw new Error('fetchWithLimit: limit parameter is REQUIRED to prevent silent truncation');
    }


    
    return await entitySDK.filter(filter, sortKey, limit);
}

/**
 * MIGRATION HELPER: Validates that .filter() calls have explicit limits.
 * Use this to audit your codebase for unsafe .filter() calls.
 * 
 * @param {string} entityName - Entity name for logging
 * @param {number} limit - Limit parameter from .filter() call
 */
export function validateExplicitLimit(entityName, limit) {
    if (limit === undefined || limit === null) {
        console.error(`[DATA ACCESS VIOLATION] ${entityName}.filter() called WITHOUT explicit limit - data may be truncated!`);
        throw new Error(`${entityName}.filter() requires explicit limit parameter`);
    }
}

/**
 * USAGE PATTERNS:
 * 
 * ❌ WRONG (silent truncation risk):
 *    const employees = await base44.entities.Employee.filter({ company: 'Acme' });
 * 
 * ✅ CORRECT (explicit limit):
 *    const employees = await fetchWithLimit(base44.entities.Employee, { company: 'Acme' }, null, 5000);
 * 
 * ✅ CORRECT (fetch all with pagination):
 *    const allEmployees = await fetchAllRecords(base44.entities.Employee, { company: 'Acme' });
 */