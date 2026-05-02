/**
 * Shared attendance analysis utility functions used by both
 * ReportDetailView and DailyBreakdownDialog.
 */

export const parseTime = (timeStr) => {
    try {
        if (!timeStr || timeStr === '—' || timeStr.trim() === '') return null;

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

        timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
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

        timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
            const date = new Date();
            date.setHours(hours, minutes, seconds, 0);
            return date;
        }

        const dateTimeMatch = timeStr.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (dateTimeMatch) {
            const hours = parseInt(dateTimeMatch[1]);
            const minutes = parseInt(dateTimeMatch[2]);
            const seconds = dateTimeMatch[3] ? parseInt(dateTimeMatch[3]) : 0;
            const date = new Date();
            date.setHours(hours, minutes, seconds, 0);
            return date;
        }

        const isoDateTimeMatch = timeStr.match(/^\d{4}-\d{2}-\d{2}\s+(\d{1,2}):(\d{2}):(\d{2})/);
        if (isoDateTimeMatch) {
            const hours = parseInt(isoDateTimeMatch[1]);
            const minutes = parseInt(isoDateTimeMatch[2]);
            const seconds = parseInt(isoDateTimeMatch[3]);
            const date = new Date();
            date.setHours(hours, minutes, seconds, 0);
            return date;
        }

        return null;
    } catch {
        return null;
    }
};

export const formatTime = (timeStr) => {
    if (!timeStr || timeStr === '—' || timeStr.trim() === '') return '—';
    if (/AM|PM/i.test(timeStr)) return timeStr;

    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return '—';

    let hours = parseInt(match[1]);
    const minutes = match[2];
    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours > 12) hours -= 12;
    if (hours === 0) hours = 12;

    return `${hours}:${minutes} ${period}`;
};

export const extractTime = (raw) => {
    if (!raw) return '—';
    const parsed = parseTime(raw);
    if (!parsed) return raw;
    let h = parsed.getHours();
    const m = String(parsed.getMinutes()).padStart(2, '0');
    const period = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${period}`;
};

export const MIDNIGHT_BUFFER_MINUTES = 180;

export const isWithinMidnightBuffer = (timestampRaw) => {
    const parsed = parseTime(timestampRaw);
    if (!parsed) return false;
    const minutesSinceMidnight = parsed.getHours() * 60 + parsed.getMinutes();
    return minutesSinceMidnight <= MIDNIGHT_BUFFER_MINUTES;
};

export const matchPunchesToShiftPoints = (dayPunches, shift, nextDateStr = null) => {
    if (!shift || dayPunches.length === 0) return [];

    const punchesWithTime = dayPunches.map(p => {
        const time = parseTime(p.timestamp_raw);
        if (!time) return null;
        const isNextDayPunch = nextDateStr && p.punch_date === nextDateStr;
        const adjustedTime = isNextDayPunch ? new Date(time.getTime() + 24 * 60 * 60 * 1000) : time;
        return { ...p, time: adjustedTime, _isNextDayPunch: isNextDayPunch };
    }).filter(p => p).sort((a, b) => a.time - b.time);

    if (punchesWithTime.length === 0) return [];

    const pmEndTime = parseTime(shift.pm_end);
    let adjustedPmEnd = pmEndTime;
    if (pmEndTime && pmEndTime.getHours() === 0 && pmEndTime.getMinutes() === 0) {
        adjustedPmEnd = new Date(pmEndTime.getTime() + 24 * 60 * 60 * 1000);
    }

    const shiftPoints = [
        { type: 'AM_START', time: parseTime(shift.am_start), label: shift.am_start },
        { type: 'AM_END', time: parseTime(shift.am_end), label: shift.am_end },
        { type: 'PM_START', time: parseTime(shift.pm_start), label: shift.pm_start },
        { type: 'PM_END', time: adjustedPmEnd, label: shift.pm_end }
    ].filter(sp => sp.time);

    const matches = [];
    const usedShiftPoints = new Set();

    for (const punch of punchesWithTime) {
        let closestMatch = null;
        let minDistance = Infinity;
        let isExtendedMatch = false;
        let isFarExtendedMatch = false;

        for (const window of [60, 120, 180]) {
            if (closestMatch) break;
            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;
                const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);
                if (distance <= window && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                    isExtendedMatch = window > 60;
                    isFarExtendedMatch = window > 120;
                }
            }
        }

        if (closestMatch) {
            matches.push({ punch, matchedTo: closestMatch.type, shiftTime: closestMatch.time, distance: minDistance, isExtendedMatch, isFarExtendedMatch });
            usedShiftPoints.add(closestMatch.type);
        } else {
            matches.push({ punch, matchedTo: null, shiftTime: null, distance: null, isExtendedMatch: false, isFarExtendedMatch: false });
        }
    }

    return matches;
};

export const filterMultiplePunches = (punchList, shift) => {
    if (punchList.length <= 1) return punchList;
    const punchesWithTime = punchList.map(p => ({ ...p, time: parseTime(p.timestamp_raw) })).filter(p => p.time);
    if (punchesWithTime.length === 0) return punchList;
    const deduped = [];
    for (let i = 0; i < punchesWithTime.length; i++) {
        const current = punchesWithTime[i];
        const isDuplicate = deduped.some(p => Math.abs(current.time - p.time) / (1000 * 60) < 10);
        if (!isDuplicate) deduped.push(current);
    }
    return deduped.sort((a, b) => a.time - b.time).map(p => punchList.find(punch => punch.id === p.id)).filter(Boolean);
};