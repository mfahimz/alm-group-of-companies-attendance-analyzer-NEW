import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function WorkingDaysCalendar() {
    const queryClient = useQueryClient();
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedCompany, setSelectedCompany] = useState('Al Maraghi Motors');

    const { data: calendars = [], isLoading } = useQuery({
        queryKey: ['workingDaysCalendar', selectedCompany, selectedYear],
        queryFn: () => base44.entities.WorkingDaysCalendar.filter({ company: selectedCompany, year: selectedYear }),
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list(),
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.WorkingDaysCalendar.create(data),
        onSuccess: () => queryClient.invalidateQueries(['workingDaysCalendar']),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.WorkingDaysCalendar.update(id, data),
        onSuccess: () => queryClient.invalidateQueries(['workingDaysCalendar']),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.WorkingDaysCalendar.delete(id),
        onSuccess: () => queryClient.invalidateQueries(['workingDaysCalendar']),
    });

    const getCalendarForMonth = (month) => calendars.find(c => c.month === month);

    const handleCreateMonth = (month) => {
        createMutation.mutate({
            company: selectedCompany,
            year: selectedYear,
            month,
            public_holidays: '[]',
            created_by: '',
            created_at: new Date().toISOString(),
        });
    };

    const handleUpdateDates = (cal, field, value) => {
        updateMutation.mutate({ id: cal.id, data: { [field]: value } });
    };

    const handleAddHoliday = (cal) => {
        const holidays = JSON.parse(cal.public_holidays || '[]');
        holidays.push({ date: '', name: '' });
        updateMutation.mutate({ id: cal.id, data: { public_holidays: JSON.stringify(holidays) } });
    };

    const handleHolidayChange = (cal, index, field, value) => {
        const holidays = JSON.parse(cal.public_holidays || '[]');
        holidays[index][field] = value;
        updateMutation.mutate({ id: cal.id, data: { public_holidays: JSON.stringify(holidays) } });
    };

    const handleRemoveHoliday = (cal, index) => {
        const holidays = JSON.parse(cal.public_holidays || '[]');
        holidays.splice(index, 1);
        updateMutation.mutate({ id: cal.id, data: { public_holidays: JSON.stringify(holidays) } });
    };

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Calendar className="w-6 h-6" /> Working Days Calendar
                </h1>
                <div className="flex gap-3 items-center">
                    <select
                        className="border rounded-md px-3 py-2 text-sm"
                        value={selectedCompany}
                        onChange={e => setSelectedCompany(e.target.value)}
                    >
                        {companies.map(c => (
                            <option key={c.id} value={c.company}>{c.company}</option>
                        ))}
                    </select>
                    <select
                        className="border rounded-md px-3 py-2 text-sm"
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                    >
                        {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-slate-500">Loading...</div>
            ) : (
                <div className="grid gap-4">
                    {MONTH_NAMES.map((monthName, idx) => {
                        const month = idx + 1;
                        const cal = getCalendarForMonth(month);
                        const holidays = cal ? JSON.parse(cal.public_holidays || '[]') : [];

                        return (
                            <Card key={month}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base">{monthName} {selectedYear}</CardTitle>
                                        {!cal ? (
                                            <Button size="sm" variant="outline" onClick={() => handleCreateMonth(month)}>
                                                <Plus className="w-4 h-4 mr-1" /> Setup Month
                                            </Button>
                                        ) : (
                                            <Badge variant="secondary">{holidays.length} holiday{holidays.length !== 1 ? 's' : ''}</Badge>
                                        )}
                                    </div>
                                </CardHeader>
                                {cal && (
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label className="text-xs text-slate-500">Period Start</Label>
                                                <Input
                                                    type="date"
                                                    defaultValue={cal.period_date_from || ''}
                                                    onBlur={e => handleUpdateDates(cal, 'period_date_from', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-xs text-slate-500">Period End</Label>
                                                <Input
                                                    type="date"
                                                    defaultValue={cal.period_date_to || ''}
                                                    onBlur={e => handleUpdateDates(cal, 'period_date_to', e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <Label className="text-xs text-slate-500 uppercase tracking-wide">Public Holidays</Label>
                                                <Button size="sm" variant="ghost" onClick={() => handleAddHoliday(cal)}>
                                                    <Plus className="w-3 h-3 mr-1" /> Add
                                                </Button>
                                            </div>
                                            {holidays.length === 0 ? (
                                                <p className="text-xs text-slate-400 italic">No public holidays</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {holidays.map((h, i) => (
                                                        <div key={i} className="flex gap-2 items-center">
                                                            <Input
                                                                type="date"
                                                                className="w-40 text-sm"
                                                                defaultValue={h.date}
                                                                onBlur={e => handleHolidayChange(cal, i, 'date', e.target.value)}
                                                            />
                                                            <Input
                                                                className="flex-1 text-sm"
                                                                placeholder="Holiday name"
                                                                defaultValue={h.name}
                                                                onBlur={e => handleHolidayChange(cal, i, 'name', e.target.value)}
                                                            />
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="text-red-400 hover:text-red-600"
                                                                onClick={() => handleRemoveHoliday(cal, i)}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}