import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { DollarSign, Users, FolderKanban, ArrowRight, TrendingUp, FileText, Banknote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AEDIcon from '../ui/AEDIcon';
import { useCompanyFilter } from '../context/CompanyContext';

export default function AccountantDashboard({ projects, employees, currentUser }) {
    const { selectedCompany: companyFilter } = useCompanyFilter();

    // Salary records
    const { data: salaries = [], isLoading: salariesLoading } = useQuery({
        queryKey: ['acctDashSalaries', companyFilter],
        queryFn: async () => {
            if (companyFilter) {
                return base44.entities.EmployeeSalary.filter({ company: companyFilter }, '-created_date');
            }
            return base44.entities.EmployeeSalary.list('-created_date');
        },
        staleTime: 5 * 60 * 1000
    });

    // Salary increments (pending / recent)
    const { data: increments = [], isLoading: incrementsLoading } = useQuery({
        queryKey: ['acctDashIncrements'],
        queryFn: () => base44.entities.SalaryIncrement.list('-created_date', 50),
        staleTime: 5 * 60 * 1000
    });

    // Finalized report runs for salary snapshots
    const projectIds = React.useMemo(() => projects.map(p => p.id), [projects]);
    const { data: finalizedReports = [] } = useQuery({
        queryKey: ['acctDashFinalReports', projectIds],
        queryFn: async () => {
            if (projectIds.length === 0) return [];
            const batches = await Promise.all(
                projectIds.map(pid =>
                    base44.entities.ReportRun.filter({ project_id: pid, is_final: true })
                )
            );
            const flat = batches.flat();
            flat.sort((a, b) => (b.date_to || '').localeCompare(a.date_to || ''));
            return flat;
        },
        enabled: projectIds.length > 0,
        staleTime: 5 * 60 * 1000
    });

    // Derived stats
    const activeSalaries = salaries.filter(s => s.active !== false);
    const totalPayroll = activeSalaries.reduce((sum, s) => sum + (Number(s.total_salary) || 0), 0);
    const totalBasic = activeSalaries.reduce((sum, s) => sum + (Number(s.basic_salary) || 0), 0);
    const totalAllowances = activeSalaries.reduce((sum, s) => sum + (Number(s.allowances) || 0) + (Number(s.allowances_with_bonus) || 0), 0);

    const pendingIncrements = increments.filter(i => i.status === 'pending' || i.status === 'approved');
    const analyzedProjects = projects.filter(p => p.status === 'analyzed');

    const formatAED = (val) => {
        const num = Number(val) || 0;
        return num.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Group salaries by company for breakdown
    const salaryByCompany = activeSalaries.reduce((acc, s) => {
        const company = s.company || 'Uncategorized';
        if (!acc[company]) acc[company] = { count: 0, total: 0 };
        acc[company].count++;
        acc[company].total += Number(s.total_salary) || 0;
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            {/* KPI Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link to={createPageUrl('Salaries')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-emerald-50 to-emerald-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-emerald-600 mb-1">Total Monthly Payroll</p>
                                    <p className="text-2xl font-bold text-emerald-900 flex items-center gap-1">
                                        <AEDIcon className="w-4 h-4" />
                                        {formatAED(totalPayroll)}
                                    </p>
                                    <p className="text-xs text-emerald-600 mt-1">{activeSalaries.length} active records</p>
                                </div>
                                <div className="bg-emerald-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('Salaries')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-blue-50 to-blue-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-blue-600 mb-1">Total Basic Salary</p>
                                    <p className="text-2xl font-bold text-blue-900 flex items-center gap-1">
                                        <AEDIcon className="w-4 h-4" />
                                        {formatAED(totalBasic)}
                                    </p>
                                    <p className="text-xs text-blue-600 mt-1">
                                        Allowances: {formatAED(totalAllowances)}
                                    </p>
                                </div>
                                <div className="bg-blue-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <Banknote className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('SalaryIncrements')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-amber-50 to-amber-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-amber-600 mb-1">Pending Modifications</p>
                                    <p className="text-3xl font-bold text-amber-900">{pendingIncrements.length}</p>
                                    <p className="text-xs text-amber-600 mt-1">{increments.length} total modifications</p>
                                </div>
                                <div className="bg-amber-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>

                <Link to={createPageUrl('SalaryAnalytics')} className="block">
                    <Card className="border-0 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-pointer bg-gradient-to-br from-indigo-50 to-indigo-100">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-1">Finalized Reports</p>
                                    <p className="text-3xl font-bold text-indigo-900">{finalizedReports.length}</p>
                                    <p className="text-xs text-indigo-600 mt-1">{analyzedProjects.length} awaiting finalization</p>
                                </div>
                                <div className="bg-indigo-500 text-white p-3 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                                    <FileText className="w-5 h-5" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payroll by Company */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-lg">
                                <DollarSign className="w-5 h-5 text-emerald-600" />
                            </div>
                            <CardTitle className="text-lg">Payroll by Company</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {Object.entries(salaryByCompany).sort((a, b) => b[1].total - a[1].total).map(([company, data]) => (
                                <div key={company} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                                    <div>
                                        <p className="font-medium text-slate-900">{company}</p>
                                        <p className="text-xs text-slate-500">{data.count} employees</p>
                                    </div>
                                    <span className="font-semibold text-emerald-700 flex items-center gap-1">
                                        <AEDIcon className="w-3.5 h-3.5" />
                                        {formatAED(data.total)}
                                    </span>
                                </div>
                            ))}
                            {Object.keys(salaryByCompany).length === 0 && (
                                <p className="text-sm text-slate-500 text-center py-4">No salary data available</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <FolderKanban className="w-5 h-5 text-purple-600" />
                            </div>
                            <CardTitle className="text-lg">Quick Actions</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                            <Link to={createPageUrl('Salaries')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-emerald-50 hover:border-emerald-200">
                                    <DollarSign className="w-5 h-5 text-emerald-600" />
                                    <span className="text-sm">Salary Records</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('SalaryIncrements')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-amber-50 hover:border-amber-200">
                                    <TrendingUp className="w-5 h-5 text-amber-600" />
                                    <span className="text-sm">Modifications</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('SalaryAnalytics')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-indigo-50 hover:border-indigo-200">
                                    <FileText className="w-5 h-5 text-indigo-600" />
                                    <span className="text-sm">Salary Analytics</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('SalaryAdjustments')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-blue-50 hover:border-blue-200">
                                    <Banknote className="w-5 h-5 text-blue-600" />
                                    <span className="text-sm">Adjustments</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('Projects')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-slate-50 hover:border-slate-200">
                                    <FolderKanban className="w-5 h-5 text-slate-600" />
                                    <span className="text-sm">Projects</span>
                                </Button>
                            </Link>
                            <Link to={createPageUrl('Employees')}>
                                <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1.5 hover:bg-blue-50 hover:border-blue-200">
                                    <Users className="w-5 h-5 text-blue-600" />
                                    <span className="text-sm">Employees</span>
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Finalized Reports */}
            <Card className="border-0 shadow-lg">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <FileText className="w-5 h-5 text-indigo-600" />
                            </div>
                            <CardTitle className="text-lg">Recent Finalized Reports</CardTitle>
                        </div>
                        <Link to={createPageUrl('SalaryAnalytics')}>
                            <Button variant="ghost" size="sm" className="text-indigo-600">
                                View all <ArrowRight className="w-4 h-4 ml-1" />
                            </Button>
                        </Link>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 max-h-[280px] overflow-auto">
                        {finalizedReports.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4">No finalized reports yet</p>
                        ) : (
                            finalizedReports.slice(0, 6).map((report) => (
                                <Link
                                    key={report.id}
                                    to={createPageUrl(`ProjectDetail?id=${report.project_id}`)}
                                    className="flex items-center justify-between p-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium text-slate-900">{report.report_name || 'Report'}</p>
                                        <p className="text-xs text-slate-500">
                                            {report.date_from} → {report.date_to}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-green-100 text-green-700 text-xs">Finalized</Badge>
                                        <ArrowRight className="w-4 h-4 text-indigo-600" />
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
