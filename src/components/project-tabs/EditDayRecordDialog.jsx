import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function EditDayRecordDialog({ open, onClose, dayRecord, project, attendanceId }) {
    const [formData, setFormData] = useState({
        custom_status: '',
        custom_late_minutes: '',
        custom_early_minutes: '',
        selected_punches: [],
        notes: ''
    });
    const queryClient = useQueryClient();

    // Fetch all punches for this day
    const { data: allPunches = [] } = useQuery({
        queryKey: ['dayPunches', project.id, attendanceId, dayRecord?.date],
        queryFn: async () => {
            if (!dayRecord) return [];
            const [day, month, year] = dayRecord.date.split('/');
            const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const punches = await base44.entities.Punch.filter({ 
                project_id: project.id, 
                attendance_id: attendanceId,
                punch_date: dateStr
            });
            return punches.sort((a, b) => {
                const timeA = new Date(a.timestamp_raw).getTime();
                const timeB = new Date(b.timestamp_raw).getTime();
                return timeA - timeB;
            });
        },
        enabled: open && !!dayRecord
    });

    // Fetch existing day-level edit if any
    const { data: existingEdit } = useQuery({
        queryKey: ['dayEdit', project.id, attendanceId, dayRecord?.date],
        queryFn: async () => {
            if (!dayRecord) return null;
            const [day, month, year] = dayRecord.date.split('/');
            const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            const edits = await base44.entities.DayLevelEdit.filter({
                project_id: project.id,
                attendance_id: attendanceId,
                date: dateStr
            });
            return edits.length > 0 ? edits[0] : null;
        },
        enabled: open && !!dayRecord
    });

    useEffect(() => {
        if (existingEdit) {
            setFormData({
                custom_status: existingEdit.custom_status || '',
                custom_late_minutes: existingEdit.custom_late_minutes || '',
                custom_early_minutes: existingEdit.custom_early_minutes || '',
                selected_punches: existingEdit.selected_punch_ids ? existingEdit.selected_punch_ids.split(',') : [],
                notes: existingEdit.notes || ''
            });
        } else if (dayRecord) {
            setFormData({
                custom_status: '',
                custom_late_minutes: '',
                custom_early_minutes: '',
                selected_punches: [],
                notes: ''
            });
        }
    }, [existingEdit, dayRecord]);

    // Get current report run ID
    const { data: reportRuns = [] } = useQuery({
        queryKey: ['reportRuns', project.id],
        queryFn: () => base44.entities.ReportRun.filter({ project_id: project.id }, '-created_date'),
        enabled: open
    });

    const currentReportRunId = reportRuns.length > 0 ? reportRuns[0].id : null;

    // Fetch the current analysis result for this employee
    const { data: analysisResult } = useQuery({
        queryKey: ['analysisResult', project.id, attendanceId, currentReportRunId],
        queryFn: async () => {
            if (!currentReportRunId) return null;
            const results = await base44.entities.AnalysisResult.filter({
                project_id: project.id,
                attendance_id: attendanceId,
                report_run_id: currentReportRunId
            });
            return results.length > 0 ? results[0] : null;
        },
        enabled: open && !!currentReportRunId && !!attendanceId
    });

    const saveEditMutation = useMutation({
        mutationFn: async (data) => {
            // Save the day-level edit
            let dayEdit;
            if (existingEdit) {
                dayEdit = await base44.entities.DayLevelEdit.update(existingEdit.id, data);
            } else {
                dayEdit = await base44.entities.DayLevelEdit.create(data);
            }

            // Recalculate and update the AnalysisResult
            if (analysisResult && currentReportRunId) {
                // Fetch all day edits for this employee
                const allEdits = await base44.entities.DayLevelEdit.filter({
                    project_id: project.id,
                    attendance_id: attendanceId
                });

                // Recalculate totals based on all edits
                let totalLate = 0;
                let totalEarly = 0;
                let presentCount = analysisResult.present_days;
                let halfCount = analysisResult.half_absence_count;
                let fullAbsenceCount = analysisResult.full_absence_count;

                // Apply edits to totals
                allEdits.forEach(edit => {
                    if (edit.custom_late_minutes !== null && edit.custom_late_minutes !== undefined) {
                        totalLate += edit.custom_late_minutes;
                    }
                    if (edit.custom_early_minutes !== null && edit.custom_early_minutes !== undefined) {
                        totalEarly += edit.custom_early_minutes;
                    }
                });

                await base44.entities.AnalysisResult.update(analysisResult.id, {
                    late_minutes: totalLate,
                    early_checkout_minutes: totalEarly
                });
            }

            return dayEdit;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['dayEdit']);
            queryClient.invalidateQueries(['results', project.id]);
            queryClient.invalidateQueries(['analysisResult']);
            toast.success('Day record updated and report refreshed');
            onClose();
        },
        onError: (error) => {
            toast.error('Failed to update day record: ' + error.message);
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!dayRecord) return;

        // Parse DD/MM/YYYY format to YYYY-MM-DD
        const [day, month, year] = dayRecord.date.split('/');
        const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

        const editData = {
            project_id: project.id,
            attendance_id: attendanceId,
            date: dateStr,
            notes: formData.notes
        };

        // Only include fields that have values
        if (formData.custom_status) {
            editData.custom_status = formData.custom_status;
        }
        if (formData.custom_late_minutes !== '') {
            editData.custom_late_minutes = parseInt(formData.custom_late_minutes) || 0;
        }
        if (formData.custom_early_minutes !== '') {
            editData.custom_early_minutes = parseInt(formData.custom_early_minutes) || 0;
        }
        if (formData.selected_punches.length > 0) {
            editData.selected_punch_ids = formData.selected_punches.join(',');
        }

        saveEditMutation.mutate(editData);
    };

    const togglePunchSelection = (punchId) => {
        setFormData(prev => ({
            ...prev,
            selected_punches: prev.selected_punches.includes(punchId)
                ? prev.selected_punches.filter(id => id !== punchId)
                : [...prev.selected_punches, punchId]
        }));
    };

    if (!dayRecord) return null;

    const hasExtraPunches = allPunches.length > 4;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Modify Day Record: {dayRecord.date}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                    {/* Current Calculated Values */}
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                        <h4 className="font-semibold text-slate-900 mb-2">Current Calculated Values</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-slate-600">Status:</span>
                                <span className="ml-2 font-medium">{dayRecord.status}</span>
                            </div>
                            <div>
                                <span className="text-slate-600">Punches:</span>
                                <span className="ml-2 font-medium">{dayRecord.punches}</span>
                            </div>
                            <div>
                                <span className="text-slate-600">Late Minutes:</span>
                                <span className="ml-2 font-medium">{dayRecord.late || 0}</span>
                            </div>
                            <div>
                                <span className="text-slate-600">Early Minutes:</span>
                                <span className="ml-2 font-medium">{dayRecord.early || 0}</span>
                            </div>
                        </div>
                    </div>

                    {/* Custom Edits */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-slate-900">Custom Overrides</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Override Status</Label>
                                <Select
                                    value={formData.custom_status}
                                    onValueChange={(value) => setFormData({ ...formData, custom_status: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="No override" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={null}>No override</SelectItem>
                                        <SelectItem value="PRESENT">Force Present</SelectItem>
                                        <SelectItem value="HALF">Force Half Day</SelectItem>
                                        <SelectItem value="ABSENT">Force Absent</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Custom Late Minutes</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={formData.custom_late_minutes}
                                    onChange={(e) => setFormData({ ...formData, custom_late_minutes: e.target.value })}
                                    placeholder="Leave empty to use calculated"
                                />
                            </div>
                            <div>
                                <Label>Custom Early Checkout Minutes</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={formData.custom_early_minutes}
                                    onChange={(e) => setFormData({ ...formData, custom_early_minutes: e.target.value })}
                                    placeholder="Leave empty to use calculated"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Punch Selection for Extra Punches */}
                    {hasExtraPunches && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold text-slate-900">Select Punches to Use</h4>
                                <span className="text-sm text-amber-600">
                                    {allPunches.length} punches detected (expected: 4)
                                </span>
                            </div>
                            <p className="text-sm text-slate-600">
                                Select which punch records should be used for analysis. System will enforce shift structure based on your selection.
                            </p>
                            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {allPunches.map((punch, idx) => (
                                    <div key={punch.id} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                                        <Checkbox
                                            checked={formData.selected_punches.includes(punch.id)}
                                            onCheckedChange={() => togglePunchSelection(punch.id)}
                                        />
                                        <div className="flex-1">
                                            <span className="text-sm font-medium text-slate-900">
                                                Punch #{idx + 1}
                                            </span>
                                            <span className="text-sm text-slate-600 ml-3">
                                                {punch.timestamp_raw}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {formData.selected_punches.length > 0 && (
                                <p className="text-xs text-indigo-600">
                                    {formData.selected_punches.length} punch(es) selected. System will apply shift logic to determine morning/evening punches.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <Label>Notes/Reason for Edit</Label>
                        <Input
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Explain why this day was manually edited"
                        />
                    </div>

                    {/* Info Notice */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-800">
                            <strong>Note:</strong> Changes will be saved to this specific day and will immediately update the current report.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <Button 
                            type="submit" 
                            className="bg-indigo-600 hover:bg-indigo-700" 
                            disabled={saveEditMutation.isPending}
                        >
                            {saveEditMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}