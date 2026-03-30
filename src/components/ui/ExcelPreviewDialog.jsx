import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, X, FileSpreadsheet } from "lucide-react";


/**
 * ExcelPreviewDialog - A reusable dialog to preview data before exporting to Excel.
 * 
 * @param {boolean} isOpen - Whether the dialog is open.
 * @param {function} onClose - Callback to close the dialog.
 * @param {Array} data - The data to preview (array of objects or array of arrays).
 * @param {Array} headers - List of column headers in order.
 * @param {string} fileName - Suggestive name of the file (displayed in header).
 * @param {function} onConfirm - Callback triggered to execute the actual XLSX export logic.
 */
export default function ExcelPreviewDialog({
    isOpen,
    onClose,
    data = [],
    headers = [],
    fileName = "Export",
    onConfirm,
    simulateMergeColumns = []
}) {
    // Limit preview to first 20 rows as per requirements
    const displayLimit = 20;
    const previewRows = data.slice(0, displayLimit);
    const hasMoreRows = data.length > displayLimit;

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw] sm:max-w-[90vw] md:max-w-[1000px] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden bg-white rounded-xl border-none shadow-2xl">
                <DialogHeader className="p-6 pb-4 border-b bg-white">
                    <DialogTitle className="flex items-center gap-3 text-2xl font-bold text-slate-900">
                        <div className="p-2 bg-green-50 rounded-lg">
                            <FileSpreadsheet className="w-6 h-6 text-green-600" />
                        </div>
                        Excel Export Preview
                    </DialogTitle>
                    <div className="flex flex-col gap-2 mt-3">
                        <p className="text-sm text-slate-500 flex items-center gap-1.5">
                            Target File: <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">{fileName}</span>
                        </p>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-medium border border-indigo-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                {data.length.toLocaleString()} total entries
                            </div>
                            {hasMoreRows && (
                                <div className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-medium border border-amber-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                    Showing first {displayLimit} rows of {data.length.toLocaleString()}
                                </div>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden px-6 py-4 bg-slate-50/40">
                    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-auto max-h-[50vh]">
                        <Table className="border-collapse table-auto w-full">
                            <TableHeader className="bg-slate-50 sticky top-0 z-20">
                                <TableRow className="hover:bg-transparent border-b border-slate-200">
                                    <TableHead className="w-[60px] text-center border-r border-slate-200 font-bold text-slate-500 bg-slate-50 sticky left-0 z-30 px-3">
                                        #
                                    </TableHead>
                                    {headers.map((header, idx) => (
                                        <TableHead 
                                            key={idx} 
                                            className="whitespace-nowrap px-4 py-4 font-bold text-slate-700 border-r border-slate-200 last:border-r-0 min-w-[120px]"
                                        >
                                            {header}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={headers.length + 1} className="h-48 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                                                <FileSpreadsheet className="w-8 h-8 opacity-20" />
                                                <p className="italic font-medium">No data available to preview</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    previewRows.map((row, rowIdx) => (
                                        <TableRow key={rowIdx} className="hover:bg-blue-50/40 transition-colors border-b border-slate-100 last:border-0">
                                            <TableCell className="text-center text-slate-400 text-[10px] border-r border-slate-100 bg-slate-50/30 sticky left-0 z-10 font-mono">
                                                {(rowIdx + 1).toString().padStart(2, '0')}
                                            </TableCell>
                                            {headers.map((header, colIdx) => {
                                                let value;
                                                if (Array.isArray(row)) {
                                                    value = row[colIdx];
                                                } else {
                                                    value = row[header];
                                                }
                                                const isMergedColumn = simulateMergeColumns.includes(header);
                                                let shouldHideValue = false;
                                                if (isMergedColumn && rowIdx > 0) {
                                                    const prevRow = previewRows[rowIdx - 1];
                                                    const prevValue = Array.isArray(prevRow) ? prevRow[colIdx] : prevRow[header];
                                                    if (value === prevValue && value !== null && value !== undefined) {
                                                        shouldHideValue = true;
                                                    }
                                                }
                                                return (
                                                    <TableCell key={colIdx} className="whitespace-nowrap px-4 py-3 border-r border-slate-100 last:border-r-0 text-sm text-slate-600 font-medium">
                                                        {shouldHideValue ? (
                                                            <span className="opacity-0">&mdash;</span>
                                                        ) : value === null || value === undefined ? (
                                                            <span className="text-slate-300">-</span>
                                                        ) : typeof value === 'number' ? (
                                                            <span className="font-mono text-slate-800">
                                                                {value % 1 === 0 ? value : value.toFixed(2)}
                                                            </span>
                                                        ) : String(value)}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))
                                )}
                                {hasMoreRows && (
                                    <TableRow>
                                        <TableCell 
                                            colSpan={headers.length + 1} 
                                            className="bg-slate-50/50 text-center py-6 text-slate-500 italic text-sm font-medium border-t border-slate-200"
                                        >
                                            ... showing only first {displayLimit} of {data.length.toLocaleString()} total rows ...
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter className="p-6 bg-white border-t flex flex-row items-center justify-end gap-3 sm:gap-4">
                    <Button 
                        variant="ghost" 
                        onClick={onClose} 
                        className="px-6 text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all font-semibold"
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleConfirm} 
                        className="px-8 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200/50 hover:shadow-blue-300/50 transform hover:-translate-y-0.5 active:translate-y-0 transition-all font-bold rounded-lg"
                    >
                        <Download className="w-5 h-5 mr-2" />
                        Confirm & Download Excel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}