import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Save, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Breadcrumb from '../components/ui/Breadcrumb';

const DEFAULT_RULES = {
    company_settings: {
        companies: ['Al Maraghi Auto Repairs', 'Al Maraghi Automotive']
    },
    date_rules: {
        holidays: ['Sunday'],
        always_mark_first_date_abnormal: false
    },
    timestamp_rules: {
        timestamp_format: 'DD/MM/YYYY HH:MM AM/PM',
        treat_duplicate_timestamps_as_valid: true
    },
    shift_rules: {
        friday_uses_friday_shift: true,
        fallback_to_general_shift_if_missing: true
    },
    punch_filtering: {
        enable_multi_punch_detection: true,
        cluster_window_minutes: 10
    },
    attendance_calculation: {
        presence_rule: 'at_least_one_punch',
        late_minutes_rule: 'first_punch_minus_shift_start',
        half_day_rule: 'punch_count_or_duration',
        full_absence_rule: 'no_punch'
    },
    grace_minutes: {
        Admin: 15,
        Operations: 15,
        'Front Office': 15,
        Housekeeping: 15
    },
    abnormality_rules: {
        detect_missing_punches: true,
        detect_extra_punches: true
    },
    report_rules: {
        show_notes: true,
        notes_only_dates_no_reason: true
    }
};

export default function RulesSettings() {
    const [rules, setRules] = useState(DEFAULT_RULES);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // Check page access
    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: permissions = [] } = useQuery({
        queryKey: ['pagePermissions'],
        queryFn: () => base44.entities.PagePermission.list(),
        enabled: !!currentUser
    });

    useEffect(() => {
        if (currentUser && permissions.length > 0) {
            const permission = permissions.find(p => p.page_name === 'RulesSettings');
            if (permission) {
                const allowedRoles = permission.allowed_roles.split(',').map(r => r.trim());
                if (!allowedRoles.includes(currentUser.role)) {
                    toast.error('Access denied.');
                    navigate(createPageUrl('Dashboard'));
                }
            }
        }
    }, [currentUser, permissions, navigate]);

    const { data: rulesData, isLoading } = useQuery({
        queryKey: ['rules'],
        queryFn: async () => {
            const rulesList = await base44.entities.AttendanceRules.list();
            if (rulesList.length > 0) {
                return rulesList[0];
            }
            return null;
        }
    });

    useEffect(() => {
        if (rulesData && rulesData.rules_json) {
            try {
                const parsedRules = JSON.parse(rulesData.rules_json);
                setRules(parsedRules);
            } catch (e) {
                console.error('Failed to parse rules JSON:', e);
            }
        }
    }, [rulesData]);

    const saveMutation = useMutation({
        mutationFn: async (rulesObj) => {
            const user = await base44.auth.me();
            const rulesJson = JSON.stringify(rulesObj, null, 2);
            
            if (rulesData) {
                return base44.entities.AttendanceRules.update(rulesData.id, {
                    rules_json: rulesJson,
                    updated_by: user.email
                });
            } else {
                return base44.entities.AttendanceRules.create({
                    rules_json: rulesJson,
                    updated_by: user.email
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['rules']);
            toast.success('Rules saved successfully');
        },
        onError: () => {
            toast.error('Failed to save rules');
        }
    });

    const handleSave = () => {
        saveMutation.mutate(rules);
    };

    const updateRule = (category, key, value) => {
        setRules(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [key]: value
            }
        }));
    };

    if (!currentUser || isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-slate-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Breadcrumb items={[
                { label: 'Settings' },
                { label: 'Rules Settings' }
            ]} />
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Rules Settings</h1>
                    <p className="text-slate-600 mt-1 sm:mt-2 text-sm sm:text-base">Configure global attendance analysis rules</p>
                </div>
                <Button 
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saveMutation.isPending ? 'Saving...' : 'Save Rules'}
                </Button>
            </div>

            {/* Company Settings */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Company Settings
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="companies" className="text-slate-900">Company Names</Label>
                        <Input
                            id="companies"
                            value={rules.company_settings?.companies?.join(', ') || ''}
                            onChange={(e) => updateRule('company_settings', 'companies', e.target.value.split(',').map(c => c.trim()).filter(c => c))}
                            placeholder="e.g. Company A, Company B"
                            className="mt-2 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Comma-separated list of company names for employee dropdown
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Date Rules */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Date Rules
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="holidays" className="text-slate-900">Holidays</Label>
                        <Input
                            id="holidays"
                            value={rules.date_rules?.holidays?.join(', ') || ''}
                            onChange={(e) => updateRule('date_rules', 'holidays', e.target.value.split(',').map(h => h.trim()).filter(h => h))}
                            placeholder="e.g. Sunday, Saturday"
                            className="mt-2 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Days to exclude from working days
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Always Mark First Date as Abnormal</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Automatically flag the first date of every project
                            </p>
                        </div>
                        <Switch
                            checked={rules.date_rules?.always_mark_first_date_abnormal}
                            onCheckedChange={(checked) => updateRule('date_rules', 'always_mark_first_date_abnormal', checked)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Timestamp Rules */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Timestamp Handling
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label className="text-slate-900">Timestamp Format</Label>
                        <Input
                            value={rules.timestamp_rules?.timestamp_format}
                            onChange={(e) => updateRule('timestamp_rules', 'timestamp_format', e.target.value)}
                            className="mt-2 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Fixed format - do not change
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Treat Duplicate Timestamps as Valid</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Keep duplicate punches without removal
                            </p>
                        </div>
                        <Switch
                            checked={rules.timestamp_rules?.treat_duplicate_timestamps_as_valid}
                            onCheckedChange={(checked) => updateRule('timestamp_rules', 'treat_duplicate_timestamps_as_valid', checked)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Shift Rules */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Shift Rules
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Friday Uses Friday Shift</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Apply Friday-specific shifts on Fridays
                            </p>
                        </div>
                        <Switch
                            checked={rules.shift_rules?.friday_uses_friday_shift}
                            onCheckedChange={(checked) => updateRule('shift_rules', 'friday_uses_friday_shift', checked)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Fallback to General Shift if Missing</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Use general shift when specific date shift not found
                            </p>
                        </div>
                        <Switch
                            checked={rules.shift_rules?.fallback_to_general_shift_if_missing}
                            onCheckedChange={(checked) => updateRule('shift_rules', 'fallback_to_general_shift_if_missing', checked)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Punch Filtering */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Multi-Punch Detection
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Enable Multi-Punch Detection</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Filter multiple punches within time windows to get 4 key punches (AM-in, AM-out, PM-in, PM-out)
                            </p>
                        </div>
                        <Switch
                            checked={rules.punch_filtering?.enable_multi_punch_detection ?? true}
                            onCheckedChange={(checked) => updateRule('punch_filtering', 'enable_multi_punch_detection', checked)}
                        />
                    </div>

                    <div>
                        <Label className="text-slate-900">Cluster Window (Minutes)</Label>
                        <Input
                            type="number"
                            value={rules.punch_filtering?.cluster_window_minutes ?? 10}
                            onChange={(e) => updateRule('punch_filtering', 'cluster_window_minutes', parseInt(e.target.value) || 10)}
                            className="mt-2 w-32 bg-white border-slate-200 text-slate-900"
                            min={1}
                            max={60}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Punches within this window are considered part of the same check-in/out event. Default: 10 minutes.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Attendance Calculation */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Attendance Calculation
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label className="text-slate-900">Presence Rule</Label>
                        <Input
                            value={rules.attendance_calculation?.presence_rule}
                            className="mt-2 bg-white border-slate-200 text-slate-900 disabled:opacity-50"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            at_least_one_punch: Any punch marks employee present
                        </p>
                    </div>

                    <div>
                        <Label className="text-slate-900">Late Minutes Calculation</Label>
                        <Input
                            value={rules.attendance_calculation?.late_minutes_rule}
                            className="mt-2 bg-white border-slate-200 text-slate-900 disabled:opacity-50"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            first_punch_minus_shift_start: Calculate lateness from first punch
                        </p>
                    </div>

                    <div>
                        <Label className="text-slate-900">Half Day Detection</Label>
                        <Input
                            value={rules.attendance_calculation?.half_day_rule}
                            className="mt-2 bg-white border-slate-200 text-slate-900 disabled:opacity-50"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            punch_count_or_duration: Less than 2 punches = half day
                        </p>
                    </div>

                    <div>
                        <Label className="text-slate-900">Full Absence Rule</Label>
                        <Input
                            value={rules.attendance_calculation?.full_absence_rule}
                            className="mt-2 bg-white border-slate-200 text-slate-900 disabled:opacity-50"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            no_punch: Zero punches = full absence
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Grace Minutes Rules */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Department Grace Minutes
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        {['Admin', 'Operations', 'Front Office', 'Housekeeping'].map(dept => (
                            <div key={dept} className="space-y-2">
                                <Label className="text-slate-900">{dept}</Label>
                                <div className="relative">
                                    <Input
                                        type="number"
                                        min="0"
                                        value={rules.grace_minutes?.[dept] ?? 15}
                                        onChange={(e) => updateRule('grace_minutes', dept, parseInt(e.target.value) || 0)}
                                        className="pr-12 bg-white border-slate-200 text-slate-900"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                                        min
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Abnormality Rules */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Abnormality Detection
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Detect Missing Punches</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Flag days with fewer punches than expected
                            </p>
                        </div>
                        <Switch
                            checked={rules.abnormality_rules?.detect_missing_punches}
                            onCheckedChange={(checked) => updateRule('abnormality_rules', 'detect_missing_punches', checked)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Detect Extra Punches</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Flag days with more punches than expected
                            </p>
                        </div>
                        <Switch
                            checked={rules.abnormality_rules?.detect_extra_punches}
                            onCheckedChange={(checked) => updateRule('abnormality_rules', 'detect_extra_punches', checked)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Report Rules */}
            <Card className="border-0 bg-white shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Settings className="w-5 h-5 text-indigo-600" />
                        Report Format
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Show Notes Column</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Display notes in report
                            </p>
                        </div>
                        <Switch
                            checked={rules.report_rules?.show_notes}
                            onCheckedChange={(checked) => updateRule('report_rules', 'show_notes', checked)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-slate-900">Notes Only Show Dates (No Reasons)</Label>
                            <p className="text-xs text-slate-500 mt-1">
                                Notes column contains only abnormal dates
                            </p>
                        </div>
                        <Switch
                            checked={rules.report_rules?.notes_only_dates_no_reason}
                            onCheckedChange={(checked) => updateRule('report_rules', 'notes_only_dates_no_reason', checked)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Save Button Bottom */}
            <div className="flex justify-end">
                <Button 
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                    size="lg"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saveMutation.isPending ? 'Saving...' : 'Save All Rules'}
                </Button>
            </div>
        </div>
    );
}