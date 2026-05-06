import { Search, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function ShiftFilters({ 
    searchTerm, 
    onSearchChange, 
    departmentFilter, 
    onDepartmentChange, 
    shiftTypeFilter, 
    onShiftTypeChange, 
    applicableDayFilter, 
    onApplicableDayChange,
    departments = [],
    onReset
}) {
    const hasActiveFilters = searchTerm || departmentFilter !== 'all' || shiftTypeFilter !== 'all' || applicableDayFilter !== 'all';

    return (
        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-200/60 shadow-inner flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                    placeholder="Search by ID or Name..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-10 h-10 border-slate-200 bg-white focus:ring-indigo-100 transition-all rounded-xl shadow-sm"
                />
            </div>
            
            <div className="flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-tight">Filters</span>
                </div>

                <Select value={departmentFilter} onValueChange={onDepartmentChange}>
                    <SelectTrigger className="border-slate-200 bg-white focus:ring-indigo-100 w-[160px] h-10 rounded-xl shadow-sm">
                        <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {departments.map(dept => (
                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={shiftTypeFilter} onValueChange={onShiftTypeChange}>
                    <SelectTrigger className="border-slate-200 bg-white focus:ring-indigo-100 w-[140px] h-10 rounded-xl shadow-sm">
                        <SelectValue placeholder="Shift Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="single">Single Shift</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={applicableDayFilter} onValueChange={onApplicableDayChange}>
                    <SelectTrigger className="border-slate-200 bg-white focus:ring-indigo-100 w-[130px] h-10 rounded-xl shadow-sm">
                        <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Days</SelectItem>
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                            <SelectItem key={day} value={day}>{day}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {hasActiveFilters && (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={onReset}
                        className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 h-10 px-3 rounded-xl transition-all"
                    >
                        <X className="w-4 h-4 mr-2" />
                        Clear
                    </Button>
                )}
            </div>
        </div>
    );
}
