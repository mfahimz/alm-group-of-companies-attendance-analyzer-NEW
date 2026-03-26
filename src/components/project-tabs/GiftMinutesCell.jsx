import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';

/**
 * GiftMinutesCellWidget
 * Shows an always-visible input for Gift Minutes (deduction offsets).
 * When the value changes, a small "Save" button appears.
 * On save, it recalculates and persists deductible_minutes =
 *   max(0, lateMinutes + earlyMinutes - graceMinutes) - giftMinutes
 */
export default function GiftMinutesCellWidget({ result, onSave, isEditable }) {
    const storedGift = Math.max(0, result.ramadan_gift_minutes || 0); // Keep field name as ramadan_gift_minutes for DB compatibility
    const [inputVal, setInputVal] = useState(storedGift);
    const [isSaving, setIsSaving] = useState(false);
    const isDirty = Number(inputVal) !== storedGift;

    // Sync when external value changes (e.g., after refetch)
    useEffect(() => {
        setInputVal(storedGift);
    }, [storedGift]);

    const handleSave = async () => {
        if (!isDirty) return;
        setIsSaving(true);
        try {
            await onSave(result, Number(inputVal));
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') setInputVal(storedGift);
    };

    if (!isEditable) {
        return <span className="font-medium text-slate-700">{storedGift}</span>;
    }

    return (
        <div className="flex items-center gap-1">
            <Input
                type="number"
                min={0}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`h-8 w-20 text-sm font-medium text-slate-700 ${isDirty ? 'border-indigo-400 ring-1 ring-indigo-300' : ''}`}
                disabled={isSaving}
            />
            {isDirty && (
                <Button
                    size="sm"
                    className="h-7 px-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                    onClick={handleSave}
                    disabled={isSaving}
                    title="Save & recalculate deductible"
                >
                    {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-0.5" />Save</>}
                </Button>
            )}
        </div>
    );
}
