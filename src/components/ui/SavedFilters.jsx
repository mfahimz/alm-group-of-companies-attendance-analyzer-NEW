import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Filter, Save, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';

export default function SavedFilters({ filters, onApplyFilter, storageKey = 'saved_filters' }) {
    const [savedFilters, setSavedFilters] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        return saved ? JSON.parse(saved) : [];
    });
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [filterName, setFilterName] = useState('');

    const saveFilter = () => {
        if (!filterName.trim()) {
            toast.error('Please enter a filter name');
            return;
        }

        const newFilter = {
            id: Date.now(),
            name: filterName,
            filters: filters
        };

        const updated = [...savedFilters, newFilter];
        setSavedFilters(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        
        setShowSaveDialog(false);
        setFilterName('');
        toast.success('Filter saved');
    };

    const deleteFilter = (id) => {
        const updated = savedFilters.filter(f => f.id !== id);
        setSavedFilters(updated);
        localStorage.setItem(storageKey, JSON.stringify(updated));
        toast.success('Filter deleted');
    };

    return (
        <>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Star className="w-4 h-4" />
                        Saved Filters
                        {savedFilters.length > 0 && (
                            <span className="ml-1 bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded">
                                {savedFilters.length}
                            </span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="start">
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-sm">Saved Filters</h4>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowSaveDialog(true)}
                                className="h-7 text-xs gap-1"
                            >
                                <Save className="w-3 h-3" />
                                Save Current
                            </Button>
                        </div>
                        
                        {savedFilters.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4">No saved filters</p>
                        ) : (
                            <div className="space-y-2">
                                {savedFilters.map((filter) => (
                                    <div
                                        key={filter.id}
                                        className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        <button
                                            onClick={() => onApplyFilter(filter.filters)}
                                            className="flex-1 text-left"
                                        >
                                            <p className="text-sm font-medium text-slate-900">{filter.name}</p>
                                        </button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => deleteFilter(filter.id)}
                                            className="h-7 w-7 text-red-600 hover:text-red-700"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </PopoverContent>
            </Popover>

            <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save Filter</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <Input
                            placeholder="Enter filter name..."
                            value={filterName}
                            onChange={(e) => setFilterName(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
                                Cancel
                            </Button>
                            <Button onClick={saveFilter}>
                                Save Filter
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}