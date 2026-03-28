/**
 * Paginated fetch utility for frontend SDK calls.
 * 
 * The Base44 SDK can silently truncate large responses (~64KB limit).
 * This utility fetches entities in pages to ensure ALL records are returned.
 * 
 * Usage:
 *   import { fetchAllRecords } from '../utils/paginatedFetch';
 *   const results = await fetchAllRecords(base44.entities.AnalysisResult, { project_id: '123' });
 */

const DEFAULT_PAGE_SIZE = 200;

export async function fetchAllRecords(entity, query, sortField = null, pageSize = DEFAULT_PAGE_SIZE) {
    const allItems = [];
    let skip = 0;
    let consecutiveEmpty = 0;

    while (consecutiveEmpty < 2) {
        let page;
        try {
            page = await entity.filter(query, sortField, pageSize, skip);
        } catch (err) {
            console.warn('[paginatedFetch] Error fetching page at skip=', skip, err);
            break;
        }

        // SDK might return non-array on truncation
        if (!Array.isArray(page)) {
            // Try smaller page size
            if (pageSize > 50) {
                pageSize = Math.max(50, Math.floor(pageSize / 2));
                console.warn('[paginatedFetch] Non-array response, reducing page size to', pageSize);
                continue;
            }
            console.error('[paginatedFetch] Non-array response even at page size', pageSize);
            break;
        }

        if (page.length === 0) {
            consecutiveEmpty++;
            skip += pageSize;
            continue;
        }

        consecutiveEmpty = 0;
        allItems.push(...page);
        skip += page.length;

        // If we got fewer than requested, we've reached the end
        if (page.length < pageSize) break;
    }

    return allItems;
}