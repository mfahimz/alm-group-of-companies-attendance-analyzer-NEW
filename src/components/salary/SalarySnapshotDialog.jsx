import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, DollarSign, Clock, TrendingDown, Info } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * SalarySnapshotDialog - Read-only view of a single SalarySnapshot
 * 
 * Displays salary breakdown for quick viewing + optional recalculation trigger
 * No editing, no attendance modification
 */
export default function SalarySnapshotDialog({ 
    open, 
    onClose, 
    snapshot, 
    project,
    reportRunId,
    canRecalculate = false,
    onRecalculated
}) {
    const [isRecalculating, setIsRecalculating] = useState(false);

    if (!snapshot) return null;

    const isAlMaraghi = project?.company === 'Al Maraghi Motors';

    // Check if bonus has decimal values
    const hasDecimalBonus = () => {
        const bonus = snapshot.bonus || 0;
        return bonus % 1 !== 0;
    };

    // Format month name from date
    const formatSalaryMonth = () => {
        if (snapshot.salary_month_start) {
            const date = new Date(snapshot.salary_month_start);
            return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
        return '-';
    };

    // Handle recalculation
    const handleRecalculate = async () => {
        setIsRecalculating(true);
        try {
            const response = await base44.functions.invoke('recalculateSalarySnapshot', {
                report_run_id: reportRunId,
                project_id: project?.id,
                attendance_id: snapshot.attendance_id,
                mode: 'APPLY'
            });

            if (response.data?.success) {
                toast.success(`Salary recalculated for ${snapshot.name}`);
                if (onRecalculated) {
                    onRecalculated(response.data);
                }
            } else {
                toast.error(response.data?.error || 'Recalculation failed');
            }
        } catch (error) {
            toast.error('Error: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsRecalculating(false);
        }
    };

    // Row component for consistent styling
    const DataRow = ({ label, value, highlight = false, negative = false, shouldRound = false }) => {
        let displayValue = value;
        if (shouldRound && !hasDecimalBonus()) {
            displayValue = Math.round(Number(value) || 0);
        }
        return (
            <div className={`flex justify-between py-1.5 ${highlight ? 'font-semibold' : ''}`}>
                <span className="text-slate-600">{label}</span>
                <span className={`font-medium ${negative && Number(value) > 0 ? 'text-red-600' : ''} ${highlight ? 'text-slate-900' : 'text-slate-800'}`}>
                    {displayValue}
                </span>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <DollarSign className="w-5 h-5 text-indigo-600" />
                        Salary Details
                    </DialogTitle>
                </DialogHeader>

                {/* Header Info */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-1">
                    <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Employee Name</span>
                        <span className="font-semibold text-slate-900">{snapshot.name}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Employee ID</span>
                        <span className="font-medium text-slate-700">{snapshot.attendance_id}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Project</span>
                        <span className="font-medium text-slate-700">{project?.name || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-sm text-slate-500">Salary Month</span>
                        <span className="font-medium text-slate-700">{formatSalaryMonth()}</span>
                    </div>
                </div>

                {/* Section 1: Salary Summary */}
                <div className="border rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-green-600" />
                        Salary Summary
                    </h3>
                    <div className="divide-y divide-slate-100">
                        <DataRow label="Total Salary" value={snapshot.total_salary} />
                        <DataRow label="Net Salary (Total)" value={snapshot.total} highlight shouldRound />
                        <DataRow label="WPS Pay" value={snapshot.wpsPay} highlight shouldRound />
                        <DataRow label="Balance" value={snapshot.balance} shouldRound />
                        <div className="pt-2 mt-2 border-t border-slate-200">
                            <DataRow label="Working Days" value={snapshot.working_days} />
                            <DataRow label="Present Days" value={snapshot.present_days} />
                            <DataRow label="LOP Days" value={snapshot.full_absence_count} />
                            <DataRow label="Annual Leave Days" value={snapshot.annual_leave_count} />
                        </div>
                    </div>
                </div>

                {/* Section 2: Deductions */}
                <div className="border rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-red-600" />
                        Deductions
                    </h3>
                    <div className="divide-y divide-slate-100">
                        <DataRow label="Leave Deduction (Net)" value={snapshot.netDeduction} negative />
                        <DataRow label="Current Month Deductible Hours Pay" value={snapshot.deductibleHoursPay} negative />
                        <DataRow label="Previous Month LOP Pay" value={snapshot.extra_prev_month_lop_pay} negative />
                        <DataRow label="Previous Month Deductible Hours Pay" value={snapshot.extra_prev_month_deductible_hours_pay} negative />
                        <DataRow label="Other Deduction" value={snapshot.otherDeduction} negative />
                        <DataRow label="Advance Salary Deduction" value={snapshot.advanceSalaryDeduction} negative />
                    </div>
                </div>

                {/* Section 3: Overtime & Adjustments */}
                <div className="border rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-600" />
                        Overtime & Adjustments
                    </h3>
                    <div className="divide-y divide-slate-100">
                        <DataRow label="Normal OT Hours" value={snapshot.normalOtHours} />
                        <DataRow label="Special OT Hours" value={snapshot.specialOtHours} />
                        <DataRow label="OT Amount" value={snapshot.totalOtSalary || ((snapshot.normalOtSalary || 0) + (snapshot.specialOtSalary || 0))} />
                        <DataRow label="Bonus" value={snapshot.bonus} />
                        <DataRow label="Incentive" value={snapshot.incentive} />
                        {isAlMaraghi && <DataRow label="Open Leave Salary" value={(Number(snapshot.open_leave_salary || 0)).toFixed(2) + ' AED'} />}
                        {isAlMaraghi && <DataRow label="Variable Salary" value={(Number(snapshot.variable_salary || 0)).toFixed(2) + ' AED'} />}
                    </div>
                </div>

                {/* Section 4: Al Maraghi Note */}
                {isAlMaraghi && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
                        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-blue-700">
                            <strong>Note:</strong> As per Al Maraghi Motors payroll rules, the last 2 days of the month may be treated as assumed present for salary calculation.
                        </p>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    {canRecalculate && (
                        <Button
                            variant="outline"
                            onClick={handleRecalculate}
                            disabled={isRecalculating}
                            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
                            {isRecalculating ? 'Recalculating...' : 'Recalculate Salary'}
                        </Button>
                    )}
                    <Button onClick={() => onClose(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}