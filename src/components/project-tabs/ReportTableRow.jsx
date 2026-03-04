import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Edit } from 'lucide-react';
import InlineEditableCell from './InlineEditableCell';
import RamadanGiftCellWidget from './RamadanGiftCell';
import DeductibleCell from './DeductibleCell';

export default function ReportTableRow({
    result,
    isAdmin,
    isSupervisor,
    isDepartmentHead,
    project,
    reportRun,
    showRamadanGiftColumn,
    onToggleVerification,
    onEditGrace,
    onShowBreakdown,
    onUpdateManualOverride,
    onSaveRamadanGift
}) {
    return (
        <tr className="border-b transition-colors hover:bg-muted/50">
            <td className="p-2 align-middle sticky left-0 bg-white z-10">
                <Checkbox
                    checked={result.isVerified}
                    onCheckedChange={() => onToggleVerification(result.attendance_id)}
                />
            </td>
            <td className="p-2 align-middle font-medium sticky left-[48px] bg-white z-10">{result.attendance_id}</td>
            <td className="p-2 align-middle sticky left-[120px] bg-white z-10">
                <div className="flex items-center gap-2">
                    <span>{result.name}</span>
                    {result.has_no_punches && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded whitespace-nowrap" title="No punch data for this period">
                            No punches
                        </span>
                    )}
                </div>
            </td>
            <td className="p-2 align-middle">{Math.max(0, result.working_days || 0)}</td>
            <td className="p-2 align-middle">
                <InlineEditableCell
                    value={Math.max(0, result.manual_present_days ?? result.present_days)}
                    onSave={(value) => onUpdateManualOverride({ id: result.id, field: 'manual_present_days', value: Math.max(0, value) })}
                    isEditable={isAdmin}
                    className={result.manual_present_days !== null && result.manual_present_days !== undefined ? 'text-blue-600 font-bold' : ''}
                />
            </td>
            <td className="p-2 align-middle">
                <InlineEditableCell
                    value={Math.max(0, result.manual_annual_leave_count ?? result.annual_leave_count ?? 0)}
                    onSave={(value) => onUpdateManualOverride({ id: result.id, field: 'manual_annual_leave_count', value: Math.max(0, value) })}
                    isEditable={isAdmin}
                    className={result.manual_annual_leave_count !== null && result.manual_annual_leave_count !== undefined
                        ? 'text-blue-600 font-bold'
                        : (result.annual_leave_count > 0 ? 'text-blue-600 font-medium' : '')}
                />
            </td>
            <td className="p-2 align-middle">
                <InlineEditableCell
                    value={Math.max(0, result.manual_sick_leave_count ?? result.sick_leave_count ?? 0)}
                    onSave={(value) => onUpdateManualOverride({ id: result.id, field: 'manual_sick_leave_count', value: Math.max(0, value) })}
                    isEditable={isAdmin}
                    className={result.manual_sick_leave_count !== null && result.manual_sick_leave_count !== undefined
                        ? 'text-purple-600 font-bold'
                        : (result.sick_leave_count > 0 ? 'text-purple-600 font-medium' : '')}
                />
            </td>
            <td className="p-2 align-middle">
                <InlineEditableCell
                    value={Math.max(0, result.manual_full_absence_count ?? result.full_absence_count)}
                    onSave={(value) => onUpdateManualOverride({ id: result.id, field: 'manual_full_absence_count', value: Math.max(0, value) })}
                    isEditable={isAdmin}
                    className={result.manual_full_absence_count !== null && result.manual_full_absence_count !== undefined
                        ? 'text-red-600 font-bold'
                        : (result.full_absence_count > 0 ? 'text-red-600 font-medium' : '')}
                />
            </td>
            {/* LOP-adjacent weekly off column */}
            <td className="p-2 align-middle">
                {result.lop_adjacent_weekly_off_count > 0 ? (
                    <span
                        className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded cursor-help"
                        title={`${result.lop_adjacent_weekly_off_count} weekly off day(s) adjacent to LOP also counted as LOP.\nDates: ${result.lop_adjacent_weekly_off_dates || 'N/A'}`}
                    >
                        +{result.lop_adjacent_weekly_off_count}
                    </span>
                ) : (
                    <span className="text-slate-300">-</span>
                )}
            </td>
            <td className="p-2 align-middle">
                <span className={`${result.half_absence_count > 0 ? 'text-amber-600 font-medium' : ''}`}>
                    {Math.max(0, result.half_absence_count || 0)}
                </span>
            </td>
            <td className="p-2 align-middle">
                <span className={`${result.late_minutes > 0 ? 'text-orange-600 font-medium' : ''}`}>
                    {Math.max(0, result.late_minutes || 0)}
                </span>
            </td>
            <td className="p-2 align-middle">
                <span className={`${result.early_checkout_minutes > 0 ? 'text-blue-600 font-medium' : ''}`}>
                    {Math.max(0, result.early_checkout_minutes || 0)}
                </span>
            </td>
            {project.company !== 'Naser Mohsin Auto Parts' && project.company !== 'Al Maraghi Automotive' && (
                <td className="p-2 align-middle">
                    <span className={`${result.approved_minutes > 0 ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>
                        {Math.max(0, result.approved_minutes || 0)}
                    </span>
                </td>
            )}
            <td className="p-2 align-middle">
                <span className={`${result.other_minutes > 0 ? 'text-purple-600 font-medium' : 'text-slate-400'}`}>
                    {Math.max(0, result.other_minutes || 0)}
                </span>
            </td>
            <td className="p-2 align-middle">
                <div className="flex items-center gap-2 group">
                    <span>{Math.max(0, result.grace_minutes ?? 15)}</span>
                    {(isAdmin || isSupervisor) && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => onEditGrace(result)}
                        >
                            <Edit className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                        </Button>
                    )}
                </div>
            </td>
            {showRamadanGiftColumn && (() => {
                const canEdit = !reportRun.is_final && project.status !== 'closed';
                if (!canEdit) return <td className="p-2 align-middle"><span className="font-medium text-amber-700">{Math.max(0, result.ramadan_gift_minutes || 0)}</span></td>;
                return <td className="p-2 align-middle"><RamadanGiftCellWidget result={result} onSave={onSaveRamadanGift} isEditable={true} /></td>;
            })()}
            <td className="p-2 align-middle">
                <DeductibleCell
                    result={result}
                    isEditable={isAdmin && !reportRun.is_final}
                    isFinalized={reportRun.is_final}
                    onSave={(storeValue) => onUpdateManualOverride({ id: result.id, field: 'manual_deductible_minutes', value: storeValue })}
                />
            </td>
            <td className="p-2 align-middle text-xs text-slate-600 max-w-xs truncate">
                {result.notes || '-'}
            </td>
            <td className="p-2 align-middle text-right">
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onShowBreakdown(result)}
                    title="View daily breakdown"
                >
                    <Eye className="w-4 h-4" />
                </Button>
            </td>
        </tr>
    );
}