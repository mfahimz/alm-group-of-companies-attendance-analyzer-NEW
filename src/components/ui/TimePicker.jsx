import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function TimePicker({ value, onChange, placeholder = "Select time", disabled = false, className = "" }) {
    const [open, setOpen] = useState(false);
    const [selectedHour, setSelectedHour] = useState(8);
    const [selectedMinute, setSelectedMinute] = useState(0);
    const [selectedPeriod, setSelectedPeriod] = useState('AM');

    // Parse value if provided
    React.useEffect(() => {
        if (value) {
            const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (match) {
                setSelectedHour(parseInt(match[1]));
                setSelectedMinute(parseInt(match[2]));
                setSelectedPeriod(match[3].toUpperCase());
            }
        }
    }, [value]);

    const hours = Array.from({ length: 12 }, (_, i) => i + 1);
    const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

    const handleSelect = () => {
        const timeString = `${selectedHour}:${selectedMinute.toString().padStart(2, '0')} ${selectedPeriod}`;
        onChange(timeString);
        setOpen(false);
    };

    const displayValue = value || placeholder;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !value && "text-slate-500",
                        className
                    )}
                    disabled={disabled}
                >
                    <Clock className="mr-2 h-4 w-4" />
                    {displayValue}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <div className="p-4 space-y-4">
                    <div className="text-center text-lg font-semibold">
                        {selectedHour}:{selectedMinute.toString().padStart(2, '0')} {selectedPeriod}
                    </div>
                    
                    {/* Hour Selection */}
                    <div>
                        <div className="text-xs font-medium text-slate-500 mb-2">Hour</div>
                        <div className="grid grid-cols-6 gap-1">
                            {hours.map((hour) => (
                                <button
                                    key={hour}
                                    type="button"
                                    onClick={() => setSelectedHour(hour)}
                                    className={cn(
                                        "p-2 text-sm rounded-md hover:bg-slate-100 transition-colors",
                                        selectedHour === hour && "bg-indigo-600 text-white hover:bg-indigo-700"
                                    )}
                                >
                                    {hour}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Minute Selection */}
                    <div>
                        <div className="text-xs font-medium text-slate-500 mb-2">Minute</div>
                        <div className="grid grid-cols-6 gap-1">
                            {minutes.map((minute) => (
                                <button
                                    key={minute}
                                    type="button"
                                    onClick={() => setSelectedMinute(minute)}
                                    className={cn(
                                        "p-2 text-sm rounded-md hover:bg-slate-100 transition-colors",
                                        selectedMinute === minute && "bg-indigo-600 text-white hover:bg-indigo-700"
                                    )}
                                >
                                    {minute.toString().padStart(2, '0')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* AM/PM Toggle */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedPeriod('AM')}
                            className={cn(
                                "flex-1 p-2 rounded-md font-medium transition-colors",
                                selectedPeriod === 'AM' 
                                    ? "bg-indigo-600 text-white" 
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            )}
                        >
                            AM
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedPeriod('PM')}
                            className={cn(
                                "flex-1 p-2 rounded-md font-medium transition-colors",
                                selectedPeriod === 'PM' 
                                    ? "bg-indigo-600 text-white" 
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            )}
                        >
                            PM
                        </button>
                    </div>

                    {/* Confirm Button */}
                    <Button 
                        onClick={handleSelect}
                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                    >
                        Confirm
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}