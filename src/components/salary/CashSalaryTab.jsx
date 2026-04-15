import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';

// CashSalaryTab.jsx
// Displays employees who have a cash balance remaining after WPS cap (balance > 0)
// Mirrors the Cash Salary sheet from the monthly Excel payroll file
// Pure display component — all values read from salaryData prop
// No entity fetches inside this component
export default function CashSalaryTab({ salaryData = [] }) {
    // 2. Filter logic: employees with cash balance > 0
    const cashData = useMemo(() => {
        return salaryData.filter(row => (row.balance || 0) > 0);
    }, [salaryData]);

    // Helper to format currency
    const formatCurrency = (val) => {
        return Number(val || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    // Calculate total balance for the bottom row
    const totalBalance = useMemo(() => {
        return cashData.reduce((sum, row) => sum + (row.balance || 0), 0);
    }, [cashData]);

    // 4. Empty state
    if (!cashData.length) {
        return (
            <div className="py-20 text-center text-slate-500">
                <p>No employees with cash balance found in this report.</p>
            </div>
        );
    }

    return (
        <Card className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-8">
                <div className="mb-6 text-center">
                    <h2 className="text-xl font-bold uppercase tracking-tight text-slate-900 underline decoration-slate-300 decoration-2 underline-offset-8">Cash Salary Payment Sheet</h2>
                    <p className="text-slate-500 text-sm mt-4 italic">AED Currency • For Manual Distribution</p>
                </div>

                <div className="overflow-x-auto">
                    <Table className="border rounded-md">
                        <TableHeader className="bg-slate-50">
                            <TableRow className="border-b">
                                <TableHead className="w-12 py-4 font-bold text-slate-900 border-r">S.No</TableHead>
                                <TableHead className="font-bold text-slate-900 border-r min-w-[200px]">Employee Name</TableHead>
                                <TableHead className="font-bold text-slate-900 border-r text-right w-40">Balance to Pay (AED)</TableHead>
                                <TableHead className="font-bold text-slate-900 border-r w-64">Remarks</TableHead>
                                <TableHead className="font-bold text-slate-900 w-48">Signature</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cashData.map((row, idx) => (
                                <TableRow key={row.hrms_id} className="border-b transition-colors hover:bg-slate-50/30">
                                    <TableCell className="py-4 text-center font-medium text-slate-500 border-r">{idx + 1}</TableCell>
                                    <TableCell className="font-bold border-r text-slate-800 uppercase tracking-tight">{row.name}</TableCell>
                                    <TableCell className="text-right font-black tabular-nums border-r pr-4 text-slate-950">
                                        {formatCurrency(row.balance)}
                                    </TableCell>
                                    <TableCell className="border-r h-14"></TableCell>
                                    <TableCell className="h-14"></TableCell>
                                </TableRow>
                            ))}
                            
                            {/* Grand Total Row */}
                            <TableRow className="bg-slate-100 font-black text-slate-900 border-t-2">
                                <TableCell colSpan={2} className="py-6 text-right uppercase tracking-widest text-sm border-r pr-6">Grand Total</TableCell>
                                <TableCell className="text-right text-lg border-r pr-4 tabular-nums underline decoration-double decoration-slate-400 underline-offset-4">
                                    {formatCurrency(totalBalance)}
                                </TableCell>
                                <TableCell className="border-r"></TableCell>
                                <TableCell></TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                <div className="mt-12 grid grid-cols-2 gap-20 px-4">
                    <div className="border-t-2 border-slate-900 pt-2 text-center text-xs font-bold uppercase tracking-widest">Prepared by Finance</div>
                    <div className="border-t-2 border-slate-900 pt-2 text-center text-xs font-bold uppercase tracking-widest">Authorized by Management</div>
                </div>
            </CardContent>
        </Card>
    );
}
