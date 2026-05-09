import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Loader2, Target, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/components/hooks/usePermissions';
import { useCompanyFilter } from '@/components/context/CompanyContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function CompensationTemplates() {
    const { user: currentUser } = usePermissions();
    const { selectedCompany } = useCompanyFilter();
    const queryClient = useQueryClient();
    
    const [showDialog, setShowDialog] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [formData, setFormData] = useState({
        employee_id: '',
        employee_name: '',
        designation: '',
        target_type: 'revenue',
        target_label: 'Monthly Revenue',
        unit: 'AED',
        calculation_mode: 'exact_range',
        slabs: [{ min: 0, max: 1000, payout: 100 }]
    });

    const { data: templates = [], isLoading: isTemplatesLoading } = useQuery({
        queryKey: ['compensationTemplates', selectedCompany],
        queryFn: async () => {
            return base44.entities.EmployeeCompensationTemplate.filter({ 
                company: selectedCompany,
                active: true 
            }, '-created_date', 1000);
        },
        enabled: !!selectedCompany,
        refetchOnWindowFocus: false
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees', selectedCompany],
        queryFn: async () => {
            return base44.entities.Employee.filter({ 
                company: selectedCompany, 
                active: true 
            }, 'name', 1000);
        },
        enabled: !!selectedCompany,
        refetchOnWindowFocus: false
    });

    const filteredTemplates = useMemo(() => {
        return templates.filter(t => 
            t.employee_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.target_label?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [templates, searchTerm]);

    const createMutation = useMutation({
        mutationFn: async (data) => {
            const payload = {
                ...data,
                company: selectedCompany,
                active: true,
                slabs: JSON.stringify(data.slabs)
            };
            if (editingTemplate) {
                return base44.entities.EmployeeCompensationTemplate.update(editingTemplate.id, payload);
            }
            return base44.entities.EmployeeCompensationTemplate.create(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compensationTemplates'] });
            toast.success(editingTemplate ? 'Template updated' : 'Template created');
            setShowDialog(false);
            setEditingTemplate(null);
        },
        onError: (err) => {
            toast.error('Failed to save template: ' + err.message);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            return base44.entities.EmployeeCompensationTemplate.update(id, { active: false });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['compensationTemplates'] });
            toast.success('Template archived');
        }
    });

    const handleAddSlab = () => {
        setFormData(prev => ({
            ...prev,
            slabs: [...prev.slabs, { min: 0, max: 0, payout: 0 }]
        }));
    };

    const handleRemoveSlab = (index) => {
        setFormData(prev => ({
            ...prev,
            slabs: prev.slabs.filter((_, i) => i !== index)
        }));
    };

    const handleSlabChange = (index, field, value) => {
        const newSlabs = [...formData.slabs];
        newSlabs[index][field] = Number(value);
        setFormData(prev => ({ ...prev, slabs: newSlabs }));
    };

    const handleEdit = (template) => {
        setEditingTemplate(template);
        let slabs = [];
        try {
            slabs = typeof template.slabs === 'string' ? JSON.parse(template.slabs) : template.slabs;
        } catch (e) {
            slabs = [];
        }
        setFormData({
            employee_id: template.employee_id,
            employee_name: template.employee_name,
            designation: template.designation || '',
            target_type: template.target_type,
            target_label: template.target_label,
            unit: template.unit,
            calculation_mode: template.calculation_mode,
            slabs: slabs
        });
        setShowDialog(true);
    };

    const handleEmployeeSelect = (empId) => {
        const emp = employees.find(e => e.hrms_id === empId);
        if (emp) {
            setFormData(prev => ({
                ...prev,
                employee_id: emp.hrms_id,
                employee_name: emp.name,
                designation: emp.designation || ''
            }));
        }
    };

    return (
        <Card className="p-6 bg-white border-[#E2E6EC]">
            <div className="flex justify-between items-center mb-6">
                <div className="relative w-64">
                    <Input
                        placeholder="Search templates..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-4 border-[#E2E6EC]"
                    />
                </div>
                <Button onClick={() => {
                    setEditingTemplate(null);
                    setFormData({
                        employee_id: '',
                        employee_name: '',
                        designation: '',
                        target_type: 'revenue',
                        target_label: 'Monthly Revenue',
                        unit: 'AED',
                        calculation_mode: 'exact_range',
                        slabs: [{ min: 0, max: 1000, payout: 100 }]
                    });
                    setShowDialog(true);
                }} className="bg-[#0F1E36]">
                    <Plus className="w-4 h-4 mr-2" />
                    New Template
                </Button>
            </div>

            <div className="border rounded-lg overflow-hidden border-[#E2E6EC]">
                <Table>
                    <TableHeader className="bg-[#F8FAFC]">
                        <TableRow>
                            <TableHead className="font-semibold text-[#475569]">Employee</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Target Label</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Type</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Mode</TableHead>
                            <TableHead className="font-semibold text-[#475569]">Slabs</TableHead>
                            <TableHead className="text-right font-semibold text-[#475569]">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isTemplatesLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#0F1E36]" />
                                </TableCell>
                            </TableRow>
                        ) : filteredTemplates.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-[#64748B]">
                                    No templates found
                                </TableCell>
                            </TableRow>
                        ) : filteredTemplates.map((template) => (
                            <TableRow key={template.id} className="hover:bg-[#F8FAFC]">
                                <TableCell>
                                    <div>
                                        <div className="font-medium text-[#1E293B]">{template.employee_name}</div>
                                        <div className="text-xs text-[#64748B]">{template.designation}</div>
                                    </div>
                                </TableCell>
                                <TableCell className="text-[#334155]">{template.target_label}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="capitalize bg-blue-50 text-blue-700 border-blue-200">
                                        {template.target_type}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="capitalize bg-purple-50 text-purple-700 border-purple-200">
                                        {template.calculation_mode.replace('_', ' ')}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-[#64748B] text-xs">
                                    {(() => {
                                        try {
                                            const s = typeof template.slabs === 'string' ? JSON.parse(template.slabs) : template.slabs;
                                            return `${s.length} slabs`;
                                        } catch(e) { return '0 slabs'; }
                                    })()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => handleEdit(template)}
                                            className="text-[#64748B] hover:text-[#0F1E36]"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={() => {
                                                if (confirm('Archive this template?')) {
                                                    deleteMutation.mutate(template.id);
                                                }
                                            }}
                                            className="text-red-400 hover:text-red-600"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-[#0F1E36]">
                            {editingTemplate ? 'Edit Template' : 'Create New Template'}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Employee</Label>
                            <Select 
                                value={formData.employee_id} 
                                onValueChange={handleEmployeeSelect}
                                disabled={!!editingTemplate}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.hrms_id} value={emp.hrms_id}>
                                            {emp.name} ({emp.designation})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Designation (Info)</Label>
                            <Input value={formData.designation} readOnly className="bg-gray-50" />
                        </div>
                        <div className="space-y-2">
                            <Label>Target Label</Label>
                            <Input 
                                value={formData.target_label} 
                                onChange={(e) => setFormData(prev => ({ ...prev, target_label: e.target.value }))}
                                placeholder="e.g. Sales Target"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Target Type</Label>
                            <Select 
                                value={formData.target_type} 
                                onValueChange={(v) => setFormData(prev => ({ ...prev, target_type: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="revenue">Revenue</SelectItem>
                                    <SelectItem value="units">Units Sold</SelectItem>
                                    <SelectItem value="tasks">Tasks Completed</SelectItem>
                                    <SelectItem value="tier_based">Sales Tier Structure</SelectItem>
                                    <SelectItem value="custom">Custom</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Unit</Label>
                            <Input 
                                value={formData.unit} 
                                onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                                placeholder="e.g. AED, PCS, etc."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Calculation Mode</Label>
                            <Select 
                                value={formData.calculation_mode} 
                                onValueChange={(v) => setFormData(prev => ({ ...prev, calculation_mode: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="exact_range">Exact Range (Bracket)</SelectItem>
                                    <SelectItem value="cumulative">Cumulative (Tiered)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label className="text-lg font-semibold flex items-center gap-2">
                                <Layers className="w-5 h-5 text-blue-600" />
                                Payout Slabs
                            </Label>
                            <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={handleAddSlab} 
                                className="border-blue-200 text-blue-600"
                                disabled={formData.target_type === 'tier_based'}
                            >
                                <Plus className="w-4 h-4 mr-1" /> Add Slab
                            </Button>
                        </div>
                        
                        {formData.target_type === 'tier_based' ? (
                            <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                                <p className="font-semibold mb-2">Tiered Salary Logic Enabled</p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>AED 13,500: 240k Units, 6 SC, 460 IV, 4.5 NPS</li>
                                    <li>AED 12,000: 230k Units, 4 SC, 430 IV, 4.4 NPS</li>
                                    <li>AED 10,500: 220k Units only</li>
                                    <li>AED 9,000: Below threshold</li>
                                </ul>
                                <p className="mt-2 text-[10px] text-blue-600 italic">* Slabs are ignored for this type as logic is hardcoded in Phase 1.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {formData.slabs.map((slab, idx) => (
                                    <div key={idx} className="flex gap-3 items-end bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E6EC]">
                                        <div className="flex-1 space-y-1">
                                            <Label className="text-[10px] uppercase text-[#64748B]">Min {formData.unit}</Label>
                                            <Input 
                                                type="number" 
                                                value={slab.min} 
                                                onChange={(e) => handleSlabChange(idx, 'min', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <Label className="text-[10px] uppercase text-[#64748B]">Max {formData.unit}</Label>
                                            <Input 
                                                type="number" 
                                                value={slab.max} 
                                                onChange={(e) => handleSlabChange(idx, 'max', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <Label className="text-[10px] uppercase text-[#64748B]">Payout (AED)</Label>
                                            <Input 
                                                type="number" 
                                                value={slab.payout} 
                                                onChange={(e) => handleSlabChange(idx, 'payout', e.target.value)}
                                            />
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => handleRemoveSlab(idx)}
                                            className="text-red-400 hover:text-red-600 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="mt-6">
                        <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                        <Button 
                            onClick={() => createMutation.mutate(formData)}
                            className="bg-[#0F1E36]"
                            disabled={createMutation.isPending || !formData.employee_id}
                        >
                            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            {editingTemplate ? 'Update Template' : 'Create Template'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
