import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function RamadanShiftDesigner({ schedule, onClose }) {
    const [week1Shifts, setWeek1Shifts] = useState(() => {
        try {
            return schedule.week1_shifts ? JSON.parse(schedule.week1_shifts) : {};
        } catch {
            return {};
        }
    });
    const [week2Shifts, setWeek2Shifts] = useState(() => {
        try {
            return schedule.week2_shifts ? JSON.parse(schedule.week2_shifts) : {};
        } catch {
            return {};
        }
    });
    const queryClient = useQueryClient();

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', schedule.company],
        queryFn: () => base44.entities.Employee.filter({ company: schedule.company, active: true })
    });

    const updateMutation = useMutation({
        mutationFn: (data) => base44.entities.RamadanSchedule.update(schedule.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['ramadanSchedules']);
            toast.success('Ramadan shifts updated');
        }
    });

    const handleSave = () => {
        updateMutation.mutate({
            week1_shifts: JSON.stringify(week1Shifts),
            week2_shifts: JSON.stringify(week2Shifts)
        });
    };

    const handleWeek1Change = (attendanceId, field, value) => {
        setWeek1Shifts(prev => ({
            ...prev,
            [attendanceId]: {
                ...prev[attendanceId],
                [field]: value
            }
        }));
    };

    const handleWeek2Change = (attendanceId, field, value) => {
        setWeek2Shifts(prev => ({
            ...prev,
            [attendanceId]: {
                ...prev[attendanceId],
                [field]: value
            }
        }));
    };

    const handleShiftOptionChange = (attendanceId, weekNum, option) => {
        const setter = weekNum === 1 ? setWeek1Shifts : setWeek2Shifts;
        setter(prev => {
            const current = prev[attendanceId] || {};
            // Reset active shifts when changing option
            return {
                ...prev,
                [attendanceId]: {
                    ...current,
                    shift_option: option,
                    active_shifts: [] // Reset selection
                }
            };
        });
    };

    const handleActiveShiftToggle = (attendanceId, weekNum, shiftName) => {
        const setter = weekNum === 1 ? setWeek1Shifts : setWeek2Shifts;
        const currentShifts = weekNum === 1 ? week1Shifts : week2Shifts;
        
        setter(prev => {
            const current = prev[attendanceId] || {};
            const option = current.shift_option || 'two_shift';
            const activeShifts = current.active_shifts || [];
            
            let newActiveShifts;
            if (activeShifts.includes(shiftName)) {
                // Remove shift
                newActiveShifts = activeShifts.filter(s => s !== shiftName);
            } else {
                // Add shift
                if (option === 'one_shift') {
                    // Only one shift allowed
                    newActiveShifts = [shiftName];
                } else {
                    // Two shifts allowed
                    if (activeShifts.length < 2) {
                        newActiveShifts = [...activeShifts, shiftName];
                    } else {
                        newActiveShifts = activeShifts;
                    }
                }
            }
            
            return {
                ...prev,
                [attendanceId]: {
                    ...current,
                    active_shifts: newActiveShifts
                }
            };
        });
    };

    const handleExport = (week) => {
        const shifts = week === 1 ? week1Shifts : week2Shifts;
        const csvData = [
            ['Attendance ID', 'Employee Name', 'Shift Type', 'Active Shifts', 'Shift 1 Start', 'Shift 1 End', 'Shift 2 Start', 'Shift 2 End', 'Night Start', 'Night End']
        ];

        employees.forEach(emp => {
            const shift = shifts[emp.attendance_id] || {};
            const activeShifts = (shift.active_shifts || []).join('|');
            csvData.push([
                emp.attendance_id,
                emp.name,
                shift.shift_option || 'two_shift',
                activeShifts,
                shift.shift1_start || '',
                shift.shift1_end || '',
                shift.shift2_start || '',
                shift.shift2_end || '',
                shift.night_start || '',
                shift.night_end || ''
            ]);
        });

        const csv = csvData.map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ramadan_week${week}_${schedule.company}_${schedule.year}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        toast.success(`Week ${week} template exported`);
    };

    const handleImport = (week, event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const rows = text.split('\n').slice(1);
                const importedShifts = {};

                rows.forEach(row => {
                    const [attendanceId, , shiftOption, activeShiftsStr, shift1Start, shift1End, shift2Start, shift2End, nightStart, nightEnd] = row.split(',');
                    if (attendanceId && attendanceId.trim()) {
                        const activeShifts = activeShiftsStr?.trim() ? activeShiftsStr.trim().split('|') : [];
                        importedShifts[attendanceId.trim()] = {
                            shift_option: shiftOption?.trim() || 'two_shift',
                            active_shifts: activeShifts,
                            shift1_start: shift1Start?.trim() || '',
                            shift1_end: shift1End?.trim() || '',
                            shift2_start: shift2Start?.trim() || '',
                            shift2_end: shift2End?.trim() || '',
                            night_start: nightStart?.trim() || '',
                            night_end: nightEnd?.trim() || ''
                        };
                    }
                });

                if (week === 1) {
                    setWeek1Shifts(importedShifts);
                } else {
                    setWeek2Shifts(importedShifts);
                }
                toast.success(`Week ${week} shifts imported`);
            } catch (error) {
                toast.error('Failed to import: ' + error.message);
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const renderShiftTable = (weekNum, shifts, handleChange) => (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleExport(weekNum)}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Template
                </Button>
                <Button size="sm" variant="outline" onClick={() => document.getElementById(`import-week${weekNum}`).click()}>
                    <Upload className="w-4 h-4 mr-2" />
                    Import CSV
                </Button>
                <input
                    id={`import-week${weekNum}`}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleImport(weekNum, e)}
                />
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto border rounded-lg">
                <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                            <TableHead className="w-32">Attendance ID</TableHead>
                            <TableHead className="w-48">Name</TableHead>
                            <TableHead>Shift Type</TableHead>
                            <TableHead>Active Shifts</TableHead>
                            <TableHead>Shift 1 Start</TableHead>
                            <TableHead>Shift 1 End</TableHead>
                            <TableHead>Shift 2 Start</TableHead>
                            <TableHead>Shift 2 End</TableHead>
                            <TableHead>Night Start</TableHead>
                            <TableHead>Night End</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {employees.map(emp => {
                            const shift = shifts[emp.attendance_id] || {};
                            return (
                                <TableRow key={emp.id}>
                                    <TableCell className="font-medium">{emp.attendance_id}</TableCell>
                                    <TableCell>{emp.name}</TableCell>
                                    <TableCell>
                                        <select
                                            className="w-32 h-9 px-2 border rounded-md text-sm"
                                            value={shift.shift_option || 'two_shift'}
                                            onChange={(e) => handleShiftOptionChange(emp.attendance_id, weekNum, e.target.value)}
                                        >
                                            <option value="one_shift">One Shift</option>
                                            <option value="two_shift">Two Shift</option>
                                        </select>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-2 items-center">
                                            <label className="flex items-center gap-1 text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={(shift.active_shifts || []).includes('shift1')}
                                                    onChange={() => handleActiveShiftToggle(emp.attendance_id, weekNum, 'shift1')}
                                                    className="w-4 h-4"
                                                />
                                                S1
                                            </label>
                                            <label className="flex items-center gap-1 text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={(shift.active_shifts || []).includes('shift2')}
                                                    onChange={() => handleActiveShiftToggle(emp.attendance_id, weekNum, 'shift2')}
                                                    className="w-4 h-4"
                                                />
                                                S2
                                            </label>
                                            <label className="flex items-center gap-1 text-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={(shift.active_shifts || []).includes('night')}
                                                    onChange={() => handleActiveShiftToggle(emp.attendance_id, weekNum, 'night')}
                                                    className="w-4 h-4"
                                                />
                                                Night
                                            </label>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="8:00 AM"
                                            value={shift.shift1_start || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'shift1_start', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="12:00 PM"
                                            value={shift.shift1_end || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'shift1_end', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="1:00 PM"
                                            value={shift.shift2_start || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'shift2_start', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="5:00 PM"
                                            value={shift.shift2_end || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'shift2_end', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="8:00 PM"
                                            value={shift.night_start || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'night_start', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="12:00 AM"
                                            value={shift.night_end || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'night_end', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Design Ramadan Shifts: {schedule.company} {schedule.year}
                    </DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                        Configure alternating weekly shift patterns for Ramadan
                    </p>
                </DialogHeader>

                <div className="mt-4">
                    <Card className="bg-blue-50 border-blue-200 mb-4">
                        <CardContent className="p-4">
                            <p className="text-sm text-blue-900">
                                <strong>Shift Structure:</strong> Week 1 and Week 2 patterns alternate throughout Ramadan.<br />
                                <strong>Shift Options:</strong> Choose "One Shift" (work 1 shift) or "Two Shift" (work 2 shifts)<br />
                                <strong>Available Shifts:</strong> Shift 1, Shift 2, Night Shift - Select which shifts apply to each employee
                            </p>
                        </CardContent>
                    </Card>

                    <Tabs defaultValue="week1" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="week1">Week 1 Pattern</TabsTrigger>
                            <TabsTrigger value="week2">Week 2 Pattern</TabsTrigger>
                        </TabsList>
                        <TabsContent value="week1" className="mt-4">
                            {renderShiftTable(1, week1Shifts, handleWeek1Change)}
                        </TabsContent>
                        <TabsContent value="week2" className="mt-4">
                            {renderShiftTable(2, week2Shifts, handleWeek2Change)}
                        </TabsContent>
                    </Tabs>

                    <div className="flex gap-3 pt-6 border-t mt-6">
                        <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-green-600 hover:bg-green-700">
                            <Save className="w-4 h-4 mr-2" />
                            {updateMutation.isPending ? 'Saving...' : 'Save Shifts'}
                        </Button>
                        <Button variant="outline" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}