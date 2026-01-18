import React, { useState, useEffect } from 'react';
import { Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function PINLock({ onUnlock, storageKey = 'salary_pin_unlocked' }) {
    const [pin, setPin] = useState('');
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [systemPin, setSystemPin] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load system PIN from settings - only on mount, non-blocking
    useEffect(() => {
        let isMounted = true;
        
        const loadPin = async () => {
            try {
                const settings = await base44.entities.SystemSettings.filter({
                    setting_key: 'SALARY_PAGE_PIN'
                });
                
                if (isMounted) {
                    if (settings.length > 0) {
                        setSystemPin(settings[0].setting_value);
                    }
                    setLoading(false);
                }
            } catch (error) {
                console.error('Failed to load PIN settings:', error);
                if (isMounted) setLoading(false);
            }
        };

        loadPin();
        
        return () => {
            isMounted = false;
        };
    }, []);

    // Check if already unlocked in session
    useEffect(() => {
        const unlocked = sessionStorage.getItem(storageKey) === 'true';
        if (unlocked) {
            setIsUnlocked(true);
            onUnlock?.(true);
        }
    }, [onUnlock, storageKey]);

    // If no PIN set or already unlocked, don't show lock
    if (loading) return null;
    if (!systemPin || isUnlocked) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (pin === systemPin) {
            setIsUnlocked(true);
            sessionStorage.setItem(storageKey, 'true');
            setPin('');
            setAttempts(0);
            onUnlock?.(true);
            toast.success('Salary section unlocked');
        } else {
            const newAttempts = attempts + 1;
            setAttempts(newAttempts);
            setPin('');
            
            if (newAttempts >= 3) {
                toast.error('Too many failed attempts. Please try again later.');
            } else {
                toast.error(`Incorrect PIN. ${3 - newAttempts} attempt(s) remaining.`);
            }
        }
    };

    if (attempts >= 3) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <Card className="max-w-sm">
                    <CardContent className="p-6 text-center">
                        <Lock className="w-12 h-12 text-red-600 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
                        <p className="text-slate-600 mb-6">Too many failed PIN attempts. Please try again later.</p>
                        <Button 
                            onClick={() => window.location.reload()}
                            variant="outline"
                        >
                            Reload Page
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="max-w-sm">
                <CardContent className="p-6">
                    <div className="text-center mb-6">
                        <Lock className="w-12 h-12 text-indigo-600 mx-auto mb-3" />
                        <h2 className="text-2xl font-bold text-slate-900">Salary Access</h2>
                        <p className="text-slate-600 text-sm mt-1">Enter PIN to access salary information</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder="Enter PIN"
                                maxLength="6"
                                autoFocus
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600"
                            />
                        </div>

                        <Button 
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-700"
                            disabled={pin.length === 0}
                        >
                            Unlock
                        </Button>

                        <div className="text-center text-sm text-slate-500">
                            {3 - attempts} attempt(s) remaining
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}