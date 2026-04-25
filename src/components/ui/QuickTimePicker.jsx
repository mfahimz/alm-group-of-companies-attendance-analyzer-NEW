import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const AM_PRESETS = ['6:00 AM', '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '12:30 PM'];
const PM_PRESETS = ['1:00 PM', '1:30 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '5:30 PM', '6:00 PM', '7:00 PM', '8:00 PM'];

function parseTimeInput(raw) {
    if (!raw) return null;
    
    // Normalize input: remove non-alphanumeric except colon
    const clean = raw.toLowerCase().replace(/[^a-z0-9:]/g, '');
    
    let hour = 0;
    let minute = 0;
    let period = '';

    // Check for am/pm suffix
    if (clean.endsWith('am')) {
        period = 'AM';
    } else if (clean.endsWith('pm')) {
        period = 'PM';
    }

    // Remove am/pm for numeric parsing
    const numericPart = clean.replace(/[ap]m$/, '');

    if (numericPart.includes(':')) {
        const parts = numericPart.split(':');
        hour = parseInt(parts[0], 10);
        minute = parseInt(parts[1], 10) || 0;
    } else {
        // Handle strings of digits like "800", "1300", "8"
        if (numericPart.length <= 2) {
            hour = parseInt(numericPart, 10);
            minute = 0;
        } else if (numericPart.length === 3) {
            hour = parseInt(numericPart.substring(0, 1), 10);
            minute = parseInt(numericPart.substring(1), 10);
        } else if (numericPart.length >= 4) {
            // First two digits as hour, next two as minutes
            hour = parseInt(numericPart.substring(0, 2), 10);
            minute = parseInt(numericPart.substring(2, 4), 10);
        }
    }

    if (isNaN(hour) || isNaN(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    // Logic to determine AM/PM if not provided
    if (!period) {
        if (hour === 0) {
            hour = 12;
            period = 'AM';
        } else if (hour === 12) {
            period = 'PM';
        } else if (hour > 12) {
            hour = hour - 12;
            period = 'PM';
        } else {
            period = 'AM';
        }
    } else {
        // Adjust hour for 12-hour clock if suffix was provided
        if (period === 'PM' && hour < 12) {
            // hour = hour; // Keep as is for display, but 5pm is 5:00 PM
        } else if (period === 'AM' && hour === 12) {
            hour = 12; // 12am is 12:00 AM
        } else if (hour > 12) {
            // If user types 17:00 PM, normalize to 5:00 PM
            hour = hour - 12;
        }
    }

    // Final normalization to H:MM AM/PM
    return `${hour}:${minute.toString().padStart(2, '0')} ${period}`;
}

export default function QuickTimePicker({ value, onChange, placeholder = "Select time", disabled = false, className = "" }) {
    const [open, setOpen] = useState(false);
    const [textInput, setTextInput] = useState('');

    const handlePreset = (time) => {
        onChange(time);
        setOpen(false);
    };

    const handleTextCommit = () => {
        if (!textInput.trim()) return;
        const parsed = parseTimeInput(textInput.trim());
        if (parsed) {
            onChange(parsed);
            setTextInput('');
            setOpen(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleTextCommit();
        }
    };

    const displayValue = value || placeholder;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "w-full justify-start text-left font-normal border-slate-200",
                        !value && "text-slate-500",
                        className
                    )}
                    disabled={disabled}
                >
                    <Clock className="mr-2 h-4 w-4" />
                    {displayValue}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
                <div className="space-y-4">
                    {/* Smart Text Input */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-1">Quick Type</Label>
                        <Input
                            placeholder="Type: 800, 8am, 1pm, 13:00"
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleTextCommit}
                            className="h-9 border-slate-200 focus:ring-indigo-100"
                            autoFocus
                        />
                    </div>

                    {/* AM Presets */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-1">Morning / Midday</Label>
                        <div className="flex flex-wrap gap-1">
                            {AM_PRESETS.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => handlePreset(preset)}
                                    className={cn(
                                        "text-xs px-2 py-1 rounded-md transition-all",
                                        value === preset
                                            ? "bg-indigo-600 text-white font-medium"
                                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    )}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* PM Presets */}
                    <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-1">Afternoon / Evening</Label>
                        <div className="flex flex-wrap gap-1">
                            {PM_PRESETS.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => handlePreset(preset)}
                                    className={cn(
                                        "text-xs px-2 py-1 rounded-md transition-all",
                                        value === preset
                                            ? "bg-indigo-600 text-white font-medium"
                                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    )}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

// Internal Label component to avoid extra imports if possible, or use standard Label
function Label({ children, className }) {
    return <div className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}>{children}</div>;
}
