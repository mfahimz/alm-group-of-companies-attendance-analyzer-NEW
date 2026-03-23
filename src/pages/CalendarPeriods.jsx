import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, Trash2, Calendar, FileText } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

/*
 * Calendar Periods List Page
 * 
 * Part of the new calendar based payroll system.
 * Completely independent from the existing project system.
 * CalendarPeriod reads its initial dates from WorkingDaysCalendar.
 */
export default function CalendarPeriods() {
    usePageTitle('Calendar Periods');
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [selectedCompany, setSelectedCompany] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    
    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const allowedRoles = ['admin', 'ceo'];

    useEffect(() => {
        if (currentUser && !allowedRoles.includes(userRole)) {
            toast.error('Access denied. Calendar Periods are restricted to Admin and CEO.');
            navigate(createPageUrl('Dashboard'));
        }
    }, [currentUser, userRole, navigate]);

    // Fetch Companies
    const { data: companies = [] } = useQuery({
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

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Fetch Calendar Periods
    const { data: periods = [], isLoading } = useQuery({
        queryKey: ['calendarPeriods', selectedCompany, debouncedSearch],
        queryFn: async () => {
            let filter = {};
            if (selectedCompany) {
                filter.company = selectedCompany;
            }
            if (debouncedSearch) {
                filter.name = { $ilike: `%${debouncedSearch}%` };
            }
            return await base44.entities.CalendarPeriod.filter(filter);
        },
        enabled: !!selectedCompany
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.CalendarPeriod.delete(id),
        onSuccess: () => {
            toast.success('Period deleted successfully');
            queryClient.invalidateQueries(['calendarPeriods']);
        },
        onError: (err) => {
            toast.error('Failed to delete period: ' + err.message);
        }
    });

    const handleDelete = (id) => {
        if (window.confirm('Are you sure you want to delete this period?')) {
            deleteMutation.mutate(id);
        }
    };

    if (!currentUser) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500 pb-12">
            <Breadcrumb items={[{ label: 'Calendar Periods' }]} />
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                        Calendar Periods
                    </h1>
                    <p className="text-slate-600 mt-2 text-sm max-w-2xl">
                        Manage payroll calendar periods.
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button 
                        onClick={() => setShowCreateDialog(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-lg hover:shadow-indigo-200 transition-all rounded-xl"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        Create New Period
                    </Button>
                </div>
            </div>

            <Card className="border border-slate-200 shadow-xl rounded-3xl overflow-hidden bg-white">
                <CardHeader className="bg-slate-50 border-b border-slate-100 p-6 flex flex-col md:flex-row gap-4 justify-between">
                    <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
                        <div className="relative flex-1 md:w-64 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-10 bg-white border-slate-200 rounded-xl"
                            />
                        </div>
                        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                            <SelectTrigger className="w-full md:w-[220px] h-10 bg-white border-slate-200 rounded-xl">
                                <SelectValue placeholder="Company" />
                            </SelectTrigger>
                            <SelectContent>
                                {companies.map(c => (
                                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        {isLoading ? (
                            <div className="text-center py-12 text-slate-500">Loading periods...</div>
                        ) : periods.length === 0 ? (
                            <div className="text-center py-16 text-slate-500">
                                <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold text-slate-900 mb-2">No Calendar Periods Found</h3>
                                <p>Get started by creating a new period.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="text-xs uppercase bg-slate-50 text-slate-500 border-b border-slate-100">
                                    <tr>
                                        <th className="px-6 py-4 font-bold">Name</th>
                                        <th className="px-6 py-4 font-bold">Company</th>
                                        <th className="px-6 py-4 font-bold">Period Range</th>
                                        <th className="px-6 py-4 font-bold">Month/Year</th>
                                        <th className="px-6 py-4 font-bold">Status</th>
                                        <th className="px-6 py-4 font-bold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {periods.map(period => (
                                        <tr key={period.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-900">
                                                {period.name}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant="outline" className="text-slate-600 bg-white shadow-sm border-slate-200">
                                                    {period.company}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 font-medium">
                                                {new Date(period.date_from).toLocaleDateString('en-GB')} → {new Date(period.date_to).toLocaleDateString('en-GB')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {period.period_month}/{period.period_year}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge className={`
                                                    ${period.status === 'draft' ? 'bg-amber-100 text-amber-800 border-amber-200' : ''}
                                                    ${period.status === 'analyzed' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
                                                    ${period.status === 'locked' ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : ''}
                                                    ${period.status === 'closed' ? 'bg-green-100 text-green-800 border-green-200' : ''}
                                                `}>
                                                    {period.status || 'draft'}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2 flex justify-end">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => navigate(createPageUrl(`CalendarPeriodDetail?id=${period.id}`))}
                                                    className="font-bold text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-800"
                                                >
                                                    <FileText className="w-4 h-4 mr-2" />
                                                    View detail
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(period.id)}
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </CardContent>
            </Card>

            <CreatePeriodDialog 
                open={showCreateDialog} 
                onOpenChange={setShowCreateDialog} 
                companies={companies}
                defaultCompany={selectedCompany}
            />
        </div>
    );
}

function CreatePeriodDialog({ open, onOpenChange, companies, defaultCompany }) {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        name: '',
        company: defaultCompany,
        date_from: '',
        date_to: '',
        period_month: new Date().getMonth() + 1,
        period_year: new Date().getFullYear(),
        salary_calculation_days: 30,
        ot_calculation_days: 30
    });

    // Auto-fetch WorkingDaysCalendar dates when company, year, and month change
    const { data: workingDaysCalendar } = useQuery({
        queryKey: ['WorkingDaysCalendar', formData.company, formData.period_year, formData.period_month],
        queryFn: async () => {
            const result = await base44.entities.WorkingDaysCalendar.filter({
                company: formData.company,
                year: formData.period_year,
                month: formData.period_month
            });
            return result.length > 0 ? result[0] : null;
        },
        enabled: !!formData.company && !!formData.period_year && !!formData.period_month
    });

    useEffect(() => {
        if (workingDaysCalendar) {
            setFormData(prev => ({
                ...prev,
                date_from: workingDaysCalendar.period_date_from || prev.date_from,
                date_to: workingDaysCalendar.period_date_to || prev.date_to
            }));
        }
    }, [workingDaysCalendar]);

    const mutation = useMutation({
        mutationFn: (data) => base44.entities.CalendarPeriod.create({ ...data, status: 'draft' }),
        onSuccess: () => {
            toast.success('Period created successfully');
            queryClient.invalidateQueries(['calendarPeriods']);
            onOpenChange(false);
            setFormData({
                name: '',
                company: defaultCompany,
                date_from: '',
                date_to: '',
                period_month: new Date().getMonth() + 1,
                period_year: new Date().getFullYear(),
                salary_calculation_days: 30,
                ot_calculation_days: 30
            });
        },
        onError: (err) => {
            toast.error('Failed to create period: ' + err.message);
        }
    });

    const handleSubmit = () => {
        if (!formData.name || !formData.company || !formData.date_from || !formData.date_to) {
            toast.error('Please fill in all required fields');
            return;
        }
        mutation.mutate(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] overflow-visible z-[100]">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-indigo-800">
                        Create New Period
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="font-semibold text-slate-700">Name *</Label>
                            <Input 
                                placeholder="e.g. October 2024 Payroll" 
                                value={formData.name} 
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="bg-slate-50 border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-semibold text-slate-700">Company *</Label>
                            <Select 
                                value={formData.company} 
                                onValueChange={val => setFormData({ ...formData, company: val })}
                            >
                                <SelectTrigger className="bg-slate-50 border-slate-200">
                                    <SelectValue placeholder="Select Company" />
                                </SelectTrigger>
                                <SelectContent className="z-[200]">
                                    {companies.map(c => (
                                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="space-y-2">
                            <Label className="font-semibold text-slate-700">Period Month</Label>
                            <Input 
                                type="number" 
                                min="1" max="12" 
                                value={formData.period_month} 
                                onChange={e => setFormData({ ...formData, period_month: parseInt(e.target.value) })}
                                className="bg-white border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-semibold text-slate-700">Period Year</Label>
                            <Input 
                                type="number" 
                                value={formData.period_year} 
                                onChange={e => setFormData({ ...formData, period_year: parseInt(e.target.value) })}
                                className="bg-white border-slate-200"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="font-semibold text-slate-700 flex items-center gap-2">
                                Date From *
                                {workingDaysCalendar && <Badge variant="secondary" className="text-[10px]">Autofilled</Badge>}
                            </Label>
                            <Input 
                                type="date" 
                                value={formData.date_from} 
                                onChange={e => setFormData({ ...formData, date_from: e.target.value })}
                                className="bg-white border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-semibold text-slate-700 flex items-center gap-2">
                                Date To *
                                {workingDaysCalendar && <Badge variant="secondary" className="text-[10px]">Autofilled</Badge>}
                            </Label>
                            <Input 
                                type="date" 
                                value={formData.date_to} 
                                onChange={e => setFormData({ ...formData, date_to: e.target.value })}
                                className="bg-white border-slate-200"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                        <div className="space-y-2">
                            <Label className="font-semibold text-indigo-900">Salary Divisor (Days)</Label>
                            <Input 
                                type="number" 
                                value={formData.salary_calculation_days} 
                                onChange={e => setFormData({ ...formData, salary_calculation_days: parseInt(e.target.value) })}
                                className="bg-white border-indigo-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-semibold text-indigo-900">OT Divisor (Days)</Label>
                            <Input 
                                type="number" 
                                value={formData.ot_calculation_days} 
                                onChange={e => setFormData({ ...formData, ot_calculation_days: parseInt(e.target.value) })}
                                className="bg-white border-indigo-200"
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter className="mt-6">
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl border-slate-300">
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={mutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 shadow-md rounded-xl">
                        {mutation.isPending ? 'Creating...' : 'Create Period'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}