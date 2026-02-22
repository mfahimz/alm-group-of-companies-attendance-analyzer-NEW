import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export default function NumericLock({ isLocked, onUnlock }) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const correctPin = '1234'; // Default PIN - can be changed via settings

    const handleNumClick = (num) => {
        if (pin.length < 4) {
            setPin(prev => prev + num);
            setError('');
        }
    };

    const handleBackspace = () => {
        setPin(prev => prev.slice(0, -1));
        setError('');
    };

    const handleSubmit = () => {
        if (pin === correctPin) {
            onUnlock();
            setPin('');
        } else {
            setError('Incorrect PIN');
            setPin('');
        }
    };

    const handleClear = () => {
        setPin('');
        setError('');
    };

    if (!isLocked) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-2xl p-8 max-w-sm w-full mx-4">
                <div className="flex items-center justify-center mb-6">
                    <Lock className="w-8 h-8 text-indigo-600 mr-2" />
                    <h2 className="text-2xl font-bold text-slate-900">Enter PIN</h2>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 mb-6">
                    <div className="flex justify-center gap-3">
                        {[0, 1, 2, 3].map(i => (
                            <div 
                                key={i}
                                className="w-12 h-12 rounded-lg bg-white border-2 border-slate-300 flex items-center justify-center"
                            >
                                {pin.length > i && (
                                    <div className="w-4 h-4 rounded-full bg-indigo-600" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="text-red-600 text-sm font-medium text-center mb-4">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-3 gap-2 mb-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <Button
                            key={num}
                            onClick={() => handleNumClick(num)}
                            variant="outline"
                            className="h-12 text-lg font-semibold"
                        >
                            {num}
                        </Button>
                    ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <Button
                        onClick={handleClear}
                        variant="outline"
                        className="h-12"
                    >
                        Clear
                    </Button>
                    <Button
                        onClick={() => handleNumClick(0)}
                        variant="outline"
                        className="h-12 text-lg font-semibold"
                    >
                        0
                    </Button>
                    <Button
                        onClick={handleBackspace}
                        variant="outline"
                        className="h-12"
                    >
                        ← Back
                    </Button>
                </div>

                <Button
                    onClick={handleSubmit}
                    disabled={pin.length !== 4}
                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 h-12 font-semibold"
                >
                    Unlock
                </Button>

                <p className="text-xs text-slate-500 text-center mt-4">
                    Default PIN: 1234
                </p>
            </div>
        </div>
    );
}