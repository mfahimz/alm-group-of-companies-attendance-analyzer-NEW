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
    Loader2 
} from 'lucide-react';
import { toast } from 'sonner';

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
        mutationFn: async () => {
            const me = await base44.auth.me();
            if (!companies[0]?.name) {
                throw new Error('No active companies available to assign a role.');
            }
            return base44.entities.CompanyRoleMaster.create({
                role_title: 'New Role',
                company: companies[0]?.name,
                status: 'Open',
                created_by: me?.email || 'System',
                created_at: new Date().toISOString()
            });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['companyRoles'] });
            toast.success('Role added');
        },
        onError: (err) => {
            toast.error('Failed to add role: ' + err.message);
            console.error('Role creation error:', err);
        }
    });

    const updateMutation = useMutation({
        mutationFn: (role) => base44.entities.CompanyRoleMaster.update(role.id, role),
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

    const groupedRoles = useMemo(() => {
        const groups = {};
        companies.forEach(c => groups[c.name] = []);
        roles.forEach(r => {
            if (groups[r.company]) groups[r.company].push(r);
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
                <Button 
                    onClick={() => createMutation.mutate()} 
                    disabled={createMutation.isPending}
                    className="bg-[#0F1E36] hover:bg-[#1a3a5a]"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Role
                </Button>
            </div>

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
