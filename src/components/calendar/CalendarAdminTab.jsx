import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Database } from 'lucide-react';
import { toast } from 'sonner';

export default function CalendarAdminTab() {
    const [migrationLog, setMigrationLog] = useState(null);
    const queryClient = useQueryClient();

    const { data: settings } = useQuery({
        queryKey: ['calendarSettings'],
        queryFn: async () => {
            const list = await base44.entities.CalendarSettings.list();
            return list[0] || {
                is_calendar_enabled: false,
                timezone: 'Asia/Dubai',
                month_end_assumption_enabled: true,
                month_end_assumed_days_count: 2,
                defer_impacts_on_assumed_days: true,
                lock_edit_requires_admin: true
            };
        }
    });

    const [formData, setFormData] = useState(settings || {});

    React.useEffect(() => {
        if (settings) {
            setFormData(settings);
        }
    }, [settings]);

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            if (settings?.id) {
                return base44.entities.CalendarSettings.update(settings.id, data);
            } else {
                return base44.entities.CalendarSettings.create(data);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['calendarSettings']);
            toast.success('Settings saved');
        }
    });

    const migrationMutation = useMutation({
        mutationFn: () => base44.functions.invoke('runCalendarMigrationMonthlySummariesFromProjects', {}),
        onSuccess: (response) => {
            setMigrationLog(response.data);
            queryClient.invalidateQueries(['calendarEmployeeMonthlySummary']);
            toast.success('Migration completed');
        },
        onError: (error) => {
            toast.error(error.message || 'Migration failed');
        }
    });

    const handleSaveSettings = (e) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Calendar Settings</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveSettings} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label>Enable Calendar System</Label>
                            <Switch
                                checked={formData.is_calendar_enabled}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_calendar_enabled: checked })}
                            />
                        </div>

                        <div>
                            <Label>Timezone</Label>
                            <Input
                                value={formData.timezone}
                                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>Enable Month-End Assumed Present Days</Label>
                            <Switch
                                checked={formData.month_end_assumption_enabled}
                                onCheckedChange={(checked) => setFormData({ ...formData, month_end_assumption_enabled: checked })}
                            />
                        </div>

                        <div>
                            <Label>Assumed Days Count</Label>
                            <Input
                                type="number"
                                value={formData.month_end_assumed_days_count}
                                onChange={(e) => setFormData({ ...formData, month_end_assumed_days_count: parseInt(e.target.value) })}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>Defer Impacts on Assumed Days</Label>
                            <Switch
                                checked={formData.defer_impacts_on_assumed_days}
                                onCheckedChange={(checked) => setFormData({ ...formData, defer_impacts_on_assumed_days: checked })}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>Locked Cycle Edits Require Admin</Label>
                            <Switch
                                checked={formData.lock_edit_requires_admin}
                                onCheckedChange={(checked) => setFormData({ ...formData, lock_edit_requires_admin: checked })}
                            />
                        </div>

                        <Button type="submit" disabled={saveMutation.isPending}>
                            Save Settings
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Data Migration</CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                        Migrate monthly summarized totals from finalized Project payroll reports
                    </p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        onClick={() => migrationMutation.mutate()}
                        disabled={migrationMutation.isPending}
                    >
                        <Database className="w-4 h-4 mr-2" />
                        Run Migration
                    </Button>

                    {migrationLog && (
                        <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                            <h4 className="font-medium text-slate-900">Migration Results</h4>
                            <p className="text-sm text-slate-600">
                                Reports Processed: {migrationLog.reports_processed}
                            </p>
                            <p className="text-sm text-slate-600">
                                Records Created: {migrationLog.migrated_count}
                            </p>
                            {migrationLog.migration_log && migrationLog.migration_log.length > 0 && (
                                <div className="mt-4">
                                    <h5 className="text-sm font-medium text-slate-700 mb-2">Details:</h5>
                                    <div className="max-h-60 overflow-y-auto space-y-2">
                                        {migrationLog.migration_log.map((log, idx) => (
                                            <div key={idx} className="text-xs text-slate-600 bg-white p-2 rounded">
                                                {log.project_name} - {log.payroll_month_label}: {log.employees_migrated || 0} employees
                                                {log.error && <span className="text-red-600 ml-2">Error: {log.error}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}