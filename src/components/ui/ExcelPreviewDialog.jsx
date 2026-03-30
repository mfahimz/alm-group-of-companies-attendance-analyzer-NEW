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

                <div className="flex-1 overflow-hidden px-6 py-6 bg-slate-50/40">
                    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-auto max-h-[50vh]">
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