import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchAllRecords } from '../utils/paginatedFetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
// Table components used by DailyBreakdownDialog (extracted)
import useDetectionAnalysis, { extractTime } from './useDetectionAnalysis';
import { Download, Search, Save, Filter, Loader2, CheckCircle, Zap } from 'lucide-react';
import EditDayRecordDialog from './EditDayRecordDialog';
import DetectionPanel from './DetectionPanel';
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SortableTableHead from '../ui/SortableTableHead';
import { toast } from 'sonner';
import { GraceMinutesDialog, SaveConfirmationDialog, FinalizationProgressDialog } from './ReportDetailDialogs';
import DailyBreakdownDialog from './DailyBreakdownDialog';
import ReportTableRow from './ReportTableRow';
import * as XLSX from 'xlsx';
import ExcelPreviewDialog from '@/components/ui/ExcelPreviewDialog';

export default function ReportDetailView({ reportRun, project, isDepartmentHead = false, deptHeadVerification = null }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [editingDay, setEditingDay] = useState(null);
    const [editingGraceMinutes, setEditingGraceMinutes] = useState(null);
    const [sort, setSort] = useState({ key: 'deductible_minutes', direction: 'desc' });
    
    // Preview state for Excel export
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [previewHeaders, setPreviewHeaders] = useState([]);
    const [verifiedEmployees, setVerifiedEmployees] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
    const [saveProgress, setSaveProgress] = useState(null);
    const [riskFilter, setRiskFilter] = useState('all');
    const [finalizationProgress, setFinalizationProgress] = useState({
        open: false,
        current: 0,
        total: 0,
        currentEmployee: '',
        status: 'Processing...'
    });
    const [giftMinutesOverrides, setGiftMinutesOverrides] = useState({});
    
    // Detection panel state managed in DetectionPanel component

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me(),
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isUser = userRole === 'user'; const isAdmin = userRole === 'admin'; const isSupervisor = userRole === 'supervisor';
    const isCEO = userRole === 'ceo'; const isHRManager = userRole === 'hr_manager'; const canEditGiftMinutes = isAdmin || isCEO || isHRManager;
    const isAlMaraghiMotors = project.company === 'Al Maraghi Motors';

    // LAZY LOADING: Raw data (punches/shifts/exceptions) only loaded on-demand
    // when user opens daily breakdown, detection panel, or edits a day.
    // The summary table uses STORED AnalysisResult values (no client-side recalculation).
    const [rawDataRequested, setRawDataRequested] = useState(false);

    // PARALLEL LOADING: All three raw data queries fire simultaneously when requested.
    // Previously chained sequentially (punches → shifts → exceptions), adding unnecessary latency.
    const rawDataQueryOpts = { staleTime: 10*60*1000, gcTime: 15*60*1000, refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false, enabled: rawDataRequested };
    const { data: punches = [], isFetched: punchesDone } = useQuery({ queryKey: ['projectPunches', project.id], queryFn: () => fetchAllRecords(base44.entities.Punch, { project_id: project.id }), ...rawDataQueryOpts });
    const { data: shifts = [], isFetched: shiftsDone } = useQuery({ queryKey: ['projectShifts', project.id], queryFn: () => fetchAllRecords(base44.entities.ShiftTiming, { project_id: project.id }), ...rawDataQueryOpts });
    const { data: exceptions = [], isFetched: exceptionsDone } = useQuery({ queryKey: ['projectExceptions', project.id], queryFn: () => fetchAllRecords(base44.entities.Exception, { project_id: project.id }), ...rawDataQueryOpts });
    const allRawDataLoaded = punchesDone && shiftsDone && exceptionsDone;

    const { data: allResults = [], isLoading: resultsLoading } = useQuery({
        queryKey: ['results', reportRun.id, project.id],
        queryFn: async () => {
            // Fast path: fetch by report_run_id with large limit (avoids slow pagination for most reports)
            let results = await base44.entities.AnalysisResult.filter({ report_run_id: reportRun.id }, null, 500);
            if (results.length === 500) {
                // Rare: more than 500 employees, fall back to paginated fetch
                results = await fetchAllRecords(base44.entities.AnalysisResult, { report_run_id: reportRun.id });
            }
            if (results.length === 0 && project?.id && (project.status === 'closed' || reportRun.is_final)) {
                let byProject = await base44.entities.AnalysisResult.filter({ project_id: project.id }, null, 500);
                if (byProject.length === 500) {
                    byProject = await fetchAllRecords(base44.entities.AnalysisResult, { project_id: project.id });
                }
                const matchingRun = byProject.filter(r => r.report_run_id === reportRun.id);
                if (matchingRun.length > 0) return matchingRun;
                if (byProject.length > 0) return byProject;
            }
            return results;
        },
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: allReportRuns = [] } = useQuery({
        queryKey: ['reportRuns', project.id],
        queryFn: () => base44.entities.ReportRun.filter({ project_id: project.id }, null, 100),
        enabled: !!project?.id,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: allEmployees = [], isLoading: employeesLoading } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: async () => {
            // Fast path: single call with large limit for most companies
            const results = await base44.entities.Employee.filter({ company: project.company }, null, 500);
            if (results.length === 500) {
                return fetchAllRecords(base44.entities.Employee, { company: project.company });
            }
            return results;
        },
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: companyRecord = null } = useQuery({
        queryKey: ['companyByName', project.company],
        queryFn: async () => {
            const companies = await base44.entities.Company.filter({ name: project.company }, null, 10);
            return companies[0] || null;
        },
        enabled: !!project?.company,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: ramadanSchedules = [] } = useQuery({
        queryKey: ['ramadanSchedules', project.company],
        queryFn: () => base44.entities.RamadanSchedule.filter({ company: project.company, active: true }, null, 500),
        enabled: !!project?.company,
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const shiftEndsNearMidnight = (shift) => {
        const tEnd = parseTime(shift?.pm_end) || parseTime(shift?.am_end);
        if (!tEnd) return false;
        const h = tEnd.getHours();
        return h === 23 || h === 0 || h === 1;
    };

    /**
     * Check if a shift starts near midnight (11 PM, 12 AM, 1 AM, or 2 AM)
     */
    const shiftStartsNearMidnight = (shift) => {
        const tStart = parseTime(shift?.am_start);
        if (!tStart) return false;
        const h = tStart.getHours();
        return h === 23 || h === 0 || h === 1 || h === 2;
    };

    // Filter employees and results for department heads - MUST use managed_employee_ids
    const employees = React.useMemo(() => {
        if (!isDepartmentHead || !deptHeadVerification?.verified) {
            return allEmployees;
        }

        const managedIds = deptHeadVerification.assignment.managed_employee_ids
            ? deptHeadVerification.assignment.managed_employee_ids.split(',').map(id => String(id.trim()))
            : [];

        if (managedIds.length === 0) return [];

        // Filter to only managed subordinates using Employee IDs (not HRMS IDs)
        // CRITICAL: Exclude department head from the list
        return allEmployees.filter(emp =>
            managedIds.includes(String(emp.id)) &&
            String(emp.id) !== String(deptHeadVerification.assignment.employee_id)
        );
    }, [allEmployees, isDepartmentHead, deptHeadVerification]);

    const results = React.useMemo(() => {
        if (!isDepartmentHead || !deptHeadVerification?.verified) {
            return allResults;
        }

        // For finalized/closed projects, prioritize results that have deductible_minutes stored
        // (i.e. results that belong to the actual finalized report run)
        const isFinalized = reportRun.is_final || project.status === 'closed';
        let sourceResults = allResults;
        if (isFinalized && allResults.length > 0) {
            // Prefer results that have this specific report_run_id
            const withRunId = allResults.filter(r => r.report_run_id === reportRun.id);
            if (withRunId.length > 0) sourceResults = withRunId;
        }

        // Filter results to only show department head's subordinates
        const departmentAttendanceIds = employees.map(emp => String(emp.attendance_id));
        return sourceResults.filter(result =>
            departmentAttendanceIds.includes(String(result.attendance_id))
        );
    }, [allResults, isDepartmentHead, deptHeadVerification, employees, reportRun, project]);

    React.useEffect(() => {
        if (reportRun.verified_employees) {
            setVerifiedEmployees(reportRun.verified_employees.split(',').filter(Boolean));
        }
    }, [reportRun]);

    // Midnight buffer: 2 hours (120 minutes) for Ramadan night shifts crossover
    const MIDNIGHT_BUFFER_MINUTES = 120;

    // Dismissed mismatch state now managed inside DetectionPanel component

    const formatTime = (timeStr) => {
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

    const parseTime = (timeStr) => {
        try {
            if (!timeStr || timeStr === '—' || timeStr === '-') return null;

            // Priority 1: Format with seconds
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

            // Priority 2: Standard AM/PM
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

            // Priority 3: 24-hour with optional seconds
            timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            if (timeMatch) {
                const hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const seconds = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
                const date = new Date();
                date.setHours(hours, minutes, seconds, 0);
                return date;
            }

            // Handle timestamp_raw format: "1/16/2026 8:37"
            const dateTimeMatch = timeStr.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (dateTimeMatch) {
                const hours = parseInt(dateTimeMatch[1]);
                const minutes = parseInt(dateTimeMatch[2]);
                const seconds = dateTimeMatch[3] ? parseInt(dateTimeMatch[3]) : 0;
                const date = new Date();
                date.setHours(hours, minutes, seconds, 0);
                return date;
            }

            return null;
        } catch {
            return null;
        }
    };

    const isWithinMidnightBuffer = (timestampRaw) => {
        const parsed = parseTime(timestampRaw);
        if (!parsed) return false;
        const minutesSinceMidnight = parsed.getHours() * 60 + parsed.getMinutes();
        return minutesSinceMidnight <= MIDNIGHT_BUFFER_MINUTES;
    };

    const matchPunchesToShiftPoints = (dayPunches, shift, nextDateStr = null) => {
        if (!shift || dayPunches.length === 0) return [];

        // Enable seconds parsing for Al Maraghi Automotive
        const includeSeconds = project.company === 'Al Maraghi Automotive' || project.company === 'Al Maraghi Motors';

        const punchesWithTime = dayPunches.map(p => {
            const time = parseTime(p.timestamp_raw);
            if (!time) return null;

            // MIDNIGHT SHIFT FIX: If this punch is from next day (midnight crossover),
            // add 24 hours to its time so it matches correctly against PM_END
            const isNextDayPunch = nextDateStr && p.punch_date === nextDateStr;
            const adjustedTime = isNextDayPunch ? new Date(time.getTime() + 24 * 60 * 60 * 1000) : time;

            return {
                ...p,
                time: adjustedTime,
                _isNextDayPunch: isNextDayPunch
            };
        }).filter(p => p).sort((a, b) => a.time - b.time);

        if (punchesWithTime.length === 0) return [];

        // MIDNIGHT SHIFT FIX: If shift ends at midnight (0:00), adjust PM_END to 24:00 (next day)
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

            for (const shiftPoint of shiftPoints) {
                if (usedShiftPoints.has(shiftPoint.type)) continue;

                const distance = Math.abs(punch.time - shiftPoint.time) / (1000 * 60);

                if (distance <= 60 && distance < minDistance) {
                    minDistance = distance;
                    closestMatch = shiftPoint;
                }
            }

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




    const filterMultiplePunches = (punchList, shift) => {
        if (punchList.length <= 1) return punchList;

        const punchesWithTime = punchList.map(p => ({
            ...p,
            time: parseTime(p.timestamp_raw)
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

    // calculateEmployeeTotals removed — summary table now uses stored AnalysisResult values.
    // Backend recalcEmployeeTotals handles recalculation after day edits.

    const hasAnyGiftMinutes = results.some(r => (r.ramadan_gift_minutes || 0) > 0);
    /**
     * Change 3 - Gift Minutes Visibility
     * Ensuring the column is visible to all users when project setting is active
     * or if there's any data, while edit permissions remain role-restricted.
     */
    const showGiftMinutesColumn = (project?.use_gift_minutes || hasAnyGiftMinutes);

    // ALWAYS use stored AnalysisResult values for the summary table.
    // No client-side recalculation from raw punch data.
    // When user edits a day, the backend recalcEmployeeTotals function recalculates and updates the stored values.
    const baseEnrichedResults = React.useMemo(() => {
        return results.map(result => {
            const employee = employees.find(e => String(e.attendance_id) === String(result.attendance_id));

            // Use stored values for ALL reports (both finalized and non-finalized)
            const lateMin = result.late_minutes || 0;
            const earlyMin = result.early_checkout_minutes || 0;
            const graceMin = result.grace_minutes ?? 15;
            const approvedMin = result.approved_minutes || 0;
            const storedDeductible = result.manual_deductible_minutes ?? result.deductible_minutes ?? null;
            const computedDeductible = Math.max(0, lateMin + earlyMin - graceMin - approvedMin);
            const effectiveDeductible = storedDeductible !== null ? storedDeductible : computedDeductible;
            const giftMins = giftMinutesOverrides[result.id] || Math.max(0, result.ramadan_gift_minutes || 0);

            return {
                ...result,
                name: employee?.name || 'Unknown',
                working_days: result.working_days || 0,
                present_days: result.manual_present_days ?? result.present_days ?? 0,
                full_absence_count: result.manual_full_absence_count ?? result.full_absence_count ?? 0,
                half_absence_count: result.half_absence_count || 0,
                sick_leave_count: result.manual_sick_leave_count ?? result.sick_leave_count ?? 0,
                annual_leave_count: result.manual_annual_leave_count ?? result.annual_leave_count ?? 0,
                late_minutes: lateMin,
                early_checkout_minutes: earlyMin,
                other_minutes: result.other_minutes || 0,
                approved_minutes: approvedMin,
                deductible_minutes: effectiveDeductible,
                ramadan_gift_minutes: giftMins,
                effective_deductible_minutes: Math.max(0, effectiveDeductible - giftMins),
                grace_minutes: graceMin,
                has_no_punches: false // Will be determined when raw data is loaded
            };
        });
    }, [results, employees, reportRun, project, giftMinutesOverrides]);

    // Add verification state separately to avoid expensive recalculations
    const enrichedResults = React.useMemo(() => {
        return baseEnrichedResults.map(result => ({
            ...result,
            isVerified: verifiedEmployees.includes(String(result.attendance_id))
        }));
    }, [baseEnrichedResults, verifiedEmployees]);

    const filteredResults = React.useMemo(() => {
        return enrichedResults
            .filter(result => {
                const matchesSearch = String(result.attendance_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
                    result.name.toLowerCase().includes(searchTerm.toLowerCase());

                if (!matchesSearch) return false;

                // Risk-based filtering
                if (riskFilter === 'high-risk') {
                    const total = (result.late_minutes || 0) + (result.early_checkout_minutes || 0);
                    const hasHighAbsence = result.full_absence_count > 2;
                    const hasHighMinutes = total > 120;
                    return hasHighAbsence || hasHighMinutes;
                } else if (riskFilter === 'clean') {
                    const total = (result.late_minutes || 0) + (result.early_checkout_minutes || 0);
                    return result.full_absence_count === 0 && total === 0;
                } else if (riskFilter === 'unverified') {
                    return !result.isVerified;
                }

                return true;
            })
            .sort((a, b) => {
                // Always push "no punches" employees to the end
                if (a.has_no_punches && !b.has_no_punches) return 1;
                if (!a.has_no_punches && b.has_no_punches) return -1;

                let aVal = a[sort.key];
                let bVal = b[sort.key];

                // For deductible sorting, use effective deductible if available
                if (sort.key === 'deductible_minutes') {
                    aVal = a.effective_deductible_minutes ?? a.deductible_minutes ?? 0;
                    bVal = b.effective_deductible_minutes ?? b.deductible_minutes ?? 0;
                }

                // Handle null/undefined values - push them to the end
                if (aVal == null && bVal == null) return 0;
                if (aVal == null) return 1;
                if (bVal == null) return -1;

                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();

                if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [enrichedResults, searchTerm, riskFilter, sort]);

    // ==========================================================================================
    // DETECTION LOGIC: SHIFT MISMATCH & NO MATCH (Isolated Feature)
    // This block identifies problematic records based on punch data vs shift configuration.
    // ==========================================================================================

    // Detection analysis hook - only runs when raw data is loaded
    const { shiftMismatchDetections, noMatchDetections, localParseTime, localIsWithinMidnightBuffer } = useDetectionAnalysis({
        results, employees, punches, shifts, exceptions, reportRun, project
    });

    // Trigger raw data loading when user needs it
    const loadRawData = React.useCallback(() => {
        if (!rawDataRequested) setRawDataRequested(true);
    }, [rawDataRequested]);

    const updateVerificationMutation = useMutation({
        mutationFn: (verifiedList) => base44.entities.ReportRun.update(reportRun.id, {
            verified_employees: verifiedList.join(',')
        }),
        onSuccess: () => {
            // Don't invalidate - local state is already updated
        },
        onError: () => {
            // Only invalidate on error to refetch correct state
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
            toast.error('Failed to update verification');
        },
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(2000 * Math.pow(2, attemptIndex), 15000)
    });

    // Debounce verification updates to prevent rate limiting
    const debounceTimeoutRef = React.useRef(null);
    const pendingVerifiedRef = React.useRef(null);

    const toggleVerification = (attendanceId) => {
        const attendanceIdStr = String(attendanceId);
        const newVerified = verifiedEmployees.includes(attendanceIdStr)
            ? verifiedEmployees.filter(id => id !== attendanceIdStr)
            : [...verifiedEmployees, attendanceIdStr];

        // Update local state immediately for instant UI feedback
        setVerifiedEmployees(newVerified);

        // Store pending changes
        pendingVerifiedRef.current = newVerified;

        // Clear existing timeout
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        // Debounce the API call by 3s to batch clicks & avoid rate limits
        debounceTimeoutRef.current = setTimeout(() => {
            if (pendingVerifiedRef.current) {
                updateVerificationMutation.mutate(pendingVerifiedRef.current);
                pendingVerifiedRef.current = null;
            }
        }, 3000);
    };

    // Cleanup timeout on unmount and save pending changes
    React.useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
            // Save any pending changes before unmount
            if (pendingVerifiedRef.current) {
                updateVerificationMutation.mutate(pendingVerifiedRef.current);
            }
        };
    }, []);

    const verifyAllClean = () => {
        const cleanEmployees = enrichedResults
            .filter(r => {
                const total = (r.late_minutes || 0) + (r.early_checkout_minutes || 0);
                return r.full_absence_count === 0 && total === 0;
            })
            .map(r => String(r.attendance_id));

        const newVerified = [...new Set([...verifiedEmployees, ...cleanEmployees])];
        setVerifiedEmployees(newVerified);
        updateVerificationMutation.mutate(newVerified);
        toast.success(`${cleanEmployees.length} employees verified`);
    };

    const unfinalizeReportMutation = useMutation({
        mutationFn: async () => {
            const result = await base44.functions.invoke('unfinalizeReport', {
                project_id: project.id,
                report_run_id: reportRun.id
            });
            return result.data;
        },
        onSuccess: async (data) => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['reportRun', reportRun.id] }),
                queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id] })
            ]);
            toast.success(`Report un-finalized! ${data.deleted_snapshots} salary snapshots deleted.`);
        },
        onError: (error) => {
            const errorMsg = error?.response?.data?.error || error.message || 'Unknown error';
            toast.error('Failed to un-finalize report: ' + errorMsg);
        }
    });

    const finalizeReportMutation = useMutation({
        mutationFn: async () => {

            // Show progress dialog
            setFinalizationProgress({
                open: true,
                current: 0,
                total: 0,
                currentEmployee: 'Saving current report values...',
                status: 'Please wait...'
            });

            // ============================================================
            // STEP 0: CRITICAL - Write the EXACT UI values into AnalysisResult
            // before marking final. This ensures what you see = what gets finalized.
            // NO backend recalculation. The frontend is the source of truth.
            // ============================================================
            const currentEnriched = baseEnrichedResults;
            let updatedCount = 0;

            for (const row of currentEnriched) {
                // Build update payload with the EXACT values shown in the UI table
                const updates = {};
                let needsUpdate = false;

                // Compare UI values with stored AnalysisResult values
                // Find the raw result to compare against
                const rawResult = results.find(r => r.id === row.id);
                if (!rawResult) continue;

                const fieldsToSync = [
                    { uiKey: 'working_days', dbKey: 'working_days' },
                    { uiKey: 'present_days', dbKey: 'present_days' },
                    { uiKey: 'full_absence_count', dbKey: 'full_absence_count' },
                    { uiKey: 'half_absence_count', dbKey: 'half_absence_count' },
                    { uiKey: 'sick_leave_count', dbKey: 'sick_leave_count' },
                    { uiKey: 'annual_leave_count', dbKey: 'annual_leave_count' },
                    { uiKey: 'late_minutes', dbKey: 'late_minutes' },
                    { uiKey: 'early_checkout_minutes', dbKey: 'early_checkout_minutes' },
                    { uiKey: 'other_minutes', dbKey: 'other_minutes' },
                    { uiKey: 'deductible_minutes', dbKey: 'deductible_minutes' },
                    { uiKey: 'grace_minutes', dbKey: 'grace_minutes' },
                ];

                for (const f of fieldsToSync) {
                    const uiVal = row[f.uiKey] ?? 0;
                    const dbVal = rawResult[f.dbKey] ?? 0;
                    if (Math.abs(uiVal - dbVal) > 0.01) {
                        updates[f.dbKey] = uiVal;
                        needsUpdate = true;
                    }
                }

                if (needsUpdate) {
                    await base44.entities.AnalysisResult.update(row.id, updates);
                    updatedCount++;
                }
            }

            // STEP 1: Mark report as final (no recalculation - just flag it)
            const markResult = await base44.functions.invoke('markFinalReport', {
                project_id: project.id,
                report_run_id: reportRun.id
            });


            if (markResult.data?.success === false) {
                console.error('[ReportDetailView] Backend validation failed:', markResult.data?.error);
                throw new Error(markResult.data?.error || 'Finalization failed');
            }

            // STEP 2: Create all salary snapshots using batch mode
            const BATCH_SIZE = 10;
            let batchStart = 0;
            let hasMore = true;
            let totalEmployees = 0;

            while (hasMore) {
                const batchResult = await base44.functions.invoke('createSalarySnapshots', {
                    project_id: project.id,
                    report_run_id: reportRun.id,
                    batch_mode: true,
                    batch_start: batchStart,
                    batch_size: BATCH_SIZE
                });

                if (batchResult.data?.batch_mode) {
                    totalEmployees = batchResult.data.total_employees;
                    const currentPos = batchResult.data.current_position;
                    const currentBatch = batchResult.data.current_batch || [];
                    hasMore = batchResult.data.has_more;

                    const percentage = totalEmployees > 0 ? Math.round(currentPos / totalEmployees * 100) : 0;

                    setFinalizationProgress(prev => ({
                        open: true,
                        current: currentPos,
                        total: totalEmployees,
                        currentEmployee: currentBatch.length > 0
                            ? `Processing: ${currentBatch.map(e => e.name).slice(0, 3).join(', ')}${currentBatch.length > 3 ? '...' : ''}`
                            : 'Processing...',
                        status: `Creating salary snapshots: ${currentPos} of ${totalEmployees} (${percentage}%)`
                    }));

                    batchStart = currentPos;

                    if (hasMore) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } else {
                    // Fallback if backend doesn't support batch_mode (unlikely)
                    hasMore = false;
                }
            }

            // STEP 3: Create checklist tasks for LOP and Other Minutes
            try {
                await base44.functions.invoke('createReportChecklistTasks', {
                    reportRunId: reportRun.id,
                    action: 'upsert'
                });
                console.log('[ReportDetailView] Auto-checklist tasks created successfully');
            } catch (checklistError) {
                console.warn('[ReportDetailView] Failed to create checklist tasks:', checklistError.message);
            }

            return markResult.data;
        },
        onSuccess: async () => {
            setFinalizationProgress(prev => ({
                ...prev,
                status: 'Refreshing data...',
                currentEmployee: 'Please wait...'
            }));

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['reportRun', reportRun.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['project', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id], refetchType: 'all' })
            ]);

            await new Promise(resolve => setTimeout(resolve, 1000));

            setFinalizationProgress({ open: false, current: 0, total: 0, currentEmployee: '', status: '' });
            toast.success('✅ Finalization complete! Salary snapshots created. Go to Salary Tab to generate reports.', {
                duration: 6000
            });
        },
        onError: async (error) => {
            console.error('[ReportDetailView] Finalization error:', error);

            setFinalizationProgress({ open: false, current: 0, total: 0, currentEmployee: '', status: '' });

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['reportRun', reportRun.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['project', project.id], refetchType: 'all' })
            ]);

            const errorMsg = error?.response?.data?.error || error.message || 'Unknown error';
            const actionRequired = error?.response?.data?.action_required;

            console.error('[ReportDetailView] Error details:', { errorMsg, actionRequired });

            if (actionRequired) {
                toast.error(`${errorMsg}\n\nAction required: ${actionRequired}`, {
                    duration: 10000
                });
            } else {
                toast.error('Failed to finalize report: ' + errorMsg, {
                    duration: 5000
                });
            }
        }
    });

    const saveReportMutation = useMutation({
        mutationFn: async () => {
            setIsSaving(true);
            setSaveProgress({ current: 0, total: 100, status: 'Validating date range...' });

            // BUSINESS LOGIC: Date-Range Protection & Conflict Prevention
            const newFrom = new Date(reportRun.date_from);
            const newTo = new Date(reportRun.date_to);
            const projectFrom = new Date(project.date_from);
            const projectTo = new Date(project.date_to);

            // Exception: If the report covers the entire project range, bypass the blocking rule
            const isFullProjectRange = 
                newFrom.toLocaleDateString() === projectFrom.toLocaleDateString() && 
                newTo.toLocaleDateString() === projectTo.toLocaleDateString();

            if (!isFullProjectRange) {
                // Blocking Rule: Check for overlaps with already saved reports
                const overlappingReport = allReportRuns.find(run => {
                    // Only check reports marked as saved, and exclude the current report
                    if (!run.is_saved || run.id === reportRun.id) return false;
                    
                    const savedFrom = new Date(run.date_from);
                    const savedTo = new Date(run.date_to);
                    
                    // Standard overlap formula: (StartA <= EndB) and (EndA >= StartB)
                    return (newFrom <= savedTo) && (newTo >= savedFrom);
                });

                if (overlappingReport) {
                    const rangeText = `${new Date(overlappingReport.date_from).toLocaleDateString()} - ${new Date(overlappingReport.date_to).toLocaleDateString()}`;
                    const errorMsg = `Overlap Detected: A saved report already exists for part of this period (${rangeText}). Save blocked to prevent data conflicts.`;
                    throw new Error(errorMsg);
                }
            }

            setSaveProgress({ current: 0, total: 100, status: 'Preparing exceptions...' });

            // Set this as a saved report (persists regardless of newer reports)
            // Also maintain last_saved_report_id on project for legacy support
            await Promise.all([
                base44.entities.ReportRun.update(reportRun.id, { is_saved: true }),
                base44.entities.Project.update(project.id, { last_saved_report_id: reportRun.id })
            ]);

            // Delete existing report-generated exceptions for this report to prevent duplicates
            const existingReportExceptions = exceptions.filter(e =>
                e.created_from_report && e.report_run_id === reportRun.id
            );

            if (existingReportExceptions.length > 0) {
                setSaveProgress({ current: 0, total: 100, status: 'Removing old exceptions...' });
                for (const ex of existingReportExceptions) {
                    await base44.entities.Exception.delete(ex.id);
                }
            }

            const exceptionsToCreate = [];

            // Determine if current user made any edits that need approval
            const isCurrentUserRegular = userRole === 'user' && !isSupervisor;

            for (const result of results) {
                if (!result.day_overrides) continue;

                let dayOverrides = {};
                try {
                    dayOverrides = JSON.parse(result.day_overrides);
                } catch (e) {
                    continue;
                }

                // Check if this result's employee belongs to the current user
                const employee = employees.find(e => Number(e.attendance_id) === Number(result.attendance_id));
                const isOwnRecord = isCurrentUserRegular && currentUser && employee?.company === currentUser.company;

                const datesByType = {};
                Object.entries(dayOverrides).forEach(([dateStr, override]) => {
                    // Group by type, minutes, and shift override to create separate exceptions
                    const key = `${result.attendance_id}_${override.type}_${override.lateMinutes || 0}_${override.earlyCheckoutMinutes || 0}_${override.otherMinutes || 0}_${JSON.stringify(override.shiftOverride || {})}`;
                    if (!datesByType[key]) {
                        datesByType[key] = {
                            dates: [],
                            data: override,
                            attendance_id: result.attendance_id
                        };
                    }
                    datesByType[key].dates.push(dateStr);
                });

                for (const group of Object.values(datesByType)) {
                    const sortedDates = group.dates.sort();

                    // CRITICAL FIX: Time-based exceptions (late/early/other min) must be per-date,
                    // not spanning ranges — otherwise minutes apply to every day in the range.
                    const hasTimeMins = (group.data.lateMinutes > 0) || (group.data.earlyCheckoutMinutes > 0) || (group.data.otherMinutes > 0);
                    const ranges = [];

                    if (hasTimeMins) {
                        sortedDates.forEach(d => ranges.push({ start: d, end: d }));
                    } else {
                        let currentRange = { start: sortedDates[0], end: sortedDates[0] };
                        for (let i = 1; i < sortedDates.length; i++) {
                            const dayDiff = (new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / (1000 * 60 * 60 * 24);
                            if (dayDiff === 1) { currentRange.end = sortedDates[i]; }
                            else { ranges.push({ ...currentRange }); currentRange = { start: sortedDates[i], end: sortedDates[i] }; }
                        }
                        ranges.push(currentRange);
                    }

                    for (const range of ranges) {
                        // Edits from reports need department head approval
                        const needsApproval = true;

                        // Build detailed description
                        const detailsParts = [];
                        if (group.data.lateMinutes > 0) {
                            detailsParts.push(`+${group.data.lateMinutes} late min`);
                        }
                        if (group.data.earlyCheckoutMinutes > 0) {
                            detailsParts.push(`+${group.data.earlyCheckoutMinutes} early min`);
                        }
                        if (group.data.otherMinutes > 0) {
                            detailsParts.push(`+${group.data.otherMinutes} other min`);
                        }
                        if (group.data.shiftOverride) {
                            detailsParts.push('shift override');
                        }
                        if (group.data.details) {
                            detailsParts.push(group.data.details);
                        }

                        const detailsText = detailsParts.length > 0
                            ? `Report edit: ${detailsParts.join(' | ')}`
                            : 'Report edit: Manual adjustment from report';

                        const exceptionData = {
                            project_id: project.id,
                            attendance_id: String(group.attendance_id),
                            date_from: range.start,
                            date_to: range.end,
                            type: group.data.type,
                            details: detailsText,
                            created_from_report: true,
                            report_run_id: reportRun.id,
                            use_in_analysis: true,
                            approval_status: needsApproval ? 'pending_dept_head' : 'approved'
                        };

                        // Store ALL time adjustment fields
                        if (group.data.lateMinutes && group.data.lateMinutes > 0) {
                            exceptionData.late_minutes = group.data.lateMinutes;
                        }
                        if (group.data.earlyCheckoutMinutes && group.data.earlyCheckoutMinutes > 0) {
                            exceptionData.early_checkout_minutes = group.data.earlyCheckoutMinutes;
                        }
                        if (group.data.otherMinutes && group.data.otherMinutes > 0) {
                            exceptionData.other_minutes = group.data.otherMinutes;
                        }

                        // Determine type based on what's present (override the initial type)
                        if (group.data.shiftOverride) {
                            exceptionData.type = 'SHIFT_OVERRIDE';
                            exceptionData.new_am_start = group.data.shiftOverride.am_start;
                            exceptionData.new_am_end = group.data.shiftOverride.am_end;
                            exceptionData.new_pm_start = group.data.shiftOverride.pm_start;
                            exceptionData.new_pm_end = group.data.shiftOverride.pm_end;
                        } else if (exceptionData.late_minutes > 0 && exceptionData.early_checkout_minutes > 0) {
                            exceptionData.type = 'MANUAL_LATE';
                        } else if (exceptionData.late_minutes > 0 && exceptionData.early_checkout_minutes === 0) {
                            exceptionData.type = 'MANUAL_LATE';
                        } else if (exceptionData.early_checkout_minutes > 0 && exceptionData.late_minutes === 0) {
                            exceptionData.type = 'MANUAL_EARLY_CHECKOUT';
                        } else if (exceptionData.other_minutes > 0) {
                            exceptionData.type = 'MANUAL_OTHER_MINUTES';
                        }
                        // If none of the time fields are set, keep the original type from group.data.type

                        exceptionsToCreate.push(exceptionData);
                    }
                }
            }

            if (exceptionsToCreate.length > 0) {
                const batchSize = 10;
                const totalBatches = Math.ceil(exceptionsToCreate.length / batchSize);
                const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                // Retry helper with backoff
                const retryWithBackoff = async (fn, maxRetries = 3) => {
                    for (let i = 0; i < maxRetries; i++) {
                        try {
                            return await fn();
                        } catch (error) {
                            const isRateLimit = error.message?.includes('rate limit') || error.status === 429;
                            if (isRateLimit && i < maxRetries - 1) {
                                const backoffTime = Math.min(2000 * Math.pow(2, i), 10000);
                                await delay(backoffTime);
                                continue;
                            }
                            throw error;
                        }
                    }
                };

                for (let i = 0; i < exceptionsToCreate.length; i += batchSize) {
                    const batch = exceptionsToCreate.slice(i, i + batchSize);
                    const batchNumber = Math.floor(i / batchSize) + 1;

                    setSaveProgress({
                        current: batchNumber,
                        total: totalBatches,
                        status: `Saving exceptions ${batchNumber}/${totalBatches}...`
                    });

                    try {
                        await retryWithBackoff(() => base44.entities.Exception.bulkCreate(batch));
                        await delay(1500); // Delay between batches
                    } catch (error) {
                        console.error(`Batch ${batchNumber} failed, trying individual saves:`, error);
                        // Fallback to individual saves
                        for (const ex of batch) {
                            try {
                                await retryWithBackoff(() => base44.entities.Exception.create(ex));
                                await delay(500);
                            } catch (exError) {
                                console.error('Failed to save exception:', ex, exError);
                            }
                        }
                    }
                }
            }

            return exceptionsToCreate.length;
        },
        onSuccess: async (exceptionCount) => {
            queryClient.invalidateQueries(['exceptions', project.id]);
            queryClient.invalidateQueries(['reportRun', reportRun.id]);
            toast.success(`Report saved! ${exceptionCount} exception${exceptionCount !== 1 ? 's' : ''} created from edits.`);

            // Note: Approval links functionality removed - department heads now use pre-approval system

            setIsSaving(false);
            setSaveProgress(null);
        },
        onError: (error) => {
            toast.error('Failed to save report: ' + error.message);
            setIsSaving(false);
            setSaveProgress(null);
        }
    });

    // Helper to convert minutes to hours (decimal format, 2 decimal places)
    const minutesToHours = (minutes) => {
        if (!minutes || minutes === 0) return 0;
        return Math.round((minutes / 60) * 100) / 100; // e.g., 90 min = 1.50 hrs
    };

    const exportToExcel = () => {
        try {
            if (filteredResults.length === 0) {
                toast.error('No data to export');
                return;
            }

            const includeGiftMinutesInExport = showGiftMinutesColumn;

            // Build headers matching the visible table columns - using Hours instead of Minutes
            const headers = [
                'Attendance ID',
                'Name',
                'Has Punches',
                'Working Days',
                'Present Days',
                'Annual Leave',
                'Sick Leave',
                'LOP Days',
                ...(isAlMaraghiMotors ? ['+Weekly Off LOP'] : []),
                'Half Days',
                'Late (Hours)',
                'Early Checkout (Hours)',
                ...(project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' ? ['Approved (Hours)'] : []),
                'Other (Hours)',
                'Grace (Hours)',
                ...(includeGiftMinutesInExport ? ['Gift Minutes (min)'] : []),
                'Deductible (Hours)',
                'Notes'
            ];

            const rows = filteredResults.map(r => {
                // ...existing code...
                const deductible = (r.effective_deductible_minutes ?? r.deductible_minutes) || 0;
                const late = r.late_minutes || 0;
                const early = r.early_checkout_minutes || 0;
                const grace = r.grace_minutes ?? 15;

                const baseRow = [
                    r.attendance_id,
                    r.name,
                    r.has_no_punches ? 'No' : 'Yes',
                    Math.max(0, r.working_days || 0),
                    Math.max(0, (r.manual_present_days ?? r.present_days) || 0),
                    Math.max(0, (r.manual_annual_leave_count ?? r.annual_leave_count ?? 0)),
                    Math.max(0, (r.manual_sick_leave_count ?? r.sick_leave_count ?? 0)),
                    Math.max(0, (r.manual_full_absence_count ?? r.full_absence_count) || 0),
                ];

                if (isAlMaraghiMotors) {
                    baseRow.push(r.lop_adjacent_weekly_off_count || 0);
                }

                baseRow.push(
                    Math.max(0, r.half_absence_count || 0),
                    minutesToHours(Math.max(0, late)),
                    minutesToHours(Math.max(0, early))
                );

                // Add approved minutes only if company allows it
                if (project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive') {
                    baseRow.push(minutesToHours(Math.max(0, r.approved_minutes || 0)));
                }

                baseRow.push(
                    minutesToHours(Math.max(0, r.other_minutes || 0)),
                    minutesToHours(Math.max(0, grace))
                );

                if (includeGiftMinutesInExport) {
                    baseRow.push(giftMinutesOverrides[r.id] || 0);
                }

                baseRow.push(
                    minutesToHours(Math.max(0, deductible)),
                    r.notes || ''
                );

                return baseRow;
            });

            setPreviewHeaders(headers);
            setPreviewData(rows);
            setIsPreviewOpen(true);
        } catch (error) {
            console.error('[ReportDetailView] Export preparation failed:', error);
            toast.error('Failed to prepare export data');
        }
    };

    /**
     * User Modification: Export Mismatch Report as Excel
     * Generates a two-sheet Excel file containing detailed Shift Mismatches and Unbound Punches.
     */
    const handleExportMismatch = () => {
        try {
            const wb = XLSX.utils.book_new();

            // Sheet 1: Shift Mismatches
            const sheet1Headers = ['Employee Name', 'Attendance ID', 'Date', 'Punch Times', 'Likely Worked Shift', 'Deviation Minutes'];
            const sheet1Rows = shiftMismatchDetections.map(d => [
                d.name,
                d.attendance_id,
                d.date,
                d.punches.map(p => {
                    const time = extractTime(p.raw);
                    return p.isPrev ? `${time} (prev)` : time;
                }).join(', '),
                d.likelyWorkedShift || 'N/A',
                d.maxDeviation
            ]);
            const ws1 = XLSX.utils.aoa_to_sheet([sheet1Headers, ...sheet1Rows]);
            XLSX.utils.book_append_sheet(wb, ws1, 'Shift Mismatches');

            // Sheet 2: No Match Punches
            const sheet2Headers = ['Employee Name', 'Attendance ID', 'Date', 'Unbound Punches', 'Max Deviation Minutes'];
            const sheet2Rows = noMatchDetections.map(d => [
                d.name,
                d.attendance_id,
                d.date,
                d.noMatchPunches.filter(p => !p.matched).map(p => {
                    const time = extractTime(p.raw);
                    const suffix = p.nearestShiftPoint ? ` (${p.nearestShiftPoint} ${p.minutesAway}m)` : '';
                    return p.isPrev ? `${time} (prev)${suffix}` : `${time}${suffix}`;
                }).join(', '),
                d.maxDeviation
            ]);
            const ws2 = XLSX.utils.aoa_to_sheet([sheet2Headers, ...sheet2Rows]);
            XLSX.utils.book_append_sheet(wb, ws2, 'No Match Punches');

            const fileName = `shift_mismatch_report_${reportRun.date_from}_to_${reportRun.date_to}.xlsx`;
            XLSX.writeFile(wb, fileName);
            toast.success('Mismatch report exported');
        } catch (error) {
            console.error('[ReportDetailView] Mismatch export failed:', error);
            toast.error('Failed to export mismatch report');
        }
    };

    const executeExcelDownload = () => {
        try {
            const data = [previewHeaders, ...previewData];
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
            XLSX.writeFile(wb, `attendance_report_${reportRun.date_from}_to_${reportRun.date_to}.xlsx`);
            toast.success('Attendance report exported');
        } catch (error) {
            console.error('[ReportDetailView] Download failed:', error);
            toast.error('Failed to download attendance report');
        }
    };

    const showDailyBreakdown = (result) => {
        loadRawData(); // Trigger lazy load of punches/shifts/exceptions
        setSelectedEmployee(result);
        setShowBreakdown(true);
    };

    const updateGraceMinutesMutation = useMutation({
        mutationFn: async ({ id, grace_minutes }) => {
            await base44.entities.AnalysisResult.update(id, { grace_minutes });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['results', reportRun.id, project.id]);
            setEditingGraceMinutes(null);
            toast.success('Grace minutes updated');
        },
        onError: () => { toast.error('Failed to update grace minutes'); },
        retry: 2, retryDelay: (i) => Math.min(2000 * Math.pow(2, i), 10000)
    });

    const updateManualOverrideMutation = useMutation({
        mutationFn: async ({ id, field, value }) => {
            await base44.entities.AnalysisResult.update(id, { [field]: value });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['results', reportRun.id, project.id] });
            toast.success('Value updated - will be used in salary calculation');
        },
        onError: () => { toast.error('Failed to update value'); },
        retry: 2, retryDelay: (i) => Math.min(2000 * Math.pow(2, i), 10000)
    });

    /**
     * PHASES RESTRUCTURE: Separates primary AnalysisResult updates from secondary Exception sync.
     * Phase 1 is blocking (UI awaits it), Phase 2 is background non-blocking.
     */
    const saveGiftMinutesBatch = async (data) => {
        // CONFIG: Batch size and throttle delay between batches
        const BATCH_SIZE = 8;
        const BATCH_DELAY = 1500;
        
        // RETRY: Delays for exponential backoff (1000ms, 2000ms, 4000ms)
        const RETRY_DELAYS = [1000, 2000, 4000];
        
        // RESULTS: Track operation outcome
        let successCount = 0;
        let failCount = 0;

        // HELPER: Simple promise-based sleep
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // PHASE 1: Primary update of AnalysisResult records.
        // This is the core data update. We await this fully in the UI handler.
        const processUpdateOnly = async (record) => {
            let attempt = 0;
            const maxAttempts = 3;

            while (attempt <= maxAttempts) {
                try {
                    await base44.entities.AnalysisResult.update(record.id, { 
                        ramadan_gift_minutes: record.ramadan_gift_minutes 
                    });
                    successCount++;
                    return true;
                } catch (error) {
                    // RETRY logic for 429 Rate Limit responses (applies to primary update)
                    const isRateLimit = error.status === 429 || error.message?.toLowerCase().includes('rate limit');
                    if (isRateLimit && attempt < maxAttempts) {
                        console.warn(`[Phase1Update] Rate limited for record ${record.id}, retrying in ${RETRY_DELAYS[attempt]}ms...`);
                        await sleep(RETRY_DELAYS[attempt]);
                        attempt++;
                        continue;
                    }
                    
                    // TERMINAL failure for this record (primary update failed)
                    console.error(`[Phase1Update] Permanent failure for record ${record.id}:`, error);
                    failCount++;
                    return false;
                }
            }
        };

        // Execute Phase 1 BATCH CYCLE: Loop through data in chunks of BATCH_SIZE
        for (let i = 0; i < data.length; i += BATCH_SIZE) {
            const currentBatch = data.slice(i, i + BATCH_SIZE);
            await Promise.all(currentBatch.map(item => processUpdateOnly(item)));
            if (i + BATCH_SIZE < data.length) {
                await sleep(BATCH_DELAY);
            }
        }

        return { success: successCount, failed: failCount };
    };

    /**
     * Phase 2: Background Synchronized Exception Batch
     * This runs completely in the background without blocking the UI or showing loaders.
     * It uses the same batching pattern for database stability.
     */
    const syncGiftMinutesExceptionsBatch = async (data) => {
        const BATCH_SIZE = 8;
        const BATCH_DELAY = 1500;
        const RETRY_DELAYS = [1000, 2000, 4000];
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        const processSingleSync = async (record) => {
            try {
                const resultRow = results.find(r => r.id === record.id);
                if (!resultRow) return;
                const attId = String(resultRow.attendance_id);
                
                // Read current exceptions (with retry for 429s to sustain stability)
                let existing = [];
                let filterAttempt = 0;
                while (filterAttempt < 3) {
                    try {
                        existing = await base44.entities.Exception.filter({
                            type: 'GIFT_MINUTES',
                            attendance_id: attId,
                            project_id: project.id,
                            date_from: reportRun.date_from,
                            date_to: reportRun.date_to
                        });
                        break;
                    } catch (error) {
                        const isRateLimit = error.status === 429 || error.message?.toLowerCase().includes('rate limit');
                        if (isRateLimit && filterAttempt < 2) {
                            await sleep(RETRY_DELAYS[filterAttempt]);
                            filterAttempt++;
                            continue;
                        }
                        throw error;
                    }
                }

                if (record.ramadan_gift_minutes > 0) {
                    // UPSERT: Create new or update existing exception
                    const payload = {
                        type: 'GIFT_MINUTES',
                        attendance_id: attId,
                        project_id: project.id,
                        date_from: reportRun.date_from,
                        date_to: reportRun.date_to,
                        allowed_minutes: record.ramadan_gift_minutes,
                        use_in_analysis: true,
                        details: 'Automatically generated from Gift Minutes calculation'
                    };

                    if (existing.length > 0) {
                        await base44.entities.Exception.update(existing[0].id, { allowed_minutes: record.ramadan_gift_minutes });
                    } else {
                        await base44.entities.Exception.create(payload);
                    }
                } else if (existing.length > 0) {
                    // CLEANUP: Remove exception if gift minutes value is now zero
                    await base44.entities.Exception.delete(existing[0].id);
                }
            } catch (err) {
                // Background process: Log errors to console only as requested
                console.warn(`[Phase2Sync] Exception sync failed for record ${record.id} in background:`, err);
            }
        };

        // BATCH CYCLE: Execute Phase 2
        for (let i = 0; i < data.length; i += BATCH_SIZE) {
            const currentBatch = data.slice(i, i + BATCH_SIZE);
            await Promise.all(currentBatch.map(item => processSingleSync(item)));
            if (i + BATCH_SIZE < data.length) {
                await sleep(BATCH_DELAY);
            }
        }
    };

    /**
     * Change 2 - Calculate Gift Minutes Logic
     * Applies the rule: deductible < 30 ? full amount : 15 mins to every employee.
     * This updates the UI overrides state immediately, then synchronizes to DB in two phases.
     */
    const handleCalculateAllGiftMinutes = async () => {
        const updated = { ...giftMinutesOverrides };
        const recordsToSave = [];

        // 1. CALCULATE: Determine gift minutes based on raw attendance
        results.forEach(r => {
            const rawMinutes = Math.max(0, r.late_minutes ?? 0) + Math.max(0, r.early_checkout_minutes ?? 0);
            const calculated = rawMinutes < 30 ? rawMinutes : 15;
            const giftValue = (rawMinutes > 0) ? calculated : 0;
            
            // Update local state tracking
            updated[r.id] = giftValue;
            
            // Build payload for batch save
            recordsToSave.push({
                id: r.id,
                ramadan_gift_minutes: giftValue
            });
        });

        // 2. OPTIMISTIC UPDATE: Set local state for instant UI feedback
        setGiftMinutesOverrides(updated);

        // 3. SHOW PROGRESS UI: Inform user that saving is beginning
        const loadingToastId = toast.loading('Calculating and saving gift minutes for all employees...');

        try {
            // 4. DB SYNC - PHASE 1: Execute the primary batched save operation (blocking)
            const outcome = await saveGiftMinutesBatch(recordsToSave);

            // 5. RESULT FEEDBACK: Immediately provide feedback and refresh UI for Phase 1
            toast.dismiss(loadingToastId);
            if (outcome.failed > 0) {
                toast.warning(`Saved ${outcome.success} employee gift minutes, but ${outcome.failed} failed after retries.`, { 
                    duration: 5000 
                });
            } else {
                toast.success(`Successfully saved gift minutes for all ${outcome.success} employees.`, { 
                    duration: 4000 
                });
            }

            // DELAY & REFRESH: Wait 2000ms for read-after-write consistency then invalidate
            // and allow database commitment of batch writes to stabilize.
            await new Promise(resolve => setTimeout(resolve, 2000));
            queryClient.invalidateQueries(['exceptions', project.id]);
            queryClient.invalidateQueries(['results', reportRun.id, project.id]);

            // 6. PHASE 2: Trigger Exception sync in the background (non-blocking)
            // This is a background non-blocking sync that doesn't show a loading indicator.
            syncGiftMinutesExceptionsBatch(recordsToSave).catch(e => {
                console.error('[Phase2Background] Exception sync encountered a handled error:', e);
            });

        } catch (error) {
            // CATASTROPHIC FAILURE: Alert user to process-level errors
            console.error('[GiftMinutesBatch] Catastrophic failure:', error);
            toast.dismiss(loadingToastId);
            toast.error('An unexpected error occurred while saving gift minutes batch.');
        }
    };

    // Save only Gift Minutes. deductible_minutes (raw) stays untouched.
    // The deductible column computes: max(0, deductible_minutes - giftMinutes) at render time.
    /**
     * Change 3 - Save Gift Minutes & Create/Update GIFT_MINUTES Exception
     * Saves the value to AnalysisResult and synchronizes a GIFT_MINUTES exception record.
     */
    const onSaveGiftMinutes = async (row, newValue) => {
        const oldValue = giftMinutesOverrides[row.id] || 0;
        
        // Optimistic UI update
        setGiftMinutesOverrides(old => ({ ...old, [row.id]: newValue }));
        
        // Perform AnalysisResult update
        await base44.entities.AnalysisResult.update(row.id, { ramadan_gift_minutes: newValue });
        
        // Change 3: Synchronize GIFT_MINUTES exception record
        try {
            const attendanceIdStr = String(row.attendance_id);
            // Search for existing GIFT_MINUTES exception for this employee in this report period
            const existing = await base44.entities.Exception.filter({
                type: 'GIFT_MINUTES',
                attendance_id: attendanceIdStr,
                project_id: project.id,
                date_from: reportRun.date_from,
                date_to: reportRun.date_to
            });

            if (newValue > 0) {
                const exceptionData = {
                    type: 'GIFT_MINUTES',
                    attendance_id: attendanceIdStr,
                    project_id: project.id,
                    date_from: reportRun.date_from,
                    date_to: reportRun.date_to,
                    allowed_minutes: newValue,
                    use_in_analysis: true,
                    details: 'Automatically generated from Gift Minutes calculation'
                };

                if (existing.length > 0) {
                    await base44.entities.Exception.update(existing[0].id, { allowed_minutes: newValue });
                } else {
                    await base44.entities.Exception.create(exceptionData);
                }
            } else if (existing.length > 0) {
                // Delete existing record if gift minutes set to zero
                await base44.entities.Exception.delete(existing[0].id);
            }
            
            // Invalidate exceptions to refresh related UI elements
            queryClient.invalidateQueries(['exceptions', project.id]);
        } catch (err) {
            console.error('Failed to sync GIFT_MINUTES exception:', err);
        }
        
        // Audit log
        try {
            base44.functions.invoke('logAudit', { 
                action_type: 'update', 
                entity_name: 'AnalysisResult', 
                entity_id: row.id, 
                project_id: project.id, 
                company: project.company, 
                context: `GIFT_MINUTES old=${oldValue} new=${newValue}`, 
                changes: JSON.stringify({ field: 'ramadan_gift_minutes', old_value: oldValue, new_value: newValue }) 
            }).catch(() => { });
        } catch(e) {}
        
        toast.success('Gift minutes saved and synced with exceptions');
    };

    const hasEdits = results.some(r => r.day_overrides && r.day_overrides !== '{}');
    const verifiedCount = verifiedEmployees.length;

    const auditDailyBreakdownData = React.useMemo(() => {
        if (!selectedEmployee || !editingDay || !editingDay.dateStr) return {};
        const attId = String(selectedEmployee.attendance_id);
        const dateStr = editingDay.dateStr;
        const employeeShifts = shifts.filter(s => String(s.attendance_id) === attId);
        const currentDay = new Date(dateStr);
        const isFriday = (sr) => sr?.is_friday_shift === true || sr?.is_friday_shift === 'true' || sr?.is_friday_shift === 1 || sr?.is_friday_shift === '1';
        let shift = employeeShifts.find(s => s.date === dateStr);
        if (!shift) {
            const dow = currentDay.getDay();
            shift = employeeShifts.find(s => (dow === 5 ? isFriday(s) : !isFriday(s)) && !s.date);
            if (!shift && dow === 5) shift = employeeShifts.find(s => !s.date);
        }
        const empPunches = punches.filter(p => String(p.attendance_id) === attId);
        const nextDayObj = new Date(dateStr); nextDayObj.setDate(nextDayObj.getDate() + 1);
        const nextDateStr = nextDayObj.toISOString().split('T')[0];
        const combinedPunches = [
            ...empPunches.filter(p => p.punch_date === dateStr),
            ...empPunches.filter(p => p.punch_date === nextDateStr && localIsWithinMidnightBuffer(p.timestamp_raw))
        ];
        const dayPunches = filterMultiplePunches(combinedPunches, shift);
        return { [attId]: { daily_details: { [dateStr]: { punches: dayPunches } } } };
    }, [selectedEmployee, editingDay, punches, shifts, localIsWithinMidnightBuffer, filterMultiplePunches]);

    return (
        <div className="space-y-6">
            {/* Finalization Progress Dialog */}
            <FinalizationProgressDialog progress={finalizationProgress} />

            {/* Save Status Banner */}
            {saveProgress && (
                <Card className="bg-green-50 border-green-200 shadow-sm border-2 animate-in fade-in slide-in-from-top-4">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
                                <span className="font-bold text-green-700">Updating Analysis Records...</span>
                            </div>
                            <div className="text-sm font-bold text-green-600">
                                {saveProgress.current} / {saveProgress.total} employees updated
                            </div>
                        </div>
                        <Progress value={saveProgress.total > 0 ? (saveProgress.current / saveProgress.total) * 100 : 0} className="w-full bg-green-200" />
                    </CardContent>
                </Card>
            )}

            <Card className="border-0 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            {reportRun.report_name && (
                                <h2 className="text-xl font-bold text-slate-900">{reportRun.report_name}</h2>
                            )}
                            <p className="text-sm text-slate-600">
                                Period: <span className="font-medium text-slate-900">{new Date(reportRun.date_from).toLocaleDateString()} - {new Date(reportRun.date_to).toLocaleDateString()}</span>
                            </p>
                            <p className="text-sm text-slate-600">
                                Verified: <span className="font-medium text-slate-900">{verifiedCount} / {results.length} employees</span>
                            </p>
                            {reportRun.is_saved && (
                                <div className="flex items-center gap-1.5 text-sm text-blue-600 font-medium">
                                    <Save className="w-3.5 h-3.5" />
                                    Report Saved
                                </div>
                            )}
                            {/* IMMUTABLE FOR SALARY (Al Maraghi Auto Repairs) */}
                            {project.company === 'Al Maraghi Auto Repairs' && (
                                <p className="text-xs text-purple-600 font-medium">
                                    🔒 Finalized Report - Locked for Salary Calculation (edits: grace/deductible only)
                                </p>
                            )}
                            {hasEdits && (
                                <p className="text-sm text-amber-600">
                                    ⚠️ This report has unsaved edits
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                onClick={exportToExcel}
                                variant="outline"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </Button>
                            {project.status !== 'closed' && (
                                <>
                                    <Button
                                        onClick={() => { loadRawData(); setShowSaveConfirmation(true); }}
                                        disabled={isSaving || (rawDataRequested && !allRawDataLoaded)}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        {isSaving ? 'Saving...' : 'Save Report'}
                                    </Button>
                                    {(isAdmin || project.company === 'Al Maraghi Auto Repairs') && !reportRun.is_final && (
                                        <Button
                                            onClick={() => finalizeReportMutation.mutate()}
                                            disabled={finalizeReportMutation.isPending}
                                            className="bg-purple-600 hover:bg-purple-700"
                                            title="Finalize report without generating approval links"
                                        >
                                            {finalizeReportMutation.isPending ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Finalizing...
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle className="w-4 h-4 mr-2" />
                                                    Finalize Report
                                                </>
                                            )}
                                        </Button>
                                    )}
                                    {isAdmin && reportRun.is_final && (
                                        <Button
                                            onClick={() => unfinalizeReportMutation.mutate()}
                                            disabled={unfinalizeReportMutation.isPending}
                                            variant="outline"
                                            className="border-red-300 text-red-600 hover:bg-red-50"
                                            title="Un-finalize report (admin only)"
                                        >
                                            {unfinalizeReportMutation.isPending ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    Un-finalizing...
                                                </>
                                            ) : (
                                                <>Un-finalize Report</>
                                            )}
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                    <div className="flex gap-3 items-center">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by ID or name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={riskFilter} onValueChange={setRiskFilter}>
                            <SelectTrigger className="w-48">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Employees</SelectItem>
                                <SelectItem value="high-risk">High Risk ({`>`}2 LOP or {`>`}120 min)</SelectItem>
                                <SelectItem value="clean">Clean Records (0 issues)</SelectItem>
                                <SelectItem value="unverified">Unverified Only</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            onClick={verifyAllClean}
                            variant="outline"
                            size="sm"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Verify All Clean
                        </Button>
                        {/* 
                            Change 2 - Calculate Gift Minutes Button
                            Triggers bulk calculation based on deductible minutes rule.
                        */}
                        {/* 
                            Change 2 - Calculate Gift Minutes Button Gate Logic
                            Button is gated by project settings and report date overlap.
                        */}
                        {project?.use_gift_minutes && (() => {
                            const hasGiftDates = project.gift_minutes_date_from && project.gift_minutes_date_to;
                            const overlaps = hasGiftDates && 
                                             reportRun.date_from <= project.gift_minutes_date_to && 
                                             reportRun.date_to >= project.gift_minutes_date_from;
                            const isLocked = reportRun.is_final || project.status === 'closed';
                            const isDisabled = !overlaps || isLocked;
                            
                            const tooltipTitle = !hasGiftDates 
                                ? "Set gift minutes date range in project settings first" 
                                : !overlaps 
                                ? "Report period does not overlap with gift minutes date range" 
                                : isLocked 
                                ? "Cannot calculate for finalized reports" 
                                : "Apply gift minutes rule to all employees (Calculation logic: < 30 mins = full, >= 30 mins = 15 mins capped)";

                            return (
                                <Button
                                    onClick={handleCalculateAllGiftMinutes}
                                    variant="outline"
                                    size="sm"
                                    disabled={isDisabled}
                                    title={tooltipTitle}
                                    className={`border-indigo-200 text-indigo-600 font-bold ${isDisabled ? 'opacity-50' : 'hover:bg-indigo-50'}`}
                                >
                                    <Zap className="w-4 h-4 mr-2" />
                                    Calculate Gift Minutes
                                </Button>
                            );
                        })()}
                    </div>
                </CardContent>
            </Card>

            <DetectionPanel
                shiftMismatchDetections={shiftMismatchDetections}
                noMatchDetections={noMatchDetections}
                exceptions={exceptions}
                project={project}
                results={results}
                setSelectedEmployee={setSelectedEmployee}
                setEditingDay={setEditingDay}
                handleExportMismatch={handleExportMismatch}
                onRequestRawData={loadRawData}
                rawDataLoaded={rawDataRequested && allRawDataLoaded}
            />
            
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Attendance Report</CardTitle>
                        {(resultsLoading || employeesLoading) && (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading data...
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0 sm:p-6">
                    <div className="border rounded-lg relative overflow-x-auto overflow-y-auto max-h-[600px]">
                        <table className="w-full min-w-max caption-bottom text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-50">
                                <tr className="border-b">
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground w-12 bg-slate-50 sticky left-0 z-20">Verified</th>
                                    <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort} className="bg-slate-50 sticky left-[48px] z-20">
                                        ID
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort} className="bg-slate-50 sticky left-[120px] z-20">
                                        Name
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="working_days" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Working Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="present_days" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Present Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="annual_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Annual Leave
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="sick_leave_count" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Sick Leave
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="full_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        LOP Days
                                    </SortableTableHead>
                                    {isAlMaraghiMotors && (
                                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50 text-rose-600 text-[11px]" title="Weekly off days adjacent to LOP, counted as additional LOP">
                                            +Weekly Off LOP
                                        </th>
                                    )}
                                    <SortableTableHead sortKey="half_absence_count" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Half Days
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="late_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Late Minutes
                                    </SortableTableHead>
                                    <SortableTableHead sortKey="early_checkout_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Early Checkout
                                    </SortableTableHead>
                                    {project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' && (
                                        <SortableTableHead sortKey="approved_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                            Approved Minutes
                                        </SortableTableHead>
                                    )}
                                    <SortableTableHead sortKey="other_minutes" currentSort={sort} onSort={setSort} className="bg-slate-50">
                                        Other Minutes
                                    </SortableTableHead>
                                    {!isDepartmentHead && <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Grace</th>}
                                    {showGiftMinutesColumn && (
                                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Gift Minutes (min)</th>
                                    )}
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Deductible</th>
                                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground bg-slate-50">Notes</th>
                                    <th className="h-10 px-2 text-right align-middle font-medium text-muted-foreground bg-slate-50">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="[&_tr:last-child]:border-0">
                                {filteredResults.map((result) => (
                                    <ReportTableRow
                                        key={result.id}
                                        result={result}
                                        isAdmin={isAdmin}
                                        isSupervisor={isSupervisor}
                                        isDepartmentHead={isDepartmentHead}
                                        // Change 1 - Passing role-based edit permission for gift minutes (Admin/CEO/HR)
                                        canEditGiftMinutes={canEditGiftMinutes} 
                                        project={project}
                                        reportRun={reportRun}
                                        showGiftMinutesColumn={showGiftMinutesColumn}
                                        onToggleVerification={toggleVerification}
                                        onEditGrace={setEditingGraceMinutes}
                                        onShowBreakdown={showDailyBreakdown}
                                        onUpdateManualOverride={(args) => updateManualOverrideMutation.mutate(args)}
                                        onSaveGiftMinutes={onSaveGiftMinutes}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <DailyBreakdownDialog
                open={showBreakdown}
                onOpenChange={setShowBreakdown}
                selectedEmployee={selectedEmployee}
                enrichedResults={enrichedResults}
                punches={punches}
                shifts={shifts}
                exceptions={exceptions}
                employees={employees}
                reportRun={reportRun}
                project={project}
                parseTime={parseTime}
                formatTime={formatTime}
                matchPunchesToShiftPoints={matchPunchesToShiftPoints}
                filterMultiplePunches={filterMultiplePunches}
            />

            <GraceMinutesDialog
                editingGraceMinutes={editingGraceMinutes}
                onClose={() => setEditingGraceMinutes(null)}
                onSave={(data) => updateGraceMinutesMutation.mutate(data)}
                isPending={updateGraceMinutesMutation.isPending}
            />

            <SaveConfirmationDialog
                open={showSaveConfirmation}
                onClose={() => setShowSaveConfirmation(false)}
                onConfirm={() => { setShowSaveConfirmation(false); saveReportMutation.mutate(); }}
                hasEdits={hasEdits}
                isUser={isUser}
                isSupervisor={isSupervisor}
            />
            <ExcelPreviewDialog
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                data={previewData}
                headers={previewHeaders}
                fileName={`attendance_report_${reportRun.date_from}_to_${reportRun.date_to}.xlsx`}
                onConfirm={executeExcelDownload}
            />
            
            <EditDayRecordDialog
                open={!!editingDay}
                onClose={() => setEditingDay(null)}
                onSave={() => queryClient.invalidateQueries({ queryKey: ['results', reportRun.id] })}
                dayRecord={editingDay}
                project={project}
                attendanceId={selectedEmployee?.attendance_id}
                analysisResult={selectedEmployee}
                dailyBreakdownData={auditDailyBreakdownData}
            />
        </div>
    );
}