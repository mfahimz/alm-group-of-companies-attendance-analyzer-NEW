import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { nowInUAE } from '@/components/ui/timezone';

export default function AddExceptionDialog({ 
    open, 
    onClose, 
    employees, 
    projectId,
    deptHeadAssignment,
    onSuccess 
}) {
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedDate, setSelectedDate] = useState(null);
    const [allowedMinutes, setAllowedMinutes] = useState('');
    const [minutesType, setMinutesType] = useState('both');
    const queryClient = useQueryClient();

    const createExceptionMutation = useMutation({
        mutationFn: async () => {
            if (!selectedEmployee || !selectedDate || !allowedMinutes) {
                throw new Error('Please fill in all fields');
            }

            const employee = employees.find(e => e.id === selectedEmployee);
            if (!employee) throw new Error('Employee not found');

            const dateStr = format(selectedDate, 'yyyy-MM-dd');

            await base44.entities.Exception.create({
                project_id: projectId,
                attendance_id: employee.attendance_id.toString(),
                date_from: dateStr,
                date_to: dateStr,
                type: 'ALLOWED_MINUTES',
                allowed_minutes: parseInt(allowedMinutes),
                allowed_minutes_type: minutesType,
                details: `Added by ${deptHeadAssignment.department} Department Head`,
                approval_status: 'approved',
                approved_by_dept_head: deptHeadAssignment.employee_id,
                dept_head_approval_date: new Date().toISOString(),
                use_in_analysis: true
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['exceptions'] });
            toast.success('Exception added successfully');
            setSelectedEmployee('');
            setSelectedDate(null);
            setAllowedMinutes('');
            setMinutesType('both');
            onClose();
            if (onSuccess) onSuccess();
        },
        onError: (error) => {
            toast.error('Failed to add exception: ' + error.message);
        }
    });

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Allowed Minutes Exception</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="employee">Select Employee *</Label>
                        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose employee" />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.map(emp => (
                                    <SelectItem key={emp.id} value={emp.id}>
                                        {emp.name} (ID: {emp.attendance_id})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="date">Date *</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start">
                                    <CalendarIcon className="w-4 h-4 mr-2" />
                                    {selectedDate ? format(selectedDate, 'dd MMM yyyy') : 'Pick a date'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={setSelectedDate}
                                    disabled={(date) => date > nowInUAE()}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div>
                        <Label htmlFor="minutes">Allowed Minutes *</Label>
                        <Input
                            id="minutes"
                            type="number"
                            min="0"
                            max="480"
                            value={allowedMinutes}
                            onChange={(e) => setAllowedMinutes(e.target.value)}
                            placeholder="e.g., 30"
                        />
                        <p className="text-xs text-slate-500 mt-1">Minutes to allow for late/early checkout</p>
                    </div>

                    <div>
                        <Label htmlFor="type">Apply To *</Label>
                        <Select value={minutesType} onValueChange={setMinutesType}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="late">Late Arrival Only</SelectItem>
                                <SelectItem value="early">Early Checkout Only</SelectItem>
                                <SelectItem value="both">Both Late & Early</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={() => createExceptionMutation.mutate()}
                            disabled={createExceptionMutation.isPending || !selectedEmployee || !selectedDate || !allowedMinutes}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {createExceptionMutation.isPending ? 'Adding...' : 'Add Exception'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}