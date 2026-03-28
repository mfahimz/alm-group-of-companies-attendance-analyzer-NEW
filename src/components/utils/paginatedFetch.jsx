/**
 * Paginated fetch utility for frontend SDK calls.
 * 
 * The Base44 SDK can silently truncate large responses (~64KB limit).
 * This utility fetches entities in pages to ensure ALL records are returned.
 * 
 * Includes:
 * - Exponential backoff retry for 429 rate limit errors
 * - Global concurrency limiter to prevent flooding the API
 * - Inter-page delays to stay under rate limits
 */

const DEFAULT_PAGE_SIZE = 50;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

// ========================================================
// GLOBAL CONCURRENCY LIMITER
// Only allow N paginated fetches to run at the same time.
// Additional calls wait in a queue until a slot opens.
// This prevents React Query from firing 20+ API calls at once.
// ========================================================
const MAX_CONCURRENT = 3;
let activeCount = 0;
const waitQueue = [];

function acquireSlot() {
    if (activeCount < MAX_CONCURRENT) {
        activeCount++;
        return Promise.resolve();
    }
    return new Promise(resolve => {
        waitQueue.push(resolve);
    });
}

function releaseSlot() {
    activeCount--;
    if (waitQueue.length > 0) {
        activeCount++;
        const next = waitQueue.shift();
        next();
    }
}

// ========================================================
// RETRY WITH EXPONENTIAL BACKOFF
// ========================================================
async function fetchWithRetry(fn, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const status = err?.status || err?.response?.status || 0;
            const msg = err?.message || '';
            const isRateLimit = status === 429 || msg.includes('429') || msg.includes('Rate limit');
            if (isRateLimit && attempt < retries) {
                const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), 30000);
                console.warn(`[paginatedFetch] Rate limited, retry ${attempt + 1}/${retries} after ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
}

// ========================================================
// MAIN EXPORT
// ========================================================
export async function fetchAllRecords(entity, query, sortField = null, pageSize = DEFAULT_PAGE_SIZE) {
    // Wait for a concurrency slot before starting
    await acquireSlot();

    try {
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

            // Delay between pages to avoid hitting rate limits
            await new Promise(r => setTimeout(r, 200));
        }

        return allItems;
    } finally {
        // Always release the slot, even on error
        releaseSlot();
    }
}