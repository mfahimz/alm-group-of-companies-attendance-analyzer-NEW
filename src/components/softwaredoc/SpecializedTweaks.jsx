import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Zap, Moon, RotateCcw, GitMerge } from 'lucide-react';

/**
 * SpecializedTweaks - Documents technical edge cases and operational "hacks".
 */
export default function SpecializedTweaks() {
    return (
        <div className="space-y-8">
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-amber-100 rounded-lg">
                        <Zap className="w-5 h-5 text-amber-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Specialized Operational Logic</h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <Card className="border-slate-200">
                        <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                                <Moon className="w-6 h-6 text-amber-600 mt-1" />
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900">Ramadan Midnight Crossover</h3>
                                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                                        Enabled in <code>applyRamadanShifts.ts</code>. Shifts during Ramadan often 
                                        cross midnight. The system uses a <strong>120-minute buffer</strong> 
                                        (<code>MIDNIGHT_BUFFER_MINUTES</code>) to attribute early-morning punches 
                                        to the prior day's shift block.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                        <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                                <RotateCcw className="w-6 h-6 text-indigo-600 mt-1" />
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900">Report-to-Checklist Sync</h3>
                                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                                        When an attendance report is finalized, the system automatically triggers 
                                        <code>createReportChecklistTasks.ts</code>. This extracts LOP days, 
                                        Late minutes, and Rejoining dates into the Project Checklist for HR audit.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                        <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                                <GitMerge className="w-6 h-6 text-emerald-600 mt-1" />
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900">Missing-Record Merge Logic</h3>
                                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                                        The "Sync" mode in <code>applyRamadanShifts</code> performs a delta merge. 
                                        It only fills in <code>ShiftTiming</code> records for dates where no data 
                                        exists, preserving manual overrides and avoiding "bulk-wipe" accidental 
                                        data loss.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </section>
        </div>
    );
}
