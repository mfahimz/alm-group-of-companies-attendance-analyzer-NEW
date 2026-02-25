import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Save, Copy, Sparkles } from 'lucide-react';
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
    const [fridayShifts, setFridayShifts] = useState(() => {
        try {
            return schedule.friday_shifts ? JSON.parse(schedule.friday_shifts) : {};
        } catch {
            return {};
        }
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('all');
    const queryClient = useQueryClient();

    const { data: allEmployees = [] } = useQuery({
        queryKey: ['employees', schedule.company],
        queryFn: () => base44.entities.Employee.filter({ company: schedule.company, active: true })
    });

    // Get company_id for the current company
    const { data: companyData } = useQuery({
        queryKey: ['company', schedule.company],
        queryFn: async () => {
            const companies = await base44.entities.Company.filter({ name: schedule.company });
            return companies[0] || null;
        }
    });

    // Filter out employees without attendance_id (salary-only employees)
    const employees = React.useMemo(() => {
        return allEmployees.filter(emp => emp.attendance_id);
    }, [allEmployees]);

    // Get unique departments
    const departments = React.useMemo(() => {
        const depts = [...new Set(employees.map(e => e.department).filter(Boolean))];
        return depts.sort();
    }, [employees]);

    // Filter employees based on search and department
    const filteredEmployees = React.useMemo(() => {
        return employees.filter(emp => {
            const matchesSearch = !searchTerm || 
                emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.attendance_id?.toString().includes(searchTerm);
            const matchesDepartment = selectedDepartment === 'all' || emp.department === selectedDepartment;
            return matchesSearch && matchesDepartment;
        });
    }, [employees, searchTerm, selectedDepartment]);



    // Copy week 1 shifts to week 2 (all employees)
    const copyWeek1ToWeek2 = () => {
        setWeek2Shifts({ ...week1Shifts });
        toast.success('Week 1 shifts copied to Week 2');
    };

    // Clear all night shift times
    const clearAllNightShifts = (weekNum) => {
        const setter = weekNum === 1 ? setWeek1Shifts : setWeek2Shifts;
        setter(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(attendanceId => {
                if (updated[attendanceId]) {
                    updated[attendanceId] = {
                        ...updated[attendanceId],
                        night_start: '',
                        night_end: ''
                    };
                }
            });
            return updated;
        });
        toast.success(`Week ${weekNum} night shift times cleared`);
    };

    // Apply default Friday shifts to all employees
    const applyDefaultFridayShifts = () => {
        const defaultFridayShifts = {};
        employees.forEach(emp => {
            if (isAlMaraghiAutomotive) {
                defaultFridayShifts[emp.attendance_id] = {
                    active_shifts: ['day', 'night'],
                    day_start: '8:00 AM',
                    day_end: '12:00 PM',
                    night_start: '2:00 PM',
                    night_end: '5:00 PM'
                };
            } else {
                defaultFridayShifts[emp.attendance_id] = {
                    active_shifts: ['day', 'night'],
                    day_start: '9:00 AM',
                    day_end: '12:00 PM',
                    night_start: '8:00 PM',
                    night_end: '12:00 AM'
                };
            }
        });
        setFridayShifts(defaultFridayShifts);
        const timeLabel = isAlMaraghiAutomotive ? '8AM-12PM & 2PM-5PM' : '9AM-12PM & 8PM-12AM';
        toast.success(`Default Friday shifts (${timeLabel}) applied to all ${employees.length} employees`);
    };

    // Copy individual employee shift from week 1 to week 2
    const copyEmployeeShift = (attendanceId) => {
        const week1Data = week1Shifts[attendanceId];
        if (week1Data) {
            setWeek2Shifts(prev => ({
                ...prev,
                [attendanceId]: { ...week1Data }
            }));
            toast.success('Shift copied to Week 2');
        }
    };

    const updateMutation = useMutation({
        mutationFn: async (data) => {
            // Update the Ramadan schedule
            await base44.entities.RamadanSchedule.update(schedule.id, data);
            
            // Also update any applied ShiftTiming records in projects
            try {
                const allShifts = await base44.entities.ShiftTiming.filter({});
                const ramadanShifts = allShifts.filter(s => 
                    s.applicable_days?.includes('Ramadan') &&
                    s.date >= schedule.ramadan_start_date &&
                    s.date <= schedule.ramadan_end_date
                );
                
                // Group by project and re-apply
                const projectIds = [...new Set(ramadanShifts.map(s => s.project_id))];
                
                for (const projectId of projectIds) {
                    // Get project details
                    const projects = await base44.entities.Project.filter({ id: projectId });
                    if (projects.length === 0) continue;
                    const project = projects[0];
                    
                    // Calculate overlap
                    const projectStart = new Date(project.date_from);
                    const projectEnd = new Date(project.date_to);
                    const ramadanStart = new Date(schedule.ramadan_start_date);
                    const ramadanEnd = new Date(schedule.ramadan_end_date);
                    const overlapStart = new Date(Math.max(projectStart, ramadanStart));
                    const overlapEnd = new Date(Math.min(projectEnd, ramadanEnd));
                    
                    if (overlapStart <= overlapEnd) {
                        // Re-apply Ramadan shifts
                        await base44.functions.invoke('applyRamadanShifts', {
                            projectId,
                            ramadanScheduleId: schedule.id,
                            ramadanFrom: overlapStart.toISOString().split('T')[0],
                            ramadanTo: overlapEnd.toISOString().split('T')[0]
                        });
                    }
                }
            } catch (error) {
                console.error('Error updating applied shifts:', error);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['ramadanSchedules']);
            queryClient.invalidateQueries(['shifts']);
            toast.success('Ramadan shifts updated across all projects');
        }
    });

    const handleSave = () => {
        updateMutation.mutate({
            week1_shifts: JSON.stringify(week1Shifts),
            week2_shifts: JSON.stringify(week2Shifts),
            friday_shifts: JSON.stringify(fridayShifts)
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

    const handleFridayChange = (attendanceId, field, value) => {
        setFridayShifts(prev => ({
            ...prev,
            [attendanceId]: {
                ...prev[attendanceId],
                [field]: value
            }
        }));
    };

    const isAlMaraghiAutomotive = companyData?.company_id === 3;

    const handleActiveShiftToggle = (attendanceId, weekNum, shiftName) => {
        const setter = weekNum === 1 ? setWeek1Shifts : weekNum === 2 ? setWeek2Shifts : setFridayShifts;
        const employee = employees.find(e => e.attendance_id === attendanceId);
        const hasDefaultShifts = ['Operations', 'Front Office', 'Bodyshop', 'Housekeeping'].includes(employee?.department);
        const isFriday = weekNum === 'friday';
        
        setter(prev => {
            const current = prev[attendanceId] || {};
            const activeShifts = current.active_shifts || [];
            
            let newActiveShifts;
            let updatedShift = { ...current };
            
            if (isAlMaraghiAutomotive && !isFriday) {
                // Al Maraghi Automotive: S1 and S2 are mutually exclusive radio-style
                if (activeShifts.includes(shiftName)) {
                    // Uncheck - remove shift and clear times
                    newActiveShifts = [];
                    updatedShift.day_start = '';
                    updatedShift.day_end = '';
                } else {
                    // Select this shift (replace any existing)
                    newActiveShifts = [shiftName];
                    if (shiftName === 'day') {
                        // S1: 8:00 AM - 3:00 PM
                        updatedShift.day_start = '8:00 AM';
                        updatedShift.day_end = '3:00 PM';
                    } else if (shiftName === 'night') {
                        // S2: 10:00 AM - 5:00 PM
                        updatedShift.day_start = '10:00 AM';
                        updatedShift.day_end = '5:00 PM';
                    }
                    // Clear night columns (not used for Al Maraghi Automotive)
                    updatedShift.night_start = '';
                    updatedShift.night_end = '';
                }
            } else {
                // Standard behavior for other companies
                if (activeShifts.includes(shiftName)) {
                    newActiveShifts = activeShifts.filter(s => s !== shiftName);
                } else {
                    newActiveShifts = [...activeShifts, shiftName];
                    
                    if (isFriday) {
                        if (shiftName === 'day') {
                            updatedShift.day_start = updatedShift.day_start || '9:00 AM';
                            updatedShift.day_end = updatedShift.day_end || '12:00 PM';
                        } else if (shiftName === 'night') {
                            updatedShift.night_start = updatedShift.night_start || '8:00 PM';
                            updatedShift.night_end = updatedShift.night_end || '12:00 AM';
                        }
                    } else {
                        if (shiftName === 'day') {
                            const willHaveBoth = newActiveShifts.includes('night');
                            if (willHaveBoth) {
                                updatedShift.day_start = updatedShift.day_start || '1:00 PM';
                                updatedShift.day_end = updatedShift.day_end || '4:00 PM';
                            } else if (hasDefaultShifts) {
                                updatedShift.day_start = updatedShift.day_start || '9:00 AM';
                                updatedShift.day_end = updatedShift.day_end || '4:00 PM';
                            } else {
                                updatedShift.day_start = updatedShift.day_start || '';
                                updatedShift.day_end = updatedShift.day_end || '';
                            }
                        } else if (shiftName === 'night') {
                            if (hasDefaultShifts) {
                                if (newActiveShifts.includes('day')) {
                                    updatedShift.day_start = '1:00 PM';
                                    updatedShift.day_end = '4:00 PM';
                                }
                                updatedShift.night_start = updatedShift.night_start || '8:00 PM';
                                updatedShift.night_end = updatedShift.night_end || '12:00 AM';
                            }
                        }
                    }
                }
            }
            
            return {
                ...prev,
                [attendanceId]: {
                    ...updatedShift,
                    active_shifts: newActiveShifts
                }
            };
        });
    };

    const handleExport = (week) => {
        const shifts = week === 1 ? week1Shifts : week2Shifts;
        const csvData = [
            ['Attendance ID', 'Employee Name', 'Active Shifts', 'Day Shift Start', 'Day Shift End', 'Night Start', 'Night End']
        ];

        employees.forEach(emp => {
            const shift = shifts[emp.attendance_id] || {};
            const activeShifts = (shift.active_shifts || []).join('|');
            csvData.push([
                emp.attendance_id,
                emp.name,
                activeShifts,
                shift.day_start || '',
                shift.day_end || '',
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
                    const [attendanceId, , activeShiftsStr, dayStart, dayEnd, nightStart, nightEnd] = row.split(',');
                    if (attendanceId && attendanceId.trim()) {
                        const activeShifts = activeShiftsStr?.trim() ? activeShiftsStr.trim().split('|') : [];
                        importedShifts[attendanceId.trim()] = {
                            active_shifts: activeShifts,
                            day_start: dayStart?.trim() || '',
                            day_end: dayEnd?.trim() || '',
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
            <div className="flex gap-2 items-center flex-wrap">
                <Input
                    placeholder="Search by name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                />
                <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="h-9 px-3 border rounded-md text-sm"
                >
                    <option value="all">All Departments</option>
                    {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                </select>
                <div className="ml-auto flex gap-2">
                    {weekNum === 2 && (
                        <Button size="sm" variant="outline" onClick={copyWeek1ToWeek2}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy from Week 1
                        </Button>
                    )}
                    {weekNum === 'friday' && (
                        <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={applyDefaultFridayShifts}
                            className="bg-green-50 text-green-700 hover:bg-green-100 border-green-300"
                        >
                            <Sparkles className="w-4 h-4 mr-2" />
                            Apply Default to All (9AM-12PM & 8PM-12AM)
                        </Button>
                    )}
                    {weekNum !== 'friday' && (
                        <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => clearAllNightShifts(weekNum)}
                            className="text-red-600 hover:text-red-700"
                        >
                            Clear All Night Times
                        </Button>
                    )}
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
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto border rounded-lg">
                <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow>
                            <TableHead className="w-32">Attendance ID</TableHead>
                            <TableHead className="w-48">Name</TableHead>
                            <TableHead>Active Shifts</TableHead>
                            <TableHead>Day Shift Start</TableHead>
                            <TableHead>Day Shift End</TableHead>
                            <TableHead>Night Start</TableHead>
                            <TableHead>Night End</TableHead>
                            {weekNum === 2 && <TableHead className="w-20">Copy</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEmployees.map(emp => {
                            const shift = shifts[emp.attendance_id] || {};
                            return (
                                <TableRow key={emp.id}>
                                    <TableCell className="font-medium">{emp.attendance_id}</TableCell>
                                    <TableCell>{emp.name}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-3 items-center">
                                            {isAlMaraghiAutomotive && weekNum !== 'friday' ? (
                                                <>
                                                    <label className="flex items-center gap-1.5 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={(shift.active_shifts || []).includes('day')}
                                                            onChange={() => handleActiveShiftToggle(emp.attendance_id, weekNum, 'day')}
                                                            className="w-4 h-4"
                                                        />
                                                        S1
                                                    </label>
                                                    <label className="flex items-center gap-1.5 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={(shift.active_shifts || []).includes('night')}
                                                            onChange={() => handleActiveShiftToggle(emp.attendance_id, weekNum, 'night')}
                                                            className="w-4 h-4"
                                                        />
                                                        S2
                                                    </label>
                                                </>
                                            ) : (
                                                <>
                                                    <label className="flex items-center gap-1.5 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={(shift.active_shifts || []).includes('day')}
                                                            onChange={() => handleActiveShiftToggle(emp.attendance_id, weekNum, 'day')}
                                                            className="w-4 h-4"
                                                        />
                                                        Day
                                                    </label>
                                                    <label className="flex items-center gap-1.5 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={(shift.active_shifts || []).includes('night')}
                                                            onChange={() => handleActiveShiftToggle(emp.attendance_id, weekNum, 'night')}
                                                            className="w-4 h-4"
                                                        />
                                                        Night
                                                    </label>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="8:00 AM"
                                            value={shift.day_start || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'day_start', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="5:00 PM"
                                            value={shift.day_end || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'day_end', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder=""
                                            value={shift.night_start || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'night_start', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder=""
                                            value={shift.night_end || ''}
                                            onChange={(e) => handleChange(emp.attendance_id, 'night_end', e.target.value)}
                                            className="w-28"
                                        />
                                    </TableCell>
                                    {(weekNum === 2 || weekNum === 'friday') && (
                                    <TableCell>
                                    <Button
                                       size="sm"
                                       variant="ghost"
                                       onClick={() => copyEmployeeShift(emp.attendance_id)}
                                       title="Copy Week 1 shifts for this employee"
                                    >
                                       <Copy className="w-4 h-4" />
                                    </Button>
                                    </TableCell>
                                    )}
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
                                <strong>Shift Structure:</strong> Week 1 and Week 2 patterns alternate throughout Ramadan, resetting after each Sunday.<br />
                                <strong>Available Shifts:</strong> Day Shift and Night Shift - An employee can work day shift only, or day shift + night shift
                                {companyData?.company_id === 3 && (
                                    <>
                                        <br />
                                        <strong className="text-green-700">Al Maraghi Automotive:</strong> S1 = 8:00 AM - 3:00 PM | S2 = 10:00 AM - 5:00 PM (select one per employee)
                                    </>
                                )}
                            </p>
                        </CardContent>
                    </Card>

                    <Tabs defaultValue="week1" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="week1">Week 1 Pattern</TabsTrigger>
                            <TabsTrigger value="week2">Week 2 Pattern</TabsTrigger>
                            <TabsTrigger value="friday">Friday Shifts</TabsTrigger>
                        </TabsList>
                        <TabsContent value="week1" className="mt-4">
                            {renderShiftTable(1, week1Shifts, handleWeek1Change)}
                        </TabsContent>
                        <TabsContent value="week2" className="mt-4">
                            {renderShiftTable(2, week2Shifts, handleWeek2Change)}
                        </TabsContent>
                        <TabsContent value="friday" className="mt-4">
                            {renderShiftTable('friday', fridayShifts, handleFridayChange)}
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