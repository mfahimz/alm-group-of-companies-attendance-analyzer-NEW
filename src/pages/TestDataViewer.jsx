import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function TestDataViewer() {
    const [refreshKey, setRefreshKey] = useState(0);

    const { data: testProjects = [] } = useQuery({
        queryKey: ['testProjects', refreshKey],
        queryFn: () => base44.entities.Project.filter({ company: 'Test Company Ltd' })
    });

    const { data: testEmployees = [] } = useQuery({
        queryKey: ['testEmployees', refreshKey],
        queryFn: () => base44.entities.Employee.filter({ company: 'Test Company Ltd' })
    });

    const { data: analysisResults = [] } = useQuery({
        queryKey: ['analysisResults', refreshKey],
        queryFn: async () => {
            if (testProjects.length === 0) return [];
            const results = [];
            for (const project of testProjects) {
                const projectResults = await base44.entities.AnalysisResult.filter({ project_id: project.id });
                results.push(...projectResults);
            }
            return results;
        },
        enabled: testProjects.length > 0
    });

    const { data: salarySnapshots = [] } = useQuery({
        queryKey: ['salarySnapshots', refreshKey],
        queryFn: async () => {
            if (testProjects.length === 0) return [];
            const snapshots = [];
            for (const project of testProjects) {
                const projectSnapshots = await base44.entities.SalarySnapshot.filter({ project_id: project.id });
                snapshots.push(...projectSnapshots);
            }
            return snapshots;
        },
        enabled: testProjects.length > 0
    });

    const { data: reportRuns = [] } = useQuery({
        queryKey: ['reportRuns', refreshKey],
        queryFn: async () => {
            if (testProjects.length === 0) return [];
            const runs = [];
            for (const project of testProjects) {
                const projectRuns = await base44.entities.ReportRun.filter({ project_id: project.id });
                runs.push(...projectRuns);
            }
            return runs;
        },
        enabled: testProjects.length > 0
    });

    const handleDeleteTestData = async () => {
        if (!confirm('Delete ALL test data? This cannot be undone.')) return;

        try {
            // Delete in order: snapshots, analysis results, report runs, punches, shifts, exceptions, projects, employees
            if (salarySnapshots.length > 0) {
                await Promise.all(salarySnapshots.map(s => base44.entities.SalarySnapshot.delete(s.id)));
            }
            
            if (analysisResults.length > 0) {
                await Promise.all(analysisResults.map(r => base44.entities.AnalysisResult.delete(r.id)));
            }
            
            if (reportRuns.length > 0) {
                await Promise.all(reportRuns.map(r => base44.entities.ReportRun.delete(r.id)));
            }

            const punches = await base44.entities.Punch.filter({ project_id: testProjects[0]?.id });
            if (punches.length > 0) {
                await Promise.all(punches.map(p => base44.entities.Punch.delete(p.id)));
            }

            const shifts = await base44.entities.ShiftTiming.filter({ project_id: testProjects[0]?.id });
            if (shifts.length > 0) {
                await Promise.all(shifts.map(s => base44.entities.ShiftTiming.delete(s.id)));
            }

            const exceptions = await base44.entities.Exception.filter({ project_id: testProjects[0]?.id });
            if (exceptions.length > 0) {
                await Promise.all(exceptions.map(e => base44.entities.Exception.delete(e.id)));
            }

            const salaries = await base44.entities.EmployeeSalary.filter({ company: 'Test Company Ltd' });
            if (salaries.length > 0) {
                await Promise.all(salaries.map(s => base44.entities.EmployeeSalary.delete(s.id)));
            }

            if (testProjects.length > 0) {
                await Promise.all(testProjects.map(p => base44.entities.Project.delete(p.id)));
            }

            if (testEmployees.length > 0) {
                await Promise.all(testEmployees.map(e => base44.entities.Employee.delete(e.id)));
            }

            const rules = await base44.entities.AttendanceRules.filter({ company: 'Test Company Ltd' });
            if (rules.length > 0) {
                await Promise.all(rules.map(r => base44.entities.AttendanceRules.delete(r.id)));
            }

            toast.success('All test data deleted');
            setRefreshKey(prev => prev + 1);
        } catch (error) {
            toast.error('Error deleting test data: ' + error.message);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Test Data Viewer</h1>
                    <p className="text-sm text-slate-600 mt-1">View and manage test attendance & salary data</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setRefreshKey(prev => prev + 1)}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                    <Button variant="destructive" onClick={handleDeleteTestData}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Test Data
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="projects" className="w-full">
                <TabsList>
                    <TabsTrigger value="projects">Projects ({testProjects.length})</TabsTrigger>
                    <TabsTrigger value="employees">Employees ({testEmployees.length})</TabsTrigger>
                    <TabsTrigger value="reports">Report Runs ({reportRuns.length})</TabsTrigger>
                    <TabsTrigger value="analysis">Analysis Results ({analysisResults.length})</TabsTrigger>
                    <TabsTrigger value="salary">Salary Snapshots ({salarySnapshots.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="projects">
                    <Card>
                        <CardHeader>
                            <CardTitle>Test Projects</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Date Range</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Grace Carried</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {testProjects.map(project => (
                                        <TableRow key={project.id}>
                                            <TableCell className="font-medium">{project.name}</TableCell>
                                            <TableCell>{project.date_from} to {project.date_to}</TableCell>
                                            <TableCell>
                                                <Badge>{project.status}</Badge>
                                            </TableCell>
                                            <TableCell>{project.use_carried_grace_minutes ? 'Yes' : 'No'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="employees">
                    <Card>
                        <CardHeader>
                            <CardTitle>Test Employees</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>HRMS ID</TableHead>
                                        <TableHead>Att ID</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Carried Grace</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {testEmployees.map(emp => (
                                        <TableRow key={emp.id}>
                                            <TableCell className="font-medium">{emp.hrms_id}</TableCell>
                                            <TableCell>{emp.attendance_id}</TableCell>
                                            <TableCell>{emp.name}</TableCell>
                                            <TableCell>{emp.department}</TableCell>
                                            <TableCell>{emp.carried_grace_minutes || 0} min</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reports">
                    <Card>
                        <CardHeader>
                            <CardTitle>Report Runs</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Report Name</TableHead>
                                        <TableHead>Date Range</TableHead>
                                        <TableHead>Employees</TableHead>
                                        <TableHead>Final</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportRuns.map(run => (
                                        <TableRow key={run.id}>
                                            <TableCell className="font-medium">{run.report_name}</TableCell>
                                            <TableCell>{run.date_from} to {run.date_to}</TableCell>
                                            <TableCell>{run.employee_count}</TableCell>
                                            <TableCell>
                                                <Badge variant={run.is_final ? 'success' : 'outline'}>
                                                    {run.is_final ? 'Final' : 'Draft'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="analysis">
                    <Card>
                        <CardHeader>
                            <CardTitle>Analysis Results</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Att ID</TableHead>
                                            <TableHead>Working Days</TableHead>
                                            <TableHead>Present</TableHead>
                                            <TableHead>LOP</TableHead>
                                            <TableHead>Annual Leave</TableHead>
                                            <TableHead>Sick Leave</TableHead>
                                            <TableHead>Late Min</TableHead>
                                            <TableHead>Early Min</TableHead>
                                            <TableHead>Grace Min</TableHead>
                                            <TableHead>Approved Min</TableHead>
                                            <TableHead>Deductible Min</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {analysisResults.map(result => (
                                            <TableRow key={result.id}>
                                                <TableCell className="font-medium">{result.attendance_id}</TableCell>
                                                <TableCell>{result.working_days}</TableCell>
                                                <TableCell>{result.present_days}</TableCell>
                                                <TableCell>{result.full_absence_count}</TableCell>
                                                <TableCell>{result.annual_leave_count}</TableCell>
                                                <TableCell>{result.sick_leave_count}</TableCell>
                                                <TableCell>{result.late_minutes}</TableCell>
                                                <TableCell>{result.early_checkout_minutes}</TableCell>
                                                <TableCell>{result.grace_minutes}</TableCell>
                                                <TableCell>{result.approved_minutes}</TableCell>
                                                <TableCell className="font-semibold text-red-600">
                                                    {result.deductible_minutes}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="salary">
                    <Card>
                        <CardHeader>
                            <CardTitle>Salary Snapshots</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Att ID</TableHead>
                                            <TableHead>Source</TableHead>
                                            <TableHead>Total Salary</TableHead>
                                            <TableHead>Leave Days</TableHead>
                                            <TableHead>Leave Pay</TableHead>
                                            <TableHead>Salary Leave Amount</TableHead>
                                            <TableHead>Net Deduction</TableHead>
                                            <TableHead>Deductible Hours</TableHead>
                                            <TableHead>Deductible Pay</TableHead>
                                            <TableHead>Final Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {salarySnapshots.map(snapshot => (
                                            <TableRow key={snapshot.id}>
                                                <TableCell className="font-medium">{snapshot.name}</TableCell>
                                                <TableCell>{snapshot.attendance_id}</TableCell>
                                                <TableCell>
                                                    <Badge variant={snapshot.attendance_source === 'ANALYZED' ? 'success' : 'warning'}>
                                                        {snapshot.attendance_source}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{snapshot.total_salary}</TableCell>
                                                <TableCell>{snapshot.leaveDays}</TableCell>
                                                <TableCell>{snapshot.leavePay}</TableCell>
                                                <TableCell>{snapshot.salaryLeaveAmount}</TableCell>
                                                <TableCell className="text-red-600">{snapshot.netDeduction}</TableCell>
                                                <TableCell>{snapshot.deductibleHours}</TableCell>
                                                <TableCell className="text-red-600">{snapshot.deductibleHoursPay}</TableCell>
                                                <TableCell className="font-semibold text-green-600">
                                                    {snapshot.total}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}