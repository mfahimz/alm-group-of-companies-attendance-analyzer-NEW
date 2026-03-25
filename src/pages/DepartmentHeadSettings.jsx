import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Users, Search, Filter, CheckCircle, TreePine } from 'lucide-react';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import HierarchyTree from '../components/departmenthead/HierarchyTree';

export default function DepartmentHeadSettings() {
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedCEOUser, setSelectedCEOUser] = useState('');
    const [selectedManagedEmployees, setSelectedManagedEmployees] = useState([]);
    const [selectedReportsTo, setSelectedReportsTo] = useState('');
    const [editingHead, setEditingHead] = useState(null);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCompany, setFilterCompany] = useState('all');
    const [filterDepartment, setFilterDepartment] = useState('all');
    const [managedEmployeesSearch, setManagedEmployeesSearch] = useState('');
    const [editManagedEmployeesSearch, setEditManagedEmployeesSearch] = useState('');
    const [activeTab, setActiveTab] = useState('manage');
    const [isAGM, setIsAGM] = useState(false);
    const queryClient = useQueryClient();

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const { data: deptHeads = [] } = useQuery({
        queryKey: ['deptHeads'],
        queryFn: () => base44.entities.DepartmentHead.list()
    });

    const { data: companySettings = [] } = useQuery({
        queryKey: ['companySettings'],
        queryFn: () => base44.entities.CompanySettings.list()
    });

    const { data: users = [] } = useQuery({
        queryKey: ['users'],
        queryFn: () => base44.entities.User.list()
    });

    const { data: companiesData = [] } = useQuery({
        queryKey: ['companies'],
        queryFn: () => base44.entities.Company.list()
    });

    const companies = companiesData.filter(c => c.active).map(c => c.name);

    const departments = React.useMemo(() => {
        if (!selectedCompany) return [];
        const setting = companySettings.find(s => s.company === selectedCompany);
        if (!setting) return ['Admin', 'Executive'];
        return ['Admin', 'Executive', ...setting.departments.split(',').map(d => d.trim()).filter(Boolean)];
    }, [selectedCompany, companySettings]);

    const assignedDeptHeadIds = deptHeads.filter(dh => dh.active).map(dh => dh.employee_id);
    const managedEmployeeIds = deptHeads.filter(dh => dh.active && dh.managed_employee_ids).flatMap(dh => dh.managed_employee_ids.split(',').filter(Boolean));

    const availableEmployees = employees.filter(e => {
        if (e.company !== selectedCompany || !e.active) return false;
        if (editingHead && e.id === editingHead.employee_id) return true;
        return !assignedDeptHeadIds.includes(e.id);
    });

    const availableReportsTo = deptHeads
        .filter(dh => dh.company === selectedCompany && dh.active && (!editingHead || dh.id !== editingHead.id))
        .sort((a, b) => {
            if (a.department === 'Executive' && b.department !== 'Executive') return -1;
            if (b.department === 'Executive' && a.department !== 'Executive') return 1;
            return 0;
        });

    const isAssistantGM = (dh) => {
        if (!dh.employee_id) return false;
        const emp = employees.find(e => e.id === dh.employee_id);
        const user = users.find(u => u.hrms_id === emp?.hrms_id);
        return user?.extended_role === 'assistant_gm';
    };

    const getDeptHeadName = (deptHeadOrId) => {
        if (!deptHeadOrId) return 'Unknown';
        if (typeof deptHeadOrId === 'object') {
            if (deptHeadOrId.department === 'Executive' && deptHeadOrId.user_email) {
                const user = users.find(u => u.email === deptHeadOrId.user_email);
                return user?.full_name || deptHeadOrId.user_email;
            }
            const emp = employees.find(e => e.id === deptHeadOrId.employee_id);
            return emp?.name || 'Unknown';
        }
        const emp = employees.find(e => e.id === deptHeadOrId);
        return emp?.name || 'Unknown';
    };

    const getReportsToName = (reportsToValue) => {
        if (reportsToValue === 'HR_MANAGER' || reportsToValue === 'none') {
            return reportsToValue === 'HR_MANAGER' ? 'HR Manager' : '—';
        }
        const dh = deptHeads.find(d => d.id === reportsToValue);
        if (!dh) return '—';
        const name = getDeptHeadName(dh);
        if (dh.department === 'Executive') return `👑 CEO - ${name}`;
        if (isAssistantGM(dh)) return `🛡️ AGM - ${name}`;
        return name;
    };

    const createMutation = useMutation({
        mutationFn: async () => {
            if (selectedDepartment === 'Executive') {
                if (!selectedCompany || !selectedCEOUser) throw new Error('Company and CEO required');
                const dup = deptHeads.find(dh => dh.active && dh.company === selectedCompany && dh.department === 'Executive');
                if (dup) throw new Error('Company already has a CEO');
                await base44.entities.DepartmentHead.create({ company: selectedCompany, department: 'Executive', employee_id: null, user_email: selectedCEOUser, managed_employee_ids: selectedManagedEmployees.join(','), reports_to: selectedReportsTo === 'none' ? null : selectedReportsTo, active: true });
                const user = users.find(u => u.email === selectedCEOUser);
                if (user && !['ceo', 'hr_manager'].includes(user.extended_role || user.role)) {
                    await base44.entities.User.update(user.id, { extended_role: 'ceo', company: selectedCompany });
                }
            } else if (isAGM) {
                if (!selectedCompany || !selectedDepartment || !selectedEmployee) throw new Error('All fields required');
                const dup = deptHeads.find(dh => dh.active && dh.company === selectedCompany && isAssistantGM(dh));
                if (dup) throw new Error('Company already has Assistant GM');
                await base44.entities.DepartmentHead.create({ company: selectedCompany, department: selectedDepartment, employee_id: selectedEmployee, user_email: null, managed_employee_ids: selectedManagedEmployees.join(','), reports_to: selectedReportsTo === 'none' ? null : selectedReportsTo, active: true });
                const emp = employees.find(e => e.id === selectedEmployee);
                const user = users.find(u => u.hrms_id === emp?.hrms_id);
                if (user) await base44.entities.User.update(user.id, { extended_role: 'assistant_gm', company: selectedCompany });
            } else {
                if (!selectedCompany || !selectedDepartment || !selectedEmployee) throw new Error('All fields required');
                const dup = deptHeads.find(dh => dh.active && dh.company === selectedCompany && dh.department === selectedDepartment);
                if (dup) throw new Error('Department head exists for this department');
                await base44.entities.DepartmentHead.create({ company: selectedCompany, department: selectedDepartment, employee_id: selectedEmployee, user_email: null, managed_employee_ids: selectedManagedEmployees.join(','), reports_to: selectedReportsTo === 'none' ? null : selectedReportsTo, active: true });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['deptHeads'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setSelectedCompany(''); setSelectedDepartment(''); setSelectedEmployee(''); setSelectedCEOUser(''); setSelectedManagedEmployees([]); setSelectedReportsTo(''); setIsAGM(false);
            toast.success('Assigned successfully');
        },
        onError: (err) => toast.error(err.message)
    });

    const updateMutation = useMutation({
        mutationFn: async (data) => {
            await base44.entities.DepartmentHead.update(editingHead.id, { managed_employee_ids: data.managed_employee_ids, reports_to: data.reports_to === 'none' ? null : data.reports_to });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['deptHeads'] });
            setShowEditDialog(false); setEditingHead(null);
            toast.success('Updated successfully');
        },
        onError: (err) => toast.error(err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.DepartmentHead.delete(id),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['deptHeads'] }); toast.success('Removed'); }
    });

    const handleEditClick = (dh) => {
        setEditingHead(dh);
        const managed = dh.managed_employee_ids ? dh.managed_employee_ids.split(',').filter(Boolean) : [];
        setSelectedManagedEmployees(managed.length ? managed : employees.filter(e => e.company === dh.company && e.active && e.department === dh.department).map(e => e.id));
        setSelectedReportsTo(dh.reports_to || 'none');
        setEditManagedEmployeesSearch('');
        setShowEditDialog(true);
    };

    const toggleManagedEmployee = (id) => {
        if (assignedDeptHeadIds.includes(id) && !selectedManagedEmployees.includes(id)) {
            toast.error('Employee is already a head');
            return;
        }
        setSelectedManagedEmployees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const filtered = deptHeads.filter(dh => dh.active && dh.department !== 'Executive' && !isAssistantGM(dh) && (searchTerm === '' || getDeptHeadName(dh).toLowerCase().includes(searchTerm.toLowerCase()) || dh.department.toLowerCase().includes(searchTerm.toLowerCase())) && (filterCompany === 'all' || dh.company === filterCompany) && (filterDepartment === 'all' || dh.department === filterDepartment));
    const agms = deptHeads.filter(dh => dh.active && isAssistantGM(dh) && (searchTerm === '' || getDeptHeadName(dh).toLowerCase().includes(searchTerm.toLowerCase())) && (filterCompany === 'all' || dh.company === filterCompany));
    const ceos = deptHeads.filter(dh => dh.active && dh.department === 'Executive' && (searchTerm === '' || getDeptHeadName(dh).toLowerCase().includes(searchTerm.toLowerCase())) && (filterCompany === 'all' || dh.company === filterCompany));

    return (
        <div className="space-y-6">
            <Breadcrumb items={[{ label: 'Settings', href: 'RulesSettings' }, { label: 'Department Heads' }]} />
            <div><h1 className="text-3xl font-bold">Department Head Settings</h1><p className="text-slate-600">Manage hierarchies, AGMs, and CEOs</p></div>

            <div className="flex gap-2 border-b border-slate-200">
                <button onClick={() => setActiveTab('manage')} className={`px-4 py-3 font-medium border-b-2 ${activeTab === 'manage' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600'}`}>Manage</button>
                <button onClick={() => setActiveTab('tree')} className={`px-4 py-3 font-medium border-b-2 inline-flex items-center gap-2 ${activeTab === 'tree' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600'}`}><TreePine className="w-4 h-4" />Tree View</button>
            </div>

            {activeTab === 'manage' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card><CardContent className="p-4 flex justify-between"><div><p className="text-sm text-slate-500">Heads</p><p className="text-2xl font-bold">{deptHeads.filter(d => d.active).length}</p></div><Users className="w-8 h-8 opacity-10" /></CardContent></Card>
                        <Card><CardContent className="p-4 flex justify-between"><div><p className="text-sm text-slate-500">Managed</p><p className="text-2xl font-bold text-blue-600">{deptHeads.filter(d => d.active).reduce((s, h) => s + (h.managed_employee_ids ? h.managed_employee_ids.split(',').filter(Boolean).length : 0), 0)}</p></div><Users className="w-8 h-8 opacity-10 text-blue-600" /></CardContent></Card>
                        <Card><CardContent className="p-4 flex justify-between"><div><p className="text-sm text-slate-500">Companies</p><p className="text-2xl font-bold text-purple-600">{[...new Set(deptHeads.filter(d => d.active).map(d => d.company))].length}</p></div><CheckCircle className="w-8 h-8 opacity-10 text-purple-600" /></CardContent></Card>
                    </div>

                    <Card className="border-0 shadow-lg">
                        <CardHeader><CardTitle>Assign New Head / AGM / CEO</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2"><Label>Company</Label><Select value={selectedCompany} onValueChange={v => { setSelectedCompany(v); setSelectedDepartment(''); setSelectedEmployee(''); setSelectedManagedEmployees([]); setSelectedReportsTo(''); setIsAGM(false); }}><SelectTrigger><SelectValue placeholder="Company" /></SelectTrigger><SelectContent>{companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                                <div className="space-y-2"><Label>Department</Label><Select value={selectedDepartment} onValueChange={setSelectedDepartment} disabled={!selectedCompany}><SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger><SelectContent>{departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
                                {selectedDepartment === 'Executive' ? (
                                    <div className="space-y-2"><Label>CEO User</Label><Select value={selectedCEOUser} onValueChange={setSelectedCEOUser} disabled={!selectedCompany}><SelectTrigger><SelectValue placeholder="CEO" /></SelectTrigger><SelectContent>{users.filter(u => ['admin', 'ceo', 'hr_manager'].includes(u.extended_role || u.role)).map(u => <SelectItem key={u.id} value={u.email}>{u.full_name}</SelectItem>)}</SelectContent></Select></div>
                                ) : (
                                    <div className="space-y-2"><Label>Employee</Label><Select value={selectedEmployee} onValueChange={setSelectedEmployee} disabled={!selectedCompany}><SelectTrigger><SelectValue placeholder="Employee" /></SelectTrigger><SelectContent>{availableEmployees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
                                )}
                            </div>
                            {selectedDepartment && selectedDepartment !== 'Executive' && (
                                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3">
                                    <input type="checkbox" id="isagm" checked={isAGM} onChange={e => setIsAGM(e.target.checked)} /><Label htmlFor="isagm" className="cursor-pointer font-bold text-indigo-900">Mark as Assistant General Manager (Max 1/company)</Label>
                                </div>
                            )}
                            {selectedCompany && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2"><Label>Managed Team ({selectedManagedEmployees.length})</Label><div className="border rounded-lg bg-slate-50 overflow-hidden"><div className="p-2 border-b bg-white"><Input placeholder="Search..." value={managedEmployeesSearch} onChange={e => setManagedEmployeesSearch(e.target.value)} /></div><div className="p-2 max-h-40 overflow-y-auto">{availableEmployees.filter(e => e.name.toLowerCase().includes(managedEmployeesSearch.toLowerCase())).map(e => <label key={e.id} className="flex items-center gap-2 p-1 hover:bg-slate-200 rounded cursor-pointer"><input type="checkbox" checked={selectedManagedEmployees.includes(e.id)} onChange={() => toggleManagedEmployee(e.id)} disabled={e.id === selectedEmployee} /><span className="text-sm">{e.name}</span></label>)}</div></div></div>
                                    <div className="space-y-2"><Label>Reports To</Label><Select value={selectedReportsTo} onValueChange={setSelectedReportsTo}><SelectTrigger><SelectValue placeholder="Superior" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="HR_MANAGER">HR Manager</SelectItem>{availableReportsTo.map(dh => <SelectItem key={dh.id} value={dh.id}>{getDeptHeadName(dh)} ({dh.department})</SelectItem>)}</SelectContent></Select></div>
                                </div>
                            )}
                            <div className="flex justify-end"><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !selectedCompany} className="bg-indigo-600 hover:bg-indigo-700">{createMutation.isPending ? 'Saving...' : 'Assign User'}</Button></div>
                        </CardContent>
                    </Card>

                    {agms.length > 0 && (
                        <Card className="border-2 border-indigo-200 shadow-lg"><CardHeader className="bg-indigo-50"><CardTitle className="text-indigo-900">Assistant General Managers</CardTitle></CardHeader><CardContent className="p-0">
                            <Table><TableHeader className="bg-indigo-50/50"><TableRow><TableHead>Company</TableHead><TableHead>Department</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{agms.map(dh => <TableRow key={dh.id} className="hover:bg-indigo-50/20"><TableCell className="font-bold">{dh.company}</TableCell><TableCell>{dh.department}</TableCell><TableCell className="font-bold">{getDeptHeadName(dh)} <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full ml-2">AGM</span></TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => handleEditClick(dh)}><Edit className="w-4 h-4" /></Button><Button variant="ghost" size="sm" onClick={() => { if (window.confirm('Delete AGM?')) deleteMutation.mutate(dh.id); }}><Trash2 className="w-4 h-4 text-red-600" /></Button></TableCell></TableRow>)}</TableBody></Table>
                        </CardContent></Card>
                    )}

                    <Card className="border-0 shadow-md">
                        <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Heads & CEOs</CardTitle><div className="flex gap-2"><Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-40" /><Select value={filterCompany} onValueChange={setFilterCompany}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div></CardHeader>
                        <CardContent className="p-0">
                            <Table><TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Department</TableHead><TableHead>Name</TableHead><TableHead>Reports To</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
                                {ceos.map(dh => <TableRow key={dh.id} className="bg-indigo-50/20 font-medium"><TableCell>{dh.company}</TableCell><TableCell className="text-indigo-700">👑 CEO</TableCell><TableCell>{getDeptHeadName(dh)}</TableCell><TableCell>{getReportsToName(dh.reports_to)}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => handleEditClick(dh)}><Edit className="w-4 h-4" /></Button><Button variant="ghost" size="sm" onClick={() => { if (window.confirm('Delete?')) deleteMutation.mutate(dh.id); }}><Trash2 className="w-4 h-4 text-red-600" /></Button></TableCell></TableRow>)}
                                {filtered.map(dh => <TableRow key={dh.id}><TableCell>{dh.company}</TableCell><TableCell>{dh.department}</TableCell><TableCell>{getDeptHeadName(dh)}</TableCell><TableCell>{getReportsToName(dh.reports_to)}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => handleEditClick(dh)}><Edit className="w-4 h-4" /></Button><Button variant="ghost" size="sm" onClick={() => { if (window.confirm('Delete?')) deleteMutation.mutate(dh.id); }}><Trash2 className="w-4 h-4 text-red-600" /></Button></TableCell></TableRow>)}
                            </TableBody></Table>
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeTab === 'tree' && (
                <Card className="border-0 shadow-md"><CardHeader><CardTitle>Hierarchy Tree</CardTitle></CardHeader><CardContent><HierarchyTree deptHeads={deptHeads} employees={employees} filterCompany={filterCompany === 'all' ? selectedCompany : filterCompany} /></CardContent></Card>
            )}

            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}><DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>Edit: {editingHead && getDeptHeadName(editingHead)}</DialogTitle></DialogHeader>
                {editingHead && (
                    <div className="space-y-6 pt-4">
                        <div className="space-y-2"><Label>Reports To</Label><Select value={selectedReportsTo} onValueChange={setSelectedReportsTo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="HR_MANAGER">HR Manager</SelectItem>{deptHeads.filter(h => h.active && h.company === editingHead.company && h.id !== editingHead.id).map(h => <SelectItem key={h.id} value={h.id}>{getDeptHeadName(h)} ({h.department})</SelectItem>)}</SelectContent></Select></div>
                        <div className="space-y-2"><Label>Team ({selectedManagedEmployees.length})</Label><div className="border rounded bg-slate-50"><div className="p-2 border-b bg-white"><Input placeholder="Search..." value={editManagedEmployeesSearch} onChange={e => setEditManagedEmployeesSearch(e.target.value)} /></div><div className="p-2 max-h-40 overflow-y-auto">{employees.filter(e => e.company === editingHead.company && e.active && e.name.toLowerCase().includes(editManagedEmployeesSearch.toLowerCase())).map(e => <label key={e.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-200 rounded cursor-pointer"><input type="checkbox" checked={selectedManagedEmployees.includes(e.id)} onChange={() => toggleManagedEmployee(e.id)} disabled={e.id === editingHead.employee_id} /><span>{e.name}</span></label>)}</div></div></div>
                        <div className="flex justify-end gap-2 pt-4"><Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button><Button onClick={() => updateMutation.mutate({ managed_employee_ids: selectedManagedEmployees.join(','), reports_to: selectedReportsTo })} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">Save</Button></div>
                    </div>
                )}
            </DialogContent></Dialog>
        </div>
    );
}