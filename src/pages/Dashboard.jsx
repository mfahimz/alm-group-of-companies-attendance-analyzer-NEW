import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderKanban, Users, AlertCircle, CheckCircle, Bot, X, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import Breadcrumb from '../components/ui/Breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function Dashboard() {
    const [showAssistant, setShowAssistant] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { data: projects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => base44.entities.Project.list('-created_date')
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['employees'],
        queryFn: () => base44.entities.Employee.list()
    });

    const stats = [
        {
            label: 'Total Projects',
            value: projects.length,
            icon: FolderKanban,
            color: 'bg-indigo-500',
            bgColor: 'bg-indigo-50'
        },
        {
            label: 'Draft Projects',
            value: projects.filter(p => p.status === 'draft').length,
            icon: AlertCircle,
            color: 'bg-amber-500',
            bgColor: 'bg-amber-50'
        },
        {
            label: 'Analyzed Projects',
            value: projects.filter(p => p.status === 'analyzed').length,
            icon: CheckCircle,
            color: 'bg-green-500',
            bgColor: 'bg-green-50'
        },
        {
            label: 'Active Employees',
            value: employees.filter(e => e.active === true).length,
            icon: Users,
            color: 'bg-blue-500',
            bgColor: 'bg-blue-50'
        }
    ];

    const recentProjects = projects.slice(0, 5);

    const handleOpenAssistant = async () => {
        setShowAssistant(true);
        if (!conversationId) {
            const conversation = await base44.agents.createConversation({
                agent_name: 'attendance_assistant',
                metadata: { name: 'Dashboard Chat' }
            });
            setConversationId(conversation.id);
            
            const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
                setMessages(data.messages || []);
            });
        }
    };

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || !conversationId) return;
        
        setIsLoading(true);
        try {
            const conversation = await base44.agents.getConversation(conversationId);
            await base44.agents.addMessage(conversation, {
                role: 'user',
                content: inputMessage
            });
            setInputMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <Breadcrumb items={[{ label: 'Dashboard' }]} />
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-600 mt-1 sm:mt-2 text-sm sm:text-base">Overview of attendance analysis system</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => {
                    const Icon = stat.icon;
                    
                    // Enhanced styling for stats cards
                    let gradientBg = 'bg-white';
                    let iconBg = stat.bgColor;
                    let iconColor = stat.color.replace('bg-', 'text-');
                    
                    if (stat.color.includes('indigo')) {
                        gradientBg = 'bg-gradient-to-br from-indigo-50/50 to-white';
                        iconBg = 'bg-indigo-100 text-indigo-600';
                    } else if (stat.color.includes('amber')) {
                        gradientBg = 'bg-gradient-to-br from-amber-50/50 to-white';
                        iconBg = 'bg-amber-100 text-amber-600';
                    } else if (stat.color.includes('green')) {
                        gradientBg = 'bg-gradient-to-br from-green-50/50 to-white';
                        iconBg = 'bg-green-100 text-green-600';
                    } else if (stat.color.includes('blue')) {
                        gradientBg = 'bg-gradient-to-br from-blue-50/50 to-white';
                        iconBg = 'bg-blue-100 text-blue-600';
                    }

                    return (
                        <Card key={stat.label} className={`border-0 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ${gradientBg}`}>
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500 font-medium uppercase tracking-wider text-[11px]">{stat.label}</p>
                                        <p className="text-3xl font-bold text-slate-900 mt-1 tracking-tight">{stat.value}</p>
                                    </div>
                                    <div className={`${iconBg} p-3.5 rounded-2xl shadow-sm`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* AI Assistant Button */}
            <Button
                onClick={handleOpenAssistant}
                className="fixed bottom-6 right-6 rounded-full h-14 w-14 shadow-xl bg-indigo-600 hover:bg-indigo-700 z-50"
                title="Open Attendance Assistant"
            >
                <Bot className="w-6 h-6" />
            </Button>

            {/* Recent Projects */}
            <Card className="border-0 bg-white/80 backdrop-blur-sm shadow-lg shadow-slate-200/50 rounded-2xl">
                <CardHeader className="border-b border-slate-100/80 px-8 py-6">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-1 bg-indigo-500 rounded-full"></div>
                        <CardTitle className="text-lg text-slate-900 font-bold">Recent Projects</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {recentProjects.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            No projects yet. Create your first project to get started.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {recentProjects.map((project) => (
                                <Link
                                    key={project.id}
                                    to={createPageUrl(`ProjectDetail?id=${project.id}`)}
                                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-slate-50 transition-colors gap-2 group"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">{project.name}</p>
                                        <p className="text-xs sm:text-sm text-slate-500 mt-1">
                                            {new Date(project.date_from).toLocaleDateString('en-GB')} - {new Date(project.date_to).toLocaleDateString('en-GB')}
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0">
                                        <span className={`
                                            px-2.5 py-1 rounded-full text-xs font-medium
                                            ${project.status === 'draft' ? 'bg-amber-100 text-amber-700' : ''}
                                            ${project.status === 'analyzed' ? 'bg-green-100 text-green-700' : ''}
                                            ${project.status === 'locked' ? 'bg-slate-100 text-slate-600' : ''}
                                        `}>
                                            {project.status}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* AI Assistant Dialog */}
            <Dialog open={showAssistant} onOpenChange={setShowAssistant}>
                <DialogContent className="max-w-2xl h-[600px] flex flex-col p-0">
                    <DialogHeader className="p-6 pb-4 border-b">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-100 p-2 rounded-lg">
                                    <Bot className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <DialogTitle>Attendance Assistant</DialogTitle>
                                    <p className="text-xs text-slate-500 mt-0.5">Ask about employee attendance, reports, and more</p>
                                </div>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {messages.length === 0 ? (
                            <div className="text-center text-slate-500 mt-8">
                                <Bot className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                                <p className="text-sm">Ask me anything about attendance data!</p>
                                <div className="mt-4 space-y-2 text-xs text-slate-400">
                                    <p>• "Who has the most absences?"</p>
                                    <p>• "Create an off exception for employee 123"</p>
                                    <p>• "Show me late patterns"</p>
                                </div>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-lg p-3 ${
                                        msg.role === 'user' 
                                            ? 'bg-indigo-600 text-white' 
                                            : 'bg-slate-100 text-slate-900'
                                    }`}>
                                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-100 rounded-lg p-3">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-100" />
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-200" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t">
                        <div className="flex gap-2">
                            <Input
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                                placeholder="Type your message..."
                                disabled={isLoading}
                                className="flex-1"
                            />
                            <Button 
                                onClick={handleSendMessage} 
                                disabled={isLoading || !inputMessage.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Send className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}