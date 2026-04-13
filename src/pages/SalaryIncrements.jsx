import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Search, Plus, TrendingUp, TrendingDown, Calendar, AlertTriangle, History } from 'lucide-react';
import AEDIcon from '../components/ui/AEDIcon';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import SortableTableHead from '../components/ui/SortableTableHead';
import PINLock from '../components/ui/PINLock';

export default function SalaryIncrements() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showDialog, setShowDialog] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [sort, setSort] = useState({ key: 'effective_month', direction: 'desc' });
    const [salaryUnlocked, setSalaryUnlocked] = useState(false);
    
    const [formData, setFormData] = useState({
        employee_id: '',
        attendance_id: '',
        name: '',
        effective_month: '',
        new_basic_salary: 0,
        new_allowances: 0,
        new_allowances_with_bonus: 0,
        increment_reason: '',
        notes: '',
        change_type: 'increment'
    });

    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdmin = userRole === 'admin';
    const canAccess = ['admin', 'supervisor', 'ceo', 'hr_manager'].includes(userRole);

    // Only fetch Al Maraghi Motors employees
    const { data: employees = [] } = useQuery({
        queryKey: ['employees', 'Al Maraghi Motors'],
        queryFn: () => base44.entities.Employee.filter({ company: 'Al Maraghi Motors', active: true })
    });

    // Fetch current salaries for Al Maraghi Motors
    const { data: salaries = [] } = useQuery({
        queryKey: ['salaries', 'Al Maraghi Motors'],
        queryFn: () => base44.entities.EmployeeSalary.filter({ company: 'Al Maraghi Motors', active: true })
    });

    // Fetch all salary increments
    const { data: increments = [], isLoading: loadingIncrements } = useQuery({
        queryKey: ['salaryIncrements'],
        queryFn: () => base44.entities.SalaryIncrement.filter({ company: 'Al Maraghi Motors' }, '-effective_month')
    });

    const createIncrementMutation = useMutation({
        mutationFn: async (data) => {
            // Calculate new total
            const newTotal = Number(data.new_basic_salary) + Number(data.new_allowances) + Number(data.new_allowances_with_bonus);
            
            // Get current salary for previous values
            const currentSalary = salaries.find(s => 
                String(s.employee_id) === String(data.employee_id)
            );

            if (data.change_type === 'increment' && newTotal <= (currentSalary?.total_salary || 0)) {
                throw new Error('New salary must be higher than current salary for an increment.');
            }
            if (data.change_type === 'decrement' && newTotal >= (currentSalary?.total_salary || 0)) {
                throw new Error('New salary must be lower than current salary for a decrement.');
            }
            
            // Format effective_month to YYYY-MM-01
            const effectiveMonth = data.effective_month.length === 7 
                ? `${data.effective_month}-01` 
                : data.effective_month;
            
            // Check if increment already exists for this employee and month
            const existingIncrement = increments.find(inc => 
                String(inc.employee_id) === String(data.employee_id) &&
                inc.effective_month === effectiveMonth
            );
            
            if (existingIncrement) {
                throw new Error(`A salary change already exists for this employee effective ${effectiveMonth}. Edit or delete the existing one first.`);
            }
            
            return base44.entities.SalaryIncrement.create({
                employee_id: String(data.employee_id),
                attendance_id: String(data.attendance_id),
                name: data.name,
                company: 'Al Maraghi Motors',
                effective_month: effectiveMonth,
                previous_basic_salary: currentSalary?.basic_salary || 0,
                previous_allowances: Number(currentSalary?.allowances) || 0,
                previous_allowances_with_bonus: currentSalary?.allowances_with_bonus || 0,
                previous_total_salary: currentSalary?.total_salary || 0,
                new_basic_salary: Number(data.new_basic_salary),
                new_allowances: Number(data.new_allowances),
                new_allowances_with_bonus: Number(data.new_allowances_with_bonus),
                new_total_salary: newTotal,
                increment_reason: data.increment_reason || '',
                increment_type: data.change_type,
                notes: data.notes || '',
                active: true
            });
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries(['salaryIncrements']);
            if (variables.change_type === 'decrement') {
                toast.success('Salary decrement recorded successfully');
            } else {
                toast.success('Salary increment recorded successfully');
            }
            setShowDialog(false);
            resetForm();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to create salary change');
        }
    });

    // Fetch finalized salary snapshots to check if increments are used
    const { data: salarySnapshots = [] } = useQuery({
        queryKey: ['salarySnapshots', 'Al Maraghi Motors'],
        queryFn: async () => {
            // Get all salary snapshots for Al Maraghi Motors from finalized reports
            const snapshots = await base44.entities.SalarySnapshot.filter({ });
            return snapshots;
        },
        enabled: salaryUnlocked
    });

    // Check if an increment has been used in any finalized salary snapshot
    const isIncrementUsed = (increment) => {
        if (!increment || salarySnapshots.length === 0) return false;
        
        // An increment is "used" if any snapshot exists where:
        // - Same employee (by employee_id or attendance_id)
        // - Snapshot's salary_month_start >= increment.effective_month
        // This means the increment was applicable during that salary period
        return salarySnapshots.some(snapshot => {
            const sameEmployee = String(snapshot.hrms_id) === String(increment.employee_id) ||
                                 String(snapshot.attendance_id) === String(increment.attendance_id);
            
            if (!sameEmployee) return false;
            
            // Check if snapshot's salary month is on or after increment effective date
            const snapshotMonth = snapshot.salary_month_start || snapshot.created_date?.substring(0, 10);
            return snapshotMonth && snapshotMonth >= increment.effective_month;
        });
    };

    const deleteIncrementMutation = useMutation({
        mutationFn: async (increment) => {
            // Double-check on delete that increment is not used
            if (isIncrementUsed(increment)) {
                throw new Error('This salary increment has been used in finalized payroll and cannot be deleted.');
            }
            return base44.entities.SalaryIncrement.delete(increment.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['salaryIncrements']);
            toast.success('Salary increment deleted');
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to delete salary increment');
        }
    });

    const resetForm = () => {
        setFormData({
            employee_id: '',
            attendance_id: '',
            name: '',
            effective_month: '',
            new_basic_salary: 0,
            new_allowances: 0,
            new_allowances_with_bonus: 0,
            increment_reason: '',
            notes: '',
            change_type: 'increment'
        });
        setSelectedEmployeeId('');
    };

    const handleEmployeeSelect = (employeeId) => {
        setSelectedEmployeeId(employeeId);
        const employee = employees.find(e => e.id === employeeId);
        const currentSalary = salaries.find(s => 
            String(s.employee_id) === String(employee?.hrms_id)
        );
        
        if (employee) {
            setFormData(prev => ({
                ...prev,
                employee_id: String(employee.hrms_id),
                attendance_id: String(employee.attendance_id),
                name: employee.name,
                // Pre-fill with current salary values
                new_basic_salary: currentSalary?.basic_salary || 0,
                new_allowances: Number(currentSalary?.allowances) || 0,
                new_allowances_with_bonus: currentSalary?.allowances_with_bonus || 0
            }));
        }
    };

    const handleSubmit = () => {
        if (!formData.employee_id || !formData.effective_month) {
            toast.error('Please select an employee and effective month');
            return;
        }
        if (formData.new_basic_salary <= 0) {
            toast.error('Basic salary must be greater than 0');
            return;
        }
        createIncrementMutation.mutate(formData);
    };

    const handleDelete = (increment) => {
        // Check if increment is used BEFORE showing confirm dialog
        if (isIncrementUsed(increment)) {
            toast.error('This salary increment has been used in finalized payroll and cannot be deleted.');
            return;
        }
        
        if (window.confirm('Delete this salary increment record? This action cannot be undone.')) {
            deleteIncrementMutation.mutate(increment);
        }
    };

    const filteredIncrements = useMemo(() => {
        return increments
            .filter(inc => {
                const searchLower = searchTerm.toLowerCase();
                return inc.name?.toLowerCase().includes(searchLower) || 
                       inc.attendance_id?.toLowerCase().includes(searchLower) ||
                       inc.employee_id?.toLowerCase().includes(searchLower);
            })
            .sort((a, b) => {
                let aVal = a[sort.key];
                let bVal = b[sort.key];
                
                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();
                
                if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
    }, [increments, searchTerm, sort]);

    // Group increments by employee for summary
    const employeeIncrementSummary = useMemo(() => {
        const summary = {};
        increments.forEach(inc => {
            if (!summary[inc.employee_id]) {
                summary[inc.employee_id] = {
                    name: inc.name,
                    attendance_id: inc.attendance_id,
                    count: 0,
                    latestEffective: null
                };
            }
            summary[inc.employee_id].count++;
            if (!summary[inc.employee_id].latestEffective || 
                inc.effective_month > summary[inc.employee_id].latestEffective) {
                summary[inc.employee_id].latestEffective = inc.effective_month;
            }
        });
        return summary;
    }, [increments]);

    const formatMonth = (dateStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    };

    const formatCurrencyValue = (amount) => {
        return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const CurrencyDisplay = ({ amount, className = '' }) => (
        <span className={`inline-flex items-center gap-1 ${className}`}>
            <AEDIcon className="w-3.5 h-3.5" />{formatCurrencyValue(amount)}
        </span>
    );

    if (!canAccess) {
        return (
            <div className="space-y-6">
                <Breadcrumb items={[{ label: 'Salary Changes' }]} />
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-12 text-center">
                        <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                        <p className="text-slate-600">Access restricted to Admin only</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PINLock onUnlock={(unlocked) => setSalaryUnlocked(unlocked)} storageKey="salary_increment_pin" />
            
            {!salaryUnlocked && (
                <div className="flex items-center justify-center py-12 text-slate-500">
                    <p>Please unlock the salary section to continue.</p>
                </div>
            )}
            
            {salaryUnlocked && (
                <>
                    <Breadcrumb items={[{ label: 'Salary Changes' }]} />

                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Salary Changes</h1>
                            <p className="text-slate-600 mt-1">
                                Manage permanent salary changes with effective dates (Al Maraghi Motors only)
                            </p>
                        </div>
                        <Button onClick={() => setShowDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Record Salary Change
                        </Button>
                    </div>

                    {/* Info Banner */}
                    <Card className="border-amber-200 bg-amber-50">
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                                <div className="text-sm text-amber-900">
                                    <p className="font-medium mb-1">How Salary Changes Work:</p>
                                    <ul className="list-disc ml-4 space-y-1">
                                        <li>Changes are <strong>permanent</strong> effective from a specific month</li>
                                        <li>Salary calculations use the <strong>salary valid for that month</strong></li>
                                        <li>OT and previous-month deductions use <strong>historical salary</strong> (not current)</li>
                                        <li>This does NOT affect attendance data, only salary calculations</li>
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-4">
                        <Card className="border-0 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 rounded-lg">
                                        <TrendingUp className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-slate-900">{increments.length}</p>
                                        <p className="text-sm text-slate-600">Total Changes</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-0 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-100 rounded-lg">
                                        <AEDIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-slate-900">{Object.keys(employeeIncrementSummary).length}</p>
                                        <p className="text-sm text-slate-600">Employees with Changes</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-0 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-100 rounded-lg">
                                        <Calendar className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-slate-900">
                                            {increments.filter(i => {
                                                const now = new Date();
                                                const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                                                return i.effective_month === thisMonth;
                                            }).length}
                                        </p>
                                        <p className="text-sm text-slate-600">This Month</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Search */}
                    <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Search by name or ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Increments Table */}
                    <Card className="border-0 shadow-sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="w-5 h-5" />
                                Salary Change History ({filteredIncrements.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loadingIncrements ? (
                                <div className="text-center py-12 text-slate-500">Loading...</div>
                            ) : filteredIncrements.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <TrendingUp className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                    <p>No salary changes recorded yet.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <SortableTableHead sortKey="attendance_id" currentSort={sort} onSort={setSort}>
                                                    Attendance ID
                                                </SortableTableHead>
                                                <SortableTableHead sortKey="name" currentSort={sort} onSort={setSort}>
                                                    Name
                                                </SortableTableHead>
                                                <SortableTableHead sortKey="effective_month" currentSort={sort} onSort={setSort}>
                                                    Effective Month
                                                </SortableTableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Previous Salary</TableHead>
                                                <TableHead>New Salary</TableHead>
                                                <TableHead>Change</TableHead>
                                                <TableHead>Reason</TableHead>
                                                <TableHead>Created</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredIncrements.map((increment) => {
                                                const change = (increment.new_total_salary || 0) - (increment.previous_total_salary || 0);
                                                const changePercent = increment.previous_total_salary > 0 
                                                    ? ((Math.abs(change) / increment.previous_total_salary) * 100).toFixed(1)
                                                    : 0;
                                                
                                                const derivedType = increment.increment_type || (change >= 0 ? 'increment' : 'decrement');
                                                
                                                return (
                                                    <TableRow key={increment.id}>
                                                        <TableCell className="font-medium">{increment.attendance_id}</TableCell>
                                                        <TableCell>{increment.name}</TableCell>
                                                        <TableCell>
                                                            <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-sm font-medium">
                                                                {formatMonth(increment.effective_month)}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                                derivedType === 'increment' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                            }`}>
                                                                {derivedType === 'increment' ? 'Increment ↑' : 'Decrement ↓'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-slate-600">
                                                            <CurrencyDisplay amount={increment.previous_total_salary} />
                                                        </TableCell>
                                                        <TableCell className={`font-semibold ${derivedType === 'increment' ? 'text-green-700' : 'text-red-700'}`}>
                                                            <CurrencyDisplay amount={increment.new_total_salary} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className={`px-2 py-1 flex items-center w-max gap-1 rounded text-xs font-medium ${
                                                                change > 0 ? 'bg-green-100 text-green-800' : 
                                                                change < 0 ? 'bg-red-100 text-red-800' : 
                                                                'bg-slate-100 text-slate-600'
                                                            }`}>
                                                                {change > 0 && <TrendingUp className="w-3 h-3" />}
                                                                {change < 0 && <TrendingDown className="w-3 h-3" />}
                                                                {change >= 0 ? '+' : '-'}<CurrencyDisplay amount={Math.abs(change)} /> ({changePercent}%)
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-slate-600">
                                                            {increment.increment_reason || '-'}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-slate-500">
                                                            {new Date(increment.created_date).toLocaleDateString()}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {isIncrementUsed(increment) ? (
                                                                <span className="text-xs text-slate-400 px-2 py-1 bg-slate-100 rounded" title="Used in finalized salary. Deletion locked.">
                                                                    🔒 Locked
                                                                </span>
                                                            ) : (
                                                                <Button 
                                                                    size="sm" 
                                                                    variant="ghost"
                                                                    onClick={() => handleDelete(increment)}
                                                                    className="text-red-600 hover:text-red-800"
                                                                >
                                                                    Delete
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Add Increment Dialog */}
                    <Dialog open={showDialog} onOpenChange={(open) => {
                        if (!open) {
                            setShowDialog(false);
                            resetForm();
                        }
                    }}>
                        <DialogContent className="max-w-2xl gap-2">
                            <DialogHeader>
                                <DialogTitle>
                                    {formData.change_type === 'increment' ? 'Record Salary Increment' : 'Record Salary Decrement'}
                                </DialogTitle>
                            </DialogHeader>
                            
                            <div className="grid grid-cols-2 gap-4 py-4">
                                <div className="col-span-2 flex gap-2 mb-2">
                                    <Button 
                                        type="button"
                                        variant={formData.change_type === 'increment' ? 'default' : 'outline'}
                                        className={formData.change_type === 'increment' ? 'bg-green-600 hover:bg-green-700 flex-1' : 'flex-1'}
                                        onClick={() => setFormData({...formData, change_type: 'increment'})}
                                    >
                                        Increment ↑
                                    </Button>
                                    <Button 
                                        type="button"
                                        variant={formData.change_type === 'decrement' ? 'default' : 'outline'}
                                        className={formData.change_type === 'decrement' ? 'bg-red-600 hover:bg-red-700 flex-1' : 'flex-1'}
                                        onClick={() => setFormData({...formData, change_type: 'decrement'})}
                                    >
                                        Decrement ↓
                                    </Button>
                                </div>

                                <div className="col-span-2">
                                    <Label>Employee</Label>
                                    <Select 
                                        value={selectedEmployeeId} 
                                        onValueChange={handleEmployeeSelect}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select employee" />
                                        </SelectTrigger>
                                        <SelectContent filter={true}>
                                            {employees.map(emp => {
                                                const currentSalary = salaries.find(s => 
                                                    String(s.employee_id) === String(emp.hrms_id)
                                                );
                                                return (
                                                    <SelectItem key={emp.id} value={emp.id}>
                                                        {emp.name} ({emp.attendance_id}) - Current: {currentSalary?.total_salary?.toLocaleString() || 'N/A'} AED
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="col-span-2">
                                    <Label>Effective Month</Label>
                                    <Input
                                        type="month"
                                        value={formData.effective_month}
                                        onChange={(e) => setFormData({...formData, effective_month: e.target.value})}
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        The increment will apply from this month onward for all salary calculations.
                                    </p>
                                </div>

                                <div>
                                    <Label>New Basic Salary (AED)</Label>
                                    <Input
                                        type="number"
                                        value={formData.new_basic_salary}
                                        onChange={(e) => setFormData({...formData, new_basic_salary: parseFloat(e.target.value) || 0})}
                                    />
                                    {formData.employee_id && (
                                        <p className="text-xs text-slate-500 mt-1">
                                            Current: AED {salaries.find(s => String(s.employee_id) === formData.employee_id)?.basic_salary?.toLocaleString() || 0}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <Label>New Allowances (AED)</Label>
                                    <Input
                                        type="number"
                                        value={formData.new_allowances}
                                        onChange={(e) => setFormData({...formData, new_allowances: parseFloat(e.target.value) || 0})}
                                    />
                                    {formData.employee_id && (
                                        <p className="text-xs text-slate-500 mt-1">
                                            Current: AED {salaries.find(s => String(s.employee_id) === formData.employee_id)?.allowances?.toLocaleString() || 0}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <Label>New Allowances + Bonus (AED)</Label>
                                    <Input
                                        type="number"
                                        value={formData.new_allowances_with_bonus}
                                        onChange={(e) => setFormData({...formData, new_allowances_with_bonus: parseFloat(e.target.value) || 0})}
                                    />
                                    {formData.employee_id && (
                                        <p className="text-xs text-slate-500 mt-1">
                                            Current: AED {salaries.find(s => String(s.employee_id) === formData.employee_id)?.allowances_with_bonus?.toLocaleString() || 0}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <Label>{formData.change_type === 'increment' ? 'Increment Reason' : 'Decrement Reason'}</Label>
                                    <Select 
                                        value={formData.increment_reason} 
                                        onValueChange={(val) => setFormData({...formData, increment_reason: val})}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select reason" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Annual Review">Annual Review</SelectItem>
                                            <SelectItem value="Promotion">Promotion</SelectItem>
                                            <SelectItem value="Performance Bonus">Performance Bonus</SelectItem>
                                            <SelectItem value="Market Adjustment">Market Adjustment</SelectItem>
                                            <SelectItem value="Contract Renewal">Contract Renewal</SelectItem>
                                            <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="col-span-2">
                                    <Label>Notes (optional)</Label>
                                    <Textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                        placeholder="Additional notes about this increment..."
                                        rows={2}
                                    />
                                </div>

                                <div className="col-span-2 bg-slate-50 rounded-lg p-4">
                                    <div className="text-sm text-slate-600">New Total Salary</div>
                                    <div className={`text-2xl font-bold inline-flex items-center gap-1 ${formData.change_type === 'decrement' ? 'text-red-600' : 'text-green-600'}`}>
                                        <AEDIcon className="w-6 h-6" />{Number(
                                            formData.new_basic_salary + 
                                            formData.new_allowances +
                                            formData.new_allowances_with_bonus
                                        ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => {
                                    setShowDialog(false);
                                    resetForm();
                                }}>
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={handleSubmit}
                                    disabled={!formData.employee_id || !formData.effective_month || formData.new_basic_salary <= 0}
                                    className="bg-indigo-600 hover:bg-indigo-700"
                                >
                                    Save Salary Change
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            )}
        </div>
    );
}