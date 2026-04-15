import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Calculator, Landmark, ReceiptText, Wallet, Loader2 } from 'lucide-react';

/**
 * SummaryTab.jsx
 * Mirrors the Main Sheet from the monthly Excel payroll file
 * Top section: auto-calculated from salaryData (read only)
 * Bottom section: editable manual fields saved to SalaryReport.summary_manual_fields
 * No entity fetches inside this component — uses props only
 */
export default function SummaryTab({ salaryData = [], report = {}, project = {}, onSaveManualFields }) {
    // 3. Manual fields state
    const [manualFields, setManualFields] = useState(() => {
        try {
            // Initialize from report entity data if exists
            const saved = report.summary_manual_fields ? JSON.parse(report.summary_manual_fields) : {};
            return {
                wpsServiceChargesBranch: 0,
                wpsServiceChargesBodyshop: 0,
                professionalChargesLastMonth: 0,
                professionalChargesNmAstraLabel: 'Professional Charges from NM & Astra',
                professionalChargesNmAstra: 0,
                professionalChargesAlmDxbLabel: 'Professional Charges from ALM DXB & Other',
                professionalChargesAlmDxb: 0,
                nmReceivablesAkhil: 0,
                ...saved
            };
        } catch (e) {
            // Default fallbacks if parse fails
            return {
                wpsServiceChargesBranch: 0,
                wpsServiceChargesBodyshop: 0,
                professionalChargesLastMonth: 0,
                professionalChargesNmAstraLabel: 'Professional Charges from NM & Astra',
                professionalChargesNmAstra: 0,
                professionalChargesAlmDxbLabel: 'Professional Charges from ALM DXB & Other',
                professionalChargesAlmDxb: 0,
                nmReceivablesAkhil: 0
            };
        }
    });

    const [isSaving, setIsSaving] = useState(false);

    // 2. Auto-calculated values gathered from the pre-calculated salaryData rows
    const calculations = useMemo(() => {
        const stats = salaryData.reduce((acc, row) => {
            const wps = Number(row.wpsPay || 0);
            const bal = Number(row.balance || 0);
            
            // Stats across ALL employees
            acc.totalSalaryAndAllowances += Number(row.total_salary || 0);
            acc.totalSalariesPayable += Number(row.total || 0);
            acc.totalWpsPayable += wps;

            // Department split for bank transfer tracking
            if (row.department === 'Bodyshop') {
                acc.bodyshopWpsTotal += wps;
            } else {
                acc.branchWpsTotal += wps;
            }

            // Accounting breakdown (B) - Specific paid leave
            if (Number(row.salaryLeaveAmount || 0) > 0) {
                acc.leaveSalaryRows.push({ name: row.name, amount: Number(row.salaryLeaveAmount) });
                acc.totalLeaveSalary += Number(row.salaryLeaveAmount);
            }

            // Accounting breakdown (C) - Open/Accumulated leave
            if (Number(row.open_leave_salary || 0) > 0) {
                acc.openLeaveSalaryRows.push({ name: row.name, amount: Number(row.open_leave_salary) });
                acc.totalOpenLeaveSalary += Number(row.open_leave_salary);
            }

            // Accounting breakdown (D) - Variable components
            acc.totalOtPayable += (Number(row.normalOtSalary || 0) + Number(row.specialOtSalary || 0));
            acc.totalIncentivePayable += Number(row.incentive || 0);
            
            // Accounting breakdown (E)
            acc.totalOtherAllowances += Number(row.other_allowance || 0);
            
            // Reconciliation (Cash Total)
            acc.totalCashSalary += bal;

            return acc;
        }, {
            totalSalaryAndAllowances: 0,
            totalSalariesPayable: 0,
            totalWpsPayable: 0,
            branchWpsTotal: 0,
            bodyshopWpsTotal: 0,
            leaveSalaryRows: [],
            totalLeaveSalary: 0,
            openLeaveSalaryRows: [],
            totalOpenLeaveSalary: 0,
            totalOtPayable: 0,
            totalIncentivePayable: 0,
            totalOtherAllowances: 0,
            totalCashSalary: 0
        });

        return stats;
    }, [salaryData]);

    // 4. Derived values combining auto-calculated data with user entry
    const branchTotalIncCharges = calculations.branchWpsTotal + Number(manualFields.wpsServiceChargesBranch || 0);
    const bodyshopTotalIncCharges = calculations.bodyshopWpsTotal + Number(manualFields.wpsServiceChargesBodyshop || 0);
    const totalProfessionalCharges = 
        Number(manualFields.professionalChargesLastMonth || 0) +
        Number(manualFields.professionalChargesNmAstra || 0) +
        Number(manualFields.professionalChargesAlmDxb || 0) +
        Number(manualFields.nmReceivablesAkhil || 0);
    const balanceAmount = totalProfessionalCharges - calculations.totalCashSalary;

    const handleFieldChange = (field, value) => {
        setManualFields(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSave = async () => {
        // Saves finance team manual entries for the summary reconciliation section
        setIsSaving(true);
        try {
            await onSaveManualFields(manualFields);
        } finally {
            setIsSaving(false);
        }
    };

    const formatAED = (val) => `AED ${Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-8 max-w-5xl mx-auto py-4">
            
            {/* SECTION 1 — Summary Header (Auto-calculated, Styled like Excel header) */}
            <Card className="border-2 border-slate-200 overflow-hidden">
                <CardHeader className="bg-slate-50 border-b flex flex-row items-center gap-3">
                    <Calculator className="w-5 h-5 text-slate-500" />
                    <CardTitle className="text-lg">Salary Summary — {report.report_name || 'Current Report'}</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100">
                        <span className="text-slate-600 font-medium">Total Salary & Allowance Expenses</span>
                        <span className="font-bold text-slate-900">{formatAED(calculations.totalSalaryAndAllowances)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-dashed border-slate-100">
                        <span className="text-slate-600 font-medium">Total Salaries & Allowances Payable</span>
                        <span className="font-bold text-slate-900">{formatAED(calculations.totalSalariesPayable)}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 bg-indigo-50 px-4 rounded-lg mt-2">
                        <span className="font-bold text-indigo-700 uppercase tracking-wider text-xs">Total WPS Amount Payable (A)</span>
                        <span className="text-xl font-black text-indigo-900">{formatAED(calculations.totalWpsPayable)}</span>
                    </div>
                </CardContent>
            </Card>

            {/* SECTION 2 — Accounting Entries (Auto-calculated breakdown) */}
            <Card className="shadow-sm border-slate-200">
                <CardHeader className="bg-slate-50/50 border-b py-3 flex flex-row items-center gap-3">
                    <ReceiptText className="w-5 h-5 text-slate-500" />
                    <h3 className="font-bold text-slate-800 uppercase tracking-tight text-xs tracking-widest">Accounting Entries Breakdown</h3>
                </CardHeader>
                <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-10">
                    
                    {/* B & C sections */}
                    <div className="space-y-8">
                        <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <span className="w-5 h-5 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-[10px] font-black">B</span>
                                Leave Salary Allowances
                            </h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-3 scrollbar-thin">
                                {calculations.leaveSalaryRows.map((row, i) => (
                                    <div key={i} className="flex justify-between text-xs text-slate-600">
                                        <span>Leave Salary ({row.name})</span>
                                        <span className="tabular-nums font-medium">{formatAED(row.amount)}</span>
                                    </div>
                                ))}
                                {calculations.leaveSalaryRows.length === 0 && <p className="text-xs text-slate-400 italic py-1">None this month</p>}
                            </div>
                            <div className="mt-3 pt-3 border-t flex justify-between font-black text-slate-900 text-sm">
                                <span>Subtotal (B)</span>
                                <span>{formatAED(calculations.totalLeaveSalary)}</span>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-[10px] font-black">C</span>
                                Open Leave Salary
                            </h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-3 scrollbar-thin">
                                {calculations.openLeaveSalaryRows.map((row, i) => (
                                    <div key={i} className="flex justify-between text-xs text-slate-600">
                                        <span>{row.name}</span>
                                        <span className="tabular-nums font-medium">{formatAED(row.amount)}</span>
                                    </div>
                                ))}
                                {calculations.openLeaveSalaryRows.length === 0 && <p className="text-xs text-slate-400 italic py-1">None this month</p>}
                            </div>
                            <div className="mt-3 pt-3 border-t flex justify-between font-black text-slate-900 text-sm">
                                <span>Subtotal (C)</span>
                                <span>{formatAED(calculations.totalOpenLeaveSalary)}</span>
                            </div>
                        </div>
                    </div>

                    {/* D & E sections */}
                    <div className="space-y-8">
                        <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[10px] font-black">D</span>
                                OT, Incentive & Other Payable
                            </h4>
                            <div className="space-y-4">
                                <div className="flex justify-between text-xs text-slate-600">
                                    <span>Total OT Payable</span>
                                    <span className="tabular-nums font-medium">{formatAED(calculations.totalOtPayable)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-600">
                                    <span>Total Incentive Payable</span>
                                    <span className="tabular-nums font-medium">{formatAED(calculations.totalIncentivePayable)}</span>
                                </div>
                                <div className="pt-3 border-t-2 border-slate-100 flex justify-between font-black text-slate-900 text-sm">
                                    <span>Subtotal (D)</span>
                                    <span>{formatAED(calculations.totalOtPayable + calculations.totalIncentivePayable)}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <span className="w-5 h-5 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-[10px] font-black">E</span>
                                Other Allowances
                            </h4>
                            <div className="bg-slate-50 p-4 rounded-lg flex justify-between font-black text-slate-900 text-sm">
                                <span>Total Other Allowances</span>
                                <span>{formatAED(calculations.totalOtherAllowances)}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* SECTION 3 — WPS Transfer Details (Dual-entity tracking) */}
                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="bg-slate-50 border-b py-3 flex flex-row items-center gap-3">
                        <Landmark className="w-5 h-5 text-slate-500" />
                        <h3 className="font-bold text-slate-800 uppercase tracking-[0.1em] text-[11px]">WPS Transfer Details</h3>
                    </CardHeader>
                    <CardContent className="p-6 space-y-10">
                        {/* Branch Portion */}
                        <div className="space-y-5">
                            <h5 className="font-black text-slate-800 text-[10px] uppercase tracking-widest border-b-2 border-slate-900 pb-1 inline-block">Branch (Operations)</h5>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Total Amount to be Transferred from Branch</span>
                                    <span className="font-bold text-slate-900">{formatAED(calculations.branchWpsTotal)}</span>
                                </div>
                                <div className="flex justify-between items-center gap-4 bg-slate-50 p-2 px-3 rounded-md">
                                    <span className="text-[11px] text-slate-700 font-medium">WPS Service Charges (Branch)</span>
                                    <Input 
                                        type="number"
                                        className="h-8 w-32 text-right text-xs bg-white font-bold"
                                        value={manualFields.wpsServiceChargesBranch}
                                        onChange={(e) => handleFieldChange('wpsServiceChargesBranch', Number(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                                    <span className="text-[11px] font-black text-slate-900 uppercase">Total Payable from Branch</span>
                                    <span className="font-black text-indigo-700 text-base">{formatAED(branchTotalIncCharges)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Body Shop Portion */}
                        <div className="space-y-5">
                            <h5 className="font-black text-slate-800 text-[10px] uppercase tracking-widest border-b-2 border-slate-900 pb-1 inline-block">Body Shop (Main)</h5>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Total Payable from Main (Body Shop)</span>
                                    <span className="font-bold text-slate-900">{formatAED(calculations.bodyshopWpsTotal)}</span>
                                </div>
                                <div className="flex justify-between items-center gap-4 bg-slate-50 p-2 px-3 rounded-md">
                                    <span className="text-[11px] text-slate-700 font-medium">WPS Service Charges (Body Shop)</span>
                                    <Input 
                                        type="number"
                                        className="h-8 w-32 text-right text-xs bg-white font-bold"
                                        value={manualFields.wpsServiceChargesBodyshop}
                                        onChange={(e) => handleFieldChange('wpsServiceChargesBodyshop', Number(e.target.value) || 0)}
                                    />
                                </div>
                                <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                                    <span className="text-[11px] font-black text-slate-900 uppercase">Total Payable from Main</span>
                                    <span className="font-black text-indigo-700 text-base">{formatAED(bodyshopTotalIncCharges)}</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* SECTION 4 — Professional Charges Reconciliation (Manual entry) */}
                <Card className="shadow-sm border-slate-200">
                    <CardHeader className="bg-slate-50 border-b py-3 flex flex-row items-center gap-3">
                        <Wallet className="w-5 h-5 text-slate-500" />
                        <h3 className="font-bold text-slate-800 uppercase tracking-[0.1em] text-[11px]">Professional Charges Reconciliation</h3>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Professional Charges Balance from Last Month</label>
                                <Input 
                                    type="number"
                                    className="h-10 text-right font-black border-slate-300"
                                    value={manualFields.professionalChargesLastMonth}
                                    onChange={(e) => handleFieldChange('professionalChargesLastMonth', Number(e.target.value) || 0)}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2 space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Source Label</label>
                                    <Input 
                                        className="h-10 text-xs font-medium border-slate-300"
                                        value={manualFields.professionalChargesNmAstraLabel}
                                        onChange={(e) => handleFieldChange('professionalChargesNmAstraLabel', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1 text-right block">Amount</label>
                                    <Input 
                                        type="number"
                                        className="h-10 text-right font-black border-slate-300"
                                        value={manualFields.professionalChargesNmAstra}
                                        onChange={(e) => handleFieldChange('professionalChargesNmAstra', Number(e.target.value) || 0)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                    <Input 
                                        className="h-10 text-xs font-medium border-slate-300"
                                        value={manualFields.professionalChargesAlmDxbLabel}
                                        onChange={(e) => handleFieldChange('professionalChargesAlmDxbLabel', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Input 
                                        type="number"
                                        className="h-10 text-right font-black border-slate-300"
                                        value={manualFields.professionalChargesAlmDxb}
                                        onChange={(e) => handleFieldChange('professionalChargesAlmDxb', Number(e.target.value) || 0)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">NM Receivables (Akhil WPS Salary)</label>
                                <Input 
                                    type="number"
                                    className="h-10 text-right font-black border-slate-300"
                                    value={manualFields.nmReceivablesAkhil}
                                    onChange={(e) => handleFieldChange('nmReceivablesAkhil', Number(e.target.value) || 0)}
                                />
                            </div>
                        </div>

                        {/* Reconciliation Calculation Area */}
                        <div className="pt-6 border-t-4 border-double border-slate-200 space-y-3">
                            <div className="flex justify-between items-center text-[11px] font-black text-slate-500 uppercase">
                                <span>Total Professional Charges & Other Receivables</span>
                                <span>{formatAED(totalProfessionalCharges)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] text-rose-600 font-black uppercase">
                                <span>Less: Total Cash Salary</span>
                                <span>({formatAED(calculations.totalCashSalary)})</span>
                            </div>
                            
                            <div className={`mt-5 p-4 rounded-xl flex justify-between items-center shadow-inner ${balanceAmount === 0 ? 'bg-emerald-50 border-2 border-emerald-200' : 'bg-rose-50 border-2 border-rose-200'}`}>
                                <span className={`text-[11px] font-black uppercase tracking-widest ${balanceAmount === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>Final Reconciliation Balance</span>
                                <span className={`text-2xl font-black ${balanceAmount === 0 ? 'text-emerald-800' : 'text-rose-800'}`}>{formatAED(balanceAmount)}</span>
                            </div>
                        </div>

                        <Button 
                            className="w-full h-14 bg-slate-950 hover:bg-black text-white font-black uppercase tracking-[0.2em] text-xs shadow-lg transition-all active:scale-[0.98]"
                            disabled={isSaving}
                            onClick={handleSave}
                        >
                            {isSaving ? (
                                <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                            ) : (
                                <Save className="w-5 h-5 mr-3" />
                            )}
                            {isSaving ? "Saving Configuration..." : "Save Summary Fields"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}