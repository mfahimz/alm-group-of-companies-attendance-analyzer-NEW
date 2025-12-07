import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function EditDateRangeDialog({ open, onClose, onConfirm, currentRange }) {
    const [dateRange, setDateRange] = useState({
        from: currentRange?.from || '',
        to: currentRange?.to || ''
    });

    useEffect(() => {
        if (currentRange) {
            setDateRange({
                from: currentRange.from,
                to: currentRange.to
            });
        }
    }, [currentRange]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!dateRange.from || !dateRange.to) {
            toast.error('Please select both dates');
            return;
        }

        const from = new Date(dateRange.from);
        const to = new Date(dateRange.to);
        
        if (to < from) {
            toast.error('End date must be after start date');
            return;
        }

        onConfirm(dateRange);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Date Range</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="from">Effective From *</Label>
                        <Input
                            id="from"
                            type="date"
                            value={dateRange.from}
                            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="to">Effective To *</Label>
                        <Input
                            id="to"
                            type="date"
                            value={dateRange.to}
                            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                            Update Date Range
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}