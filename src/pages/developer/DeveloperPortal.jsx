import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Terminal, Plus, Trash2, Braces } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const SECTIONS = ["Changes", "User Requests", "CEO Approval"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

const PriorityBadge = ({ priority }) => {
    const colors = {
        Low: "bg-blue-100 text-blue-700",
        Medium: "bg-yellow-100 text-yellow-700",
        High: "bg-orange-100 text-orange-700",
        Critical: "bg-red-100 text-red-700"
    };
    return <Badge className={`${colors[priority]} text-xs font-medium`}>{priority}</Badge>;
};

const StatusBadge = ({ status }) => {
    const colors = {
        Pending: "bg-slate-100 text-slate-600",
        "In Progress": "bg-indigo-100 text-indigo-700",
        Frozen: "bg-amber-100 text-amber-700",
        Completed: "bg-emerald-100 text-emerald-700"
    };
    return <Badge variant="outline" className={`${colors[status]} text-xs`}>{status}</Badge>;
};

function KanbanCard({ card, onUpdate, onDelete, onOpenNotes }) {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(card.title);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (title.trim() && title !== card.title) {
                onUpdate(card.id, { title });
            }
            setIsEditing(false);
        }
    };

    const handleBlur = () => {
        if (title.trim() && title !== card.title) {
            onUpdate(card.id, { title });
        }
        setIsEditing(false);
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <Card className="mb-2 p-3 hover:shadow-md transition-shadow cursor-move bg-white border border-slate-200">
                <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                            {isEditing ? (
                                <Textarea
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onBlur={handleBlur}
                                    className="min-h-[60px] text-sm resize-none"
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <p 
                                    className="text-sm text-slate-800 cursor-text whitespace-pre-wrap"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsEditing(true);
                                    }}
                                >
                                    {card.title}
                                </p>
                            )}
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-slate-400 hover:text-red-600"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(card.id);
                            }}
                        >
                            <Trash2 className="w-3 h-3" />
                        </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <PriorityBadge priority={card.priority} />
                        <StatusBadge status={card.status} />
                        {card.technical_notes && (
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-slate-500"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenNotes(card);
                                }}
                            >
                                <Braces className="w-3 h-3" />
                            </Button>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
}

function KanbanColumn({ section, cards, onUpdate, onDelete, onAdd, onOpenNotes }) {
    return (
        <div className="flex-1 min-w-[320px]">
            <div className="bg-slate-100 rounded-lg p-4 h-[calc(100vh-280px)]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-800">{section}</h3>
                    <Badge variant="secondary" className="text-xs">{cards.length}</Badge>
                </div>
                <div className="space-y-2 overflow-y-auto h-[calc(100%-60px)] pr-2">
                    <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        {cards.map((card) => (
                            <KanbanCard 
                                key={card.id} 
                                card={card} 
                                onUpdate={onUpdate}
                                onDelete={onDelete}
                                onOpenNotes={onOpenNotes}
                            />
                        ))}
                    </SortableContext>
                </div>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-2"
                    onClick={() => onAdd(section)}
                >
                    <Plus className="w-4 h-4 mr-1" /> Add Card
                </Button>
            </div>
        </div>
    );
}

export default function DeveloperPortal() {
    const queryClient = useQueryClient();
    const [selectedNotes, setSelectedNotes] = useState(null);

    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: allCards = [] } = useQuery({
        queryKey: ['developerChangeRequests'],
        queryFn: () => base44.entities.DeveloperChangeLog.list('sort_order')
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.DeveloperChangeLog.update(id, data),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ['developerChangeRequests'] });
            const previous = queryClient.getQueryData(['developerChangeRequests']);
            queryClient.setQueryData(['developerChangeRequests'], old =>
                old.map(card => card.id === id ? { ...card, ...data } : card)
            );
            return { previous };
        },
        onError: (err, variables, context) => {
            queryClient.setQueryData(['developerChangeRequests'], context.previous);
            toast.error('Update failed');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
        }
    });

    const createMutation = useMutation({
        mutationFn: (cardData) => base44.entities.DeveloperChangeLog.create({
            ...cardData,
            created_by: user?.email,
            created_at: new Date().toISOString()
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Card added');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.DeveloperChangeLog.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['developerChangeRequests'] });
            toast.success('Card deleted');
        }
    });

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over) return;

        const activeCard = allCards.find(c => c.id === active.id);
        const overCard = allCards.find(c => c.id === over.id);

        if (!activeCard) return;

        // Determine target section
        let targetSection = activeCard.section_type;
        if (overCard) {
            targetSection = overCard.section_type;
        }

        const sectionCards = allCards.filter(c => c.section_type === targetSection);
        const oldIndex = sectionCards.findIndex(c => c.id === active.id);
        const newIndex = sectionCards.findIndex(c => c.id === over.id);

        if (activeCard.section_type !== targetSection) {
            // Moving to different section
            updateMutation.mutate({ 
                id: active.id, 
                data: { section_type: targetSection, sort_order: newIndex }
            });
        } else if (oldIndex !== newIndex) {
            // Reordering within same section
            const reordered = arrayMove(sectionCards, oldIndex, newIndex);
            reordered.forEach((card, index) => {
                if (card.sort_order !== index) {
                    updateMutation.mutate({ id: card.id, data: { sort_order: index } });
                }
            });
        }
    };

    const handleUpdate = (id, data) => {
        updateMutation.mutate({ id, data });
    };

    const handleDelete = (id) => {
        if (confirm('Delete this card?')) {
            deleteMutation.mutate(id);
        }
    };

    const handleAdd = (section) => {
        createMutation.mutate({
            title: 'New task...',
            section_type: section,
            priority: 'Medium',
            status: 'Pending',
            sort_order: allCards.filter(c => c.section_type === section).length
        });
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-indigo-600 font-semibold mb-2">
                        <Terminal className="w-5 h-5" />
                        <span>Developer Portal</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Change Management</h1>
                    <p className="text-slate-500">Kanban workflow for tracking development tasks</p>
                </div>
            </header>

            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
                <div className="flex gap-4 overflow-x-auto pb-4">
                    {SECTIONS.map(section => (
                        <KanbanColumn 
                            key={section}
                            section={section}
                            cards={allCards.filter(c => c.section_type === section).sort((a, b) => a.sort_order - b.sort_order)}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                            onAdd={handleAdd}
                            onOpenNotes={setSelectedNotes}
                        />
                    ))}
                </div>
            </DndContext>

            <Dialog open={!!selectedNotes} onOpenChange={() => setSelectedNotes(null)}>
                <DialogContent className="sm:max-w-[700px]">
                    <DialogHeader>
                        <DialogTitle>Technical Notes</DialogTitle>
                        <DialogDescription>Implementation details and prompts</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Textarea 
                            className="min-h-[400px] font-mono text-sm bg-slate-900 text-slate-100 p-4 rounded-lg"
                            placeholder="Add implementation notes..."
                            value={selectedNotes?.technical_notes || ''}
                            onChange={(e) => {
                                const updated = { ...selectedNotes, technical_notes: e.target.value };
                                setSelectedNotes(updated);
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button 
                            onClick={() => {
                                if (selectedNotes?.id) {
                                    updateMutation.mutate({ 
                                        id: selectedNotes.id, 
                                        data: { technical_notes: selectedNotes.technical_notes } 
                                    });
                                }
                                setSelectedNotes(null);
                            }}
                        >
                            Save & Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}