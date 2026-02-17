import React, { useState } from 'react';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Copy, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { Badge } from '@/components/ui/badge';

export default function DevelopmentLog() {
    usePageTitle('Development Log');
    const queryClient = useQueryClient();
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    const { data: logs = [], isLoading } = useQuery({
        queryKey: ['developmentLogs'],
        queryFn: () => base44.entities.DevelopmentLog.list('-date')
    });

    const aiPrompt = `Generate a DevelopmentLog entry based on recent code changes related to [specific feature, e.g., company filtering]. Focus on the files [list relevant files] and describe the changes, their impact, and any new components or entities created. 

Format as JSON:
{
  "title": "Brief title of the change",
  "date": "${new Date().toISOString().split('T')[0]}",
  "summary": "One-line summary",
  "details": "Detailed markdown explanation with code examples if needed",
  "category": "Feature|Bug Fix|Refactor|Enhancement|Documentation|Setup",
  "related_files": "path/to/file1.js,path/to/file2.js",
  "tags": "frontend,backend,feature-name"
}`;

    const copyPrompt = () => {
        navigator.clipboard.writeText(aiPrompt);
        setCopiedPrompt(true);
        toast.success('Prompt copied to clipboard!');
        setTimeout(() => setCopiedPrompt(false), 2000);
    };

    const getCategoryColor = (category) => {
        const colors = {
            'Feature': 'badge-success',
            'Bug Fix': 'badge-error',
            'Refactor': 'badge-info',
            'Enhancement': 'badge-attendance',
            'Documentation': 'badge-neutral',
            'Setup': 'badge-admin'
        };
        return colors[category] || 'badge-neutral';
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-[#1F2937]">Development Log</h1>
                    <p className="text-[#6B7280] mt-1">Track all development changes and progress</p>
                </div>
            </div>

            <Card className="border-l-4 border-l-blue-500">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            AI Documentation Prompt
                        </CardTitle>
                        <Button onClick={copyPrompt} variant="outline" size="sm">
                            <Copy className="w-4 h-4 mr-2" />
                            {copiedPrompt ? 'Copied!' : 'Copy Prompt'}
                        </Button>
                    </div>
                    <CardDescription>
                        Use this prompt in Base44 AI Chat to generate development log entries
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <pre className="bg-[#F4F6F9] p-4 rounded-md text-sm whitespace-pre-wrap font-mono text-[#1F2937] border border-[#E2E6EC]">
                        {aiPrompt}
                    </pre>
                    <p className="mt-3 text-sm text-[#6B7280]">
                        Adjust the [specific feature] and [list relevant files] to match your changes. 
                        Copy the generated JSON and create a new DevelopmentLog entry manually.
                    </p>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-[#1F2937]">Recent Logs</h2>
                {isLoading ? (
                    <div className="text-center py-8 text-[#6B7280]">Loading logs...</div>
                ) : logs.length === 0 ? (
                    <Card>
                        <CardContent className="py-8 text-center text-[#6B7280]">
                            No development logs yet. Create your first entry!
                        </CardContent>
                    </Card>
                ) : (
                    logs.map((log) => (
                        <Card key={log.id} className="hover:shadow-md transition-shadow">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge className={getCategoryColor(log.category)}>
                                                {log.category}
                                            </Badge>
                                            <span className="text-sm text-[#6B7280]">{log.date}</span>
                                        </div>
                                        <CardTitle className="text-xl">{log.title}</CardTitle>
                                        <CardDescription className="mt-1">{log.summary}</CardDescription>
                                    </div>
                                </div>
                                {log.tags && (
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        {log.tags.split(',').map((tag, idx) => (
                                            <span key={idx} className="text-xs bg-[#F4F6F9] text-[#4B5563] px-2 py-1 rounded">
                                                {tag.trim()}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="prose prose-sm max-w-none">
                                    <ReactMarkdown>{log.details}</ReactMarkdown>
                                </div>
                                {log.related_files && (
                                    <div className="mt-4 pt-4 border-t border-[#E2E6EC]">
                                        <p className="text-sm font-medium text-[#4B5563] mb-2">Related Files:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {log.related_files.split(',').map((file, idx) => (
                                                <code key={idx} className="text-xs bg-[#F4F6F9] px-2 py-1 rounded text-[#1F2937]">
                                                    {file.trim()}
                                                </code>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}