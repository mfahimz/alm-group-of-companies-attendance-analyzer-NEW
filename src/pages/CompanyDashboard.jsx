import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Calendar as CalendarIcon, Settings, BarChart3, Eye, EyeOff } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';
import { parseDateInUAE, formatInUAE } from '@/components/ui/timezone';
import ProjectsWidget from '@/components/dashboard-widgets/ProjectsWidget';
import AnalysisProgressWidget from '@/components/dashboard-widgets/AnalysisProgressWidget';
import RecentActivityWidget from '@/components/dashboard-widgets/RecentActivityWidget';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const defaultLayout = [
    { id: 'projects', title: 'Project Overview', component: 'ProjectsWidget', x: 0, y: 0, w: 4, h: 2, visible: true },
    { id: 'analysis', title: 'Analysis Progress', component: 'AnalysisProgressWidget', x: 4, y: 0, w: 4, h: 2, visible: true },
    { id: 'activity', title: 'Recent Activity', component: 'RecentActivityWidget', x: 0, y: 2, w: 8, h: 2, visible: true }
];

export default function CompanyDashboard() {
    const queryClient = useQueryClient();
    const [widgets, setWidgets] = useState(defaultLayout);
    const [dateRangePreset, setDateRangePreset] = useState('this_month');
    const [customDateFrom, setCustomDateFrom] = useState(null);
    const [customDateTo, setCustomDateTo] = useState(null);
    const [dateRange, setDateRange] = useState({ from: null, to: null });
    const [showSettings, setShowSettings] = useState(false);

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const canAccessAllCompanies = ['admin', 'supervisor', 'ceo'].includes(userRole);

    // Load saved layout
    const { data: savedLayout } = useQuery({
        queryKey: ['dashboardLayout', currentUser?.email],
        queryFn: async () => {
            if (!currentUser) return null;
            const layouts = await base44.entities.DashboardLayout.filter({ user_email: currentUser.email });
            return layouts.length > 0 ? layouts[0] : null;
        },
        enabled: !!currentUser
    });

    // Save layout mutation
    const saveLayoutMutation = useMutation({
        mutationFn: async (layoutData) => {
            if (savedLayout?.id) {
                return await base44.entities.DashboardLayout.update(savedLayout.id, layoutData);
            } else {
                return await base44.entities.DashboardLayout.create({
                    user_email: currentUser.email,
                    ...layoutData
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboardLayout'] });
        }
    });

    // Load saved layout on mount
    useEffect(() => {
        if (savedLayout) {
            try {
                const config = JSON.parse(savedLayout.layout_config);
                setWidgets(config);
                setDateRangePreset(savedLayout.date_range_preset || 'this_month');
                if (savedLayout.custom_date_from) setCustomDateFrom(parseDateInUAE(savedLayout.custom_date_from));
                if (savedLayout.custom_date_to) setCustomDateTo(parseDateInUAE(savedLayout.custom_date_to));
            } catch (e) {
                console.error('Failed to parse layout:', e);
            }
        }
    }, [savedLayout]);

    // Calculate date range based on preset
    useEffect(() => {
        const now = new Date();
        let from, to;

        switch (dateRangePreset) {
            case 'today':
                from = startOfDay(now);
                to = endOfDay(now);
                break;
            case 'this_week':
                from = startOfWeek(now, { weekStartsOn: 0 });
                to = endOfWeek(now, { weekStartsOn: 0 });
                break;
            case 'this_month':
                from = startOfMonth(now);
                to = endOfMonth(now);
                break;
            case 'this_quarter':
                from = startOfQuarter(now);
                to = endOfQuarter(now);
                break;
            case 'this_year':
                from = startOfYear(now);
                to = endOfYear(now);
                break;
            case 'custom':
                from = customDateFrom;
                to = customDateTo;
                break;
            default:
                from = startOfMonth(now);
                to = endOfMonth(now);
        }

        setDateRange({ from, to });
    }, [dateRangePreset, customDateFrom, customDateTo]);

    const handleDragEnd = (result) => {
        if (!result.destination) return;

        const items = Array.from(widgets);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        setWidgets(items);
        saveLayoutMutation.mutate({
            layout_config: JSON.stringify(items),
            date_range_preset: dateRangePreset,
            custom_date_from: customDateFrom ? formatInUAE(customDateFrom, 'yyyy-MM-dd') : null,
            custom_date_to: customDateTo ? formatInUAE(customDateTo, 'yyyy-MM-dd') : null
        });
    };

    const toggleWidgetVisibility = (widgetId) => {
        const updated = widgets.map(w => 
            w.id === widgetId ? { ...w, visible: !w.visible } : w
        );
        setWidgets(updated);
        saveLayoutMutation.mutate({
            layout_config: JSON.stringify(updated),
            date_range_preset: dateRangePreset,
            custom_date_from: customDateFrom ? formatInUAE(customDateFrom, 'yyyy-MM-dd') : null,
            custom_date_to: customDateTo ? formatInUAE(customDateTo, 'yyyy-MM-dd') : null
        });
    };

    const handlePresetChange = (preset) => {
        setDateRangePreset(preset);
        saveLayoutMutation.mutate({
            layout_config: JSON.stringify(widgets),
            date_range_preset: preset,
            custom_date_from: customDateFrom ? formatInUAE(customDateFrom, 'yyyy-MM-dd') : null,
            custom_date_to: customDateTo ? formatInUAE(customDateTo, 'yyyy-MM-dd') : null
        });
    };

    const renderWidget = (widget) => {
        const widgetProps = {
            dateRange,
            company: canAccessAllCompanies ? null : currentUser?.company,
            userRole
        };

        switch (widget.component) {
            case 'ProjectsWidget':
                return <ProjectsWidget {...widgetProps} />;
            case 'AnalysisProgressWidget':
                return <AnalysisProgressWidget {...widgetProps} />;
            case 'RecentActivityWidget':
                return <RecentActivityWidget {...widgetProps} />;
            default:
                return <div>Unknown widget</div>;
        }
    };

    if (!currentUser || !canAccessAllCompanies) {
        return (
            <div className="flex items-center justify-center h-96">
                <p className="text-slate-500">Access denied. This dashboard is only available to Admins, Supervisors, and CEOs.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Company Dashboard</h1>
                    <p className="text-slate-500 mt-1">Aggregate metrics and insights across all modules</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Date Range Selector */}
                    <Select value={dateRangePreset} onValueChange={handlePresetChange}>
                        <SelectTrigger className="w-48">
                            <CalendarIcon className="w-4 h-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="this_week">This Week</SelectItem>
                            <SelectItem value="this_month">This Month</SelectItem>
                            <SelectItem value="this_quarter">This Quarter</SelectItem>
                            <SelectItem value="this_year">This Year</SelectItem>
                            <SelectItem value="custom">Custom Range</SelectItem>
                        </SelectContent>
                    </Select>

                    {dateRangePreset === 'custom' && (
                        <div className="flex items-center gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        {customDateFrom ? format(customDateFrom, 'MMM dd, yyyy') : 'From'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={customDateFrom}
                                        onSelect={setCustomDateFrom}
                                    />
                                </PopoverContent>
                            </Popover>
                            <span className="text-slate-400">to</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        {customDateTo ? format(customDateTo, 'MMM dd, yyyy') : 'To'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={customDateTo}
                                        onSelect={setCustomDateTo}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}

                    {/* Widget Settings */}
                    <Dialog open={showSettings} onOpenChange={setShowSettings}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Settings className="w-4 h-4 mr-2" />
                                Customize
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Widget Settings</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                {widgets.map(widget => (
                                    <div key={widget.id} className="flex items-center justify-between">
                                        <Label htmlFor={widget.id} className="flex items-center gap-2">
                                            {widget.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                            {widget.title}
                                        </Label>
                                        <Switch
                                            id={widget.id}
                                            checked={widget.visible}
                                            onCheckedChange={() => toggleWidgetVisibility(widget.id)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Date Range Display */}
            {dateRange.from && dateRange.to && (
                <Card className="bg-indigo-50 border-indigo-200">
                    <CardContent className="py-3">
                        <p className="text-sm text-indigo-900">
                            Showing data from <strong>{format(dateRange.from, 'MMM dd, yyyy')}</strong> to <strong>{format(dateRange.to, 'MMM dd, yyyy')}</strong>
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Widgets */}
            <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="widgets">
                    {(provided) => (
                        <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                        >
                            {widgets.filter(w => w.visible).map((widget, index) => (
                                <Draggable key={widget.id} draggableId={widget.id} index={index}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                            className={`${snapshot.isDragging ? 'opacity-50' : ''}`}
                                            style={{
                                                gridColumn: `span ${widget.w}`,
                                                gridRow: `span ${widget.h}`,
                                                ...provided.draggableProps.style
                                            }}
                                        >
                                            <Card className="h-full">
                                                <CardHeader>
                                                    <CardTitle className="flex items-center gap-2 text-base">
                                                        <BarChart3 className="w-5 h-5 text-indigo-600" />
                                                        {widget.title}
                                                    </CardTitle>
                                                </CardHeader>
                                                <CardContent>
                                                    {renderWidget(widget)}
                                                </CardContent>
                                            </Card>
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </div>
    );
}