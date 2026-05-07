import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar, Edit, Trash2, Copy, Save, X, Loader2 } from 'lucide-react';
import { formatInUAE, parseDateInUAE } from '@/components/ui/timezone';

export default function BlockSettings({ 
    blockId, 
    blockRange, 
    onRangeChange, 
    isEditing, 
    onEdit, 
    onCancel, 
    onSave, 
    onCopy, 
    onDeleteAll,
    isSaving,
    updateProgress,
    minDate,
    maxDate
}) {
    return (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm mb-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">{blockId.replace('block', 'Block ')} Schedule</h3>
                    {isEditing ? (
                        <div className="flex flex-col gap-1.5 mt-2">
                            <div className="flex items-center gap-2">
                                <Input
                                    type="date"
                                    value={blockRange.from || ''}
                                    onChange={(e) => onRangeChange('from', e.target.value)}
                                    min={minDate}
                                    max={maxDate}
                                    disabled={isSaving}
                                    className="h-9 w-36 rounded-lg text-sm"
                                />
                                <span className="text-slate-400 text-xs font-bold">TO</span>
                                <Input
                                    type="date"
                                    value={blockRange.to || ''}
                                    onChange={(e) => onRangeChange('to', e.target.value)}
                                    min={blockRange.from || minDate}
                                    max={maxDate}
                                    disabled={isSaving}
                                    className="h-9 w-36 rounded-lg text-sm"
                                />
                                <Button 
                                    size="sm" 
                                    onClick={onSave} 
                                    disabled={isSaving} 
                                    className="h-9 bg-indigo-600 min-w-[80px]"
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    ) : (
                                        <Save className="w-4 h-4 mr-1" />
                                    )}
                                    {isSaving ? "Saving..." : "Save"}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={onCancel} disabled={isSaving} className="h-9">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                            
                            {isSaving && updateProgress && (
                                <div className="flex items-center gap-2 px-1 py-0.5">
                                    <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-tight">
                                        {updateProgress.status || `Updating ${updateProgress.current} of ${updateProgress.total} shifts...`}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Active from <span className="text-slate-900 font-bold">{formatInUAE(parseDateInUAE(blockRange.from), 'dd/MM/yyyy')}</span> to <span className="text-slate-900 font-bold">{formatInUAE(parseDateInUAE(blockRange.to), 'dd/MM/yyyy')}</span>
                        </p>
                    )}
                </div>
            </div>

            {!isEditing && (
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onEdit}
                        className="h-9 text-indigo-600 hover:bg-indigo-50 font-semibold px-3"
                    >
                        <Edit className="w-3.5 h-3.5 mr-2" />
                        Adjust Range
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onCopy}
                        className="h-9 text-slate-600 hover:bg-slate-100 font-semibold px-3"
                    >
                        <Copy className="w-3.5 h-3.5 mr-2" />
                        Copy Block
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onDeleteAll}
                        className="h-9 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold px-3"
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        Purge Block
                    </Button>
                </div>
            )}
        </div>
    );
}
