import { Button } from '@/components/ui/button';
import { Plus, Upload, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';

export default function ShiftCommandCenter({ 
    onAddShift, 
    onExportAll, 
    isAstra,
    shiftBlocks,
    activeBlock,
    onBlockChange,
    blockRanges
}) {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-b pb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">Shift Management</h2>
                    <p className="text-slate-500 text-sm">Configure and schedule employee shift timings</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button 
                        onClick={onExportAll}
                        variant="outline"
                        size="sm"
                        className="bg-white border-slate-200 text-slate-700 font-medium h-9"
                    >
                        <Download className="w-4 h-4 mr-2 text-slate-400" />
                        Export Data
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-slate-200 text-slate-700 font-medium h-9"
                        onClick={() => {
                            const id = isAstra ? 'astra-shift-file' : 'shift-file-upload';
                            document.getElementById(id)?.click();
                        }}
                    >
                        <Upload className="w-4 h-4 mr-2 text-slate-400" />
                        {isAstra ? 'Upload Astra' : 'Bulk Upload'}
                    </Button>
                    <Button
                        onClick={onAddShift}
                        size="sm"
                        className="bg-slate-900 hover:bg-slate-800 text-white font-semibold h-9 px-4"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add New Shift
                    </Button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-4 bg-slate-50 p-1.5 rounded-xl border border-slate-200/60">
                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Target Block
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {shiftBlocks.map((blockId) => {
                        const isActive = activeBlock === blockId;
                        const range = blockRanges[blockId];
                        return (
                            <button
                                key={blockId}
                                onClick={() => onBlockChange(blockId)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-3 border",
                                    isActive 
                                        ? "bg-white text-indigo-600 border-indigo-200 shadow-sm ring-2 ring-indigo-50" 
                                        : "bg-transparent text-slate-600 border-transparent hover:bg-slate-200/50"
                                )}
                            >
                                <span>{blockId.toUpperCase().replace('BLOCK', 'Block ')}</span>
                                {range && (
                                    <span className={cn(
                                        "text-[10px] font-medium px-2 py-0.5 rounded-full",
                                        isActive ? "bg-indigo-50 text-indigo-600" : "bg-slate-200/60 text-slate-500"
                                    )}>
                                        {formatInUAE(parseDateInUAE(range.from), 'MMM dd')} - {formatInUAE(parseDateInUAE(range.to), 'MMM dd')}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

