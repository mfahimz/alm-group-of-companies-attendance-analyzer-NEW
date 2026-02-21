import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-slate-200",
                className
            )}
            {...props}
        />
    );
}

export function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl shadow-md p-6 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-full" />
        </div>
    );
}

export function SkeletonTable() {
    return (
        <div className="bg-white rounded-xl shadow-md p-6 space-y-3">
            <Skeleton className="h-8 w-full mb-4" />
            {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4">
                    <Skeleton className="h-10 w-1/4" />
                    <Skeleton className="h-10 w-1/4" />
                    <Skeleton className="h-10 w-1/4" />
                    <Skeleton className="h-10 w-1/4" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonStat() {
    return (
        <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-4 w-32" />
                </div>
            </div>
        </div>
    );
}