import React, { useState } from 'react';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Lightbulb, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function FeatureRequests() {
    usePageTitle('Feature Requests');

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ['featureRequests'],
        queryFn: () => base44.entities.FeatureRequest.list('-created_date')
    });

    const getStatusColor = (status) => {
        const colors = {
            'New': 'badge-info',
            'Under Review': 'badge-warning',
            'Planned': 'badge-attendance',
            'Implemented': 'badge-success',
            'Rejected': 'badge-error'
        };
        return colors[status] || 'badge-neutral';
    };

    const getStatusIcon = (status) => {
        const icons = {
            'New': AlertCircle,
            'Under Review': Clock,
            'Planned': Clock,
            'Implemented': CheckCircle2,
            'Rejected': XCircle
        };
        const Icon = icons[status] || AlertCircle;
        return <Icon className="w-4 h-4" />;
    };

    const getPriorityColor = (priority) => {
        const colors = {
            'Low': 'text-blue-600 bg-blue-50',
            'Medium': 'text-yellow-600 bg-yellow-50',
            'High': 'text-orange-600 bg-orange-50',
            'Critical': 'text-red-600 bg-red-50'
        };
        return colors[priority] || 'text-slate-600 bg-slate-50';
    };

    const statuses = ['All', 'New', 'Under Review', 'Planned', 'Implemented', 'Rejected'];
    const [activeTab, setActiveTab] = useState('All');

    const filteredRequests = activeTab === 'All' 
        ? requests 
        : requests.filter(req => req.status === activeTab);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-[#1F2937]">Feature Requests & Updates</h1>
                    <p className="text-[#6B7280] mt-1">Track new feature ideas and update requests</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {['New', 'Under Review', 'Planned', 'Implemented', 'Rejected'].map(status => {
                    const count = requests.filter(r => r.status === status).length;
                    return (
                        <Card key={status}>
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-[#6B7280]">{status}</p>
                                        <p className="text-2xl font-bold text-[#1F2937]">{count}</p>
                                    </div>
                                    {getStatusIcon(status)}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList>
                    {statuses.map(status => (
                        <TabsTrigger key={status} value={status}>
                            {status}
                            {status !== 'All' && (
                                <span className="ml-1 text-xs">
                                    ({requests.filter(r => r.status === status).length})
                                </span>
                            )}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value={activeTab} className="space-y-4 mt-4">
                    {isLoading ? (
                        <div className="text-center py-8 text-[#6B7280]">Loading requests...</div>
                    ) : filteredRequests.length === 0 ? (
                        <Card>
                            <CardContent className="py-8 text-center text-[#6B7280]">
                                No feature requests in this category.
                            </CardContent>
                        </Card>
                    ) : (
                        filteredRequests.map((request) => (
                            <Card key={request.id} className="hover:shadow-md transition-shadow">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge className={getStatusColor(request.status)}>
                                                    {request.status}
                                                </Badge>
                                                <span className={`text-xs font-medium px-2 py-1 rounded ${getPriorityColor(request.priority)}`}>
                                                    {request.priority}
                                                </span>
                                            </div>
                                            <CardTitle className="text-xl flex items-center gap-2">
                                                <Lightbulb className="w-5 h-5 text-yellow-500" />
                                                {request.title}
                                            </CardTitle>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-[#4B5563] whitespace-pre-wrap">{request.description}</p>
                                    
                                    {request.implementation_notes && (
                                        <div className="bg-[#F4F6F9] p-4 rounded-md border border-[#E2E6EC]">
                                            <p className="text-sm font-medium text-[#1F2937] mb-1">Implementation Notes:</p>
                                            <p className="text-sm text-[#4B5563] whitespace-pre-wrap">{request.implementation_notes}</p>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-4 text-sm text-[#6B7280] pt-4 border-t border-[#E2E6EC]">
                                        <div>
                                            <span className="font-medium">Requested by:</span> {request.requested_by_user_email}
                                        </div>
                                        {request.assigned_to_user_email && (
                                            <div>
                                                <span className="font-medium">Assigned to:</span> {request.assigned_to_user_email}
                                            </div>
                                        )}
                                        {request.due_date && (
                                            <div>
                                                <span className="font-medium">Due date:</span> {request.due_date}
                                            </div>
                                        )}
                                        {request.company && (
                                            <div>
                                                <span className="font-medium">Company:</span> {request.company}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}