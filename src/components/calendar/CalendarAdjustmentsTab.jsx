import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

export default function CalendarAdjustmentsTab() {
    const [formData, setFormData] = useState({
        from_payroll_month_label: '',
        to_payroll_month_label: '',
        employee_id: '',
        carry_late_minutes: 0,
        carry_early_minutes: 0,
        carry_ot_minutes: 0,
        carry_lop_days: 0,
        carry_annual_leave_days: 0,
        carry_other_leave_days: 0,
        notes: ''
    });

    const queryClient = useQueryClient();

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            // Check if carryover already exists
            const existing = await base44.entities.CalendarCarryoverBucket.filter({
                from_payroll_month_label: data.from_payroll_month_label,
                to_payroll_month_label: data.to_payroll_month_label,
                employee_id: data.employee_id
            });

            if (existing.length > 0) {
                // Update
                return base44.entities.CalendarCarryoverBucket.update(existing[0].id, data);
            } else {
                // Create
                return base44.entities.CalendarCarryoverBucket.create(data);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['calendarCarryovers']);
            toast.success('Adjustment saved');
            setFormData({
                from_payroll_month_label: '',
                to_payroll_month_label: '',
                employee_id: '',
                carry_late_minutes: 0,
                carry_early_minutes: 0,
                carry_ot_minutes: 0,
                carry_lop_days: 0,
                carry_annual_leave_days: 0,
                carry_other_leave_days: 0,
                notes: ''
            });
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.from_payroll_month_label || !formData.to_payroll_month_label || !formData.employee_id) {
            toast.error('Please fill required fields');
            return;
        }
        saveMutation.mutate(formData);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Calendar Adjustments</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                    Record deductions/leave occurring on assumed present days to defer to next payroll month
                </p>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label>From Payroll Month *</Label>
                            <Input
                                type="text"
                                placeholder="e.g., 2026-01"
                                value={formData.from_payroll_month_label}
                                onChange={(e) => setFormData({ ...formData, from_payroll_month_label: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>To Payroll Month *</Label>
                            <Input
                                type="text"
                                placeholder="e.g., 2026-02"
                                value={formData.to_payroll_month_label}
                                onChange={(e) => setFormData({ ...formData, to_payroll_month_label: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Employee *</Label>
                            <Select value={formData.employee_id} onValueChange={(val) => setFormData({ ...formData, employee_id: val })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map((emp) => (
                                        <SelectItem key={emp.id} value={emp.hrms_id}>
                                            {emp.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <Label>Late Minutes</Label>
                            <Input
                                type="number"
                                value={formData.carry_late_minutes}
                                onChange={(e) => setFormData({ ...formData, carry_late_minutes: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <Label>Early Minutes</Label>
                            <Input
                                type="number"
                                value={formData.carry_early_minutes}
                                onChange={(e) => setFormData({ ...formData, carry_early_minutes: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <Label>OT Minutes</Label>
                            <Input
                                type="number"
                                value={formData.carry_ot_minutes}
                                onChange={(e) => setFormData({ ...formData, carry_ot_minutes: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <Label>LOP Days</Label>
                            <Input
                                type="number"
                                step="0.5"
                                value={formData.carry_lop_days}
                                onChange={(e) => setFormData({ ...formData, carry_lop_days: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <Label>Annual Leave Days</Label>
                            <Input
                                type="number"
                                step="0.5"
                                value={formData.carry_annual_leave_days}
                                onChange={(e) => setFormData({ ...formData, carry_annual_leave_days: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <Label>Other Leave Days</Label>
                            <Input
                                type="number"
                                step="0.5"
                                value={formData.carry_other_leave_days}
                                onChange={(e) => setFormData({ ...formData, carry_other_leave_days: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Notes</Label>
                        <Input
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Optional notes"
                        />
                    </div>

                    <Button type="submit" disabled={saveMutation.isPending}>
                        <Save className="w-4 h-4 mr-2" />
                        Save Adjustment
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}