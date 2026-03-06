import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, X, Loader2, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const DEPARTMENTS = ['Service', 'Marketing', 'Operations', 'Finance', 'HR', 'AGM'];

const CRITERIA_TEMPLATES = {
    'Service Technician': 'Required: Automotive repair experience 3+ years, UAE driving license\nPreferred: ADAS/EVs knowledge, OEM certifications\nEducation: Diploma or higher in Automotive Engineering\nLanguages: English (required), Arabic (preferred)',
    'Marketing Executive': 'Required: 2+ years digital marketing experience, social media management\nPreferred: UAE/GCC market experience, automotive industry\nEducation: Bachelor\'s in Marketing or related field\nSkills: Google Ads, Meta Ads, content creation',
    'Finance Officer': 'Required: 3+ years accounting experience, UAE VAT knowledge\nPreferred: Automotive/dealership sector, ERP experience (SAP/Oracle)\nEducation: Bachelor\'s in Accounting or Finance\nCertifications: CPA or ACCA preferred',
    'HR Specialist': 'Required: 2+ years HR experience, UAE Labor Law knowledge, WPS\nPreferred: HRMS systems, payroll processing experience\nEducation: Bachelor\'s in HR or Business Administration\nLanguages: English (required), Arabic (advantage)',
    'Operations Manager': 'Required: 5+ years operations management, team leadership\nPreferred: Automotive industry, process improvement (Lean/Six Sigma)\nEducation: Bachelor\'s in Business or Engineering\nSkills: KPI management, budgeting, vendor management'
};

export default function ResumeScanForm({ onScanComplete }) {
    const [file, setFile] = useState(null);
    const [positionApplied, setPositionApplied] = useState('');
    const [department, setDepartment] = useState('');
    const [criteria, setCriteria] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

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

    const loadTemplate = (templateKey) => {
        setCriteria(CRITERIA_TEMPLATES[templateKey]);
    };

    const handleScan = async () => {
        if (!file) { toast.error('Please upload a resume file'); return; }
        if (!criteria.trim()) { toast.error('Please enter screening criteria'); return; }

        setIsScanning(true);
        try {
            // Convert file to base64
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
                criteria,
                positionApplied,
                department
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

    return (
        <div className="space-y-6">
            {/* File Upload */}
            <div>
                <Label className="text-sm font-medium text-[#1F2937] mb-2 block">Resume File *</Label>
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
                            <button
                                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                className="ml-2 p-1 text-[#6B7280] hover:text-red-500 rounded"
                            >
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
                <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
                />
            </div>

            {/* Position & Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label className="text-sm font-medium text-[#1F2937] mb-2 block">Position Applied For</Label>
                    <Input
                        placeholder="e.g. Service Technician"
                        value={positionApplied}
                        onChange={(e) => setPositionApplied(e.target.value)}
                    />
                </div>
                <div>
                    <Label className="text-sm font-medium text-[#1F2937] mb-2 block">Department</Label>
                    <Select value={department} onValueChange={setDepartment}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                            {DEPARTMENTS.map(d => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Criteria */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium text-[#1F2937]">Screening Criteria *</Label>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-[#6B7280]">Load template:</span>
                        <Select onValueChange={loadTemplate}>
                            <SelectTrigger className="h-7 text-xs w-44">
                                <SelectValue placeholder="Choose role..." />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.keys(CRITERIA_TEMPLATES).map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Textarea
                    placeholder="e.g. Required: 5+ years automotive experience, UAE driving license&#10;Preferred: ADAS knowledge, English & Arabic&#10;Education: Diploma or higher in Automotive Engineering"
                    value={criteria}
                    onChange={(e) => setCriteria(e.target.value)}
                    className="h-32 text-sm"
                />
                <p className="text-xs text-[#9CA3AF] mt-1">Describe required skills, experience, education, and languages</p>
            </div>

            {/* Scan Button */}
            <Button
                onClick={handleScan}
                disabled={isScanning || !file}
                className="w-full h-11"
            >
                {isScanning ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Scanning Resume (this may take 15–30 seconds)...
                    </>
                ) : (
                    <>
                        <ScanLine className="w-4 h-4 mr-2" />
                        Scan Resume with AI
                    </>
                )}
            </Button>
        </div>
    );
}