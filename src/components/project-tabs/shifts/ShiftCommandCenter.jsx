import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Upload, Download, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';

export default function ShiftCommandCenter({ 
    totalShifts, 
    onAddShift, 
    onExportAll, 
    isAstra,
    shiftBlocks,
    activeBlock,
    onBlockChange,
    blockRanges
}) {
    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Shift Command Center</h2>
                    <p className="text-slate-500 text-sm mt-1">Manage employee shift timings and attendance schedules</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button 
                        onClick={onExportAll}
                        variant="outline"
                        size="sm"
                        className="bg-white border-slate-200 shadow-sm hover:bg-slate-50 text-slate-700 font-medium"
                    >
                        <Download className="w-4 h-4 mr-2 text-slate-400" />
                        Export All
                    </Button>
                    <Button
                        onClick={onAddShift}
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all font-semibold"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Shift
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2 border-0 shadow-sm bg-gradient-to-br from-indigo-600 to-indigo-700 text-white overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Sparkles className="w-24 h-24 rotate-12" />
                    </div>
                    <CardContent className="p-6 relative">
                        <div className="flex flex-col md:flex-row md:items-center gap-6">
                            <div className="space-y-1 border-r border-white/10 pr-6">
                                <p className="text-indigo-100 text-xs font-semibold uppercase tracking-wider">Total Active Shifts</p>
                                <p className="text-4xl font-black">{totalShifts}</p>
                            </div>
                            <div className="flex-1">
                                <p className="text-indigo-100 text-sm font-medium mb-3">Active Scheduling Blocks</p>
                                <div className="flex flex-wrap gap-2">
                                    {shiftBlocks.map((blockId) => {
                                        const isActive = activeBlock === blockId;
                                        const range = blockRanges[blockId];
                                        return (
                                            <button
                                                key={blockId}
                                                onClick={() => onBlockChange(blockId)}
                                                className={cn(
                                                    "px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 flex flex-col items-start border",
                                                    isActive 
                                                        ? "bg-white text-indigo-700 border-white shadow-lg scale-105" 
                                                        : "bg-white/10 text-white border-white/10 hover:bg-white/20"
                                                )}
                                            >
                                                <span>{blockId.toUpperCase().replace('BLOCK', 'Block ')}</span>
                                                {range && (
                                                    <span className={cn(
                                                        "text-[10px] font-medium opacity-70",
                                                        isActive ? "text-indigo-500" : "text-white/60"
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
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white border-slate-200">
                    <CardContent className="p-6 flex flex-col justify-center h-full">
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">Bulk Operations</p>
                        <div className="grid grid-cols-1 gap-2">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="justify-start border-slate-100 hover:bg-slate-50 text-slate-700 h-10 px-4"
                                onClick={() => {
                                    const id = isAstra ? 'astra-shift-file' : 'shift-file-upload';
                                    document.getElementById(id)?.click();
                                }}
                            >
                                <Upload className={cn("w-4 h-4 mr-3", isAstra ? "text-purple-500" : "text-indigo-500")} />
                                <span className="font-medium">{isAstra ? 'Upload Astra File' : 'Upload via CSV/Excel'}</span>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
