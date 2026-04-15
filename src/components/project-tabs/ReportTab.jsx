import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchAllRecords } from '../utils/paginatedFetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Trash2, CheckCircle, Star, Save, Settings, AlertCircle, Play, Loader2, AlertTriangle, Info, XCircle, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';

export default function ReportTab({ project, isDepartmentHead = false }) {

    
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
    
    // Selection state for bulk actions
    const [selectedIds, setSelectedIds] = React.useState([]);



    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const isSupervisor = userRole === 'supervisor';
    const isCEO = userRole === 'ceo';
    const isHRManager = userRole === 'hr_manager';
    const isSeniorAccountant = userRole === 'senior_accountant';
    const isUser = userRole === 'user';
    const isAdminOrSupervisor = isAdmin || isSupervisor || isCEO || isHRManager;
    const canModifyAttendance = isAdminOrSupervisor && !isSeniorAccountant;
    const canDeleteReports = (isAdmin || isSupervisor || isUser || isCEO || isHRManager) && !isSeniorAccountant;



    // LIGHTWEIGHT COUNTS ONLY - no heavy paginated fetches
    // Analysis runs on backend, so we only need counts for the UI status display
    const { data: dataCounts = { punches: 0, shifts: 0, exceptions: 0, employees: 0 } } = useQuery({
        queryKey: ['projectDataCounts', project.id],
        queryFn: async () => {
            // Fetch just first page with limit=1 to get existence, then use count-like approach
            const [punchPage, shiftPage, exceptionPage, employeePage] = await Promise.all([
                base44.entities.Punch.filter({ project_id: project.id }, null, 1),
                base44.entities.ShiftTiming.filter({ project_id: project.id }, null, 1),
                base44.entities.Exception.filter({ project_id: project.id }, null, 1),
                base44.entities.Employee.filter({ company: project.company, active: true }, null, 1)
            ]);
            // For display we show ">0" or exact small counts. Full counts come from backend analysis.
            return {
                punches: punchPage.length > 0 ? '✓' : 0,
                shifts: shiftPage.length > 0 ? '✓' : 0,
                exceptions: exceptionPage.length > 0 ? '✓' : 0,
                employees: employeePage.length > 0 ? '✓' : 0,
                hasPunches: punchPage.length > 0,
                hasShifts: shiftPage.length > 0,
                hasRules: false // checked separately
            };
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
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

    // Analysis functions - simplified since analysis runs on backend
    const performDataQualityCheck = () => {
        const issues = [];
        
        if (!dataCounts.hasPunches) {
            issues.push({
                type: 'error',
                title: 'No punch data uploaded',
                details: 'Upload punch data in the Punches tab before running analysis'
            });
        }

        if (!dataCounts.hasShifts) {
            issues.push({
                type: 'warning',
                title: 'No shift timings configured',
                details: 'Add shift timings in the Shifts tab for accurate analysis'
            });
        }

        if (!rules) {
            issues.push({
                type: 'error',
                title: 'Attendance rules not configured',
                details: 'Configure rules in Settings > Rules for this company'
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

        if (!dataCounts.hasPunches) {
            toast.error('No punch data available. Please upload punches first.');
            return;
        }

        if (!dataCounts.hasShifts) {
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
                subStatus: `Processing employees across ${Math.ceil((new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24))} days`
            });

            // Single call to backend - processes all employees at once
            // No chunking needed - backend handles pagination and rate limiting internally
            const response = await base44.functions.invoke('runAnalysis', {
                project_id: project.id,
                date_from: dateFrom,
                date_to: dateTo,
                report_name: reportName.trim() || `Report - ${new Date().toLocaleDateString()}`
            });

            if (!response.data.success) {
                throw new Error(response.data.error || 'Analysis failed');
            }

            const totalProcessed = response.data.processed_count;

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
                return null;
            }

            const { data } = await base44.functions.invoke('verifyDepartmentHead', {});

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

            const runs = await base44.entities.ReportRun.filter({ project_id: project.id }, '-created_date', 5000);

            return runs;
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
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



    // Don't fetch all results upfront - fetch per report when needed
    // This prevents loading hundreds of duplicate analysis results from all historical runs

    // Get employees for department head filtering - MUST use managed_employee_ids
    const { data: departmentEmployees = [], error: employeesError } = useQuery({
        queryKey: ['departmentEmployees', project.id, isDepartmentHead, deptHeadVerification?.assignment?.managed_employee_ids],
        queryFn: async () => {
            if (!isDepartmentHead || !deptHeadVerification?.verified) {

                return [];
            }
            
            const managedIds = deptHeadVerification.assignment.managed_employee_ids 
                ? deptHeadVerification.assignment.managed_employee_ids.split(',').map(id => String(id.trim()))
                : [];
            

            
            if (managedIds.length === 0) {
    
                return [];
            }
            
            // Fetch all employees for the company
            const allEmployees = await base44.entities.Employee.filter({
                company: deptHeadVerification.assignment.company,
                active: true
            }, null, 5000);



            // Filter to only managed subordinates using Employee IDs (not HRMS IDs)
            // CRITICAL: Exclude department head from the list
            const filtered = allEmployees.filter(emp => 
                managedIds.includes(String(emp.id)) && 
                String(emp.id) !== String(deptHeadVerification.assignment.employee_id)
            );


            return filtered;
        },
        enabled: isDepartmentHead && !!deptHeadVerification?.verified
    });

    React.useEffect(() => {
        if (employeesError) {
            console.error('[ReportTab] Department employees fetch error:', employeesError);
        }
    }, [employeesError]);

    const deleteReportsMutation = useMutation({
        mutationFn: async (ids) => {
            const reportRunIds = Array.isArray(ids) ? ids : [ids];
            
            for (const reportRunId of reportRunIds) {
                // Fetch all associated data for this report - use paginated fetch
                const [resultsToDelete, snapshotsToDelete] = await Promise.all([
                    fetchAllRecords(base44.entities.AnalysisResult, { 
                        project_id: project.id, 
                        report_run_id: reportRunId 
                    }),
                    fetchAllRecords(base44.entities.SalarySnapshot, {
                        project_id: project.id,
                        report_run_id: reportRunId
                    })
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
                
                // Step 2: GIFT_MINUTES exception cleanup logic.
                // These exceptions are created during the gift minutes batch save and are tied to attendance_ids
                // within a report run. They must be cleaned up when a report is deleted to avoid "orphaned"
                // exceptions interfering with future report generation or showing up in other reports.
                const attendanceIds = [...new Set(resultsToDelete.map(r => String(r.attendance_id)).filter(Boolean))];
                
                if (attendanceIds.length > 0) {

                    
                    // Fetch all GIFT_MINUTES exceptions for this project
                    const allGiftExceptions = await fetchAllRecords(base44.entities.Exception, {
                        project_id: project.id,
                        type: 'GIFT_MINUTES'
                    });
                    
                    // Filter exceptions that belong to the employees in the report being deleted
                    const exceptionsToDelete = allGiftExceptions.filter(ex => 
                        attendanceIds.includes(String(ex.attendance_id))
                    );
                    
                    if (exceptionsToDelete.length > 0) {
                        const EXCEPTION_BATCH_SIZE = 8;
                        const EXCEPTION_BATCH_DELAY = 1500;
                        const RETRY_DELAYS = [1000, 2000, 4000];
                        
                        // Recursive delete function with exponential backoff for 429 rate limits
                        const deleteExceptionWithRetry = async (id, attempt = 0) => {
                            try {
                                await base44.entities.Exception.delete(id);
                            } catch (error) {
                                const isRateLimit = error.status === 429 || error.message?.toLowerCase().includes('rate limit');
                                if (isRateLimit && attempt < RETRY_DELAYS.length) {
                                    if (import.meta.env.DEV) {
                                        console.warn(`[ReportTab] Rate limited during exception deletion for ${id}, retrying in ${RETRY_DELAYS[attempt]}ms...`);
                                    }
                                    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                                    return deleteExceptionWithRetry(id, attempt + 1);
                                }
                                throw error;
                            }
                        };
                        
                        // Process deletions in batches of 8 with inter-batch delays
                        for (let j = 0; j < exceptionsToDelete.length; j += EXCEPTION_BATCH_SIZE) {
                            const batch = exceptionsToDelete.slice(j, j + EXCEPTION_BATCH_SIZE);
                            await Promise.all(batch.map(ex => deleteExceptionWithRetry(ex.id)));
                            if (j + EXCEPTION_BATCH_SIZE < exceptionsToDelete.length) {
                                await new Promise(resolve => setTimeout(resolve, EXCEPTION_BATCH_DELAY));
                            }
                        }

                    }
                }

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
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reportRuns', project.id] });
            queryClient.invalidateQueries({ queryKey: ['reportResults', project.id] });
            queryClient.invalidateQueries({ queryKey: ['salarySnapshots', project.id] });
            setSelectedIds([]); // Clear selection after deletion
            toast.success('Selected report(s) and associated data deleted successfully');
        },
        onError: (error) => {
            console.error('[ReportTab] Delete error:', error);
            toast.error('Failed to delete report(s): ' + (error.message || 'Unknown error'));
        }
    });

    const renameReportMutation = useMutation({
        mutationFn: async ({ id, newName }) => {
            await base44.entities.ReportRun.update(id, { report_name: newName });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['reportRuns', project.id]);
            toast.success('Report renamed successfully');
        },
        onError: (error) => {
            toast.error('Failed to rename report: ' + error.message);
        }
    });

    const handleRenameReport = (id, currentName) => {
        const newName = window.prompt('Enter new report name:', currentName || '');
        if (newName !== null && newName.trim() !== '') {
            renameReportMutation.mutate({ id, newName: newName.trim() });
        }
    };

    const handleBulkDelete = () => {
        if (selectedIds.length === 0) return;
        if (window.confirm(`Delete ${selectedIds.length} selected report(s)? This will permanently remove all associated analysis results.`)) {
            deleteReportsMutation.mutate(selectedIds);
        }
    };

    const toggleSelection = (id) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleAllSelection = () => {
        if (selectedIds.length === reportRuns.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(reportRuns.map(r => r.id));
        }
    };



    // Use a query hook to fetch results for a specific report when displaying verification count
    // Memoize report run IDs to prevent infinite re-renders
    const reportRunIds = React.useMemo(() => reportRuns.map(r => r.id).join(','), [reportRuns]);

    const { data: reportResults = {} } = useQuery({
        queryKey: ['reportResults', project.id, reportRunIds],
        queryFn: async () => {
            // Fetch results only for displayed reports with delays between each to avoid rate limiting
            const resultsByReport = {};
            for (let i = 0; i < reportRuns.length; i++) {
                const run = reportRuns[i];
                // Use single page fetch (limit 500) instead of full paginated fetch for list view
                const results = await base44.entities.AnalysisResult.filter({ 
                    project_id: project.id,
                    report_run_id: run.id 
                }, null, 500);
                
                // Filter for department heads
                const filteredForDeptHead = isDepartmentHead && deptHeadVerification?.verified
                    ? results.filter(result => {
                        const resultAttIdStr = String(result.attendance_id);
                        return departmentEmployees.some(emp => String(emp.attendance_id) === resultAttIdStr);
                    })
                    : results;
                
                resultsByReport[run.id] = filteredForDeptHead;
                // Add delay between report fetches to avoid rate limiting
                if (i < reportRuns.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            return resultsByReport;
        },
        enabled: reportRuns.length > 0,
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // Find the finalized report
    const finalizedReport = allReportRuns.find(r => r.is_final === true);

    return (
        <div className="space-y-6">
            {/* Run Analysis Section - Always at top */}
            {!isDepartmentHead && !isSeniorAccountant && (
                <Card className="border-0 shadow-md bg-white ring-1 ring-slate-950/5">
                    <CardHeader>
                        <CardTitle>Run Attendance Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                {dataCounts.hasPunches ? (
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-amber-600" />
                                )}
                                <span className="text-slate-700">
                                    Punch Data: {dataCounts.hasPunches ? <strong>Available</strong> : <strong className="text-amber-600">Not uploaded</strong>}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {dataCounts.hasShifts ? (
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-amber-600" />
                                )}
                                <span className="text-slate-700">
                                    Shift Timings: {dataCounts.hasShifts ? <strong>Configured</strong> : <strong className="text-amber-600">Not configured</strong>}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle className="w-5 h-5 text-blue-600" />
                                <span className="text-slate-700">
                                    Exceptions: {dataCounts.exceptions === '✓' ? <strong>Available</strong> : <strong>None</strong>}
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
                                disabled={isAnalyzing || !dataCounts.hasPunches}
                                className="bg-indigo-600 hover:bg-indigo-700 transition-all duration-200 shadow-sm"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4 mr-2 capitalize" />
                                        Run Analysis
                                    </>
                                )}
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
                    <div className="flex items-center gap-4">
                        <CardTitle>Generated Reports</CardTitle>
                        {selectedIds.length > 0 && isAdminOrSupervisor && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleBulkDelete}
                                disabled={deleteReportsMutation.isPending}
                                className="animate-in fade-in zoom-in duration-200"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Selected ({selectedIds.length})
                            </Button>
                        )}
                    </div>
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
                        <div className="text-center py-12 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                            <p className="text-slate-500 font-medium">No reports generated yet</p>
                            <p className="text-xs text-slate-400 mt-1">Run analysis to create your first report</p>
                        </div>
                    ) : (
                        <div className="border rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-200/60 bg-white">
                            <Table>
                                <TableHeader className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[50px]">
                                            <Checkbox 
                                                checked={selectedIds.length === reportRuns.length && reportRuns.length > 0}
                                                onCheckedChange={toggleAllSelection}
                                            />
                                        </TableHead>
                                        <TableHead>Report Name</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead>{isDepartmentHead ? 'Your Team' : 'Employees'}</TableHead>
                                        {!isDepartmentHead && <TableHead>Verified</TableHead>}
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
                                            <TableRow key={run.id} className={`${selectedIds.includes(run.id) ? 'bg-slate-50' : ''} group hover:bg-slate-50/80 transition-colors duration-200`}>
                                                <TableCell>
                                                    <Checkbox 
                                                        checked={selectedIds.includes(run.id)}
                                                        onCheckedChange={() => toggleSelection(run.id)}
                                                    />
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        {run.report_name || 'Unnamed Report'}
                                                        {!isDepartmentHead && canModifyAttendance && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="sm" 
                                                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                onClick={() => handleRenameReport(run.id, run.report_name)}
                                                            >
                                                                <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(run.date_from).toLocaleDateString()} - {new Date(run.date_to).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell>
                                                    {isDepartmentHead ? departmentEmployees.length : run.employee_count}
                                                </TableCell>
                                                {!isDepartmentHead && (
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <span className={verifiedCount === run.employee_count ? 'text-green-600' : 'text-slate-600'}>
                                                            {verifiedCount} / {run.employee_count}
                                                        </span>
                                                        {verifiedCount === run.employee_count && (
                                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                )}
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
                                                        <Link to={createPageUrl('ReportDetail') + `?id=${run.id}&project_id=${project.id}&from_tab=report`}>
                                                            <Button size="sm" variant="ghost" title="View report">
                                                                <Eye className="w-4 h-4 text-indigo-600" />
                                                            </Button>
                                                        </Link>
                                                        {!isDepartmentHead && canDeleteReports && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    if (window.confirm('Delete this report? This will permanently remove all analysis results from this run.')) {
                                                                        deleteReportsMutation.mutate(run.id);
                                                                    }
                                                                }}
                                                                disabled={deleteReportsMutation.isPending}
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