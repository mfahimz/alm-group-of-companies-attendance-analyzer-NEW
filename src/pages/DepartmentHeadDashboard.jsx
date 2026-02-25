import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar as CalendarIcon, Eye, CheckCircle2, Clock, AlertCircle, Plus } from 'lucide-react';
import { format, parseISO, isAfter, addDays } from 'date-fns';
import { nowInUAE, utcToUAE } from '@/components/ui/timezone';
import PreApprovalDialog from '@/components/departmenthead/PreApprovalDialog.jsx';
import AllowedMinutesHistory from '@/components/departmenthead/AllowedMinutesHistory.jsx';

export default function DepartmentHeadDashboard() {
    usePageTitle('DepartmentHeadDashboard');
    
    const [showPreApprovalDialog, setShowPreApprovalDialog] = useState(false);
    const [viewingPreviousReport, setViewingPreviousReport] = useState(false);

    const queryClient = useQueryClient();

    // Get current user - shared from Layout cache
    const { data: currentUser, isLoading: userLoading } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me(),
        staleTime: Infinity, // Use cached data from Layout
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // SECURITY: Verify department head assignment via backend
    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isDepartmentHead = userRole === 'department_head';

    const { data: deptHeadVerification, isLoading: verificationLoading } = useQuery({
        queryKey: ['deptHeadVerification', isDepartmentHead, currentUser?.email],
        queryFn: async () => {
            // Only call if user role is department_head
            if (!isDepartmentHead) {
                console.log('[DeptHeadDashboard] Skipping verification - not a department head role');
                return null;
            }
            const { data } = await base44.functions.invoke('verifyDepartmentHead', {});
            return data;
        },
        enabled: !!currentUser && isDepartmentHead,
        retry: false,
        staleTime: 10 * 60 * 1000, // Cache for 10 minutes
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // Memoize dept head assignment to prevent re-renders
    const deptHeadAssignment = React.useMemo(() => {
        return deptHeadVerification?.verified ? {
            company: deptHeadVerification.assignment.company,
            department: deptHeadVerification.assignment.department,
            employee_id: deptHeadVerification.assignment.employee_id
        } : null;
    }, [deptHeadVerification?.verified, deptHeadVerification?.assignment?.company, deptHeadVerification?.assignment?.department, deptHeadVerification?.assignment?.employee_id]);

    // Memoize project query key to prevent re-renders
    const projectQueryKey = React.useMemo(() => 
        ['activeProject', deptHeadAssignment?.company, deptHeadAssignment?.department],
        [deptHeadAssignment?.company, deptHeadAssignment?.department]
    );

    // Get active project containing today's date (UAE timezone)
    const { data: currentProject, isLoading: projectLoading } = useQuery({
        queryKey: projectQueryKey,
        queryFn: async () => {
            if (!deptHeadAssignment) return null;
            
            // Get current date in UAE timezone (date only, no time)
            const today = nowInUAE();
            const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            
            console.log('🔍 Project Search:', {
                company: deptHeadAssignment.company,
                department: deptHeadAssignment.department,
                todayDateOnly
            });
            
            // Get all projects for this company
            const projects = await base44.entities.Project.filter({
                company: deptHeadAssignment.company
            });
            
            console.log('📊 Projects found:', projects.length, projects.map(p => ({
                name: p.name,
                company: p.company,
                department: p.department,
                date_from: p.date_from,
                date_to: p.date_to
            })));
            
            // Find project whose date range contains today (projects apply to all departments in a company)
            const activeProject = projects.find(p => {
                const projectStart = utcToUAE(p.date_from);
                const projectEnd = utcToUAE(p.date_to);
                
                // Compare date parts only
                const startDateOnly = new Date(projectStart.getFullYear(), projectStart.getMonth(), projectStart.getDate());
                const endDateOnly = new Date(projectEnd.getFullYear(), projectEnd.getMonth(), projectEnd.getDate());
                
                const isInDateRange = startDateOnly <= todayDateOnly && endDateOnly >= todayDateOnly;
                
                return isInDateRange;
            });
            
            console.log('✅ Active project:', activeProject?.name || 'NONE');
            return activeProject || null;
        },
        enabled: !!deptHeadAssignment,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // Get previous month's finalized report (UAE timezone)
    const { data: previousReport } = useQuery({
        queryKey: ['previousReport', deptHeadAssignment?.company, deptHeadAssignment?.department],
        queryFn: async () => {
            if (!deptHeadAssignment) return null;
            
            const now = nowInUAE();
            const prevMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthLast = new Date(now.getFullYear(), now.getMonth(), 0);
            
            // Get projects for previous month
            const projects = await base44.entities.Project.filter({
                company: deptHeadAssignment.company,
                department: deptHeadAssignment.department,
                status: 'closed'
            });
            
            const prevMonthProject = projects.find(p => {
                const projectStart = parseISO(p.date_from);
                const projectEnd = parseISO(p.date_to);
                return projectStart <= prevMonthFirst && projectEnd >= prevMonthLast;
            });
            
            if (!prevMonthProject || !prevMonthProject.last_saved_report_id) return null;
            
            // Get the final report
            const reports = await base44.entities.ReportRun.filter({
                id: prevMonthProject.last_saved_report_id,
                project_id: prevMonthProject.id
            });
            
            return reports[0] || null;
        },
        enabled: !!deptHeadAssignment && deptHeadAssignment.company === 'Al Maraghi Motors',
        staleTime: 10 * 60 * 1000, // Cache for 10 minutes
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // DEPARTMENT HEAD - Get previous report's project
    const { data: previousProject } = useQuery({
        queryKey: ['previousProject', previousReport?.project_id],
        queryFn: async () => {
            if (!previousReport) return null;
            const projects = await base44.entities.Project.filter({ id: previousReport.project_id });
            return projects[0] || null;
        },
        enabled: !!previousReport && viewingPreviousReport
    });

    // DEPARTMENT HEAD - Get previous report results filtered by department
    const { data: previousReportResults = [] } = useQuery({
        queryKey: ['previousReportResults', previousReport?.id, deptHeadAssignment?.department],
        queryFn: async () => {
            if (!previousReport || !deptHeadAssignment) return [];
            
            const allResults = await base44.entities.AnalysisResult.filter({ 
                report_run_id: previousReport.id 
            });
            
            // Get all employees for the project's company
            const allEmployees = await base44.entities.Employee.filter({
                company: deptHeadAssignment.company
            });
            
            // Filter results to only show employees from dept head's department
            return allResults.filter(result => {
                const employee = allEmployees.find(e => Number(e.attendance_id) === Number(result.attendance_id));
                return employee && employee.department === deptHeadAssignment.department;
            });
        },
        enabled: !!previousReport && !!deptHeadAssignment && viewingPreviousReport
    });

    // SECURITY: Server-side filtered employees for this department head (only managed subordinates)
    const { data: employees = [] } = useQuery({
        queryKey: ['deptEmployees', deptHeadAssignment?.company, deptHeadAssignment?.department, deptHeadVerification?.assignment?.managed_employee_ids],
        queryFn: async () => {
            if (!deptHeadVerification?.verified) return [];
            
            const managedIds = deptHeadVerification.assignment.managed_employee_ids 
                ? deptHeadVerification.assignment.managed_employee_ids.split(',').map(id => String(id.trim()))
                : [];
            
            if (managedIds.length === 0) return [];
            
            // Fetch all managed employees by their IDs
            const allEmployees = await base44.entities.Employee.filter({
                company: deptHeadVerification.assignment.company,
                active: true
            });
            
            // Filter to only managed subordinates using Employee IDs (not HRMS IDs)
            // CRITICAL: Exclude department head from the list (cannot self-approve)
            return allEmployees.filter(emp => 
                managedIds.includes(String(emp.id)) && 
                String(emp.id) !== String(deptHeadVerification.assignment.employee_id)
            );
        },
        enabled: !!deptHeadVerification?.verified,
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // No auto-initialization needed - using calendar quarters directly

    // Get quarterly minutes for all managed employees (calendar-based - auto-determined from current date)
    const { data: quarterlyMinutes = [] } = useQuery({
        queryKey: ['quarterlyMinutes', currentProject?.company],
        queryFn: async () => {
            if (!currentProject) return [];

            // Determine current quarter from today's date
            const today = nowInUAE();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth() + 1; // 1-12
            
            let currentQuarter;
            if (currentMonth >= 1 && currentMonth <= 3) currentQuarter = 1;
            else if (currentMonth >= 4 && currentMonth <= 6) currentQuarter = 2;
            else if (currentMonth >= 7 && currentMonth <= 9) currentQuarter = 3;
            else currentQuarter = 4;

            // Fetch quarterly minutes for current quarter
            const allMinutes = await base44.entities.EmployeeQuarterlyMinutes.filter({
                company: currentProject.company,
                year: currentYear,
                quarter: currentQuarter
            });

            return allMinutes;
        },
        enabled: !!currentProject && currentProject.company === 'Al Maraghi Motors',
        staleTime: 2 * 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false
    });

    // Get remaining minutes for an employee (handle both string and number IDs)
    const getEmployeeRemainingMinutes = (employeeId) => {
        const record = quarterlyMinutes.find(qm => String(qm.employee_id) === String(employeeId));
        return record?.remaining_minutes || 0;
    };

    // Check if salary is closed for current project
    const salaryIsClosed = currentProject?.status === 'closed';

    // CRITICAL: Single loading state - wait for ALL essential data before rendering anything
    const isInitialLoading = userLoading || verificationLoading || (!!deptHeadAssignment && projectLoading);

    if (isInitialLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    // After loading completes, check for errors/issues (base44 handles auth redirect)
    if (!currentUser || !deptHeadVerification?.verified) {
        const errorMessage = deptHeadVerification?.error || 'You are not assigned as a department head.';
        return (
            <div className="max-w-4xl mx-auto p-6">
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="p-6 text-center">
                        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2">Department Head Access Required</h2>
                        <p className="text-slate-600 mb-4">
                            {errorMessage}
                        </p>
                        <p className="text-sm text-slate-500">
                            Please contact your administrator to resolve this issue.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Check if not Al Maraghi Motors (after all data is loaded)
    if (deptHeadAssignment && deptHeadAssignment.company !== 'Al Maraghi Motors') {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="p-6 text-center">
                        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2">Feature Not Available</h2>
                        <p className="text-slate-600">
                            This feature is currently only available for Al Maraghi Motors.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (viewingPreviousReport && previousReport && previousProject) {
        return (
            <div className="max-w-7xl mx-auto p-6 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Previous Month Report</h1>
                        <p className="text-slate-600 mt-1">
                            {deptHeadAssignment.department} Department - {format(parseISO(previousReport.date_from), 'MMMM yyyy')}
                        </p>
                    </div>
                    <Button onClick={() => setViewingPreviousReport(false)} variant="outline">
                        Back to Dashboard
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Report Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-slate-600">Report Name</p>
                                <p className="font-medium">{previousReport.report_name || 'Unnamed Report'}</p>
                            </div>
                            <div>
                                <p className="text-sm text-slate-600">Period</p>
                                <p className="font-medium">{format(parseISO(previousReport.date_from), 'dd MMM yyyy')} - {format(parseISO(previousReport.date_to), 'dd MMM yyyy')}</p>
                            </div>
                            <div>
                                <p className="text-sm text-slate-600">Your Department Employees</p>
                                <p className="font-medium">{previousReportResults.length}</p>
                            </div>
                            <div>
                                <p className="text-sm text-slate-600">Generated On</p>
                                <p className="font-medium">{format(parseISO(previousReport.created_date), 'dd MMM yyyy HH:mm')}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Department-Filtered Report Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Attendance Report - {deptHeadAssignment.department} Department</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Working Days</TableHead>
                                        <TableHead>Present Days</TableHead>
                                        <TableHead>LOP Days</TableHead>
                                        <TableHead>Late Minutes</TableHead>
                                        <TableHead>Early Checkout</TableHead>
                                        <TableHead>Approved Minutes</TableHead>
                                        <TableHead>Grace</TableHead>
                                        <TableHead>Deductible</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {previousReportResults.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                                                No employees found in your department for this report
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        previousReportResults.map((result) => {
                                            const employee = employees.find(e => Number(e.attendance_id) === Number(result.attendance_id));
                                            const total = (result.late_minutes || 0) + (result.early_checkout_minutes || 0) + (result.other_minutes || 0);
                                            const grace = result.grace_minutes ?? 15;
                                            const approved = result.approved_minutes || 0;
                                            const deductible = Math.max(0, total - grace - approved);
                                            
                                            return (
                                                <TableRow key={result.id}>
                                                    <TableCell className="font-medium">{result.attendance_id}</TableCell>
                                                    <TableCell>{employee?.name || 'Unknown'}</TableCell>
                                                    <TableCell>{result.working_days}</TableCell>
                                                    <TableCell>{result.present_days}</TableCell>
                                                    <TableCell>
                                                        <span className={`${result.full_absence_count > 0 ? 'text-red-600 font-medium' : ''}`}>
                                                            {result.full_absence_count}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`${result.late_minutes > 0 ? 'text-orange-600 font-medium' : ''}`}>
                                                            {result.late_minutes || 0}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`${result.early_checkout_minutes > 0 ? 'text-blue-600 font-medium' : ''}`}>
                                                            {result.early_checkout_minutes || 0}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`${approved > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}`}>
                                                            {approved}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>{grace}</TableCell>
                                                    <TableCell>
                                                        <span className={`font-bold ${deductible > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            {deductible} min
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const projectEndDate = currentProject ? utcToUAE(currentProject.date_to) : null;
    const approvalPeriodEnded = projectEndDate && isAfter(nowInUAE(), projectEndDate);

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Department Head Dashboard</h1>
                    <p className="text-slate-600 mt-1">
                        {deptHeadAssignment.department} Department - {deptHeadAssignment.company}
                    </p>
                </div>
                {previousReport && (
                    <Button 
                        onClick={() => setViewingPreviousReport(true)}
                        variant="outline"
                        className="border-indigo-300 hover:bg-indigo-50"
                    >
                        <Eye className="w-4 h-4 mr-2" />
                        View Previous Month Report
                    </Button>
                )}
            </div>

            {/* Current Project Info */}
            {currentProject && (
                <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-indigo-600 rounded-lg">
                                <CalendarIcon className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-semibold text-slate-900">{currentProject.name}</h2>
                                <p className="text-slate-600 mt-1">
                                    {format(parseISO(currentProject.date_from), 'dd MMM yyyy')} - {format(parseISO(currentProject.date_to), 'dd MMM yyyy')}
                                </p>
                                {approvalPeriodEnded && (
                                    <div className="mt-3 bg-amber-100 border border-amber-300 rounded-lg p-3">
                                        <p className="text-amber-900 text-sm font-medium flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4" />
                                            Approval period has ended. No new approvals can be added.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {!currentProject && (
                <Card>
                    <CardContent className="p-6 text-center">
                        <Clock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold mb-2">No Active Project</h2>
                        <p className="text-slate-600">
                            No project found for the current month. Please contact your administrator.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Show message when salary is closed - access to attendance report */}
            {currentProject && salaryIsClosed && (
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-green-600 rounded-lg">
                                <CheckCircle2 className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-semibold text-slate-900">Salary Closed</h2>
                                <p className="text-slate-600 mt-1">
                                    The salary for this period has been finalized. You can now view the complete attendance report for your subordinates below.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Pre-Approval Dialog Trigger - only shown before salary is closed */}
            {currentProject && !salaryIsClosed && !approvalPeriodEnded && (
                <div className="flex justify-end">
                    <Button 
                        onClick={() => setShowPreApprovalDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Pre-Approved Minutes
                    </Button>
                </div>
            )}

            {/* Pre-Approval Dialog */}
            <PreApprovalDialog 
                open={showPreApprovalDialog}
                onClose={() => setShowPreApprovalDialog(false)}
                projectId={currentProject?.id}
                employees={employees}
                deptHeadAssignment={deptHeadAssignment}
                deptHeadVerification={deptHeadVerification}
                currentProject={currentProject}
                onSuccess={() => {
                    queryClient.invalidateQueries(['preApprovals', currentProject?.id]);
                }}
            />

            {/* Pre-Approved Minutes History */}
            {currentProject && (
                <AllowedMinutesHistory 
                    projectId={currentProject.id}
                    deptHeadVerification={deptHeadVerification}
                />
            )}


        </div>
    );
}