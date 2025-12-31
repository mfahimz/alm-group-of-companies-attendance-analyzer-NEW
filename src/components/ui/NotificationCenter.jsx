import React, { useState } from 'react';
import { Bell, CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

export default function NotificationCenter() {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: currentUser } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me()
    });

    const { data: exceptions = [] } = useQuery({
        queryKey: ['pendingExceptions'],
        queryFn: () => base44.entities.Exception.filter({ approval_status: 'pending' }),
        enabled: !!currentUser
    });

    const userRole = currentUser?.extended_role || currentUser?.role || 'user';
    const isAdminOrSupervisor = userRole === 'admin' || userRole === 'supervisor';

    // Filter exceptions for supervisor
    const visibleExceptions = isAdminOrSupervisor 
        ? (userRole === 'supervisor' 
            ? exceptions.filter(e => {
                const exceptionCompany = e.project_id; // Would need to join with project
                return currentUser.company === exceptionCompany;
              })
            : exceptions)
        : [];

    const notifications = [
        ...visibleExceptions.map(ex => ({
            id: ex.id,
            type: 'approval',
            icon: AlertCircle,
            iconColor: 'text-amber-600',
            bgColor: 'bg-amber-50',
            title: 'Pending Exception Approval',
            message: `Exception request from ${ex.attendance_id}`,
            time: new Date(ex.created_date),
            priority: 'high'
        }))
    ];

    const unreadCount = notifications.length;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="relative hover:bg-slate-100 transition-colors"
                >
                    <Bell className="h-5 w-5 text-slate-600" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-semibold animate-pulse">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="font-semibold text-slate-900">Notifications</h3>
                    {unreadCount > 0 && (
                        <span className="text-xs text-slate-500">{unreadCount} new</span>
                    )}
                </div>
                <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                            <CheckCircle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-sm text-slate-500">No notifications</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map((notif) => {
                                const Icon = notif.icon;
                                return (
                                    <div
                                        key={notif.id}
                                        className={cn(
                                            "p-4 hover:bg-slate-50 transition-colors cursor-pointer",
                                            notif.priority === 'high' && "border-l-4 border-l-amber-500"
                                        )}
                                    >
                                        <div className="flex gap-3">
                                            <div className={cn("p-2 rounded-lg h-fit", notif.bgColor)}>
                                                <Icon className={cn("h-4 w-4", notif.iconColor)} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 mb-1">
                                                    {notif.title}
                                                </p>
                                                <p className="text-xs text-slate-600 mb-2">
                                                    {notif.message}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    {formatTime(notif.time)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}

function formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
}