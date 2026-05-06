import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardHealthCard({ 
    title, 
    value, 
    subtitle, 
    icon: Icon, 
    status = 'neutral', // 'success' | 'warning' | 'error' | 'neutral'
    onClick,
    loading = false
}) {
    const statusColors = {
        success: 'text-green-600 bg-green-50 ring-green-100 border-green-200',
        warning: 'text-amber-600 bg-amber-50 ring-amber-100 border-amber-200',
        error: 'text-red-600 bg-red-50 ring-red-100 border-red-200',
        neutral: 'text-slate-600 bg-slate-50 ring-slate-100 border-slate-200'
    };

    return (
        <Card 
            className={cn(
                "group relative overflow-hidden transition-all duration-300 hover:shadow-md cursor-pointer border ring-1",
                statusColors[status] || statusColors.neutral,
                onClick ? "hover:-translate-y-1" : "cursor-default"
            )}
            onClick={onClick}
        >
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            {Icon && <Icon className="w-4 h-4" />}
                            <span className="text-xs font-bold uppercase tracking-wider opacity-80">{title}</span>
                        </div>
                        
                        <div className="flex items-baseline gap-2">
                            {loading ? (
                                <div className="h-8 w-16 bg-slate-200/50 animate-pulse rounded" />
                            ) : (
                                <h3 className="text-2xl font-black tracking-tight">{value}</h3>
                            )}
                            <span className="text-xs font-medium opacity-70">{subtitle}</span>
                        </div>
                    </div>

                    <div className={cn(
                        "p-2 rounded-full transition-transform duration-300 group-hover:scale-110",
                        status === 'success' ? "bg-green-100" :
                        status === 'warning' ? "bg-amber-100" :
                        status === 'error' ? "bg-red-100" :
                        "bg-slate-100"
                    )}>
                        {status === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
                         status === 'error' ? <AlertCircle className="w-5 h-5" /> : 
                         <ChevronRight className="w-5 h-5" />}
                    </div>
                </div>

                {/* Subtle bottom indicator */}
                <div className={cn(
                    "absolute bottom-0 left-0 h-1 w-full opacity-30",
                    status === 'success' ? "bg-green-500" :
                    status === 'warning' ? "bg-amber-500" :
                    status === 'error' ? "bg-red-500" :
                    "bg-slate-500"
                )} />
            </CardContent>
        </Card>
    );
}