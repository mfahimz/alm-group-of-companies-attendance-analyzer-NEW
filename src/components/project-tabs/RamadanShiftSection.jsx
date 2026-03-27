import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, Undo2, Play, Loader2, Moon } from 'lucide-react';
import { toast } from 'sonner';

export default function RamadanShiftSection({ project, shifts, employees }) {
    const [selectedRamadanSchedule, setSelectedRamadanSchedule] = useState(null);
    const [showRamadanPreview, setShowRamadanPreview] = useState(false);
    const [ramadanPreviewData, setRamadanPreviewData] = useState([]);
    const [applying, setApplying] = useState(false);
    const [undoing, setUndoing] = useState(false);
    const [showRamadanShiftsView, setShowRamadanShiftsView] = useState(false);
    const [applyProgress, setApplyProgress] = useState(null);
    const queryClient = useQueryClient();

    const { data: ramadanSchedules = [] } = useQuery({
        queryKey: ['ramadanSchedules', project.company],
        queryFn: () => base44.entities.RamadanSchedule.filter({ company: project.company, active: true })
    });

    const selectedOrOverlappingSchedule = useMemo(() => {
        if (ramadanSchedules.length === 0) return null;
        if (selectedRamadanSchedule?.id) {
            const selected = ramadanSchedules.find(s => s.id === selectedRamadanSchedule.id);
            if (selected) return selected;
        }
        const projectStart = new Date(project.date_from);
        const projectEnd = new Date(project.date_to);
        const overlapping = ramadanSchedules.find((schedule) => {
            const ramadanStart = new Date(schedule.ramadan_start_date);
            const ramadanEnd = new Date(schedule.ramadan_end_date);
            return projectStart <= ramadanEnd && projectEnd >= ramadanStart;
        });
        return overlapping || ramadanSchedules[0];
    }, [ramadanSchedules, selectedRamadanSchedule?.id, project.date_from, project.date_to]);

    const ramadanOverlap = useMemo(() => {
        if (!selectedOrOverlappingSchedule) return null;
        const projectStart = new Date(project.date_from);
        const projectEnd = new Date(project.date_to);
        const ramadanStart = new Date(selectedOrOverlappingSchedule.ramadan_start_date);
        const ramadanEnd = new Date(selectedOrOverlappingSchedule.ramadan_end_date);
        const overlapStart = new Date(Math.max(projectStart, ramadanStart));
        const overlapEnd = new Date(Math.min(projectEnd, ramadanEnd));
        if (overlapStart > overlapEnd) return null;
        return {
            schedule: selectedOrOverlappingSchedule,
            from: overlapStart.toISOString().split('T')[0],
            to: overlapEnd.toISOString().split('T')[0],
        };
    }, [selectedOrOverlappingSchedule, project.date_from, project.date_to]);

    const ramadanShiftCount = useMemo(() => {
        if (!ramadanOverlap) return 0;
        return shifts.filter(s =>
            s.applicable_days?.includes('Ramadan') &&
            s.date >= ramadanOverlap.from &&
            s.date <= ramadanOverlap.to
        ).length;
    }, [shifts, ramadanOverlap]);

    const ramadanShiftsApplied = ramadanShiftCount > 0;

    useEffect(() => {
        if (ramadanSchedules.length === 0) { setSelectedRamadanSchedule(null); return; }
        if (!selectedRamadanSchedule || !ramadanSchedules.some(s => s.id === selectedRamadanSchedule.id)) {
            setSelectedRamadanSchedule(selectedOrOverlappingSchedule || ramadanSchedules[0]);
        }
    }, [ramadanSchedules, selectedRamadanSchedule, selectedOrOverlappingSchedule]);

    const parsedRamadanShifts = useMemo(() => {
        if (!ramadanOverlap?.schedule) return { week1: {}, week2: {} };
        try {
            return {
                week1: ramadanOverlap.schedule.week1_shifts ? JSON.parse(ramadanOverlap.schedule.week1_shifts) : {},
                week2: ramadanOverlap.schedule.week2_shifts ? JSON.parse(ramadanOverlap.schedule.week2_shifts) : {}
            };
        } catch { return { week1: {}, week2: {} }; }
    }, [ramadanOverlap]);

    const handlePreviewRamadan = () => {
        if (!ramadanOverlap || !selectedRamadanSchedule) return;
        const preview = [];
        const startDate = new Date(ramadanOverlap.from);
        const endDate = new Date(ramadanOverlap.to);
        const ramadanStart = new Date(ramadanOverlap.schedule.ramadan_start_date);
        
        for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayOfWeek = currentDate.getDay();
            const isSunday = dayOfWeek === 0;
            
            // Calculate how many Saturdays have passed since Ramadan start
            const daysSinceRamadanStart = Math.floor((currentDate - ramadanStart) / (1000 * 60 * 60 * 24));
            const saturdaysPassed = Math.floor((daysSinceRamadanStart + (7 - ramadanStart.getDay() + 6) % 7) / 7);
            const currentWeekIndex = saturdaysPassed % 2;
            
            preview.push({ 
                date: dateStr, 
                dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'long' }), 
                isSunday, 
                weekLabel: currentWeekIndex === 0 ? 'Week 1' : 'Week 2' 
            });
        }
        setRamadanPreviewData(preview);
        setShowRamadanPreview(true);
    };

    // UNDO: Remove all Ramadan shifts from project
    const handleUndo = async () => {
        if (!ramadanOverlap) return;
        if (!confirm(`Remove all ${ramadanShiftCount} Ramadan shifts from this project? This cannot be undone.`)) return;
        
        setUndoing(true);
        try {
            const result = await base44.functions.invoke('undoRamadanShifts', {
                projectId: project.id,
                dateFrom: ramadanOverlap.from,
                dateTo: ramadanOverlap.to
            });
            const d = result.data;
            if (d.success) {
                queryClient.invalidateQueries(['shifts', project.id]);
                if (d.partial) {
                    toast.warning(`Partially removed ${d.deletedCount}/${d.totalToDelete} shifts. Click Undo again to continue.`);
                } else {
                    toast.success(`Removed ${d.deletedCount} Ramadan shifts`);
                }
            } else {
                toast.error('Failed to undo');
            }
        } catch (error) {
            toast.error('Error: ' + error.message);
        } finally {
            setUndoing(false);
        }
    };

    // APPLY: Create fresh Ramadan shifts (requires undo first if already applied)
    const handleApply = async () => {
        if (!ramadanOverlap || !selectedRamadanSchedule) return;
        setApplying(true);
        setApplyProgress({ phase: 'Initializing...', current: 0, total: 100 });
        
        try {
            // FIX for ISSUE 3: We perform a fresh query here to confirm we are passing the 
            // most recently saved ramadanScheduleId. This prevents issues if the selected 
            // schedule ID is missing or derived from stale state and ensures we invoke 
            // the backend with the correct overlapping schedule.
            setApplyProgress({ phase: 'Fetching schedule...', current: 10, total: 100 });
            const freshSchedules = await base44.entities.RamadanSchedule.filter({ 
                company: project.company, 
                active: true 
            });
            const projectStart = new Date(project.date_from);
            const projectEnd = new Date(project.date_to);
            const freshOverlapping = freshSchedules.find((schedule) => {
                const ramadanStart = new Date(schedule.ramadan_start_date);
                const ramadanEnd = new Date(schedule.ramadan_end_date);
                return projectStart <= ramadanEnd && projectEnd >= ramadanStart;
            });
            const validScheduleId = selectedRamadanSchedule?.id || freshOverlapping?.id;

            if (!validScheduleId) {
                toast.error('Could not determine correct Ramadan schedule ID.');
                setApplying(false);
                setApplyProgress(null);
                return;
            }

            setApplyProgress({ phase: 'Applying shifts...', current: 30, total: 100 });
            const result = await base44.functions.invoke('applyRamadanShifts', {
                projectId: project.id,
                ramadanScheduleId: validScheduleId,
                ramadanFrom: ramadanOverlap.from,
                ramadanTo: ramadanOverlap.to
            });
            
            setApplyProgress({ phase: 'Finalizing...', current: 90, total: 100 });
            const d = result.data;
            if (d.success) {
                setApplyProgress({ phase: 'Refreshing data...', current: 95, total: 100 });
                await queryClient.invalidateQueries({ queryKey: ['shifts', project.id] });
                setApplyProgress({ phase: 'Complete!', current: 100, total: 100 });
                toast.success(`Applied ${d.shiftsCreated} Ramadan shifts for ${d.employeesProcessed} employees`);
                setShowRamadanPreview(false);
            } else if (d.error) {
                toast.error(d.error);
            } else {
                toast.error('Failed to apply Ramadan shifts');
            }
        } catch (error) {
            // Backend returns 400 if shifts already exist
            const msg = error?.response?.data?.error || error.message;
            toast.error(msg);
        } finally {
            setTimeout(() => {
                setApplying(false);
                setApplyProgress(null);
            }, 500);
        }
    };

    if (!ramadanOverlap) return null;

    const isBusy = applying || undoing;

    return (
        <>
            <Card className="border-0 shadow-sm bg-indigo-50/40 rounded-xl ring-1 ring-indigo-100 overflow-hidden">
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <Moon className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-semibold text-indigo-900">Ramadan Shift Timings</CardTitle>
                                <CardDescription className="text-indigo-700/70">Configure special work hours for the holy month</CardDescription>
                            </div>
                        </div>
                        {ramadanShiftsApplied && (
                            <div className="px-4 py-2 bg-green-100 text-green-800 rounded-lg font-medium text-sm flex items-center gap-2">
                                ✓ {ramadanShiftCount} Ramadan Shifts Active
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Ramadan Schedule</Label>
                        <Select
                            value={selectedRamadanSchedule?.id || undefined}
                            onValueChange={(value) => setSelectedRamadanSchedule(ramadanSchedules.find(s => s.id === value))}
                            disabled={ramadanSchedules.length === 1}
                        >
                            <SelectTrigger className="mt-2 bg-white"><SelectValue placeholder="Select Ramadan schedule" /></SelectTrigger>
                            <SelectContent>
                                {ramadanSchedules.map(schedule => (
                                    <SelectItem key={schedule.id} value={schedule.id}>{schedule.company} {schedule.year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 ring-1 ring-slate-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                            <p className="text-sm font-semibold text-slate-800">Overlap with Project</p>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Ramadan shifts will apply from <span className="font-semibold text-indigo-700">{new Date(ramadanOverlap.from).toLocaleDateString('en-GB')}</span> to <span className="font-semibold text-indigo-700">{new Date(ramadanOverlap.to).toLocaleDateString('en-GB')}</span>. 
                        </p>
                        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-slate-200"></div>
                            Sundays are excluded as weekly holidays.
                        </p>
                    </div>

                    {/* Progress Bar */}
                    {applyProgress && (
                        <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-indigo-900">{applyProgress.phase}</span>
                                <span className="text-sm font-semibold text-indigo-700">{Math.round((applyProgress.current / applyProgress.total) * 100)}%</span>
                            </div>
                            <div className="w-full bg-indigo-100 rounded-full h-2">
                                <div 
                                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${(applyProgress.current / applyProgress.total) * 100}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 flex-wrap pt-2">
                        <Button 
                            onClick={handlePreviewRamadan} 
                            variant="outline" 
                            disabled={!selectedRamadanSchedule || isBusy}
                            className="border-slate-200 hover:bg-slate-50 transition-all font-medium"
                        >
                            <Eye className="w-4 h-4 mr-2" />Preview
                        </Button>

                        <Button
                            onClick={handleApply}
                            disabled={!selectedRamadanSchedule || isBusy}
                            className="bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm font-medium"
                        >
                            {applying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Applying...</> : <><Play className="w-4 h-4 mr-2" />{ramadanShiftsApplied ? 'Sync/Apply More Shifts' : 'Apply Ramadan Shifts'}</>}
                        </Button>

                        {ramadanShiftsApplied && (
                            <Button
                                onClick={handleUndo}
                                disabled={isBusy}
                                variant="outline"
                                className="text-red-600 border-red-100 hover:bg-red-50 transition-all font-medium ml-auto"
                            >
                                {undoing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Removing...</> : <><Undo2 className="w-4 h-4 mr-2" />Undo Ramadan Shifts ({ramadanShiftCount})</>}
                            </Button>
                        )}
                    </div>

                    {/* Info box when applied */}
                    {ramadanShiftsApplied && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-green-800 font-medium">✓ Ramadan shifts active ({ramadanShiftCount} shifts)</p>
                                    <p className="text-xs text-green-700 mt-1">Click "Sync/Apply More Shifts" to fill any missing records or continue if the operation was interrupted. Already-applied shifts will be skipped.</p>
                                </div>
                                {Object.keys(parsedRamadanShifts.week1).length > 0 && (
                                    <Button size="sm" variant="outline" onClick={() => setShowRamadanShiftsView(!showRamadanShiftsView)} className="text-purple-700 border-purple-300 hover:bg-purple-50">
                                        <Eye className="w-4 h-4 mr-2" />{showRamadanShiftsView ? 'Hide' : 'View'} Shifts
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Shift details view */}
                    {ramadanShiftsApplied && showRamadanShiftsView && Object.keys(parsedRamadanShifts.week1).length > 0 && (
                        <div className="mt-4 space-y-3">
                            <p className="text-sm font-medium text-purple-900">Ramadan Shift Schedule</p>
                            {['week1', 'week2'].map(weekKey => (
                                <div key={weekKey} className="border border-purple-200 rounded-lg p-3 bg-white">
                                    <p className="text-xs font-semibold text-purple-800 mb-2">
                                        {weekKey === 'week1' ? 'Week 1' : 'Week 2'} Pattern ({Object.keys(parsedRamadanShifts[weekKey]).length} employees)
                                    </p>
                                    <div className="space-y-1 max-h-60 overflow-auto">
                                        {Object.entries(parsedRamadanShifts[weekKey]).slice(0, 50).map(([attendanceId, shift]) => {
                                            const emp = employees.find(e => e.attendance_id === attendanceId);
                                            if (!emp) return null;
                                            const hasDay = shift.day_start && shift.day_end && shift.day_start !== '—';
                                            const hasNight = shift.night_start && shift.night_end && shift.night_start !== '—';
                                            return (
                                                <div key={attendanceId} className="text-xs text-slate-700 flex justify-between items-center py-1 border-b border-purple-100">
                                                    <span className="font-medium">{emp.name} ({attendanceId})</span>
                                                    <span className="text-purple-700">
                                                        {hasDay && `Day: ${shift.day_start}-${shift.day_end}`}
                                                        {hasDay && hasNight && ' | '}
                                                        {hasNight && `Night: ${shift.night_start}-${shift.night_end}`}
                                                        {!hasDay && !hasNight && '—'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Ramadan Preview Dialog */}
            <Dialog open={showRamadanPreview} onOpenChange={setShowRamadanPreview}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Preview Ramadan Shifts</DialogTitle>
                        <p className="text-sm text-slate-500 mt-1">
                            {ramadanPreviewData.length} days from {ramadanOverlap?.from && new Date(ramadanOverlap.from).toLocaleDateString('en-GB')} to {ramadanOverlap?.to && new Date(ramadanOverlap.to).toLocaleDateString('en-GB')}
                        </p>
                    </DialogHeader>
                    <div className="mt-4">
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Day</TableHead>
                                        <TableHead>Week Pattern</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ramadanPreviewData.map((day, idx) => (
                                        <TableRow key={idx} className={day.isSunday ? 'bg-slate-50' : ''}>
                                            <TableCell className="font-medium">{new Date(day.date).toLocaleDateString('en-GB')}</TableCell>
                                            <TableCell>{day.dayOfWeek}</TableCell>
                                            <TableCell>
                                                {day.isSunday ? <span className="text-slate-500">—</span> : (
                                                    <span className={day.weekLabel === 'Week 1' ? 'text-purple-700 font-medium' : 'text-indigo-700 font-medium'}>{day.weekLabel}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {day.isSunday ? (
                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">Weekly Holiday</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Ramadan Shift</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex gap-3 pt-4 border-t mt-4">
                            <Button variant="outline" onClick={() => setShowRamadanPreview(false)}>Close</Button>
                            <Button onClick={handleApply} disabled={applying} className="bg-purple-600 hover:bg-purple-700">
                                {applying ? 'Applying...' : ramadanShiftsApplied ? 'Sync/Apply More Shifts' : 'Apply Ramadan Shifts'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}