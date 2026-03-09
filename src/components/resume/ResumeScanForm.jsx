import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Upload, FileText, X, Loader2, ScanLine, CheckCircle2, AlertCircle, ChevronDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const MAX_FILES = 7;
const DELAY_BETWEEN_SCANS_MS = 3000; // 3s gap to avoid rate limits

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default function ResumeScanForm({ onScanComplete }) {
    const [selectedTemplates, setSelectedTemplates] = useState([]);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [criteria, setCriteria] = useState({
        position_name: '',
        department: '',
        min_experience_years: '',
        required_education: '',
        required_skills: '',
        preferred_skills: '',
        required_certifications: '',
        required_languages: '',
        industry_experience: '',
        notes: ''
    });
    const [files, setFiles] = useState([]); // array of File objects
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState(null); // { current, total, fileName, statuses }
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const { data: templates = [] } = useQuery({
        queryKey: ['jobTemplates'],
        queryFn: () => base44.entities.JobTemplate.list('-created_date', 100)
    });

    useEffect(() => {
        if (!dropdownOpen) return;
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dropdownOpen]);

    const handleTemplateToggle = (template) => {
        setSelectedTemplates(prev => {
            const exists = prev.find(t => t.id === template.id);
            if (exists) return prev.filter(t => t.id !== template.id);
            return [...prev, template];
        });
    };

    const removeTemplate = (templateId) => {
        setSelectedTemplates(prev => prev.filter(t => t.id !== templateId));
    };

    const setField = (field, value) => setCriteria(c => ({ ...c, [field]: value }));

    const validateFile = (f) => {
        const allowed = ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|doc|docx)$/i)) return 'Only PDF, DOC, DOCX supported';
        if (f.size > 10 * 1024 * 1024) return 'File must be under 10MB';
        return null;
    };

    const addFiles = (newFiles) => {
        const combined = [...files];
        let skipped = 0;
        for (const f of newFiles) {
            if (combined.length >= MAX_FILES) { skipped++; continue; }
            const err = validateFile(f);
            if (err) { toast.error(`${f.name}: ${err}`); continue; }
            if (combined.find(x => x.name === f.name && x.size === f.size)) continue; // dedupe
            combined.push(f);
        }
        if (skipped > 0) toast.warning(`Max ${MAX_FILES} resumes allowed. ${skipped} file(s) skipped.`);
        setFiles(combined);
    };

    const removeFile = (index) => setFiles(f => f.filter((_, i) => i !== index));

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        addFiles(Array.from(e.dataTransfer.files));
    };

    // scanSingleFile accepts an explicit criteriaArg so it can be called
    // independently for each template without closing over the criteria state.
    const scanSingleFile = async (file, criteriaArg) => {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const response = await base44.functions.invoke('scanResume', {
            fileBase64: base64,
            fileName: file.name,
            fileType: file.type,
            criteria: criteriaArg
        });
        if (!response.data?.success) throw new Error(response.data?.error || 'Scan failed');
        return response.data.result;
    };

    const handleScan = async () => {
        if (files.length === 0) { toast.error('Please upload at least one resume'); return; }
        if (!criteria.position_name.trim()) { toast.error('Please select a template or enter a position name'); return; }

        setIsScanning(true);
        const statuses = files.map(f => ({ fileName: f.name, status: 'pending' })); // pending | scanning | done | error
        setScanProgress({ current: 0, total: files.length, statuses });

        const results = [];

        // Multi-template mode activates when more than one template is selected.
        // Each resume is scanned once per template independently, scores are compared,
        // and the best-fitting template determines the canonical result for that resume.
        // Single-template mode (0 or 1 selected templates) uses the manually editable
        // criteria state and follows the original single-scan-per-file path.
        const isMultiTemplate = selectedTemplates.length > 1;

        for (let i = 0; i < files.length; i++) {
            statuses[i] = { ...statuses[i], status: 'scanning' };
            setScanProgress({ current: i + 1, total: files.length, statuses: [...statuses] });

            try {
                let result;

                if (isMultiTemplate) {
                    // --- Per-template scanning ---
                    // For each resume, iterate over every selected template and call
                    // scanSingleFile once per template. Each call receives that template's
                    // own field values as the criteria object, keeping scans fully independent.
                    const templateScans = [];

                    for (let j = 0; j < selectedTemplates.length; j++) {
                        const tmpl = selectedTemplates[j];

                        // Build the criteria object directly from the template's fields.
                        // This is intentionally separate from the editable criteria state,
                        // which is not used in multi-template mode.
                        const templateCriteria = {
                            position_name: tmpl.position_name || '',
                            department: tmpl.department || '',
                            min_experience_years: tmpl.min_experience_years ?? '',
                            required_education: tmpl.required_education || '',
                            required_skills: tmpl.required_skills || '',
                            preferred_skills: tmpl.preferred_skills || '',
                            required_certifications: tmpl.required_certifications || '',
                            required_languages: tmpl.required_languages || '',
                            industry_experience: tmpl.industry_experience || '',
                            notes: tmpl.notes || ''
                        };

                        try {
                            const templateResult = await scanSingleFile(files[i], templateCriteria);
                            templateScans.push({ template: tmpl, result: templateResult });
                        } catch (err) {
                            // A single template scan failure is non-fatal — log it and
                            // continue so the remaining templates are still evaluated.
                            console.warn(`Template scan failed for "${tmpl.position_name}" on ${files[i].name}:`, err.message);
                        }

                        // Apply the rate-limit delay between every individual template
                        // scan call. Skip the delay only after the absolute last scan
                        // (last template of the last file) to avoid unnecessary waiting.
                        const isLastScan = i === files.length - 1 && j === selectedTemplates.length - 1;
                        if (!isLastScan) {
                            await sleep(DELAY_BETWEEN_SCANS_MS);
                        }
                    }

                    if (templateScans.length === 0) {
                        throw new Error('All template scans failed for this resume');
                    }

                    // --- Score comparison ---
                    // Each template scan returns a score. result.score is the primary
                    // field; result.ai_score is the fallback for entity-mapped shapes.
                    // Reduce over all scans to find the one with the highest numeric score.
                    // Ties are broken in favour of the earlier template (first one selected wins).
                    const best = templateScans.reduce((champion, candidate) => {
                        const championScore = champion.result.score ?? champion.result.ai_score ?? 0;
                        const candidateScore = candidate.result.score ?? candidate.result.ai_score ?? 0;
                        return candidateScore > championScore ? candidate : champion;
                    }, templateScans[0]);

                    // --- Final result mapping ---
                    // All narrative fields (summary, recommendation, strengths, concerns,
                    // matched_skills, missing_skills, experience, applicant info, etc.)
                    // are taken directly from the highest-scoring template scan.
                    // Two fields are added on top:
                    //   matched_template_name — the position_name of the winning template
                    //   template_scores       — an ordered array of { template_name, score }
                    //                          covering every template that was evaluated,
                    //                          preserving the original selection order
                    result = {
                        ...best.result,
                        matched_template_name: best.template.position_name,
                        template_scores: templateScans.map(ts => ({
                            template_name: ts.template.position_name,
                            score: ts.result.score ?? ts.result.ai_score ?? 0
                        }))
                    };
                } else {
                    // Single-template (or manual criteria) mode: scan once using the
                    // editable criteria state, exactly as before.
                    result = await scanSingleFile(files[i], criteria);
                }

                results.push(result);
                statuses[i] = { ...statuses[i], status: 'done' };
            } catch (err) {
                console.error(`Failed scanning ${files[i].name}:`, err.message);
                statuses[i] = { ...statuses[i], status: 'error', error: err.message };
            }

            setScanProgress({ current: i + 1, total: files.length, statuses: [...statuses] });

            // In single-template mode apply the inter-file rate-limit delay here.
            // In multi-template mode the delay is already handled inside the
            // per-template loop above, so no additional delay is needed between files.
            if (!isMultiTemplate && i < files.length - 1) {
                await sleep(DELAY_BETWEEN_SCANS_MS);
            }
        }

        setIsScanning(false);
        setScanProgress(null);

        if (results.length === 0) {
            toast.error('All scans failed. Please try again.');
            return;
        }

        const failed = statuses.filter(s => s.status === 'error').length;
        if (failed > 0) toast.warning(`${results.length} scanned successfully, ${failed} failed.`);
        else toast.success(`${results.length} resume${results.length > 1 ? 's' : ''} scanned successfully!`);

        onScanComplete(results);
    };

    const hasTemplate = selectedTemplates.length > 0;

    return (
        <div className="space-y-6">
            {/* Step 1: Template Selection */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-[#0F1E36] text-white text-xs flex items-center justify-center font-bold">1</div>
                    <Label className="text-sm font-semibold text-[#1F2937]">Select Position Template</Label>
                </div>
                <div className="relative" ref={dropdownRef}>
                    <button
                        type="button"
                        onClick={() => templates.length > 0 && setDropdownOpen(o => !o)}
                        className={`w-full flex items-center justify-between px-3 py-2 border border-[#E2E6EC] rounded-md bg-white text-sm hover:border-[#0F1E36] transition-colors ${templates.length === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        <span className={selectedTemplates.length === 0 ? 'text-[#9CA3AF]' : 'text-[#1F2937]'}>
                            {templates.length === 0
                                ? 'No templates yet — create one in the Templates tab'
                                : selectedTemplates.length === 0
                                    ? 'Choose position templates...'
                                    : `${selectedTemplates.length} template${selectedTemplates.length > 1 ? 's' : ''} selected`}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-[#6B7280] transition-transform flex-shrink-0 ${dropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {dropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-[#E2E6EC] rounded-md shadow-lg max-h-52 overflow-y-auto">
                            {templates.map(t => {
                                const isSelected = selectedTemplates.some(s => s.id === t.id);
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => handleTemplateToggle(t)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-[#F4F6F9] transition-colors ${isSelected ? 'bg-[#EEF2FF]' : ''}`}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#0F1E36] border-[#0F1E36]' : 'border-[#CBD5E1]'}`}>
                                            {isSelected && <Check className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="flex-1 text-[#1F2937]">{t.position_name}</span>
                                        {t.department && <span className="text-xs text-[#9CA3AF]">{t.department}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                {selectedTemplates.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {selectedTemplates.map(t => (
                            <span key={t.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#EEF2FF] border border-[#C7D2FE] rounded-full text-xs font-medium text-[#0F1E36]">
                                {t.position_name}
                                <button
                                    type="button"
                                    onClick={() => removeTemplate(t.id)}
                                    className="text-[#6B7280] hover:text-[#1F2937] rounded-full"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                {templates.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1.5">⚠ Create position templates in the Templates tab before scanning.</p>
                )}
            </div>

            {/* Step 2: Editable Criteria (shown after template selected) */}
            {hasTemplate && (
                <div className="border border-[#E2E6EC] rounded-xl p-4 bg-[#FAFBFD] space-y-4">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-full bg-[#0F1E36] text-white text-xs flex items-center justify-center font-bold">2</div>
                        <Label className="text-sm font-semibold text-[#1F2937]">Review & Adjust Criteria</Label>
                        <span className="text-xs text-[#9CA3AF]">(editable — changes apply to this scan only)</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Position Name</Label>
                            <Input value={criteria.position_name} onChange={e => setField('position_name', e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Department</Label>
                            <Input value={criteria.department} onChange={e => setField('department', e.target.value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Min. Experience (years)</Label>
                            <Input type="number" value={criteria.min_experience_years} onChange={e => setField('min_experience_years', e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Required Education</Label>
                            <Input value={criteria.required_education} onChange={e => setField('required_education', e.target.value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Required Skills</Label>
                            <Textarea value={criteria.required_skills} onChange={e => setField('required_skills', e.target.value)} className="h-20 text-sm" />
                        </div>
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Preferred Skills</Label>
                            <Textarea value={criteria.preferred_skills} onChange={e => setField('preferred_skills', e.target.value)} className="h-20 text-sm" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Certifications</Label>
                            <Input value={criteria.required_certifications} onChange={e => setField('required_certifications', e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Languages</Label>
                            <Input value={criteria.required_languages} onChange={e => setField('required_languages', e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Industry Experience</Label>
                            <Input value={criteria.industry_experience} onChange={e => setField('industry_experience', e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs font-medium text-[#6B7280] mb-1.5 block">Additional Notes for AI</Label>
                        <Textarea value={criteria.notes} onChange={e => setField('notes', e.target.value)} className="h-16 text-sm" />
                    </div>
                </div>
            )}

            {/* Step 3: Upload Resumes */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-[#0F1E36] text-white text-xs flex items-center justify-center font-bold">3</div>
                    <Label className="text-sm font-semibold text-[#1F2937]">Upload Resumes</Label>
                    <span className="text-xs text-[#9CA3AF]">(up to {MAX_FILES} files)</span>
                </div>

                {/* Drop Zone */}
                <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        dragOver ? 'border-[#0F1E36] bg-blue-50' : 'border-[#CBD5E1] hover:border-[#0F1E36] hover:bg-gray-50'
                    } ${files.length >= MAX_FILES ? 'opacity-50 pointer-events-none' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                    <p className="text-sm font-medium text-[#4B5563]">Drop resumes here or click to browse</p>
                    <p className="text-xs text-[#9CA3AF] mt-1">PDF, DOC, DOCX — max 10MB each — up to {MAX_FILES} files</p>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                    multiple
                    onChange={e => e.target.files?.length && addFiles(Array.from(e.target.files))}
                />

                {/* File List */}
                {files.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 bg-[#F4F6F9] rounded-lg border border-[#E2E6EC]">
                                <FileText className="w-4 h-4 text-[#0F1E36] flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-[#1F2937] truncate">{f.name}</p>
                                    <p className="text-xs text-[#9CA3AF]">{(f.size / 1024).toFixed(1)} KB</p>
                                </div>
                                {!isScanning && (
                                    <button onClick={() => removeFile(i)} className="p-1 text-[#9CA3AF] hover:text-red-500 rounded flex-shrink-0">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Scan Progress */}
            {isScanning && scanProgress && (
                <div className="border border-[#E2E6EC] rounded-xl p-4 bg-[#FAFBFD] space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[#1F2937]">Scanning resumes...</span>
                        <span className="text-[#6B7280]">{scanProgress.current} / {scanProgress.total}</span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-[#E2E6EC] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[#0F1E36] rounded-full transition-all duration-500"
                            style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
                        />
                    </div>
                    {/* Per-file statuses */}
                    <div className="space-y-1.5">
                        {scanProgress.statuses.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                                {s.status === 'done'    && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                                {s.status === 'error'   && <AlertCircle  className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                                {s.status === 'scanning'&& <Loader2      className="w-3.5 h-3.5 text-[#0F1E36] animate-spin flex-shrink-0" />}
                                {s.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-[#CBD5E1] flex-shrink-0" />}
                                <span className={`truncate ${s.status === 'error' ? 'text-red-600' : s.status === 'done' ? 'text-green-700' : s.status === 'scanning' ? 'text-[#1F2937] font-medium' : 'text-[#9CA3AF]'}`}>
                                    {s.fileName}
                                    {s.status === 'scanning' && ' — analyzing...'}
                                    {s.status === 'error' && ` — ${s.error || 'failed'}`}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-[#9CA3AF]">Processing sequentially to avoid rate limits. Please wait...</p>
                </div>
            )}

            {/* Step 4: Scan */}
            <Button onClick={handleScan} disabled={isScanning || files.length === 0 || !criteria.position_name.trim()} className="w-full h-11">
                {isScanning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning — please wait...</>
                ) : (
                    <><ScanLine className="w-4 h-4 mr-2" />Scan {files.length > 1 ? `${files.length} Resumes` : 'Resume'} with AI</>
                )}
            </Button>
        </div>
    );
}