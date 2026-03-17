import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
    Plus, 
    Trash2, 
    Building2, 
    Users, 
    Loader2,
    FileDown,
    Upload
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

// Statuses remain static as they are part of the business workflow, 
// but Companies are now fetched live from the Company entity.
const STATUSES = ['Open', 'Watch'];

/**
 * CompanyRoleMaster handles the master list of roles.
 * All company references are now dynamic from the Company entity.
 * No company names are hardcoded.
 */

function InlineRoleRow({ role, onSave, onDelete, companies }) {
    const [localRole, setLocalRole] = useState(role);

    const handleBlur = (field, value) => {
        if (role[field] !== value) {
            onSave({ ...role, [field]: value });
        }
    };

    const handleKeyDown = (e, field, value) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    };

    return (
        <tr className="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td className="py-3 px-4">
                <Input
                    className="h-8 text-sm focus:bg-white border-transparent hover:border-slate-200"
                    value={localRole.role_title}
                    onChange={(e) => setLocalRole({ ...localRole, role_title: e.target.value })}
                    onBlur={(e) => handleBlur('role_title', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'role_title', e.target.value)}
                    placeholder="Enter role title..."
                />
            </td>
            <td className="py-3 px-4">
                <select
                    className="h-8 w-full bg-transparent text-sm border-transparent hover:border-slate-200 rounded-md px-2 focus:bg-white focus:border-slate-300 outline-none"
                    value={localRole.company}
                    onChange={(e) => {
                        const val = e.target.value;
                        setLocalRole({ ...localRole, company: val });
                        onSave({ ...role, company: val });
                    }}
                >
                    {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
            </td>
            <td className="py-3 px-4">
                <select
                    className="h-8 w-full bg-transparent text-sm border-transparent hover:border-slate-200 rounded-md px-2 focus:bg-white focus:border-slate-300 outline-none"
                    value={localRole.status}
                    onChange={(e) => {
                        const val = e.target.value;
                        setLocalRole({ ...localRole, status: val });
                        onSave({ ...role, status: val });
                    }}
                >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </td>
            <td className="py-3 px-4 text-right">
                <button 
                    onClick={() => onDelete(role.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </td>
        </tr>
    );
}

export default function CompanyRoleManager() {
    const qc = useQueryClient();

    const [isAdding, setIsAdding] = useState(false);
    const [newRole, setNewRole] = useState({ role_title: '', company: '', status: 'Open' });
    const fileInputRef = React.useRef(null);

    const { data: roles = [], isLoading } = useQuery({
        queryKey: ['companyRoles'],
        queryFn: () => base44.entities.CompanyRoleMaster.list('-created_at', 1000)
    });

    const { data: companiesRaw = [] } = useQuery({
        queryKey: ['companies-active'],
        queryFn: () => base44.entities.Company.list()
    });

    const companies = companiesRaw.filter(c => c.active);

    const createMutation = useMutation({
        mutationFn: async (roleData) => {
            const me = await base44.auth.me();
            return base44.entities.CompanyRoleMaster.create({
                ...roleData,
                created_by: me?.email || 'System',
                created_at: new Date().toISOString()
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['companyRoles'] });
            setIsAdding(false);
            setNewRole({ role_title: '', company: '', status: 'Open' });
            toast.success('Role added successfully');
        },
        onError: (err) => toast.error('Failed to add role: ' + err.message)
    });

    const updateMutation = useMutation({
        mutationFn: (role) => {
            const { id, created_by, created_at, ...fields } = role;
            return base44.entities.CompanyRoleMaster.update(id, fields);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['companyRoles'] });
        },
        onError: (err) => toast.error('Update failed: ' + err.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.CompanyRoleMaster.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['companyRoles'] });
            toast.success('Role deleted');
        }
    });

    // Inline row logic: Handle manual save of the new role row shown at the top
    const handleSaveNewRole = () => {
        if (!newRole.role_title.trim()) { toast.error('Role title is required'); return; }
        if (!newRole.company) { toast.error('Company is required'); return; }
        createMutation.mutate(newRole);
    };

    // Excel import mapping logic: Parse file, match company names, and create records
    const handleImportExcel = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = evt.target.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet);

                if (rows.length === 0) {
                    toast.error('The selected Excel file has no data.');
                    return;
                }

                let imported = 0;
                let skipped = [];
                const me = await base44.auth.me();
                const userEmail = me?.email || 'System';

                for (const row of rows) {
                    const title = row['Role Title'] || row['role title'];
                    const company = row['Company'] || row['company'];

                    if (!title || !company) {
                        skipped.push('Missing required columns (Role Title/Company)');
                        continue;
                    }

                    const matched = companies.find(c => 
                        c.name.trim().toLowerCase() === company.trim().toLowerCase()
                    );

                    if (matched) {
                        await base44.entities.CompanyRoleMaster.create({
                            role_title: title.trim(),
                            company: matched.name,
                            status: 'Open',
                            created_by: userEmail,
                            created_at: new Date().toISOString()
                        });
                        imported++;
                    } else {
                        skipped.push(`"${company}" company not matched`);
                    }
                }

                qc.invalidateQueries({ queryKey: ['companyRoles'] });
                if (imported > 0) toast.success(`Successfully imported ${imported} roles`);
                if (skipped.length > 0) {
                    const uniqueSkipped = Array.from(new Set(skipped));
                    toast.warning(`Skipped ${skipped.length} rows. Reasons: ${uniqueSkipped.join(', ')}`);
                }
                if (imported === 0) toast.error('No roles match active companies. Nothing imported.');
            } catch (err) {
                toast.error('Failed to parse Excel file: ' + err.message);
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = ''; // Reset input to allow re-selecting same file
    };

    const groupedRoles = useMemo(() => {
        const groups = {};
        companies.forEach(c => groups[c.name] = []);
        roles.forEach(r => {
            if (groups[r.company]) {
                groups[r.company].push(r);
            }
        });
        return groups;
    }, [roles, companies]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Company Roles Master</h2>
                    <p className="text-sm text-slate-500">Define active and future roles per company.</p>
                </div>
                <div className="flex items-center gap-2">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept=".xlsx" 
                        onChange={handleImportExcel} 
                    />
                    <Button 
                        variant="outline"
                        onClick={() => fileInputRef.current.click()}
                        className="border-slate-300 text-slate-700"
                    >
                        <FileDown className="w-4 h-4 mr-2" />
                        Import from Excel
                    </Button>
                    <Button 
                        onClick={() => setIsAdding(true)} 
                        disabled={isAdding}
                        className="bg-[#0F1E36] hover:bg-[#1a3a5a]"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Role
                    </Button>
                </div>
            </div>

            {isAdding && (
                <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden shadow-sm ring-1 ring-indigo-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-indigo-50 px-4 py-2 flex items-center gap-2 border-b border-indigo-100">
                        <Plus className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Configure New Role</span>
                    </div>
                    <table className="w-full text-left">
                        <tbody className="bg-indigo-50/20">
                            <tr>
                                <td className="py-4 px-4">
                                    <Input 
                                        value={newRole.role_title} 
                                        onChange={e => setNewRole({...newRole, role_title: e.target.value})}
                                        placeholder="Enter role title..."
                                        className="h-10 bg-white border-indigo-100 focus:border-indigo-400"
                                    />
                                </td>
                                <td className="py-4 px-4 w-1/4">
                                    <select 
                                        value={newRole.company} 
                                        onChange={e => setNewRole({...newRole, company: e.target.value})}
                                        className="h-10 w-full rounded-md border border-indigo-100 text-sm px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Select Company...</option>
                                        {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </td>
                                <td className="py-4 px-4 w-1/5">
                                    <select 
                                        value={newRole.status} 
                                        onChange={e => setNewRole({...newRole, status: e.target.value})}
                                        className="h-10 w-full rounded-md border border-indigo-100 text-sm px-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </td>
                                <td className="py-4 px-4 text-right w-40 whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-2">
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            onClick={() => setIsAdding(false)}
                                            className="text-slate-500 hover:text-slate-700"
                                        >
                                            Cancel
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            onClick={handleSaveNewRole} 
                                            disabled={createMutation.isPending}
                                            className="bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Role'}
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {isLoading ? (
                <div className="py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
                </div>
            ) : (
                <div className="space-y-8">
                    {companies.map(companyObj => {
                        const company = companyObj.name;
                        return (
                            <div key={company} className="space-y-3">
                                <div className="flex items-center gap-2 bg-slate-50 p-2 px-4 rounded-lg border border-slate-100">
                                    <Building2 className="w-4 h-4 text-slate-600" />
                                    <h3 className="font-bold text-slate-800 text-sm">{company}</h3>
                                    <span className="ml-auto text-xs font-bold bg-white px-2 py-0.5 rounded border text-slate-500">
                                        {groupedRoles[company]?.length || 0} Roles
                                    </span>
                                </div>

                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-[#FAFBFD] border-b border-slate-200">
                                            <tr>
                                                <th className="py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Role Title</th>
                                                <th className="py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-1/4">Company</th>
                                                <th className="py-3 px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-1/5">Status</th>
                                                <th className="py-3 px-4 text-right w-16"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(!groupedRoles[company] || groupedRoles[company].length === 0) ? (
                                                <tr>
                                                    <td colSpan={4} className="py-8 text-center text-slate-400 text-sm italic">
                                                        No roles defined for this company
                                                    </td>
                                                </tr>
                                            ) : (
                                                groupedRoles[company].map(role => (
                                                    <InlineRoleRow 
                                                        key={role.id} 
                                                        role={role} 
                                                        onSave={(data) => updateMutation.mutate(data)}
                                                        onDelete={(id) => {
                                                            if (window.confirm('Delete this role?')) deleteMutation.mutate(id);
                                                        }}
                                                        companies={companies}
                                                    />
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
