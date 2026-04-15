import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Info } from 'lucide-react';
import AEDIcon from '@/components/ui/AEDIcon';

export default function OnHoldTab({ report, project }) {
    // 1. FETCH ALL ACTIVE HOLDS FOR THIS COMPANY
    const { data: holds = [], isLoading, error } = useQuery({
        queryKey: ['payrollHolds', project?.company],
        queryFn: async () => {
            if (!project?.company) return [];
            return await base44.entities.PayrollHold.filter({ 
                company: project.company,
                status: 'ON_HOLD'
            }, null, 5000);
        },
        enabled: !!project?.company
    });

    // 2. SCOPE TO CURRENT REPORT EMPLOYEES
    // We want to see all ON_HOLD records for employees present in this specific salary report
    const employeesInReport = React.useMemo(() => {
        if (!report?.snapshot_data) return new Set();
        try {
            const data = JSON.parse(report.snapshot_data);
            return new Set(data.map(emp => String(emp.hrms_id)));
        } catch (e) {
            return new Set();
        }
    }, [report?.snapshot_data]);

    const filteredHolds = React.useMemo(() => {
        return holds.filter(hold => employeesInReport.has(String(hold.hrms_id)));
    }, [holds, employeesInReport]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-slate-500 text-sm">Loading active holds...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <p className="text-sm">Error loading payroll holds: {error.message}</p>
            </div>
        );
    }

    if (filteredHolds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Info className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-slate-900 font-semibold mb-1">No active holds found</h3>
                <p className="text-slate-500 text-sm max-w-sm">
                    There are no leave salary deferrals or manual holds for the employees in this report.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">
                    Showing <span className="font-medium text-slate-900">{filteredHolds.length}</span> active hold(s) for employees in this report.
                </div>
            </div>

            <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="font-bold text-slate-700">Employee</TableHead>
                            <TableHead className="font-bold text-slate-700">ID / HRMS</TableHead>
                            <TableHead className="font-bold text-slate-700">Type</TableHead>
                            <TableHead className="font-bold text-slate-700">Origin Period</TableHead>
                            <TableHead className="font-bold text-slate-700 text-right">Amount</TableHead>
                            <TableHead className="font-bold text-slate-700">Source</TableHead>
                            <TableHead className="font-bold text-slate-700">Notes / Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredHolds.map((hold) => (
                            <TableRow key={hold.id} className="hover:bg-slate-50/50 transition-colors">
                                <TableCell className="font-medium text-slate-900">
                                    {hold.employee_name || 'N/A'}
                                </TableCell>
                                <TableCell className="text-slate-500">{hold.hrms_id}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={
                                        hold.hold_type === 'LEAVE_DEFERRAL' 
                                            ? "bg-amber-50 text-amber-700 border-amber-200" 
                                            : "bg-blue-50 text-blue-700 border-blue-200"
                                    }>
                                        {hold.hold_type === 'LEAVE_DEFERRAL' ? 'Leave Deferral' : 'Manual Hold'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-slate-500 text-xs">
                                    {hold.origin_period_start && hold.origin_period_end 
                                        ? `${hold.origin_period_start} → ${hold.origin_period_end}`
                                        : 'N/A'}
                                </TableCell>
                                <TableCell className="text-right font-bold text-slate-900">
                                    <div className="flex items-center justify-end gap-1">
                                        <AEDIcon className="w-3 h-3 text-slate-400" />
                                        {Number(hold.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="ghost" className="text-[10px] uppercase tracking-wider font-bold">
                                        {hold.source || 'MANUAL'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate text-slate-500 text-xs" title={hold.notes || hold.reason_code}>
                                    {hold.notes || hold.reason_code || '—'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex gap-3">
                <Info className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="text-xs text-amber-800 leading-relaxed">
                    <p className="font-bold mb-1">Payroll Hold Policy:</p>
                    <ul className="list-disc ml-4 space-y-1">
                        <li><strong>Auto Hold</strong>: Applied if an employee with &lt; 2 years service has annual leave spanning beyond the payroll month.</li>
                        <li><strong>Auto Release</strong>: Held leave salary is automatically included in the payout when the employee returns to work in a subsequent payroll month.</li>
                        <li><strong>Manual Release</strong>: Accountants can manually release holds (Coming Soon).</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
