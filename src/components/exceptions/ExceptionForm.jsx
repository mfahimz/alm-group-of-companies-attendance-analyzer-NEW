import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sparkles } from 'lucide-react';
import TimePicker from '../ui/QuickTimePicker';
import { getFilteredExceptionTypes, formatExceptionTypeLabel, EXCEPTION_GROUPS } from '@/lib/exception-types';

export default function ExceptionForm({
    formData,
    setFormData,
    employees,
    project,
    isAdmin,
    isSupervisor,
    canEditAllowedMinutes,
    mode = 'create',
    selectedEmployeeIsSingleShift = null
}) {
    const [employeeSearch, setEmployeeSearch] = useState('');

    const clearShiftOverride = () => {
        setFormData(prev => ({
            ...prev,
            new_am_start: '',
            new_am_end: '',
            new_pm_start: '',
            new_pm_end: ''
        }));
    };

    const needsShiftOverride = formData.type === 'SHIFT_OVERRIDE';
    const needsAllowedMinutes = formData.type === 'ALLOWED_MINUTES';
    const needsSkipPunch = formData.type === 'SKIP_PUNCH';
    const needsHalfDayHoliday = formData.type === 'HALF_DAY_HOLIDAY';
    const needsDaySwap = formData.type === 'DAY_SWAP';
    const needsSalaryLeaveDays = formData.type === 'ANNUAL_LEAVE';
    const needsEarlyCheckoutMinutes = formData.type === 'MANUAL_EARLY_CHECKOUT';
    const needsManualOtherMinutes = formData.type === 'MANUAL_OTHER_MINUTES';

    const selectedEmployeeAttId = formData.attendance_id && formData.attendance_id !== 'ALL' ? formData.attendance_id : null;
    
    // We don't have employeeShifts here, we should probably pass it or fetch it.
    // In ExceptionsTab it's fetched via useQuery.
    // For now, I'll pass a prop `selectedEmployeeIsSingleShift` or similar if needed, 
    // or just allow all options for now as a fallback.
    // Actually, in EditExceptionDialog it doesn't seem to check for single shift for SKIP_PUNCH.
    // Let's check EditExceptionDialog again.
    
    const calculateDaysBetween = () => {
        if (formData.date_from && formData.date_to) {
            const fromTime = new Date(formData.date_from).getTime();
            const toTime = new Date(formData.date_to).getTime();
            const diffTime = Math.abs(toTime - fromTime);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            return diffDays;
        }
        return 0;
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label>Employee {formData.type !== 'PUBLIC_HOLIDAY' && formData.type !== 'HALF_DAY_HOLIDAY' && formData.type !== 'ALLOWED_MINUTES' && formData.type !== 'SKIP_PUNCH' && formData.type !== 'SKIP_DOUBLE_DEDUCTION' && '*'}</Label>
                    {mode === 'edit' ? (
                        <Input 
                            value={formData.attendance_id === 'ALL' ? 'All Employees' : formData.attendance_id}
                            disabled
                            className="bg-slate-50"
                        />
                    ) : (
                        <>
                            {formData.type === 'PUBLIC_HOLIDAY' || formData.type === 'HALF_DAY_HOLIDAY' ? (
                                <Input value="All Employees" disabled className="bg-slate-50" />
                            ) : formData.type === 'ALLOWED_MINUTES' || formData.type === 'SKIP_PUNCH' || formData.type === 'SKIP_DOUBLE_DEDUCTION' ? (
                                <Select value={formData.attendance_id || undefined} onValueChange={(value) => setFormData({ ...formData, attendance_id: value, punch_to_skip: 'AM_PUNCH_IN' })}>
                                    <SelectTrigger className="border-slate-200"><SelectValue placeholder="Select employee or all..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">All Employees</SelectItem>
                                        <div className="p-2 border-t">
                                            <Input placeholder="Type to search..." value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} className="mb-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                                        </div>
                                        <div className="max-h-[200px] overflow-y-auto">
                                            {employees.filter(emp => !employeeSearch || emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) || String(emp.attendance_id).toLowerCase().includes(employeeSearch.toLowerCase())).filter(emp => emp.attendance_id && String(emp.attendance_id).trim() !== '').map(emp => (
                                                <SelectItem key={emp.id} value={String(emp.attendance_id)}>{emp.attendance_id} - {emp.name}</SelectItem>
                                            ))}
                                        </div>
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Select value={formData.attendance_id || undefined} onValueChange={(value) => setFormData({ ...formData, attendance_id: value })}>
                                    <SelectTrigger className="border-slate-200"><SelectValue placeholder="Search and select employee..." /></SelectTrigger>
                                    <SelectContent>
                                        <div className="p-2">
                                            <Input placeholder="Type to search..." value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} className="mb-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} />
                                        </div>
                                        <div className="max-h-[200px] overflow-y-auto">
                                            {employees.filter(emp => !employeeSearch || emp.name.toLowerCase().includes(employeeSearch.toLowerCase()) || String(emp.attendance_id).toLowerCase().includes(employeeSearch.toLowerCase())).filter(emp => emp.attendance_id && String(emp.attendance_id).trim() !== '').map(emp => (
                                                <SelectItem key={emp.id} value={String(emp.attendance_id)}>{emp.attendance_id} - {emp.name}</SelectItem>
                                            ))}
                                        </div>
                                    </SelectContent>
                                </Select>
                            )}
                        </>
                    )}
                </div>
                <div>
                    <Label>Exception Type *</Label>
                    <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                        <SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {Object.entries(EXCEPTION_GROUPS).map(([groupId, groupLabel]) => {
                                const typesInGroup = getFilteredExceptionTypes('general', isAdmin || isSupervisor)
                                    .filter(t => t.group === groupId);
                                
                                if (typesInGroup.length === 0) return null;

                                return (
                                    <SelectGroup key={groupId}>
                                        <SelectLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2 py-1.5 bg-slate-50/50">
                                            {groupLabel}
                                        </SelectLabel>
                                        {typesInGroup.map(type => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label || formatExceptionTypeLabel(type.value)}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                );
                            })}
                        </SelectContent>
                    </Select>
                    {formData.type === 'ANNUAL_LEAVE' && (
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                            <div className="mt-0.5"><Sparkles className="w-4 h-4 text-blue-600" /></div>
                            <p className="text-xs text-blue-700">
                                Annual Leave exceptions must be imported from the Leave Management page. Please use the 'Import Annual Leaves' button above.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {formData.type === 'CUSTOM' && (
                <div className="border-t pt-4">
                    <Label>Custom Exception Type Name</Label>
                    <Input
                        placeholder="Enter custom type name (e.g. Training, Site Visit)"
                        value={formData.custom_type_name || ''}
                        onChange={(e) => setFormData({ ...formData, custom_type_name: e.target.value })}
                    />
                    <p className="text-xs text-amber-600 mt-1">
                        ⚠️ Custom types are for record-keeping only and will never be used in analysis calculations
                    </p>
                </div>
            )}

            {formData.type !== 'SINGLE_SHIFT' && (
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>From Date <span className="text-red-500">*</span></Label>
                        <Input type="date" value={formData.date_from} onChange={(e) => {
                            const newDate = e.target.value;
                            if (newDate >= project.date_from && newDate <= project.date_to) {
                                setFormData(prev => {
                                    const next = { ...prev, date_from: newDate };
                                    if (prev.type === 'ANNUAL_LEAVE' && prev.date_to) {
                                        const from = new Date(newDate);
                                        const to = new Date(prev.date_to);
                                        const diffDays = Math.ceil((Math.abs(to.getTime() - from.getTime())) / (1000 * 60 * 60 * 24)) + 1;
                                        next.salary_leave_days = Number.isFinite(diffDays) ? diffDays.toFixed(2) : prev.salary_leave_days;
                                    }
                                    return next;
                                });
                            }
                        }} min={project.date_from} max={project.date_to} className="border-slate-200" />
                    </div>
                    <div>
                        <Label>To Date <span className="text-red-500">*</span></Label>
                        <Input type="date" value={formData.date_to} onChange={(e) => {
                            const newDate = e.target.value;
                            if (newDate >= formData.date_from && newDate <= project.date_to && newDate >= project.date_from) {
                                setFormData(prev => {
                                    const next = { ...prev, date_to: newDate };
                                    if (prev.type === 'ANNUAL_LEAVE' && prev.date_from) {
                                        const from = new Date(prev.date_from);
                                        const to = new Date(newDate);
                                        const diffDays = Math.ceil((Math.abs(to.getTime() - from.getTime())) / (1000 * 60 * 60 * 24)) + 1;
                                        next.salary_leave_days = Number.isFinite(diffDays) ? diffDays.toFixed(2) : prev.salary_leave_days;
                                    }
                                    return next;
                                });
                            }
                        }} min={formData.date_from} max={project.date_to} className="border-slate-200" />
                    </div>
                </div>
            )}

            {needsSalaryLeaveDays && (() => {
                const originalCalendarDays = calculateDaysBetween();
                const currentVal = parseFloat(formData.salary_leave_days || 0);
                const lopDays = originalCalendarDays - currentVal;
                
                return (
                    <div className="space-y-2 border-t pt-4">
                        <Label>Salary Leave Days (for salary calculation only) <span className="text-red-500">*</span></Label>
                        <Input 
                            type="number" 
                            step="0.01" 
                            min="0" 
                            max={originalCalendarDays > 0 ? originalCalendarDays : undefined}
                            value={formData.salary_leave_days} 
                            onChange={(e) => {
                                const valStr = e.target.value;
                                if (valStr && originalCalendarDays > 0 && parseFloat(valStr) > originalCalendarDays) {
                                    setFormData({ ...formData, salary_leave_days: originalCalendarDays.toString() });
                                } else {
                                    setFormData({ ...formData, salary_leave_days: valStr });
                                }
                            }} 
                            placeholder="e.g. 14.17" 
                            className="border-slate-200" 
                        />
                        {formData.date_from && formData.date_to && (
                            <p className="text-xs text-emerald-700">💡 Calculated: {originalCalendarDays} days between selected dates. Edit if partial days are needed.</p>
                        )}
                        {lopDays > 0 && formData.type === 'ANNUAL_LEAVE' && (
                            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-300 p-2 rounded mt-2">
                                ⚠️ {lopDays.toFixed(1)} day(s) will become LOP (Loss of Pay)
                            </div>
                        )}
                        {project?.company === 'Al Maraghi Auto Repairs' && (
                            <p className="text-xs text-amber-600 mt-1">
                                ⚠️ This value is used ONLY for salary calculation, not for attendance reports.
                            </p>
                        )}
                    </div>
                );
            })()}

            {needsShiftOverride && (
                <div className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between">
                        <Label className="block">Override Shift Times</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={clearShiftOverride} className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50">Clear Shift Override</Button>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                        <div><Label className="text-xs">AM Start</Label><TimePicker placeholder="08:00 AM" value={formData.new_am_start} onChange={(value) => setFormData({ ...formData, new_am_start: value })} /></div>
                        <div><Label className="text-xs">AM End</Label><TimePicker placeholder="12:00 PM" value={formData.new_am_end} onChange={(value) => setFormData({ ...formData, new_am_end: value })} /></div>
                        <div><Label className="text-xs">PM Start</Label><TimePicker placeholder="01:00 PM" value={formData.new_pm_start} onChange={(value) => setFormData({ ...formData, new_pm_start: value })} /></div>
                        <div><Label className="text-xs">PM End</Label><TimePicker placeholder="05:00 PM" value={formData.new_pm_end} onChange={(value) => setFormData({ ...formData, new_pm_end: value })} /></div>
                    </div>
                    <div className="flex items-center gap-2 p-3 border rounded-lg bg-slate-50">
                        <Checkbox id="include-friday-form" checked={formData.include_friday} onCheckedChange={(checked) => setFormData({ ...formData, include_friday: checked })} />
                        <Label htmlFor="include-friday-form" className="cursor-pointer">Include Friday in shift override</Label>
                    </div>
                    <p className="text-xs text-slate-500">{formData.include_friday ? 'This override will apply to all days including Friday' : 'This override will apply to all working days except Friday'}</p>
                </div>
            )}

            {needsEarlyCheckoutMinutes && (
                <div className="max-w-xs border-t pt-4">
                    <Label>Early Checkout Minutes *</Label>
                    <Input
                        type="number"
                        placeholder="e.g. 30"
                        value={formData.early_checkout_minutes}
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                                setFormData({ ...formData, early_checkout_minutes: '' });
                            } else {
                                const value = Math.abs(parseInt(raw));
                                if (!Number.isNaN(value)) {
                                    setFormData({ ...formData, early_checkout_minutes: value });
                                }
                            }
                        }}
                        min="1"
                    />
                    <p className="text-xs text-slate-500 mt-1">Minutes to add to early checkout total</p>
                </div>
            )}

            {needsManualOtherMinutes && (
                <div className="max-w-xs border-t pt-4">
                    <Label>Other Minutes *</Label>
                    <Input
                        type="number"
                        placeholder="e.g. 30"
                        value={formData.allowed_minutes}
                        onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                                setFormData({ ...formData, allowed_minutes: '' });
                            } else {
                                const value = Math.abs(parseInt(raw));
                                if (!Number.isNaN(value)) {
                                    setFormData({ ...formData, allowed_minutes: value });
                                }
                            }
                        }}
                        min="1"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                        Minutes added directly to other minutes in attendance analysis for this day
                    </p>
                </div>
            )}

            {needsAllowedMinutes && (
                <div className="space-y-4 border-t pt-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Allowed Minutes *</Label>
                            <Input type="number" placeholder="e.g. 60" value={formData.allowed_minutes} onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') { setFormData({ ...formData, allowed_minutes: '' }); }
                                else { const value = Math.abs(parseInt(raw)); if (!Number.isNaN(value)) { setFormData({ ...formData, allowed_minutes: value }); } }
                            }} min="1" className="border-slate-200" disabled={formData.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes} />
                        </div>
                        <div>
                            <Label>Apply To *</Label>
                            <Select value={formData.allowed_minutes_type} onValueChange={(value) => setFormData({ ...formData, allowed_minutes_type: value })} disabled={formData.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes}>
                                <SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="late">Late Arrivals Only</SelectItem>
                                    <SelectItem value="early">Early Checkouts Only</SelectItem>
                                    <SelectItem value="both">Both Late &amp; Early</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="border border-indigo-100 bg-indigo-50/20 p-3 rounded-lg space-y-2">
                        <Label className="text-xs text-indigo-700 font-semibold block">Unified Grace Target (Optional)</Label>
                        <p className="text-[10px] text-indigo-600 mb-2">Target a specific punch for these minutes. If Employee is 'All Employees', this adds grace to EVERY employee's matching punch.</p>
                        <Select value={formData.target_punch || 'none'} onValueChange={(value) => setFormData({ ...formData, target_punch: value === 'none' ? null : value })} disabled={formData.type === 'ALLOWED_MINUTES' && !canEditAllowedMinutes}>
                            <SelectTrigger className="border-slate-200 h-8 text-xs bg-white"><SelectValue placeholder="No specific punch target" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">General (Late/Early Deductible)</SelectItem>
                                <SelectItem value="AM_START">AM Start (Shift In)</SelectItem>
                                <SelectItem value="AM_END">AM End (Morning Out)</SelectItem>
                                <SelectItem value="PM_START">PM Start (Afternoon In)</SelectItem>
                                <SelectItem value="PM_END">PM End (Shift Out)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-slate-500">Minutes to excuse due to natural calamity or personal reasons</p>
                </div>
            )}

            {needsSkipPunch && (
                <div className="space-y-4 border-t pt-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-sm text-amber-800 mb-3">This exception will skip a specific punch from the analysis for the selected dates.</p>
                        <div>
                            <Label>Punch to Skip *</Label>
                            <Select value={formData.punch_to_skip} onValueChange={(value) => setFormData({ ...formData, punch_to_skip: value })}>
                                <SelectTrigger className="border-slate-200"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="AM_PUNCH_IN">AM Punch In (Shift Start)</SelectItem>
                                    {selectedEmployeeIsSingleShift !== true && <SelectItem value="AM_PUNCH_OUT">AM Punch Out (Morning End)</SelectItem>}
                                    {selectedEmployeeIsSingleShift !== true && <SelectItem value="PM_PUNCH_IN">PM Punch In (Afternoon Start)</SelectItem>}
                                    <SelectItem value="PM_PUNCH_OUT">PM Punch Out (Shift End)</SelectItem>
                                    <SelectItem value="FULL_SKIP">Full Skip (Ignore All Punches)</SelectItem>
                                </SelectContent>
                            </Select>
                            {formData.attendance_id && formData.attendance_id !== 'ALL' && selectedEmployeeIsSingleShift !== null && (
                                <p className="text-xs text-slate-500 mt-1">
                                    {selectedEmployeeIsSingleShift === true && '⚡ Single shift detected — AM/PM mid-day options hidden'}
                                    {selectedEmployeeIsSingleShift === false && '⚡ Split shift detected — all punch options available'}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {needsHalfDayHoliday && (
                <div className="space-y-4 border-t pt-4">
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                        <p className="text-sm text-indigo-800 mb-3 font-medium">Half-Day Holiday (Natural Calamity / Global)</p>
                        <p className="text-xs text-indigo-600 mb-4">This will mark all employees as present and skip all shift points for the selected target (AM or PM).</p>
                        <div>
                            <Label>Half-Day Target *</Label>
                            <Select value={formData.half_day_target} onValueChange={(value) => setFormData({ ...formData, half_day_target: value })}>
                                <SelectTrigger className="border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="AM">AM Shift (Morning)</SelectItem>
                                    <SelectItem value="PM">PM Shift (Afternoon)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            )}

            {needsDaySwap && (() => {
                const selectedEmployee = employees.find(e => String(e.attendance_id) === String(formData.attendance_id));
                const currentWeeklyOff = selectedEmployee?.weekly_off || formData.working_day_override || 'Sunday';
                return (
                    <div className="space-y-4 border-t pt-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-800 mb-4">This exception swaps a weekly off day with a working day for the selected date range.</p>
                            {(formData.attendance_id || formData.working_day_override) && (
                                <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-lg">
                                    <p className="text-sm font-medium text-blue-900">Current Weekly Off: <span className="text-blue-700 font-bold">{currentWeeklyOff}</span></p>
                                    <p className="text-xs text-blue-700 mt-1">Select a new weekly off day below, and {currentWeeklyOff} will automatically become a working day</p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>New Weekly Off Day *</Label>
                                    <Select value={formData.new_weekly_off} onValueChange={(value) => setFormData({ ...formData, new_weekly_off: value, working_day_override: currentWeeklyOff })}>
                                        <SelectTrigger className="border-slate-200"><SelectValue placeholder="Select day..." /></SelectTrigger>
                                        <SelectContent>
                                            {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500 mt-1">This day will become the holiday</p>
                                </div>
                                <div>
                                    <Label>New Working Day (Auto-filled) *</Label>
                                    <Input value={formData.working_day_override || currentWeeklyOff} disabled className="bg-slate-100" />
                                    <p className="text-xs text-green-600 mt-1">✓ Automatically set to current weekly off</p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <div className="border-t pt-4">
                <Label>Details / Reason</Label>
                <Input value={formData.details || ''} onChange={(e) => setFormData({ ...formData, details: e.target.value })} placeholder="Optional notes" className="border-slate-200" />
            </div>
        </div>
    );
}
