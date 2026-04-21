import { parseISO } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * TIMEZONE USAGE RULES — read before using these functions.
 *
 * formatInUAE(value, formatStr)
 *   Use for ISO 8601 UTC strings from backend auto-fields (created_date, updated_date).
 *   value can be "2026-04-20T17:15:00.000Z" or a Date object.
 *   Example: formatInUAE(entity.created_date, 'dd/MM/yyyy hh:mm a')
 *
 * parseDateInUAE(dateStr)
 *   Use ONLY for YYYY-MM-DD strings from date pickers (date_from, date_to).
 *   NEVER pass a full ISO timestamp into this function — it will misparse.
 *   Example: formatInUAE(parseDateInUAE(entity.date_from), 'dd/MM/yyyy')
 *
 * Quick reference:
 *   Backend timestamp → formatInUAE(entity.created_date, 'format')
 *   Date picker value → formatInUAE(parseDateInUAE(entity.date_from), 'format')
 */

// UAE timezone
export const UAE_TIMEZONE = 'Asia/Dubai';

/**
 * Format a date in UAE timezone
 * @param {Date|string} date - Date to format
 * @param {string} formatStr - Format string (e.g., 'yyyy-MM-dd HH:mm:ss')
 * @returns {string} Formatted date string in UAE timezone
 */
export function formatInUAE(date, formatStr = 'yyyy-MM-dd HH:mm:ss') {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return formatInTimeZone(dateObj, UAE_TIMEZONE, formatStr);
}

/**
 * Get current date/time in UAE timezone
 * @returns {Date} Current date in UAE timezone
 */
export function nowInUAE() {
    return toZonedTime(new Date(), UAE_TIMEZONE);
}

/**
 * Convert a date from UAE timezone to UTC (for storing in database)
 * @param {Date} date - Date in UAE timezone
 * @returns {Date} Date converted to UTC
 */
export function uaeToUTC(date) {
    return fromZonedTime(date, UAE_TIMEZONE);
}

/**
 * Convert a UTC date to UAE timezone (for display)
 * @param {Date|string} date - UTC date
 * @returns {Date} Date in UAE timezone
 */
export function utcToUAE(date) {
    if (!date) return null;
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return toZonedTime(dateObj, UAE_TIMEZONE);
}

/**
 * Format a relative time in UAE timezone (e.g., "2 hours ago")
 * @param {Date|string} date - Date to format
 * @returns {string} Relative time string
 */
export function formatRelativeInUAE(date) {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    const uaeDate = toZonedTime(dateObj, UAE_TIMEZONE);
    const now = nowInUAE();
    const diffMs = now - uaeDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatInUAE(date, 'MMM d, yyyy');
}

/**
 * Get start of day in UAE timezone
 * @param {Date|string} date - Date to process
 * @returns {Date} Start of day (00:00:00) in UAE timezone
 */
export function startOfDayUAE(date) {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    const uaeDate = toZonedTime(dateObj, UAE_TIMEZONE);
    uaeDate.setHours(0, 0, 0, 0);
    return uaeDate;
}

/**
 * Get end of day in UAE timezone
 * @param {Date|string} date - Date to process
 * @returns {Date} End of day (23:59:59) in UAE timezone
 */
export function endOfDayUAE(date) {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    const uaeDate = toZonedTime(dateObj, UAE_TIMEZONE);
    uaeDate.setHours(23, 59, 59, 999);
    return uaeDate;
}

/**
 * Parse date string in UAE timezone context
 * @param {string} dateStr - Date string (e.g., "2025-01-18")
 * @returns {Date} Date object representing that date in UAE timezone
 */
export function parseDateInUAE(dateStr) {
    if (!dateStr) return null;
    // Parse as UAE local date
    const [year, month, day] = dateStr.split('-').map(Number);
    const uaeDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    return toZonedTime(uaeDate, UAE_TIMEZONE);
}

/**
 * Format date for input fields (YYYY-MM-DD in UAE timezone)
 * @param {Date|string} date - Date to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function formatDateForInput(date) {
    if (!date) return '';
    return formatInUAE(date, 'yyyy-MM-dd');
}

/**
 * Get current timestamp in UAE timezone (for storing)
 * @returns {string} ISO string representing current UAE time
 */
export function nowUAETimestamp() {
    return formatInUAE(new Date(), "yyyy-MM-dd'T'HH:mm:ss");
}