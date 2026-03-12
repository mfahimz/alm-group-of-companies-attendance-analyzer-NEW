import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';

export default function RamadanCalendarView({ schedule, employees, onClose }) {
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const itemsPerPage = 10;

    // Detect Al Maraghi Automotive (company_id=3)
    const { data: companyData } = useQuery({
        queryKey: ['company', schedule.company],
        queryFn: async () => {
            const companies = await base44.entities.Company.filter({ name: schedule.company });
            return companies[0] || null;
        },
        staleTime: 10 * 60 * 1000
    });
    const isAlMaraghiAutomotive = companyData?.company_id === 3;

    // Parse shift data once
    const { week1Shifts, week2Shifts, fridayShifts } = useMemo(() => {
        try {
            const week1 = schedule.week1_shifts ? JSON.parse(schedule.week1_shifts) : {};
            const week2 = schedule.week2_shifts ? JSON.parse(schedule.week2_shifts) : {};
            const friday = schedule.friday_shifts ? JSON.parse(schedule.friday_shifts) : {};
            return { week1Shifts: week1, week2Shifts: week2, fridayShifts: friday };
        } catch {
            return { week1Shifts: {}, week2Shifts: {}, fridayShifts: {} };
        }
    }, [schedule]);

    // Get departments
    const departments = useMemo(() => {
        const depts = [...new Set(employees.map(e => e.department).filter(Boolean))];
        return depts.sort();
    }, [employees]);

    // Filter employees with shift data
    const employeesWithShifts = useMemo(() => {
        return employees.filter(emp => 
            week1Shifts[emp.attendance_id] || week2Shifts[emp.attendance_id] || fridayShifts[emp.attendance_id]
        );
    }, [employees, week1Shifts, week2Shifts, fridayShifts]);

    // Apply search and filter
    const filteredEmployees = useMemo(() => {
        return employeesWithShifts.filter(emp => {
            const matchesSearch = !searchTerm || 
                emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.attendance_id?.toString().includes(searchTerm);
            const matchesDept = departmentFilter === 'all' || emp.department === departmentFilter;
            return matchesSearch && matchesDept;
        });
    }, [employeesWithShifts, searchTerm, departmentFilter]);

    // Paginate
    const paginatedEmployees = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredEmployees.slice(start, start + itemsPerPage);
    }, [filteredEmployees, currentPage]);

    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const days = [];
        const start = new Date(schedule.ramadan_start_date);
        const end = new Date(schedule.ramadan_end_date);
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            const isSunday = dayOfWeek === 0;
            const isFriday = dayOfWeek === 5;
            
            // Calculate how many Saturdays have passed since Ramadan start
            const daysSinceStart = Math.floor((d - start) / (1000 * 60 * 60 * 24));
            const saturdaysPassed = Math.floor((daysSinceStart + (7 - start.getDay() + 6) % 7) / 7);
            const weekNumber = saturdaysPassed % 2;
            
            days.push({
                date: new Date(d),
                dateStr: d.toISOString().split('T')[0],
                day: d.getDate(),
                month: d.getMonth(),
                weekLabel: weekNumber === 0 ? 'W1' : 'W2',
                isSunday,
                isFriday
            });
        }
        
        return days;
    }, [schedule]);

    const formatShift = (shift, isFriday = false) => {
        if (!shift) return '—';
        const parts = [];
        
        if (isAlMaraghiAutomotive && !isFriday) {
            // Al Maraghi Automotive non-Friday: S1 and S2 always stored in day_start/day_end
            // We format it simply without guessing which shift definition it originally was
            if (shift.day_start && shift.day_end && shift.day_start !== '—' && shift.day_end !== '—') {
                parts.push(`${shift.day_start}-${shift.day_end}`);
            }
        } else {
            // Standard companies (and Al Maraghi Friday): day in day_start/day_end, night in night_start/night_end
            // Purely read times directly from the shift fields, ignoring active_shifts
            if (shift.day_start && shift.day_end && shift.day_start !== '—' && shift.day_end !== '—') {
                parts.push(`D: ${shift.day_start}-${shift.day_end}`);
            }
            if (shift.night_start && shift.night_end && shift.night_start !== '—' && shift.night_end !== '—') {
                parts.push(`N: ${shift.night_start}-${shift.night_end}`);
            }
        }
        
        return parts.length > 0 ? parts.join(' | ') : '—';
    };

    const getShiftForDay = (attendanceId, weekLabel, isFriday) => {
        // Friday has priority - use Friday shifts if available
        if (isFriday && fridayShifts[attendanceId]) {
            return fridayShifts[attendanceId];
        }
        // Otherwise use week pattern
        const shifts = weekLabel === 'W1' ? week1Shifts : week2Shifts;
        return shifts[attendanceId];
    };

    // Group days by month for better display
    const daysByMonth = useMemo(() => {
        const grouped = {};
        calendarDays.forEach(day => {
            const monthKey = `${day.date.getFullYear()}-${day.month}`;
            if (!grouped[monthKey]) {
                grouped[monthKey] = {
                    monthName: day.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                    days: []
                };
            }
            grouped[monthKey].days.push(day);
        });
        return Object.values(grouped);
    }, [calendarDays]);

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        Ramadan Calendar: {schedule.company} {schedule.year}
                    </DialogTitle>
                    <p className="text-sm text-slate-500 mt-1">
                        {new Date(schedule.ramadan_start_date).toLocaleDateString('en-GB')} - {new Date(schedule.ramadan_end_date).toLocaleDateString('en-GB')}
                    </p>
                </DialogHeader>

                {/* Filters */}
                <div className="flex gap-3 items-center flex-wrap py-3 border-b">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="Search by name or ID..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="pl-9"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    <Select value={departmentFilter} onValueChange={(val) => { setDepartmentFilter(val); setCurrentPage(1); }}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Department" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Departments</SelectItem>
                            {departments.map(dept => (
                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="text-sm text-slate-600">
                        {filteredEmployees.length} employees | Page {currentPage} of {totalPages || 1}
                    </div>
                </div>

                {/* Calendar Grid - Scrollable */}
                <div className="flex-1 overflow-auto">
                    {paginatedEmployees.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No employees found with shift data.
                        </div>
                    ) : (
                        <div className="space-y-4 pb-4">
                            {paginatedEmployees.map(emp => (
                                <Card key={emp.id} className="border">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-3 pb-2 border-b">
                                            <div>
                                                <p className="font-medium text-slate-900">{emp.name}</p>
                                                <p className="text-xs text-slate-500">ID: {emp.attendance_id} | {emp.department}</p>
                                            </div>
                                        </div>
                                        
                                        {/* Calendar for this employee */}
                                        <div className="space-y-3">
                                            {daysByMonth.map((monthGroup, idx) => (
                                                <div key={idx}>
                                                    <p className="text-xs font-medium text-slate-700 mb-1.5">{monthGroup.monthName}</p>
                                                    <div className="grid grid-cols-7 gap-1">
                                                        {monthGroup.days.map((day, dayIdx) => {
                                                            const shift = getShiftForDay(emp.attendance_id, day.weekLabel, day.isFriday);
                                                            const shiftText = formatShift(shift, day.isFriday);
                                                            
                                                            return (
                                                                <div
                                                                    key={dayIdx}
                                                                    className={`p-1.5 text-center rounded border text-xs ${
                                                                        day.isSunday 
                                                                            ? 'bg-slate-100 text-slate-500 border-slate-300' 
                                                                            : day.isFriday 
                                                                            ? 'bg-green-50 border-green-300'
                                                                            : 'bg-white border-slate-200'
                                                                    }`}
                                                                >
                                                                    <div className="font-medium text-slate-700">{day.day}</div>
                                                                    <div className={`text-[10px] mt-0.5 ${
                                                                        day.isSunday 
                                                                            ? 'text-slate-500'
                                                                            : day.isFriday 
                                                                            ? 'text-green-700 font-medium'
                                                                            : day.weekLabel === 'W1' 
                                                                            ? 'text-purple-600' 
                                                                            : 'text-indigo-600'
                                                                    }`}>
                                                                        {day.isSunday ? 'Holiday' : day.isFriday ? 'Friday' : day.weekLabel}
                                                                    </div>
                                                                    {!day.isSunday && (
                                                                        <div className="text-[10px] text-slate-600 mt-1 leading-tight break-words">
                                                                            {shiftText}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-3 border-t">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous
                        </Button>
                        <div className="text-sm text-slate-600">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredEmployees.length)} of {filteredEmployees.length}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                        >
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}