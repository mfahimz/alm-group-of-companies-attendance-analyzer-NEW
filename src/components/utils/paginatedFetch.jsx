/**
 * Paginated fetch utility for frontend SDK calls.
 * 
 * The Base44 SDK can silently truncate large responses (~64KB limit).
 * This utility fetches entities in pages to ensure ALL records are returned.
 * Includes exponential backoff retry for 429 rate limit errors.
 */

const DEFAULT_PAGE_SIZE = 50;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

async function fetchWithRetry(fn, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const status = err?.status || err?.response?.status || 0;
            const isRateLimit = status === 429 || (err?.message && err.message.includes('429'));
            if (isRateLimit && attempt < retries) {
                const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), 20000);
                console.warn(`[paginatedFetch] Rate limited (429), retry ${attempt + 1}/${retries} after ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
}

export async function fetchAllRecords(entity, query, sortField = null, pageSize = DEFAULT_PAGE_SIZE) {
    const allItems = [];
    let skip = 0;
    let currentPageSize = pageSize;
    let consecutiveEmpty = 0;
    const MAX_ITERATIONS = 50;
    let iterations = 0;

    while (consecutiveEmpty < 2 && iterations < MAX_ITERATIONS) {
        iterations++;
        let page;
        try {
            page = await fetchWithRetry(() => entity.filter(query, sortField, currentPageSize, skip));
        } catch (err) {
            console.warn('[paginatedFetch] Error at skip=' + skip + ':', err?.message || err);
            if (currentPageSize > 25) {
                currentPageSize = Math.max(25, Math.floor(currentPageSize / 2));
                console.warn('[paginatedFetch] Reducing page size to', currentPageSize, 'and retrying');
                continue;
            }
            break;
        }

        if (!Array.isArray(page)) {
            if (currentPageSize > 25) {
                currentPageSize = Math.max(25, Math.floor(currentPageSize / 2));
                continue;
            }
            break;
        }

        if (page.length === 0) {
            consecutiveEmpty++;
            skip += currentPageSize;
            continue;
        }

        consecutiveEmpty = 0;
        allItems.push(...page);
        skip += page.length;

        if (page.length < currentPageSize) break;

        // Small delay between pages to avoid hitting rate limits
        await new Promise(r => setTimeout(r, 150));
    }

    return allItems;
}