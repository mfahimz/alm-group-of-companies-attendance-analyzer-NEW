import React from 'react';
import { Monitor } from 'lucide-react';

export default function DesktopOnlyScreen() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
            <div className="max-w-lg w-full">
                <div className="bg-white rounded-2xl shadow-2xl p-12 text-center">
                    <div className="p-4 bg-indigo-50 rounded-xl inline-block mb-6">
                        <Monitor className="w-16 h-16 text-indigo-600" />
                    </div>

                    <h1 className="text-3xl font-bold text-slate-900 mb-4">
                        Access Blocked
                    </h1>
                    
                    <p className="text-lg text-slate-600">
                        Please use a desktop computer to access this system.
                    </p>
                </div>
            </div>
        </div>
    );
}