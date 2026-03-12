import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, Undo2, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RamadanShiftSection({ project, shifts, employees }) {
    const [selectedRamadanSchedule, setSelectedRamadanSchedule] = useState(null);
    const [showRamadanPreview, setShowRamadanPreview] = useState(false);
    const [ramadanPreviewData, setRamadanPreviewData] = useState([]);
    const [applying, setApplying] = useState(false);
    const [undoing, setUndoing] = useState(false);
    const [showRamadanShiftsView, setShowRamadanShiftsView] = useState(false);
    const queryClient = useQueryClient();

    const { data: ramadanSchedules = [] } = useQuery({
        queryKey: ['ramadanSchedules', project.company],
        queryFn: () => base44.entities.RamadanSchedule.filter({ company: project.company, active: true })
    });

    const selectedOrOverlappingSchedule = React.useMemo(() => {
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

    const ramadanOverlap = React.useMemo(() => {
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

    const ramadanShiftCount = React.useMemo(() => {
        if (!ramadanOverlap) return 0;
        return shifts.filter(s =>
            s.applicable_days?.includes('Ramadan') &&
            s.date >= ramadanOverlap.from &&
            s.date <= ramadanOverlap.to
        ).length;
    }, [shifts, ramadanOverlap]);

    const ramadanShiftsApplied = ramadanShiftCount > 0;

    React.useEffect(() => {
        if (ramadanSchedules.length === 0) { setSelectedRamadanSchedule(null); return; }
        if (!selectedRamadanSchedule || !ramadanSchedules.some(s => s.id === selectedRamadanSchedule.id)) {
            setSelectedRamadanSchedule(selectedOrOverlappingSchedule || ramadanSchedules[0]);
        }
    }, [ramadanSchedules, selectedRamadanSchedule, selectedOrOverlappingSchedule]);

    const parsedRamadanShifts = React.useMemo(() => {
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
        try {
            // FIX for ISSUE 3: We perform a fresh query here to confirm we are passing the 
            // most recently saved ramadanScheduleId. This prevents issues if the selected 
            // schedule ID is missing or derived from stale state and ensures we invoke 
            // the backend with the correct overlapping schedule.
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
                return;
            }

            const result = await base44.functions.invoke('applyRamadanShifts', {
                projectId: project.id,
                ramadanScheduleId: validScheduleId,
                ramadanFrom: ramadanOverlap.from,
                ramadanTo: ramadanOverlap.to
            });
            const d = result.data;
            if (d.success) {
                queryClient.invalidateQueries({ queryKey: ['shifts', project.id] });
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
            setApplying(false);
        }
    };

    if (!ramadanOverlap) return null;

    const isBusy = applying || undoing;

    return (
        <>
            <Card className="border-0 shadow-sm bg-purple-50 border-purple-200">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-white text-xl">🌙</div>
                            <div>
                                <CardTitle className="text-lg">Ramadan Shift Override</CardTitle>
                                <p className="text-sm text-purple-700 mt-1">
                                    Ramadan period: {new Date(ramadanOverlap.schedule.ramadan_start_date).toLocaleDateString('en-GB')} - {new Date(ramadanOverlap.schedule.ramadan_end_date).toLocaleDateString('en-GB')}
                                </p>
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

                    <div className="bg-white border border-purple-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-purple-900 mb-2">Overlap with Project</p>
                        <p className="text-sm text-purple-700">
                            Ramadan shifts will apply from <strong>{new Date(ramadanOverlap.from).toLocaleDateString('en-GB')}</strong> to <strong>{new Date(ramadanOverlap.to).toLocaleDateString('en-GB')}</strong>.
                        </p>
                        <p className="text-xs text-purple-600 mt-2">Sundays are excluded as weekly holidays.</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 flex-wrap">
                        <Button onClick={handlePreviewRamadan} variant="outline" disabled={!selectedRamadanSchedule || isBusy}>
                            <Eye className="w-4 h-4 mr-2" />Preview
                        </Button>

                        {ramadanShiftsApplied && (
                            <Button
                                onClick={handleUndo}
                                disabled={isBusy}
                                variant="destructive"
                            >
                                {undoing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Removing...</> : <><Undo2 className="w-4 h-4 mr-2" />Undo Ramadan Shifts ({ramadanShiftCount})</>}
                            </Button>
                        )}

                        <Button
                            onClick={handleApply}
                            disabled={!selectedRamadanSchedule || isBusy || ramadanShiftsApplied}
                            className={ramadanShiftsApplied ? "bg-green-600 hover:bg-green-700" : "bg-purple-600 hover:bg-purple-700"}
                        >
                            {applying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Applying...</> : ramadanShiftsApplied ? <><Play className="w-4 h-4 mr-2" />Already Applied</> : <><Play className="w-4 h-4 mr-2" />Apply Ramadan Shifts</>}
                        </Button>
                    </div>

                    {/* Info box when applied */}
                    {ramadanShiftsApplied && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-green-800 font-medium">✓ Ramadan shifts active ({ramadanShiftCount} shifts)</p>
                                    <p className="text-xs text-green-700 mt-1">To update from Ramadan Schedule: click "Undo" first, then "Apply" again with latest schedule.</p>
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
                            <Button onClick={handleApply} disabled={ramadanShiftsApplied || applying} className="bg-purple-600 hover:bg-purple-700">
                                {applying ? 'Applying...' : ramadanShiftsApplied ? 'Already Applied' : 'Apply Ramadan Shifts'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}