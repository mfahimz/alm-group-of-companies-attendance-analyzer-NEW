import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Terminal, Plus, Clock, CheckCircle2, AlertCircle, PlayCircle, Snowflake, Braces, GitPullRequest, Info } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ["Logic", "UI", "Architecture"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Pending", "In Progress", "Frozen", "Completed"];

const StatusIcon = ({ status }) => {
    switch (status) {
        case 'Pending': return <Clock className="w-4 h-4 text-slate-400" />;
        case 'In Progress': return <PlayCircle className="w-4 h-4 text-blue-500" />;
        case 'Frozen': return <AlertCircle className="w-4 h-4 text-amber-500" />;
        case 'Completed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
        default: return null;
    }
};

const PriorityBadge = ({ priority }) => {
    const variants = {
        Low: "outline",
        Medium: "secondary",
        High: "destructive",
        Critical: "destructive"
    };
    return <Badge variant={variants[priority] || "default"}>{priority}</Badge>;
};

export default function DeveloperPortal() {
    const queryClient = useQueryClient();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [isEditOpen, setIsEditOpen] = useState(false);

    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ['developerChangeRequests'],
        queryFn: () => base44.entities.DeveloperChangeLog.list('-created_at')
    });

    const createMutation = useMutation({
        mutationFn: (requestData) => base44.entities.DeveloperChangeLog.create({
            ...(requestData || {}),
            created_by: user?.email,
            created_at: new Date().toISOString()
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Change request logged successfully!');
            setIsAddOpen(false);
        }
    });

    const updateMutation = useMutation({
        mutationFn: (updateData) => base44.entities.DeveloperChangeLog.update(updateData.id, updateData.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Request updated');
            setIsEditOpen(false);
        }
    });

    const handleCreateRequest = (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {};
        formData.forEach((value, key) => { data[key] = value; });
        createMutation.mutate(data);
    };

    const toggleStatus = (request, newStatus) => {
        updateMutation.mutate({
            id: request.id,
            data: { status: newStatus }
        });
    };

    const handleEditRequest = (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = {};
        formData.forEach((value, key) => { data[key] = value; });
        updateMutation.mutate({ id: selectedRequest.id, data });
    };

    return (
        <div className="space-y-8">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-indigo-600 font-semibold mb-2">
                        <Terminal className="w-5 h-5" />
                        <span>Developer Portal</span>
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Change Management</h1>
                    <p className="text-slate-500 max-w-2xl">
                        Unified interface for tracking architecture shifts, logic updates, and UI refinements.
                    </p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-indigo-600 hover:bg-indigo-700 h-11 px-6 text-white transition-all">
                            <Plus className="w-4 h-4 mr-2" />
                            New Change Request
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px]">
                        <form onSubmit={handleCreateRequest}>
                            <DialogHeader>
                                <DialogTitle>Log Change Request</DialogTitle>
                                <DialogDescription>Create a new entry in the development log.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-6 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title">Title</Label>
                                    <Input id="title" name="title" placeholder="e.g. Implement Multi-Tiered Salary Model" required={true} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="category">Category</Label>
                                        <Select name="category" defaultValue="Logic">
                                            <SelectTrigger id="category-trigger"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="priority">Priority</Label>
                                        <Select name="priority" defaultValue="Medium">
                                            <SelectTrigger id="priority-trigger"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea id="description" name="description" placeholder="Describe the change..." required={true} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="technical_notes">Technical Notes</Label>
                                    <Textarea id="technical_notes" name="technical_notes" placeholder="Prompts, code references..." className="font-mono text-sm" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={createMutation.isPending}>
                                    {createMutation.isPending ? 'Logging...' : 'Save Request'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </header>

            <div className="grid grid-cols-1 gap-6">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <Card key={i} className="animate-pulse bg-slate-50 h-64" />
                        ))}
                    </div>
                ) : requests.length === 0 ? (
                    <Card className="border-dashed border-2">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <GitPullRequest className="w-12 h-12 text-slate-300 mb-4" />
                            <h3 className="text-lg font-semibold">No Change Requests</h3>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {requests.map((request) => (
                            <Card key={request.id} className="group hover:border-indigo-200 transition-all flex flex-col">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between mb-2">
                                        <Badge variant="outline">{request.category}</Badge>
                                        <PriorityBadge priority={request.priority} />
                                    </div>
                                    <CardTitle className="text-lg font-bold group-hover:text-indigo-600 transition-colors">
                                        {request.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex-1 space-y-4">
                                    <p className="text-sm text-slate-500 line-clamp-3">{request.description}</p>
                                    <div className="flex items-center justify-between text-xs pt-2 border-t">
                                        <div className="flex items-center gap-1.5 font-medium">
                                            <StatusIcon status={request.status} />
                                            <span>{request.status}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-7 px-2"
                                                onClick={() => {
                                                    setSelectedRequest(request);
                                                    setIsEditOpen(true);
                                                }}
                                            >
                                                <Braces className="w-3.5 h-3.5 mr-1" />
                                                Docs
                                            </Button>
                                            <Select 
                                                value={request.status} 
                                                onValueChange={(val) => toggleStatus(request, val)}
                                            >
                                                <SelectTrigger className="h-7 w-[100px] text-[10px] border-none bg-slate-50">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[700px]">
                    {selectedRequest && (
                        <form onSubmit={handleEditRequest}>
                            <DialogHeader>
                                <DialogTitle>{selectedRequest.title}</DialogTitle>
                            </DialogHeader>
                            <Tabs defaultValue="details" className="py-4">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="details">Details</TabsTrigger>
                                    <TabsTrigger value="technical">Technical</TabsTrigger>
                                </TabsList>
                                <TabsContent value="details" className="space-y-4 pt-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="edit-category">Category</Label>
                                            <Select name="category" defaultValue={selectedRequest.category}>
                                                <SelectTrigger id="edit-category"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="edit-priority">Priority</Label>
                                            <Select name="priority" defaultValue={selectedRequest.priority}>
                                                <SelectTrigger id="edit-priority"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="edit-description">Description</Label>
                                        <Textarea id="edit-description" name="description" defaultValue={selectedRequest.description} className="min-h-[100px]" required={true} />
                                    </div>
                                </TabsContent>
                                <TabsContent value="technical" className="space-y-4 pt-4">
                                    <Label htmlFor="edit-technical">Implementation Prompt Base</Label>
                                    <Textarea id="edit-technical" name="technical_notes" defaultValue={selectedRequest.technical_notes} className="min-h-[300px] font-mono text-sm bg-slate-900 text-slate-100" />
                                </TabsContent>
                            </Tabs>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                                <Button type="submit" disabled={updateMutation.isPending}>Save Changes</Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
