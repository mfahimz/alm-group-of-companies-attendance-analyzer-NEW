import React from 'react';
import { TableHead } from '@/components/ui/table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function SortableTableHead({ children, label, sortKey, currentSort, onSort, className = '' }) {
    const displayLabel = label || children;
    const handleClick = () => {
        if (!sortKey || !onSort) return;
        onSort(sortKey);
    };

    const isActive = currentSort?.key === sortKey;
    const direction = currentSort?.direction;

    if (!sortKey || !onSort) {
        return <TableHead className={`bg-slate-50 sticky top-0 z-20 ${className}`}>{displayLabel}</TableHead>;
    }

    return (
        <TableHead className={`bg-slate-50 sticky top-0 z-20 ${className}`}>
            <button
                onClick={handleClick}
                className="flex items-center gap-2 hover:text-slate-900 transition-colors font-medium w-full"
            >
                {displayLabel}
                {isActive ? (
                    direction === 'asc' ? (
                        <ArrowUp className="w-4 h-4" />
                    ) : (
                        <ArrowDown className="w-4 h-4" />
                    )
                ) : (
                    <ArrowUpDown className="w-4 h-4 text-slate-400" />
                )}
            </button>
        </TableHead>
    );
}