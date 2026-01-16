import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Wrench, Clock, Sparkles } from 'lucide-react';

export default function MaintenancePage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full border-0 shadow-2xl">
                <CardContent className="p-12 text-center">
                    {/* Logo/Brand */}
                    <div className="mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-100 mb-4">
                            <Wrench className="w-10 h-10 text-indigo-600" />
                        </div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                            ALM Attendance
                        </h1>
                        <p className="text-slate-600 text-lg">
                            ALM Group of Companies
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                            Attendance Analyzer System
                        </p>
                    </div>

                    {/* Maintenance Message */}
                    <div className="space-y-4 mb-8">
                        <div className="flex items-center justify-center gap-2 text-amber-600">
                            <Clock className="w-5 h-5 animate-pulse" />
                            <span className="font-semibold">System Under Maintenance</span>
                        </div>
                        
                        <p className="text-slate-700 text-lg">
                            We're currently upgrading our system to bring you exciting new features and improvements.
                        </p>
                        
                        <div className="bg-indigo-50 rounded-lg p-6 mt-6">
                            <div className="flex items-center justify-center gap-2 text-indigo-700 mb-2">
                                <Sparkles className="w-5 h-5" />
                                <span className="font-semibold">Coming Soon</span>
                            </div>
                            <p className="text-sm text-slate-600">
                                Enhanced performance, new analytics, and improved user experience
                            </p>
                        </div>
                    </div>

                    {/* Company Logos */}
                    <div className="border-t pt-8">
                        <p className="text-xs text-slate-500 mb-4">Serving</p>
                        <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
                            <div className="bg-slate-50 rounded-lg p-3">
                                <p className="font-medium">Al Maraghi Auto Repairs</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <p className="font-medium">Al Maraghi Automotive</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <p className="font-medium">Naser Mohsin Auto Parts</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <p className="font-medium">Astra Auto Parts</p>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-slate-400 mt-8">
                        Thank you for your patience. We'll be back soon!
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}