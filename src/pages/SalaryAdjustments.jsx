import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    DollarSign,
    User,
    Calendar,
    Power,
    X,
    FolderKanban
} from 'lucide-react';
import AEDIcon from '@/components/ui/AEDIcon';
import { toast } from 'sonner';
import Breadcrumb from '@/components/ui/Breadcrumb';
import { usePermissions } from '@/components/hooks/usePermissions';
import { useCompanyFilter } from '../components/context/CompanyContext';

const CATEGORIES = [
    { value: 'bonus', label: 'Bonus (+) ' },
    { value: 'incentive', label: 'Incentive (+) ' },
    { value: 'allowance', label: 'Allowance (+) ' },
    { value: 'open_leave_salary', label: 'Open Leave Salary (+) ' },
    { value: 'variable_salary', label: 'Variable Salary (+) ' },
    { value: 'otherDeduction', label: 'Other Deduction (-) ' },
    { value: 'advanceSalaryDeduction', label: 'Advance Salary Deduction (-) ' }
];

export default function SalaryAdjustments() {
    const { user: currentUser } = usePermissions();
    const queryClient = useQueryClient();
    const { selectedCompany: filterCompany } = useCompanyFilter();

    const [showDialog, setShowDialog] = useState(false);
    const [editingAdjustment, setEditingAdjustment] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        company: '',
        hrms_id: '',
        category: 'bonus',
        label: '',
        amount: '',
        description: '',
        start_date: '',
        end_date: '',
        is_active: true
    });

    // Queries
    const { data: adjustments = [], isLoading: isLoadingAdjustments } = useQuery({
        queryKey: ['recurringAdjustments', filterCompany],
        queryFn: async () => {
            if (filterCompany) {
                return base44.entities.RecurringAdjustment.filter({ company: filterCompany });
            }
            return base44.entities.RecurringAdjustment.list();
        }
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees-for-adjustments', filterCompany],
        queryFn: async () => {
            if (filterCompany) {
                return base44.entities.Employee.filter({ active: true, company: filterCompany });
            }
            return base44.entities.Employee.filter({ active: true });
        }
    });

    const { data: companies = [] } = useQuery({
        queryKey: ['companies-for-adjustments'],
        queryFn: async () => {
            const settings = await base44.entities.CompanySettings.list();
            return settings.map(s => s.company);
        }
    });

    // Mutations
    const mutation = useMutation({
        mutationFn: async (data) => {
            if (editingAdjustment) {
                return base44.entities.RecurringAdjustment.update(editingAdjustment.id, data);
            }
            return base44.entities.RecurringAdjustment.create(data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['recurringAdjustments']);
            setShowDialog(false);
            setEditingAdjustment(null);
            resetForm();
            toast.success(editingAdjustment ? 'Adjustment updated' : 'Adjustment created');
        },
        onError: (error) => {
            toast.error('Error: ' + (error.message || 'Unknown error'));
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.RecurringAdjustment.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['recurringAdjustments']);
            toast.success('Adjustment deleted');
        }
    });

    const toggleActiveMutation = useMutation({
        mutationFn: ({ id, is_active }) => base44.entities.RecurringAdjustment.update(id, { is_active }),
        onSuccess: () => {
            queryClient.invalidateQueries(['recurringAdjustments']);
            toast.success('Status updated');
        }
    });

    // Filtering
    const filteredAdjustments = useMemo(() => {
        return adjustments.filter(adj => {
            const employee = employees.find(e => e.hrms_id === adj.hrms_id);
            const employeeName = employee?.name || 'Unknown Employee';
            const matchesSearch = !searchTerm || 
                employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                adj.hrms_id?.includes(searchTerm) ||
                adj.label?.toLowerCase().includes(searchTerm.toLowerCase());
            
            return matchesSearch;
        });
    }, [adjustments, searchTerm, employees]);

    const resetForm = () => {
        setFormData({
            company: filterCompany || '',
            hrms_id: '',
            category: 'bonus',
            label: '',
            amount: '',
            description: '',
            start_date: '',
            end_date: '',
            is_active: true
        });
    };

    const handleEdit = (adj) => {
        setEditingAdjustment(adj);
        setFormData({
            company: adj.company,
            hrms_id: adj.hrms_id,
            category: adj.category,
            label: adj.label || '',
            amount: adj.amount,
            description: adj.description || '',
            start_date: adj.start_date || '',
            end_date: adj.end_date || '',
            is_active: adj.is_active ?? true
        });
        setShowDialog(true);
    };

    const handleSubmit = () => {
        if (!formData.company || !formData.hrms_id || !formData.category || !formData.amount || !formData.start_date) {
            toast.error('Please fill required fields (Company, Employee, Category, Amount, Start Date)');
            return;
        }
        mutation.mutate({
            ...formData,
            amount: parseFloat(formData.amount) || 0
        });
    };

    const getCategoryLabel = (cat) => {
        return CATEGORIES.find(c => c.value === cat)?.label || cat;
    };

    const getEmployeeName = (hrms_id) => {
        return employees.find(e => e.hrms_id === hrms_id)?.name || hrms_id;
    };

    if (!currentUser) return null;

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-slate-50/50">
            <Breadcrumb items={[{ label: 'Recurring Salary Adjustments' }]} />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                        <DollarSign className="w-8 h-8 text-indigo-600" />
                        Recurring Salary Adjustments
                    </h1>
                    <p className="text-slate-500 mt-2 font-medium">Manage automated monthly allowances and deductions</p>
                </div>
                <Button onClick={() => { resetForm(); setShowDialog(true); }} size="lg" className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all hover:scale-[1.02]">
                    <Plus className="w-5 h-5 mr-2" />
                    New Adjustment
                </Button>
            </div>

            <Card className="border-none shadow-xl shadow-slate-200/50 overflow-hidden">
                <CardHeader className="bg-white border-b border-slate-100 py-6">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Search by name, ID, or label..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-11 border-slate-200 focus:ring-indigo-500 rounded-xl"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Adjustment Details</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Period</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-50">
                                {isLoadingAdjustments ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-slate-400">Loading adjustments...</td>
                                    </tr>
                                ) : filteredAdjustments.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="p-4 bg-slate-50 rounded-full">
                                                    <DollarSign className="w-8 h-8 text-slate-200" />
                                                </div>
                                                <p className="text-slate-500 font-medium">No adjustments found</p>
                                                <Button variant="ghost" className="text-indigo-600 font-bold hover:bg-indigo-50" onClick={() => { resetForm(); setShowDialog(true); }}>Create your first adjustment</Button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredAdjustments.map((adj) => (
                                    <tr key={adj.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                    {getEmployeeName(adj.hrms_id).substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900">{getEmployeeName(adj.hrms_id)}</span>
                                                    <span className="text-xs text-slate-500 font-semibold">{adj.hrms_id}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <Badge variant="outline" className="w-fit text-[10px] font-bold py-0.5 bg-white border-slate-200 text-slate-600 uppercase">
                                                    {getCategoryLabel(adj.category)}
                                                </Badge>
                                                <span className="font-semibold text-slate-700">{adj.label || 'Regular Adjustment'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`font-black text-sm ${adj.category.includes('Deduction') ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {adj.category.includes('Deduction') ? '-' : '+'}{adj.amount.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 text-xs text-slate-600 font-medium">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                    {adj.start_date}
                                                </div>
                                                {adj.end_date && (
                                                    <div className="flex items-center gap-1.5 opacity-60">
                                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                        {adj.end_date}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge className={`rounded-full px-3 py-1 font-bold ${adj.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full mr-2 ${adj.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                                {adj.is_active ? 'Active' : 'Deactivated'}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="ghost" onClick={() => handleEdit(adj)} className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => toggleActiveMutation.mutate({ id: adj.id, is_active: !adj.is_active })} className={`h-8 w-8 text-slate-400 hover:bg-slate-100 ${adj.is_active ? 'hover:text-amber-600' : 'hover:text-emerald-600'}`}>
                                                    <Power className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(adj.id)} className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if(!open) setEditingAdjustment(null); }}>
                <DialogContent className="max-w-xl p-0 overflow-hidden sm:rounded-2xl border-none shadow-2xl">
                    <DialogHeader className="p-8 bg-slate-950 relative">
                        <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-3 text-white">
                            <Plus className="w-6 h-6 text-indigo-400" />
                            {editingAdjustment ? 'Edit Adjustment' : 'New Recurring Adjustment'}
                        </DialogTitle>
                        <p className="text-white/80 text-sm font-medium mt-1">
                            Set up a long-term adjustment for payroll injection
                        </p>
                    </DialogHeader>
                    <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto bg-white">
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2.5">
                                <Label className="text-xs font-black uppercase text-slate-500 ml-1">Company Selection</Label>
                                <Select
                                    value={formData.company}
                                    onValueChange={(val) => setFormData({ ...formData, company: val, hrms_id: '' })}
                                    disabled={!!filterCompany}
                                >
                                    <SelectTrigger className="h-12 border-slate-200 rounded-xl focus:ring-indigo-500 font-semibold">
                                        <SelectValue placeholder="Select Company" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2.5">
                                <Label className="text-xs font-black uppercase text-slate-500 ml-1">Employee</Label>
                                <Select
                                    value={formData.hrms_id}
                                    onValueChange={(val) => setFormData({ ...formData, hrms_id: val })}
                                >
                                    <SelectTrigger className="h-12 border-slate-200 rounded-xl focus:ring-indigo-500 font-semibold">
                                        <SelectValue placeholder="Select Employee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.filter(e => !formData.company || e.company === formData.company).map(e => (
                                            <SelectItem key={e.hrms_id} value={e.hrms_id} className="font-medium">
                                                {e.name} ({e.hrms_id})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2.5">
                                <Label className="text-xs font-black uppercase text-slate-500 ml-1">Adjustment Type</Label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(val) => setFormData({ ...formData, category: val })}
                                >
                                    <SelectTrigger className="h-12 border-slate-200 rounded-xl focus:ring-indigo-500 font-semibold">
                                        <SelectValue placeholder="Select Category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value} className="font-bold">{c.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2.5">
                                <Label className="text-xs font-black uppercase text-slate-500 ml-1">Adjustment Amount</Label>
                                <div className="relative">
                                    <AEDIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" />
                                    <Input
                                        type="number"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        placeholder="0.00"
                                        className="pl-10 h-12 border-slate-200 rounded-xl focus:ring-indigo-500 font-bold"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <Label className="text-xs font-black uppercase text-slate-500 ml-1">Display Label</Label>
                            <Input
                                value={formData.label}
                                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                                placeholder="e.g., Seniority Allowance, Tool Deduction"
                                className="h-12 border-slate-200 rounded-xl focus:ring-indigo-500 font-semibold"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2.5">
                                <Label className="text-xs font-black uppercase text-slate-500 ml-1">Start Date</Label>
                                <Input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                    className="h-12 border-slate-200 rounded-xl focus:ring-indigo-500 font-semibold"
                                />
                                <p className="text-[10px] text-slate-400 ml-1">Adjustment applies from this date onwards</p>
                            </div>
                            <div className="space-y-2.5">
                                <Label className="text-xs font-black uppercase text-slate-500 ml-1">End Date (Optional)</Label>
                                <Input
                                    type="date"
                                    value={formData.end_date}
                                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                    className="h-12 border-slate-200 rounded-xl focus:ring-indigo-500 font-semibold"
                                />
                                <p className="text-[10px] text-slate-400 ml-1">Leave empty for indefinite duration</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex flex-col gap-0.5">
                                <Label className="text-sm font-bold text-slate-900">Active Status</Label>
                                <p className="text-[11px] text-slate-500 font-medium">Deactivated adjustments are ignored by payroll</p>
                            </div>
                            <Switch
                                checked={formData.is_active}
                                onCheckedChange={(val) => setFormData({ ...formData, is_active: val })}
                                className="data-[state=checked]:bg-indigo-600"
                            />
                        </div>
                    </div>
                    <DialogFooter className="p-8 bg-slate-50 border-t border-slate-100">
                        <Button variant="ghost" onClick={() => setShowDialog(false)} className="font-bold text-slate-500 hover:text-slate-700">Cancel</Button>
                        <Button onClick={handleSubmit} className="bg-slate-950 hover:bg-black px-8 font-black shadow-xl shadow-slate-200">
                            {editingAdjustment ? 'Save Changes' : 'Create Adjustment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}