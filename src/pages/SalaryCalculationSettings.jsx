import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calculator, Plus, Edit, Save, X, Info, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import PageTitle from '@/components/ui/PageTitle';

export default function SalaryCalculationSettings() {
    const [editingCompany, setEditingCompany] = useState(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin' || userRole === 'ceo';

    const { data: allSettings = [], isLoading } = useQuery({
        queryKey: ['salaryCalculationSettings'],
        queryFn: () => base44.entities.SalaryCalculationSettings.filter({ active: true }, '-created_date', 100)
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: () => base44.entities.Company.filter({ active: true }, null, 100)
    });

    const saveMutation = useMutation({
        mutationFn: async (data) => {
            if (data.id) {
                await base44.entities.SalaryCalculationSettings.update(data.id, data);
            } else {
                await base44.entities.SalaryCalculationSettings.create(data);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['salaryCalculationSettings']);
            setEditingCompany(null);
            setShowCreateDialog(false);
            toast.success('Settings saved successfully');
        },
        onError: (error) => {
            toast.error('Failed to save settings: ' + error.message);
        }
    });

    const handleEdit = (setting) => {
        setEditingCompany({ ...setting });
    };

    const handleCreate = () => {
        setEditingCompany({
            company: '',
            salary_divisor: 30,
            ot_divisor: 30,
            ot_normal_rate: 1.25,
            ot_special_rate: 1.5,
            wps_cap_enabled: false,
            wps_cap_amount: 4900,
            leave_pay_formula: 'TOTAL_SALARY',
            salary_leave_formula: 'BASIC_PLUS_ALLOWANCES',
            deductible_hours_formula: 'CURRENT_MONTH_ONLY',
            grace_application: 'BEFORE_APPROVED',
            assumed_present_last_days: 0,
            balance_rounding_rule: 'EXACT',
            active: true,
            notes: ''
        });
        setShowCreateDialog(true);
    };

    const handleSave = () => {
        if (!editingCompany.company) {
            toast.error('Company name is required');
            return;
        }
        saveMutation.mutate(editingCompany);
    };

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-slate-50 p-6">
                <Card className="max-w-2xl mx-auto">
                    <CardContent className="p-12 text-center">
                        <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-600">Access restricted to Admin and CEO only</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F4F6F9] p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <PageTitle 
                    title="Salary Calculation Settings"
                    description="Configure company-specific salary calculation rules and formulas"
                    icon={Calculator}
                />

                {/* Info Banner */}
                <Card className="border-l-4 border-l-blue-500 bg-blue-50">
                    <CardContent className="p-4">
                        <div className="flex gap-3">
                            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-800">
                                <strong>How it works:</strong> These settings control salary calculation logic for each company. 
                                Changes apply to NEW salary snapshots created after finalization. Existing snapshots remain unchanged.
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Settings Table */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Company Calculation Rules</CardTitle>
                            <CardDescription className="mt-1">Configure divisors, OT rates, WPS caps, and calculation formulas</CardDescription>
                        </div>
                        <Button onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Company Settings
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center py-12 text-slate-500">Loading settings...</div>
                        ) : allSettings.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                <Calculator className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <p>No company settings configured yet.</p>
                                <p className="text-sm mt-2">Click "Add Company Settings" to create rules for a company.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Company</TableHead>
                                            <TableHead>Salary Divisor</TableHead>
                                            <TableHead>OT Divisor</TableHead>
                                            <TableHead>OT Rates</TableHead>
                                            <TableHead>WPS Cap</TableHead>
                                            <TableHead>Assumed Days</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allSettings.map(setting => (
                                            <TableRow key={setting.id}>
                                                <TableCell className="font-medium">{setting.company}</TableCell>
                                                <TableCell>{setting.salary_divisor || 30}</TableCell>
                                                <TableCell>{setting.ot_divisor || 30}</TableCell>
                                                <TableCell className="text-xs">
                                                    Normal: {setting.ot_normal_rate || 1.25}x<br />
                                                    Special: {setting.ot_special_rate || 1.5}x
                                                </TableCell>
                                                <TableCell>
                                                    {setting.wps_cap_enabled ? (
                                                        <span className="text-green-600">AED {setting.wps_cap_amount || 4900}</span>
                                                    ) : (
                                                        <span className="text-slate-400">Disabled</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{setting.assumed_present_last_days || 0} days</TableCell>
                                                <TableCell className="text-right">
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost"
                                                        onClick={() => handleEdit(setting)}
                                                    >
                                                        <Edit className="w-4 h-4 text-indigo-600" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Edit/Create Dialog */}
                <Dialog open={!!editingCompany && !showCreateDialog} onOpenChange={(open) => !open && setEditingCompany(null)}>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {editingCompany?.id ? `Edit Settings: ${editingCompany.company}` : 'Create Company Settings'}
                            </DialogTitle>
                        </DialogHeader>
                        {editingCompany && (
                            <div className="space-y-6 py-4">
                                {/* Company Selection (only for new) */}
                                {!editingCompany.id && (
                                    <div>
                                        <Label>Company *</Label>
                                        <Select 
                                            value={editingCompany.company} 
                                            onValueChange={(val) => setEditingCompany({...editingCompany, company: val})}
                                        >
                                            <SelectTrigger className="mt-2">
                                                <SelectValue placeholder="Select company" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {companies.map(c => (
                                                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {/* Divisors Section */}
                                <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                                    <h3 className="font-semibold text-slate-900">Calculation Divisors</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Salary Divisor</Label>
                                            <Input
                                                type="number"
                                                value={editingCompany.salary_divisor}
                                                onChange={(e) => setEditingCompany({...editingCompany, salary_divisor: parseFloat(e.target.value)})}
                                                className="mt-2"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">Used for: Leave Pay, Salary Leave, Deductible Hours</p>
                                        </div>
                                        <div>
                                            <Label>OT Divisor</Label>
                                            <Input
                                                type="number"
                                                value={editingCompany.ot_divisor}
                                                onChange={(e) => setEditingCompany({...editingCompany, ot_divisor: parseFloat(e.target.value)})}
                                                className="mt-2"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">Used for: OT Hourly Rate, Previous Month calculations</p>
                                        </div>
                                    </div>
                                </div>

                                {/* OT Rates Section */}
                                <div className="space-y-4 p-4 bg-amber-50 rounded-lg">
                                    <h3 className="font-semibold text-slate-900">Overtime Rates</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Normal OT Rate</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={editingCompany.ot_normal_rate}
                                                onChange={(e) => setEditingCompany({...editingCompany, ot_normal_rate: parseFloat(e.target.value)})}
                                                className="mt-2"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">Multiplier (e.g., 1.25 = 125%)</p>
                                        </div>
                                        <div>
                                            <Label>Special OT Rate</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={editingCompany.ot_special_rate}
                                                onChange={(e) => setEditingCompany({...editingCompany, ot_special_rate: parseFloat(e.target.value)})}
                                                className="mt-2"
                                            />
                                            <p className="text-xs text-slate-500 mt-1">Multiplier (e.g., 1.5 = 150%)</p>
                                        </div>
                                    </div>
                                </div>

                                {/* WPS Cap Section */}
                                <div className="space-y-4 p-4 bg-green-50 rounded-lg">
                                    <h3 className="font-semibold text-slate-900">WPS Payment Cap</h3>
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            checked={editingCompany.wps_cap_enabled}
                                            onCheckedChange={(checked) => setEditingCompany({...editingCompany, wps_cap_enabled: checked})}
                                        />
                                        <Label>Enable WPS Cap (split Total into WPS Pay + Balance)</Label>
                                    </div>
                                    {editingCompany.wps_cap_enabled && (
                                        <>
                                            <div>
                                                <Label>WPS Cap Amount (AED)</Label>
                                                <Input
                                                    type="number"
                                                    value={editingCompany.wps_cap_amount}
                                                    onChange={(e) => setEditingCompany({...editingCompany, wps_cap_amount: parseFloat(e.target.value)})}
                                                    className="mt-2"
                                                />
                                            </div>
                                            <div>
                                                <Label>Balance Rounding Rule</Label>
                                                <Select 
                                                    value={editingCompany.balance_rounding_rule} 
                                                    onValueChange={(val) => setEditingCompany({...editingCompany, balance_rounding_rule: val})}
                                                >
                                                    <SelectTrigger className="mt-2">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="NEAREST_100">Round down to nearest 100</SelectItem>
                                                        <SelectItem value="EXACT">Exact amount (no rounding)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    {editingCompany.balance_rounding_rule === 'NEAREST_100' 
                                                        ? 'Example: 5750 total → 4900 WPS + 800 Balance' 
                                                        : 'Example: 5750 total → 4900 WPS + 850 Balance'}
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Formulas Section */}
                                <div className="space-y-4 p-4 bg-purple-50 rounded-lg">
                                    <h3 className="font-semibold text-slate-900">Calculation Formulas</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <Label>Leave Pay Formula</Label>
                                            <Select 
                                                value={editingCompany.leave_pay_formula} 
                                                onValueChange={(val) => setEditingCompany({...editingCompany, leave_pay_formula: val})}
                                            >
                                                <SelectTrigger className="mt-2">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="TOTAL_SALARY">Total Salary ÷ Divisor × Leave Days</SelectItem>
                                                    <SelectItem value="BASIC_PLUS_ALLOWANCES">(Basic + Allowances) ÷ Divisor × Leave Days</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Salary Leave Amount Formula</Label>
                                            <Select 
                                                value={editingCompany.salary_leave_formula} 
                                                onValueChange={(val) => setEditingCompany({...editingCompany, salary_leave_formula: val})}
                                            >
                                                <SelectTrigger className="mt-2">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="TOTAL_SALARY">Total Salary ÷ Divisor × Salary Leave Days</SelectItem>
                                                    <SelectItem value="BASIC_PLUS_ALLOWANCES">(Basic + Allowances) ÷ Divisor × Salary Leave Days</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Deductible Hours Formula</Label>
                                            <Select 
                                                value={editingCompany.deductible_hours_formula} 
                                                onValueChange={(val) => setEditingCompany({...editingCompany, deductible_hours_formula: val})}
                                            >
                                                <SelectTrigger className="mt-2">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="CURRENT_MONTH_ONLY">Current Month Only</SelectItem>
                                                    <SelectItem value="INCLUDE_PREVIOUS_MONTH">Include Previous Month (Al Maraghi)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Grace Application Order</Label>
                                            <Select 
                                                value={editingCompany.grace_application} 
                                                onValueChange={(val) => setEditingCompany({...editingCompany, grace_application: val})}
                                            >
                                                <SelectTrigger className="mt-2">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="BEFORE_APPROVED">Grace Before Approved Minutes</SelectItem>
                                                    <SelectItem value="AFTER_APPROVED">Grace After Approved Minutes</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {editingCompany.grace_application === 'BEFORE_APPROVED' 
                                                    ? 'Formula: ((Late + Early) - Grace) - Approved' 
                                                    : 'Formula: ((Late + Early) - Approved) - Grace'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Special Rules Section */}
                                <div className="space-y-4 p-4 bg-indigo-50 rounded-lg">
                                    <h3 className="font-semibold text-slate-900">Special Rules</h3>
                                    <div>
                                        <Label>Assumed Present Last Days of Month</Label>
                                        <Input
                                            type="number"
                                            min="0"
                                            max="5"
                                            value={editingCompany.assumed_present_last_days}
                                            onChange={(e) => setEditingCompany({...editingCompany, assumed_present_last_days: parseInt(e.target.value) || 0})}
                                            className="mt-2"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">
                                            Last N days of salary month marked as fully present (no deductions). Al Maraghi: 2 days, Others: 0
                                        </p>
                                    </div>
                                </div>

                                {/* Notes Section */}
                                <div>
                                    <Label>Notes (Optional)</Label>
                                    <Textarea
                                        value={editingCompany.notes || ''}
                                        onChange={(e) => setEditingCompany({...editingCompany, notes: e.target.value})}
                                        placeholder="Additional notes about these calculation rules..."
                                        className="mt-2"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        )}
                        <DialogFooter className="mt-6">
                            <Button variant="outline" onClick={() => setEditingCompany(null)}>
                                <X className="w-4 h-4 mr-2" />
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                                <Save className="w-4 h-4 mr-2" />
                                {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Create Dialog */}
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Create Company Settings</DialogTitle>
                        </DialogHeader>
                        {editingCompany && (
                            <div className="space-y-6 py-4">
                                {/* Company Selection */}
                                <div>
                                    <Label>Company *</Label>
                                    <Select 
                                        value={editingCompany.company} 
                                        onValueChange={(val) => setEditingCompany({...editingCompany, company: val})}
                                    >
                                        <SelectTrigger className="mt-2">
                                            <SelectValue placeholder="Select company" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {companies.map(c => (
                                                <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Divisors */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Salary Divisor</Label>
                                        <Input
                                            type="number"
                                            value={editingCompany.salary_divisor}
                                            onChange={(e) => setEditingCompany({...editingCompany, salary_divisor: parseFloat(e.target.value)})}
                                            className="mt-2"
                                        />
                                    </div>
                                    <div>
                                        <Label>OT Divisor</Label>
                                        <Input
                                            type="number"
                                            value={editingCompany.ot_divisor}
                                            onChange={(e) => setEditingCompany({...editingCompany, ot_divisor: parseFloat(e.target.value)})}
                                            className="mt-2"
                                        />
                                    </div>
                                </div>

                                {/* OT Rates */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Normal OT Rate</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={editingCompany.ot_normal_rate}
                                            onChange={(e) => setEditingCompany({...editingCompany, ot_normal_rate: parseFloat(e.target.value)})}
                                            className="mt-2"
                                        />
                                    </div>
                                    <div>
                                        <Label>Special OT Rate</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={editingCompany.ot_special_rate}
                                            onChange={(e) => setEditingCompany({...editingCompany, ot_special_rate: parseFloat(e.target.value)})}
                                            className="mt-2"
                                        />
                                    </div>
                                </div>

                                {/* WPS Cap */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            checked={editingCompany.wps_cap_enabled}
                                            onCheckedChange={(checked) => setEditingCompany({...editingCompany, wps_cap_enabled: checked})}
                                        />
                                        <Label>Enable WPS Cap</Label>
                                    </div>
                                    {editingCompany.wps_cap_enabled && (
                                        <Input
                                            type="number"
                                            value={editingCompany.wps_cap_amount}
                                            onChange={(e) => setEditingCompany({...editingCompany, wps_cap_amount: parseFloat(e.target.value)})}
                                            placeholder="WPS cap amount (AED)"
                                        />
                                    )}
                                </div>

                                {/* Formulas */}
                                <div className="space-y-3">
                                    <div>
                                        <Label>Leave Pay Formula</Label>
                                        <Select 
                                            value={editingCompany.leave_pay_formula} 
                                            onValueChange={(val) => setEditingCompany({...editingCompany, leave_pay_formula: val})}
                                        >
                                            <SelectTrigger className="mt-2">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="TOTAL_SALARY">Total Salary</SelectItem>
                                                <SelectItem value="BASIC_PLUS_ALLOWANCES">Basic + Allowances</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Salary Leave Formula</Label>
                                        <Select 
                                            value={editingCompany.salary_leave_formula} 
                                            onValueChange={(val) => setEditingCompany({...editingCompany, salary_leave_formula: val})}
                                        >
                                            <SelectTrigger className="mt-2">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="TOTAL_SALARY">Total Salary</SelectItem>
                                                <SelectItem value="BASIC_PLUS_ALLOWANCES">Basic + Allowances</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Special Rules */}
                                <div>
                                    <Label>Assumed Present Last Days</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="5"
                                        value={editingCompany.assumed_present_last_days}
                                        onChange={(e) => setEditingCompany({...editingCompany, assumed_present_last_days: parseInt(e.target.value) || 0})}
                                        className="mt-2"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Al Maraghi: 2 days, Others: 0</p>
                                </div>

                                {/* Notes */}
                                <div>
                                    <Label>Notes</Label>
                                    <Textarea
                                        value={editingCompany.notes || ''}
                                        onChange={(e) => setEditingCompany({...editingCompany, notes: e.target.value})}
                                        className="mt-2"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
                                <Save className="w-4 h-4 mr-2" />
                                {saveMutation.isPending ? 'Saving...' : 'Create Settings'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}