import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Trash2, CheckCircle, Star, Save, Settings, AlertCircle, Play, Loader2, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

export default function ReportTab({ project, isDepartmentHead = false }) {
    console.log('[ReportTab] Rendering with:', { projectId: project?.id, isDepartmentHead });
    
    const queryClient = useQueryClient();
    const [progressDialog, setProgressDialog] = React.useState({
        open: false,
        current: 0,
        total: 0,
        currentEmployee: '',
        status: 'Processing...'
    });

    // Analysis tab state
    const [isAnalyzing, setIsAnalyzing] = React.useState(false);
    const [analysisProgress, setAnalysisProgress] = React.useState(null);
    const [dateFrom, setDateFrom] = React.useState(project.date_from);
    const [dateTo, setDateTo] = React.useState(project.date_to);
    const [reportName, setReportName] = React.useState('');
    const [dataQualityIssues, setDataQualityIssues] = React.useState([]);
    const [showQualityCheck, setShowQualityCheck] = React.useState(false);



    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isCEO = userRole === 'ceo';
    const isHRManager = userRole === 'hr_manager';
    const isUser = userRole === 'user';
    const isAdminOrSupervisor = isAdmin || isSupervisor || isCEO || isHRManager;
    const canDeleteReports = isAdmin || isSupervisor || isUser || isCEO || isHRManager;

    console.log('[ReportTab] User role:', { userRole, isDepartmentHead, isAdmin, isSupervisor });

    // Fetch data needed for analysis
    const { data: punches = [] } = useQuery({
        queryKey: ['punches', project.id],
        queryFn: () => base44.entities.Punch.filter({ project_id: project.id }),
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: shifts = [] } = useQuery({
        queryKey: ['shifts', project.id],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id }),
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['exceptions', project.id],
        queryFn: () => base44.entities.Exception.filter({ project_id: project.id }),
        staleTime: 10 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: rules } = useQuery({
        queryKey: ['rules', project.company],
        queryFn: async () => {
            const rulesList = await base44.entities.AttendanceRules.filter({ company: project.company });
            if (rulesList.length > 0) {
                return JSON.parse(rulesList[0].rules_json);
            }
            return null;
        },
        staleTime: 30 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', project.company],
        queryFn: () => base44.entities.Employee.filter({ company: project.company }),
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    const uniqueEmployeeIds = [...new Set(punches.map(p => p.attendance_id))];

    // Analysis functions
    const performDataQualityCheck = () => {
        const issues = [];
        
        // 1. Basic configuration checks
        if (punches.length > 0 && shifts.length === 0) {
            issues.push({
                type: 'error',
                title: 'No shift timings configured',
                details: 'Add shift timings in the Shifts tab before running analysis'
            });
        }

        if (!rules) {
            issues.push({
                type: 'error',
                title: 'Attendance rules not configured',
                details: 'Configure rules in Settings > Rules for this company'
            });
        }

        // 2. Duplicate ID checks
        const hrmsIds = {};
        const attIds = {};
        employees.forEach(emp => {
            if (emp.hrms_id) {
                if (!hrmsIds[emp.hrms_id]) hrmsIds[emp.hrms_id] = [];
                hrmsIds[emp.hrms_id].push(emp.name);
            }
            if (emp.attendance_id) {
                if (!attIds[emp.attendance_id]) attIds[emp.attendance_id] = [];
                attIds[emp.attendance_id].push(emp.name);
            }
        });

        const duplicateHrms = Object.entries(hrmsIds).filter(([, names]) => names.length > 1);
        if (duplicateHrms.length > 0) {
            issues.push({
                type: 'error',
                title: 'Duplicate HRMS IDs found',
                details: duplicateHrms.map(([id, names]) => `ID ${id} used by: ${names.join(', ')}`).join(' | ')
            });
        }

        const duplicateAtt = Object.entries(attIds).filter(([, names]) => names.length > 1);
        if (duplicateAtt.length > 0) {
            issues.push({
                type: 'error',
                title: 'Duplicate Attendance IDs found',
                details: duplicateAtt.map(([id, names]) => `ID ${id} used by: ${names.join(', ')}`).join(' | ')
            });
        }

        // 3. 'Missing Shift' Detection (Orphan Punches)
        const missingShifts = [];
        const dayNameToNumber = {
            'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
            'Thursday': 4, 'Friday': 5, 'Saturday': 6
        };

        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);
        
        // Group punches by employee and date
        const punchesByEmpDate = {};
        punches.forEach(p => {
            if (p.punch_date >= dateFrom && p.punch_date <= dateTo) {
                const key = `${p.attendance_id}_${p.punch_date}`;
                punchesByEmpDate[key] = (punchesByEmpDate[key] || 0) + 1;
            }
        });

        uniqueEmployeeIds.forEach(attId => {
            const attIdStr = String(attId);
            const employee = employees.find(e => String(e.attendance_id) === attIdStr);
            const employeeShifts = shifts.filter(s => String(s.attendance_id) === attIdStr);
            
            // Determine weekly off
            let weeklyOffDay = null;
            if (project.weekly_off_override && project.weekly_off_override !== 'None') {
                weeklyOffDay = dayNameToNumber[project.weekly_off_override];
            } else if (employee?.weekly_off) {
                weeklyOffDay = dayNameToNumber[employee.weekly_off];
            }

            // Loop through selected range
            for (let d = new Date(startDate); d <= endDate; d = new Date(d.setDate(d.getDate() + 1))) {
                const currentDate = new Date(d);
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayOfWeek = currentDate.getDay();
                
                const punchCount = punchesByEmpDate[`${attIdStr}_${dateStr}`] || 0;
                
                // PERFORMANCE SAFETY: Skip if totalPunches === 0
                if (punchCount > 0) {
                    const isWeeklyHoliday = (weeklyOffDay !== null && dayOfWeek === weeklyOffDay);
                    
                    if (!isWeeklyHoliday) {
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const currentDayName = dayNames[dayOfWeek];
                        
                        const hasShift = employeeShifts.some(s => {
                            if (s.date === dateStr) return true;
                            if (!s.date && s.applicable_days) {
                                try {
                                    const days = JSON.parse(s.applicable_days);
                                    if (Array.isArray(days) && days.some(day => day.toLowerCase() === currentDayName.toLowerCase())) return true;
                                } catch(e) {}
                            }
                            if (!s.date && !s.applicable_days) {
                                if (dayOfWeek === 5 && s.is_friday_shift) return true;
                                if (dayOfWeek !== 5 && !s.is_friday_shift) return true;
                                if (dayOfWeek === 5 && !employeeShifts.some(ss => ss.is_friday_shift)) return true;
                            }
                            return false;
                        });
                        
                        if (!hasShift) {
                            missingShifts.push({
                                name: employee?.name || `ID: ${attIdStr}`,
                                date: dateStr
                            });
                        }
                    }
                }
            }
        });

        if (missingShifts.length > 0) {
            const uniqueAffected = [...new Set(missingShifts.map(ms => ms.name))].length;
            issues.push({
                type: 'warning',
                title: 'Missing Shift Settings Detected',
                details: `Warning: ${uniqueAffected} employees have punches on days with no scheduled shifts. Calculations for these days may be inaccurate.`,
                affectedList: missingShifts
            });
        }
        
        setDataQualityIssues(issues);
        return issues;
    };

    const handleAnalyze = async () => {
        if (!dateFrom || !dateTo) {
            toast.error('Please select date range');
            return;
        }
        
        const issues = performDataQualityCheck();
        const hasErrors = issues.some(i => i.type === 'error');
        
        if (hasErrors && !isAdmin) {
            setShowQualityCheck(true);
            return;
        }
        
        await runAnalysis();
    };

    const runAnalysis = async () => {
        if (!rules) {
            toast.error('Please configure attendance rules first');
            return;
        }

        if (punches.length === 0) {
            toast.error('No punch data available. Please upload punches first.');
            return;
        }

        if (shifts.length === 0) {
            const proceed = window.confirm('⚠️ No shift timings found. Analysis will proceed but may produce incorrect results. Continue anyway?');
            if (!proceed) return;
        }

        setIsAnalyzing(true);
        setAnalysisProgress({ 
            current: 0, 
            total: 100, 
            status: 'Preparing analysis...',
            step: 'Initializing',
            subStatus: 'Loading employee data and configurations'
        });

        try {
            // Step 1: Preparing
            setAnalysisProgress({ 
                current: 10, 
                total: 100, 
                status: 'Preparing analysis...',
                step: 'Loading Data',
                subStatus: 'Fetching employee records and shift schedules'
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            // Step 2: Processing attendance
            setAnalysisProgress({ 
                current: 25, 
                total: 100, 
                status: 'Analyzing attendance records...',
                step: 'Processing Attendance',
                subStatus: `Checking ${uniqueEmployeeIds.length} employees across ${Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24))} days`
            });

            const batchSize = 10;
            let offset = 0;
            let isComplete = false;
            let reportRunId = null;
            let totalProcessed = 0;

            while (!isComplete) {
                const response = await base44.functions.invoke('runAnalysis', {
                    project_id: project.id,
                    date_from: dateFrom,
                    date_to: dateTo,
                    report_name: reportName.trim() || `Report - ${new Date().toLocaleDateString()}`,
                    _existing_report_run_id: reportRunId,
                    _chunk_offset: offset,
                    _chunk_size: batchSize
                });

                if (response.data.success) {
                    reportRunId = response.data.report_run_id;
                    isComplete = response.data.is_complete;
                    offset += batchSize;
                    totalProcessed += response.data.processed_count;

                    const percentage = Math.round(25 + Math.min(offset / uniqueEmployeeIds.length, 1) * 50);

                    // Step 3: Processing results iteration
                    setAnalysisProgress({ 
                        current: percentage, 
                        total: 100, 
                        status: 'Calculating attendance summary...',
                        step: 'Finalizing Results',
                        subStatus: `Analyzed ${Math.min(offset, uniqueEmployeeIds.length)} of ${uniqueEmployeeIds.length} employees`
                    });

                    if (!isComplete) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } else {
                    throw new Error(response.data.error || 'Analysis chunk failed');
                }
            }

            // Step 4: Complete
            setAnalysisProgress({ 
                current: 100, 
                total: 100, 
                status: 'Analysis complete!',
                step: 'Done',
                subStatus: `Successfully analyzed ${totalProcessed} employees`
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            queryClient.invalidateQueries(['results', project.id]);
            queryClient.invalidateQueries(['reportRuns', project.id]);
            queryClient.invalidateQueries(['project', project.id]);
            queryClient.invalidateQueries(['projects']);
            toast.success(`✅ Analysis complete`);
        } catch (error) {
            setAnalysisProgress({ 
                current: 0, 
                total: 100, 
                status: 'Analysis failed',
                step: 'Error',
                subStatus: error.message
            });
            toast.error('Analysis failed: ' + error.message);
            console.error(error);
        } finally {
            setTimeout(() => {
                setIsAnalyzing(false);
                setAnalysisProgress(null);
            }, 2000);
        }
    };

    // Get department head verification if department head
    const { data: deptHeadVerification, error: deptHeadError } = useQuery({
        queryKey: ['deptHeadVerification', isDepartmentHead, currentUser?.email],
        queryFn: async () => {
            // Double-check to prevent any execution for non-department heads
            if (!isDepartmentHead) {
                console.log('[ReportTab] Skipping dept head verification - not a department head');
                return null;
            }
            console.log('[ReportTab] Verifying department head');
            const { data } = await base44.functions.invoke('verifyDepartmentHead', {});
            console.log('[ReportTab] Department head verification result:', data);
            return data;
        },
        enabled: isDepartmentHead && !!currentUser,
        retry: false,
        staleTime: Infinity // Don't refetch automatically
    });

    React.useEffect(() => {
        if (deptHeadError && isDepartmentHead) {
            console.error('[ReportTab] Department head verification error:', deptHeadError);
        }
    }, [deptHeadError, isDepartmentHead]);

    const { data: allReportRuns = [], error: reportRunsError } = useQuery({
        queryKey: ['reportRuns', project.id],
        queryFn: async () => {
            console.log('[ReportTab] Fetching report runs for project:', project.id);
            const runs = await base44.entities.ReportRun.filter({ project_id: project.id }, '-created_date', 5000);
            console.log('[ReportTab] Fetched', runs.length, 'report runs');
            return runs;
        }
    });

    React.useEffect(() => {
        if (reportRunsError) {
            console.error('[ReportTab] Report runs fetch error:', reportRunsError);
        }
    }, [reportRunsError]);

    // If project is closed, only show the last saved report
    const reportRuns = project.status === 'closed' && project.last_saved_report_id
        ? allReportRuns.filter(r => r.id === project.last_saved_report_id)
        : allReportRuns;

    console.log('[ReportTab] Report runs filtered:', {
        total: allReportRuns.length,
        filtered: reportRuns.length,
        isClosed: project.status === 'closed',
        lastSavedId: project.last_saved_report_id
    });

    // Don't fetch all results upfront - fetch per report when needed
    // This prevents loading hundreds of duplicate analysis results from all historical runs

    // Get employees for department head filtering - MUST use managed_employee_ids
    const { data: departmentEmployees = [], error: employeesError } = useQuery({
        queryKey: ['departmentEmployees', project.id, isDepartmentHead, deptHeadVerification?.assignment?.managed_employee_ids],
        queryFn: async () => {
            if (!isDepartmentHead || !deptHeadVerification?.verified) {
                console.log('[ReportTab] Skipping employee fetch - not dept head or not verified');
                return [];
            }
            
            const managedIds = deptHeadVerification.assignment.managed_employee_ids 
                ? deptHeadVerification.assignment.managed_employee_ids.split(',').map(id => String(id.trim()))
                : [];
            
            console.log('[ReportTab] Managed employee IDs:', managedIds);
            
            if (managedIds.length === 0) {
                console.log('[ReportTab] No managed employees found');
                return [];
            }
            
            // Fetch all employees for the company
            const allEmployees = await base44.entities.Employee.filter({
                company: deptHeadVerification.assignment.company,
                active: true
            }, null, 5000);

            console.log('[ReportTab] Fetched', allEmployees.length, 'total employees in company');

            // Filter to only managed subordinates using Employee IDs (not HRMS IDs)
            // CRITICAL: Exclude department head from the list
            const filtered = allEmployees.filter(emp => 
                managedIds.includes(String(emp.id)) && 
                String(emp.id) !== String(deptHeadVerification.assignment.employee_id)
            );

            console.log('[ReportTab] Filtered to', filtered.length, 'managed employees (excluding dept head)');
            return filtered;
        },
        enabled: isDepartmentHead && !!deptHeadVerification?.verified
    });

    React.useEffect(() => {
        if (employeesError) {
            console.error('[ReportTab] Department employees fetch error:', employeesError);
        }
    }, [employeesError]);

    const deleteReportMutation = useMutation({
        mutationFn: async (reportRunId) => {
            // Fetch all associated data for this report
            const [resultsToDelete, snapshotsToDelete] = await Promise.all([
                base44.entities.AnalysisResult.filter({ 
                    project_id: project.id, 
                    report_run_id: reportRunId 
                }, null, 5000),
                base44.entities.SalarySnapshot.filter({
                    project_id: project.id,
                    report_run_id: reportRunId
                }, null, 5000)
            ]);
            
            // Delete in batches of 5 with delays to avoid rate limiting
            const BATCH_SIZE = 5;
            const DELAY_MS = 200;
            
            const deleteInBatches = async (items, deleteFunc) => {
                for (let i = 0; i < items.length; i += BATCH_SIZE) {
                    const batch = items.slice(i, i + BATCH_SIZE);
                    await Promise.all(batch.map(item => deleteFunc(item.id)));
                    if (i + BATCH_SIZE < items.length) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                    }
                }
            };
            
            // Delete results first
            if (resultsToDelete.length > 0) {
                await deleteInBatches(resultsToDelete, (id) => base44.entities.AnalysisResult.delete(id));
            }
            
            // Then delete snapshots
            if (snapshotsToDelete.length > 0) {
                await deleteInBatches(snapshotsToDelete, (id) => base44.entities.SalarySnapshot.delete(id));
            }
            
            // Finally, delete the report run itself
            await base44.entities.ReportRun.delete(reportRunId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reportRuns', project.id] });
            queryClient.invalidateQueries({ queryKey: ['reportResults', project.id] });
            queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id] });
            toast.success('Report and associated salary data deleted successfully');
        },
        onError: (error) => {
            console.error('[ReportTab] Delete error:', error);
            toast.error('Failed to delete report: ' + (error.message || 'Unknown error'));
        }
    });

    const markFinalMutation = useMutation({
        mutationFn: async (reportRunId) => {
            console.log('[ReportTab] mutationFn started for report:', reportRunId);
            
            // STEP 1: Update progress dialog
            setProgressDialog({
                open: true,
                current: 0,
                total: 0,
                currentEmployee: 'Validating report data...',
                status: 'Please wait...'
            });

            // STEP 2: Mark report as final (backend only marks, doesn't create snapshots)
            console.log('[ReportTab] Calling markFinalReport backend...');
            const markResult = await base44.functions.invoke('markFinalReport', {
                project_id: project.id,
                report_run_id: reportRunId
            });

            console.log('[ReportTab] markFinalReport result:', markResult.data);

            if (markResult.data?.success === false) {
                console.error('[ReportTab] Backend validation failed:', markResult.data?.error);
                throw new Error(markResult.data?.error || 'Finalization failed');
            }

            // STEP 3: Create salary snapshots in batches with real progress
            const BATCH_SIZE = 10;
            let batchStart = 0;
            let hasMore = true;
            let totalEmployees = 0;
            let loopIteration = 0;

            console.log(`[ReportTab] ============================================`);
            console.log(`[ReportTab] STARTING BATCH LOOP`);
            console.log(`[ReportTab] ============================================`);

            while (hasMore) {
                loopIteration++;
                console.log(`[ReportTab] ============================================`);
                console.log(`[ReportTab] LOOP ITERATION #${loopIteration}`);
                console.log(`[ReportTab] Batch start: ${batchStart}, Batch size: ${BATCH_SIZE}`);
                console.log(`[ReportTab] Calling createSalarySnapshots...`);
                
                const batchResult = await base44.functions.invoke('createSalarySnapshots', {
                    project_id: project.id,
                    report_run_id: reportRunId,
                    batch_mode: true,
                    batch_start: batchStart,
                    batch_size: BATCH_SIZE
                });

                console.log('[ReportTab] ============================================');
                console.log('[ReportTab] BATCH RESULT RECEIVED:');
                console.log(`[ReportTab]    batch_mode: ${batchResult.data?.batch_mode}`);
                console.log(`[ReportTab]    batch_completed: ${batchResult.data?.batch_completed}`);
                console.log(`[ReportTab]    current_position: ${batchResult.data?.current_position}`);
                console.log(`[ReportTab]    total_employees: ${batchResult.data?.total_employees}`);
                console.log(`[ReportTab]    has_more: ${batchResult.data?.has_more}`);
                console.log('[ReportTab] ============================================');

                if (batchResult.data?.batch_mode) {
                    totalEmployees = batchResult.data.total_employees;
                    const currentPos = batchResult.data.current_position;
                    const currentBatch = batchResult.data.current_batch || [];
                    hasMore = batchResult.data.has_more;

                    const percentage = totalEmployees > 0 ? Math.round(currentPos/totalEmployees*100) : 0;
                    console.log(`[ReportTab] 📊 Progress: ${currentPos}/${totalEmployees} (${percentage}%)`);
                    console.log(`[ReportTab] 🔄 has_more=${hasMore}, will ${hasMore ? 'CONTINUE' : 'STOP'} looping`);
                    
                    setProgressDialog({
                        open: true,
                        current: currentPos,
                        total: totalEmployees,
                        currentEmployee: currentBatch.length > 0 
                            ? `Processing: ${currentBatch.map(e => e.name).slice(0, 3).join(', ')}${currentBatch.length > 3 ? '...' : ''}`
                            : 'Processing...',
                        status: `Creating salary snapshots: ${currentPos} of ${totalEmployees} (${percentage}%)`
                    });

                    batchStart = currentPos;

                    if (hasMore) {
                        console.log(`[ReportTab] ⏳ Waiting 300ms before next batch...`);
                        await new Promise(resolve => setTimeout(resolve, 300));
                    } else {
                        console.log(`[ReportTab] ✅ ALL BATCHES COMPLETE - Exiting loop`);
                    }
                } else {
                    console.log('[ReportTab] ❌ ERROR: No batch_mode in result, stopping loop');
                    console.log('[ReportTab] Full result:', JSON.stringify(batchResult.data, null, 2));
                    hasMore = false;
                }
            }
            
            console.log(`[ReportTab] ============================================`);
            console.log(`[ReportTab] BATCH LOOP FINISHED`);
            console.log(`[ReportTab] Total iterations: ${loopIteration}`);
            console.log(`[ReportTab] Total employees processed: ${batchStart}`);
            console.log(`[ReportTab] ============================================`);
            
            // ============================================================
            // POST-FINALIZATION INVARIANT CHECK
            // Verify that snapshots count matches total employees
            // ============================================================
            console.log('[ReportTab] 🔍 Running post-finalization snapshot count verification...');
            const finalSnapshots = await base44.entities.SalarySnapshot.filter({
                project_id: project.id,
                report_run_id: reportRunId
            }, null, 5000);
            
            console.log(`[ReportTab] ============================================`);
            console.log(`[ReportTab] POST-FINALIZATION VERIFICATION:`);
            console.log(`[ReportTab]    Expected employees: ${totalEmployees}`);
            console.log(`[ReportTab]    Actual snapshots: ${finalSnapshots.length}`);
            console.log(`[ReportTab] ============================================`);
            
            if (finalSnapshots.length !== totalEmployees) {
                const errorMsg = `INVARIANT VIOLATION: Expected ${totalEmployees} snapshots, but found ${finalSnapshots.length} in database`;
                console.error(`[ReportTab] ❌ ${errorMsg}`);
                throw new Error(errorMsg);
            }
            
            console.log('[ReportTab] ✅ Snapshot count matches expected employee count');
            console.log('[ReportTab] All snapshots created successfully');

            return { reportRunId, result: markResult };
        },
        onSuccess: async ({ reportRunId, result }) => {
            console.log(`[ReportTab] ============================================`);
            console.log(`[ReportTab] FINALIZATION SUCCESS HANDLER`);
            console.log(`[ReportTab] Report run ID: ${reportRunId}`);
            console.log(`[ReportTab] ============================================`);
            
            setProgressDialog(prev => ({
                ...prev,
                status: 'Refreshing data...',
                currentEmployee: 'Please wait...'
            }));

            // Force refetch all relevant queries
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['project', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['reportRuns', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id, reportRunId], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['projects'], refetchType: 'all' })
            ]);

            // Wait a bit more to ensure snapshots are fully committed
            await new Promise(resolve => setTimeout(resolve, 1000));

            console.log(`[ReportTab] ✅ Finalization complete - closing progress dialog`);
            setProgressDialog({ open: false, current: 0, total: 0, currentEmployee: '', status: '' });
            toast.success('✅ Finalization complete! Salary snapshots created. Go to Salary Tab to generate reports.', {
                duration: 6000
            });
        },
        onError: async (error) => {
            console.error('[ReportTab] ============================================');
            console.error('[ReportTab] FINALIZATION ERROR HANDLER');
            console.error('[ReportTab] Error:', error);
            console.error('[ReportTab] ============================================');
            
            setProgressDialog({ open: false, current: 0, total: 0, currentEmployee: '', status: '' });

            // CRITICAL: Invalidate queries on error to reflect backend rollback
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['reportRuns', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id], refetchType: 'all' }),
                queryClient.invalidateQueries({ queryKey: ['project', project.id], refetchType: 'all' })
            ]);
            
            // Show detailed error message
            const errorMsg = error?.response?.data?.error || error.message || 'Unknown error';
            const actionRequired = error?.response?.data?.action_required;
            
            console.error('[ReportTab] Error details:', { errorMsg, actionRequired });
            
            if (actionRequired) {
                toast.error(`${errorMsg}\n\nAction required: ${actionRequired}`, {
                    duration: 10000
                });
            } else {
                toast.error('Failed to mark report as final: ' + errorMsg, {
                    duration: 5000
                });
            }
        }
    });

    const handleDeleteReport = (reportRunId) => {
        if (window.confirm('Delete this report? This will permanently remove all analysis results from this run.')) {
            deleteReportMutation.mutate(reportRunId);
        }
    };

    const handleMarkFinal = (reportRunId) => {
        console.log('[ReportTab] handleMarkFinal called for report:', reportRunId);
        console.log('[ReportTab] Mutation state:', { 
            isPending: markFinalMutation.isPending, 
            isIdle: markFinalMutation.isIdle 
        });
        
        if (window.confirm('Mark this report as final for salary calculation? This will unmark any previously selected final report.')) {
            console.log('[ReportTab] ✅ User confirmed finalization');
            
            // Show dialog IMMEDIATELY BEFORE mutation
            setProgressDialog({
                open: true,
                current: 0,
                total: 0,
                currentEmployee: 'Starting finalization...',
                status: 'Initializing...'
            });
            
            console.log('[ReportTab] 🚀 Calling mutate()...');
            markFinalMutation.mutate(reportRunId);
        } else {
            console.log('[ReportTab] ❌ User cancelled finalization');
        }
    };

    // Use a query hook to fetch results for a specific report when displaying verification count
    // Memoize report run IDs to prevent infinite re-renders
    const reportRunIds = React.useMemo(() => reportRuns.map(r => r.id).join(','), [reportRuns]);

    const { data: reportResults = {} } = useQuery({
        queryKey: ['reportResults', project.id, reportRunIds],
        queryFn: async () => {
            // Fetch results only for displayed reports
            const resultsByReport = {};
            for (const run of reportRuns) {
                const results = await base44.entities.AnalysisResult.filter({ 
                    project_id: project.id,
                    report_run_id: run.id 
                }, null, 5000);
                
                // Filter for department heads
                const filteredForDeptHead = isDepartmentHead && deptHeadVerification?.verified
                    ? results.filter(result => {
                        const resultAttIdStr = String(result.attendance_id);
                        return departmentEmployees.some(emp => String(emp.attendance_id) === resultAttIdStr);
                    })
                    : results;
                
                resultsByReport[run.id] = filteredForDeptHead;
            }
            return resultsByReport;
        },
        enabled: reportRuns.length > 0
    });

    // Find the finalized report
    const finalizedReport = allReportRuns.find(r => r.is_final === true);

    return (
        <div className="space-y-6">
            {/* Run Analysis Section - Always at top */}
            {!isDepartmentHead && (
                <Card className="border-0 shadow-md bg-white ring-1 ring-slate-950/5">
                    <CardHeader>
                        <CardTitle>Run Attendance Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                {punches.length > 0 ? (
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-amber-600" />
                                )}
                                <span className="text-slate-700">
                                    Punch Data: <strong>{punches.length}</strong> records from <strong>{uniqueEmployeeIds.length}</strong> employees
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {shifts.length > 0 ? (
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-amber-600" />
                                )}
                                <span className="text-slate-700">
                                    Shift Timings: <strong>{shifts.length}</strong> records
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle className="w-5 h-5 text-blue-600" />
                                <span className="text-slate-700">
                                    Exceptions: <strong>{exceptions.length}</strong> records
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {rules ? (
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-red-600" />
                                )}
                                <span className="text-slate-700">
                                    Rules Configuration: {rules ? 'Configured' : 'Not configured'}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <Label>Report Name (Optional)</Label>
                                <Input
                                    placeholder="e.g., December 2024 - Final"
                                    value={reportName}
                                    onChange={(e) => setReportName(e.target.value)}
                                    disabled={isAnalyzing}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Give this report a name for easy identification
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>From Date</Label>
                                    <Input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        min={project.date_from}
                                        max={project.date_to}
                                        disabled={isAnalyzing}
                                        title="Date range must be within project period"
                                    />
                                </div>
                                <div>
                                    <Label>To Date</Label>
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => {
                                            const newDate = e.target.value;
                                            if (newDate >= dateFrom && newDate <= project.date_to) {
                                                setDateTo(newDate);
                                            }
                                        }}
                                        min={dateFrom}
                                        max={project.date_to}
                                        disabled={isAnalyzing}
                                        title="Date range must be within project period"
                                    />
                                </div>
                            </div>

                            {analysisProgress && (
                                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-5">
                                    <div className="flex items-start gap-3 mb-3">
                                        <Loader2 className="w-6 h-6 text-indigo-600 animate-spin flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <p className="font-semibold text-indigo-900 text-lg">{analysisProgress.step}</p>
                                                <span className="text-sm font-medium text-indigo-700">
                                                    {analysisProgress.current}%
                                                </span>
                                            </div>
                                            <p className="text-sm text-indigo-800 font-medium">{analysisProgress.status}</p>
                                            {analysisProgress.subStatus && (
                                                <p className="text-xs text-indigo-600 mt-1">{analysisProgress.subStatus}</p>
                                            )}
                                        </div>
                                    </div>
                                    <Progress value={analysisProgress.current} className="h-2" />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <Button 
                                onClick={() => {
                                    performDataQualityCheck();
                                    setShowQualityCheck(true);
                                }}
                                variant="outline"
                                disabled={isAnalyzing}
                                size="lg"
                            >
                                <AlertTriangle className="w-5 h-5 mr-2" />
                                Check Data Quality
                            </Button>
                            <Button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing || !rules || punches.length === 0 || !dateFrom || !dateTo}
                                className="bg-indigo-600 hover:bg-indigo-700"
                                size="lg"
                            >
                                <Play className="w-5 h-5 mr-2" />
                                {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                            </Button>
                        </div>
                        <p className="text-sm text-slate-500">
                            Select a date range and run analysis to generate attendance report for that period.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Data Quality Check Dialog */}
            <Dialog open={showQualityCheck} onOpenChange={setShowQualityCheck}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Data Quality Check</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {dataQualityIssues.length === 0 ? (
                            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                                <CheckCircle className="w-6 h-6 text-green-600" />
                                <div>
                                    <p className="font-medium text-green-900">All checks passed!</p>
                                    <p className="text-sm text-green-700">Your data is ready for analysis.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {dataQualityIssues.map((issue, idx) => (
                                    <div 
                                        key={idx}
                                        className={`flex items-start gap-3 p-4 rounded-lg border ${
                                            issue.type === 'error' ? 'bg-red-50 border-red-200' :
                                            issue.type === 'warning' ? 'bg-amber-50 border-amber-200' :
                                            'bg-blue-50 border-blue-200'
                                        }`}
                                    >
                                        {issue.type === 'error' && <XCircle className="w-5 h-5 text-red-600 mt-0.5" />}
                                        {issue.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />}
                                        {issue.type === 'info' && <Info className="w-5 h-5 text-blue-600 mt-0.5" />}
                                        <div className="flex-1">
                                            <p className={`font-medium ${
                                                issue.type === 'error' ? 'text-red-900' :
                                                issue.type === 'warning' ? 'text-amber-900' :
                                                'text-blue-900'
                                            }`}>
                                                {issue.title}
                                            </p>
                                            <p className={`text-sm mt-1 ${
                                                issue.type === 'error' ? 'text-red-700' :
                                                issue.type === 'warning' ? 'text-amber-700' :
                                                'text-blue-700'
                                            }`}>
                                                {issue.details}
                                            </p>
                                            
                                            {issue.affectedList && (
                                                <div className="mt-3 bg-white/50 rounded-md p-2 border border-amber-200/50 max-h-40 overflow-y-auto">
                                                    <p className="text-xs font-semibold text-amber-800 mb-1">Affected Employees & Dates:</p>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                                        {issue.affectedList.slice(0, 50).map((item, i) => (
                                                            <div key={i} className="text-[10px] text-amber-700 flex justify-between">
                                                                <span className="truncate mr-2 font-medium">{item.name}</span>
                                                                <span className="shrink-0 opacity-70">{item.date}</span>
                                                            </div>
                                                        ))}
                                                        {issue.affectedList.length > 50 && (
                                                            <div className="text-[10px] text-amber-600 italic col-span-2 mt-1">
                                                                + {issue.affectedList.length - 50} more records...
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {dataQualityIssues.some(i => i.type === 'error') && !isAdmin && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                <p className="text-sm text-slate-700">
                                    <strong>Action Required:</strong> Please fix the errors above before running analysis.
                                </p>
                            </div>
                        )}
                        {dataQualityIssues.some(i => i.type === 'error') && isAdmin && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <p className="text-sm text-amber-700">
                                    <strong>Admin Override Available:</strong> Errors detected, but as an admin you can proceed anyway.
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowQualityCheck(false)}>
                            Close
                        </Button>
                        {!dataQualityIssues.some(i => i.type === 'error') && (
                            <Button 
                                onClick={() => {
                                    setShowQualityCheck(false);
                                    runAnalysis();
                                }}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                Proceed with Analysis
                            </Button>
                        )}
                        {dataQualityIssues.some(i => i.type === 'error') && isAdmin && (
                            <Button 
                                onClick={() => {
                                    setShowQualityCheck(false);
                                    runAnalysis();
                                }}
                                className="bg-amber-600 hover:bg-amber-700"
                            >
                                Proceed Anyway (Admin Override)
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Progress Dialog - Cannot be closed until complete */}
            <Dialog open={progressDialog.open} onOpenChange={() => {}}>
                <DialogContent 
                    className="sm:max-w-md" 
                    onPointerDownOutside={(e) => e.preventDefault()} 
                    onEscapeKeyDown={(e) => e.preventDefault()}
                    onInteractOutside={(e) => e.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle>Creating Salary Snapshots</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Progress</span>
                                <span className="font-medium">{progressDialog.current} / {progressDialog.total}</span>
                            </div>
                            <Progress 
                                value={progressDialog.total > 0 ? (progressDialog.current / progressDialog.total) * 100 : 0} 
                                className="h-2"
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="text-sm font-medium text-slate-700">
                                {progressDialog.status}
                            </div>
                            {progressDialog.currentEmployee && (
                                <div className="text-xs text-slate-500">
                                    {progressDialog.currentEmployee}
                                </div>
                            )}
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                            <div className="flex items-start gap-2 text-xs text-amber-800">
                                <div className="animate-spin h-3 w-3 border-2 border-amber-300 border-t-amber-600 rounded-full mt-0.5 flex-shrink-0"></div>
                                <div>
                                    <strong>Creating salary snapshots...</strong> This takes ~3 seconds per 10 employees.
                                    <br />
                                    <span className="text-amber-700">⚠️ Do NOT navigate away or close this dialog until complete!</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Generated Reports</CardTitle>
                    {finalizedReport && isAdminOrSupervisor && (
                        <Button
                            variant="outline"
                            onClick={async () => {
                                if (!confirm('Run data integrity repair? This will:\n1. Audit finalized report data\n2. Fix any mismatches between AnalysisResult → SalarySnapshot → SalaryReport\n3. Show final verification')) return;
                                
                                try {
                                    const { data } = await base44.functions.invoke('repairSalaryReportFromSnapshots', {
                                        report_run_id: finalizedReport.id
                                    });

                                    if (data.success) {
                                        const msg = `✅ REPAIR SUCCESSFUL\n\n${data.message}\n\nSnapshots recreated: ${data.actions_taken.snapshots_recreated}\nReports regenerated: ${data.actions_taken.reports_regenerated}`;
                                        alert(msg);
                                        queryClient.invalidateQueries(['reportRuns', project.id]);
                                        queryClient.invalidateQueries(['results']);
                                        queryClient.invalidateQueries(['salarySnapshots']);
                                    } else {
                                        alert(`⚠️ REPAIR FAILED\n\n${data.error || 'Unknown error'}`);
                                    }
                                } catch (err) {
                                    alert('Repair failed: ' + err.message);
                                }
                            }}
                            className="text-purple-600 border-purple-600"
                        >
                            <Settings className="w-4 h-4 mr-2" />
                            Repair Finalized Data
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {reportRuns.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No reports generated yet. Go to Analysis tab to generate your first report.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Report Name</TableHead>
                                        <TableHead>Generated On</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead>{isDepartmentHead ? 'Your Team' : 'Employees'}</TableHead>
                                        <TableHead>Verified</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportRuns.map((run) => {
                                        const runResults = reportResults[run.id] || [];
                                        const verifiedCount = isDepartmentHead
                                            ? runResults.length // For dept heads, show results count as verification
                                            : (run.verified_employees ? run.verified_employees.split(',').filter(Boolean).length : 0);
                                        
                                        return (
                                            <TableRow key={run.id}>
                                                <TableCell className="font-medium">
                                                    {run.report_name || 'Unnamed Report'}
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(run.created_date).toLocaleString('en-US', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        hour12: true,
                                                        timeZone: 'Asia/Dubai'
                                                    })}
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(run.date_from).toLocaleDateString()} - {new Date(run.date_to).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    {isDepartmentHead ? departmentEmployees.length : run.employee_count}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <span className={isDepartmentHead 
                                                            ? 'text-slate-600' 
                                                            : (verifiedCount === run.employee_count ? 'text-green-600' : 'text-slate-600')
                                                        }>
                                                            {isDepartmentHead ? runResults.length : verifiedCount} / {isDepartmentHead ? departmentEmployees.length : run.employee_count}
                                                        </span>
                                                        {!isDepartmentHead && verifiedCount === run.employee_count && (
                                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {/* 
                                                          BUSINESS LOGIC: Status-based Labeling
                                                          - 'Final' badge: Strictly based on 'is_final' field (marked for salary)
                                                          - 'Saved' badge: Strictly based on 'is_saved' field (edits persisted)
                                                          These labels persist based on DB state, not latest-report defaults.
                                                        */}
                                                        {run.is_final && (
                                                            <Badge className="bg-green-100 text-green-700 border-green-300">
                                                                <Star className="w-3 h-3 mr-1 fill-green-700" />
                                                                Final
                                                            </Badge>
                                                        )}
                                                        {run.is_saved && (
                                                            <Badge className="bg-blue-100 text-blue-700 border-blue-300">
                                                                <Save className="w-3 h-3 mr-1" />
                                                                Saved
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex gap-1 justify-end">
                                                        <Link to={createPageUrl('ReportDetail') + `?id=${run.id}&project_id=${project.id}`}>
                                                            <Button size="sm" variant="ghost" title="View report">
                                                                <Eye className="w-4 h-4 text-indigo-600" />
                                                            </Button>
                                                        </Link>
                                                        {!isDepartmentHead && isAdminOrSupervisor && !run.is_final && (
                                                             <Button 
                                                                 size="sm" 
                                                                 variant="ghost"
                                                                 onClick={() => handleMarkFinal(run.id)}
                                                                 disabled={markFinalMutation.isPending || run.is_final}
                                                                 title={run.is_final ? "Report already finalized" : "Mark as final report for salary"}
                                                             >
                                                                 <Star className="w-4 h-4 text-amber-600" />
                                                             </Button>
                                                         )}
                                                        {!isDepartmentHead && canDeleteReports && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="ghost"
                                                                onClick={() => handleDeleteReport(run.id)}
                                                                disabled={deleteReportMutation.isPending}
                                                                title="Delete report"
                                                            >
                                                                <Trash2 className="w-4 h-4 text-red-600" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}