import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Briefcase, FileText, Users, Plus } from 'lucide-react';

export default function Recruitment() {
    const navigate = useNavigate();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: jobPositions = [] } = useQuery({
        queryKey: ['jobPositions'],
        queryFn: () => base44.entities.JobPosition.list('-created_date'),
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

    // Check access
    if (!currentUser || currentUser.role !== 'admin') {
        return (
            <div className="text-center py-12">
                <p className="text-slate-600">Access restricted to admins only.</p>
            </div>
        );
    }

    const strongMatches = screeningResults.filter(r => r.recommendation === 'strong_match' || r.recommendation === 'good_match').length;
    const pendingScreening = candidates.filter(c => c.screening_status === 'pending').length;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Recruitment</h1>
                    <p className="text-slate-600 mt-1">Manage job positions and screen candidates</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => navigate(createPageUrl('JobPositions'))}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Position
                    </Button>
                    <Button variant="outline" onClick={() => navigate(createPageUrl('CandidateScreening'))}>
                        <Plus className="w-4 h-4 mr-2" />
                        Upload Resume
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Active Positions</p>
                                <p className="text-2xl font-bold mt-1">{jobPositions.filter(p => p.active).length}</p>
                            </div>
                            <Briefcase className="w-8 h-8 text-indigo-600 opacity-20" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Total Candidates</p>
                                <p className="text-2xl font-bold mt-1">{candidates.length}</p>
                            </div>
                            <Users className="w-8 h-8 text-blue-600 opacity-20" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Pending Screening</p>
                                <p className="text-2xl font-bold mt-1">{pendingScreening}</p>
                            </div>
                            <FileText className="w-8 h-8 text-amber-600 opacity-20" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Strong Matches</p>
                                <p className="text-2xl font-bold mt-1 text-green-600">{strongMatches}</p>
                            </div>
                            <Users className="w-8 h-8 text-green-600 opacity-20" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Activities */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent Job Positions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {jobPositions.slice(0, 5).length === 0 ? (
                            <p className="text-sm text-slate-500">No job positions created yet</p>
                        ) : (
                            <div className="space-y-2">
                                {jobPositions.slice(0, 5).map(pos => (
                                    <div key={pos.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded">
                                        <div>
                                            <p className="font-medium text-sm">{pos.title}</p>
                                            <p className="text-xs text-slate-500">{pos.created_by_name}</p>
                                        </div>
                                        {pos.active ? (
                                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Active</span>
                                        ) : (
                                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">Inactive</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent Candidates</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {candidates.slice(0, 5).length === 0 ? (
                            <p className="text-sm text-slate-500">No candidates uploaded yet</p>
                        ) : (
                            <div className="space-y-2">
                                {candidates.slice(0, 5).map(cand => (
                                    <div key={cand.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded">
                                        <div>
                                            <p className="font-medium text-sm">{cand.candidate_name || 'Unknown'}</p>
                                            <p className="text-xs text-slate-500">{cand.file_name}</p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs rounded ${
                                            cand.screening_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                            cand.screening_status === 'analyzed' ? 'bg-blue-100 text-blue-700' :
                                            cand.screening_status === 'shortlisted' ? 'bg-green-100 text-green-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {cand.screening_status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}