import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, X, Loader2, ScanLine, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

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
    const [file, setFile] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
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

    const handleFileSelect = (selectedFile) => {
        const allowed = ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowed.includes(selectedFile.type) && !selectedFile.name.match(/\.(pdf|doc|docx)$/i)) {
            toast.error('Only PDF, DOC, and DOCX files are supported');
            return;
        }
        if (selectedFile.size > 10 * 1024 * 1024) {
            toast.error('File size must be under 10MB');
            return;
        }
        setFile(selectedFile);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) handleFileSelect(dropped);
    };

    const handleScan = async () => {
        if (!file) { toast.error('Please upload a resume file'); return; }
        if (!criteria.position_name.trim()) { toast.error('Please select a template or enter a position name'); return; }

        setIsScanning(true);
        try {
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

            if (response.data?.success) {
                toast.success('Resume scanned successfully!');
                onScanComplete(response.data);
            } else {
                toast.error(response.data?.error || 'Scan failed');
            }
        } catch (err) {
            toast.error('Scan failed: ' + (err.message || 'Unknown error'));
        } finally {
            setIsScanning(false);
        }
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

            {/* Step 3: Upload Resume */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-[#0F1E36] text-white text-xs flex items-center justify-center font-bold">3</div>
                    <Label className="text-sm font-semibold text-[#1F2937]">Upload Resume</Label>
                </div>
                <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        dragOver ? 'border-[#0F1E36] bg-blue-50' : 'border-[#CBD5E1] hover:border-[#0F1E36] hover:bg-gray-50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => !file && fileInputRef.current?.click()}
                >
                    {file ? (
                        <div className="flex items-center justify-center gap-3">
                            <FileText className="w-8 h-8 text-[#0F1E36]" />
                            <div className="text-left">
                                <p className="text-sm font-medium text-[#1F2937]">{file.name}</p>
                                <p className="text-xs text-[#6B7280]">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button onClick={e => { e.stopPropagation(); setFile(null); }} className="ml-2 p-1 text-[#6B7280] hover:text-red-500 rounded">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div>
                            <Upload className="w-10 h-10 text-[#9CA3AF] mx-auto mb-2" />
                            <p className="text-sm font-medium text-[#4B5563]">Drop resume here or click to browse</p>
                            <p className="text-xs text-[#9CA3AF] mt-1">PDF, DOC, DOCX — max 10MB</p>
                        </div>
                    )}
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={e => e.target.files[0] && handleFileSelect(e.target.files[0])} />
            </div>

            {/* Step 4: Scan */}
            <Button onClick={handleScan} disabled={isScanning || !file || !criteria.position_name.trim()} className="w-full h-11">
                {isScanning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning Resume — this may take 30–60 seconds...</>
                ) : (
                    <><ScanLine className="w-4 h-4 mr-2" />Scan Resume with AI</>
                )}
            </Button>
        </div>
    );
}