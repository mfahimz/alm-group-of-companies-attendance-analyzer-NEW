import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar as CalendarIcon, Settings, FileText, Edit3 } from 'lucide-react';
import Breadcrumb from '../components/ui/Breadcrumb';
import CalendarCyclesTab from '../components/calendar/CalendarCyclesTab';
import CalendarPayrollPreviewTab from '../components/calendar/CalendarPayrollPreviewTab';
import CalendarAdjustmentsTab from '../components/calendar/CalendarAdjustmentsTab';
import CalendarAdminTab from '../components/calendar/CalendarAdminTab';

export default function Calendar() {
    const [activeTab, setActiveTab] = useState('cycles');

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: settings } = useQuery({
        queryKey: ['calendarSettings'],
        queryFn: async () => {
            const list = await base44.entities.CalendarSettings.list();
            return list[0] || null;
        }
    });

    const isAdmin = currentUser?.role === 'admin';
    const isEnabled = settings?.is_calendar_enabled;

    if (!isEnabled && !isAdmin) {
        return (
            <div className="p-6 lg:p-8">
                <Breadcrumb items={[{ label: 'Calendar Payroll' }]} />
                <Card className="p-12 text-center">
                    <CalendarIcon className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Calendar Payroll System</h2>
                    <p className="text-slate-600">
                        The Calendar payroll system is currently disabled. Please contact your administrator.
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 space-y-6">
            <Breadcrumb items={[{ label: 'Calendar Payroll' }]} />

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Calendar Payroll System</h1>
                    <p className="text-slate-600 mt-1">HRMS-aligned cutoff payroll with month-end assumed present days</p>
                </div>
            </div>

            {!isEnabled && isAdmin && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-800">
                        ⚠️ Calendar system is disabled. Enable it in the Admin tab to start using this feature.
                    </p>
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-4 lg:w-auto">
                    <TabsTrigger value="cycles" className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">Cycles</span>
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span className="hidden sm:inline">Payroll Preview</span>
                    </TabsTrigger>
                    <TabsTrigger value="adjustments" className="flex items-center gap-2">
                        <Edit3 className="w-4 h-4" />
                        <span className="hidden sm:inline">Adjustments</span>
                    </TabsTrigger>
                    {isAdmin && (
                        <TabsTrigger value="admin" className="flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            <span className="hidden sm:inline">Admin</span>
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="cycles">
                    <CalendarCyclesTab />
                </TabsContent>

                <TabsContent value="preview">
                    <CalendarPayrollPreviewTab />
                </TabsContent>

                <TabsContent value="adjustments">
                    <CalendarAdjustmentsTab />
                </TabsContent>

                {isAdmin && (
                    <TabsContent value="admin">
                        <CalendarAdminTab />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}