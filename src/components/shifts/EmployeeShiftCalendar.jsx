import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import TimePicker from '../ui/TimePicker';
import { cn } from '@/lib/utils';

export default function EmployeeShiftCalendar({ open, onClose, employee, project, shifts, blockId, blockRange }) {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [editedShifts, setEditedShifts] = useState({});
    const queryClient = useQueryClient();

    const formatTime = (timeStr) => {
        if (!timeStr || timeStr === '—' || timeStr.trim() === '') return '—';
        if (/AM|PM/i.test(timeStr)) return timeStr;
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return '—';
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = hours >= 12 ? 'PM' : 'AM';
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        return `${hours}:${minutes} ${period}`;
    };

    // Get days in current month
    const getDaysInMonth = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days = [];
        
        // Add padding days from previous month
        const startPadding = firstDay.getDay();
        for (let i = startPadding - 1; i >= 0; i--) {
            const date = new Date(year, month, -i);
            days.push({ date, isCurrentMonth: false });
        }
        
        // Add days of current month
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const date = new Date(year, month, i);
            days.push({ date, isCurrentMonth: true });
        }
        
        // Add padding days from next month
        const endPadding = 6 - lastDay.getDay();
        for (let i = 1; i <= endPadding; i++) {
            const date = new Date(year, month + 1, i);
            days.push({ date, isCurrentMonth: false });
        }
        
        return days;
    };

    // Get shift for a specific date
    const getShiftForDate = (date) => {
        const dateStr = date.toISOString().split('T')[0];
        
        // Check if edited
        if (editedShifts[dateStr]) {
            return editedShifts[dateStr];
        }
        
        // Check if there's a specific date shift
        const specificShift = shifts.find(s => s.date === dateStr);
        if (specificShift) return specificShift;
        
        // Get general shift for this block
        const generalShift = shifts.find(s => !s.date && s.shift_block === blockId);
        if (generalShift) {
            // Check if date is Friday and there's a Friday shift
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 5) {
                const fridayShift = shifts.find(s => s.is_friday_shift && s.shift_block === blockId);
                return fridayShift || generalShift;
            }
            return generalShift;
        }
        
        return null;
    };

    // Check if date is in project range
    const isDateInRange = (date) => {
        if (!blockRange) return false;
        const dateStr = date.toISOString().split('T')[0];
        return dateStr >= blockRange.from && dateStr <= blockRange.to;
    };

    const handleShiftChange = (date, field, value) => {
        const dateStr = date.toISOString().split('T')[0];
        const currentShift = getShiftForDate(date) || {};
        
        setEditedShifts(prev => ({
            ...prev,
            [dateStr]: {
                ...currentShift,
                [field]: value,
                date: dateStr,
                _isNew: !currentShift.id
            }
        }));
    };

    const saveMutation = useMutation({
        mutationFn: async () => {
            const updates = [];
            const creates = [];
            
            for (const [dateStr, shift] of Object.entries(editedShifts)) {
                if (shift._isNew) {
                    // Create new shift for specific date
                    creates.push({
                        project_id: project.id,
                        attendance_id: employee.attendance_id,
                        date: dateStr,
                        shift_block: blockId,
                        effective_from: blockRange.from,
                        effective_to: blockRange.to,
                        am_start: shift.am_start || '—',
                        am_end: shift.am_end || '—',
                        pm_start: shift.pm_start || '—',
                        pm_end: shift.pm_end || '—',
                        is_single_shift: shift.is_single_shift || false,
                        is_friday_shift: shift.is_friday_shift || false
                    });
                } else {
                    // Update existing shift
                    updates.push({
                        id: shift.id,
                        data: {
                            am_start: shift.am_start || '—',
                            am_end: shift.am_end || '—',
                            pm_start: shift.pm_start || '—',
                            pm_end: shift.pm_end || '—'
                        }
                    });
                }
            }
            
            // Execute updates
            for (const { id, data } of updates) {
                await base44.entities.ShiftTiming.update(id, data);
            }
            
            // Execute creates
            if (creates.length > 0) {
                await base44.entities.ShiftTiming.bulkCreate(creates);
            }
            
            return { updates: updates.length, creates: creates.length };
        },
        onSuccess: ({ updates, creates }) => {
            queryClient.invalidateQueries(['shifts', project.id]);
            toast.success(`Saved ${updates + creates} shift changes`);
            setEditedShifts({});
            onClose();
        },
        onError: () => {
            toast.error('Failed to save shifts');
        }
    });

    const days = getDaysInMonth();
    const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const goToPrevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Shift Calendar - {employee?.name} ({employee?.attendance_id})
                    </DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                        {blockRange && `${new Date(blockRange.from).toLocaleDateString('en-GB')} - ${new Date(blockRange.to).toLocaleDateString('en-GB')}`}
                    </p>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between">
                        <Button variant="outline" size="sm" onClick={goToPrevMonth}>
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <h3 className="text-lg font-semibold">{monthName}</h3>
                        <Button variant="outline" size="sm" onClick={goToNextMonth}>
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Calendar Grid */}
                    <div className="border rounded-lg overflow-hidden">
                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 bg-slate-100">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                <div key={day} className="p-2 text-center text-sm font-semibold text-slate-700">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar days */}
                        <div className="grid grid-cols-7 divide-x divide-y">
                            {days.map((day, idx) => {
                                const shift = getShiftForDate(day.date);
                                const isInRange = isDateInRange(day.date);
                                const dateStr = day.date.toISOString().split('T')[0];
                                const isEdited = editedShifts[dateStr];
                                const isFriday = day.date.getDay() === 5;

                                return (
                                    <div
                                        key={idx}
                                        className={cn(
                                            "min-h-[120px] p-2",
                                            !day.isCurrentMonth && "bg-slate-50",
                                            !isInRange && "bg-slate-100 opacity-60",
                                            isEdited && "ring-2 ring-indigo-500"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={cn(
                                                "text-sm font-medium",
                                                !day.isCurrentMonth && "text-slate-400",
                                                isFriday && "text-indigo-600"
                                            )}>
                                                {day.date.getDate()}
                                            </span>
                                            {isInRange && isFriday && (
                                                <span className="text-[10px] px-1 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                                                    Fri
                                                </span>
                                            )}
                                        </div>

                                        {isInRange && (
                                            <div className="space-y-1 text-xs">
                                                <div className="grid grid-cols-2 gap-1">
                                                    <TimePicker
                                                        value={shift?.am_start || '—'}
                                                        onChange={(value) => handleShiftChange(day.date, 'am_start', value)}
                                                        placeholder="AM In"
                                                        className="h-7 text-xs"
                                                    />
                                                    <TimePicker
                                                        value={shift?.am_end || '—'}
                                                        onChange={(value) => handleShiftChange(day.date, 'am_end', value)}
                                                        placeholder="AM Out"
                                                        className="h-7 text-xs"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-1">
                                                    <TimePicker
                                                        value={shift?.pm_start || '—'}
                                                        onChange={(value) => handleShiftChange(day.date, 'pm_start', value)}
                                                        placeholder="PM In"
                                                        className="h-7 text-xs"
                                                    />
                                                    <TimePicker
                                                        value={shift?.pm_end || '—'}
                                                        onChange={(value) => handleShiftChange(day.date, 'pm_end', value)}
                                                        placeholder="PM Out"
                                                        className="h-7 text-xs"
                                                    />
                                                </div>
                                                {shift && (
                                                    <div className="text-[10px] text-slate-500 text-center">
                                                        {formatTime(shift.am_start)} - {formatTime(shift.pm_end)}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-4 border-t">
                        <p className="text-sm text-slate-500">
                            {Object.keys(editedShifts).length > 0 && `${Object.keys(editedShifts).length} unsaved changes`}
                        </p>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={() => saveMutation.mutate()}
                                disabled={saveMutation.isPending || Object.keys(editedShifts).length === 0}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}