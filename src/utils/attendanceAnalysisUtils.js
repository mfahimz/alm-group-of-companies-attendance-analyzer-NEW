 * Unified logic for time parsing, punch matching, and status detection.
 */

export const MIDNIGHT_BUFFER_MINUTES = 120;

export const isWithinMidnightBuffer = (timestampRaw) => {
    if (!timestampRaw || timestampRaw === '—' || timestampRaw === '-') return false;
    const pt = parseTime(String(timestampRaw));
    if (!pt) return false;
    const h = pt.getHours();
    return h === 0 || h === 1 || h === 2;
};

export const formatTime = (timeStr) => {
    if (!timeStr || timeStr === '—' || timeStr === '-') return '-';
    // If it's already HH:MM AM/PM format, return as is
    if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(timeStr)) return timeStr.toUpperCase();
    
    const time = parseTime(timeStr);
    if (!time) return timeStr;
    
    let hours = time.getHours();
    const minutes = time.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

export const extractTime = (ts) => {
    if (!ts) return '-';
    // Handles ISO strings or standard date strings
    const timePart = ts.includes(' ') ? ts.split(' ')[1] : ts.includes('T') ? ts.split('T')[1].split('.')[0] : ts;
    
    // Check if it's already in 12h format
    if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(timePart)) {
        const match = timePart.match(/(\d{1,2}:\d{2})\s*(AM|PM)/i);
        return `${match[1]} ${match[2].toUpperCase()}`;
    }
    
    const time = parseTime(timePart);
    if (!time) return timePart;
    
    let hours = time.getHours();
    const minutes = time.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

export const parseTime = (timeStr, includeSeconds = false) => {
    try {
        if (!timeStr || timeStr === '—' || timeStr === '-' || timeStr.trim() === '') return null;

        // For Al Maraghi Automotive: Match with seconds (HH:MM:SS AM/PM)
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

        // Standard format: HH:MM AM/PM (without seconds)
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

        // 24-hour format with optional seconds
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

export const matchPunchesToShiftPoints = (dayPunches, shift, nextDateStr, includeSeconds = false) => {
    if (!shift || dayPunches.length === 0) return [];

    const punchesWithTime = dayPunches.map(p => {
        const time = parseTime(p.timestamp_raw, includeSeconds);
        if (!time) return null;
        const isNextDay = nextDateStr && p.punch_date === nextDateStr;
        const adjustedTime = isNextDay ? new Date(time.getTime() + 24 * 60 * 60 * 1000) : time;
        return { ...p, time: adjustedTime, _isNextDayPunch: isNextDay };
    }).filter(p => p).sort((a, b) => a.time - b.time);

    if (punchesWithTime.length === 0) return [];

    // Adjust PM_END if it's midnight (00:00)
    const pmEndTime = parseTime(shift.pm_end, includeSeconds);
    let adjustedPmEnd = pmEndTime;
    if (pmEndTime && pmEndTime.getHours() === 0 && pmEndTime.getMinutes() === 0) {
        adjustedPmEnd = new Date(pmEndTime.getTime() + 24 * 60 * 60 * 1000);
    }

    const shiftPoints = [
        { type: 'AM_START', time: parseTime(shift.am_start, includeSeconds), label: shift.am_start },
        { type: 'AM_END', time: parseTime(shift.am_end, includeSeconds), label: shift.am_end },
        { type: 'PM_START', time: parseTime(shift.pm_start, includeSeconds), label: shift.pm_start },
        { type: 'PM_END', time: adjustedPmEnd, label: shift.pm_end }
    ].filter(sp => sp.time);

    const matches = [];
    const usedShiftPoints = new Set();

    for (const punch of punchesWithTime) {
        let closestMatch = null;
        let minDistance = Infinity;
        let isExtendedMatch = false;
        let isFarExtendedMatch = false;

        // Phase 1: Normal match (±60-120 minutes)
        for (const shiftPoint of shiftPoints) {
            if (usedShiftPoints.has(shiftPoint.type)) continue;
            const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
            if (distance <= 60 && distance < minDistance) {
                minDistance = distance;
                closestMatch = shiftPoint;
            }
        }

        // Phase 2: Extended match (±120 minutes)
        if (!closestMatch) {
            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;
                const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                if (distance <= 120 && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                    isExtendedMatch = true;
                }
            }
        }

        // Phase 3: Far extended match (±180 minutes)
        if (!closestMatch) {
            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;
                const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                if (distance <= 180 && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                    isFarExtendedMatch = true;
                }
            }
        }

        if (closestMatch) {
            matches.push({
                punch,
                matchedTo: closestMatch.type,
                shiftTime: closestMatch.time,
                distance: minDistance,
                isExtendedMatch,
                isFarExtendedMatch
            });
            usedShiftPoints.add(closestMatch.type);
        } else {
            matches.push({
                punch,
                matchedTo: null,
                shiftTime: null,
                distance: null,
                isExtendedMatch: false,
                isFarExtendedMatch: false
            });
        }
    }

    return matches;
};

export const filterMultiplePunches = (punchList, shift, includeSeconds = false) => {
    if (punchList.length <= 1) return punchList;

    const punchesWithTime = punchList.map(p => ({
        ...p,
        time: parseTime(p.timestamp_raw, includeSeconds)
    })).filter(p => p.time);

    if (punchesWithTime.length === 0) return punchList;

    const deduped = [];
    for (let i = 0; i < punchesWithTime.length; i++) {
        const current = punchesWithTime[i];
        const isDuplicate = deduped.some(p => Math.abs(current.time - p.time) / (1000 * 60) < 10);
        if (!isDuplicate) {
            deduped.push(current);
        }
    }

    const sortedPunches = deduped.sort((a, b) => a.time - b.time);
    return sortedPunches.map(p => punchList.find(punch => punch.id === p.id)).filter(Boolean);
};
