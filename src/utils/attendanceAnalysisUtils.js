import { base44 } from '@/api/base44Client';

/**
 * Attendance Analysis Utilities
 * 
 * This module centralizes core business logic for attendance processing:
 * 1. Time parsing (24h, AM/PM, with/without seconds)
 * 2. Punch matching to shift points (AM_START, AM_END, PM_START, PM_END)
 * 3. Punch filtering/deduplication
 * 4. Daily penalty calculation (Synchronized with backend)
 * 
 * Rules:
 * - AM/PM Start: late if punch > shiftTime
 * - AM/PM End: early if punch < shiftTime
 * - Crossover: Night shifts use 180min (3 AM) cutoff
 */

/**
 * Number of minutes after midnight that count as belonging to the previous day's shift.
 * E.g., a 12:30 AM punch is treated as part of the previous calendar day's PM_END.
 */
export const MIDNIGHT_BUFFER_MINUTES = 180;

/**
 * Returns true if the given timestamp falls within the post-midnight buffer
 * (00:00 → MIDNIGHT_BUFFER_MINUTES). Used to roll back early-AM punches to the
 * previous day's shift for night/late shift handling.
 */
export const isWithinMidnightBuffer = (timestampRaw) => {
    const t = parseTime(timestampRaw);
    if (!t) return false;
    const minutesSinceMidnight = t.getHours() * 60 + t.getMinutes();
    return minutesSinceMidnight >= 0 && minutesSinceMidnight < MIDNIGHT_BUFFER_MINUTES;
};

/**
 * Parses various time string formats into a JavaScript Date object.
 * Returns a Date object with hours/minutes set today, or null if invalid.
 */
export const parseTime = (timeStr, includeSeconds = false) => {
    try {
        if (!timeStr || timeStr === '—' || timeStr === '-') return null;

        // Priority 1: Match with seconds (HH:MM:SS AM/PM) - used by Al Maraghi
        if (includeSeconds) {
            let timeMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = parseInt(timeMatch[3]);
                const period = timeMatch[4].toUpperCase();

                if (period === 'PM' && hours !== 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;

                const date = new Date();
                date.setHours(hours, minutes, seconds, 0);
                return date;
            }
        }

        // Priority 2: Standard format HH:MM AM/PM
        let timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const period = timeMatch[3].toUpperCase();

            if (period === 'PM' && hours !== 12) hours += 12;
            if (period === 'AM' && hours === 12) hours = 0;

            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date;
        }

        // Priority 3: 24-hour format (HH:MM or HH:MM:SS)
        timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0;

            const date = new Date();
            date.setHours(hours, minutes, seconds, 0);
            return date;
        }

        return null;
    } catch {
        return null;
    }
};

/**
 * Matches a list of punches to shift timing points (AM_START, AM_END, PM_START, PM_END).
 * Uses a phased approach (60min, 120min, 180min windows).
 */
export const matchPunchesToShiftPoints = (dayPunches, shift, includeSeconds = false) => {
    if (!shift || dayPunches.length === 0) return [];

    const punchesWithTime = dayPunches.map(p => {
        const time = parseTime(p.timestamp_raw, includeSeconds);
        return time ? { ...p, time } : null;
    }).filter(Boolean).sort((a, b) => a.time - b.time);

    if (punchesWithTime.length === 0) return [];

    const shiftPoints = [
        { type: 'AM_START', time: parseTime(shift.am_start, includeSeconds) },
        { type: 'AM_END', time: parseTime(shift.am_end, includeSeconds) },
        { type: 'PM_START', time: parseTime(shift.pm_start, includeSeconds) },
        { type: 'PM_END', time: parseTime(shift.pm_end, includeSeconds) }
    ].filter(sp => sp.time);

    const matches = [];
    const usedShiftPoints = new Set();

    for (const punch of punchesWithTime) {
        let closestMatch = null;
        let minDistance = Infinity;

        // Phased matching: 1. Normal (60m) 2. Extended (120m) 3. Far (180m)
        const windows = [60, 120, 180];
        
        for (const window of windows) {
            if (closestMatch) break;
            for (const sp of shiftPoints) {
                if (usedShiftPoints.has(sp.type)) continue;
                const distance = Math.abs(punch.time - sp.time) / (1000 * 60);
                if (distance <= window && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = sp;
                }
            }
        }

        if (closestMatch) {
            matches.push({
                punch,
                matchedTo: closestMatch.type,
                shiftTime: closestMatch.time,
                distance: minDistance
            });
            usedShiftPoints.add(closestMatch.type);
        } else {
            matches.push({ punch, matchedTo: null, shiftTime: null, distance: null });
        }
    }

    return matches;
};

/**
 * Removes duplicate punches within a short timeframe (10 min).
 */
export const filterMultiplePunches = (punchList, includeSeconds = false) => {
    if (punchList.length <= 1) return punchList;

    const punchesWithTime = punchList.map(p => ({
        ...p,
        time: parseTime(p.timestamp_raw, includeSeconds)
    })).filter(p => p.time);

    const deduped = [];
    for (const current of punchesWithTime) {
        const isDuplicate = deduped.some(p => Math.abs(current.time - p.time) / (1000 * 60) < 10);
        if (!isDuplicate) deduped.push(current);
    }

    return deduped.map(p => punchList.find(punch => punch.id === p.id)).filter(Boolean);
};

/**
 * Formats a Date object back to a display time string.
 */
export const formatTime = (date) => {
    if (!date || isNaN(date.getTime())) return '—';
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
};

/**
 * Extracts time part from timestamp_raw if it's a full ISO or date-time string.
 */
export const extractTime = (timestamp) => {
    if (!timestamp) return '—';
    const match = timestamp.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M)/i);
    return match ? match[1] : timestamp;
};

/**
 * CALCULATE DAILY PENALTIES
 * Primary mathematical logic for computing late and early checkout minutes.
 * This is the SINGLE SOURCE OF TRUTH for penalty math across the app.
 */
export const calculateDailyPenalties = (punchMatches) => {
    let late = 0;
    let early = 0;

    for (const match of punchMatches) {
        if (!match.matchedTo) continue;

        const punchTime = match.punch.time;
        const shiftTime = match.shiftTime;

        if (!punchTime || !shiftTime) continue;

        const minutesDifference = Math.round(Math.abs((punchTime.getTime() - shiftTime.getTime()) / (1000 * 60)));

        if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
            if (punchTime.getTime() > shiftTime.getTime()) {
                late += minutesDifference;
            }
        } else if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
            if (punchTime.getTime() < shiftTime.getTime()) {
                early += minutesDifference;
            }
        }
    }
    return { late, early };
};