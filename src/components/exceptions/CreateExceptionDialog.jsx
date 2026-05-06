import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import ExceptionForm from './ExceptionForm';
import { getFilteredExceptionTypes } from '@/lib/exception-types';

export default function CreateExceptionDialog({ open, onClose, project, employees, isAdmin, isSupervisor, canEditAllowedMinutes }) {
    const [nlpText, setNlpText] = useState('');
    const [nlpParsing, setNlpParsing] = useState(false);
    const [formData, setFormData] = useState({
        attendance_id: '',
        date_from: '',
        date_to: '',
        type: 'PUBLIC_HOLIDAY',
        new_am_start: '',
        new_am_end: '',
        new_pm_start: '',
        new_pm_end: '',
        early_checkout_minutes: '',
        allowed_minutes: '',
        allowed_minutes_type: 'both',
        details: '',
        include_friday: false,
        other_minutes: '',
        punch_to_skip: 'AM_PUNCH_IN',
        half_day_target: 'AM',
        target_punch: 'AM_START',
        new_weekly_off: '',
        working_day_override: '',
        salary_leave_days: ''
    });

    const queryClient = useQueryClient();

    const selectedEmployeeAttId = formData.attendance_id && formData.attendance_id !== 'ALL' ? formData.attendance_id : null;
    const { data: employeeShifts = [] } = useQuery({
        queryKey: ['shiftsForEmployee', project.id, selectedEmployeeAttId],
        queryFn: () => base44.entities.ShiftTiming.filter({ project_id: project.id, attendance_id: selectedEmployeeAttId }),
        enabled: !!selectedEmployeeAttId && formData.type === 'SKIP_PUNCH',
    });
    const selectedEmployeeIsSingleShift = employeeShifts.length > 0
        ? (employeeShifts[0].is_single_shift === true || !employeeShifts[0].am_end || !employeeShifts[0].pm_start ||
           String(employeeShifts[0].am_end).trim() === '' || String(employeeShifts[0].pm_start).trim() === '' ||
           employeeShifts[0].am_end === '-' || employeeShifts[0].pm_start === '-')
        : null;

    const createMutation = useMutation({
        mutationFn: async (data) => {
            const exceptionData = {
                ...data,
                project_id: project.id,
                approval_status: 'approved',
                use_in_analysis: true
            };
            return await base44.entities.Exception.create(exceptionData);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exceptions', project.id] });
            toast.success('Exception added successfully');
            onClose();
            resetForm();
        },
        onError: (error) => {
            toast.error('Failed to add exception: ' + (error.message || 'Unknown error'));
        }
    });

    const resetForm = () => {
        setFormData({
            attendance_id: '', date_from: '', date_to: '', type: 'PUBLIC_HOLIDAY',
            new_am_start: '', new_am_end: '', new_pm_start: '', new_pm_end: '',
            early_checkout_minutes: '', details: '', include_friday: false,
            other_minutes: '', allowed_minutes: '', allowed_minutes_type: 'both',
            punch_to_skip: 'AM_PUNCH_IN', half_day_target: 'AM', target_punch: 'AM_START',
            new_weekly_off: '', working_day_override: '', salary_leave_days: ''
        });
        setNlpText('');
    };

    const handleNlpParse = async () => {
        if (!nlpText.trim()) {
            toast.error('Please enter some text to parse');
            return;
        }
        setNlpParsing(true);
        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `Parse this exception request into structured data. Return ONLY valid JSON, no other text.

Project date range: ${project.date_from} to ${project.date_to}
Available employees: ${employees.map(e => `${e.attendance_id} (${e.name})`).join(', ')}

Exception types:
${getFilteredExceptionTypes('general', true).map(t => `- ${t.value}: ${t.label}`).join('\n')}

User request: "${nlpText}"

Return JSON:
{
    "attendance_id": "employee ID or 'ALL' for company-wide",
    "date_from": "YYYY-MM-DD",
    "date_to": "YYYY-MM-DD",
    "type": "one of the types above",
    "details": "brief description",
    "new_am_start": "if SHIFT_OVERRIDE: HH:MM",
    "new_am_end": "if SHIFT_OVERRIDE: HH:MM",
    "new_pm_start": "if SHIFT_OVERRIDE: HH:MM",
    "new_pm_end": "if SHIFT_OVERRIDE: HH:MM",
    "allowed_minutes": "if ALLOWED_MINUTES: number",
    "allowed_minutes_type": "if ALLOWED_MINUTES: 'late'/'early'/'both'",
    "salary_leave_days": "if ANNUAL_LEAVE: number"
}

Only include relevant fields. Match employee names/IDs intelligently.`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        attendance_id: { type: "string" },
                        date_from: { type: "string" },
                        date_to: { type: "string" },
                        type: { type: "string" },
                        details: { type: "string" },
                        new_am_start: { type: "string" },
                        new_am_end: { type: "string" },
                        new_pm_start: { type: "string" },
                        new_pm_end: { type: "string" },
                        allowed_minutes: { type: "number" },
                        allowed_minutes_type: { type: "string" },
                        salary_leave_days: { type: "string" }
                    },
                    required: ["type"]
                }
            });

            const parsed = response;
            setFormData({
                attendance_id: parsed.attendance_id || '',
                date_from: parsed.date_from || '',
                date_to: parsed.date_to || parsed.date_from || '',
                type: parsed.type || 'PUBLIC_HOLIDAY',
                new_am_start: parsed.new_am_start || '',
                new_am_end: parsed.new_am_end || '',
                new_pm_start: parsed.new_pm_start || '',
                new_pm_end: parsed.new_pm_end || '',
                early_checkout_minutes: '',
                details: parsed.details || nlpText,
                include_friday: false,
                other_minutes: '',
                allowed_minutes: parsed.allowed_minutes ?? '',
                allowed_minutes_type: parsed.allowed_minutes_type || 'both',
                punch_to_skip: 'AM_PUNCH_IN',
                half_day_target: 'AM',
                target_punch: 'AM_START',
                new_weekly_off: '',
                working_day_override: '',
                salary_leave_days: parsed.salary_leave_days || ''
            });
            setNlpText('');
            toast.success('Form filled from your description! Review and submit.');
        } catch (error) {
            toast.error('Failed to parse: ' + (error.message || 'Unknown error'));
        } finally {
            setNlpParsing(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (formData.type !== 'PUBLIC_HOLIDAY' && formData.type !== 'ALLOWED_MINUTES' && formData.type !== 'SKIP_PUNCH' && formData.type !== 'HALF_DAY_HOLIDAY' && formData.type !== 'SKIP_DOUBLE_DEDUCTION' && !formData.attendance_id) {
            toast.error('Please select an employee');
            return;
        }
        if ((formData.type === 'ALLOWED_MINUTES' || formData.type === 'SKIP_PUNCH' || formData.type === 'HALF_DAY_HOLIDAY' || formData.type === 'SKIP_DOUBLE_DEDUCTION') && !formData.attendance_id) {
            formData.attendance_id = 'ALL';
        }
        if (formData.type !== 'SINGLE_SHIFT' && (!formData.date_from || !formData.date_to)) {
            toast.error('Please fill in date range');
            return;
        }
        
        const submitData = formData.type === 'PUBLIC_HOLIDAY' 
            ? { ...formData, attendance_id: 'ALL' }
            : formData;
        
        const cleanedData = {
            attendance_id: submitData.attendance_id === 'ALL' ? 'ALL' : String(submitData.attendance_id),
            date_from: submitData.type === 'SINGLE_SHIFT' ? project.date_from : submitData.date_from,
            date_to: submitData.type === 'SINGLE_SHIFT' ? project.date_to : submitData.date_to,
            type: submitData.type,
            details: submitData.details || null
        };
        
        if (submitData.type === 'SHIFT_OVERRIDE') {
            cleanedData.new_am_start = submitData.new_am_start || null;
            cleanedData.new_am_end = submitData.new_am_end || null;
            cleanedData.new_pm_start = submitData.new_pm_start || null;
            cleanedData.new_pm_end = submitData.new_pm_end || null;
            cleanedData.include_friday = submitData.include_friday || false;
        }

        if (submitData.other_minutes !== '' && submitData.other_minutes != null) {
            const val = parseInt(submitData.other_minutes);
            if (!isNaN(val)) cleanedData.other_minutes = Math.abs(val);
        } else {
            cleanedData.other_minutes = null;
        }

        if (submitData.type === 'ALLOWED_MINUTES' && (submitData.allowed_minutes !== '' && submitData.allowed_minutes != null)) {
            const val = parseInt(submitData.allowed_minutes);
            if (!isNaN(val)) {
                cleanedData.allowed_minutes = Math.abs(val);
                cleanedData.allowed_minutes_type = submitData.allowed_minutes_type || 'both';
            }
        }

        if (submitData.type === 'SKIP_PUNCH') {
            cleanedData.punch_to_skip = submitData.punch_to_skip;
        }

        if (submitData.type === 'HALF_DAY_HOLIDAY') {
            cleanedData.half_day_target = submitData.half_day_target || 'AM';
            cleanedData.attendance_id = 'ALL';
        }

        if (submitData.type === 'ALLOWED_MINUTES' && (submitData.allowed_minutes !== '' && submitData.allowed_minutes != null)) {
            cleanedData.target_punch = submitData.target_punch || null;
        }

        if (submitData.type === 'ANNUAL_LEAVE' && submitData.salary_leave_days !== '' && submitData.salary_leave_days !== null && submitData.salary_leave_days !== undefined) {
            const salaryLeaveDays = Number(submitData.salary_leave_days);
            if (Number.isFinite(salaryLeaveDays) && salaryLeaveDays >= 0) {
                cleanedData.salary_leave_days = salaryLeaveDays;
            }
        }

        if (submitData.type === 'DAY_SWAP') {
            if (!submitData.new_weekly_off || !submitData.working_day_override) {
                toast.error('Please select both new weekly off and working day');
                return;
            }
            if (submitData.new_weekly_off === submitData.working_day_override) {
                toast.error('New weekly off and working day cannot be the same');
                return;
            }
            cleanedData.new_weekly_off = submitData.new_weekly_off;
            cleanedData.working_day_override = submitData.working_day_override;
        }

        createMutation.mutate(cleanedData);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add New Exception</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    {/* Quick Entry with NLP */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-200">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            <Label className="font-medium text-indigo-900">Quick Entry (Optional)</Label>
                        </div>
                        <p className="text-xs text-slate-600 mb-3">Describe in natural language and we'll fill the form below</p>
                        <div className="flex gap-2">
                            <Input
                                className="border-slate-200 focus:ring-indigo-100 flex-1 bg-white"
                                placeholder="e.g., Mark Ahmed as annual leave from Jan 15-20"
                                value={nlpText}
                                onChange={(e) => setNlpText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !nlpParsing) { e.preventDefault(); handleNlpParse(); } }}
                                disabled={nlpParsing}
                            />
                            <Button type="button" onClick={handleNlpParse} disabled={nlpParsing || !nlpText.trim()} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                                {nlpParsing ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />Parsing...</> : <><Sparkles className="w-4 h-4 mr-2" />Fill Form</>}
                            </Button>
                        </div>
                    </div>

                    <ExceptionForm
                        formData={formData}
                        setFormData={setFormData}
                        employees={employees}
                        project={project}
                        isAdmin={isAdmin}
                        isSupervisor={isSupervisor}
                        canEditAllowedMinutes={canEditAllowedMinutes}
                        mode="create"
                        selectedEmployeeIsSingleShift={selectedEmployeeIsSingleShift}
                    />

                    <DialogFooter className="flex gap-3 pt-4 border-t">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" disabled={createMutation.isPending || formData.type === 'ANNUAL_LEAVE'}>
                            {createMutation.isPending ? 'Adding...' : 'Add Exception'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
