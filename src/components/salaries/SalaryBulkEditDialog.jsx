import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export default function SalaryBulkEditDialog({ open, onClose, selectedIds, allSalaries, onSuccess }) {
    const [field, setField] = useState('working_hours');
    const [value, setValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
    const queryClient = useQueryClient();

    const fields = [
        { label: 'Working Hours', value: 'working_hours', type: 'number' },
        { label: 'Basic Salary', value: 'basic_salary', type: 'number' },
        { label: 'Allowances', value: 'allowances', type: 'number' },
        { label: 'Allowances with Bonus', value: 'allowances_with_bonus', type: 'number' },
        { label: 'Mark WPS Cap Enabled', value: 'wps_cap_enabled_true', type: 'action' },
        { label: 'Unmark WPS Cap', value: 'wps_cap_enabled_false', type: 'action' },
        { label: 'Set WPS Cap Amount', value: 'wps_cap_amount', type: 'number' },
    ];

    const currentField = fields.find(f => f.value === field);

    const handleConfirm = async () => {
        setIsProcessing(true);
        const total = selectedIds.length;
        setProgress({ current: 0, total, successes: 0, failures: 0 });

        const results = [];
        
        for (let i = 0; i < selectedIds.length; i++) {
            const id = selectedIds[i];
            const salary = allSalaries.find(s => s.id === id);
            
            if (!salary) {
                results.push({ id, status: 'failed', error: 'Salary record not found' });
                setProgress(prev => ({ ...prev, current: i + 1, failures: prev.failures + 1 }));
                continue;
            }

            try {
                let updates = {};
                
                // Prepare updates based on current row + requested bulk change
                if (field === 'wps_cap_enabled_true') {
                    updates.wps_cap_enabled = true;
                } else if (field === 'wps_cap_enabled_false') {
                    updates.wps_cap_enabled = false;
                } else if (field === 'wps_cap_amount') {
                    updates.wps_cap_amount = parseFloat(value) || 0;
                } else {
                    updates[field] = parseFloat(value) || 0;
                }

                // Merge with existing values to recalculate total
                const finalBasic = field === 'basic_salary' ? updates.basic_salary : (salary.basic_salary || 0);
                const finalAllowances = field === 'allowances' ? updates.allowances : (salary.allowances || 0);
                const finalBonus = field === 'allowances_with_bonus' ? updates.allowances_with_bonus : (salary.allowances_with_bonus || 0);
                const finalHours = field === 'working_hours' ? updates.working_hours : (salary.working_hours || 9);
                
                const roundedTotal = Math.round(finalBasic + finalAllowances + finalBonus);
                const deductionPerMinute = roundedTotal / (30 * finalHours * 60);

                const finalPayload = {
                    ...updates,
                    total_salary: roundedTotal,
                    deduction_per_minute: deductionPerMinute
                };

                await base44.entities.EmployeeSalary.update(id, finalPayload);
                results.push({ id, status: 'success' });
                setProgress(prev => ({ ...prev, current: i + 1, successes: prev.successes + 1 }));
            } catch (error) {
                console.error(`Failed to update salary ${id}:`, error);
                results.push({ id, status: 'failed', error: error.message });
                setProgress(prev => ({ ...prev, current: i + 1, failures: prev.failures + 1 }));
            }
        }

        setIsProcessing(false);
        queryClient.invalidateQueries({ queryKey: ['salaries'] });
        
        const finalSuccesses = results.filter(r => r.status === 'success').length;
        const finalFailures = results.filter(r => r.status === 'failed').length;
        const summary = `Updated ${finalSuccesses} records. ${finalFailures} failed.`;
        
        if (finalFailures > 0) {
            toast.warning(summary);
        } else {
            toast.success(summary);
        }
        
        if (onSuccess) onSuccess();
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !isProcessing && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Bulk Edit Salaries ({selectedIds.length} Selected)</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {!isProcessing ? (
                        <>
                            <div className="space-y-2">
                                <Label>Field to Update</Label>
                                <Select value={field} onValueChange={(val) => { setField(val); setValue(''); }}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fields.map(f => (
                                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {currentField.type === 'number' && (
                                <div className="space-y-2">
                                    <Label>New Value</Label>
                                    <Input
                                        type="number"
                                        value={value}
                                        onChange={(e) => setValue(e.target.value)}
                                        placeholder={`Enter new ${currentField.label.toLowerCase()}`}
                                    />
                                </div>
                            )}

                            {currentField.type === 'action' && (
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-700 flex gap-2 items-start">
                                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                                    <p>This will {currentField.label.toLowerCase()} for all {selectedIds.length} selected records.</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="space-y-6 py-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm font-medium">
                                    <span>Processing records...</span>
                                    <span>{progress.current} / {progress.total}</span>
                                </div>
                                <Progress value={(progress.current / progress.total) * 100} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-green-50 border border-green-100 p-3 rounded-lg flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                    <div>
                                        <div className="text-2xl font-bold text-green-700">{progress.successes}</div>
                                        <div className="text-xs text-green-600 uppercase font-semibold">Success</div>
                                    </div>
                                </div>
                                <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex items-center gap-3">
                                    <XCircle className="w-5 h-5 text-red-600" />
                                    <div>
                                        <div className="text-2xl font-bold text-red-700">{progress.failures}</div>
                                        <div className="text-xs text-red-600 uppercase font-semibold">Failed</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                        Cancel
                    </Button>
                    {!isProcessing && (
                        <Button 
                            onClick={handleConfirm} 
                            disabled={currentField.type === 'number' && !value}
                        >
                            Apply to {selectedIds.length} Records
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
