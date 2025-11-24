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

const DEFAULT_RULES = {
    date_rules: {
        special_abnormal_dates: ['30/09/2025'],
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
    attendance_calculation: {
        presence_rule: 'at_least_one_punch',
        late_minutes_rule: 'first_punch_minus_shift_start',
        half_day_rule: 'punch_count_or_duration',
        full_absence_rule: 'no_punch'
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
    const [abnormalDatesInput, setAbnormalDatesInput] = useState('');
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
        if (rulesData) {
            const parsedRules = JSON.parse(rulesData.rules_json);
            setRules(parsedRules);
            setAbnormalDatesInput(parsedRules.date_rules?.special_abnormal_dates?.join(', ') || '');
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
        const updatedRules = {
            ...rules,
            date_rules: {
                ...rules.date_rules,
                special_abnormal_dates: abnormalDatesInput
                    .split(',')
                    .map(d => d.trim())
                    .filter(d => d)
            }
        };
        saveMutation.mutate(updatedRules);
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Rules Settings</h1>
                    <p className="text-slate-600 mt-2">Configure global attendance analysis rules</p>
                </div>
                <Button 
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                >
                    <Save className="w-4 h-4 mr-2" />
                    {saveMutation.isPending ? 'Saving...' : 'Save Rules'}
                </Button>
            </div>

            {/* Date Rules */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Date Rules
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="abnormal-dates">Special Abnormal Dates</Label>
                        <Input
                            id="abnormal-dates"
                            value={abnormalDatesInput}
                            onChange={(e) => setAbnormalDatesInput(e.target.value)}
                            placeholder="e.g. 30/09/2025, 15/10/2025"
                            className="mt-2"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Comma-separated dates in DD/MM/YYYY format
                        </p>
                    </div>

                    <div>
                        <Label htmlFor="holidays">Holidays</Label>
                        <Input
                            id="holidays"
                            value={rules.date_rules?.holidays?.join(', ')}
                            onChange={(e) => updateRule('date_rules', 'holidays', e.target.value.split(',').map(h => h.trim()))}
                            placeholder="e.g. Sunday, Saturday"
                            className="mt-2"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Days to exclude from working days
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Always Mark First Date as Abnormal</Label>
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
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Timestamp Handling
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Timestamp Format</Label>
                        <Input
                            value={rules.timestamp_rules?.timestamp_format}
                            onChange={(e) => updateRule('timestamp_rules', 'timestamp_format', e.target.value)}
                            className="mt-2"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Fixed format - do not change
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Treat Duplicate Timestamps as Valid</Label>
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
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Shift Rules
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Friday Uses Friday Shift</Label>
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
                            <Label>Fallback to General Shift if Missing</Label>
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

            {/* Attendance Calculation */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Attendance Calculation
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label>Presence Rule</Label>
                        <Input
                            value={rules.attendance_calculation?.presence_rule}
                            className="mt-2"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            at_least_one_punch: Any punch marks employee present
                        </p>
                    </div>

                    <div>
                        <Label>Late Minutes Calculation</Label>
                        <Input
                            value={rules.attendance_calculation?.late_minutes_rule}
                            className="mt-2"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            first_punch_minus_shift_start: Calculate lateness from first punch
                        </p>
                    </div>

                    <div>
                        <Label>Half Day Detection</Label>
                        <Input
                            value={rules.attendance_calculation?.half_day_rule}
                            className="mt-2"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            punch_count_or_duration: Less than 2 punches = half day
                        </p>
                    </div>

                    <div>
                        <Label>Full Absence Rule</Label>
                        <Input
                            value={rules.attendance_calculation?.full_absence_rule}
                            className="mt-2"
                            disabled
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            no_punch: Zero punches = full absence
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Abnormality Rules */}
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Abnormality Detection
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Detect Missing Punches</Label>
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
                            <Label>Detect Extra Punches</Label>
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
            <Card className="border-0 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        Report Format
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <Label>Show Notes Column</Label>
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
                            <Label>Notes Only Show Dates (No Reasons)</Label>
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