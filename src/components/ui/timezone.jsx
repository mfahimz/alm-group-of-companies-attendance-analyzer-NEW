import { format as formatDateFns, parseISO } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

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