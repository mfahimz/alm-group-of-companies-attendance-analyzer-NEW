import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Calculator, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/components/hooks/usePermissions';
import { useCompanyFilter } from '@/components/context/CompanyContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function MonthlyPlanning() {
    const { user: currentUser } = usePermissions();
    const { selectedCompany } = useCompanyFilter();
    const queryClient = useQueryClient();
    
    // Default to current month
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
    const [achievedValues, setAchievedValues] = useState({}); // { templateId: value }

    const { data: templates = [], isLoading: isTemplatesLoading } = useQuery({
        queryKey: ['compensationTemplates', selectedCompany],
        queryFn: async () => {
            return base44.entities.EmployeeCompensationTemplate.filter({ 
                company: selectedCompany,
                active: true 
            }, 'employee_name', 1000);
        },
        enabled: !!selectedCompany,
        refetchOnWindowFocus: false
    });

    const { data: monthlyRecords = [], isLoading: isRecordsLoading } = useQuery({
        queryKey: ['compensationMonthlyRecords', selectedCompany, selectedMonth],
        queryFn: async () => {
            return base44.entities.CompensationMonthlyRecord.filter({ 
                company: selectedCompany,
                month: selectedMonth
            }, null, 1000);
        },
        enabled: !!selectedCompany && !!selectedMonth,
        refetchOnWindowFocus: false
    });

    const calculatePayout = (achieved, mode, slabsJson) => {
        let slabs = [];
        try {
            slabs = typeof slabsJson === 'string' ? JSON.parse(slabsJson) : slabsJson;
        } catch (e) {
            return 0;
        }
        if (!slabs || slabs.length === 0) return 0;
        
        const val = Number(achieved) || 0;
        
        if (mode === 'exact_range') {
            const slab = slabs.find(s => val >= s.min && val <= s.max);
            return slab ? slab.payout : 0;
        } else if (mode === 'cumulative') {
            return slabs.reduce((total, slab) => {
                if (val >= slab.max) {
                    return total + slab.payout;
                } else if (val > slab.min) {
                    const range = slab.max - slab.min;
                    if (range === 0) return total + slab.payout;
                    const proportion = (val - slab.min) / range;
                    return total + (slab.payout * proportion);
                }
                return total;
            }, 0);
        }
        return 0;
    };

    const saveMutation = useMutation({
        mutationFn: async ({ template, achieved }) => {
            const existing = monthlyRecords.find(r => r.template_id === template.id);
            const payout = calculatePayout(achieved, template.calculation_mode, template.slabs);
            
            const payload = {
                company: selectedCompany,
                month: selectedMonth,
                employee_id: template.employee_id,
                employee_name: template.employee_name,
                template_id: template.id,
                template_snapshot: typeof template.slabs === 'string' ? template.slabs : JSON.stringify(template.slabs),
                calculation_mode_snapshot: template.calculation_mode,
                target_label: template.target_label,
                unit: template.unit,
                achieved_value: Number(achieved),
                calculated_payout: payout,
                status: existing?.status || 'Draft',
                last_calculated_at: new Date().toISOString()
            };

            if (existing) {
                if (existing.status === 'Approved') {
                    throw new Error('Cannot update an approved record. Please reopen first.');
                }
                return base44.entities.CompensationMonthlyRecord.update(existing.id, payload);
            }
            return base44.entities.CompensationMonthlyRecord.create(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compensationMonthlyRecords'] });
            toast.success('Record saved successfully');
        },
        onError: (err) => {
            toast.error('Failed to save record: ' + err.message);
        }
    });

    const handleAchievedChange = (templateId, value) => {
        setAchievedValues(prev => ({ ...prev, [templateId]: value }));
    };

    const planningData = useMemo(() => {
        return templates.map(template => {
            const record = monthlyRecords.find(r => r.template_id === template.id);
            const currentAchieved = achievedValues[template.id] !== undefined 
                ? achievedValues[template.id] 
                : (record ? record.achieved_value : '');
            
            const payout = calculatePayout(currentAchieved, template.calculation_mode, template.slabs);
            
            return {
                template,
                record,
                currentAchieved,
                payout
            };
        });
    }, [templates, monthlyRecords, achievedValues]);

    return (
        <Card className="p-6 bg-white border-[#E2E6EC]">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    <div className="space-y-1">
                        <Label className="text-xs text-[#64748B]">Select Planning Month</Label>
                        <Input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="w-48 border-[#E2E6EC]"
                        />
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm text-[#64748B]">
                        Total Payout for {selectedMonth}: 
                        <span className="ml-2 text-lg font-bold text-[#0F1E36]">
                            AED {planningData.reduce((sum, d) => sum + d.payout, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                    </p>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden border-[#E2E6EC]">
                <Table>
                    <TableHeader className="bg-[#F8FAFC]">
                        <TableRow>
                            <TableHead className="font-semibold text-[#475569]">Employee</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Target & Unit</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Mode</TableHead>
                            <TableHead className="font-semibold text-[#475569] w-32">Achieved</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Calculated Payout</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Status</TableHead>
                            <TableHead className="text-right font-semibold text-[#475569]">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(isTemplatesLoading || isRecordsLoading) ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0F1E36]" />
                                </TableCell>
                            </TableRow>
                        ) : planningData.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-[#64748B]">
                                    No active templates found for this company
                                </TableCell>
                            </TableRow>
                        ) : planningData.map(({ template, record, currentAchieved, payout }) => (
                            <TableRow key={template.id} className="hover:bg-[#F8FAFC]">
                                <TableCell>
                                    <div>
                                        <div className="font-medium text-[#1E293B]">{template.employee_name}</div>
                                        <div className="text-xs text-[#64748B]">{template.designation}</div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm font-medium text-[#334155]">{template.target_label}</div>
                                    <div className="text-xs text-[#64748B] uppercase">{template.unit}</div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="text-[10px] uppercase bg-slate-50">
                                        {template.calculation_mode.replace('_', ' ')}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Input
                                        type="number"
                                        value={currentAchieved}
                                        onChange={(e) => handleAchievedChange(template.id, e.target.value)}
                                        className="h-8 border-[#E2E6EC]"
                                        disabled={record?.status === 'Approved'}
                                    />
                                </TableCell>
                                <TableCell>
                                    <div className="font-bold text-[#0F1E36]">
                                        AED {payout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {record ? (
                                        <Badge className={
                                            record.status === 'Approved' ? 'bg-green-100 text-green-700' :
                                            record.status === 'Reviewed' ? 'bg-blue-100 text-blue-700' :
                                            'bg-yellow-100 text-yellow-700'
                                        }>
                                            {record.status}
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-slate-400italic">Not Started</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        size="sm"
                                        variant={record ? "outline" : "default"}
                                        className={!record ? "bg-[#0F1E36]" : ""}
                                        onClick={() => saveMutation.mutate({ template, achieved: currentAchieved })}
                                        disabled={saveMutation.isPending || record?.status === 'Approved'}
                                    >
                                        <Save className="w-4 h-4 mr-1" />
                                        {record ? 'Update' : 'Save'}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}

function Label({ children, className }) {
    return <label className={`block text-sm font-medium text-[#374151] ${className}`}>{children}</label>;
}
