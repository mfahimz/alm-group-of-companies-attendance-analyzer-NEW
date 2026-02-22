import { useState } from 'react';
import { usePageTitle } from '@/components/ui/PageTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Copy, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AppDocumentation() {
    usePageTitle('App Documentation');
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    const { data: docs = [], isLoading } = useQuery({
        queryKey: ['appDocuments'],
        queryFn: () => base44.entities.AppDocument.list('-updated_date')
    });

    const aiPrompt = `Generate an AppDocument entry covering the [specific topic, e.g., 'Company Filtering Architecture']. 

Explain its purpose, key components, data flow, and any relevant entities or functions. Ensure it's detailed and uses markdown format with code examples where helpful.

Format as JSON:
{
  "title": "Document title",
  "content": "Full markdown content with ## headings, code blocks, etc.",
  "category": "Architecture|Database|Frontend|Backend|Integrations|UI/UX Guidelines|General",
  "tags": "system-design,context-api,feature-name",
  "last_updated_by": "your-email@example.com"
}`;

    const copyPrompt = () => {
        navigator.clipboard.writeText(aiPrompt);
        setCopiedPrompt(true);
        toast.success('Prompt copied to clipboard!');
        setTimeout(() => setCopiedPrompt(false), 2000);
    };

    const getCategoryColor = (category) => {
        const colors = {
            'Architecture': 'badge-info',
            'Database': 'badge-admin',
            'Frontend': 'badge-attendance',
            'Backend': 'badge-salary',
            'Integrations': 'badge-overtime',
            'UI/UX Guidelines': 'badge-reports',
            'General': 'badge-neutral'
        };
        return colors[category] || 'badge-neutral';
    };

    const categories = [...new Set(docs.map(doc => doc.category))];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-[#1F2937]">App Documentation</h1>
                    <p className="text-[#6B7280] mt-1">Technical documentation, architecture, and guidelines</p>
                </div>
            </div>

            <Card className="border-l-4 border-l-purple-500">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="w-5 h-5" />
                            AI Documentation Prompt
                        </CardTitle>
                        <Button onClick={copyPrompt} variant="outline" size="sm">
                            <Copy className="w-4 h-4 mr-2" />
                            {copiedPrompt ? 'Copied!' : 'Copy Prompt'}
                        </Button>
                    </div>
                    <CardDescription>
                        Use this prompt in Base44 AI Chat to generate technical documentation
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <pre className="bg-[#F4F6F9] p-4 rounded-md text-sm whitespace-pre-wrap font-mono text-[#1F2937] border border-[#E2E6EC]">
                        {aiPrompt}
                    </pre>
                    <p className="mt-3 text-sm text-[#6B7280]">
                        Adjust the [specific topic] to match what you want to document. 
                        Copy the generated JSON and create a new AppDocument entry manually.
                    </p>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-[#1F2937]">Documentation</h2>
                {isLoading ? (
                    <div className="text-center py-8 text-[#6B7280]">Loading documentation...</div>
                ) : docs.length === 0 ? (
                    <Card>
                        <CardContent className="py-8 text-center text-[#6B7280]">
                            No documentation yet. Create your first document!
                        </CardContent>
                    </Card>
                ) : (
                    <Tabs defaultValue={categories[0] || 'all'} className="w-full">
                        <TabsList>
                            <TabsTrigger value="all">All</TabsTrigger>
                            {categories.map(cat => (
                                <TabsTrigger key={cat} value={cat}>{cat}</TabsTrigger>
                            ))}
                        </TabsList>
                        <TabsContent value="all" className="space-y-4 mt-4">
                            {docs.map((doc) => (
                                <Card key={doc.id} className="hover:shadow-md transition-shadow">
                                    <CardHeader>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge className={getCategoryColor(doc.category)}>
                                                {doc.category}
                                            </Badge>
                                        </div>
                                        <CardTitle className="text-xl">{doc.title}</CardTitle>
                                        {doc.tags && (
                                            <div className="flex gap-2 mt-2 flex-wrap">
                                                {doc.tags.split(',').map((tag, idx) => (
                                                    <span key={idx} className="text-xs bg-[#F4F6F9] text-[#4B5563] px-2 py-1 rounded">
                                                        {tag.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </CardHeader>
                                    <CardContent>
                                        <div className="prose prose-sm max-w-none">
                                            <ReactMarkdown>{doc.content}</ReactMarkdown>
                                        </div>
                                        {doc.last_updated_by && (
                                            <p className="text-xs text-[#9CA3AF] mt-4 pt-4 border-t border-[#E2E6EC]">
                                                Last updated by: {doc.last_updated_by}
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </TabsContent>
                        {categories.map(cat => (
                            <TabsContent key={cat} value={cat} className="space-y-4 mt-4">
                                {docs.filter(doc => doc.category === cat).map((doc) => (
                                    <Card key={doc.id} className="hover:shadow-md transition-shadow">
                                        <CardHeader>
                                            <CardTitle className="text-xl">{doc.title}</CardTitle>
                                            {doc.tags && (
                                                <div className="flex gap-2 mt-2 flex-wrap">
                                                    {doc.tags.split(',').map((tag, idx) => (
                                                        <span key={idx} className="text-xs bg-[#F4F6F9] text-[#4B5563] px-2 py-1 rounded">
                                                            {tag.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </CardHeader>
                                        <CardContent>
                                            <div className="prose prose-sm max-w-none">
                                                <ReactMarkdown>{doc.content}</ReactMarkdown>
                                            </div>
                                            {doc.last_updated_by && (
                                                <p className="text-xs text-[#9CA3AF] mt-4 pt-4 border-t border-[#E2E6EC]">
                                                    Last updated by: {doc.last_updated_by}
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </TabsContent>
                        ))}
                    </Tabs>
                )}
            </div>
        </div>
    );
}