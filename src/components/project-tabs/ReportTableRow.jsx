import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Edit } from 'lucide-react';
import InlineEditableCell from './InlineEditableCell';
import GiftMinutesCellWidget from './GiftMinutesCell';
import DeductibleCell from './DeductibleCell';
import StatusBadge from './StatusBadge';

export default function ReportTableRow({
    result,
    isAdmin,
    isSupervisor,
    isDepartmentHead,
    project,
    reportRun,
    showGiftMinutesColumn,
    onToggleVerification,
    onEditGrace,
    onShowBreakdown,
    onUpdateManualOverride,
    onSaveGiftMinutes,
    // Change 2 - Receive role-based permission for gift minutes editing
    canEditGiftMinutes,
    isAstra = false,
    isSelected = false,
    onToggleSelect = null,
    skipEarlyCheckout = false,
    onSkipEarlyCheckout = null
}) {
    return (
        <tr className={`group border-b-4 border-slate-50 transition-all duration-150 ${result.isVerified ? 'bg-emerald-50/35 hover:bg-emerald-100/70' : 'bg-white hover:bg-indigo-50/70'} ${((result.full_absence_count || 0) > 0 || (result.effective_deductible_minutes || result.deductible_minutes || 0) > 0) ? 'border-l-8 border-l-amber-500' : 'border-l-8 border-l-emerald-400'} ${isSelected ? 'bg-amber-100/80 ring-2 ring-amber-300' : ''}`}>
            {isAstra && (
                <td className="w-8 px-2" onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
                        checked={isSelected}
                        onChange={onToggleSelect}
                    />
                </td>
            )}
            <td className="p-3 align-middle sticky left-0 bg-inherit z-10 shadow-[2px_0_0_0_rgba(15,23,42,0.08)]">
                <Checkbox
                    checked={result.isVerified}
                    onCheckedChange={() => onToggleVerification(result.attendance_id)}
                />
            </td>
            <td className="p-3 align-middle font-black text-slate-950 sticky left-[48px] bg-inherit z-10 tabular-nums">{result.attendance_id}</td>
            <td className="p-3 align-middle sticky left-[120px] bg-inherit z-10 shadow-[3px_0_0_0_rgba(99,102,241,0.18)]">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-950 whitespace-nowrap">{result.name}</span>
                    {result.has_no_punches && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded whitespace-nowrap" title="No punch data for this period">
                            No punches
                        </span>
                    )}
                </div>
            </td>
            <td className="p-3 align-middle font-bold tabular-nums text-slate-800">{Math.max(0, result.working_days || 0)}</td>
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
            {/* LOP-adjacent off day column */}
            {project.company === 'Al Maraghi Motors' && (
                <td className="p-2 align-middle">
                    {result.lop_adjacent_weekly_off_count > 0 ? (
                        <span
                            className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded cursor-help"
                            title={`${result.lop_adjacent_weekly_off_count} off day(s) (weekly off or holiday) adjacent to LOP also counted as LOP.\nDates: ${result.lop_adjacent_weekly_off_dates || 'N/A'}`}
                        >
                            +{result.lop_adjacent_weekly_off_count}
                        </span>
                    ) : (
                        <span className="text-slate-300">-</span>
                    )}
                </td>
            )}
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
                    <span className={`${result.approved_minutes > 0 ? 'text-teal-600 font-medium' : 'text-slate-400'}`}>
                        {Math.max(0, result.approved_minutes || 0)}
                    </span>
                </td>
            )}
            <td className="p-2 align-middle">
                <span className={`${result.other_minutes > 0 ? 'text-purple-600 font-medium' : 'text-slate-400'}`}>
                    {Math.max(0, result.other_minutes || 0)}
                </span>
            </td>
            {!isDepartmentHead && (
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
            )}
            {showGiftMinutesColumn && (
                <td className="px-6 py-4 whitespace-nowrap">
                    <GiftMinutesCellWidget
                        result={result}
                        onSave={onSaveGiftMinutes}
                        // Change 2 - Only allow editing if user has the correct role (Admin/CEO/HRM) AND report is not final/closed
                        isEditable={canEditGiftMinutes && !reportRun.is_final && project.status !== 'closed'}
                    />
                </td>
            )}
            <td className="p-2 align-middle">
                <DeductibleCell
                    result={result}
                    isEditable={isAdmin && !reportRun.is_final}
                    isFinalized={reportRun.is_final}
                    onSave={(storeValue) => onUpdateManualOverride({ id: result.id, field: 'manual_deductible_minutes', value: storeValue })}
                />
            </td>
            <td className="p-3 align-middle text-xs text-slate-700 max-w-xs truncate" title={result.notes || ''}>
                {result.notes ? <span className="inline-flex rounded-xl bg-slate-100 border border-slate-200 px-2.5 py-1 font-semibold">{result.notes}</span> : <span className="text-slate-300 font-bold">-</span>}
            </td>
            <td className="p-3 align-middle text-right">
                <div className="flex items-center justify-end gap-1">
                    {onSkipEarlyCheckout && (
                        <button
                            type="button"
                            title={skipEarlyCheckout ? 'Restore early checkout deduction' : 'Skip early checkout deduction'}
                            onClick={() => onSkipEarlyCheckout(!skipEarlyCheckout)}
                            className={`p-1 rounded transition-colors ${
                                skipEarlyCheckout 
                                    ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' 
                                    : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" 
                                viewBox="0 0 24 24" fill="none" stroke="currentColor" 
                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                                {skipEarlyCheckout && <line x1="4" y1="4" x2="20" y2="20"/>}
                            </svg>
                        </button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onShowBreakdown(result)}
                        title="View daily breakdown"
                    >
                        <Eye className="w-4 h-4" />
                    </Button>
                </div>
            </td>
        </tr>
    );
}