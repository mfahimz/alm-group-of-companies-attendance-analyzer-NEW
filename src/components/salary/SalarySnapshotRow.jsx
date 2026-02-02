import React, { useState } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Edit2, RefreshCw } from 'lucide-react';
import DayOverrideDialog from './DayOverrideDialog';

export default function SalarySnapshotRow({ 
    snapshot, 
    projectId, 
    reportRunId,
    onEditMoneyFields,
    onSalaryUpdated
}) {
    const [showDayOverride, setShowDayOverride] = useState(false);

    return (
        <>
            <TableRow className="hover:bg-slate-50">
                <TableCell className="font-medium">{snapshot.attendance_id}</TableCell>
                <TableCell>{snapshot.name}</TableCell>
                <TableCell className="text-right text-slate-600">{snapshot.working_days}</TableCell>
                <TableCell className="text-right text-slate-600">{snapshot.present_days}</TableCell>
                <TableCell className="text-right text-slate-600">{snapshot.full_absence_count}</TableCell>
                <TableCell className="text-right text-slate-600">{snapshot.annual_leave_count}</TableCell>
                <TableCell className="text-right font-medium">{(snapshot.leavePay || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right font-medium">{(snapshot.netDeduction || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right font-medium">{(snapshot.total || 0).toFixed(2)}</TableCell>
                <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEditMoneyFields(snapshot)}
                            title="Edit bonus, OT, deductions"
                        >
                            <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowDayOverride(true)}
                            title="Override day values (admin only)"
                            className={snapshot.has_admin_day_override ? 'bg-blue-50 border-blue-300' : ''}
                        >
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    </div>
                </TableCell>
            </TableRow>

            <DayOverrideDialog
                isOpen={showDayOverride}
                onClose={() => setShowDayOverride(false)}
                employee={snapshot}
                projectId={projectId}
                reportRunId={reportRunId}
                onSaved={onSalaryUpdated}
            />
        </>
    );
}