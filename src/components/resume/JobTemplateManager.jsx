import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const DEPARTMENTS = ['Service', 'Marketing', 'Operations', 'Finance', 'HR', 'AGM'];

const EMPTY_TEMPLATE = {
    position_name: '',
    department: '',
    min_experience_years: '',
    required_education: '',
    required_skills: '',
    preferred_skills: '',
    required_certifications: '',
    required_languages: '',
    industry_experience: '',
    notes: '',
    is_active: true
};

function TemplateForm({ template, onSave, onCancel, isSaving }) {
    const [form, setForm] = useState(template || EMPTY_TEMPLATE);
    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.position_name.trim()) { toast.error('Position name is required'); return; }
        if (!form.department) { toast.error('Department is required'); return; }
        onSave(form);
    };

    return (
        <form onSubmit={handleSubmit} className="border border-[#E2E6EC] rounded-xl p-5 bg-[#FAFBFD] space-y-4">
            <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-[#1F2937]">{template?.id ? 'Edit Position Template' : 'New Position Template'}</h3>
                <button type="button" onClick={onCancel} className="text-[#9CA3AF] hover:text-[#4B5563]">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Position & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Position Name *</Label>
                    <Input placeholder="e.g. Service Technician" value={form.position_name} onChange={e => set('position_name', e.target.value)} />
                </div>
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Department *</Label>
                    <Select value={form.department} onValueChange={v => set('department', v)}>
                        <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                        <SelectContent>
                            {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Experience & Education */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Minimum Experience (years)</Label>
                    <Input type="number" min="0" max="30" placeholder="e.g. 3" value={form.min_experience_years} onChange={e => set('min_experience_years', e.target.value)} />
                </div>
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Required Education</Label>
                    <Input placeholder="e.g. Bachelor's in Mechanical Engineering" value={form.required_education} onChange={e => set('required_education', e.target.value)} />
                </div>
            </div>

            {/* Skills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Required Skills <span className="text-[#9CA3AF]">(comma-separated)</span></Label>
                    <Textarea placeholder="e.g. Automotive repair, Diagnostics, OBD-II" value={form.required_skills} onChange={e => set('required_skills', e.target.value)} className="h-20 text-sm" />
                </div>
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Preferred Skills <span className="text-[#9CA3AF]">(comma-separated)</span></Label>
                    <Textarea placeholder="e.g. ADAS, EV knowledge, German brands" value={form.preferred_skills} onChange={e => set('preferred_skills', e.target.value)} className="h-20 text-sm" />
                </div>
            </div>

            {/* Certifications, Languages, Industry */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Required Certifications</Label>
                    <Input placeholder="e.g. UAE Driving License, ASE" value={form.required_certifications} onChange={e => set('required_certifications', e.target.value)} />
                </div>
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Languages</Label>
                    <Input placeholder="e.g. English (required), Arabic (preferred)" value={form.required_languages} onChange={e => set('required_languages', e.target.value)} />
                </div>
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Industry Experience</Label>
                    <Input placeholder="e.g. Automotive, Dealership" value={form.industry_experience} onChange={e => set('industry_experience', e.target.value)} />
                </div>
            </div>

            {/* Notes for AI */}
            <div>
                <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">
                    Additional Notes for AI <span className="text-[#9CA3AF]">(anything else to consider)</span>
                </Label>
                <Textarea
                    placeholder="e.g. Must be available for split shifts. Preference for candidates with UAE/GCC experience. Strong customer-facing personality important."
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    className="h-20 text-sm"
                />
            </div>

            <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
                <Button type="submit" size="sm" disabled={isSaving}>
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save Template
                </Button>
            </div>
        </form>
    );
}

function TemplateCard({ template, onEdit, onDelete }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="border border-[#E2E6EC] rounded-xl bg-white overflow-hidden">
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#F4F6F9] transition-colors"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] flex items-center justify-center text-xs font-bold text-[#0F1E36]">
                        {template.department?.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-[#1F2937]">{template.position_name}</p>
                        <p className="text-xs text-[#6B7280]">{template.department}{template.min_experience_years ? ` • ${template.min_experience_years}+ yrs exp` : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); onEdit(template); }} className="p-1.5 text-[#6B7280] hover:text-[#0F1E36] hover:bg-[#EEF2FF] rounded">
                        <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); onDelete(template); }} className="p-1.5 text-[#6B7280] hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {expanded ? <ChevronUp className="w-4 h-4 text-[#9CA3AF]" /> : <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />}
                </div>
            </div>

            {expanded && (
                <div className="px-4 pb-4 border-t border-[#F4F6F9] pt-3 space-y-2">
                    {[
                        ['Education', template.required_education],
                        ['Required Skills', template.required_skills],
                        ['Preferred Skills', template.preferred_skills],
                        ['Certifications', template.required_certifications],
                        ['Languages', template.required_languages],
                        ['Industry Experience', template.industry_experience],
                        ['Notes for AI', template.notes],
                    ].filter(([, v]) => v).map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                            <span className="text-xs font-medium text-[#6B7280] w-36 flex-shrink-0">{label}:</span>
                            <span className="text-xs text-[#4B5563]">{value}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function JobTemplateManager() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);

    const { data: templates = [], isLoading } = useQuery({
        queryKey: ['jobTemplates'],
        queryFn: () => base44.entities.JobTemplate.list('-created_date', 100)
    });

    const saveMutation = useMutation({
        mutationFn: (data) => data.id
            ? base44.entities.JobTemplate.update(data.id, data)
            : base44.entities.JobTemplate.create(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['jobTemplates'] });
            setShowForm(false);
            setEditingTemplate(null);
            toast.success('Template saved');
        },
        onError: (e) => toast.error('Save failed: ' + e.message)
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.JobTemplate.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['jobTemplates'] });
            toast.success('Template deleted');
        },
        onError: (e) => toast.error('Delete failed: ' + e.message)
    });

    const handleEdit = (template) => {
        setEditingTemplate(template);
        setShowForm(true);
    };

    const handleDelete = (template) => {
        if (window.confirm(`Delete template "${template.position_name}"?`)) {
            deleteMutation.mutate(template.id);
        }
    };

    const handleNew = () => {
        setEditingTemplate(null);
        setShowForm(true);
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingTemplate(null);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-[#1F2937]">Position Templates</h2>
                    <p className="text-xs text-[#6B7280] mt-0.5">Define structured screening criteria for each role. These drive AI evaluations.</p>
                </div>
                {!showForm && (
                    <Button size="sm" onClick={handleNew}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        New Template
                    </Button>
                )}
            </div>

            {showForm && (
                <TemplateForm
                    template={editingTemplate}
                    onSave={(data) => saveMutation.mutate(data)}
                    onCancel={handleCancel}
                    isSaving={saveMutation.isPending}
                />
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-[#6B7280]" />
                </div>
            ) : templates.length === 0 && !showForm ? (
                <div className="text-center py-12 border-2 border-dashed border-[#E2E6EC] rounded-xl">
                    <p className="text-sm text-[#9CA3AF] mb-3">No templates yet. Create your first position template.</p>
                    <Button size="sm" onClick={handleNew}><Plus className="w-3.5 h-3.5 mr-1.5" />Create Template</Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {templates.map(t => (
                        <TemplateCard key={t.id} template={t} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                </div>
            )}
        </div>
    );
}