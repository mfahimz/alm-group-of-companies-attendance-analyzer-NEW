import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, Save, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

/*
 * Working Days Calendar Management
 * 
 * Part of the new calendar based payroll system.
 * Completely independent from the existing project system.
 * 
 * The period_date_from and period_date_to defined here are the
 * authoritative source for CalendarPeriod creation.
 */
export default function WorkingDaysCalendar() {
    usePageTitle('Working Days Calendar');
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [selectedCompany, setSelectedCompany] = useState('');
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);

    const [periodFrom, setPeriodFrom] = useState('');
    const [periodTo, setPeriodTo] = useState('');
    const [publicHolidays, setPublicHolidays] = useState([]);
    const [newHolidayName, setNewHolidayName] = useState('');
    const [newHolidayDate, setNewHolidayDate] = useState('');
    
    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const allowedRoles = ['admin', 'ceo', 'hr_manager', 'supervisor'];

    useEffect(() => {
        if (currentUser && !allowedRoles.includes(userRole)) {
            toast.error('Access denied.');
            navigate(createPageUrl('Dashboard'));
        }
    }, [currentUser, userRole, navigate]);

    // Fetch Companies
    const { data: companies = [], isLoading: loadingCompanies } = useQuery({
        queryKey: ['companies'],
        queryFn: async () => {
            const result = await base44.entities.Company.filter({ active: true });
            return result;
        }
    });

    useEffect(() => {
        if (companies.length > 0 && !selectedCompany) {
            setSelectedCompany(companies[0].name);
        }
    }, [companies, selectedCompany]);

    // Fetch Calendar Record
    const { data: calendarRecord, isLoading: loadingRecord } = useQuery({
        queryKey: ['WorkingDaysCalendar', selectedCompany, currentYear, currentMonth],
        queryFn: async () => {
            if (!selectedCompany) return null;
            const records = await base44.entities.WorkingDaysCalendar.filter({
                company: selectedCompany,
                year: currentYear,
                month: currentMonth
            });
            return records.length > 0 ? records[0] : null;
        },
        enabled: !!selectedCompany
    });

    useEffect(() => {
        if (calendarRecord) {
            setPeriodFrom(calendarRecord.period_date_from || '');
            setPeriodTo(calendarRecord.period_date_to || '');
            
            // Handle parsing public_holidays (JSON array)
            let parsedHolidays = [];
            if (calendarRecord.public_holidays) {
                try {
                    parsedHolidays = typeof calendarRecord.public_holidays === 'string'
                        ? JSON.parse(calendarRecord.public_holidays)
                        : calendarRecord.public_holidays;
                } catch (e) {
                    console.error("Error parsing public_holidays", e);
                }
            }
            setPublicHolidays(parsedHolidays || []);
        } else {
            setPeriodFrom('');
            setPeriodTo('');
            setPublicHolidays([]);
        }
    }, [calendarRecord]);

    const saveMutation = useMutation({
        mutationFn: async (payload) => {
            if (calendarRecord) {
                return await base44.entities.WorkingDaysCalendar.update(calendarRecord.id, payload);
            } else {
                return await base44.entities.WorkingDaysCalendar.create(payload);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['WorkingDaysCalendar', selectedCompany, currentYear, currentMonth]);
            toast.success('Calendar settings saved');
        },
        onError: (err) => {
            toast.error('Failed to save settings: ' + err.message);
        }
    });

    const handleSave = () => {
        if (!selectedCompany) return;
        saveMutation.mutate({
            company: selectedCompany,
            year: currentYear,
            month: currentMonth,
            period_date_from: periodFrom,
            period_date_to: periodTo,
            public_holidays: JSON.stringify(publicHolidays)
        });
    };

    const handleAddHoliday = () => {
        if (!newHolidayName || !newHolidayDate) {
            toast.error('Holiday name and date are required');
            return;
        }

        const newHoliday = {
            id: Date.now().toString(),
            name: newHolidayName,
            date: newHolidayDate
        };
        const updatedHolidays = [...publicHolidays, newHoliday];
        setPublicHolidays(updatedHolidays);
        setNewHolidayName('');
        setNewHolidayDate('');

        // Provide immediate save for adding a holiday
        if (selectedCompany) {
            saveMutation.mutate({
                company: selectedCompany,
                year: currentYear,
                month: currentMonth,
                period_date_from: periodFrom,
                period_date_to: periodTo,
                public_holidays: JSON.stringify(updatedHolidays)
            });
        }
    };

    const handleDeleteHoliday = (holidayId) => {
        const updatedHolidays = publicHolidays.filter(h => h.id !== holidayId);
        setPublicHolidays(updatedHolidays);

        if (selectedCompany) {
            saveMutation.mutate({
                company: selectedCompany,
                year: currentYear,
                month: currentMonth,
                period_date_from: periodFrom,
                period_date_to: periodTo,
                public_holidays: JSON.stringify(updatedHolidays)
            });
        }
    };

    const handlePreviousMonth = () => {
        if (currentMonth === 1) {
            setCurrentMonth(12);
            setCurrentYear(prev => prev - 1);
        } else {
            setCurrentMonth(prev => prev - 1);
        }
    };

    const handleNextMonth = () => {
        if (currentMonth === 12) {
            setCurrentMonth(1);
            setCurrentYear(prev => prev + 1);
        } else {
            setCurrentMonth(prev => prev + 1);
        }
    };

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    if (!currentUser) return null;

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            <Breadcrumb items={[{ label: 'Working Days Calendar' }]} />
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                        Working Days Calendar
                    </h1>
                    <p className="text-slate-600 mt-2 text-sm max-w-2xl">
                        Centralized management for calendar-based payroll public holidays and period cutoffs. 
                        Independently managed from the project system.
                    </p>
                </div>
            </div>

            <Card className="border-0 shadow-lg ring-1 ring-slate-900/5 overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-center py-4">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                            <SelectTrigger className="w-full sm:w-[250px] bg-white border-slate-200">
                                <SelectValue placeholder="Select Company" />
                            </SelectTrigger>
                            <SelectContent>
                                {companies.map(c => (
                                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1">
                        <Button variant="ghost" size="icon" onClick={handlePreviousMonth} className="h-8 w-8 rounded-lg text-slate-600 hover:text-indigo-600">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <div className="w-32 text-center font-bold text-slate-800 text-sm">
                            {monthNames[currentMonth - 1]} {currentYear}
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8 rounded-lg text-slate-600 hover:text-indigo-600">
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-6 space-y-8">
                    {loadingRecord ? (
                        <div className="py-12 text-center text-slate-500 animate-pulse">Loading calendar data...</div>
                    ) : (
                        <>
                            {/* Cutoff Dates Section */}
                            <section className="space-y-4">
                                <div className="flex items-center gap-2 text-indigo-700">
                                    <CalendarIcon className="w-5 h-5" />
                                    <h3 className="font-bold text-lg">Period Cutoff Dates</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 rounded-2xl p-5 border border-slate-100">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Period Start Date</label>
                                        <Input
                                            type="date"
                                            value={periodFrom}
                                            onChange={(e) => setPeriodFrom(e.target.value)}
                                            onBlur={handleSave}
                                            className="bg-white border-slate-200"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700 ml-1">Period End Date</label>
                                        <Input
                                            type="date"
                                            value={periodTo}
                                            onChange={(e) => setPeriodTo(e.target.value)}
                                            onBlur={handleSave}
                                            className="bg-white border-slate-200"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <Button 
                                        onClick={handleSave} 
                                        disabled={saveMutation.isPending}
                                        className="bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Dates
                                    </Button>
                                </div>
                            </section>

                            <hr className="border-slate-100" />

                            {/* Public Holidays Section */}
                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-lg text-slate-900">Public Holidays</h3>
                                    <Badge variant="outline" className="text-slate-500 bg-slate-50">{publicHolidays.length} Holidays</Badge>
                                </div>
                                
                                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 p-4 border-b border-slate-100 bg-slate-50/50">
                                        <Input
                                            placeholder="Holiday Name (e.g. Eid Al Fitr)"
                                            value={newHolidayName}
                                            onChange={(e) => setNewHolidayName(e.target.value)}
                                            className="bg-white"
                                        />
                                        <Input
                                            type="date"
                                            value={newHolidayDate}
                                            onChange={(e) => setNewHolidayDate(e.target.value)}
                                            className="bg-white"
                                        />
                                        <Button onClick={handleAddHoliday} className="md:w-auto w-full bg-slate-900 hover:bg-slate-800">
                                            <Plus className="w-4 h-4 mr-2" />
                                            Add Holiday
                                        </Button>
                                    </div>
                                    
                                    <div className="divide-y divide-slate-100">
                                        {publicHolidays.length === 0 ? (
                                            <div className="p-8 text-center text-slate-500 text-sm">
                                                No public holidays currently added for this month.
                                            </div>
                                        ) : (
                                            publicHolidays.map((holiday) => (
                                                <div key={holiday.id} className="flex justify-between items-center p-4 hover:bg-slate-50/50 transition-colors">
                                                    <div>
                                                        <p className="font-semibold text-slate-900">{holiday.name}</p>
                                                        <p className="text-xs text-slate-500 mt-0.5">{new Date(holiday.date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                                    </div>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => handleDeleteHoliday(holiday.id)}
                                                        className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </section>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// Ensure the Badge component is imported. I didn't add it to imports above. Let me replace the Badge import:
