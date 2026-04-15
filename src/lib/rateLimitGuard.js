/**
 * GLOBAL RATE LIMIT GUARD
 * 
 * Two layers of protection:
 * 1. REQUEST QUEUE: Serializes rapid-fire API calls with minimum spacing
 *    to prevent 429s from happening in the first place.
 * 2. RETRY INTERCEPTOR: If a 429 still occurs, retries silently with
 *    exponential backoff — the user never sees an error.
 *
 * Usage: Call `installRateLimitGuard(base44)` once at app startup.
 */

// ─── Configuration ───────────────────────────────────────────────
const MIN_SPACING_MS = 120;       // Minimum ms between API calls
const MAX_RETRIES = 6;            // Up to 6 retries for 429
const BASE_BACKOFF_MS = 1500;     // Starting backoff
const MAX_BACKOFF_MS = 30000;     // Cap at 30 seconds
const JITTER_MAX_MS = 500;        // Random jitter to avoid thundering herd

// ─── Request Queue ──────────────────────────────────────────────
let lastCallTime = 0;
let queuePromise = Promise.resolve();

function enqueue(fn) {
    queuePromise = queuePromise.then(async () => {
        const now = Date.now();
        const elapsed = now - lastCallTime;
        if (elapsed < MIN_SPACING_MS) {
            await sleep(MIN_SPACING_MS - elapsed);
        }
        lastCallTime = Date.now();
        return fn();
    }).catch(() => {
        // Don't let one failed call break the queue chain
    });
    // We don't return the queue promise — we return a NEW promise
    // that resolves with this specific call's result
    return new Promise((resolve, reject) => {
        const wrapped = async () => {
            const now = Date.now();
            const elapsed = now - lastCallTime;
            if (elapsed < MIN_SPACING_MS) {
                await sleep(MIN_SPACING_MS - elapsed);
            }
            lastCallTime = Date.now();
            try {
                const result = await fn();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        };
        // Actually chain it properly
        queuePromise = queuePromise.then(wrapped, wrapped);
    });
}

// ─── Retry with backoff ─────────────────────────────────────────
function isRateLimitError(err) {
    if (!err) return false;
    const status = err?.status || err?.response?.status || err?.statusCode || 0;
    if (status === 429) return true;
    const msg = (err?.message || err?.toString() || '').toLowerCase();
    return msg.includes('429') || msg.includes('rate limit') || msg.includes('too many');
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function retryOnRateLimit(fn) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (isRateLimitError(err) && attempt < MAX_RETRIES) {
                const backoff = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
                const jitter = Math.random() * JITTER_MAX_MS;
                const delay = backoff + jitter;
                if (import.meta.env.DEV) {
                    console.warn(
                        `[RateLimitGuard] 429 detected, retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`
                    );
                }
                await sleep(delay);
                continue;
            }
            throw err;
        }
    }
}

// ─── Wrap a single method ───────────────────────────────────────
function wrapMethod(originalMethod, context) {
    return function (...args) {
        return retryOnRateLimit(() => {
            return originalMethod.apply(context, args);
        });
    };
}

// ─── Install on base44 SDK ──────────────────────────────────────
const ENTITY_METHODS = ['filter', 'list', 'create', 'update', 'delete', 'bulkCreate', 'get', 'schema', 'subscribe'];

export function installRateLimitGuard(base44) {
    if (base44.__rateLimitGuardInstalled) return;

    // 1. Wrap all entity methods
    if (base44.entities) {
        const entityProxy = new Proxy(base44.entities, {
            get(target, entityName) {
                const entity = target[entityName];
                if (!entity || typeof entity !== 'object') return entity;

                // Return a proxy for each entity that wraps its methods
                if (!entity.__wrapped) {
                    for (const method of ENTITY_METHODS) {
                        if (typeof entity[method] === 'function') {
                            const original = entity[method].bind(entity);
                            entity[method] = wrapMethod(original, entity);
                        }
                    }
                    entity.__wrapped = true;
                }
                return entity;
            }
        });
        base44.entities = entityProxy;
    }

    // 2. Wrap auth methods
    if (base44.auth) {
        const authMethods = ['me', 'updateMe', 'logout'];
        for (const method of authMethods) {
            if (typeof base44.auth[method] === 'function') {
                const original = base44.auth[method].bind(base44.auth);
                base44.auth[method] = wrapMethod(original, base44.auth);
            }
        }
    }

    // 3. Wrap functions.invoke
    if (base44.functions && typeof base44.functions.invoke === 'function') {
        const originalInvoke = base44.functions.invoke.bind(base44.functions);
        base44.functions.invoke = function (name, payload) {
            return retryOnRateLimit(() => originalInvoke(name, payload));
        };
    }

    // 4. Wrap integrations
    if (base44.integrations) {
        const intProxy = new Proxy(base44.integrations, {
            get(target, pkgName) {
                const pkg = target[pkgName];
                if (!pkg || typeof pkg !== 'object') return pkg;
                if (!pkg.__wrapped) {
                    for (const key of Object.keys(pkg)) {
                        if (typeof pkg[key] === 'function') {
                            const original = pkg[key].bind(pkg);
                            pkg[key] = wrapMethod(original, pkg);
                        }
                    }
                    pkg.__wrapped = true;
                }
                return pkg;
            }
        });
        base44.integrations = intProxy;
    }

    // 5. Wrap users methods if present
    if (base44.users) {
        for (const method of ['inviteUser', 'list']) {
            if (typeof base44.users[method] === 'function') {
                const original = base44.users[method].bind(base44.users);
                base44.users[method] = wrapMethod(original, base44.users);
            }
        }
    }

    base44.__rateLimitGuardInstalled = true;
    // Installed silently
}

/**
 * Utility for components that need explicit retry (e.g., manual operations).
 * Prefer this over writing retry loops in individual components.
 */
export { retryOnRateLimit, isRateLimitError, sleep };