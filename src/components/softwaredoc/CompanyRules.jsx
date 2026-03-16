import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, Info, DollarSign, Clock, LayoutGrid } from 'lucide-react';

/**
 * CompanyRules - Focuses on Al Maraghi Motors' specific business logic.
 */
export default function CompanyRules() {
    return (
        <div className="space-y-8">
            <section>
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-slate-100 rounded-lg">
                        <ShieldCheck className="w-5 h-5 text-slate-700" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Al Maraghi Motors Logic</h2>
                </div>
                
                <div className="grid grid-cols-1 gap-6">
                    <Card className="border-l-4 border-l-blue-600 shadow-sm transition-hover hover:shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-md flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-blue-600" />
                                WPS Payroll Split (30/70 Rule)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Implemented in <code>SalaryReportDetail.jsx</code> and <code>CRITICAL_FINALIZATION_RULES.jsx</code>. 
                                For Al Maraghi Motors, the salary is split: <strong>30% Fixed (WPS)</strong> and <strong>70% Variable</strong>. 
                                Cash components are never included in the WPS percentage.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-orange-500 shadow-sm transition-hover hover:shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-md flex items-center gap-2">
                                <LayoutGrid className="w-4 h-4 text-orange-500" />
                                Operations OT vs Incentive
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                For employees in the <strong>Operations</strong> department, the system selects either 
                                <code>OT Minutes</code> or <code>Incentive Amount</code>, whichever provides the 
                                highest value to the employee, unless explicitly overridden.
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-emerald-500 shadow-sm transition-hover hover:shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-md flex items-center gap-2">
                                <Clock className="w-4 h-4 text-emerald-500" />
                                H1/H2 Grace Minutes
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Al Maraghi Motors grants <strong>120 minutes of grace</strong> per calendar half-year 
                                (H1: Jan-Jun, H2: Jul-Dec). Unused minutes do not carry over between half-years. 
                                Managed via <code>HalfYearlyMinutesManagement.jsx</code>.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <div className="bg-amber-50 p-4 rounded-lg flex items-start gap-3 border border-amber-100">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Note:</strong> These rules are scoped strictly to "Al Maraghi Motors", "Al Maraghi Auto Repairs", 
                    and "Al Maraghi Automotive". Other companies follow standard labor law calculations without 
                    these specialized overrides.
                </p>
            </div>
        </div>
    );
}
