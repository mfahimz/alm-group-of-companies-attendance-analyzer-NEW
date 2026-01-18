import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, Loader2, Eye } from 'lucide-react';

export default function CandidateScreening() {
    const [selectedPosition, setSelectedPosition] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [showDetailsDialog, setShowDetailsDialog] = useState(false);
    const [selectedResult, setSelectedResult] = useState(null);
    const fileInputRef = useRef(null);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: async () => {
            const user = await base44.auth.me();
            if (user.role !== 'admin') {
                throw new Error('Access denied');
            }
            return user;
        }
    });

    const { data: jobPositions = [] } = useQuery({
        queryKey: ['jobPositions'],
        queryFn: () => base44.entities.JobPosition.filter({ active: true }),
        enabled: !!currentUser
    });

    const { data: candidates = [] } = useQuery({
        queryKey: ['candidates'],
        queryFn: () => base44.entities.Candidate.list('-created_date'),
        enabled: !!currentUser
    });

    const { data: screeningResults = [] } = useQuery({
        queryKey: ['screeningResults'],
        queryFn: () => base44.entities.ScreeningResult.list('-created_date'),
        enabled: !!currentUser
    });

    const screeneeCandidates = selectedPosition 
        ? candidates.filter(c => c.job_position_id === selectedPosition)
        : [];

    const uploadMutation = useMutation({
        mutationFn: async (file) => {
            setIsUploading(true);
            try {
                // Upload PDF
                const uploadRes = await base44.integrations.Core.UploadFile({ file });
                
                // Create candidate record
                const candidate = await base44.entities.Candidate.create({
                    job_position_id: selectedPosition,
                    file_url: uploadRes.file_url,
                    file_name: file.name,
                    screening_status: 'pending'
                });

                // Trigger screening analysis
                const screenRes = await base44.functions.invoke('analyzeResume', {
                    candidate_id: candidate.id,
                    job_position_id: selectedPosition,
                    file_url: uploadRes.file_url
                });

                return screenRes.data;
            } finally {
                setIsUploading(false);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['candidates'] });
            queryClient.invalidateQueries({ queryKey: ['screeningResults'] });
            fileInputRef.current.value = '';
            toast.success('Resume uploaded and analyzed!');
        },
        onError: (error) => {
            toast.error('Upload failed: ' + error.message);
        }
    });

    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.includes('pdf')) {
            toast.error('Please upload a PDF file');
            return;
        }

        if (!selectedPosition) {
            toast.error('Please select a job position first');
            return;
        }

        uploadMutation.mutate(file);
    };

    const getRecommendationColor = (recommendation) => {
        const colors = {
            strong_match: 'bg-green-100 text-green-700',
            good_match: 'bg-emerald-100 text-emerald-700',
            moderate_match: 'bg-yellow-100 text-yellow-700',
            weak_match: 'bg-orange-100 text-orange-700',
            not_suitable: 'bg-red-100 text-red-700'
        };
        return colors[recommendation] || 'bg-slate-100 text-slate-700';
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Candidate Screening</h1>
                <p className="text-slate-600 mt-1">Upload and analyze resumes against job requirements</p>
            </div>

            {/* Upload Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Upload Resume</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Job Position</label>
                        <Select value={selectedPosition} onValueChange={setSelectedPosition}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a job position" />
                            </SelectTrigger>
                            <SelectContent>
                                {jobPositions.map(pos => (
                                    <SelectItem key={pos.id} value={pos.id}>
                                        {pos.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-slate-400 cursor-pointer transition"
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf"
                            onChange={handleFileSelect}
                            className="hidden"
                            disabled={!selectedPosition || isUploading}
                        />
                        {isUploading ? (
                            <>
                                <Loader2 className="w-8 h-8 mx-auto text-slate-400 animate-spin" />
                                <p className="text-slate-600 mt-2">Processing resume...</p>
                            </>
                        ) : (
                            <>
                                <Upload className="w-8 h-8 mx-auto text-slate-400" />
                                <p className="text-slate-600 mt-2">Click to upload PDF resume</p>
                                <p className="text-xs text-slate-500 mt-1">Maximum file size: 10MB</p>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Results */}
            {selectedPosition && (
                <Card>
                    <CardHeader>
                        <CardTitle>Screening Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Candidate Name</TableHead>
                                        <TableHead>Overall Score</TableHead>
                                        <TableHead>Recommendation</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {screeneeCandidates.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-slate-500 py-4">
                                                No candidates for this position
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        screeneeCandidates.map(cand => {
                                            const result = screeningResults.find(r => r.candidate_id === cand.id);
                                            return (
                                                <TableRow key={cand.id}>
                                                    <TableCell className="font-medium">{cand.candidate_name || cand.file_name}</TableCell>
                                                    <TableCell>
                                                        {result ? (
                                                            <span className="font-semibold">{result.overall_score}/100</span>
                                                        ) : (
                                                            <span className="text-slate-400">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {result && (
                                                            <span className={`px-2 py-1 text-xs rounded font-medium ${getRecommendationColor(result.recommendation)}`}>
                                                                {result.recommendation.replace('_', ' ')}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`px-2 py-1 text-xs rounded ${
                                                            cand.screening_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                            cand.screening_status === 'analyzed' ? 'bg-blue-100 text-blue-700' :
                                                            cand.screening_status === 'shortlisted' ? 'bg-green-100 text-green-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                            {cand.screening_status}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {result && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setSelectedResult({ ...result, candidate: cand });
                                                                    setShowDetailsDialog(true);
                                                                }}
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Details Dialog */}
            <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Screening Results - {selectedResult?.candidate?.candidate_name}</DialogTitle>
                    </DialogHeader>
                    {selectedResult && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <p className="text-sm text-slate-600">Overall Score</p>
                                    <p className="text-2xl font-bold text-slate-900">{selectedResult.overall_score}/100</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Must-Have Match</p>
                                    <p className="text-2xl font-bold text-slate-900">{selectedResult.must_have_match_count}/{selectedResult.must_have_total}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Recommendation</p>
                                    <span className={`inline-block mt-1 px-3 py-1 text-xs rounded font-medium ${getRecommendationColor(selectedResult.recommendation)}`}>
                                        {selectedResult.recommendation.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>

                            {selectedResult.ai_analysis_summary && (
                                <div className="bg-slate-50 rounded-lg p-4">
                                    <h3 className="font-semibold text-sm mb-2">AI Analysis Summary</h3>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedResult.ai_analysis_summary}</p>
                                </div>
                            )}

                            {selectedResult.extracted_skills && (
                                <div>
                                    <h3 className="font-semibold text-sm mb-2">Extracted Skills</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {JSON.parse(selectedResult.extracted_skills).map((skill, idx) => (
                                            <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                                {skill}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedResult.matched_requirements && (
                                <div>
                                    <h3 className="font-semibold text-sm mb-2">Matched Requirements</h3>
                                    <div className="space-y-2">
                                        {JSON.parse(selectedResult.matched_requirements).map((req, idx) => (
                                            <div key={idx} className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                                                ✓ {req.requirement}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedResult.missing_requirements && (
                                <div>
                                    <h3 className="font-semibold text-sm mb-2">Missing Requirements</h3>
                                    <div className="space-y-2">
                                        {JSON.parse(selectedResult.missing_requirements).map((req, idx) => (
                                            <div key={idx} className="p-2 bg-red-50 border border-red-200 rounded text-sm">
                                                ✗ {req}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}