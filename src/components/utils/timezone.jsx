// UAE Timezone Utilities (Asia/Dubai - UTC+4)

export const UAE_TIMEZONE = 'Asia/Dubai';

/**
 * Get current date in UAE timezone
 */
export const getUAEDate = () => {
    return new Date(new Date().toLocaleString('en-US', { timeZone: UAE_TIMEZONE }));
};

/**
 * Convert any date to UAE timezone
 */
export const toUAEDate = (date) => {
    if (!date) return null;
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Date(dateObj.toLocaleString('en-US', { timeZone: UAE_TIMEZONE }));
};

/**
 * Format date for UAE timezone display
 */
export const formatUAEDate = (date, options = {}) => {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-AE', { 
        timeZone: UAE_TIMEZONE,
        ...options 
    });
};

/**
 * Format date and time for UAE timezone display
 */
export const formatUAEDateTime = (date, options = {}) => {
    if (!date) return '';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('en-AE', { 
        timeZone: UAE_TIMEZONE,
        ...options 
    });
};

/**
 * Parse time string and return UAE time
 */
export const parseTimeUAE = (timeStr) => {
    try {
        if (!timeStr || timeStr === '—') return null;
        
        // Try AM/PM format first
        let timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const period = timeMatch[3].toUpperCase();
            
            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;
            
            const date = getUAEDate();
            date.setHours(hours, minutes, 0, 0);
            return date;
        }
        
        // Fallback: 24-hour format
        timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            
            const date = getUAEDate();
            date.setHours(hours, minutes, 0, 0);
            return date;
        }
        
        return null;
    } catch {
        return null;
    }
};

/**
 * Get date string in YYYY-MM-DD format for UAE timezone
 */
export const getUAEDateString = (date) => {
    const uaeDate = date ? toUAEDate(date) : getUAEDate();
    const year = uaeDate.getFullYear();
    const month = String(uaeDate.getMonth() + 1).padStart(2, '0');
    const day = String(uaeDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};