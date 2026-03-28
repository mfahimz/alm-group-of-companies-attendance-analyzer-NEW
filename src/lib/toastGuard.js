/**
 * TOAST RATE-LIMIT SUPPRESSOR
 * 
 * Monkey-patches sonner's toast.error to silently swallow any
 * error message that looks like a rate-limit (429) error.
 * The user never sees "rate limit" or "429" or "too many requests".
 *
 * Call `installToastGuard()` once at app startup.
 */
import { toast } from 'sonner';

const RATE_LIMIT_PATTERNS = [
    /429/i,
    /rate.?limit/i,
    /too.?many/i,
    /throttl/i,
    /exceeded.*quota/i,
    /request.*limit/i,
];

function looksLikeRateLimitMessage(msg) {
    if (!msg) return false;
    const text = typeof msg === 'string' ? msg : String(msg);
    return RATE_LIMIT_PATTERNS.some(pattern => pattern.test(text));
}

export function installToastGuard() {
    if (toast.__guardInstalled) return;

    const originalError = toast.error;
    toast.error = function (message, options) {
        // Check the message itself
        if (looksLikeRateLimitMessage(message)) {
            console.warn('[ToastGuard] Suppressed rate-limit error toast:', message);
            return;
        }
        // Check the description if provided
        if (options?.description && looksLikeRateLimitMessage(options.description)) {
            console.warn('[ToastGuard] Suppressed rate-limit error toast (desc):', options.description);
            return;
        }
        return originalError.call(this, message, options);
    };

    // Also guard toast() direct calls that might show errors
    const originalDefault = toast;
    // Can't easily replace the default export, but error is the main concern

    toast.__guardInstalled = true;
    console.log('[ToastGuard] Installed — rate-limit error toasts will be suppressed');
}