import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Clock } from 'lucide-react';
import SortableTableHead from '../ui/SortableTableHead';
import TablePagination from '../ui/TablePagination';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';

export default function ShiftTable({ 
    shifts, 
    employees, 
    selectedShifts, 
    onSelectShift, 
    onSelectAll, 
    onEdit, 
    onDelete, 
    sort, 
    onSort,
    currentPage,
    rowsPerPage,
    onPageChange,
    onRowsPerPageChange,
    company,
    formatTime
}) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return (
        <div className="space-y-4">
            <div className="border rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-200/60 bg-white">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 border-b border-slate-200/60">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="w-12 px-4 text-center">
                                    <Checkbox
                                        checked={selectedShifts.length === shifts.length && shifts.length > 0}
                                        onCheckedChange={onSelectAll}
                                        className="border-slate-300 data-[state=checked]:bg-indigo-600 shadow-sm"
                                    />
                                </TableHead>
                                <TableHead className="w-24 text-slate-500 font-medium">Record ID</TableHead>
                                <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={onSort} className="text-slate-900 font-semibold">
                                    Emp ID
                                </SortableTableHead>
                                <SortableTableHead sortKey="name" currentSort={sort} onSort={onSort} className="text-slate-900 font-semibold">
                                    Name
                                </SortableTableHead>
                                <TableHead className="text-slate-500 font-medium">Dept</TableHead>
                                {company === 'Naser Mohsin Auto Parts' && (
                                    <TableHead className="text-slate-500 font-medium">Weekly Off</TableHead>
                                )}
                                <TableHead className="text-slate-500 font-medium">Configuration</TableHead>
                                <TableHead className="text-slate-500 font-medium">Timing</TableHead>
                                <TableHead className="text-slate-500 font-medium">Days</TableHead>
                                <TableHead className="text-right px-6 text-slate-500 font-medium">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shifts.map((shift) => {
                                const employee = employees.find(e => String(e.attendance_id) === String(shift.attendance_id));
                                
                                let applicableDays = [];
                                try {
                                    applicableDays = JSON.parse(shift.applicable_days || '[]');
                                } catch {
                                    applicableDays = shift.applicable_days ? [shift.applicable_days] : [];
                                }

                                const isRamadan = shift.applicable_days?.includes('Ramadan');

                                return (
                                    <TableRow key={shift.id} className="hover:bg-indigo-50/30 transition-colors duration-200 border-b border-slate-100 last:border-0 group">
                                        <TableCell className="px-4 text-center">
                                            <Checkbox
                                                checked={selectedShifts.some(s => s.id === shift.id)}
                                                onCheckedChange={(checked) => onSelectShift(shift, checked)}
                                                className="border-slate-300 shadow-sm"
                                            />
                                        </TableCell>
                                        <TableCell className="text-[10px] text-slate-400 font-mono">
                                            {shift.id.substring(0, 8)}
                                        </TableCell>
                                        <TableCell className="font-bold text-slate-900">{shift.attendance_id}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-slate-700">{employee?.name || '-'}</span>
                                                <span className="text-[10px] text-slate-400">{employee?.id?.substring(0, 8)}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-slate-500 text-sm">{employee?.department || '-'}</span>
                                        </TableCell>
                                        {company === 'Naser Mohsin Auto Parts' && (
                                            <TableCell>
                                                <span className="text-slate-500 text-sm">{employee?.weekly_off || 'Sunday'}</span>
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            <div className="flex gap-1">
                                                {isRamadan ? (
                                                    <ShiftBadge type="ramadan">
                                                        {shift.applicable_days.replace('Ramadan ', '')}
                                                    </ShiftBadge>
                                                ) : shift.is_single_shift ? (
                                                    <ShiftBadge type="single">SINGLE</ShiftBadge>
                                                ) : (
                                                    <ShiftBadge type="regular">REGULAR</ShiftBadge>
                                                )}
                                                {shift.is_friday_shift && <ShiftBadge type="friday">FRI</ShiftBadge>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                {shift.is_single_shift ? (
                                                    <div className="flex items-center gap-1.5 text-indigo-700 font-bold">
                                                        <Clock className="w-3 h-3 text-indigo-400" />
                                                        <span>{formatTime(shift.am_start)}</span>
                                                        <span className="text-indigo-300">→</span>
                                                        <span>{formatTime(shift.pm_end)}</span>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-0.5">
                                                        <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                                                            <div className="w-1 h-1 rounded-full bg-indigo-400" />
                                                            <span>{formatTime(shift.am_start)} - {formatTime(shift.am_end)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-slate-700 font-medium text-xs">
                                                            <div className="w-1 h-1 rounded-full bg-purple-400" />
                                                            <span>{formatTime(shift.pm_start)} - {formatTime(shift.pm_end)}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-0.5">
                                                {shift.date ? (
                                                    <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase tracking-tighter">
                                                        {formatInUAE(parseDateInUAE(shift.date), 'dd MMM')}
                                                    </span>
                                                ) : isRamadan ? (
                                                     <span className="text-[10px] font-medium text-purple-600">Dynamic</span>
                                                ) : (
                                                    days.map(d => (
                                                        <DayBadge key={d} day={d} active={applicableDays.includes(d)} />
                                                    ))
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right px-6">
                                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => onEdit(shift)}
                                                    className="h-8 w-8 p-0 hover:bg-indigo-50 hover:text-indigo-600"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => onDelete(shift)}
                                                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            </div>
            {shifts.length > 0 && (
                <TablePagination
                    totalItems={shifts.length}
                    currentPage={currentPage}
                    rowsPerPage={rowsPerPage}
                    onPageChange={onPageChange}
                    onRowsPerPageChange={onRowsPerPageChange}
                />
            )}
        </div>
    );
}
