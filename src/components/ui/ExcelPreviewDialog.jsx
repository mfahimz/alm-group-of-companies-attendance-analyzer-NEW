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
import { Download, X } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

/**
 * ExcelPreviewDialog - A reusable dialog to preview data before exporting to Excel.
 * 
 * @param {boolean} isOpen - Whether the dialog is open.
 * @param {function} onOpenChange - Callback to change the open state.
 * @param {Array} data - The data to preview (array of objects or array of arrays).
 * @param {Array} columns - Optional list of column keys/headers in order.
 * @param {function} onExport - Callback triggered when the user clicks 'Export'.
 * @param {string} title - Dialog title.
 * @param {string} description - Optional description text.
 */
export default function ExcelPreviewDialog({
    isOpen,
    onOpenChange,
    data = [],
    columns,
    onExport,
    title = "Export Preview",
    description
}) {
    // Determine columns if not provided
    const displayColumns = React.useMemo(() => {
        if (columns && columns.length > 0) return columns;
        if (data.length > 0) {
            if (Array.isArray(data[0])) {
                // If it's an array of arrays, use indices or assume first row is header?
                // Usually XLSX.utils.aoa_to_sheet is used for AOA.
                // For preview, we'll just show the first few rows.
                return Object.keys(data[0]);
            }
            return Object.keys(data[0]);
        }
        return [];
    }, [data, columns]);

    // Limit preview to first 50 rows for performance
    const previewRows = data.slice(0, 50);
    const hasMoreRows = data.length > 50;

    const handleExport = () => {
        onExport();
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[90vw] w-[1200px] max-h-[90vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Download className="w-5 h-5 text-indigo-600" />
                        {title}
                    </DialogTitle>
                    {description && (
                        <p className="text-sm text-slate-500 mt-1">{description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                            {data.length} total rows
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                            {displayColumns.length} columns
                        </span>
                        {hasMoreRows && (
                            <span className="text-xs text-amber-600 font-medium">
                                Showing first 50 rows in preview
                            </span>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden px-6 py-2">
                    <div className="border rounded-md h-full bg-white relative">
                        <ScrollArea className="h-full w-full">
                            <div className="min-w-max">
                                <Table>
                                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                        <TableRow>
                                            <TableHead className="w-[50px] text-center border-r bg-slate-50 sticky left-0 z-20">#</TableHead>
                                            {displayColumns.map((col, idx) => (
                                                <TableHead key={idx} className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 border-r">
                                                    {col}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {previewRows.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={displayColumns.length + 1} className="h-32 text-center text-slate-500">
                                                    No data available for preview
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            previewRows.map((row, rowIdx) => (
                                                <TableRow key={rowIdx} className="hover:bg-slate-50/50">
                                                    <TableCell className="text-center text-slate-400 text-xs border-r bg-slate-50/30 sticky left-0 z-5">
                                                        {rowIdx + 1}
                                                    </TableCell>
                                                    {displayColumns.map((col, colIdx) => {
                                                        const value = Array.isArray(row) ? row[col] : row[col];
                                                        return (
                                                            <TableCell key={colIdx} className="whitespace-nowrap px-4 py-2 border-r text-sm">
                                                                {value === null || value === undefined ? (
                                                                    <span className="text-slate-300">-</span>
                                                                ) : typeof value === 'number' ? (
                                                                    value.toLocaleString(undefined, { maximumFractionDigits: 2 })
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
                                                    colSpan={displayColumns.length + 1} 
                                                    className="bg-slate-50/50 text-center py-4 text-slate-500 italic text-sm"
                                                >
                                                    ... and {data.length - 50} more rows ...
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="p-6 pt-2 bg-slate-50 border-t mt-auto">
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-2">
                        <X className="w-4 h-4" />
                        Cancel
                    </Button>
                    <Button onClick={handleExport} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                        <Download className="w-4 h-4" />
                        Confirm and Export Excel
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
