/**
 * Paginated fetch utility for frontend SDK calls.
 * 
 * The Base44 SDK can silently truncate large responses (~64KB limit).
 * This utility fetches entities in pages to ensure ALL records are returned.
 */

const DEFAULT_PAGE_SIZE = 50;

export async function fetchAllRecords(entity, query, sortField = null, pageSize = DEFAULT_PAGE_SIZE) {
    const allItems = [];
    let skip = 0;
    let currentPageSize = pageSize;
    let consecutiveEmpty = 0;
    const MAX_ITERATIONS = 50; // Safety valve
    let iterations = 0;

    while (consecutiveEmpty < 2 && iterations < MAX_ITERATIONS) {
        iterations++;
        let page;
        try {
            page = await entity.filter(query, sortField, currentPageSize, skip);
        } catch (err) {
            console.warn('[paginatedFetch] Error at skip=' + skip + ':', err?.message || err);
            // On error, try smaller page
            if (currentPageSize > 25) {
                currentPageSize = Math.max(25, Math.floor(currentPageSize / 2));
                console.warn('[paginatedFetch] Reducing page size to', currentPageSize, 'and retrying');
                continue;
            }
            break;
        }

        // SDK might return non-array on truncation
        if (!Array.isArray(page)) {
            if (currentPageSize > 25) {
                currentPageSize = Math.max(25, Math.floor(currentPageSize / 2));
                console.warn('[paginatedFetch] Non-array response at skip=' + skip + ', reducing page to', currentPageSize);
                continue;
            }
            console.error('[paginatedFetch] Non-array response at page size', currentPageSize, '- aborting');
            break;
        }

        console.log('[paginatedFetch] skip=' + skip + ' pageSize=' + currentPageSize + ' got=' + page.length);

        if (page.length === 0) {
            consecutiveEmpty++;
            skip += currentPageSize;
            continue;
        }

        consecutiveEmpty = 0;
        allItems.push(...page);
        skip += page.length;

        // If we got fewer than requested, we've reached the end
        if (page.length < currentPageSize) break;
    }

    console.log('[paginatedFetch] Total records fetched:', allItems.length, 'in', iterations, 'iterations');
    return allItems;
}