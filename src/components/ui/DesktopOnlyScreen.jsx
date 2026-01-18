import React from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';

export default function DesktopOnlyScreen() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
            <div className="max-w-2xl w-full">
                <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
                    {/* Icon Row */}
                    <div className="flex justify-center items-center gap-8 mb-8">
                        <div className="p-4 bg-red-50 rounded-xl">
                            <Smartphone className="w-12 h-12 text-red-500" />
                        </div>
                        <div className="p-4 bg-red-50 rounded-xl">
                            <Tablet className="w-12 h-12 text-red-500" />
                        </div>
                        <div className="text-4xl text-slate-300">→</div>
                        <div className="p-4 bg-green-50 rounded-xl">
                            <Monitor className="w-12 h-12 text-green-600" />
                        </div>
                    </div>

                    {/* Main Message */}
                    <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                        Desktop Access Only
                    </h1>
                    <p className="text-lg text-slate-600 mb-6">
                        This attendance system is designed for desktop use only.
                    </p>

                    {/* Explanation */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mb-8 text-left">
                        <h2 className="font-semibold text-slate-900 mb-3">Why Desktop Only?</h2>
                        <ul className="text-sm text-slate-700 space-y-2">
                            <li>• Complex data tables and reports require larger screens</li>
                            <li>• Precise attendance calculations need desktop tools</li>
                            <li>• Excel exports and file uploads work best on desktop</li>
                            <li>• Multiple tabs and workflows are optimized for desktop</li>
                        </ul>
                    </div>

                    {/* Instructions */}
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 mb-8">
                        <h3 className="font-semibold text-indigo-900 mb-2">To Access This System:</h3>
                        <p className="text-sm text-indigo-800">
                            Please switch to a laptop or desktop computer with a screen width of at least 1024 pixels.
                        </p>
                    </div>

                    {/* Device Info */}
                    <div className="text-xs text-slate-400 space-y-1">
                        <p>Current Screen Width: {window.innerWidth}px</p>
                        <p>Required: ≥ 1024px on desktop browser</p>
                    </div>
                </div>
            </div>
        </div>
    );
}