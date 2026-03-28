import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import TimePicker from '../ui/TimePicker';
import { getFilteredExceptionTypes, formatExceptionTypeLabel } from '@/lib/exception-types';

export default function EditDayRecordDialog({ open, onClose, onSave, dayRecord, project, attendanceId, analysisResult, dailyBreakdownData }) {
    const [formData, setFormData] = useState({
        type: 'MANUAL_PRESENT',
        details: '',
        lateMinutes: 0,
        earlyCheckoutMinutes: 0,
        otherMinutes: 0,
        isAbnormal: false,
        shiftOverride: {
            enabled: false,
            am_start: '',
            am_end: '',
            pm_start: '',
            pm_end: ''
        }
    });
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';

    const { data: punches = [] } = useQuery({
       queryKey: ['punches', project?.id, attendanceId],
       queryFn: () => base44.entities.Punch.filter({ 
           project_id: project.id, 
           attendance_id: String(attendanceId) 
       }),
       enabled: !!dayRecord && !!project?.id && !!attendanceId,
       staleTime: 0
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project?.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id }),
        enabled: !!dayRecord && !!project?.id
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project?.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id }),
        enabled: !!dayRecord && !!project?.id
    });

    const parseTime = (timeStr) => {
        try {
            if (!timeStr || timeStr === '—') return null;
            
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
            
            timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                
                const date = new Date();
                date.setHours(hours, minutes, 0, 0);
                return date;
            }
            
            return null;
        } catch {
            return null;
        }
    };

    /**
     * FIX 2 - Helper function to format timestamp_raw consistently.
     * Parses the string into a Date object and returns DD/MM/YYYY HH:MM AM/PM.
     */
    const formatPunchDisplay = (timestampRaw) => {
        if (!timestampRaw) return '—';
        try {
            const date = new Date(timestampRaw);
            if (isNaN(date.getTime())) return timestampRaw;

            const dateStr = date.toLocaleDateString('en-GB'); // Strictly DD/MM/YYYY
            let hours = date.getHours();
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            
            return `${dateStr} ${hours}:${minutes} ${ampm}`;
        } catch (e) {
            return timestampRaw;
        }
    };

    const matchPunchesToShiftPoints = (dayPunches, shift) => {
        if (!shift || dayPunches.length === 0) return [];
        
        const punchesWithTime = dayPunches.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
        })).filter(p => p.time).sort((a, b) => a.time.getTime() - b.time.getTime());
        
        if (punchesWithTime.length === 0) return [];
        
        const shiftPoints = [
            { type: 'AM_START', time: parseTime(shift.am_start), label: shift.am_start },
            { type: 'AM_END', time: parseTime(shift.am_end), label: shift.am_end },
            { type: 'PM_START', time: parseTime(shift.pm_start), label: shift.pm_start },
            { type: 'PM_END', time: parseTime(shift.pm_end), label: shift.pm_end }
        ].filter(sp => sp.time);
        
        const matches = [];
        const usedShiftPoints = new Set();
        
        for (const punch of punchesWithTime) {
            let closestMatch = null;
            let minDistance = Infinity;
            let isExtendedMatch = false;
            
            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;
                
                const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);
                
                if (distance <= 60 && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                }
            }
            
            if (!closestMatch) {
                for (const shiftPoint of shiftPoints) {
                    if (usedShiftPoints.has(shiftPoint.type)) continue;
                    
                    const distance = Math.abs(punch.time.getTime() - shiftPoint.time.getTime()) / (1000 * 60);
                    
                    if (distance <= 120 && distance < minDistance) {
                        minDistance = distance;
                        closestMatch = shiftPoint;
                        isExtendedMatch = true;
                    }
                }
            }
            
            if (closestMatch) {
                matches.push({
                    punch,
                    matchedTo: closestMatch.type,
                    shiftTime: closestMatch.time,
                    distance: minDistance,
                    isExtendedMatch
                });
                usedShiftPoints.add(closestMatch.type);
            } else {
                matches.push({
                    punch,
                    matchedTo: null,
                    shiftTime: null,
                    distance: null,
                    isExtendedMatch: false
                });
            }
        }
        
        return matches;
    };

    const getDayPunches = () => {
        if (!dayRecord) return [];
        
        // Convert dayRecord.date (DD/MM/YYYY) to YYYY-MM-DD for matching
        const [day, month, year] = dayRecord.date.split('/');
        const dateStrYMD = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // First priority: use pre-cached daily breakdown data (most reliable)
        if (dailyBreakdownData && dailyBreakdownData[attendanceId]?.daily_details) {
            const breakdownDetails = dailyBreakdownData[attendanceId].daily_details;
            
            // Use dateStr directly from dayRecord if available, otherwise match by date
            const dayKey = dayRecord.dateStr || Object.keys(breakdownDetails).find(date => date === dateStrYMD);
            
            if (dayKey && breakdownDetails[dayKey]?.punches && Array.isArray(breakdownDetails[dayKey].punches)) {
                const punchData = breakdownDetails[dayKey].punches;
                
                // FIX 1: Ensure all punches (objects or strings) are converted to objects and sorted
                let processedPunches = [];
                if (punchData.length > 0 && typeof punchData[0] === 'object') {
                    processedPunches = [...punchData];
                } else if (punchData.length > 0 && typeof punchData[0] === 'string') {
                    processedPunches = punchData.map((punchStr, idx) => ({
                        id: `${dayKey}-${idx}`,
                        timestamp_raw: punchStr,
                        punch_date: dayKey
                    }));
                }

                // Apply chronological sorting to the dailyBreakdownData path
                return processedPunches.sort((a, b) => {
                    const getISO = (p) => {
                        const time = p.timestamp_raw?.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*[AP]M)?/i);
                        if (p.punch_date && time) {
                            let [_, h, m, s, period] = time;
                            let hr = parseInt(h);
                            if (period?.toUpperCase().trim() === 'PM' && hr !== 12) hr += 12;
                            if (period?.toUpperCase().trim() === 'AM' && hr === 12) hr = 0;
                            return `${p.punch_date}T${String(hr).padStart(2, '0')}:${m.padStart(2, '0')}:${(s || '00').padStart(2, '0')}`;
                        }
                        return p.timestamp_raw;
                    };
                    const timeA = new Date(getISO(a)).getTime();
                    const timeB = new Date(getISO(b)).getTime();
                    return (isNaN(timeA) || isNaN(timeB)) ? 0 : timeA - timeB;
                });
            }
        }
        
        // Fallback: try to match from punches array
        const dateStrDMY = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        
        const dayPunches = punches.filter(p => {
            const dateMatch = p.punch_date === dateStrYMD || p.punch_date === dateStrDMY;
            return dateMatch;
        }).sort((a, b) => {
            try {
                const getISO = (p) => {
                    const time = p.timestamp_raw?.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*[AP]M)?/i);
                    if (p.punch_date && time) {
                        let [_, h, m, s, period] = time;
                        let hr = parseInt(h);
                        if (period?.toUpperCase().trim() === 'PM' && hr !== 12) hr += 12;
                        if (period?.toUpperCase().trim() === 'AM' && hr === 12) hr = 0;
                        return `${p.punch_date}T${String(hr).padStart(2, '0')}:${m.padStart(2, '0')}:${(s || '00').padStart(2, '0')}`;
                    }
                    return p.timestamp_raw;
                };
                const timeA = new Date(getISO(a)).getTime();
                const timeB = new Date(getISO(b)).getTime();
                if (isNaN(timeA) || isNaN(timeB)) return 0;
                return timeA - timeB;
            } catch {
                return 0;
            }
        });
        
        return dayPunches;
    };

    useEffect(() => {
        if (dayRecord && open && analysisResult) {
            const [day, month, year] = dayRecord.date.split('/');
            const dateStr = `${year}-${month}-${day}`;
            
            // Check if there's an existing override for this date in the analysis result
            let existingOverride = null;
            if (analysisResult.day_overrides) {
                try {
                    const overrides = JSON.parse(analysisResult.day_overrides);
                    existingOverride = overrides[dateStr];
                } catch (e) {
                    // Invalid JSON, ignore
                }
            }

            // Get current shift for this day
            const currentShift = dayRecord.shift || '';
            const shiftTimes = currentShift.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi) || [];
            
            if (existingOverride) {
                setFormData({
                    type: existingOverride.type || 'MANUAL_PRESENT',
                    details: existingOverride.details || '',
                    lateMinutes: existingOverride.lateMinutes || 0,
                    earlyCheckoutMinutes: existingOverride.earlyCheckoutMinutes || 0,
                    otherMinutes: existingOverride.otherMinutes || 0,
                    isAbnormal: existingOverride.isAbnormal || false,
                    shiftOverride: {
                        enabled: !!existingOverride.shiftOverride,
                        am_start: existingOverride.shiftOverride?.am_start || shiftTimes[0] || '',
                        am_end: existingOverride.shiftOverride?.am_end || shiftTimes[1] || '',
                        pm_start: existingOverride.shiftOverride?.pm_start || shiftTimes[2] || '',
                        pm_end: existingOverride.shiftOverride?.pm_end || shiftTimes[3] || ''
                    }
                });
            } else {
                // Check if there's an exception for this date
                const [day, month, year] = dayRecord.date.split('/');
                const dateStr = `${year}-${month}-${day}`;
                const currentDateObj = new Date(dateStr);
                
                const dateException = exceptions.find(ex => {
                    const exFrom = new Date(ex.date_from);
                    const exTo = new Date(ex.date_to);
                    return currentDateObj >= exFrom && currentDateObj <= exTo &&
                           (ex.attendance_id === 'ALL' || String(ex.attendance_id) === String(attendanceId));
                });

                // If exception has manual time values, use those exclusively
                let lateMinutes = 0;
                let earlyCheckoutMinutes = 0;
                let otherMinutes = 0;

                if (dateException && (dateException.late_minutes > 0 || dateException.early_checkout_minutes > 0 || dateException.other_minutes > 0)) {
                    // Use exception values directly
                    lateMinutes = dateException.late_minutes || 0;
                    earlyCheckoutMinutes = dateException.early_checkout_minutes || 0;
                    otherMinutes = dateException.other_minutes || 0;
                } else {
                    // Parse from display values
                    if (dayRecord.lateInfo && dayRecord.lateInfo !== '-') {
                        const matches = dayRecord.lateInfo.match(/(\d+)\s*min/g);
                        if (matches) {
                            lateMinutes = matches.reduce((sum, match) => {
                                const num = parseInt(match.match(/\d+/)[0]);
                                return sum + num;
                            }, 0);
                        }
                    }

                    if (dayRecord.earlyCheckoutInfo && dayRecord.earlyCheckoutInfo !== '-') {
                        const matches = dayRecord.earlyCheckoutInfo.match(/(\d+)\s*min/g);
                        if (matches) {
                            earlyCheckoutMinutes = matches.reduce((sum, match) => {
                                const num = parseInt(match.match(/\d+/)[0]);
                                return sum + num;
                            }, 0);
                        }
                    }

                    if (dayRecord.otherMinutes && dayRecord.otherMinutes > 0) {
                        otherMinutes = dayRecord.otherMinutes;
                    }
                }

                let statusType = 'MANUAL_PRESENT';
                if (dayRecord.status.includes('Absent')) {
                    statusType = 'MANUAL_ABSENT';
                } else if (dayRecord.status.includes('Off')) {
                    statusType = 'OFF';
                } else if (dayRecord.status.includes('Present')) {
                    statusType = 'MANUAL_PRESENT';
                }

                setFormData({
                    type: statusType,
                    details: '',
                    lateMinutes: lateMinutes,
                    earlyCheckoutMinutes: earlyCheckoutMinutes,
                    otherMinutes: otherMinutes,
                    isAbnormal: dayRecord.abnormal || false,
                    shiftOverride: {
                        enabled: false,
                        am_start: shiftTimes[0] || '',
                        am_end: shiftTimes[1] || '',
                        pm_start: shiftTimes[2] || '',
                        pm_end: shiftTimes[3] || ''
                    }
                });
            }
        }
        }, [dayRecord, open, analysisResult, exceptions, attendanceId]);

        // Auto-calculate late and early checkout when shift override changes
        React.useEffect(() => {
        if (!formData.shiftOverride.enabled || !dayRecord) return;

        const dayPunches = getDayPunches();
        if (dayPunches.length === 0) return;

        const overriddenShift = {
            am_start: formData.shiftOverride.am_start,
            am_end: formData.shiftOverride.am_end,
            pm_start: formData.shiftOverride.pm_start,
            pm_end: formData.shiftOverride.pm_end
        };

        // Check if all shift times are provided
        if (!overriddenShift.am_start || !overriddenShift.pm_end) return;

        const punchMatches = matchPunchesToShiftPoints(dayPunches, overriddenShift);

        let calculatedLate = 0;
        let calculatedEarlyCheckout = 0;

        for (const match of punchMatches) {
            if (!match.matchedTo) continue;

            const punchTime = match.punch.time;
            const shiftTime = match.shiftTime;

            if (match.matchedTo === 'AM_START' || match.matchedTo === 'PM_START') {
                if (punchTime.getTime() > shiftTime.getTime()) {
                    const minutes = Math.round((punchTime.getTime() - shiftTime.getTime()) / (1000 * 60));
                    calculatedLate += minutes;
                }
            }

            if (match.matchedTo === 'AM_END' || match.matchedTo === 'PM_END') {
                if (punchTime.getTime() < shiftTime.getTime()) {
                    const minutes = Math.round((shiftTime.getTime() - punchTime.getTime()) / (1000 * 60));
                    calculatedEarlyCheckout += minutes;
                }
            }
        }

        setFormData(prev => ({
            ...prev,
            lateMinutes: calculatedLate,
            earlyCheckoutMinutes: calculatedEarlyCheckout
        }));
        }, [formData.shiftOverride.enabled, formData.shiftOverride.am_start, formData.shiftOverride.am_end, formData.shiftOverride.pm_start, formData.shiftOverride.pm_end, dayRecord]);

    // Retry helper with exponential backoff for rate-limited API calls
    const retryWithBackoff = async (fn, maxRetries = 4, baseDelay = 1500) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                const isRateLimit = error?.status === 429 || error?.response?.status === 429 ||
                    error?.message?.includes('rate limit') || error?.message?.includes('429') ||
                    error?.message?.includes('Too Many');
                if (isRateLimit && attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
                    console.warn(`Rate limited (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                throw error;
            }
        }
    };

    const updateDayMutation = useMutation({
        mutationFn: async (data) => {
            const [day, month, year] = dayRecord.date.split('/');
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // Both users and admins store edits in day_overrides
            // Exceptions are only created when "Save Report" is clicked
            const latestResults = await retryWithBackoff(() =>
                base44.entities.AnalysisResult.filter({ id: analysisResult.id })
            );
            const latestResult = latestResults[0] || analysisResult;

            let overrides = {};
            if (latestResult.day_overrides) {
                try {
                    overrides = JSON.parse(latestResult.day_overrides);
                } catch (e) {
                    overrides = {};
                }
            }

            const existingOverride = overrides[dateStr];
            overrides[dateStr] = {
                type: data.type,
                details: data.details || '',
                lateMinutes: Number(data.lateMinutes) || 0,
                earlyCheckoutMinutes: Number(data.earlyCheckoutMinutes) || 0,
                otherMinutes: Number(data.otherMinutes) || 0,
                isAbnormal: Boolean(data.isAbnormal),
                originalLateMinutes: existingOverride?.originalLateMinutes ?? (Number(data.originalLateMinutes) || 0),
                originalEarlyCheckout: existingOverride?.originalEarlyCheckout ?? (Number(data.originalEarlyCheckout) || 0),
                originalOtherMinutes: existingOverride?.originalOtherMinutes ?? (Number(data.originalOtherMinutes) || 0),
                shiftOverride: data.shiftOverride?.enabled ? {
                    am_start: data.shiftOverride.am_start || '',
                    am_end: data.shiftOverride.am_end || '',
                    pm_start: data.shiftOverride.pm_start || '',
                    pm_end: data.shiftOverride.pm_end || ''
                } : null
            };

            const updatedTotals = recalculateTotals(latestResult, overrides);

            // Only send the fields we're actually changing (NOT attendance_id - it's immutable)
            const updatePayload = {
                day_overrides: JSON.stringify(overrides),
                late_minutes: updatedTotals.late_minutes,
                early_checkout_minutes: updatedTotals.early_checkout_minutes,
                other_minutes: updatedTotals.other_minutes,
                deductible_minutes: updatedTotals.deductible_minutes
            };

            // Only include abnormal_dates if not empty
            if (updatedTotals.abnormal_dates && updatedTotals.abnormal_dates.length > 0) {
                updatePayload.abnormal_dates = updatedTotals.abnormal_dates;
            }

            await retryWithBackoff(() =>
                base44.entities.AnalysisResult.update(analysisResult.id, updatePayload)
            );

            // Fire backend recalc and sick leave creation in parallel where possible
            const parallelTasks = [];

            // Trigger backend recalculation of this employee's totals from raw data
            parallelTasks.push(
                retryWithBackoff(() =>
                    base44.functions.invoke('recalcEmployeeTotals', {
                        analysis_result_id: analysisResult.id
                    })
                ).catch(recalcErr => {
                    console.warn('Backend recalc failed, using local calculation:', recalcErr);
                })
            );

            // If admin sets SICK_LEAVE, also create an actual Exception record
            if (data.type === 'SICK_LEAVE') {
                parallelTasks.push((async () => {
                    const [day, month, year] = dayRecord.date.split('/');
                    const exceptionDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                    const existingSickLeave = await retryWithBackoff(() =>
                        base44.entities.Exception.filter({
                            project_id: project.id,
                            attendance_id: String(attendanceId),
                            type: 'SICK_LEAVE'
                        })
                    );

                    const alreadyHasSickLeave = existingSickLeave.some(ex => {
                        const exFrom = new Date(ex.date_from);
                        const exTo = new Date(ex.date_to);
                        const targetDate = new Date(exceptionDateStr);
                        return targetDate >= exFrom && targetDate <= exTo;
                    });

                    if (!alreadyHasSickLeave) {
                        await retryWithBackoff(() =>
                            base44.entities.Exception.create({
                                project_id: project.id,
                                attendance_id: String(attendanceId),
                                date_from: exceptionDateStr,
                                date_to: exceptionDateStr,
                                type: 'SICK_LEAVE',
                                details: data.details || 'Admin override from report',
                                use_in_analysis: true,
                                approval_status: 'approved',
                                created_from_report: true,
                                report_run_id: analysisResult.report_run_id
                            })
                        );
                    }
                })());
            }

            await Promise.all(parallelTasks);

            // Log the edit to audit trail (fire-and-forget, no need to block on this)
            const changes = [];
            if (data.type) changes.push(`Status: ${data.type}`);
            if (data.lateMinutes !== data.originalLateMinutes) {
                changes.push(`Late Minutes: ${data.originalLateMinutes || 0} → ${data.lateMinutes}`);
            }
            if (data.earlyCheckoutMinutes !== data.originalEarlyCheckout) {
                changes.push(`Early Checkout: ${data.originalEarlyCheckout || 0} → ${data.earlyCheckoutMinutes}`);
            }
            if (data.otherMinutes > 0) {
                changes.push(`Other Minutes: ${data.otherMinutes}`);
            }
            if (data.shiftOverride?.enabled) {
                changes.push('Shift Override Applied');
            }
            
            // Fire-and-forget audit log - don't block or fail the save
            retryWithBackoff(() =>
                base44.functions.invoke('logAudit', {
                    action: 'UPDATE',
                    entity_type: 'DailyBreakdown',
                    entity_id: analysisResult.id,
                    entity_name: `${attendanceId} - ${dayRecord.date}`,
                    old_data: {
                        lateMinutes: data.originalLateMinutes || 0,
                        earlyCheckoutMinutes: data.originalEarlyCheckout || 0,
                        otherMinutes: data.originalOtherMinutes || 0
                    },
                    new_data: {
                        type: data.type,
                        lateMinutes: data.lateMinutes,
                        earlyCheckoutMinutes: data.earlyCheckoutMinutes,
                        otherMinutes: data.otherMinutes,
                        shiftOverride: data.shiftOverride?.enabled ? data.shiftOverride : null
                    },
                    details: `Daily breakdown edited: ${changes.join(', ')}`,
                    company: project.company
                })
            ).catch(e => console.error('Failed to log audit:', e));
        },
        onSuccess: () => {
            // Updated invalidation to match query key structure in ReportDetailView
            queryClient.invalidateQueries(['results', project.id]);
            queryClient.invalidateQueries(['results', analysisResult.report_run_id]);
            queryClient.invalidateQueries(['exceptions', project.id]);
            toast.success((isUser && !isSupervisor) ? 'Edit saved - will be submitted for approval when report is saved' : 'Day record updated for this report');
            if (onSave) onSave();
            onClose();
        },
        onError: (error) => {
            console.error('Update day record error:', error);
            toast.error('Failed to save changes. Please try again.');
        }
    });

    const recalculateTotals = (result, overrides) => {
        // Recalculate totals based on original + day overrides
        let totalLateMinutes = result.late_minutes || 0;
        let totalEarlyCheckoutMinutes = result.early_checkout_minutes || 0;
        let totalOtherMinutes = result.other_minutes || 0;
        const abnormalDates = new Set();
        
        // Parse existing abnormal dates
        if (result.abnormal_dates && typeof result.abnormal_dates === 'string') {
            result.abnormal_dates.split(',').filter(Boolean).forEach(d => abnormalDates.add(d));
        }
        
        // Apply overrides to adjust totals
        if (overrides && typeof overrides === 'object') {
            Object.entries(overrides).forEach(([dateStr, override]) => {
                if (override) {
                    // Subtract original values and add new values
                    const originalLate = override.originalLateMinutes || 0;
                    const originalEarly = override.originalEarlyCheckout || 0;
                    const originalOther = override.originalOtherMinutes || 0;
                    
                    totalLateMinutes = totalLateMinutes - originalLate + (override.lateMinutes || 0);
                    totalEarlyCheckoutMinutes = totalEarlyCheckoutMinutes - originalEarly + (override.earlyCheckoutMinutes || 0);
                    totalOtherMinutes = totalOtherMinutes - originalOther + (override.otherMinutes || 0);
                    
                    // Update abnormal dates
                    if (override.isAbnormal === true) {
                        abnormalDates.add(dateStr);
                    } else if (override.isAbnormal === false) {
                        abnormalDates.delete(dateStr);
                    }
                }
            });
        }
        
        // Recalculate deductible minutes with correct formula
        // Grace = result.grace_minutes (already calculated from base + carried)
        // baseAfterGrace = max(0, (late + early) - grace)
        // deductible = max(0, baseAfterGrace - approved)
        // CRITICAL: other_minutes are NEVER included in deductible calculation
        const totalGrace = result.grace_minutes || 0;
        const baseMinutes = totalLateMinutes + totalEarlyCheckoutMinutes;
        const baseAfterGrace = Math.max(0, baseMinutes - totalGrace);
        const approvedMinutes = result.approved_minutes || 0;
        const deductibleMinutes = Math.max(0, baseAfterGrace - approvedMinutes);
        
        return {
            late_minutes: totalLateMinutes,
            early_checkout_minutes: totalEarlyCheckoutMinutes,
            other_minutes: totalOtherMinutes,
            deductible_minutes: deductibleMinutes,
            abnormal_dates: Array.from(abnormalDates).filter(Boolean).join(',') || ''
        };
    };

    /**
     * Clears only the four shift override time fields (am_start, am_end,
     * pm_start, pm_end) inside formData.shiftOverride to empty strings.
     * The section toggle/visibility remains unchanged.
     */
    const clearShiftOverrideTimes = () => {
        setFormData(prev => ({
            ...prev,
            shiftOverride: {
                ...prev.shiftOverride,
                am_start: '',
                am_end: '',
                pm_start: '',
                pm_end: ''
            }
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!dayRecord || !analysisResult) return;
        
        const [day, month, year] = dayRecord.date.split('/');
        const dateStr = `${year}-${month}-${day}`;
        
        // Check if there's already an override for this date
        let existingOverride = null;
        if (analysisResult.day_overrides) {
            try {
                const overrides = JSON.parse(analysisResult.day_overrides);
                existingOverride = overrides[dateStr];
            } catch (e) {}
        }
        
        // Parse original values from dayRecord (only if not already edited)
        let originalLateMinutes = existingOverride?.originalLateMinutes;
        let originalEarlyCheckout = existingOverride?.originalEarlyCheckout;
        let originalOtherMinutes = existingOverride?.originalOtherMinutes;
        
        // If no existing override, calculate from display values
        if (originalLateMinutes === undefined) {
            originalLateMinutes = 0;
            if (dayRecord.lateInfo && dayRecord.lateInfo !== '-') {
                const matches = dayRecord.lateInfo.match(/(\d+)/g);
                if (matches) {
                    originalLateMinutes = parseInt(matches[0]) || 0;
                }
            }
        }
        
        if (originalOtherMinutes === undefined) {
            originalOtherMinutes = 0;
        }
        
        if (originalEarlyCheckout === undefined) {
            originalEarlyCheckout = 0;
            if (dayRecord.earlyCheckoutInfo && dayRecord.earlyCheckoutInfo !== '-') {
                const matches = dayRecord.earlyCheckoutInfo.match(/(\d+)/g);
                if (matches) {
                    originalEarlyCheckout = parseInt(matches[0]) || 0;
                }
            }
        }
        
        updateDayMutation.mutate({
            ...formData,
            originalLateMinutes,
            originalEarlyCheckout,
            originalOtherMinutes
        });
    };

    if (!dayRecord) return null;

    const dayPunches = getDayPunches();

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Day Record: {(() => {
                        if (typeof dayRecord?.date === 'string' && dayRecord.date.includes('/')) {
                            const parts = dayRecord.date.split('/');
                            if (parts.length === 3) {
                                return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
                            }
                        }
                        return dayRecord?.date;
                    })()}</DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                        {(isUser && !isSupervisor) 
                            ? 'Your changes will be submitted for admin approval' 
                            : 'Changes apply only to this specific report'}
                    </p>
                </DialogHeader>
                {(isUser && !isSupervisor) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                        <p className="text-sm text-amber-800">
                            ⚠️ Your edits will be saved to this report and submitted for admin approval when you click "Save Report".
                        </p>
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                    <div>
                        <Label>Status Override</Label>
                        <Select
                            value={formData.type}
                            onValueChange={(value) => setFormData({ ...formData, type: value })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {getFilteredExceptionTypes('day_override', isAdmin || isSupervisor).map(type => (
                                    <SelectItem key={type.value} value={type.value}>
                                        {type.label || formatExceptionTypeLabel(type.value)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Punch Times (Read-only display) */}
                    <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
                        <Label className="text-base font-semibold">Punch Times (Read-only)</Label>
                        {dayPunches.length === 0 ? (
                            <p className="text-sm text-slate-500 italic">No punches recorded for this day</p>
                        ) : (
                            <div className="space-y-1">
                                {dayPunches
                                    .slice()
                                    .sort((a, b) => {
                                        const getISO = (p) => {
                                            if (!p.timestamp_raw) return '';
                                            const time = p.timestamp_raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*[AP]M)?/i);
                                            if (p.punch_date && time) {
                                                let [_, h, m, s, period] = time;
                                                let hr = parseInt(h);
                                                if (period?.toUpperCase().trim() === 'PM' && hr !== 12) hr += 12;
                                                if (period?.toUpperCase().trim() === 'AM' && hr === 12) hr = 0;
                                                return `${p.punch_date}T${String(hr).padStart(2, '0')}:${m.padStart(2, '0')}:${(s || '00').padStart(2, '0')}`;
                                            }
                                            return p.timestamp_raw;
                                        };
                                        return new Date(getISO(a)) - new Date(getISO(b));
                                    })
                                    .map((punch, idx) => {
                                        // Parse and strictly format the punch timestamp: DD/MM/YYYY hh:mm AM/PM
                                        // Construct Date object using safe ISO string (YYYY-MM-DDTHH:mm:ss) to prevent MM/DD swap bugs
                                        let pDate = new Date(punch.timestamp_raw);
                                        const timeMatch = punch.timestamp_raw?.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*[AP]M)?/i);
                                        if (punch.punch_date && timeMatch) {
                                            let [_, h, m, s, period] = timeMatch;
                                            let hr = parseInt(h);
                                            if (period?.toUpperCase().trim() === 'PM' && hr !== 12) hr += 12;
                                            if (period?.toUpperCase().trim() === 'AM' && hr === 12) hr = 0;
                                            pDate = new Date(`${punch.punch_date}T${String(hr).padStart(2, '0')}:${m.padStart(2, '0')}:${(s || '00').padStart(2, '0')}`);
                                        }

                                        let displayTime = punch.timestamp_raw;
                                        if (!isNaN(pDate.getTime())) {
                                            const dPart = pDate.toLocaleDateString('en-GB'); // DD/MM/YYYY
                                            const tPart = pDate.toLocaleTimeString('en-US', { 
                                                hour: '2-digit', 
                                                minute: '2-digit', 
                                                hour12: true 
                                            }); // hh:mm AM/PM
                                            displayTime = `${dPart} ${tPart}`;
                                        }

                                        // Identify if this punch belongs to the next calendar day (midnight crossover)
                                        const isNextDay = punch.punch_date && dayRecord.dateStr && punch.punch_date !== dayRecord.dateStr;

                                        return (
                                            <div key={punch.id || idx} className="text-sm text-slate-700 flex items-center gap-2 py-0.5">
                                                <span className="font-medium text-slate-400 w-5">{idx + 1}.</span>
                                                <span className="tabular-nums">{displayTime}</span>
                                                {isNextDay && (
                                                    <span className="bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-[4px] text-[10px] ml-auto flex items-center justify-center min-w-[1.5rem]">
                                                        🌙
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>

                    {/* Late Minutes */}
                    <div>
                        <Label htmlFor="lateMinutes">Late Minutes (Total)</Label>
                        <Input
                            id="lateMinutes"
                            type="number"
                            min="0"
                            value={formData.lateMinutes}
                            onChange={(e) => setFormData({ ...formData, lateMinutes: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Combined AM + PM late minutes{formData.shiftOverride.enabled && ' (auto-calculated from shift override but editable)'}
                        </p>
                    </div>

                    {/* Early Checkout Minutes */}
                    <div>
                        <Label htmlFor="earlyCheckoutMinutes">Early Checkout Minutes (Total)</Label>
                        <Input
                            id="earlyCheckoutMinutes"
                            type="number"
                            min="0"
                            value={formData.earlyCheckoutMinutes}
                            onChange={(e) => setFormData({ ...formData, earlyCheckoutMinutes: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Combined AM + PM early checkout minutes{formData.shiftOverride.enabled && ' (auto-calculated from shift override but editable)'}
                        </p>
                    </div>

                    {/* Other Minutes */}
                    <div>
                        <Label htmlFor="otherMinutes">Other Minutes</Label>
                        <Input
                            id="otherMinutes"
                            type="number"
                            min="0"
                            value={formData.otherMinutes}
                            onChange={(e) => setFormData({ ...formData, otherMinutes: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Manually add other late/early minutes not captured by regular calculations.
                        </p>
                    </div>

                    {/* Abnormality Toggle */}
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                        <Checkbox
                            id="isAbnormal"
                            checked={formData.isAbnormal}
                            onCheckedChange={(checked) => setFormData({ ...formData, isAbnormal: checked })}
                        />
                        <div className="flex-1">
                            <label htmlFor="isAbnormal" className="text-sm font-medium cursor-pointer">
                                Mark as Abnormal
                            </label>
                            <p className="text-xs text-slate-500">Flag this day for special attention</p>
                        </div>
                    </div>

                    {/* Shift Override Section */}
                    <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="enableShiftOverride"
                                checked={formData.shiftOverride.enabled}
                                onCheckedChange={(checked) => setFormData({ 
                                    ...formData, 
                                    shiftOverride: { ...formData.shiftOverride, enabled: checked }
                                })}
                            />
                            <div className="flex-1">
                                <label htmlFor="enableShiftOverride" className="text-sm font-semibold cursor-pointer">
                                    Override Shift Times for This Day
                                </label>
                                <p className="text-xs text-slate-500">Late/Early calculations will use these times</p>
                            </div>
                            {/* Clear Shift Override Button: Resets the four time input fields to empty strings */}
                            {formData.shiftOverride.enabled && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={clearShiftOverrideTimes}
                                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                    Clear Shift Override
                                </Button>
                            )}
                        </div>

                        {formData.shiftOverride.enabled && (
                            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                                <div>
                                    <Label className="text-xs">AM Start</Label>
                                    <TimePicker
                                        value={formData.shiftOverride.am_start}
                                        onChange={(value) => setFormData({
                                            ...formData,
                                            shiftOverride: { ...formData.shiftOverride, am_start: value }
                                        })}
                                        placeholder="8:00 AM"
                                        className="h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">AM End</Label>
                                    <TimePicker
                                        value={formData.shiftOverride.am_end}
                                        onChange={(value) => setFormData({
                                            ...formData,
                                            shiftOverride: { ...formData.shiftOverride, am_end: value }
                                        })}
                                        placeholder="12:00 PM"
                                        className="h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">PM Start</Label>
                                    <TimePicker
                                        value={formData.shiftOverride.pm_start}
                                        onChange={(value) => setFormData({
                                            ...formData,
                                            shiftOverride: { ...formData.shiftOverride, pm_start: value }
                                        })}
                                        placeholder="1:00 PM"
                                        className="h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">PM End</Label>
                                    <TimePicker
                                        value={formData.shiftOverride.pm_end}
                                        onChange={(value) => setFormData({
                                            ...formData,
                                            shiftOverride: { ...formData.shiftOverride, pm_end: value }
                                        })}
                                        placeholder="5:00 PM"
                                        className="h-8"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <Label>Notes/Reason</Label>
                        <Input
                            value={formData.details}
                            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                            placeholder="Reason for manual edit"
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={updateDayMutation.isPending}>
                            {updateDayMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}