import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, X, Loader2, ScanLine, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const MAX_FILES = 7;
const DELAY_BETWEEN_SCANS_MS = 3000; // 3s gap to avoid rate limits

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export default function ResumeScanForm({ onScanComplete }) {
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
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

    const handleTemplateSelect = (templateId) => {
        setSelectedTemplateId(templateId);
        const t = templates.find(t => t.id === templateId);
        if (t) {
            setCriteria({
                position_name: t.position_name || '',
                department: t.department || '',
                min_experience_years: t.min_experience_years ?? '',
                required_education: t.required_education || '',
                required_skills: t.required_skills || '',
                preferred_skills: t.preferred_skills || '',
                required_certifications: t.required_certifications || '',
                required_languages: t.required_languages || '',
                industry_experience: t.industry_experience || '',
                notes: t.notes || ''
            });
        }
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

    const scanSingleFile = async (file) => {
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
            criteria
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

        for (let i = 0; i < files.length; i++) {
            // Update status to scanning
            statuses[i] = { ...statuses[i], status: 'scanning' };
            setScanProgress({ current: i + 1, total: files.length, statuses: [...statuses] });

            try {
                const result = await scanSingleFile(files[i]);
                results.push(result);
                statuses[i] = { ...statuses[i], status: 'done' };
            } catch (err) {
                console.error(`Failed scanning ${files[i].name}:`, err.message);
                statuses[i] = { ...statuses[i], status: 'error', error: err.message };
            }

            setScanProgress({ current: i + 1, total: files.length, statuses: [...statuses] });

            // Rate-limit safe delay between calls (skip after last file)
            if (i < files.length - 1) {
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

    const hasTemplate = !!selectedTemplateId;

    return (
        <div className="space-y-6">
            {/* Step 1: Template Selection */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-[#0F1E36] text-white text-xs flex items-center justify-center font-bold">1</div>
                    <Label className="text-sm font-semibold text-[#1F2937]">Select Position Template</Label>
                </div>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={templates.length === 0 ? "No templates yet — create one in the Templates tab" : "Choose a position template..."} />
                    </SelectTrigger>
                    <SelectContent>
                        {templates.map(t => (
                            <SelectItem key={t.id} value={t.id}>
                                {t.position_name} <span className="text-[#9CA3AF] ml-1">— {t.department}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
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