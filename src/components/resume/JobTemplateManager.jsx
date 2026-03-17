import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_TEMPLATE = {
    position_name: '',
    department: '',
    company: '', // Dynamic company field from Company entity
    min_experience_years: '',
    required_education: '',
    required_skills: '',
    preferred_skills: '',
    required_certifications: '',
    required_languages: '',
    industry_experience: '',
    notes: '',
    is_active: true,
    mandatory_rules: [] // Array of field names that are mandatory
};

/**
 * JobTemplateManager handles position screening criteria.
 * All company references are now dynamic from the Company entity.
 * No company names are hardcoded.
 */

function TemplateForm({ template, onSave, onCancel, isSaving, companies }) {
    // Utility to ensure company is always a string even if stored as object in legacy records
    const normalizeCompany = (t) => {
        if (!t?.company) return '';
        return typeof t.company === 'string' ? t.company : (t.company?.name || '');
    };

    const [form, setForm] = useState(() => ({ 
        ...EMPTY_TEMPLATE, 
        ...template,
        company: normalizeCompany(template)
    }));
    
    // Support switching between templates while form is open
    useEffect(() => {
        if (template) {
            setForm({ 
                ...EMPTY_TEMPLATE, 
                ...template,
                company: normalizeCompany(template)
            });
        } else {
            setForm(EMPTY_TEMPLATE);
        }
    }, [template]);

    const [quickText, setQuickText] = useState('');
    const [quickParsing, setQuickParsing] = useState(false);
    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));
    const toggleMandatory = (field) => {
        setForm(f => {
            const rules = f.mandatory_rules || [];
            if (rules.includes(field)) {
                return { ...f, mandatory_rules: rules.filter(r => r !== field) };
            } else {
                return { ...f, mandatory_rules: [...rules, field] };
            }
        });
    };

    const handleQuickFill = async () => {
        if (!quickText.trim()) { toast.error('Please enter a description'); return; }
        setQuickParsing(true);
        try {
            const result = await base44.integrations.Core.InvokeLLM({
                prompt: `Extract job position template details from this description and return structured JSON.

Description: "${quickText}"

Return JSON with these fields (use empty string if not mentioned):
{
  "position_name": "job title",
  "department": "department name",
  "min_experience_years": number or 0,
  "required_education": "education requirement",
  "required_skills": "comma-separated required skills",
  "preferred_skills": "comma-separated nice-to-have skills",
  "required_certifications": "required certifications",
  "required_languages": "e.g. English (required), Arabic (preferred)",
  "industry_experience": "industry background needed",
  "notes": "any other important notes for AI evaluation"
}`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        position_name: { type: "string" },
                        department: { type: "string" },
                        min_experience_years: { type: "number" },
                        required_education: { type: "string" },
                        required_skills: { type: "string" },
                        preferred_skills: { type: "string" },
                        required_certifications: { type: "string" },
                        required_languages: { type: "string" },
                        industry_experience: { type: "string" },
                        notes: { type: "string" }
                    }
                }
            });
            setForm(f => ({
                ...f,
                position_name: result.position_name || f.position_name,
                department: result.department || f.department,
                min_experience_years: result.min_experience_years != null ? result.min_experience_years : f.min_experience_years,
                required_education: result.required_education || f.required_education,
                required_skills: result.required_skills || f.required_skills,
                preferred_skills: result.preferred_skills || f.preferred_skills,
                required_certifications: result.required_certifications || f.required_certifications,
                required_languages: result.required_languages || f.required_languages,
                industry_experience: result.industry_experience || f.industry_experience,
                notes: result.notes || f.notes,
            }));
            setQuickText('');
            toast.success('Form filled! Review and adjust before saving.');
        } catch (err) {
            toast.error('Failed to parse: ' + err.message);
        } finally {
            setQuickParsing(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Validation ensuring all required fields are present before passing to onSave
        if (!form.position_name.trim()) { toast.error('Position name is required'); return; }
        if (!form.company) { toast.error('Company is required'); return; }
        if (!form.min_experience_years && form.min_experience_years !== 0) { toast.error('Minimum experience is required'); return; }
        if (!form.required_education.trim()) { toast.error('Required education is required'); return; }
        if (!form.required_skills.trim()) { toast.error('Required skills are required'); return; }
        if (!form.required_languages.trim()) { toast.error('Languages are required'); return; }
        if (!form.industry_experience.trim()) { toast.error('Industry experience is required'); return; }
        
        // Passing the full form state which includes the company value
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

            {/* Quick Entry AI Autofill */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-200">
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <Label className="font-medium text-indigo-900 text-xs">Quick Entry (Optional)</Label>
                </div>
                <p className="text-xs text-slate-600 mb-3">Describe the role and we'll fill the form below</p>
                <div className="flex gap-2">
                    <Input
                        placeholder='e.g. Service Technician with 3+ years automotive experience, English required'
                        value={quickText}
                        onChange={e => setQuickText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !quickParsing) { e.preventDefault(); handleQuickFill(); } }}
                        disabled={quickParsing}
                        className="flex-1 text-sm"
                    />
                    <Button
                        type="button"
                        onClick={handleQuickFill}
                        disabled={quickParsing || !quickText.trim()}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
                    >
                        {quickParsing ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Parsing...</>
                        ) : (
                            <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Fill Form</>
                        )}
                    </Button>
                </div>
            </div>

            {/* Position, Department & Company */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Position Name *</Label>
                    <Input placeholder="e.g. Service Technician" value={form.position_name} onChange={e => set('position_name', e.target.value)} />
                </div>
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Department</Label>
                    <Input placeholder="e.g. Service, HR, Finance" value={form.department} onChange={e => set('department', e.target.value)} />
                </div>
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Company *</Label>
                    <select 
                        className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        value={form.company}
                        onChange={e => set('company', e.target.value)}
                    >
                        <option value="">Select Company...</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Experience & Education */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs font-medium text-[#4B5563]">Minimum Experience (years) *</Label>
                        <button
                            type="button"
                            onClick={() => toggleMandatory('min_experience_years')}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${form.mandatory_rules?.includes('min_experience_years') ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                        >
                            {form.mandatory_rules?.includes('min_experience_years') ? 'Mandatory (Knock-out)' : 'Mark Mandatory'}
                        </button>
                    </div>
                    <Input type="number" min="0" max="30" placeholder="e.g. 3" value={form.min_experience_years} onChange={e => set('min_experience_years', e.target.value)} />
                </div>
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs font-medium text-[#4B5563]">Required Education *</Label>
                        <button
                            type="button"
                            onClick={() => toggleMandatory('required_education')}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${form.mandatory_rules?.includes('required_education') ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}
                        >
                            {form.mandatory_rules?.includes('required_education') ? 'Mandatory (Knock-out)' : 'Mark Mandatory'}
                        </button>
                    </div>
                    <Input placeholder="e.g. Bachelor's in Mechanical Engineering" value={form.required_education} onChange={e => set('required_education', e.target.value)} />
                </div>
            </div>

            {/* Skills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Required Skills * <span className="text-[#9CA3AF]">(comma-separated)</span></Label>
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
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Languages *</Label>
                    <Input placeholder="e.g. English (required), Arabic (preferred)" value={form.required_languages} onChange={e => set('required_languages', e.target.value)} />
                </div>
                <div>
                    <Label className="text-xs font-medium text-[#4B5563] mb-1.5 block">Industry Experience *</Label>
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
                        <div className="flex items-center gap-2">
                            <p className="text-xs text-[#6B7280]">{(template.company_name || (typeof template.company === 'string' ? template.company : template.company?.name)) || 'No Company'} • {template.department}{template.min_experience_years ? ` • ${template.min_experience_years}+ yrs exp` : ''}</p>
                            {template.mandatory_rules?.length > 0 && (
                                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 font-medium">
                                    {template.mandatory_rules.length} Mandatory Rules
                                </span>
                            )}
                        </div>
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

    const { data: companiesRaw = [] } = useQuery({
        queryKey: ['companies-active'],
        queryFn: () => base44.entities.Company.list()
    });

    const companies = companiesRaw.filter(c => c.active);

    const saveMutation = useMutation({
        // Root Cause: The explicit mapping might be missing fields or the backend 
        // might expect different field names (like company vs company_name).
        // Fix: Use a broad spread to keep all fields, but specifically force 
        // the company value and its alias. Also add manual timestamps which 
        // some entities on this platform require for certain views.
        mutationFn: async (data) => {
            const { id, created_date, updated_date, ...rest } = data;
            const me = await base44.auth.me();
            
            const payload = {
                ...rest,
                company: (data.company || '').trim(),
                min_experience_years: data.min_experience_years !== '' ? parseFloat(data.min_experience_years) || 0 : 0,
                updated_at: new Date().toISOString()
            };

            if (!id) {
                payload.created_at = new Date().toISOString();
                payload.created_by = me?.email || 'System';
            }

            return id
                ? base44.entities.JobTemplate.update(id, payload)
                : base44.entities.JobTemplate.create(payload);
        },
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
                    companies={companies}
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