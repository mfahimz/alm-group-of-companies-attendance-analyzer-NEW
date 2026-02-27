import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Check, X, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function InlineEditableCell({ 
    value, 
    onSave, 
    isEditable = true,
    className = '',
    alwaysInput = false,
    alwaysInputWithSave = false,
    autoSaveOnBlur = false,
    min = undefined
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(value || 0);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setEditValue(value || 0);
    }, [value]);

    const handleSave = async () => {
        if (Number(editValue) === Number(value)) {
            setIsEditing(false);
            return;
        }

        setIsSaving(true);
        try {
            await onSave(Number(editValue));
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to save:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setEditValue(value || 0);
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    if (!isEditable) {
        return <span className={className}>{value || 0}</span>;
    }


    if (alwaysInputWithSave) {
        return (
            <div className="flex items-center gap-1">
                <Input
                    type="number"
                    min={min}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`h-8 w-24 text-sm ${className}`}
                    disabled={isSaving}
                />
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 border border-slate-200"
                    onClick={handleSave}
                    disabled={isSaving}
                    title="Save"
                >
                    <Check className="w-3 h-3 text-green-600" />
                </Button>
            </div>
        );
    }

    if (alwaysInput) {
        return (
            <Input
                type="number"
                min={min}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                    if (autoSaveOnBlur) {
                        handleSave();
                    }
                }}
                className={`h-8 w-24 text-sm ${className}`}
                disabled={isSaving}
            />
        );
    }

    if (isEditing) {
        return (
            <div className="flex items-center gap-1">
                <Input
                    type="number"
                    min={min}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-7 w-20 text-sm"
                    autoFocus
                    disabled={isSaving}
                    onBlur={() => {
                        if (autoSaveOnBlur) {
                            handleSave();
                        }
                    }}
                />
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    <Check className="w-3 h-3 text-green-600" />
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={handleCancel}
                    disabled={isSaving}
                >
                    <X className="w-3 h-3 text-red-600" />
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 group">
            <span className={className}>{value || 0}</span>
            <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsEditing(true)}
            >
                <Edit2 className="w-3 h-3 text-blue-600" />
            </Button>
        </div>
    );
}
