import { cn } from '@/lib/utils';

export function ShiftBadge({ type, children, className }) {
    const variants = {
        regular: "bg-indigo-50 text-indigo-700 border-indigo-100 ring-indigo-500/10",
        single: "bg-amber-50 text-amber-700 border-amber-100 ring-amber-500/10",
        friday: "bg-emerald-50 text-emerald-700 border-emerald-100 ring-emerald-500/10",
        ramadan: "bg-purple-50 text-purple-700 border-purple-100 ring-purple-500/10",
        default: "bg-slate-50 text-slate-600 border-slate-100 ring-slate-500/10"
    };

    const variant = variants[type] || variants.default;

    return (
        <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ring-1 ring-inset transition-all",
            variant,
            className
        )}>
            {children}
        </span>
    );
}

export function DayBadge({ day, active }) {
    return (
        <span className={cn(
            "w-6 h-6 flex items-center justify-center rounded-full text-[9px] font-bold border transition-all",
            active 
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                : "bg-slate-50 text-slate-400 border-slate-100"
        )}>
            {day.substring(0, 1)}
        </span>
    );
}
