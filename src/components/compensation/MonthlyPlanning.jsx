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
import { Info, AlertCircle } from 'lucide-react';

const calculateTieredPayout = (kpis) => {
    const units = Number(kpis?.units) || 0;
    const sc = Number(kpis?.sc) || 0;
    const iv = Number(kpis?.iv) || 0;
    const nps = Number(kpis?.nps) || 0;

    // Tier 1: 13,500
    if (units >= 240000 && sc >= 6 && iv >= 460 && nps >= 4.5) {
        return { payout: 13500, tier: 'Tier 1', status: 'Matched', reasons: [] };
    }
    
    // Tier 2: 12,000
    if (units >= 230000 && sc >= 4 && iv >= 430 && nps >= 4.4) {
        let reasons = [];
        if (units < 240000) reasons.push("Units < 240k");
        if (sc < 6) reasons.push("SC < 6");
        if (iv < 460) reasons.push("IV < 460");
        if (nps < 4.5) reasons.push("NPS < 4.5");
        return { payout: 12000, tier: 'Tier 2', status: 'Missed Tier 1', reasons };
    }

    // Tier 3: 10,500
    if (units >= 220000) {
        let reasons = [];
        if (units < 230000) reasons.push("Units < 230k");
        if (sc < 4) reasons.push("SC < 4");
        if (iv < 430) reasons.push("IV < 430");
        if (nps < 4.4) reasons.push("NPS < 4.4");
        return { payout: 10500, tier: 'Tier 3', status: 'Missed Tier 2', reasons };
    }

    // Default: 9,000
    return { payout: 9000, tier: 'Tier 4', status: 'Below Threshold', reasons: units < 220000 ? ["Units < 220k"] : ["KPIs below criteria"] };
};

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
            
            let payout = 0;
            let achievedValue = 0;
            let templateSnapshot = typeof template.slabs === 'string' ? template.slabs : JSON.stringify(template.slabs);

            if (template.target_type === 'tier_based') {
                const result = calculateTieredPayout(achieved);
                payout = result.payout;
                achievedValue = Number(achieved?.units) || 0;
                templateSnapshot = JSON.stringify({
                    slabs: template.slabs,
                    kpi_values: achieved,
                    tier_result: result
                });
            } else {
                payout = calculatePayout(achieved, template.calculation_mode, template.slabs);
                achievedValue = Number(achieved);
            }
            
            const payload = {
                company: selectedCompany,
                month: selectedMonth,
                employee_id: template.employee_id,
                employee_name: template.employee_name,
                template_id: template.id,
                template_snapshot: templateSnapshot,
                calculation_mode_snapshot: template.calculation_mode,
                target_label: template.target_label,
                unit: template.unit,
                achieved_value: achievedValue,
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

    const handleAchievedChange = (templateId, fieldOrValue, value) => {
        if (typeof fieldOrValue === 'string') {
            setAchievedValues(prev => ({
                ...prev,
                [templateId]: { 
                    ...(prev[templateId] || {}), 
                    [fieldOrValue]: value 
                }
            }));
        } else {
            setAchievedValues(prev => ({ ...prev, [templateId]: fieldOrValue }));
        }
    };

    const planningData = useMemo(() => {
        return templates.map(template => {
            const record = monthlyRecords.find(r => r.template_id === template.id);
            
            let initialAchieved = record ? record.achieved_value : '';
            if (template.target_type === 'tier_based') {
                // Try to load detailed KPIs from snapshot
                if (record?.template_snapshot) {
                    try {
                        const snap = JSON.parse(record.template_snapshot);
                        if (snap.kpi_values) initialAchieved = snap.kpi_values;
                        else initialAchieved = { units: record.achieved_value, sc: 0, iv: 0, nps: 0 };
                    } catch(e) {
                        initialAchieved = { units: record.achieved_value, sc: 0, iv: 0, nps: 0 };
                    }
                } else {
                    initialAchieved = { units: '', sc: '', iv: '', nps: '' };
                }
            }

            const currentAchieved = achievedValues[template.id] !== undefined 
                ? achievedValues[template.id] 
                : initialAchieved;
            
            let payout = 0;
            let tierInfo = null;

            if (template.target_type === 'tier_based') {
                tierInfo = calculateTieredPayout(currentAchieved);
                payout = tierInfo.payout;
            } else {
                payout = calculatePayout(currentAchieved, template.calculation_mode, template.slabs);
            }
            
            return {
                template,
                record,
                currentAchieved,
                payout,
                tierInfo
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
                                    {template.target_type === 'tier_based' ? (
                                        <div className="grid grid-cols-2 gap-2 min-w-[200px]">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-500 uppercase">Units</Label>
                                                <Input
                                                    type="number"
                                                    value={currentAchieved?.units || ''}
                                                    onChange={(e) => handleAchievedChange(template.id, 'units', e.target.value)}
                                                    className="h-7 text-xs border-[#E2E6EC]"
                                                    disabled={record?.status === 'Approved'}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-500 uppercase">SC</Label>
                                                <Input
                                                    type="number"
                                                    value={currentAchieved?.sc || ''}
                                                    onChange={(e) => handleAchievedChange(template.id, 'sc', e.target.value)}
                                                    className="h-7 text-xs border-[#E2E6EC]"
                                                    disabled={record?.status === 'Approved'}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-500 uppercase">IV</Label>
                                                <Input
                                                    type="number"
                                                    value={currentAchieved?.iv || ''}
                                                    onChange={(e) => handleAchievedChange(template.id, 'iv', e.target.value)}
                                                    className="h-7 text-xs border-[#E2E6EC]"
                                                    disabled={record?.status === 'Approved'}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-500 uppercase">NPS</Label>
                                                <Input
                                                    type="number"
                                                    value={currentAchieved?.nps || ''}
                                                    onChange={(e) => handleAchievedChange(template.id, 'nps', e.target.value)}
                                                    className="h-7 text-xs border-[#E2E6EC]"
                                                    disabled={record?.status === 'Approved'}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <Input
                                            type="number"
                                            value={currentAchieved}
                                            onChange={(e) => handleAchievedChange(template.id, e.target.value)}
                                            className="h-8 border-[#E2E6EC]"
                                            disabled={record?.status === 'Approved'}
                                        />
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="font-bold text-[#0F1E36]">
                                        AED {payout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                    {template.target_type === 'tier_based' && tierInfo && (
                                        <div className="mt-1">
                                            <Badge variant="secondary" className="text-[9px] bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-100">
                                                {tierInfo.tier}
                                            </Badge>
                                            {tierInfo.reasons.length > 0 && (
                                                <div className="mt-1 flex items-start gap-1">
                                                    <AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                                                    <span className="text-[8px] text-slate-500 italic leading-tight">
                                                        {tierInfo.status}: {tierInfo.reasons.join(', ')}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {template.target_type === 'tier_based' && Number(currentAchieved?.units) >= 248000 && (
                                        <div className="mt-2 p-1.5 bg-slate-50 border border-slate-200 rounded text-[8px] text-slate-600 flex items-start gap-1">
                                            <Info className="w-3 h-3 text-blue-400 shrink-0" />
                                            <span>Incentive (248k+) applies. Logic pending Phase 2 confirmation.</span>
                                        </div>
                                    )}
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
