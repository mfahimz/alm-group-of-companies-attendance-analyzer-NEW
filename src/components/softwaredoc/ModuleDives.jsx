import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, Target, Calendar, UserCheck, ShieldAlert } from 'lucide-react';

/**
 * ModuleDives - Documentation for Projects, Attendance, and HR Management logic.
 */
export default function ModuleDives() {
    return (
        <div className="space-y-8">
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <Target className="w-5 h-5 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Projects & Employee Scope</h2>
                </div>
                <Card className="border-slate-200">
                    <CardContent className="p-6">
                        <h3 className="text-sm font-semibold text-slate-900 mb-2 uppercase">Core Logic</h3>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Projects utilize a hybrid employee selection strategy. By default, they pull active employees 
                            from a specific company. However, they support <code>custom_employee_ids</code> overrides 
                            (HRMS IDs) which take precedence during attendance analysis.
                        </p>
                    </CardContent>
                </Card>
            </section>

            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                        <Calendar className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Attendance Analysis Engine</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-slate-200">
                        <CardContent className="p-6">
                            <h3 className="text-sm font-semibold text-slate-900 mb-2">Multi-Phase Matching</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Uses <code>runAnalysis.ts</code> to match punches within 60, 120, 180, 240, and 
                                300-minute windows. This ensures extremely late or early punches are still correctly 
                                attributed to shift points.
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200">
                        <CardContent className="p-6">
                            <h3 className="text-sm font-semibold text-slate-900 mb-2">Partial Day Detection</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Automatically flags a "Half Absence" if actual worked minutes are less than 50% of 
                                the expected shift block duration. Ignores the gap in split shifts (Ramadan).
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-purple-100 rounded-lg">
                        <UserCheck className="w-5 h-5 text-purple-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">HR Management (ATS)</h2>
                </div>
                <Card className="border-purple-200 bg-purple-50">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <ShieldAlert className="w-6 h-6 text-purple-600 mt-1" />
                            <div>
                                <h3 className="text-md font-bold text-purple-900">AI Resume Scanner</h3>
                                <p className="text-sm text-purple-800 mt-1 leading-relaxed">
                                    Uses <code>scanResume.ts</code> with LLM extraction and deterministic code comparisons. 
                                    Implements <strong>mandatory knockout rules</strong> for experience and education. 
                                    Automatically rejects candidates if specific business triggers are met.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
